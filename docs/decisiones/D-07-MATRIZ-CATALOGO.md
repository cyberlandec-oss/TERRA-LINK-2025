# D-07 — Matriz del catálogo de reglas, para revisar antes de publicar nada (NO APROBADA)

Archivo: `docs/decisiones/D-07-MATRIZ-CATALOGO.md` · Revisión **1** (2026-10-15) · **Versión de catálogo
propuesta: ninguna todavía**. La matriz describe qué contendría una versión futura; **el número de versión se
decide al publicarla** (D-07.1), y publicar y adoptar son dos actos posteriores y distintos.

Estado: **PROPUESTA DE MATRIZ**. **Ningún catálogo nuevo se ha publicado ni adoptado.** Los catálogos `0.1.0` y
`0.2.0` siguen **tal cual, como históricos**, con **todas sus reglas sin severidad** y **sin adopción en ninguna
organización**.

**Aprobar el mecanismo no aprueba estas asignaciones.** El 2026-10-15 se adoptaron los *mecanismos* D-07.1, D-07.2
y D-07.4 (ver `docs/decisiones/D-07-PROPUESTA.md` §7). Esta matriz es lo que hay que revisar **antes** de publicar
una versión que declare severidades, y **no se aprueba sola**.

---

## 0. Cómo leer esta matriz

| Columna | Qué significa |
| --- | --- |
| **Severidad propuesta** | Lo que esta matriz **sugiere**. No está en vigor |
| **Respaldo** | **FUENTE** si la asignación se deriva de un texto citable · **PRODUCTO** si es una decisión que alguien tiene que tomar y firmar |
| **Si faltan datos** | Qué hace el motor cuando no puede evaluar la regla. **Nunca** un resultado favorable |
| **Efecto** | `BLOCKING` impide avanzar · `REVIEW_REQUIRED` exige revisión humana · `NOT_ASSESSED` solo informa |

Dos cosas que la matriz **no** hace, por diseño:

1. **No propone reglas nuevas.** Las ocho son las que ya existen. Inventar reglas para las cuatro categorías
   vacías sería fabricar criterios de riesgo sin fuente.
2. **No propone pesos ni cortes.** D-07.3 no aplica: la severidad se declara por regla y se agrega por **máximo**.

---

## 1. La matriz

### 1.1 `MATERIAL_OF_UNKNOWN_ORIGIN` — MIXING

| | |
| --- | --- |
| **Condición** | El lote, o algún lote de su grafo de origen, tiene `origin_status = INCOMPLETE` |
| **Datos necesarios** | Grafo de lotes y su `origin_status`; se recorre completo hacia arriba |
| **Si faltan datos** | No pueden faltar: el `origin_status` siempre existe. Si el grafo no se pudiera recorrer, `NOT_EVALUABLE` |
| **Efecto** | `BLOCKING` (ya vigente) |
| **Severidad propuesta** | **`CRITICAL`** |
| **Respaldo** | **FUENTE.** docs/13: «Un saldo positivo no autoriza mezcla». El Art. 9(1)(d) exige la geolocalización de **todas** las parcelas: material de origen desconocido no puede declararse |
| **Casos de prueba** | Lote con insumo de origen incompleto → `HIT` + `CRITICAL` · lote con todo el grafo completo → `NOT_HIT` · lote formado con dos lotes, uno incompleto → `HIT` y la referencia nombra **cuál** |

### 1.2 `DATA_MISSING_ORIGIN` — TRACEABILITY

| | |
| --- | --- |
| **Condición** | Hay entregas en el grafo sin origen declarado |
| **Datos necesarios** | Entregas del grafo y sus orígenes (`delivery_origins`) |
| **Si faltan datos** | `NOT_EVALUABLE` si no se pueden leer las entregas |
| **Efecto** | `BLOCKING` (ya vigente) |
| **Severidad propuesta** | **`HIGH`** |
| **Respaldo** | **FUENTE** en cuanto al hecho (Art. 9(1)(d)). **PRODUCTO** en cuanto al grado: por qué `HIGH` y no `CRITICAL`. Propuesta: una entrega sin origen es **corregible** aportando el dato; mezclar material de origen desconocido ya consumado, no |
| **Casos de prueba** | Entrega sin origen → `HIT` + `HIGH` · todas con origen → `NOT_HIT` · dos entregas, una sin origen → `HIT` y se nombra la entrega |

