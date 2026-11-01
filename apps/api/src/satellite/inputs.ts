import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/schema';

// AJ-08 · análisis satelitales como ENTRADA del riesgo y del expediente (H7/H8 del plan de revisión).
//
// Qué devuelve: para cada versión de parcela indicada, el ÚLTIMO resultado guardado por (proveedor, sintético o real), con la referencia que permite
// reconstruir qué se usó: resultado, trabajo, huella de la geometría analizada, cobertura DECLARADA, fecha DECLARADA, método y huella de la respuesta original.
// Qué NO hace: no interpreta indicadores, no asigna pesos ni umbrales y no convierte un resultado en conclusión. Un resultado de fixture sintética se
// devuelve rotulado como tal para que nadie lo cuente como análisis real.
export interface SatelliteInput {
  plot_version_id: string;
  provider_code: string;
  is_synthetic: boolean;
  result_id: string;
  job_id: string;
  geometry_hash: string;
  operation: string;
  coverage_status: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN';
  coverage_note: string | null;
  limitations: string | null;
  analysis_date: string | null;
  method: string | null;
  raw_sha256: string | null;
  recorded_at: string;
  /** Solo presente (y siempre 'LOCAL_TRIAL') para un ensayo local acotado: así los contenidos y huellas anteriores no cambian. */
  scope?: 'LOCAL_TRIAL';
}

export async function satelliteInputs(db: Kysely<Database> | { executeQuery: never } | never, orgId: string, plotVersionIds: string[]): Promise<SatelliteInput[]> {
  if (!plotVersionIds.length) return [];
  const rows = await sql<SatelliteInput>`
    SELECT DISTINCT ON (j.plot_version_id, r.provider_code, r.is_synthetic, j.scope)
           j.plot_version_id, r.provider_code, r.is_synthetic, r.id AS result_id, j.id AS job_id, j.geometry_hash,
           j.operation, r.coverage_status, r.coverage_note, r.limitations, r.analysis_date::text AS analysis_date, r.method, r.raw_sha256, r.recorded_at::text AS recorded_at, j.scope AS job_scope
      FROM satellite_results r
      JOIN satellite_jobs j ON j.id = r.job_id AND j.organization_id = r.organization_id
     WHERE r.organization_id = ${orgId} AND j.plot_version_id = ANY(${plotVersionIds}::uuid[]) AND j.outcome = 'RESULT_AVAILABLE'
     ORDER BY j.plot_version_id, r.provider_code, r.is_synthetic, j.scope, r.recorded_at DESC, r.id DESC`.execute(db as Kysely<Database>);
  return rows.rows.map((r) => {
    const { job_scope, ...resto } = r as SatelliteInput & { job_scope: string };
    return job_scope === 'LOCAL_TRIAL' ? { ...resto, scope: 'LOCAL_TRIAL' as const } : resto;
  });
}

/** Versiones de parcela con un análisis REAL, de uso OPERATIVO y con cobertura declarada completa del proveedor indicado. Un ensayo local (LOCAL_TRIAL) nunca cuenta, aunque el proveedor sea el seleccionado. */
export const coveredByOperationalProvider = (inputs: SatelliteInput[], providerCode: string): string[] =>
  inputs.filter((a) => a.provider_code === providerCode && !a.is_synthetic && a.scope !== 'LOCAL_TRIAL' && a.coverage_status === 'COVERED').map((a) => a.plot_version_id);
