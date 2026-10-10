# RBAC, aislamiento y gobernanza

FUENTE: S1 §§8–9, 58, 79–81; S4 §§2–18. Matriz propuesta para revisión, no catálogo real de permisos instalado.

## Roles documentados

Los adjuntos contienen 12 códigos: `SUPER_ADMIN`, `ORG_ADMIN`, `MANAGER`, `FIELD_TECHNICIAN`, `RECEPTION_OPERATOR`, `QUALITY_OPERATOR`, `TRACEABILITY_MANAGER`, `EUDR_MANAGER`, `EXPORT_MANAGER`, `BUYER`, `AUDITOR`, `PRODUCER`. No crear `RISK_MANAGER` como nuevo rol por el nombre de una pantalla; la responsabilidad puede corresponder a EUDR_MANAGER. Confirmar roles adicionales en repo.

## Matriz de capacidad

| Rol | Ámbito | Lectura | Escritura/acción | Restricción crítica |
| --- | --- | --- | --- | --- |
| SUPER_ADMIN | Plataforma | Organizaciones, salud, uso, auditoría técnica | Crear/suspender tenant, configurar integraciones | Acceso a contenido personal/operativo por elevación documentada; sin acceso irrestricto implícito |
| ORG_ADMIN | Organización | Configuración y operación propia | Miembros, roles permitidos, catálogos, onboarding | No asignar rol global; aprobar DD solo si tiene permiso específico |
| MANAGER | Operación propia | Operaciones, excepciones y pendientes | Asignar trabajo y resolver incidencias según permiso | No modificar metodología legal por ser supervisor |
| FIELD_TECHNICIAN | Asignaciones propias | Productores/parcelas asignados | Captura, documentos, entregas y correcciones de captura | No aprobar riesgo ni presentar DDS |
| RECEPTION_OPERATOR | Centros asignados | Entregas, producto y lotes autorizados | Recibir, pesar, vincular origen/lote | No eliminar evento confirmado ni ajustar sin motivo |
| QUALITY_OPERATOR | Muestras/lotes autorizados | Recepción y calidad | Registrar análisis, liberar/rechazar calidad | No liberar exportación jurídica |
| TRACEABILITY_MANAGER | Cadena propia | Grafo, lotes, movimientos | Procesamiento, relación y corrección autorizada | No inventar vínculos de origen |
| EUDR_MANAGER | Casos propios/asignados | Evidencia, riesgo, legalidad, DD | Evaluar, crear mitigación, revisar, preparar/validar paquete | Envío oficial exige permiso adicional y operador válido |
| EXPORT_MANAGER | Embarques propios | Lotes, compradores, bloqueos, paquetes | Reservar, preparar, liberar despacho si gates pasan | No ignorar bloques legales/operativos |
| BUYER | Recursos compartidos | Lotes, mapa y paquete según grant | Comentarios/solicitudes si se habilitan | Sin edición de origen ni datos de terceros |
| AUDITOR | Encargo/alcance concedido | Eventos, snapshots y evidencia autorizada | Registrar hallazgo si se habilita | No editar operación auditada |
| PRODUCER | Recursos propios | Perfil, parcelas, entregas, documentos, pendientes | Enviar información/confirmaciones según flujo | No acceso a otros productores ni configuración |

La separación entre quien aporta una mitigación y quien la verifica es política propuesta; para equipos pequeños, cualquier excepción debe tener permiso, motivo y auditoría explícitos.

## Permisos propuestos

| Familia | Acciones mínimas |
| --- | --- |
| organization / membership / role | read, create, update, suspend, assign |
| producer / plot / delivery | read, create, update_draft, correct, archive |
| reception / quality | read, confirm, analyze, release_quality, reject_quality |
| lot / process / stock / shipment | read, create, close, adjust, reserve, release_dispatch, dispatch |
| document / evidence | read, upload, download, link, submit_review, verify, reject |
| risk / mitigation / dd | read, assess, recalculate, assign, submit_evidence, verify, approve_package, export_package |
| dds | submit, read_receipt, reconcile; no concesión por defecto |
| audit / report / share | read, export, grant, revoke |

