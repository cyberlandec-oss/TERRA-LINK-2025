# D-34 — Condición de `dd_package_id` y `dispatch_at` en el despacho (PROPUESTA, no decidida)

Archivo: `docs/decisiones/D-34-PROPUESTA.md` · Revisión **1** (2026-10-16) · Estado: **PROPUESTA**.

**Nada de esto está adoptado.** Este documento existe para decidir, no para registrar algo hecho. **Decidir no
implementa nada**: lo que aquí se elija sigue necesitando código, una versión nueva del catálogo KDE y sus
pruebas, que se estiman al final.

## 1. El texto exacto de la decisión abierta

De `docs/22_DECISIONES_Y_PENDIENTES.md`, literal:

> **D-34** — **Adoptado para el MVP local (2026-10-10, instrucción de diseño; no validada en campo)**:
> `deliveries.production_period` con precisión día / mes o intervalo de meses / desconocido; meses como modalidad
> principal; desconocido no bloquea y queda pendiente (KDE 1.1.0). **Pendiente**: condición escrita de
> `shipments.dd_package_id` y `shipments.dispatch_at` (embarques P0-029; P0-022 no los usa todavía: el vínculo con
> embarques queda NO EVALUABLE en el expediente). Desde 2026-10-12 la compuerta SHIPMENT_DISPATCH (KDE 1.5.0) los
> marca BLOCKED_PENDING_DECISION: **ningún embarque se despacha hasta resolver D-34**.
> · Producto/trazabilidad · **Pendiente**: condición escrita de los campos de embarque y nueva versión del catálogo KDE

**Lo ya adoptado no se reabre.** La parte de `production_period` está decidida desde el 2026-10-10. Lo que queda
abierto es **solo** la condición de los dos campos del embarque.

### De dónde viene el «C»

`docs/06_DICCIONARIO_DATOS.md`, fila `shipments/items`:

> `shipment_code/buyer/destination/status` **R**; `lot_id/quantity/unit` **R** por item; `dd_package_id` **C**;
> `dispatch_at` **C**

`R` es requerido y `C` es **condicional**. El diccionario marca los dos campos como condicionales **sin escribir
la condición**. El catálogo KDE lo recoge tal cual, con el motivo a la vista:

> `SHIPMENT_DISPATCH_AT` · `requirement: 'CONDITIONAL'` ·
> `condition: { kind: 'undefined_in_contract', note: 'docs/06 marca dispatch_at como condicional sin escribir la condición (D-34).' }`

Eso es lo que hay que resolver: **cuándo son obligatorios**.

## 2. Qué está bloqueado hoy, exactamente

| | |
| --- | --- |
| Compuerta | `SHIPMENT_DISPATCH` (KDE 1.5.0), desde el 2026-10-12 |
| Estado que devuelve | `BLOCKED_PENDING_DECISION` para `dd_package_id` y `dispatch_at` |
| Efecto | **Ningún embarque se despacha.** No es un fallo: es la compuerta haciendo lo que debe mientras falta la condición |
| Historias afectadas | **P0-029** (despacho no demostrado) · **P0-017** (criterio de despacho) · **P0-022** (el requisito `SHIPMENT_LINK` del expediente queda `NOT_EVALUABLE`) |
| Requisitos afectados | **RF-17**, **RF-29** y **RNF-02** (integridad transaccional: el despacho es la única operación del ledger sin probar concurrente contra datos reales) |

**Tres requisitos con una sola decisión.** Es la decisión abierta con mejor relación entre lo que cuesta decidir y
lo que desbloquea.

## 3. Las opciones

La pregunta es una: **¿qué debe existir para que un embarque pueda despacharse?**

---

### Opción A — Siempre obligatorios

`dd_package_id` y `dispatch_at` son **requeridos** para despachar. Sin un paquete de debida diligencia exportado
y sin fecha de despacho, la operación se rechaza.

| | |
| --- | --- |
| **A favor** | Es la lectura más estricta y la más fácil de defender: no sale producto sin expediente. Coincide con el principio del proyecto —«Origen desconocido y datos faltantes siguen siendo desconocidos»— y con que `EXPORTED` signifique algo |
| **En contra** | **Hoy es inalcanzable**: `READY` exige seis requisitos no evaluables (D-05.B, D-09.B, P1-005, D-07.5/.6, el propio D-34) y `DD_PACKAGE` no puede exportarse sin aprobación. Adoptar A deja el despacho **igual de bloqueado que ahora**, pero por un motivo distinto |
| **Consecuencia** | P0-029 y P0-017 **no** se cierran. RNF-02 sigue sin probarse. Se cambia «falta decidir» por «falta el expediente», que es honesto pero no desbloquea |

---

### Opción B — Obligatorios según el destino *(recomendada)*

`dispatch_at` es **siempre requerido** —es el hecho físico: sin fecha no hay despacho que registrar—. `dd_package_id`
es requerido **cuando el embarque declara un destino sujeto a EUDR**, y opcional en el resto.

