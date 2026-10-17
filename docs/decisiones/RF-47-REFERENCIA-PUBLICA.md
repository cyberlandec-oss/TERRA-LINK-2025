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

§49 no lo dice. O la referencia es **única de forma absoluta** y se resuelve sola —lo que un QR exige—, o es
única por organización y el enlace debe llevar la organización, reintroduciendo un identificador interno.
*Qué se necesita decidir*: cuál de los dos, y si es absoluta, que el índice `UNIQUE` sea sobre la columna sola.

### D-47.2 — Qué entidad es «Package»

Sin tabla `packages`, hay tres candidatos con significados distintos: `dd_cases` (el expediente, uno por lote),
`dd_snapshots` (la instantánea versionada, que es lo que de verdad se entrega) o `dd_exports` (la descarga
concreta). La diferencia no es cosmética: el paquete DD interno y la presentación oficial de DDS son procesos
distintos, y una referencia pública sobre el expediente sugiere algo distinto que sobre una instantánea.
*Qué se necesita decidir*: a cuál se ancla, o si se ancla a más de una.

### D-47.3 — A qué resuelve tras una corrección o una versión nueva

Parcela y productor conservan historial versionado (`plot_versions`, `producer_versions`), y las correcciones
crean registros nuevos sin sobrescribir el original. RF-47 exige que la referencia **se conserve** tras una
corrección; no dice **a qué apunta** después. O apunta a la entidad y muestra lo vigente, o apunta a una versión
y queda congelada. *Qué se necesita decidir*: entidad o versión. Si es entidad, la referencia sobrevive a las
correcciones por construcción; si es versión, hacen falta tantas referencias como versiones.

### D-47.4 — Emisión: a todas las filas o bajo demanda

«Podrá tener» es optativo. Si se emite a todas las filas, la columna es `NOT NULL` y hay que poblar los
registros existentes en la migración. Si se emite bajo demanda, es anulable y hace falta decidir **quién** la
emite, con qué permiso y si es revocable. *Qué se necesita decidir*: cuál de las dos, y en el caso de los
registros ya existentes, si se incorporan todos de una vez o solo cuando alguien los publica.

### D-47.5 — Qué se ve al resolverla

Formalmente esto es RF-33, no RF-47, pero la decisión de ámbito depende de ello y conviene dejarlo escrito
aquí: **una referencia pública no es un permiso de acceso.** Conocer la referencia no puede autorizar nada por
sí solo; la autorización por organización, acción y recurso sigue intacta, y resolver una referencia sin
autorización no debe distinguir «no existe» de «no te corresponde». *Qué se necesita decidir*: qué devuelve
exactamente una resolución no autorizada, y qué subconjunto por audiencia define RF-33.

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

No se ha añadido ninguna columna, migración ni endpoint. El siguiente paso es **resolver D-47.1 a D-47.5**; con
ellas resueltas, la implementación es directa y verificable contra §5.
