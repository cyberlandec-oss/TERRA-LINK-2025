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
    expect(permissionsForRoles(['MANAGER', 'AUDITOR', 'INVENTED'])).toEqual(['membership:read', 'organization:read']);
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
});
