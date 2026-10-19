import { inflateSync } from 'node:zlib';

// P1-013 — Lectura del texto de un PDF, **en local y con decodificación real**.
//
// POR QUÉ CAMBIÓ EL MOTOR (2026-10-19)
// La primera versión descomprimía los flujos a mano y recogía los operadores de texto. Eso funciona con PDF
// sencillos, pero **no decodifica**: la mayoría de los PDF reales subconjuntan las fuentes y escriben
// **identificadores de glifo**, que solo se traducen leyendo el mapa de la fuente. Las heurísticas que se
// probaron —proporción de caracteres legibles, caracteres de control, ausencia de espacios— **detectaban los
// ejemplos probados**, pero no demuestran que los caracteres correspondan al documento: un texto mal
// decodificado puede seguir pareciendo texto.
//
// Reconstruir un lector de PDF general a mano sería rehacer, peor, algo que ya existe. Así que **solo esa
// pieza** se sustituye por un componente **mantenido y local**: **pdf.js** (`pdfjs-dist`), el motor de PDF de
// Mozilla, que interpreta codificaciones y mapas de fuente.
//
// LA COMPROBACIÓN DE SOPORTE ES **POR OBJETO**, NO POR PROXIMIDAD (2026-10-19)
// Una primera versión de esta comprobación buscaba `/ToUnicode` en una **ventana de texto** alrededor de cada
// `/Type0`. Eso **no demuestra asociación**: con dos fuentes vecinas —una con mapa y otra sin él— el mapa de
// la primera **validaba indebidamente** a la segunda. Comprobado con un archivo construido a propósito: la
// ventana encontraba **0** fuentes sin mapa cuando había **1**, y la segunda fuente producía «HIJK»,
// perfectamente imprimible y **falso**.
//
// Ahora se **interpretan los objetos del documento y sus referencias**: se enumeran los objetos —incluidos
// los que viven dentro de **flujos de objetos** (`/ObjStm`), que es donde los guardan los PDF modernos— y de
// cada fuente compuesta se mira **su propio diccionario**. Si no declara `/ToUnicode`, **esa** fuente no se
// puede traducir, por mucho que otra de al lado sí.
//
// Y si **no se puede determinar** el soporte —un flujo de objetos que no se descomprime, una cabecera que no
// se entiende—, **no se da por bueno**: se devuelve una **limitación explícita** y no se sugiere nada.
// Tampoco se presenta la mera presencia de `/ToUnicode` como garantía de que el mapa sea correcto: lo que
// acredita es que el documento **declara** el soporte; sin esa declaración, el rechazo es seguro.
//
// LO QUE **NO** CAMBIA
//   · **nada sale de la instalación**: pdf.js es una biblioteca local, no un servicio;
//   · **no hay OCR**: una imagen o un PDF escaneado siguen sin leerse, y se declara;
//   · **los límites se conservan y ahora INTERRUMPEN de verdad**: cada operación —abrir, leer una página,
//     extraer su texto— va contra un plazo, y al vencer se **libera el documento** en vez de esperar;
//   · **la procedencia se conserva**: el motor y su versión viajan con cada extracción.

export const MOTOR = 'pdfjs-dist';
/** Versión del componente, fijada en `package.json`. Viaja con cada extracción como procedencia. */
export const MOTOR_VERSION = '4.10.38';

/** Tope de texto acumulado. Un documento operativo normal cabe de sobra. */
export const MAX_CHARS = 200_000;
/** Tope de páginas leídas. */
export const MAX_PAGES = 200;
/** Plazo de cada operación del lector: abrir, obtener una página, extraer su texto. */
export const MAX_MS_OPERACION = 10_000;
/** Plazo total de la lectura. */
export const MAX_MS_TOTAL = 30_000;
/** Tope por flujo al auditar la estructura. */
export const MAX_STREAM_BYTES = 4_000_000;
/** Tope de objetos inspeccionados al auditar la estructura. */
export const MAX_OBJETOS = 20_000;

/** Caracteres que delatan un mapeo fallido. Es una red adicional, no la comprobación. */
const SIN_MAPEAR = /[�-]/;

