import { createDb } from './db/database';
import { PRODUCTION_CONSUMERS } from './events/consumers';
import { OutboxWorker } from './events/outbox-worker';

// Proceso worker del outbox: `node dist/worker-main.js`. Varias instancias pueden correr a la vez.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no definida');
  const db = createDb(url);
  const worker = new OutboxWorker(db, PRODUCTION_CONSUMERS, {
    maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 8),
    leaseSeconds: Number(process.env.OUTBOX_LEASE_SECONDS ?? 60),
  });
  const shutdown = () => worker.stop();
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  console.log(`Worker de outbox ${worker.workerId} iniciado`);
  await worker.start(Number(process.env.OUTBOX_POLL_MS ?? 1000), (err) =>
    console.error('Error del worker:', err instanceof Error ? err.message : err),
  );
  await db.destroy();
}

main().catch((err) => {
  console.error('No se pudo iniciar el worker:', err instanceof Error ? err.message : err);
  process.exit(1);
});
