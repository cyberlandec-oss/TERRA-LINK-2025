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
| `risk_high` / `risk_medium` / `risk_low` | **BLOQUEADO** (dato) | `NO_DENOMINATOR` sin sujetos evaluados y `UNKNOWN` con sujetos evaluados sin severidad. El motor no concluye mientras D-05, P0-028 y P0-021 sigan abiertos (P0-020) |
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
| Risk report | **DEMOSTRADO** (con el dato bloqueado) | `GET /reports/entities/risk`. Los lotes sin evaluar aparecen como tales; los totales por severidad salen `DESCONOCIDO` mientras ninguno esté clasificado |
| Traceability report | **DEMOSTRADO** | `GET /reports/entities/traceability`. Completitud del origen declarado desde `lot_inputs.origin_known` |
| DD report | **DEMOSTRADO** | `GET /reports/entities/dd`. Preparación de la última instantánea, con los BLOCKED contados |
| GeoJSON export (técnico) | **DEMOSTRADO** | `GET /reports/entities/plots/geojson`. `FeatureCollection` RFC 7946 con la geometría guardada, sin reproyectar ni recortar; exige `plot:read_geometry` |
| GeoJSON export (**perfil de destino regulatorio**) | **BLOQUEADO** | **D-05**. Ver §4 de este documento: qué depende realmente de esa decisión |

## 3. RF-30, docs/09, docs/17, QA-13/14 y UX_UI §20.2

| Criterio | Estado | Evidencia o dependencia |
| --- | --- | --- |
| RF-30: KPI con **denominadores** reales | **DEMOSTRADO** | Cada indicador publica numerador y denominador, o declara por qué no hay |
| RF-30: KPI con **permisos** reales | **DEMOSTRADO** | `report:read` abre la pantalla, no los datos; cada indicador exige el permiso de su dominio |
| docs/09: contrato publicado y OpenAPI al día | **DEMOSTRADO** | `apps/api/openapi.json` regenerado y validado (183 rutas); fila de `docs/09` actualizada |
| docs/17: operación sin trabajos largos ni colas | **DEMOSTRADO** (por diseño) | Los reportes son consultas sincrónicas acotadas; no hay jobs diferidos, y por eso no aplica el patrón «aceptación, no resultado» |
| UX_UI §20.2: alcance, filtros y formato; organización, período, unidades, versión/fecha y autor | **DEMOSTRADO** | Cabecera del CSV con organización, período, catálogo, generación y notas; unidades explícitas en los reportes de lotes |
| UX_UI §20.2: permisos de campo **también en la exportación** | **DEMOSTRADO** | La identidad del productor y las coordenadas se gobiernan igual en pantalla y en CSV/GeoJSON |
| QA-13/14: pruebas con valores conocidos, aislamiento y permisos | **DEMOSTRADO** | 24 pruebas de integración entre `reports.int-spec.ts` y `reports-entities.int-spec.ts` |
| Accesibilidad: teclado, 390 px y zoom 200 % | **DEMOSTRADO** | Pruebas E2E de navegador sobre la pantalla de reportes |
| Paginación/volumen de los reportes por entidad | **PENDIENTE** | Hoy devuelven hasta 500 filas y lo declaran, con los totales calculados sobre el conjunto completo. Con volúmenes de piloto habrá que paginar o exportar por lotes (P0-031) |
| Reportes programados o envío periódico | **PENDIENTE** | Ninguna fuente los exige en P0; quedarían en P1 junto con analytics (P1-014) |
| Series temporales y comparación entre períodos | **PENDIENTE** | Exige una capacidad de saldo a una fecha (`BALANCE_AT`) que hoy no existe: el ledger calcula saldos «ahora». No se aproxima |

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
