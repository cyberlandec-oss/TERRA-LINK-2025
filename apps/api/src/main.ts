import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApi, createApp } from './bootstrap';
import { loadConfig } from './config';
import { createDb } from './db/database';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.databaseUrl);
  const app = await createApp(config, db);
  SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`API Terra Link escuchando en puerto ${config.port}`);
}

main().catch((err) => {
  console.error('No se pudo iniciar la API:', err instanceof Error ? err.message : err);
  process.exit(1);
});
