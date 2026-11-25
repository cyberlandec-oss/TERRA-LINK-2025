import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { describeDb, setupHarness, PASSWORD } from './helpers';

describeDb('Importar parcelas multiformato: lector GDAL real, PostGIS y autorización', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let org: string;
  let otherOrg: string;
  const ADMIN = 'admin-import@test.local';
  const PRODUCER = 'producer-import@test.local';
  const base = () => `/api/v1/organizations/${org}/plot-imports`;
  const shape = { type: 'Polygon', coordinates: [[[-80,-1],[-79.999,-1],[-79.999,-.999],[-80,-.999],[-80,-1]]] };
  const geo = (code: string, geometry: unknown = shape, producer = 'PROD') => Buffer.from(JSON.stringify({ type: 'Feature', properties: { codigo_parcela: code, codigo_productor: producer, cultivo: 'Cacao' }, geometry }));
  const options = { mode: 'GEOMETRY', columns: { plot_code: 'codigo_parcela', producer_code: 'codigo_productor', crop: 'cultivo' } };
  const upload = async (bytes: Buffer, filename = 'parcelas.geojson', actor = ADMIN) => (await h.http().post(base()).set(h.as(actor)).field('operation_id',randomUUID()).attach('file',bytes,filename).expect(201)).body;
  const preview = async (id: string, opts: unknown = options, actor = ADMIN) => (await h.http().post(`${base()}/${id}/preview`).set(h.as(actor)).send({ options: opts }).expect(201)).body;
  const confirm = (id: string, hash: string, extra = {}, actor = ADMIN) => h.http().post(`${base()}/${id}/confirm`).set(h.as(actor)).send({ plan_hash: hash, operation_id: randomUUID(), reason: 'Carga sintética de verificación', ...extra });
  beforeAll(async () => {
    h = await setupHarness();
    await h.app.listen(0);
    await h.user('super-import@test.local', 'SUPER_ADMIN');
    await h.user(ADMIN);
    org = (await h.http().post('/api/v1/organizations').set(h.as('super-import@test.local')).send({ name: 'Importaciones GIS', organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: ADMIN }).expect(201)).body.id;
    otherOrg = (await h.http().post('/api/v1/organizations').set(h.as('super-import@test.local')).send({ name: 'Otra organización GIS', organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: ADMIN }).expect(201)).body.id;
    const p = (await h.http().post(`/api/v1/organizations/${org}/producers`).set(h.as(ADMIN)).send({ producer_code: 'PROD', legal_name: 'Productor sintético' }).expect(201)).body;
    const inv = (await h.http().post(`/api/v1/organizations/${org}/invitations`).set(h.as(ADMIN)).send({ email: PRODUCER, role_code: 'PRODUCER' }).expect(201)).body;
    await h.http().post('/api/v1/invitations/accept').send({ token: inv.token, first_name: 'Persona', last_name: 'Productora', password: PASSWORD }).expect(200);
    await h.login(PRODUCER);
    const membership = await h.db.selectFrom('memberships as m').innerJoin('users as u','u.id','m.user_id').select('m.id').where('u.email','=',PRODUCER).where('m.organization_id','=',org).executeTakeFirstOrThrow();
    await h.http().put(`/api/v1/organizations/${org}/producers/${p.id}/self-membership`).set(h.as(ADMIN)).send({ expected_version: p.row_version, membership_id: membership.id, reason: 'Vínculo para comprobar alcance propio' }).expect(200);
  });
  afterAll(async () => h?.close());

  it('la vista previa no crea parcelas; confirmar persiste perímetro, área, procedencia y original exacto', async () => {
    const bytes = geo('GIS-1');
    const b = await upload(bytes);
    const p = await preview(b.id);
    expect(p).toMatchObject({ can_commit: true, summary: { create: 1 } });
    expect(await h.db.selectFrom('plots').select('id').where('plot_code','=','GIS-1').executeTakeFirst()).toBeUndefined();
    const operation = randomUUID();
    const result = await confirm(b.id,p.plan_hash,{operation_id:operation}).expect(201);
    const id = result.body.result.plots[0].id;
    const plot = (await h.http().get(`/api/v1/organizations/${org}/plots/${id}`).set(h.as(ADMIN)).expect(200)).body;
    expect(plot.current_version.geometry_type).toBe('POLYGON');
    expect(Number(plot.current_version.area_calculated_ha)).toBeGreaterThan(0);
    const source = await sql<{ source_file_import_id: string }>`SELECT source_file_import_id FROM plot_versions WHERE id=${plot.current_version.id}`.execute(h.db);
    expect(source.rows[0].source_file_import_id).toBe(b.id);
    await confirm(b.id,p.plan_hash,{operation_id:operation}).expect(201);
    const download = await h.http().get(`${base()}/${b.id}/original`).set(h.as(ADMIN)).expect(200);
    expect(Buffer.compare(download.body,bytes)).toBe(0);
  });
  it('reimportar no duplica ni crea versiones cuando el contenido no cambia', async () => {
    const b = await upload(geo('GIS-1'));
    const p = await preview(b.id);
    expect(p.summary.unchanged).toBe(1);
    await confirm(b.id,p.plan_hash).expect(201);
    const count = await sql<{ n: string }>`SELECT count(*) n FROM plot_versions v JOIN plots p ON p.id=v.plot_id WHERE p.plot_code='GIS-1'`.execute(h.db);
    expect(Number(count.rows[0].n)).toBe(1);
  });
  it('un perímetro nuevo exige confirmación expresa y conserva versión anterior', async () => {
    const changed = { type: 'Polygon', coordinates: [[[-80,-1],[-79.998,-1],[-79.998,-.998],[-80,-.998],[-80,-1]]] };
    const b = await upload(geo('GIS-1',changed)); const p = await preview(b.id);
    expect(p.rows[0]).toMatchObject({ action: 'UPDATE', geometry_changed: true });
    await confirm(b.id,p.plan_hash).expect(409);
    await confirm(b.id,p.plan_hash,{confirm_geometry_changes:true}).expect(201);
    const count = await sql<{ n: string }>`SELECT count(*) n FROM plot_versions v JOIN plots p ON p.id=v.plot_id WHERE p.plot_code='GIS-1'`.execute(h.db);
    expect(Number(count.rows[0].n)).toBe(2);
  });
  it('otro tenant y otra persona no leen una carga ni su original', async () => {
    const b = await upload(geo('GIS-PRIVATE'));
    await h.http().get(`/api/v1/organizations/${otherOrg}/plot-imports/${b.id}`).set(h.as(ADMIN)).expect(404);
    await h.http().get(`${base()}/${b.id}/original`).set(h.as(PRODUCER)).expect(404);
  });
  it('CSV sin CRS queda bloqueado; coma decimal y punto se guardan sin inventar perímetro', async () => {
    const b = await upload(Buffer.from('codigo_parcela;codigo_productor;cultivo;longitud;latitud\nGIS-POINT;PROD;Cacao;-80,1;-1,2\n'),'p.csv');
    const opts = { mode:'POINT', columns:{...options.columns,x:'longitud',y:'latitud'} };
    expect((await preview(b.id,opts)).can_commit).toBe(false);
    const p = await preview(b.id,{...opts,source_crs:'EPSG:4326'});
    expect(p.rows[0]).toMatchObject({ geometry: { type:'Point',coordinates:[-80.1,-1.2] },area_calculated_ha:null });
    const r = await confirm(b.id,p.plan_hash).expect(201);
    const plot = (await h.http().get(`/api/v1/organizations/${org}/plots/${r.body.result.plots[0].id}`).set(h.as(ADMIN)).expect(200)).body;
    expect(plot.current_version.geometry_type).toBe('POINT');
  });
  it('el productor importa sin permiso general de importación y el servidor resuelve su ficha propia', async () => {
    const b = await upload(geo('GIS-OWN',shape,''),'p.geojson',PRODUCER);
    const p = await preview(b.id,options,PRODUCER);
    expect(p.rows[0].producer_code).toBe('PROD');
    await confirm(b.id,p.plan_hash,{},PRODUCER).expect(201);
  });
  it('errores de una parcela bloquean el lote completo y un cambio concurrente exige revisar', async () => {
    const b = await upload(geo('GIS-INVALID',shape,'NO-EXISTE')); const invalid = await preview(b.id);
    expect(invalid.can_commit).toBe(false);
    await confirm(b.id,invalid.plan_hash).expect(409);
    const next = await upload(geo('GIS-1')); const p = await preview(next.id);
    await h.db.updateTable('plots').set({row_version:sql`row_version + 1`}).where('organization_id','=',org).where('plot_code','=','GIS-1').execute();
    await confirm(next.id,p.plan_hash).expect(409);
  });
  it('una geometría sin atributos admite códigos explícitos sin adivinar productor ni parcela', async () => {
    const b = await upload(Buffer.from(JSON.stringify(shape)));
    const p = (await h.http().post(`${base()}/${b.id}/preview`).set(h.as(ADMIN)).send({ options: { mode: 'GEOMETRY', columns: {} }, default_crop: 'Cacao', default_producer_code: 'PROD', default_plot_code: 'GIS-SINGLE' }).expect(201)).body;
    expect(p).toMatchObject({ can_commit: true, summary: { create: 1 } });
    await confirm(b.id,p.plan_hash).expect(201);
  });
  it('PRODUCER completa el perímetro de su punto sin cambiar parcela ni productor, conservando ambas versiones', async () => {
    const point = { type: 'Point', coordinates: [-80,-1] };
    const first = await upload(geo('GIS-OWN-EVOLUTION',point,''),'p.geojson',PRODUCER);
    const pending = await preview(first.id,options,PRODUCER);
    const saved = await confirm(first.id,pending.plan_hash,{},PRODUCER).expect(201);
    const id = saved.body.result.plots[0].id;
    const before = (await h.http().get(`/api/v1/organizations/${org}/plots/${id}`).set(h.as(PRODUCER)).expect(200)).body;
    expect(before.current_version.geometry_type).toBe('POINT');
    expect(before.current_version.area_calculated_ha).toBeNull();
    const next = await upload(geo('GIS-OWN-EVOLUTION',shape,'PROD'),'p.geojson',PRODUCER);
    const perimeter = await preview(next.id,options,PRODUCER);
    expect(perimeter.rows[0]).toMatchObject({ plot_id: id, action:'UPDATE', previous_geometry:point });
    await confirm(next.id,perimeter.plan_hash,{},PRODUCER).expect(409);
    const updated = await confirm(next.id,perimeter.plan_hash,{confirm_geometry_changes:true},PRODUCER).expect(201);
    expect(updated.body.result.plots[0].id).toBe(id);
    const after = (await h.http().get(`/api/v1/organizations/${org}/plots/${id}`).set(h.as(PRODUCER)).expect(200)).body;
    expect(before.producer.producer_code).toBe('PROD');
    expect(after.producer.id).toBe(before.producer.id);
    expect(after.current_version.geometry_type).toBe('POLYGON');
    expect(Number(after.current_version.area_calculated_ha)).toBeGreaterThan(0);
    const history = await sql<{ type: string }>`SELECT GeometryType(geometry) type FROM plot_versions WHERE organization_id=${org} AND plot_id=${id} ORDER BY version_number`.execute(h.db);
    expect(history.rows.map(v => v.type)).toEqual(['POINT','POLYGON']);
  });
  it('PRODUCER no puede usar código ajeno, valor común ajeno ni modificar una parcela de otro productor', async () => {
    const other = (await h.http().post(`/api/v1/organizations/${org}/producers`).set(h.as(ADMIN)).send({producer_code:'OTHER',legal_name:'Otra finca sintética'}).expect(201)).body;
    const plot = (await h.http().post(`/api/v1/organizations/${org}/plots`).set(h.as(ADMIN)).send({producer_id:other.id,plot_code:'GIS-OTHER',crop:'Cacao'}).expect(201)).body;
    for (const [code, producer] of [['GIS-ATTACK','OTHER'],['GIS-OTHER','PROD']]) {
      const b = await upload(geo(code,shape,producer),'p.geojson',PRODUCER);
      const p = await preview(b.id,options,PRODUCER);
      expect(p.can_commit).toBe(false);
      await confirm(b.id,p.plan_hash,{},PRODUCER).expect(409);
    }
    const b = await upload(geo('GIS-ATTACK-DEFAULT',shape,''),'p.geojson',PRODUCER);
    const p = (await h.http().post(`${base()}/${b.id}/preview`).set(h.as(PRODUCER)).send({options,default_producer_code:'OTHER'}).expect(201)).body;
    expect(p.can_commit).toBe(false);
    await confirm(b.id,p.plan_hash,{},PRODUCER).expect(409);
    expect(await h.db.selectFrom('plots').select('id').where('organization_id','=',org).where('plot_code','like','GIS-ATTACK%').execute()).toEqual([]);
    expect((await h.db.selectFrom('plots').select('producer_id').where('id','=',plot.id).executeTakeFirstOrThrow()).producer_id).toBe(other.id);
    await h.http().get(`/api/v1/organizations/${org}/plots/${plot.id}`).set(h.as(PRODUCER)).expect(404);
  });
});
