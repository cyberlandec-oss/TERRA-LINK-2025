import { Kysely, Migrator, PostgresDialect, type Migration, type MigrationProvider } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './schema';
import * as m0001 from './migrations/0001_identity_organizations';

// Las migraciones se registran explícitamente (orden por nombre). Nunca editar una ya publicada.
const MIGRATIONS: Record<string, Migration> = {
  '0001_identity_organizations': m0001,
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return MIGRATIONS;
  }
}

export function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 10 }) }),
  });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<string[]> {
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}

export const LATEST_MIGRATION = Object.keys(MIGRATIONS).sort().at(-1)!;
export const DB = Symbol('DB');
