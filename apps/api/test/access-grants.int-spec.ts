import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { PASSWORD, describeDb, setupHarness } from './helpers';

// P0-003 / D-P0003.1 opción A — Concesiones externas, contra PostgreSQL real. Datos SINTÉTICOS.
// Contrato: `docs/decisiones/P0-003-CONCESIONES-Y-ELEVACION.md`.
//
// El acceso se demuestra con una CONCESIÓN REAL a una cuenta que **no es miembro** de la organización dueña.
// Una segunda membresía no es una concesión, y aquí se comprueba la diferencia: la misma cuenta externa, sin
// concesión, no ve nada; con concesión ve la proyección permitida; y la vía del concesionario no consulta
// membresías en ningún momento.
describeDb('P0-003 concesiones externas: alcance, vencimiento, revocación, clasificación y aislamiento', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let orgA = '';
  let orgB = '';
  let lote = '';
  let loteB = '';
  let externoId = '';
  const http = () => h.http();
  const as = (e: string) => h.as(e);
  const base = (o: string) => `/api/v1/organizations/${o}`;
  const today = new Date().toISOString().slice(0, 10);
  const ADMIN = 'admin-a@test.local';
  const ADMIN_B = 'admin-b@test.local';
  const EXTERNO = 'comprador-externo@test.local';   // NO es miembro de orgA
  const TEC = 'tecnico@test.local';
  const futuro = (dias = 7) => new Date(Date.now() + dias * 86400000).toISOString();

  async function join(o: string, email: string, role: string, admin = ADMIN) {
    const inv = await http().post(`${base(o)}/invitations`).set(as(admin)).send({ email, role_code: role }).expect(201);
    await http().post('/api/v1/invitations/accept').send({ token: inv.body.token, first_name: 'Persona', last_name: email.split('@')[0], password: PASSWORD }).expect(200);
    await h.login(email);
  }

  /** Producto y centro, una sola vez por organización: sus códigos son únicos por organización. */
  const comun: Record<string, { baba: string; centro: string }> = {};
  async function prepararOrg(org: string, admin: string, codigo: string) {
    const baba = (await http().post(`${base(org)}/products`).set(as(admin)).send({ code: 'CACAO_BABA', name: 'Cacao en baba', product_state: 'CACAO_BABA', unit: 'KG' }).expect(201)).body.id;
    const centro = (await http().post(`${base(org)}/locations`).set(as(admin)).send({ code: `C-${codigo}`, name: `Centro ${codigo}`, location_type: 'COLLECTION_CENTER' }).expect(201)).body.id;
    comun[org] = { baba, centro };
  }

  /** Lote con origen declarado (productor y parcela con geometría), en la organización indicada. */
  async function crearLote(org: string, admin: string, codigo: string) {
    const { baba, centro } = comun[org];
    const prod = (await http().post(`${base(org)}/producers`).set(as(admin)).send({ producer_code: `${codigo}-P`, legal_name: `Finca ${codigo}` }).expect(201)).body.id;
    const parcela = (await http().post(`${base(org)}/plots`).set(as(admin)).send({ producer_id: prod, plot_code: `${codigo}-PAR`, crop: 'Cacao' }).expect(201)).body.id;
    await http().post(`${base(org)}/plots/${parcela}/geometry-versions`).set(as(admin)).send({ expected_version: 1, survey_method: 'MANUAL_COORDINATES', geometry: { type: 'Point', coordinates: [-80.16, -0.848] }, area_declared_ha: 2 }).expect(201);
    const d = (await http().post(`${base(org)}/deliveries`).set(as(admin)).send({ operation_id: randomUUID(), producer_id: prod, product_id: baba, delivery_date: today, quantity_declared: '100', unit: 'KG', origins: [{ plot_id: parcela }], register: true }).expect(201)).body.delivery;
    const rec = (await http().post(`${base(org)}/deliveries/${d.id}/receptions`).set(as(admin)).send({ operation_id: randomUUID(), location_id: centro, received_at: new Date().toISOString(), weighing: { method: 'Báscula sintética', quantity: '100', unit: 'KG', weighed_on: today } }).expect(201)).body.reception_id;
    return (await http().post(`${base(org)}/lots`).set(as(admin)).send({ operation_id: randomUUID(), inputs: [{ reception_id: rec, quantity: '100' }] }).expect(201)).body.lot.id as string;
  }

  const conceder = (cuerpo: Record<string, unknown>, actor = ADMIN, org = orgA) =>
    http().post(`${base(org)}/access-grants`).set(as(actor)).send({ operation_id: randomUUID(), ...cuerpo });
  const leerConcedido = (grantId: string, actor = EXTERNO) => http().get(`/api/v1/granted/${grantId}`).set(as(actor));
  const mias = (actor = EXTERNO) => http().get('/api/v1/granted').set(as(actor));

  beforeAll(async () => {
    h = await setupHarness();
    await h.app.listen(0);
    await h.user('super@test.local', 'SUPER_ADMIN');
    await h.user(ADMIN);
    await h.user(ADMIN_B);
    const mk = async (n: string, admin: string) => (await http().post('/api/v1/organizations').set(as('super@test.local'))
      .send({ name: n, organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: admin }).expect(201)).body.id;
    orgA = await mk('Coop Concesiones A', ADMIN);
    orgB = await mk('Coop Concesiones B', ADMIN_B);
    await join(orgA, TEC, 'FIELD_TECHNICIAN');
    // La cuenta externa es miembro de orgB, NO de orgA: su acceso a orgA solo puede venir de una concesión.
    await join(orgB, EXTERNO, 'BUYER', ADMIN_B);
    externoId = (await sql<{ id: string }>`SELECT id FROM users WHERE email = ${EXTERNO}`.execute(h.db)).rows[0].id;
    await prepararOrg(orgA, ADMIN, 'A');
    await prepararOrg(orgB, ADMIN_B, 'B');
    lote = await crearLote(orgA, ADMIN, 'CA');
    loteB = await crearLote(orgB, ADMIN_B, 'CB');
  });
  afterAll(async () => h?.close());

  it('sin concesión, una cuenta externa no ve nada de la otra organización', async () => {
    expect((await mias().expect(200)).body.grants).toEqual([]);
    await http().get(`${base(orgA)}/lots/${lote}`).set(as(EXTERNO)).expect(404); // ni por la vía normal
    await leerConcedido(randomUUID()).expect(404); // ni inventando un identificador
  });

  it('solo ORG_ADMIN concede, y nadie concede lo que no tiene', async () => {
    // El técnico no tiene grant:manage.
    await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote, expires_at: futuro(), reason: 'Prueba' }, TEC).expect(403);
    // Un ORG_ADMIN de OTRA organización tampoco puede conceder sobre recursos de la primera.
    await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote, expires_at: futuro(), reason: 'Prueba' }, ADMIN_B, orgB).expect(422);
    // Conceder un recurso de otra organización desde la propia: la base lo impide.
    await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: loteB, expires_at: futuro(), reason: 'Ajeno' }).expect(422);
  });

  it('el vencimiento es obligatorio y futuro', async () => {
    await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote, reason: 'Sin vencimiento' }).expect(400);
    const pasado = await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote, expires_at: new Date(Date.now() - 1000).toISOString(), reason: 'Vencida ya' }).expect(422);
    expect(pasado.body.error.code).toBe('GRANT_EXPIRY_INVALID');
    // Conceder descarga sobre OTRO lote, para no ocupar la única concesión activa del lote compartido.
    const otro = await crearLote(orgA, ADMIN, 'CL');
    await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: otro, can_download: true, expires_at: futuro(), reason: 'Descarga' }).expect(201);
  });

  it('con una concesión real, la cuenta externa ve la proyección permitida y nada más', async () => {
    const g = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote, expires_at: futuro(), reason: 'Revisión del comprador' }).expect(201)).body.grant;
    expect(g).toMatchObject({ resource_type: 'LOT', resource_id: lote, can_read: true, can_download: false });

    const v = (await leerConcedido(g.id).expect(200)).body;
    expect(v).toMatchObject({ resource_type: 'LOT', status: expect.any(String), origin_status: expect.any(String) });
    // Agregados, no identidades: la concesión NO levanta la clasificación.
    expect(v.productores).toBeGreaterThan(0);
    expect(v.parcelas).toBeGreaterThan(0);
    const texto = JSON.stringify(v);
    expect(texto).not.toMatch(/Finca CA|CA-P\b/);         // ni razón social ni código de productor
    expect(texto).not.toMatch(/coordinates|geometry/i);    // ni geometrías
    expect(texto).not.toMatch(/document|archivo/i);         // ni documentos
    // Y la referencia pública viaja con la lectura autorizada por concesión.
    expect(v.public_reference).toMatch(/^[0-9a-f]{24}$/);

    // La concesión NO crea membresía ni da acceso general: la vía normal sigue cerrada.
    await http().get(`${base(orgA)}/lots/${lote}`).set(as(EXTERNO)).expect(404);
    await http().get(`${base(orgA)}/producers`).set(as(EXTERNO)).expect(404);
    // Contiene ESTA concesión; no se fija un total, que depende de otras pruebas del mismo archivo.
    expect((await mias().expect(200)).body.grants.map((x: { id: string }) => x.id)).toContain(g.id);
  });

  it('no concede acciones distintas de las concedidas, ni otros recursos', async () => {
    const otroLote = await crearLote(orgA, ADMIN, 'CC');
    const g = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: otroLote, expires_at: futuro(), reason: 'Solo este lote' }).expect(201)).body.grant;
    // La concesión es por INSTANCIA: con la de un lote no se lee otro.
    const gOtro = (await sql<{ id: string }>`SELECT id FROM access_grants WHERE resource_id = ${lote} AND revoked_at IS NULL`.execute(h.db)).rows[0];
    expect(gOtro.id).not.toBe(g.id);
    await leerConcedido(g.id).expect(200);
    // Otra cuenta no usa la concesión ajena, aunque sepa su identificador.
    await leerConcedido(g.id, ADMIN_B).expect(404);
  });

  it('la descarga entrega la MISMA proyección, identificada como vista compartida interna', async () => {
    const lote8 = await crearLote(orgA, ADMIN, 'CJ');
    const g = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote8, can_read: true, can_download: true, expires_at: futuro(), reason: 'Compartir' }).expect(201)).body.grant;
    const leido = (await leerConcedido(g.id).expect(200)).body;
    const bajado = await http().get(`/api/v1/granted/${g.id}/download`).set(as(EXTERNO)).expect(200);

    expect(bajado.headers['content-disposition']).toMatch(/attachment; filename="vista-compartida-lot-/);
    const archivo = JSON.parse(Buffer.isBuffer(bajado.body) ? bajado.body.toString('utf8') : JSON.stringify(bajado.body));
    // Se identifica como lo que es, y dice lo que NO es.
    expect(archivo.tipo_de_archivo).toBe('VISTA_COMPARTIDA_INTERNA');
    expect(archivo.aviso).toMatch(/NO es un DD_PACKAGE/);
    expect(archivo.aviso).toMatch(/NO acredita conformidad EUDR/);
    expect(archivo.limitaciones.length).toBeGreaterThan(0);
    expect(archivo.generado_en).toEqual(expect.any(String));
    // Y es EXACTAMENTE la proyección que ya podía leer: ni un campo más.
    expect(archivo.recurso).toEqual(leido);
    const texto = JSON.stringify(archivo);
    expect(texto).not.toMatch(/coordinates|geometry/i);
    expect(texto).not.toMatch(/Finca C|CJ-P/);

    // Sin la acción concedida no hay descarga, aunque se pueda leer.
    const soloLectura = await crearLote(orgA, ADMIN, 'CK');
    const g2 = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: soloLectura, expires_at: futuro(), reason: 'Solo lectura' }).expect(201)).body.grant;
    await leerConcedido(g2.id).expect(200);
    await http().get(`/api/v1/granted/${g2.id}/download`).set(as(EXTERNO)).expect(404);

    // Revocada, tampoco se descarga.
    await http().post(`${base(orgA)}/access-grants/${g.id}/revoke`).set(as(ADMIN)).send({ operation_id: randomUUID(), reason: 'Fin' }).expect(201);
    await http().get(`/api/v1/granted/${g.id}/download`).set(as(EXTERNO)).expect(404);
  });

  it('la revocación tiene efecto inmediato y no se reactiva', async () => {
    const lote2 = await crearLote(orgA, ADMIN, 'CD');
    const g = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote2, expires_at: futuro(), reason: 'Temporal' }).expect(201)).body.grant;
    await leerConcedido(g.id).expect(200);

    await http().post(`${base(orgA)}/access-grants/${g.id}/revoke`).set(as(ADMIN)).send({ operation_id: randomUUID(), reason: 'Fin de la revisión' }).expect(201);
    await leerConcedido(g.id).expect(404);               // inmediato
    expect((await mias().expect(200)).body.grants.map((x: { id: string }) => x.id)).not.toContain(g.id);
    // Revocada no vuelve, ni por la base.
    await expect(sql`UPDATE access_grants SET revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL WHERE id = ${g.id}`.execute(h.db)).rejects.toThrow(/no se reactiva/);
    // Y los términos nunca se editan.
    await expect(sql`UPDATE access_grants SET can_download = TRUE WHERE id = ${g.id}`.execute(h.db)).rejects.toThrow(/no se editan/);
  });

  it('una concesión vencida deja de servir, sin tocar la fila', async () => {
    const lote3 = await crearLote(orgA, ADMIN, 'CE');
    const g = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote3, expires_at: futuro(1), reason: 'Corta' }).expect(201)).body.grant;
    await leerConcedido(g.id).expect(200);
    // Se adelanta el reloj moviendo la creación: el vencimiento es inmutable, así que se recrea vencida aparte.
    await sql`UPDATE access_grants SET revoked_at = now(), revoked_by = granted_by, revoke_reason = 'cierre de prueba' WHERE id = ${g.id}`.execute(h.db);
    const vencida = randomUUID();
    await sql`INSERT INTO access_grants (id, organization_id, grantee_user_id, resource_type, resource_id, can_read, can_download, expires_at, reason, granted_by, operation_id, created_at)
      VALUES (${vencida}, ${orgA}, ${externoId}, 'LOT', ${lote3}, TRUE, FALSE, now() - interval '1 hour', 'Vencida sintética',
              (SELECT id FROM users WHERE email = ${ADMIN}), ${randomUUID()}, now() - interval '2 hours')`.execute(h.db);
    await leerConcedido(vencida).expect(404);
    expect((await mias().expect(200)).body.grants.map((x: { id: string }) => x.id)).not.toContain(vencida);
  });

  it('una cuenta desactivada no usa sus concesiones', async () => {
    const lote4 = await crearLote(orgA, ADMIN, 'CF');
    const g = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote4, expires_at: futuro(), reason: 'Antes de desactivar' }).expect(201)).body.grant;
    await leerConcedido(g.id).expect(200);
    await sql`UPDATE users SET status = 'INACTIVE' WHERE id = ${externoId}`.execute(h.db);
    // La autenticación rechaza antes una cuenta desactivada (401); si llegara al resolver, sería 404 opaco.
    // Cualquiera de las dos cierra el acceso: lo que no puede es responder 200.
    expect([401, 404]).toContain((await leerConcedido(g.id)).status);
    await sql`UPDATE users SET status = 'ACTIVE' WHERE id = ${externoId}`.execute(h.db);
    await leerConcedido(g.id).expect(200);
  });

  it('concurrencia: dos concesiones simultáneas del mismo recurso dejan una sola activa', async () => {
    const lote5 = await crearLote(orgA, ADMIN, 'CG');
    const cuerpo = { grantee_user_id: externoId, resource_type: 'LOT' as const, resource_id: lote5, expires_at: futuro(), reason: 'Concurrente' };
    const [a, b] = await Promise.all([conceder(cuerpo), conceder(cuerpo)]);
    const oks = [a, b].filter((r) => r.status === 201);
    expect(oks).toHaveLength(1);
    expect([a, b].filter((r) => r.status === 409)).toHaveLength(1);
    const activas = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM access_grants WHERE resource_id = ${lote5} AND revoked_at IS NULL`.execute(h.db)).rows[0].n;
    expect(activas).toBe('1');
  });

  it('rollback: si la auditoría falla, no queda concesión', async () => {
    const lote6 = await crearLote(orgA, ADMIN, 'CH');
    const antes = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM access_grants`.execute(h.db)).rows[0].n;
    const { AuditService } = await import('../src/audit/audit.service');
    const spy = jest.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(new Error('fallo simulado'));
    await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote6, expires_at: futuro(), reason: 'Rollback' }).expect(500);
    spy.mockRestore();
    expect((await sql<{ n: string }>`SELECT count(*)::text AS n FROM access_grants`.execute(h.db)).rows[0].n).toBe(antes);
  });

  it('se audita conceder, usar y revocar, sin secretos', async () => {
    const lote7 = await crearLote(orgA, ADMIN, 'CI');
    const g = (await conceder({ grantee_user_id: externoId, resource_type: 'LOT', resource_id: lote7, expires_at: futuro(), reason: 'Auditoría' }).expect(201)).body.grant;
    await leerConcedido(g.id).expect(200);
    await http().post(`${base(orgA)}/access-grants/${g.id}/revoke`).set(as(ADMIN)).send({ operation_id: randomUUID(), reason: 'Cierre' }).expect(201);
    const filas = (await sql<{ action: string }>`SELECT action FROM audit_logs WHERE entity_id = ${g.id} ORDER BY occurred_at`.execute(h.db)).rows.map((r) => r.action);
    expect(filas).toEqual(expect.arrayContaining(['grant.create', 'grant.read', 'grant.revoke']));
    const texto = JSON.stringify((await sql<{ after: unknown }>`SELECT after FROM audit_logs WHERE entity_id = ${g.id}`.execute(h.db)).rows);
    for (const prohibido of [PASSWORD, 'password', 'access_token']) expect(texto).not.toContain(prohibido);
  });
});
