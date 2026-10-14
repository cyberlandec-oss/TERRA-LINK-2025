'use client';

import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, apiDownload } from '../../../../lib/api';
import { useWorkspace } from '../../../../lib/workspace';
import { useUrlFilters } from '../../../../lib/url-filters';
import { Alert, Breadcrumb, EmptyState, ErrorPanel, Loading, PageHeader, StatusBadge } from '../../../../lib/ui';

// P0-030 Reportes e indicadores (S1 §60 y §97; UX_UI §20.2). Contrato: docs/decisiones/P0-030-REPORTES.md.
// La pantalla no calcula nada: muestra lo que devuelve la API con su definición, denominador, motivo y estado.
// Cinco estados distintos, no uno solo: calculado, sin denominador, desconocido, criterio sin definición y sin permiso.
type Status = 'OK' | 'NO_DENOMINATOR' | 'UNKNOWN' | 'CRITERION_UNDEFINED' | 'RESTRICTED';

interface Indicator {
  code: string; name: string; definition: string; unit: 'count' | 'percent'; kind: 'STATE' | 'ACTIVITY' | 'BALANCE_AT';
  date_basis: string | null; requires: string; status: Status;
  value: string | null; numerator: number | null; denominator: number | null; observed: Record<string, number> | null; reason: string | null;
}
interface Coverage { status: string; event_date: string; note: string; not_reconstructed: string; reference: string }
interface TimeBasis { as_of: string; as_of_note: string; period_bounds: string; civil_dates: string }
interface Indicators {
  catalog_version: string; source: string;
  period: { from: string | null; to: string | null; applies_to: string };
  time_basis: TimeBasis; scope_note: string; assigned_scope_note: string; privacy_note: string; interpretation_note: string;
  status_legend: Record<string, string>; coverage: Coverage; can_export: boolean; indicators: Indicator[];
}
interface CatalogEntry { kind: string; title: string; source: string; requires: string[]; period_applies: boolean; period_note: string; available: boolean; missing: string[] }
interface Catalog {
  catalog_version: string; source: string; can_export: boolean; reports: CatalogEntry[];
  geojson: { kind: string; title: string; source: string; requires: string[]; available: boolean; missing: string[]; notice: string; regulatory_profile: string };
}
interface EntityReport {
  kind: string; title: string; source: string; requires: string[]; period_applies: boolean; period_note: string;
  columns: Array<{ key: string; label: string; note?: string }>;
  rows: Array<Record<string, string | number | null>>;
  totals: Array<{ key: string; label: string; value: string }>;
  notes: string[]; total_rows: number; returned_rows: number; truncated: boolean; limit_note: string;
  can_export: boolean; coverage: Coverage; time_basis: TimeBasis;
}

const KIND: Record<Indicator['kind'], string> = { STATE: 'Estado actual', ACTIVITY: 'Actividad del período', BALANCE_AT: 'Saldo a una fecha' };
const BADGE: Record<Exclude<Status, 'OK'>, { tone: 'neutral' | 'review'; label: string }> = {
  NO_DENOMINATOR: { tone: 'review', label: 'Sin denominador' },
  UNKNOWN: { tone: 'review', label: 'Desconocido' },
  CRITERION_UNDEFINED: { tone: 'review', label: 'Criterio sin definir' },
  RESTRICTED: { tone: 'neutral', label: 'Sin permiso' },
};

function Observed({ observed }: { observed: Record<string, number> | null }) {
  if (!observed || !Object.keys(observed).length) return null;
  // Lo que sí se puede contar se publica, aunque el indicador principal sea desconocido.
  return <div className="muted">Observado: {Object.entries(observed).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}</div>;
}

