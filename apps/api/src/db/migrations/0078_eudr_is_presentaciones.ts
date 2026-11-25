import { sql, type Kysely } from 'kysely';

// P1-007 tramo 2 — Presentación de DDS a EUDR-IS (TRACES NT): preparación inmutable + registro de solo añadir de intentos y conciliaciones.
// - `eudr_is_submissions`: lo que se PREPARÓ para presentar (instantánea, entorno, versión del servicio, referencia interna y contenido declarado), con su huella. No se modifica.
//   La referencia interna es única por organización y entorno: es la que permite CONCILIAR una respuesta perdida sin reenviar.
// - `eudr_is_submission_events`: cada intento y cada consulta, tal cual ocurrió. El estado se DERIVA leyendo los eventos; nunca se edita. Un intento de resultado INCIERTO impide un
//   nuevo envío hasta conciliar; el reenvío tras «no recibida» exige un acto explícito de una persona (RESEND_AUTHORIZED).
// Esto NO es un recibo oficial: el número de referencia y de verificación se guardan solo si los devuelve el sistema. Presentar no certifica autenticidad de los documentos.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE eudr_is_submissions (
      id                uuid PRIMARY KEY,
      organization_id   uuid NOT NULL REFERENCES organizations(id),
      snapshot_id       uuid NOT NULL,
      environment       text NOT NULL CHECK (environment IN ('ACCEPTANCE', 'PRODUCTION')),
      service_version   text NOT NULL CHECK (service_version IN ('V3', 'V4')),
      internal_reference text NOT NULL CHECK (char_length(internal_reference) BETWEEN 1 AND 50),
      declared          jsonb NOT NULL,
      declared_hash     text NOT NULL CHECK (declared_hash ~ '^[0-9a-f]{64}$'),
      operation_id      uuid NOT NULL,
      created_by        uuid NOT NULL REFERENCES users(id),
      created_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, environment, internal_reference),
      UNIQUE (organization_id, operation_id),
      CONSTRAINT eudr_is_submissions_org_id_uq UNIQUE (organization_id, id),
      CONSTRAINT eudr_is_submissions_snapshot_fk FOREIGN KEY (organization_id, snapshot_id) REFERENCES dd_snapshots(organization_id, id)
    )`.execute(db);
  await sql`CREATE INDEX eudr_is_submissions_snapshot_idx ON eudr_is_submissions (organization_id, snapshot_id)`.execute(db);
  await sql`
    CREATE TABLE eudr_is_submission_events (
      id                  uuid PRIMARY KEY,
      seq                 bigint GENERATED ALWAYS AS IDENTITY,
      organization_id     uuid NOT NULL REFERENCES organizations(id),
      submission_id       uuid NOT NULL,
      kind                text NOT NULL CHECK (kind IN ('ATTEMPT_ACCEPTED', 'ATTEMPT_REJECTED', 'ATTEMPT_NOT_PROCESSED', 'ATTEMPT_UNCERTAIN',
                                                        'STATUS_CHECKED', 'RECONCILED_FOUND', 'RECONCILED_NOT_FOUND', 'RECONCILIATION_UNCERTAIN', 'RESEND_AUTHORIZED')),
      eudr_uuid           text,
      reference_number    text,
      verification_number text,
      remote_status       text,
      http_status         integer,
      detail              text,
      errors              jsonb,
      actor_user_id       uuid REFERENCES users(id),
      created_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT eudr_is_submission_events_submission_fk FOREIGN KEY (organization_id, submission_id) REFERENCES eudr_is_submissions(organization_id, id)
    )`.execute(db);
  await sql`CREATE INDEX eudr_is_submission_events_idx ON eudr_is_submission_events (submission_id, seq)`.execute(db);
  await sql`
    CREATE FUNCTION eudr_is_presentaciones_solo_agregar() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'las presentaciones a EUDR-IS y sus eventos solo se agregan';
    END $$`.execute(db);
  await sql`CREATE TRIGGER eudr_is_submissions_append_only BEFORE UPDATE OR DELETE ON eudr_is_submissions FOR EACH ROW EXECUTE FUNCTION eudr_is_presentaciones_solo_agregar()`.execute(db);
  await sql`CREATE TRIGGER eudr_is_submission_events_append_only BEFORE UPDATE OR DELETE ON eudr_is_submission_events FOR EACH ROW EXECUTE FUNCTION eudr_is_presentaciones_solo_agregar()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE eudr_is_submission_events`.execute(db);
  await sql`DROP TABLE eudr_is_submissions`.execute(db);
  await sql`DROP FUNCTION eudr_is_presentaciones_solo_agregar()`.execute(db);
}
