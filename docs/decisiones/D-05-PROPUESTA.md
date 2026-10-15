# D-05 — Perfil de destino geoespacial. Propuesta NO APROBADA

Estado: **PROPUESTA**. Nada de este documento está activo en el código: `TL_GIS_TECH 1.0.1` sigue informando
«Perfil de destino: no evaluado (D-05)», el recorrido integral sigue devolviendo
`DESTINATION_PROFILE_NOT_EVALUATED`, `plots_valid` sigue en `CRITERION_UNDEFINED` y el requisito
`GEOLOCATION_PROFILE` del expediente sigue sin evaluar. **No se ha cambiado ninguna compuerta, indicador ni
conclusión regulatoria.** D-07 sigue independiente.

**Revisión 3 — 2026-10-15.** Qué cambia respecto de la revisión 2:

| Cambio | Detalle |
| --- | --- |
| **Se corrige una fuente mal identificada** | La revisión 2 citaba «API **v1.2**». El número existe, pero es la versión del **documento**, no del servicio (que es **V3**): §1.1 |
| **La norma SÍ se pudo leer** | La revisión 2 la daba por inaccesible. Se recuperó el texto oficial completo por otra vía: §1.3 y §5 |
| **D-05 se parte en dos decisiones** | **A** perfil técnico (decidible ahora) y **B** aplicabilidad jurídica (no decidible por el equipo): §2 |
| **Se corrigen los cálculos** | La regla «comparar a 6 decimales» de la revisión 2 era **incorrecta**: §4 |
| **No se amplía el modelo** | MultiPoint queda declarado como **capacidad no implementada**, no como algo a inventar: §3.4 |

---

## 1. Fuentes: qué es cada una, qué versión y qué acredita

### 1.0 Tres capas que no deben mezclarse

| Capa | Qué es | Qué puede decidir | Qué NO puede decidir |
| --- | --- | --- | --- |
| **A · Norma** | Reglamento (UE) 2023/1115 consolidado | Qué obliga la ley a declarar y quién debe hacerlo | Cómo se serializa un archivo |
| **B · Especificación del destino** | Documentación del *EUDR Information System* | Qué acepta y qué rechaza el sistema receptor | Qué es lícito o conforme |
| **C · Regla interna de Terra Link** | `TL_GIS_TECH`, `GEOJSON_IMPORT_V1`, política de producto | Qué exige Terra Link y cuándo avisa | Qué exige la ley ni qué acepta TRACES |

Cada regla de este documento lleva su capa. Que B acepte un archivo no significa que A se cumpla; que C marque
`VALID` no significa ninguna de las dos.

### 1.1 Corrección: «v1.2» es la versión del DOCUMENTO, no de la API

La revisión 2 describía la documentación del destino como «referencia de API **v1.2**». **El número existe; la
etiqueta era falsa.** Comprobado sobre el HTML guardado, «1.2» aparece en dos lugares y ambos designan el
**documento**:

| Dónde | Cadena literal |
| --- | --- |
| Enlace de descarga, en las cuatro páginas | `./pdf/EUDR Operator API Reference v1.2.pdf` |
| Configuración del sitio, en las cuatro páginas | `"version": "1.2"` |

El PDF se descargó para confirmarlo: 6 686 345 bytes, sha256
`317829e50b42c25ed0a61702af6c68e17d7117195952074c028dd2034774348a`. No se guarda en el repositorio por tamaño —su
contenido es el de las cuatro páginas HTML, que sí están guardadas— y el hash permite recomprobarlo.

El error de la revisión 2 no fue inventar un número: fue **llamar «versión de la API» a la versión del documento**,
que es justamente la mezcla que esta revisión deshace. Hay **cuatro** identificadores independientes:

| # | Qué | Valor | Fuente | Para qué sirve |
| --- | --- | --- | --- | --- |
| 1 | **Versión del servicio** | **V3** (`…/ws/EUDRDueDiligenceStatementServiceV3`, `…/ws/EUDRSimplifiedDeclarationServiceV3`) | `index.html` §*API version history* | **Integrar** |
| 2 | **Versión del documento** | **1.2** (*EUDR Operator API Reference*) | enlace al PDF y `"version"` del sitio | **Citar** |
| 3 | **Fecha de una página** | **17-08-2026**, solo la de GeoJSON; las otras tres **no publican fecha** | `geojson-description.html` | Fechar una regla concreta |
| 4 | **Revisión del perfil interno** | `EUDR_GEO_V1` | este documento | Versionar lo nuestro |

Dato adicional de la misma fuente: V1 y V2 **se retiran** con la salida de V3, y el rediseño de V3 lo motivó el
Reglamento (UE) **2025/2650** —nuevos tipos de actor, Declaración Simplificada y declaraciones agrupadas—
(`index.html`, `change-log.html`).

El perfil citará los cuatro por separado y nunca uno en lugar de otro.

