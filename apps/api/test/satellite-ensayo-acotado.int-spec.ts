import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { PASSWORD, describeDb, setupHarness } from './helpers';
import { SatelliteRunner, parseTrialList } from '../src/satellite/runner';
import { WhispSatelliteProvider } from '../src/satellite/whisp';
import { coveredByOperationalProvider, satelliteInputs } from '../src/satellite/inputs';
import { deforestationRequirement, type DdContent } from '../src/dd/requirements';
import { migrateTo, migrateToLatest } from '../src/db/database';

// Ensayo local ACOTADO del análisis satelital (2026-11-01). PostgreSQL real, datos sintéticos, SIN llamadas a terceros (el proveedor real se vigila con un espía de red).
// Fija: (1) el adaptador en desarrollo (D-09 parte A) solo analiza una geometría artificial concreta cuando se cumplen las CUATRO condiciones — interruptor, lista válida, parcela+huella
// listadas y rótulo ENSAYO-; (2) una lista mal formada falla cerrada; (3) el worker lo revalida al ejecutar; (4) el encargo es manual e idempotente; (5) el trabajo conserva su
// alcance LOCAL_TRIAL y el expediente lo excluye aunque el proveedor pase después a SELECTED; (6) pantalla y API coinciden sobre cuándo puede solicitarse.
describeDb('satélite: ensayo local acotado a una geometría artificial listada', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let orgO = ''; let orgX = ''; let tOk = ''; let tNoLista = ''; let tSinRotulo = '';
  let hOk = ''; let hSin = ''; let hNo = '';
  const OWNER = 'admin-ens-o@test.local'; const XADMIN = 'admin-ens-x@test.local'; const EXPORT = 'export-ens@test.local';
  const http = () => h.http();
  const as = (e: string) => h.as(e);
  const base = (o: string) => `/api/v1/organizations/${o}`;
  const cuadro = (lon: number) => ({ type: 'Polygon', coordinates: [[[lon, -1], [lon + 0.001, -1], [lon + 0.001, -0.999], [lon, -0.999], [lon, -1]]] });
  const dias = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
  const guardar = { live: process.env.SATELLITE_LIVE_CALLS, ids: process.env.SATELLITE_TRIAL_PLOT_IDS };
  const hashDe = async (plot: string) => (await h.db.selectFrom('plot_versions as v').innerJoin('plots as p', 'p.current_version_id', 'v.id').select('v.geometry_hash').where('p.id', '=', plot).executeTakeFirstOrThrow()).geometry_hash!;

  async function join(admin: string, o: string, email: string, role: string) {
    const inv = await http().post(`${base(o)}/invitations`).set(as(admin)).send({ email, role_code: role }).expect(201);
    await http().post('/api/v1/invitations/accept').send({ token: inv.body.token, first_name: 'Persona', last_name: role.toLowerCase(), password: PASSWORD }).expect(200);
    await h.login(email);
  }
  const autorizadas = new Map<string, string>(); // una sola autorización vigente por parcela y destinataria
  const autorizar = async (plot: string) => autorizadas.get(plot) ?? (async () => { const id = await crear(plot); autorizadas.set(plot, id); return id; })();
  const crear = async (plot: string) => (await http().post(`${base(orgO)}/plots/${plot}/satellite/authorizations`).set(as(OWNER))
    .send({ operation_id: randomUUID(), grantee_organization_id: orgX, expires_at: dias(2), reason: 'Ensayo local acotado con geometría artificial' }).expect(201)).body.authorization.id as string;
  const pedir = (auth: string, op = randomUUID()) => http().post(`${base(orgX)}/satellite/authorized-plots/${auth}/analyses`).set(as(EXPORT)).send({ operation_id: op, operation: 'FOREST_COVER' });
  const vista = async (auth: string) => (await http().get(`${base(orgX)}/satellite/authorized-plots/${auth}`).set(as(EXPORT)).expect(200)).body;
  const configurar = (live: 'enabled' | 'disabled', lista: string) => { process.env.SATELLITE_LIVE_CALLS = live; process.env.SATELLITE_TRIAL_PLOT_IDS = lista; };
  const worker = () => new SatelliteRunner(h.db, [new WhispSatelliteProvider({ liveCalls: true })], {}, { maxAttempts: 1, backoffBaseMs: 1 });
  // Cambio posterior de proveedor (decisión D-09 parte B simulada SOLO en la base desechable): se guarda la fila original y se restaura.
  let original: { selection_status: string; selected_by: string | null; decision_reference: string | null } | null = null;
  const seleccionar = async () => {
    original = (await sql<{ selection_status: string; selected_by: string | null; decision_reference: string | null }>`SELECT selection_status, selected_by::text, decision_reference FROM satellite_providers WHERE code = 'WHISP'`.execute(h.db)).rows[0];
    const uid = (await sql<{ id: string }>`SELECT id FROM users LIMIT 1`.execute(h.db)).rows[0].id;
    await sql`UPDATE satellite_providers SET selection_status = 'SELECTED', selected_by = ${uid}, decision_reference = 'selección SINTÉTICA del ensayo (base desechable)' WHERE code = 'WHISP'`.execute(h.db);
  };
  const restaurar = async () => { if (original) await sql`UPDATE satellite_providers SET selection_status = ${original.selection_status}, selected_by = ${original.selected_by}, decision_reference = ${original.decision_reference} WHERE code = 'WHISP'`.execute(h.db); };

  beforeAll(async () => {
    h = await setupHarness();
    await h.user('super-ens@test.local', 'SUPER_ADMIN');
    await h.user(OWNER); await h.user(XADMIN);
    const mk = async (name: string, admin: string) => (await http().post('/api/v1/organizations').set(as('super-ens@test.local')).send({ name, organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: admin }).expect(201)).body.id;
    orgO = await mk('Asociación ENSAYO', OWNER); orgX = await mk('Exportadora ENSAYO', XADMIN);
    await join(XADMIN, orgX, EXPORT, 'EXPORT_MANAGER');
    const prod = (await http().post(`${base(orgO)}/producers`).set(as(OWNER)).send({ producer_code: 'P-ENS', legal_name: 'Finca ficticia de ensayo' }).expect(201)).body.id;
    const mkPlot = async (code: string, lon: number) => {
      const id = (await http().post(`${base(orgO)}/plots`).set(as(OWNER)).send({ producer_id: prod, plot_code: code, crop: 'Cacao' }).expect(201)).body.id as string;
      await http().post(`${base(orgO)}/plots/${id}/geometry-versions`).set(as(OWNER)).send({ expected_version: 1, survey_method: 'MANUAL_COORDINATES', geometry: cuadro(lon) }).expect(201);
      return id;
    };
    tOk = await mkPlot('ENSAYO-T1', -79.5); tNoLista = await mkPlot('ENSAYO-T2', -79.4); tSinRotulo = await mkPlot('PL-REAL', -79.3);
    hOk = await hashDe(tOk); hNo = await hashDe(tNoLista); hSin = await hashDe(tSinRotulo);
  });
  afterAll(async () => {
    if (guardar.live === undefined) delete process.env.SATELLITE_LIVE_CALLS; else process.env.SATELLITE_LIVE_CALLS = guardar.live;
    if (guardar.ids === undefined) delete process.env.SATELLITE_TRIAL_PLOT_IDS; else process.env.SATELLITE_TRIAL_PLOT_IDS = guardar.ids;
    jest.restoreAllMocks();
    await h?.close();
  });

  it('la lista falla cerrada: una sola entrada mal formada invalida toda la lista', () => {
    const ok = `${randomUUID()}:${'a'.repeat(64)}`;
    expect(parseTrialList({ SATELLITE_TRIAL_PLOT_IDS: ok } as NodeJS.ProcessEnv)).toHaveLength(1);
    expect(parseTrialList({ SATELLITE_TRIAL_PLOT_IDS: '' } as NodeJS.ProcessEnv)).toEqual([]);
    for (const mala of [`${ok},basura`, `${ok},${randomUUID()}`, `${ok},${randomUUID()}:corta`, `${ok},,`, randomUUID(), `${ok};${ok}`]) {
      expect(parseTrialList({ SATELLITE_TRIAL_PLOT_IDS: mala } as NodeJS.ProcessEnv)).toBe('INVALID');
    }
  });

  it('punto de partida: Whisp solo está seleccionado para desarrollo (parte A) y sin configuración no se encarga nada', async () => {
    expect((await h.db.selectFrom('satellite_providers').select('selection_status').where('code', '=', 'WHISP').executeTakeFirstOrThrow()).selection_status).toBe('SELECTED_FOR_DEVELOPMENT');
    configurar('disabled', '');
    const auth = await autorizar(tOk);
    expect((await pedir(auth).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
  });

  it('las cuatro condiciones a la vez: cada una que falte bloquea y no deja ningún trabajo', async () => {
    const aOk = await autorizar(tOk); const aNo = await autorizar(tNoLista); const aSin = await autorizar(tSinRotulo);
    const trabajos = async () => (await h.db.selectFrom('satellite_jobs').select('id').execute()).length;
    const antes = await trabajos();
    const e = (plot: string, hash: string) => `${plot}:${hash}`;
    configurar('disabled', e(tOk, hOk));                              // listada, sin interruptor
    expect((await pedir(aOk).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
    configurar('enabled', e(tOk, hOk));                               // con interruptor, otra parcela rotulada NO listada
    expect((await pedir(aNo).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
    configurar('enabled', e(tSinRotulo, hSin));                       // listada con su huella, pero sin el rótulo ENSAYO-
    expect((await pedir(aSin).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
    configurar('enabled', e(tOk, hNo));                               // parcela listada con la huella de OTRA geometría
    expect((await pedir(aOk).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
    configurar('enabled', `${e(tOk, hOk)},basura`);                   // una entrada válida más una mal formada: toda la lista queda inválida
    expect((await pedir(aOk).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
    configurar('enabled', tOk);                                       // formato antiguo (solo el identificador): no basta
    expect((await pedir(aOk).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
    expect(await trabajos()).toBe(antes);
  });

  it('pantalla y API coinciden: lo que la vista dice que se puede solicitar es exactamente lo que el servidor acepta', async () => {
    const aOk = await autorizar(tOk); const aNo = await autorizar(tNoLista); const aSin = await autorizar(tSinRotulo);
    configurar('enabled', `${tOk}:${hOk}`);
    for (const [auth, esperado] of [[aOk, true], [aNo, false], [aSin, false]] as const) {
      const v = await vista(auth);
      expect(v.can_request).toBe(esperado);
      if (!esperado) expect(v.request_blocked_reason).toMatch(/ADAPTADOR DE DESARROLLO/);
      const r = await pedir(auth, randomUUID());
      expect(r.status).toBe(esperado ? 201 : 409);
    }
    configurar('enabled', '');                                        // quitar la lista cierra también la vista
    expect((await vista(aOk)).can_request).toBe(false);
  });

  it('con las condiciones: UNA vez (manual e idempotente), el trabajo queda LOCAL_TRIAL, la geometría analizada coincide con la autorizada y el registro de D-09 no cambia', async () => {
    configurar('enabled', `${tOk}:${hOk}`);
    const auth = await autorizar(tOk);
    const op = randomUUID();
    const a = (await pedir(auth, op).expect(201)).body;
    expect(a.job).toMatchObject({ provider: { code: 'WHISP' }, analysis_scope: 'LOCAL_TRIAL', is_local_trial: true, subject: { geometry_hash: hOk } });
    const b = (await pedir(auth, op).expect(201)).body;               // recargar o reintentar con el mismo identificador
    expect(b.replayed).toBe(true);
    expect(await h.db.selectFrom('satellite_jobs').select('id').where('operation_id', '=', op).execute()).toHaveLength(1);
    expect((await h.db.selectFrom('satellite_jobs').select('scope').where('id', '=', a.job.id).executeTakeFirstOrThrow()).scope).toBe('LOCAL_TRIAL');
    await expect(sql`UPDATE satellite_jobs SET scope = 'OPERATIONAL' WHERE id = ${a.job.id}`.execute(h.db)).rejects.toThrow(/no se modifica/);
    const propia = (await http().get(`${base(orgO)}/plots/${tOk}/satellite`).set(as(OWNER)).expect(200)).body;
    expect(propia.provider_selection).toMatchObject({ status: 'SELECTED_FOR_DEVELOPMENT', decision: 'D-09 parte A', trial_scope: true });
    expect((await h.db.selectFrom('satellite_providers').select('selection_status').where('code', '=', 'WHISP').executeTakeFirstOrThrow()).selection_status).toBe('SELECTED_FOR_DEVELOPMENT');
    // Si la geometría cambia, la huella ya no coincide: la autorización deja de valer.
    const rv = Number((await http().get(`${base(orgO)}/plots/${tOk}`).set(as(OWNER)).expect(200)).body.row_version);
    await http().post(`${base(orgO)}/plots/${tOk}/geometry-versions`).set(as(OWNER)).send({ expected_version: rv, survey_method: 'MANUAL_COORDINATES', geometry: cuadro(-79.6) }).expect(201);
    expect((await pedir(auth).expect(409)).body.error.code).toBe('SATELLITE_REQUESTS_NOT_AUTHORIZED');
  });

  it('el worker revalida al ejecutar: si la parcela sale de la lista, el trabajo termina sin enviar nada; en la lista, pasa de esa comprobación', async () => {
    configurar('enabled', `${tNoLista}:${hNo}`);
    const auth = await autorizar(tNoLista);
    const id = (await pedir(auth).expect(201)).body.job.id as string;
    const espia = jest.spyOn(globalThis, 'fetch');
    configurar('enabled', '');                                        // sale de la lista antes de ejecutar
    await worker().runOnce();
    const j = await h.db.selectFrom('satellite_jobs').select(['status', 'last_error_code']).where('id', '=', id).executeTakeFirstOrThrow();
    expect(j.last_error_code).toBe('TRIAL_SCOPE_NOT_ALLOWED');
    expect(j.status).not.toBe('REQUESTED');
    expect(espia.mock.calls.filter((c) => /whisp|forestdatapartnership/i.test(String(c[0])))).toHaveLength(0);
    // Control: con la parcela y su huella de nuevo en la lista, el trabajo supera esta comprobación (puede fallar después por la credencial, que aquí no existe).
    configurar('enabled', `${tNoLista}:${hNo}`);
    const auth2 = await autorizar(tNoLista);
    const id2 = (await pedir(auth2, randomUUID()).expect(201)).body.job.id as string;
    await worker().runOnce();
    expect((await h.db.selectFrom('satellite_jobs').select('last_error_code').where('id', '=', id2).executeTakeFirstOrThrow()).last_error_code).not.toBe('TRIAL_SCOPE_NOT_ALLOWED');
    expect(espia.mock.calls.filter((c) => /whisp|forestdatapartnership/i.test(String(c[0])))).toHaveLength(0);
  });

  it('cambio posterior del proveedor: un resultado creado como ensayo sigue EXCLUIDO del requisito aunque Whisp pase a SELECTED', async () => {
    configurar('enabled', `${tOk}:${hOk}`);
    // El plot tOk cambió de geometría en una prueba anterior: se usa un trabajo de ensayo propio sobre tNoLista, con su resultado real (simulado en la base: no hay red).
    configurar('enabled', `${tNoLista}:${hNo}`);
    const auth = await autorizar(tNoLista);
    const jobId = (await pedir(auth).expect(201)).body.job.id as string;
    const job = await h.db.selectFrom('satellite_jobs').selectAll().where('id', '=', jobId).executeTakeFirstOrThrow();
    expect(job.scope).toBe('LOCAL_TRIAL');
    await sql`UPDATE satellite_jobs SET status = 'COMPLETED', outcome = 'RESULT_AVAILABLE', finished_at = now() WHERE id = ${jobId}`.execute(h.db);
    await h.db.insertInto('satellite_results').values({ id: randomUUID(), organization_id: orgO, job_id: jobId, provider_code: 'WHISP', is_synthetic: false, dataset: 'ensayo', dataset_version: '1', analysis_date: new Date(), resolution_m: null, method: 'ensayo', coverage_status: 'COVERED', coverage_note: 'Cobertura declarada en el ensayo', confidence: null, limitations: 'Resultado de ensayo local con geometría artificial', indicators: JSON.stringify({}), raw_object_key: null, raw_sha256: null } as never).execute();
    const entradas = await satelliteInputs(h.db as never, orgO, [job.plot_version_id]);
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({ provider_code: 'WHISP', is_synthetic: false, coverage_status: 'COVERED', scope: 'LOCAL_TRIAL' }); // el alcance viaja con la entrada del expediente
    // Whisp pasa a SELECTED (decisión posterior del propietario): el resultado SIGUE sin contar, por lo que ES, no por el estado del proveedor.
    await seleccionar();
    try {
      const sa = { selected_provider: 'WHISP', analyses: entradas.map((x) => ({ ...x, plot_code: 'ENSAYO-T2' })) };
      const r = deforestationRequirement({ plots: [{ plot_code: 'ENSAYO-T2', version_id: job.plot_version_id }], profiles: { satellite_provider: null, satellite_analysis: sa } } as unknown as DdContent);
      expect(r.status).not.toBe('MET');
      expect(r.detail).toMatch(/ENSAYO LOCAL/);
      // Lo que decide el requisito del expediente (dd.ts): el ensayo local NO cuenta como cobertura operativa; el mismo resultado sin la marca (uso operativo) SÍ.
      expect(coveredByOperationalProvider(entradas, 'WHISP')).toEqual([]);
      const sinMarca = entradas.map((x) => { const { scope, ...resto } = x; void scope; return resto; });
      expect(coveredByOperationalProvider(sinMarca, 'WHISP')).toEqual([job.plot_version_id]);
      expect(coveredByOperationalProvider(entradas.map((x) => ({ ...x, is_synthetic: true })), 'WHISP')).toEqual([]);
    } finally { await restaurar(); }
  });

  it('migración sobre datos reales: un trabajo REAL ya completado sobre una parcela ENSAYO- se marca LOCAL_TRIAL, el de otra parcela queda OPERATIONAL y el guardián de trabajos terminados sigue activo', async () => {
    // Se parte de un trabajo de proveedor externo, COMPLETADO, sobre una parcela ENSAYO- (como el ensayo real del 2026-10-30) y de otro sobre una parcela sin el rótulo.
    const usuario = (await sql<{ id: string }>`SELECT id FROM users LIMIT 1`.execute(h.db)).rows[0].id;
    const mkJob = async (plot: string, org: string) => {
      const v = await h.db.selectFrom('plot_versions as v').innerJoin('plots as p', 'p.current_version_id', 'v.id').select(['v.id as vid', 'v.geometry_hash', 'v.geometry_type']).where('p.id', '=', plot).executeTakeFirstOrThrow();
      const id = randomUUID();
      await h.db.insertInto('satellite_jobs').values({
        id, organization_id: org, plot_id: plot, plot_version_id: v.vid, geometry_hash: v.geometry_hash!, geometry_type: v.geometry_type as 'POLYGON', provider_code: 'WHISP', provider_kind: 'EXTERNAL_HTTP',
        adapter_contract_version: '1', operation: 'FOREST_COVER', request_fingerprint: randomUUID().replace(/-/g, '').padEnd(64, '0'), status: 'REQUESTED', outcome: null, requested_by: usuario,
        operation_id: randomUUID(), requesting_organization_id: org,
      } as never).execute();
      await sql`UPDATE satellite_jobs SET status = 'RUNNING' WHERE id = ${id}`.execute(h.db);
      await sql`UPDATE satellite_jobs SET status = 'COMPLETED', outcome = 'RESULT_AVAILABLE', finished_at = now() WHERE id = ${id}`.execute(h.db);
      return id;
    };
    const conRotulo = await mkJob(tOk, orgO);
    const sinRotulo = await mkJob(tSinRotulo, orgO);
    await migrateTo(h.db, '0078_eudr_is_presentaciones');
    expect((await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'satellite_jobs' AND column_name = 'scope'`.execute(h.db)).rows).toHaveLength(0);
    await migrateToLatest(h.db);
    const alcance = async (id: string) => (await h.db.selectFrom('satellite_jobs').select('scope').where('id', '=', id).executeTakeFirstOrThrow()).scope;
    expect(await alcance(conRotulo)).toBe('LOCAL_TRIAL');
    expect(await alcance(sinRotulo)).toBe('OPERATIONAL');
    await expect(sql`UPDATE satellite_jobs SET status = 'REQUESTED' WHERE id = ${conRotulo}`.execute(h.db)).rejects.toThrow(/no vuelve a cambiar de estado/);
    await expect(sql`UPDATE satellite_jobs SET scope = 'OPERATIONAL' WHERE id = ${conRotulo}`.execute(h.db)).rejects.toThrow();
  });
});
