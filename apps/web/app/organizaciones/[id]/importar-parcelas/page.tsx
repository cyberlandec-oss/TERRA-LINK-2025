'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api, apiDownload, apiUpload } from '../../../../lib/api';
import { useWorkspace } from '../../../../lib/workspace';
import { Alert, Breadcrumb, ErrorPanel, PageHeader, StatusBadge } from '../../../../lib/ui';
import { positions, type PlotVersion } from '../../../../lib/plots';

const Map = dynamic(() => import('../../../../lib/plot-import-map').then(m => m.PlotImportMap), { ssr: false });
interface Batch { id: string; filename: string; sha256: string; status: string; metadata: { format: string; selected_layer: string | null; layers: Array<{ name: string; crs: string | null; columns: string[]; feature_count: number }> } }
interface Row { plot_code: string; producer_code: string; action: string; geometry: PlotVersion['geometry']; previous_geometry: PlotVersion['geometry']; geometry_changed: boolean; plot_id: string | null; area_calculated_ha: string | null; errors: string[]; warnings: string[]; row_numbers: number[] }
interface Preview { plan_hash: string; can_commit: boolean; source_crs: string | null; target_crs: string; rows: Row[]; summary: { total: number; create: number; update: number; unchanged: number; error: number } }
const FIELDS = [['plot_code', 'Código de parcela'], ['producer_code', 'Código de productor'], ['crop', 'Cultivo'], ['x', 'X / longitud / este'], ['y', 'Y / latitud / norte'], ['geometry', 'Geometría WKT o GeoJSON'], ['order', 'Orden del vértice'], ['part', 'Parte del multipolígono'], ['ring', 'Anillo (exterior primero)']] as const;
const ERRORS: Record<string, string> = {
  POSSIBLE_OVERLAP_REVIEW_REQUIRED: 'Posible solape con un perímetro existente visible en tu alcance. Requiere revisión; no demuestra un conflicto de titularidad.',
  PLOT_CODE_REQUIRED_OR_INVALID: 'Falta un código de parcela válido.', PLOT_CODE_DUPLICATED: 'Código de parcela repetido. Para vértices, elige la modalidad correspondiente.',
  CROP_REQUIRED_OR_INVALID: 'Indica el cultivo en la columna o en el valor común.', PRODUCER_NOT_AVAILABLE: 'El productor no está disponible en tu alcance. Revisa su código o tu vínculo de cuenta.',
  PLOT_NOT_AVAILABLE: 'La parcela no está disponible para este productor y tu alcance.', GEOMETRY_REQUIRED: 'No se pudo obtener una geometría. Revisa la modalidad y las columnas.',
  CRS_CONFIRMATION_REQUIRED: 'Confirma el CRS de origen antes de convertir las coordenadas.', GEOMETRY_TYPE_NOT_SUPPORTED: 'Las líneas y otros tipos no se convierten automáticamente en perímetros.',
  GEOMETRY_STRUCTURE_INVALID: 'La geometría necesita corrección; revisa cierre de anillos, coordenadas y dimensiones.', VERTEX_ORDER_OR_RING_INVALID: 'Revisa el orden de vértices: no puede repetirse y cada anillo necesita al menos cuatro posiciones.',
  RING_NOT_CLOSED: 'El último vértice debe coincidir con el primero.', COORDINATE_NOT_NUMERIC: 'Hay una coordenada no numérica.',
  XY_MAPPING_REQUIRED: 'Asocia las columnas X e Y.', FORMULA_NOT_ALLOWED: 'Las fórmulas no se admiten; exporta valores.', REFERENCE_POINT_PERIMETER_PENDING: 'Punto de referencia · Perímetro pendiente',
  KML_ALTITUDE_OMITTED_FOR_2D_PREVIEW: 'La altitud KML no se guardará: la vista previa muestra la geometría 2D.', EXISTING_GEOMETRY_REVIEW_REQUIRED: 'Se creará una versión nueva; la geometría anterior se conserva.',
};
const label = (code: string) => ERRORS[code] ?? code;
const ACTION: Record<string, string> = { CREATE: 'Se creará', UPDATE: 'Se actualizará', UNCHANGED: 'Sin cambios', ERROR: 'Por corregir' };