### 1.2 Advertencias que hace la propia fuente B

- «Concerning the amendment procedure of the Implementing Regulation (EU) **2024/3084** that is currently
  undergoing, **this version of documentation may not be final and will be adapted as needed**.»
- «Readers are invited to **regularly verify whether new specifications are published**, as services and their
  behaviour may evolve.»
- Varios límites se enuncian como **«presently set to»** (25 Mb, 1 000 y 10 000 productores): son valores
  **configurables del servicio**, no constantes de la especificación. El perfil no debe grabarlos como fijos.

### 1.3 Copias fechadas y su huella

Ambas capas quedan guardadas en el repositorio, con URL, fecha de descarga, tamaño y **sha256**:

| Capa | Carpeta | Contenido |
| --- | --- | --- |
| **B** | `docs/sources/eudr-is-2026-10-15/` | `index.html`, `change-log.html`, `validation-rules.html`, `geojson-description.html` + `MANIFIESTO.md` |
| **A** | `docs/sources/eudr-norma-2026-10-15/` | `02023R1115-20251226.xhtml`, `32025R2650.xhtml` + `MANIFIESTO.md` |

### 1.4 Tres grados de certeza, que este documento distingue siempre

| Grado | Qué significa | Cómo se marca |
| --- | --- | --- |
| **DOC** | Comportamiento **documentado** por el destino. Verificable contra el hash de la copia | «B*n* (DOC)» |
| **SRV** | Comportamiento **comprobado contra el servicio real** | **Ninguna regla de este documento lo es** |
| **TL** | Regla **propuesta por Terra Link**, que no exige ninguna fuente externa | «TL» |

**Ninguna afirmación de este documento es SRV.** Nadie ha importado un archivo en TRACES desde Terra Link, ni
contra producción ni contra aceptación. **Leer la documentación no demuestra una importación aceptada.** Pasar de
DOC a SRV exige credenciales, un entorno de aceptación y autorización: es trabajo aparte, con su propio riesgo
(enviar geometrías de productores a un tercero), emparentado con el de D-09 parte B y **no autorizado aquí**.

---

## 2. D-05 se parte en dos decisiones independientes

La revisión 2 mezclaba el formato técnico con la aplicabilidad jurídica y acababa condicionando todo a «si Terra
Link presenta el DDS o solo prepara el archivo». **Eso era un error de alcance**: preparar un archivo bien formado
no es presentarlo, y la presentación automática tiene su propio alcance, su propia autorización y su propio riesgo.

| | **D-05.A — Perfil técnico de intercambio** | **D-05.B — Aplicabilidad jurídica** |
| --- | --- | --- |
| Qué decide | Cómo prepara Terra Link un GeoJSON contra una **versión documentada** del destino, y qué parcelas no puede preparar | A qué actores y operaciones de Terra Link alcanzan las obligaciones del Reglamento |
| Quién puede decidirla | **El equipo**, con la fuente B fechada | **Solo** un responsable regulatorio |
| Estado | **Decidible ahora**: §3 y §4 la dejan completa | **No decidible aquí**: §5 |
| Qué desbloquea | «Perfil destino» de P0-009 · «umbral debajo/igual/encima» de P0-010 · `plots_valid` de P0-030 | Qué significa el resultado, y el requisito `GEOLOCATION_PROFILE` del expediente |
| Qué **no** incluye | **Presentar** el DDS, llamar al servicio, obtener credenciales | — |

**Dependencia real**: A no depende de B. Un archivo puede estar bien formado para el destino aunque todavía no se
sepa quién debe presentarlo. Lo que **sí** depende de B es la **lectura** del resultado: «cumple el perfil» nunca
podrá significar «conforme» mientras B siga abierta, y así debe mostrarse.

---

## 3. D-05.A — Lo que dice la fuente B, literal

Citas verbatim de las copias de `docs/sources/eudr-is-2026-10-15/`.

### 3.1 Umbral, área y puntos

| # | Cita | Página |
| --- | --- | --- |
| **B1 (DOC)** | «In case a point is provided for a geolocation, the area is mandatory. If the user provided no data, the value 4 (ha) is introduced by default for the area. If the commodity is not cattle and the user provided a value higher than 4ha then the system will raise an error. When provided, the area must also be higher or equal to 0.0001ha.» | *Validation Rules*, «Geolocation area for point» |
| **B2 (DOC)** | «The property "Area" for points is optional. If it is not provided, then it will be set by default to "4" (four) hectares when processed by the EUDR system.» | *GeoJSON File Description* |
| **B3 (DOC)** | Recomendación de tamaño de archivo: «Using single geolocation points to represent plots under 4 hectares, rather than creating polygons» | *GeoJSON File Description*, §errores comunes |

**B3 es una recomendación de optimización, no una regla de validación.** La revisión 2 las trataba casi igual.

### 3.2 Geometría

