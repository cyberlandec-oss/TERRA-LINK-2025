# P0-028 — Primer proveedor satelital: contrato, propuesta de proveedor y alcance implementable (2026-10-14)

Fuentes contrastadas, con su cita literal:

- **Backlog P0-028**: «Depende P0-010/019/020. Como EUDR_MANAGER, necesito resultado con procedencia. Aceptación:
  adapter/job, contrato real y coste, credenciales protegidas, dataset/versión/fecha/método/cobertura; timeout/no
  coverage no generan verde; defensa egress/SSRF probada. RF-28; QA-15.»
- **RF-28** (docs/03): «Proveedor satelital sustituible con procedencia y fallo explícito.»
- **QA-15** (docs/16): «Satélite ok/timeout/rate limit/no coverage, redirects y URL maliciosa → Proveniencia; fallo
  explícito; credencial no sale a destino ajeno; ningún verde falso.»
- **S1 §39**: «cuando existe riesgo regional se requiere análisis geoespacial a escala de parcela mediante superposición
  de la geolocalización con imágenes satelitales o mapas de cobertura/uso de suelo»; cadena `National/regional risk →
  Plot-level analysis → Satellite / land-cover evidence → Risk assessment`.
- **S1 §40**: «No acoplar el core a un único proveedor», interfaz `SatelliteProvider` con `getForestCover`,
  `getDeforestationAlerts`, `getHistoricalAnalysis`; implementaciones `WHISPProvider`, `GFWProvider`,
  `EUObservatoryProvider`, `CustomProvider`.
- **S1 §41**: «El resultado de un proveedor externo no debe convertirse automáticamente en verdad legal.» Guardar
  `source, dataset, version, analysis_date, resolution, method, result, confidence`.
- **S1 §52**: `GET /api/v1/plots/{id}/satellite`. **S1 §54**: worker `SATELLITE_ANALYSIS_REQUESTED`; «No bloquear una
  petición HTTP durante un análisis satelital». **S1 §67**: la pantalla de parcela muestra `Satellite` y
  `Deforestation`. **S1 §95** (Sprint 9): `Plot → Analysis Job → Provider → Result → Evidence → Risk`.
  **S1 §103**: «No acoplar el sistema a un proveedor satelital.»
- **docs/06**: `satellite_jobs/results` → `plot_version_id R; provider R; job_status R; dataset/version/date/method C;
  resolution/confidence C; raw_object_key C`; «C al completar; resultado ligado a geometría exacta».
- **docs/08**: eventos `SatelliteAnalysisRequested/Completed/Failed`.
- **docs/10 §Versionado e impacto**: «Una evaluación satelital o de riesgo utiliza `plot_version_id` y hash de
  geometría, no "la parcela actual" mutable»; «Las capas satelitales deben incluir proveedor, dataset, versión, fecha,
  resolución, método, cobertura, límites y confianza si el proveedor la define. "Sin alertas" no equivale a "sin
  deforestación" cuando no existe cobertura suficiente.»
- **docs/13**: regla `SATELLITE_COVERAGE_UNKNOWN` → «NOT_ASSESSED y revisión requerida; sin alertas no prueba ausencia
  de deforestación».
- **docs/15 §Contrato de adapter satelital** y §Seguridad de llamadas externas (texto íntegro aplicado abajo).
- **docs/UX_UI §661**: «Análisis satelital: solicitado, en cola, en proceso, fallido o disponible según contrato de job.
  Resultado muestra fecha de análisis y del dataset, fuente y límites. Una alerta de cobertura requiere interpretación;
  no escribir "deforestación confirmada" por el solo resultado de un proveedor.»
- **docs/22 D-09**: «Proveedor satelital y cobertura/coste — Evidencia de cierre: canal/contrato/fixture/resultados
  reales.» **Decisión abierta.**

Validación local. Este documento no acredita producción, contratación de proveedor ni conformidad EUDR.

---

## 1. Qué análisis exige la fuente

Las fuentes **no definen un algoritmo de deforestación propio ni umbrales**. Exigen tres cosas distintas y es
importante no confundirlas:

