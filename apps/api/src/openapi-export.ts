import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { buildOpenApi, createApp } from './bootstrap';
import { loadConfig } from './config';
import { createDb } from './db/database';

// Genera apps/api/openapi.json desde los controladores reales (no requiere conexión activa a la base).
async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.databaseUrl);
  const app = await createApp(config, db);
  await app.init();
  const out = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2) + '\n');
  await app.close();
  await db.destroy();
  console.log(`OpenAPI escrito en ${out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
