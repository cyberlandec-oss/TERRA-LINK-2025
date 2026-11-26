import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { downloadImageryPackage, listImageryPackages, type ImageryPackage } from './field-imagery';

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
async function fixture(): Promise<ImageryPackage> {
  const sha256 = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
  return { id: 'prueba', bounds: [-80, -2, -79, -1], acquired_at: '2026-01-01T00:00:00Z', source: 'SINTETICO', license: 'Prueba', resolution_m: 10, sha256, image_url: '/offline/prueba.png', bytes: bytes.length, synthetic: true };
}
afterEach(() => vi.unstubAllGlobals());
describe('paquetes satelitales de campo', () => {
  it('solo admite catálogo local con rutas de imágenes cerradas', async () => {
    const metadata = await fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ packages: [metadata] })));
    vi.stubGlobal('fetch', fetcher);
    expect(await listImageryPackages()).toEqual([metadata]);
    expect(fetcher.mock.calls[0][0]).toContain('/offline/manifest.json');
    fetcher.mockResolvedValue(new Response(JSON.stringify({ packages: [{ ...metadata, image_url: 'https://externo.invalid/a.png' }] })));
    await expect(listImageryPackages()).rejects.toThrow('no es válido');
  });
  it('verifica tamaño y hash antes de entregar bytes para almacenamiento', async () => {
    const metadata = await fixture();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } })));
    const result = await downloadImageryPackage(metadata);
    expect(result.blob.size).toBe(bytes.length);
    expect(result.metadata.sha256).toBe(metadata.sha256);
  });
  it('rechaza descarga incompleta o alterada y no la marca disponible', async () => {
    const metadata = await fixture();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes.slice(0, 8), { headers: { 'content-type': 'image/png' } })));
    await expect(downloadImageryPackage(metadata)).rejects.toThrow('incompleta o alterada');
  });
  it('rechaza un archivo que supera el manifiesto antes de guardarlo', async () => {
    const metadata = await fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(20), { headers: { 'content-type': 'image/png' } })));
    await expect(downloadImageryPackage(metadata)).rejects.toThrow('tamaño');
  });
});
