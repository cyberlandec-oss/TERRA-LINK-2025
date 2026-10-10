import { Kysely, Migrator, PostgresDialect, type Migration, type MigrationProvider } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './schema';
import * as m0001 from './migrations/0001_identity_organizations';
import * as m0002 from './migrations/0002_invitations_sessions';
import * as m0003 from './migrations/0003_organization_types';
import * as m0004 from './migrations/0004_domain_events_outbox';
import * as m0005 from './migrations/0005_producers';
import * as m0006 from './migrations/0006_producer_identity_encryption';
import * as m0007 from './migrations/0007_producer_match_reviews';
import * as m0008 from './migrations/0008_plots';
import * as m0009 from './migrations/0009_location_samples';
import * as m0010 from './migrations/0010_polygon_drafts';
import * as m0011 from './migrations/0011_geometry_imports';
import * as m0012 from './migrations/0012_gis_evaluations_cleanup';

// Las migraciones se registran explícitamente (orden por nombre). Nunca editar una ya publicada.
const MIGRATIONS: Record<string, Migration> = {
  '0001_identity_organizations': m0001,
  '0002_invitations_sessions': m0002,
  '0003_organization_types': m0003,
  '0004_domain_events_outbox': m0004,
  '0005_producers': m0005,
  '0006_producer_identity_encryption': m0006,
  '0007_producer_match_reviews': m0007,
  '0008_plots': m0008,
  '0009_location_samples': m0009,
  '0010_polygon_drafts': m0010,
  '0011_geometry_imports': m0011,
  '0012_gis_evaluations_cleanup': m0012,
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return MIGRATIONS;
  }
}

/** Opciones de sesión de cada conexión (ver createDb). */
export const PG_SESSION_OPTIONS = { options: '-c client_min_messages=warning' };

export function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    // client_min_messages=warning: PostGIS emite NOTICE con coordenadas (p. ej. ST_IsValid ante una
    // autointersección). Sin esto llegarían al cliente; además se usa ST_IsValidDetail, que no emite NOTICE.
    dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 10, ...PG_SESSION_OPTIONS }) }),
  });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<string[]> {
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}

/** Migra hasta una versión concreta (pruebas de migración sobre datos existentes). */
export async function migrateTo(db: Kysely<Database>, name: string): Promise<void> {
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
  const { error } = await migrator.migrateTo(name);
  if (error) throw error;
}

export const LATEST_MIGRATION = Object.keys(MIGRATIONS).sort().at(-1)!;
export const DB = Symbol('DB');
