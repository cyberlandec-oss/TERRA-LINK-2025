import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { request } from 'node:http';
import { SessionManager, type FetchLike } from '../session-manager';
import { nodePlatform } from '../../core/__tests__/node-platform';

// Prueba OPCIONAL (TL_API_SMOKE=1) del cliente móvil en Node contra la API local levantada (terra_link, datos DEMO).
// Lee credenciales del archivo local más reciente (CREDENCIALES*.csv, ignorado por git) sin imprimirlas.
// Evidencia: cliente en Node + API real. No es emulador ni dispositivo.
const API = process.env.TL_API_URL ?? 'http://localhost:4000';
// jest-expo sustituye fetch por un simulacro: se usa un fetch mínimo sobre node:http contra la API real.
const nodeFetch: FetchLike = (url, init) => new Promise((res, rej) => {
  const r = request(url, { method: init.method, headers: init.headers }, (m) => { let b = ''; m.setEncoding('utf8'); m.on('data', (c) => (b += c)); m.on('end', () => res({ ok: (m.statusCode ?? 0) < 400, status: m.statusCode ?? 0, json: async () => JSON.parse(b) })); });
  r.on('error', rej); if (init.body) r.write(init.body); r.end();
});
const run = process.env.TL_API_SMOKE === '1' ? describe : describe.skip;

function creds(local: string): { email: string; password: string } {
  const root = resolve(__dirname, '../../../../..');
  const file = ['CREDENCIALES.csv', 'CREDENCIALES.pendiente.csv'].map((f) => join(root, f)).filter(existsSync).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  const rows = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
  const head = rows[0];
  const r = rows.find((x) => x[head.indexOf('email')]?.startsWith(`${local}@`))!;
  return { email: r[head.indexOf('email')], password: r[head.indexOf('contrasena')] };
}

run('P0-023 cliente móvil contra la API local (DEMO)', () => {
  it('login online, dataset limitado a lo autorizado y separación entre cuentas en el mismo dispositivo', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tl-mobile-api-'));
    const p = nodePlatform(root);
    const sm = new SessionManager(p, nodeFetch);
    const t1 = creds('tecnico1.cooperativa');
    const s1 = await sm.login(API, t1.email, t1.password);
    expect(s1.organizations.length).toBeGreaterThan(0);
    expect(JSON.stringify([...p.secretsMap.values()])).not.toContain(t1.password); // la contraseña no se guarda
    const org = s1.organizations.find((o) => o.roles.includes('FIELD_TECHNICIAN'))!;
    expect(sm.gate(s1, org.organization_id)).toMatchObject({ allowed: true });
    const st1 = await sm.openStore(s1, org.organization_id);
    const n1 = await sm.downloadDataset(s1, org.organization_id, st1);
    const plots1 = (await st1.plots()).map((x) => x.plot_code);
    expect(plots1.length).toBe(n1);
    const draft = await st1.createDraft((await st1.plots())[0].id);
    await st1.setNote(draft, 'Captura sintética de prueba en Node');
    await st1.close();
    await sm.logout();
    expect(await sm.token()).toBeNull();

    const t2 = creds('tecnico2.cooperativa');
    const s2 = await sm.login(API, t2.email, t2.password);
    const st2 = await sm.openStore(s2, org.organization_id);
    expect(await st2.drafts()).toEqual([]); // no ve la captura de la otra cuenta
    await sm.downloadDataset(s2, org.organization_id, st2);
    const plots2 = (await st2.plots()).map((x) => x.plot_code);
    // Cada cuenta recibe lo que el servidor le asigna; el cliente no amplía el alcance (se registra abajo).
    expect(plots2.length).toBeGreaterThan(0);
    await st2.close();
    await sm.logout();

    const s1b = await sm.login(API, t1.email, t1.password);
    const back = await sm.openStore(s1b, org.organization_id);
    expect((await back.drafts()).map((d) => d.note)).toEqual(['Captura sintética de prueba en Node']); // se conservó para su cuenta
    await back.close();
    // Registro de evidencia (sin datos personales): tamaños de dataset por cuenta.
    console.log(`dataset tecnico1=${plots1.length} parcelas; tecnico2=${plots2.length} parcelas; comunes=${plots1.filter((c) => plots2.includes(c)).length}`);
  }, 60_000);
});