export interface AuditoriaFuentes {
  /** Fuentes compuestas encontradas. */
  composite: number;
  /** Fuentes compuestas que **no declaran** `/ToUnicode` en su propio diccionario. */
  without_map: number;
  /** Partes del documento que no se pudieron inspeccionar: impiden afirmar que todo se comprobó. */
  undetermined: number;
}

export interface TextoPdf {
  text: string;
  pages: number;
  /** `true` si se alcanzó algún límite y el texto quedó incompleto. */
  truncated: boolean;
  /** `true` si el documento trae capa de texto, se pueda mapear o no. */
  hasTextLayer: boolean;
  /** `false` si no se puede garantizar que el texto sea el del documento: no se publica nada. */
  interpretable: boolean;
  reason: 'OK' | 'SIN_CAPA_DE_TEXTO' | 'FUENTE_SIN_MAPA' | 'SOPORTE_INDETERMINADO' | 'NO_SE_PUDO_ABRIR' | 'TIEMPO_AGOTADO';
  /** Fragmentos con caracteres sin mapear. */
  unmapped_items: number;
  /** Auditoría estructural de las fuentes. */
  fonts: AuditoriaFuentes;
}

interface DocumentoPdf {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }>;
  destroy: () => Promise<void>;
}

// El componente se carga UNA vez, al cargar este módulo. Hacerlo dentro de la petición dejaba importaciones
// tardías —incluido el trabajador de pdf.js— que llegaban a dispararse después de que el entorno de pruebas
// se hubiera desmontado, y hacían fallar la lectura.
const PDFJS = (Function('return import("pdfjs-dist/legacy/build/pdf.mjs")') as () => Promise<{
  getDocument: (opts: Record<string, unknown>) => { promise: Promise<DocumentoPdf>; destroy: () => Promise<void> };
}>)();
const PDFJS_WORKER = (Function('return import("pdfjs-dist/legacy/build/pdf.worker.mjs")') as () => Promise<unknown>)();

/** Rechaza al vencer el plazo, para que un archivo que se atasca **no** bloquee el proceso. */
function conPlazo<T>(p: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`TIEMPO_AGOTADO:${etiqueta}`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Audita las fuentes **objeto a objeto**: cada fuente compuesta se comprueba en **su propio diccionario**,
 * no por proximidad textual. Enumera también los objetos guardados dentro de flujos `/ObjStm`.
 *
 * Lo que no se puede inspeccionar se cuenta en `undetermined`: **no** se da por comprobado.
 */
export function auditarFuentes(bytes: Buffer): AuditoriaFuentes {
  const crudo = bytes.toString('latin1');
  const cuerpos: string[] = [];
  let indeterminados = 0;

  const superiores: Array<{ body: string }> = [];
  for (const m of crudo.matchAll(/\d+\s+\d+\s+obj\b([\s\S]*?)\bendobj/g)) {
    if (superiores.length >= MAX_OBJETOS) { indeterminados += 1; break; }
    superiores.push({ body: m[1] });
  }
  for (const o of superiores) cuerpos.push(o.body);

  for (const o of superiores) {
    if (!/\/Type\s*\/ObjStm/.test(o.body)) continue;
    const ini = o.body.indexOf('stream');
    const fin = o.body.indexOf('endstream');
    if (ini < 0 || fin < 0) { indeterminados += 1; continue; }
    const datos = Buffer.from(o.body.slice(ini + 'stream'.length, fin).replace(/^\r?\n/, ''), 'latin1');
    if (datos.length === 0 || datos.length > MAX_STREAM_BYTES) { indeterminados += 1; continue; }
    let plano: string;
    try { plano = inflateSync(datos).toString('latin1'); } catch { indeterminados += 1; continue; }
    const n = Number(/\/N\s+(\d+)/.exec(o.body)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(o.body)?.[1] ?? 0);
    if (!n || !first) { indeterminados += 1; continue; }
    const cab = plano.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i += 1) {
      const off = cab[i * 2 + 1];
      const sig = i + 1 < n ? cab[(i + 1) * 2 + 1] : plano.length - first;
      if (!Number.isFinite(off) || !Number.isFinite(sig)) { indeterminados += 1; continue; }
      cuerpos.push(plano.slice(first + off, first + sig));
    }
  }

  let compuestas = 0;
  let sinMapa = 0;
  for (const body of cuerpos) {
    if (!/\/Subtype\s*\/Type0/.test(body)) continue;
    compuestas += 1;
    // El `/ToUnicode` tiene que estar en ESTE diccionario, no cerca de él.
    if (!/\/ToUnicode/.test(body)) sinMapa += 1;
  }
  return { composite: compuestas, without_map: sinMapa, undetermined: indeterminados };
}

