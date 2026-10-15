# D-07 — Qué puede concluir el motor de riesgo, y con qué reglas. Contrato para decidir (NO APROBADO)

Estado: **PROPUESTA**. **Nada de este documento está activo en el código.** El catálogo `risk_rule_sets` sigue
`NOT_APPROVED`, `risk_evaluations` sigue con su `CHECK (conclusion = 'UNDETERMINED' AND severity = 'NOT_ASSESSED')`,
y el expediente sigue sin poder llegar a `READY`. **Este documento no retira ninguna restricción.**

Revisión 1 — 2026-10-15. Qué es y qué no:

- **Es** el contrato que hay que decidir **antes** de tocar el motor: qué factores, con qué datos, qué produce cada
  hallazgo, cómo se tratan la ausencia y la contradicción, qué manda sobre qué, qué significa cada dimensión y
  quién puede publicar y aprobar reglas.
- **No es** una propuesta de pesos, umbrales ni puntuaciones. Donde la fuente no fija un número, **aquí no hay
  número**.
- **No es** un cambio de motor. El motor actual (P0-020) ya hace lo que debe hacer sin D-07: calcula factores
  técnicos, los explica y se niega a concluir.

> **Lo que D-07 NO es, dicho de una vez.** Cambiar `NOT_APPROVED` por `APPROVED` y quitar el `CHECK` no decide
> nada: solo deja que el sistema afirme cosas que nadie ha decidido. El candado **es** la decisión pendiente, no
> el obstáculo.

---

## 1. Las cuatro dimensiones, separadas

La confusión que D-07 tiene que evitar es tratarlas como grados de una misma escala. **No lo son**: se calculan con
datos distintos, las decide gente distinta y fallan de maneras distintas.

| # | Dimensión | Qué es | Quién la produce | Estado hoy |
| --- | --- | --- | --- | --- |
| 1 | **Hallazgo técnico observable** | Un hecho comprobable sobre los datos: «el lote tiene origen incompleto», «la geometría es inválida» | **El motor**, de forma determinista | **Implementado** (P0-020): `HIT` / `NOT_HIT` / `NOT_EVALUABLE` por factor |
| 2 | **Calidad y completitud de los datos** | Si había con qué evaluar: cobertura, vigencia, versión, ausencias | **El motor**, sobre la instantánea | **Implementado** en parte: `NOT_EVALUABLE` y `INCOMPLETE` existen; falta nombrar *por qué* falta cada dato |
| 3 | **Severidad de riesgo** | Cuánto importa un hallazgo, en una escala | **Una decisión de producto/regulatoria**, no el motor | **NO EXISTE**: `NOT_ASSESSED` fijado por `CHECK` |
| 4 | **Conclusión regulatoria** | Si el riesgo es insignificante o no, en el sentido de la norma | **Una revisión autorizada**, bajo un perfil jurídico | **NO EXISTE**: `UNDETERMINED` fijado por `CHECK` |

**Las cuatro reglas que no deben romperse:**

1. **Un hallazgo técnico no es severidad.** Que el origen esté incompleto es un hecho; cuánto pesa es una decisión.
2. **La calidad de datos no es riesgo bajo.** No haber podido evaluar nunca produce un resultado favorable.
3. **La severidad no es la conclusión.** `LOW` no significa «insignificante» en el sentido jurídico — lo dice la
   propia fuente (S1 §35: «no debemos convertir automáticamente LOW = insignificante legalmente»).
4. **La clasificación de riesgo de un país no es el riesgo de una parcela ni de un lote.** Ecuador figura como
   **riesgo estándar** (verificado el 2026-10-15, `docs/sources/eudr-norma-2026-10-15/`). Eso es una categoría del
   Art. 29 sobre un **territorio**, y **no** rellena ninguna de las cuatro dimensiones de un sujeto concreto. Si
   alguna regla futura quiere usarlo como **entrada**, tendrá que decirlo y decir con qué efecto.