| Exigencia de la fuente | Qué significa aquí | Quién la cumple |
| --- | --- | --- |
| Superposición de la geolocalización de la parcela con imágenes satelitales o mapas de cobertura (S1 §39) | Se **envía la geometría** de la parcela a un proveedor que mantiene esas capas y se **recibe** su resultado | El proveedor externo, no Terra Link |
| Arquitectura no acoplada a un proveedor (S1 §40/§103) | Puerto `SatelliteProvider` + registro de proveedores sustituibles | Terra Link |
| El resultado externo no es verdad legal (S1 §41) | Procedencia completa, resultado conservado **sin interpretar**, conclusión regulatoria fuera del proveedor | Terra Link |

**Consecuencia de contrato:** P0-028 no «calcula deforestación». Encarga un análisis, conserva su procedencia y lo deja
disponible como insumo. Ninguna salida de esta historia dice «libre de deforestación» ni «conforme EUDR».

## 2. Geometría y versión utilizadas

- El sujeto del análisis es una **versión de parcela** (`plot_version_id`), nunca «la parcela actual» (docs/10).
- El trabajo guarda además el `geometry_hash` de esa versión. Un resultado **solo es aplicable** a la versión cuya
  huella coincide; si la parcela cambia de geometría, el resultado anterior queda `SUPERSEDED_GEOMETRY` y **no se
  reutiliza** (no se migra silenciosamente a la geometría nueva).
- Una versión **sin geometría** (solo superficie declarada) no es analizable: `GEOMETRY_UNSUPPORTED`. No se sustituye
  por el centroide del cantón ni por ningún dato inventado.
- Un trabajo atrasado **no sobreescribe** el estado de una versión posterior (docs/13 §Evaluación reproducible: «un job
  atrasado no sobreescribe una evaluación posterior: comprobar versión objetivo»).

## 3. Proveedor, conjunto de datos y cobertura temporal

- **Registro de proveedores** (`satellite_providers`), catálogo de sistema versionado, con el mismo criterio que el
  catálogo de riesgo: nace **no seleccionado**. Campos: código, nombre, tipo, URL base y de documentación, licencia,
  coste, cobertura, límites, **qué datos salen del equipo**, fuente documental y estado de selección.
- Estados: `PROPOSED` (documentado, sin decisión) · `SELECTED` (decisión D-09 registrada, con responsable y referencia)
  · `TEST_ONLY` (fixture sintética) · `RETIRED`.
- **A lo sumo un proveedor `SELECTED`** (índice único parcial). Hoy: **ninguno**.
- Una fixture **nunca** puede quedar `SELECTED` (restricción de esquema) y sus resultados se marcan
  `is_synthetic = true` de forma indeleble.
- El dataset, su versión y la cobertura temporal **los declara el proveedor en cada resultado**; Terra Link no los
  presupone ni los rellena. Si el proveedor no los informa, el campo queda nulo y el resultado queda `INCOMPLETE`.

## 4. Resultados, incertidumbre y estados no evaluables

Un trabajo termina **siempre** con un desenlace explícito. Ninguno de ellos es favorable:

| Desenlace | Cuándo | Lectura |
| --- | --- | --- |
| `RESULT_AVAILABLE` | El proveedor respondió con procedencia completa | Insumo con límites; **no** conclusión |
| `NO_PROVIDER_SELECTED` | No hay proveedor seleccionado (D-09) | No evaluable |
| `NO_COVERAGE` | El proveedor declara que no cubre la geometría o el periodo | No evaluable: «sin alertas» ≠ «sin deforestación» |
| `TIMEOUT` | Venció el plazo | No evaluable |
| `RATE_LIMITED` | Cupo del proveedor agotado | No evaluable |
| `PROVIDER_ERROR` | Error del proveedor o respuesta no conforme al contrato | No evaluable |
| `EGRESS_BLOCKED` | El destino no superó la defensa de salida | No evaluable **y** incidente de seguridad |
| `GEOMETRY_UNSUPPORTED` | La versión no tiene geometría o el tipo no es admitido | No evaluable |
| `SUPERSEDED_GEOMETRY` | La parcela cambió de versión antes de terminar | No evaluable para la versión vigente |
| `CANCELLED` | Cancelado por la organización | No evaluable |

Regla innegociable, además escrita como restricción de base: **`satellite_results.conclusion` solo admite el valor
`NOT_EVALUATED`**. Ningún resultado de proveedor, ninguna ausencia de alerta y ninguna confianza alta producen por sí
mismas una conclusión. La confianza se conserva **solo si el proveedor la define** (docs/10); en otro caso es nula y no
se infiere.

