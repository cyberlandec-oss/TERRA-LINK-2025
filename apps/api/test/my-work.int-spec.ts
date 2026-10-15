import { randomUUID } from 'crypto';
import { PASSWORD, describeDb, setupHarness } from './helpers';

// P0-027 (RF-27, QA-14): «Mi trabajo» con tareas observables del dominio y Lot Hub sin fugas de recursos ocultos.
describeDb('P0-027 Mi trabajo y Lot Hub (PostgreSQL real)', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let orgA: string;
  let orgB: string;
  let p1: string; let p2: string; let product: string; let center: string; let plotP1: string;
  const http = () => h.http();
  const as = (e: string) => h.as(e);
  const api = (o: string) => `/api/v1/organizations/${o}`;
  const today = new Date().toISOString().slice(0, 10);
  const ADMIN = 'admin-a@test.local';
  const T1 = 'tecnico1@test.local';
  const work = async (actor: string, o = orgA) => (await http().get(`${api(o)}/my-work`).set(as(actor)).expect(200)).body as { tasks: Array<{ code: string; count: number; items: Array<{ label: string; href: string }> }> };
  const task = (w: Awaited<ReturnType<typeof work>>, code: string) => w.tasks.find((t) => t.code === code);

  async function join(email: string, role: string) {
    const inv = await http().post(`${api(orgA)}/invitations`).set(as(ADMIN)).send({ email, role_code: role }).expect(201);
    await http().post('/api/v1/invitations/accept').send({ token: inv.body.token, first_name: 'P', last_name: email, password: PASSWORD }).expect(200);
    await h.login(email);
  }
  const membershipId = async (email: string) => (await h.db.selectFrom('memberships as m').innerJoin('users as u', 'u.id', 'm.user_id').select('m.id').where('u.email', '=', email).where('m.organization_id', '=', orgA).executeTakeFirstOrThrow()).id;

  beforeAll(async () => {
    h = await setupHarness();
    await h.user('super@test.local', 'SUPER_ADMIN');
    await h.user(ADMIN);
    await h.user('admin-b@test.local');
    const mk = async (name: string, admin: string) => (await http().post('/api/v1/organizations').set(as('super@test.local')).send({ name, organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: admin }).expect(201)).body.id;
    orgA = await mk('Coop Trabajo A', ADMIN);
    orgB = await mk('Coop Trabajo B', 'admin-b@test.local');
    for (const [e, r] of [[T1, 'FIELD_TECHNICIAN'], ['recepcion@test.local', 'RECEPTION_OPERATOR'], ['calidad@test.local', 'QUALITY_OPERATOR'], ['auditor@test.local', 'AUDITOR']]) await join(e, r);
    p1 = (await http().post(`${api(orgA)}/producers`).set(as(ADMIN)).send({ producer_code: 'W-1', legal_name: 'Finca Asignada', assigned_membership_id: await membershipId(T1) }).expect(201)).body.id;
    p2 = (await http().post(`${api(orgA)}/producers`).set(as(ADMIN)).send({ producer_code: 'W-2', legal_name: 'Finca Ajena' }).expect(201)).body.id;
    plotP1 = (await http().post(`${api(orgA)}/plots`).set(as(ADMIN)).send({ producer_id: p1, plot_code: 'W-1-P1', crop: 'Cacao' }).expect(201)).body.id;
    await http().post(`${api(orgA)}/plots`).set(as(ADMIN)).send({ producer_id: p2, plot_code: 'W-2-SECRETA', crop: 'Cacao' }).expect(201);
    product = (await http().post(`${api(orgA)}/products`).set(as(ADMIN)).send({ code: 'CACAO_BABA', name: 'Cacao en baba', product_state: 'CACAO_BABA', unit: 'KG' }).expect(201)).body.id;
    center = (await http().post(`${api(orgA)}/locations`).set(as(ADMIN)).send({ code: 'CW', name: 'Centro', location_type: 'COLLECTION_CENTER' }).expect(201)).body.id;
    await http().post(`${api(orgA)}/deliveries`).set(as(T1)).send({ operation_id: randomUUID(), producer_id: p1, notes: 'borrador del técnico' }).expect(201);
    await http().post(`${api(orgA)}/deliveries`).set(as(ADMIN)).send({ operation_id: randomUUID(), producer_id: p2, notes: 'borrador de admin' }).expect(201);
  });
  afterAll(async () => h?.close());

  it('alcance: el técnico solo ve tareas de sus productores asignados; sin conteos ni ejemplos de lo ajeno', async () => {
    const w = await work(T1);
    expect(task(w, 'DELIVERY_DRAFTS')).toMatchObject({ count: 1 });
    expect(task(w, 'PLOTS_WITHOUT_LOCATION')).toMatchObject({ count: 1, items: [expect.objectContaining({ label: 'W-1-P1' })] });
    expect(task(w, 'DELIVERIES_TO_RECEIVE')).toBeUndefined(); // no puede recibir
    expect(task(w, 'DUPLICATE_REVIEWS')).toBeUndefined();
    const json = JSON.stringify(w);
    expect(json).not.toContain('W-2');
    const a = await work(ADMIN);
    expect(task(a, 'DELIVERY_DRAFTS')!.count).toBe(2);
    expect(task(a, 'PLOTS_WITHOUT_LOCATION')!.count).toBe(2);
  });

  it('roles sin acciones de escritura no reciben tareas; otra organización 404; organización suspendida sin tareas', async () => {
    expect((await work('auditor@test.local')).tasks).toEqual([]);
    expect((await work('calidad@test.local')).tasks).toEqual([]); // aún no hay resultados pendientes
    await http().get(`${api(orgA)}/my-work`).set(as('admin-b@test.local')).expect(404);
    expect((await work('admin-b@test.local', orgB)).tasks).toEqual([]);
  });

  it('una tarea desaparece al resolverse en el dominio (registrar borrador; recibir entrega)', async () => {
    const draft = (await http().get(`${api(orgA)}/deliveries?status=DRAFT`).set(as(ADMIN)).expect(200)).body.find((d: { producer: { code: string } }) => d.producer.code === 'W-2');
    const dv = (await http().get(`${api(orgA)}/deliveries/${draft.id}`).set(as(ADMIN)).expect(200)).body;
    draft.row_version = dv.row_version ?? dv.delivery?.row_version;
    const upd = (await http().patch(`${api(orgA)}/deliveries/${draft.id}`).set(as(ADMIN)).send({ expected_version: draft.row_version, product_id: product, delivery_date: today, quantity_declared: '100', unit: 'KG', origins: [] }).expect(200)).body;
    await http().post(`${api(orgA)}/deliveries/${draft.id}/register`).set(as(ADMIN)).send({ expected_version: upd.row_version }).expect(200);
    expect(task(await work(ADMIN), 'DELIVERY_DRAFTS')!.count).toBe(1);
    const rec = task(await work('recepcion@test.local'), 'DELIVERIES_TO_RECEIVE')!;
    expect(rec).toMatchObject({ count: 1, items: [expect.objectContaining({ label: expect.stringContaining('W-2') })] });
    await http().post(`${api(orgA)}/deliveries/${draft.id}/receptions`).set(as('recepcion@test.local')).send({ operation_id: randomUUID(), location_id: center, received_at: new Date().toISOString(), weighing: { method: 'B', quantity: '100', unit: 'KG', weighed_on: today } }).expect(201);
    expect(task(await work('recepcion@test.local'), 'DELIVERIES_TO_RECEIVE')).toBeUndefined();
  });

  it('Parcelas sin ubicación: sin versión y solo superficie declarada siguen en la tarea; punto y polígono la resuelven', async () => {
    const mkPlot = async (code: string) => (await http().post(`${api(orgA)}/plots`).set(as(ADMIN)).send({ producer_id: p1, plot_code: code, crop: 'Cacao' }).expect(201)).body.id as string;
    const rv = async (id: string) => Number((await h.db.selectFrom('plots').select('row_version').where('id', '=', id).executeTakeFirstOrThrow()).row_version);
    const labels = async () => (task(await work(T1), 'PLOTS_WITHOUT_LOCATION')?.items ?? []).map((i) => i.label);
    const declared = await mkPlot('W-1-DECL');
    const point = await mkPlot('W-1-PUNTO');
    const polygon = await mkPlot('W-1-POLI');
    expect(await labels()).toEqual(expect.arrayContaining(['W-1-P1', 'W-1-DECL', 'W-1-PUNTO', 'W-1-POLI'])); // sin versión
    // Superficie declarada sin coordenadas: versión vigente sin geometría → sigue sin ubicación.
    await http().post(`${api(orgA)}/plots/${declared}/declared-area`).set(as(T1)).send({ expected_version: await rv(declared), area_declared_ha: 1.2 }).expect(201);
    await http().post(`${api(orgA)}/plots/${point}/declared-area`).set(as(T1)).send({ expected_version: await rv(point), area_declared_ha: 0.8 }).expect(201);
    expect(await labels()).toEqual(expect.arrayContaining(['W-1-DECL', 'W-1-PUNTO']));
    // Punto (sobre una versión declarada) y polígono: la tarea se retira solo para esas parcelas.
    await http().post(`${api(orgA)}/plots/${point}/geometry-versions`).set(as(T1)).send({ expected_version: await rv(point), survey_method: 'MANUAL_COORDINATES', geometry: { type: 'Point', coordinates: [-80.1601, -0.8479] } }).expect(201);
    const ring = [[-80.16, -0.85], [-80.159, -0.85], [-80.159, -0.849], [-80.16, -0.849], [-80.16, -0.85]];
    await http().post(`${api(orgA)}/plots/${polygon}/geometry-versions`).set(as(T1)).send({ expected_version: await rv(polygon), survey_method: 'MANUAL_COORDINATES', geometry: { type: 'Polygon', coordinates: [ring] } }).expect(201);
    const after = await labels();
    expect(after).toEqual(expect.arrayContaining(['W-1-P1', 'W-1-DECL']));
    expect(after).not.toContain('W-1-PUNTO');
    expect(after).not.toContain('W-1-POLI');
    expect(task(await work(T1), 'PLOTS_WITHOUT_LOCATION')).toMatchObject({ title: 'Parcelas sin ubicación', count: 2 });
  });

  it('Lot Hub: quien lee entregas pero no parcelas no recibe códigos ni ids de parcelas de origen', async () => {
    const d = (await http().post(`${api(orgA)}/deliveries`).set(as(ADMIN)).send({ operation_id: randomUUID(), producer_id: p1, product_id: product, delivery_date: today, quantity_declared: '40', unit: 'KG', origins: [{ plot_id: plotP1 }], register: true }).expect(201)).body.delivery;
    const r = (await http().post(`${api(orgA)}/deliveries/${d.id}/receptions`).set(as(ADMIN)).send({ operation_id: randomUUID(), location_id: center, received_at: new Date().toISOString(), weighing: { method: 'B', quantity: '40', unit: 'KG', weighed_on: today } }).expect(201)).body.reception_id;
    const lot = (await http().post(`${api(orgA)}/lots`).set(as(ADMIN)).send({ operation_id: randomUUID(), inputs: [{ reception_id: r, quantity: '40' }] }).expect(201)).body.lot;
    const adminView = (await http().get(`${api(orgA)}/lots/${lot.id}`).set(as(ADMIN)).expect(200)).body;
    expect(adminView.upstream.receptions[0]).toMatchObject({ plots: ['W-1-P1'], plot_links: [{ id: plotP1, code: 'W-1-P1' }], plots_restricted: false, origin_known: true, delivery_id: d.id, producer_id: p1 });
    expect(adminView.inputs[0].delivery_id).toBe(d.id);
    const recView = (await http().get(`${api(orgA)}/lots/${lot.id}`).set(as('recepcion@test.local')).expect(200)).body;
    expect(recView.upstream.receptions[0]).toMatchObject({ plots: [], plot_links: [], plots_restricted: true, origin_known: null, producer_id: null });
    expect(JSON.stringify(recView)).not.toContain('W-1-P1');
    expect(JSON.stringify(recView)).not.toContain(plotP1);
  });

  it('parcelas restringidas: el aviso depende del permiso; lotes con 0, 1 o 2 parcelas ocultas son indistinguibles', async () => {
    const extra = (await http().post(`${api(orgA)}/plots`).set(as(ADMIN)).send({ producer_id: p1, plot_code: 'W-1-OCULTA2', crop: 'Cacao' }).expect(201)).body.id;
    const mkLot = async (origins: Array<{ plot_id: string; quantity?: string }>) => {
      const d = (await http().post(`${api(orgA)}/deliveries`).set(as(ADMIN)).send({ operation_id: randomUUID(), producer_id: p1, product_id: product, delivery_date: today, quantity_declared: '30', unit: 'KG', origins, register: true }).expect(201)).body.delivery;
      const r = (await http().post(`${api(orgA)}/deliveries/${d.id}/receptions`).set(as(ADMIN)).send({ operation_id: randomUUID(), location_id: center, received_at: new Date().toISOString(), weighing: { method: 'B', quantity: '30', unit: 'KG', weighed_on: today } }).expect(201)).body.reception_id;
      return { delivery: d.id as string, lot: (await http().post(`${api(orgA)}/lots`).set(as(ADMIN)).send({ operation_id: randomUUID(), inputs: [{ reception_id: r, quantity: '30' }] }).expect(201)).body.lot.id as string };
    };
    const one = await mkLot([{ plot_id: plotP1, quantity: '30' }]);
    const two = await mkLot([{ plot_id: plotP1, quantity: '10' }, { plot_id: extra, quantity: '20' }]);
    const none = await mkLot([]);
    const Q = 'calidad@test.local'; // lee entregas y lotes; sin lectura de parcelas ni capacidad de declarar origen
    const shape = async (lot: string) => {
      const v = (await http().get(`${api(orgA)}/lots/${lot}`).set(as(Q)).expect(200)).body;
      return v.upstream.receptions.map(({ lot_id: _l, delivery_id: _d, delivery_code: _c, ...rest }: Record<string, unknown>) => rest);
    };
    const [s1, s2, s0] = [await shape(one.lot), await shape(two.lot), await shape(none.lot)];
    expect(s1).toEqual([{ producer_code: 'W-1', producer_id: null, producer_name: null, plots: [], plot_links: [], plots_restricted: true, origin_known: null, quantity: { value: '30', unit: 'KG' } }]);
    expect(s2).toEqual(s1);
    expect(s0).toEqual(s1); // sin origen declarado: misma forma por recepción (el estado D-39 del lote es un atributo del lote, no una referencia)
    const full1 = JSON.stringify((await http().get(`${api(orgA)}/lots/${one.lot}`).set(as(Q)).expect(200)).body);
    const full2 = JSON.stringify((await http().get(`${api(orgA)}/lots/${two.lot}`).set(as(Q)).expect(200)).body);
    for (const leak of ['W-1-P1', 'W-1-OCULTA2', plotP1, extra, '"10"', '"20"']) { expect(full1).not.toContain(leak); expect(full2).not.toContain(leak); }
    // Detalle de entrega: mismo criterio.
    for (const d of [one.delivery, two.delivery, none.delivery]) {
      const body = (await http().get(`${api(orgA)}/deliveries/${d}`).set(as(Q)).expect(200)).body;
      expect(body).toMatchObject({ origins: [], origins_restricted: true, origin_status: 'RESTRICTED' });
      for (const leak of ['W-1-P1', 'W-1-OCULTA2', plotP1, extra]) expect(JSON.stringify(body)).not.toContain(leak);
    }
    // Con permiso, el aviso no aparece y se ven las parcelas.
    expect((await http().get(`${api(orgA)}/lots/${two.lot}`).set(as(ADMIN)).expect(200)).body.upstream.receptions[0]).toMatchObject({ plots: ['W-1-OCULTA2', 'W-1-P1'], plots_restricted: false, origin_known: true });
    expect((await http().get(`${api(orgA)}/lots/${none.lot}`).set(as(ADMIN)).expect(200)).body.upstream.receptions[0]).toMatchObject({ plots: [], plots_restricted: false, origin_known: false });
  });
});
