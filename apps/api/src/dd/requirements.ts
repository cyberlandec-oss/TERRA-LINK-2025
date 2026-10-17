import { createHash } from 'crypto';

// P0-022: guards por requisito y generador del paquete, como funciones PURAS sobre el contenido de una instantánea
// (docs/13 §Ciclo del expediente y §Paquete). No leen la base: el paquete se genera solo desde la instantánea.
// - Cada requisito: MET (cumplido) · PENDING (pendiente) · INVALID (inválido) · NOT_EVALUABLE (no evaluable).
//   Una condición desconocida es NOT_EVALUABLE, nunca falsa ni favorable.
// - READY solo si TODOS están cumplidos; el porcentaje de cumplidos es informativo y no elimina bloqueos.
// - Calidad pendiente, origen incompleto o mitigaciones verificadas no equivalen a aprobación regulatoria.
// - Requisitos que dependen de decisiones o capacidades inexistentes (perfil jurídico, D-05, satélite P0-028,
//   catálogo de riesgo aprobado, vínculo con embarque P0-017/P0-029) quedan NOT_EVALUABLE: no se rebajan.

export type ReqStatus = 'MET' | 'PENDING' | 'INVALID' | 'NOT_EVALUABLE';
export type Readiness = 'BLOCKED' | 'IN_PROGRESS' | 'READY';

export interface DdContent {
  synthetic_fixture?: boolean;
  subject: { type: 'LOT'; id: string; code: string; product: string; unit: string; origin_status: string };
  quantities: { physical: string; reserved: string; available: string; unit: string; source: string };
  origin: { lots: Array<{ id: string; lot_code: string; origin_status: string }>; ledger_differences: Array<{ kind: string; id: string }> };
  deliveries: Array<{ id: string; code: string; row_version: string; origin_plots: string[] }>;
  plots: Array<{ plot_id: string; plot_code: string; version_id: string | null; version_number: number | null; geometry_type: string | null; geometry_hash: string | null; validation_status: string | null; gis_status: string | null; geometry: unknown | null }>;
  quality: Array<{ reception_id: string; delivery_code: string; decision: string }>;
  documents: Array<{ document_id: string; version_id: string; title: string; document_type: string; classification: string; version_number: number; sha256: string; file_name: string; expires_at: string | null; expired: boolean; scan: string | null; used_by: string; reference: string }>;
  evidence: Array<{ id: string; claim_type: string; entity_type: string; entity_id: string; status: string; row_version: string }>;
  risk: null | { evaluation_id: string; evaluation_number: number; snapshot_hash: string; rule_set_version: string; rule_set_approval: string;
    /** D-07.1: ¿esta organización adoptó el catálogo con el que se evaluó? Sin adopción no hay ni severidad. */
    rule_set_adopted: boolean;
    /** D-07.5: perfil jurídico bajo el que la versión fue aprobada para CONCLUIR. Hoy `null` en todas. */
    rule_set_regulatory_profile: string | null;
    technical_result: string; severity: string; conclusion: string; is_current: boolean; review_process: string; factors: Array<{ code: string; result: string; effect: string }> };
  mitigations: Array<{ id: string; factor_code: string; status: string; row_version: string; decision: string | null }>;
  /**
   * D-34.A.1: vínculo PREVIO al despacho. Un ítem de embarque con reserva activa de la misma organización.
   * Identifica embarque, ítem, lote, reserva y cantidad, que es lo que el paquete debe cubrir: una reserva de
   * OTRO embarque no lo sustituye. Al estar en el contenido, cualquier cambio —cantidad, reserva, ítem o
   * cancelación— altera el hash y **desactualiza** la instantánea, de modo que una acreditación que ya no
   * corresponde no puede usarse.
   */
  shipment_links: Array<{ shipment_id: string; shipment_code: string; shipment_status: string; item_id: string; reservation_id: string; lot_id: string; quantity: string; unit: string; location_id: string }>;
  profiles: {
    /**
     * P1-005: estado del perfil jurídico ADOPTADO por la organización, o `null` si no adoptó ninguno.
     * Es un objeto y no un texto porque el requisito necesita distinguir tres cosas: no hay perfil, hay uno
     * insuficiente (parcial o sin revisión jurídica) y hay uno completo y revisado.
     */
    legal_profile: null | { version: string; scope: 'PARTIAL' | 'COMPLETE'; legal_review_status: 'PENDING' | 'REVIEWED'; pending_matters: string[] };
    geolocation_profile: string | null; satellite_provider: string | null;
  };
}

