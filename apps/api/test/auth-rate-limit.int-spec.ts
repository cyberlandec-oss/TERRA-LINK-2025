import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { PASSWORD, describeDb, setupHarness } from './helpers';

// Límite de intentos de login con Redis real: bloqueo temporal, recuperación, no enumeración,
// aislamiento por origen y estado compartido entre instancias.
describeDb('login: límite de intentos (Redis real)', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  const policy = { windowSeconds: 2, maxPerAccountAndIp: 3, maxPerAccount: 10, maxPerIp: 10 };

  beforeAll(async () => {
    h = await setupHarness({ loginRateLimit: policy, trustProxy: true });
    await h.user('persona@test.local');
  });
  afterAll(async () => h?.close());

  const attempt = (email: string, password: string, ip = '203.0.113.1') =>
    h.http().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password });

  it('funcionamiento normal: credenciales correctas entran y los fallos aislados no bloquean', async () => {
    await attempt('persona@test.local', 'incorrecta-1').expect(401);
    await attempt('persona@test.local', PASSWORD).expect(200);
    // El éxito reinició el contador cuenta+origen.
    await attempt('persona@test.local', 'incorrecta-2').expect(401);
    await attempt('persona@test.local', 'incorrecta-3').expect(401);
    await attempt('persona@test.local', PASSWORD).expect(200);
  });

  it('bloquea tras el umbral incluso con la contraseña correcta y se recupera al vencer la ventana', async () => {
    for (let i = 0; i < 3; i++) await attempt('persona@test.local', 'mala', '203.0.113.7').expect(401);
    const blocked = await attempt('persona@test.local', PASSWORD, '203.0.113.7').expect(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Otro origen legítimo no queda bloqueado por el ataque desde 203.0.113.7.
    await attempt('persona@test.local', PASSWORD, '198.51.100.20').expect(200);
    await new Promise((r) => setTimeout(r, 2200));
    await attempt('persona@test.local', PASSWORD, '203.0.113.7').expect(200);
  });

  it('no revela si la cuenta existe: misma respuesta 401 y 429 para cuentas inexistentes', async () => {
    const ip = '203.0.113.50';
    const ghost = await attempt('nadie@test.local', 'x', ip).expect(401);
    const real = await attempt('persona@test.local', 'x', '203.0.113.51').expect(401);
    expect(ghost.body.error.code).toBe(real.body.error.code);
    expect(ghost.body.error.message).toBe(real.body.error.message);
    await attempt('nadie@test.local', 'x', ip).expect(401);
    await attempt('nadie@test.local', 'x', ip).expect(401);
    const ghostBlocked = await attempt('nadie@test.local', 'x', ip).expect(429);
    expect(ghostBlocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('el estado es compartido entre instancias de la API', async () => {
    const second = await createApp(h.config, h.db);
    await second.init();
    try {
      const ip = '203.0.113.90';
      for (let i = 0; i < 3; i++) await attempt('persona@test.local', 'mala', ip).expect(401);
      await request(second.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'persona@test.local', password: PASSWORD })
        .expect(429);
    } finally {
      await second.close();
    }
  });
});
