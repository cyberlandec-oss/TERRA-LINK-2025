# Matriz del recorrido completo: qué está demostrado y dónde se detiene (2026-10-15)

Preparación de **P0-031**. Esto **no inicia ni completa el piloto**: no hay operadores reales, ni dataset de piloto,
ni Android real, ni restauración de respaldo. Preparar documentos y ejecutar pruebas sintéticas no es operar.

Validación de referencia: `validation-results/2026-10-15T01-45-25-586Z` — **APROBADA** sobre `a779ab3`:
**59 suites, 504 pruebas** de integración y **58 E2E**.

## Cómo leer la columna «evidencia»

| Tipo | Qué acredita | Dónde |
| --- | --- | --- |
| **U** unitaria | Invariantes y funciones puras. No toca base ni red | `apps/api/src/**/*.spec.ts` |
| **I** integración | PostgreSQL/PostGIS y Redis **reales**, base aislada `*_test`, datos sintéticos | `apps/api/test/**/*.int-spec.ts` |
| **N** navegador (E2E) | Chromium real contra la app, base `terra_link_e2e` | `e2e/tests/*.spec.ts` |
| **R** revisión por rol | Navegador real sobre datos DEMO, con capturas | `e2e/review/*.mjs` |
| **E** emulador | Android **emulado**; histórico, no dispositivo físico | `docs/qa/EVIDENCIA_EMULADOR_*` |
| **C** campo | Operadores reales, dispositivo real | **No ejecutado** |

Y la distinción que más importa aquí: **un bloqueo correcto demuestra la compuerta, no la operación que impide**.
Que el despacho se rechace no acredita que un despacho vaya a funcionar cuando se desbloquee.

## El recorrido, transición por transición

| # | Transición | Requisito y fuente | Implementación | Evidencia | Prueba integral pendiente | Bloqueo real → decisión |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Alta de **productor** (identidad cifrada, duplicados) | RF-04/05; S1 §§10–12 | P0-004/005 | I `producers`, `producer-matching`, `producer-identity-encryption` · N `productores` · R | Volumen de piloto (20–50 productores) | — (volumen es P0-031) |
| 2 | Productor → **parcela** | RF-06; S1 §§13–14 | P0-006 | I `plots` · N `parcelas` · R | Captura en campo | Ensayo Android real (gate aparte) |
| 3 | Parcela → **versión geométrica** (punto, polígono, GeoJSON) | RF-07/08/09; docs/10 | P0-007/008/009 | I `location-capture`, `polygon-drafts`, `geometry-imports` · N `ubicacion`, `poligono`, `geojson` · E | GPS nativo en dispositivo real | Ensayo Android real |
| 4 | Geometría → **validez GIS técnica** | RF-10; docs/10 | `TL_GIS_TECH 1.0.1` | I `gis-evaluation` · R `gis` · **I recorrido integral** | Umbral de superficie y perfil de destino | **D-05** |
| 5 | Parcela → **entrega** con origen declarado | RF-12; S1 §§22–24 | P0-012 | I `deliveries` · R `entregas` · **I recorrido** | Cierre de entrega con diferencia y tolerancias | **D-33** |
| 6 | Entrega → **recepción** y pesaje | RF-12; docs/06 | P0-012 | I `deliveries` · **I recorrido** (500 declarados ≠ 480 recibidos) | Recepciones parciales en operación real | **D-33** |
| 7 | Recepción → **calidad** (muestra, resultado, decisión) | RF-12; D-33 | P0-012 | I `deliveries` · **I recorrido** (liberada por decisión humana) | Catálogo de parámetros y límites verificados | **D-33** (+ D-32 para humedad) |
| 8 | Recepción → **lote** | RF-16; S1 §§25–27 | P0-016 | I `lots` · R `lotes` · **I recorrido** | — | — |
| 9 | Lote → **proceso** (fermentación cerrada con merma) | RF-16; QA-06 | P0-016 | I `lots` · **I recorrido** (480 = 430 + 50) | — | — |
| 10 | Proceso → **secado cerrado** | RF-16; D-39.3 | Preparar e iniciar sí; cerrar no | **I recorrido** (`DRYING_MOISTURE`) | Cierre de secado | **D-32** |
| 11 | Proceso → **inventario** (ledger única fuente) | RF-17; QA-06 | P0-017 | I `inventory` · R `inventario` · **I recorrido** (conciliación sin diferencias) | Concurrencia bajo carga de piloto | — |
| 12 | Lote → **evaluación de riesgo** | RF-20; docs/13 | P0-020, catálogo `0.1.0` **NO APROBADO** | I `risk` · R `riesgo` · **I recorrido** | Severidad y conclusión | **D-07** + catálogo aprobado |
| 13 | Riesgo → **mitigación** | RF-21; docs/13 | P0-021 | I `mitigations` · R `mitigaciones` · **I recorrido** (causa no accionable rechazada) | Verificación con soportes reales | — (las causas de D-05/D-09B no se mitigan a propósito) |
| 14 | Lote → **expediente DD** (instantánea y revisión) | RF-22; docs/13 | P0-022 | I `dd` · R `diligencia` · **I recorrido** (readiness BLOCKED) | READY con datos reales | **Seis requisitos no evaluables**: `GEOLOCATION_PROFILE` (D-05), `DEFORESTATION_ANALYSIS` (D-09 parte B), `LEGAL_PROFILE` (P1-005), `RISK_CATALOG_APPROVED` y `REGULATORY_CONCLUSION` (D-07), `SHIPMENT_LINK` (D-34/P0-029) |
| 15 | Expediente → **paquete DD exportado** | RF-22; docs/13 | Generador probado con fixture | I `dd` | Exportar un paquete de un expediente READY | Los **seis** de la fila 14 |
| 16 | Lote → **embarque** (comprador, ítems, reserva) | RF-29; docs/05 | P0-029 | I `shipments` · R `embarques-web` · **I recorrido** (reserva sin reducir existencia) | — | — |
| 17 | Embarque → **despacho** | RF-29; QA-06/12 | Caso de uso completo, compuerta cerrada | I `shipments` · **I recorrido** (`DISPATCH_BLOCKED`) | Despacho real de extremo a extremo | **D-34** + preflight (paquete DD, evidencia, compuerta) |
| 18 | Transversal: **documentos y evidencias** | RF-18/19; docs/12 | P0-018/019 | I `documents`, `evidence`, `scanner-limits`, `storage-sweeper` · R | Evidencia que acredite un requisito DD real | **D-37** (autoverificación) · **D-42** (satélite→evidencia) |
| 19 | Transversal: **auditoría** | RF-25; docs/07 | P0-025 **DONE_LOCAL** | I `audit` · R `auditoria` | Auditoría de un recorrido completo de piloto | **D-38** (formato y retención): política pendiente, **no** un criterio incumplido |
| 20 | Transversal: **offline y sincronización** | RF-23/24; docs/11 | P0-023/024 | I `sync` · E emulador · R `movil-web-preview` | Captura y sincronización en dispositivo real | Ensayo Android real · **D-40** |
| 21 | Transversal: **satélite** | RF-28; S1 §§39–41 | Adaptador Whisp de **desarrollo** | U `egress`, `provider`, `whisp` · I `satellite` · R `satelite` | Llamada a un proveedor real | **D-09 parte B** |
| 22 | Transversal: **reportes e indicadores** | RF-30; S1 §60/§97 | P0-030 | I `reports`, `reports-entities` · R | Cifras de un piloto real | **D-05** y **D-07** (2 de 11 indicadores) |
| 23 | Transversal: **autorización y aislamiento** | RF-02/03; docs/07 | RBAC versionado | I `rbac` + pruebas por módulo · **I recorrido** (organización ajena) | Elevación de SUPER_ADMIN **y concesiones entre organizaciones** (los dos criterios abiertos de P0-003) | **D-04** · contrato de concesiones (ADR-0002, P1-001) |