export interface Requirement { code: string; label: string; status: ReqStatus; detail: string; source: string; references: string[] }

export const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v ?? null);
export const sha256 = (v: unknown) => createHash('sha256').update(typeof v === 'string' ? v : canonical(v)).digest('hex');

const dec = (s: string) => Number(s); // solo para comparar signo; las cantidades se conservan como texto decimal

export function evaluateRequirements(c: DdContent): Requirement[] {
  const r = (code: string, label: string, status: ReqStatus, detail: string, source: string, references: string[] = []): Requirement => ({ code, label, status, detail, source, references });
  const out: Requirement[] = [];
  // 1) Sujeto y cantidades (ledger).
  const phys = dec(c.quantities.physical);
  out.push(Number.isNaN(phys) ? r('SUBJECT_QUANTITY', 'Cantidad del sujeto con unidad', 'NOT_EVALUABLE', 'Cantidad no determinable desde el ledger.', 'docs/13 §Paquete')
    : phys > 0 ? r('SUBJECT_QUANTITY', 'Cantidad del sujeto con unidad', 'MET', `Existencia ${c.quantities.physical} ${c.quantities.unit} (ledger); reservado ${c.quantities.reserved}; disponible ${c.quantities.available}.`, 'docs/13 §Paquete')
      : r('SUBJECT_QUANTITY', 'Cantidad del sujeto con unidad', 'INVALID', `Existencia ${c.quantities.physical} ${c.quantities.unit}: sin cantidad que respaldar.`, 'docs/13 §Paquete'));
  out.push(c.origin.ledger_differences.length
    ? r('QUANTITIES_CONSISTENT', 'Cantidades consistentes (ledger y dominio)', 'INVALID', `${c.origin.ledger_differences.length} diferencia(s) entre el ledger y el dominio en el grafo.`, 'docs/13 §Ciclo (READY: cantidades consistentes)', c.origin.ledger_differences.map((d) => d.id))
    : r('QUANTITIES_CONSISTENT', 'Cantidades consistentes (ledger y dominio)', 'MET', 'El ledger concilia en los lotes y recepciones del grafo.', 'docs/13 §Ciclo'));
  // 2) Origen y geometría.
  if (!c.deliveries.length) out.push(r('ORIGIN_DECLARED', 'Origen declarado hasta parcela', 'NOT_EVALUABLE', 'El lote no tiene entregas de origen en su grafo.', 'docs/13 DATA_MISSING_ORIGIN'));
  else {
    const missing = c.deliveries.filter((d) => !d.origin_plots.length).map((d) => d.code);
    const incomplete = c.origin.lots.filter((l) => l.origin_status !== 'COMPLETE').map((l) => l.lot_code);
    out.push(missing.length || incomplete.length
      ? r('ORIGIN_DECLARED', 'Origen declarado hasta parcela', 'PENDING', `${missing.length} entrega(s) sin parcela; ${incomplete.length} lote(s) con origen incompleto. Origen desconocido sigue desconocido.`, 'docs/13 DATA_MISSING_ORIGIN', [...missing, ...incomplete])
      : r('ORIGIN_DECLARED', 'Origen declarado hasta parcela', 'MET', 'Todas las entregas declaran parcela y los lotes del grafo declaran origen.', 'docs/13 DATA_MISSING_ORIGIN'));
  }
  if (!c.plots.length) out.push(r('GEOMETRY_TECHNICAL', 'Geometría vigente técnicamente válida', 'NOT_EVALUABLE', 'Sin parcelas de origen declaradas: no hay geometría que evaluar.', 'docs/13 GEOMETRY_INVALID'));
  else {
    const invalid = c.plots.filter((p) => p.gis_status === 'INVALID').map((p) => p.plot_code);
    const unknown = c.plots.filter((p) => !p.geometry_type || !p.gis_status).map((p) => p.plot_code);
    out.push(invalid.length ? r('GEOMETRY_TECHNICAL', 'Geometría vigente técnicamente válida', 'INVALID', 'Geometría técnicamente inválida.', 'docs/13 GEOMETRY_INVALID', invalid)
      : unknown.length ? r('GEOMETRY_TECHNICAL', 'Geometría vigente técnicamente válida', 'PENDING', 'Parcela(s) sin geometría vigente o sin evaluación técnica: no se presume válida.', 'docs/13 GEOMETRY_INVALID', unknown)
        : r('GEOMETRY_TECHNICAL', 'Geometría vigente técnicamente válida', 'MET', 'Sin invalidez técnica (TL_GIS_TECH). No es análisis de deforestación.', 'docs/13 GEOMETRY_INVALID', c.plots.map((p) => p.plot_code)));
  }
  out.push(r('GEOLOCATION_PROFILE', 'Perfil de geolocalización aplicable', c.profiles.geolocation_profile ? 'MET' : 'NOT_EVALUABLE', c.profiles.geolocation_profile ?? 'Depende de D-05 (no aprobada): no puede evaluarse.', 'docs/22 D-05'));
  out.push(r('DEFORESTATION_ANALYSIS', 'Análisis de deforestación con cobertura', c.profiles.satellite_provider ? 'MET' : 'NOT_EVALUABLE', c.profiles.satellite_provider ?? 'Sin proveedor satelital (P0-028): no evaluado. Sin alertas no prueba ausencia de deforestación.', 'docs/13 SATELLITE_COVERAGE_UNKNOWN'));
  // 3) Calidad (operativa; no es requisito regulatorio ni aprobación).
  if (!c.quality.length) out.push(r('QUALITY_DECIDED', 'Calidad decidida en las recepciones', 'NOT_EVALUABLE', 'Sin recepciones en el grafo.', 'D-33 MVP (calidad pendiente)'));
  else {
    const rejected = c.quality.filter((q) => q.decision === 'REJECTED').map((q) => q.delivery_code);
    const pending = c.quality.filter((q) => q.decision !== 'RELEASED' && q.decision !== 'REJECTED').map((q) => q.delivery_code);
    out.push(rejected.length ? r('QUALITY_DECIDED', 'Calidad decidida en las recepciones', 'INVALID', 'Recepción(es) con calidad rechazada en el grafo.', 'D-33 MVP', rejected)
      : pending.length ? r('QUALITY_DECIDED', 'Calidad decidida en las recepciones', 'PENDING', 'Calidad «Pendiente de evaluación» (adoptado en D-33 MVP). Calidad no equivale a aprobación regulatoria.', 'D-33 MVP', pending)
        : r('QUALITY_DECIDED', 'Calidad decidida en las recepciones', 'MET', 'Calidad liberada en las recepciones. No equivale a aprobación regulatoria.', 'D-33 MVP'));
  }
  // 4) Soportes documentales de las entregas (D-35 MVP: la ausencia no impide recibir; queda pendiente).
  if (c.deliveries.length) {
    const supports = c.documents.filter((d) => d.used_by === 'DELIVERY_SUPPORT');
    const without = c.deliveries.filter((d) => !supports.some((s) => s.reference === d.code)).map((d) => d.code);
    const bad = supports.filter((s) => s.expired || s.scan !== 'CLEAN').map((s) => s.reference);
    out.push(bad.length ? r('DELIVERY_SUPPORTS', 'Soportes de entrega vigentes y disponibles', 'INVALID', 'Soporte vencido o archivo no disponible (antimalware).', 'D-35 MVP', [...new Set(bad)])
      : without.length ? r('DELIVERY_SUPPORTS', 'Soportes de entrega vigentes y disponibles', 'PENDING', `${without.length} entrega(s) sin soporte (D-35 MVP: no impide recibir; queda pendiente).`, 'D-35 MVP', without)
        : r('DELIVERY_SUPPORTS', 'Soportes de entrega vigentes y disponibles', 'MET', 'Cada entrega tiene un soporte vigente y disponible (no prueba autenticidad ni validez jurídica).', 'D-35 MVP'));
  } else out.push(r('DELIVERY_SUPPORTS', 'Soportes de entrega vigentes y disponibles', 'NOT_EVALUABLE', 'Sin entregas en el grafo.', 'D-35 MVP'));
  // P1-005. Tres situaciones distintas, y ninguna se confunde con otra:
  //   · sin perfil adoptado      → NOT_EVALUABLE (no se presume nada);
  //   · perfil PARCIAL o sin revisión jurídica → **PENDING**: hay mecanismo y hay trabajo hecho, pero la
  //     revisión necesaria sigue sin resolverse, y eso **impide acreditar READY**. Desconocido no es
  //     incumplimiento, pero tampoco requisito satisfecho;
  //   · perfil COMPLETE y REVIEWED → MET.
  const lp = c.profiles.legal_profile;
  if (!lp) {
    out.push(r('LEGAL_PROFILE', 'Perfil jurídico aplicable (legalidad y evidencias exigibles)', 'NOT_EVALUABLE',
      `Sin perfil jurídico adoptado (P1-005): no hay lista de requisitos legales ni evidencias exigibles. ${c.evidence.length} evidencia(s) registrada(s) se conservan como referencia; D-37 sigue pendiente.`, 'docs/13 §Legalidad Ecuador'));
  } else if (lp.scope === 'PARTIAL' || lp.legal_review_status !== 'REVIEWED') {
    const motivos = [
      ...(lp.scope === 'PARTIAL' ? [`alcance PARCIAL (faltan: ${lp.pending_matters.join(', ') || 'sin declarar'})`] : []),
      ...(lp.legal_review_status !== 'REVIEWED' ? ['sin revisión jurídica resuelta'] : []),
    ];
    out.push(r('LEGAL_PROFILE', 'Perfil jurídico aplicable (legalidad y evidencias exigibles)', 'PENDING',
      `Perfil ${lp.version} adoptado, pero no satisface el requisito: ${motivos.join(' y ')}. Una revisión necesaria pendiente sigue impidiendo acreditar READY.`,
      'docs/13 §Legalidad Ecuador'));
  } else {
    out.push(r('LEGAL_PROFILE', 'Perfil jurídico aplicable (legalidad y evidencias exigibles)', 'MET',
      `Perfil ${lp.version} adoptado, completo y con revisión jurídica resuelta.`, 'docs/13 §Legalidad Ecuador'));
  }
  // 5) Riesgo y mitigaciones.
  if (!c.risk) {
    // Sin evaluación: los requisitos de riesgo siguen listados; lo desconocido queda visible, nunca omitido.
    out.push(r('RISK_EVALUATION_CURRENT', 'Evaluación de riesgo vigente', 'PENDING', 'Sin evaluación de riesgo del lote.', 'docs/13 §Evaluación reproducible'));
    out.push(r('RISK_NO_BLOCKING_FINDINGS', 'Sin hallazgos de riesgo bloqueantes', 'NOT_EVALUABLE', 'Sin evaluación: no se presume ausencia de hallazgos.', 'docs/13'));
    out.push(r('RISK_REVIEW_RESOLVED', 'Revisión humana del riesgo resuelta', 'PENDING', 'Sin evaluación que revisar.', 'docs/13 §Dimensiones'));
    out.push(r('RISK_CATALOG_APPROVED', 'Catálogo de reglas de riesgo aprobado bajo perfil jurídico', 'NOT_EVALUABLE', 'Sin evaluación vinculada a un catálogo.', 'docs/13 §Registro de regla'));
    out.push(r('REGULATORY_CONCLUSION', 'Conclusión regulatoria bajo perfil aprobado', 'NOT_EVALUABLE', 'Sin evaluación ni perfil jurídico: conclusión indeterminada.', 'docs/13 §Dimensiones'));
  } else {
    out.push(c.risk.is_current ? r('RISK_EVALUATION_CURRENT', 'Evaluación de riesgo vigente', 'MET', `Evaluación ${c.risk.evaluation_number} vigente (reglas ${c.risk.rule_set_version}).`, 'docs/13 §Evaluación reproducible')
      : r('RISK_EVALUATION_CURRENT', 'Evaluación de riesgo vigente', 'INVALID', `Evaluación ${c.risk.evaluation_number} desactualizada: reevalúa.`, 'docs/13 §Evaluación reproducible'));
    const blocking = c.risk.factors.filter((f) => f.result === 'HIT' && f.effect === 'BLOCKING').map((f) => f.code);
    const hits = c.risk.factors.filter((f) => f.result === 'HIT').map((f) => f.code);
    const ne = c.risk.factors.filter((f) => f.result === 'NOT_EVALUABLE').map((f) => f.code);
    out.push(blocking.length ? r('RISK_NO_BLOCKING_FINDINGS', 'Sin hallazgos de riesgo bloqueantes', 'INVALID', 'Hallazgos bloqueantes en la evaluación vigente (no se diluyen por porcentaje).', 'docs/13 §Registro de regla', blocking)
      : hits.length ? r('RISK_NO_BLOCKING_FINDINGS', 'Sin hallazgos de riesgo bloqueantes', 'PENDING', 'Hallazgos que requieren revisión.', 'docs/13', hits)
        : ne.length ? r('RISK_NO_BLOCKING_FINDINGS', 'Sin hallazgos de riesgo bloqueantes', 'NOT_EVALUABLE', 'Reglas no evaluables: no se presume favorable.', 'docs/13', ne)
          : r('RISK_NO_BLOCKING_FINDINGS', 'Sin hallazgos de riesgo bloqueantes', 'MET', 'Sin hallazgos en las reglas evaluadas.', 'docs/13'));
    out.push(c.risk.review_process === 'RESOLVED' ? r('RISK_REVIEW_RESOLVED', 'Revisión humana del riesgo resuelta', 'MET', 'Revisión resuelta con motivo (no vuelve favorable el riesgo).', 'docs/13 §Dimensiones')
      : r('RISK_REVIEW_RESOLVED', 'Revisión humana del riesgo resuelta', 'PENDING', `Revisión ${c.risk.review_process === 'UNDER_REVIEW' ? 'en curso' : 'sin iniciar'}.`, 'docs/13 §Dimensiones'));
    // Publicar un catálogo globalmente (`approval_status = APPROVED`) es una decisión TÉCNICA de producto: dice que
    // las reglas existen y que el proyecto las respalda. Este requisito pide otra cosa, y pide las DOS:
    //   · que la organización haya ADOPTADO el catálogo con el que se evaluó (D-07.1), y
    //   · que esa versión esté aprobada bajo un PERFIL JURÍDICO (D-07.5), hoy `null` en todas.
    // Si se cumpliera con la sola publicación, aprobar un catálogo técnico pondría el expediente en READY sin que
    // nadie hubiera decidido bajo qué norma se concluye.
    const cat = `Reglas ${c.risk.rule_set_version} (publicación global ${c.risk.rule_set_approval})`;
    out.push(!c.risk.rule_set_adopted
      ? r('RISK_CATALOG_APPROVED', 'Catálogo de reglas de riesgo aprobado bajo perfil jurídico', 'NOT_EVALUABLE', `${cat}: esta organización NO las ha adoptado (D-07.1); publicar no es adoptar.`, 'docs/13 §Registro de regla')
      : !c.risk.rule_set_regulatory_profile
        ? r('RISK_CATALOG_APPROVED', 'Catálogo de reglas de riesgo aprobado bajo perfil jurídico', 'NOT_EVALUABLE', `${cat}: adoptadas por la organización, pero su publicación es una decisión TÉCNICA de producto y no hay perfil jurídico aprobado (D-07.5). No permiten afirmar preparación regulatoria.`, 'docs/13 §Registro de regla')
        : r('RISK_CATALOG_APPROVED', 'Catálogo de reglas de riesgo aprobado bajo perfil jurídico', 'MET', `${cat}: adoptadas y aprobadas bajo el perfil ${c.risk.rule_set_regulatory_profile}.`, 'docs/13 §Registro de regla'));
    out.push(c.risk.conclusion === 'NEGLIGIBLE' ? r('REGULATORY_CONCLUSION', 'Conclusión regulatoria bajo perfil aprobado', 'MET', 'Conclusión NEGLIGIBLE bajo perfil aprobado.', 'docs/13 §Dimensiones')
      : c.risk.conclusion === 'NON_NEGLIGIBLE' ? r('REGULATORY_CONCLUSION', 'Conclusión regulatoria bajo perfil aprobado', 'INVALID', 'Conclusión NON_NEGLIGIBLE.', 'docs/13 §Dimensiones')
        : r('REGULATORY_CONCLUSION', 'Conclusión regulatoria bajo perfil aprobado', 'NOT_EVALUABLE', 'Conclusión UNDETERMINED: no hay perfil jurídico ni reglas aprobadas.', 'docs/13 §Dimensiones'));
  }
  const pendingMit = c.mitigations.filter((m) => m.status !== 'VERIFIED');
  out.push(!c.mitigations.length ? r('MITIGATIONS_VERIFIED', 'Mitigaciones verificadas', 'MET', 'Sin mitigaciones registradas para el sujeto.', 'docs/13 MITIGATION_UNVERIFIED')
    : pendingMit.length ? r('MITIGATIONS_VERIFIED', 'Mitigaciones verificadas', 'PENDING', `${pendingMit.length} mitigación(es) sin verificar.`, 'docs/13 MITIGATION_UNVERIFIED', pendingMit.map((m) => m.factor_code))
      : r('MITIGATIONS_VERIFIED', 'Mitigaciones verificadas', 'MET', 'Mitigaciones verificadas. Verificar no resuelve causas ni equivale a aprobación regulatoria.', 'docs/13 MITIGATION_UNVERIFIED'));
  // D-34.A.1 (2026-10-16): el vínculo se satisface ANTES del despacho, con un ítem de embarque que tenga
  // reserva activa. **No exige que la mercancía haya salido**: exigirlo crearía una dependencia circular
  // —despachar exige el paquete, el paquete exige READY y READY exigiría el despacho— que ninguna fuente
  // impone (S1 §44 enumera el contenido del paquete y no incluye embarque ni despacho).
  out.push(c.shipment_links.length
    ? r('SHIPMENT_LINK', 'Vínculo con embarque mediante reserva activa', 'MET',
        c.shipment_links.map((l) => `${l.shipment_code} · ítem ${l.item_id} · reserva ${l.quantity} ${l.unit}`).join(' · '), 'D-34.A.1; docs/18 P0-017/P0-029')
    : r('SHIPMENT_LINK', 'Vínculo con embarque mediante reserva activa', 'PENDING',
        'El lote no tiene ningún ítem de embarque con reserva activa. Añádelo a un embarque y reserva la cantidad.', 'D-34.A.1; docs/18 P0-017/P0-029'));
  return out;
}

