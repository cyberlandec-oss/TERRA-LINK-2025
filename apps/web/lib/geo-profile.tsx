'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { ErrorPanel, StatusBadge, type Tone } from './ui';

// D-05.A — Perfil técnico de destino `EUDR_GEO_V1`, en pantalla y SEPARADO de la evaluación técnica.
//
// Los dos dictámenes se muestran a la vez porque **pueden discrepar**: un polígono con hueco es técnicamente
// válido y no cumple el perfil. Enseñar uno solo haría creer que hay un único veredicto.

interface Check { code: string; layer: string; outcome: 'PASS' | 'FAIL' | 'REVIEW' | 'NOT_APPLICABLE' | 'NOT_EXECUTED'; reason_code: string | null; message: string; details?: Record<string, unknown> }
type Status = 'MEETS_PROFILE' | 'DOES_NOT_MEET' | 'REVIEW_REQUIRED' | 'NOT_EVALUABLE';
interface Evaluation {
  id: string; status: Status; label: string; exportable: boolean; evaluated_at: string;
  profile: { id: string; version: string; status: string; note: string };
  source: { service_version: string; document_version: string; page_date: string; verification: string; verification_note: string };
  area: { basis: 'CALCULATED' | 'DECLARED' | 'NONE'; value_ha: string | null; note: string };
  checks: Check[];
  decimals_contract: Record<string, string>;
  not_in_scope: string[];
  disclaimer: string;
}
interface Response { evaluations: Evaluation[]; note: string }

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  MEETS_PROFILE: { label: 'Cumple el perfil técnico', tone: 'process' },
  DOES_NOT_MEET: { label: 'No cumple el perfil técnico', tone: 'blocked' },
  REVIEW_REQUIRED: { label: 'Requiere revisión humana', tone: 'review' },
  NOT_EVALUABLE: { label: 'No evaluable', tone: 'neutral' },
};
const OUTCOME: Record<Check['outcome'], string> = {
  PASS: 'Correcta', FAIL: 'Falla', REVIEW: 'Requiere revisión', NOT_APPLICABLE: 'No aplica', NOT_EXECUTED: 'No ejecutada',
};
const CHECK_LABEL: Record<string, string> = {
  GEOMETRY_PRESENT: 'Geometría presente', GEOMETRY_TYPE: 'Tipo admitido por el destino', CRS: 'Sistema de referencia',
  COORDINATE_RANGE: 'Rango de coordenadas', TECHNICAL_VALIDITY: 'Validez de la geometría', NO_HOLES: 'Sin huecos',
  AREA_BASIS: 'Superficie de referencia', AREA_MINIMUM: 'Superficie mínima', THRESHOLD: 'Umbral de 4 ha',
  AREA_DISCREPANCY: 'Declarada frente a calculada', INTERCHANGE_PRECISION: 'Truncamiento a 6 decimales',
};
/** De qué fuente sale cada comprobación. Que el destino lo acepte no es que la ley lo exija. */
const LAYER: Record<string, string> = {
  NORM: 'Norma', DEST: 'Sistema de destino', TL: 'Regla de Terra Link',
};

