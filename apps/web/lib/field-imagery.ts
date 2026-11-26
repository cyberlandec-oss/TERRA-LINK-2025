/** Paquetes públicos preparados en el servidor local; nunca consulta un proveedor desde el campo. */
export interface ImageryPackage {
  id: string;
  bounds: [number, number, number, number];
  acquired_at: string;
  source: string;
  license: string;
  resolution_m: number;
  sha256: string;
  image_url: string;
  bytes: number;
  synthetic?: boolean;
}
export interface DownloadedImagery { metadata: ImageryPackage; blob: Blob }
export const FIELD_MAPS_URL = (process.env.NEXT_PUBLIC_MAPS_URL ?? 'http://localhost:8090').replace(/\/$/, '');
const MAX_BYTES = 12 * 1024 * 1024;

function validPackage(value: unknown): value is ImageryPackage {
  if (!value || typeof value !== 'object') return false;
  const p = value as ImageryPackage;
  return /^[a-zA-Z0-9_-]{1,80}$/.test(p.id) && Array.isArray(p.bounds) && p.bounds.length === 4 &&
    p.bounds.every(Number.isFinite) && p.bounds[0] < p.bounds[2] && p.bounds[1] < p.bounds[3] &&
    p.bounds[0] >= -180 && p.bounds[2] <= 180 && p.bounds[1] >= -85 && p.bounds[3] <= 85 &&
    typeof p.acquired_at === 'string' && Number.isFinite(Date.parse(p.acquired_at)) &&
    typeof p.source === 'string' && p.source.length > 0 && typeof p.license === 'string' && p.license.length > 0 &&
    Number.isFinite(p.resolution_m) && p.resolution_m > 0 && /^[0-9a-f]{64}$/.test(p.sha256) &&
    typeof p.image_url === 'string' && /^\/offline\/[a-zA-Z0-9_-]+\.png$/.test(p.image_url) &&
    Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= MAX_BYTES;
}

export async function listImageryPackages(): Promise<ImageryPackage[]> {
  const response = await fetch(`${FIELD_MAPS_URL}/offline/manifest.json`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('No hay paquetes satelitales publicados en este servidor. Puedes capturar sin fondo.');
  const text = await response.text();
  if (text.length > 256000) throw new Error('El catálogo de imágenes supera el tamaño permitido.');
  const payload = JSON.parse(text) as { packages?: unknown[] };
  if (!Array.isArray(payload.packages) || payload.packages.length > 100 || !payload.packages.every(validPackage)) throw new Error('El catálogo satelital está incompleto o no es válido.');
  return payload.packages;
}

export async function downloadImageryPackage(metadata: ImageryPackage): Promise<DownloadedImagery> {
  if (!validPackage(metadata)) throw new Error('El paquete satelital no es válido.');
  const response = await fetch(`${FIELD_MAPS_URL}${metadata.image_url}`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new Error('No se pudo descargar la imagen satelital.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('El navegador no permite verificar la descarga de imágenes.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > MAX_BYTES || length > metadata.bytes) throw new Error('El tamaño de la imagen no corresponde al paquete.');
      chunks.push(result.value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
  if (length !== metadata.bytes || hash !== metadata.sha256) throw new Error('Descarga incompleta o alterada. La zona no se marcará como disponible.');
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error('El archivo no contiene una imagen PNG válida.');
  return { metadata, blob: new Blob([bytes], { type: 'image/png' }) };
}
