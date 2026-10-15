import { catalogNote, severityBucket } from './reports-risk';

// P0-030 — Reparto por severidad, probado EN MEMORIA con conjuntos sintéticos. El caso MIXTO (lotes clasificados y sin
// clasificar a la vez) no se puede construir hoy contra la base: `risk_evaluations` lleva
// CHECK (conclusion = 'UNDETERMINED' AND severity = 'NOT_ASSESSED') desde la migración 0025, y la prueba de integración
// comprueba que ese candado existe. Aquí se cubre la lógica que se activará cuando D-07 cierre.
describe('P0-030 severidad de riesgo: cero observado, desconocido y caso mixto', () => {
  const catalogo = { version: '0.2.0', approval_status: 'NOT_APPROVED' };
  const base = { sev: 'HIGH' as const, label: 'alto', catalogo };

  it('sin evaluaciones: NO_DENOMINATOR, y la ausencia de evaluaciones es un hecho observado', () => {
    const r = severityBucket({ ...base, lotesTotal: 7, porSeveridad: {} });
    expect(r).toMatchObject({ status: 'NO_DENOMINATOR', value: null, denominator: 0 });
    expect(r.observed).toEqual({ lotes_del_tenant: 7, lotes_evaluados: 0, sin_severidad_asignada: 0, con_severidad_asignada: 0 });
    expect(r.reason).toMatch(/denominador es cero/i);
    expect(r.reason).toContain('7 lote(s) en el tenant');
  });

  it('evaluados pero ninguno clasificado: UNKNOWN citando el catálogo real, no una lista de historias', () => {
    const r = severityBucket({ ...base, lotesTotal: 5, porSeveridad: { NOT_ASSESSED: 3 } });
    expect(r).toMatchObject({ status: 'UNKNOWN', value: null, denominator: 3 });
    expect(r.observed).toMatchObject({ lotes_evaluados: 3, sin_severidad_asignada: 3, con_severidad_asignada: 0 });
    expect(r.reason).toContain('0.2.0');
    expect(r.reason).toContain('NOT_APPROVED');
    expect(r.reason).toMatch(/D-07/);
    expect(r.reason).toMatch(/P0-021, implementada/);
    expect(r.reason).toMatch(/no asigna severidad/i);
    // No se atribuye el bloqueo a cerrar el satélite ni las mitigaciones.
    expect(r.reason).not.toMatch(/mientras.*P0-028/i);
  });

  it('UNDETERMINED cuenta como «sin severidad», igual que NOT_ASSESSED', () => {
    const r = severityBucket({ ...base, lotesTotal: 4, porSeveridad: { NOT_ASSESSED: 1, UNDETERMINED: 2 } });
    expect(r.status).toBe('UNKNOWN');
    expect(r.observed).toMatchObject({ lotes_evaluados: 3, sin_severidad_asignada: 3 });
  });

  it('CASO MIXTO: el conteo sale sobre la base de los clasificados, nunca como distribución de todos los lotes', () => {
    // 10 lotes: 6 evaluados (2 HIGH, 1 MEDIUM, 3 sin severidad) y 4 sin evaluar.
    const porSeveridad = { HIGH: 2, MEDIUM: 1, NOT_ASSESSED: 3 };
    const alto = severityBucket({ ...base, lotesTotal: 10, porSeveridad });
    expect(alto).toMatchObject({ status: 'OK', value: '2', numerator: 2, denominator: 3 }); // 3 clasificados, no 6 ni 10
    expect(alto.observed).toEqual({ lotes_del_tenant: 10, lotes_evaluados: 6, sin_severidad_asignada: 3, con_severidad_asignada: 3 });
    expect(alto.reason).toContain('Sobre los 3 lote(s) CON severidad asignada');
    expect(alto.reason).toContain('Quedan 3 evaluado(s) sin severidad y 4 sin evaluar');
    expect(alto.reason).toContain('NO es la distribución de los 10 lote(s) del tenant');

    // La severidad sin ningún lote es CERO OBSERVADO sobre esa misma base, no «desconocido».
    const bajo = severityBucket({ sev: 'LOW', label: 'bajo', catalogo, lotesTotal: 10, porSeveridad });
    expect(bajo).toMatchObject({ status: 'OK', value: '0', numerator: 0, denominator: 3 });
    expect(bajo.reason).toMatch(/^Cero observado/);
    // Los tres conteos suman exactamente los clasificados: ninguno absorbe a los desconocidos.
    const medio = severityBucket({ sev: 'MEDIUM', label: 'medio', catalogo, lotesTotal: 10, porSeveridad });
    expect(Number(alto.value) + Number(medio.value) + Number(bajo.value)).toBe(3);
  });

  it('todos clasificados: el denominador es el total evaluado y no queda nada desconocido', () => {
    const r = severityBucket({ ...base, lotesTotal: 3, porSeveridad: { HIGH: 1, LOW: 2 } });
    expect(r).toMatchObject({ status: 'OK', value: '1', denominator: 3 });
    expect(r.observed).toMatchObject({ sin_severidad_asignada: 0, con_severidad_asignada: 3 });
    expect(r.reason).toContain('Quedan 0 evaluado(s) sin severidad y 0 sin evaluar');
  });

  it('sin catálogo publicado se dice así, en vez de inventar una causa', () => {
    expect(catalogNote(null)).toMatch(/No hay catálogo de reglas de riesgo publicado/);
    expect(severityBucket({ ...base, lotesTotal: 2, porSeveridad: { NOT_ASSESSED: 2 }, catalogo: null }).reason)
      .toMatch(/No hay catálogo de reglas de riesgo publicado/);
  });
});
