import { randomUUID } from 'crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/schema';
import type { DomainEvent, EventConsumer } from './events';

// Worker del outbox. Semántica real:
// - Entrega AL MENOS UNA VEZ: si un worker cae tras aplicar efectos pero antes de confirmar, la entrega
//   vuelve a estar disponible al vencer el arrendamiento (`locked_until`).
// - Consumo idempotente: efectos del consumidor + recibo (consumer, event_id) + DONE en UNA transacción;
//   una segunda entrega encuentra el recibo y no repite efectos.
// - Varios workers: el reclamo usa FOR UPDATE SKIP LOCKED; cada entrega la toma un solo worker a la vez.
// - Fallos: reintento con espera exponencial hasta `maxAttempts`; después DEAD (revisión manual).
// - Sin orden global entre agregados; el orden por agregado lo da aggregate_version.

export interface WorkerOptions {
  workerId?: string;
  batchSize?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  /** Espera base del reintento en milisegundos (se duplica por intento, máx. 15 min). */
  backoffBaseMs?: number;
}

export interface RunResult {
  claimed: number;
  done: number;
  skippedDuplicate: number;
  failed: number;
  dead: number;
}

function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw.replace(/\s+/g, ' ').slice(0, 300);
}

export class OutboxWorker {
  readonly workerId: string;
  private readonly opts: Required<Omit<WorkerOptions, 'workerId'>>;
  private readonly byName: Map<string, EventConsumer>;
  private stopped = false;

  constructor(private readonly db: Kysely<Database>, consumers: EventConsumer[], options: WorkerOptions = {}) {
    this.workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
    this.opts = {
      batchSize: options.batchSize ?? 20,
      leaseSeconds: options.leaseSeconds ?? 60,
      maxAttempts: options.maxAttempts ?? 8,
      backoffBaseMs: options.backoffBaseMs ?? 2000,
    };
    this.byName = new Map(consumers.map((c) => [c.name, c]));
  }

  /** Reclama un lote de entregas vencidas (pendientes, fallidas o con arrendamiento expirado). */
  private async claim() {
    const res = await sql<{ event_id: string; consumer: string; attempts: number }>`
      UPDATE event_deliveries d
         SET status = 'PROCESSING',
             locked_by = ${this.workerId},
             locked_until = now() + make_interval(secs => ${this.opts.leaseSeconds}),
             attempts = d.attempts + 1
       WHERE (d.event_id, d.consumer) IN (
         SELECT event_id, consumer FROM event_deliveries
          WHERE (status IN ('PENDING','FAILED') AND next_attempt_at <= now())
             OR (status = 'PROCESSING' AND locked_until < now())
          ORDER BY next_attempt_at
          LIMIT ${this.opts.batchSize}
          FOR UPDATE SKIP LOCKED)
      RETURNING d.event_id, d.consumer, d.attempts`.execute(this.db);
    return res.rows;
  }

  async runOnce(): Promise<RunResult> {
    const result: RunResult = { claimed: 0, done: 0, skippedDuplicate: 0, failed: 0, dead: 0 };
    const claimed = await this.claim();
    result.claimed = claimed.length;
    for (const d of claimed) {
      const consumer = this.byName.get(d.consumer);
      try {
        if (!consumer) throw new Error(`Consumidor no registrado: ${d.consumer}`);
        const duplicate = await this.db.transaction().execute(async (trx) => {
          const event = (await trx.selectFrom('domain_events').selectAll().where('event_id', '=', d.event_id).executeTakeFirstOrThrow()) as DomainEvent;
          const receipt = await trx
            .insertInto('consumer_receipts')
            .values({ consumer: d.consumer, event_id: d.event_id })
            .onConflict((oc) => oc.columns(['consumer', 'event_id']).doNothing())
            .returning('event_id')
            .executeTakeFirst();
          if (receipt) await consumer.handle(trx, event);
          // Solo confirma quien conserva el arrendamiento.
          await trx
            .updateTable('event_deliveries')
            .set({ status: 'DONE', delivered_at: new Date(), locked_by: null, locked_until: null, last_error: null })
            .where('event_id', '=', d.event_id)
            .where('consumer', '=', d.consumer)
            .where('locked_by', '=', this.workerId)
            .execute();
          return !receipt;
        });
        if (duplicate) result.skippedDuplicate++;
        else result.done++;
      } catch (err) {
        const dead = d.attempts >= this.opts.maxAttempts;
        const delayMs = Math.min(this.opts.backoffBaseMs * 2 ** (d.attempts - 1), 15 * 60_000);
        await this.db
          .updateTable('event_deliveries')
          .set({
            status: dead ? 'DEAD' : 'FAILED',
            last_error: sanitizeError(err),
            next_attempt_at: new Date(Date.now() + delayMs),
            locked_by: null,
            locked_until: null,
          })
          .where('event_id', '=', d.event_id)
          .where('consumer', '=', d.consumer)
          .where('locked_by', '=', this.workerId)
          .execute();
        if (dead) result.dead++;
        else result.failed++;
      }
    }
    return result;
  }

  /** Bucle de sondeo para el proceso worker. */
  async start(pollMs: number, onError: (err: unknown) => void = () => undefined): Promise<void> {
    while (!this.stopped) {
      try {
        const r = await this.runOnce();
        if (r.claimed > 0) continue;
      } catch (err) {
        onError(err);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