| # | Cita | Página |
| --- | --- | --- |
| **B4 (DOC)** | Tipos: `Point` (dos valores), `MultiPoint` (dos o más puntos), `Polygon` («at least four pairs of coordinates»), `MultiPolygon` («two or more polygon definitions») | *GeoJSON File Description* |
| **B5 (DOC)** | «geometry types of "LineString" and "MultiLineString" do not represent valid geocoordinate shapes for declaring production places and will not be accepted/processed» | ídem |
| **B6 (DOC)** | «Polygons with holes (i.e., doughnut shapes) and shapes with crossing lines (like a figure eight for example) are not supported and will not be processed. If a doughnut shape is needed, it can be defined by combining two half-doughnut shaped polygons.» | ídem |
| **B7 (DOC)** | «the first and last point's coordinates of polygons are the same (they coincide geographically to close the shape)» | ídem |
| **B8 (DOC)** | Error 6: «Coordinates representing straight lines» (polígono degenerado) | ídem, §errores comunes |
| **B9 (DOC)** | Error 2: «Overlapping sides: Internal overlap or holes where part of the polygon folds inward, creating a concave shape within the boundary are not accepted» | ídem |

**B9 está redactado de forma ambigua** —parece decir que una forma cóncava no se acepta, lo que sería mucho más
restrictivo que la invalidez OGC— y **no se asume ninguna interpretación**: ver §6, incertidumbre U3.

### 3.3 Coordenadas, decimales y truncamiento

| # | Cita | Página |
| --- | --- | --- |
| **B10 (DOC)** | «GeoJSON uses the World Geodetic System 1984 (WGS 84) [WGS84] datum, with longitude and latitude units of decimal degrees»; EPSG:4326; «The order of elements must follow longitude, latitude» | *GeoJSON File Description* |
| **B11 (DOC)** | «The information system will **truncate** coordinate points to 6 decimal places before storing. It is superfluous/wasteful to send a higher resolution, and may, **in extreme cases, even result in invalid geometries where the original is valid**.» | ídem |
| **B12 (DOC)** | «Latitude and longitude values of coordinates must be in range. Note that if there are more than 6 decimals for the coordinates, the system truncate the value to 6 decimals.» | *Validation Rules* |
| **B13 (DOC)** | Error 7, con **sus tres ejemplos literales**, dos de ellos **negativos**: `2.348800000,48.8534345673 → 2.3488,48.853434` · `-5.8227391234,144.2567071234 → -5.822739,144.256707` · `-5.8227394567,144.2567074567 → -5.822739,144.256707` | *GeoJSON File Description* |

De B13 se lee que el truncamiento es **hacia cero** (`-5.8227391234 → -5.822739`, no `-5.822740`). Importa para
Ecuador, cuyas longitudes son **siempre negativas** y cuyas latitudes cruzan el cero.

### 3.4 Propiedades y variantes

| # | Cita / contenido | Página |
| --- | --- | --- |
| **B14 (DOC)** | Opcionales: `ProducerName`, `ProducerCountry` (ISO2), `ProductionPlace`, `Area`. «Any other properties that are syntactically valid but not included in the optional properties list above, will be ignored» | *GeoJSON File Description* |
| **B15 (DOC)** | **Tipo I**: API e interfaz, a nivel de productor. **Tipo II**: interfaz, a nivel de producto, agrupa productores por `ProducerName` y `ProducerCountry`, e **incluye `ProducerCountry` por Feature** | ídem |
| **B16 (DOC)** | Recomendación: proveer `ProductionPlace` | ídem |
| **B17 (DOC)** | Error 14: `"Area": "3"` (texto) da área **0**, porque se espera un número | ídem |
| **B18 (DOC)** | Error 9: nombres de propiedad sensibles a mayúsculas (`productionplace` ≠ `ProductionPlace`) | ídem |

### 3.5 Límites configurables

**B19 (DOC)**: 25 Mb por DDS; 1 000 productores por producto; 10 000 por DDS; 2 000 DDS referenciados; todos
enunciados como «presently set to».

### 3.6 Lo que Terra Link soporta hoy, y lo que no

| Tipo | Esquema `plot_versions` | Importación `GEOJSON_IMPORT_V1` | Exportación actual | Admitido por el destino |
| --- | --- | --- | --- | --- |
| `Point` | **Sí** (`geometry_type = 'POINT'`) | **No** | Sí | Sí, con `Area` |
| `Polygon` | **Sí** | **Sí** | Sí | Sí |
| `MultiPolygon` | **Sí** | **Sí** | Sí | Sí |
| `MultiPoint` | **NO**: el `CHECK` del esquema solo admite `POINT`, `POLYGON`, `MULTIPOLYGON` | No | No | Sí |

