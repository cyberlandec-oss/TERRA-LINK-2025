# Comandos y entorno comprobables

Actualizado: 2026-10-12. Repositorio `cyberlandec-oss/TERRA-LINK-2025` (https://github.com/cyberlandec-oss/TERRA-LINK-2025.git), rama de trabajo `feat/tech-001-ci-p0-002`, en `D:\PROYECTOS CYBER LAND\TERRA LINK EUDR 2026\TERRA LINK 2025` (trasladado desde `C:\Users\mario\TERRA LINK 2025`, que ya no existe).

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
| Servicios locales | `npm run infra:up` (`docker compose up -d --wait`) | Levanta `postgres` (PostGIS 16-3.4, host:5440, crea `terra_link` y `terra_link_test`), `redis` (6379) y `object-storage` (VersityGW, 9000). Volúmenes `postgres-data` y `object-data` | 3 servicios healthy. La API usa `object-storage` como almacenamiento privado (P0-009): `S3_ACCESS_KEY`/`S3_SECRET_KEY` obligatorias; buckets `terra-link-private` (desarrollo), `terra-link-test` (integración) y `terra-link-e2e` (E2E), creados por la API si faltan |
| Detener servicios | `npm run infra:down` | No borra volúmenes | — |
| Migrar dev | `npm run db:migrate` | Compila la API y aplica migraciones a `DATABASE_URL` | `0001`–`0007_producer_match_reviews` aplicadas (dev: productores y usuarios conservados) |
| Seed dev | `npm run seed:dev -w apps/api` | Crea el SUPER_ADMIN desde `SEED_ADMIN_*`; idempotente | Creado |
| API: typecheck | `npm run typecheck -w apps/api` | — | 0 errores |
| API: lint | `npm run lint -w apps/api` | — | 0 problemas |
| API: pruebas | `npm test -w apps/api` | Requiere `infra:up`, `TEST_DATABASE_URL` (debe terminar en `_test`; **recrea el esquema `public` de esa base**) y `REDIS_URL` (prefijo de claves único por corrida). Sin ellas, la integración queda *skipped* | 12 suites, **90/90** (16 unitarias + 74 integración PostgreSQL/Redis reales) |
| API: arrancar | `npm run dev:api` (compila + `node dist/main.js`, puerto 4000) | Swagger en `/api/docs`. `/health/ready` devuelve `checks` por dependencia (database, schema, redis) y 503 si alguna falla | live/ready 200; login OK |
| OpenAPI | `npm run openapi -w apps/api` → `apps/api/openapi.json` | Generado desde los controladores y validado con `@apidevtools/swagger-parser` (falla si hay referencias o esquemas inválidos) | OpenAPI 3.0.0, 32 rutas, válido |
| Web: typecheck / lint / test | `npm run typecheck -w apps/web`, `npm run lint -w apps/web`, `npm test -w apps/web` | — | OK; vitest 3/3 |
| Web: build | `npm run build -w apps/web` | — | 5 rutas compiladas |
| Worker del outbox | `npm run worker -w apps/api` | Procesa `event_deliveries`; variables `OUTBOX_POLL_MS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_LEASE_SECONDS` | Arranca y procesa (ver contenedores) |
| Todo (raíz) | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | API + web | OK |
| Navegadores E2E (una vez) | `npm run install-browsers -w e2e` | Descarga Chromium (~120 MB) | OK |
| E2E en navegador | `npm run build -w apps/api && npm run test:e2e` | Crea o recrea `terra_link_e2e`, migra, siembra un SUPER_ADMIN con contraseña aleatoria, levanta API :4100 y web :3100 (compila la web con esa URL) | **14/14** en Chromium (~38 s + build). Fallo intermitente previo (un `reload` sin respuesta en una corrida de 4,2 min): **causa no determinada**; su evidencia se perdió porque Playwright sobrescribe `test-results`. Ahora `validate` conserva trazas si vuelve a ocurrir |
| Web: arrancar | `npm run dev:web` (dev) o `npm run start -w apps/web` (tras build), puerto 3000 | API en `NEXT_PUBLIC_API_URL` | Páginas 200; CORS solo `WEB_ORIGIN` |

## Contenedores de la aplicación (opcional)

| Acción | Comando | Efecto | Resultado 2026-10-10 |
| --- | --- | --- | --- |
| Construir y arrancar | `docker compose --profile app up -d --build --wait` | Imágenes `terra-link-api:local` (431 MB) y `terra-link-web:local` (412 MB), multietapa sobre `node:24-bookworm-slim`, `npm ci` desde el lockfile, usuario `node`, `HEALTHCHECK`. Orden: `migrate` (una vez, sobre `terra_link`) → `api` (:4000) → `web` (:3000, compilada con `NEXT_PUBLIC_API_URL`). Reutiliza los volúmenes y el PostgreSQL en 5440 | migrate aplicó solo `0003` (datos previos conservados); api y web healthy; ready 200; web 200; login OK; sin secretos en `docker history` |
| Con dos workers | `docker compose --profile app up -d --build --wait --scale worker=2` | Añade el servicio `worker` (sin healthcheck HTTP, `restart: unless-stopped`) | 3 productores creados vía API → 6 entregas `DONE` (2 consumidores), proyección `ACTIVE: 3`, sin duplicados |
| Detener solo la app | `docker compose --profile app rm -sf api web migrate worker` | Conserva infraestructura y volúmenes | — |

Las variables (`JWT_SECRET`, credenciales de PostgreSQL) se leen de `.env` al ejecutar; `.dockerignore` excluye `.env*` y nunca se copian a las imágenes. Puertos configurables con `API_HOST_PORT` y `WEB_HOST_PORT`. No arrancar a la vez que `dev:api`/`dev:web` en los mismos puertos.

## Datos DEMO y revisión por rol (solo desarrollo local)

| Acción | Comando | Efecto | Resultado 2026-10-10 |
| --- | --- | --- | --- |
| Seed DEMO/QA | `npm run seed:demo -w apps/api` | Crea (si faltan) 4 organizaciones «DEMO ·», 17 cuentas (los 12 roles; un ORG_ADMIN por empresa; 1 SUPER_ADMIN de revisión; 1 usuario con roles en dos organizaciones) y 9 productores sintéticos con un caso de posible duplicado. Usa los flujos reales de la API (invitación, aceptación, cifrado, eventos, auditoría). Idempotente; conserva datos existentes; se niega a correr contra bases `*_test`/`*_e2e` | 17/17 logins verificados; segunda ejecución sin cambios |
| Credenciales locales | `CREDENCIALES.csv` (raíz) | UTF-8 con BOM, una fila por usuario + organización + rol. **Ignorado por git.** Contraseñas solo ahí (hash argon2id en la base); se reutilizan entre ejecuciones y nunca se resetean cuentas existentes | 18 filas |
| Aplicación para revisión | `docker compose --profile app up -d --build --wait` | Web :3000 y API :4000 sobre la base de desarrollo `terra_link` | api, web, worker activos |
| Revisión visual por rol | `node e2e/review/revision-por-rol.mjs http://localhost:3000` | Sesión aislada por fila del CSV; rutas, tarea real, denegación, datos ajenos, teclado y móvil; capturas en `docs/qa/capturas/`, resultados en `docs/qa/revision-resultados.json` | 21 entradas, 0 incidencias (informe `docs/qa/REVISION_VISUAL_POR_ROL.md`) |

## Validación local (criterio de esta etapa)

```bash
npm run validate                 # completa
npm run validate -- --skip-e2e   # sin navegador
npm run validate -- --docker     # añade build de imágenes
```

- **Requisitos:** Docker Desktop en marcha, `.env` completo (incluidas `TEST_DATABASE_URL` → `*_test` y las claves `PII_*`), `npm install` hecho y Chromium instalado (`npm run install-browsers -w e2e`).
- **Pasos** (se detiene en el primer fallo): servicios (`docker compose up -d --wait postgres redis object-storage`, sin borrar nada) → typecheck → lint → build → OpenAPI generado **y validado** → unitarias + integración (`terra_link_test`, esquema recreado) → E2E Chromium (`terra_link_e2e`).
- **Salvaguardas:** se niega a ejecutar si `TEST_DATABASE_URL` no termina en `_test` o coincide con la base de desarrollo (código 2). No toca `terra_link`, no borra volúmenes.
- **Resultados:** `validation-results/<fecha>/resumen.md`, `resumen.json` (commit, archivos sin commit, pasos, códigos, tiempos) y un `.log` por paso. Si falla E2E, se copian trazas y reporte de Playwright a esa carpeta. Código de salida: 0 aprobada, 1 fallida, 2 configuración insegura o incompleta.
- **Comprobado el 2026-10-10:** corrida aprobada (6 pasos); configuración insegura → código 2 sin ejecutar nada; Redis inaccesible → integración FALLA y código 1.

## GitHub Actions (inactivo; registro histórico)

El workflow se movió a `infra/ci/github-actions-ci.yml` y **no se ejecuta**: en esta etapa no es requisito y no hay que resolver facturación. Corridas anteriores, solo como historia (ninguna llegó a ejecutar pasos por la facturación de la cuenta):

| Fecha | Commit | Run | Resultado |
| --- | --- | --- | --- |
| 2026-10-10 03:09 UTC | `f2d395d` (PR #1) | [38019557517](https://github.com/cyberlandec-oss/TERRA-LINK-2025/actions/runs/38019557517) | **SIN VEREDICTO**: GitHub no inició el job (0 pasos). Anotación: «The job was not started because recent account payments have failed or your spending limit needs to be increased.» Se resuelve en *Billing & plans* de `cyberlandec-oss` |
| 2026-10-10 | `63b18c7` (PR #1, P0-003) | [38021874080](https://github.com/cyberlandec-oss/TERRA-LINK-2025/actions/runs/38021874080) | **SIN VEREDICTO**: misma anotación de facturación; 0 pasos |
| 2026-10-10 | `c8362ff` (PR #1, eventos + P0-004) | [38024418581](https://github.com/cyberlandec-oss/TERRA-LINK-2025/actions/runs/38024418581) | **SIN VEREDICTO**: misma anotación de facturación; 0 pasos |

## Pendiente (no ejecutado / no existe aún)

Móvil/Android, backup/restauración (QA-16) y despliegue. Ningún comando de producción está definido.

## Ejecución segura

`infra:down -v` borra datos locales: no usarlo para «arreglar» un arranque. Las migraciones solo corren contra la base de dev o de test locales.

### Credenciales de cuentas DEMO nuevas (2026-10-10)

`npm run seed:demo -w apps/api` crea una cuenta nueva solo si podrá guardar su contraseña: escribe el archivo completo en `CREDENCIALES.csv` o, si está abierto en otro programa, en `CREDENCIALES.pendiente.csv` (ambos ignorados por git). Volver a ejecutar el seed no regenera contraseñas existentes: las lee de esos archivos. Para recuperar la credencial de una cuenta nueva (p. ej. `eudr.cooperativa`, segunda persona del recorrido de mitigación), abrir localmente el archivo más reciente de los dos; nunca se imprime en consola, informes ni capturas. La revisión por rol usa el más reciente.

### Móvil (P0-023, `apps/mobile`, proyecto independiente de los workspaces)

Comandos ejecutados el 2026-10-10 en este equipo (Windows, Node 24): `npm ci`, `npm run typecheck`, `npm test`
(núcleo en Node con `node:sqlite`), `TL_API_SMOKE=1 npm test` (cliente en Node contra la API local), `npx expo export
--platform android --output-dir <tmp>` (bundle Hermes) y `npx expo-doctor` (21/21). No hay Android SDK, JDK ni adb: no se
ejecutó emulador, build nativo ni dispositivo. Ensayo en Android real con Expo Go: `apps/mobile/README.md`.

### Comprobaciones del móvil (2026-10-11)

`npm run check --prefix apps/mobile` (añadir `-- --api` con la app levantada y DEMO sembrado) ejecuta typecheck, pruebas
del núcleo (Node + SQLite real), recorrido opcional contra la API local, bundle Android y expo-doctor. Resultados en
`validation-results/<fecha>-movil/`. **Separado de `npm run validate`**; no cubre emulador, build nativo ni dispositivo.

Nota de entorno (2026-10-11): el servicio `api` de `docker-compose.yml` no recibía `SCANNER_HOST`, por lo que los
documentos subidos a la API en contenedor quedaban «análisis pendiente» (`SCANNER_UNAVAILABLE`). Se añadió
`SCANNER_HOST: scanner` **localmente**; el cambio de ese archivo raíz no está confirmado en git (pendiente de autorización).

### Entorno Android inspeccionado (2026-10-11)

- Herramientas: sin Android SDK, sin JDK, sin `adb`; Chocolatey presente; winget no disponible en la sesión; 23,7 GB de RAM;
  hipervisor presente (Docker/WSL2).
- **Bloqueo**: C: es el único disco y tenía **6,3 GB libres**. Requisitos oficiales (docs.expo.dev, build local Android):
  Microsoft OpenJDK 17 (`choco install -y microsoft-openjdk17`), Android SDK Platform 36, Build-Tools, Platform-Tools,
  Emulator, `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` y `platform-tools` en PATH; además NDK/CMake que Gradle descarga
  para módulos nativos (SQLCipher). Estimación: ≥ 15 GB libres recomendados. No se liberó espacio sin autorización.
- Pasos cuando haya espacio: ver `apps/mobile/README.md` § B.

### Evidencia del escáner en contenedor

`node e2e/review/escaner-contenedor.mjs disponible|caido|reintento` (el operador detiene y arranca el escáner con
`docker compose stop scanner` / `docker compose start scanner`; los volúmenes se conservan). Resultado acumulado en
`docs/qa/evidencia-escaner-contenedor.json`.

### Android local (2026-10-11)

Entorno en el perfil de usuario: `JAVA_HOME=%LOCALAPPDATA%\Programs\Microsoft\jdk-17.0.20.1+1`,
`ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` (definidas en las sesiones de trabajo; no persistidas). Comandos ejecutados:
`npx expo prebuild --platform android --no-install`; en `apps/mobile/android`:
`gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64`; emulador
`emulator -avd tl-api30 -no-window -no-snapshot -wipe-data -partition-size 1000`; `adb install -r app-release.apk`;
autoprueba `adb shell am start -a android.intent.action.VIEW -d "terralinkcampo://autoprueba" ec.agtech.terralink.campo`
y `adb logcat -s ReactNativeJS:V` (línea `TL_SELFTEST`). Evidencia: `docs/qa/EVIDENCIA_LIMPIEZA_Y_ANDROID_2026-10-11.md`.

### Recorrido en emulador y prueba negativa (2026-10-11)

- Recorrido: `node e2e/movil/proxy.mjs <log>` (proxy 4001 → 4000; control 4002), `adb reverse tcp:4000 tcp:4001`,
  `node e2e/movil/recorrido-emulador.mjs <paso>...` (preparar, login, descargar, capturar, foto, guardarOffline,
  cierreForzado, cortarTrasCommit, fotoAnalisis, conflicto, cambioCuenta, vencimiento, almacenamientoLleno, revocacion).
- Prueba negativa: `TL_VARIANT=negativa npx expo prebuild --platform android --no-install --clean` y
  `gradlew assembleRelease -PreactNativeArchitectures=x86_64` (identificador `ec.agtech.terralink.campo.pruebanegativa`).
- Orientación: `node e2e/review/orientacion-visual.mjs` (requiere `npm run build -w apps/api`).
- Bloqueo 2026-10-11: 2,73 GB libres en C:; reiniciar Windows y medir antes de compilar (guardia de 4 GB).

### Vista previa web de la app móvil (2026-10-11)

- `npm run web:preview --prefix apps/mobile` → `http://localhost:3001` (Metro en modo web; con `CI=1` no recarga en
  caliente: reiniciar tras cambios). Servidor SIMULADO en el navegador; no contacta la API; datos sintéticos.
- Revisión: `node e2e/review/movil-web-preview.mjs` (Playwright; 390 px y escritorio) → `docs/qa/movil-web/revision.json`.
- La web principal sigue en 3000 y la API en 4000.
- Build Android desde Git Bash: definir `JAVA_HOME` (JDK 17 del perfil) y ejecutar `'.\gradlew.bat'` directamente bajo
  la guardia (no `cmd /c`, que Git Bash reescribe).
- Relleno de almacenamiento en emulador: solo con el paso `almacenamientoLleno` (exige ≥ 12 GB libres en C:, tramos de
  ≤ 1 GB, aborta bajo 10 GB).

### Importación Excel (P0-026) y comprobación del seed (2026-10-11)

- `npx jest --runInBand test/imports.int-spec.ts src/imports` (desde `apps/api`): integración con PostgreSQL real y lector XLSX.
- `npm run build -w apps/api && node e2e/review/importaciones.mjs`: revisión en navegador (admin, MANAGER, técnico denegado, teclado, 390 px) contra la app de desarrollo; crea productores DEMO-IMP-* en BORRADOR. Evidencia en `docs/qa/importacion/`.
- `node e2e/seed/comprobar-seed-demo.mjs`: seed DEMO en base desechable `terra_link_seedcheck` (idempotencia, membresías, contraseñas, rotación). No toca `terra_link` ni `CREDENCIALES.csv`.
- Entorno Android en variables de usuario (2026-10-11): `ANDROID_HOME`/`ANDROID_SDK_ROOT` = `C:\Users\mario\AppData\Local\Android\Sdk`, `JAVA_HOME` = JDK 17.0.20.1, `Path` con `platform-tools`, `emulator` y `%JAVA_HOME%\bin`. Abrir una terminal nueva para que apliquen.
- El repositorio vigente está en `D:\PROYECTOS CYBER LAND\TERRA LINK EUDR 2026\TERRA LINK 2025` (la ruta `C:\Users\mario\TERRA LINK 2025` ya no existe).

### Importación de productos (P0-026) y traslado a D: (2026-10-12)

- `npx jest --runInBand test/imports.int-spec.ts test/imports-products.int-spec.ts test/imports-authz-fixtures.int-spec.ts src/imports` (desde `apps/api`).
- `npm run build -w apps/api && node e2e/review/importaciones-productos.mjs`: revisión en navegador de la plantilla de productos (archivos sintéticos; crea productos `DEMO-IMP-*` activos en el catálogo DEMO).
- Imagen de la API: la construye el servicio `migrate` (`docker compose --profile app build migrate`); `build api` no la reconstruye. Después: `docker compose --profile app up -d --wait`.
- El proyecto Compose sigue siendo `terra-link` (mismos volúmenes); `docker compose ls` lista ambos archivos de configuración (C: y D:) porque los contenedores se crearon desde C: y se recrearon desde D:.
- Cachés nativas Android (`apps/mobile/android/app/.cxx`, `apps/mobile/android/app/build`, `apps/mobile/android/build`, no versionadas) conservan rutas de C:; la próxima compilación nativa desde D: probablemente necesitará regenerarlas (no se borraron sin autorización).
