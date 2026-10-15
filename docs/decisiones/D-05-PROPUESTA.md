# D-05 — Propuesta de perfil de destino geoespacial (NO APROBADA)

Estado: **PROPUESTA**, pendiente de responsable GIS/regulatorio designado. **Nada de este documento está activo en el
código**: `TL_GIS_TECH 1.0.1` sigue informando «Perfil de destino: no evaluado (D-05)» y el recorrido integral sigue
devolviendo `DESTINATION_PROFILE_NOT_EVALUATED`. Esta revisión **no** cierra P0-009 ni P0-010, **no** levanta el
requisito `GEOLOCATION_PROFILE` del expediente y **no** toca ninguna compuerta regulatoria.

Revisión 2 — 2026-10-15. Qué cambia respecto de la revisión 1: se consultaron **fuentes oficiales directas** del
sistema de destino, que resuelven varias preguntas que la revisión 1 dejaba abiertas y **contradicen** dos supuestos
suyos (huecos en polígonos y decimales de exportación). La fuente legal **no** pudo consultarse literalmente desde
este entorno, y eso se registra como pendiente, no como verificado.

---

## 1. Qué decide D-05

1. Qué perfil de destino aplica a la geolocalización de parcelas: tipo de geometría exigido según la superficie,
   umbral y **caso exactamente igual al umbral**, superficie de referencia, formato y precisión de intercambio.
2. Con qué fuente —norma, especificación técnica del sistema receptor o regla interna de Terra Link—, con qué
   vigencia y cómo se versiona.
3. Qué hace la plataforma cuando una parcela no cumple el perfil, **sin** convertir el incumplimiento en conclusión
   legal automática.

---

## 2. Las tres capas de fuente, que no deben mezclarse

| Capa | Qué es | Qué puede decidir | Qué NO puede decidir |
| --- | --- | --- | --- |
| **A · Norma** | Reglamento (UE) 2023/1115 y sus modificaciones | Qué obliga la ley a declarar | Cómo se serializa un archivo |
| **B · Especificación técnica del destino** | Documentación del *EUDR Information System* (TRACES) para operadores | Qué acepta y qué rechaza el sistema receptor | Qué es lícito o conforme |
| **C · Regla interna de Terra Link** | `TL_GIS_TECH`, perfil de importación `GEOJSON_IMPORT_V1`, política de producto | Qué exige Terra Link a sus usuarios y cuándo avisa | Qué exige la ley ni qué acepta TRACES |

Que B acepte un archivo **no** significa que A se cumpla. Que C marque `VALID` **no** significa ninguna de las dos.
Cada fila de este documento lleva su capa.

---

## 3. Estado de verificación de cada fuente

### 3.1 Capa A — norma: **NO VERIFICADA LITERALMENTE**

| Dato | Estado | Detalle |
| --- | --- | --- |
| Texto consolidado vigente | **Identificado, no leído** | CELEX `02023R1115-20251226` (consolidación a **26-12-2025**) |
| Última modificación | **Identificada, no leída** | Reglamento (UE) **2025/2650**, firmado el 19-12-2025, publicado en el DOUE el **23-12-2025** |
| Fecha de aplicación vigente | **Identificada, no leída** | **30-12-2026** para operadores y comerciantes; **30-06-2027** para personas físicas y micro/pequeñas empresas no cubiertas antes por el EUTR |
| Art. 2, definición de «geolocalización» | **NO citado literalmente** | Fuentes secundarias coinciden en «al menos seis dígitos decimales» y en polígono para parcelas «de más de cuatro hectáreas» distintas de ganado. **Son secundarias: no sirven de cita** |
| Art. 9, deber de información | **NO citado literalmente** | Fuentes secundarias indican que 2025/2650 permite a **micro y pequeños operadores primarios** sustituir la geolocalización por la **dirección postal** cuando esta corresponda claramente a la parcela o al establecimiento |

**Por qué no está verificada**: EUR-Lex no devolvió contenido a las herramientas de este entorno —se intentaron el
HTML consolidado, la página ELI y el PDF del DOUE, los tres vacíos—. **No se cita artículo, apartado ni redacción a
partir de resúmenes de terceros.** Queda como trabajo de una persona con acceso a EUR-Lex: basta con copiar al
expediente el texto de los dos artículos con su fecha de consolidación.

La modificación de 2025 **no es un detalle de calendario**: si la vía de la dirección postal existe y alcanza al
perfil de productores de este proyecto, cambia el supuesto de que toda parcela deba declararse por coordenadas.
**Hasta leerla, Terra Link no debe asumir ni que existe ni que no.**