---

## 2. Qué dice cada fuente, y qué no dice

| Fuente | Qué aporta | Qué **no** resuelve |
| --- | --- | --- |
| **S1 §33** | El riesgo no es un campo `risk = 72`: exige `risk_assessments`, `risk_factors`, `risk_evidence`, `risk_actions`, `risk_reviews` | Qué produce cada factor |
| **S1 §34** | Las **10 categorías** (ya implementadas como `CHECK` en `risk_rules`) | Qué reglas van en cada una |
| **S1 §35** | Los estados `NOT_ASSESSED`…`CRITICAL`, y **la advertencia**: no convertir `LOW` en «insignificante legalmente» sin reglas jurídicas configurables | Cuándo algo es `LOW` |
| **S1 §36** | El modelo de factor, con campos `weight` y `score` **existentes en el modelo** | Qué peso tiene nada |
| **S1 §37** | Un **ejemplo ilustrativo** de riesgo explicable: `+25 geometría incompleta, +30 alerta de cobertura, +15 evidencia legal insuficiente, +10 cadena compleja → score 80 = ALTO` | **Nada.** Es un ejemplo de *presentación*, no una tabla de pesos aprobada |
| **docs/13** | Dimensiones, categorías, registro de regla, evaluación reproducible, mitigación | Dice expresamente: «**No se aprueban pesos, umbrales ni lista jurídica definitiva en este paquete**» |
| **Reglamento (UE) 2023/1115** | Art. 10 (evaluación de riesgo) y Art. 11 (mitigación) como marco | El criterio operativo concreto para un lote de cacao ecuatoriano |

> **El punto incómodo de §37.** Es la única fuente con números, y es un **ejemplo**. Adoptar `+25/+30/+15/+10`
> sería una **decisión de producto presentada como derivación de la fuente**, que es justo lo que no se puede
> hacer. Si se quieren pesos, hay que decidirlos y firmarlos (§7, decisión **D-07.3**).

---

## 3. Factores exigidos y sus fuentes

El catálogo publicado (`0.2.0`, **NO APROBADO**) tiene **ocho** reglas. Esto es lo que hay, no lo que haría falta:

| Código | Categoría | Entrada | Efecto hoy | Depende de |
| --- | --- | --- | --- | --- |
| `DATA_MISSING_ORIGIN` | TRACEABILITY | Entregas sin origen declarado | BLOCKING | — |
| `MATERIAL_OF_UNKNOWN_ORIGIN` | MIXING | Lote con `origin_status = INCOMPLETE` | BLOCKING | — |
| `GEOMETRY_INVALID` | DATA_QUALITY | Evaluación `TL_GIS_TECH` de la versión vigente | BLOCKING | — |
| `MASS_BALANCE_INCONSISTENT` | TRACEABILITY | Conciliación del ledger | BLOCKING | — |
| `DOCUMENT_EXPIRED` | DOCUMENT_CREDIBILITY | Vigencia de soportes | REVIEW_REQUIRED | — |
| `MITIGATION_UNVERIFIED` | SUPPLY_CHAIN | Estado de mitigaciones | BLOCKING (en 0.2.0) | P0-021 |
| `SATELLITE_COVERAGE_UNKNOWN` | DEFORESTATION | Cobertura satelital | NOT_ASSESSED | P0-028 / D-09.B |
| `GEOLOCATION_PROFILE` | DEFORESTATION | Perfil de destino | NOT_ASSESSED | D-05 |

**Lo que falta, y que D-07 tiene que decidir si entra o no:** de las diez categorías, **cuatro no tienen ninguna
regla** — `LEGALITY`, `EVASION`, `HUMAN_RIGHTS`, `INDIGENOUS_RIGHTS` — y `SUPPLY_CHAIN` solo tiene la de
mitigación. No se proponen reglas nuevas aquí: proponerlas sin fuente sería inventar criterios de riesgo.

