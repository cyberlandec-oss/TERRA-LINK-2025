'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { ha } from './plots';
import { ErrorPanel, StatusBadge, type Tone } from './ui';

// P0-010 Evaluación GIS técnica (UX_UI §13.3). El estado es TÉCNICO: «Válida» no es conformidad EUDR.
// Tres bloques separados: validez técnica, calidad/cobertura de captura y perfil de destino (D-05).

interface Check { code: string; outcome: 'PASS' | 'FAIL' | 'REVIEW' | 'WARNING' | 'NOT_APPLICABLE' | 'NOT_EXECUTED' | 'RESTRICTED'; reason_code: string | null; message: string; details?: Record<string, unknown> }
interface Evaluation {
  id: string; version_number: number; plot_version_id: string; evaluated_at: string;
  rule: { id: string; version: string };
  status: 'VALID' | 'WARNING' | 'INVALID' | 'REVIEW_REQUIRED'; status_note: string; next_action: string;
  checks: Check[];
  capture_quality: { status: string; label: string; threshold_note: string };
  destination_profile: { status: string; label: string; not_evaluated: string[] };
  relations: Array<{ plot_id: string; plot_code: string; version_number: number; relation: 'EQUAL' | 'OVERLAP' | 'TOUCH'; same_hash: boolean; shared_area_m2: string | null }>;
  comparison_scope: 'ORGANIZATION' | 'EVALUATOR_ASSIGNED';
  error_location_visible: boolean; error_location: { type: string; coordinates: number[] } | null;
  stale: boolean; stale_reasons: string[]; limits: string[];
}

export const GIS_STATUS: Record<Evaluation['status'], { label: string; tone: Tone }> = {
  VALID: { label: 'VALID · técnicamente válida', tone: 'process' },
  WARNING: { label: 'WARNING · con advertencias', tone: 'review' },
  INVALID: { label: 'INVALID · técnicamente no válida', tone: 'blocked' },
  REVIEW_REQUIRED: { label: 'REVIEW_REQUIRED · requiere revisión', tone: 'review' },
};
const OUTCOME: Record<Check['outcome'], string> = {
  PASS: 'Correcta', FAIL: 'Falla', REVIEW: 'Requiere revisión', WARNING: 'Advertencia', NOT_APPLICABLE: 'No aplica', NOT_EXECUTED: 'No ejecutada', RESTRICTED: 'Reservada',
};
const CHECK_LABEL: Record<string, string> = {
  GEOMETRY_PRESENT: 'Geometría presente', GEOMETRY_TYPE: 'Tipo de geometría', SRID: 'Sistema de referencia (WGS84)',
  COORDINATE_RANGE: 'Rango de coordenadas', NOT_EMPTY: 'No vacía', NOT_DEGENERATE: 'No degenerada', TECHNICAL_VALIDITY: 'Validez técnica',
  AREA: 'Superficie calculada', GEOMETRIC_EQUALITY: 'Igualdad con otras parcelas', OVERLAP: 'Solapamiento con otras parcelas',
};
const RELATION: Record<string, string> = { EQUAL: 'Misma geometría', OVERLAP: 'Comparte superficie', TOUCH: 'Solo contacto por borde' };
const STALE: Record<string, string> = {
  GEOMETRY_CHANGED: 'la parcela tiene una versión geométrica más reciente',
  PLOT_VERSION_CHANGED_SAME_GEOMETRY: 'la parcela tiene una versión nueva con la misma geometría (cambió la superficie declarada); esta evaluación no se hereda: evalúa la versión vigente',
  COMPARED_PLOTS_CHANGED: 'cambiaron las parcelas con las que se comparó',
  RULES_CHANGED: 'cambió la versión de las reglas',
};

