# Evidencia A-01 — Captura de campo desde la web con alcance propio (2026-10-20)

Ampliación autorizada **posterior** a la documentación original (RF-48, `docs/03`; historia A-01, `docs/18`). **No altera** los
criterios de P0-006 a P0-010, P0-023/P0-024 ni P0-028, y **no entra** en los conteos 42/60 ni 30/44. Estado tras esta entrega:
**DONE_LOCAL** de A-01 (implementación, validación y demostración local). No acredita producción, Android real, conformidad EUDR
ni resultados satelitales reales.

## 1. Candidatos y validaciones (cada uno con su propio resultado)

| SHA | Resultado | Registros | Causa / nota |
| --- | --- | --- | --- |
| `90bf744` | **FALLIDA** | `validation-results/2026-10-20T18-07-07-037Z` | `catalog.spec.ts`: la prueba seguía esperando que el rol Productor no tuviera ningún permiso de productor/parcela. Defecto de la expectativa (A-01 los concede por alcance propio); no detectado antes por correr solo pruebas dirigidas |
| `f86340d` | **FALLIDA** | `validation-results/2026-10-20T18-42-01-689Z` | `e2e-navegador`: 3 de 73. **Regresión funcional real**: tras recargar, la ficha volvía al método «ubicación del navegador» y ocultaba el borrador de polígono y la importación pendientes; además el resumen de precisión había perdido la palabra «vértices». Las demás eran E2E que suponían todos los métodos visibles a la vez |
| **`0caed16`** | **APROBADA** | `validation-results/2026-10-20T19-26-50-519Z` | typecheck, lint, build, OpenAPI validado, **89 suites · 970 pruebas**, E2E **83**. Es el SHA desplegado |

Correcciones de `0caed16`: la ficha detecta un borrador de polígono abierto o una importación analizada y abre ese método (nada
se guarda ni confirma); el texto de precisión conserva «vértice(s)»; los E2E de GeoJSON y polígono eligen el método primero y el de
parcelas ya no prohíbe el botón «Importar GeoJSON» (sí prohíbe presentar la captura como GPS). **Se conservaron todas las
comprobaciones originales** de precisión, procedencia, hash, validez y conflicto.

## 2. Despliegue
`node scripts/desplegar.mjs` → `/version`: commit `0caed16` (BUILD_ARG), esquema `0057_a01_alcance_propio_productor`, coincide con lo construido.
Perfil `app` levantado; `SATELLITE_LIVE_CALLS=disabled`; volúmenes anteriores intactos.

## 3. Demostración local (`e2e/review/a01-demostracion.mjs`)
Organización sintética «ENSAYO A-01» y otra organización ajena, con 8 roles; contraseñas generadas en memoria, fuera del repositorio.
Capturas (no versionadas): `validation-results/a01-demostracion-2026-10-20/`. Corridas previas incompletas del guion (organizaciones
`75826f` y `c5ad99`: el guion fallaba por esperar mal la forma de una respuesta y por enviar campos de estado que la API rechaza
con 400) se conservan como datos sintéticos; la corrida válida es la de la organización `69280c`.

### Fase base · ENSAYO 69280c · 19/19 OK