### 1.3 `GEOMETRY_INVALID` — DATA_QUALITY

| | |
| --- | --- |
| **Condición** | La versión vigente de alguna parcela de origen es técnicamente inválida (`TL_GIS_TECH`) |
| **Datos necesarios** | Versión vigente de cada parcela y su evaluación `TL_GIS_TECH` |
| **Si faltan datos** | **`NOT_EVALUABLE`** si alguna parcela no tiene evaluación técnica vigente. **No se presume válida** |
| **Efecto** | `BLOCKING` (ya vigente) |
| **Severidad propuesta** | **`HIGH`** |
| **Respaldo** | **PRODUCTO.** docs/13 la trata como «bloqueo de análisis fiable», que es un efecto, no una severidad. Propuesta: `HIGH` porque invalida el análisis posterior sin afirmar nada sobre el terreno |
| **Casos de prueba** | Parcela con autointersección → `HIT` + `HIGH` · parcela válida → `NOT_HIT` · parcela **sin evaluar** → `NOT_EVALUABLE`, y la severidad del lote **no** se completa |

### 1.4 `MASS_BALANCE_INCONSISTENT` — TRACEABILITY

| | |
| --- | --- |
| **Condición** | La conciliación del ledger arroja diferencias |
| **Datos necesarios** | Movimientos del ledger del lote y su grafo |
| **Si faltan datos** | `NOT_EVALUABLE` |
| **Efecto** | `BLOCKING` (ya vigente) |
| **Severidad propuesta** | **`CRITICAL`** |
| **Respaldo** | **FUENTE.** docs/13: «Bloqueo de consumo/despacho». Una inconsistencia de masa significa que las cantidades declaradas no cuadran: cualquier afirmación de trazabilidad sobre ese lote queda en el aire |
| **Casos de prueba** | Ledger conciliado → `NOT_HIT` · diferencia inyectada → `HIT` + `CRITICAL` · lote sin movimientos → `NOT_EVALUABLE` |

### 1.5 `DOCUMENT_EXPIRED` — DOCUMENT_CREDIBILITY

| | |
| --- | --- |
| **Condición** | Hay soportes documentales vencidos entre las entregas de origen |
| **Datos necesarios** | Soportes vinculados y su vigencia declarada |
| **Si faltan datos** | **`NOT_EVALUABLE`** cuando no hay soportes: «evidencia insuficiente, **no se presume vigente**» (ya implementado) |
| **Efecto** | `REVIEW_REQUIRED` (ya vigente) |
| **Severidad propuesta** | **`MEDIUM`** |
| **Respaldo** | **PRODUCTO.** docs/13 solo fija el límite: «comprobar alcance temporal». Propuesta: `MEDIUM` porque un documento vencido **no** prueba ilegalidad, y su efecto ya es revisión humana, no bloqueo |
| **Casos de prueba** | Soporte vigente → `NOT_HIT` · soporte vencido → `HIT` + `MEDIUM` · **sin soportes** → `NOT_EVALUABLE`, nunca `NOT_HIT` |

### 1.6 `MITIGATION_UNVERIFIED` — SUPPLY_CHAIN

| | |
| --- | --- |
| **Condición** | Hay mitigaciones abiertas sin verificar |
| **Datos necesarios** | Mitigaciones del sujeto y su estado |
| **Si faltan datos** | `NOT_HIT` si no hay mitigaciones (no es ausencia de dato: es ausencia de tarea) |
| **Efecto** | `BLOCKING` en `0.2.0`; era `NOT_ASSESSED` en `0.1.0` |
| **Severidad propuesta** | **Ninguna: `NULL`** |
| **Respaldo** | **PRODUCTO, y la propuesta es NO asignarla.** Una mitigación sin verificar es **trabajo pendiente**, no un hallazgo sobre el cacao. Darle severidad mezclaría la dimensión 1 (hallazgo) con el proceso de revisión. Su efecto `BLOCKING` ya impide cerrar la revisión, que es lo que debe hacer |
| **Casos de prueba** | Sin mitigaciones → `NOT_HIT` · mitigación abierta → `HIT`, **sin** aportar severidad · mitigación verificada → `NOT_HIT`, y **reevaluar** vuelve a mirar la causa original |

