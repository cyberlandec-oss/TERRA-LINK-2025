import { sql, type Kysely } from 'kysely';

// Ensayo local ACOTADO del análisis satelital (2026-11-01). Cada trabajo declara su ALCANCE de forma persistente:
//   · OPERATIONAL  — uso operativo autorizado (proveedor seleccionado para uso real, D-09 parte B).
//   · LOCAL_TRIAL  — proveedor REAL con una geometría ARTIFICIAL de ensayo, autorizada expresamente (parcela + huella de geometría). NO cuenta para el expediente aunque el proveedor pase
//                    después a ser seleccionado: el requisito de análisis de deforestación excluye este alcance por lo que el trabajo ES, no por el estado del proveedor.
// La respuesta de una fixture sintética se distingue aparte (is_synthetic / provider_kind). Un alcance no se cambia después de crear el trabajo.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE satellite_jobs ADD COLUMN scope text NOT NULL DEFAULT 'OPERATIONAL' CHECK (scope IN ('OPERATIONAL', 'LOCAL_TRIAL'))`.execute(db);
  await sql`
    CREATE FUNCTION satellite_jobs_scope_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.scope IS DISTINCT FROM OLD.scope THEN RAISE EXCEPTION 'el alcance de un trabajo satelital no se modifica'; END IF;
      RETURN NEW;
    END $$`.execute(db);
  // Los trabajos de un proveedor EXTERNO sobre una parcela rotulada ENSAYO- hechos antes de existir esta columna fueron análisis reales con geometría artificial de ensayo.
  // Se marcan antes de crear el guardián (el guardián solo impide cambios posteriores).
  await sql`
    UPDATE satellite_jobs j SET scope = 'LOCAL_TRIAL'
     WHERE j.provider_kind = 'EXTERNAL_HTTP'
       AND EXISTS (SELECT 1 FROM plots p WHERE p.organization_id = j.organization_id AND p.id = j.plot_id AND p.plot_code LIKE 'ENSAYO-%')`.execute(db);
  await sql`CREATE TRIGGER satellite_jobs_scope_guard BEFORE UPDATE ON satellite_jobs FOR EACH ROW EXECUTE FUNCTION satellite_jobs_scope_inmutable()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER satellite_jobs_scope_guard ON satellite_jobs`.execute(db);
  await sql`DROP FUNCTION satellite_jobs_scope_inmutable()`.execute(db);
  await sql`ALTER TABLE satellite_jobs DROP COLUMN scope`.execute(db);
}
