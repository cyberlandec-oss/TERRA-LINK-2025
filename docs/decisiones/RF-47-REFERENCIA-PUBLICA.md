# RF-47 — Referencia pública por entidad (`public_reference`)

**Estado: análisis del contrato y decisiones de producto pendientes. No implementado.**
Fecha: 2026-10-16. Historia asociada: **P1-002**. Clasificación de alcance: **evolución (P1)** —
justificación con cita literal en `docs/03_REQUISITOS.md` §«RF-47: por qué es evolución y no MVP».

Este documento hace el contraste previo que la historia exige **antes de añadir ninguna columna**: qué dice la
fuente, qué identificadores ya existen, cuáles de ellos satisfacen el contrato y qué decisiones de producto
quedan sin definir. No añade columnas ni migraciones.

---

## 1. El texto original, completo

S1 §49, literal y sin recortar:

> **49. QR**
> Agregar QR desde la primera arquitectura aunque no sea obligatorio en el MVP.
> Entidades:
> Producer
> Plot
> Delivery
> Lot
> Package
> Shipment
> Cada una podrá tener:
> `public_reference`
> Nunca exponer directamente IDs internos.

De aquí sale **todo** el contrato, y conviene leer lo que dice con exactitud:

- **Seis entidades nombradas**: Producer, Plot, Delivery, Lot, **Package**, Shipment.
- **«Cada una podrá tener»** — *podrá*, no *tendrá*. La referencia es **optativa por entidad**, no un campo
  obligatorio en las seis tablas.
- **«Nunca exponer directamente IDs internos»** — esta es la única obligación **incondicional** de la sección, y
  no es una capacidad que entregar: es una restricción sobre cómo se expone lo que ya existe.
- Lo que la fuente **no** dice: ni el ámbito de unicidad, ni el formato, ni quién la emite, ni a qué resuelve,
  ni qué ocurre con las entidades versionadas. Eso es materia de las decisiones de §4.

---

## 2. Qué identificadores existen ya

Las seis entidades **ya tienen** un identificador legible que no es el UUID. Verificado contra la base de
desarrollo el 2026-10-16:

| Entidad de §49 | Tabla | Identificador actual | Origen del valor | Unicidad declarada |
| --- | --- | --- | --- | --- |
| Producer | `producers` | `producer_code` | **Lo escribe el operador** | `UNIQUE (organization_id, producer_code)` |
| Plot | `plots` | `plot_code` | **Lo escribe el operador** | `UNIQUE (organization_id, plot_code)` |
| Delivery | `deliveries` | `delivery_code` | Generado: `ENT-<año>-<5 dígitos>` | `UNIQUE (organization_id, delivery_code)` |
| Lot | `lots` | `lot_code` | Generado: `<tipo>-<año>-<5 dígitos>` | `UNIQUE (organization_id, lot_code)` |
| Shipment | `shipments` | `shipment_code` | Generado: `EMB-<año>-<5 dígitos>` | `UNIQUE (organization_id, shipment_code)` |
| **Package** | **no existe** | — | — | — |

Ninguno de los seis códigos aparece en un DTO de actualización: se fijan al crear y la API no los cambia. Esa
parte del contrato —estabilidad— **ya se cumple**.

**«Package» no tiene entidad.** No hay tabla `packages`. Lo que hay es `dd_cases` (el expediente, con
`case_number` = `DD-<año>-<5 dígitos>`), `dd_snapshots` (la instantánea versionada, con `snapshot_number`),
`dd_exports` (la descarga) y `dd_reviews`. Cuál de ellas es el «Package» de §49 es una decisión, no una lectura.

---

## 3. ¿Sirve el mecanismo existente? Propiedad por propiedad

La historia pide reutilizar lo que ya hay **cuando satisfaga el contrato**. Contrastado:

| Propiedad exigida | `producer_code`, `plot_code` | `delivery_code`, `lot_code`, `shipment_code`, `case_number` |
| --- | --- | --- |
| No es un ID interno | **Sí** | **Sí** |
| Estable durante la vida del registro | **Sí** — no actualizable por la API | **Sí** — no actualizable por la API |
| Único en un ámbito que sirva en público | **No** — solo por organización | **No** — solo por organización |
| No revela datos personales | **No** — es texto libre del operador | Sí |
| No permite enumerar | Sí — no es secuencial | **No** — es secuencial por año |

