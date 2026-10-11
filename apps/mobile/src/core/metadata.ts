// D-41 (fotografía de campo = dato personal): antes de calcular el hash y guardar, se eliminan los metadatos embebidos
// que podrían eludir la clasificación de acceso (EXIF con coordenadas, modelo del dispositivo, hora; XMP; IPTC;
// comentarios). La ubicación de la captura se registra aparte, con su procedencia, en la muestra de ubicación.
// El servidor rechaza fotos de campo que aún traigan estos metadatos (apps/api/src/sync/sync.ts).

const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]); // APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), COM
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array {
  if (mimeType === 'image/jpeg') return stripJpeg(bytes);
  if (mimeType === 'image/png') return stripPng(bytes);
  return bytes;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new Error('El archivo no es un JPEG válido.');
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('JPEG con estructura no válida.');
    const marker = b[i + 1];
    if (marker === 0xd9) { out.push(0xff, 0xd9); return new Uint8Array(out); }
    if (marker === 0xda) { for (let k = i; k < b.length; k++) out.push(b[k]); return new Uint8Array(out); } // datos de imagen: se copian tal cual
    if (marker >= 0xd0 && marker <= 0xd7) { out.push(0xff, marker); i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) throw new Error('JPEG truncado.');
    if (!JPEG_DROP.has(marker)) for (let k = i; k < i + 2 + len; k++) out.push(b[k]);
    i += 2 + len;
  }
  for (let k = i; k < b.length; k++) out.push(b[k]);
  return new Uint8Array(out);
}

function stripPng(b: Uint8Array): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 8 || sig.some((v, k) => b[k] !== v)) throw new Error('El archivo no es un PNG válido.');
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const end = i + 12 + len;
    if (end > b.length) throw new Error('PNG truncado.');
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** ¿Quedan metadatos embebidos? (misma regla que el servidor). */
export function hasImageMetadata(b: Uint8Array, mimeType: string): boolean {
  try { return stripImageMetadata(b, mimeType).length !== b.length; } catch { return true; }
}
