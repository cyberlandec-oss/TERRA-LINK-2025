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
    expect(permissionsForRoles(['TRACEABILITY_MANAGER', 'AUDITOR', 'INVENTED'])).toEqual(['audit:read', 'organization:read', 'plot:evaluate_gis', 'plot:read', 'plot:read_geometry', 'producer:read', 'product:read', 'traceability:read_catalog']);
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
    expect(permissionsForRoles(['BUYER', 'PRODUCER']).filter((p) => p.startsWith('producer:'))).toEqual([]);
  });

  it('parcela: el técnico solo opera parcelas de productores asignados; comprador y productor sin acceso', () => {
    const tech = permissionsForRoles(['FIELD_TECHNICIAN']);
    expect(tech).toEqual(expect.arrayContaining(['plot:read_assigned', 'plot:create_assigned', 'plot:update_assigned']));
    expect(tech.filter((p) => ['plot:read', 'plot:create', 'plot:update', 'plot:archive'].includes(p))).toEqual([]);
    expect(permissionsForRoles(['BUYER', 'PRODUCER', 'RECEPTION_OPERATOR']).filter((p) => p.startsWith('plot:'))).toEqual([]);
  });

  it('geometría exacta: clasificación separada de la lectura de parcela; AUDITOR lee parcelas sin coordenadas', () => {
    expect(permissionsForRoles(['AUDITOR'])).toContain('plot:read');
    expect(permissionsForRoles(['AUDITOR'])).not.toContain('plot:read_geometry');
    for (const r of ['ORG_ADMIN', 'MANAGER', 'FIELD_TECHNICIAN', 'TRACEABILITY_MANAGER', 'EUDR_MANAGER']) {
      expect(permissionsForRoles([r])).toContain('plot:read_geometry');
    }
  });
});