### 3.2 Capa B — especificación del destino: **VERIFICADA DIRECTAMENTE**

Fuente: *EUDR Information System — Operator API Reference*, Comisión Europea. Consultada el **2026-10-15**:

- `GeoJSON File Description` — <https://eudr.webcloud.ec.europa.eu/tracesnt/help/eudr-documentation/operator/geojson-description.html>
  · la página declara **«Updated 17 August 2026»**; idéntica en el entorno de aceptación `acceptance.eudr.webcloud.ec.europa.eu`.
- `Validation Rules` — <https://eudr.webcloud.ec.europa.eu/tracesnt/help/eudr-documentation/operator/validation-rules.html>
  · referencia de API **v1.2**.

| # | Asunto | Cita de la fuente (verbatim, en su idioma) | Apartado |
| --- | --- | --- | --- |
| B1 | Área de un punto y **umbral** | «In case a point is provided for a geolocation, the area is mandatory. If the user provided no data, the value 4 (ha) is introduced by default for the area. If the commodity is not cattle and the user provided a value higher than 4ha then the system will raise an error. When provided, the area must also be higher or equal to 0.0001ha.» | *Validation Rules*, regla «Geolocation area for point» |
| B2 | Tipos de geometría | Acepta `Point`, `MultiPoint`, `Polygon`, `MultiPolygon`. «LineString and MultiLineString do not represent valid geocoordinate shapes for declaring production places and will not be accepted/processed.» `GeometryCollection` tampoco se acepta | *GeoJSON File Description* |
| B3 | Sistema de referencia | «GeoJSON uses the World Geodetic System 1984 (WGS 84) [WGS84] datum, with longitude and latitude units of decimal degrees» — EPSG:4326, longitud antes que latitud | *GeoJSON File Description* |
| B4 | **Decimales** | «The information system will truncate coordinate points to 6 decimal places before storing.» Y advierte del efecto: «the 2 following points with 10 decimals become the same after truncation: 2.348800000,48.8534345673 → 2.3488,48.853434» | *GeoJSON File Description* |
| B5 | **Huecos y autointersección** | «Polygons with holes (i.e., doughnut shapes) and shapes with crossing lines (like a figure eight for example) are not supported and will not be processed.» Propone describir esas formas con varios polígonos | *GeoJSON File Description* |
| B6 | Cierre de anillos | El primer y el último par de coordenadas deben coincidir; polígono abierto = inválido | *GeoJSON File Description* |
| B7 | Propiedades | Opcionales: `ProducerName`, `ProducerCountry` (ISO2), `ProductionPlace`, `Area` (ha del elemento `Point`). `ProducerCountry` es **obligatoria en los archivos de tipo II** (importación por producto, en interfaz); los de tipo I son por productor, por API o interfaz | *GeoJSON File Description* |
| B8 | Tamaño | «The system has a file size limit of 25 Mb for individual DDS submissions, which includes the total size of uploaded GeoJSON files» | *GeoJSON File Description* |
| B9 | Volumen | Hasta 1 000 registros de productor por producto y 10 000 por DDS | *Validation Rules* |
| B10 | Rangos y duplicados | Coordenadas fuera de ±90 / ±180 → inválidas; coordenadas duplicadas **tras truncar a 6 decimales** → inválidas | *Validation Rules* y *GeoJSON File Description* |

**Advertencia de vigencia**: una de las páginas se sirvió también desde el entorno de **aceptación**, que por
definición puede ir por delante del productivo; hoy coinciden. Antes de aprobar hay que fijar la versión citada
(API v1.2, página de 17-08-2026) y guardar copia fechada en `docs/sources/`: esta especificación **cambia sin aviso**
y el perfil debe poder decir contra qué versión evaluó.

### 3.3 Capa C — lo que Terra Link ya hace hoy

| Dato | Dónde | Hoy |
| --- | --- | --- |
| Validez técnica | `apps/api/src/plots/gis-evaluation.ts`, `TL_GIS_TECH 1.0.1` | 10 comprobaciones técnicas; `area_threshold_ha: null` y `destination_profile: null` **a propósito** |
| Importación | `apps/api/src/plots/geojson-profile.ts`, `GEOJSON_IMPORT_V1` | Solo `Polygon`/`MultiPolygon`; CRS84; sin reproyectar, sin cerrar anillos, sin reparar |
| Exportación | `apps/api/src/reports/reports-entities.ts` | `FeatureCollection` con propiedades **de Terra Link** (`plot_code`, `producer_code`, `area_declared_ha`…) y un miembro `terra_link` que declara `regulatory_profile: { status: 'PENDING', depends_on: 'D-05' }` |