**`MultiPoint` queda declarado como capacidad NO IMPLEMENTADA**, no como una ampliación pendiente. Que el destino
lo admita no es razón para añadirlo: Terra Link no tiene hoy una parcela representada por varios puntos, y no la
tendrá por esta decisión.

Y, en particular: **no se propone ninguna regla para repartir `Area` entre varios puntos de un `MultiPoint`.** La
fuente documenta `Area` como propiedad **del elemento `Point`** (B14) y no dice qué ocurre con un `MultiPoint`.
**Inventarlo sería fabricar una regla**; queda como incertidumbre U2 en §6.

---

## 4. D-05.A — Los cálculos, corregidos

### 4.1 La comparación con 4 ha

**Regla propuesta (TL), corregida respecto de la revisión 2:**

> La comparación con el umbral usa **el valor de referencia tal como está almacenado**, sin ninguna reducción
> previa. El redondeo de presentación es una operación **posterior e independiente** que **nunca** alimenta la
> comparación.

La revisión 2 decía «comparar con 6 decimales de hectárea, presentar con 4». **Era incorrecto por dos motivos**:

1. Reducir a 6 decimales *antes* de comparar es una operación de presentación metida en la decisión. Con el
   operador estricto, un valor que redondee a `4.000000` desde arriba cambiaría de lado del umbral.
2. **6 decimales no es la precisión de ambos datos.** Los dos valores de referencia se almacenan distinto.

### 4.2 Precisión y límites del dato almacenado

| Dato | Columna | Tipo | Decimales | Quién lo produce |
| --- | --- | --- | ---: | --- |
| Superficie **declarada** | `plot_versions.area_declared_ha` | `numeric(12,4)` | **4** | Persona |
| Superficie **calculada** | `plot_versions.area_calculated_ha` | `numeric(14,6)` | **6** | `ST_Area(geography)/10000` |

Limitaciones que deben quedar escritas en el perfil, no descubrirse después:

- **La superficie declarada está cuantizada en 0,0001 ha.** No puede expresar `4,00001`: el escalón mínimo por
  encima de 4 es `4,0001`. La API **rechaza** más de 4 decimales (`@IsNumber({ maxDecimalPlaces: 4 })`), **no
  redondea** — coherente con la regla del proyecto de no redondear al escribir (D-32).
- **La superficie calculada tiene 6 decimales de representación, que no son 6 decimales de exactitud.**
  `ST_Area(geography)` calcula sobre el elipsoide WGS84 y arrastra el error de la propia captura (GPS, trazado).
  **Precisión de representación ≠ exactitud de medición**, y una parcela de 4,000001 ha calculadas está dentro del
  error de cualquier captura de campo. Por eso §4.4 propone una **banda de revisión**, no una tolerancia que
  mueva el umbral.
- **Un `POINT` nunca tiene superficie calculada**: el `CHECK` del esquema lo impide
  (`geometry_type IS DISTINCT FROM 'POINT' OR area_calculated_ha IS NULL`). Para un punto, el único valor de
  referencia posible es el **declarado**, con sus 4 decimales.

### 4.3 Superficie de referencia

| Situación | Referencia | Capa |
| --- | --- | --- |
| Polígono o multipolígono técnicamente válido | **Calculada** | TL |
| Solo punto | **Declarada** (es la única que existe) | TL |
| Solo superficie declarada, sin geometría | **No evaluable** y **no exportable** | TL |
| Punto **sin** superficie declarada | **No exportable**: ver §4.6 | TL |

### 4.4 Resultado por tramo

Con el operador **estricto** (`> 4`), que ahora está respaldado por **las dos capas**: B1 (el error es *higher than
4ha*) y A1 (§5.1: «more than four hectares»).

| Referencia | Punto | Polígono | Resultado del perfil |
| --- | --- | --- | --- |
| `< 4` | Admitido | Admitido | `CUMPLE_PERFIL` |
| `= 4` exacto (`4.0000` declarado o `4.000000` calculado) | **Admitido** | Admitido | `CUMPLE_PERFIL`, con aviso de borde |
| `> 4` | **No cumple**: exige polígono | Admitido | `NO_CUMPLE` con motivo `POLYGON_REQUIRED_ABOVE_THRESHOLD` |
| `< 0,0001` | **No cumple** (mínimo de B1) | Admitido si encierra superficie | `NO_CUMPLE` con motivo `AREA_BELOW_MINIMUM` |

**Banda de revisión (TL)**: cuando la referencia calculada cae en `[4 − δ, 4 + δ]`, el perfil marca además
`NEAR_THRESHOLD` para revisión humana, **sin cambiar el resultado**. `δ` queda por fijar con quien decida; es un
aviso, no una tolerancia, y **no mueve el umbral**.

### 4.5 Discrepancia entre declarada y calculada

Si una supera el umbral y la otra no → **`REVIEW_REQUIRED`**. Nunca se elige en silencio la favorable. Regla **TL**:
ni A ni B dicen nada sobre esto, y así quedará rotulado en pantalla.

