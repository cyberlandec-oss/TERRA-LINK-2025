import { PLATFORM_PERMISSIONS, ROLE_PERMISSIONS, assignableRoles, canGrantRole, permissionsForRoles } from './catalog';

describe('catálogo RBAC', () => {
  it('cubre los 11 roles de organización documentados y ninguno más', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [
        'AUDITOR', 'BUYER', 'EUDR_MANAGER', 'EXPORT_MANAGER', 'FIELD_TECHNICIAN', 'MANAGER',
        'ORG_ADMIN', 'PRODUCER', 'QUALITY_OPERATOR', 'RECEPTION_OPERATOR', 'TRACEABILITY_MANAGER',
      ].sort(),
    );
  });

  it('ningún rol de organización concede permisos de plataforma', () => {
    const platform = new Set<string>(PLATFORM_PERMISSIONS.SUPER_ADMIN);
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      expect(perms.filter((p) => platform.has(p))).toEqual([]);
    }
  });

  it('solo ORG_ADMIN puede actualizar la organización', () => {
    const holders = Object.entries(ROLE_PERMISSIONS)
      .filter(([, p]) => p.includes('organization:update'))
      .map(([r]) => r);
    expect(holders).toEqual(['ORG_ADMIN']);
  });

  it('une permisos de varios roles sin duplicados y desconoce roles no catalogados', () => {
    expect(permissionsForRoles(['TRACEABILITY_MANAGER', 'AUDITOR', 'INVENTED'])).toEqual(['analytics:read', 'audit:export', 'audit:read', 'dd:read', 'delivery:read', 'document:read', 'economics:read', 'evidence:read', 'location:read', 'lot:create', 'lot:read', 'lot:release_input', 'mitigation:contribute', 'mitigation:read', 'organization:read', 'plot:evaluate_gis', 'plot:read', 'plot:read_geometry', 'process:close', 'process:manage', 'producer:read', 'product:read', 'report:export', 'report:read', 'risk:read', 'satellite:read', 'shipment:read', 'stock:move', 'stock:read', 'traceability:read_catalog']);
  });

  it('anti-escalamiento: solo se conceden roles cuyos permisos posee el actor', () => {
    const admin = permissionsForRoles(['ORG_ADMIN']);
    const manager = permissionsForRoles(['MANAGER']);
    expect(canGrantRole(admin, 'ORG_ADMIN')).toBe(true);
    expect(canGrantRole(admin, 'FIELD_TECHNICIAN')).toBe(true);
    expect(canGrantRole(manager, 'FIELD_TECHNICIAN')).toBe(false); // sin membership:assign
    expect(canGrantRole(admin, 'SUPER_ADMIN')).toBe(false);
    expect(canGrantRole(admin, 'INVENTED')).toBe(false);
    expect(assignableRoles(admin)).toContain('ORG_ADMIN');
    expect(assignableRoles(manager)).toEqual([]);
  });

  it('productor: el técnico solo trabaja con asignados; AUDITOR lee sin identidad', () => {
    const tech = permissionsForRoles(['FIELD_TECHNICIAN']);
    expect(tech).toEqual(expect.arrayContaining(['producer:read_assigned', 'producer:update_assigned', 'producer:create']));
    expect(tech).not.toContain('producer:read');
    expect(tech).not.toContain('producer:archive');
    const auditor = permissionsForRoles(['AUDITOR']);
    expect(auditor).toContain('producer:read');
    expect(auditor).not.toContain('producer:read_identity');
    expect(permissionsForRoles(['BUYER']).filter((p) => p.startsWith('producer:'))).toEqual([]);
    // A-01: el productor solo tiene permisos de alcance PROPIO (y solo rige con el vínculo explícito); nada amplio ni asignado.
    expect(permissionsForRoles(['PRODUCER']).filter((p) => p.startsWith('producer:'))).toEqual(['producer:read_own']);
  });

  it('parcela: el técnico solo opera parcelas de productores asignados; comprador y productor sin acceso', () => {
    const tech = permissionsForRoles(['FIELD_TECHNICIAN']);
    expect(tech).toEqual(expect.arrayContaining(['plot:read_assigned', 'plot:create_assigned', 'plot:update_assigned']));
    expect(tech.filter((p) => ['plot:read', 'plot:create', 'plot:update', 'plot:archive'].includes(p))).toEqual([]);
    expect(permissionsForRoles(['BUYER', 'RECEPTION_OPERATOR']).filter((p) => p.startsWith('plot:'))).toEqual([]);
    // A-01: el productor opera solo lo propio; no lee ni evalúa geometrías ajenas ni de la organización.
    expect(permissionsForRoles(['PRODUCER']).filter((p) => p.startsWith('plot:')).sort()).toEqual(['plot:create_own', 'plot:read_geometry', 'plot:read_own', 'plot:update_own']);
  });

  it('geometría exacta: clasificación separada de la lectura de parcela; AUDITOR lee parcelas sin coordenadas', () => {
    expect(permissionsForRoles(['AUDITOR'])).toContain('plot:read');
    expect(permissionsForRoles(['AUDITOR'])).not.toContain('plot:read_geometry');
    for (const r of ['ORG_ADMIN', 'MANAGER', 'FIELD_TECHNICIAN', 'TRACEABILITY_MANAGER', 'EUDR_MANAGER']) {
      expect(permissionsForRoles([r])).toContain('plot:read_geometry');
    }
  });

  /**
   * S1 §49 lista `Package` entre las entidades con referencia pública. En esta implementación el paquete de
   * debida diligencia **se genera desde la instantánea**, y su huella depende además del *perfil de redacción*
   * de quien exporta (`geometry`, `personal_documents`). Mientras **todos** los roles que pueden exportar
   * tengan el MISMO perfil, un paquete queda identificado por su instantánea —que sí tiene referencia— y no
   * hace falta un identificador nuevo.
   *
   * Si alguien añade un rol que pueda exportar con un perfil más estrecho, dos paquetes de la misma
   * instantánea tendrían huellas distintas y **la identidad del paquete dejaría de ser la instantánea**. Esta
   * prueba existe para que eso no pase inadvertido.
   */
  it('la identidad del PAQUETE sigue siendo la instantánea: todos los exportadores comparten perfil de redacción', () => {
    const exportadores = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes('dd:export_package'));
    expect(exportadores.length).toBeGreaterThan(0);
    const perfiles = new Set(exportadores.map(([, p]) =>
      `${p.includes('plot:read_geometry')}|${p.includes('producer:read_identity')}`));
    expect(perfiles.size).toBe(1);
    // Y es el perfil completo: nadie exporta hoy una versión redactada.
    expect([...perfiles][0]).toBe('true|true');
  });
});
