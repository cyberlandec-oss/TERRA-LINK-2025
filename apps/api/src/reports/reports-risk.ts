// P0-030 — Reparto por severidad de riesgo. Módulo PURO, para poder probar con conjuntos sintéticos los tres casos,
// incluido el MIXTO (lotes clasificados y sin clasificar a la vez), que hoy la base no permite construir:
// `risk_evaluations` lleva `CHECK (conclusion = 'UNDETERMINED' AND severity = 'NOT_ASSESSED')` (migración 0025), de modo
// que mientras el catálogo de reglas no esté aprobado NINGUNA fila puede llevar severidad. Probar la lógica aquí evita
// dejar sin cubrir la rama que se activará el día que D-07 cierre.
//
// La dependencia real es **D-07** (enums, mapping y regla aprobada) junto con el catálogo `risk_rule_sets`, que hoy está
// NOT_APPROVED y declara no tener pesos, umbrales ni severidades. NO depende de cerrar P0-021 —implementada— ni P0-028:
// verificar una mitigación entra en el resultado TÉCNICO de su factor y no asigna severidad ni concluye a favor.
import type { IndicatorStatus } from './reports-shared';

export interface SeverityInput {
  /** Severidad de este indicador. */
  sev: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Etiqueta en español para los mensajes («alto», «medio», «bajo»). */
  label: string;
  /** Lotes del tenant: el universo, que se conoce aunque no esté evaluado. */
  lotesTotal: number;
  /** Conteo por severidad de la ÚLTIMA evaluación de cada sujeto. */
  porSeveridad: Record<string, number>;
  /** Catálogo de reglas vigente, para citar su versión y estado reales en vez de una lista de historias. */
  catalogo: { version: string; approval_status: string } | null;
}

export interface SeverityResult {
  status: IndicatorStatus;
  value: string | null;
  numerator: number | null;
  denominator: number | null;
  observed: Record<string, number>;
  reason: string;
}

export function catalogNote(catalogo: SeverityInput['catalogo']): string {
  if (!catalogo) return 'No hay catálogo de reglas de riesgo publicado.';
  return (
    `El catálogo de reglas vigente es ${catalogo.version} (${catalogo.approval_status}): mientras no esté APROBADO no define pesos, ` +
    'umbrales, puntuaciones ni severidades, y el motor escribe NOT_ASSESSED en TODA evaluación. Es la decisión D-07, no un efecto de ' +
    'cerrar otras historias: verificar una mitigación (P0-021, implementada) entra en el resultado técnico de su factor y no asigna severidad.'
  );
}

/**
 * Tres casos, cada uno con su estado:
 *  - sin sujetos evaluados          → NO_DENOMINATOR (la ausencia de evaluaciones es un hecho observado, no un cero)
 *  - evaluados, ninguno clasificado → UNKNOWN
 *  - al menos uno clasificado       → OK **sobre la base de los clasificados**, nunca como distribución de todo el tenant
 */
export function severityBucket(i: SeverityInput): SeverityResult {
  const evaluados = Object.values(i.porSeveridad).reduce((a, b) => a + b, 0);
  const sinSeveridad = (i.porSeveridad.NOT_ASSESSED ?? 0) + (i.porSeveridad.UNDETERMINED ?? 0);
  const conSeveridad = evaluados - sinSeveridad;
  const observed = { lotes_del_tenant: i.lotesTotal, lotes_evaluados: evaluados, sin_severidad_asignada: sinSeveridad, con_severidad_asignada: conSeveridad };

  if (evaluados === 0) {
    return {
      status: 'NO_DENOMINATOR', value: null, numerator: null, denominator: 0, observed,
      reason: `Ningún lote tiene evaluación de riesgo: el denominador es cero. Que no haya evaluaciones es un hecho observado (${i.lotesTotal} lote(s) en el tenant), pero no permite afirmar cuántos son de riesgo ${i.label}.`,
    };
  }
  if (conSeveridad === 0) {
    return {
      status: 'UNKNOWN', value: null, numerator: null, denominator: evaluados, observed,
      reason: `Desconocido: los ${evaluados} lote(s) evaluado(s) salieron SIN severidad asignada (NOT_ASSESSED/UNDETERMINED). ${catalogNote(i.catalogo)} «0 lotes de riesgo ${i.label}» sería una cifra favorable inventada sobre sujetos sin clasificar.`,
    };
  }
  const n = i.porSeveridad[i.sev] ?? 0;
  const sinEvaluar = i.lotesTotal - evaluados;
  return {
    status: 'OK', value: String(n), numerator: n, denominator: conSeveridad, observed,
    reason:
      `${n === 0 ? 'Cero observado: ninguno de los lotes clasificados quedó en esta severidad. ' : ''}` +
      `Sobre los ${conSeveridad} lote(s) CON severidad asignada, que es el denominador. Quedan ${sinSeveridad} evaluado(s) sin severidad y ` +
      `${sinEvaluar} sin evaluar: siguen siendo desconocidos, no se cuentan como riesgo ${i.label} y esta cifra NO es la distribución de ` +
      `los ${i.lotesTotal} lote(s) del tenant.`,
  };
}
