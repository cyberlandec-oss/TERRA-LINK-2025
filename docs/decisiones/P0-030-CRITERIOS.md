# P0-030 — Estado por criterio frente a las fuentes (2026-10-14, segunda revisión)

Contraste de **todos** los criterios de la historia con sus fuentes: **S1 §60** (dashboard técnico, los 11 KPI),
**S1 §97** (Sprint 11 — Reporting: reportes por entidad y exportación GeoJSON), **RF-30** (`docs/03_REQUISITOS.md`),
**docs/09** (contratos de API), **docs/17** (operación), **QA-13/14** (`docs/16_PLAN_QA.md`) y **`docs/UX_UI.md` §20.2**.

Tres estados, sin terceras lecturas: **DEMOSTRADO** (hay código y prueba que lo acreditan), **PENDIENTE** (falta hacerlo,
sin bloqueo externo) y **BLOQUEADO** (depende de una decisión o capacidad concreta que no está en esta historia).

La historia **sigue ABIERTA**: quedan criterios pendientes y bloqueados. Lo demostrado es DONE_LOCAL; eso no acredita
producción ni conformidad EUDR.

## 1. S1 §60 — Dashboard técnico (11 KPI)

La instrucción literal de la fuente —«no empezar por un dashboard bonito; primero construir los indicadores desde
queries reales»— se cumple: los 11 salen de consultas SQL sobre la base, ninguno de un valor fijo.

| KPI | Estado | Evidencia o dependencia |
| --- | --- | --- |
| `producers_total` | **DEMOSTRADO** | `reports.int-spec.ts` «conteos de estado»: 2 vigentes con 1 baja declarada aparte |
| `plots_total` | **DEMOSTRADO** | ídem |
| `plots_valid` | **BLOQUEADO** (criterio) | `CRITERION_UNDEFINED`: el umbral y el perfil de D-05 no están aprobados (P0-010). Lo observable —parcelas con versión vigente y sin evaluar— **sí se publica** |
| `deliveries_total` | **DEMOSTRADO** | Por `delivery_date`, límites inclusivos; probado con períodos de un solo día |
| `lots_active` | **DEMOSTRADO** | Con desglose por estado |
| `traceability_completeness` | **DEMOSTRADO** | 1 de 2 lotes = 50,0 % con numerador y denominador a la vista |
| `risk_high` / `risk_medium` / `risk_low` | **BLOQUEADO** (dato) | `NO_DENOMINATOR` sin sujetos evaluados y `UNKNOWN` con sujetos evaluados sin severidad. La dependencia real es **D-07** y el catálogo `risk_rule_sets` (`NOT_APPROVED`), reforzada por el `CHECK` de la migración 0025. Ver §4.bis: **no** depende de P0-021, que está implementada |
| `evidence_completeness` | **DEMOSTRADO** | Con desglose por estado de afirmación |
| `due_diligence_ready` | **DEMOSTRADO** | Cero observado con desglose `READY/IN_PROGRESS/BLOCKED/sin instantánea`. Contar bloqueados **sí** es calculable; lo que no se deduce es conformidad |

**Corrección de esta revisión.** Antes, seis indicadores salían bajo una sola etiqueta `NOT_CALCULABLE`, que mezclaba
situaciones distintas. Ahora hay cinco estados y cada indicador declara el suyo: `OK` (un 0 es **cero observado**),
`NO_DENOMINATOR`, `UNKNOWN`, `CRITERION_UNDEFINED` y `RESTRICTED`. `due_diligence_ready` dejó de ser «no calculable»:
su cero es observado y se publica, porque **un resultado desfavorable no es motivo para declarar nada incalculable**.

## 2. S1 §97 — Sprint 11, Reporting

