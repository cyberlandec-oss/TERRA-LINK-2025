# Estado compartido de desarrollo

Última actualización: 2026-10-10. Repositorio `cyberlandec-oss/TERRA-LINK-2025`. `main` en `03bb2f6`; el trabajo está en la rama `feat/tech-001-ci-p0-002` ([PR #1](https://github.com/cyberlandec-oss/TERRA-LINK-2025/pull/1), **sin fusionar**: falta CI).

> **Resultados ajenos a este proyecto (no usar):** la primera auditoría del 2026-10-09 inspeccionó por error `cyberlandec-oss/cacao`. Nada de aquel repositorio (commit `96d748e`, `refactor/`, 71 migraciones, Y-DEV-01, RREV-07) pertenece a Terra Link 2025.

## Estados usados

**Implementado** (código en la rama) · **Verificado local** (pruebas ejecutadas aquí, con comando en docs/20) · **Pendiente de CI** (sin veredicto de GitHub Actions sobre el commit exacto) · **Pendiente de decisión** (supuesto provisional) · **DONE** (todo lo anterior, más CI verde y criterios cumplidos). Hoy **ninguna historia está DONE**.

## Línea base

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| Stack | Adoptado para desarrollo (ADR-0001); ratificación pendiente | Manifiestos y lockfile |
| Servicios locales | Verificado local (PostGIS 16-3.4 :5440, Redis 7.4, VersityGW) | docs/20 |
| Migraciones | `0001`, `0002_invitations_sessions`, `0003_organization_types` | `apps/api/src/db/migrations` |
| Pruebas locales | API 51/51 (40 integración real), web 3/3, E2E Chromium 8/8 | docs/20 |
| Imágenes Docker | Verificado local: build, migración, arranque healthy, usuario `node` | docs/20 |
| CI | Pendiente: GitHub no inicia jobs por facturación de la cuenta (runs 38019557517, 38020557147) | docs/20 |
| Android/offline, integraciones, satélite | No iniciado | — |
| Conformidad EUDR / preparación productiva | No acreditadas | — |

## Historias

| ID | Implementado | Verificado local | Pendiente de CI | Pendiente de decisión | DONE |
| --- | :-: | :-: | :-: | --- | :-: |
| TECH-001 | Parcial | Parcial | Sí | ADR-0001 sin ratificar | No |
| P0-001 Organización | Sí | Sí (integración + E2E) | Sí | D-18 (catálogo provisional) | No |
| P0-002 Usuarios | Sí | Sí (integración + E2E) | Sí | D-19 (invitación, verificación de correo, autenticación) | No |
| P0-003 RBAC y aislamiento | Sí, partes independientes de D-04 | Sí (integración + E2E) | Sí | D-04 (elevación de plataforma); concesiones entre organizaciones fuera de alcance (sin contrato) | No |

### TECH-001 — elementos

| Elemento | Estado |
| --- | --- |
| Stack y estructura (ADR-0001) | Hecho; ratificación pendiente |
| Skeleton monorepo, compose, `.env.example` | Verificado local |
| Migraciones versionadas | Verificado local (0001–0003) |
| OpenAPI generado desde controladores | Verificado local (23 rutas). Sin validación de contrato automatizada |
| Comandos documentados (docs/20) y rules | Hecho |
| Workflow CI | Implementado; **pendiente de CI** (facturación) |
| E2E en navegador | Verificado local (8/8) y en réplica Linux (7/7, commit anterior) |
| Dockerfiles API/web | **Verificado local** (build, arranque, health, sin secretos) |
| ERD y diccionario contrastados con el esquema real | Pendiente (se actualiza por historia; hoy cubre identidad/organización) |
| Catálogos CTE/KDE | Pendiente (doc 08; sin código) |
| Envolvente de eventos y outbox transaccional | Pendiente (ADR-0003; la auditoría existe, no hay outbox ni eventos de dominio) |
| Framework de reglas versionadas | Pendiente (doc 13) |

### P0-003 — criterios

| Criterio (doc 18 / pedido) | Resultado | Evidencia |
| --- | --- | --- |
| Catálogo efectivo | `GET /me/permissions` por organización; `GET /rbac/roles` | rbac «catálogo efectivo…», «matriz pública…» |
| Roles de fuentes frente a catálogo | 12 = 12; sin discrepancia de códigos; permisos solo de recursos existentes | docs/07 «Matriz implementada» |
| Permisos por acción y recurso | Matriz en docs/07; 404 sin membresía, 403 sin permiso | rbac, organizations, members |
| Organización y membresía activas | Suspensión bloquea escrituras; membresía inactiva → 404 | organizations, members, rbac «revocar…» |
| Referencias del mismo tenant | Campos de tenant en el cuerpo → 400; membresía ajena por la ruta propia → 404; FK compuesta en BD | rbac «anti-escalamiento…», organizations «la base rechaza…» |
| Anti-escalamiento (invitaciones y cambios de rol) | Roles ⊆ permisos del actor; sin auto-cambio; SUPER_ADMIN no asignable | rbac, members, unitarias |
| Efecto inmediato de revocaciones | Mismo token: cambio de rol, baja de membresía y baja de cuenta | rbac «cambio de roles…», members |
| Sin datos ni metadatos de otra org | Listados, errores y bitácora | rbac «listados y errores…», «bitácora…» |
| Varios roles y organizaciones | MANAGER en A + ORG_ADMIN en B: un rol no concede en otra org | rbac «un rol en una organización…» |
| SUPER_ADMIN / elevación | Sin bypass; solo incorporación de ORG_ADMIN; resto `ELEVATION_REQUIRED` | rbac «SUPER_ADMIN sin membresía…»; mutante detectado |
| Buyer / concesiones | **No implementado**: sin contrato (ADR-0002 propuesto, P1-001) | docs/22 |
| Jobs y objetos | **No aplica aún**: no existen jobs ni objetos almacenados | — |
| UI no sustituye backend; acciones por permiso | Acciones según permisos efectivos; E2E de cambio de rol | E2E «cambiar roles…» |

## Próxima acción

1. Cuando GitHub permita ejecutar: lanzar el CI sobre el **último SHA** del PR #1 y registrar enlace, SHA y resultado en docs/20. No usar corridas anteriores.
2. **Siguiente historia: P0-004 Productor.** Depende de TECH-001; sus dependencias funcionales (organización, membresía, RBAC) están verificadas en local. Añade la familia de permisos `producer:*` a la matriz.
3. En paralelo, TECH-001: envolvente de eventos/outbox (ADR-0003), necesaria antes de P0-012/P0-015.
