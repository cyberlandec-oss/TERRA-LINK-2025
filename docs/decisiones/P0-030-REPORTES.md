# P0-030 — Reportes e indicadores: contrato de cálculo (2026-10-14)

Fuentes: **S1 §60 «Dashboard técnico»** (lista literal de 11 KPI y la instrucción «no empezar por un dashboard bonito;
primero construir los indicadores desde queries reales»), **S1 §97 «Sprint 11 — Reporting»** (reportes de productor,
parcela, lote, riesgo, trazabilidad, DD y exportación GeoJSON), RF-30, docs/09, docs/17, QA-13/14 y `docs/UX_UI.md`.
Validación local; no acredita producción ni conformidad EUDR.

## 1. Regla que gobierna esta historia

Un indicador solo existe si su **definición, unidad, fecha usada, numerador y denominador** están escritos y se calculan
desde la base. Cuando una capacidad no existe o su condición no es evaluable, el indicador **no se rebaja a cero**: sale
como pendiente, con el motivo. **Ausencia de información no es cero, y cero no es un resultado favorable.**

Esto no es una cautela retórica: hoy la base devuelve `NOT_VALIDATED` en todas las versiones geométricas,
`NOT_ASSESSED`/`UNDETERMINED` en todas las evaluaciones de riesgo y `BLOCKED` en la única instantánea DD. Publicar
«0 parcelas inválidas», «0 lotes de riesgo alto» y «0 expedientes listos» como cifras sería inventar un resultado
favorable a partir de capacidades que no existen.

## 2. Los 11 KPI de la fuente, uno a uno

`k` = tipo: **E** estado actual · **A** actividad en un período · **S** saldo a una fecha.

| KPI (S1 §60) | k | Definición | Unidad | Fecha usada | Denominador | Estado hoy |
| --- | --- | --- | --- | --- | --- | --- |
| `producers_total` | E | Productores no dados de baja (`deleted_at IS NULL`) del tenant | productores | — (estado) | — | **Calculable** |
| `plots_total` | E | Parcelas no dadas de baja del tenant | parcelas | — | — | **Calculable** |
| `plots_valid` | E | Parcelas cuya **versión vigente** tiene `validation_status = VALID` | parcelas | — | parcelas con versión vigente | **NO CALCULABLE**: ninguna versión puede validarse mientras D-05 no apruebe umbral y perfil (P0-010). Todas están `NOT_VALIDATED`. Publicar 0 insinuaría que ninguna parcela es válida, cuando lo cierto es que **ninguna ha sido evaluada** |
| `deliveries_total` | A | Entregas **registradas** con `delivery_date` dentro del período | entregas | `deliveries.delivery_date` (**no** `created_at`) | — | **Calculable**. Los borradores se excluyen y se informan aparte: no tienen fecha ni cantidad |
| `lots_active` | E | Lotes en `OPEN` o `CLOSED_FOR_INPUT` | lotes | — | — | **Calculable** |
| `traceability_completeness` | E | Lotes con `origin_status = COMPLETE` ÷ lotes del tenant | % | — | lotes del tenant | **Calculable**. Mide **origen declarado completo**, no conformidad ni verificación |
| `risk_high` | E | Lotes cuya última evaluación tiene `severity = HIGH` | lotes | — | lotes evaluados | **NO CALCULABLE**: el motor devuelve `NOT_ASSESSED` por diseño mientras D-05, P0-028 y P0-021 no cierren (P0-020) |
| `risk_medium` | E | ídem con `MEDIUM` | lotes | — | lotes evaluados | **NO CALCULABLE**, mismo motivo |
| `risk_low` | E | ídem con `LOW` | lotes | — | lotes evaluados | **NO CALCULABLE**, mismo motivo |
| `evidence_completeness` | E | Afirmaciones `VERIFIED` ÷ afirmaciones del tenant | % | — | afirmaciones del tenant | **Calculable**. Mide **verificación interna** de afirmaciones, no validez jurídica |
| `due_diligence_ready` | E | Expedientes cuya última instantánea tiene `readiness = READY` | expedientes | — | expedientes del tenant | **Calculable con advertencia**: hoy sale 0 porque **READY es inalcanzable** (catálogo de riesgo sin aprobar, D-05, perfil jurídico P1-005, satélite P0-028). El 0 **no** mide desempeño del equipo |

**Lo que no se mezcla**: peso declarado (`deliveries.quantity_declared`), recibido (`receptions.quantity_received`),
producido (`lots.output_quantity`), merma, existencia y reservado son magnitudes distintas. Ningún indicador las suma
entre sí. Ninguno de los 11 KPI de la fuente es de tipo **S** (saldo a una fecha): el ledger calcula saldos «ahora», y
reconstruirlos a una fecha arbitraria es una capacidad propia que **no se implementa aquí** en vez de aproximarla.

