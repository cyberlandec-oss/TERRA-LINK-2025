import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'https';
import { tmpdir } from 'os';
import { join } from 'path';
import { EgressBlocked, guardedLookup, requestExternal, type LookupFn } from './egress';

// P0-028 · QA-15, NIVEL 2: el TRANSPORTE con servidores controlados.
//
// `egress.spec.ts` comprueba las decisiones puras (URL, direcciones, redacción). Eso no demuestra que la
// política se aplique de verdad al conectar. Aquí se levantan dos servidores HTTPS reales en el equipo —uno
// en la lista blanca y otro NO— y se comprueba contra sockets de verdad:
//   · un host fuera de la lista no abre ninguna conexión (el servidor prohibido no registra ninguna petición);
//   · la comprobación de direcciones la aplica el propio transporte, no una función suelta;
//   · una redirección NO se sigue y el destino de la redirección NO recibe la credencial;
//   · el tope de tamaño y el plazo cortan la llamada.
//
// Lo que sigue SIN estar cubierto: una llamada contra un proveedor externo real. No hay proveedor
// seleccionado (D-09) y no se envían geometrías ni se usan claves reales. Queda declarado como pendiente.
//
// El certificado es efímero (carpeta temporal del sistema, nunca el repositorio) y se genera con `openssl`.
// Si no está disponible, la suite se marca como NO EJECUTADA en vez de fingir que pasó.

const openssl = spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0;
const describeTls = openssl ? describe : describe.skip;

interface Recorded { url: string; headers: Record<string, string | string[] | undefined> }
interface Controlled { server: Server; port: number; recibidas: Recorded[] }

