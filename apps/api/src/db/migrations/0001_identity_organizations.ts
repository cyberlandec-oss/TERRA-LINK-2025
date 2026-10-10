import { Kysely, sql } from 'kysely';

// TECH-001 / P0-001: identidad, organizaciones (tenant), membresías, roles y bitácora de auditoría.
// Roles: los 12 códigos documentados en docs/07_RBAC_Y_GOBERNANZA.md (no se añaden otros).
const ROLES: Array<[string, 'PLATFORM' | 'ORGANIZATION', string]> = [
  ['SUPER_ADMIN', 'PLATFORM', 'Administración de plataforma con elevación auditada'],
  ['ORG_ADMIN', 'ORGANIZATION', 'Administración de la organización'],
  ['MANAGER', 'ORGANIZATION', 'Supervisión de operación propia'],
  ['FIELD_TECHNICIAN', 'ORGANIZATION', 'Captura de campo asignada'],
  ['RECEPTION_OPERATOR', 'ORGANIZATION', 'Recepción y pesaje en centros asignados'],
  ['QUALITY_OPERATOR', 'ORGANIZATION', 'Análisis y liberación de calidad'],
  ['TRACEABILITY_MANAGER', 'ORGANIZATION', 'Cadena, lotes y procesamiento'],
  ['EUDR_MANAGER', 'ORGANIZATION', 'Evidencia, riesgo y debida diligencia'],
  ['EXPORT_MANAGER', 'ORGANIZATION', 'Embarques y despacho'],
  ['BUYER', 'ORGANIZATION', 'Comprador con acceso por concesión'],
  ['AUDITOR', 'ORGANIZATION', 'Auditoría dentro del alcance concedido'],
  ['PRODUCER', 'ORGANIZATION', 'Productor con acceso a recursos propios'],
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS postgis`.execute(db);

  await sql`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      first_name text NOT NULL,
      last_name text NOT NULL,
      password_hash text,
      status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
      platform_role text CHECK (platform_role IN ('SUPER_ADMIN')),
      last_login_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)))
    )`.execute(db);
  await sql`CREATE UNIQUE INDEX users_email_uq ON users (email)`.execute(db);

  await sql`
    CREATE TABLE organizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (length(btrim(name)) > 0),
      legal_name text,
      organization_type text NOT NULL CHECK (organization_type ~ '^[A-Z_]{2,40}$'),
      tax_id text,
      country char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
      province text,
      canton text,
      parish text,
      status text NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
      status_reason text,
      row_version bigint NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid NOT NULL REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid NOT NULL REFERENCES users(id),
      CONSTRAINT organizations_suspension_reason CHECK (status <> 'SUSPENDED' OR status_reason IS NOT NULL)
    )`.execute(db);

  await sql`
    CREATE TABLE memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id),
      user_id uuid NOT NULL REFERENCES users(id),
      status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid NOT NULL REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid NOT NULL REFERENCES users(id),
      CONSTRAINT memberships_user_org_uq UNIQUE (organization_id, user_id),
      CONSTRAINT memberships_org_id_uq UNIQUE (organization_id, id)
    )`.execute(db);

  await sql`
    CREATE TABLE roles (
      code text PRIMARY KEY,
      scope text NOT NULL CHECK (scope IN ('PLATFORM','ORGANIZATION')),
      description text NOT NULL
    )`.execute(db);
  for (const [code, scope, description] of ROLES) {
    await sql`INSERT INTO roles (code, scope, description) VALUES (${code}, ${scope}, ${description})`.execute(db);
  }

  // FK compuesta (organization_id, membership_id): una asignación no puede apuntar a otra organización.
  await sql`
    CREATE TABLE role_assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL,
      membership_id uuid NOT NULL,
      role_code text NOT NULL REFERENCES roles(code),
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid NOT NULL REFERENCES users(id),
      CONSTRAINT role_assignments_membership_fk FOREIGN KEY (organization_id, membership_id)
        REFERENCES memberships (organization_id, id),
      CONSTRAINT role_assignments_uq UNIQUE (membership_id, role_code),
      CONSTRAINT role_assignments_not_platform CHECK (role_code <> 'SUPER_ADMIN')
    )`.execute(db);

  await sql`
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid REFERENCES organizations(id),
      actor_user_id uuid REFERENCES users(id),
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id uuid,
      request_id text,
      result text NOT NULL CHECK (result IN ('SUCCESS','DENIED','FAILED')),
      before jsonb,
      after jsonb,
      reason text,
      occurred_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX audit_logs_org_time_idx ON audit_logs (organization_id, occurred_at)`.execute(db);

  // Bitácora append-only: se rechaza UPDATE y DELETE a nivel de base de datos.
  await sql`
    CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs es append-only';
    END $$`.execute(db);
  await sql`
    CREATE TRIGGER audit_logs_no_mutation BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE audit_logs`.execute(db);
  await sql`DROP FUNCTION audit_logs_append_only`.execute(db);
  await sql`DROP TABLE role_assignments`.execute(db);
  await sql`DROP TABLE roles`.execute(db);
  await sql`DROP TABLE memberships`.execute(db);
  await sql`DROP TABLE organizations`.execute(db);
  await sql`DROP TABLE users`.execute(db);
}
