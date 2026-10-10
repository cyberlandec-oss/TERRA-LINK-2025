# ADR-0001 — Stack y repositorio

Estado: **ADOPTADO PARA DESARROLLO** (2026-10-09; el usuario delegó la decisión: «resuelve y documenta el stack usando las fuentes de este proyecto»). Falta la ratificación del responsable técnico.

## Corrección de la versión anterior

La primera auditoría del 2026-10-09 inspeccionó por error otro proyecto (`cyberlandec-oss/cacao`: commit `96d748e`, estructura `refactor/`, FastAPI/React/Expo, 71 migraciones, CI bloqueado, tareas Y-DEV-01/RREV-07). **Todo eso es ajeno a Terra Link 2025** y no se usa como antecedente ni evidencia. Esta versión reemplaza la anterior.

## Contexto

- Repositorio: `https://github.com/cyberlandec-oss/TERRA-LINK-2025.git` (privado). Estaba vacío el 2026-10-09 (`gh repo view` → `isEmpty: true`).
- Carpeta local: solo el paquete documental. No había código ni `.git`.
- La fuente S1 (docs/04) propone un monolito modular: NestJS (TypeScript), Next.js, React Native/Expo + SQLite, PostgreSQL/PostGIS, BullMQ/Redis, S3 compatible y MapLibre. El antecedente FastAPI/React no tiene código en este repositorio, así que no aplica.

## Decisión

| Componente | Elección | Versión fijada (lockfile) | Motivo |
| --- | --- | --- | --- |
| Repositorio | Monorepo npm workspaces (`apps/api`, `apps/web`; `apps/mobile` en su historia) | npm 11, Node ≥22 (probado con 24.12) | Contratos y tipos compartidos; un CI |
| API | NestJS 11 + Express | 11.x | S1. NestJS 12 se publica solo como ESM y es incompatible con el arnés CJS/ts-jest; actualizar es decisión aparte |
| Acceso a datos | Kysely 0.28 + `pg` (SQL explícito, migraciones TS versionadas) | 0.28.x | PostGIS y FKs compuestas por tenant requieren SQL explícito; los ORM con tipos espaciales «Unsupported» lo dificultan. Kysely 0.29 es solo ESM |
| Base | PostgreSQL 16 + PostGIS 3.4 (`postgis/postgis:16-3.4`) | — | S1 |
| Web | Next.js 16 (App Router) + React 19 | 16.4 / 19.3 | S1 |
| Móvil | React Native/Expo + SQLite | se fija en P0-023 | S1; no se crea hasta su historia |
| Cola | Redis 7.4 (servicio levantado); BullMQ cuando exista el primer job | — | S1 |
| Objetos | S3 compatible; local VersityGW `v1.8.0` | — | MinIO ya no publica imagen en Docker Hub (pull denegado el 2026-10-09) |
| Auth | Local email/contraseña argon2id + JWT HS256 de corta vida | — | ADR-0005 (OIDC pendiente) |
| Pruebas | Jest 30 + ts-jest (API, integración con PostgreSQL real); Vitest (web) | — | |
| TypeScript | 5.9.3 | — | TS 7 no es compatible con ts-jest 29 |

Estructura: módulos por dominio en `apps/api/src/<módulo>` (dominio, caso de uso, persistencia y API). Las migraciones viven en `apps/api/src/db/migrations` y se registran explícitamente en `database.ts`.

## Alternativas

FastAPI/React: sin código ni equipo verificado aquí; rompe la fuente S1 sin beneficio comprobado. Prisma/TypeORM: peor soporte de PostGIS y de FKs compuestas. Migrar a NestJS 12/Kysely 0.29 en ESM: viable más adelante con un arnés ESM (Vitest + SWC); hoy no aporta valor.

## Consecuencias

Las reglas `.claude/rules/` apuntan a `apps/api/**`, `apps/web/**` y `apps/mobile/**`. Los comandos verificados están en docs/20. Los Dockerfiles y el CI siguen pendientes (TECH-001 restante).
