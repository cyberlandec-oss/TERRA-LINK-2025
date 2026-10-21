# A-03 — Contrato de traspaso entre organizaciones (PROPUESTA, 2026-10-21)

**Estado: PROPUESTA. No se implementa ningún movimiento hasta que el propietario decida (§9).** Es una ampliación autorizada (RF-50, `docs/03`) distinta de los criterios
originales, de A-01 y de A-02; no cambia coberturas. Origen: el recorrido integral web (`docs/qa/RECORRIDO_INTEGRAL_WEB_2026-10-21.md`, T15) mostró que la Exportadora tiene 0 lotes y no ve
los de la cooperativa porque la documentación no define cómo pasa un lote de una organización a otra.

## 1. Contraste con los flujos de negocio originales
| Fuente | Qué dice del paso entre actores | Consecuencia |
| --- | --- | --- |
| S1 / S4 (workflows) | La plataforma es «multi-organización»; el ejemplo de la Exportadora XYZ muestra **una** organización dueña de productores, parcelas, lotes, entregas y embarques. El comprador (BUYER) recibe un **portal de lectura** | El modelo original opera la cadena **dentro de una organización**; no define el traspaso a otra |
| `docs/14` workflow 6 | «reservar lote → preflight → despachar → **compartir información autorizada**» | «Despachar» es la **salida hacia el comprador** (consume la reserva, termina el rastro operativo); «compartir» es lectura |
| `docs/05` (ERD de custodia) | `RECEPTION → LOT_INPUT → LOT → PROCESS → SHIPMENT_ITEM`, `STOCK_ENTRY` por lote y ubicación | Toda cantidad pertenece a una organización y a una ubicación suya |
| P1-001 / A-02 | Concesión de **lectura** con vencimiento y revocación | No mueve cantidades |
| RF-43 (P1-012) | Precio y pagos **informados**; «no ejecutar transferencias» | La parte económica no ejecuta nada |
| D-05.B (abierta) | Qué actor es cada usuario (operador, comerciante, Art. 2(15)) | Condiciona qué obligaciones de diligencia pasan a quien recibe |

## 2. Tres cosas distintas (no son equivalentes)
| Concepto | Qué es | ¿Mueve cantidades? | ¿Cambia el titular jurídico? | Estado |
| --- | --- | --- | --- | --- |
| **Concesión de lectura** | Una cuenta ve una proyección de un recurso, con vencimiento | No | No | Implementada (P0-003, P1-001, **A-02**) |
| **Transferencia física y cambio de custodia** | La cantidad sale de la custodia de A y entra en la de B, con salida, tránsito y recepción | **Sí**, por movimientos del ledger | No necesariamente | **Esta propuesta** |
| **Compraventa / cambio de propiedad jurídica** | Acuerdo comercial (precio, condiciones, factura) que transfiere la propiedad | No por sí sola | **Sí** | **Fuera de alcance**: un traspaso puede acompañar una venta, pero no la prueba, no la ejecuta ni la sustituye |

## 3. Principios (innegociables)
1. **Ningún `organization_id` cambia** y **no se copia inventario**: toda cantidad cambia solo mediante movimientos trazables del ledger en cada organización.
2. **Conservación de masa entre libros**: `salida de A = entrada en B + en tránsito + pérdida declarada`, comprobable por cada parte con su lado y por una conciliación de plataforma en pruebas.
3. **Origen no inventado**: lo desconocido sigue desconocido; el lote que recibe B solo tiene origen «completo» si B recibió el origen de A bajo consentimiento (§5.4).
4. **Sin elusión de compuertas**: el traspaso no es un camino alterno al despacho ni a READY (§7).
5. **Aceptación del receptor**: nadie recibe lo que no aceptó; nadie transfiere lo que no tiene libre.

## 4. Opciones
- **A. Solo concesiones y documentos (statu quo)**: B ve lo que A concede; B no tiene existencias. Ya existe; no resuelve la cadena cooperativa → exportadora.
- **B. RECOMENDADA — Traspaso de custodia en dos fases con lote espejo y vínculo de linaje**, detallado abajo. Propiedad y precio quedan fuera.
- **C. Traspaso integrado con compraventa (precio, factura, cambio de propiedad)**: requiere decisiones comerciales y jurídicas (D-16, D-05.B, contrato) que hoy no existen; no recomendada ahora.