---

## 4. Lo que la fuente resuelve

### 4.1 Debajo, exactamente en, y por encima del umbral

La pregunta abierta de la revisión 1 —qué pasa con **exactamente 4 ha**— **la resuelve la capa B sin ambigüedad**,
por la vía de lo que el sistema receptor rechaza: el error se levanta cuando el área declarada de un punto es
*higher than 4ha* (B1). El operador es, por tanto, **estricto**.

| Superficie de referencia | Punto | Polígono | Fundamento |
| --- | --- | --- | --- |
| **< 4 ha** (p. ej. 3,9999) | Aceptado por el destino | Aceptado | B1 |
| **= 4,000000 ha exactas** | **Aceptado**: 4 no es «higher than 4» | Aceptado | **B1, literal** |
| **> 4 ha** (p. ej. 4,0001) | **Rechazado** por el destino | Aceptado | B1 |
| **Punto sin área declarada** | Aceptado, y el destino le **asigna 4 ha por defecto** | — | B1 |
| **< 0,0001 ha** | **Rechazado**: por debajo del mínimo | Aceptado si encierra superficie | B1 |

Dos consecuencias que conviene no pasar por alto:

1. **El valor por defecto de 4 ha es una afirmación que hace el destino, no un dato de Terra Link.** Exportar un
   punto sin `Area` equivale a que el sistema receptor registre 4 ha para esa parcela. Si la superficie real se
   desconoce, eso **convierte un desconocido en un dato**, que es justo lo que las reglas del proyecto prohíben.
   Propuesta: **Terra Link nunca exporta un punto sin `Area`**; si no hay superficie declarada ni calculada, la
   parcela es **no exportable** y se dice por qué.
2. **Lo que decide el umbral es el área, no la geometría.** Un punto con `Area` de 5 ha se rechaza aunque el punto
   sea impecable. Por eso la discrepancia entre superficie declarada y calculada (§4.3) es un caso real.

### 4.2 Superficie de referencia

| Situación | Superficie de referencia propuesta | Motivo |
| --- | --- | --- |
| Polígono técnicamente válido | **Calculada**: `ST_Area(geography)/10000`, ya implementada en `TL_GIS_TECH` | Un polígono tiene superficie propia y medible |
| Solo punto | **Declarada** | Un punto no tiene superficie; es el único dato disponible |
| Solo superficie declarada, sin geometría | **No evaluable** y **no exportable** | Una superficie no es una ubicación; ya es la regla de la exportación actual |
| MultiPolygon | **Suma neta de componentes** | **Pendiente de confirmar** contra la capa B: ver §4.5 |

**Comparación sin redondeo**: comparar con 6 decimales de hectárea y presentar con 4. Que 4,00004 ha se muestre como
«4 ha» no debe cambiar el resultado. Es el mismo principio ya adoptado en D-32 para la humedad.

### 4.3 Discrepancia entre declarada y calculada

Cuando una supera el umbral y la otra no → **`REVIEW_REQUIRED`**, nunca la elección silenciosa de la favorable.
Esta regla es **capa C**: ni A ni B dicen nada sobre ella, y así debe quedar rotulada.

### 4.4 Lo que la fuente **contradice** de la revisión 1

| Supuesto de la revisión 1 | Qué dice la fuente | Efecto |
| --- | --- | --- |
| «MultiPolygon y **huecos** admitidos si la especificación los admite» | B5: los huecos **no** se procesan | Un polígono con hueco puede ser **OGC-válido** para `TL_GIS_TECH` y aun así **inaceptable** para el destino: dos dictámenes distintos, que el sistema debe mostrar por separado |
| «Al menos 6 decimales en la serialización» como requisito de representación | B4: el destino **trunca** a 6 decimales | Exportar más de 6 decimales no es un error, pero **se pierde en destino**; y la pérdida es por **truncamiento, no por redondeo** |
| Nada decía sobre vértices que colapsan | B4 y B10: dos vértices distintos pueden volverse **el mismo** al truncar, y los duplicados invalidan | Comprobación **nueva** que hoy no existe: un polígono válido para nosotros puede invalidarse al truncar |

La tercera es la más incómoda y la más útil: es un fallo que hoy no detectaríamos y que aparecería recién al
presentar el archivo.

### 4.5 Lo que sigue sin resolver, y no se inventa