**`GEOLOCATION_PROFILE` cambia de situación, pero no de efecto.** Desde D-05.A el perfil técnico **sí** se evalúa
(`EUDR_GEO_V1`). Aun así la regla **sigue en `NOT_ASSESSED`**, y debe seguir: lo que el perfil acredita es que la
geometría está **bien formada para el destino**, no que la geolocalización satisfaga el requisito regulatorio. Esa
segunda cosa es D-05.B. **Convertir `MEETS_PROFILE` en un factor favorable sería exactamente el salto que D-05
prohíbe.** Si D-07 quiere usarlo, el camino honesto es un factor **nuevo y distinto**, sobre la calidad del dato
(dimensión 2), nunca sobre la conclusión.

---

## 4. Datos y versiones que exige una evaluación

Ya implementado y **no** se propone cambiarlo: la evaluación fija una **instantánea** (productores, parcelas,
entregas, lotes), guarda su **hash**, la versión del catálogo y los parámetros, y es **append-only**. Reevaluar
crea otra evaluación enlazada a la anterior.

Lo que D-07 debe decidir **sobre los datos**:

| # | Pregunta | Por qué importa |
| --- | --- | --- |
| 4.1 | **Qué versión de cada entrada cuenta**: ¿la vigente al evaluar, o la vigente al producirse el hecho? | Un lote de 2025 evaluado hoy contra la geometría de hoy puede no decir nada del cacao que salió |
| 4.2 | **Qué antigüedad invalida un dato** (evaluación GIS, soporte documental, resultado satelital) | Sin esto, un dato de hace dos años cuenta igual que uno de ayer |
| 4.3 | **Qué hace una evaluación `STALE`** cuando cambia la instantánea | Ya existe el mecanismo; falta decidir si una evaluación obsoleta puede sostener un expediente |
| 4.4 | **Alcance del grafo**: ¿hasta dónde se recorre el origen de un lote formado con lotes? | Hoy se recorre el grafo completo; decidir si eso se mantiene con volumen real |

---

## 5. Condiciones, ausencia, contradicción y precedencia

### 5.1 Qué produce cada hallazgo

Por factor, el motor ya produce `HIT` / `NOT_HIT` / `NOT_EVALUABLE`, con explicación y referencias. **Eso no
cambia.** Lo que D-07 añade es **qué significa** un `HIT`: hoy cada regla declara un `effect`
(`BLOCKING` / `REVIEW_REQUIRED` / `NOT_ASSESSED`) y **ahí se acaba**.

### 5.2 Información ausente

Regla que ya está implementada y que **debe conservarse explícitamente en el contrato**:

> **Un dato ausente nunca produce un resultado favorable.** Como mucho produce `INCOMPLETE` y una tarea de
> recopilación. Score insuficiente es `null` / `NOT_ASSESSED`, **no cero** (docs/13 §Dimensiones).

Lo que falta decidir: **distinguir por qué falta**. Hoy todo es `NOT_EVALUABLE`. No es lo mismo:

| Tipo de ausencia | Ejemplo | Tratamiento propuesto |
| --- | --- | --- |
| **Nunca se capturó** | Parcela sin geometría | `NOT_EVALUABLE` + tarea de captura |
| **Se capturó y no se evaluó** | Geometría sin evaluación GIS vigente | `NOT_EVALUABLE` + tarea de evaluación (es trabajo interno, no falta de dato) |
| **Depende de una decisión** | `SATELLITE_COVERAGE_UNKNOWN` (D-09.B), `GEOLOCATION_PROFILE` (D-05.B) | `NOT_EVALUABLE` **y no mitigable**: no se simula la resolución de una decisión ajena |
| **Restringido por permisos** | El evaluador no ve una parte del grafo | **Decisión pendiente**: ¿evaluación parcial declarada, o rechazo? Hoy no está resuelto |

### 5.3 Información antigua