## 5. Propuesta (opción B)
### 5.1 Actores, relación y permisos
- **Relación entre organizaciones** (`transfer_partners`): vínculo bilateral previo que confirman las dos administraciones. No se elige una organización de una lista ni se enumeran organizaciones; se identifica por un código de relación que A entrega a B fuera de la plataforma, y B lo confirma.
- Permisos nuevos (propuestos): `transfer:read`, `transfer:offer` (A), `transfer:dispatch` (A, distinto de quien ofrece cuando la organización lo exija), `transfer:accept` y `transfer:receive` (B), `transfer:cancel`. Roles: ORG_ADMIN y TRACEABILITY_MANAGER/EXPORT_MANAGER por el lado emisor; ORG_ADMIN, RECEPTION_OPERATOR y TRACEABILITY_MANAGER por el receptor. **Ningún permiso se concede por tener la pantalla.**

### 5.2 Máquina de estados
`DRAFT → OFFERED → ACCEPTED → DISPATCHED (en tránsito) → RECEIVED → CLOSED` con salidas `REJECTED` (B rechaza la oferta), `CANCELLED` (A cancela antes de despachar) y `CLOSED_WITH_DIFFERENCE`.
Cada paso es idempotente (`operation_id`), versionado y auditado en **ambas** organizaciones. Un rechazo posterior a la recepción se resuelve con **otro traspaso de devolución** (B → A), nunca borrando el original.

### 5.3 Cantidades, unidades y movimientos
- Cantidades decimales con unidad explícita; **misma unidad** en origen y destino (sin conversión implícita).
- **Oferta**: reserva en A la cantidad **libre** del lote/centro (usa el ledger de reservas existente; origen de la reserva `CUSTODY_TRANSFER`): no se puede ofrecer lo ya reservado, ni dos veces; cancelar o rechazar libera la reserva.
- **Despacho (A)**: consume la reserva y registra `TRANSFER_OUT` (físico de A → bucket **EN_TRÁNSITO** del traspaso). Saldo negativo imposible.
- **Recepción (B)**: pesaje con el mismo contrato de recepción (método, valor, fecha, responsable); registra `TRANSFER_IN` (EN_TRÁNSITO → físico de B) y **forma un lote de B** (`source = CUSTODY_TRANSFER`) con vínculo de linaje.
- **Diferencias**: recibido ≠ despachado es una **diferencia declarada** con motivo obligatorio (mismas reglas que el cierre de entregas, D-33); una merma en tránsito es un movimiento explícito de pérdida; un exceso exige motivo. El saldo en tránsito no queda abierto: el traspaso se cierra recibido, con diferencia, o devuelto.

### 5.4 Identidad de lotes y origen (sin duplicar existencias)
- El lote de A **sigue existiendo en A** (con menos cantidad); B crea **su propio lote** con otro código. El enlace `custody_lot_links(parent_org, parent_lot, child_org, child_lot, quantity, unit)` conserva la correspondencia sin fusionar identidades ni referencias entre tenants (cada fila lleva y valida los dos `organization_id`).
- **Qué origen recibe B** (decisión D3): por defecto, la **proyección autorizada** que ya existe para concesiones (códigos, estados y agregados; sin identidad ni geometrías), más un **resumen de origen firmado** (huella) del lote de A. Si B necesita geolocalización de parcelas para su propia diligencia, A debe **consentirlo expresamente** como parte del traspaso (instantánea inmutable de origen con huella, revocable solo hacia adelante); sin ese consentimiento el lote de B queda con origen **INCOMPLETO**, y así lo trata el riesgo.
- La atribución proporcional tras mezclas sigue siendo un cálculo etiquetado, no identificación física de un grano.

### 5.5 Documentos
Nota de traspaso/guía y soportes se adjuntan **en cada organización** con el servicio de documentos existente (antimalware, versiones, alcance por titular); ninguna organización accede al documento de la otra salvo concesión. El hash del contenido del traspaso se calcula sobre su cuerpo declarado y se guarda en ambos lados.

### 5.6 Auditoría y eventos
Eventos de dominio y auditoría en **cada** organización (`CustodyTransferOffered/Accepted/Dispatched/Received/Rejected/Cancelled/ClosedWithDifference`) sin datos personales del otro lado; el outbox existente los entrega por organización. Un acceso entre organizaciones queda atribuido a la organización y a la persona que actúa en su propio tenant.

