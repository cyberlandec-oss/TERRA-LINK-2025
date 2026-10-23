// Guía documental ORIENTATIVA por aspecto (A-05, CTX-05/CTX-06). Deriva de las síntesis de guías EUDR aportadas por el propietario
// (docs/contexto/CONTEXTO_FUNCIONAL_EUDR_ECUADOR_2026-10-22.md, B02–B09). Reglas que no se pierden:
//   · Es una GUÍA, no una lista obligatoria uniforme ni un dictamen de aplicabilidad: cada situación (productor familiar, asociación,
//     empresa con trabajadores) es distinta. Una regla jurídica concreta se contrasta con el PDF original antes de adoptarla.
//   · Subir un archivo no lo aprueba ni acredita su autenticidad o validez; la revisión es de una persona autorizada y es un paso aparte.
//   · La guía NO bloquea la carga: no depende de la revisión de ningún perfil global.
//   · Los tipos de documento son los del catálogo de sistema vigente. Si un aspecto no tiene tipo propio, se dice (decisión pendiente).
//   · La «situación de trabajo» solo orienta lo que se muestra: no se guarda ni se usa para deducir una categoría jurídica.

export type OwnerKind = 'plot' | 'producer';

export interface Aspecto {
  id: string;
  titulo: string;
  para: string;
  ejemplos: string[];
  aclarar: string;
  fuente: string;
  /** Códigos de `document_types` hoy disponibles para este aspecto ([] = sin tipo específico en el catálogo vigente). */
  tipos: string[];
  nota?: string;
}

export const SIN_TIPO = 'El catálogo actual no tiene un tipo de documento específico para este aspecto: pídele a tu organización que lo incorpore, o adjunta el soporte como evidencia del recorrido de campo mientras tanto.';

export const GUIA: Record<OwnerKind, Aspecto[]> = {
  plot: [
    {
      id: 'tenencia', titulo: 'Tenencia o derecho de uso',
      para: 'Documenta cómo se usa la tierra: propiedad, arrendamiento, comodato, comunidad u otra forma.',
      ejemplos: ['Título de propiedad', 'Contrato de arrendamiento o de uso', 'Autorización o adjudicación', 'Otro soporte que consideres pertinente'],
      aclarar: 'Indica quién es titular y cómo se usa la parcela. No hace falta ser propietario: el soporte depende de tu situación.',
      fuente: 'B02 (tenencia de tierras); B08', tipos: ['LAND_TENURE'],
    },
    {
      id: 'cobertura', titulo: 'Historia de la parcela y cambios de cobertura',
      para: 'Aporta lo que ayude a explicar el uso de la parcela en el tiempo, además de su ubicación.',
      ejemplos: ['Informes de análisis o de inspección', 'Observaciones de campo con su fecha', 'Fotografías con su contexto (una foto aislada no basta para reconstruir un cambio de cobertura)'],
      aclarar: 'Distingue las fechas: siembra, producción, captura de la geometría y cambio de cobertura son hechos distintos.',
      fuente: 'B07 pp. 27–28; B02', tipos: ['FIELD_EVIDENCE'],
      nota: 'Las fotografías y actas del recorrido se adjuntan en «Evidencias del recorrido de campo».',
    },
    {
      id: 'ambiente', titulo: 'Aspectos ambientales',
      para: 'Documenta gestiones o permisos ambientales que correspondan a tu caso.',
      ejemplos: ['Permisos o gestiones ambientales pertinentes', 'Evidencias ambientales de la actividad'],
      aclarar: 'Depende de la actividad, de dónde está la parcela y de la regla que aplique: no es el mismo requisito para todos.',
      fuente: 'B02; B07', tipos: [], nota: SIN_TIPO,
    },
    {
      id: 'terceros', titulo: 'Derechos de terceros y comunidades',
      para: 'Documenta acuerdos o situaciones con otras personas o comunidades, si existen.',
      ejemplos: ['Acuerdos o comunicaciones con comunidades o vecinos', 'Actas relacionadas con una situación declarada'],
      aclarar: 'Indica quiénes son los titulares o las comunidades y el alcance real de cada documento.',
      fuente: 'B02; B07', tipos: [], nota: SIN_TIPO,
    },
  ],
  producer: [
    {
      id: 'operaciones', titulo: 'Actividad y operaciones',
      para: 'Documenta lo que produces y entregas.',
      ejemplos: ['Registros propios de producción y venta', 'Comprobantes de compra, venta, entrega o traslado'],
      aclarar: 'Relaciona cada soporte con la operación a la que corresponde (entrega, cantidad y fecha).',
      fuente: 'B04 pp. 11–14; B06; B07 pp. 24–25', tipos: ['DELIVERY_SUPPORT'],
    },
    {
      id: 'tenencia-productor', titulo: 'Tenencia o derecho de uso',
      para: 'Si el soporte describe tu relación con la tierra en general, puede aportarse aquí o en cada parcela.',
      ejemplos: ['Título, contrato o autorización', 'Otro soporte que consideres pertinente'],
      aclarar: 'No hace falta ser propietario: el soporte depende de tu situación.',
      fuente: 'B02; B08', tipos: ['LAND_TENURE'],
    },
    {
      id: 'trabajo', titulo: 'Trabajo y aspectos sociales',
      para: 'Primero cuenta cómo se trabaja la finca; los soportes cambian según el caso.',
      ejemplos: [],
      aclarar: 'No es lo mismo el trabajo familiar, ser socio, ser autónomo o tener trabajadores contratados.',
      fuente: 'B09 pp. 4–6 y 10–12; B08', tipos: [], nota: SIN_TIPO,
    },
  ],
};

