import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore, type DatasetPlot } from '../store';
import { accountKey, captureGate, OFFLINE_CAPTURE_WINDOW_HOURS, type StoredSession } from '../session';
import { isStorageFull } from '../ports';
import { nodePlatform } from './node-platform';

// Evidencia en Node (motor SQLite real + archivos reales). NO es evidencia de emulador ni de dispositivo Android.
const PLOT: DatasetPlot = { id: '00000000-0000-4000-8000-000000000001', plot_code: 'P-SINT-1', name: null, row_version: 3, status: 'ACTIVE', producer_id: '00000000-0000-4000-8000-0000000000a1', producer_code: 'PR-SINT', producer_display_name: 'Productor sintético', geometry_status: 'NONE' };
const SAMPLE = { latitude: -0.8479, longitude: -80.1601, accuracy_m: null, acquired_at: '2026-10-10T15:00:00.000Z', provider_detail: 'expo-location; proveedor del sistema (no garantiza GPS); gpsAvailable=desconocido', mocked: null };

function setup(opts: Parameters<typeof nodePlatform>[1] = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tl-mobile-'));
  const photo = join(root, 'camera-cache.jpg');
  writeFileSync(photo, Buffer.from('\xff\xd8\xff\xe0 foto sintética de prueba \xff\xd9', 'binary'));
  return { root, photo, p: nodePlatform(root, opts) };
}

