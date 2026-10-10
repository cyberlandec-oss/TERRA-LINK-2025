# Comandos y entorno comprobables

Actualizado: 2026-10-09. Repositorio `cyberlandec-oss/TERRA-LINK-2025`, rama `main`, en `C:\Users\mario\TERRA LINK 2025`.

> Corrección: la versión anterior de este documento registraba comandos de otro proyecto (`cyberlandec-oss/cacao`, `refactor/...`). Eran ajenos a Terra Link 2025 y se eliminaron.

## Requisitos del equipo

Comprobados en Windows 11: git 2.53, Node 24.12 / npm 11.6, Docker Desktop 29.8 (contexto `desktop-linux`, `npipe:////./pipe/dockerDesktopLinuxEngine`).

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
| Migrar dev | `npm run db:migrate` | Compila la API y aplica migraciones a `DATABASE_URL` | `0001_identity_organizations` aplicada |
| Seed dev | `npm run seed:dev -w apps/api` | Crea el SUPER_ADMIN desde `SEED_ADMIN_*`; idempotente | Creado |
| API: typecheck | `npm run typecheck -w apps/api` | — | 0 errores |
| API: lint | `npm run lint -w apps/api` | — | 0 problemas |
| API: pruebas | `npm test -w apps/api` | Requiere `infra:up`; la integración usa `TEST_DATABASE_URL` (debe terminar en `_test`; **recrea el esquema `public` de esa base**) | 2 suites, **16/16** (4 unitarias + 12 integración PostgreSQL real), ~12 s |
| API: arrancar | `npm run dev:api` (compila + `node dist/main.js`, puerto 4000) | Swagger en `/api/docs` | live/ready 200; login OK |
| OpenAPI | `npm run openapi -w apps/api` → `apps/api/openapi.json` | Generado desde los controladores | OpenAPI 3.0.0, 8 rutas |
| Web: typecheck / lint / test | `npm run typecheck -w apps/web`, `npm run lint -w apps/web`, `npm test -w apps/web` | — | OK; vitest 2/2 |
| Web: build | `npm run build -w apps/web` | — | 4 rutas compiladas |
| Web: arrancar | `npm run dev:web` (dev) o `npm run start -w apps/web` (tras build), puerto 3000 | API en `NEXT_PUBLIC_API_URL` | Páginas 200; CORS solo `WEB_ORIGIN` |

## Pendiente (no ejecutado / no existe aún)

CI en GitHub Actions, Dockerfiles de API/web, E2E de navegador, móvil/Android, backup/restauración (QA-16) y despliegue. Ningún comando de producción está definido.

## Ejecución segura

`infra:down -v` borra datos locales: no usarlo para «arreglar» un arranque. Las migraciones solo corren contra la base de dev o de test locales.
