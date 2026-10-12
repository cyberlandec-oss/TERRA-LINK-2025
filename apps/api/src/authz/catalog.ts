// Catálogo RBAC versionado (docs/07_RBAC_Y_GOBERNANZA.md). Se amplía por historia; no inferir
// privilegios comparando nombres de rol fuera de este módulo.
export const RBAC_CATALOG_VERSION = '2026-10-11.20';

export type Permission =
  | 'organization:read'
  | 'organization:update'
  | 'membership:read'
  | 'membership:assign'
  | 'audit:read'
  // P0-025: exportar la bitácora con el mismo alcance y redacción que la consulta.
  | 'audit:export'
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
  | 'plot:evaluate_gis_assigned'
  // P0-011: catálogo de productos de la organización. Administrar = alta, edición y baja lógica.
  | 'product:read'
  | 'product:manage'
  // P0-013: consultar el catálogo de sistema de hitos críticos (CTE). Sin facultad de administración.
  | 'traceability:read_catalog'
  // P0-015: reprocesar manualmente entregas DEAD del outbox de la propia organización (con motivo y auditoría).
  | 'events:reprocess'
  // P0-018: documentos. Consultar y subir se limitan además por el alcance del titular (productor/parcela);
  // revisar es una facultad separada; el contenido PERSONAL_DATA exige producer:read_identity.
  | 'document:read'
  | 'document:upload'
  | 'document:review'
  // P0-019: evidencias. Consultar/vincular se limitan además por el alcance de la entidad y del documento;
  // verificar/rechazar/revocar es una facultad separada.
  | 'evidence:read'
  | 'evidence:link'
  | 'evidence:verify'
  // P0-012: entregas y recepción (docs/07 «delivery: read, create, correct»; «reception/quality: read, confirm,
  // analyze, release_quality, reject_quality»). `_assigned` = entregas de productores asignados a la membresía.
  // Centros asignados para RECEPTION_OPERATOR: sin contrato de asignación todavía (alcance de organización).
  | 'delivery:read'
  | 'delivery:read_assigned'
  | 'delivery:create'
  | 'delivery:create_assigned'
  | 'delivery:correct'
  | 'reception:confirm'
  | 'reception:correct'
  | 'location:read'
  | 'location:manage'
  | 'quality:record'
  | 'quality:decide'
  // P0-016 (docs/07 «lot / process: read, create, close»; D-39.4 adoptada para desarrollo local): leer lotes; crear lotes
  // y asignar recepciones; liberar asignaciones; preparar/iniciar/cancelar procesos; cerrar procesos (permiso específico).
  | 'lot:read'
  | 'lot:create'
  | 'lot:release_input'
  | 'process:manage'
  | 'process:close'
  // P0-017 (docs/07 «stock: read, adjust, …»; propuesta en docs/decisiones/P0-017-EFECTOS-LEDGER.md): saldos y movimientos;
  // merma, traslado y asignación de ubicación; ajuste con motivo; incorporación/conciliación. Reserva y despacho: P0-029.
  | 'stock:read'
  | 'stock:move'
  | 'stock:adjust'
  | 'stock:incorporate'
  // P0-020 (docs/07 EUDR_MANAGER «evaluar»; AUDITOR y TRACEABILITY_MANAGER lectura): evaluaciones técnicas de riesgo y
  // su revisión humana. Leer/evaluar exige además lectura de organización completa (comprobado en el servicio).
  | 'risk:read'
  | 'risk:evaluate'
  | 'risk:review'
  // P0-021 (docs/13 §Mitigación; docs/07 EUDR_MANAGER «crear mitigación, revisar»): leer, crear/asignar, aportar soportes
  // (solo el responsable asignado) y verificar/rechazar (nunca quien ejecutó: separación de funciones sin excepción).
  | 'mitigation:read'
  | 'mitigation:manage'
  | 'mitigation:contribute'
  | 'mitigation:verify'
  // P0-022 (docs/09 «dd:read/approve_package/export_package»; docs/07 EUDR_MANAGER): leer el expediente, gestionarlo (crear y
  // capturar instantáneas), revisar/aprobar la preparación (aprobar exige todos los requisitos cumplidos) y exportar paquetes.
  | 'dd:read'
  | 'dd:manage'
  | 'dd:approve_package'
  | 'dd:export_package'
  // P0-024 (docs/11): usar la sincronización de campo con un dispositivo propio (registrar, enviar, recibir) y gestionar
  // (revocar) dispositivos de otros miembros. El dispositivo nunca concede permisos: cada operación revalida los suyos.
  | 'sync:use'
  | 'device:manage'
  // P0-026 (docs/09 «permiso de importación y de cada entidad»; docs/14 ORG_ADMIN «mapear Excel»): cargar, mapear,
  // previsualizar y confirmar importaciones. NO concede nada sobre las entidades: cada fila exige además el permiso y el
  // alcance de la entidad (p. ej. producer:create, producer:update/_assigned, producer:read_identity).
  | 'import:manage';

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
  ORG_ADMIN: ['audit:read', 'audit:export', 'organization:read', 'organization:update', 'membership:read', 'membership:assign', ...PRODUCER_ALL, ...PLOT_ALL, 'product:read', 'traceability:read_catalog', 'product:manage', 'events:reprocess', 'document:read', 'document:upload', 'document:review', 'evidence:read', 'evidence:link', 'evidence:verify', 'delivery:read', 'delivery:read_assigned', 'delivery:create', 'delivery:create_assigned', 'delivery:correct', 'reception:confirm', 'reception:correct', 'location:read', 'location:manage', 'quality:record', 'quality:decide', 'lot:read', 'lot:create', 'lot:release_input', 'process:manage', 'process:close', 'stock:read', 'stock:move', 'stock:adjust', 'stock:incorporate', 'risk:read', 'risk:evaluate', 'risk:review', 'mitigation:read', 'mitigation:manage', 'mitigation:contribute', 'mitigation:verify', 'dd:read', 'dd:manage', 'dd:approve_package', 'dd:export_package', 'sync:use', 'device:manage', 'import:manage'],
  MANAGER: [...ALL_MEMBER_READ, 'membership:read', 'producer:read', 'producer:read_identity', 'producer:create', 'producer:update', 'producer:assign', 'producer:archive', 'producer:review_duplicates', 'plot:read', 'plot:create', 'plot:update', 'plot:archive', 'plot:read_geometry', 'plot:evaluate_gis', 'product:read', 'traceability:read_catalog', 'document:read', 'document:upload', 'evidence:read', 'evidence:link', 'delivery:read', 'delivery:create', 'delivery:correct', 'reception:confirm', 'location:read', 'lot:read', 'lot:create', 'stock:read', 'sync:use', 'import:manage'],
  FIELD_TECHNICIAN: [...ALL_MEMBER_READ, 'producer:read_assigned', 'producer:read_identity', 'producer:create', 'producer:update_assigned',
    'plot:read_assigned', 'plot:create_assigned', 'plot:update_assigned', 'plot:read_geometry', 'plot:evaluate_gis_assigned', 'product:read', 'traceability:read_catalog', 'document:read', 'document:upload', 'evidence:read', 'evidence:link', 'delivery:read_assigned', 'delivery:create_assigned', 'location:read', 'sync:use'],
  RECEPTION_OPERATOR: [...ALL_MEMBER_READ, 'product:read', 'traceability:read_catalog', 'delivery:read', 'delivery:create', 'reception:confirm', 'reception:correct', 'location:read', 'quality:record', 'lot:read', 'lot:create', 'stock:read'],
  QUALITY_OPERATOR: [...ALL_MEMBER_READ, 'product:read', 'traceability:read_catalog', 'delivery:read', 'location:read', 'quality:record', 'quality:decide', 'lot:read', 'stock:read'],
  TRACEABILITY_MANAGER: [...ALL_MEMBER_READ, 'producer:read', 'plot:read', 'plot:read_geometry', 'plot:evaluate_gis', 'product:read', 'traceability:read_catalog', 'document:read', 'evidence:read', 'delivery:read', 'location:read', 'lot:read', 'lot:create', 'lot:release_input', 'process:manage', 'process:close', 'stock:read', 'stock:move', 'risk:read', 'mitigation:read', 'mitigation:contribute'],
  EUDR_MANAGER: [...ALL_MEMBER_READ, 'producer:read', 'producer:read_identity', 'plot:read', 'plot:read_geometry', 'plot:evaluate_gis', 'product:read', 'traceability:read_catalog', 'document:read', 'document:upload', 'document:review', 'evidence:read', 'evidence:link', 'evidence:verify', 'delivery:read', 'location:read', 'lot:read', 'stock:read', 'risk:read', 'risk:evaluate', 'risk:review', 'mitigation:read', 'mitigation:manage', 'mitigation:contribute', 'mitigation:verify', 'dd:read', 'dd:manage', 'dd:approve_package', 'dd:export_package'],
  EXPORT_MANAGER: [...ALL_MEMBER_READ, 'product:read', 'traceability:read_catalog', 'lot:read', 'stock:read'],
  BUYER: [],
  AUDITOR: [...ALL_MEMBER_READ, 'audit:read', 'audit:export', 'producer:read', 'plot:read', 'product:read', 'traceability:read_catalog', 'document:read', 'evidence:read', 'delivery:read', 'location:read', 'lot:read', 'stock:read', 'risk:read', 'mitigation:read', 'dd:read'],
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