## 5. Procedencia, versiones y evidencia reproducible

Cada resultado conserva, según S1 §41 y docs/06: `provider_code`, `dataset`, `dataset_version`, `analysis_date`,
`resolution_m`, `method`, `coverage_status` + nota de cobertura, `confidence` (si el proveedor la define),
`limitations` (obligatorio), `indicators` (lo que devolvió el proveedor, **sin interpretar**), y la referencia a los
**bytes originales** (`raw_object_key` + `raw_sha256`) en el almacenamiento privado.

Además se conservan: la versión del contrato de adapter (`adapter_contract_version`), la versión del registro de
proveedores y el `request_fingerprint` (hash de lo que se envió: geometría + parámetros), para poder reconstruir la
petición exacta sin volver a enviarla.

`satellite_results` es **append-only** (trigger). Volver a analizar crea un trabajo y un resultado nuevos; nunca se
corrige un resultado histórico en su sitio.

## 6. Permisos y clasificación de coordenadas

- Permisos nuevos: **`satellite:read`** (consultar trabajos y resultados) y **`satellite:request`** (encargar un
  análisis). `satellite:request` **no** concede lectura de parcelas: cada operación revalida el alcance de la parcela.
- **Clasificación de coordenadas (decisión de esta historia, propuesta):** encargar un análisis **envía la geometría
  exacta fuera del equipo**. Por eso exige además **`plot:read_geometry`** —el permiso que ya clasifica el acceso a
  coordenadas exactas (docs/06, catálogo RBAC)—. Quien no puede ver las coordenadas tampoco puede hacer que salgan.
- La credencial del proveedor se guarda **cifrada por organización** (AES-256-GCM con AAD de contexto, el mismo
  mecanismo de datos personales), nunca se devuelve por la API, nunca se registra y solo se adjunta a un host de la
  lista blanca del proveedor seleccionado (docs/15).
- Los eventos y la bitácora registran identificadores y desenlaces: **nunca coordenadas, nunca la credencial, nunca el
  mensaje de error crudo** (solo un código controlado).

### Defensa de salida (egress/SSRF), exigida por QA-15

Antes de cualquier llamada: solo `https`; host en la **lista blanca del proveedor registrado**; sin credenciales en la
URL; sin literales IP; resolución DNS comprobada contra rangos **privados, loopback, enlace local, CGNAT, multicast y
ULA IPv6** (defensa frente a *DNS rebinding*); **ninguna redirección se sigue** (un 3xx es `EGRESS_BLOCKED`); plazo
máximo; tamaño máximo de respuesta; y redacción de la credencial en cualquier texto que se conserve.

## 7. Integración con riesgo y expedientes

- **Riesgo (P0-020).** La regla `SATELLITE_COVERAGE_UNKNOWN` del catálogo `0.1.0` tiene `depends_on = 'P0-028'` y
  resuelve `NOT_EVALUABLE`. **No se modifica en esta historia.** Que exista un adapter no la vuelve evaluable: para
  eso hacen falta (a) un proveedor **seleccionado** (D-09) y (b) una **versión nueva del catálogo** con la condición
  escrita y su aprobación (D-07). Cambiar la regla sin ambas cosas sería inventar el umbral que las fuentes no dan.
- **Expediente (P0-022).** El requisito `DEFORESTATION_ANALYSIS` deja de depender de una constante escrita en el código
  (`satellite_provider: null`) y pasa a derivarse del **registro de proveedores**: es `NOT_EVALUABLE` mientras no haya
  proveedor seleccionado, y los resultados **sintéticos nunca lo satisfacen**. El cambio es de procedencia, no de
  resultado: hoy sigue `NOT_EVALUABLE`.
- **Evidencia (P0-019).** S1 §95 encadena `Result → Evidence → Risk`. Vincular un resultado satelital como evidencia
  **queda fuera de esta entrega**, y conviene separar bien de qué depende:
  - **D-37** decide la **política de autoverificación y revisión** de una afirmación: quién no puede verificar lo que
    él mismo aportó, y con qué plazo se revisa tras una versión nueva. Es una política *sobre* las evidencias.
  - Lo que falta aquí es **otra cosa y se registra aparte, como D-42**: qué **tipo de afirmación** del catálogo de
    docs/12 es un resultado satelital, cuál es su **entidad titular**, **qué acredita y qué no**, si exige verificación
    humana o es evidencia de sistema con procedencia, y qué ocurre con ella cuando cambia la versión geométrica o la
    versión del dataset.
  - Orden: primero D-42 (qué es esa evidencia), después D-37 (quién la verifica). Ampliar D-37 para abarcar el
    contrato entero sería cambiarle el significado por la puerta de atrás.

