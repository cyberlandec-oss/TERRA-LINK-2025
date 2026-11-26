interface ShellReply { complete: boolean; error?: string }

async function worker(): Promise<ServiceWorker> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('El trabajo sin conexión requiere HTTPS (o localhost) y un navegador compatible.');
  const registration = await navigator.serviceWorker.register('/field-offline-sw.js', { scope: '/campo-offline' });
  const active = registration.active ?? await new Promise<ServiceWorker>((resolve, reject) => {
    const candidate = registration.installing ?? registration.waiting;
    if (!candidate) { reject(new Error('No se pudo preparar la aplicación sin conexión.')); return; }
    const timeout = setTimeout(() => reject(new Error('No se pudo activar la aplicación sin conexión.')), 15000);
    candidate.addEventListener('statechange', () => { if (candidate.state === 'activated') { clearTimeout(timeout); resolve(candidate); } });
  });
  return active;
}

function message(target: ServiceWorker, payload: unknown): Promise<ShellReply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => reject(new Error('La descarga de la aplicación no terminó. Comprueba la conexión.')), 60000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data as ShellReply); };
    target.postMessage(payload, [channel.port2]);
  });
}

export async function fieldShellReady(): Promise<boolean> {
  try { return (await message(await worker(), { type: 'CHECK_READY' })).complete; } catch { return false; }
}

/** Solo recursos estáticos públicos ya cargados. Nada de API, dataset o credenciales. */
export async function prepareShell(): Promise<boolean> {
  const resources = [
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map(node => node.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]')).map(node => node.href),
    ...performance.getEntriesByType('resource').map(entry => entry.name),
  ];
  const assets = [...new Set(resources.filter(path => {
    const url = new URL(path, location.origin);
    return url.origin === location.origin && url.pathname.startsWith('/_next/static/');
  }))];
  assets.push('/campo-offline.webmanifest', '/field-icon-192.svg', '/field-icon-512.svg');
  const result = await message(await worker(), { type: 'PREPARE_FIELD_SHELL', assets });
  if (!result.complete) throw new Error(result.error ?? 'La aplicación no está completamente descargada.');
  return true;
}