## 6. Qué controles operativos existentes se aplican
- **Reservas y balance de masa** del ledger (P0-017/P0-029): el traspaso las reutiliza; no hay otro libro.
- **Calidad**: no se transfiere un lote con calidad rechazada; la decisión de calidad no viaja como «liberada» para B: B la evalúa con su propia recepción (la de A queda como antecedente declarado, «límites declarados, no verificados»).
- **Compuerta de salida propia** (`TRANSFER_DISPATCH`, KDE a definir como las de recepción y embarque): sin los datos mínimos no se despacha. Es un **dato requerido**, no una aprobación simulada.
- **Origen conocido o declarado** del lote de A: si es INCOMPLETO, el traspaso lo declara y B lo hereda como INCOMPLETO.
- **Tenant y alcance**: ninguna referencia entre tenants sin vínculo explícito; B solo ve su lado y la proyección autorizada del lote de A.

## 7. Cómo se evita usar el traspaso para eludir compuertas
1. **READY y expediente son por organización y por lote**: la instantánea de A no se hereda; B no hereda un «DD aprobado» (que además hoy es inalcanzable por D-05.B/D-07.5/7.6).
2. **El despacho de B** (hacia un comprador o un embarque) exige **su** `DD_PACKAGE`, evidencia y compuerta `SHIPMENT_DISPATCH` sobre **su** lote; un lote recibido con origen INCOMPLETO sigue bloqueando.
3. **El traspaso no cuenta como despacho** ni como «puesta en el mercado»: no genera referencia pública de embarque ni habilita compartir como si fuera uno.
4. La **severidad, la conclusión regulatoria y UNDETERMINED** no se transportan: B las calcula con su catálogo y su perfil jurídico.
5. El **mismo lote no puede estar a la vez reservado para un embarque y ofrecido** en un traspaso (una sola reserva activa por cantidad).

## 8. Plan por fases si se aprueba (cada una, una entrega completa con su validación)
1. Contrato y datos: `transfer_partners`, `custody_transfers`, ítems, enlaces de linaje, bucket en tránsito, movimientos `TRANSFER_OUT/IN`, permisos, eventos, auditoría, conciliación entre libros y pruebas con dos organizaciones reales en PostgreSQL (aislamiento, idempotencia, concurrencia, saldo negativo, masa).
2. Interfaz: relación, oferta, aceptación, despacho, recepción, diferencias y devolución, por rol.
3. Origen compartido con consentimiento (si se decide D3) y su efecto en el riesgo del receptor.
Hasta que el propietario decida, **no se crea ningún artefacto de esquema ni de API** para esto.

## 9. Decisiones D1–D9 (a cargo del propietario; ninguna está adoptada)

**Clasificación.** *Operativa de producto*: la decide el propietario del producto. *Regulatoria*: es una conclusión sobre obligaciones jurídicas y **requiere revisión competente** (D-05.B, D-07.5/7.6, perfil jurídico P1-005); aquí solo se describe el efecto técnico de cada opción y **no se adopta ninguna obligación de diligencia**. *Mixta*: parte de producto, parte regulatoria o de privacidad.

### D1 — ¿Debe la plataforma soportar el traspaso entre organizaciones? *(operativa de producto)*
- **Opciones**: (a) No: la cadena opera dentro de una organización y los terceros reciben lectura por concesión (hoy). (b) Sí, como **custodia física** (esta propuesta). (c) Sí, integrado con compraventa y cambio de propiedad.
- **Recomendación**: **(b)**.
- **Efecto**: (a) la Exportadora no tiene existencias propias de lo que recibe; (b) habilita lotes espejo, tránsito y recepción con trazabilidad; (c) arrastra precio, factura y propiedad (D7).
- **Dependencias**: ninguna regulatoria directa para (b); (c) depende de D-16 y del contrato comercial.

### D2 — ¿Qué obligaciones de diligencia pasan a quien recibe? *(REGULATORIA — revisión competente)*
- **Opciones**: (a) Ninguna se hereda: el receptor evalúa por su cuenta con su catálogo y su perfil jurídico. (b) El receptor puede **referenciar** el expediente del emisor como antecedente, sin sustituir el suyo. (c) El expediente del emisor se hereda como propio.
- **Recomendación técnica provisional**: **(a)**, que es lo que el sistema hace hoy sin concluir nada jurídico; **la decisión de fondo no se toma aquí**.
- **Efecto**: (a) el receptor no puede despachar sin su propio paquete aprobado y hoy este es inalcanzable; (b) añade un enlace documental; (c) supondría un efecto jurídico que la plataforma no puede conceder.
- **Dependencias**: **D-05.B** (qué actor es cada usuario: operador, comerciante, Art. 2(15)), D-07.5/7.6, P1-005.