export function readinessOf(reqs: Requirement[]): Readiness {
  if (reqs.every((r) => r.status === 'MET')) return 'READY';
  if (reqs.some((r) => r.status === 'INVALID' || r.status === 'NOT_EVALUABLE')) return 'BLOCKED';
  return 'IN_PROGRESS';
}

export function summary(reqs: Requirement[]) {
  const n = (s: ReqStatus) => reqs.filter((r) => r.status === s).length;
  return { total: reqs.length, met: n('MET'), pending: n('PENDING'), invalid: n('INVALID'), not_evaluable: n('NOT_EVALUABLE'),
    percent_met: reqs.length ? Math.floor((n('MET') * 100) / reqs.length) : 0, note: 'El porcentaje es informativo: cualquier requisito no cumplido bloquea la preparación.' };
}

/** Hash por sección: permite indicar qué cambió cuando una instantánea queda desactualizada. */
export function sectionHashes(c: DdContent): Record<string, string> {
  return Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'synthetic_fixture').map(([k, v]) => [k, sha256(v)]));
}

export function manifestOf(c: DdContent) {
  return {
    items: [
      { kind: 'lot', id: c.subject.id, version: c.subject.code },
      ...c.deliveries.map((d) => ({ kind: 'delivery', id: d.id, version: d.row_version })),
      ...c.plots.map((p) => ({ kind: 'plot_version', id: p.version_id ?? p.plot_id, version: String(p.version_number ?? 'sin versión'), hash: p.geometry_hash })),
      ...c.documents.map((d) => ({ kind: 'document_version', id: d.version_id, version: String(d.version_number), hash: d.sha256 })),
      ...c.shipment_links.map((l) => ({ kind: 'shipment_reservation', id: l.reservation_id, version: `${l.shipment_code}:${l.item_id}`, hash: `${l.quantity} ${l.unit}` })),
      ...c.evidence.map((e) => ({ kind: 'evidence', id: e.id, version: e.row_version })),
      ...(c.risk ? [{ kind: 'risk_evaluation', id: c.risk.evaluation_id, version: String(c.risk.evaluation_number), hash: c.risk.snapshot_hash }, { kind: 'risk_rule_set', id: c.risk.rule_set_version, version: c.risk.rule_set_approval }] : []),
      ...c.mitigations.map((m) => ({ kind: 'mitigation', id: m.id, version: m.row_version })),
    ],
    section_hashes: sectionHashes(c),
  };
}

