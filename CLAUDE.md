# Terra Link — instrucciones del proyecto

## Proyecto
Terra Link, iniciativa AG TECH EC, conecta cacao de Ecuador con trazabilidad, evidencia, riesgo y debida diligencia. El producto es B2B/B2B2B, web y móvil offline.
Este paquete define el producto objetivo; no acredita implementación, conformidad EUDR ni preparación para producción.

## Antes de cambiar código
1. Lee `docs/00_INDICE.md` y `docs/01_ESTADO_Y_FUENTES.md`.
2. Si hay repositorio, verifica rama, cambios locales, manifiestos, migraciones, pruebas y documentación vigente. Conserva el trabajo existente.
3. Ejecuta `/tl-auditar` al instalar este paquete. Registra evidencia y comandos reales en `docs/20_COMANDOS_Y_ENTORNO.md` antes de usarlos.
4. El stack NestJS/Next.js de la fuente es una propuesta inicial. Hay un antecedente de FastAPI/React no verificado aquí. Conserva el stack probado del repositorio; usa ADR-0001 para resolver diferencias.
5. Si el repositorio está vacío, completa TECH-001 antes de crear módulos; registra stack, estructura y contratos como decisiones propuestas y luego aceptadas.

## Estructura de este paquete
- `.claude/rules/`: reglas globales y por rutas; ajusta sus globs tras auditar el repositorio.
- `.claude/commands/`: flujos invocables para auditoría, implementación, revisión y continuidad.
- `docs/`: especificaciones consultadas según la tarea; `docs/24_TRAZABILIDAD_REQUISITOS.md` conecta fuentes, historias y pruebas.
- `docs/adr/`: decisiones y alternativas; `docs/templates/`: plantillas de tarea, sesión y validación.
- `docs/sources/`: copias literales de las cuatro fuentes, como referencia histórica.

## Reglas fundamentales
- Autoriza en backend por usuario, organización, acción y recurso. Los filtros de UI no dan seguridad.
- Toda referencia entre entidades operativas debe conservar el tenant; acceso entre organizaciones requiere concesión explícita y revocable.
- Conserva eventos, geometrías, evidencias, reglas y expedientes versionados. Corrige mediante un nuevo registro relacionado al original.
- Peso y dinero usan decimales y unidades explícitas. Bloquea doble consumo y saldo negativo; corrige con ajustes auditados.
- Origen desconocido y datos faltantes siguen siendo desconocidos. Un score bajo o un certificado no prueban cumplimiento legal.
- `READY` indica preparación interna; `EXPORTED` indica descarga del paquete. Ninguno significa presentación oficial de DDS.
- La IA y el satélite apoyan análisis; la decisión regulatoria requiere evidencia, reglas vigentes y revisión autorizada.
- Diseño en español, acciones por rol, lote como centro de navegación y errores con recuperación.
- Offline requiere persistencia, idempotencia, resolución visible de conflictos y validación del servidor.

## Cómo trabajar
1. Elige una historia de `docs/18_BACKLOG.md`; revisa dependencias y criterios, no toda la documentación en cada sesión.
2. Inspecciona su implementación actual y reutiliza patrones. Anota qué existe, qué falta y qué propones.
3. Implementa una sección completa: dominio, persistencia, API, autorización, auditoría y UI/offline cuando corresponda.
4. Ejecuta las verificaciones pertinentes de `docs/16_PLAN_QA.md` y los comandos comprobados del repositorio.
5. Actualiza estado, decisiones y reporte de evidencia. No cierres una historia solo porque el código compila.
6. Entrega cambios, pruebas ejecutadas, limitaciones y siguiente paso; distingue «no ejecutado» de «aprobado».

## Comandos
Monorepo npm (`apps/api` NestJS + Kysely, `apps/web` Next.js). Comandos verificados en `docs/20_COMANDOS_Y_ENTORNO.md`; no inventes otros.
- `npm run infra:up` (PostGIS en host:5440, Redis, S3 local) · `npm run db:migrate` · `npm run seed:dev -w apps/api`
- `npm run typecheck` · `npm run lint` · `npm test` (la integración recrea el esquema de la base `*_test`) · `npm run build`
- `npm run dev:api` (4000, Swagger `/api/docs`) · `npm run dev:web` (3000)
- `npm run test:e2e` (Playwright; requiere `npm run build -w apps/api` e `infra:up`; usa base `terra_link_e2e` y puertos 4100/3100)
No ejecutes migraciones sobre producción, reinicios destructivos, borrado de volúmenes ni envíos regulatorios como parte de una tarea local.
Trabaja en una rama de tarea; conserva cambios ajenos y solicita el dato o autorización faltante solo si bloquea una acción concreta.

## Documentación por tarea
Dominio/datos: documentos 04–06. Autorización: 07. Eventos/API: 08–09.
GIS/offline: 10–11. Evidencia/riesgo/DD: 12–13. UI: 14. Integraciones: 15.
QA/operación: 16–17. Plan: 18–19. Inicio en Claude: 21. Decisiones abiertas: 22.
