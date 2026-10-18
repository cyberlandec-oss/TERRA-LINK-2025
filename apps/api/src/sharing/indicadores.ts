import type { DdContent, Requirement } from '../dd/requirements';

// RF-32 / D-48(A) — Los once indicadores del Buyer Portal (S3 §22.8), como **estados del recurso concedido**.
//
// DE DÓNDE SALEN
// **No hay motor nuevo.** Cada indicador se deriva de lo que el expediente ya calcula: `evaluateRequirements()`
// sobre el contenido del lote, más los agregados que la proyección ya entregaba. Si mañana cambia una regla de
// riesgo, el indicador cambia con ella, porque es la misma evaluación.
//
// QUÉ NO SALEN
// Ni identidad de productores, ni coordenadas, ni contenido documental, ni identificadores de recursos
// relacionados. Un indicador es **un estado y su fundamento**, nunca el dato que lo produjo. Por eso tampoco
// se copia el `detail` ni las `references` del requisito: ahí viajan códigos de parcelas y entregas.
//
// SEIS ESTADOS, PORQUE SEIS COSAS DISTINTAS
// Colapsarlos convertiría «no se sabe» en «conforme», que es justo lo que no puede pasar:
//   · `FAVORABLE`      — hay resultado y es favorable;
//   · `DESFAVORABLE`   — hay resultado y NO es favorable;
//   · `PENDIENTE`      — falta algo que está en curso o por hacer;
//   · `DESACTUALIZADO` — hubo evaluación, pero ya no corresponde al estado actual;
//   · `NO_EVALUABLE`   — no se puede concluir: falta una capacidad o una decisión que nadie ha tomado;
//   · `SIN_EVALUAR`    — sencillamente no se ha evaluado.
//
// LAS TRES DISTINCIONES QUE NO SE PUEDEN PERDER
//   1. **geolocalización técnica ≠ perfil jurídico** — que una geometría sea válida no dice que cumpla el
//      perfil que exige la norma;
//   2. **análisis de deforestación ≠ conclusión regulatoria** — un análisis sin alertas no concluye nada;
//   3. **preparación del expediente ≠ presentación de una DDS** — `READY` es interno; una DDS se presenta
//      fuera de aquí, y hoy **ninguna lo está**.

export type EstadoIndicador = 'FAVORABLE' | 'DESFAVORABLE' | 'PENDIENTE' | 'DESACTUALIZADO' | 'NO_EVALUABLE' | 'SIN_EVALUAR';

export interface Indicador {
  code: string;
  label: string;
  state: EstadoIndicador;
  /** Qué significa ese estado aquí. Sin identificadores ni datos del recurso. */
  note: string;
  /** Versión y fecha que SUSTENTAN el resultado, para que una evaluación histórica no parezca actual. */
  basis?: { version?: string | null; evaluated_at?: string | null };
}

/** Un requisito por código, o `undefined` si esa evaluación no existe. */
const req = (rs: Requirement[], code: string) => rs.find((r) => r.code === code);

/** Traducción directa del estado del requisito, cuando no hay matiz que añadir. */
function deRequisito(r: Requirement | undefined, cuandoFalta: EstadoIndicador = 'SIN_EVALUAR'): EstadoIndicador {
  if (!r) return cuandoFalta;
  if (r.status === 'MET') return 'FAVORABLE';
  if (r.status === 'INVALID') return 'DESFAVORABLE';
  if (r.status === 'PENDING') return 'PENDIENTE';
  return 'NO_EVALUABLE';
}

/**
 * Período de producción (S1 §44 `production_period`), **con su precisión declarada**.
 *
 * `DERIVADO` no es `DÍA`: cuando solo hay fechas deducidas de la entrega, se dice que son deducidas. Deducir
 * una cosecha de la fecha en que se entregó el cacao sería inventar un dato que nadie declaró.
 */
export interface PeriodoProduccion {
  precision: 'DAY' | 'MONTH' | 'UNKNOWN' | 'DERIVED' | 'NONE';
  start: string | null;
  end: string | null;
  note: string;
}

export function periodoDeProduccion(
  cosechas: Array<{ harvest_precision: string | null; harvest_start: string | null; harvest_end: string | null; harvest_derived_start: string | null; harvest_derived_end: string | null }>,
): PeriodoProduccion {
  const declaradas = cosechas.filter((c) => c.harvest_start && c.harvest_precision && c.harvest_precision !== 'UNKNOWN');
  if (declaradas.length) {
    const inicio = declaradas.map((c) => c.harvest_start!).sort()[0];
    const fin = declaradas.map((c) => c.harvest_end ?? c.harvest_start!).sort().at(-1)!;
    // Si las entregas se declararon con precisiones distintas, manda la MÁS GRUESA: no se finge exactitud.
    const precision = declaradas.some((c) => c.harvest_precision === 'MONTH') ? 'MONTH' : 'DAY';
    return { precision, start: inicio, end: fin,
      note: `Período declarado por la organización con precisión de ${precision === 'MONTH' ? 'mes' : 'día'}. Terra Link no lo verifica.` };
  }
  const derivadas = cosechas.filter((c) => c.harvest_derived_start);
  if (derivadas.length) {
    const inicio = derivadas.map((c) => c.harvest_derived_start!).sort()[0];
    const fin = derivadas.map((c) => c.harvest_derived_end ?? c.harvest_derived_start!).sort().at(-1)!;
    return { precision: 'DERIVED', start: inicio, end: fin,
      note: 'DEDUCIDO de la fecha de entrega, no declarado como cosecha. No debe leerse como período de producción declarado.' };
  }
  return { precision: 'NONE', start: null, end: null, note: 'Sin período de cosecha declarado ni deducible.' };
}