| Pregunta | Por qué no se resuelve |
| --- | --- |
| Redacción exacta de «más de cuatro hectáreas» en la norma | Capa A no verificada (§3.1). B1 es coherente con el operador estricto, pero **B no interpreta A** |
| Si la vía de **dirección postal** de 2025/2650 alcanza a los productores de este proyecto | Capa A no verificada. Cambiaría el **alcance** del perfil, no solo sus parámetros |
| Cómo computa el destino la superficie de un **MultiPolygon** (suma, componente mayor, envolvente) | B documenta `Area` solo para `Point` |
| Si Terra Link debe exportar `ProducerName` | B7 la admite como opcional. Es **dato personal**: hoy la identidad va cifrada y la geometría exige `plot:read_geometry`. Es decisión de producto y de protección de datos, no técnica |
| Qué pasa con parcelas **contiguas** de un mismo productor | Ni A ni B lo resuelven en lo consultado |
| Si Terra Link llega a **presentar** el DDS o solo a **preparar** el archivo | Afecta al alcance entero: §6 |

---

## 5. Perfil candidato `EUDR_GEO_V1` (borrador, no aprobado)

| Parámetro | Valor propuesto | Capa | Fundamento |
| --- | --- | --- | --- |
| `threshold_ha` | `4` | A/B | B1; redacción de A por verificar |
| `operator` | `polygon_required_if_area_gt` (**estricto**) | B | B1: el error es «higher than 4ha» |
| Caso `= 4,000000 ha` | **Punto admitido**, con aviso de borde | B | B1 |
| `area_min_ha` | `0,0001` | B | B1 |
| Punto sin `Area` | **Terra Link no lo exporta** | C | Evitar que el destino asuma 4 ha (§4.1) |
| Superficie de referencia | Calculada si hay polígono válido; declarada si solo hay punto | C | §4.2 |
| Redondeo para comparar | Ninguno: comparar a 6 decimales, presentar a 4 | C | §4.2 |
| Discrepancia declarada/calculada | `REVIEW_REQUIRED` | C | §4.3 |
| Tipos admitidos en exportación | `Point`, `MultiPoint`, `Polygon`, `MultiPolygon` | B | B2 |
| **Huecos** | **No exportables**: el polígono no cumple el perfil de destino aunque sea OGC-válido | B | B5 |
| Autointersección | No exportable | B | B5 |
| Anillos | Cerrados; no se cierran automáticamente | B/C | B6 y la regla vigente de importación |
| CRS | WGS84 / EPSG:4326, `[lon, lat]` | B | B3 |
| Decimales de exportación | Hasta 6; más **no es error, pero se trunca en destino**, y se avisa. Nunca se **inventan** decimales que el dato no tiene | B/C | B4 |
| Colapso al truncar | Comprobación nueva: si dos vértices coinciden al truncar a 6 decimales → no cumple el perfil | B | B4/B10 |
| Propiedades exportadas | `Area` (puntos), `ProductionPlace`, `ProducerCountry`; `ProducerName` **pendiente de decisión** | B/C | B7 |
| Tamaño | Aviso al acercarse a 25 MB por DDS; 1 000 / 10 000 registros | B | B8, B9 |
| Productos | Cacao | C | Alcance del proyecto |
| Vigencia | Fecha de aprobación + **versión citada de cada capa** (CELEX y fecha de consolidación; API v1.2 / página de 17-08-2026) | C | Un cambio en cualquiera de las dos crea `EUDR_GEO_V2` |

---

## 6. Qué cambiaría en el sistema si se aprueba

1. **Regla nueva `EUDR_GEO_V1`, separada de `TL_GIS_TECH`.** Tercer bloque «Perfil de destino» con resultado propio:
   `CUMPLE_PERFIL` / `NO_CUMPLE` / `NO_EVALUABLE`. **Nunca «conforme EUDR».** Las evaluaciones técnicas existentes no
   cambian ni se invalidan: solo cambian si cambia **su** regla.
2. **Dos dictámenes visibles a la vez** en la ficha de parcela, porque pueden discrepar: el polígono con hueco es
   técnicamente válido y no cumple el perfil. Mostrar uno solo haría creer que hay un único veredicto.
3. **`plots_valid` de P0-030** deja de ser `CRITERION_UNDEFINED` y pasa a contar **contra un criterio nombrado y
   versionado**. Sigue sin ser un indicador de conformidad.
4. **Exportación con perfil de destino** junto a la técnica actual, no en su lugar: propiedades de B7, aviso de
   truncamiento, y parcelas no exportables **listadas con su motivo** en vez de omitidas en silencio.