export interface SituacionTrabajo { id: string; etiqueta: string; orientacion: string }
export const SITUACIONES_TRABAJO: SituacionTrabajo[] = [
  { id: 'familiar', etiqueta: 'Trabajo familiar', orientacion: 'Normalmente no hay contratos de trabajo. Describe quiénes trabajan y qué parte de la actividad hacen; los soportes laborales de trabajadores contratados no suelen aplicar.' },
  { id: 'socio', etiqueta: 'Socio de una asociación u organización', orientacion: 'Aporta el soporte que muestre tu vínculo con la organización y cómo se gestiona el trabajo, si existe.' },
  { id: 'autonomo', etiqueta: 'Trabajador autónomo', orientacion: 'Aporta los soportes de tu propia actividad (registros o comprobantes) que correspondan a tu caso.' },
  { id: 'contratados', etiqueta: 'Con trabajadores contratados', orientacion: 'Suelen corresponder soportes laborales de esas personas (por ejemplo, contratos o registros); incluye solo lo necesario y evita datos personales que no correspondan.' },
];

export const NOTAS_GENERALES = [
  'Esto es una guía de orientación, no una lista obligatoria: cada situación es distinta.',
  'Subir un archivo no lo aprueba ni acredita su autenticidad o validez: una persona autorizada lo revisa aparte.',
  'Aporta solo lo necesario y evita datos personales que no correspondan.',
];
export const FUENTE_GUIA = 'Fuente: síntesis de guías EUDR aportadas por el propietario (22 de octubre de 2026). Orientación, no un dictamen de aplicabilidad.';

/** Todos los textos de la guía (para comprobar su traducción). */
export function textosGuia(): string[] {
  const out: string[] = [SIN_TIPO, FUENTE_GUIA, ...NOTAS_GENERALES];
  for (const lista of Object.values(GUIA)) for (const a of lista) out.push(a.titulo, a.para, a.aclarar, ...a.ejemplos, ...(a.nota ? [a.nota] : []));
  for (const s of SITUACIONES_TRABAJO) out.push(s.etiqueta, s.orientacion);
  return [...new Set(out)];
}