**Sin decidir.** Hoy un soporte vencido dispara `DOCUMENT_EXPIRED` (REVIEW_REQUIRED), pero **no hay umbral de
antigüedad** para una evaluación GIS, un resultado satelital ni una mitigación verificada. Poner un número aquí
sin fuente sería inventarlo: es la decisión **D-07.4**.

### 5.4 Información contradictoria

**Sin tratar hoy, y es un hueco real.** Casos que ya pueden darse:

- Superficie **declarada** y **calculada** a distinto lado del umbral → D-05.A lo manda a **revisión humana**. El
  motor de riesgo **no lo ve**: no hay factor que lo recoja.
- Dos evaluaciones GIS de la misma versión con resultados distintos (posible si cambió la regla).
- Un soporte documental que afirma algo que el ledger contradice.

**Propuesta de principio, no de regla**: una contradicción **no se resuelve eligiendo**. Produce
`REVIEW_REQUIRED` con las dos cifras a la vista. Es la misma regla que ya se adoptó en D-05.A, y conviene que el
motor la herede en vez de inventar otra.

### 5.5 Precedencia

Ya implementado, y el contrato debe **ratificarlo tal cual**:

```
BLOCKED  >  REVIEW_REQUIRED  >  INCOMPLETE  >  NO_FINDINGS_IN_EVALUATED_RULES
```

- **Un factor bloqueante no se diluye.** No hay promedio que lo compense. Esto es lo que impide que un `score`
  bajo tape un hallazgo crítico (docs/13: «bloqueos se evalúan independientemente del promedio»).
- `NO_FINDINGS_IN_EVALUATED_RULES` **no es «sin riesgo»**: es «sin hallazgos **en lo que se evaluó**». El nombre
  está elegido para que no se pueda leer de otra manera, y **no debe acortarse**.

---

## 6. Severidad, conclusión, revisión y mitigación

### 6.1 Severidad (dimensión 3)

Hoy: `NOT_ASSESSED` por `CHECK`. Para que exista hace falta decidir **una** de estas tres vías — y son
**excluyentes**:

| Vía | Cómo funciona | A favor | En contra |
| --- | --- | --- | --- |
| **A · Severidad por regla** | Cada regla declara su severidad en el catálogo (`risk_rules.severity`, hoy forzada a `NULL`) | Explicable, sin aritmética opaca, trazable a la regla | No dice qué pasa con varias reglas a la vez: hace falta una regla de agregación (la máxima, propuesta) |
| **B · Score con pesos** | Suma ponderada estilo S1 §37 | Es lo único que la fuente ilustra | **Los pesos no están en ninguna fuente**; un score oculta factores; exige además umbrales de corte |
| **C · Sin severidad** | Se queda en `NOT_ASSESSED` indefinidamente | Honesto | Deja dos indicadores de reportes y un requisito del expediente muertos para siempre |

**Recomendación (no aprobada): vía A, con agregación por máximo.** Es la que mejor encaja con la precedencia ya
implementada, no introduce números sin fuente, y mantiene la explicabilidad que exige S1 §37 — que pide *riesgo
explicable*, no necesariamente *riesgo sumado*.

Si se elige **B**, los pesos **deben firmarse como decisión de producto**, con su fundamento, y hay que probar
explícitamente que **ningún peso puede tapar un bloqueante** (docs/13 lo exige por escrito).

### 6.2 Conclusión regulatoria (dimensión 4)

Hoy: `UNDETERMINED` por `CHECK`. **Esta no la puede producir el motor en ningún caso.** Exige:

1. Un **perfil jurídico** aprobado (hoy `LEGAL_PROFILE`, requisito abierto, P1-005) que diga qué requisitos
   aplican a un operador de cacao en Ecuador.
2. Una **revisión humana autorizada**, con actor, fecha y motivo.
3. Que **D-05.B** esté resuelta, porque la geolocalización es un requisito de información del Art. 9(1)(d) y hoy
   no se sabe a qué actor obliga.