---

## Propuesta de proveedor para D-09 (NO APROBADA)

Las fuentes **nombran candidatos pero no seleccionan**: S1 §40 lista WHISP, EU Observatory y GFW; docs/15 deja la
integración «WHISP/GFW/otro satélite» en `POR_VERIFICAR` con condición de activación «API, términos, cobertura, coste,
seguridad y credenciales comprobadas». Por tanto **no hay proveedor elegido** y esta sección es una propuesta
revisable, consultada en documentación oficial el 2026-10-14.

| | **Whisp (Open Foris / FAO · Forest Data Partnership)** | **Global Forest Watch (WRI)** | **EU Forest Observatory (JRC)** |
| --- | --- | --- | --- |
| Qué entrega | Indicadores por geometría («convergencia de evidencia») a partir de JRC TMF, Hansen GFC, alertas RADD y mapas por commodity | Datos y alertas de pérdida de cobertura (GLAD, RADD) por área de interés | Mapas GFC2020 / GFT2020 (cobertura y tipo de bosque, año 2020) |
| Interfaz | API REST documentada: `POST /api/submit/geojson` · `/api/submit/wkt` · `/api/submit/geo-ids`; `GET /api/status/{token}` (+ `/stream`, `/cancel`); descarga GeoJSON/CSV; `GET /api/config` | API con clave; portal de datos | Descarga, WMS y Google Earth Engine; **sin API por parcela** |
| Autenticación | Cabecera `x-api-key` (registro gratuito) | Clave de API (caduca al año) | No aplica |
| Resolución / corte | Muestreo a **10 m**; corte **31-12-2020** (el de EUDR); definición de bosque FAO (0,5 ha, 5 m, 10 % dosel) | Según dataset | **10 m**, año 2020 |
| Límites declarados | 5 000 geometrías por trabajo asíncrono / 250 síncrono; 30 peticiones por 60 s por clave; 2 trabajos simultáneos; plazo 600 s asíncrono / 90 s síncrono | Cupo por clave; atribución obligatoria | — |
| Licencia / coste | **MIT**, gratuito, uso comercial sin acuerdo con FAO | Gratuito y abierto; GFW **Pro** tiene acuerdo aparte con opciones de pago | Gratuito; «fuente no obligatoria, no exclusiva y **no jurídicamente vinculante**» |
| Datos que saldrían del equipo | **Geometría de la parcela** y parámetros técnicos; sin identificadores de usuario. Retención declarada: temporal durante el análisis, borrado típico en ~10 min; metadatos de petición con IP anonimizada a los 90 días | Área de interés | Ninguno (se consume el mapa) |
| Lo que **no** entrega | «You can use Whisp to support due diligence reports, **but there is no certification involved**»; devuelve «more info needed» cuando la evidencia es insuficiente | No concluye cumplimiento | No concluye cumplimiento |

**Propuesta para decidir (sin aprobar):** **Whisp** como primer proveedor, por dos razones comprobables: su contrato
asíncrono (`submit` → `status/{token}` → descarga) encaja exactamente con el modelo de trabajo que exige S1 §54, y su
corte temporal es el de la EUDR. GFW quedaría como segundo adapter (la sustituibilidad es el criterio de RF-28) y el
mapa del JRC como capa de referencia, no como proveedor por parcela.

**Precisión importante sobre la licencia:** la licencia **MIT** cubre el **código** de Whisp. **No** es aceptación de
los **términos del servicio alojado**, **no** es un acuerdo de nivel de servicio y, sobre todo, **no autoriza a
enviarle geometrías de productores**. «Gratuito y de código abierto» reduce la fricción de *construir* el adaptador;
no reduce en nada lo que hay que decidir para *usar* el servicio. Las dos aprobaciones están separadas más abajo.

**Lo que esta propuesta NO resuelve y debe decidirse antes de enviar una sola coordenada:**

1. **Autorización para que las geometrías de productores salgan del equipo** hacia un tercero (FAO/Google Earth Engine
   como infraestructura subyacente), y su base de tratamiento (D-14 retención y base del tratamiento).
