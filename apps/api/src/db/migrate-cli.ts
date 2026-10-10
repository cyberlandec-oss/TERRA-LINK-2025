import { createDb, migrateToLatest } from './database';

// Uso local: npm run db:migrate. Aplica sobre DATABASE_URL; no ejecutar contra producción sin autorización.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no definida');
  const db = createDb(url);
  try {
    const applied = await migrateToLatest(db);
    console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'Esquema al día');
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('Fallo de migración:', err instanceof Error ? err.message : err);
  process.exit(1);
});