| | |
| --- | --- |
| **A favor** | Separa **dos cosas distintas** que hoy están pegadas: registrar que la mercancía salió, y acreditar diligencia ante un destino que la exige. Un embarque nacional o a un destino no sujeto no necesita paquete DD, y exigirlo sería inventar una obligación. Permite **probar el despacho** —consumo único, idempotencia, concurrencia— con embarques no sujetos, cerrando RNF-02 sin fingir conformidad |
| **En contra** | Exige un dato que hoy no existe: **si el destino está sujeto a EUDR**. `shipments.destination` es texto declarado, no un país normalizado con régimen. Hay que añadirlo y decidir quién lo determina |
| **Consecuencia** | P0-029 y P0-017 **pueden cerrarse** para el despacho no sujeto. Los embarques a destino sujeto siguen bloqueados —correctamente— hasta que exista el expediente. `SHIPMENT_LINK` pasa de `NOT_EVALUABLE` a evaluable |
| **Riesgo que hay que mirar de frente** | Que «destino no sujeto» se use como atajo para despachar sin expediente. Se mitiga: el régimen del destino es **declarado y auditado**, queda en el evento de despacho, y un embarque declarado no sujeto **no puede** después presentarse como acreditado |

---

### Opción C — Obligatorios al cerrar, no al despachar

Se permite despachar con los dos campos vacíos y se exige completarlos **después**, para cerrar el embarque.

| | |
| --- | --- |
| **A favor** | Desbloquea de inmediato y refleja operaciones reales donde el papeleo llega tarde |
| **En contra** | **Rompe el principio del proyecto.** Un despacho ya ocurrido no se puede condicionar luego: la mercancía salió. Crea un estado «despachado pero sin acreditar» que es exactamente lo que `EXPORTED` no debe significar |
| **Consecuencia** | Cierra P0-029 rápido y a cambio deja el sistema afirmando algo que no sostiene. **Se descarta**, y se deja escrita para que la descarte quien decide, no quien implementa |

---

## 4. Recomendación

**Opción B.** Razón corta: es la única que distingue el **hecho** (salió mercancía) de la **acreditación** (ante un
destino que la exige), y esa distinción es la que el proyecto aplica en todas partes — resultado técnico frente a
conclusión regulatoria, publicación frente a adopción, perfil técnico frente a aplicabilidad jurídica.

A es defendible pero no desbloquea nada hoy; C desbloquea al precio de que `EXPORTED` deje de significar algo.

**Con una condición**: el régimen del destino se declara explícitamente, con su responsable y su momento, y
**nunca** se infiere del nombre del país escrito a mano.

## 5. Qué permitiría demostrar cada opción

| Criterio | Hoy | Con A | Con B | Con C |
| --- | --- | --- | --- | --- |
| **RF-29** «despacho idempotente y grafo destino» | No demostrado | No (sigue sin expediente) | **Sí**, con embarques no sujetos | Sí |
| **RF-17** «reserva/despacho» del inventario | Parcial | Parcial | **Demostrable** | Demostrable |
| **RNF-02** integridad transaccional en el despacho | Sin probar | Sin probar | **Demostrable** (consumo único y concurrencia reales) | Demostrable |
| **P0-022** `SHIPMENT_LINK` del expediente | `NOT_EVALUABLE` | `NOT_EVALUABLE` | **Evaluable** | Evaluable |
| `READY` del expediente | Bloqueado | Bloqueado | **Sigue bloqueado** (D-05.B, D-07.5/.6, P1-005, D-09.B) | Sigue bloqueado |
| Conclusión regulatoria | `UNDETERMINED` | `UNDETERMINED` | **`UNDETERMINED`** | `UNDETERMINED` |

**Ninguna opción habilita `READY`, conclusión regulatoria ni conformidad EUDR.** D-34 desbloquea el **despacho
físico y su registro**, no la acreditación.

## 6. Lo que hace falta DESPUÉS de decidir

Decidir no es implementar. Con la opción B, el trabajo sería:

| # | Trabajo | Dónde |
| --- | --- | --- |
| 1 | Régimen del destino declarado y auditado, con responsable y momento | `shipments`, migración nueva |
| 2 | Escribir la condición en el diccionario: qué hace `C` en cada campo | `docs/06_DICCIONARIO_DATOS.md` |
| 3 | Nueva versión del catálogo KDE con la condición escrita; `SHIPMENT_DISPATCH_AT` deja de ser `undefined_in_contract` | Migración, catálogo KDE |
| 4 | La compuerta `SHIPMENT_DISPATCH` deja de responder `BLOCKED_PENDING_DECISION` y evalúa la condición real | `apps/api/src/traceability` |
| 5 | Pasar el vínculo CTE `SHIPMENT` de `PENDING` a `INTEGRATED` | Catálogo CTE, versión nueva |
| 6 | **Pruebas**: despacho idempotente, consumo único concurrente, bloqueo del embarque sujeto sin paquete, grafo destino, y que un embarque declarado no sujeto **no** aparezca como acreditado | `test/shipments.int-spec.ts`, E2E |
| 7 | Revisión por rol y actualización de estado y trazabilidad | `e2e/review/embarques-web.mjs`, `docs/23`, `docs/24` |

Hasta que eso exista y esté probado, **P0-029 y P0-017 siguen abiertas**, se decida lo que se decida.

## 7. Qué NO cambia esta decisión

- La conclusión regulatoria sigue `UNDETERMINED` por `CHECK`.
- `READY` del expediente sigue bloqueado por **D-05.B**, **D-07.5**, **D-07.6**, **P1-005** y **D-09.B**.
- Las llamadas satelitales siguen deshabilitadas.
- `EXPORTED` sigue significando «se descargó el paquete», no «se presentó una DDS».