### 4.6 Punto sin superficie: no exportable

Por B1/B2, un punto sin `Area` hace que **el destino registre 4 ha**. Eso **convierte un desconocido en un dato
afirmado**, y es exactamente lo que las reglas del proyecto prohíben. Regla **TL**: Terra Link **no exporta** un
punto sin superficie declarada; la parcela sale en la lista de no exportables con su motivo
(`AREA_UNKNOWN_FOR_POINT`).

### 4.7 Truncamiento de coordenadas ≠ cálculo de superficie

Son dos cosas distintas y la revisión 2 las dejaba juntas:

| | Truncamiento (B11–B13) | Cálculo de superficie |
| --- | --- | --- |
| Sobre qué actúa | Las **coordenadas**, en el sistema de destino | La **geometría almacenada**, en Terra Link |
| Quién lo hace | El destino, al guardar | PostGIS, al evaluar |
| Decimales | 6, truncando **hacia cero** | `numeric(14,6)`, sobre elipsoide |
| Efecto en el umbral | **Desconocido**: ver U1 en §6 | Es el valor de referencia |

**Terra Link no recalcula la superficie a partir de coordenadas truncadas**, porque no sabe cómo la calcula el
destino para polígonos (U1). Lo que sí hace es **avisar** cuando truncar cambiaría la geometría (§4.8).

### 4.8 Simulación del truncamiento: qué se comprueba y qué no se toca

Regla **TL**, derivada de B11 («may, in extreme cases, even result in invalid geometries where the original is
valid»). Al preparar la exportación, y **solo sobre una copia en memoria**:

1. Truncar cada coordenada a 6 decimales **hacia cero** (el sentido que muestran los ejemplos de B13), con los
   **signos negativos** tratados igual: es el caso normal en Ecuador.
2. Construir la geometría truncada y **evaluar su validez con PostGIS**, igual que se evalúa la original.
3. Comprobar sobre la truncada: vértices que **colapsan**, anillos que dejan de encerrar superficie (B8) y
   cualquier invalidez que la original no tenía.
4. Si algo de eso ocurre → la parcela **no cumple el perfil**, con el motivo exacto.

> **La geometría almacenada no se modifica, no se repara y no se sustituye.** Ni al simular, ni al exportar, ni al
> detectar un problema. El perfil **informa**; corregir una geometría es crear una **versión nueva**, que es una
> acción humana con su propio registro. Esto es la regla de versiones del proyecto, no una elección de D-05.

### 4.9 Cierre del anillo ≠ vértices que colapsan

La revisión 2 no distinguía dos cosas que se parecen y son opuestas:

| | **Cierre del anillo** | **Colapso por truncamiento** |
| --- | --- | --- |
| Qué es | La **última** posición repite la **primera** | Dos posiciones **distintas** se vuelven iguales al truncar |
| Es obligatorio | **Sí**: B7, y un polígono abierto es el error 4 | **No**: es el error 7 |
| Qué hace el perfil | **Exigirlo**, y **excluirlo** de toda comprobación de duplicados | **Detectarlo** y rechazar la exportación |

La comprobación de duplicados se aplica, por tanto, a las posiciones `[0 … n−2]` de cada anillo, **nunca** al par
formado por la primera y la última. Confundirlas daría por inválido **todo** polígono bien cerrado.

También son casos distintos, y se nombran por separado: posiciones **adyacentes iguales en el interior** del anillo
(duplicado ya en el original, sin truncar) y posiciones que **solo** colisionan tras truncar.

---

## 5. D-05.B — La norma, ahora sí leída

La revisión 2 registró la norma como inaccesible. **Se recuperó.** La causa del fallo anterior era concreta:
`eur-lex.europa.eu` responde **HTTP 202 con un desafío JavaScript de AWS WAF** a cualquier petición automatizada.
La vía que funciona es el servicio de la Oficina de Publicaciones
(`https://publications.europa.eu/resource/celex/<CELEX>`, con `Accept: application/xhtml+xml`).

**Documento**: `02023R1115 — EN — 26.12.2025 — 002.001`, modificado por **M1** = Reg. (UE) 2024/3234 (19-12-2024,
OJ L 3234, 23.12.2024) y **M2** = Reg. (UE) 2025/2650 (19-12-2025, OJ L 2650, 23.12.2025). Copia y hash en
`docs/sources/eudr-norma-2026-10-15/`.

> **Límite que declara el propio documento**: «This text is meant purely as a documentation tool and has no legal
> effect. […] The authentic versions […] are those published in the Official Journal.» Sirve para **citar con
> exactitud**, no para fundar una conclusión jurídica.

### 5.1 Lo que dice, verbatim

