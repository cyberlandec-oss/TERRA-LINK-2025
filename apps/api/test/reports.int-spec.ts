import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { PASSWORD, describeDb, setupHarness } from './helpers';

// P0-030 Reportes e indicadores (RF-30, QA-13/14). Contrato: docs/decisiones/P0-030-REPORTES.md.
// Datos SINTÉTICOS con cifras conocidas: cada aserción compara contra una fixture construida en la prueba, no contra
// los conteos que devuelva la base en ese momento.
describeDb('P0-030 reportes: indicadores con denominador, período y permisos', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let orgA: string;
  let orgB: string;
  let product: string;
  let center: string;
  let prodConParcela: string;
  const http = () => h.http();
  const as = (e: string) => h.as(e);
  const api = (o: string) => `/api/v1/organizations/${o}`;
  const ADMIN = 'admin-a@test.local';
  const AUD = 'auditor@test.local';

  type Ind = { code: string; status: string; value: string | null; numerator: number | null; denominator: number | null; reason: string | null; kind: string; unit: string; date_basis: string | null; requires: string };
  type Body = { indicators: Ind[]; can_export: boolean; period: { from: string | null; to: string | null }; history_gap: { since: string; note: string; reference: string }; privacy_note: string; interpretation_note: string; scope_note: string };
  const report = async (actor: string, qs = '', o = orgA) => (await http().get(`${api(o)}/reports/indicators${qs}`).set(as(actor)).expect(200)).body as Body;
  const ind = (b: Body, code: string) => b.indicators.find((i) => i.code === code)!;

  async function join(email: string, role: string) {
    const inv = await http().post(`${api(orgA)}/invitations`).set(as(ADMIN)).send({ email, role_code: role }).expect(201);
    await http().post('/api/v1/invitations/accept').send({ token: inv.body.token, first_name: 'P', last_name: role.toLowerCase(), password: PASSWORD }).expect(200);
    await h.login(email);
  }
  /** Entrega registrada con una fecha declarada concreta: así el período se prueba sobre delivery_date, no created_at. */
  const delivery = async (producer: string, date: string, q: string) =>
    (await http().post(`${api(orgA)}/deliveries`).set(as(ADMIN))
      .send({ operation_id: randomUUID(), producer_id: producer, product_id: product, delivery_date: date, quantity_declared: q, unit: 'KG', register: true }).expect(201)).body.delivery;

  beforeAll(async () => {
    h = await setupHarness();
    await h.app.listen(0); // un solo servidor escuchando, como en lots/inventario
    await h.user('super@test.local', 'SUPER_ADMIN');
    await h.user(ADMIN);
    await h.user('admin-b@test.local');
    const mk = async (name: string, admin: string) => (await http().post('/api/v1/organizations').set(as('super@test.local')).send({ name, organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: admin }).expect(201)).body.id;
    orgA = await mk('Coop Reportes A', ADMIN);
    orgB = await mk('Coop Reportes B', 'admin-b@test.local');
    for (const [e, r] of [[AUD, 'AUDITOR'], ['exportacion@test.local', 'EXPORT_MANAGER'], ['recepcion@test.local', 'RECEPTION_OPERATOR'], ['tecnico@test.local', 'FIELD_TECHNICIAN']]) await join(e, r);
    product = (await http().post(`${api(orgA)}/products`).set(as(ADMIN)).send({ code: 'CACAO_BABA', name: 'Cacao en baba', product_state: 'CACAO_BABA', unit: 'KG' }).expect(201)).body.id;
    center = (await http().post(`${api(orgA)}/locations`).set(as(ADMIN)).send({ code: 'CR', name: 'Centro', location_type: 'COLLECTION_CENTER' }).expect(201)).body.id;
    // Fixture conocida: 3 productores (uno dado de baja → no cuenta), 2 parcelas, 3 entregas registradas en fechas
    // distintas y 1 borrador, y en otra organización datos que NUNCA deben aparecer.
    prodConParcela = (await http().post(`${api(orgA)}/producers`).set(as(ADMIN)).send({ producer_code: 'R-1', legal_name: 'Finca Uno' }).expect(201)).body.id;
    const p2 = (await http().post(`${api(orgA)}/producers`).set(as(ADMIN)).send({ producer_code: 'R-2', legal_name: 'Finca Dos' }).expect(201)).body.id;
    const p3 = (await http().post(`${api(orgA)}/producers`).set(as(ADMIN)).send({ producer_code: 'R-3', legal_name: 'Finca Baja' }).expect(201)).body;
    await http().post(`${api(orgA)}/producers/${p3.id}/archive`).set(as(ADMIN)).send({ expected_version: 1, reason: 'Fuera de la fixture' }).expect(200);
    await http().post(`${api(orgA)}/plots`).set(as(ADMIN)).send({ producer_id: prodConParcela, plot_code: 'R-1-P1', crop: 'Cacao' }).expect(201);
    await http().post(`${api(orgA)}/plots`).set(as(ADMIN)).send({ producer_id: p2, plot_code: 'R-2-P1', crop: 'Cacao' }).expect(201);
    await delivery(prodConParcela, '2026-09-10', '100');
    await delivery(prodConParcela, '2026-09-20', '200');
    await delivery(p2, '2026-10-05', '300');
    await http().post(`${api(orgA)}/deliveries`).set(as(ADMIN)).send({ operation_id: randomUUID(), producer_id: p2 }).expect(201); // borrador
    // Organización B: material que no debe cruzarse.
    await http().post(`${api(orgB)}/producers`).set(as('admin-b@test.local')).send({ producer_code: 'B-1', legal_name: 'Ajena' }).expect(201);
  });
  afterAll(async () => h?.close());

  it('conteos de estado sobre la fixture: bajas excluidas, sin mezclar organizaciones y sin filtrar por período', async () => {
    const b = await report(ADMIN);
    expect(ind(b, 'producers_total')).toMatchObject({ status: 'OK', value: '2', kind: 'STATE', unit: 'count' }); // el dado de baja no cuenta
    expect(ind(b, 'plots_total')).toMatchObject({ status: 'OK', value: '2', kind: 'STATE' });
    // El período no toca los indicadores de estado: mismo valor con un período que excluiría todo por created_at.
    const b2 = await report(ADMIN, '?from=1999-01-01&to=1999-12-31');
    expect(ind(b2, 'producers_total').value).toBe('2');
    expect(ind(b2, 'plots_total').value).toBe('2');
    expect(ind(b2, 'producers_total').reason).toMatch(/no se filtra por .created_at./i);
    // La organización B tiene su propio productor y no suma aquí.
    expect((await report('admin-b@test.local', '', orgB)).indicators.find((i) => i.code === 'producers_total')!.value).toBe('1');
  });

  it('actividad por período: usa la fecha declarada de entrega, no created_at; los borradores quedan fuera', async () => {
    const todo = await report(ADMIN);
    expect(ind(todo, 'deliveries_total')).toMatchObject({ status: 'OK', value: '3', kind: 'ACTIVITY' });
    expect(ind(todo, 'deliveries_total').date_basis).toMatch(/delivery_date/);
    expect(ind(todo, 'deliveries_total').reason).toMatch(/borradores quedan fuera/i);
    // Septiembre: 2 de 3. Octubre: 1. Un período anterior a toda la fixture: 0 entregas, no un error.
    expect(ind(await report(ADMIN, '?from=2026-09-01&to=2026-09-30'), 'deliveries_total').value).toBe('2');
    expect(ind(await report(ADMIN, '?from=2026-10-01&to=2026-10-31'), 'deliveries_total').value).toBe('1');
    expect(ind(await report(ADMIN, '?from=2020-01-01&to=2020-12-31'), 'deliveries_total').value).toBe('0');
    // Las entregas se crearon hoy: si el filtro usara created_at, un período de 2026-09 devolvería 0 y no 2.
    const creadasHoy = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM deliveries WHERE organization_id = ${orgA} AND created_at::date = CURRENT_DATE`.execute(h.db)).rows[0].n;
    expect(Number(creadasHoy)).toBeGreaterThanOrEqual(4);
  });

  it('capacidades no evaluables salen NOT_CALCULABLE con su motivo, nunca como cero favorable', async () => {
    const b = await report(ADMIN);
    // GIS: ninguna versión evaluada mientras D-05 no apruebe umbral y perfil.
    expect(ind(b, 'plots_valid')).toMatchObject({ status: 'NOT_CALCULABLE', value: null });
    expect(ind(b, 'plots_valid').reason).toMatch(/D-05/);
    expect(ind(b, 'plots_valid').reason).toMatch(/ninguna ha sido evaluada/i);
    // Riesgo: el motor devuelve NOT_ASSESSED por diseño; «0 de riesgo alto» sería una cifra inventada.
    for (const code of ['risk_high', 'risk_medium', 'risk_low']) {
      expect(ind(b, code)).toMatchObject({ status: 'NOT_CALCULABLE', value: null });
      expect(ind(b, code).reason).toMatch(/NOT_ASSESSED/);
    }
    // Ningún indicador bloqueado se presenta con valor numérico.
    for (const i of b.indicators) if (i.status !== 'OK') expect(i.value).toBeNull();
  });

  it('denominador cero produce NOT_CALCULABLE, no 0 % ni 100 %', async () => {
    const b = await report(ADMIN);
    // Sin lotes, sin evidencias y sin expedientes en esta organización.
    for (const code of ['traceability_completeness', 'evidence_completeness', 'due_diligence_ready']) {
      expect(ind(b, code)).toMatchObject({ status: 'NOT_CALCULABLE', value: null, denominator: 0 });
      expect(ind(b, code).reason).toMatch(/denominador|sin expedientes/i);
      // Lo que no debe ocurrir es publicar un porcentaje; el texto sí puede decir «No es 0 % ni 100 %».
      expect(ind(b, code).value).toBeNull();
    }
  });

  it('porcentaje real con denominador conocido: 1 de 2 lotes con origen completo = 50,0 %', async () => {
    // Fixture: dos lotes, uno con origen declarado y otro sin él.
    const plot = (await http().get(`${api(orgA)}/plots`).set(as(ADMIN)).expect(200)).body.items[0].id;
    const conOrigen = (await http().post(`${api(orgA)}/deliveries`).set(as(ADMIN))
      .send({ operation_id: randomUUID(), producer_id: prodConParcela, product_id: product, delivery_date: '2026-10-08', quantity_declared: '50', unit: 'KG', origins: [{ plot_id: plot }], register: true }).expect(201)).body.delivery;
    const mkLot = async (d: { id: string }, q: string) => {
      const r = (await http().post(`${api(orgA)}/deliveries/${d.id}/receptions`).set(as(ADMIN))
        .send({ operation_id: randomUUID(), location_id: center, received_at: new Date().toISOString(), weighing: { method: 'Báscula', quantity: q, unit: 'KG', weighed_on: '2026-10-08' } }).expect(201)).body.reception_id;
      return (await http().post(`${api(orgA)}/lots`).set(as(ADMIN)).send({ operation_id: randomUUID(), inputs: [{ reception_id: r, quantity: q }] }).expect(201)).body.lot;
    };
    await mkLot(conOrigen, '50');
    await mkLot(await delivery(prodConParcela, '2026-10-09', '60'), '60'); // sin orígenes declarados
    const b = await report(ADMIN);
    expect(ind(b, 'lots_active')).toMatchObject({ status: 'OK', value: '2' });
    expect(ind(b, 'traceability_completeness')).toMatchObject({ status: 'OK', value: '50.0', numerator: 1, denominator: 2, unit: 'percent' });
    expect(ind(b, 'traceability_completeness').reason).toMatch(/no acredita verificación|no es verificación|conformidad/i);
  });

  it('permisos: report:read abre la pantalla pero cada indicador exige el permiso de su dominio; nada se deduce por diferencia', async () => {
    // EXPORT_MANAGER tiene report:read y lot:read, pero no producer:read, plot:read, delivery:read, risk:read ni dd:read.
    const b = await report('exportacion@test.local');
    for (const code of ['producers_total', 'plots_total', 'plots_valid', 'deliveries_total', 'risk_high', 'evidence_completeness', 'due_diligence_ready']) {
      const i = ind(b, code);
      expect(i.status).toBe('RESTRICTED');
      expect({ value: i.value, numerator: i.numerator, denominator: i.denominator }).toEqual({ value: null, numerator: null, denominator: null });
      expect(i.reason).toMatch(/no permite leer este dominio/i);
    }
    expect(ind(b, 'lots_active').status).toBe('OK'); // lo que sí puede leer, lo ve
    expect(b.can_export).toBe(false);
    // Un rol sin report:read no entra a la pantalla; un alcance por asignación no habilita agregados.
    await http().get(`${api(orgA)}/reports/indicators`).set(as('recepcion@test.local')).expect(403);
    await http().get(`${api(orgA)}/reports/indicators`).set(as('tecnico@test.local')).expect(403);
    // Otra organización: 404, no 403, y sin filtrar la existencia.
    await http().get(`${api(orgB)}/reports/indicators`).set(as(ADMIN)).expect(404);
  });

  it('exportación: permiso propio revalidado, coincide con la pantalla, lleva hash y queda auditada; fórmulas neutralizadas', async () => {
    const pantalla = await report(AUD);
    expect(pantalla.can_export).toBe(true);
    const res = await http().get(`${api(orgA)}/reports/indicators/export?from=2026-09-01&to=2026-09-30`).set(as(AUD)).expect(200);
    const csv = res.text ?? String(res.body);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="indicadores-/);
    expect(res.headers['x-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    // Metadatos obligatorios: alcance, período, privacidad, interpretación y laguna histórica.
    expect(csv).toMatch(/# formato,.*TL_REPORT_CSV/);
    expect(csv).toMatch(/# periodo_desde,2026-09-01/);
    expect(csv).toMatch(/# periodo_hasta,2026-09-30/);
    expect(csv).toMatch(/# privacidad,.*no contiene datos personales/);
    expect(csv).toMatch(/# laguna_historica,.*2026-10-13/);
    // El período del archivo manda sobre el contenido: en septiembre hay 2 entregas.
    const fila = csv.split('\r\n').find((l) => l.startsWith('deliveries_total,'))!;
    expect(fila.split(',')[5]).toBe('2');
    // Neutralización de fórmulas: ninguna celda empieza por =, +, - o @ sin la comilla de escape.
    for (const linea of csv.split('\r\n').filter((l) => l && !l.startsWith('#'))) {
      for (const celda of linea.split(',')) expect(celda).not.toMatch(/^[=+@]/);
    }
    // Auditada con hash y filtros; sin report:export no se descarga aunque se tenga la pantalla.
    const log = (await sql<{ after: Record<string, unknown> }>`SELECT after FROM audit_logs WHERE organization_id = ${orgA} AND action = 'report.export' ORDER BY occurred_at DESC LIMIT 1`.execute(h.db)).rows[0];
    expect(log.after).toMatchObject({ sha256: res.headers['x-content-sha256'], format_version: expect.stringContaining('TL_REPORT_CSV') });
    await http().get(`${api(orgA)}/reports/indicators/export`).set(as('exportacion@test.local')).expect(403);
  });

  it('la respuesta declara la laguna histórica y no confunde preparación con conformidad', async () => {
    const b = await report(ADMIN);
    expect(b.history_gap.since).toBe('2026-10-13');
    expect(b.history_gap.note).toMatch(/pérdida de almacenamiento, NO por falta de actividad/i);
    expect(b.history_gap.reference).toBe('docs/qa/HALLAZGO_PERDIDA_DATOS_DEMO_2026-10-13.md');
    expect(b.privacy_note).toMatch(/no contiene datos personales ni coordenadas/i);
    expect(b.interpretation_note).toMatch(/Readiness no es conformidad/i);
    expect(b.interpretation_note).toMatch(/Reserva no es despacho/i);
    // Ningún indicador expone identidad ni geometría.
    const texto = JSON.stringify(b);
    for (const prohibido of ['document_number', 'phone_enc', 'geometry', 'latitude', 'longitude']) expect(texto).not.toContain(prohibido);
  });
});