5. **`GEOLOCATION_PROFILE` del expediente** pasa de «no evaluable» a evaluable. Los otros cinco requisitos de la
   fila 14 de la matriz **siguen igual**: D-05 levanta uno, no el bloqueo.
6. **P0-010** puede cerrar «umbral debajo/igual/encima probado tras aprobar perfil»; **P0-009**, «perfil destino».

Riesgo que debe quedar escrito en la aprobación: aprobar con la **capa A sin verificar** deja decisiones de debida
diligencia apoyadas en un umbral cuya redacción legal no se leyó. Por eso la aprobación debe **adjuntar el texto** de
los dos artículos, no referenciarlos.

---

## 7. Qué pruebas lo demostrarían

Ninguna existe hoy; todas son **posteriores** a la aprobación.

| # | Caso | Tipo | Qué demuestra |
| --- | --- | --- | --- |
| 1 | Polígono de 3,9999 / 4,000000 / 4,0001 ha | I | El operador **estricto** en los tres lados del umbral |
| 2 | Punto con `Area` 3,5 / 4 / 4,5 ha | I | Que el caso `= 4` **no** se rechaza y el de 4,5 sí |
| 3 | Punto **sin** superficie conocida | I | Que Terra Link **no lo exporta**, en vez de dejar que el destino asuma 4 ha |
| 4 | Punto con `Area` 0,00005 ha | I | Mínimo de B1 |
| 5 | Polígono de 4,2 ha con superficie declarada de 3,8 ha | I | `REVIEW_REQUIRED`, sin elegir la cifra favorable |
| 6 | Polígono **con hueco**, OGC-válido | I | Dos dictámenes: técnico `VALID`, perfil `NO_CUMPLE` (B5) |
| 7 | Polígono cuyos vértices **colapsan al truncar** a 6 decimales | U + I | La comprobación nueva de B4/B10 |
| 8 | Geometría con 9 decimales | U | Que se exporta y se **avisa** del truncamiento; que no se redondea |
| 9 | Geometría con 4 decimales | U | Que **no se inventan** decimales para llegar a 6 |
| 10 | MultiPolygon cuya suma supera el umbral y cuyos componentes no | I | Queda **pendiente** mientras §4.5 no se resuelva: la prueba debe fijar la regla, no adivinarla |
| 11 | Exportación completa de una organización | I + N | Parcelas no exportables **listadas con motivo**; aviso de tamaño |
| 12 | Versión importada y versión capturada con la misma geometría | I | Mismo dictamen de perfil: el origen del dato no cambia el resultado |
| 13 | Recorrido integral | I | La transición 4 deja de devolver `DESTINATION_PROFILE_NOT_EVALUATED` |

---

## 8. Qué falta para aprobar, y de quién depende

| # | Pendiente | De quién | Bloquea |
| --- | --- | --- | --- |
| 1 | **Texto literal** de la definición de geolocalización y del deber de información, del consolidado vigente, adjuntado al expediente con su fecha | Responsable regulatorio con acceso a EUR-Lex | Toda la capa A |
| 2 | Confirmar si la vía de **dirección postal** de 2025/2650 alcanza a los productores del proyecto | Responsable regulatorio | El **alcance** del perfil |
| 3 | Copia fechada de la especificación de destino en `docs/sources/`, con su versión | Equipo | Que el perfil pueda decir contra qué versión evalúa |
| 4 | Decisión sobre `ProducerName` y datos personales en la exportación | Producto + protección de datos | La propiedad B7 |
| 5 | Regla del MultiPolygon en destino | Consulta al servicio de asistencia del sistema receptor | Caso de prueba 10 |
| 6 | Decidir si Terra Link **presenta** el DDS o solo **prepara** el archivo | Producto | El alcance de §6.4 |

**Nada de lo anterior se da por cumplido en este documento.** Mientras los puntos 1 y 2 sigan abiertos, lo que hay es
un perfil **técnicamente fundado en la capa B** y **sin fundamento legal verificado**, que es exactamente como debe
presentarse a quien lo apruebe.

---

## 9. Relación con otras decisiones

**D-05 no toca D-07.** La severidad de riesgo y el catálogo `risk_rule_sets` (`NOT_APPROVED`) siguen siendo decisión
aparte, igual que D-09 parte B, D-34, D-37 y D-42. Aprobar D-05 levantaría **un** requisito de los seis del
expediente y **dos** indicadores de reportes; no acerca el `READY` ni el despacho.
