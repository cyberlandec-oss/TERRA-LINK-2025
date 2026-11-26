import { sql, type Kysely } from 'kysely';
export async function up(db: Kysely<unknown>) {
  await sql`CREATE TABLE field_offline_keys (
    organization_id uuid PRIMARY KEY REFERENCES organizations(id), private_key_enc text NOT NULL, public_key jsonb NOT NULL
  )`.execute(db);
  await sql`CREATE TABLE field_offline_grants (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
    producer_id uuid NOT NULL, device_id uuid NOT NULL, payload jsonb NOT NULL, issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
    FOREIGN KEY (organization_id,producer_id) REFERENCES producers(organization_id,id),
    FOREIGN KEY (organization_id,device_id) REFERENCES devices(organization_id,id), UNIQUE(organization_id,id)
  )`.execute(db);
  await sql`CREATE TABLE field_offline_operations (
    operation_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
    device_id uuid NOT NULL, grant_id uuid NOT NULL, content_hash text NOT NULL, plot_id uuid NOT NULL, row_version integer NOT NULL,
    captured_enc text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(organization_id,operation_id), FOREIGN KEY(organization_id,plot_id) REFERENCES plots(organization_id,id),
    FOREIGN KEY(organization_id,grant_id) REFERENCES field_offline_grants(organization_id,id),
    FOREIGN KEY(organization_id,device_id) REFERENCES devices(organization_id,id)
  )`.execute(db);
  await sql`CREATE FUNCTION field_offline_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'field offline audit is append-only'; END $$`.execute(db);
  for (const table of ['field_offline_grants', 'field_offline_operations']) {
    await sql.raw(`CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION field_offline_append_only()`).execute(db);
  }
}
export async function down(db: Kysely<unknown>) {
  await sql`DROP TABLE field_offline_operations; DROP TABLE field_offline_grants; DROP TABLE field_offline_keys; DROP FUNCTION field_offline_append_only()`.execute(db);
}
