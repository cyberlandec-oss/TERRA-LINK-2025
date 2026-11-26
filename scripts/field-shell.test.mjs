import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

async function harness() {
  const handlers = new Map(); const storage = new Map(); const fetched = [];
  let offline = false;
  const caches = { async open(name) {
    if (!storage.has(name)) storage.set(name, new Map());
    const entries = storage.get(name);
    return { async match(path) { return entries.get(path)?.clone(); }, async put(path, response) { entries.set(path, response.clone()); } };
  } };
  const self = { location: { origin: 'http://localhost:3000' }, clients: { async claim() {} }, skipWaiting() {}, addEventListener(type, handler) { handlers.set(type, handler); } };
  const context = vm.createContext({ self, caches, URL, Response, TextEncoder, Uint8Array, crypto: webcrypto, fetch: async request => {
    if (offline) throw new Error('NETWORK_OFFLINE');
    const url = typeof request === 'string' ? request : request.url ?? request.href;
    fetched.push(url);
    return new Response(url.includes('/campo-offline') ? '<html>shell público sin datos</html>' : 'asset', { headers: { 'content-type': url.includes('/campo-offline') ? 'text/html' : 'text/javascript' } });
  } });
  vm.runInContext(await readFile(new URL('../apps/web/public/field-offline-sw.js', import.meta.url), 'utf8'), context);
  return { handlers, storage, fetched, setOffline() { offline = true; }, async message(data) {
    let result; let work;
    handlers.get('message')({ data, ports: [{ postMessage(value) { result = value; } }], waitUntil(p) { work = p; } });
    await work; return result;
  } };
}

test('shell completo se recupera sin servidor; API y datos privados nunca se interceptan', async () => {
  const h = await harness();
  assert.equal((await h.message({ type: 'CHECK_READY' })).complete, false);
  const reply = await h.message({ type: 'PREPARE_FIELD_SHELL', assets: ['/_next/static/campo.js'] });
  assert.equal(reply.complete, true);
  h.setOffline();
  let response;
  h.handlers.get('fetch')({ request: { method: 'GET', url: 'http://localhost:3000/campo-offline?org=abc', mode: 'navigate' }, respondWith(p) { response = p; } });
  assert.match(await (await response).text(), /shell público/);
  for (const path of ['/api/v1/me', '/organizaciones', '/api/v1/organizations/abc/field-offline/prepare']) {
    let intercepted = false;
    h.handlers.get('fetch')({ request: { method: 'GET', url: 'http://localhost:3000'+path, mode: 'cors' }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});

test('rechaza recursos externos y de API sin marcarlos listos', async () => {
  const h = await harness();
  for (const assets of [['https://externo.invalid/script.js'], ['/api/v1/me']]) {
    const result = await h.message({ type: 'PREPARE_FIELD_SHELL', assets });
    assert.equal(result.complete, false);
  }
  assert.equal((await h.message({ type: 'CHECK_READY' })).complete, false);
  assert.equal(h.fetched.length, 0);
});

test('una descarga fallida conserva el shell anterior y no promete un paquete nuevo', async () => {
  const h = await harness();
  await h.message({ type: 'PREPARE_FIELD_SHELL', assets: ['/_next/static/v1.js'] });
  h.setOffline();
  assert.equal((await h.message({ type: 'PREPARE_FIELD_SHELL', assets: ['/_next/static/v2.js'] })).complete, false);
  assert.equal((await h.message({ type: 'CHECK_READY' })).complete, true);
});
