# Cierre reproducible de importación multiformato

## Candidato aislado

Solicitud del propietario de 2026-11-24: conservar su carpeta actual y separar la importación en un worktree. Base `0b968c9`; rama `feat/importacion-done-local`; ubicación `C:/Users/mario/AppData/Local/Temp/vscode-agent-codex-sandbox-bIHGJ5/tl-importacion-cierre`.

Incluye lectores GeoJSON/GPKG/Shapefile ZIP/KML-KMZ/CSV-XLSX, migración 0080, API/persistencia/autorización/auditoría, UI de importación y mapa, enlace y traducción propios, plantillas y pruebas. Incluye el rechazo explícito de código de productor ajeno, la evolución Point → Polygon en el mismo registro y la corrección del selector exacto de menú en QA. Next 16.4.6 es un prerrequisito mínimo de compilación ya comprobado; del lockfile solo se trasladan Next y @next.

Excluye los cambios locales previos de estilos, iconos, menú plegable y sus traducciones. La carpeta original no se modifica, ni se cambia su rama o índice. Se registraron huellas de sus archivos modificados/no rastreados para comprobar conservación al terminar. No se hace merge, despliegue nuevo ni push desde este cierre: el despliegue local existente sigue siendo una referencia distinta al candidato aislado.

## Gate

Estado final: **DONE_LOCAL**, limitado a la ampliación de importación multiformato y al recorrido PRODUCER. Código probado: **`e4c3a93b13308e0eddbde65f801f10f82961ea1c`**. Orden respetado: commit de código → validación integral → este cierre documental posterior. No se alteró código durante ni después de la corrida.

## Validación integral sobre el SHA

Comando: `npm.cmd run validate`, sin `--skip-e2e`, desde el worktree. Ejecución `2026-11-25T01-29-48-361Z` (24 de noviembre por la noche en Ecuador), fin `2026-11-25T01:56:29.922Z`. Resultado **APROBADA**, salida **0**, `cambios_locales_sin_commit: 0`, `no_ejecutados: []`. El estado Git se volvió a comprobar al terminar: limpio; OpenAPI no produjo diferencias.

Resumen original de la corrida conservado sin modificaciones: [JSON](evidencias/importacion-e4c3a93/resumen.json) y [Markdown](evidencias/importacion-e4c3a93/resumen.md). Logs completos en `validation-results/2026-11-25T01-29-48-361Z/` del worktree; [huellas SHA-256](evidencias/importacion-e4c3a93/SHA256SUMS.txt). El resumen identifica el SHA abreviado; el SHA completo de código consta arriba.

| Paso | Resultado | Duración |
| --- | --- | --- |
| Servicios | Aprobado | 24,9 s |
| Typecheck API/web | Aprobado | 28,7 s |
| Lint API/web | Aprobado | 17,2 s |
| Build API/web | Aprobado | 40,2 s |
| OpenAPI validado | Aprobado | 19,9 s |
| API: unitarias/integración | **115 suites, 1.214 pruebas aprobadas**; 2 suites y 55 pruebas omitidas | Parte del paso npm test |
| Web | **6 archivos, 27 pruebas aprobadas** | npm test conjunto: 1.168,8 s |
| Navegador Chromium | **180/180 aprobadas**, sin omisiones | 301,7 s |
| Lector GDAL aislado | **11/11 aprobadas**, sin red | Ejecución específica adicional |

Lector: `docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=128m --memory 512m --cpus 1 terra-link-plot-reader:local /usr/bin/python3 /app/reader_test.py` → `Ran 11 tests ... OK`, salida 0. `npm.cmd ci --offline --no-audit --no-fund` instaló 762 paquetes desde caché; no cambió el lockfile comprometido ni requirió acceso externo.

### Pruebas omitidas: no equivalen a aprobadas

El arnés existente evalúa `spawnSync('openssl', ['version']).status === 0`; OpenSSL no está disponible en PATH. Sus ramas `describe.skip` producen estas **55 pendientes** (desglose comprobado en `apps/api/test-results/timings.json`, también conservado por validate en `api-test-timings/`):

| Archivo | Casos omitidos | Alcance |
| --- | --- | --- |
| `src/satellite/whisp.spec.ts` | 34 | Adaptador Whisp contra HTTPS controlado, suite completa omitida |
| `src/satellite/egress-transporte.spec.ts` | 7 | Transporte saliente con sockets HTTPS controlados, suite completa omitida |
| `test/satellite.int-spec.ts` | 14 | Bloque Whisp 2.3.1 con servidor controlado; el resto de la suite sí ejecutado |

No se añadieron exclusiones para lograr el resultado. Estos casos no son pruebas del importador y **no quedan acreditados** por este cierre. Las llamadas a proveedores reales no se ejecutaron ni se habilitaron.

## Recorrido PRODUCER en la misma corrida

Caso 59 de Chromium, `tests/importar-parcelas-productor.spec.ts`, aprobado en 6,3 s. Cuentas y parcelas sintéticas en la base E2E, rol explícito PRODUCER y sesión propia. Demuestra: CSV sin productor → vinculación propia → punto sin área calculada → apertura de la ficha → perímetro sobre **el mismo ID** → confirmación explícita → historial POINT/POLYGON y un solo registro; además código ajeno bloqueado por el servidor, POST de confirmación forjado con hash auténtico rechazado con **409**, y parcela ajena oculta con **404**, sin reasignación.

Capturas nuevas tomadas durante la validación de este SHA, no las del árbol original:

- [Punto guardado por PRODUCER](capturas/importacion/worktree-producer-punto-390.png).
- [Misma parcela con perímetro e historial](capturas/importacion/worktree-producer-perimetro-390.png).
- [Código ajeno bloqueado](capturas/importacion/worktree-producer-ajena-bloqueada-390.png).
- [Vista previa administrativa de la importación](capturas/importacion/worktree-importar-parcelas-preview-390.png), caso 60 aprobado en 5,0 s.

Las 10 pruebas específicas de importación API también aprobaron dentro de las 1.214 de la corrida. Los informes previos se conservan como históricos y no se reetiquetan como validaciones aprobadas.

## Conservación e integración pendiente

Se compararon SHA-256 de todos los archivos originalmente modificados/no rastreados antes y después: **sin diferencias**. La carpeta original mantiene rama `feat/importar-parcelas-multiformato`, HEAD `0b968c9` e índice intacto. La rama de cierre conserva el commit de código y este commit posterior de evidencia; no se fusionó en la carpeta original ni se publicó al remoto. Integrar esa rama y decidir el siguiente despliegue es una acción separada: la app local existente conserva su revisión declarada `0b968c9+sucio`. Durante validate se reutilizó infraestructura Docker local sin borrar volúmenes ni datos; no se aplicaron migraciones a producción.

No acredita producción, Android real, precisión de levantamiento, titularidad ni conformidad EUDR. GPX/CAD siguen fuera de esta entrega. No se envían geometrías a proveedores externos durante las conversiones ni las pruebas.
