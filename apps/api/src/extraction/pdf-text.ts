import { inflateSync } from 'node:zlib';

// P1-013 — Lectura del texto de un PDF, **en local y con decodificación real**.
//
// POR QUÉ CAMBIÓ EL MOTOR (2026-10-19)
// La primera versión descomprimía los flujos a mano y recogía los operadores de texto. Eso funciona con PDF
// sencillos, pero **no decodifica**: la mayoría de los PDF reales subconjuntan las fuentes y escriben
// **identificadores de glifo**, que solo se traducen leyendo el mapa de la fuente. Se intentó detectar ese
// caso con heurísticas —proporción de caracteres legibles, caracteres de control, ausencia de espacios— y
// **detectaban los ejemplos probados**, pero una heurística **no demuestra que los caracteres correspondan al
// documento**: un texto mal decodificado puede seguir pareciendo texto.
//
// Reconstruir un lector de PDF general a mano sería construir, mal, algo que ya existe. Así que **solo esa
// pieza** se sustituye por un componente **mantenido** que se ejecuta **enteramente en local**: **pdf.js**
// (`pdfjs-dist`), el motor de PDF de Mozilla, que interpreta las codificaciones y los mapas de fuente.
//
// LO QUE **NO** CAMBIA
//   · **nada sale de la instalación**: pdf.js es una biblioteca local, no un servicio;
//   · **no hay OCR**: una imagen o un PDF escaneado siguen sin leerse, y se declara. El OCR tampoco exigiría
//     un tercero —hay motores locales, como Tesseract—; simplemente no está incorporado;
//   · **los límites se conservan**: tope de páginas, de caracteres y de tiempo, y el corte **se declara**;
//   · **la procedencia se conserva**: el motor y su versión viajan con cada extracción.
//
// RECHAZO EXPLÍCITO ANTES DE SUGERIR, Y POR QUÉ NO BASTA MIRAR EL RESULTADO
// Una fuente **compuesta** (`/Type0`, típicamente `Identity-H`) **sin `/ToUnicode`** escribe identificadores
// de glifo. Si nadie los traduce, se interpretan como códigos de carácter y se obtiene algo **perfectamente
// imprimible que NO es el texto del documento** —comprobado: un archivo así devuelve «HIJK», sin ningún
// carácter de reemplazo que delate el problema—.
//
// Por eso el rechazo **no** se decide mirando el resultado, sino **la estructura del documento**: antes de
// publicar nada se comprueba que **toda fuente compuesta declare su `/ToUnicode`**. Si alguna no lo hace, el
// resultado se **rechaza entero** y **no se sugiere ningún campo**, por legible que parezca. Como red
// adicional se rechazan también los caracteres de reemplazo y los del área de uso privado.

export const MOTOR = 'pdfjs-dist';
/** Versión del componente, fijada en `package.json`. Viaja con cada extracción como procedencia. */
export const MOTOR_VERSION = '4.10.38';

/** Tope de texto acumulado. Un documento operativo normal cabe de sobra. */
export const MAX_CHARS = 200_000;
/** Tope de páginas leídas. */
export const MAX_PAGES = 200;
/** Tope de tiempo de lectura, para que un archivo patológico no bloquee el proceso. */
export const MAX_MS = 20_000;
/** Tope por flujo al inspeccionar la estructura en busca de fuentes sin mapa. */
export const MAX_STREAM_BYTES = 4_000_000;
/** Ventana alrededor de `/Type0` donde se busca su `/ToUnicode`: un diccionario de fuente cabe de sobra. */
const VENTANA_DICT = 600;

/** Caracteres que delatan un mapeo fallido: reemplazo y área de uso privado. Es la red, no la comprobación. */
const SIN_MAPEAR = /[�-]/;

export interface TextoPdf {
  text: string;
  /** Páginas leídas. */
  pages: number;
  /** `true` si se alcanzó algún límite y el texto quedó incompleto. */
  truncated: boolean;
  /** `true` si el documento trae capa de texto, se pueda mapear o no. */
  hasTextLayer: boolean;
  /** `false` si no se puede garantizar que el texto sea el del documento: no se publica nada. */
  interpretable: boolean;
  /** Por qué se rechazó, cuando `interpretable` es `false`. */
  reason: 'OK' | 'SIN_CAPA_DE_TEXTO' | 'FUENTE_SIN_MAPA' | 'NO_SE_PUDO_ABRIR';
  /** Fragmentos con caracteres sin mapear. Se publica para poder comprobarlo. */
  unmapped_items: number;
  /** Fuentes compuestas sin `/ToUnicode`. Si hay alguna, no se publica nada. */
  fonts_without_map: number;
}

interface DocumentoPdf {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }>;
  destroy: () => Promise<void>;
}