describeTls('P0-028 · QA-15 nivel 2: el transporte aplica la política (servidores controlados)', () => {
  let dir: string;
  let ca: string;
  let destino: Controlled;
  let prohibido: Controlled;
  const TIMEOUT = 4000;
  const MAX = 64 * 1024;
  // Resolución inyectada: los nombres de prueba no existen en DNS y los servidores escuchan en 127.0.0.1.
  // Se usa SOLO donde la prueba no trata sobre la resolución; hay un caso que usa la real.
  const aLoopback: LookupFn = ((_h: string, o: unknown, cb: (...a: unknown[]) => void) => {
    const fn = typeof o === 'function' ? (o as (...a: unknown[]) => void) : cb;
    const opts = (typeof o === 'function' ? {} : o) as Record<string, unknown>;
    return opts.all ? fn(null, [{ address: '127.0.0.1', family: 4 }]) : fn(null, '127.0.0.1', 4);
  }) as LookupFn;

  const levantar = async (responder: (url: string, res: import('http').ServerResponse) => void): Promise<Controlled> => {
    const recibidas: Recorded[] = [];
    const server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
      recibidas.push({ url: req.url ?? '', headers: req.headers });
      responder(req.url ?? '', res);
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    return { server, port: (server.address() as { port: number }).port, recibidas };
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tl-egress-'));
    // OPENSSL_CONF propio y vacío: el equipo puede tener la variable apuntando a un archivo inexistente
    // (p. ej. el de un cliente ODBC), y entonces `openssl` falla por el entorno, no por la prueba.
    const conf = join(dir, 'openssl.cnf');
    writeFileSync(conf, '');
    const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-subj', '/CN=destino.prueba.local',
      '-addext', 'subjectAltName=DNS:destino.prueba.local,DNS:prohibido.prueba.local,DNS:localhost,IP:127.0.0.1'],
      { encoding: 'utf8', env: { ...process.env, OPENSSL_CONF: conf } });
    if (r.status !== 0) throw new Error(`No se pudo generar el certificado de prueba (openssl salió ${r.status})`);
    ca = readFileSync(join(dir, 'cert.pem'), 'utf8');
    prohibido = await levantar((_u, res) => { res.writeHead(200); res.end('no deberia recibir nada'); });
    destino = await levantar((u, res) => {
      if (u.startsWith('/redirige')) { res.writeHead(302, { location: `https://prohibido.prueba.local:${prohibido.port}/robado` }); return res.end(); }
      if (u.startsWith('/grande')) { res.writeHead(200); return res.end(Buffer.alloc(MAX * 2, 0x61)); }
      if (u.startsWith('/lento')) { res.writeHead(200); return; } // nunca cierra: vence el plazo
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  afterAll(async () => {
    // Cierre tolerante: si `beforeAll` falló antes de levantar un servidor, no se queda esperando para siempre.
    for (const c of [destino, prohibido]) if (c?.server) await new Promise<void>((ok) => c.server.close(() => ok()));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => { destino.recibidas.length = 0; prohibido.recibidas.length = 0; });

  const lista = () => [`destino.prueba.local:${destino.port}`];
  const llamar = (path: string, extra: Partial<Parameters<typeof requestExternal>[0]> = {}) =>
    requestExternal({ url: `https://destino.prueba.local:${destino.port}${path}`, allowedHosts: lista(), timeoutMs: TIMEOUT, maxBytes: MAX, lookup: aLoopback, ca, ...extra });

  it('una respuesta conforme llega completa y la credencial solo viaja al destino autorizado', async () => {
    const res = await llamar('/ok', { headers: { 'x-api-key': 'credencial-de-prueba-xyz' } });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString('utf8'))).toEqual({ ok: true });
    expect(destino.recibidas).toHaveLength(1);
    expect(destino.recibidas[0].headers['x-api-key']).toBe('credencial-de-prueba-xyz');
    expect(prohibido.recibidas).toHaveLength(0);
  });

  it('un host fuera de la lista NO abre ninguna conexión: el servidor prohibido no registra nada', async () => {
    await expect(requestExternal({
      url: `https://prohibido.prueba.local:${prohibido.port}/robado`, allowedHosts: lista(),
      headers: { 'x-api-key': 'credencial-de-prueba-xyz' }, timeoutMs: TIMEOUT, maxBytes: MAX, lookup: aLoopback, ca,
    })).rejects.toMatchObject({ reason: 'HOST_NOT_ALLOWED' });
    expect(prohibido.recibidas).toHaveLength(0);
    expect(destino.recibidas).toHaveLength(0);
  });

  it('el mismo host en otro puerto tampoco conecta: el puerto forma parte de la entrada de la lista', async () => {
    await expect(requestExternal({
      url: `https://destino.prueba.local:${destino.port + 1}/ok`, allowedHosts: lista(),
      timeoutMs: TIMEOUT, maxBytes: MAX, lookup: aLoopback, ca,
    })).rejects.toMatchObject({ reason: 'PORT_NOT_ALLOWED' });
    expect(destino.recibidas).toHaveLength(0);
  });

  it('la comprobación de direcciones la aplica el TRANSPORTE: un host de la lista que resuelve a loopback no conecta', async () => {
    // Sin `lookup` inyectado: resolución real de «localhost» → 127.0.0.1, que la defensa rechaza al conectar.
    // El servidor existe y responde, así que si la defensa no estuviera aplicada, la llamada tendría éxito.
    await expect(requestExternal({
      url: `https://localhost:${destino.port}/ok`, allowedHosts: [`localhost:${destino.port}`],
      headers: { 'x-api-key': 'credencial-de-prueba-xyz' }, timeoutMs: TIMEOUT, maxBytes: MAX, ca,
      lookup: guardedLookup(),
    })).rejects.toMatchObject({ reason: 'PRIVATE_ADDRESS' });
    expect(destino.recibidas).toHaveLength(0);
  });

  it('una redirección no se sigue y su destino NO recibe la credencial', async () => {
    await expect(llamar('/redirige', { headers: { 'x-api-key': 'credencial-de-prueba-xyz' } }))
      .rejects.toMatchObject({ reason: 'REDIRECT_NOT_FOLLOWED' });
    // Exactamente una petición, al destino autorizado; el destino de la redirección no recibe nada.
    expect(destino.recibidas).toHaveLength(1);
    expect(destino.recibidas[0].url).toBe('/redirige');
    expect(prohibido.recibidas).toHaveLength(0);
    expect(prohibido.recibidas.some((r) => JSON.stringify(r.headers).includes('credencial-de-prueba'))).toBe(false);
  });

  it('una respuesta mayor que el tope se corta en vez de cargarse entera', async () => {
    await expect(llamar('/grande')).rejects.toMatchObject({ reason: 'RESPONSE_TOO_LARGE' });
  });

  it('un destino que no responde vence por plazo y no deja la llamada abierta', async () => {
    const err = await llamar('/lento', { timeoutMs: 800 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(EgressBlocked);
    expect((err as { code?: string }).code).toBe('ETIMEDOUT');
  });
});
