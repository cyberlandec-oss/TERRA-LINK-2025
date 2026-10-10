'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { accuracyLabel } from './location-capture';
import { GeometrySketch } from './plots';
import { ErrorPanel, StatusBadge } from './ui';

// P0-008 Polígono (UX_UI §13.3). Borrador persistido EN EL SERVIDOR (no es modo offline):
// recargar la página reabre el borrador. Cada vértice es una muestra de la ubicación del navegador
// con su operation_id; reintentar un guardado incierto no duplica el vértice.
// El anillo se cierra con el primer vértice: el cierre no es una muestra nueva.

interface DraftVertex {
  id: string; acquisition_seq: number; source: string; longitude: number; latitude: number;
  horizontal_accuracy_m: number | null; captured_at: string; received_at: string; excluded: boolean;
}
interface Draft {
  id: string; status: string; row_version: number;
  vertices: DraftVertex[];
  accuracy_summary: { with_accuracy: number; without_accuracy: number; worst_known_m: number | null; complete: boolean; label: string };
  preview: {
    vertex_count: number; distinct_count: number; repeated_vertices: number; storable: boolean; structural_issues: string[];
    technically_valid: boolean | null; validity_reason: string | null; area_calculated_ha: string | null;
  };
}
interface Sample { operation_id: string; latitude: number; longitude: number; accuracy_m: number | null; captured_at: string }

type Capture =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'failed'; message: string }
  | { kind: 'review'; sample: Sample }
  | { kind: 'saving'; sample: Sample }
  | { kind: 'uncertain'; sample: Sample; error: ApiError }
  | { kind: 'conflict'; sample: Sample }
  | { kind: 'rejected'; sample: Sample; error: ApiError };

const ISSUE: Record<string, string> = {
  LESS_THAN_3_DISTINCT_VERTICES: 'Se necesitan al menos 3 vértices distintos.',
};