Son nombres conceptuales; reutilizar catálogo real y mapearlos. La UI obtiene permisos efectivos, no interpreta privilegios por comparación de strings de rol.

## Algoritmo de autorización

Autenticar usuario → comprobar membresía activa → obtener tenant desde contexto confiable → comprobar permiso → cargar recurso dentro de ese tenant → comprobar asignación/propiedad/grant → filtrar campos → ejecutar/auditar. Aplicar también a FK enviadas en payload, búsquedas, totalizadores, snapshots, downloads, GIS y jobs.

- Sin sesión: 401. Falta de permiso en recurso del tenant: 403. Recurso ajeno/no visible: 404 cuando se aplica política para evitar enumeración. No traducir 403 a «no hay datos».
- Un `organization_id` en body o query no concede pertenencia.
- Descargas usan autorización previa y URL de vida corta; acceso por QR no esquiva el filtro.
- Jobs verifican vigencia del alcance al publicar/descargar el resultado.
- SUPER_ADMIN requiere ámbito administrativo claro y elevación auditable para contenido sensible.

## Datos compartidos

Grant con organización propietaria, destinatario autenticado, recurso/expediente, campos, propósito, vigencia y revocación. No cambiar `organization_id` ni unir cadenas privadas por un código coincidente. Datos previamente descargados no pueden retirarse mágicamente: informar alcance del intercambio y auditar exportación; acortar URLs y validar revocación en nuevas consultas.

## Gobernanza

| Función | Responsabilidad |
| --- | --- |
| Data Owner | Autoriza uso y compartición de datos de organización |
| Data Steward | Resuelve calidad, duplicados y vigencia |
| Data Collector | Captura con procedencia y método |
| Data Consumer | Usa información dentro del propósito autorizado |

Registrar base/propósito del tratamiento, retención por clase documental y atención de rectificaciones. No asumir que «consentimiento» siempre es la única base legal ni que el SaaS posee los datos del productor. Política aplicable y responsables se validan antes de producción.

## Matriz implementada (catálogo `2026-10-10.1`, P0-003)

Fuente de verdad: `apps/api/src/authz/catalog.ts`, expuesta en `GET /api/v1/rbac/roles`. El catálogo efectivo del usuario, por organización, está en `GET /api/v1/me/permissions`. Roles: los 12 de S1 §9 y S4, sin discrepancias de código con el catálogo. Solo se declaran permisos de recursos **ya implementados**. Las familias de la tabla «Permisos propuestos» (producer, plot, delivery, lot, risk, dd…) se añaden en la historia que crea cada recurso.

### Permisos de organización (por membresía activa en ESA organización)

| Rol | organization:read | organization:update | membership:read | membership:assign | audit:read |
| --- | :-: | :-: | :-: | :-: | :-: |
| ORG_ADMIN | ✔ | ✔ | ✔ | ✔ | ✔ |
| MANAGER | ✔ | | ✔ | | |
| AUDITOR | ✔ | | | | ✔ |
| FIELD_TECHNICIAN, RECEPTION_OPERATOR, QUALITY_OPERATOR, TRACEABILITY_MANAGER, EUDR_MANAGER, EXPORT_MANAGER | ✔ | | | | |
| BUYER, PRODUCER | | | | | |

BUYER y PRODUCER no ven la ficha de la organización: su acceso será por concesión o por recurso propio (P1-001 / historias del productor).

### Acciones y recurso

