import { createServer, connect, type Server, type Socket } from 'net';
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { describeDb, setupHarness } from './helpers';
import { MALWARE_SCANNER, type MalwareScanner } from '../src/storage/scanner';

// RNF-10 — Avisos operativos: detección **y recuperación**, con fallos INDUCIDOS en entorno aislado.
//
// No basta con que exista un log: aquí cada aviso se provoca de verdad, se comprueba que aparece con
// información para actuar, y se comprueba que **vuelve a OK** cuando la causa desaparece. El entorno es el
// arnés de integración: base `*_test` propia, Redis tras un proxy TCP que se puede cortar y restaurar, y un
// escáner sustituible. **No se toca desarrollo ni el otro proyecto Compose.**
class TcpProxy {
  private server?: Server;
  private sockets = new Set<Socket>();
  port = 0;
  constructor(private readonly target: { host: string; port: number }) {}
  start(port = 0): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((client) => {
        const upstream = connect(this.target.port, this.target.host);
        for (const s of [client, upstream]) {
          this.sockets.add(s);
          s.on('close', () => this.sockets.delete(s));
          s.on('error', () => s.destroy());
        }
        client.pipe(upstream).pipe(client);
      });
      this.server.listen(port, '127.0.0.1', () => {
        this.port = (this.server!.address() as { port: number }).port;
        resolve();
      });
    });
  }
  stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}

const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const proxy = new TcpProxy({ host: url.hostname, port: Number(url.port || 6379) });

