# D-05.B — Material para revisión por el responsable competente (2026-10-21)

**Qué es esto.** Preparación de **D-05.B** (aplicabilidad jurídica) para que la revise un responsable regulatorio. **No es una aprobación, no adopta ninguna obligación y no cambia ninguna compuerta, permiso ni
comportamiento.** Completar la ficha del §6 **no registra una decisión regulatoria**: la decisión, si la hay, la registra quien tenga competencia, con su fuente y su estado de revisión, y solo entonces se
convierte en trabajo de implementación aparte. Documento base, **sin modificar**: `docs/decisiones/D-05-PROPUESTA.md` (revisión 4, 2026-10-15; 659 líneas). Aquí se **resume su contenido vigente**, se comprueba contra el texto
legal guardado y se organizan los hechos por entidad.

Para resolver D-05.B **no** se cambian permisos ni roles: un rol de aplicación (`ORG_ADMIN`, `EXPORT_MANAGER`, `BUYER`…) y un tipo de organización (`EXPORTER`, `IMPORTER`…) **no son** una categoría jurídica del Reglamento (§3).

## 1. Contenido vigente de la propuesta D-05 (resumen fiel)
| | Estado | Qué dice |
| --- | --- | --- |
| **D-05.A** perfil técnico | **ADOPTADO para desarrollo local** (2026-10-15); implementado `EUDR_GEO_V1` (migración 0041) | Umbral `> 4 ha` exige polígono (`= 4` admitido con aviso); mínimo 0,0001 ha para punto; 6 decimales como número; simulación del truncamiento hacia cero; sin huecos; `MEETS_PROFILE` solo significa «bien formado para una versión **documentada** del destino». Ninguna regla está comprobada contra el servicio real (DOC, no SRV) |
| **D-05.B** aplicabilidad jurídica | **PENDIENTE** | A qué actores y operaciones alcanzan las obligaciones del Reglamento. «Solo un responsable regulatorio». Cuatro pendientes en el §9 de la propuesta: (5) qué actor es cada usuario bajo el Art. 2(15); (6) condiciones 1, 2 y 4 del Art. 2(15a) (la 3 está resuelta en contra); (7) contenido del Anexo III y efecto de la modificación del Reglamento de Ejecución 2024/3084; (8) si Terra Link **presenta** o solo **prepara** (decisión de producto) |
| Qué **no** hace D-05.A | — | No acredita conformidad; no autoriza presentar ni llamar a TRACES; no cambia D-07 ni el catálogo `NOT_APPROVED`; **no desbloquea el expediente** |

### 1.1 Opciones documentadas
La propuesta **no formula opciones** para D-05.B (solo lista pendientes). Las opciones del §5 de esta ficha son **una forma de ordenar la pregunta**, sin recomendar el contenido jurídico; no figuraban en la propuesta.

## 2. Fuentes: identificación, versión, fecha y estado de revisión
| Capa | Fuente | Versión / fecha | Guardada en | sha256 | Estado de revisión |
| --- | --- | --- | --- | --- | --- |
| **A · Norma** | Reglamento (UE) 2023/1115 **consolidado** `02023R1115 — EN — 18.09.2026 — 003.001` (vigente en la copia) | M1 = 2024/3234; M2 = 2025/2650; M3 = Delegado 2026/2102 (13-07-2026, OJ L 2102, 17.9.2026). Descargado 2026-10-15 | `docs/sources/eudr-norma-2026-10-15/02023R1115-20260918.xhtml` | `1cd2711f…cb1c6` | **Sin revisión jurídica.** El propio documento dice que «has no legal effect»: las versiones auténticas son las del Diario Oficial |
| A (histórico) | Consolidado `— 26.12.2025 — 002.001` | M1, M2 | `…20251226.xhtml` | `a00f759d…ddbe6` | Conservado; comparado con el vigente: **ningún artículo cambió** (diez bloques, todos en el Anexo I) |
| A | Reglamento (UE) 2025/2650 (texto de M2) | 19-12-2025 | `32025R2650.xhtml` | `f9a24402…37ae27` | Sin revisión jurídica |
| A (dato) | Comisión Europea, *Country Classification List* (Ecuador: **standard risk**) | Consultada 2026-10-15 | `country-classification-list.html` | `b536d933…83356` | Dato fechado; **la lista cambia** (Art. 29) |
| **B · Destino** | *EUDR Operator API Reference*, servicio **V3**; documento **v1.2**; página GeoJSON **17-08-2026** (las otras tres no publican fecha) | Descargado 2026-10-15 | `docs/sources/eudr-is-2026-10-15/` (4 páginas) | `index` `77be7296…6fb96` · `change-log` `8e5821f2…e70ec` · `validation-rules` `08d91eed…c086` · `geojson` `165fee68…bb35` | Sin revisión; la fuente advierte que «may not be final» (en trámite el Reglamento de Ejecución 2024/3084) |
| **C · Interna** | `EUDR_GEO_V1@1.0.0` | 2026-10-15 | `apps/api/src/plots/geo-profile.ts` | — | Adoptada para desarrollo local; no aprobada para producción |