| # | Artículo | Cita |
| --- | --- | --- |
| **A1** | **Art. 2(28)** «geolocation» | «the geographical location of a plot of land described by means of latitude and longitude coordinates corresponding to at least one latitude and one longitude point and **using at least six decimal digits**; for plots of land of **more than four hectares** used for the production of the relevant commodities other than cattle, this shall be provided **using polygons** with sufficient latitude and longitude points to describe the perimeter of each plot of land» |
| **A2** | **Art. 2(27)** «plot of land» | «land within **a single real-estate property**, as recognised by the law of the country of production, which enjoys sufficiently homogeneous conditions to allow an evaluation of the aggregate level of risk…» |
| **A3** | **Art. 9(1)(d)** | «the geolocation of **all plots of land** where the relevant commodities […] were produced, as well as **the date or time range of production**; where a relevant product contains or has been made with relevant commodities produced on different plots of land, the geolocation of all different plots of land shall be included…» |
| **A4** | **Art. 2(15)** «operator» (▼M2) | «any natural or legal person who, in the course of a commercial activity, **places relevant products on the market or exports them**, excluding downstream operators» — y «placing on the market» es «the **first making available** of a relevant commodity or relevant product **on the Union market**» (Art. 2(16)) |
| **A5** | **Art. 2(15a)** «micro or small primary operator» (▼M2) | «an **operator** who is a natural person or a micro-undertaking or small undertaking, within the meaning of Article 3(1) and Article 3(2), first subparagraph, respectively, of Directive 2013/34/EU […] **established in a country classified as low risk in accordance with Article 29** […] and who […] places on the market or exports relevant products that **this operator itself has grown, harvested, obtained from or raised** on relevant plots of land […] located **in that country**» |
| **A6** | **Art. 4a(5)** (▼M2) | «**For micro or small primary operators**, the geolocation referred to in Article 9(1), point (d), **may be replaced by the postal address** of all plots of land or the postal address of the establishment from which the relevant commodities […] were produced.» |
| **A7** | **Art. 38(2) y (3)** | Aplicación desde el **30-12-2026**; desde el **30-06-2027** para personas físicas y micro/pequeñas empresas establecidas como tales a 31-12-2024, salvo productos ya cubiertos por el Reglamento (UE) n.º 995/2010 |

### 5.2 Lo que esto confirma, y lo que corrige

- **El umbral estricto queda respaldado por la norma**, no solo por el comportamiento del receptor: A1 dice «more
  than four hectares». B1 es **coherente** con A1, que es distinto de que B1 **interprete** A1.
- **Los 6 decimales aparecen en las dos capas con sentidos opuestos y compatibles**: A1 exige **al menos** seis;
  B11 **trunca** a seis. Seis es, a la vez, el mínimo legal y el máximo útil. **Exportar menos de 6 decimales
  incumpliría A1**, y eso es un hallazgo nuevo que la revisión 2 no tenía.
  Hoy la exportación técnica emite `ST_AsGeoJSON(geometry, 17)`: **17 decimales**. Cumple el mínimo y desperdicia
  lo demás; el perfil deberá fijar 6 **sin inventar decimales** que el dato no tenga (§7, regla T8).
- **A3 añade un requisito que ninguna revisión anterior había recogido**: junto a la geolocalización hay que
  declarar **la fecha o el rango temporal de producción**. Terra Link ya registra período de cosecha por entrega
  (P0-012), pero **no está vinculado al perfil de la parcela** ni se exporta en el GeoJSON. Es trabajo **nuevo** a
  nombrar, no a silenciar.
- **A2 toca la cuestión del MultiPolygon**: la parcela se define como terreno dentro de **una sola propiedad
  inmobiliaria**. No resuelve si dos recintos no contiguos de la misma propiedad son una parcela o dos, pero
  **acota la pregunta** y la saca del terreno de la opinión.

### 5.3 La vía de la dirección postal: NO es «para cualquier pequeño productor»

La revisión 2 la enunció de forma demasiado laxa. **La norma la condiciona a ser un «micro or small primary
operator», y esa figura exige TODAS estas condiciones a la vez** (A5, y A4 para el término base):

1. Ser **«operator»** en el sentido de A4: quien **coloca por primera vez en el mercado de la Unión** o **exporta
   desde la Unión**. Un productor o una cooperativa de Ecuador que vende a un importador europeo **normalmente no
   es el operador**: lo es el importador. Esta sola condición puede excluir a la mayoría de los usuarios de
   Terra Link, y **no se asume en ninguna dirección**.
2. Ser **persona física o micro/pequeña empresa** según el Art. 3(1) o 3(2), párrafo primero, de la **Directiva
   2013/34/UE** — umbrales que hay que comprobar, con la regla especial de A5 para quien los supere solo en parte.
3. Estar **establecido en un país clasificado como de riesgo bajo conforme al Art. 29**.
4. Colocar o exportar productos que **ese mismo operador** haya cultivado, cosechado u obtenido en parcelas
   **situadas en ese país**.