| Criterio de la fuente | Estado | Evidencia o dependencia |
| --- | --- | --- |
| Producer report | **DEMOSTRADO** | `GET /reports/entities/producers`. Parcelas, parcelas con geometría y entregas del período por productor; nombres solo con `producer:read_identity` |
| Plot report | **DEMOSTRADO** | `GET /reports/entities/plots`. Distingue sin versión / solo superficie declarada / geometría registrada; «SIN EVALUAR» no es «inválida» |
| Lot report | **DEMOSTRADO** | `GET /reports/entities/lots`. Cantidades **por unidad**, nunca un total único entre unidades |
| Risk report | **DEMOSTRADO** (con el dato bloqueado) | `GET /reports/entities/risk`. Los lotes sin evaluar aparecen como tales; los totales por severidad salen `DESCONOCIDO` mientras ninguno esté clasificado, y en cuanto haya clasificados se publican **sobre esa base**, no como distribución del tenant |
| Traceability report | **DEMOSTRADO** | `GET /reports/entities/traceability`. Completitud del origen declarado desde `lot_inputs.origin_known` |
| DD report | **DEMOSTRADO** | `GET /reports/entities/dd`. Preparación de la última instantánea, con los BLOCKED contados |
| GeoJSON export (técnico) | **DEMOSTRADO** | `GET /reports/entities/plots/geojson`. `FeatureCollection` RFC 7946 con la geometría guardada, sin reproyectar ni recortar; exige `plot:read_geometry` |
| GeoJSON export (**perfil de destino regulatorio**) | **BLOQUEADO** | **D-05**. Ver §4 de este documento: qué depende realmente de esa decisión |

## 3. RF-30, docs/09, docs/17, QA-13/14 y UX_UI §20.2

| Criterio | Estado | Evidencia o dependencia |
| --- | --- | --- |
| RF-30: KPI con **denominadores** reales | **DEMOSTRADO** | Cada indicador publica numerador y denominador, o declara por qué no hay |
| RF-30: KPI con **permisos** reales | **DEMOSTRADO** | `report:read` abre la pantalla, no los datos; cada indicador exige el permiso de su dominio |
| Permiso del dominio de **cada dato agregado**, no solo de la entidad | **DEMOSTRADO** | El reporte de productores exige `producer:read` + `plot:read` + `delivery:read` porque cuenta parcelas y entregas; trazabilidad exige los tres por el mismo motivo. Probado en memoria con permisos arbitrarios (`reports-catalog.spec.ts`), sin tocar roles reales |
| docs/09: contrato publicado y OpenAPI al día | **DEMOSTRADO** | `apps/api/openapi.json` regenerado y validado (183 rutas); fila de `docs/09` actualizada |
| docs/17: operación sin trabajos largos ni colas | **DEMOSTRADO** (por diseño) | Los reportes son consultas sincrónicas acotadas; no hay jobs diferidos, y por eso no aplica el patrón «aceptación, no resultado» |
| UX_UI §20.2: alcance, filtros y formato; organización, período, unidades, versión/fecha y autor | **DEMOSTRADO** | Cabecera del CSV con organización, período, catálogo, generación y notas; unidades explícitas en los reportes de lotes |
| UX_UI §20.2: permisos de campo **también en la exportación** | **DEMOSTRADO** | La identidad del productor y las coordenadas se gobiernan igual en pantalla y en CSV/GeoJSON |
| QA-13/14: pruebas con valores conocidos, aislamiento y permisos | **DEMOSTRADO** | 42 pruebas: 16 de integración de indicadores, 12 de reportes por entidad, 8 del catálogo de permisos y 6 del reparto por severidad (las dos últimas, en memoria) |
| Accesibilidad: teclado, 390 px y zoom 200 % | **DEMOSTRADO** | Pruebas E2E de navegador sobre la pantalla de reportes |
| Paginación y acceso al conjunto completo | **DEMOSTRADO**, con el tope declarado | Cursor sobre la clave natural, página máxima 500, totales siempre del conjunto completo y exportación que recorre todas las páginas en una instantánea **hasta 20 000 filas**, rotulando el archivo como «conjunto completo» o «TRUNCADO». Probado con 520 filas, sin duplicados ni omisiones |
| Lectura consistente de filas y totales | **DEMOSTRADO**, con su alcance declarado | Una transacción `REPEATABLE READ` de solo lectura **por petición**, y la exportación recorre sus páginas dentro de ella. **No** hay instantánea compartida entre peticiones distintas: navegar entre páginas abre una nueva, y así se dice en pantalla, en la respuesta y en el CSV. Ver `P0-030-REPORTES.md` §7.bis |
| Comparación de actividad entre períodos | **DEMOSTRADO** | `compare_from`/`compare_to` sobre los indicadores de ACTIVIDAD, por fecha operativa, con la equivalencia de tramos declarada |

