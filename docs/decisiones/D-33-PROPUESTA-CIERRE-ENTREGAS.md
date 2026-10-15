# D-33 — Cierre de entregas y diferencias con causa (propuesta, 2026-10-15)

**Propuesta para decidir. Nada de esto está aprobado.** Hasta que se decida, una entrega con diferencia queda
abierta indefinidamente.

## Qué dicen las fuentes, literalmente

- **docs/06**: `receptions` lleva `quantity_received R` y **`difference_reason C`** (condicional), con la regla
  «Distinguir parcial/completa; idempotencia de confirmación». La fuente **ya previó** que haya diferencia y que
  tenga motivo; no dice cuándo la entrega queda cerrada.
- **docs/06 (migración 0021)**: «Recepción física… Append-only; **parciales permitidas**».
- **docs/05**: el peso declarado y el recibido son datos distintos y ambos se conservan.
- **D-33 ya adoptada para el MVP (2026-10-10)**: calidad durante o después del pesaje; sin dato = «Pendiente de
  evaluación»; recepción física y calidad como estados **separados**; y explícitamente **«sin tolerancias ni cierre
  por debajo de lo declarado»**.

**Lo que falta decidir** es lo que esa misma adopción dejó pendiente: **cierre de entregas parciales y tolerancias**.

## Qué hay implementado hoy

- Una entrega puede recibir **varias recepciones parciales**; cada una con su pesaje, append-only.
- Declarado y recibido se conservan por separado (probado en el recorrido integral: 500 declarados, 480 recibidos).
- Las correcciones de recepción existen, con motivo obligatorio, y quedan bloqueadas si el material ya está asignado,
  reservado o consumido (D-39.2).
- **No existe** un estado «entrega cerrada»: la entrega no tiene un final.

## Las cinco preguntas, con su propuesta

### 1. ¿Quién puede cerrar una entrega?

| Opción | A favor | En contra |
| --- | --- | --- |
| **A. Quien puede confirmar recepciones** (`reception:confirm`: ORG_ADMIN, MANAGER, RECEPTION_OPERATOR) | Cierra quien estuvo en la báscula | El operador podría cerrar ocultando una diferencia |
| B. Solo roles de gestión (ORG_ADMIN, MANAGER) | Separa ejecución de cierre | Cuello de botella en acopio |
| **C. A, pero si hay diferencia exige `delivery:correct`** (ORG_ADMIN, MANAGER) | Lo cotidiano es ágil; lo excepcional lo revisa otra persona | Un permiso más que explicar |

**Propuesta: C.** Cerrar sin diferencia es rutina; cerrar **con** diferencia es una afirmación sobre una pérdida y
merece una segunda persona, el mismo criterio de separación de funciones que ya rige en mitigaciones.

### 2. ¿Qué se considera «diferencia»?

**Propuesta**: `cantidad_declarada − Σ cantidades_recibidas`, en la unidad de la entrega, calculada **sobre
recepciones vigentes** (descontando correcciones). Positiva = faltó; negativa = llegó de más. Ambas son diferencia:
recibir **más** de lo declarado también necesita explicación.

### 3. ¿Hay tolerancia?

| Opción | Qué implica |
| --- | --- |
| **A. Tolerancia 0: toda diferencia distinta de cero exige motivo** | Honesto y simple. Puede resultar molesto con básculas de baja resolución |
| B. Tolerancia fija (p. ej. 0,5 %) | Cómodo, pero **inventa un número que ninguna fuente aprueba** y crea un margen en el que la pérdida deja de registrarse |
| C. Tolerancia configurable por organización | Flexible; abre la puerta a configurarla para que nunca haya diferencias |

**Propuesta: A, tolerancia 0**, hasta tener datos de campo.

**Aclaración, porque «tolerancia cero» se presta a dos lecturas y la primera versión no las separaba:**

