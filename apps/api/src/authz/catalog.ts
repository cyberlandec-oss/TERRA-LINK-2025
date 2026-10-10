// Catálogo RBAC versionado (docs/07_RBAC_Y_GOBERNANZA.md). Se amplía por historia; no inferir
// privilegios comparando nombres de rol fuera de este módulo.
export const RBAC_CATALOG_VERSION = '2026-10-09.1';

export type Permission =
  | 'organization:read'
  | 'organization:update'
  | 'membership:read'
  | 'membership:assign';

// Permisos de plataforma: solo SUPER_ADMIN (users.platform_role), nunca por membresía.
export type PlatformPermission = 'organization:create' | 'organization:suspend' | 'organization:list_all';

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
  SUPER_ADMIN: ['organization:create', 'organization:suspend', 'organization:list_all'],
};

export function permissionsForRoles(roles: string[]): Permission[] {
  return [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []))].sort();
}