## 3. Referencias normativas: comprobación contra el texto guardado (2026-10-21)
Se contrastó cada cita de la propuesta con el texto del consolidado **vigente en la copia** (`20260918`).

**Citas que coinciden literalmente** con el texto: Art. 2(15) operator; 2(15a) micro or small primary operator; 2(16) placing on the market; 2(27) plot of land; 2(28) geolocation («at least six decimal digits»,
polígono por encima de cuatro hectáreas salvo ganado); 4a(5) dirección postal; 9(1)(d) geolocalización «as well as the date or time range of production»; 38(2) (30-12-2026) y 38(3) (30-06-2027 para personas físicas y
micro/pequeñas **establecidas como tales a 31-12-2024**, salvo productos del Anexo del Reglamento 995/2010).

**Hallazgos — qué NO está bien o falta en la propuesta** (no se corrige el documento base; se señala):
| # | Hallazgo | Detalle |
| --- | --- | --- |
| H1 | **Artículos relevantes no analizados** | La propuesta analiza 2(15), 2(15a), 4a(5) y 9(1)(d), pero no recoge: **2(15b)** *downstream operator*, **2(17)** *trader*, **2(22) y Art. 6** *authorised representative*, **Art. 7** (si quien coloca en el mercado está establecido fuera de la Unión, **la primera persona establecida en la Unión que lo pone a disposición se considera operador**), **Art. 4(2) y Anexo II** (la DDS exige «country of production» y geolocalización), **Art. 4(7)** y **Art. 5** (obligaciones de las categorías posteriores). Sin ellos la pregunta «¿qué actor es cada usuario?» queda incompleta |
| H2 | **Anexo III mal descrito como pendiente** | El §9 punto 7 pide «contenido del Anexo III» como si faltara. El Anexo III **es** la *declaración simplificada de micro y pequeños operadores primarios* (Art. 4a(3)) y su texto está en la copia. Lo que falta no es el texto, sino determinar **si alguien de Terra Link entra en esa categoría** (Q3) |
| H3 | **Inconsistencia interna sobre Ecuador** | §6 incertidumbre **U7** («si Ecuador está clasificado como riesgo bajo… no verificado») contradice §5.4, que lo verifica: **standard risk** en la copia del 2026-10-15. U7 debería leerse como resuelta, pero **fechada y revocable** |
| H4 | **Afirmación jurídica presentada como «normalmente»** | §5.3 condición 1: «una cooperativa de Ecuador que vende a un importador europeo normalmente **no** es el operador: lo es el importador». Es una **lectura preliminar** (consistente con el Art. 7) y **no una conclusión verificada**; debe tratarse como pregunta Q1, no como dato |
| H5 | **El Reglamento de Ejecución (UE) 2024/3084 no está guardado** | Solo se cita a través de la página del destino (B). **No figura** en las copias de la norma (0 coincidencias). Su contenido y el estado del procedimiento de modificación **no están verificados**; hay que obtener su texto |
| H6 | **Documento de trabajo, no auténtico** | Las citas son del consolidado (herramienta de documentación). Las verificaciones jurídicas deben hacerse contra el **Diario Oficial** |
| H7 | **Fechas de aplicación** | Los Arts. 3–13 aplican desde **30-12-2026** (o **30-06-2027** para los del Art. 38(3)). A la fecha de este material **todavía no son aplicables**: no hay obligaciones exigibles hoy, y la ficha pregunta por su efecto futuro |
| H8 | **«Exportar» sin definición propia** | El texto guardado no define *exporting* aparte; en `2(15)` y en el Art. 4 se usa junto con *placing on the market* (primera puesta a disposición «on the Union market», 2(16)). Qué significa exportar **para un operador establecido fuera de la Unión** no se deduce aquí: es Q2 |
| H9 | **Sin cambios por M3 en lo citado** | Confirmado (diez bloques, todos en el Anexo I; para cacao, `1801` no cambia). Efecto sobre D-05: ninguno |

