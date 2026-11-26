/* Solo shell público de campo. Nunca intercepta ni almacena API, tokens o capturas. */
const PREFIX = 'terra-link-field-shell-';
const META = 'terra-link-field-shell-state';
const STATE = '/campo-offline-shell-state';
const SHELL = '/campo-offline';
const allowed = url => url.origin === self.location.origin &&
  (url.pathname.startsWith('/_next/static/') || url.pathname === '/campo-offline.webmanifest' ||
   /^\/field-icon-(192|512)\.svg$/.test(url.pathname));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function state() {
  const response = await (await caches.open(META)).match(STATE);
  return response ? response.json() : null;
}

async function ready() {
  const current = await state();
  if (!current || !current.assets?.length || !current.cache?.startsWith(PREFIX)) return false;
  const cache = await caches.open(current.cache);
  for (const path of [SHELL, ...current.assets]) if (!(await cache.match(path))) return false;
  return true;
}

self.addEventListener('message', event => {
  const reply = value => event.ports[0]?.postMessage(value);
  if (event.data?.type === 'CHECK_READY') {
    event.waitUntil(ready().then(complete => reply({ complete })).catch(() => reply({ complete: false })));
    return;
  }
  if (event.data?.type !== 'PREPARE_FIELD_SHELL') return;
  event.waitUntil((async () => {
    const assets = [...new Set(event.data.assets)].map(path => new URL(path, self.location.origin));
    if (!assets.length || assets.length > 150 || assets.some(url => !allowed(url))) throw new Error('INVALID_ASSETS');
    const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(assets.map(u => u.href).sort().join('\n'))))].map(n => n.toString(16).padStart(2, '0')).join('');
    const name = PREFIX + fingerprint;
    const cache = await caches.open(name);
    for (const url of [new URL(SHELL, self.location.origin), ...assets]) {
      const response = await fetch(url, { credentials: 'same-origin', cache: 'reload', redirect: 'error' });
      if (!response.ok || response.type === 'opaque') throw new Error('INCOMPLETE_SHELL');
      if (url.pathname === SHELL && !response.headers.get('content-type')?.includes('text/html')) throw new Error('INVALID_SHELL');
      await cache.put(url.pathname + url.search, response);
    }
    await (await caches.open(META)).put(STATE, new Response(JSON.stringify({ cache: name, assets: assets.map(u => u.pathname + u.search) }), { headers: { 'content-type': 'application/json' } }));
    reply({ complete: await ready() });
    // Retener una versión anterior evita romper páginas abiertas durante una actualización.
  })().catch(() => reply({ complete: false, error: 'No se completó la descarga de la aplicación. Lo guardado anteriormente se conserva.' })));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate' && url.pathname === SHELL;
  if (!navigation && !allowed(url)) return;
  event.respondWith((async () => {
    const current = await state();
    const cached = current ? await (await caches.open(current.cache)).match(navigation ? SHELL : url.pathname + url.search) : null;
    if (!navigation && cached) return cached;
    try { return await fetch(event.request); }
    catch (error) { if (cached) return cached; throw error; }
  })());
});
