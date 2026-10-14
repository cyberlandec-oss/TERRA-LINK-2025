import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { PASSWORD, describeDb, setupHarness } from './helpers';
import { ROLE_PERMISSIONS } from '../src/authz/catalog';
import { FixtureSatelliteProvider } from '../src/satellite/provider';
import { SatelliteRunner } from '../src/satellite/runner';

// Integración P0-028 (primer proveedor satelital), base real. Contrato: docs/decisiones/P0-028-SATELITE.md.
// Lo que estas pruebas acreditan: el contrato, los permisos, los desenlaces y los candados de honestidad.
// Lo que NO acreditan: ningún análisis satelital real. No hay proveedor seleccionado (D-09) y todo lo que
// produce un resultado aquí es una FIXTURE SINTÉTICA, marcada como tal en la base y en la API.
describeDb('P0-028 satélite: contrato, desenlaces y candados', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let orgA: string;
  let orgB: string;
  let plotA: string;
  let plotSinGeometria: string;
  const ADMIN = 'admin-a@test.local';
  const http = () => h.http();
  const as = (e: string) => h.as(e);
  const org = () => `/api/v1/organizations/${orgA}`;
  const square = { type: 'Polygon', coordinates: [[[-79.5, -1], [-79.49, -1], [-79.49, -0.99], [-79.5, -0.99], [-79.5, -1]]] };

  const fixtureOn = (on: boolean) => { process.env.SATELLITE_FIXTURE_ENABLED = on ? 'true' : 'false'; };
  const runner = (opts = {}) => new SatelliteRunner(h.db, [new FixtureSatelliteProvider()], {}, { maxAttempts: 1, backoffBaseMs: 1, ...opts });
  const ask = (plot: string, body: Record<string, unknown> = {}, actor = ADMIN) =>
    http().post(`${org()}/plots/${plot}/satellite/analyses`).set(as(actor)).send({ operation_id: randomUUID(), operation: 'FOREST_COVER', ...body });
  const jobRow = (id: string) => h.db.selectFrom('satellite_jobs').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  async function join(o: string, email: string, role: string, admin = ADMIN) {
    const inv = await http().post(`/api/v1/organizations/${o}/invitations`).set(as(admin)).send({ email, role_code: role }).expect(201);
    await http().post('/api/v1/invitations/accept').send({ token: inv.body.token, first_name: 'P', last_name: email, password: PASSWORD }).expect(200);
    await h.login(email);
  }

  beforeAll(async () => {
    h = await setupHarness();
    await h.user('super@test.local', 'SUPER_ADMIN');
    await h.user(ADMIN);
    await h.user('admin-b@test.local');
    const mk = async (name: string, admin: string) =>
      (await http().post('/api/v1/organizations').set(as('super@test.local')).send({ name, organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: admin }).expect(201)).body.id;
    orgA = await mk('Coop A', ADMIN);
    orgB = await mk('Coop B', 'admin-b@test.local');
    await join(orgA, 'auditor@test.local', 'AUDITOR');
    await join(orgA, 'calidad@test.local', 'QUALITY_OPERATOR');
    const producer = (await http().post(`${org()}/producers`).set(as(ADMIN)).send({ producer_code: 'P-1', legal_name: 'Finca 1' }).expect(201)).body.id;
    const mkPlot = async (code: string) => (await http().post(`${org()}/plots`).set(as(ADMIN)).send({ producer_id: producer, plot_code: code, crop: 'Cacao' }).expect(201)).body.id;
    plotA = await mkPlot('A');
    await http().post(`${org()}/plots/${plotA}/geometry-versions`).set(as(ADMIN)).send({ expected_version: 1, survey_method: 'MANUAL_COORDINATES', geometry: square }).expect(201);
    plotSinGeometria = await mkPlot('SIN-GEO');
    await http().post(`${org()}/plots/${plotSinGeometria}/geometry-versions`).set(as(ADMIN)).send({ expected_version: 1, survey_method: 'DECLARED', area_declared_ha: 2.5 }).expect(201);
  });
  afterAll(async () => { fixtureOn(false); await h?.close(); });
  // Cada prueba parte sin encargos pendientes de la anterior: así los recuentos del corredor son exactos.
  beforeEach(async () => {
    fixtureOn(true);
    await sql`UPDATE satellite_jobs SET status = 'CANCELLED', outcome = 'CANCELLED', finished_at = now(), lease_token = NULL, locked_by = NULL, locked_until = NULL WHERE status IN ('REQUESTED','RUNNING')`.execute(h.db);
  });

  // ---------------------------------------------------------------- registro y decisión pendiente

  it('el registro documenta candidatos y declara que NINGUNO está seleccionado (D-09)', async () => {
    const r = await http().get(`${org()}/satellite/providers`).set(as(ADMIN)).expect(200);
    expect(r.body.selection).toMatchObject({ status: 'NOT_SELECTED', decision: 'D-09' });
    expect(r.body.selection.note).toMatch(/no se envía ninguna coordenada/);
    const codes = r.body.providers.map((p: { code: string }) => p.code).sort();
    expect(codes).toEqual(['EU_FOREST_OBSERVATORY', 'FIXTURE_SYNTHETIC', 'GFW', 'WHISP']);
    const whisp = r.body.providers.find((p: { code: string }) => p.code === 'WHISP');
    // Cada candidato declara licencia, coste, cobertura, límites y QUÉ DATOS saldrían del equipo.
    expect(whisp).toMatchObject({ selection_status: 'PROPOSED', license: expect.stringContaining('MIT') });
    expect(whisp.data_sent_outside).toMatch(/Geometría de la parcela/);
    expect(whisp.allowed_hosts).toEqual(['whisp.openforis.org']);
    // Ningún candidato declara operaciones soportadas: eso se determina al seleccionar y probar el canal.
    expect(whisp.supported_operations).toEqual([]);
  });

  it('la base impide que una fixture sintética sea el proveedor seleccionado', async () => {
    const uid = (await h.db.selectFrom('users').select('id').where('email', '=', ADMIN).executeTakeFirstOrThrow()).id;
    await expect(sql`UPDATE satellite_providers SET selection_status = 'SELECTED', selected_by = ${uid}, decision_reference = 'D-09' WHERE code = 'FIXTURE_SYNTHETIC'`.execute(h.db))
      .rejects.toThrow(/satellite_providers_fixture/);
  });

  it('sin proveedor seleccionado no se encarga nada y no sale ninguna coordenada', async () => {
    fixtureOn(false);
    const r = await ask(plotA).expect(409);
    expect(r.body.error.code).toBe('SATELLITE_PROVIDER_NOT_SELECTED');
    expect(r.body.error.message).toMatch(/D-09/);
    expect(await h.db.selectFrom('satellite_jobs').select('id').where('plot_id', '=', plotA).execute()).toHaveLength(0);
  });

  // ---------------------------------------------------------------- permisos y clasificación de coordenadas

  it('leer exige satellite:read; un rol sin el permiso no ve el registro ni los trabajos', async () => {
    await http().get(`${org()}/satellite/providers`).set(as('calidad@test.local')).expect(403);
    await http().get(`${org()}/plots/${plotA}/satellite`).set(as('calidad@test.local')).expect(403);
    await http().get(`${org()}/satellite/providers`).set(as('auditor@test.local')).expect(200);
  });

  it('el AUDITOR lee pero no encarga: enviar coordenadas fuera es una facultad distinta', async () => {
    await ask(plotA, {}, 'auditor@test.local').expect(403);
  });

  it('ningún rol puede encargar un análisis sin el permiso que clasifica las coordenadas', () => {
    // Encargar saca la geometría exacta del equipo: el servicio exige plot:read_geometry además de
    // satellite:request. Esta comprobación fija la regla en el catálogo para que no se rompa al añadir roles.
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      if (perms.includes('satellite:request')) expect([role, perms.includes('plot:read_geometry')]).toEqual([role, true]);
    }
  });

  it('una parcela de otra organización no existe para esta', async () => {
    await http().get(`/api/v1/organizations/${orgB}/plots/${plotA}/satellite`).set(as('admin-b@test.local')).expect(404);
  });

  // ---------------------------------------------------------------- encargo

  it('la petición devuelve ACEPTACIÓN, no resultado, y queda ligada a la versión geométrica exacta', async () => {
    const r = await ask(plotA).expect(201);
    expect(r.body.job).toMatchObject({
      status: 'REQUESTED', outcome: null, operation: 'FOREST_COVER', applies_to_current_version: true,
      provider: { code: 'FIXTURE_SYNTHETIC', kind: 'SYNTHETIC_FIXTURE' }, result: null,
    });
    expect(r.body.job.outcome_note).toMatch(/se ejecuta fuera de esta petición/);
    const version = await h.db.selectFrom('plot_versions').select(['id', 'geometry_hash']).where('plot_id', '=', plotA).orderBy('version_number', 'desc').executeTakeFirstOrThrow();
    expect(r.body.job.subject).toMatchObject({ plot_version_id: version.id, geometry_hash: version.geometry_hash });
    const ev = await h.db.selectFrom('domain_events').selectAll().where('aggregate_id', '=', r.body.job.id).executeTakeFirstOrThrow();
    expect(ev.event_type).toBe('SatelliteAnalysisRequested');
    expect(JSON.stringify(ev.payload)).not.toContain('-79.5'); // el evento no lleva coordenadas
  });

  it('el mismo identificador de operación no encarga dos veces; reutilizarlo en otra parcela es conflicto', async () => {
    const opId = randomUUID();
    const first = await http().post(`${org()}/plots/${plotA}/satellite/analyses`).set(as(ADMIN)).send({ operation_id: opId, operation: 'FOREST_COVER' }).expect(201);
    const again = await http().post(`${org()}/plots/${plotA}/satellite/analyses`).set(as(ADMIN)).send({ operation_id: opId, operation: 'FOREST_COVER' }).expect(201);
    expect(again.body).toMatchObject({ replayed: true, job: { id: first.body.job.id } });
    const other = await http().post(`${org()}/plots/${plotSinGeometria}/satellite/analyses`).set(as(ADMIN)).send({ operation_id: opId, operation: 'FOREST_COVER' }).expect(409);
    expect(other.body.error.code).toBe('OPERATION_ID_REUSED');
  });

  it('una versión sin geometría no se analiza y la superficie declarada no la sustituye', async () => {
    const r = await ask(plotSinGeometria).expect(422);
    expect(r.body.error.code).toBe('GEOMETRY_UNSUPPORTED');
    expect(r.body.error.message).toMatch(/superficie declarada no la sustituye/i);
  });

  it('el proveedor debe declarar la operación pedida', async () => {
    await sql`UPDATE satellite_providers SET supported_operations = ARRAY['FOREST_COVER']::text[] WHERE code = 'FIXTURE_SYNTHETIC'`.execute(h.db);
    const r = await ask(plotA, { operation: 'HISTORICAL_ANALYSIS' }).expect(422);
    expect(r.body.error.code).toBe('SATELLITE_OPERATION_NOT_SUPPORTED');
    await sql`UPDATE satellite_providers SET supported_operations = ARRAY['FOREST_COVER','DEFORESTATION_ALERTS','HISTORICAL_ANALYSIS']::text[] WHERE code = 'FIXTURE_SYNTHETIC'`.execute(h.db);
  });

  it('se puede cancelar un encargo pendiente, y solo mientras lo esté', async () => {
    const job = (await ask(plotA).expect(201)).body.job.id;
    const c = await http().post(`${org()}/satellite/analyses/${job}/cancel`).set(as(ADMIN)).send({ operation_id: randomUUID(), reason: 'Ya no se necesita' }).expect(201);
    expect(c.body).toMatchObject({ status: 'CANCELLED', outcome: 'CANCELLED', result: null });
    await http().post(`${org()}/satellite/analyses/${job}/cancel`).set(as(ADMIN)).send({ operation_id: randomUUID(), reason: 'Otra vez' }).expect(409);
  });

  // ---------------------------------------------------------------- desenlaces (QA-15)

  it('resultado disponible: procedencia completa, rótulo sintético y conclusión NO EVALUADA', async () => {
    const job = (await ask(plotA, { fixture_scenario: 'RESULT_COVERED' }).expect(201)).body.job.id;
    expect(await runner().runOnce()).toMatchObject({ claimed: 1, completed: 1 });
    const r = await http().get(`${org()}/satellite/analyses/${job}`).set(as(ADMIN)).expect(200);
    expect(r.body).toMatchObject({ status: 'COMPLETED', outcome: 'RESULT_AVAILABLE' });
    expect(r.body.result).toMatchObject({
      is_synthetic: true,
      provenance: { provider_code: 'FIXTURE_SYNTHETIC', dataset: 'FIXTURE_DATASET', dataset_version: '0.0.0-sintetico', resolution_m: '10.00' },
      coverage: { status: 'COVERED' },
      confidence: null,
      conclusion: 'NOT_EVALUATED',
    });
    expect(r.body.result.synthetic_warning).toMatch(/no es análisis satelital real/);
    expect(r.body.result.confidence_note).toMatch(/no se infiere/);
    expect(r.body.result.limitations).toMatch(/FIXTURE SINTÉTICA/);
    const ev = await h.db.selectFrom('domain_events').selectAll().where('aggregate_id', '=', job).where('event_type', '=', 'SatelliteAnalysisCompleted').executeTakeFirstOrThrow();
    expect(ev).toBeTruthy();
  });

  it('«sin cobertura» NO es un resultado favorable: termina en el acto, sin resultado y sin reintento', async () => {
    const job = (await ask(plotA, { fixture_scenario: 'NO_COVERAGE' }).expect(201)).body.job.id;
    expect(await runner({ maxAttempts: 5 }).runOnce()).toMatchObject({ failed: 1, retried: 0 });
    const r = await http().get(`${org()}/satellite/analyses/${job}`).set(as(ADMIN)).expect(200);
    expect(r.body).toMatchObject({ status: 'FAILED', outcome: 'NO_COVERAGE', result: null, attempts: 1 });
    expect(r.body.outcome_note).toMatch(/«Sin alertas» no equivale a «sin deforestación»/);
  });

  it('plazo vencido y cupo agotado se reintentan mientras queden intentos; al agotarlos terminan sin resultado', async () => {
    for (const scenario of ['TIMEOUT', 'RATE_LIMITED'] as const) {
      const job = (await ask(plotA, { fixture_scenario: scenario }).expect(201)).body.job.id;
      const r2 = runner({ maxAttempts: 2 });
      expect(await r2.runOnce()).toMatchObject({ retried: 1, failed: 0 });
      expect((await jobRow(job)).status).toBe('REQUESTED');
      expect(await r2.runOnce()).toMatchObject({ failed: 1 });
      const row = await jobRow(job);
      expect(row).toMatchObject({ status: 'FAILED', outcome: scenario, attempts: 2 });
      expect(await h.db.selectFrom('satellite_results').select('id').where('job_id', '=', job).execute()).toHaveLength(0);
    }
  });

  it('un destino bloqueado por la defensa de salida termina en el acto aunque queden intentos', async () => {
    const job = (await ask(plotA, { fixture_scenario: 'EGRESS_BLOCKED' }).expect(201)).body.job.id;
    expect(await runner({ maxAttempts: 5 }).runOnce()).toMatchObject({ failed: 1, retried: 0 });
    const row = await jobRow(job);
    expect(row).toMatchObject({ status: 'FAILED', outcome: 'EGRESS_BLOCKED', attempts: 1, last_error_code: 'EGRESS_HOST_NOT_ALLOWED' });
  });

  it('si la parcela cambia de versión antes de correr, el trabajo no se traslada a la geometría nueva', async () => {
    const job = (await ask(plotA).expect(201)).body.job.id;
    const v = (await h.db.selectFrom('plots').select('row_version').where('id', '=', plotA).executeTakeFirstOrThrow()).row_version;
    await http().post(`${org()}/plots/${plotA}/geometry-versions`).set(as(ADMIN))
      .send({ expected_version: Number(v), survey_method: 'MANUAL_COORDINATES', geometry: { type: 'Polygon', coordinates: [[[-78, -1], [-77.99, -1], [-77.99, -0.99], [-78, -0.99], [-78, -1]]] } }).expect(201);
    expect(await runner().runOnce()).toMatchObject({ superseded: 1 });
    const r = await http().get(`${org()}/satellite/analyses/${job}`).set(as(ADMIN)).expect(200);
    expect(r.body).toMatchObject({ status: 'FAILED', outcome: 'SUPERSEDED_GEOMETRY', applies_to_current_version: false, result: null });
    expect(r.body.outcome_note).toMatch(/no se traslada/);
  });

  // ---------------------------------------------------------------- candados de honestidad

  it('un resultado no se corrige en su sitio ni un trabajo terminado vuelve a cambiar', async () => {
    const job = (await ask(plotA, { fixture_scenario: 'RESULT_COVERED' }).expect(201)).body.job.id;
    await runner().runOnce();
    await expect(sql`UPDATE satellite_results SET coverage_note = 'otra cosa' WHERE job_id = ${job}`.execute(h.db)).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM satellite_results WHERE job_id = ${job}`.execute(h.db)).rejects.toThrow(/append-only/);
    await expect(sql`UPDATE satellite_jobs SET status = 'REQUESTED', outcome = NULL, finished_at = NULL WHERE id = ${job}`.execute(h.db)).rejects.toThrow(/terminado/);
    await expect(sql`DELETE FROM satellite_jobs WHERE id = ${job}`.execute(h.db)).rejects.toThrow(/no se borra/);
  });

  it('ningún resultado puede guardarse con una conclusión: el esquema solo admite NOT_EVALUATED', async () => {
    const job = (await ask(plotA).expect(201)).body.job.id;
    await expect(sql`
      INSERT INTO satellite_results (id, organization_id, job_id, provider_code, is_synthetic, coverage_status, coverage_note, limitations, indicators, conclusion)
      VALUES (gen_random_uuid(), ${orgA}, ${job}, 'FIXTURE_SYNTHETIC', true, 'COVERED', 'nota', 'limitaciones declaradas', '{}'::jsonb, 'LIBRE_DE_DEFORESTACION')`.execute(h.db))
      .rejects.toThrow(/satellite_results_conclusion_check/);
  });

  it('un resultado sintético nunca satisface el requisito de análisis de deforestación del expediente', async () => {
    const job = (await ask(plotA, { fixture_scenario: 'RESULT_COVERED' }).expect(201)).body.job.id;
    await runner().runOnce();
    const version = (await jobRow(job)).plot_version_id;
    // Es exactamente la consulta que usa el expediente (P0-022) para dar por cumplido el requisito.
    const usable = await sql<{ plot_version_id: string }>`
      SELECT DISTINCT j.plot_version_id FROM satellite_jobs j JOIN satellite_results r ON r.job_id = j.id
       WHERE j.organization_id = ${orgA} AND j.plot_version_id = ${version}
         AND j.outcome = 'RESULT_AVAILABLE' AND r.is_synthetic = false AND r.coverage_status = 'COVERED'`.execute(h.db);
    expect(usable.rows).toHaveLength(0);
  });

  it('la pantalla de parcela muestra el estado con sus límites escritos y sin coordenadas', async () => {
    const r = await http().get(`${org()}/plots/${plotA}/satellite`).set(as(ADMIN)).expect(200);
    expect(r.body.provider_selection).toMatchObject({ status: 'NOT_SELECTED', decision: 'D-09' });
    // Hay resultados sintéticos de pruebas anteriores: el estado sigue siendo NO EVALUADO.
    expect(r.body.analysis_status).toBe('NOT_EVALUATED');
    expect(r.body.limits.join(' ')).toMatch(/no es una conclusión jurídica/);
    expect(r.body.limits.join(' ')).toMatch(/«Sin alertas» no equivale a «sin deforestación»/);
    expect(JSON.stringify(r.body)).not.toContain('-79.5');
  });
});