export function GisEvaluation({ orgId, plotId, canEvaluate, hasVersion }: { orgId: string; plotId: string; canEvaluate: boolean; hasVersion: boolean }) {
  const [list, setList] = useState<Evaluation[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const op = useRef<string | null>(null);
  const base = `/api/v1/organizations/${orgId}`;

  const load = useCallback(async () => {
    try { setList(await api<Evaluation[]>(`${base}/plots/${plotId}/gis-evaluations`)); } catch (e) { setError(e as ApiError); }
  }, [base, plotId]);
  useEffect(() => { void load(); }, [load]);

  async function evaluate() {
    op.current ??= crypto.randomUUID(); // un reintento tras un fallo de red no duplica la evaluación
    setBusy(true); setError(null);
    try {
      await api(`${base}/plots/${plotId}/gis-evaluations`, { method: 'POST', body: { operation_id: op.current } });
      op.current = null;
      await load();
    } catch (e) {
      const err = e as ApiError;
      if (!(err.status === 0 || err.status >= 500)) op.current = null;
      setError(err);
    } finally { setBusy(false); }
  }

  const latest = list?.[0];
  return (
    <section className="card" aria-labelledby="gis-title">
      <h2 id="gis-title">Evaluación GIS (técnica)</h2>
      <p className="muted">Comprueba la geometría con reglas técnicas versionadas, sin modificarla. No incluye umbrales regulatorios, análisis satelital ni aprobación EUDR.</p>
      {error && <ErrorPanel error={error} />}
      {canEvaluate && hasVersion && (
        <button type="button" onClick={evaluate} disabled={busy} aria-busy={busy}>{busy ? 'Evaluando…' : latest ? 'Volver a evaluar' : 'Evaluar geometría'}</button>
      )}
      {list === null && !error && <p className="muted">Cargando evaluaciones…</p>}
      {list && !latest && <p className="muted">Sin evaluaciones. {canEvaluate ? 'Evalúa la versión vigente para ver sus comprobaciones.' : 'Un usuario con permiso de evaluación puede ejecutarla.'}</p>}
      {latest && (
        <div className="gis-eval">
          {latest.stale && (
            <div className="alert" role="status">
              <p className="alert-title">Evaluación desactualizada</p>
              <p>Desde esta evaluación {latest.stale_reasons.map((r) => STALE[r] ?? r).join('; ')}. El resultado se conserva como historial; vuelve a evaluar para obtener uno vigente.</p>
            </div>
          )}
          <dl className="props">
            <dt>Estado técnico</dt><dd><StatusBadge tone={GIS_STATUS[latest.status].tone}>{GIS_STATUS[latest.status].label}</StatusBadge> <span className="muted">{latest.status_note}</span></dd>
            <dt>Versión evaluada</dt><dd>v{latest.version_number}</dd>
            <dt>Reglas</dt><dd>{latest.rule.id} · versión {latest.rule.version}</dd>
            <dt>Alcance de comparación</dt><dd>{latest.comparison_scope === 'ORGANIZATION' ? 'Todas las parcelas activas de la organización' : 'Solo las parcelas asignadas a quien evaluó'}</dd>
            <dt>Fecha</dt><dd>{new Date(latest.evaluated_at).toLocaleString('es-EC')}</dd>
            <dt>Siguiente acción</dt><dd>{latest.next_action}</dd>
          </dl>

          <h3>Validez técnica</h3>
          <div className="table-wrap">
            <table aria-label="Comprobaciones técnicas">
              <thead><tr><th scope="col">Comprobación</th><th scope="col">Resultado</th><th scope="col">Motivo</th></tr></thead>
              <tbody>
                {latest.checks.map((c) => (
                  <tr key={c.code}>
                    <td>{CHECK_LABEL[c.code] ?? c.code}</td>
                    <td>{OUTCOME[c.outcome]}</td>
                    <td>{c.message}{c.code === 'AREA' && typeof c.details?.area_calculated_ha === 'string' ? ` ${ha(c.details.area_calculated_ha as string)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {latest.error_location_visible && latest.error_location?.type === 'Point' && (
            <p className="muted">Ubicación del problema: latitud {latest.error_location.coordinates[1]}, longitud {latest.error_location.coordinates[0]}.</p>
          )}
          {latest.relations.length > 0 && (
            <>
              <h4>Relaciones con otras parcelas</h4>
              <p className="muted">Una coincidencia o solapamiento no prueba ilegalidad ni autoriza fusionar parcelas.</p>
              {latest.relations.length > 0 && (
                <ul className="plain" aria-label="Parcelas relacionadas">
                  {latest.relations.map((r) => (
                    <li key={r.plot_id}>
                      <a href={`/organizaciones/${orgId}/parcelas/${r.plot_id}`}>{r.plot_code}</a> (v{r.version_number}) · {RELATION[r.relation]}
                      {r.relation === 'EQUAL' && (r.same_hash ? ' · mismos bytes de geometría' : ' · igual en forma, con otro orden de vértices')}
                      {r.shared_area_m2 && ` · superficie compartida ${Number(r.shared_area_m2).toLocaleString('es-EC')} m²`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <h3>Calidad y cobertura de captura</h3>
          <p>{latest.capture_quality.label}</p>
          <p className="muted">{latest.capture_quality.threshold_note}</p>

          <h3>Perfil de destino y requisitos regulatorios</h3>
          <p><StatusBadge tone="neutral">No evaluado aquí</StatusBadge> {latest.destination_profile.label}</p>
          <p className="muted">
            Desde el 2026-10-15 el perfil técnico de destino se evalúa con una regla propia y versionada aparte
            (<strong>EUDR_GEO_V1</strong>, D-05.A), en la sección siguiente. Esta evaluación técnica no lo incluye
            a propósito: son dos dictámenes distintos y pueden discrepar.
          </p>

          <details>
            <summary>Límites del análisis</summary>
            <ul>{latest.limits.map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
          {list.length > 1 && (
            <details>
              <summary>Historial de evaluaciones ({list.length})</summary>
              <ul className="plain" aria-label="Historial de evaluaciones">
                {list.map((e) => <li key={e.id}>{new Date(e.evaluated_at).toLocaleString('es-EC')} · v{e.version_number} · {GIS_STATUS[e.status].label} · {e.rule.id} {e.rule.version}{e.stale ? ' · desactualizada' : ''}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
