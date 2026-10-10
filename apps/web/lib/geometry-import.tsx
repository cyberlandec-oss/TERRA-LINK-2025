'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, api, apiUpload } from './api';
import { GeometrySketch, ha, type PlotVersion } from './plots';
import { ErrorPanel, StatusBadge } from './ui';

// P0-009 Importación GeoJSON (UX_UI §13.3): seleccionar archivo → analizar → revisar → confirmar.
// El servidor aplica el perfil GEOJSON_IMPORT_V1 (RFC 7946: Polygon/MultiPolygon, [longitud, latitud]
// WGS84) sin reproyectar, intercambiar ejes, eliminar dimensiones ni reparar. El archivo original se
// guarda privado con su SHA-256. Confirmar crea una versión FILE_IMPORT sin validación GIS (P0-010).

interface ImportView {
  id: string; status: 'ANALYZED' | 'CONFIRMED' | 'DISCARDED'; created_at: string;
  original: { filename: string | null; byte_size: number; sha256: string };
  profile_version: string; envelope: 'GEOMETRY' | 'FEATURE' | 'FEATURE_COLLECTION_SINGLE'; geometry_type: 'POLYGON' | 'MULTIPOLYGON';
  stats: { components: number; rings: number; holes: number; positions: number; max_decimal_places: number };
  decimal_places_note: string;
  technically_valid: boolean; validity_reason: string | null; area_calculated_ha: string | null;
  warnings: Array<{ code: string; message: string }>;
  geometry: PlotVersion['geometry'];
}
interface ImportSummary { id: string; status: string; original_filename: string | null; created_at: string }

const ENVELOPE: Record<ImportView['envelope'], string> = {
  GEOMETRY: 'Geometría directa', FEATURE: 'Feature', FEATURE_COLLECTION_SINGLE: 'FeatureCollection con una feature',
};