5. Y, operativamente, presentar la **Declaración Simplificada** del Art. 4a por el servicio correspondiente
   (`EUDRSimplifiedDeclarationServiceV3`).

**Dato que falta y que no se inventa**: el Art. 29 establece que, de partida, **todos los países tienen riesgo
estándar**, y que la Comisión publica por **actos de ejecución** la lista de los de riesgo bajo o alto. **Si
Ecuador está hoy en esa lista, y en qué categoría, no se ha verificado en esta sesión.** Sin ese dato, la
condición 3 está sin comprobar y **la vía postal no puede darse por disponible ni por descartada**.

---

## 6. Incertidumbres que las fuentes no resuelven

No se propone regla para ninguna. Se nombran para que quien decida sepa qué está sin cubrir.

| # | Incertidumbre | Por qué no se resuelve | Efecto si se adivinara |
| --- | --- | --- | --- |
| **U1** | Cómo calcula el destino la superficie de un **polígono**, y si lo hace **antes o después** de truncar | B documenta `Area` solo para `Point`. No hay regla publicada para polígonos | Un polígono junto al umbral podría cambiar de lado sin que lo sepamos |
| **U2** | Cómo se interpreta `Area` en un **MultiPoint** | B14 la define para `Point`. No se dice nada de varios puntos | Repartirla o duplicarla serían reglas inventadas |
| **U3** | Alcance real de B9 («overlapping sides… concave shape») | Redacción ambigua: leída al pie de la letra rechazaría polígonos cóncavos válidos | Rechazaríamos parcelas legítimas, o aceptaríamos las que el destino rechaza |
| **U4** | Los ejemplos oficiales de **Tipo II** llevan `"Area"` en features de tipo **`Polygon`**, con valores como `20813.59` | El texto dice que `Area` es del elemento `Point`. El propio documento es inconsistente | Enviar o no `Area` en polígonos a ciegas |
| **U5** | El ejemplo de `Feature`+`Point` del documento trae `"coordinates": [[-105.029865, 40.622831]]`, con un nivel de anidamiento de más | Es un error del documento respecto de RFC 7946 | Copiar el ejemplo produciría un archivo malformado |
| **U6** | Parcelas **contiguas** o no contiguas del mismo productor: ¿una parcela o varias? | A2 acota pero no resuelve; B no lo trata | Agrupar o separar mal cambiaría qué parcelas superan el umbral |
| **U7** | Si Ecuador está clasificado como riesgo bajo (Art. 29) | No verificado en esta sesión | Daría por disponible una vía que quizá no lo está |
| **U8** | Comportamiento **real** del servicio frente a cualquiera de las reglas B | Ninguna comprobación SRV: §1.4 | Confundir documentación con comportamiento |

**U1, U3, U4 y U5 se resuelven preguntando** al contacto técnico que la propia documentación publica. **U8 se
resuelve con un ensayo contra el entorno de aceptación**, que requiere credenciales y autorización y **no está
autorizado**: es un trabajo emparentado con D-09 parte B.

---

## 7. Propuesta mínima para decidir D-05.A

Cada regla lleva su capa: **B#** si la exige el receptor, **TL** si es nuestra. El perfil se identifica como
`EUDR_GEO_V1`, y declara contra qué versión del destino evalúa, con los cuatro identificadores separados:
**servicio V3**, **documento v1.2**, página GeoJSON de **17-08-2026**, y el **sha256** de cada copia guardada.

| # | Regla | Valor propuesto | Capa |
| --- | --- | --- | --- |
| **T1** | Tipos exportables | `Point`, `Polygon`, `MultiPolygon` | **TL** (subconjunto de B4) |
| **T2** | `MultiPoint` | **Capacidad no implementada**, declarada como tal. No se añade | **TL** |
| **T3** | Umbral | `4` ha, operador **estricto** (`>`) | **A1 + B1** |
| **T4** | Caso `= 4` exacto | **Admitido**, con aviso de borde | **A1 + B1** |
| **T5** | Mínimo de área para punto | `0,0001` ha | **B1** |
| **T6** | Punto sin superficie | **No exportable**, motivo `AREA_UNKNOWN_FOR_POINT` | **TL** |
| **T7** | Comparación | Sobre el valor **almacenado**, sin reducción previa. Presentación aparte | **TL** |
| **T8** | Decimales de coordenadas | Exportar **6**. **Nunca menos** (A1 exige al menos seis) y **nunca inventados**: si el dato tiene 4, se informa y la parcela queda señalada | **A1 + B11** |
| **T9** | Simulación de truncamiento | Truncar **hacia cero** sobre copia; validar la truncada; **no tocar el original** | **TL**, derivada de B11 |
| **T10** | Cierre de anillo | Obligatorio y **excluido** de la comprobación de duplicados | **B7 + TL** |
| **T11** | Huecos | **No exportables** aunque sean OGC-válidos | **B6** |
| **T12** | Autointersección y degenerados | No exportables | **B6, B8** |
| **T13** | CRS y orden de ejes | WGS84/EPSG:4326, `[lon, lat]`, sin reproyectar | **B10** |
| **T14** | Propiedades | `Area` (puntos), `ProductionPlace`, `ProducerCountry`. **`ProducerName` NO se exporta** sin decisión de protección de datos | **B14 + TL** |
| **T15** | Tipo de archivo | **Tipo I** (nivel de productor). Tipo II queda fuera por ahora | **B15 + TL** |
| **T16** | `Area` numérica | Número, nunca texto | **B17** |
| **T17** | Límites | Avisar al acercarse a 25 Mb / 1 000 / 10 000, **declarándolos configurables** | **B19** |
| **T18** | No exportables | **Listadas con su motivo**, nunca omitidas en silencio | **TL** |
| **T19** | Resultado | `CUMPLE_PERFIL` / `NO_CUMPLE` / `NO_EVALUABLE`. **Nunca «conforme EUDR»** | **TL** |
| **T20** | Vigencia | Un cambio en la versión del servicio **o** en la página citada obliga a revisar y crea `EUDR_GEO_V2` | **TL** |

