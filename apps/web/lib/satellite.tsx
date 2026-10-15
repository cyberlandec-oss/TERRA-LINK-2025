'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from './api';
import { Alert, EmptyState, ErrorPanel, StatusBadge, type Tone } from './ui';

// P0-028 Análisis satelital (UX_UI §13.4): «solicitado, en cola, en proceso, fallido o disponible según contrato de
// job. Resultado muestra fecha de análisis y del dataset, fuente y límites. Una alerta de cobertura requiere
// interpretación; no escribir "deforestación confirmada" por el solo resultado de un proveedor.»
//
// Esta tarjeta NO interpreta: muestra el estado, la procedencia y los límites que devuelve el servidor. Hoy no hay
// proveedor seleccionado (D-09), así que lo normal es ver el bloque explicando exactamente eso.

interface Result {
  is_synthetic: boolean;
  synthetic_warning: string | null;
  provenance: { provider_code: string; dataset: string | null; dataset_version: string | null; analysis_date: string | null; resolution_m: string | null; method: string | null };
  coverage: { status: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN'; note: string };
  confidence: string | null;
  confidence_note: string | null;
  limitations: string;
  raw_evidence: { object_key: string; sha256: string } | null;
  conclusion: string;
  conclusion_note: string;
}
interface Job {
  id: string;
  subject: { plot_version_id: string; geometry_hash: string; geometry_type: string };
  applies_to_current_version: boolean;
  provider: { code: string; kind: string; adapter_contract_version: string };
  operation: string;
  period: { start: string | null; end: string | null };
  status: 'REQUESTED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  outcome: string | null;
  outcome_note: string;
  attempts: number;
  error_code: string | null;
  requested_at: string;
  finished_at: string | null;
  result: Result | null;
}
interface PlotSatellite {
  can_request: boolean;
  request_blocked_reason: string | null;
  provider_selection: { status: 'SELECTED' | 'SELECTED_FOR_DEVELOPMENT' | 'NOT_SELECTED'; provider_code?: string; decision?: string; note?: string };
  analysis_status: 'RESULT_AVAILABLE' | 'IN_PROGRESS' | 'NOT_EVALUATED';
  jobs: Job[];
  limits: string[];
}

const STATUS: Record<Job['status'], { label: string; tone: Tone }> = {
  REQUESTED: { label: 'Solicitado', tone: 'neutral' },
  RUNNING: { label: 'En proceso', tone: 'process' },
  COMPLETED: { label: 'Disponible', tone: 'valid' },
  FAILED: { label: 'Fallido', tone: 'blocked' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};
const ANALYSIS: Record<PlotSatellite['analysis_status'], { label: string; tone: Tone }> = {
  RESULT_AVAILABLE: { label: 'Resultado disponible', tone: 'valid' },
  IN_PROGRESS: { label: 'Análisis en curso', tone: 'process' },
  NOT_EVALUATED: { label: 'NO EVALUADO', tone: 'neutral' },
};
const OPERATION: Record<string, string> = {
  FOREST_COVER: 'Cobertura forestal',
  DEFORESTATION_ALERTS: 'Alertas de cambio de cobertura',
  HISTORICAL_ANALYSIS: 'Análisis histórico',
};
const COVERAGE: Record<Result['coverage']['status'], string> = {
  COVERED: 'Cubierta', PARTIAL: 'Cobertura parcial', NOT_COVERED: 'Sin cobertura', UNKNOWN: 'Cobertura desconocida',
};
const fecha = (v: string | null) => (v ? new Date(v).toLocaleString('es-EC') : '—');

export function SatelliteAnalysis({ orgId, plotId }: { orgId: string; plotId: string }) {
  const [data, setData] = useState<PlotSatellite | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setError(null);
    try {
      setData(await api<PlotSatellite>(`/api/v1/organizations/${orgId}/plots/${plotId}/satellite`));
    } catch (err) {
      if ((err as ApiError).status === 403) { setDenied(true); return; }
      setError(err as ApiError);
    }
  }, [orgId, plotId]);

  useEffect(() => { void load(); }, [load]);

  // Sin permiso de lectura la tarjeta no existe: no se insinúa lo que no se puede ver.
  if (denied) return null;
  if (!data && !error) return null;