Ninguna de estas observaciones **sustituye** el contrato del proyecto: la propuesta sigue siendo el documento base y solo se señala qué debe revisarse.

## 4. Hechos por entidad, organización y operación
Separados de las conclusiones. **Qué sabe hoy Terra Link** (datos registrados, no jurídicos) y **qué no sabe**.

### 4.1 Qué registra el sistema, por entidad
| Entidad | Datos registrados (hechos) | Lo que NO registra |
| --- | --- | --- |
| **Organización** | Nombre, razón social, **tipo** del catálogo `organization_types` (`ASSOCIATION`, `COOPERATIVE`, `COLLECTOR`, `PROCESSOR`, `EXPORTER`, `IMPORTER`, `MANUFACTURER`, `OTHER`; **PROVISIONAL**, «describe al actor comercial y no concede permisos»), `tax_id`, **país** (ISO2, p. ej. `EC`, `DE` en el demo) | Tamaño (micro/pequeña según la Directiva 2013/34/UE); **EORI**; si está **establecida en la Unión**; categoría jurídica del Reglamento |
| **Productor / parcela** | Identidad (cifrada), parcelas con geometría versionada, superficie declarada y calculada, provincia/cantón, dictamen `TL_GIS_TECH` y `EUDR_GEO_V1` | **País de producción** (no hay campo; deducirlo del país de la organización sería inventarlo); fecha/rango de producción **vinculado a la parcela** |
| **Entrega / recepción / lote** | Productor→organización, período de cosecha, parcelas de origen, recepción, calidad, lote con origen COMPLETO/INCOMPLETO | Código **HS** del producto; cantidad en kg neta tal como la pide el Anexo II (se guarda KG, no se valida contra HS) |
| **Embarque** | Comprador **declarado** (país, sin verificar), destino declarado, ítems, reservas y despacho (hoy bloqueado por D-34) | Quién es «operador», «importador», «representante autorizado» ante el Reglamento; el DDS/SD o su identificador |
| **Traspaso de custodia (A-03)** | Vínculo entre dos organizaciones, cantidad, estados, diferencias; el lote recibido nace con origen INCOMPLETO | Ninguna calificación jurídica del traspaso (no es compraventa, exportación ni puesta en el mercado) |
| **Usuario / membresía** | Roles de **aplicación** (permisos) | Nada que equivalga a una categoría jurídica |

### 4.2 Hechos de la cadena que el responsable necesita y que **cada organización debe aportar** (no están en el sistema)
Por cada organización que use Terra Link, y por cada operación que realice:
| # | Hecho | Por qué importa |
| --- | --- | --- |
| F1 | País donde está **establecida** y si lo está en la Unión | Art. 2(15a) (cond. 3), Art. 7, `person established in the Union` 2(21) |
| F2 | Tamaño: balance, cifra de negocios y empleados (Directiva 2013/34/UE, Art. 3(1)–(2)) | 2(15a) cond. 2; también Art. 38(3) y 2(30) SME |
| F3 | Si produce **ella misma** lo que vende o exporta, y si en parcelas **del país donde está establecida** | 2(15a) cond. 4; 2(14) *produced* |
| F4 | Quién **produce** (organización y productores), quién **recibe** (acopio, procesador), quién **exporta** (organización y país de salida), quién **importa** (persona establecida en la Unión que pone a disposición) | Art. 2(15), 2(15b), 2(17), Art. 7 |
| F5 | Si existe **mandato** de representante autorizado y de quién | 2(22), Art. 6 |
| F6 | Qué ocurre en cada traspaso de custodia (A-03): entre quiénes, dónde, si el producto sale del país o llega a la Unión | 2(16), 2(18); Q2 |
| F7 | Si el producto es de `1801` (cacao en grano) u otro código de la lista | Anexo I (M3) |

### 4.3 Relaciones entre actores en el caso modelado (demo, sintético — para ilustrar, no para concluir)
`Productor (EC) → Cooperativa Río Verde (EC, acopio/cooperativa) → [traspaso de custodia A-03, dentro de EC] → Exportadora Pacífico (EC, EXPORTER) → comprador declarado (país UE, p. ej. Chocolates Europa, IMPORTER, DE)`.
Qué categoría del Reglamento corresponde a cada eslabón (si alguna) y en qué momento ocurre la *primera puesta a disposición en el mercado de la Unión* **no está decidido**: es Q1–Q3.

