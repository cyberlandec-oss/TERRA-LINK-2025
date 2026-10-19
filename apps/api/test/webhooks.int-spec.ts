process.env.WEBHOOK_ALLOW_LOCAL = 'true';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { OutboxWorker } from '../src/events/outbox-worker';
import { webhookConsumer, firmar, verificarFirma, esDireccionInterna } from '../src/integration/webhooks';
import { PII_CIPHER, type PiiCipher } from '../src/crypto/pii';
import { PASSWORD, describeDb, setupHarness } from './helpers';

// P1-008 (RF-39; `docs/18:209`) — Integración ERP/API por webhooks, contra un **receptor local**.
//
// El receptor lo levanta esta misma prueba en 127.0.0.1: **no se contacta ningún destino externo**, ni real
// ni de ejemplo. Lo que cada caso protege:
//   · **firma** verificable por el receptor, y firma inválida o caducada que NO cuela;
//   · **idempotencia**: identificador de entrega estable y un evento ya entregado que **no** se reenvía;
//   · **tenant**: un destino recibe los eventos de SU organización y de ninguna otra;
//   · **referencia exacta** de paquete y de presentación en el cuerpo;
//   · **secreto protegido**: se entrega una vez, nunca se vuelve a publicar y no queda en claro;
//   · **destinos internos**: la configuración no abre el acceso a la red privada;
//   · **fallo y recuperación**: el intento fallido queda registrado con su causa y el bus reintenta.
describeDb('P1-008 integración por webhooks (PostgreSQL real, receptor local)', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let cipher: PiiCipher;
  let orgA: string;
  let orgB: string;
  let servidor: Server;
  let puerto: number;

  /** Lo que llega al receptor local, con la ruta por la que entró: así cada destino se distingue. */
  const recibidas: Array<{ path: string; body: string; headers: Record<string, string | string[] | undefined> }> = [];
  /** Lo que el receptor contesta. Cambiándolo se provoca el fallo. */
  let respuesta = { status: 200, body: 'ok' };

  const http = () => h.http();
  const as = (e: string) => h.as(e);
  const api = (o: string) => `/api/v1/organizations/${o}`;
  const wh = (o: string) => `${api(o)}/integration/webhooks`;
  const SUPER = 'super-wh@test.local';
  const ADMIN = 'admin-wh@test.local';
  const ADMIN_B = 'admin-whb@test.local';
  const TEC = 'tecnico-wh@test.local';

  /** Vacía el bus con el consumidor de webhooks: los reintentos y la cola muerta son los del bus. */
  const entregar = async () => {
    const w = new OutboxWorker(h.db, [webhookConsumer(h.db, cipher)], { workerId: 'wh-test', backoffBaseMs: 1, maxAttempts: 2 });
    for (let i = 0; i < 30; i += 1) if ((await w.runOnce()).claimed === 0) break;
  };

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      let cuerpo = '';
      req.on('data', (c) => { cuerpo += c; });
      req.on('end', () => {
        recibidas.push({ path: req.url ?? '', body: cuerpo, headers: req.headers });
        res.writeHead(respuesta.status, { 'content-type': 'text/plain' });
        res.end(respuesta.body);
      });
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    puerto = (servidor.address() as AddressInfo).port;

    h = await setupHarness();
    cipher = h.app.get<PiiCipher>(PII_CIPHER);
    await h.user(SUPER, 'SUPER_ADMIN');
    await h.user(ADMIN);
    await h.user(ADMIN_B);
    const mk = async (n: string, admin: string) => (await http().post('/api/v1/organizations').set(as(SUPER))
      .send({ name: n, organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: admin }).expect(201)).body.id;
    orgA = await mk('Coop Webhooks A', ADMIN);
    orgB = await mk('Coop Webhooks B', ADMIN_B);
    const inv = await http().post(`${api(orgA)}/invitations`).set(as(ADMIN)).send({ email: TEC, role_code: 'FIELD_TECHNICIAN' }).expect(201);
    await http().post('/api/v1/invitations/accept').send({ token: inv.body.token, first_name: 'Tec', last_name: 'Wh', password: PASSWORD }).expect(200);
    await h.login(TEC);
  });
  afterAll(async () => {
    await new Promise<void>((r) => servidor.close(() => r()));
    await h?.close();
  });

  const url = (code: string) => `http://127.0.0.1:${puerto}/recibe/${code}`;
  const configurar = (code: string, extra: Record<string, unknown> = {}, actor = ADMIN, org = orgA) =>
    http().post(wh(org)).set(as(actor))
      .send({ operation_id: randomUUID(), code, url: url(code), event_types: ['ProducerRegistered'], ...extra });
  const crearProductor = (codigo: string, org = orgA, actor = ADMIN) =>
    http().post(`${api(org)}/producers`).set(as(actor)).send({ producer_code: codigo, legal_name: `Finca ${codigo}` });
  const porRuta = (code: string) => recibidas.filter((r) => r.path === `/recibe/${code}`);

  it('FIRMA: se genera y se verifica; alterada, con otro secreto o caducada NO cuela', () => {
    const secreto = 'secreto-de-prueba';
    const cuerpo = JSON.stringify({ hola: 'mundo' });
    const ahora = Date.now();
    const f = firmar(secreto, cuerpo, Math.floor(ahora / 1000));

    expect(verificarFirma(secreto, cuerpo, f, 300, ahora)).toBe(true);
    expect(verificarFirma(secreto, `${cuerpo} `, f, 300, ahora)).toBe(false);   // cuerpo alterado
    expect(verificarFirma('otro', cuerpo, f, 300, ahora)).toBe(false);          // otro secreto
    expect(verificarFirma(secreto, cuerpo, 'v1=abc', 300, ahora)).toBe(false);  // mal formada
    expect(verificarFirma(secreto, cuerpo, '', 300, ahora)).toBe(false);
    // El instante va DENTRO de lo firmado: una entrega capturada no se reutiliza más tarde.
    expect(verificarFirma(secreto, cuerpo, f, 300, ahora + 3_600_000)).toBe(false);
  });

  it('DESTINOS INTERNOS: se reconocen los rangos que la configuración no debe alcanzar', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.1.1', '::1', 'fd00::1', '224.0.0.1', '::ffff:10.0.0.1']) {
      expect(esDireccionInterna(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888']) {
      expect(esDireccionInterna(ip)).toBe(false);
    }
  });

  it('EL SECRETO se entrega UNA vez: no vuelve por la API ni queda en claro en la base', async () => {
    const r = (await configurar('erp').expect(201)).body;
    expect(typeof r.secret).toBe('string');
    expect(r.secret.length).toBeGreaterThan(20);
    expect(r.secret_note).toMatch(/no se vuelve a mostrar/i);

    const lista = (await http().get(wh(orgA)).set(as(ADMIN)).expect(200)).body;
    expect(JSON.stringify(lista)).not.toContain(r.secret);
    const d = lista.destinations.find((x: { code: string }) => x.code === 'erp');
    expect(d.secret_fingerprint).toHaveLength(16);
    expect(d.url).toBe(url('erp'));

    const fila = await h.db.selectFrom('webhook_destinations').select(['secret_cipher'])
      .where('organization_id', '=', orgA).where('code', '=', 'erp').executeTakeFirstOrThrow();
    expect(fila.secret_cipher).not.toContain(r.secret);
    expect(fila.secret_cipher.startsWith('v1.')).toBe(true);

    // Tampoco entra en la auditoría: solo su huella.
    const aud = await h.db.selectFrom('audit_logs').select(['after'])
      .where('organization_id', '=', orgA).where('action', '=', 'integration.destination_configured')
      .orderBy('occurred_at', 'desc').executeTakeFirstOrThrow();
    expect(JSON.stringify(aud.after)).not.toContain(r.secret);
    expect(JSON.stringify(aud.after)).toContain(d.secret_fingerprint);
  });

  it('ENTREGA FIRMADA: el receptor local recibe el evento, verifica la firma y ve sus referencias', async () => {
    recibidas.length = 0;
    respuesta = { status: 200, body: 'ok' };
    const cfg = (await configurar('erp2').expect(201)).body;

    await crearProductor('WH-1').expect(201);
    await entregar();

    const mias = porRuta('erp2');
    expect(mias).toHaveLength(1);
    const entrega = mias[0];

    // La firma se verifica con el secreto que se entregó una vez.
    expect(verificarFirma(cfg.secret, entrega.body, String(entrega.headers['x-terra-signature']))).toBe(true);
    // Y NO con otro secreto: la comprobación discrimina.
    expect(verificarFirma('secreto-equivocado', entrega.body, String(entrega.headers['x-terra-signature']))).toBe(false);

    expect(String(entrega.headers['x-terra-delivery-id'])).toMatch(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i);
    expect(entrega.headers['x-terra-event-type']).toBe('ProducerRegistered');
    expect(entrega.headers['x-terra-organization']).toBe(orgA);

    const cuerpo = JSON.parse(entrega.body);
    expect(cuerpo.event.type).toBe('ProducerRegistered');
    expect(cuerpo.organization_id).toBe(orgA);
    expect(cuerpo.subject.aggregate_type).toBe('PRODUCER');
    expect(cuerpo.disclaimer).toMatch(/No acredita conformidad EUDR ni presentación oficial/i);
    // Un evento de productor no trae referencia de paquete: no se inventa.
    expect(cuerpo.references.package).toBeUndefined();

    // El resultado se consulta.
    const intentos = (await http().get(`${wh(orgA)}/attempts?code=erp2`).set(as(ADMIN)).expect(200)).body;
    expect(intentos.attempts).toHaveLength(1);
    expect(intentos.attempts[0]).toMatchObject({ code: 'erp2', status: 'ENTREGADO', http_status: 200, attempt: 1, event_type: 'ProducerRegistered' });
    expect(intentos.attempts[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('IDEMPOTENCIA: reprocesar el bus NO vuelve a entregar lo ya entregado', async () => {
    const antes = porRuta('erp2').length;
    const n = async () => (await h.db.selectFrom('webhook_attempts').select(sql<number>`count(*)::int`.as('n'))
      .where('organization_id', '=', orgA).executeTakeFirstOrThrow()).n;
    const intentosAntes = await n();

    // Se reencola el mismo evento: el consumidor ve que ese destino ya lo recibió y no repite el envío.
    await sql`UPDATE event_deliveries SET status = 'PENDING', next_attempt_at = now(), locked_until = NULL, locked_by = NULL, lease_token = NULL
              WHERE consumer = 'webhook'`.execute(h.db);
    await entregar();

    expect(porRuta('erp2')).toHaveLength(antes);   // el receptor NO recibió nada más
    expect(await n()).toBe(intentosAntes);         // ni se registró otro intento

    // Y la base lo impide aunque se intentara a mano: una sola entrega lograda por destino y evento.
    const e = await h.db.selectFrom('webhook_attempts').select(['destination_id', 'event_id'])
      .where('status', '=', 'ENTREGADO').executeTakeFirstOrThrow();
    await expect(h.db.insertInto('webhook_attempts').values({
      id: randomUUID(), organization_id: orgA, destination_id: e.destination_id, event_id: e.event_id,
      delivery_id: `${e.event_id}:${e.destination_id}`, attempt: 99, status: 'ENTREGADO',
      http_status: 200, response_excerpt: null, error: null, duration_ms: 1,
    }).execute()).rejects.toThrow();
  });

  it('TENANT: un destino NO recibe eventos de otra organización', async () => {
    recibidas.length = 0;
    await crearProductor('WH-B', orgB, ADMIN_B).expect(201);
    await entregar();
    // La organización B no tiene destinos: no sale nada, y los de A no reciben lo ajeno.
    expect(recibidas).toHaveLength(0);
    const fugas = await h.db.selectFrom('webhook_attempts as a')
      .innerJoin('domain_events as e', 'e.event_id', 'a.event_id')
      .select(sql<number>`count(*)::int`.as('n'))
      .whereRef('a.organization_id', '!=', 'e.organization_id').executeTakeFirstOrThrow();
    expect(fugas.n).toBe(0);
  });

  it('FALLO Y RECUPERACIÓN: el rechazo queda registrado con su causa, y al reintentar se entrega', async () => {
    recibidas.length = 0;
    respuesta = { status: 500, body: 'no puedo ahora' };
    await configurar('erp-falla').expect(201);
    await crearProductor('WH-2').expect(201);
    await entregar();

    const fallidos = (await http().get(`${wh(orgA)}/attempts?code=erp-falla`).set(as(ADMIN)).expect(200)).body;
    const fallo = fallidos.attempts.find((a: { status: string }) => a.status === 'RECHAZADO');
    expect(fallo).toBeDefined();
    expect(fallo.http_status).toBe(500);
    expect(fallo.response_excerpt).toContain('no puedo ahora');
    expect(fallidos.note).toMatch(/reintentos los gobierna el bus/i);

    // El receptor se recupera y el bus reintenta: ahora sí entrega, y el intento es el siguiente.
    respuesta = { status: 200, body: 'ok' };
    await sql`UPDATE event_deliveries SET status = 'PENDING', next_attempt_at = now(), locked_until = NULL, locked_by = NULL, lease_token = NULL
              WHERE consumer = 'webhook' AND status <> 'DONE'`.execute(h.db);
    await entregar();

    const tras = (await http().get(`${wh(orgA)}/attempts?code=erp-falla`).set(as(ADMIN)).expect(200)).body;
    const ok = tras.attempts.find((a: { status: string }) => a.status === 'ENTREGADO');
    expect(ok).toBeDefined();
    expect(ok.attempt).toBeGreaterThan(fallo.attempt);
    // El identificador de entrega es el MISMO entre intentos: el receptor descarta duplicados con él.
    expect(ok.delivery_id).toBe(fallo.delivery_id);
    expect(porRuta('erp-falla').length).toBeGreaterThanOrEqual(2);
  });

  it('PERMISOS: configurar exige su permiso y consultar es otro; el técnico no tiene ninguno', async () => {
    expect((await configurar('erp-tec', {}, TEC)).status).toBe(403);
    expect((await http().get(wh(orgA)).set(as(TEC))).status).toBe(403);
    expect((await http().get(`${wh(orgA)}/attempts`).set(as(TEC))).status).toBe(403);
    // CONTROL autorizado: el administrador SÍ.
    await http().get(wh(orgA)).set(as(ADMIN)).expect(200);
    await http().get(`${wh(orgA)}/attempts`).set(as(ADMIN)).expect(200);
  });

  it('AISLAMIENTO: ni se ven ni se configuran destinos de otra organización', async () => {
    expect((await http().get(wh(orgB)).set(as(ADMIN))).status).toBe(404);
    expect((await http().get(`${wh(orgB)}/attempts`).set(as(ADMIN))).status).toBe(404);
    expect((await configurar('intruso', {}, ADMIN, orgB)).status).toBe(404);
    // CONTROL autorizado: el administrador de B sí ve lo suyo, y no ve nada de A.
    await http().get(wh(orgB)).set(as(ADMIN_B)).expect(200);
    const deB = (await http().get(`${wh(orgB)}/attempts`).set(as(ADMIN_B)).expect(200)).body;
    expect(deB.attempts).toHaveLength(0);
  });

  it('VERIFICAR FIRMA: la utilidad acepta la buena y rechaza la de otro secreto', async () => {
    const cfg = (await configurar('erp-verif').expect(201)).body;
    const cuerpo = JSON.stringify({ prueba: true });
    const buena = firmar(cfg.secret, cuerpo, Math.floor(Date.now() / 1000));
    const ok = (await http().post(`${wh(orgA)}/erp-verif/verify-signature`).set(as(ADMIN)).send({ body: cuerpo, signature: buena }).expect(201)).body;
    expect(ok.valid).toBe(true);
    const mala = firmar('otro-secreto', cuerpo, Math.floor(Date.now() / 1000));
    const no = (await http().post(`${wh(orgA)}/erp-verif/verify-signature`).set(as(ADMIN)).send({ body: cuerpo, signature: mala }).expect(201)).body;
    expect(no.valid).toBe(false);
    expect(no.note).toMatch(/NO es válida/i);
  });

  it('ROTAR exige motivo y genera otro secreto; la versión anterior se conserva', async () => {
    const primera = (await configurar('erp-rota').expect(201)).body;
    const sinMotivo = await configurar('erp-rota');
    expect(sinMotivo.status).toBe(422);
    expect(sinMotivo.body.error.code).toBe('REASON_REQUIRED');

    const segunda = (await configurar('erp-rota', { reason: 'Rotación periódica del secreto.' }).expect(201)).body;
    expect(segunda.secret).not.toBe(primera.secret);
    const versiones = await h.db.selectFrom('webhook_destinations').select(['version'])
      .where('organization_id', '=', orgA).where('code', '=', 'erp-rota').execute();
    expect(versiones.map((v) => v.version).sort()).toEqual([1, 2]);

    // Append-only de verdad: el destino no se edita ni se borra.
    await expect(sql`UPDATE webhook_destinations SET url = 'x' WHERE code = 'erp-rota'`.execute(h.db)).rejects.toThrow(/append-only/);
    const unIntento = await h.db.selectFrom('webhook_attempts').select(['id']).executeTakeFirstOrThrow();
    await expect(sql`DELETE FROM webhook_attempts WHERE id = ${unIntento.id}`.execute(h.db)).rejects.toThrow(/append-only/);
  });

  it('IDEMPOTENCIA DE LA CONFIGURACIÓN: repetir la operación no crea otra versión ni otro secreto', async () => {
    const op = randomUUID();
    const a = await http().post(wh(orgA)).set(as(ADMIN))
      .send({ operation_id: op, code: 'erp-idem', url: url('erp-idem'), event_types: ['ProducerRegistered'] }).expect(201);
    const b = await http().post(wh(orgA)).set(as(ADMIN))
      .send({ operation_id: op, code: 'erp-idem', url: url('erp-idem'), event_types: ['ProducerRegistered'] }).expect(201);
    expect(a.body.replayed).toBe(false);
    expect(b.body.replayed).toBe(true);
    expect(b.body.secret).toBeNull();   // el secreto NO se reemite en la repetición
    const n = await h.db.selectFrom('webhook_destinations').select(sql<number>`count(*)::int`.as('n'))
      .where('organization_id', '=', orgA).where('code', '=', 'erp-idem').executeTakeFirstOrThrow();
    expect(n.n).toBe(1);
  });

  it('UN TIPO DE EVENTO INEXISTENTE se rechaza: suscribirse a nada parecería estar bien', async () => {
    const r = await configurar('erp-fantasma', { event_types: ['ProducerCreated'] });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('EVENT_TYPE_UNKNOWN');
    expect(r.body.error.message).toContain('ProducerCreated');
    // CONTROL: el tipo real SÍ se admite, y el catálogo lo publica.
    await configurar('erp-real', { event_types: ['ProducerRegistered'] }).expect(201);
    const lista = (await http().get(wh(orgA)).set(as(ADMIN)).expect(200)).body;
    expect(lista.event_catalog).toContain('ProducerRegistered');
    expect(lista.event_catalog).not.toContain('ProducerCreated');
  });

  it('URL: se rechaza lo que no es una dirección admisible', async () => {
    expect((await configurar('malo', { url: 'no-es-una-url' })).status).toBe(422);
    expect((await configurar('malo2', { url: 'ftp://host/x' })).status).toBe(422);
    expect((await configurar('malo3', { url: 'https://no-resuelve.invalid/x' })).status).toBe(422);
    expect((await configurar('malo4', { event_types: [] })).status).toBe(400);
  });
});
