'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, apiDownload } from '../../../../lib/api';
import { useWorkspace } from '../../../../lib/workspace';
import { useUrlFilters } from '../../../../lib/url-filters';
import { Alert, Breadcrumb, ErrorPanel, Loading, PageHeader, StatusBadge } from '../../../../lib/ui';

// P0-030 Reportes e indicadores (S1 §60; UX_UI §15). Contrato: docs/decisiones/P0-030-REPORTES.md.
// La pantalla no calcula nada: muestra lo que devuelve la API, con su definición, denominador y motivo. Un indicador
// sin permiso de dominio sale RESTRICTED y otro no evaluable sale NO CALCULABLE; ninguno se presenta como cero.
interface Indicator {
  code: string; name: string; definition: string; unit: 'count' | 'percent'; kind: 'STATE' | 'ACTIVITY' | 'BALANCE_AT';
  date_basis: string | null; requires: string; status: 'OK' | 'NOT_CALCULABLE' | 'RESTRICTED';
  value: string | null; numerator: number | null; denominator: number | null; reason: string | null;
}
interface Report {
  catalog_version: string; source: string;
  period: { from: string | null; to: string | null; applies_to: string };
  scope_note: string; privacy_note: string; interpretation_note: string;
  history_gap: { since: string; note: string; reference: string };
  can_export: boolean; indicators: Indicator[];
}

const KIND: Record<Indicator['kind'], string> = { STATE: 'Estado actual', ACTIVITY: 'Actividad del período', BALANCE_AT: 'Saldo a una fecha' };

export default function ReportsPage() {
  const ws = useWorkspace();
  const orgId = ws.activeOrg?.id ?? '';
  const can = ws.can('report:read');
  // El período vive en la URL (mismo patrón que parcelas y lotes): se conserva al volver de otra pantalla.
  const [urlFilters, setUrlFilters, ready] = useUrlFilters({ desde: '', hasta: '' });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ desde: '', hasta: '' });
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ filename: string; sha256: string | null; bytes: number } | null>(null);

  const load = useCallback(async (f = applied) => {
    if (!orgId || !can) return;
    setError(null);
    setData(null);
    const qs = new URLSearchParams();
    if (f.desde) qs.set('from', f.desde);
    if (f.hasta) qs.set('to', f.hasta);
    try {
      setData(await api<Report>(`/api/v1/organizations/${orgId}/reports/indicators${qs.toString() ? `?${qs}` : ''}`));
      setApplied(f);
      setUrlFilters(f);
    } catch (e) {
      setError(e as ApiError);
    }
  }, [orgId, can, applied, setUrlFilters]);

  useEffect(() => {
    if (!ready) return;
    setFrom(urlFilters.desde);
    setTo(urlFilters.hasta);
    void load(urlFilters);
    // Solo al entrar, con el período que venga en la URL; después se aplica con el formulario.
  }, [orgId, ready]);

  const applyFilters = (e: FormEvent) => {
    e.preventDefault();
    void load({ desde: from, hasta: to });
  };

  async function doExport() {
    setExporting(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (applied.desde) qs.set('from', applied.desde);
      if (applied.hasta) qs.set('to', applied.hasta);
      setExported(await apiDownload(`/api/v1/organizations/${orgId}/reports/indicators/export${qs.toString() ? `?${qs}` : ''}`, 'indicadores.csv'));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setExporting(false);
    }
  }

  if (!ws.activeOrg) return null;
  if (!can) return <ErrorPanel error={new ApiError(403, { code: 'PERMISSION_DENIED', message: 'Tu rol no permite consultar los indicadores de la organización.', request_id: null })} />;
  return (
    <>
      <Breadcrumb items={[{ label: ws.activeOrg.name, href: `/organizaciones/${orgId}` }, { label: 'Reportes' }]} />
      <PageHeader title="Reportes e indicadores" meta={data ? `Catálogo ${data.catalog_version} · ${data.source}` : undefined} />
      {error && <ErrorPanel error={error} onRetry={() => void load()} />}
      {!data && !error && <Loading label="Calculando indicadores…" />}
      {data && (
        <>
          <form className="card form" onSubmit={applyFilters} aria-label="Período de los indicadores de actividad">
            <h2>Período</h2>
            <div className="grid-2">
              <div><label htmlFor="rp-desde">Desde</label><input id="rp-desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><label htmlFor="rp-hasta">Hasta</label><input id="rp-hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <p className="field-help">{data.period.applies_to}</p>
            <button type="submit">Aplicar período</button>
          </form>
          <section className="card">
            <p className="muted">{data.scope_note}</p>
            <p className="muted">{data.privacy_note}</p>
            <p className="muted">{data.interpretation_note}</p>
            <Alert tone="review" title={`Laguna histórica desde ${data.history_gap.since}`}>{data.history_gap.note} <code>{data.history_gap.reference}</code></Alert>
          </section>
          <div className="table-wrap">
            <table aria-label="Indicadores">
              <thead><tr>
                <th scope="col">Indicador</th><th scope="col">Valor</th><th scope="col">Definición</th>
              </tr></thead>
              <tbody>
                {data.indicators.map((i) => (
                  <tr key={i.code}>
                    <td><strong>{i.name}</strong><div className="muted"><code>{i.code}</code></div><div className="muted">{KIND[i.kind]}</div></td>
                    <td>
                      {i.status === 'OK'
                        ? <strong>{i.unit === 'percent' ? `${i.value} %` : i.value}</strong>
                        : i.status === 'RESTRICTED'
                          ? <StatusBadge tone="neutral">Sin permiso</StatusBadge>
                          : <StatusBadge tone="review">No calculable</StatusBadge>}
                      {(i.numerator !== null || i.denominator !== null) && (
                        <div className="muted">{i.numerator ?? '—'} / {i.denominator ?? '—'}</div>
                      )}
                    </td>
                    <td>{i.definition}
                      {i.date_basis && <div className="muted">Fecha usada: {i.date_basis}</div>}
                      {i.reason && <div className="muted">{i.reason}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="card" aria-labelledby="rp-export">
            <h2 id="rp-export">Exportar</h2>
            {data.can_export ? (
              <>
                <p className="field-help">CSV con los mismos indicadores, filtros y notas de esta pantalla. La descarga vuelve a comprobar tu permiso y queda registrada en la auditoría con el hash del archivo. No genera enlaces públicos.</p>
                <button type="button" onClick={() => void doExport()} disabled={exporting}>{exporting ? 'Generando…' : 'Exportar CSV'}</button>
                {exported && <Alert tone="valid" title="Exportado">{exported.filename} · {exported.bytes} bytes{exported.sha256 ? ` · sha256 ${exported.sha256.slice(0, 16)}…` : ''}</Alert>}
              </>
            ) : <p className="muted">Tu rol no permite exportar estos indicadores.</p>}
          </section>
        </>
      )}
    </>
  );
}