export default function PlotImportsPage() {
  const { id: org } = useParams<{ id: string }>();
  const ws = useWorkspace();
  const base = `/api/v1/organizations/${org}/plot-imports`;
  const allowed = ws.can('plot:read_geometry') && ['plot:create', 'plot:create_assigned', 'plot:create_own', 'plot:update', 'plot:update_assigned', 'plot:update_own'].some(p => ws.can(p));
  const own = ws.can('plot:create_own') && !ws.can('plot:create') && !ws.can('plot:create_assigned');
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [layer, setLayer] = useState('');
  const [crs, setCrs] = useState('');
  const [mode, setMode] = useState('GEOMETRY');
  const [delimiter, setDelimiter] = useState('');
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [crop, setCrop] = useState('');
  const [producer, setProducer] = useState('');
  const [singleCode, setSingleCode] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState(0);
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<{ create: number; update: number; unchanged: number; plots: Array<{ id: string; plot_code: string }> } | null>(null);
  const confirmOperation = useRef<string | null>(null);
  const invalidate = () => { setPreview(null); setAck(false); setResult(null); confirmOperation.current = null; };
  const currentLayer = batch?.metadata.layers.find(l => l.name === layer);
  const upload = async (event: FormEvent) => {
    event.preventDefault(); if (!file) return;
    setBusy(true); setError(null); invalidate();
    try {
      const form = new FormData(); form.append('file', file); form.append('operation_id', crypto.randomUUID());
      const b = (await apiUpload<Batch>(base, form)).data;
      setBatch(b); setLayer(b.metadata.selected_layer ?? ''); setColumns({});
      const initial = b.metadata.layers.find(l => l.name === b.metadata.selected_layer);
      setCrs(initial?.crs?.match(/^EPSG:\d+$/) ? initial.crs : '');
      if (initial) suggest(initial.columns);
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  };
  function suggest(headers: string[]) {
    const aliases: Record<string, string[]> = { plot_code: ['codigo_parcela','plot_code'], producer_code: ['codigo_productor','producer_code'], crop: ['cultivo','crop'], x: ['longitud','longitude','x'], y: ['latitud','latitude','y'], geometry: ['geometria','geometry','wkt'], order: ['orden_vertice','orden','order'], part: ['parte','part'], ring: ['anillo','ring'] };
    const mapping: Record<string, string> = {};
    for (const [key, names] of Object.entries(aliases)) { const found = headers.find(h => names.includes(h.toLowerCase())); if (found) mapping[key] = found; }
    setColumns(mapping);
    setMode(mapping.order ? 'VERTICES' : mapping.x && mapping.y ? 'POINT' : 'GEOMETRY');
  }
  async function review(event: FormEvent) {
    event.preventDefault(); if (!batch) return;
    setBusy(true); setError(null); invalidate();
    try {
      const options = { layer, mode, columns: Object.fromEntries(Object.entries(columns).filter(([, v]) => v)), ...(crs.trim() ? { source_crs: crs.trim() } : {}), ...(delimiter ? { delimiter } : {}) };
      setPreview(await api<Preview>(`${base}/${batch.id}/preview`, { method: 'POST', body: { options, default_crop: crop, default_producer_code: producer, default_plot_code: singleCode } })); setSelected(0);
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!batch || !preview) return;
    setBusy(true); setError(null);
    confirmOperation.current ??= crypto.randomUUID();
    try { const response = await api<{ result: NonNullable<typeof result> }>(`${base}/${batch.id}/confirm`, { method: 'POST', body: { operation_id: confirmOperation.current, plan_hash: preview.plan_hash, reason: reason.trim(), confirm_geometry_changes: ack } }); setResult(response.result); }
    catch (e) { const err = e as ApiError; setError(err); if (err.body?.code === 'IMPORT_PREVIEW_STALE') setPreview(null); }
    finally { setBusy(false); }
  }
  if (!allowed) return <Alert tone="review" title="Sin permiso para importar parcelas"><p>Necesitas permiso de alta o edición de parcelas y acceso a coordenadas en esta organización.</p></Alert>;
  const row = preview?.rows[selected];
  const changes = preview?.rows.some(r => r.plot_id && r.geometry_changed) ?? false;
  return <>
    <Breadcrumb items={[{ label: ws.activeOrg?.name ?? 'Organización', href: `/organizaciones/${org}` }, { label: 'Importar parcelas' }]} />
    <PageHeader title="Importar parcelas" meta="Carga, identifica y revisa. Las parcelas se guardan únicamente al confirmar." />
    {error && <ErrorPanel error={error} />}
    <section className="card" aria-labelledby="file-title"><h2 id="file-title">1. Seleccionar archivo</h2>
      <p>GeoJSON, GeoPackage, Shapefile ZIP, KML/KMZ, CSV o Excel (.xlsx). Hasta 20 MB y 5.000 filas por capa. Para QGIS recomendamos GeoPackage; exporta la capa, no el proyecto.</p>
      <form onSubmit={upload}><label htmlFor="plot-file">Archivo de parcelas</label><input id="plot-file" type="file" required accept=".geojson,.json,.gpkg,.zip,.kml,.kmz,.csv,.xlsx" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setBatch(null); invalidate(); }} />
        <button type="submit" disabled={!file || busy}>{busy ? 'Procesando…' : 'Identificar archivo'}</button></form>
      {batch && <p>Original conservado: {batch.filename} · Formato: {batch.metadata.format}<br /><span style={{ overflowWrap: 'anywhere' }}>SHA-256: {batch.sha256}</span></p>}
    </section>
    {batch && !result && <section className="card" aria-labelledby="mapping-title"><h2 id="mapping-title">2. Elegir capa, columnas y coordenadas</h2>
      {own && <Alert tone="info" title="Importación para tu propia ficha"><p>El servidor vincula las parcelas al productor asociado a tu cuenta; no necesitas elegir otro productor.</p></Alert>}
      <form onSubmit={review} className="form-grid">
        <div><label htmlFor="plot-layer">Capa o pestaña</label><select id="plot-layer" required value={layer} disabled={busy} onChange={e => { const name = e.target.value; setLayer(name); const l = batch.metadata.layers.find(v => v.name === name); setCrs(l?.crs?.match(/^EPSG:\d+$/) ? l.crs : ''); suggest(l?.columns ?? []); invalidate(); }}><option value="">Selecciona una capa</option>{batch.metadata.layers.map(l => <option key={l.name} value={l.name}>{l.name} · {l.feature_count} elementos</option>)}</select></div>
        <div><label htmlFor="plot-mode">Estructura de los datos</label><select id="plot-mode" value={mode} disabled={busy} onChange={e => { setMode(e.target.value); invalidate(); }}><option value="GEOMETRY">Geometría por elemento o fila (WKT/GeoJSON)</option><option value="POINT">Punto por fila (X e Y)</option><option value="VERTICES">Vértices agrupados por parcela</option></select></div>
        <div><label htmlFor="plot-crs">CRS de origen (código EPSG)</label><input id="plot-crs" placeholder="EPSG:4326 o EPSG:32717" value={crs} disabled={busy} onChange={e => { setCrs(e.target.value); invalidate(); }} /><p className="muted">Declarado por el archivo: {currentLayer?.crs ?? 'No informado'}. Si falta, confírmalo. UTM requiere datum, zona y hemisferio correctos. Destino: WGS84, longitud/latitud.</p></div>
        {batch.metadata.format === 'CSV' && <div><label htmlFor="plot-delimiter">Separador CSV</label><select id="plot-delimiter" value={delimiter} onChange={e => { setDelimiter(e.target.value); invalidate(); }}><option value="">Detectar</option><option value=";">Punto y coma</option><option value=",">Coma</option><option value={'\t'}>Tabulador</option><option value="|">Barra vertical</option></select></div>}
        {FIELDS.filter(([key]) => !(own && key === 'producer_code')).map(([key, title]) => <div key={key}><label htmlFor={`map-${key}`}>{title}</label><select id={`map-${key}`} value={columns[key] ?? ''} disabled={busy} onChange={e => { setColumns({ ...columns, [key]: e.target.value }); invalidate(); }}><option value="">Sin asociar</option>{currentLayer?.columns.map(h => <option key={h} value={h}>{h}</option>)}</select></div>)}
        {!own && <div><label htmlFor="plot-producer">Código de productor común si no hay columna</label><input id="plot-producer" value={producer} maxLength={40} disabled={busy} onChange={e => { setProducer(e.target.value); invalidate(); }} /><p className="muted">Solo si todas estas parcelas pertenecen al mismo productor. Se comprobará su código exacto.</p></div>}
        <div><label htmlFor="plot-single-code">Código para una única parcela sin columna</label><input id="plot-single-code" value={singleCode} maxLength={40} disabled={busy} onChange={e => { setSingleCode(e.target.value); invalidate(); }} /><p className="muted">Se usa únicamente si el archivo contiene una sola parcela. Para varias, asocia una columna de códigos.</p></div>
        <div><label htmlFor="plot-crop">Cultivo común si no hay columna</label><input id="plot-crop" value={crop} maxLength={60} disabled={busy} onChange={e => { setCrop(e.target.value); invalidate(); }} /></div>
        <p>Los productores se identifican por código exacto, nunca por nombre. Vértices: orden obligatorio y anillos cerrados; para huecos y partes usa identificadores explícitos. Las líneas no se convierten automáticamente en perímetros.</p>
        <button type="submit" disabled={busy || !layer}>Convertir y revisar</button>
      </form></section>}
    {preview && !result && <section className="card" aria-labelledby="preview-title"><h2 id="preview-title">3. Revisar antes de guardar</h2><p>CRS de origen: {preview.source_crs ?? 'Pendiente de confirmar'} → {preview.target_crs}. {preview.summary.create} nuevas · {preview.summary.update} actualizaciones · {preview.summary.unchanged} sin cambios · {preview.summary.error} por corregir.</p>
      <div className="table-wrap"><table aria-label="Parcelas de la importación"><thead><tr><th>Parcela</th><th>Productor</th><th>Estado</th><th>Superficie calculada</th><th>Revisión</th></tr></thead><tbody>{preview.rows.map((r,i) => <tr key={i}><td>{r.plot_code || 'Sin código'}</td><td>{r.producer_code || 'Sin vínculo'}</td><td><StatusBadge tone={r.action === 'ERROR' ? 'blocked' : r.action === 'UNCHANGED' ? 'neutral' : 'review'}>{ACTION[r.action]}</StatusBadge></td><td>{r.area_calculated_ha ? `${r.area_calculated_ha} ha` : 'No calculada'}</td><td><button className="secondary" type="button" onClick={() => setSelected(i)}>Revisar fila {r.row_numbers[0]}</button></td></tr>)}</tbody></table></div>
      {row && <div aria-live="polite"><h3>Revisión de {row.plot_code || 'parcela sin código'}</h3><p>Filas de origen: {row.row_numbers.join(', ')}</p>{row.errors.map((e,i) => <p key={`e${i}`} role="status">Por corregir: {label(e)}</p>)}{row.warnings.map((w,i) => <p key={`w${i}`}>{label(w)}</p>)}
        {row.geometry && <><Map geometry={row.geometry} previous={row.previous_geometry} /><details><summary>Ver coordenadas normalizadas</summary><div className="table-wrap"><table aria-label="Coordenadas normalizadas"><thead><tr><th>Anillo</th><th>Longitud (X)</th><th>Latitud (Y)</th></tr></thead><tbody>{positions(row.geometry).map((p,i) => <tr key={i}><td>{p.ring}</td><td>{p.lon}</td><td>{p.lat}</td></tr>)}</tbody></table></div></details></>}
      </div>}
      {!preview.can_commit && <p role="status">No se guardará ninguna parcela mientras existan errores. Corrige las opciones o el archivo y vuelve a revisar.</p>}
      <label htmlFor="plot-import-reason">Motivo de la importación o corrección</label><input id="plot-import-reason" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} />
      {changes && <label className="checkbox-row"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />He revisado los cambios de geometrías existentes y confirmo crear nuevas versiones.</label>}
      <p>Confirmación atómica: todo el lote o nada. Repetir los mismos códigos y geometrías no duplica parcelas. Importar no valida titularidad, precisión de medición ni cumplimiento EUDR.</p>
      <button type="button" disabled={busy || !preview.can_commit || reason.trim().length < 3 || (changes && !ack)} onClick={() => void confirm()}>Confirmar importación</button>
    </section>}
    {result && <section className="card" role="status"><h2>Importación guardada</h2><p>{result.create} parcelas creadas · {result.update} actualizadas · {result.unchanged} sin cambios.</p><ul>{result.plots.map(p => <li key={p.id}><Link href={`/organizaciones/${org}/parcelas/${p.id}`}>{p.plot_code}</Link></li>)}</ul></section>}
    {batch && <button type="button" className="secondary" onClick={() => void apiDownload(`${base}/${batch.id}/original`, batch.filename).catch(e => setError(e as ApiError))}>Descargar archivo original</button>}
  </>;
}
