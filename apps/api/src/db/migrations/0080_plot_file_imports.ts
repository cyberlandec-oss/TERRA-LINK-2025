import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE plot_file_imports (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    created_by uuid NOT NULL REFERENCES users(id),
    operation_id uuid NOT NULL,
    filename text NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    original_enc text NOT NULL,
    metadata_enc text NOT NULL,
    plan_enc text,
    plan_hash text,
    status text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','PREVIEWED','COMMITTED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz,
    confirmed_by uuid REFERENCES users(id),
    confirm_operation_id uuid,
    result jsonb,
    UNIQUE (organization_id,id),
    UNIQUE (organization_id,created_by,operation_id),
    UNIQUE (organization_id,confirm_operation_id),
    CHECK ((status = 'COMMITTED') = (confirmed_at IS NOT NULL AND result IS NOT NULL))
  )`.execute(db);
  await sql`ALTER TABLE plot_versions ADD COLUMN source_file_import_id uuid,
    ADD COLUMN source_file_row_numbers jsonb,
    ADD CONSTRAINT plot_versions_file_import_fk FOREIGN KEY (organization_id,source_file_import_id) REFERENCES plot_file_imports(organization_id,id)`.execute(db);
  await sql`CREATE FUNCTION plot_file_imports_protect() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'plot_file_imports no admite borrado'; END IF;
      IF NEW.original_enc IS DISTINCT FROM OLD.original_enc OR NEW.sha256 IS DISTINCT FROM OLD.sha256
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.filename IS DISTINCT FROM OLD.filename OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
        OR NEW.metadata_enc IS DISTINCT FROM OLD.metadata_enc OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR OLD.status = 'COMMITTED' THEN RAISE EXCEPTION 'plot_file_imports: original inmutable'; END IF;
      RETURN NEW;
    END $$`.execute(db);
  await sql`CREATE TRIGGER plot_file_imports_no_mutation BEFORE UPDATE OR DELETE ON plot_file_imports FOR EACH ROW EXECUTE FUNCTION plot_file_imports_protect()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE plot_versions DROP COLUMN source_file_import_id, DROP COLUMN source_file_row_numbers`.execute(db);
  await sql`DROP TABLE plot_file_imports; DROP FUNCTION plot_file_imports_protect()`.execute(db);
}
