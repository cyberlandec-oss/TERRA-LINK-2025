// Catálogo RBAC versionado (docs/07_RBAC_Y_GOBERNANZA.md). Se amplía por historia; no inferir
// privilegios comparando nombres de rol fuera de este módulo.
export const RBAC_CATALOG_VERSION = '2026-10-09.2';

export type Permission =
  | 'organization:read'
  | 'organization:update'
  | 'membership:read'
  | 'membership:assign';

// Permisos de plataforma: solo SUPER_ADMIN (users.platform_role), nunca por membresía.
export type PlatformPermission =
  | 'organization:create'
  | 'organization:suspend'
  | 'organization:list_all'
  | 'membership:invite_any'
  | 'user:deactivate';

const ALL_MEMBER_READ: Permission[] = ['organization:read'];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ORG_ADMIN: ['organization:read', 'organization:update', 'membership:read', 'membership:assign'],
  MANAGER: [...ALL_MEMBER_READ, 'membership:read'],
  FIELD_TECHNICIAN: ALL_MEMBER_READ,
  RECEPTION_OPERATOR: ALL_MEMBER_READ,
  QUALITY_OPERATOR: ALL_MEMBER_READ,
  TRACEABILITY_MANAGER: ALL_MEMBER_READ,
  EUDR_MANAGER: ALL_MEMBER_READ,
  EXPORT_MANAGER: ALL_MEMBER_READ,
  BUYER: [],
  AUDITOR: ALL_MEMBER_READ,
  PRODUCER: [],
};

export const PLATFORM_PERMISSIONS: Record<'SUPER_ADMIN', PlatformPermission[]> = {
  // membership:invite_any: incorporar al primer ORG_ADMIN u otro rol en cualquier organización (auditado).
  SUPER_ADMIN: ['organization:create', 'organization:suspend', 'organization:list_all', 'membership:invite_any', 'user:deactivate'],
};

export function permissionsForRoles(roles: string[]): Permission[] {
  return [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []))].sort();
}

export const ORGANIZATION_ROLES = Object.keys(ROLE_PERMISSIONS);

/**
 * Anti-escalamiento: un actor solo puede conceder (o retirar) un rol cuyos permisos ya posee.
 * Exige además membership:assign. SUPER_ADMIN usa membership:invite_any.
 */
export function canGrantRole(actorPermissions: Permission[], roleCode: string): boolean {
  const role = ROLE_PERMISSIONS[roleCode];
  if (!role || !actorPermissions.includes('membership:assign')) return false;
  return role.every((p) => actorPermissions.includes(p));
}

export function assignableRoles(actorPermissions: Permission[]): string[] {
  return ORGANIZATION_ROLES.filter((r) => canGrantRole(actorPermissions, r)).sort();
}