2. Aceptación de los **términos de servicio** vigentes del proveedor por el responsable que corresponda.
3. Titularidad y custodia de la **clave de API** por organización o por plataforma.
4. Qué significa operativamente cada indicador del proveedor **antes** de que ninguna regla lo use (eso es D-07, no
   esta historia).

Mientras tanto, **no se contrata, no se registra clave y no se envía ninguna coordenada**.

---

## D-09: parte A ADOPTADA (2026-10-15), parte B pendiente

| Aprobación | Estado | Qué habilita hoy |
| --- | --- | --- |
| **A. Adaptador para desarrollo** | **ADOPTADA el 2026-10-15** (Whisp) | El adaptador está implementado contra el contrato oficial fechado y probado **solo contra servidores controlados**. `satellite_providers.WHISP = SELECTED_FOR_DEVELOPMENT` |
| **B. Envío de geometrías reales** | **PENDIENTE** | Nada. Encargar un análisis responde `409`, el adaptador no abre ninguna conexión y no hay ninguna clave registrada |

El sistema no deja que A se deslice hacia B: son estados distintos en la base, con restricciones distintas, y
**además** hace falta el interruptor `SATELLITE_LIVE_CALLS`. Tener el adaptador, estar seleccionado para desarrollo o
tener una credencial guardada **no** habilitan nada: lo comprueban pruebas específicas.

## Lo que falta para una primera prueba real (parte B)

| # | Requisito | Quién | Comprobable cómo |
| --- | --- | --- | --- |
| 1 | **Autorización para que geometrías de productores salgan hacia un tercero** y su base de tratamiento (**D-14**). Una parcela georreferenciada es dato del productor | Responsable de datos / legal | Decisión registrada; sin ella no se marca `SELECTED` |
| 2 | **Aceptación de los términos vigentes** del servicio alojado, leídos en su versión actual (no en el resumen de este documento) | Responsable que corresponda | Referencia de la decisión en `decision_reference` |
| 3 | **Clave de API**: obtenerla por registro, decidir **titularidad** (por organización o de plataforma) y custodia, y qué ocurre al revocarla | Producto / seguridad | La clave se guarda cifrada por organización; nunca se devuelve por la API |
| 4 | Marcar `WHISP` como **`SELECTED`** con responsable (`selected_by`) y referencia de la decisión | Tech lead / producto | La restricción de esquema rechaza `SELECTED` sin responsable |
| 5 | Encender **`SATELLITE_LIVE_CALLS=enabled`** en el entorno donde se hará la prueba | Operación | Sin él, `LIVE_CALLS_DISABLED` |
| 6 | Elegir **con qué parcela** se hace la primera prueba y con qué consentimiento | Producto / operación | — |

Y dos cosas que **no** se desbloquean con la parte B: que una regla de riesgo use el resultado (**D-07**) y que el
resultado se vincule como evidencia (**D-42**).

## D-09: el marco de decisión (dos aprobaciones distintas, ninguna supuesta)

La licencia del **código** de Whisp (MIT) **no es** aceptación de los **términos del servicio alojado** ni autorización
para enviarle geometrías. Son tres cosas separadas y aquí se separan también las aprobaciones:

| Aprobación | Qué habilita | Qué NO habilita | Quién decide |
| --- | --- | --- | --- |
| **A. Seleccionar un adaptador para desarrollo** | Escribir e integrar el adaptador contra el contrato publicado del proveedor; probarlo con servidores controlados | Ninguna llamada al servicio del proveedor; ninguna geometría fuera del equipo | Tech lead / producto |
| **B. Autorizar el envío de geometrías reales** | Registrar la credencial y llamar al servicio con parcelas reales | Cualquier conclusión regulatoria; sigue haciendo falta D-07 para que una regla use el resultado | Responsable de datos + producto/legal |

**A no implica B.** El sistema lo refleja: un proveedor queda `SELECTED` con su decisión registrada, pero sin
credencial no se llama a nadie, y la credencial se registra por organización en un paso aparte.

### Resumen para la decisión (datos de la documentación oficial consultada el 2026-10-14; no verificados con el proveedor)

