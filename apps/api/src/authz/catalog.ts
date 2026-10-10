// Catálogo RBAC versionado (docs/07_RBAC_Y_GOBERNANZA.md). Se amplía por historia; no inferir
// privilegios comparando nombres de rol fuera de este módulo.
export const RBAC_CATALOG_VERSION = '2026-10-10.6';

export type Permission =
  | 'organization:read'
  | 'organization:update'
  | 'membership:read'
  | 'membership:assign'
  | 'audit:read'
  // P0-004. `_assigned` = solo productores asignados a la membresía del usuario.
  | 'producer:read'
  | 'producer:read_assigned'
  | 'producer:read_identity'
  | 'producer:create'
  | 'producer:update'
  | 'producer:update_assigned'
  | 'producer:assign'
  | 'producer:archive'
  // P0-005: revisar posibles duplicados (Data Steward).
  | 'producer:review_duplicates'
  // P0-006. `_assigned` = parcelas de productores asignados a la membresía del usuario.
  | 'plot:read'
  | 'plot:read_assigned'
  | 'plot:create'
  | 'plot:create_assigned'
  | 'plot:update'
  | 'plot:update_assigned'
  | 'plot:archive'
  // Clasificación de acceso a geometrías exactas (doc 06): coordenadas solo con este permiso, dentro del
  // mismo alcance de lectura de parcelas. Sin él, la API omite coordenadas (no las oculta la UI).
  | 'plot:read_geometry'
  // P0-010: ejecutar la evaluación GIS técnica (consultar resultados usa plot:read/plot:read_assigned).
  | 'plot:evaluate_gis'
  | 'plot:evaluate_gis_assigned';

// Permisos de plataforma: solo SUPER_ADMIN (users.platform_role), nunca por membresía.
export type PlatformPermission =
  | 'organization:create'
  | 'organization:suspend'
  | 'organization:list_all'
  | 'organization:onboard_admin'
  | 'user:deactivate';

const ALL_MEMBER_READ: Permission[] = ['organization:read'];

const PRODUCER_ALL: Permission[] = [
  'producer:read', 'producer:read_assigned', 'producer:read_identity', 'producer:create',
  'producer:update', 'producer:update_assigned', 'producer:assign', 'producer:archive', 'producer:review_duplicates',
];

const PLOT_ALL: Permission[] = [
  'plot:read', 'plot:read_assigned', 'plot:create', 'plot:create_assigned', 'plot:update', 'plot:update_assigned', 'plot:archive', 'plot:read_geometry',
  'plot:evaluate_gis', 'plot:evaluate_gis_assigned',
];

// Permisos de productor: propuesta provisional derivada de S1 §9 (FIELD_TECHNICIAN producer:create/read)
// y doc 07/14 («solo asignaciones» para el técnico). Pendiente de ratificación con el resto de la matriz.
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ORG_ADMIN: ['audit:read', 'organization:read', 'organization:update', 'membership:read', 'membership:assign', ...PRODUCER_ALL, ...PLOT_ALL],
  MANAGER: [...ALL_MEMBER_READ, 'membership:read', 'producer:read', 'producer:read_identity', 'producer:create', 'producer:update', 'producer:assign', 'producer:archive', 'producer:review_duplicates', 'plot:read', 'plot:create', 'plot:update', 'plot:archive', 'plot:read_geometry', 'plot:evaluate_gis'],
  FIELD_TECHNICIAN: [...ALL_MEMBER_READ, 'producer:read_assigned', 'producer:read_identity', 'producer:create', 'producer:update_assigned',
    'plot:read_assigned', 'plot:create_assigned', 'plot:update_assigned', 'plot:read_geometry', 'plot:evaluate_gis_assigned'],
  RECEPTION_OPERATOR: ALL_MEMBER_READ,
  QUALITY_OPERATOR: ALL_MEMBER_READ,
  TRACEABILITY_MANAGER: [...ALL_MEMBER_READ, 'producer:read', 'plot:read', 'plot:read_geometry', 'plot:evaluate_gis'],
  EUDR_MANAGER: [...ALL_MEMBER_READ, 'producer:read', 'producer:read_identity', 'plot:read', 'plot:read_geometry', 'plot:evaluate_gis'],
  EXPORT_MANAGER: ALL_MEMBER_READ,
  BUYER: [],
  AUDITOR: [...ALL_MEMBER_READ, 'audit:read', 'producer:read', 'plot:read'],
  PRODUCER: [],
};

export const PLATFORM_PERMISSIONS: Record<'SUPER_ADMIN', PlatformPermission[]> = {
  // organization:onboard_admin: solo invitar (y ver/revocar invitaciones de) ORG_ADMIN en una organización
  // donde no es miembro. NO da acceso a miembros, datos personales ni operación: eso requiere la
  // política de elevación auditada (D-04, pendiente). No hay bypass global de SUPER_ADMIN.
  SUPER_ADMIN: ['organization:create', 'organization:suspend', 'organization:list_all', 'organization:onboard_admin', 'user:deactivate'],
};

export function permissionsForRoles(roles: string[]): Permission[] {
  return [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []))].sort();
}

export const ORGANIZATION_ROLES = Object.keys(ROLE_PERMISSIONS);

/**
 * Anti-escalamiento: un actor solo puede conceder (o retirar) un rol cuyos permisos ya posee.
 * Exige además membership:assign. SUPER_ADMIN sin membresía solo usa organization:onboard_admin.
 */
export function canGrantRole(actorPermissions: Permission[], roleCode: string): boolean {
  const role = ROLE_PERMISSIONS[roleCode];
  if (!role || !actorPermissions.includes('membership:assign')) return false;
  return role.every((p) => actorPermissions.includes(p));
}

export function assignableRoles(actorPermissions: Permission[]): string[] {
  return ORGANIZATION_ROLES.filter((r) => canGrantRole(actorPermissions, r)).sort();
}