describe('P0-023 almacén local (Node + SQLite real)', () => {
  it('encolar escribe borrador y operaciones en una transacción, con operation_id estable y dependencias', async () => {
    const { p, photo } = setup();
    const s = await LocalStore.open(p, 'acc1');
    await s.replaceDataset([PLOT]);
    const d = await s.createDraft(PLOT.id);
    await s.setNote(d, 'Visita sintética');
    await s.setLocation(d, SAMPLE);
    await s.addPhoto(d, photo, 'image/jpeg', '2026-10-10T15:01:00.000Z');
    const ops = await s.enqueue(d);
    expect(ops).toHaveLength(3);
    const [view] = await s.drafts();
    expect(view.status).toBe('QUEUED');
    expect(view.operations.map((o) => o.operation_type)).toEqual(['PLOT_FIELD_NOTE_CREATE', 'PLOT_LOCATION_SAMPLE_CREATE', 'PLOT_PHOTO_ATTACH']);
    expect(view.operations[1].depends_on).toEqual([ops[0]]);
    expect(view.operations[2].depends_on).toEqual([ops[1]]);
    expect(view.operations[2].attachment_refs).toEqual([view.photos[0].id]);
    expect(view.operations.every((o) => o.state === 'PENDING')).toBe(true);
    // inmutable una vez encolada; encolar dos veces no duplica
    await expect(s.setNote(d, 'cambio')).rejects.toThrow(/ya está en cola/);
    await expect(s.enqueue(d)).rejects.toThrow(/ya está en cola/);
    expect((await s.counts()).pending_ops).toBe(3);
    await s.close();
  });

  it('si falla cualquier escritura dentro de la transacción, no queda borrador encolado ni operaciones parciales', async () => {
    const { p } = setup();
    const s = await LocalStore.open(p, 'acc1');
    await s.replaceDataset([PLOT]);
    const d = await s.createDraft(PLOT.id);
    await s.setLocation(d, SAMPLE);
    const real = p.uuid;
    p.uuid = () => 'duplicado'; // la 2.ª operación choca con la clave primaria de la 1.ª
    await expect(s.enqueue(d)).rejects.toThrow();
    p.uuid = real;
    const [view] = await s.drafts();
    expect(view.status).toBe('DRAFT');
    expect(view.operations).toHaveLength(0);
    await s.close();
  });

  it('muestra de ubicación: hora de adquisición, precisión NULL conservada y procedencia sin atribuir GPS', async () => {
    const { p } = setup();
    const s = await LocalStore.open(p, 'acc1');
    await s.replaceDataset([PLOT]);
    const d = await s.createDraft(PLOT.id);
    await s.setLocation(d, SAMPLE);
    const [view] = await s.drafts();
    expect(view.location).toMatchObject({ accuracy_m: null, acquired_at: SAMPLE.acquired_at, source: 'DEVICE_LOCATION_SERVICE', mocked: null });
    expect(view.location!.provider_detail).toMatch(/no garantiza GPS/);
    expect(view.location!.recorded_at).not.toBe(SAMPLE.acquired_at);
    await expect(s.setLocation(d, { ...SAMPLE, accuracy_m: -1 })).rejects.toThrow(/Precisión/);
    await s.close();
  });

  it('reabrir conserva borradores, cola y fotos; una operación interrumpida conserva su identidad y vuelve a PENDING', async () => {
    const { p, photo, root } = setup();
    let s = await LocalStore.open(p, 'acc1');
    await s.replaceDataset([PLOT]);
    const d1 = await s.createDraft(PLOT.id);
    await s.addPhoto(d1, photo, 'image/jpeg', null);
    await s.setNote(d1, 'Borrador sin encolar');
    const d2 = await s.createDraft(PLOT.id);
    await s.setLocation(d2, SAMPLE);
    const ops = await s.enqueue(d2);
    await s.markUploadingForTest(ops[0]);
    await s.close(); // «cierre» de la app
    s = await LocalStore.open(nodePlatform(root), 'acc1'); // nueva instancia, mismos archivos
    const report = await s.recover();
    expect(report.recovered_operations).toEqual([ops[0]]);
    const views = await s.drafts();
    expect(views).toHaveLength(2);
    const draft = views.find((v) => v.id === d1)!;
    expect(draft).toMatchObject({ status: 'DRAFT', note: 'Borrador sin encolar' });
    expect(draft.photos[0].file_present).toBe(true);
    const queued = views.find((v) => v.id === d2)!;
    expect(queued.operations[0]).toMatchObject({ operation_id: ops[0], state: 'PENDING', recovered_count: 1 });
    await s.close();
  });

  it('las fotos se guardan fuera de la caché temporal, con SHA-256 y tamaño; borrar la caché no las pierde', async () => {
    const { p, photo } = setup();
    const s = await LocalStore.open(p, 'acc1');
    await s.replaceDataset([PLOT]);
    const d = await s.createDraft(PLOT.id);
    await s.addPhoto(d, photo, 'image/jpeg', null);
    require('node:fs').rmSync(photo); // el sistema vacía la caché de la cámara
    const [view] = await s.drafts();
    expect(view.photos[0].path).toMatch(/^accounts\/acc1\/attachments\//);
    expect(view.photos[0].file_present).toBe(true);
    expect(view.photos[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    await s.close();
  });

  it('almacenamiento lleno y escritura interrumpida: error explicado, borrador conservado, sin registro roto', async () => {
    let fail = true;
    const { p, photo, root } = setup({ failWriteWith: () => (fail ? Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }) : null) });
    const s = await LocalStore.open(p, 'acc1');
    await s.replaceDataset([PLOT]);
    const d = await s.createDraft(PLOT.id);
    await s.setNote(d, 'Conservar');
    const err = await s.addPhoto(d, photo, 'image/jpeg', null).catch((e) => e);
    expect(isStorageFull(err)).toBe(true);
    expect(err.message).toMatch(/borrador y las capturas anteriores se conservan/);
    fail = false;
    let [view] = await s.drafts();
    expect(view).toMatchObject({ note: 'Conservar', photos: [] });
    // poco espacio libre informado por la plataforma: se avisa antes de copiar
    const low = await LocalStore.open(nodePlatform(root, { free: () => 1024 }), 'acc1');
    expect(isStorageFull(await low.addPhoto(d, photo, 'image/jpeg', null).catch((e) => e))).toBe(true);
    await low.close();
    // escritura interrumpida: queda un temporal .part; al reabrir se informa y no aparece como foto
    require('node:fs').writeFileSync(join(root, 'files', 'accounts', 'acc1', 'incoming', 'x.jpg.part'), 'parcial');
    require('node:fs').writeFileSync(join(root, 'files', 'accounts', 'acc1', 'attachments', 'huerfana.jpg'), 'sin registro');
    const report = await s.recover();
    expect(report.incomplete_temp_files).toEqual(['x.jpg.part']);
    expect(report.orphan_files).toEqual(['huerfana.jpg']); // se informa, no se borra
    [view] = await s.drafts();
    expect(view.photos).toEqual([]);
    await s.close();
  });

  it('separación por cuenta y organización: archivos de base y adjuntos distintos; otra cuenta no ve los datos', async () => {
    const { p, photo } = setup();
    const kA = await accountKey(p.sha256, 'user-A', 'org-1');
    const kB = await accountKey(p.sha256, 'user-B', 'org-1');
    const kA2 = await accountKey(p.sha256, 'user-A', 'org-2');
    expect(new Set([kA, kB, kA2]).size).toBe(3);
    const a = await LocalStore.open(p, kA);
    await a.replaceDataset([PLOT]);
    const d = await a.createDraft(PLOT.id);
    await a.addPhoto(d, photo, 'image/jpeg', null);
    await a.close(); // «cerrar sesión»: no destruye la captura pendiente
    const b = await LocalStore.open(p, kB);
    expect(await b.drafts()).toEqual([]);
    expect(await b.plots()).toEqual([]);
    await expect(b.createDraft(PLOT.id)).rejects.toThrow(/no está en los datos descargados/);
    await b.close();
    const again = await LocalStore.open(p, kA);
    expect(await again.drafts()).toHaveLength(1); // la misma cuenta la recupera
    await again.close();
  });
});

describe('P0-023 política provisional de sesión offline', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const base: StoredSession = { user_id: 'u', email: 'tecnico@x', token_expires_at: '2026-10-10T13:00:00Z', last_online_auth_at: '2026-10-10T11:00:00Z', last_seen_at: '2026-10-10T11:30:00Z',
    organizations: [{ organization_id: 'o1', name: 'Org', status: 'ACTIVE', roles: ['FIELD_TECHNICIAN'], permissions: ['plot:update_assigned'] }] };
  it('token vigente → captura; token vencido → solo ventana local, sin renovar credenciales', () => {
    expect(captureGate(base, 'o1', now)).toMatchObject({ allowed: true, mode: 'ONLINE_TOKEN_VALID' });
    const later = new Date('2026-10-11T12:00:00Z');
    const g = captureGate(base, 'o1', later);
    expect(g).toMatchObject({ allowed: true, mode: 'OFFLINE_WINDOW' });
    expect(base.token_expires_at).toBe('2026-10-10T13:00:00Z'); // no se modificó
  });
  it(`vencida la ventana de ${OFFLINE_CAPTURE_WINDOW_HOURS} h, reloj atrasado, sin permiso u otra organización → bloqueado con motivo`, () => {
    expect(captureGate(base, 'o1', new Date('2026-10-14T12:00:00Z'))).toMatchObject({ allowed: false, reason: 'WINDOW_EXPIRED' });
    expect(captureGate(base, 'o1', new Date('2026-10-09T12:00:00Z'))).toMatchObject({ allowed: false, reason: 'CLOCK_BACKWARDS' });
    expect(captureGate({ ...base, organizations: [{ ...base.organizations[0], permissions: ['plot:read'] }] }, 'o1', now)).toMatchObject({ allowed: false, reason: 'NO_PERMISSION' });
    expect(captureGate(base, 'otra', now)).toMatchObject({ allowed: false, reason: 'NO_PERMISSION' });
    expect(captureGate(null, 'o1', now)).toMatchObject({ allowed: false, reason: 'NO_SESSION' });
  });
});