/** Pendientes declarados del paquete: no se presentan como cubiertos. */
export const PACKAGE_PENDING = [
  { code: 'ATTACHMENT_FILES_NOT_INCLUDED', detail: 'Los archivos no se incluyen: solo se referencian por versión exacta y SHA-256. Referenciar no equivale a incluir.' },
  { code: 'DESTINATION_PROFILE_FIELDS', detail: 'Los campos y el formato los determina el perfil destino (p. ej. EUDR-IS/TRACES), no definido: el paquete no garantiza esos campos.' },
];

export interface RedactionProfile { geometry: boolean; personal_documents: boolean }

export const DISCLAIMER = 'Paquete interno de Terra Link. Descargarlo no es presentar una DDS ni implica aceptación en TRACES/EUDR-IS; no acredita cumplimiento ni conclusión regulatoria.';

/**
 * Paquete determinista desde la instantánea (nunca desde tablas mutables). Alcance y clasificación se aplican a TODO el
 * contenido: geometrías sin `plot:read_geometry` y metadatos de documentos PERSONAL_DATA sin `producer:read_identity` se
 * redactan. La identidad de productores nunca se copia. Los archivos adjuntos se referencian por versión y SHA-256.
 */
export function buildPackage(p: {
  kind: 'INTERNAL_REVIEW' | 'DD_PACKAGE';
  dd_case: { id: string; case_number: string; scope_note: string; organization: string };
  snapshot: { id: string; number: number; captured_at: string; captured_by: string; content_hash: string; readiness: Readiness; approved_by: string | null };
  content: DdContent; requirements: Requirement[]; manifest: unknown;
}, profile: RedactionProfile) {
  const redactions: string[] = [];
  const plots = p.content.plots.map((pl) => {
    if (profile.geometry || pl.geometry == null) return pl;
    redactions.push(`plot:${pl.plot_code}:geometry`);
    return { ...pl, geometry: null, geometry_redacted: 'Sin permiso de coordenadas (plot:read_geometry): se conserva solo el hash.' };
  });
  const documents = p.content.documents.map((d) => {
    if (profile.personal_documents || d.classification !== 'PERSONAL_DATA') return d;
    redactions.push(`document_version:${d.version_id}:metadata`);
    return { ...d, title: '[restringido: datos personales]', file_name: '[restringido]' };
  });
  const pkg = {
    format: 'terra-link-dd-package', format_version: '0.2.0', kind: p.kind,
    // Artefactos distintos: instantánea (fuente) → borrador interno o paquete final → presentación oficial (no implementada).
    artifact: { kind: p.kind, source: 'snapshot', is_final_package: p.kind === 'DD_PACKAGE', is_official_submission: false },
    completeness: redactions.length ? 'INCOMPLETO por alcance de quien exporta: ver «redactions».' : 'Sin redacciones por alcance.',
    pending: PACKAGE_PENDING,
    label: p.kind === 'INTERNAL_REVIEW' ? 'BORRADOR INTERNO PARA REVISIÓN: no preparado; no es una DDS.' : 'Paquete de debida diligencia interno (preparación aprobada internamente); no es una DDS presentada.',
    disclaimer: DISCLAIMER,
    synthetic_fixture: p.content.synthetic_fixture === true ? 'FIXTURE SINTÉTICA DE PRUEBA: no es un expediente real ni aprobado.' : undefined,
    submission: { status: 'NOT_SUBMITTED', note: 'La presentación oficial es una dimensión independiente (no implementada).' },
    case: p.dd_case, snapshot: p.snapshot, readiness: p.snapshot.readiness, requirements: p.requirements, requirements_summary: summary(p.requirements), manifest: p.manifest,
    content: { ...p.content, plots, documents, producer_identity: 'No incluida: la identidad protegida no se copia al paquete.' },
    attachments: { included: false, note: 'Los archivos no se incrustan en esta versión: se referencian por versión exacta y SHA-256.', items: documents.map((d) => ({ version_id: d.version_id, sha256: d.sha256, file_name: d.file_name })) },
    redaction_profile: profile, redactions,
  };
  const body = JSON.stringify(JSON.parse(canonical(pkg)), null, 2);
  return { pkg, body, hash: sha256(body), redactions };
}
