# Estado compartido de desarrollo

Última actualización: 2026-10-10. Repositorio `cyberlandec-oss/TERRA-LINK-2025`. `main` en `03bb2f6`; el trabajo de esta sesión está en la rama `feat/tech-001-ci-p0-002` ([PR #1](https://github.com/cyberlandec-oss/TERRA-LINK-2025/pull/1)).

> **Resultados ajenos a este proyecto (no usar):** la primera auditoría del 2026-10-09 inspeccionó por error `cyberlandec-oss/cacao` (commit `96d748e`, estructura `refactor/`, 71 migraciones Alembic, pruebas 221/771, CI bloqueado, tareas Y-DEV-01 y RREV-07). Nada de eso pertenece a Terra Link 2025.

## Línea base

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| Stack | ADOPTADO PARA DESARROLLO (ADR-0001); ratificación pendiente | Manifiestos y lockfile |
| Servicios locales | VERIFICADO (PostGIS 16-3.4 :5440, Redis 7.4, VersityGW) | docs/20 |
| Migraciones | `0001_identity_organizations`, `0002_invitations_sessions` | `apps/api/src/db/migrations` |
| Pruebas locales | API 40/40 (29 integración real), web 3/3, E2E Chromium 7/7 | docs/20 |
| CI | Workflow creado; **SIN VEREDICTO**: GitHub no inicia jobs por facturación de la cuenta | run 38019557517 |
| Android/offline | NO INICIADO | — |
| Integraciones/satélite/EUDR-IS | NO INICIADO | — |
| Conformidad EUDR | NO ACREDITADA | — |
| Preparación productiva | NO ACREDITADA | — |

## Historias

| ID | Estado | Pendiente para cerrar |
| --- | --- | --- |
| TECH-001 | **EN PROGRESO**. Hecho: stack, skeleton, compose, migraciones, OpenAPI generado (18 rutas), comandos, rules, workflow CI, E2E | Veredicto de CI verde; Dockerfiles API/web; ERD/diccionario contrastados por historia; catálogos CTE/KDE; envolvente de eventos/outbox; framework de reglas |
| P0-001 Organización | **IMPLEMENTADO + VERIFICADO local** (integración y E2E en navegador) | CI verde; D-18 (catálogo de tipos) ratificado |
| P0-002 Usuarios | **IMPLEMENTADO + VERIFICADO local** (integración y E2E en navegador) | CI verde; D-19 (invitación definitiva y verificación de correo). El enlace es un mecanismo provisional de desarrollo |

### P0-001 — criterios

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Crear con datos mínimos / validación | OK | int-spec organizaciones; E2E «SUPER_ADMIN crea…» |
| Selección por membresía | OK | int-spec; E2E «el administrador acepta, selecciona…» (no ve la org ajena) |
| Suspensión bloquea sin borrar historia; reactivación | OK | int-spec; E2E «suspensión bloquea cambios…» |
| A no accede a B (404) y miembro sin permiso (403) | OK | int-spec; E2E «miembro sin permiso… no accede a otra» |
| Límite de intentos de login | OK: bloqueo temporal, recuperación, no enumeración, por origen, compartido entre instancias | `auth-rate-limit.int-spec.ts` (Redis real), `login-rate-limit.spec.ts` |
| Catálogo `organization_type` | PENDIENTE: propuesta D-18 no ratificada | docs/22 |

### P0-002 — criterios

| Requisito | Resultado | Prueba (`members.int-spec.ts` salvo indicación) |
| --- | --- | --- |
| Invitación ligada a org, destinatario y rol permitido | OK | «crea una invitación ligada…» |
| Token criptográfico; solo hash almacenado; nunca en auditoría ni listados | OK | mismo caso (verifica SHA-256 y ausencia del token) |
| Caducidad, revocación, reutilización | OK: 410 `INVITATION_EXPIRED/REVOKED/USED` | tres casos |
| Consumo atómico y concurrencia | OK: 6 aceptaciones simultáneas → 1 éxito, 1 usuario, 1 membresía | «aceptaciones concurrentes»; mutante sin bloqueo detectado |
| Cliente no altera org/destinatario/rol | OK: 400 y la invitación sigue pendiente | «el cliente no puede cambiar…» |
| Anti-escalamiento | OK: sin `membership:assign` → 403; SUPER_ADMIN no asignable; solo roles ⊆ permisos del actor | «escalamiento…», unitarias del catálogo |
| Cuenta existente exige sesión del destinatario | OK: 401 sin sesión; 403 con otra cuenta | «cuenta existente…» |
| No verificar correo al aceptar | OK: `email_verified_at` nulo | «aceptación válida…» |
| Desactivación corta acceso y sesiones; reactivación auditada | OK: membresía → 404 inmediato; cuenta → `token_version` invalida tokens, incluso tras reactivar | dos casos; mutante de `token_version` detectado; E2E «desactivar a un miembro…» |
| Acceso entre organizaciones | OK: 404 en invitar, listar y revocar en org ajena | «acceso entre organizaciones…» |
| Org suspendida no invita ni acepta | OK | último caso |
| Copia del enlace con advertencia, solo para quien invita | OK: se muestra una vez, con aviso de secreto; token en `#fragmento` y retirado de la URL al abrirlo | E2E |
| UI en español con errores recuperables | OK | E2E + `recoveryHint` (vitest) |

## Próxima acción

1. **Desbloquear CI:** el responsable de la cuenta `cyberlandec-oss` regulariza *Billing & plans*; después, `gh workflow run ci.yml --ref feat/tech-001-ci-p0-002` o volver a ejecutar el PR #1, y fusionar si el veredicto es verde.
2. **Siguiente historia: P0-003 RBAC y aislamiento.** Sus dependencias P0-001 y P0-002 están verificadas en local (no en CI). Alcance: catálogo efectivo `GET /me/permissions`, checks de FK/jobs/objetos, casos buyer/grants y elevación de SUPER_ADMIN (D-04 pendiente para la parte de elevación).