Dos fallos son decisivos y afectan a las seis entidades:

**a) La unicidad es por organización, no absoluta.** `UNIQUE (organization_id, plot_code)` permite que dos
organizaciones tengan ambas `PAR-001`. Una referencia que se resuelve **sin contexto de organización** —que es lo
que hace un QR escaneado por un tercero— no puede apoyarse en un valor único solo dentro del tenant. La
alternativa, llevar la organización en el enlace, reintroduce precisamente el identificador interno que §49
prohíbe exponer.

**b) `producer_code` y `plot_code` son texto libre del operador.** El patrón admitido es
`^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$`: nada impide que una organización registre `producer_code = '1712345678'`,
es decir, una cédula. Publicar ese valor convertiría la referencia pública en una vía de divulgación de
identidad, contra RNF-07 y contra el cifrado de identidad que D-43 acaba de reforzar. **Un código que el
operador elige no puede ser, por construcción, un valor publicable.**

Un fallo adicional afecta a los generados: **`ENT-2026-00001` es secuencial**. Publicado, revela el volumen de
operación de la organización y permite tantear referencias contiguas.

**Conclusión del contraste: el mecanismo existente no satisface el contrato.** `public_reference` tiene que ser
un valor nuevo y distinto de los códigos operativos, no un alias de ellos. Los códigos siguen siendo los
identificadores **internos y de operación**; la referencia pública es otra cosa y debe convivir con ellos.

---

## 4. Decisiones de producto que el contrato deja sin definir

El contrato es explícito en lo que pide y mudo en lo que sigue. **Estas cinco decisiones se presentan antes de
implementar, no después**, porque cada una cambia el esquema o el comportamiento:

### D-47.1 — Ámbito de unicidad

| Opción | Qué hace |
| --- | --- |
| **A** | **Única de forma absoluta**: `UNIQUE (public_reference)`, sin `organization_id`. La referencia se resuelve sola |
| **B** | Única por organización: `UNIQUE (organization_id, public_reference)`. El enlace debe llevar la organización |

**Recomendación: A.** **Efecto:** es la única compatible con la obligación incondicional de §49. Con B, resolver
`PAR-001` exige saber de qué organización es, así que el enlace tiene que transportar el `organization_id` —un
UUID interno— y eso es exactamente «exponer directamente IDs internos». A permite una ruta de la forma
`/r/<referencia>` sin ningún identificador interno a la vista. **Coste de A**: el valor necesita entropía
suficiente para no colisionar entre organizaciones y para no ser adivinable; eso lo fija D-47.4.

### D-47.2 — Qué entidad es «Package»

| Opción | Qué hace |
| --- | --- |
| **A** | `dd_cases` — el expediente, uno por lote |
| **B** | `dd_snapshots` — la instantánea versionada, con su versión y su hash |
| **C** | `dd_exports` — la descarga concreta |

**Recomendación: B.** **Efecto:** una referencia pública debe apuntar a algo **inmutable y comprobable**, y la
instantánea ya lo es: `docs/06` le exige `snapshot_version/hash R`. El expediente (A) es un proceso vivo cuyo
`readiness` cambia, así que la misma referencia significaría cosas distintas según cuándo se resuelva. La
descarga (C) es un hecho, no una cosa: habría una referencia nueva por cada descarga del mismo contenido.
**Condición que acompaña a B**: referenciar una instantánea **no** implica que esté aprobada ni que se haya
presentado una DDS; `EXPORTED` sigue significando «se descargó el paquete».

### D-47.3 — A qué resuelve tras una corrección o una versión nueva

| Opción | Qué hace |
| --- | --- |
| **A** | La referencia pertenece a **la entidad** y resuelve a lo vigente |
| **B** | La referencia pertenece a **cada versión** y queda congelada |
| **C** | Ambas: una de entidad y una por versión |

**Recomendación: A para las cinco entidades operativas** (productor, parcela, entrega, lote, embarque).
**Efecto:** RF-47 exige que la referencia **se conserve** tras una corrección, y una referencia de entidad lo
cumple por construcción: la corrección crea un registro nuevo relacionado con el original y la referencia no se
mueve. Con B, un QR ya impreso en una etiqueta de campo quedaría obsoleto en cuanto se corrige una geometría,
que es justo lo contrario de lo que se busca. El historial sigue alcanzable a través de la entidad, con la
autorización de siempre. **Para «Package» no aplica**: si D-47.2 = B, el destino ya es una instantánea inmutable,
de modo que se comporta como una referencia de versión sin necesidad de decidirlo aparte.