| Acción (endpoint) | Permiso | Recurso validado | Sin membresía | Con membresía sin permiso |
| --- | --- | --- | --- | --- |
| Ver organización (`GET /organizations/:id`) | organization:read | org = membresía activa | 404 | 403 |
| Configurar (`PATCH /organizations/:id`) | organization:update + org ACTIVE | ídem; `expected_version` | 404 | 403 / `ORGANIZATION_SUSPENDED` |
| Listar miembros e invitaciones | membership:read | filas de la org | 404 | 403 |
| Invitar / revocar | membership:assign + rol ⊆ permisos del actor | invitación de la org | 404 | 403 / `ROLE_NOT_GRANTABLE` |
| Cambiar roles (`PUT …/members/:id/roles`) | membership:assign; roles añadidos, retirados y actuales ⊆ permisos del actor; no a uno mismo | membresía de la org | 404 | 403 / 409 `SELF_ROLE_CHANGE` |
| Desactivar / reactivar miembro | ídem | membresía de la org | 404 | 403 / 409 |
| Bitácora (`GET …/audit-logs`) | audit:read | solo filas de la org; actores no miembros como `PLATFORM` | 404 | 403 |

### Plataforma (SUPER_ADMIN, `users.platform_role`)

| Permiso | Alcance |
| --- | --- |
| organization:create, organization:suspend, organization:list_all | Metadatos de organizaciones (nombre, tipo, estado) |
| organization:onboard_admin | Solo en una org donde **no** es miembro: invitar ORG_ADMIN y ver o revocar invitaciones ORG_ADMIN |
| user:deactivate | Desactivar o reactivar cuentas globales (invalida sesiones) |

No hay bypass global: sin membresía, SUPER_ADMIN recibe `ELEVATION_REQUIRED` (403) en miembros y cambios de rol, y 404 en la bitácora. Si además es miembro de una organización, actúa con los roles de esa membresía.

### Invariantes probadas (`apps/api/test/rbac.int-spec.ts`, `members.int-spec.ts`, `organizations.int-spec.ts`)

- Un rol en una organización no concede nada en otra (usuario MANAGER en A y ORG_ADMIN en B).
- Revocación, desactivación y cambio de rol tienen efecto en la siguiente solicitud con el mismo token. La desactivación de cuenta invalida los tokens por `token_version`.
- Las referencias del cuerpo no conceden tenant (`organization_id` extra → 400). Una membresía de otra org por la ruta propia → 404. La FK compuesta `role_assignments → memberships(organization_id, id)` impide asignaciones cruzadas en BD.
- Listados y errores no incluyen nombres, correos ni identificadores de otra organización.
- El tipo comercial de organización (D-18) no interviene en la autorización.

### Productores (catálogo `2026-10-10.2`, P0-004, propuesta provisional)

| Rol | read | read_assigned | read_identity | create | update | update_assigned | assign | archive |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| ORG_ADMIN | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| MANAGER | ✔ | | ✔ | ✔ | ✔ | | ✔ | ✔ |
| FIELD_TECHNICIAN | | ✔ | ✔ | ✔ | | ✔ | | |
| TRACEABILITY_MANAGER | ✔ | | | | | | | |
| EUDR_MANAGER | ✔ | | ✔ | | | | | |
| AUDITOR | ✔ | | | | | | | |
| RECEPTION_OPERATOR, QUALITY_OPERATOR, EXPORT_MANAGER, BUYER, PRODUCER | | | | | | | | |

Origen: S1 §9 (FIELD_TECHNICIAN `producer:create/read`) y doc 07/14 («solo asignaciones» para el técnico). `update` corresponde a `update_draft/correct` de la tabla conceptual; `archive` cubre baja, reactivación y activación de borradores. RECEPTION_OPERATOR podrá necesitar lectura al implementar entregas (P0-012): se decidirá allí.

- `read_assigned` / `update_assigned`: solo productores con `assigned_membership_id` = membresía del usuario. Lo que registra un técnico sin `producer:read` queda asignado a él.
- `read_identity`: documento, teléfono y dirección (respuesta, historial y búsqueda exacta por documento). Sin él, esos campos no se devuelven.
- Responsable asignado: membresía ACTIVA de la misma organización y con acceso a productores (422 si no). FK compuesta en BD.
