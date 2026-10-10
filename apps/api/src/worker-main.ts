import { createDb } from './db/database';
import { describeForLog } from './common/errors';
import { PRODUCTION_CONSUMERS } from './events/consumers';
import { OutboxWorker } from './events/outbox-worker';
import { S3ObjectStore } from './storage/object-store';
import { DEFAULT_SWEEPER, StorageSweeper } from './storage/sweeper';

// Proceso worker del outbox: `node dist/worker-main.js`. Varias instancias pueden correr a la vez.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no definida');
  const db = createDb(url);
  const worker = new OutboxWorker(db, PRODUCTION_CONSUMERS, {
    maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 8),
    leaseSeconds: Number(process.env.OUTBOX_LEASE_SECONDS ?? 60),
  });
  // Barrido del almacenamiento privado (P0-009/P0-010): solo huérfanos antiguos y descartados.
  let sweepTimer: NodeJS.Timeout | null = null;
  let store: S3ObjectStore | null = null;
  if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    store = new S3ObjectStore({
      endpoint: process.env.S3_ENDPOINT ?? `http://localhost:${process.env.S3_PORT ?? '9000'}`, region: process.env.S3_REGION ?? 'us-east-1',
      accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY, bucket: process.env.S3_BUCKET ?? 'terra-link-private',
    });
    const sweeper = new StorageSweeper(db, store, {
      ...DEFAULT_SWEEPER,
      orphanGraceSeconds: Number(process.env.STORAGE_ORPHAN_GRACE_SECONDS ?? DEFAULT_SWEEPER.orphanGraceSeconds),
    });
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const r = await sweeper.runOnce();
        if (r.discovered || r.deleted || r.failed || r.skipped) console.log(`Barrido de almacenamiento: descubiertas=${r.discovered} borradas=${r.deleted} protegidas=${r.skipped} fallidas=${r.failed}`);
      } catch {
        console.error('Barrido de almacenamiento: error STORAGE_SWEEP_FAILED (se reintenta en la próxima pasada)');
      } finally {
        running = false;
      }
    };
    sweepTimer = setInterval(() => void tick(), Number(process.env.STORAGE_SWEEP_MS ?? 600_000));
    void tick();
  } else {
    console.log('Barrido de almacenamiento desactivado: faltan S3_ACCESS_KEY/S3_SECRET_KEY');
  }
  const shutdown = () => {
    if (sweepTimer) clearInterval(sweepTimer);
    worker.stop();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  console.log(`Worker de outbox ${worker.workerId} iniciado`);
  await worker.start(Number(process.env.OUTBOX_POLL_MS ?? 1000), (err) =>
    console.error('Error del worker:', describeForLog(err)),
  );
  store?.close();
  await db.destroy();
}

main().catch((err) => {
  console.error('No se pudo iniciar el worker:', err instanceof Error ? err.message : err);
  process.exit(1);
});
