import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import { describeDb, setupHarness } from './helpers';

// RISK_CATALOG_APPROVED — guarda técnica (D-07.5(b)) y perfil jurídico 0.2.0 en BORRADOR.
//
// Demuestra, contra la base real, que `risk_rule_sets.regulatory_profile` solo admite una REFERENCIA a una versión
// publicada, completa y con revisión vigente de `legal_profile_versions`; que una cadena arbitraria, una referencia
// inexistente o un perfil sin revisar no se pueden escribir; y que el borrador 0.2.0 existe sin ser adoptable ni
// alterar 0.1.0. Todo perfil «completo y revisado» de aquí es FIXTURA SINTÉTICA escrita directamente en la base de
// prueba: no existe endpoint que la produzca ni se aprueba ningún perfil real.

describeDb('RISK_CATALOG_APPROVED y perfil 0.2.0', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;
  let org = '';
  let revisor = '';
  const ADMIN = 'rcp-admin@test.local';
  const as = (e: string) => h.as(e);

  const conjunto = (version: string, perfil: string | null) => sql`
    INSERT INTO risk_rule_sets (version, approval_status, source, notes, regulatory_profile)
    VALUES (${version}, 'NOT_APPROVED', 'fixture sintética', 'fixture sintética de prueba', ${perfil})`.execute(h.db);
  const revision = (version: string, decision: 'REVIEWED' | 'OBJECTED' | 'WITHDRAWN') => sql`
    INSERT INTO legal_profile_reviews (id, version, decision, reviewer_id, reviewer_capacity, basis, operation_id)
    VALUES (${randomUUID()}, ${version}, ${decision}, ${revisor}, 'FIXTURE SINTÉTICA DE PRUEBA', 'Fixture sintética: no acredita ninguna revisión jurídica real', ${randomUUID()})`.execute(h.db);
  const perfil = (version: string, scope: 'PARTIAL' | 'COMPLETE', status: 'DRAFT' | 'PUBLISHED') => sql`
    INSERT INTO legal_profile_versions (version, jurisdiction, scope, scope_note, covered_matters, pending_matters, technical_status, published_by, reason)
    VALUES (${version}, 'EC', ${scope}, 'Fixture sintética de prueba, sin valor jurídico', ARRAY['TENURE'],
      ${scope === 'COMPLETE' ? sql`ARRAY[]::text[]` : sql`ARRAY['LABOUR']`}, ${status}, 'fixture', 'fixture sintética')`.execute(h.db);

  beforeAll(async () => {
    h = await setupHarness();
    await h.user('rcp-super@test.local', 'SUPER_ADMIN');
    await h.user(ADMIN);
    org = (await h.http().post('/api/v1/organizations').set(as('rcp-super@test.local'))
      .send({ name: 'Coop RCP', organization_type: 'COOPERATIVE', country: 'EC', initial_admin_email: ADMIN }).expect(201)).body.id as string;
    revisor = (await sql<{ id: string }>`SELECT id FROM users WHERE email = ${ADMIN}`.execute(h.db)).rows[0].id;
  });
  afterAll(async () => h?.close());

  it('el catálogo real 1.0.0 conserva regulatory_profile NULL: nadie lo fija', async () => {
    const r = await sql<{ n: string }>`SELECT count(*)::text AS n FROM risk_rule_sets WHERE regulatory_profile IS NOT NULL`.execute(h.db);
    expect(Number(r.rows[0].n)).toBe(0);
  });

  it('una cadena arbitraria o una referencia inexistente no se pueden escribir', async () => {
    await expect(conjunto('7.0.1', 'PERFIL SINTÉTICO DE PRUEBA')).rejects.toThrow(/versión existente/);
    await expect(conjunto('7.0.2', 'aprobado')).rejects.toThrow(/versión existente/);
    await expect(conjunto('7.0.3', '8.8.8')).rejects.toThrow(/versión existente/);
    await expect(sql`UPDATE risk_rule_sets SET regulatory_profile = 'true' WHERE version = '1.0.0'`.execute(h.db)).rejects.toThrow(/append-only/); // no se edita una versión publicada
  });

  it('un perfil real sin revisión, parcial o en borrador no se puede referenciar', async () => {
    // 0.1.0: PUBLICADO pero PARCIAL y sin revisión → no.
    await expect(conjunto('7.1.0', '0.1.0')).rejects.toThrow(/PUBLICADO y de alcance COMPLETO/);
    // 0.2.0: BORRADOR → no.
    await expect(conjunto('7.1.1', '0.2.0')).rejects.toThrow(/PUBLICADO y de alcance COMPLETO/);
    // Completo y publicado, pero SIN revisión → no.
    await perfil('9.9.9', 'COMPLETE', 'PUBLISHED');
    await expect(conjunto('7.1.2', '9.9.9')).rejects.toThrow(/revisión jurídica vigente/);
    // Completo, revisado, pero en BORRADOR → no.
    await perfil('9.9.8', 'COMPLETE', 'DRAFT');
    await revision('9.9.8', 'REVIEWED');
    await expect(conjunto('7.1.3', '9.9.8')).rejects.toThrow(/PUBLICADO y de alcance COMPLETO/);
    // Revisado pero PARCIAL → no (la revisión no arregla el alcance).
    await perfil('9.9.7', 'PARTIAL', 'PUBLISHED');
    await revision('9.9.7', 'REVIEWED');
    await expect(conjunto('7.1.4', '9.9.7')).rejects.toThrow(/PUBLICADO y de alcance COMPLETO/);
  });

  it('CONTROL POSITIVO SINTÉTICO: publicado, completo y con revisión vigente sí; una revisión posterior que lo objeta lo invalida', async () => {
    await revision('9.9.9', 'REVIEWED');
    await conjunto('7.2.0', '9.9.9'); // no lanza
    const fila = await sql<{ regulatory_profile: string }>`SELECT regulatory_profile FROM risk_rule_sets WHERE version = '7.2.0'`.execute(h.db);
    expect(fila.rows[0].regulatory_profile).toBe('9.9.9');
    await revision('9.9.9', 'OBJECTED');
    await expect(conjunto('7.2.1', '9.9.9')).rejects.toThrow(/revisión jurídica vigente/);
    await revision('9.9.9', 'REVIEWED');
    await conjunto('7.2.2', '9.9.9'); // una revisión posterior la restablece, por el mismo mecanismo
  });

  it('no existe API que fije regulatory_profile', async () => {
    const r = await h.http().patch(`/api/v1/organizations/${org}/risk/rule-sets/1.0.0`).set(as(ADMIN)).send({ regulatory_profile: '9.9.9' });
    expect([404, 405]).toContain(r.status);
    const f = await sql<{ n: string }>`SELECT count(*)::text AS n FROM risk_rule_sets WHERE version = '1.0.0' AND regulatory_profile IS NOT NULL`.execute(h.db);
    expect(Number(f.rows[0].n)).toBe(0);
  });

  // ---------------------------------------------------------------- perfil 0.2.0 en borrador

  it('0.2.0 es un BORRADOR con EC-7 a EC-9, procedencia e interpretación por regla; 0.1.0 no cambió', async () => {
    const cat = (await h.http().get(`/api/v1/organizations/${org}/legal-profile/catalog`).set(as(ADMIN)).expect(200)).body;
    const v1 = cat.versions.find((x: { version: string }) => x.version === '0.1.0');
    const v2 = cat.versions.find((x: { version: string }) => x.version === '0.2.0');
    expect(v1).toMatchObject({ technical_status: 'PUBLISHED', scope: 'PARTIAL' });
    expect(v1.rules).toHaveLength(4);
    expect(v1.sources).toHaveLength(3);
    expect(v2).toMatchObject({ technical_status: 'DRAFT', scope: 'PARTIAL' });
    expect(v2.rules.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining(['EC-PFN-CONVERSION-USO', 'EC-PARAMOS-MORETALES-MANGLARES', 'EC-PROPIEDAD-EN-PFN']));
    expect(v2.rules).toHaveLength(7);
    expect(v2.sources.map((s: { code: string }) => s.code)).toContain('COA-983');
    const nuevas = v2.rules.filter((r: { source_code: string }) => r.source_code === 'COA-983');
    expect(nuevas).toHaveLength(3);
    for (const r of nuevas) {
      expect(r).toMatchObject({ review_status: 'DRAFT', needs_legal_review: true, matter: 'ENVIRONMENT' });
      expect(r.gaps).toMatch(/Procedencia:/);
      expect(r.gaps).toMatch(/Interpretacion propuesta:/);
      expect(r.gaps).toMatch(/Preguntas para el revisor:/);
    }
  });

  it('0.2.0 no se puede adoptar (422) y ninguna organización queda con perfil adoptado', async () => {
    const r = await h.http().post(`/api/v1/organizations/${org}/legal-profile/adoptions`).set(as(ADMIN))
      .send({ operation_id: randomUUID(), version: '0.2.0', decision: 'ADOPT', reason: 'Intento de adoptar un borrador' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('LEGAL_PROFILE_NOT_PUBLISHED');
    const n = await sql<{ n: string }>`SELECT count(*)::text AS n FROM legal_profile_adoptions WHERE version = '0.2.0'`.execute(h.db);
    expect(Number(n.rows[0].n)).toBe(0);
  });
});