  const request = async (operation: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/organizations/${orgId}/plots/${plotId}/satellite/analyses`, {
        method: 'POST',
        body: JSON.stringify({ operation_id: crypto.randomUUID(), operation }),
      });
      await load();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="sat-title">
      <h2 id="sat-title">Análisis satelital</h2>
      {error && <ErrorPanel error={error} onRetry={load} />}
      {data && (
        <>
          <p>
            <StatusBadge tone={ANALYSIS[data.analysis_status].tone}>{ANALYSIS[data.analysis_status].label}</StatusBadge>{' '}
            {data.provider_selection.status === 'SELECTED'
              ? <span className="muted">Proveedor: {data.provider_selection.provider_code}</span>
              : data.provider_selection.status === 'SELECTED_FOR_DEVELOPMENT'
                ? <span className="muted">Adaptador en desarrollo: {data.provider_selection.provider_code}</span>
                : <span className="muted">Sin proveedor seleccionado ({data.provider_selection.decision})</span>}
          </p>
          {data.provider_selection.status !== 'SELECTED' && (
            <Alert
              tone="info"
              title={data.provider_selection.status === 'SELECTED_FOR_DEVELOPMENT'
                ? 'El adaptador existe, pero su uso real no está autorizado.'
                : 'No hay proveedor satelital seleccionado.'}
            >
              <p>{data.provider_selection.note}</p>
            </Alert>
          )}
          {data.can_request ? (
            <p className="actions">
              {Object.entries(OPERATION).map(([code, label]) => (
                <button key={code} type="button" className="secondary" disabled={busy} onClick={() => void request(code)}>
                  Solicitar: {label}
                </button>
              ))}
            </p>
          ) : (
            // Si el aviso de arriba ya explica el motivo, no se repite la misma frase dos veces.
            data.request_blocked_reason && data.request_blocked_reason !== data.provider_selection.note
              && <p className="muted">No se puede solicitar un análisis: {data.request_blocked_reason}</p>
          )}

          {data.jobs.length === 0 ? (
            <EmptyState title="Sin análisis solicitados.">
              <p className="muted">Esta parcela no tiene ningún análisis satelital encargado.</p>
            </EmptyState>
          ) : (
            <ul className="plain">
              {data.jobs.map((j) => (
                <li key={j.id} className="subcard">
                  <p>
                    <StatusBadge tone={STATUS[j.status].tone}>{STATUS[j.status].label}</StatusBadge>{' '}
                    {OPERATION[j.operation] ?? j.operation} · solicitado {fecha(j.requested_at)}
                    {!j.applies_to_current_version && <> · <StatusBadge tone="review">No corresponde a la versión vigente</StatusBadge></>}
                  </p>
                  <p className="muted">{j.outcome_note}</p>
                  {j.result && (
                    <>
                      {j.result.synthetic_warning && <Alert tone="review" title="Fixture sintética">{j.result.synthetic_warning}</Alert>}
                      <dl className="props">
                        <dt>Fuente</dt><dd>{j.result.provenance.provider_code} · contrato {j.provider.adapter_contract_version}</dd>
                        <dt>Conjunto de datos</dt><dd>{j.result.provenance.dataset ?? 'No informado'}{j.result.provenance.dataset_version ? ` · versión ${j.result.provenance.dataset_version}` : ''}</dd>
                        <dt>Fecha del análisis</dt><dd>{fecha(j.result.provenance.analysis_date)}</dd>
                        <dt>Resolución</dt><dd>{j.result.provenance.resolution_m ? `${j.result.provenance.resolution_m} m` : 'No informada'}</dd>
                        <dt>Método</dt><dd>{j.result.provenance.method ?? 'No informado'}</dd>
                        <dt>Cobertura</dt><dd>{COVERAGE[j.result.coverage.status]} · {j.result.coverage.note}</dd>
                        <dt>Confianza</dt><dd>{j.result.confidence ?? j.result.confidence_note}</dd>
                        <dt>Conclusión</dt><dd><StatusBadge tone="neutral">No evaluada</StatusBadge> <span className="muted">{j.result.conclusion_note}</span></dd>
                        <dt>Límites declarados</dt><dd>{j.result.limitations}</dd>
                        {j.result.raw_evidence && (<>
                          <dt>Respuesta original</dt><dd>SHA-256 <code className="hash">{j.result.raw_evidence.sha256}</code></dd>
                        </>)}
                      </dl>
                    </>
                  )}
                  {j.error_code && <p className="muted">Código del fallo: {j.error_code} · intentos: {j.attempts}</p>}
                </li>
              ))}
            </ul>
          )}
          <ul className="muted">
            {data.limits.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
