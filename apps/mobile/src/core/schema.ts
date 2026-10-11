import type { SqlDb } from './ports';

// Esquema local por cuenta + organización (un archivo de base por par). Migraciones numeradas y transaccionales.
// Estados de operación (docs/11): PENDING → UPLOADING → SYNCED; FAILED; CONFLICT. P0-023 solo crea PENDING y recupera
// UPLOADING interrumpidas; la transferencia y la reconciliación son de P0-024.
const MIGRATIONS: string[] = [
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE dataset_plots (
     id TEXT PRIMARY KEY, plot_code TEXT NOT NULL, name TEXT, row_version INTEGER NOT NULL, status TEXT NOT NULL,
     producer_id TEXT NOT NULL, producer_code TEXT, producer_display_name TEXT, geometry_status TEXT, fetched_at TEXT NOT NULL);
   CREATE TABLE drafts (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('PLOT_FIELD_CAPTURE')), plot_id TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK (status IN ('DRAFT','QUEUED')),
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, queued_at TEXT);
   CREATE TABLE location_samples (
     id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES drafts(id), latitude REAL NOT NULL, longitude REAL NOT NULL,
     accuracy_m REAL, acquired_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('DEVICE_LOCATION_SERVICE')), provider_detail TEXT NOT NULL, mocked INTEGER);
   CREATE TABLE attachments (
     id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES drafts(id), kind TEXT NOT NULL CHECK (kind IN ('PHOTO')),
     path TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes > 0), mime_type TEXT NOT NULL,
     captured_at TEXT, stored_at TEXT NOT NULL, upload_state TEXT NOT NULL DEFAULT 'LOCAL' CHECK (upload_state IN ('LOCAL')));
   CREATE TABLE outbox (
     operation_id TEXT PRIMARY KEY, seq INTEGER NOT NULL UNIQUE, draft_id TEXT NOT NULL REFERENCES drafts(id),
     operation_type TEXT NOT NULL, entity_id TEXT NOT NULL, base_version INTEGER, depends_on TEXT NOT NULL,
     captured_at TEXT NOT NULL, payload TEXT NOT NULL, attachment_refs TEXT NOT NULL,
     state TEXT NOT NULL CHECK (state IN ('PENDING','UPLOADING','SYNCED','FAILED','CONFLICT')),
     attempts INTEGER NOT NULL DEFAULT 0, recovered_count INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL);
   CREATE TABLE incidents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDb): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = await db.get<{ version: number }>('SELECT version FROM schema_version');
  const current = row?.version ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[i]);
      await tx.run('DELETE FROM schema_version');
      await tx.run('INSERT INTO schema_version (version) VALUES (?)', [i + 1]);
    });
  }
}