### 1.7 `SATELLITE_COVERAGE_UNKNOWN` — DEFORESTATION

| | |
| --- | --- |
| **Condición** | No hay cobertura satelital conocida para las parcelas de origen |
| **Datos necesarios** | Resultados satelitales por versión de parcela |
| **Si faltan datos** | **`NOT_EVALUABLE` siempre, hoy**: no hay proveedor en uso real (**D-09 parte B**) |
| **Efecto** | `NOT_ASSESSED` (ya vigente) |
| **Severidad propuesta** | **Ninguna: `NULL`, hasta D-09.B** |
| **Respaldo** | **FUENTE.** docs/13: «Sin alertas no prueba ausencia de deforestación». Asignarle severidad hoy sería clasificar algo que **no se ha podido mirar** |
| **Casos de prueba** | Sin resultados → `NOT_EVALUABLE` y la cobertura lo declara · con resultado sintético → sigue `NOT_EVALUABLE` (`is_synthetic` no satisface ningún requisito) |

### 1.8 `GEOLOCATION_PROFILE` — DEFORESTATION

| | |
| --- | --- |
| **Condición** | Perfil de destino de las parcelas de origen |
| **Datos necesarios** | Dictamen `EUDR_GEO_V1` de la versión vigente (existe desde D-05.A) |
| **Si faltan datos** | `NOT_EVALUABLE` |
| **Efecto** | `NOT_ASSESSED` (ya vigente) |
| **Severidad propuesta** | **Ninguna: `NULL`, hasta D-05.B** |
| **Respaldo** | **FUENTE.** Cumplir el perfil **técnico** no acredita el requisito regulatorio de geolocalización: eso es D-05.B. Convertir `MEETS_PROFILE` en factor favorable sería el salto que D-05 prohíbe expresamente |
| **Nota** | Si se quiere usar el dictamen del perfil, el camino honesto es una regla **nueva y distinta**, de **calidad del dato** (dimensión 2), que diga «esta parcela no está preparada para intercambio» y **nunca** «esta parcela cumple» |
| **Casos de prueba** | Parcela sin dictamen de perfil → `NOT_EVALUABLE` · parcela con `MEETS_PROFILE` → **sigue** `NOT_EVALUABLE` para esta regla, y la cobertura lo explica |

---

## 2. Resumen de respaldo

| Respaldo | Reglas |
| --- | --- |
| **FUENTE** — derivable de un texto citable | `MATERIAL_OF_UNKNOWN_ORIGIN` (`CRITICAL`), `MASS_BALANCE_INCONSISTENT` (`CRITICAL`), y las tres que proponen **no** clasificar: `SATELLITE_COVERAGE_UNKNOWN`, `GEOLOCATION_PROFILE`, `MITIGATION_UNVERIFIED` |
| **PRODUCTO** — hace falta decidir y firmar | `DATA_MISSING_ORIGIN` (`HIGH`), `GEOMETRY_INVALID` (`HIGH`), `DOCUMENT_EXPIRED` (`MEDIUM`) |

**Tres asignaciones son decisiones de producto, no derivaciones.** Están marcadas una por una y no deben aprobarse
sin que alguien las firme como tales.

---

## 2.bis El caso mixto: qué sale cuando se juntan las tres situaciones

La pregunta que decide si la matriz es segura: **un lote con hallazgos clasificados, hallazgos sin severidad
declarada y reglas que no se pudieron evaluar, ¿qué devuelve?**

Con esta matriz y el mecanismo ya implementado:

| Qué entra | Qué sale |
| --- | --- |
| Hallazgos **con** severidad declarada | **Se clasifican**: la severidad del lote es el **máximo** de ellos |
| Hallazgos **sin** severidad declarada | **No aportan severidad**, pero **siguen siendo hallazgos**: cuentan para el resultado técnico y se listan en `hits_without_declared_severity` |
| Reglas **no evaluables** | **No aportan nada**: no se sabe qué habrían dado. Se listan en `not_evaluable_codes` |
| Categorías **sin ninguna regla** | Se listan en `categories_without_rules` |