export function PolygonCapture({ orgId, plotId, plotVersion, onConfirmed }: {
  orgId: string; plotId: string; plotVersion: number; onConfirmed: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  const [capture, setCapture] = useState<Capture>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [keepInvalid, setKeepInvalid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelled = useRef(false);
  const base = `/api/v1/organizations/${orgId}`;

  const reload = useCallback(async () => {
    try {
      const r = await api<{ draft: Draft | null }>(`${base}/plots/${plotId}/polygon-drafts/current`);
      setDraft(r.draft);
      setError(null);
    } catch (e) { setError(e as ApiError); }
  }, [base, plotId]);
  useEffect(() => { void reload(); return () => { cancelled.current = true; }; }, [reload]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); } catch (e) {
      const err = e as ApiError;
      setError(err);
      if (err.status === 409) await reload();
    } finally { setBusy(false); }
  }

  const start = () => run(async () => { setDraft(await api<Draft>(`${base}/plots/${plotId}/polygon-drafts`, { method: 'POST' })); });

  function locate() {
    if (!(typeof window !== 'undefined' && 'geolocation' in navigator && window.isSecureContext)) {
      setCapture({ kind: 'failed', message: 'Este navegador o esta conexión no permiten obtener la ubicación (usa https o localhost).' });
      return;
    }
    cancelled.current = false;
    setCapture({ kind: 'requesting' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled.current) return;
        const acc = pos.coords.accuracy;
        setCapture({ kind: 'review', sample: {
          operation_id: crypto.randomUUID(), latitude: pos.coords.latitude, longitude: pos.coords.longitude,
          accuracy_m: typeof acc === 'number' && Number.isFinite(acc) && acc >= 0 ? acc : null,
          captured_at: new Date(pos.timestamp).toISOString(),
        } });
      },
      (err) => {
        if (cancelled.current) return;
        setCapture({ kind: 'failed', message: err.code === err.PERMISSION_DENIED
          ? 'El navegador no tiene permiso para usar tu ubicación. Habilítalo en la configuración del sitio y vuelve a intentarlo.'
          : err.code === err.TIMEOUT ? 'La ubicación tardó demasiado en llegar. Vuelve a intentarlo.' : 'No se pudo determinar la ubicación. Activa los servicios de ubicación y vuelve a intentarlo.' });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  async function saveVertex(sample: Sample) {
    if (!draft) return;
    setCapture({ kind: 'saving', sample });
    try {
      const r = await api<{ draft: Draft; replayed: boolean }>(`${base}/polygon-drafts/${draft.id}/vertices`, {
        method: 'POST', body: { expected_version: draft.row_version, source: 'BROWSER_GEOLOCATION', ...sample },
      });
      setDraft(r.draft);
      setCapture({ kind: 'idle' });
      setNotice(r.replayed ? 'El servidor ya tenía este vértice; no se duplicó.' : `Vértice ${r.draft.preview.vertex_count} guardado.`);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.body.code === 'VERSION_CONFLICT') setCapture({ kind: 'conflict', sample });
      else if (err.status === 0 || err.status >= 500) setCapture({ kind: 'uncertain', sample, error: err });
      else setCapture({ kind: 'rejected', sample, error: err });
    }
  }

  const undo = () => run(async () => { if (draft) setDraft(await api<Draft>(`${base}/polygon-drafts/${draft.id}/undo`, { method: 'POST', body: { expected_version: draft.row_version } })); });
  const cancelDraft = () => run(async () => {
    if (!draft || !window.confirm('¿Cancelar el borrador? Los vértices capturados se conservan en el historial, pero no se creará ninguna versión.')) return;
    await api(`${base}/polygon-drafts/${draft.id}/cancel`, { method: 'POST', body: { expected_version: draft.row_version } });
    setDraft(null); setReviewing(false); setCapture({ kind: 'idle' });
  });
  const confirm = () => run(async () => {
    if (!draft) return;
    const r = await api<{ version: { version_number: number } }>(`${base}/polygon-drafts/${draft.id}/confirm`, {
      method: 'POST', body: { expected_version: draft.row_version, plot_expected_version: plotVersion, keep_invalid_for_review: keepInvalid },
    });
    setDraft(null); setReviewing(false); setKeepInvalid(false);
    setNotice(`Polígono guardado como versión ${r.version.version_number}. Sigue sin validación GIS (P0-010).`);
    await onConfirmed();
  });

  if (draft === undefined) return error ? <ErrorPanel error={error} /> : <p className="muted">Cargando borrador de polígono…</p>;

  const included = draft?.vertices.filter((v) => !v.excluded) ?? [];
  const sketch = included.length >= 2
    ? { type: 'Polygon', coordinates: [[...included.map((v) => [v.longitude, v.latitude]), [included[0].longitude, included[0].latitude]]] }
    : included.length === 1 ? { type: 'Point', coordinates: [included[0].longitude, included[0].latitude] } : null;
  const pv = draft?.preview;

  return (
    <div className="capture polygon-capture" aria-live="polite">
      <h3>Capturar polígono</h3>
      <p className="field-help">Recorre el borde de la parcela y guarda un vértice en cada esquina. El borrador se guarda en el servidor: si recargas la página, lo recuperas. No funciona sin conexión.</p>
      {notice && <p className="alert valid" role="status">{notice}</p>}
      {error && <ErrorPanel error={error} />}
      {error?.status === 409 && <p className="muted">El borrador cambió en otra pestaña o dispositivo; se recargó la versión actual.</p>}

      {!draft ? (
        <button type="button" onClick={start} disabled={busy}>Iniciar captura de polígono</button>
      ) : (
        <>
          <div className="actions">
            <StatusBadge tone="process">Borrador abierto</StatusBadge>
            <span className="muted">{included.length} vértice{included.length === 1 ? '' : 's'} · versión {draft.row_version}</span>
          </div>

          {capture.kind === 'idle' && !reviewing && (
            <div className="actions">
              <button type="button" onClick={locate} disabled={busy}>Añadir vértice</button>
              <button type="button" className="secondary" onClick={undo} disabled={busy || included.length === 0}>Deshacer último</button>
              <button type="button" className="secondary" onClick={() => setReviewing(true)} disabled={busy || included.length === 0}>Revisar y confirmar</button>
              <button type="button" className="secondary" onClick={cancelDraft} disabled={busy}>Cancelar borrador</button>
            </div>
          )}
          {capture.kind === 'requesting' && (
            <div className="actions">
              <p className="muted" role="status">Obteniendo ubicación… Si el navegador lo pregunta, permite el acceso.</p>
              <button type="button" className="secondary" onClick={() => { cancelled.current = true; setCapture({ kind: 'idle' }); }}>Cancelar</button>
            </div>
          )}
          {capture.kind === 'failed' && (
            <div className="error" role="alert">
              <p>{capture.message}</p>
              <div className="actions">
                <button type="button" onClick={locate}>Intentar de nuevo</button>
                <button type="button" className="secondary" onClick={() => setCapture({ kind: 'idle' })}>Cerrar</button>
              </div>
            </div>
          )}
          {(capture.kind === 'review' || capture.kind === 'saving' || capture.kind === 'uncertain' || capture.kind === 'conflict' || capture.kind === 'rejected') && (
            <div className="card capture-review">
              <p className="alert-title">Vértice {included.length + 1}: revisa la muestra</p>
              <dl className="props" aria-label="Muestra del vértice">
                <dt>Latitud</dt><dd>{capture.sample.latitude}</dd>
                <dt>Longitud</dt><dd>{capture.sample.longitude}</dd>
                <dt>Precisión horizontal</dt><dd>{accuracyLabel(capture.sample.accuracy_m)}</dd>
                <dt>Hora de adquisición</dt><dd>{new Date(capture.sample.captured_at).toLocaleString('es-EC')}</dd>
                <dt>Fuente</dt><dd>Ubicación del navegador (no acredita un GPS)</dd>
              </dl>
              {capture.kind === 'uncertain' && (
                <div className="error" role="alert">
                  <p className="alert-title">No pudimos confirmar el guardado</p>
                  <p>La muestra se conserva. «Reintentar» no duplica el vértice: el servidor reconoce este envío.</p>
                </div>
              )}
              {capture.kind === 'conflict' && (
                <div className="error" role="alert">
                  <p className="alert-title">El borrador cambió en otra pestaña o dispositivo.</p>
                  <p>La muestra se conserva. Recarga el borrador, revisa los vértices y vuelve a guardarla.</p>
                </div>
              )}
              {capture.kind === 'rejected' && <ErrorPanel error={capture.error} />}
              <div className="actions">
                {capture.kind === 'conflict' ? (
                  <button type="button" onClick={async () => { await reload(); setCapture({ kind: 'review', sample: capture.sample }); }}>Recargar borrador</button>
                ) : capture.kind !== 'rejected' && (
                  <button type="button" onClick={() => saveVertex(capture.sample)} disabled={capture.kind === 'saving'} aria-busy={capture.kind === 'saving'}>
                    {capture.kind === 'saving' ? 'Guardando…' : capture.kind === 'uncertain' ? 'Reintentar guardado' : 'Guardar vértice'}
                  </button>
                )}
                <button type="button" className="secondary" onClick={() => setCapture({ kind: 'idle' })} disabled={capture.kind === 'saving'}>Descartar muestra</button>
              </div>
            </div>
          )}

          <p><strong>Precisión:</strong> {draft.accuracy_summary.label}</p>
          <div className="grid-2">
            {sketch ? <GeometrySketch geometry={sketch} label={`Vista previa del borrador con ${included.length} vértices`} /> : <p className="muted">Aún no hay vértices.</p>}
            <div className="table-wrap">
              <table aria-label="Vértices del borrador">
                <thead><tr><th scope="col">#</th><th scope="col">Latitud</th><th scope="col">Longitud</th><th scope="col">Precisión</th><th scope="col">Adquirido</th></tr></thead>
                <tbody>
                  {draft.vertices.map((v) => (
                    <tr key={v.id} className={v.excluded ? 'muted' : undefined}>
                      <td>{v.excluded ? <s>{v.acquisition_seq}</s> : v.acquisition_seq}{v.excluded && <span className="sr-only"> (deshecho)</span>}</td>
                      <td>{v.latitude}</td><td>{v.longitude}</td>
                      <td>{accuracyLabel(v.horizontal_accuracy_m)}</td>
                      <td>{new Date(v.captured_at).toLocaleTimeString('es-EC')}{v.excluded && ' · deshecho'}</td>
                    </tr>
                  ))}
                  {included.length >= 3 && <tr><td colSpan={5} className="muted">Cierre: vuelve al vértice {included[0].acquisition_seq} (no es una muestra nueva).</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {reviewing && pv && (
            <section className="card" aria-labelledby="poly-review">
              <h4 id="poly-review">Revisión antes de confirmar</h4>
              <dl className="props">
                <dt>Vértices</dt><dd>{pv.vertex_count} ({pv.distinct_count} distintos{pv.repeated_vertices ? `; ${pv.repeated_vertices} repetido(s) consecutivo(s)` : ''})</dd>
                <dt>Estructura almacenable</dt><dd>{pv.storable ? 'Sí' : `No: ${pv.structural_issues.map((i) => ISSUE[i] ?? i).join(' ')}`}</dd>
                <dt>Validez técnica</dt><dd>{pv.technically_valid === null ? 'No evaluada' : pv.technically_valid ? 'Válida' : `No válida: ${pv.validity_reason}`}</dd>
                <dt>Superficie calculada</dt><dd>{pv.area_calculated_ha ? `${Number(pv.area_calculated_ha).toLocaleString('es-EC', { maximumFractionDigits: 4 })} ha` : 'No calculada'}</dd>
                <dt>Precisión</dt><dd>{draft.accuracy_summary.label}</dd>
                <dt>Validación GIS</dt><dd>Pendiente (P0-010). Confirmar no valida la parcela.</dd>
              </dl>
              {pv.technically_valid === false && (
                <div className="alert" role="alert">
                  <p className="alert-title">La forma se cruza consigo misma o no es válida.</p>
                  <p>Corrige con «Deshacer último» y vuelve a capturar. Si necesitas conservarla tal cual para que alguien la revise, márcalo: se guardará sin superficie y nunca como válida.</p>
                  <label><input type="checkbox" checked={keepInvalid} onChange={(e) => setKeepInvalid(e.target.checked)} /> Conservar para revisión, sin superficie</label>
                </div>
              )}
              <div className="actions">
                <button type="button" onClick={confirm} disabled={busy || !pv.storable || (pv.technically_valid === false && !keepInvalid)} aria-busy={busy}>
                  {busy ? 'Confirmando…' : 'Confirmar polígono'}
                </button>
                <button type="button" className="secondary" onClick={() => setReviewing(false)} disabled={busy}>Seguir capturando</button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