| | |
| --- | --- |
| **Proveedor recomendado** | **Whisp** (Open Foris / FAO · Forest Data Partnership) como primer adaptador; GFW como segundo (la sustituibilidad es el criterio de RF-28); JRC GFC2020 como capa de referencia, no como proveedor por parcela |
| **Modalidad de uso** | Servicio **alojado por el proveedor**, API REST asíncrona: `POST /api/submit/geojson` → `GET /api/status/{token}` → descarga. Encaja con S1 §54 (la petición HTTP no espera el análisis). Alternativa a evaluar aparte: ejecutar el **paquete abierto** por cuenta propia, que cambia el perfil de datos (no saldría ninguna geometría) y el de coste (infraestructura propia) |
| **Términos del servicio y datos** | Pendientes de lectura y aceptación formal por el responsable. Lo publicado: geometría y parámetros técnicos; sin identificadores de usuario; almacenamiento temporal durante el análisis con borrado declarado en minutos; metadatos de petición con IP anonimizada a los 90 días. **No verificado por nosotros**; la infraestructura subyacente declarada incluye un tercero (Google Earth Engine) |
| **Coste o cuota verificable** | Publicado como gratuito y de código abierto (MIT). Cuotas publicadas: 5000 geometrías por trabajo asíncrono (250 síncrono), 30 peticiones/60 s por clave, 2 trabajos simultáneos, 600 s de plazo asíncrono (90 s síncrono). **Sin cotización ni acuerdo de nivel de servicio**: no hay compromiso contractual que invocar si cambia |
| **Credenciales necesarias** | Una clave de API por cabecera `x-api-key`, obtenida mediante registro. Falta decidir **titularidad y custodia**: ¿una clave por organización o una de plataforma? El sistema ya soporta clave **por organización**, cifrada y nunca devuelta por la API |
| **Datos que saldrían del equipo** | La **geometría exacta** de parcelas de productores (polígono o punto, WGS84) y los parámetros del análisis. **Nada más**: ni identidad del productor, ni códigos internos, ni nombres. La clave de API viaja solo a los hosts de la lista blanca |
| **Qué habría que registrar al aprobar** | `satellite_providers.selection_status = 'SELECTED'`, el responsable (`selected_by`) y la **referencia de la decisión** (`decision_reference`). La restricción de esquema impide «activar» un proveedor sin esos dos datos |

### Condiciones previas a B (envío de geometrías reales)

1. **Autorización para que las geometrías de productores salgan hacia un tercero** y su base de tratamiento (**D-14**:
   retención y base del tratamiento). Una parcela georreferenciada es dato del productor, no solo del sistema.
2. **Aceptación de los términos vigentes** del servicio alojado por el responsable que corresponda, leídos en su
   versión actual, no en el resumen de este documento.
3. **Titularidad y custodia de la clave**, y qué pasa al revocarla.
4. **Significado operativo de cada indicador** antes de que ninguna regla lo use: eso es **D-07**, no esta decisión.
   Hasta entonces el resultado es consultable y trazable, pero no alimenta ninguna conclusión.

Mientras A y B no estén aprobadas: **no se contrata, no se registra clave y no sale ninguna coordenada.**

## Alcance implementable sin D-09 (lo que entra en esta entrega)

1. Registro de proveedores con los tres candidatos documentados en estado `PROPOSED` y la fixture en `TEST_ONLY`;
   ninguno seleccionado.
2. Persistencia: `satellite_providers`, `satellite_jobs`, `satellite_results` (append-only), `satellite_credentials`
   (cifradas), con las restricciones de honestidad escritas en el esquema.
3. Puerto `SatelliteProvider` y adapter de fixture **sintética rotulada**, utilizable solo con el interruptor de
   desarrollo/prueba.
4. Trabajo asíncrono: la petición HTTP no espera al análisis (S1 §54); un corredor en el worker reclama trabajos con
   arrendamiento, reintento y desenlace explícito.
5. Defensa de salida (lista blanca, anti-SSRF con comprobación de DNS, sin redirecciones, plazo, tamaño, redacción).
6. API con sus permisos, auditoría y eventos; pantalla de parcela con el estado del análisis.
7. Pruebas: unitarias de la defensa de salida y del mapeo de desenlaces; de integración para autorización, aislamiento
   entre organizaciones, append-only y los desenlaces de QA-15 con fixture.

**Fuera de alcance por decisión ajena:** selección y contratación de proveedor (D-09), evaluabilidad de la regla de
riesgo (D-07 + catálogo aprobado), vínculo resultado→evidencia (D-37), perfil de destino geoespacial (D-05).
