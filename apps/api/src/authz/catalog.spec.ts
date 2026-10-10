import { PLATFORM_PERMISSIONS, ROLE_PERMISSIONS, permissionsForRoles } from './catalog';

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
});