## 5. Preguntas pendientes, opciones, hechos necesarios y comportamiento que dependería de la respuesta
Las **opciones son maneras de ordenar la pregunta**; no recomiendo el contenido jurídico. «Comportamiento» describe **qué cambiaría en el sistema** si se decidiera y se autorizara su implementación; **hoy no cambia nada**.

| # | Pregunta | Opciones | Hechos necesarios | Comportamiento que dependería |
| --- | --- | --- | --- | --- |
| **Q1** | ¿Qué categoría del Reglamento (operador 2(15), operador deemed Art. 7, downstream 2(15b), trader 2(17), micro/pequeño primario 2(15a), representante 2(22), ninguna) corresponde a cada **organización según su operación**? | (a) Una categoría por **tipo de organización** (no recomendable por sí sola: el tipo es descriptivo y PROVISIONAL). (b) Una categoría por **organización y operación**, declarada por ella y revisada. (c) El sistema **no modela** la categoría y solo conserva los hechos F1–F7 | F1, F4, F5, F6 | (a)/(b): un campo o registro nuevo y versionado con fuente y estado de revisión (implementación aparte). (c): sin cambio; la afirmación jurídica queda fuera del sistema |
| **Q2** | ¿Un **traspaso de custodia entre organizaciones fuera de la Unión** (A-03) es «placing on the market», «making available», «exporting» o ninguna? Y ¿cambia la respuesta si el destino final es la Unión? | (a) Ninguna: es movimiento interno hasta la salida. (b) Depende de la operación posterior. (c) Otra | F4, F6, texto de 2(16), 2(18), Art. 7 | Determina si la **salida de A-03** (D4) necesita compuerta de diligencia propia o la del embarque. Hoy la compuerta **bloquea** |
| **Q3** | ¿Cuáles de las organizaciones usuarias cumplen **todas** las condiciones de 2(15a)? (cond. 3 resuelta **en contra** mientras Ecuador sea riesgo estándar) | (a) Ninguna mientras la cond. 3 se mantenga. (b) Revisar caso a caso si la clasificación cambia | F1, F2, F3 y fecha de la lista | Si ninguna: la vía de **dirección postal** (4a(5)) queda no disponible y la geolocalización de **todas** las parcelas es obligatoria. Si cambia la lista: el perfil debería reevaluarse (nueva versión de perfil) |
| **Q4** | ¿Cuál es el **contenido exigible** de la geolocalización en cada categoría (Art. 9(1)(d), Anexo II punto 3; Anexo III punto 3 para la declaración simplificada), incluida la **fecha o rango de producción**, y el **país de producción**? | (a) Solo coordenadas conforme a `EUDR_GEO_V1`. (b) Coordenadas + fecha/rango de producción vinculado a la parcela. (c) (b) + país de producción. (d) Otro | Texto de 9(1)(c)–(d), Anexo II/III; F3 | Define qué significaría «**satisfecho**» para `GEOLOCATION_PROFILE`. Hoy el período y el país **no viajan** en el archivo ni están ligados a la parcela (§8.2 de la propuesta): implicaría **trabajo nuevo** autorizado aparte |
| **Q5** | ¿Cómo se trata una parcela que no es una «plot of land» del Art. 2(27) (varios recintos de una propiedad, o contiguas de un mismo productor) a efectos del umbral? | (a) Una parcela de Terra Link = una *plot of land*. (b) Agrupar por propiedad. (c) Consultar al contacto del destino (U6) | Datos de propiedad catastral (hoy no registrados) | Podría cambiar qué parcelas superan 4 ha y exigen polígono |
| **Q6** | ¿Qué efecto tiene el procedimiento de **modificación del Reglamento de Ejecución (UE) 2024/3084** sobre el perfil técnico? | (a) Ninguno conocido. (b) Obliga a una versión nueva de perfil (T20) | Texto del acto (**no guardado**, H5) | Crear `EUDR_GEO_V2`; hoy no se hace |
| **Q7** | ¿Qué **acto de revisión** hace válida la respuesta (quién firma, con qué fuente, con qué estado) y cómo se registra? | (a) Registro en `docs/decisiones` con fuente, versión y estado `REVIEWED`. (b) Registro versionado en el sistema (análogo a `legal_review_status` del perfil jurídico) | Competencia del revisor; relación con D-07.6 | (b) requeriría diseño nuevo; (a) no cambia el sistema |
| **Q8** *(producto, no regulatoria)* | ¿Terra Link **presenta** o solo **prepara**? | (a) Solo prepara (hoy). (b) Presenta (ámbito, autorización y riesgo propios; envía datos a un tercero) | — | (a): sin cambio. (b): fuera de D-05; es otra decisión y otra autorización |