| Caso | Resultado | Detalle |
| --- | --- | --- |
| 1.1 productor SIN vínculo: no ve parcelas (control: el vinculado ve la suya) | OK | sin vínculo=0, vinculado=1 |
| 1.2 parcela propia 200 / ajena (otro productor de la MISMA organización) 404, incluso por identificador | OK | propia=200 ajena=404 productor ajeno=404 |
| 1.3 técnico: solo parcelas de productores ASIGNADOS (tec1→C: sí; tec1→D: 404; tec2→D: sí) | OK | 200/404/200/404 |
| 1.4 otra organización: ni la administración ajena ni un productor con el mismo identificador acceden | OK | adminB=404 prod1→orgB=404 control admin=200 |
| 1.5 auditor y comprador: sin facultades de captura (control: el auditor SÍ lee) | OK | 200/403/403/403 |
| 1.6 gerente: lectura de la organización completa según su rol (control: ve las 4 parcelas) | OK | parcelas visibles=4 |
| 1.7 capturar NO es decidir: el productor no evalúa GIS, no encarga satélite, no ve riesgo ni miembros | OK | 403/403/403/403 |
| 2.1 control: la administración extrae el documento de D y repite con la MISMA operación (reintento idempotente) | OK | 1.ª=201 reintento=201 |
| 2.2 el reintento idempotente con la operación AJENA no revela el documento (tec1, prod1, prod3: nunca 2xx ni texto) | OK | 9 intentos denegados, sin datos del documento |
| 2.3 el documento de otro productor no se lista, no se abre ni se descarga para el productor vinculado | OK | en lista=false abrir=404 descargar=404 |
| 3.1 versión REGISTRADA (lazo): campos de estado enviados por el cliente se RECHAZAN; sin ellos se guarda y queda marcada no válida | OK | envío con estado forjado=400 (versiones=0) · lazo limpio=201 · technically_valid=false · lectura posterior=false |
| 3.2 resultado de VALIDACIÓN GIS: INVALID, y la parcela no pasa el perfil de destino (no exportable) | OK | GIS=INVALID · perfil=DOES_NOT_MEET exportable=false |
| 3.3 geometría UTILIZABLE: solo una versión técnicamente válida y evaluada pasa; la corrección crea versión nueva y el lazo queda en el historial | OK | versiones=2 · GIS vigente=VALID |
| 3.4 estructura inválida por la API directa: rechazada (4xx) y sin versión | OK | HTTP 422 |
| 4.1 WEB productor (es): elige su parcela, escribe coordenadas, REVISA sin guardar, guarda, corrige con motivo, adjunta evidencia | OK | parcela ajena en el selector=0 · versiones tras revisar=0 · guardar sin motivo bloqueado=true · versiones finales=2 |
| 4.2 WEB técnico asignado (es): croquis con teclado, revisión del servidor, guardado; no ve productores no asignados | OK | productores visibles=[A01-D · Finca D (sintética)] · método=MANUAL_COORDINATES · precisión=no informada |
| 4.3 WEB en inglés y 390 px (productor): mismo recorrido traducido, orden de coordenadas visible, sin desborde ni claves | OK | orden visible=true · sin desborde horizontal=true |
| 4.4 RECARGA: el borrador de POLÍGONO se retoma; recuperarlo NO guarda ni confirma; solo de su usuario, organización y parcela | OK | vértices recuperados=2 · versiones antes/después=2/2 · otros=404/403/404 |
| 4.5 RECARGA: la IMPORTACIÓN GeoJSON pendiente se retoma; no se confirmó sola; solo la ve quien tiene alcance | OK | pendientes del usuario=1 · versiones antes/después=1/1 · otros=404/404/404 |

### Fase satelite · ENSAYO 69280c · 6/6 OK

| Caso | Resultado | Detalle |
| --- | --- | --- |
| S.0 modo ensayo declarado por la API, con escenarios; el productor NO puede encargar | OK | ensayo_mode=true · escenarios=9 · productor=403 |
| S.1 con hallazgos / sin hallazgos: rotulado ENSAYO, sintético, conclusión NO evaluada, versión geométrica exacta | OK | hallazgos=3 · sin hallazgos=0 · versión analizada = vigente (f844f944…) |
| S.2 cobertura insuficiente y error: se declaran; el error no deja resultado favorable; el reintento es un encargo nuevo | OK | cobertura=PARTIAL · error=FAILED (resultado=null) · reintento=COMPLETED, el fallido se conserva |
| S.3 sin efecto operativo: ni evidencia, ni evaluaciones de riesgo; el estado de la parcela sigue NOT_EVALUATED | OK | estado=NOT_EVALUATED · evidencias antes/después=0/0 |
| S.4 cambiar la geometría: los resultados anteriores NO aplican a la versión vigente | OK | nueva versión=201 · ningún ensayo aplica a la vigente=true |
| S.5 WEB administración (es y en): panel de ENSAYO con escenario elegible, ficha sin conclusión (capturas) | OK | selector de escenario es/en=1/1 |

### Fase cierre · ENSAYO 69280c · 1/1 OK