### 7.1 Datos personales (T14)

`ProducerName` es **dato personal**. Hoy la identidad del productor va **cifrada** y la geometría exige
`plot:read_geometry`. Exportarla cambiaría el perfil de protección de datos del archivo. **La propuesta es no
exportarla**: es opcional para el destino (B14) y nada obliga a incluirla. Si alguien la necesita, es una decisión
de producto **y** de protección de datos, no una casilla técnica.

### 7.2 Lo que D-05.A deja fuera a propósito

- **Presentar** un DDS o una SD, llamar al servicio, obtener credenciales: es D-05.B más una autorización aparte.
- **Probar contra el servicio real** (pasar de DOC a SRV): §1.4.
- El requisito de **fecha o rango de producción** de A3: es trabajo nuevo, identificado en §5.2, y **no se resuelve
  en esta propuesta**.

---

## 8. Qué cambiaría en el sistema (si se aprueba D-05.A)

1. **Regla `EUDR_GEO_V1` separada de `TL_GIS_TECH`**, con su propio resultado. Las evaluaciones técnicas existentes
   **no cambian ni se invalidan**.
2. **Dos dictámenes a la vez** en la ficha de parcela, porque pueden discrepar: un polígono con hueco es
   técnicamente válido y no cumple el perfil. Mostrar uno solo haría creer que hay un único veredicto.
3. **`plots_valid` de P0-030** pasa de `CRITERION_UNDEFINED` a contar contra un criterio nombrado y versionado.
   **Sigue sin ser un indicador de conformidad**: eso depende de D-05.B.
4. **Exportación con perfil** junto a la técnica actual, **no en su lugar**: 6 decimales en vez de 17, propiedades
   de T14, aviso de truncamiento y lista de no exportables con motivo.
5. **`GEOLOCATION_PROFILE` del expediente**: evaluable en lo técnico. Los otros cinco requisitos de la fila 14 de
   la matriz **siguen igual**. D-05.A levanta parte de uno, no el bloqueo.

---

## 9. Qué falta para aprobar

### D-05.A — decidible por el equipo

| # | Pendiente | De quién |
| --- | --- | --- |
| 1 | Ratificar las 20 reglas de §7 | Responsable de producto/GIS |
| 2 | Fijar `δ` de la banda `NEAR_THRESHOLD` (§4.4) | Responsable de producto/GIS |
| 3 | Decidir `ProducerName` (§7.1) | Producto + protección de datos |
| 4 | Consultar U1, U3, U4 y U5 al contacto técnico del destino | Equipo |

### D-05.B — NO decidible por el equipo

| # | Pendiente | De quién |
| --- | --- | --- |
| 5 | Determinar **qué actor** es cada usuario de Terra Link bajo A4: operador, downstream, comerciante o ninguno | Responsable regulatorio |
| 6 | Verificar la clasificación de riesgo de Ecuador (Art. 29, acto de ejecución vigente) — **U7** | Responsable regulatorio |
| 7 | Comprobar, una por una, las condiciones de A5 antes de afirmar que la vía postal aplica a alguien | Responsable regulatorio |
| 8 | Contenido del **Anexo III** y efecto de la modificación en curso del Reglamento de Ejecución (UE) 2024/3084 | Responsable regulatorio |
| 9 | Decidir si Terra Link **presenta** o solo **prepara** — decisión propia, con su propia autorización | Producto |

**D-05 sigue sin aprobar.** D-05.A está completa y lista para revisarse; D-05.B no avanza sin las filas 5 a 8. No
se ha modificado ninguna compuerta, indicador ni conclusión regulatoria, y **D-07 sigue independiente**.