## 3.bis Pendientes: qué exige cada fuente, exactamente

El encargo pedía citar la fuente de cada pendiente y separar **requisito de la historia**, **mejora posterior** y
**bloqueo externo**. Hecho, sin añadir condiciones de cierre nuevas ni retirar requisitos existentes.

| Pendiente | ¿Lo exige alguna fuente? | Clasificación | Qué se hizo |
| --- | --- | --- | --- |
| Acceso al conjunto completo de filas | **Sí, implícito en la fuente**: S1 §97 pide «Producer report», «Plot report», «Lot report»… sin acotar a una muestra; `docs/09` §grafo fija la regla del repositorio: cursor y **«distinguir truncamiento técnico»**; UX_UI §20.2 exige «seleccionar alcance… generar y descargar con estado real» | **Requisito de la historia** | **Implementado**: paginación por cursor y exportación del conjunto completo. El corte mudo de 500 filas era un defecto, no un límite declarado |
| Comparación entre períodos | **No literalmente**: S1 §60 enumera 11 KPI y no pide series. Pero comparar actividad solo necesita la fecha operativa, que ya existe | **Mejora posterior, implementada** | **Implementada** porque es factible y útil; **no** se añade como condición de cierre de la historia |
| Saldo/existencias a una fecha pasada | **No.** Ningún KPI de §60 es de tipo «saldo a una fecha» y la búsqueda literal (`saldo a|stock histor|existencia.*fecha|as of date|historical stock`) no devuelve nada en las fuentes ni en RF-30 | **Capacidad distinta, sin contrato** | **No se implementa ni se aproxima.** Reconstruir el ledger a una fecha exige su propio contrato: qué movimientos, qué correcciones y qué versiones cuentan. **Comparar actividad no es esto**, y por eso la comparación sí se implementó |
| Reportes programados o envío periódico | **No.** Comprobado por búsqueda literal sobre las cuatro fuentes y los documentos de requisitos, contratos, operación y UI: `grep -rniE "programad|periodic|scheduled|cron|recurrente|suscripci" docs/sources/*.md docs/03 docs/09 docs/17 docs/UX_UI.md`. Las únicas coincidencias son ajenas: «eventos asíncronos» (S1 §54), «ingresos recurrentes» (S2, negocio), sincronización móvil, y «Programadas 8» (S4), que es un **estado de embarques**, no un reporte programado | **Mejora posterior, sin fuente que la exija** | **No se implementa**, y **no** se añade como condición de cierre. Si algún día se adoptara, exigiría autorización vigente al ejecutar **y** al descargar, para no entregar datos a quien perdió el acceso entre una cosa y otra |
| Volumen de piloto medido | **Sí**: S1 §98 fija el piloto (20–50 productores, 20–100 parcelas, 1–3 lotes) | **Requisito de otra historia (P0-031)** | Fuera de P0-030; la paginación ya sostiene ese orden de magnitud y se probó con 520 filas |

## 4. Qué depende realmente de D-05 (y qué no)

La revisión anterior atribuía a D-05 un bloqueo general sobre la exportación GeoJSON. **No es exacto.** Separando:

**No depende de D-05 y está implementado** — la exportación técnica: leer la geometría vigente tal como se guardó,
entregarla en RFC 7946 (WGS84 longitud/latitud), con `plot_code`, `producer_code`, versión, método de levantamiento,
estado de validación, superficie declarada y calculada, `geometry_hash` y el sha256 del archivo de importación de origen.
Esto reutiliza lo construido en **P0-009** (`exportVersion` de una versión concreta) y lo extiende a la colección de la
organización, con el mismo permiso `plot:read_geometry`, la misma ausencia de reproyección y el mismo aviso.

**Depende de D-05**, y por eso se declara pendiente dentro del propio archivo (`terra_link.regulatory_profile`):