| Lo que SÍ significa | Lo que NO significa |
| --- | --- |
| Que **cualquier** diferencia distinta de cero —por pequeña que sea— **exige motivo escrito** para poder cerrar | Que esté **prohibido cerrar** con diferencia |
| Que no hay ningún margen en el que la diferencia se considere «cero» y deje de registrarse | Que haya que rechazar la entrega, corregir el pesaje o cuadrar las cifras |
| Que el dato de la pérdida (o del excedente) queda **siempre** en el registro | Que la diferencia sea un error: puede ser merma legítima, humedad o un pesaje en otro punto |

Cerrar con diferencia es **normal y previsto**; lo único que se exige es que alguien diga por qué. La adopción de
2026-10-10 dijo «sin tolerancias ni cierre por debajo de lo declarado»: esta propuesta mantiene «sin tolerancias» y
**propone cambiar** lo segundo, que es justamente lo que hoy deja las entregas sin final.

Si el piloto demuestra que la báscula produce ruido sistemático, se revisa **con mediciones**, no con una intuición.

### 4. ¿El motivo es obligatorio?

**Propuesta: sí**, texto obligatorio (3–500 caracteres) cuando la diferencia ≠ 0, guardado en `difference_reason`
—el campo que docs/06 ya previó— y en el evento de cierre. **Sin catálogo cerrado de causas**: ninguna fuente lo
define y un catálogo prematuro empuja a elegir «Otro» siempre.

### 5. ¿Qué pasa después de cerrar?

**Propuesta**, con el detalle que faltaba sobre correcciones y material ya comprometido:

**a) Recepciones nuevas.** Una entrega cerrada **no las admite**. Si llega más material, es **otra entrega** que
referencia a la anterior. Así el peso declarado original no se reescribe nunca.

**b) Correcciones de recepciones ya existentes.** Siguen permitidas **con las guardas que ya existen hoy** (D-39.2),
que no cambian por cerrar la entrega:

| Situación del material recibido | ¿Se puede corregir el peso? | Qué pasa con la diferencia de la entrega |
| --- | --- | --- |
| Sin asignar a ningún lote | **Sí**, con motivo obligatorio | Se **recalcula** y el motivo de cierre queda **desactualizado**: hay que registrarlo de nuevo |
| **Asignado** a un lote (sin consumir) | **No**, hasta liberar la asignación por completo | — |
| **Reservado** para un embarque | **No** | — |
| **Consumido** por un proceso o despachado | **No**, nunca | — |

Es decir: **cerrar una entrega no afloja ninguna guarda y tampoco añade una nueva**. Lo que sí propone esta decisión
es que, si una corrección admisible cambia la diferencia, el cierre quede marcado como **«motivo desactualizado»** y
exija registrarlo otra vez; de lo contrario quedaría un motivo explicando una cifra que ya no existe.

**c) Reabrir.** No existe. Si el cierre fue un error, se corrige con un registro nuevo que lo explique, como todo lo
demás en el sistema. Un estado que se puede deshacer deja de ser un cierre.

## Qué desbloquea cada elección

| Si se decide… | Se desbloquea |
| --- | --- |
| Quién cierra (1) + motivo (2, 4) | El criterio **«diferencias con causa»** de **P0-012**, hoy pendiente |
| Efecto posterior (5) | Que una entrega tenga un final y deje de aparecer como trabajo abierto en «Mi trabajo» |
| Tolerancia (3) | Nada técnico: decidir **A** solo confirma lo vigente. Es la opción que **no** hay que apresurarse a cambiar |

Lo que **no** desbloquea: nada del expediente ni del despacho. Una entrega cerrada no es una entrega conforme.

## Decisión mínima que hace falta

Tres líneas: **(1)** quién cierra con diferencia, **(2)** si la tolerancia sigue en cero —entendida como «toda
diferencia necesita motivo», no como «no se puede cerrar con diferencia»—, y **(3)** si una entrega cerrada admite
recepciones nuevas. Con eso se implementa el cierre y se cierra el criterio pendiente de P0-012.

**Estas aclaraciones no son una aprobación.** D-33 sigue siendo una propuesta: nada de lo anterior está decidido.