/**
 * Los once indicadores de S3 §22.8. Los dos de recuento (productores y parcelas) siguen viajando como
 * agregados en la proyección; aquí van los nueve que son **estado**.
 */
export function indicadoresDe(c: DdContent, rs: Requirement[]): Indicador[] {
  const riesgo = c.risk;
  const sustentoRiesgo = riesgo
    ? { version: `evaluación ${riesgo.evaluation_number} · reglas ${riesgo.rule_set_version}`, evaluated_at: null }
    : undefined;

  // Geometría: versión de cada parcela, para que no parezca actual una validación de una versión anterior.
  const versionesGeo = c.plots.map((p) => p.version_number).filter((v): v is number => v != null);
  const sustentoGeo = versionesGeo.length ? { version: `versiones de geometría ${[...new Set(versionesGeo)].sort((a, b) => a - b).join(', ')}` } : undefined;

  const evidencias = c.evidence ?? [];
  const verificadas = evidencias.filter((e) => e.status === 'VERIFIED').length;
  const revocadas = evidencias.filter((e) => e.status === 'REVOKED').length;
  const pendientes = evidencias.length - verificadas - revocadas;

  const origenDeclarado = req(rs, 'ORIGIN_DECLARED');
  const geometria = req(rs, 'GEOMETRY_TECHNICAL');
  const perfilGeo = req(rs, 'GEOLOCATION_PROFILE');
  const deforestacion = req(rs, 'DEFORESTATION_ANALYSIS');
  const legal = req(rs, 'LEGAL_PROFILE');
  const balance = req(rs, 'QUANTITIES_CONSISTENT');
  const conclusion = req(rs, 'REGULATORY_CONCLUSION');
  const vigencia = req(rs, 'RISK_EVALUATION_CURRENT');

  return [
    {
      code: 'ORIGEN_IDENTIFICADO',
      label: 'Origen identificado',
      state: deRequisito(origenDeclarado),
      note: 'Si las entregas del lote declaran la parcela de origen. Declarado por la organización; Terra Link no lo verifica en campo.',
    },
    {
      code: 'GEOLOCALIZACION_VALIDADA',
      label: 'Geolocalización validada (técnica)',
      // Si la geometría es técnicamente válida pero el perfil jurídico no está aprobado, NO se presenta como
      // conformidad: se dice que lo validado es lo técnico.
      state: deRequisito(geometria),
      note: perfilGeo && perfilGeo.status !== 'MET'
        ? 'Validación TÉCNICA de la geometría. NO acredita el perfil jurídico de geolocalización, que sigue sin aprobarse: una geometría válida no es una geometría conforme.'
        : 'Validación técnica de la geometría.',
      basis: sustentoGeo,
    },
    {
      code: 'DEFORESTACION_REVISADA',
      label: 'Deforestación revisada',
      state: deRequisito(deforestacion, 'SIN_EVALUAR'),
      note: 'Análisis TÉCNICO de deforestación. No es una conclusión regulatoria, y la ausencia de alertas no prueba ausencia de deforestación.',
    },
    {
      code: 'LEGALIDAD_REVISADA',
      label: 'Legalidad revisada',
      state: deRequisito(legal),
      note: 'Depende del perfil jurídico aplicable. Un perfil parcial o sin revisión jurídica no acredita legalidad.',
    },
    {
      code: 'TRAZABILIDAD_COMPLETA',
      label: 'Trazabilidad completa',
      state: c.subject.origin_status === 'COMPLETE' ? 'FAVORABLE'
        : c.subject.origin_status === 'INCOMPLETE' ? 'DESFAVORABLE' : 'NO_EVALUABLE',
      note: 'Si la cadena de origen del lote está completa hacia atrás. Origen desconocido sigue siendo desconocido.',
    },
    {
      code: 'BALANCE_DE_MASA',
      label: 'Balance de masa',
      state: deRequisito(balance),
      note: 'Coherencia entre el inventario y el dominio. Una diferencia se corrige con un ajuste auditado, no borrando el histórico.',
    },
    {
      code: 'EVIDENCIAS',
      label: 'Evidencias',
      // Presencia NO es suficiencia: se informa disponibilidad y revisión, nunca «evidencia suficiente».
      state: evidencias.length === 0 ? 'SIN_EVALUAR'
        : revocadas > 0 ? 'DESFAVORABLE'
          : pendientes > 0 ? 'PENDIENTE'
            : 'FAVORABLE',
      note: `${evidencias.length} evidencia(s) registradas: ${verificadas} verificada(s), ${pendientes} sin verificar, ${revocadas} revocada(s). `
        + 'Indica DISPONIBILIDAD y REVISIÓN, no suficiencia: que una evidencia esté cargada y supere el análisis antimalware no la vuelve suficiente. No da acceso a los originales.',
    },
    {
      code: 'RIESGO_FINAL',
      label: 'Riesgo final',
      // La conclusión regulatoria es lo que decide; el resultado técnico NO la sustituye.
      state: vigencia && vigencia.status === 'INVALID' ? 'DESACTUALIZADO' : deRequisito(conclusion),
      note: riesgo
        ? `Resultado técnico «${riesgo.technical_result}»; conclusión regulatoria «${riesgo.conclusion}». El resultado técnico NO es la conclusión regulatoria.`
        : 'Sin evaluación de riesgo del lote: no se presume ausencia de hallazgos.',
      basis: sustentoRiesgo,
    },
    {
      code: 'DDS',
      label: 'DDS presentada',
      // Terra Link no presenta DDS. Esto no es un pendiente del lote: es un límite del producto.
      state: 'NO_EVALUABLE',
      note: 'Terra Link NO presenta declaraciones de diligencia debida. La preparación interna del expediente —incluido READY— no es una DDS presentada ni acredita conformidad EUDR.',
    },
  ];
}