**Propuesta de principio**: la conclusión **nunca** se deriva de la severidad. `CRITICAL` no implica
`NON_NEGLIGIBLE`, y ningún `LOW` implica `NEGLIGIBLE`. El motor puede **proponer** y una persona autorizada
**concluye**, dejando registro.

### 6.3 Qué hace de verdad una mitigación verificada

**La pregunta más fácil de responder mal.** Hoy, `MITIGATION_UNVERIFIED` está en `BLOCKING` (catálogo 0.2.0) y
verificar una mitigación lo apaga. Lo que **no** hace, y el contrato debe decirlo:

- **No cambia el hallazgo original.** Si el origen estaba incompleto, sigue incompleto.
- **No produce una conclusión favorable.** Resuelve una **tarea**, no un hecho.
- **No cierra la revisión por sí sola**: docs/13 pide reevaluar **después** de verificar, no en lugar de.
- **`RESOLVED` puede significar que se investigó y se rechazó el material**, no que pasó a ser elegible.

**Propuesta**: una mitigación verificada **habilita reevaluar**; el resultado lo decide la reevaluación, no la
mitigación. Y el ejecutor **no** puede ser el verificador (ya implementado, y debe conservarse).

### 6.4 Revisión humana

Existe (`START_REVIEW` / `RESOLVE` con motivo). Lo que falta decidir: **qué puede cambiar una revisión**. Hoy
cambia el proceso, no el resultado. La propuesta es que siga así: una revisión **no reescribe un factor técnico**,
y si hay que cambiar un hecho, se corrige el dato y se **reevalúa**.

---

## 7. El mínimo conjunto de decisiones para que D-07 sea implementable

Seis decisiones. **Las tres primeras bastan para desbloquear la severidad**; las tres últimas son la conclusión
regulatoria, que puede ir después.

| # | Decisión | Qué cambia en el sistema | Qué criterio desbloquea | Qué prueba lo demostraría |
| --- | --- | --- | --- | --- |
| **D-07.1** | **Quién aprueba un catálogo de reglas** y con qué registro | `risk_rule_sets.approval_status = APPROVED` con `approved_by`; hoy el `CHECK` ya exige aprobador | Nada por sí sola, pero **sin esto ninguna otra se puede aplicar** | Publicar un catálogo aprobado y comprobar que las evaluaciones anteriores **no cambian** y quedan ligadas a su versión |
| **D-07.2** | **Vía de severidad**: A (por regla), B (score con pesos) o C (ninguna) | Si A: `risk_rules.severity` deja de ser `NULL` forzado y se agrega por **máximo** | `risk_high` / `risk_medium` / `risk_low` de **P0-030** | Lote con dos factores de severidad distinta → gana la mayor; lote con un bloqueante y muchos leves → **el bloqueante no se diluye** |
| **D-07.3** | Si se elige B: **los pesos y los umbrales**, firmados, con fundamento | Modelo de score y cortes | Lo mismo que D-07.2 | Prueba explícita de que **ningún peso tapa un bloqueante**, y de que el score no sustituye a la precedencia |
| **D-07.4** | **Antigüedad**: qué vuelve obsoleto un dato y qué pasa entonces | Factores nuevos de calidad de dato; evaluaciones `STALE` con efecto definido | Parte del requisito `RISK_CATALOG_APPROVED` del expediente | Dato recién vencido → `NOT_EVALUABLE` o `REVIEW_REQUIRED`, **nunca** favorable |
| **D-07.5** | **Perfil jurídico** aplicable (quién, qué requisitos, qué vigencia) | Habilita el requisito `LEGAL_PROFILE` | `LEGAL_PROFILE` de **P0-022** | Requisito con perfil aprobado → evaluable; sin él → `NOT_EVALUABLE` con motivo |
| **D-07.6** | **Quién concluye** y bajo qué condiciones | Se levanta `risk_evaluations_no_conclusion` **solo** para revisiones autorizadas | `REGULATORY_CONCLUSION` de **P0-022** | Una conclusión sin revisor autorizado se **rechaza**; con revisor queda registrada con actor, fecha y motivo |