/**
 * ¿Hay alguna fuente **compuesta** sin `/ToUnicode`? Es la comprobación que de verdad importa: sin ese mapa,
 * los códigos son identificadores de glifo y lo obtenido **no será el texto del documento**, aunque lo parezca.
 *
 * Mira el cuerpo visible **y** los flujos descomprimidos, porque los PDF modernos guardan los diccionarios
 * dentro de flujos de objetos. Un flujo que no se puede descomprimir se omite.
 */
export function fuentesCompuestasSinMapa(bytes: Buffer): number {
  let txt = bytes.toString('latin1');
  const re = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  let anadidos = 0;
  while ((m = re.exec(txt)) !== null && anadidos < 200) {
    const ini = m.index + m[0].length;
    const fin = txt.indexOf('endstream', ini);
    if (fin < 0) break;
    re.lastIndex = fin + 'endstream'.length;
    const cuerpo = Buffer.from(txt.slice(ini, fin), 'latin1');
    if (cuerpo.length === 0 || cuerpo.length > MAX_STREAM_BYTES) continue;
    try {
      txt += `\n${inflateSync(cuerpo).toString('latin1')}`;
      anadidos += 1;
    } catch { /* un flujo que no se descomprime no aporta diccionarios legibles */ }
  }
  let sinMapa = 0;
  for (const c of txt.matchAll(/\/Subtype\s*\/Type0/g)) {
    const i = c.index ?? 0;
    const trozo = txt.slice(Math.max(0, i - VENTANA_DICT), Math.min(txt.length, i + VENTANA_DICT));
    if (!/\/ToUnicode/.test(trozo)) sinMapa += 1;
  }
  return sinMapa;
}

/**
 * Lee la capa de texto de un PDF con pdf.js. **Nunca lanza**: un archivo ilegible devuelve texto vacío con su
 * razón, que el módulo publica como límite declarado y no como fallo del sistema.
 */
export async function textoDePdf(bytes: Buffer): Promise<TextoPdf> {
  const base = { text: '', pages: 0, truncated: false, hasTextLayer: false, unmapped_items: 0, fonts_without_map: 0 };

  let doc: DocumentoPdf;
  try {
    // Importación dinámica: `pdfjs-dist` es ESM y esta aplicación se compila a CommonJS.
    const cargar = Function('return import("pdfjs-dist/legacy/build/pdf.mjs")') as () => Promise<{
      getDocument: (opts: Record<string, unknown>) => { promise: Promise<DocumentoPdf> };
    }>;
    const pdfjs = await cargar();
    doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      // Sin red, sin tipografías del sistema y sin evaluación dinámica: lectura local y acotada.
      useSystemFonts: false,
      isEvalSupported: false,
      disableFontFace: true,
      stopAtErrors: false,
    }).promise;
  } catch {
    return { ...base, interpretable: false, reason: 'NO_SE_PUDO_ABRIR' };
  }

  const limite = Date.now() + MAX_MS;
  let texto = '';
  let paginas = 0;
  let truncado = false;
  let capaDeTexto = false;
  let sinMapear = 0;

  try {
    const total = Math.min(doc.numPages, MAX_PAGES);
    if (doc.numPages > MAX_PAGES) truncado = true;
    for (let i = 1; i <= total; i += 1) {
      if (Date.now() > limite) { truncado = true; break; }
      const pagina = await doc.getPage(i);
      const contenido = await pagina.getTextContent();
      for (const it of contenido.items) {
        const s = it.str ?? '';
        if (s.trim().length > 0) capaDeTexto = true;
        if (SIN_MAPEAR.test(s)) sinMapear += 1;
        texto += s;
        if (it.hasEOL) texto += '\n';
      }
      texto += '\n';
      paginas = i;
      if (texto.length > MAX_CHARS) { texto = texto.slice(0, MAX_CHARS); truncado = true; break; }
    }
  } catch {
    // Un fallo a mitad no invalida lo ya leído, pero sí lo deja incompleto, y se declara.
    truncado = true;
  } finally {
    await doc.destroy().catch(() => undefined);
  }

  const limpio = texto.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const sinMapa = fuentesCompuestasSinMapa(bytes);

  if (sinMapa > 0 || sinMapear > 0) {
    // No se puede garantizar que el texto sea el del documento: se rechaza ENTERO antes de sugerir nada.
    return {
      text: '', pages: paginas, truncated: truncado, hasTextLayer: true,
      interpretable: false, reason: 'FUENTE_SIN_MAPA', unmapped_items: sinMapear, fonts_without_map: sinMapa,
    };
  }
  if (!capaDeTexto || limpio.length === 0) {
    return {
      text: '', pages: paginas, truncated: truncado, hasTextLayer: capaDeTexto,
      interpretable: !capaDeTexto, reason: 'SIN_CAPA_DE_TEXTO', unmapped_items: 0, fonts_without_map: 0,
    };
  }
  return {
    text: limpio, pages: paginas, truncated: truncado, hasTextLayer: true,
    interpretable: true, reason: 'OK', unmapped_items: 0, fonts_without_map: 0,
  };
}
