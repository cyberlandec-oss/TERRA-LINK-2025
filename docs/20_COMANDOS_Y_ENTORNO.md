# Comandos y entorno comprobables

Actualizado: 2026-10-10. Repositorio `cyberlandec-oss/TERRA-LINK-2025`, rama `main`, en `C:\Users\mario\TERRA LINK 2025`.

> Corrección: la versión anterior de este documento registraba comandos de otro proyecto (`cyberlandec-oss/cacao`, `refactor/...`). Eran ajenos a Terra Link 2025 y se eliminaron.

## Requisitos del equipo

Comprobados en Windows 11: git 2.53, Node 24.12 (mínimo 22.9 por `--env-file-if-exists`) / npm 11.6, Docker Desktop 29.8 (contexto `desktop-linux`, `npipe:////./pipe/dockerDesktopLinuxEngine`).

Nota del equipo: hay un **PostgreSQL nativo de Windows escuchando en `0.0.0.0:5432`**, así que el PostgreSQL de Docker se publica en **5440**. No se tocó el servicio nativo.

## Preparación (una vez)

```bash
cp .env.example .env      # luego cambia las contraseñas locales y define SEED_ADMIN_PASSWORD (≥12)
npm install               # desde la raíz; instala apps/api y apps/web
```

No imprimir ni versionar `.env` (está en `.gitignore`).

## Comandos verificados (raíz del repo salvo indicación)

| Acción | Comando | Precondición / efecto | Resultado 2026-10-09 |
| --- | --- | --- | --- |
| Servicios locales | `npm run infra:up` (`docker compose up -d --wait`) | Levanta `postgres` (PostGIS 16-3.4, host:5440, crea `terra_link` y `terra_link_test`), `redis` (6379) y `object-storage` (VersityGW, 9000). Volúmenes `postgres-data` y `object-data` | 3 servicios healthy |
| Detener servicios | `npm run infra:down` | No borra volúmenes | — |
| Migrar dev | `npm run db:migrate` | Compila la API y aplica migraciones a `DATABASE_URL` | `0001`–`0003_organization_types` aplicadas |
| Seed dev | `npm run seed:dev -w apps/api` | Crea el SUPER_ADMIN desde `SEED_ADMIN_*`; idempotente | Creado |
| API: typecheck | `npm run typecheck -w apps/api` | — | 0 errores |
| API: lint | `npm run lint -w apps/api` | — | 0 problemas |
| API: pruebas | `npm test -w apps/api` | Requiere `infra:up`, `TEST_DATABASE_URL` (debe terminar en `_test`; **recrea el esquema `public` de esa base**) y `REDIS_URL` (prefijo de claves único por corrida). Sin ellas, la integración queda *skipped* | 6 suites, **51/51** (11 unitarias + 40 integración PostgreSQL/Redis reales) |
| API: arrancar | `npm run dev:api` (compila + `node dist/main.js`, puerto 4000) | Swagger en `/api/docs` | live/ready 200; login OK |
| OpenAPI | `npm run openapi -w apps/api` → `apps/api/openapi.json` | Generado desde los controladores | OpenAPI 3.0.0, 23 rutas |
| Web: typecheck / lint / test | `npm run typecheck -w apps/web`, `npm run lint -w apps/web`, `npm test -w apps/web` | — | OK; vitest 3/3 |
| Web: build | `npm run build -w apps/web` | — | 5 rutas compiladas |
| Todo (raíz) | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | API + web | OK |
| Navegadores E2E (una vez) | `npm run install-browsers -w e2e` | Descarga Chromium (~120 MB) | OK |
| E2E en navegador | `npm run build -w apps/api && npm run test:e2e` | Crea o recrea `terra_link_e2e`, migra, siembra un SUPER_ADMIN con contraseña aleatoria, levanta API :4100 y web :3100 (compila la web con esa URL) | **8/8** en Chromium (~26 s + build) |
| Web: arrancar | `npm run dev:web` (dev) o `npm run start -w apps/web` (tras build), puerto 3000 | API en `NEXT_PUBLIC_API_URL` | Páginas 200; CORS solo `WEB_ORIGIN` |

## Contenedores de la aplicación (opcional)

| Acción | Comando | Efecto | Resultado 2026-10-10 |
| --- | --- | --- | --- |
| Construir y arrancar | `docker compose --profile app up -d --build --wait` | Imágenes `terra-link-api:local` (431 MB) y `terra-link-web:local` (412 MB), multietapa sobre `node:24-bookworm-slim`, `npm ci` desde el lockfile, usuario `node`, `HEALTHCHECK`. Orden: `migrate` (una vez, sobre `terra_link`) → `api` (:4000) → `web` (:3000, compilada con `NEXT_PUBLIC_API_URL`). Reutiliza los volúmenes y el PostgreSQL en 5440 | migrate aplicó solo `0003` (datos previos conservados); api y web healthy; ready 200; web 200; login OK; sin secretos en `docker history` |
| Detener solo la app | `docker compose --profile app rm -sf api web migrate` | Conserva infraestructura y volúmenes | — |

Las variables (`JWT_SECRET`, credenciales de PostgreSQL) se leen de `.env` al ejecutar; `.dockerignore` excluye `.env*` y nunca se copian a las imágenes. Puertos configurables con `API_HOST_PORT` y `WEB_HOST_PORT`. No arrancar a la vez que `dev:api`/`dev:web` en los mismos puertos.

## CI (GitHub Actions)

Workflow `.github/workflows/ci.yml`. Se dispara en push y PR hacia `main` y con `workflow_dispatch`. Pasos: `npm ci` → typecheck → lint → build → `db:migrate` sobre `terra_link_ci` → `npm test` (integración contra `terra_link_test`) → Playwright Chromium (`terra_link_e2e`). Servicios: `postgis/postgis:16-3.4` y `redis:7.4-alpine`, igual que en local. Sin secretos: contraseña efímera del contenedor y `JWT_SECRET` generado por corrida.

| Fecha | Commit | Run | Resultado |
| --- | --- | --- | --- |
| 2026-10-10 03:09 UTC | `f2d395d` (PR #1) | [38019557517](https://github.com/cyberlandec-oss/TERRA-LINK-2025/actions/runs/38019557517) | **SIN VEREDICTO**: GitHub no inició el job (0 pasos). Anotación: «The job was not started because recent account payments have failed or your spending limit needs to be increased.» Se resuelve en *Billing & plans* de `cyberlandec-oss` |

Evidencia complementaria, que **no sustituye al CI**: los mismos pasos se ejecutaron en Linux, en un contenedor `mcr.microsoft.com/playwright:v1.64.0-noble` (Node 24.21) a partir de `git archive` de `f2d395d`, contra los servicios del compose. Resultados: `npm ci`, typecheck, lint, build y migraciones desde cero OK; API 40/40; E2E 7/7. La línea de Vitest web no quedó capturada en ese registro.

## Pendiente (no ejecutado / no existe aún)

Veredicto de CI (bloqueado por facturación), Dockerfiles de API/web, móvil/Android, backup/restauración (QA-16) y despliegue. Ningún comando de producción está definido.

## Ejecución segura

`infra:down -v` borra datos locales: no usarlo para «arreglar» un arranque. Las migraciones solo corren contra la base de dev o de test locales.