### 7.1 Lo que NO hay que decidir para avanzar

**D-07.2 no depende de D-07.5 ni de D-07.6.** Se puede tener severidad explicable mucho antes de poder concluir
nada en términos regulatorios. Separarlas evita el bloqueo general: hoy, **una sola decisión (D-07.2) desbloquea
dos indicadores de reportes** sin tocar la conclusión ni el expediente.

### 7.2 Qué revisión especializada hace falta, y para qué exactamente

No «una revisión regulatoria» en abstracto:

| Para | Hace falta | Para qué NO hace falta |
| --- | --- | --- |
| **D-07.5** y **D-07.6** | Un **responsable regulatorio** con criterio sobre EUDR y legislación ecuatoriana aplicable | No hace falta para D-07.1 ni D-07.2 |
| **D-07.2** y **D-07.3** | **Responsable de producto**, con el equipo | No hace falta un jurista para decidir si la severidad se declara por regla o se suma |
| `SATELLITE_COVERAGE_UNKNOWN` | **D-09 parte B** (uso real del proveedor) | No bloquea las demás reglas |
| `GEOLOCATION_PROFILE` | **D-05.B** | El perfil **técnico** ya está, y no sirve para esto |

---

## 8. Conservación de las evaluaciones históricas

Ya implementado, y el contrato lo **ratifica como requisito**, no como detalle:

- `risk_evaluations` es **append-only**, numerada por sujeto y enlazada a la anterior.
- Cada evaluación guarda **su** `rule_set_version`, su instantánea y su hash. Publicar un catálogo nuevo **no
  reescribe** ni recalcula nada.
- Una evaluación hecha con `0.2.0` seguirá diciendo `0.2.0` para siempre, aunque exista `1.0.0` aprobado.
- Un trabajo atrasado **no pisa** una evaluación posterior: se comprueba la versión objetivo.

**Lo que falta**: decidir **cómo se presenta** un conjunto de evaluaciones hechas con versiones distintas. Es el
mismo problema que D-05.A resolvió en `plots_valid` declarando `mixed_versions`, y conviene resolverlo igual.

---

## 9. Qué NO se hace en esta propuesta

- **No** se aprueba ningún catálogo, ni se cambia `NOT_APPROVED`.
- **No** se retira el `CHECK` de `risk_evaluations`, ni el de `risk_rules.severity`.
- **No** se proponen pesos, umbrales ni puntuaciones.
- **No** se añaden reglas a las categorías vacías: inventarlas sería fabricar criterios de riesgo.
- **No** se toca el expediente ni el despacho, ni se fuerza ningún `READY`.
- **No** se usa la clasificación de país como riesgo de un sujeto.

---

## 10. Estado de las piezas, para quien decida

| Pieza | Estado | Qué falta |
| --- | --- | --- |
| Motor de factores, explicación y referencias | **Implementado** (P0-020) | Nada para D-07.2 |
| Precedencia sin promedio | **Implementado** | Ratificarla |
| Instantánea, hash, append-only, `STALE` | **Implementado** | Efecto de `STALE` (D-07.4) |
| Catálogo versionado y publicable | **Implementado**, `0.1.0` y `0.2.0` `NOT_APPROVED` | Aprobador (D-07.1) |
| Severidad | **Bloqueada por `CHECK`** | D-07.2 (y D-07.3 si procede) |
| Conclusión regulatoria | **Bloqueada por `CHECK`** | D-07.5 y D-07.6 |
| Mitigación con ejecutor ≠ verificador | **Implementado** (P0-021) | Ratificar que **habilita reevaluar**, no concluir |
| Cuatro categorías sin reglas | **Vacías** | Decidir si entran, con fuente |