export function GeometryImport({ orgId, plotId, plotVersion, onConfirmed }: {
  orgId: string; plotId: string; plotVersion: number; onConfirmed: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const opId = useRef<string | null>(null); // mismo identificador en un reintento del mismo archivo
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [review, setReview] = useState<ImportView | null>(null);
  const [pending, setPending] = useState<ImportSummary | null>(null);
  const [keepInvalid, setKeepInvalid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const confirmOp = useRef<string | null>(null);
  const base = `/api/v1/organizations/${orgId}`;

  const loadPending = useCallback(async () => {
    try {
      const rows = await api<ImportSummary[]>(`${base}/plots/${plotId}/geometry-imports`);
      setPending(rows.find((r) => r.status === 'ANALYZED') ?? null);
    } catch { /* la sección principal ya muestra errores de acceso */ }
  }, [base, plotId]);
  useEffect(() => { void loadPending(); }, [loadPending]);

  async function analyze(e?: FormEvent) {
    e?.preventDefault();
    if (!file) return;
    opId.current ??= crypto.randomUUID();
    setBusy(true); setError(null); setNotice(null); setUncertain(false);
    const form = new FormData();
    form.append('operation_id', opId.current);
    form.append('file', file, file.name);
    try {
      const r = await apiUpload<{ import: ImportView }>(`${base}/plots/${plotId}/geometry-imports`, form);
      setReview(r.data.import);
      confirmOp.current = crypto.randomUUID();
      setKeepInvalid(false);
    } catch (err) {
      const ae = err as ApiError;
      if (ae.status === 0 || ae.status >= 500) setUncertain(true);
      else opId.current = null; // un rechazo del perfil exige otro archivo
      setError(ae);
    } finally { setBusy(false); }
  }

  async function resume(id: string) {
    setBusy(true); setError(null);
    try {
      setReview(await api<ImportView>(`${base}/geometry-imports/${id}`));
      confirmOp.current = crypto.randomUUID();
    } catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }

  async function confirm() {
    if (!review) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ version: { version_number: number } }>(`${base}/geometry-imports/${review.id}/confirm`, {
        method: 'POST', body: { operation_id: confirmOp.current, plot_expected_version: plotVersion, keep_invalid_for_review: keepInvalid },
      });
      setReview(null); setFile(null); opId.current = null; setPending(null);
      setNotice(`Geometría importada como versión ${r.version.version_number}. Sigue sin validación GIS (P0-010).`);
      await onConfirmed();
    } catch (err) {
      setError(err as ApiError);
    } finally { setBusy(false); }
  }

  async function discard() {
    if (!review) return;
    setBusy(true); setError(null);
    try {
      await api(`${base}/geometry-imports/${review.id}/discard`, { method: 'POST' });
      setReview(null); setFile(null); opId.current = null; setPending(null);
      setNotice('Importación descartada. No se creó ninguna versión.');
    } catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }

  return (
    <div className="capture geometry-import" aria-live="polite">
      <h3>Importar GeoJSON</h3>
      <p className="field-help">Un archivo por parcela: Polygon o MultiPolygon en WGS84 con coordenadas [longitud, latitud] (RFC 7946). No se reproyecta, no se invierten ejes, no se elimina la altitud ni se repara la forma: si el archivo no cumple, verás el motivo.</p>
      {notice && <p className="alert valid" role="status">{notice}</p>}
      {pending && !review && (
        <div className="alert" role="status">
          <p>Hay una importación analizada pendiente de revisión{pending.original_filename ? ` (${pending.original_filename})` : ''}.</p>
          <button type="button" className="secondary" onClick={() => resume(pending.id)} disabled={busy}>Retomar revisión</button>
        </div>
      )}

      {!review && (
        <form onSubmit={analyze} className="actions">
          <label>
            Archivo GeoJSON (.geojson o .json)
            <input type="file" accept=".geojson,.json,application/geo+json,application/json"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); opId.current = null; setError(null); setUncertain(false); }} />
          </label>
          <button type="submit" disabled={!file || busy} aria-busy={busy}>{busy ? 'Analizando…' : uncertain ? 'Reintentar análisis' : 'Analizar archivo'}</button>
        </form>
      )}
      {uncertain && (
        <div className="error" role="alert">
          <p className="alert-title">No pudimos confirmar el análisis</p>
          <p>El archivo seleccionado se conserva. «Reintentar análisis» no duplica la importación: el servidor reconoce este envío.</p>
        </div>
      )}
      {error && !uncertain && <ErrorPanel error={error} />}
      {error?.body.details?.[0]?.field && !uncertain && <p className="muted">Ubicación en el archivo: {error.body.details[0].field}</p>}

      {review && (
        <section className="card capture-review" aria-labelledby="import-review">
          <h4 id="import-review">Revisión de la importación</h4>
          <dl className="props">
            <dt>Archivo</dt><dd>{review.original.filename ?? 'sin nombre'} · {review.original.byte_size.toLocaleString('es-EC')} bytes</dd>
            <dt>SHA-256 (calculado en el servidor)</dt><dd><code className="hash">{review.original.sha256}</code> <span className="muted">Acredita que los bytes no cambian; no prueba el origen del archivo.</span></dd>
            <dt>Formato</dt><dd>{ENVELOPE[review.envelope]} · perfil {review.profile_version}</dd>
            <dt>Tipo</dt><dd>{review.geometry_type === 'POLYGON' ? 'Polígono' : 'Multipolígono'}</dd>
            <dt>Componentes / anillos / huecos</dt><dd>{review.stats.components} / {review.stats.rings} / {review.stats.holes}</dd>
            <dt>Posiciones</dt><dd>{review.stats.positions} <span className="muted">(cada anillo repite la primera posición para cerrarse)</span></dd>
            <dt>Decimales en el archivo</dt><dd>hasta {review.stats.max_decimal_places} <span className="muted">— {review.decimal_places_note}</span></dd>
            <dt>Validez técnica</dt><dd>{review.technically_valid ? <StatusBadge tone="process">Válida</StatusBadge> : <><StatusBadge tone="review">No válida</StatusBadge> {review.validity_reason}</>}</dd>
            <dt>Superficie calculada</dt><dd>{ha(review.area_calculated_ha) ?? 'No calculada (geometría no válida)'}</dd>
            <dt>Validación GIS</dt><dd>Pendiente (P0-010). Confirmar no valida la parcela.</dd>
          </dl>
          {review.warnings.length > 0 && (
            <div className="alert" role="note">
              <p className="alert-title">Advertencias ({review.warnings.length})</p>
              <ul>{review.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
            </div>
          )}
          <GeometrySketch geometry={review.geometry} label={`Vista previa de la geometría importada (${review.stats.components} componente(s))`} />
          {!review.technically_valid && (
            <div className="alert" role="alert">
              <p className="alert-title">La geometría no es válida técnicamente.</p>
              <p>Lo recomendable es corregir el archivo y volver a importarlo. Si necesitas conservarla tal cual para revisión, márcalo: se guardará sin superficie y nunca como válida.</p>
              <label><input type="checkbox" checked={keepInvalid} onChange={(e) => setKeepInvalid(e.target.checked)} /> Conservar para revisión, sin superficie</label>
            </div>
          )}
          {error?.status === 409 && error.body.code === 'VERSION_CONFLICT' && <p className="muted">La parcela cambió después del análisis. Recarga la ficha y vuelve a confirmar; la importación se conserva.</p>}
          <div className="actions">
            <button type="button" onClick={confirm} disabled={busy || (!review.technically_valid && !keepInvalid)} aria-busy={busy}>
              {busy ? 'Confirmando…' : 'Confirmar nueva versión'}
            </button>
            <button type="button" className="secondary" onClick={discard} disabled={busy}>Descartar importación</button>
          </div>
        </section>
      )}
    </div>
  );
}