| Caso | Resultado | Detalle |
| --- | --- | --- |
| C.1 la API declara fixture apagada: sin modo ensayo ni escenarios, no se puede encargar | OK | ensayo_mode=false · escenarios=0 · can_request=false · intento de encargo=409 |

### Geometría inválida: tres estados distintos (se conserva el diseño original de P0-006)
1. **Versión registrada**: un lazo (autointersección) se guarda como versión y queda marcado `technically_valid=false`; no existe
   forma de pedir lo contrario (un envío con `technically_valid`/`status` forjados se rechaza con 400 y no crea versión).
2. **Resultado de validación GIS**: la evaluación da `INVALID` y el perfil de destino `DOES_NOT_MEET`, `exportable=false`.
3. **Geometría utilizable**: solo una versión técnicamente válida y evaluada (`VALID`/`WARNING`) pasa; la corrección crea una versión
   nueva con motivo y el lazo queda en el historial. La estructura inválida (rango, tipo) se rechaza con 4xx y no crea versión.
La interfaz web además no deja confirmar una forma no válida (botón deshabilitado); ese es un control de ayuda, **no** el
contrato de almacenamiento, que no se cambió.

## 4. Pruebas automáticas de A-01
- `apps/api/test/a01-alcance-propio.int-spec.ts` (13): vínculo explícito y auditado; solo lo propio (listas, detalle, búsqueda);
  procedencia `MANUAL_COORDINATES` sin precisión; parcela ajena (revisar, versionar, crear, subir, descargar); capturar ≠ decidir;
  técnico y asignaciones incluida la **regresión de extracción** (ver, extraer, decidir sobre documento ajeno → error sin datos);
  la revisión previa no guarda y la confirmación revalida permisos y estructura; auditor/comprador; gerente y otra organización;
  obsolescencia de evaluaciones; desvincular.
- `apps/api/test/satellite.int-spec.ts` (29): escenarios de ensayo, versión exacta, sin evidencia ni riesgo.
- `apps/api/src/authz/catalog.spec.ts`: permisos **exactos** del Productor (`producer:read_own`, `plot:create_own`, `plot:read_own`,
  `plot:read_geometry`, `plot:update_own`); `plot:read_geometry` es la lectura de la geometría de **sus** parcelas (el alcance lo
  fija `PlotsService`), no acceso general.
- `e2e/tests/captura-campo.spec.ts` (5) y los E2E de GeoJSON, polígono, parcelas y ubicación ajustados al selector de método.
- `apps/web/lib/i18n.test.ts`: toda cadena `t('…')` del recorrido y las tablas de etiquetas (incl. GIS y perfil) tienen traducción.

## 5. Interruptor del ensayo satelital
`SATELLITE_FIXTURE_ENABLED` se habilitó **solo** durante la fase satélite (API y worker, verificado con `printenv` en ambos
contenedores) y se retiró de `.env`. Tras recrear api y worker: `printenv` = `false` en **ambos**; la API declara `ensayo_mode=false`,
sin escenarios, `can_request=false`, y un intento de encargo con escenario responde 409 sin resultado. El compose lo pasa con
valor por omisión `false`. `SATELLITE_LIVE_CALLS=disabled` no se tocó.

## 6. Respaldo
`_respaldos/2026-10-20-a01-migracion-0057` — restauración aislada verificada: 137 tablas, conteos exactos idénticos, restricciones
idénticas, descifrado de identidad OK, 1140 objetos con la misma huella; detalle en su `VERIFICACION-2026-10-20.md`.

## 7. Límites
- Datos y análisis satelital **sintéticos**; ninguno acredita deforestación, su ausencia ni conformidad.
- Ensayo físico Android **pospuesto** (P0-023/P0-024 conservan sus criterios con teléfono pendientes).
- Las fotos subidas desde la web conservan sus metadatos EXIF tal como llegan (la pantalla lo advierte); no se extrae ni se usa su ubicación.
- El croquis no tiene mapa base: orienta, no mide. El recorrido no funciona sin conexión (la captura offline es la del móvil).
- Textos generados por el servidor sin entrada en el diccionario se muestran en español (reserva prevista).
- Páginas de productores traducidas solo en parte; el resto del producto sigue en español con inglés en el recorrido de campo.