/**
 * Lee la capa de texto de un PDF con pdf.js. **Nunca lanza**: un archivo ilegible devuelve texto vacío con su
 * razón, que el módulo publica como límite declarado y no como fallo del sistema.
 */
export async function textoDePdf(bytes: Buffer): Promise<TextoPdf> {
  const fonts = auditarFuentes(bytes);
  const base = { text: '', pages: 0, truncated: false, hasTextLayer: false, unmapped_items: 0, fonts };

  let doc: DocumentoPdf;
  let tarea: { destroy: () => Promise<void> } | null = null;
  try {
    const pdfjs = await PDFJS;
    await PDFJS_WORKER;
    const t = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      // Sin red, sin tipografías del sistema y sin evaluación dinámica: lectura local y acotada.
      useSystemFonts: false,
      isEvalSupported: false,
      disableFontFace: true,
      stopAtErrors: false,
    });
    tarea = t;
    doc = await conPlazo(t.promise, MAX_MS_OPERACION, 'abrir');
  } catch (e) {
    // Si la apertura se atasca, se cancela la tarea para liberar el trabajador y la memoria.
    await tarea?.destroy().catch(() => undefined);
    const agotado = String((e as Error)?.message ?? '').startsWith('TIEMPO_AGOTADO');
    return { ...base, interpretable: false, reason: agotado ? 'TIEMPO_AGOTADO' : 'NO_SE_PUDO_ABRIR' };
  }

  const fin = Date.now() + MAX_MS_TOTAL;
  let texto = '';
  let paginas = 0;
  let truncado = false;
  let capaDeTexto = false;
  let sinMapear = 0;
  let agotado = false;

  try {
    const total = Math.min(doc.numPages, MAX_PAGES);
    if (doc.numPages > MAX_PAGES) truncado = true;
    for (let i = 1; i <= total; i += 1) {
      const restante = fin - Date.now();
      if (restante <= 0) { truncado = true; agotado = true; break; }
      const plazo = Math.min(MAX_MS_OPERACION, restante);
      const pagina = await conPlazo(doc.getPage(i), plazo, `pagina ${i}`);
      const contenido = await conPlazo(pagina.getTextContent(), plazo, `texto ${i}`);
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
  } catch (e) {
    // Un fallo o un plazo vencido deja el texto incompleto, y se declara.
    truncado = true;
    if (String((e as Error)?.message ?? '').startsWith('TIEMPO_AGOTADO')) agotado = true;
  } finally {
    // Pase lo que pase, el documento se libera: no se queda nada retenido.
    await doc.destroy().catch(() => undefined);
  }

  const limpio = texto.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const comun = { pages: paginas, truncated: truncado, unmapped_items: sinMapear, fonts };

  if (fonts.without_map > 0 || sinMapear > 0) {
    // Alguna fuente no declara su mapa: lo obtenido NO se puede dar por texto del documento.
    return { ...comun, text: '', hasTextLayer: true, interpretable: false, reason: 'FUENTE_SIN_MAPA' };
  }
  if (fonts.undetermined > 0 && capaDeTexto) {
    // No se pudo comprobar todo el documento: no se afirma que las fuentes estén soportadas.
    return { ...comun, text: '', hasTextLayer: true, interpretable: false, reason: 'SOPORTE_INDETERMINADO' };
  }
  if (agotado && limpio.length === 0) {
    return { ...comun, text: '', hasTextLayer: capaDeTexto, interpretable: false, reason: 'TIEMPO_AGOTADO' };
  }
  if (!capaDeTexto || limpio.length === 0) {
    return { ...comun, text: '', hasTextLayer: capaDeTexto, interpretable: !capaDeTexto, reason: 'SIN_CAPA_DE_TEXTO' };
  }
  return { ...comun, text: limpio, hasTextLayer: true, interpretable: true, reason: 'OK' };
}