### D3 — ¿Qué origen recibe el receptor? *(mixta: producto + privacidad + posible requisito regulatorio)*
- **Opciones**: (a) Nada: el lote de B nace con origen INCOMPLETO. (b) La **proyección agregada** que ya existe para concesiones + resumen firmado del lote de A. (c) Una **instantánea inmutable de geolocalización** con consentimiento expreso de A, revocable solo hacia adelante.
- **Recomendación**: **(b)** por defecto; **(c)** solo con consentimiento expreso y tras D-14 (salida de geometrías).
- **Efecto**: determina si el lote de B puede tener origen COMPLETO y, por tanto, si su riesgo y su expediente pueden avanzar; (c) hace que coordenadas exactas salgan de A hacia B.
- **Dependencias**: D-14 (salida de geometrías), D-16 (titularidad de datos), D2 (si B necesita geolocalización por obligación propia, eso es regulatorio).

### D4 — ¿Qué exige el emisor para despachar el traspaso? *(mixta)*
- **Opciones**: (a) Calidad no rechazada + datos mínimos del traspaso (compuerta propia `TRANSFER_DISPATCH`). (b) Además, origen COMPLETO. (c) Además, **DD aprobado**.
- **Recomendación**: **(a)**; **(c)** solo si una revisión competente concluye que el traspaso equivale a poner el producto en el mercado.
- **Efecto**: (c) bloquearía todo traspaso mientras el paquete de diligencia sea inalcanzable; (a) permite mover custodia sin simular aprobaciones.
- **Dependencias**: D-34 (KDE de despacho), D-05.B (si es o no «puesta en el mercado»).

### D5 — Diferencias de peso, pérdidas en tránsito y devoluciones *(operativa de producto)*
- **Opciones**: (a) Motivo obligatorio para cualquier diferencia, sin tolerancia (regla D-33). (b) Tolerancia configurable por organización. (c) Ajuste automático.
- **Recomendación**: **(a)**; la devolución es otro traspaso B → A, nunca un borrado.
- **Efecto**: conserva la conservación de masa explícita entre libros; (c) la ocultaría.
- **Dependencias**: D-33 (cierre de entregas).

### D6 — ¿Cómo se identifica a la contraparte? *(operativa de producto + seguridad)*
- **Opciones**: (a) Vínculo bilateral previo confirmado por ambas administraciones. (b) Código por traspaso. (c) Directorio de organizaciones.
- **Recomendación**: **(a)**.
- **Efecto**: (c) permitiría enumerar organizaciones, lo que A-02 evita por diseño; (b) no deja relación persistente que auditar.
- **Dependencias**: ninguna.

### D7 — Relación con precio, factura y propiedad *(comercial/jurídica)*
- **Opciones**: (a) Fuera: el traspaso no modela propiedad ni precio; solo permite una referencia documental opcional. (b) Integrar compraventa.
- **Recomendación**: **(a)**.
- **Efecto**: (b) exigiría contrato, facturación y reglas fiscales que no están definidos; RF-43 solo registra precio y pagos *informados* y prohíbe ejecutar transferencias.
- **Dependencias**: RF-43 (P1-012), D-16.

### D8 — Unidades *(operativa técnica)*
- **Opciones**: (a) Misma unidad en origen y destino. (b) Conversión con factor declarado.
- **Recomendación**: **(a)** en esta versión.
- **Efecto**: (b) añade una fuente de discrepancias y exige trazar el factor.
- **Dependencias**: catálogo de unidades.

### D9 — ¿Qué ve el emisor del lote hijo? *(operativa/privacidad)*
- **Opciones**: (a) Nada. (b) Solo el estado del traspaso y sus diferencias. (c) El inventario del receptor.
- **Recomendación**: **(b)**.
- **Efecto**: (c) revelaría existencias de otra organización; (a) impide cerrar discrepancias.
- **Dependencias**: ninguna.

### Resumen
| Tipo | Decisiones |
| --- | --- |
| Operativas de producto | D1, D5, D6, D8, D9 |
| Mixtas (producto + privacidad/regulatorio) | D3, D4 |
| Comerciales/jurídicas | D7 |
| **Regulatorias (revisión competente)** | **D2** y la parte regulatoria de D3 y D4 |

**Mientras tanto** la cadena sigue operando dentro de una organización y los terceros reciben lectura por concesión (A-02). No se adopta ninguna obligación de diligencia ni se implementa el traspaso, el lote espejo o sus movimientos.