### D-47.4 — Emisión: a todas las filas o bajo demanda

| Opción | Qué hace |
| --- | --- |
| **A** | A todas las filas: columna `NOT NULL`, poblando los registros existentes en la migración |
| **B** | **Bajo demanda**: columna anulable con índice único parcial, emitida por un rol con permiso |

**Recomendación: B.** **Efecto:** respeta el «**podrá** tener» de §49, que es optativo y no obligatorio. Con A se
acuñaría una referencia pública para los 9 productores, 6 parcelas, 3 entregas y 3 lotes actuales **sin que nadie
lo haya pedido para ninguno**, creando superficie pública por defecto sobre datos de personas. Con B, la
**incorporación de los registros existentes** queda resuelta sin inventar valores: reciben referencia cuando
alguien decide publicarlos, y eso es comprobable como prueba. **Lo que B obliga a fijar**: quién la emite, que el
valor sea opaco y de entropía suficiente (D-47.1), y si es **revocable** —y qué ocurre con lo ya impreso si se
revoca—. **Coste de B frente a A**: hay dos estados (con y sin referencia) que la UI y la API deben tratar.

### D-47.5 — Qué devuelve una resolución no autorizada

| Opción | Qué hace |
| --- | --- |
| **A** | **Indistinguible**: la misma respuesta para «no existe» y «existe pero no te corresponde» |
| **B** | Distingue: `404` si no existe, `403` si existe y no está autorizado |

**Recomendación: A.** **Efecto:** con B, la referencia se convierte en un **oráculo de existencia**: probando
valores se confirma cuáles son válidos, y combinado con cualquier filtración de referencias permite censar
entidades ajenas. A lo impide y mantiene el invariante que importa: **una referencia pública no es un permiso de
acceso.** Conocerla no autoriza nada; la autorización por organización, acción y recurso sigue intacta. **Lo que
esta decisión no cubre**: qué subconjunto se muestra a cada audiencia cuando sí hay autorización, que es RF-33 y
se decide con esa historia.

### Resumen de lo recomendado

| Decisión | Recomendación |
| --- | --- |
| D-47.1 Ámbito | Única **absoluta**, sin `organization_id` en el índice |
| D-47.2 «Package» | **`dd_snapshots`**, sin que referenciar implique aprobación |
| D-47.3 Destino | **La entidad**, resolviendo a lo vigente, para las cinco operativas |
| D-47.4 Emisión | **Bajo demanda**, anulable, con índice único parcial |
| D-47.5 No autorizado | **Indistinguible** de inexistente |

Con estas cinco resueltas, el contrato queda cerrado y la implementación es directa y verificable contra §5.
**Mientras no se aprueben, no se añade ninguna columna.**

---

## 5. Lo que sí queda fijado, decida lo que decida el producto

Independientemente de las cinco decisiones, estas condiciones se verificarán en la implementación:

- **Estabilidad**: una vez emitida, la referencia no cambia durante la vida del registro, y ninguna ruta de la
  API la actualiza.
- **Unicidad comprobada en el ámbito que D-47.1 fije**, con restricción en la base y no solo en la aplicación.
- **Incorporación de los registros existentes** sin inventar valores ni reutilizar los códigos operativos.
- **Conservación tras correcciones y versiones nuevas**: una corrección no deja sin referencia al registro ni
  reasigna la que ya tenía.
- **Aislamiento intacto**: la referencia no concede acceso, no cruza organizaciones y no aparece en respuestas
  que el rol no podría ver de todos modos.
- **Sin datos personales en el valor**: la referencia no se deriva de ningún campo de identidad, ni de un hash
  de él (un hash de una cédula es otra vía para confirmarla).

---

## 6. Estado

No se ha añadido ninguna columna, migración ni endpoint. Las cinco decisiones de §4 están **presentadas con
opciones, recomendación y efecto** (revisión del 2026-10-16) y **esperan aprobación**. En cuanto se aprueben
—aceptando o cambiando cada recomendación— la implementación procede y se verifica contra §5.
