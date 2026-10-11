import { migrate } from './schema';
import { StorageFullError, isStorageFull, type Platform, type SqlDb } from './ports';

// Almacén local de UNA cuenta + organización (P0-023). Garantías probadas en src/core/__tests__:
// - borrador y operaciones de cola se escriben en UNA transacción (o todo o nada);
// - operation_id estable generado al encolar; dependencias explícitas (depends_on) entre operaciones;
// - fotos copiadas desde la caché temporal a un directorio persistente, con SHA-256 y tamaño verificados ANTES de
//   registrarlas; una escritura interrumpida deja un temporal que la recuperación detecta (no un registro roto);
// - muestras de ubicación con hora de adquisición del proveedor, precisión informada o NULL y procedencia real
//   («servicio de ubicación del dispositivo»: no se atribuye GPS);
// - recuperación al abrir: UPLOADING → PENDING conservando la identidad; temporales e huérfanos informados, no borrados
//   en silencio. No hay envío ni sincronización (P0-024).

export interface LocationSampleInput {
  latitude: number; longitude: number; accuracy_m: number | null; acquired_at: string;
  provider_detail: string; mocked: boolean | null;
}
export interface DatasetPlot { id: string; plot_code: string; name: string | null; row_version: number; status: string; producer_id: string; producer_code: string | null; producer_display_name: string | null; geometry_status: string | null }
export interface DraftView {
  id: string; plot_id: string; plot_code: string | null; note: string; status: 'DRAFT' | 'QUEUED'; created_at: string; updated_at: string; queued_at: string | null;
  location: (LocationSampleInput & { id: string; recorded_at: string; source: string }) | null;
  photos: Array<{ id: string; path: string; sha256: string; size_bytes: number; captured_at: string | null; stored_at: string; upload_state: string; file_present: boolean }>;
  operations: Array<{ operation_id: string; operation_type: string; state: string; depends_on: string[]; attachment_refs: string[]; recovered_count: number }>;
}
export interface RecoveryReport { recovered_operations: string[]; incomplete_temp_files: string[]; orphan_files: string[]; missing_files: string[] }

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MIN_FREE_BYTES = 5 * 1024 * 1024;

export class LocalStore {
  private constructor(private readonly db: SqlDb, private readonly p: Platform, readonly key: string) {}

  static async open(p: Platform, key: string): Promise<LocalStore> {
    const db = await p.openDb(`tl-${key}.db`);
    await migrate(db);
    const s = new LocalStore(db, p, key);
    await p.files.ensureDir(s.attachmentsDir());
    await p.files.ensureDir(s.tmpDir());
    return s;
  }

  attachmentsDir() { return `accounts/${this.key}/attachments`; }
  tmpDir() { return `accounts/${this.key}/incoming`; }
  async close() { await this.db.close(); }

  private now() { return this.p.now().toISOString(); }

  // ---- Dataset autorizado (solo lo que devuelve el servidor para esta cuenta y organización) ----
  async replaceDataset(plots: DatasetPlot[]): Promise<void> {
    const at = this.now();
    await this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM dataset_plots');
      for (const x of plots) {
        await tx.run('INSERT INTO dataset_plots (id, plot_code, name, row_version, status, producer_id, producer_code, producer_display_name, geometry_status, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [x.id, x.plot_code, x.name, x.row_version, x.status, x.producer_id, x.producer_code, x.producer_display_name, x.geometry_status, at]);
      }
      await tx.run("INSERT INTO meta (key, value) VALUES ('dataset_fetched_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [at]);
    });
  }
  async plots(): Promise<DatasetPlot[]> { return this.db.all<DatasetPlot>('SELECT id, plot_code, name, row_version, status, producer_id, producer_code, producer_display_name, geometry_status FROM dataset_plots ORDER BY plot_code'); }
  async datasetFetchedAt(): Promise<string | null> { return (await this.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'dataset_fetched_at'"))?.value ?? null; }

  // ---- Borradores ----
  async createDraft(plotId: string): Promise<string> {
    const plot = await this.db.get<{ id: string }>('SELECT id FROM dataset_plots WHERE id = ?', [plotId]);
    if (!plot) throw new Error('La parcela no está en los datos descargados para esta cuenta y organización.');
    const id = this.p.uuid(); const at = this.now();
    await this.db.run("INSERT INTO drafts (id, kind, plot_id, note, status, created_at, updated_at) VALUES (?, 'PLOT_FIELD_CAPTURE', ?, '', 'DRAFT', ?, ?)", [id, plotId, at, at]);
    return id;
  }

  private async editable(tx: SqlDb, draftId: string) {
    const d = await tx.get<{ status: string }>('SELECT status FROM drafts WHERE id = ?', [draftId]);
    if (!d) throw new Error('El borrador no existe en este dispositivo para esta cuenta.');
    if (d.status !== 'DRAFT') throw new Error('La captura ya está en cola: no se modifica (las operaciones encoladas son inmutables).');
  }

  async setNote(draftId: string, note: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.editable(tx, draftId);
      await tx.run('UPDATE drafts SET note = ?, updated_at = ? WHERE id = ?', [note.slice(0, 1000), this.now(), draftId]);
    });
  }

