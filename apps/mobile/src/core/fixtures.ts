// Fixtures SINTÉTICOS para el entorno de prueba sin cifrado (Expo Go). Pertenecer a una organización DEMO no convierte
// una foto o una ubicación real en datos sintéticos: en Expo Go la app NO usa cámara ni ubicación reales, solo estos
// fixtures. El ensayo con fotos y ubicación reales corresponde al build nativo con cifrado.

export const FIXTURE_PROVIDER = 'FIXTURE SINTÉTICA (entorno de prueba sin cifrado): no es una ubicación real ni del dispositivo';

/** Muestra de ubicación de prueba (coordenadas ficticias fijas, sin precisión informada, marcada como simulada). */
export function fixtureLocation(now: Date) {
  return { latitude: -1.0, longitude: -80.0, accuracy_m: null, acquired_at: now.toISOString(), provider_detail: FIXTURE_PROVIDER, mocked: true };
}

/** JPEG sintético mínimo y válido (no es una foto). `exif` añade un segmento EXIF falso para probar su eliminación. */
export function fixtureJpeg(seed: string, exif = false): Uint8Array {
  const enc = (t: string) => Array.from(t, (c) => c.charCodeAt(0) & 0xff);
  const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const app0 = seg(0xe0, [...enc('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const app1 = seg(0xe1, [...enc('Exif'), 0, 0, ...enc('GPSLatitude=-0.8479;Model=TelefonoSintetico')]);
  const sos = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
  const data = enc(`datos-sinteticos-${seed}`);
  return new Uint8Array([0xff, 0xd8, ...app0, ...(exif ? app1 : []), ...sos, ...data, 0xff, 0xd9]);
}