## Lo que el recorrido integral demostró de una sola pasada

`apps/api/test/recorrido-integral.int-spec.ts` (10 casos, base aislada, datos sintéticos) recorre la cadena entera y
deja escrito su propio alcance al terminar:

**Nueve transiciones encadenadas**: productor → parcela con polígono y evaluación técnica `VALID` → entrega de 500 kg
declarados → recepción de 480 (las dos cantidades conservadas por separado) → calidad liberada por decisión humana →
lote → fermentación cerrada (480 consumidos = 430 producidos + 50 de merma) → ledger conciliado sin diferencias →
riesgo técnico `INCOMPLETE` con severidad `NOT_ASSESSED` → expediente con cantidades y origen **cumplidos** →
embarque con **reserva real** (430 físicos, 200 reservados, 230 disponibles) → recorrido **inverso** desde el lote de
salida hasta el productor y la parcela → y la organización ajena sin poder leer ni referenciar nada.

**Seis bloqueos comprobados**, cada uno con su decisión responsable:

| Bloqueo | Código observado | Decisión |
| --- | --- | --- |
| Geometría → validez regulatoria | `DESTINATION_PROFILE_NOT_EVALUATED` | D-05 |
| Recepción → cierre con diferencia | sin política de cierre | D-33 |
| Fermentación → secado cerrado | `DRYING_MOISTURE` | D-32 |
| Riesgo → severidad y conclusión | catálogo `NOT_APPROVED` | D-07 |
| Expediente → READY y paquete | `READINESS_NOT_MET` (`GEOLOCATION_PROFILE`, `DEFORESTATION_ANALYSIS`) | D-05 y D-09 parte B |
| Embarque → despacho | `DISPATCH_BLOCKED` (`DD_PACKAGE`, `EVIDENCE`, `GATE`) | D-34 |

Un detalle que sale de ejecutarlo y no de leerlo: en el preflight del embarque, **calidad pasa** (`OK`) porque el
recorrido la liberó de verdad. Lo que detiene el despacho no es la calidad, sino el paquete DD, la evidencia y la
compuerta. Antes de este recorrido, la evidencia disponible dejaba las cuatro juntas en `BLOCKED`.

## Lo que falta probar (y no depende de ninguna decisión)

1. **Volumen de piloto** (QA-17): 20–50 productores, 20–100 parcelas, 1–3 lotes operados por personas, sin cambios
   manuales en la base. Es el criterio central de P0-031 y **no está ejecutado**.
2. **RPO/RTO con volumen real.** QA-16 está **completa en sus dos mitades**: respaldo y restauración verificados
   (13-oct sobre 37 migraciones; **15-oct sobre las 39 actuales**) y **la aplicación operando sobre la copia** en una
   instancia aislada —API y web propias— con 9 comprobaciones correctas, 3 bloqueos esperados y 0 fallas
   (`docs/qa/EVIDENCIA_QA16_RESTAURACION_2026-10-15.md`). Lo que **no** está medido son RPO/RTO: los tiempos (3 s de
   volcado, 13 s de restauración) son de un conjunto mínimo y no se extrapolan.
3. **Android real** (QA-08): captura, offline y sincronización en dispositivo físico. Hay evidencia de **emulador**,
   que es otra cosa y así está registrada.
4. **Capacitación y manual** de operación. No existen.