  /** Muestra de ubicación tal como la informó el proveedor del sistema (sin promover a GPS; precisión NULL si no vino). */
  async setLocation(draftId: string, s: LocationSampleInput): Promise<void> {
    if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude) || Math.abs(s.latitude) > 90 || Math.abs(s.longitude) > 180) throw new Error('Coordenadas no válidas.');
    if (s.accuracy_m !== null && (!Number.isFinite(s.accuracy_m) || s.accuracy_m < 0)) throw new Error('Precisión no válida.');
    if (Number.isNaN(Date.parse(s.acquired_at))) throw new Error('Hora de adquisición no válida.');
    await this.db.transaction(async (tx) => {
      await this.editable(tx, draftId);
      await tx.run('DELETE FROM location_samples WHERE draft_id = ?', [draftId]);
      await tx.run("INSERT INTO location_samples (id, draft_id, latitude, longitude, accuracy_m, acquired_at, recorded_at, source, provider_detail, mocked) VALUES (?,?,?,?,?,?,?, 'DEVICE_LOCATION_SERVICE', ?, ?)",
        [this.p.uuid(), draftId, s.latitude, s.longitude, s.accuracy_m, s.acquired_at, this.now(), s.provider_detail, s.mocked === null ? null : s.mocked ? 1 : 0]);
      await tx.run('UPDATE drafts SET updated_at = ? WHERE id = ?', [this.now(), draftId]);
    });
  }

  /**
   * Foto: copia desde la caché temporal a `incoming/` (persistente), verifica tamaño y SHA-256, la mueve a `attachments/`
   * y solo entonces la registra. Si falla el registro, el archivo queda como huérfano recuperable (no se pierde la foto).
   */
  async addPhoto(draftId: string, sourceUri: string, mimeType: string, capturedAt: string | null): Promise<string> {
    await this.db.transaction((tx) => this.editable(tx, draftId));
    const free = await this.p.files.freeBytes();
    if (free !== null && free < MIN_FREE_BYTES) throw new StorageFullError('Queda menos de 5 MB libres: libera espacio antes de adjuntar la foto. El borrador se conserva.');
    const id = this.p.uuid();
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const tmp = `${this.tmpDir()}/${id}.${ext}.part`;
    const final = `${this.attachmentsDir()}/${id}.${ext}`;
    try {
      await this.p.files.importFrom(sourceUri, tmp);
      const size = await this.p.files.size(tmp);
      if (size <= 0) throw new Error('La foto copiada está vacía: escritura incompleta.');
      if (size > MAX_PHOTO_BYTES) throw new Error('La foto supera 15 MB.');
      const hash = await this.p.sha256(await this.p.files.readBytes(tmp));
      await this.p.files.move(tmp, final);
      await this.db.transaction(async (tx) => {
        await this.editable(tx, draftId);
        await tx.run("INSERT INTO attachments (id, draft_id, kind, path, sha256, size_bytes, mime_type, captured_at, stored_at) VALUES (?,?, 'PHOTO', ?,?,?,?,?,?)", [id, draftId, final, hash, size, mimeType, capturedAt, this.now()]);
        await tx.run('UPDATE drafts SET updated_at = ? WHERE id = ?', [this.now(), draftId]);
      });
      return id;
    } catch (err) {
      if (await this.p.files.exists(tmp).catch(() => false)) await this.p.files.delete(tmp).catch(() => undefined);
      if (isStorageFull(err)) throw new StorageFullError('No hay espacio para guardar la foto. El borrador y las capturas anteriores se conservan.');
      throw err;
    }
  }

  /**
   * Encolar: en UNA transacción el borrador pasa a QUEUED y se crean sus operaciones con operation_id estable.
   * La muestra de ubicación es una operación; cada foto es otra que depende de ella (o del borrador si no hay muestra).
   */
  async enqueue(draftId: string): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await this.editable(tx, draftId);
      const d = (await tx.get<{ plot_id: string; note: string; created_at: string }>('SELECT plot_id, note, created_at FROM drafts WHERE id = ?', [draftId]))!;
      const plot = await tx.get<{ row_version: number }>('SELECT row_version FROM dataset_plots WHERE id = ?', [d.plot_id]);
      const loc = await tx.get<{ id: string; latitude: number; longitude: number; accuracy_m: number | null; acquired_at: string; provider_detail: string; mocked: number | null }>('SELECT * FROM location_samples WHERE draft_id = ?', [draftId]);
      const photos = await tx.all<{ id: string; sha256: string; size_bytes: number; mime_type: string; captured_at: string | null }>('SELECT id, sha256, size_bytes, mime_type, captured_at FROM attachments WHERE draft_id = ? ORDER BY stored_at, id', [draftId]);
      if (!loc && !photos.length && !d.note.trim()) throw new Error('La captura está vacía: agrega ubicación, foto o nota.');
      const at = this.now();
      let seq = ((await tx.get<{ n: number | null }>('SELECT max(seq) AS n FROM outbox'))?.n ?? 0);
      const ops: string[] = [];
      const add = async (type: string, entity: string, payload: unknown, deps: string[], refs: string[], capturedAt: string) => {
        const op = this.p.uuid();
        seq += 1;
        await tx.run("INSERT INTO outbox (operation_id, seq, draft_id, operation_type, entity_id, base_version, depends_on, captured_at, payload, attachment_refs, state, created_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'PENDING', ?)",
          [op, seq, draftId, type, entity, plot?.row_version ?? null, JSON.stringify(deps), capturedAt, JSON.stringify(payload), JSON.stringify(refs), at]);
        ops.push(op);
        return op;
      };
      const visit = await add('PLOT_FIELD_NOTE_CREATE', draftId, { plot_id: d.plot_id, note: d.note }, [], [], d.created_at);
      const locOp = loc ? await add('PLOT_LOCATION_SAMPLE_CREATE', loc.id, { plot_id: d.plot_id, latitude: loc.latitude, longitude: loc.longitude, accuracy_m: loc.accuracy_m, acquired_at: loc.acquired_at,
        source: 'DEVICE_LOCATION_SERVICE', provider_detail: loc.provider_detail, mocked: loc.mocked === null ? null : loc.mocked === 1 }, [visit], [], loc.acquired_at) : null;
      for (const ph of photos) await add('PLOT_PHOTO_ATTACH', ph.id, { plot_id: d.plot_id, sha256: ph.sha256, size_bytes: ph.size_bytes, mime_type: ph.mime_type }, [locOp ?? visit], [ph.id], ph.captured_at ?? at);
      await tx.run("UPDATE drafts SET status = 'QUEUED', queued_at = ?, updated_at = ? WHERE id = ?", [at, at, draftId]);
      return ops;
    });
  }

  /** Al abrir la app: recupera operaciones interrumpidas y reconcilia archivos con registros, sin borrar capturas. */
  async recover(): Promise<RecoveryReport> {
    const report: RecoveryReport = { recovered_operations: [], incomplete_temp_files: [], orphan_files: [], missing_files: [] };
    await this.db.transaction(async (tx) => {
      const up = await tx.all<{ operation_id: string }>("SELECT operation_id FROM outbox WHERE state = 'UPLOADING'");
      for (const o of up) {
        await tx.run("UPDATE outbox SET state = 'PENDING', recovered_count = recovered_count + 1, last_error = 'Interrumpida al cerrar la app: recuperada con la misma identidad' WHERE operation_id = ?", [o.operation_id]);
        report.recovered_operations.push(o.operation_id);
      }
    });
    for (const f of await this.p.files.list(this.tmpDir())) {
      report.incomplete_temp_files.push(f);
      await this.p.files.delete(`${this.tmpDir()}/${f}`).catch(() => undefined); // copia incompleta: la foto original no se registró
    }
    const known = new Set((await this.db.all<{ path: string }>('SELECT path FROM attachments')).map((r) => r.path));
    for (const f of await this.p.files.list(this.attachmentsDir())) if (!known.has(`${this.attachmentsDir()}/${f}`)) report.orphan_files.push(f);
    for (const pth of known) if (!(await this.p.files.exists(pth))) report.missing_files.push(pth);
    const at = this.now();
    for (const [kind, list] of Object.entries(report)) for (const item of list) await this.db.run('INSERT INTO incidents (id, kind, detail, at) VALUES (?,?,?,?)', [this.p.uuid(), kind, item, at]);
    return report;
  }

  async drafts(): Promise<DraftView[]> {
    const ds = await this.db.all<{ id: string; plot_id: string; plot_code: string | null; note: string; status: 'DRAFT' | 'QUEUED'; created_at: string; updated_at: string; queued_at: string | null }>(
      'SELECT d.id, d.plot_id, p.plot_code, d.note, d.status, d.created_at, d.updated_at, d.queued_at FROM drafts d LEFT JOIN dataset_plots p ON p.id = d.plot_id ORDER BY d.created_at DESC');
    const out: DraftView[] = [];
    for (const d of ds) {
      const loc = await this.db.get<{ id: string; latitude: number; longitude: number; accuracy_m: number | null; acquired_at: string; recorded_at: string; source: string; provider_detail: string; mocked: number | null }>('SELECT * FROM location_samples WHERE draft_id = ?', [d.id]);
      const photos = await this.db.all<{ id: string; path: string; sha256: string; size_bytes: number; captured_at: string | null; stored_at: string; upload_state: string }>('SELECT id, path, sha256, size_bytes, captured_at, stored_at, upload_state FROM attachments WHERE draft_id = ? ORDER BY stored_at', [d.id]);
      const ops = await this.db.all<{ operation_id: string; operation_type: string; state: string; depends_on: string; attachment_refs: string; recovered_count: number }>('SELECT operation_id, operation_type, state, depends_on, attachment_refs, recovered_count FROM outbox WHERE draft_id = ? ORDER BY seq', [d.id]);
      const ph = [];
      for (const x of photos) ph.push({ ...x, file_present: await this.p.files.exists(x.path) });
      out.push({ ...d, location: loc ? { ...loc, mocked: loc.mocked === null ? null : loc.mocked === 1 } : null, photos: ph,
        operations: ops.map((o) => ({ ...o, depends_on: JSON.parse(o.depends_on) as string[], attachment_refs: JSON.parse(o.attachment_refs) as string[] })) });
    }
    return out;
  }

  async counts() {
    const r = await this.db.get<{ drafts: number; queued: number; pending_ops: number; photos: number }>(
      "SELECT (SELECT count(*) FROM drafts WHERE status = 'DRAFT') AS drafts, (SELECT count(*) FROM drafts WHERE status = 'QUEUED') AS queued, (SELECT count(*) FROM outbox WHERE state IN ('PENDING','UPLOADING')) AS pending_ops, (SELECT count(*) FROM attachments) AS photos");
    return r!;
  }

  /** Solo para pruebas de recuperación: simula una transferencia interrumpida (P0-024 la implementará). */
  async markUploadingForTest(operationId: string) { await this.db.run("UPDATE outbox SET state = 'UPLOADING', attempts = attempts + 1 WHERE operation_id = ?", [operationId]); }
}