describeDb('RNF-10 avisos operativos: se provocan, informan y se recuperan', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  /** Escáner controlable: permite provocar su caída sin tocar el contenedor real. */
  let escanerVivo = true;

  const avisos = () => h.http().get('/operations/alerts');
  const buscar = (body: { alerts: Array<{ code: string }> }, code: string) =>
    body.alerts.find((a) => a.code === code) as { code: string; state: string; condition: string; observed: string; action: string | null; degradacion: boolean };

  beforeAll(async () => {
    await proxy.start();
    h = await setupHarness({ redisUrl: `redis://127.0.0.1:${proxy.port}` });
    // Se sustituye el escáner por uno gobernable: el contrato (`ping`) es el mismo.
    const falso: MalwareScanner = {
      ...(h.app.get(MALWARE_SCANNER) as MalwareScanner),
      ping: async () => escanerVivo,
    };
    Object.defineProperty(h.app.get(MALWARE_SCANNER) as object, 'ping', { value: falso.ping, configurable: true, writable: true });
  });
  afterAll(async () => {
    escanerVivo = true;
    await h?.close();
    await proxy.stop();
  });

  it('en reposo: todo OK, sin secretos y sin datos de ninguna organización', async () => {
    const r = await avisos().expect(200);
    expect(r.body.status).toBe('ok');
    expect(r.body.alerts.length).toBeGreaterThanOrEqual(5);
    for (const a of r.body.alerts) {
      expect(a.state).toBe('OK');
      expect(a.action).toBeNull();          // en reposo no se pide actuar
      expect(a.condition.length).toBeGreaterThan(10);  // condición redactada y comprobable
      expect(a.observed.length).toBeGreaterThan(0);    // y lo observado al evaluarla
    }
    // Sin secretos ni datos de organización: solo agregados.
    const texto = JSON.stringify(r.body);
    for (const prohibido of ['password', 'token', 'secret', 'postgres://', 'redis://', '@']) {
      expect(texto.toLowerCase()).not.toContain(prohibido.toLowerCase());
    }
  });

  it('cada aviso declara si es degradación o indisponibilidad', async () => {
    const r = await avisos().expect(200);
    expect(buscar(r.body, 'CORE_DEPENDENCY_DOWN').degradacion).toBe(false);
    expect(buscar(r.body, 'SCHEMA_CODE_MISMATCH').degradacion).toBe(false);
    expect(buscar(r.body, 'DOCUMENT_ANALYSIS_UNAVAILABLE').degradacion).toBe(true);
    expect(buscar(r.body, 'DOCUMENTS_PENDING_ANALYSIS').degradacion).toBe(true);
    expect(buscar(r.body, 'EVENT_DELIVERIES_DEAD').degradacion).toBe(true);
  });

  it('FALLO INDUCIDO — escáner caído: degradación, no caída, y nunca análisis limpio', async () => {
    escanerVivo = false;
    const r = await avisos().expect(200);   // **200**: la API sigue atendiendo
    expect(r.body.status).toBe('degraded'); // degradada, no indisponible
    const a = buscar(r.body, 'DOCUMENT_ANALYSIS_UNAVAILABLE');
    expect(a.state).toBe('FIRING');
    expect(a.degradacion).toBe(true);
    expect(a.action).toMatch(/PENDIENTE/);          // información suficiente para actuar
    expect(a.action).toMatch(/No se aprueban como limpios/);
    // El núcleo sigue sano: no se presenta como fallo de toda la API.
    expect(buscar(r.body, 'CORE_DEPENDENCY_DOWN').state).toBe('OK');
    // Y `/health/ready` dice lo mismo: una sola fuente, sin contradicción.
    const ready = await h.http().get('/health/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'degraded', capabilities: { document_analysis: 'UNAVAILABLE' } });

    // RECUPERACIÓN reconocible: vuelve a OK solo, sin intervención.
    escanerVivo = true;
    const r2 = await avisos().expect(200);
    expect(buscar(r2.body, 'DOCUMENT_ANALYSIS_UNAVAILABLE').state).toBe('OK');
    expect(r2.body.status).toBe('ok');
  });

  it('FALLO INDUCIDO — Redis cortado: indisponibilidad del núcleo, y recuperación al restaurarlo', async () => {
    await proxy.stop();
    const r = await avisos().expect(503);   // **503**: esto sí es indisponibilidad
    expect(r.body.status).toBe('unavailable');
    const a = buscar(r.body, 'CORE_DEPENDENCY_DOWN');
    expect(a.state).toBe('FIRING');
    expect(a.degradacion).toBe(false);
    expect(a.observed).toMatch(/redis/);    // dice QUÉ dependencia, sin trazas ni cadenas de conexión
    expect(a.action).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toMatch(/ECONNREFUSED|stack|redis:\/\//i);

    // RECUPERACIÓN: se restaura el proxy y el aviso vuelve a OK por sí solo.
    await proxy.start(proxy.port);
    let estado = '';
    for (let i = 0; i < 20 && estado !== 'OK'; i++) {
      estado = buscar((await avisos()).body, 'CORE_DEPENDENCY_DOWN').state;
      if (estado !== 'OK') await new Promise((r2) => setTimeout(r2, 250));
    }
    expect(estado).toBe('OK');
  });

  it('FALLO INDUCIDO — cartas muertas del outbox: se detectan y se recuperan al reprocesarlas', async () => {
    expect(buscar((await avisos()).body, 'EVENT_DELIVERIES_DEAD').state).toBe('OK');  // control

    // Se provoca una entrega DEAD con un evento sintético propio de esta prueba.
    const creador = await h.user(`avisos-${randomUUID()}@test.local`);
    const org = (await sql<{ id: string }>`
      INSERT INTO organizations (id, name, organization_type, country, status, created_by, updated_by)
      VALUES (${randomUUID()}, 'Org avisos sintética', 'COOPERATIVE', 'EC', 'ACTIVE', ${creador}, ${creador}) RETURNING id`.execute(h.db)).rows[0];
    const ev = randomUUID();
    await sql`INSERT INTO domain_events (event_id, organization_id, event_type, schema_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
      VALUES (${ev}, ${org.id}, 'AvisoSinteticoOcurrido', 1, 'LOT', ${randomUUID()}, 1, '{"synthetic_fixture":true}'::jsonb, now())`.execute(h.db);
    await sql`INSERT INTO event_deliveries (event_id, consumer, status, attempts, last_error)
      VALUES (${ev}, 'consumidor-sintetico', 'DEAD', 5, 'fallo sintético de prueba')`.execute(h.db);

    const r = await avisos().expect(200);
    const a = buscar(r.body, 'EVENT_DELIVERIES_DEAD');
    expect(a.state).toBe('FIRING');
    expect(a.observed).toMatch(/1 entrega/);
    expect(a.action).toMatch(/[Rr]eproces/);           // qué hacer
    expect(a.action).toMatch(/idempotente/);           // y por qué es seguro hacerlo
    expect(r.body.status).toBe('degraded');            // degradación: la API sigue atendiendo
    // No publica identificadores ni nombres de la organización.
    expect(JSON.stringify(r.body)).not.toContain(org.id);
    expect(JSON.stringify(r.body)).not.toContain('Org avisos sintética');

    // RECUPERACIÓN: reprocesada (vuelve a PENDING), el aviso se apaga.
    await sql`UPDATE event_deliveries SET status = 'PENDING', attempts = 0 WHERE event_id = ${ev}`.execute(h.db);
    expect(buscar((await avisos()).body, 'EVENT_DELIVERIES_DEAD').state).toBe('OK');
  });

  it('no inventa objetivos ni umbrales: ningún aviso declara p95, SLO ni disponibilidad', async () => {
    const texto = JSON.stringify((await avisos().expect(200)).body);
    for (const inventado of ['p95', 'p99', 'slo', 'sla', 'uptime', 'percentil', '99.9']) {
      expect(texto.toLowerCase()).not.toContain(inventado);
    }
  });
});
