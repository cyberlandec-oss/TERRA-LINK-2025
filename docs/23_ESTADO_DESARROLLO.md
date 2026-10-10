# Estado compartido de desarrollo

Última actualización: 2026-10-09. Repositorio `cyberlandec-oss/TERRA-LINK-2025`, rama `main`.

> **Resultados ajenos a este proyecto (no usar):** la primera auditoría del 2026-10-09 inspeccionó por error `cyberlandec-oss/cacao` (commit `96d748e`, estructura `refactor/`, 71 migraciones Alembic, resultados 221/771 de pruebas, CI bloqueado por facturación, tareas Y-DEV-01 y RREV-07). Nada de eso pertenece a Terra Link 2025 ni orienta su desarrollo.

## Línea base

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| Repo | Inicializado en esta carpeta; remoto vacío al empezar | `git init -b main`, `gh repo view` → `isEmpty: true` |
| Stack | ADOPTADO (ADR-0001): NestJS 11 + Kysely + PostgreSQL/PostGIS, Next.js 16, Redis, S3 (VersityGW local) | Manifiestos y lockfile |
| Servicios locales | VERIFICADO: `docker compose` con 3 servicios healthy | docs/20 |
| Migraciones | `0001_identity_organizations` | `apps/api/src/db/migrations` |
| API/web | IMPLEMENTADO y VERIFICADO en local (typecheck, lint, pruebas, build, arranque) | docs/20 |
| CI | NO EXISTE todavía | — |
| Android/offline | NO INICIADO | — |
| Satélite/GUIA/EUDR-IS | NO INICIADO | — |
| Conformidad EUDR | NO ACREDITADA | — |
| Producción | NO ACREDITADA | — |

## Historias

| ID | Estado | Evidencia | Pendiente |
| --- | --- | --- | --- |
| TECH-001 | **EN PROGRESO**: hecho: stack (ADR-0001), skeleton, compose, migraciones, OpenAPI generado, comandos y rules | docs/20 | CI, Dockerfiles API/web, ERD/diccionario contrastados con el esquema real por historia, catálogos CTE/KDE, envolvente de eventos/outbox, framework de reglas |
| P0-001 Organización | **IMPLEMENTADO + VERIFICADO local**; falta CI para cerrar | `apps/api/src/organizations`, `test/organizations.int-spec.ts` (12 casos, PostgreSQL real), web `/organizaciones` | E2E de navegador no ejecutado; catálogo `organization_type` (D-18); rate limit de login |

### P0-001 — criterios de aceptación

| Criterio | Resultado | Prueba |
| --- | --- | --- |
| Crear con datos mínimos | OK: SUPER_ADMIN crea; 400 validación; 422 admin inexistente sin efectos | int-spec «SUPER_ADMIN crea…», «valida datos mínimos…» |
| Selección por membresía | OK: lista solo membresías activas; `scope=all` solo SUPER_ADMIN (403 al resto) | «cada usuario solo ve…» |
| Suspensión impide nueva operación sin borrar historia | OK: escritura → 403 `ORGANIZATION_SUSPENDED`; lectura 200; motivo obligatorio; reactivación restaura; auditado | «suspensión exige motivo…» |
| Usuario A no accede a B | OK: GET/PATCH A→B → 404 sin modificar B; A→A 200; miembro sin permiso → 403 | «A→A permitido…», «miembro sin permiso…» |
| Integridad por tenant en BD | OK: FK compuesta rechaza rol con membresía de otra org | «la base rechaza…» |
| Auditoría | OK: misma transacción; append-only por trigger | «bitácora append-only» |
| Detector de fallos | Mutante (quitar filtro de tenant) → 1 prueba falla | ejecutado 2026-10-09 |

## Próxima acción

1. **P0-002 Usuarios** (depende de P0-001, cumplida en local): invitación, alta de membresía, desactivación/reactivación auditadas y sin acceso heredado tras baja. Requiere decidir el mecanismo de invitación (ADR-0005; sin servicio de correo: enlace de un solo uso).
2. En paralelo, TECH-001: workflow de CI (lint, typecheck, unit + integración con servicio PostGIS) para poder cerrar historias.