export default function ReportsPage() {
  const ws = useWorkspace();
  const orgId = ws.activeOrg?.id ?? '';
  const can = ws.can('report:read');
  // Período y reporte activo viven en la URL (mismo patrón que parcelas y lotes): se conservan al volver de otra pantalla.
  const [urlFilters, setUrlFilters, ready] = useUrlFilters({ desde: '', hasta: '', reporte: 'indicadores' });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ desde: '', hasta: '', reporte: 'indicadores' });
  const [data, setData] = useState<Indicators | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [entity, setEntity] = useState<EntityReport | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ filename: string; sha256: string | null; bytes: number } | null>(null);

  const qs = (f: { desde: string; hasta: string }) => {
    const p = new URLSearchParams();
    if (f.desde) p.set('from', f.desde);
    if (f.hasta) p.set('to', f.hasta);
    return p.toString() ? `?${p}` : '';
  };

  const load = useCallback(async (f: { desde: string; hasta: string; reporte: string }) => {
    if (!orgId || !can) return;
    setError(null);
    setExported(null);
    try {
      if (!catalog) setCatalog(await api<Catalog>(`/api/v1/organizations/${orgId}/reports/entities`));
      if (f.reporte === 'indicadores') {
        setEntity(null);
        setData(await api<Indicators>(`/api/v1/organizations/${orgId}/reports/indicators${qs(f)}`));
      } else {
        setData(null);
        setEntity(await api<EntityReport>(`/api/v1/organizations/${orgId}/reports/entities/${f.reporte}${qs(f)}`));
      }
      setApplied(f);
      setUrlFilters(f);
    } catch (e) {
      setData(null);
      setEntity(null);
      setError(e as ApiError);
    }
  }, [orgId, can, catalog, setUrlFilters]);

  useEffect(() => {
    if (!ready) return;
    setFrom(urlFilters.desde);
    setTo(urlFilters.hasta);
    void load(urlFilters);
    // Solo al entrar, con lo que venga en la URL; después se aplica con el formulario o el selector.
  }, [orgId, ready]);

  const applyFilters = (e: FormEvent) => {
    e.preventDefault();
    void load({ desde: from, hasta: to, reporte: applied.reporte });
  };

  async function download(path: string, fallback: string) {
    setExporting(true);
    setError(null);
    try {
      setExported(await apiDownload(path, fallback));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setExporting(false);
    }
  }

  const activo = applied.reporte;
  const cargando = !data && !entity && !error;

  if (!ws.activeOrg) return null;
  if (!can) return <ErrorPanel error={new ApiError(403, { code: 'PERMISSION_DENIED', message: 'Tu rol no permite consultar los reportes de la organización.', request_id: null })} />;
  return (
    <>
      <Breadcrumb items={[{ label: ws.activeOrg.name, href: `/organizaciones/${orgId}` }, { label: 'Reportes' }]} />
      <PageHeader title="Reportes e indicadores" meta={catalog ? `Catálogo ${catalog.catalog_version} · S1 §60 (indicadores) y §97 (por entidad)` : undefined} />

      {catalog && (
        <nav className="card" aria-label="Reportes disponibles">
          <h2>Reporte</h2>
          <div className="actions">
            <button type="button" aria-current={activo === 'indicadores' ? 'page' : undefined} onClick={() => void load({ desde: from, hasta: to, reporte: 'indicadores' })}>
              Indicadores (§60)
            </button>
            {catalog.reports.map((r) => (
              <button key={r.kind} type="button" disabled={!r.available} aria-current={activo === r.kind ? 'page' : undefined}
                title={r.available ? r.source : `Te falta ${r.missing.join(' y ')}`}
                onClick={() => void load({ desde: from, hasta: to, reporte: r.kind })}>
                {r.title.replace('Reporte de ', '')}
              </button>
            ))}
          </div>
          <p className="field-help">Cada reporte exige el permiso de su dominio. Los que tu rol no permite quedan deshabilitados.</p>
          {catalog.reports.filter((r) => !r.available).map((r) => (
            <p key={r.kind} className="muted">{r.title}: te falta {r.missing.join(' y ')}.</p>
          ))}
        </nav>
      )}

      <form className="card form" onSubmit={applyFilters} aria-label="Período de los indicadores de actividad">
        <h2>Período</h2>
        <div className="grid-2">
          <div><label htmlFor="rp-desde">Desde</label><input id="rp-desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label htmlFor="rp-hasta">Hasta</label><input id="rp-hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <p className="field-help">{entity ? entity.period_note : data?.period.applies_to ?? 'El período solo se aplica a lo que mide actividad.'}</p>
        {(entity ?? data) && <p className="field-help">{(entity ?? data)!.time_basis.period_bounds}</p>}
        <button type="submit">Aplicar período</button>
      </form>

      {error && <ErrorPanel error={error} onRetry={() => void load(applied)} />}
      {cargando && <Loading label="Calculando…" />}

      {(data ?? entity) && (
        <section className="card">
          <p className="muted">{data ? data.scope_note : 'Este reporte aplica organización y alcance antes de agregar: los totales no incluyen nada que tu rol no pueda leer.'}</p>
          {data && <p className="muted">{data.privacy_note}</p>}
          <p className="muted">{(data ?? entity)!.time_basis.as_of_note} Calculado: <code>{(data ?? entity)!.time_basis.as_of}</code></p>
          <p className="muted">{data ? data.interpretation_note : entity!.source}</p>
          <Alert tone="review" title="Cobertura histórica incompleta">
            {(data ?? entity)!.coverage.note} {(data ?? entity)!.coverage.not_reconstructed} <code>{(data ?? entity)!.coverage.reference}</code>
          </Alert>
        </section>
      )}

      {data && (
        <>
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
                        : <StatusBadge tone={BADGE[i.status].tone}>{BADGE[i.status].label}</StatusBadge>}
                      {(i.numerator !== null || i.denominator !== null) && (
                        <div className="muted">{i.numerator ?? '—'} / {i.denominator ?? '—'}</div>
                      )}
                      <Observed observed={i.observed} />
                    </td>
                    <td>{i.definition}
                      {i.date_basis && <div className="muted">Fecha usada: {i.date_basis}</div>}
                      {i.reason && <div className="muted">{i.reason}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="card" aria-labelledby="rp-estados">
            <h2 id="rp-estados">Qué significa cada estado</h2>
            <dl className="props">
              {Object.entries(data.status_legend).map(([k, v]) => (
                <Fragment key={k}><dt><code>{k}</code></dt><dd>{v}</dd></Fragment>
              ))}
            </dl>
          </section>
          <section className="card" aria-labelledby="rp-export">
            <h2 id="rp-export">Exportar indicadores</h2>
            {data.can_export ? (
              <>
                <p className="field-help">CSV con los mismos indicadores, filtros y notas de esta pantalla. La descarga vuelve a comprobar tu permiso, se recalcula en ese momento y queda registrada en la auditoría con el hash del archivo. No genera enlaces públicos.</p>
                <button type="button" onClick={() => void download(`/api/v1/organizations/${orgId}/reports/indicators/export${qs(applied)}`, 'indicadores.csv')} disabled={exporting}>{exporting ? 'Generando…' : 'Exportar CSV'}</button>
              </>
            ) : <p className="muted">Tu rol no permite exportar estos indicadores.</p>}
          </section>
        </>
      )}

      {entity && (
        <>
          <section className="card" aria-labelledby="rp-entidad">
            <h2 id="rp-entidad">{entity.title}</h2>
            <p className="muted">{entity.source} · {entity.returned_rows} de {entity.total_rows} fila(s)</p>
          </section>
          {entity.truncated && <Alert tone="info" title="Tabla truncada">{entity.limit_note}</Alert>}
          {entity.rows.length === 0
            ? <EmptyState title="No hay filas para este reporte">No es un error: la organización no tiene registros de este tipo, o ninguno entra en el período.</EmptyState>
            : (
              <div className="table-wrap">
                <table aria-label={entity.title}>
                  <thead><tr>{entity.columns.map((c) => (<th scope="col" key={c.key}>{c.label}</th>))}</tr></thead>
                  <tbody>
                    {entity.rows.map((r, n) => (
                      <tr key={String(r[entity.columns[0].key] ?? n)}>
                        {entity.columns.map((c) => (<td key={c.key}>{r[c.key] === null || r[c.key] === undefined || r[c.key] === '' ? <span className="muted">—</span> : String(r[c.key])}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <section className="card" aria-labelledby="rp-totales">
            <h2 id="rp-totales">Totales</h2>
            <p className="field-help">{entity.limit_note}</p>
            <dl className="props">
              {entity.totals.map((t) => (
                <Fragment key={t.key}><dt>{t.label}</dt><dd><strong>{t.value}</strong></dd></Fragment>
              ))}
            </dl>
          </section>
          <section className="card" aria-labelledby="rp-notas">
            <h2 id="rp-notas">Cómo leer este reporte</h2>
            <ul>
              {entity.columns.filter((c) => c.note).map((c) => (<li key={c.key}><strong>{c.label}:</strong> {c.note}</li>))}
              {entity.notes.map((n) => (<li key={n}>{n}</li>))}
            </ul>
          </section>
          <section className="card" aria-labelledby="rp-export-entidad">
            <h2 id="rp-export-entidad">Exportar este reporte</h2>
            {entity.can_export ? (
              <>
                <p className="field-help">CSV con las mismas columnas, filas y totales de esta pantalla. Se RECALCULA al descargar: su marca de generación es la del momento de la descarga, no la de esta pantalla. Queda registrada en la auditoría con el hash del archivo.</p>
                <button type="button" onClick={() => void download(`/api/v1/organizations/${orgId}/reports/entities/${entity.kind}/export${qs(applied)}`, `reporte-${entity.kind}.csv`)} disabled={exporting}>{exporting ? 'Generando…' : 'Exportar CSV'}</button>
              </>
            ) : <p className="muted">Tu rol no permite exportar reportes.</p>}
          </section>
        </>
      )}

      {catalog && activo === 'plots' && (
        <section className="card" aria-labelledby="rp-geojson">
          <h2 id="rp-geojson">Exportación GeoJSON de parcelas</h2>
          <p className="field-help">{catalog.geojson.notice}</p>
          <Alert tone="review" title="Perfil de destino regulatorio pendiente (D-05)">{catalog.geojson.regulatory_profile}</Alert>
          {catalog.geojson.available
            ? <button type="button" onClick={() => void download(`/api/v1/organizations/${orgId}/reports/entities/plots/geojson`, 'parcelas.geojson')} disabled={exporting}>{exporting ? 'Generando…' : 'Descargar GeoJSON'}</button>
            : <p className="muted">Tu rol no permite esta exportación: falta {catalog.geojson.missing.join(' y ')}. Entrega coordenadas exactas, por eso exige <code>plot:read_geometry</code>.</p>}
        </section>
      )}

      {exported && <Alert tone="valid" title="Exportado">{exported.filename} · {exported.bytes} bytes{exported.sha256 ? ` · sha256 ${exported.sha256.slice(0, 16)}…` : ''}</Alert>}
    </>
  );
}
