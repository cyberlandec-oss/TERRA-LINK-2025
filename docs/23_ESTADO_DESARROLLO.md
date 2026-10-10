# Estado compartido de desarrollo

Última actualización: 2026-10-10. Repositorio `cyberlandec-oss/TERRA-LINK-2025`, rama de trabajo `feat/tech-001-ci-p0-002` (PR #1 abierto como respaldo y revisión; `main` en `03bb2f6`).

> Resultados ajenos a este proyecto: la auditoría inicial del repo `cacao` no aplica a Terra Link 2025.

## Criterio vigente: validación local

GitHub Actions no es requisito en esta etapa (workflow inactivo en `infra/ci/github-actions-ci.yml`). La facturación de GitHub **no es un bloqueo**. **DONE_LOCAL** = criterios de la historia cumplidos con evidencia local (`npm run validate` aprobado + suites de la historia). DONE_LOCAL no acredita producción, Android real ni conformidad EUDR.

Última validación: `npm run validate` **APROBADA**, 7 pasos (servicios, typecheck, lint, build, OpenAPI validado, API 90/90 + web 3/3, E2E 14/14). Registro en `validation-results/` (no versionado); commit y resultado en el registro de sesión.

## Estado por historia

| Historia | Estado | Motivo |
| --- | --- | --- |
| TECH-001 | **DONE_LOCAL (fundamentos)** | Ver tabla; lo funcional pendiente pasa a sus historias |
| P0-001 Organización | **DONE_LOCAL** | Criterios cumplidos; D-18 provisional no afecta el criterio |
| P0-002 Usuarios | **DONE_LOCAL** | Criterios cumplidos con la autenticación vigente; entrega de invitaciones provisional (D-19) registrada |
| P0-003 RBAC y aislamiento | **ABIERTA, bloqueada en 2 criterios** | «buyer/grants» sin contrato (ADR-0002, P1-001) y «superadmin/elevación» sin D-04. El resto, verificado |
| P0-004 Productor | **DONE_LOCAL** | Brecha de cifrado de identidad resuelta (migración 0006) |
| P0-005 Código y deduplicación | **DONE_LOCAL** | Unicidad concurrente, coincidencia de identidad y revisión sin fusión |

### TECH-001 — criterio por criterio

| Criterio (doc 18) | Estado | Evidencia o destino |
| --- | --- | --- |
| Inventario, stack y estructura (ADR-0001), rules mapeadas | Cumplido | ADR-0001, `.claude/rules` |
| Comandos reproducibles | Cumplido | docs/20, `npm run validate` |
| Validación automatizada («CI») | **Cumplido en local**: `npm run validate` sustituye a Actions en esta etapa | docs/20 |
| Migraciones versionadas | Cumplido (0001–0007) | `apps/api/src/db/migrations` |
| OpenAPI ejecutable **validada** | Cumplido: generada y validada en cada `validate` | `npm run openapi -w apps/api` |
| ERD/diccionario contrastados | Cumplido para lo implementado | doc 06 «Esquema implementado» |
| Matriz RBAC real | Cumplido | doc 07 |
| Envolvente de eventos + outbox | Cumplido | doc 08 «Implementación vigente», `events.int-spec.ts` |
| Contenedores (API, web, worker) | Cumplido | docs/20 |
| Catálogos CTE/KDE | **Trasladado** a P0-013 (CTE) y P0-014 (KDE): son funcionalidad de dominio | backlog |
| Framework de reglas / riesgo | **Trasladado** a P0-020 (risk engine) | backlog |
| Ledger de inventario | **Trasladado** a P0-016/P0-017 (ADR-0003) | backlog |
| Reproceso manual de entregas DEAD | Pendiente técnico menor; se hará con el primer consumidor crítico (P0-015/P0-028) | doc 08 |

### P0-003 — criterios

Verificados: catálogo efectivo, permisos por acción y recurso, organización y membresía activas, referencias del mismo tenant, anti-escalamiento, efecto inmediato de revocaciones, ausencia de datos de otra organización, varios roles y organizaciones (`rbac.int-spec.ts`, `members.int-spec.ts`, E2E). **Bloqueados**: concesiones a BUYER/AUDITOR externos (falta contrato de grants) y elevación de SUPER_ADMIN (falta D-04; decisión mínima en docs/22). Jobs y objetos se verificarán cuando existan esos recursos.

### P0-004 — protección de identidad (revisión)

Doc 06 exige «identidad **cifrada**/restringida». Antes solo estaba restringida (brecha registrada). Ahora:
- Documento, teléfono y dirección se guardan con AES-256-GCM por campo. El AAD liga cada valor a su organización, registro y campo; las claves son versionadas, viven solo en `.env` (`PII_*`) y nunca en el repositorio.
- El número de documento tiene un índice ciego (HMAC con clave aparte) para la búsqueda exacta.
- No queda texto plano en la tabla ni en el historial (`producer_versions` cifra por versión).
- La migración 0006 cifra los datos existentes y se detiene sin cambios si faltan claves.
- Se mantiene la restricción por permiso (`producer:read_identity`): cifrado **y** permisos, no uno en lugar del otro.
- Pruebas: `pii.spec.ts`, `producer-identity-encryption.int-spec.ts` (sin texto plano en tablas, eventos ni auditoría; texto cifrado trasladado entre registros rechazado; migración con y sin claves).
- Pendiente operativo: custodia y respaldo de claves fuera del equipo y rotación con re-cifrado (antes de producción).

### P0-005 — criterios

| Criterio | Resultado | Evidencia (`producer-matching.int-spec.ts`) |
| --- | --- | --- |
| Código único por organización bajo concurrencia | 8 altas simultáneas → 1 × 201 y 7 × 409 `PRODUCER_CODE_TAKEN` | «unicidad del código bajo concurrencia» |
| Mismo código en otra organización | Permitido | «normalización del código…» |
| Normalización según contrato | Recorte de espacios; mayúsculas no unificadas (D-21, no bloquea) | ídem |
| Coincidencia de identidad | Mismo tipo y número normalizados → caso PENDING, sin cambios en productores | «coincidencia de identidad…»; mutante de la comparación de tipo detectado |
| Falsos positivos | Otro tipo, otro documento con el mismo nombre, otra organización → sin caso | «falsos positivos…» |
| Revisión asistida sin fusión | Resolver solo cambia el caso; productores intactos; par resuelto no se reabre; auditado | «resolver no fusiona…» |
| Permisos y aislamiento | `producer:review_duplicates` (ORG_ADMIN, MANAGER); técnico y auditor 403; otra org 404; quien registra solo ve el conteo | «permisos y aislamiento…» |
| UI en español | Aviso al registrar; página de revisión con identidad según permiso | E2E «posible duplicado…» |
| Fuera de alcance | Fusión de registros (sin contrato) y reglas no documentadas (D-22) | docs/22 |

## Brechas reales

- P0-003: grants y elevación (decisiones/contratos ausentes).
- Custodia de claves PII fuera del equipo y procedimiento de rotación con re-cifrado.
- Invitaciones: entrega por canal verificado y verificación de correo (D-19) antes de operación real.
- Fallo intermitente E2E del 2026-10-10 (reload sin respuesta): causa no determinada, evidencia perdida; `validate` conserva trazas desde ahora.
- Android/offline, integraciones, despliegue: no iniciados.

## Próxima acción: P0-006 Parcela

Dependencias: P0-004 (DONE_LOCAL). Leer docs/10 (GIS), 05/06 (`plots`, `plot_versions`, `gps_samples`) y 18 §P0-006–P0-010. Alcance de P0-006: parcela vinculada a un productor de la misma organización, con código único por tenant, versión geométrica (PostGIS, SRID 4326), permisos `plot:*` y eventos. La validación GIS y el umbral de 4 ha son P0-010 y dependen de D-05.