## 6. Ficha para el responsable competente
*Para completar por quien tenga competencia. **Completarla no registra una aprobación**: hasta que no figuren la persona, el cargo, la fecha, la fuente consultada (versión del Diario Oficial) y el estado `REVIEWED`, el estado de D-05.B sigue siendo PENDIENTE.*

| Pregunta | Respuesta | Fundamento (artículo y versión del Diario Oficial) | Hechos asumidos (F1–F7) | Efecto técnico si se autoriza | Revisor / cargo / fecha |
| --- | --- | --- | --- | --- | --- |
| Q1 Categoría por organización y operación | ☐ | | | Registro versionado de categoría con fuente y revisión | |
| Q2 Traspaso fuera de la Unión | ☐ | | | Condiciona la compuerta de salida de A-03 (D4) | |
| Q3 Condiciones de 2(15a) | ☐ | | | Disponibilidad de la vía postal; obligatoriedad de geolocalizar todas las parcelas | |
| Q4 Contenido de la geolocalización exigible | ☐ | | | Define «satisfecho» para `GEOLOCATION_PROFILE`; período y país de producción | |
| Q5 Definición de parcela (2(27)) | ☐ | | | Agrupación de parcelas para el umbral | |
| Q6 Efecto del Reglamento 2024/3084 | ☐ | | | Versión nueva del perfil técnico | |
| Q7 Acto de revisión y registro | ☐ | | | Cómo se registra la decisión | |
| Q8 *(producto)* Presentar o preparar | ☐ | | | Alcance de integración | |

## 7. Qué efecto tendría resolver D-05.B (tres planos que no deben confundirse)
| Plano | Estado actual | Qué cambiaría al resolver D-05.B | Qué seguiría pendiente |
| --- | --- | --- | --- |
| **`GEOLOCATION_PROFILE`** (requisito del expediente y regla del catálogo) | `NOT_EVALUABLE`; **el código fija `geolocation_profile: null`** (`apps/api/src/dd/dd.ts`), de modo que **no puede ser `MET` aunque** `EUDR_GEO_V1` sea `MEETS_PROFILE`. La regla del catálogo no tiene severidad (decisión de producto) | Solo permitiría **definir** qué es «satisfecho» (Q4). Pasarlo a `MET` exige **implementación nueva y autorizada aparte**; no se hace aquí | Definición de «satisfecho», fecha/rango de producción y país de producción (Q4); autorización de la implementación |
| **Expediente / `READY`** | `READY` exige **todos** los requisitos en `MET`. Hoy hay otros **pendientes por sus propias decisiones**: `LEGAL_PROFILE` (P1-005, perfil parcial y sin revisión jurídica), `REGULATORY_CONCLUSION` (D-07.6; la conclusión está clavada en `UNDETERMINED` por un `CHECK`), `RISK_CATALOG_APPROVED` (D-07.5 y adopción), `DEFORESTATION_ANALYSIS` (D-09.B, satélite deshabilitado) y los operativos (calidad, soportes, mitigaciones) | Quita **una** de esas condiciones | **Resolver D-05.B no es suficiente para `READY`.** Siguen D-07.5, D-07.6, P1-005 y D-09.B, además de lo operativo del lote |
| **Salida de A-03 (traspaso)** | Bloqueada por `TRANSFER_DISPATCH_GATE` (D4 no adoptada; D-34) | Q1–Q2 **informan** D2 y D4, sin decidirlos | D4 (condición de salida), D-34 (`dd_package_id`, `dispatch_at`), D2 (revisión competente) y la sustitución autorizada del proveedor de la compuerta. **Ninguna respuesta abre la compuerta por sí sola** |

## 8. Lo que este material NO hace
No implementa supuestos; no cambia permisos, roles, compuertas ni catálogo; no registra severidad, conclusión ni aprobación; no usa la clasificación de riesgo de **país** (Art. 29) como riesgo de parcela o de lote; no equipara tipo de organización
ni rol de aplicación con categoría jurídica; no contacta al destino ni a TRACES; no presenta ninguna declaración. `UNDETERMINED`, satélite real deshabilitado y las compuertas vigentes **no se tocan**.