## 3. Períodos

- El período (`desde`/`hasta`) **solo se aplica a los indicadores de actividad**. En los de estado la respuesta lo
  declara como no aplicable en vez de filtrar en silencio por `created_at`.
- **`created_at` nunca sustituye a una fecha operativa.** Para entregas se usa `delivery_date`, que es la declarada.
- **Denominador cero → `NO CALCULABLE`**, nunca 0 % ni 100 %.

## 4. Historia perdida: efecto en todos los reportes

Los volúmenes de Docker se recrearon vacíos el 2026-10-13 y se perdieron los registros creados por las revisiones del
2026-10-12 (`docs/qa/HALLAZGO_PERDIDA_DATOS_DEMO_2026-10-13.md`). Consecuencia, que la respuesta declara siempre:

- La base contiene **solo** lo que siembra `seed-demo.ts` más lo creado después del 2026-10-13.
- **Toda serie anterior al 2026-10-13 está vacía por pérdida de almacenamiento, no por falta de actividad.** Un período
  que termine antes de esa fecha devuelve indicadores vacíos: la respuesta lo rotula como laguna conocida.
- Las cifras de los informes de QA del 2026-10-12 son **evidencia histórica**, no registros operativos: no se reconstruye
  ninguna cifra a partir de ellos.

## 5. Autorización

- `report:read` da acceso **a la pantalla**, no a los datos. Cada indicador exige además el permiso de **su dominio**:
  `producer:read`, `plot:read`, `delivery:read`, `lot:read`, `evidence:read`, `risk:read`, `dd:read`.
- Sin el permiso del dominio, el indicador sale como **`RESTRICTED`: sin valor, sin numerador, sin denominador y sin
  conteo**. No se devuelve un total del que pueda restarse nada: cada indicador es independiente y ninguno agrega sobre
  dominios que el lector no puede ver, de modo que **no se revelan recursos ocultos por diferencia**.
- El alcance por asignación (`*_assigned`) **no** habilita agregados: un técnico ve su trabajo, no cifras de la
  organización. Los permisos `_assigned` no conceden indicadores.
- `report:export` es un permiso **separado** de `report:read`, y se revalida al descargar.
- **Estos reportes no incluyen PII ni coordenadas**: solo conteos y porcentajes. Ni identidad de productores, ni
  geometrías, ni códigos de parcela.

## 6. Interpretación (lo que el reporte declara, por escrito)

- **Readiness no es conformidad.** `due_diligence_ready` cuenta preparación interna; `READY` y `EXPORTED` no son
  presentación de DDS.
- **Reserva no es despacho** (P0-029): ningún indicador presenta reservas como salidas.
- **`INTEGRATED` del catálogo CTE** sigue significando que la operación y su evento existen, no que estén acreditados.
- Calidad, origen, hallazgos técnicos de GIS, revisión de riesgo y preparación DD son **dimensiones distintas** y no se
  combinan en una puntuación única.

## 7. Exportación

CSV `TL_REPORT_CSV 0.1` (formato local propuesto; las fuentes no definen uno), reutilizando el patrón ya probado de
P0-025: cabecera de metadatos con organización, período, filtros, fecha de generación y alcance; `sha256` del cuerpo;
registro en auditoría con el hash y los filtros; y **neutralización de fórmulas** (`=`, `+`, `-`, `@`, tabulador, CR)
mediante `csvCell`. Se genera desde el mismo cálculo que la pantalla, en una sola lectura, de modo que lo exportado
coincide con lo mostrado. **No hay enlaces públicos**: la descarga exige sesión, `report:export` y pertenencia al tenant.

Límite técnico: el reporte es un conjunto acotado de indicadores, no una extracción de registros; no se pagina.
El formato es provisional y **no está aprobado por ninguna autoridad**.

## 8. Fuera de alcance (declarado, no omitido)

Los reportes por entidad de S1 §97 (productor, parcela, lote, riesgo, trazabilidad, DD) y la **exportación GeoJSON**
quedan fuera de esta entrega: el §97 los sitúa en su propio sprint y la exportación GeoJSON toca geometrías exactas, con
su clasificación de acceso (`plot:read_geometry`) y su decisión de perfil de destino pendiente de D-05 (P0-009/P0-010).
Esta entrega cubre **S1 §60**: los indicadores calculados desde consultas reales, con sus denominadores y permisos.
