import { createHash, randomBytes, randomUUID } from 'crypto';
import { sql } from 'kysely';
import { PASSWORD, describeDb, setupHarness } from './helpers';
import { SyncService, operationHash } from '../src/sync/sync';

// Integración P0-024 con PostgreSQL/PostGIS, S3 y ClamAV reales. Datos SINTÉTICOS.
describeDb('P0-024 sync: dispositivos, push idempotente, dependencias, conflictos, pull con cursor y adjuntos', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let org: string;
  let orgB: string;
  let producer: string;
  let plot: string;
  const http = () => h.http();
  const as = (e: string) => h.as(e);
  const base = (o: string) => `/api/v1/organizations/${o}`;
  const ADMIN = 'admin-s@test.local';
  const T1 = 'tec1@test.local';
  const T2 = 'tec2@test.local';
  const mids: Record<string, string> = {};

  async function join(o: string, email: string, role: string) {
    const inv = await http().post(`${base(o)}/invitations`).set(as(ADMIN)).send({ email, role_code: role }).expect(201);
    await http().post('/api/v1/invitations/accept').send({ token: inv.body.token, first_name: 'Persona', last_name: email.split('@')[0], password: PASSWORD }).expect(200);
    await h.login(email);
    mids[email] = (await h.db.selectFrom('memberships as m').innerJoin('users as u', 'u.id', 'm.user_id').select('m.id').where('u.email', '=', email).where('m.organization_id', '=', o).executeTakeFirstOrThrow()).id;
  }
  const device = async (email: string, client = randomUUID()) => (await http().post(`${base(org)}/devices`).set(as(email)).send({ client_device_id: client, platform: 'ANDROID', label: 'Teléfono de prueba' }).expect(201)).body.device.id as string;
  const rowVersion = async (id = plot) => Number((await http().get(`${base(org)}/plots/${id}`).set(as(ADMIN)).expect(200)).body.row_version);
  const locOp = async (o: { id?: string; base?: number; lat?: number; deps?: string[]; resolves?: string; plotId?: string } = {}) => {
    const c = { operation_type: 'PLOT_LOCATION_SAMPLE_CREATE', entity_id: randomUUID(), base_version: o.base ?? await rowVersion(o.plotId), depends_on: o.deps ?? [], captured_at: '2026-10-10T15:00:00.000Z',
      payload: { plot_id: o.plotId ?? plot, latitude: o.lat ?? -0.8479, longitude: -80.1601, accuracy_m: null, acquired_at: '2026-10-10T15:00:00.000Z', source: 'DEVICE_LOCATION_SERVICE', provider_detail: 'expo-location; proveedor del sistema (no garantiza GPS)', mocked: null,
        ...(o.resolves ? { resolves_operation_id: o.resolves } : {}) } as Record<string, unknown> };
    return { operation_id: o.id ?? randomUUID(), ...c, content_hash: operationHash(c) };
  };
  const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(200), Buffer.from([0xff, 0xd9])]);
  const photoOp = (bytes: Buffer, deps: string[] = [], plotId = plot) => {
    const sha = createHash('sha256').update(bytes).digest('hex');
    const c = { operation_type: 'PLOT_PHOTO_ATTACH', entity_id: randomUUID(), base_version: null, depends_on: deps, captured_at: '2026-10-10T15:01:00.000Z', payload: { plot_id: plotId, sha256: sha, size_bytes: bytes.length, mime_type: 'image/jpeg', caption: 'Foto sintética' } as Record<string, unknown> };
    return { operation_id: randomUUID(), ...c, content_hash: operationHash(c) };
  };
  const push = (email: string, deviceId: string, operations: unknown[]) => http().post(`${base(org)}/sync/push`).set(as(email)).send({ device_id: deviceId, operations });
  const versions = async () => (await sql<{ n: number }>`SELECT count(*)::int AS n FROM plot_versions WHERE plot_id = ${plot}`.execute(h.db)).rows[0].n;

  beforeAll(async () => {
    h = await setupHarness();
    await h.app.listen(0);
    await h.user('super@test.local', 'SUPER_ADMIN');
    await h.user(ADMIN);
    await h.user('admin-sb@test.local');
    const mk = async (n: string, admin: string) => (await http().post('/api/v1/organizations').set(as('super@test.local')).send({ name: n, organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: admin }).expect(201)).body.id;
    org = await mk('Coop Sync', ADMIN);
    orgB = await mk('Coop Sync B', 'admin-sb@test.local');
    for (const [e, r] of [[T1, 'FIELD_TECHNICIAN'], [T2, 'FIELD_TECHNICIAN'], ['aud-s@test.local', 'AUDITOR']]) await join(org, e, r);
    producer = (await http().post(`${base(org)}/producers`).set(as(ADMIN)).send({ producer_code: 'SY-1', legal_name: 'Finca Sync', assigned_membership_id: mids[T1] }).expect(201)).body.id;
    plot = (await http().post(`${base(org)}/plots`).set(as(ADMIN)).send({ producer_id: producer, plot_code: 'SY-1-P1', crop: 'Cacao' }).expect(201)).body.id;
  });
  afterAll(async () => h?.close());
  afterEach(() => jest.restoreAllMocks());

  it('dispositivos: registro ligado al usuario, el device_id no autoriza, revocación bloquea envío y recepción', async () => {
    const client = randomUUID();
    const d1 = await device(T1, client);
    expect((await http().post(`${base(org)}/devices`).set(as(T1)).send({ client_device_id: client, platform: 'ANDROID', label: 'x' }).expect(201)).body).toMatchObject({ replayed: true, device: { id: d1 } });
    await http().post(`${base(org)}/devices`).set(as('aud-s@test.local')).send({ client_device_id: randomUUID(), platform: 'ANDROID', label: 'x' }).expect(403);
    expect((await http().get(`${base(org)}/devices`).set(as(T2)).expect(200)).body).toEqual([]); // no ve dispositivos ajenos
    expect((await push(T2, d1, [await locOp()]).expect(404)).body.error.code).toBe('DEVICE_NOT_FOUND'); // usar el id de otro no autoriza
    expect((await http().get(`${base(orgB)}/sync/pull?device_id=${d1}`).set(as('admin-sb@test.local')).expect(404)).body.error.code).toBe('DEVICE_NOT_FOUND'); // otra organización
    await http().post(`${base(org)}/devices/${d1}/revoke`).set(as(T2)).send({ reason: 'No es mío' }).expect(404);
    await http().post(`${base(org)}/devices/${d1}/revoke`).set(as(ADMIN)).send({ reason: 'Teléfono extraviado' }).expect(200);
    expect((await push(T1, d1, [await locOp()]).expect(403)).body.error.code).toBe('DEVICE_REVOKED');
    expect((await http().get(`${base(org)}/sync/pull?device_id=${d1}`).set(as(T1)).expect(403)).body.error.code).toBe('DEVICE_REVOKED');
    expect((await http().post(`${base(org)}/devices`).set(as(T1)).send({ client_device_id: client, platform: 'ANDROID', label: 'x' }).expect(403)).body.error.code).toBe('DEVICE_REVOKED');
    await expect(sql`UPDATE devices SET status = 'ACTIVE', revoked_at = NULL WHERE id = ${d1}`.execute(h.db)).rejects.toThrow(/revocado no cambia/);
  });

  it('push: aceptada con procedencia nativa; mismo id+contenido idempotente (otro dispositivo incluido); otro contenido = conflicto; hash alterado; tipo no soportado; límite de lote', async () => {
    const dA = await device(T1); const dB = await device(T1);
    const before = await versions();
    const op = await locOp();
    const r1 = (await push(T1, dA, [op]).expect(200)).body.results[0];
    expect(r1).toMatchObject({ status: 'ACCEPTED', result: { source: 'DEVICE_LOCATION_SERVICE', accuracy_m: null } });
    const sample = await h.db.selectFrom('location_samples').selectAll().where('operation_id', '=', op.operation_id).executeTakeFirstOrThrow();
    expect(sample).toMatchObject({ source: 'DEVICE_LOCATION_SERVICE', horizontal_accuracy_m: null, provider_detail: expect.stringMatching(/no garantiza GPS/), device_id: dA });
    expect((await h.db.selectFrom('plot_versions').select('survey_method').where('id', '=', r1.result.plot_version_id).executeTakeFirstOrThrow()).survey_method).toBe('DEVICE_LOCATION_SERVICE');
    const r2 = (await push(T1, dB, [op]).expect(200)).body.results[0]; // reintento desde otro dispositivo
    expect(r2).toMatchObject({ status: 'DUPLICATE', replayed: true, result: { plot_version_id: r1.result.plot_version_id } });
    expect(await versions()).toBe(before + 1);
    const changed = { ...op, payload: { ...op.payload, latitude: -0.9 } };
    const r3 = (await push(T1, dA, [{ ...changed, content_hash: operationHash(changed) }]).expect(200)).body.results[0];
    expect(r3).toMatchObject({ status: 'CONFLICT', error: { code: 'OPERATION_ID_REUSED' } });
    expect((await push(T1, dA, [{ ...(await locOp()), content_hash: 'f'.repeat(64) }]).expect(200)).body.results[0]).toMatchObject({ status: 'REJECTED', error: { code: 'HASH_MISMATCH' } });
    const delivery = { operation_type: 'DELIVERY_CREATE', entity_id: randomUUID(), base_version: null, depends_on: [], captured_at: '2026-10-10T15:00:00.000Z', payload: { plot_id: plot } };
    expect((await push(T1, dA, [{ operation_id: randomUUID(), ...delivery, content_hash: operationHash(delivery) }]).expect(200)).body.results[0]).toMatchObject({ status: 'REJECTED', error: { code: 'UNSUPPORTED_OPERATION_TYPE' } });
    await push(T1, dA, Array.from({ length: 51 }, () => op)).expect(400);
    // La API pública no acepta la procedencia nativa (solo por sincronización, con dispositivo validado).
    await http().post(`${base(org)}/plots/${plot}/location-samples`).set(as(T1)).send({ expected_version: await rowVersion(), operation_id: randomUUID(), source: 'DEVICE_LOCATION_SERVICE', latitude: 0, longitude: 0, accuracy_m: null, captured_at: '2026-10-10T15:00:00.000Z' }).expect(400);
  });

  it('timeout tras el commit y envíos concurrentes: el reintento no duplica el efecto', async () => {
    const d = await device(T1);
    const before = await versions();
    const op = await locOp();
    const real = (SyncService.prototype as unknown as { store: (...a: unknown[]) => Promise<unknown> }).store;
    let first = true;
    jest.spyOn(SyncService.prototype as never, 'store' as never).mockImplementation(async function (this: unknown, ...args: unknown[]) {
      const r = await real.apply(this, args);
      if (first) { first = false; throw new Error('timeout simulado tras el commit del efecto'); }
      return r;
    } as never);
    expect((await push(T1, d, [op]).expect(200)).body.results[0].status).toBe('TRANSIENT_ERROR');
    expect(await versions()).toBe(before + 1); // el efecto quedó confirmado aunque no hubo respuesta
    jest.restoreAllMocks();
    expect((await push(T1, d, [op]).expect(200)).body.results[0].status).toBe('ACCEPTED'); // reintento: efecto idempotente
    expect(await versions()).toBe(before + 1);
    const op2 = await locOp();
    const [a, b] = await Promise.all([push(T1, d, [op2]), push(T1, await device(T1), [op2])]);
    expect([a.body.results[0].status, b.body.results[0].status].sort()).toEqual(['ACCEPTED', 'DUPLICATE']);
    expect(await versions()).toBe(before + 2);
  });

  it('dependencias y conflictos: independientes no se bloquean; dependiente de conflicto rechazada; resolución autorizada sin last-write-wins', async () => {
    const d = await device(T1);
    const ghost = randomUUID();
    const pending = photoOp(jpeg(), [ghost]);
    const independent = await locOp();
    const r = (await push(T1, d, [pending, independent]).expect(200)).body.results;
    expect(r.map((x: { status: string }) => x.status)).toEqual(['DEPENDENCY_PENDING', 'ACCEPTED']);
    expect(r[0].error.details).toEqual([ghost]);
    // versión obsoleta → conflicto con versiones a la vista; no se sobrescribe
    const stale = await locOp({ base: 1, lat: -1.1 });
    const dependent = photoOp(jpeg(), [stale.operation_id]);
    const c = (await push(T1, d, [stale, dependent]).expect(200)).body.results;
    expect(c[0]).toMatchObject({ status: 'CONFLICT', error: { code: 'VERSION_CONFLICT', details: { base_version: 1, server_row_version: await rowVersion() } } });
    expect(c[1]).toMatchObject({ status: 'REJECTED', error: { code: 'DEPENDENCY_FAILED' } });
    expect((await push(T1, d, [await locOp({ resolves: randomUUID() })]).expect(200)).body.results[0]).toMatchObject({ status: 'REJECTED', error: { code: 'RESOLVES_INVALID' } });
    const resolution = await locOp({ lat: -1.1, resolves: stale.operation_id });
    expect((await push(T1, d, [resolution]).expect(200)).body.results[0].status).toBe('ACCEPTED');
    const rows = await h.db.selectFrom('sync_operations').select(['operation_id', 'status', 'resolves_operation_id']).where('operation_id', 'in', [stale.operation_id, resolution.operation_id]).execute();
    expect(rows.find((x) => x.operation_id === stale.operation_id)!.status).toBe('CONFLICT'); // la original se conserva
    expect(rows.find((x) => x.operation_id === resolution.operation_id)!.resolves_operation_id).toBe(stale.operation_id);
    await expect(sql`DELETE FROM sync_operations WHERE operation_id = ${stale.operation_id}`.execute(h.db)).rejects.toThrow(/append-only/);
  });

  it('permisos retirados: el servidor rechaza nuevas operaciones y no devuelve resultados anteriores; pull deja de entregarlo', async () => {
    const d = await device(T1);
    const accepted = await locOp();
    expect((await push(T1, d, [accepted]).expect(200)).body.results[0].status).toBe('ACCEPTED');
    const full = (await http().get(`${base(org)}/sync/pull?device_id=${d}`).set(as(T1)).expect(200)).body;
    expect(full).toMatchObject({ full: true, tombstones: [] });
    expect(full.changes.map((p: { id: string }) => p.id)).toContain(plot);
    // pull incremental sin cambios
    const inc = (await http().get(`${base(org)}/sync/pull?device_id=${d}&cursor=${full.cursor}`).set(as(T1)).expect(200)).body;
    expect(inc).toMatchObject({ full: false, changes: [], tombstones: [] });
    // reasignación del productor a otro técnico
    const pv = Number((await http().get(`${base(org)}/producers/${producer}`).set(as(ADMIN)).expect(200)).body.row_version);
    await http().put(`${base(org)}/producers/${producer}/assignment`).set(as(ADMIN)).send({ expected_version: pv, membership_id: mids[T2] }).expect(200);
    expect((await push(T1, d, [await locOp({ base: 99 })]).expect(200)).body.results[0]).toMatchObject({ status: 'FORBIDDEN', error: { code: 'RESOURCE_NOT_AVAILABLE' } });
    expect((await push(T1, d, [accepted]).expect(200)).body.results[0]).toMatchObject({ status: 'FORBIDDEN', result: null }); // revalidado al reenviar
    const after = (await http().get(`${base(org)}/sync/pull?device_id=${d}&cursor=${inc.cursor}`).set(as(T1)).expect(200)).body;
    expect(after.tombstones).toEqual([plot]);
    expect(after.changes).toEqual([]);
    // el cursor antiguo tampoco conserva acceso
    expect((await http().get(`${base(org)}/sync/pull?device_id=${d}&cursor=${full.cursor}`).set(as(T1)).expect(200)).body.changes).toEqual([]);
    // T2 lo recibe; sus tombstones nunca incluyen recursos que no le entregaron
    const d2 = await device(T2);
    const t2 = (await http().get(`${base(org)}/sync/pull?device_id=${d2}`).set(as(T2)).expect(200)).body;
    expect(t2.changes.map((p: { id: string }) => p.id)).toEqual([plot]);
    // cursor de otro usuario/dispositivo y cursor caducado
    expect((await http().get(`${base(org)}/sync/pull?device_id=${d2}&cursor=${inc.cursor}`).set(as(T2)).expect(400)).body.error.code).toBe('CURSOR_INVALID');
    await sql`UPDATE sync_cursors SET expires_at = now() - interval '1 minute' WHERE id = ${t2.cursor}`.execute(h.db);
    expect((await http().get(`${base(org)}/sync/pull?device_id=${d2}&cursor=${t2.cursor}`).set(as(T2)).expect(410)).body.error.code).toBe('CURSOR_EXPIRED');
    // devolver la asignación para las pruebas siguientes
    const pv2 = Number((await http().get(`${base(org)}/producers/${producer}`).set(as(ADMIN)).expect(200)).body.row_version);
    await http().put(`${base(org)}/producers/${producer}/assignment`).set(as(ADMIN)).send({ expected_version: pv2, membership_id: mids[T1] }).expect(200);
  });

  it('adjuntos: registro y archivo con estados separados; integridad, escaneo y permisos de Documentos; reintento idempotente', async () => {
    const d = await device(T1);
    const bytes = jpeg();
    const op = photoOp(bytes);
    const r = (await push(T1, d, [op]).expect(200)).body.results[0];
    expect(r).toMatchObject({ status: 'ACCEPTED', result: { attachment: { status: 'AWAITING_CONTENT' } } });
    const upload = (email: string, buf: Buffer, deviceId = d) => http().post(`${base(org)}/sync/attachments/${op.operation_id}/content`).set(as(email)).field('device_id', deviceId).attach('file', buf, { filename: 'foto.jpg', contentType: 'image/jpeg' });
    expect((await upload(T1, bytes.subarray(0, bytes.length - 10)).expect(422)).body.error.code).toBe('ATTACHMENT_INTEGRITY_MISMATCH'); // incompleto
    expect(await h.db.selectFrom('sync_attachment_uploads').select('operation_id').where('operation_id', '=', op.operation_id).execute()).toHaveLength(0);
    await upload(T2, bytes, await device(T2)).expect(404); // otro usuario
    const ok = (await upload(T1, bytes).expect(200)).body;
    expect(ok.attachment.status).toMatch(/AVAILABLE|PENDING_SCAN/);
    const docType = await h.db.selectFrom('documents').select(['document_type', 'owner_type', 'owner_id']).where('id', '=', ok.attachment.document_id).executeTakeFirstOrThrow();
    expect(docType).toEqual({ document_type: 'FIELD_PHOTO', owner_type: 'plot', owner_id: plot });
    expect((await upload(T1, bytes).expect(200)).body.replayed).toBe(true);
    expect((await push(T1, d, [op]).expect(200)).body.results[0]).toMatchObject({ status: 'DUPLICATE', result: { attachment: { document_id: ok.attachment.document_id } } });
  });
});