export function GeoProfileEvaluation({ orgId, plotId, canEvaluate, hasVersion }: { orgId: string; plotId: string; canEvaluate: boolean; hasVersion: boolean }) {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const op = useRef<string | null>(null);
  const base = `/api/v1/organizations/${orgId}`;

  const load = useCallback(async () => {
    try { setData(await api<Response>(`${base}/plots/${plotId}/geo-profile/evaluations`)); } catch (e) { setError(e as ApiError); }
  }, [base, plotId]);
  useEffect(() => { void load(); }, [load]);

  async function evaluate() {
    op.current ??= crypto.randomUUID();
    setBusy(true); setError(null);
    try {
      await api(`${base}/plots/${plotId}/geo-profile/evaluations`, { method: 'POST', body: { operation_id: op.current } });
      op.current = null;
      await load();
    } catch (e) {
      const err = e as ApiError;
      if (!(err.status === 0 || err.status >= 500)) op.current = null;
      setError(err);
    } finally { setBusy(false); }
  }

  const latest = data?.evaluations[0];
  return (
    <section className="card" aria-labelledby="perfil-title">
      <h2 id="perfil-title">Perfil técnico de destino</h2>
      <p className="muted">
        Dictamen <strong>distinto</strong> del técnico de arriba, y pueden discrepar: una geometría puede ser
        técnicamente válida y no estar bien formada para el sistema de destino. Cumplir el perfil <strong>no es
        conformidad EUDR</strong> ni una declaración presentada.
      </p>
      {error && <ErrorPanel error={error} />}
      {canEvaluate && hasVersion && (
        <button type="button" onClick={evaluate} disabled={busy} aria-busy={busy}>{busy ? 'Evaluando…' : latest ? 'Volver a evaluar el perfil' : 'Evaluar el perfil'}</button>
      )}
      {data === null && !error && <p className="muted">Cargando perfil…</p>}
      {data && !latest && <p className="muted">Sin evaluaciones de perfil. {canEvaluate ? 'Evalúa la versión vigente.' : 'Un usuario con permiso de evaluación puede ejecutarla.'}</p>}
      {latest && (
        <div className="gis-eval">
          <dl className="props">
            <dt>Resultado</dt>
            <dd><StatusBadge tone={STATUS[latest.status].tone}>{STATUS[latest.status].label}</StatusBadge></dd>
            <dt>¿Exportable con perfil?</dt>
            <dd>{latest.exportable ? 'Sí' : 'No. Aparecerá en la lista de no exportables, con su motivo.'}</dd>
            <dt>Perfil</dt>
            <dd>{latest.profile.id} · versión {latest.profile.version} · <span className="muted">{latest.profile.note}</span></dd>
            <dt>Fuente evaluada</dt>
            <dd>
              Servicio <strong>{latest.source.service_version}</strong> · documento <strong>v{latest.source.document_version}</strong> ·
              página del {latest.source.page_date}
            </dd>
            <dt>Grado de comprobación</dt>
            <dd>{latest.source.verification_note}</dd>
            <dt>Superficie de referencia</dt>
            <dd>{latest.area.value_ha ? `${latest.area.value_ha} ha` : 'Desconocida'} · <span className="muted">{latest.area.note}</span></dd>
            <dt>Fecha</dt><dd>{new Date(latest.evaluated_at).toLocaleString('es-EC')}</dd>
          </dl>

          <div className="table-wrap">
            <table aria-label="Comprobaciones del perfil de destino">
              <thead><tr><th scope="col">Comprobación</th><th scope="col">Lo exige</th><th scope="col">Resultado</th><th scope="col">Motivo</th></tr></thead>
              <tbody>
                {latest.checks.map((c) => (
                  <tr key={c.code}>
                    <td>{CHECK_LABEL[c.code] ?? c.code}</td>
                    <td>{LAYER[c.layer] ?? c.layer}</td>
                    <td>{OUTCOME[c.outcome]}</td>
                    <td>{c.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details>
            <summary>Qué significan los decimales</summary>
            <dl className="props">
              <dt>Valor numérico</dt><dd>{latest.decimals_contract.numeric_value}</dd>
              <dt>Formato de intercambio</dt><dd>{latest.decimals_contract.interchange_format}</dd>
              <dt>Resolución del dato</dt><dd>{latest.decimals_contract.data_resolution}</dd>
              <dt>Exactitud de captura</dt><dd>{latest.decimals_contract.capture_accuracy}</dd>
            </dl>
            <p className="muted">{latest.decimals_contract.never}</p>
          </details>

          <details>
            <summary>Qué NO decide este perfil</summary>
            <ul>{latest.not_in_scope.map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="muted">{latest.disclaimer}</p>
          </details>

          {data.evaluations.length > 1 && (
            <details>
              <summary>Historial del perfil ({data.evaluations.length})</summary>
              <ul className="plain" aria-label="Historial del perfil">
                {data.evaluations.map((e) => (
                  <li key={e.id}>{new Date(e.evaluated_at).toLocaleString('es-EC')} · {STATUS[e.status].label} · {e.profile.id} {e.profile.version}</li>
                ))}
              </ul>
              <p className="muted">{data.note}</p>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