Y entonces:

- **La severidad se emite igual.** Un hallazgo conocido **no desaparece** porque otra regla no se pudiera
  evaluar. Callarlo sería peor que publicarlo con su contexto.
- **La cobertura marca `complete: false`** y el motivo empieza por «**Clasificación PARCIAL**», enumerando qué
  quedó fuera y cerrando con «**No es una evaluación completa del riesgo del lote**».
- **El resultado técnico no cambia**: sigue decidido por precedencia
  (`BLOCKED > REVIEW_REQUIRED > INCOMPLETE > NO_FINDINGS_IN_EVALUATED_RULES`), y un bloqueante **no se diluye**
  por mucha severidad baja que haya alrededor.
- **La conclusión regulatoria sigue `UNDETERMINED`**, pase lo que pase.

**Ejemplo concreto con esta matriz.** Un lote con origen incompleto (`CRITICAL`), con `MITIGATION_UNVERIFIED`
abierta (hallazgo **sin** severidad por decisión) y sin cobertura satelital (**no evaluable**):

| Campo | Valor |
| --- | --- |
| Severidad | **`CRITICAL`** |
| `hits` | 2 |
| `hits_without_declared_severity` | `['MITIGATION_UNVERIFIED']` |
| `not_evaluable_codes` | `['SATELLITE_COVERAGE_UNKNOWN', 'GEOLOCATION_PROFILE']` |
| `categories_without_rules` | `['LEGALITY','EVASION','HUMAN_RIGHTS','INDIGENOUS_RIGHTS']` |
| `complete` | **`false`** |
| Resultado técnico | **`BLOCKED`** |
| Conclusión | **`UNDETERMINED`** |

**Caso límite que conviene mirar antes de aprobar**: si **todos** los hallazgos fueran de reglas sin severidad
declarada, el lote sale **`NOT_ASSESSED`** aunque esté **bloqueado**. No es un error —no hay con qué
clasificar—, pero significa que un lote puede estar `BLOCKED` y «sin clasificar» a la vez. **Severidad y
resultado técnico son dimensiones distintas**, y la pantalla las muestra por separado precisamente por esto.

**Probado en** `apps/api/test/d07-mecanismos.int-spec.ts`: «clasificación PARCIAL: un hallazgo conocido no
desaparece porque otra regla no se pueda evaluar» y «un hallazgo cuya regla no declara severidad no clasifica, y
se dice cuál».

## 3. Lo que esta matriz deja fuera, y hay que saberlo al aprobarla

1. **Cuatro categorías siguen sin ninguna regla**: `LEGALITY`, `EVASION`, `HUMAN_RIGHTS`, `INDIGENOUS_RIGHTS`.
   Con este catálogo, **toda clasificación será PARCIAL** y el sistema lo dirá en la cobertura de cada evaluación.
   Es correcto: una severidad calculada sobre seis reglas no cubre diez categorías.
2. **Tres de las ocho reglas no clasifican nunca** con esta propuesta. En la práctica, la severidad saldrá de
   cinco reglas como mucho.
3. **Una severidad `CRITICAL` no es una conclusión regulatoria.** Sigue `UNDETERMINED` por `CHECK`, y D-07.5 y
   D-07.6 siguen pendientes.
4. **Adoptar este catálogo no recalcula nada.** Las evaluaciones anteriores conservan su versión y su resultado;
   para que la adopción surta efecto hay que **reevaluar**, que crea un registro nuevo.

---

## 4. Qué hace falta para aprobar esta matriz

| # | Pendiente | De quién |
| --- | --- | --- |
| 1 | Firmar las **tres asignaciones de PRODUCTO** (§2), o cambiarlas | Responsable de producto |
| 2 | Confirmar que `MITIGATION_UNVERIFIED` **no** lleve severidad | Responsable de producto |
| 3 | Decidir si se publica una versión con estas severidades, y con qué número | Responsable de producto |
| 4 | Adoptarla en cada organización que vaya a usarla (D-07.1) | Administrador de cada organización |

**Nada de esto se ha hecho.** Publicar la versión y adoptarla son actos posteriores y deliberados, y esta matriz
no los autoriza.