1. **Qué geometría exige cada caso**: punto o polígono según el umbral de superficie que fije la decisión.
2. **Precisión y redondeo** admitidos por el sistema de destino. Hoy se exporta con la precisión guardada (17 dígitos de
   `ST_AsGeoJSON`), sin recortar: recortar sin regla aprobada sería alterar el dato.
3. **Qué propiedades espera el destino** y con qué nombres. Las actuales son las de Terra Link, no las de ningún esquema oficial.
4. **Qué parcelas quedan calificadas** para una presentación. Eso exige el criterio de validez GIS, que es justamente lo
   que falta (P0-010) y lo que mantiene `plots_valid` en `CRITERION_UNDEFINED`.

Lo que **no** se hace mientras tanto: inventar una geometría para las parcelas que solo tienen superficie declarada. Se
excluyen del archivo y su número se declara en el propio GeoJSON (`counts.solo_superficie_declarada`), de modo que nadie
lea un archivo incompleto como si fuera completo.

## 4.bis Qué bloquea realmente la severidad de riesgo (y qué no)

La revisión 1 decía que la severidad llegaría «cuando cierren D-05, P0-028 (satélite) y P0-021 (mitigaciones)».
**Era inexacto.** P0-021 **está implementada**, y verificar una mitigación no asigna severidad ni produce una conclusión
favorable: entra en el resultado **técnico** del factor `MITIGATION_UNVERIFIED`, que es otra dimensión.

Lo que realmente lo determina:

1. **D-07** (`docs/22`: «Severidad/proceso/conclusión riesgo — enums reales, mapping y regla aprobada»).
2. El **catálogo `risk_rule_sets`**, hoy en `NOT_APPROVED` (versiones 0.1.0 y 0.2.0), que declara por escrito no tener
   «pesos, umbrales, severidades ni lista jurídica». El motor (P0-020) escribe `NOT_ASSESSED` en toda evaluación.
3. **La base lo impide a nivel de esquema**: `risk_evaluations` lleva
   `CHECK (conclusion = 'UNDETERMINED' AND severity = 'NOT_ASSESSED')` desde la migración `0025_risk.ts`. No es solo que
   el motor no asigne severidad: ninguna fila puede llevarla, venga de donde venga.

Consecuencia para las pruebas: el **caso mixto** —sujetos clasificados y sin clasificar a la vez— no se puede construir
contra la base hoy. Se prueba en memoria (`src/reports/reports-risk.spec.ts`) y la prueba de integración comprueba que
el candado del esquema existe y rechaza el intento. Cuando hay clasificados, el conteo se publica **sobre la base de los
clasificados**, nunca como distribución de todos los lotes del tenant.

## 5. Cobertura histórica: qué se corrigió

La redacción anterior afirmaba que «toda serie anterior al 2026-10-13 está vacía por pérdida de almacenamiento». Era
**incorrecta como afirmación general**: la pérdida fue del almacenamiento, no de las fechas operativas. Un registro
conservado o creado después puede declarar una entrega de septiembre, y debe contar en septiembre.

Lo que ahora se declara, en pantalla, en la respuesta y en el CSV: **cobertura histórica incompleta**, con la fecha del
suceso, la advertencia de que un período antiguo puede devolver menos de lo ocurrido, y la regla explícita de que los
registros disponibles se incluyen **por su fecha operativa declarada**, aunque sea anterior a la pérdida. Se mantiene sin
cambios lo que sí era correcto: **no se reconstruye ninguna cifra a partir de los informes de QA**, que son evidencia
histórica y no registros operativos.

Probado en `reports.int-spec.ts`: dos entregas con fecha operativa de septiembre, registradas después de la pérdida,
cuentan en un período de septiembre; y el texto de cobertura ya no afirma que lo anterior esté vacío.

## 6. Lo que esta historia sigue sin acreditar

- **Conformidad EUDR**: ningún reporte la acredita. `READY` es preparación interna y `EXPORTED` es descarga.
- **Producción**: todo es validación local sobre datos sintéticos.
- **Volumen real**: los reportes no se han probado con el volumen de un piloto (P0-031).
- **Riesgo clasificado**: mientras el motor devuelva `NOT_ASSESSED`, la distribución por severidad seguirá siendo
  desconocida, por mucho que la consulta funcione.
