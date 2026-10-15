import { buildPackage, evaluateRequirements, readinessOf, sha256, summary, type DdContent } from './requirements';

// FIXTURE SINTÉTICA: todos los requisitos se fuerzan a cumplidos SOLO para probar el generador y los guards.
// No representa un expediente real ni aprobado; los perfiles se rellenan con textos de prueba explícitos.
const SYNTHETIC: DdContent = {
  synthetic_fixture: true,
  subject: { type: 'LOT', id: 'lot-1', code: 'LOT-SINT-1', product: 'Cacao (sintético)', unit: 'KG', origin_status: 'COMPLETE' },
  quantities: { physical: '100.000', reserved: '0', available: '100.000', unit: 'KG', source: 'ledger' },
  origin: { lots: [{ id: 'lot-1', lot_code: 'LOT-SINT-1', origin_status: 'COMPLETE' }], ledger_differences: [] },
  deliveries: [{ id: 'd1', code: 'ENT-SINT-1', row_version: '1', origin_plots: ['P-SINT-1'] }],
  plots: [{ plot_id: 'p1', plot_code: 'P-SINT-1', version_id: 'pv1', version_number: 1, geometry_type: 'POINT', geometry_hash: 'h', validation_status: 'VALID', gis_status: 'VALID', geometry: { type: 'Point', coordinates: [-80, -1] } }],
  quality: [{ reception_id: 'r1', delivery_code: 'ENT-SINT-1', decision: 'RELEASED' }],
  documents: [{ document_id: 'doc1', version_id: 'dv1', title: 'Nota sintética', document_type: 'DELIVERY_SUPPORT', classification: 'OPERATIONAL', version_number: 1, sha256: 'a'.repeat(64), file_name: 'n.pdf', expires_at: null, expired: false, scan: 'CLEAN', used_by: 'DELIVERY_SUPPORT', reference: 'ENT-SINT-1' },
    { document_id: 'doc2', version_id: 'dv2', title: 'Cédula sintética', document_type: 'ID', classification: 'PERSONAL_DATA', version_number: 1, sha256: 'b'.repeat(64), file_name: 'c.pdf', expires_at: null, expired: false, scan: 'CLEAN', used_by: 'MITIGATION_SUPPORT', reference: 'X' }],
  evidence: [],
  risk: { evaluation_id: 'e1', evaluation_number: 1, snapshot_hash: 'c'.repeat(64), rule_set_version: 'SINT', rule_set_approval: 'APPROVED', technical_result: 'NO_FINDINGS_IN_EVALUATED_RULES', severity: 'LOW', conclusion: 'NEGLIGIBLE', is_current: true, review_process: 'RESOLVED', factors: [{ code: 'X', result: 'NOT_HIT', effect: 'BLOCKING' }] },
  mitigations: [],
  profiles: { legal_profile: 'PERFIL SINTÉTICO DE PRUEBA', geolocation_profile: 'PERFIL SINTÉTICO DE PRUEBA', satellite_provider: 'PROVEEDOR SINTÉTICO DE PRUEBA', shipment_link: 'EMBARQUE SINTÉTICO DE PRUEBA' },
};
const st = (c: DdContent, code: string) => evaluateRequirements(c).find((r) => r.code === code)?.status;

describe('P0-022 guards por requisito', () => {
  it('fixture sintética con todo cumplido → READY (solo prueba el cálculo)', () => {
    const reqs = evaluateRequirements(SYNTHETIC);
    expect(reqs.every((r) => r.status === 'MET')).toBe(true);
    expect(readinessOf(reqs)).toBe('READY');
  });

  it('un solo requisito no cumplido bloquea aunque el porcentaje sea alto', () => {
    const c = { ...SYNTHETIC, risk: { ...SYNTHETIC.risk!, rule_set_approval: 'NOT_APPROVED' } };
    const reqs = evaluateRequirements(c);
    expect(summary(reqs).percent_met).toBeGreaterThanOrEqual(90);
    expect(readinessOf(reqs)).toBe('BLOCKED');
  });

  it('lo desconocido es NO EVALUABLE, nunca falso ni favorable', () => {
    expect(st({ ...SYNTHETIC, profiles: { ...SYNTHETIC.profiles, legal_profile: null } }, 'LEGAL_PROFILE')).toBe('NOT_EVALUABLE');
    expect(st({ ...SYNTHETIC, risk: { ...SYNTHETIC.risk!, conclusion: 'UNDETERMINED' } }, 'REGULATORY_CONCLUSION')).toBe('NOT_EVALUABLE');
    expect(st({ ...SYNTHETIC, quantities: { ...SYNTHETIC.quantities, physical: 'desconocido' } }, 'SUBJECT_QUANTITY')).toBe('NOT_EVALUABLE');
    expect(st({ ...SYNTHETIC, deliveries: [] }, 'ORIGIN_DECLARED')).toBe('NOT_EVALUABLE');
    expect(st({ ...SYNTHETIC, risk: { ...SYNTHETIC.risk!, factors: [{ code: 'Y', result: 'NOT_EVALUABLE', effect: 'BLOCKING' }] } }, 'RISK_NO_BLOCKING_FINDINGS')).toBe('NOT_EVALUABLE');
  });

  it('sin evaluación de riesgo, sus requisitos siguen listados (pendiente / no evaluable), nunca omitidos', () => {
    const reqs = evaluateRequirements({ ...SYNTHETIC, risk: null });
    expect(reqs.map((r) => r.code)).toEqual(evaluateRequirements(SYNTHETIC).map((r) => r.code));
    expect(st({ ...SYNTHETIC, risk: null }, 'RISK_CATALOG_APPROVED')).toBe('NOT_EVALUABLE');
    expect(st({ ...SYNTHETIC, risk: null }, 'REGULATORY_CONCLUSION')).toBe('NOT_EVALUABLE');
    expect(readinessOf(reqs)).toBe('BLOCKED');
  });

  it('distingue pendiente e inválido: calidad pendiente, origen incompleto, soporte vencido, hallazgo bloqueante', () => {
    expect(st({ ...SYNTHETIC, quality: [{ ...SYNTHETIC.quality[0], decision: 'PENDING' }] }, 'QUALITY_DECIDED')).toBe('PENDING');
    expect(st({ ...SYNTHETIC, quality: [{ ...SYNTHETIC.quality[0], decision: 'REJECTED' }] }, 'QUALITY_DECIDED')).toBe('INVALID');
    expect(st({ ...SYNTHETIC, origin: { ...SYNTHETIC.origin, lots: [{ id: 'l', lot_code: 'L', origin_status: 'INCOMPLETE' }] } }, 'ORIGIN_DECLARED')).toBe('PENDING');
    expect(st({ ...SYNTHETIC, documents: [{ ...SYNTHETIC.documents[0], expired: true }] }, 'DELIVERY_SUPPORTS')).toBe('INVALID');
    expect(st({ ...SYNTHETIC, documents: [] }, 'DELIVERY_SUPPORTS')).toBe('PENDING');
    expect(st({ ...SYNTHETIC, risk: { ...SYNTHETIC.risk!, factors: [{ code: 'DATA_MISSING_ORIGIN', result: 'HIT', effect: 'BLOCKING' }] } }, 'RISK_NO_BLOCKING_FINDINGS')).toBe('INVALID');
    expect(st({ ...SYNTHETIC, quantities: { ...SYNTHETIC.quantities, physical: '0' } }, 'SUBJECT_QUANTITY')).toBe('INVALID');
  });

  it('mitigaciones verificadas no equivalen a aprobación: sin catálogo aprobado sigue bloqueado', () => {
    const c: DdContent = { ...SYNTHETIC, mitigations: [{ id: 'm', factor_code: 'DATA_MISSING_ORIGIN', status: 'VERIFIED', row_version: '3', decision: 'VERIFIED' }], risk: { ...SYNTHETIC.risk!, rule_set_approval: 'NOT_APPROVED', conclusion: 'UNDETERMINED' } };
    expect(st(c, 'MITIGATIONS_VERIFIED')).toBe('MET');
    expect(readinessOf(evaluateRequirements(c))).toBe('BLOCKED');
    expect(st({ ...c, mitigations: [{ ...c.mitigations[0], status: 'SUBMITTED' }] }, 'MITIGATIONS_VERIFIED')).toBe('PENDING');
  });
});

describe('P0-022 generador del paquete', () => {
  const input = (content: DdContent, kind: 'INTERNAL_REVIEW' | 'DD_PACKAGE' = 'DD_PACKAGE') => {
    const reqs = evaluateRequirements(content);
    return { kind, dd_case: { id: 'c', case_number: 'DD-SINT-1', scope_note: 'sintético', organization: 'Org sintética' },
      snapshot: { id: 's', number: 1, captured_at: '2026-01-01T00:00:00Z', captured_by: 'Persona sintética', content_hash: sha256(content), readiness: readinessOf(reqs), approved_by: null }, content, requirements: reqs, manifest: {} };
  };

  it('determinista; marca la fixture como sintética; nunca presenta DDS', () => {
    const a = buildPackage(input(SYNTHETIC), { geometry: true, personal_documents: true });
    const b = buildPackage(input(SYNTHETIC), { geometry: true, personal_documents: true });
    expect(a.hash).toBe(b.hash);
    expect(a.pkg.synthetic_fixture).toMatch(/FIXTURE SINTÉTICA/);
    expect(a.pkg.submission.status).toBe('NOT_SUBMITTED');
    expect(a.body).toMatch(/no es presentar una DDS/);
    expect(a.redactions).toEqual([]);
  });

  it('separa artefactos y declara pendientes: archivos no incluidos y campos del perfil destino', () => {
    const r = buildPackage(input(SYNTHETIC), { geometry: true, personal_documents: true });
    expect(r.pkg.artifact).toEqual({ kind: 'DD_PACKAGE', source: 'snapshot', is_final_package: true, is_official_submission: false });
    expect(r.pkg.pending.map((x) => x.code)).toEqual(['ATTACHMENT_FILES_NOT_INCLUDED', 'DESTINATION_PROFILE_FIELDS']);
    expect(r.pkg.attachments.included).toBe(false);
    const d = buildPackage(input(SYNTHETIC, 'INTERNAL_REVIEW'), { geometry: false, personal_documents: true });
    expect(d.pkg.artifact.is_final_package).toBe(false);
    expect(d.pkg.completeness).toMatch(/INCOMPLETO/);
  });

  it('redacción por alcance y clasificación en todo el paquete (geometrías y adjuntos)', () => {
    const r = buildPackage(input(SYNTHETIC, 'INTERNAL_REVIEW'), { geometry: false, personal_documents: false });
    expect(r.body).not.toMatch(/-80/);
    expect(r.body).not.toMatch(/Cédula sintética|c\.pdf/);
    expect(r.body).toMatch(/b{64}/); // el hash del adjunto se conserva
    expect(r.redactions).toEqual(['plot:P-SINT-1:geometry', 'document_version:dv2:metadata']);
    expect(r.pkg.label).toMatch(/BORRADOR INTERNO/);
    expect(r.hash).not.toBe(buildPackage(input(SYNTHETIC, 'INTERNAL_REVIEW'), { geometry: true, personal_documents: true }).hash);
  });
});
