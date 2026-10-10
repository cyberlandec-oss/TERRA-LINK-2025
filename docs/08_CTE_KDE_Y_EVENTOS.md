# CTE, KDE y eventos

FUENTE: S1 §§18–29, 54–57. PROPUESTA: contrato de eventos/outbox e integridad concurrente.

## Catálogo operativo

| CTE | KDE mínimos | Actor habitual | Evento propuesto |
| --- | --- | --- | --- |
| HARVEST | Parcela/versión, productor, periodo, producto, cantidad/unidad si medida | Productor/técnico | HarvestRecorded |
| DELIVERY | Proveedor, parcela(s), producto, fecha, peso declarado, soporte | Productor/técnico | DeliveryRegistered |
| RECEPTION | Entrega, centro, receptor, tiempo, peso real, diferencias | Recepción | ReceptionConfirmed |
| WEIGHING | Entidad pesada, método, valor/unidad, fecha, responsable | Recepción | WeightRecorded |
| CLASSIFICATION | Muestra, método, humedad/otros, límites, decisión | Calidad | QualityDecisionRecorded |
| FERMENTATION | Run, inputs, lote(s), tiempos, salida/merma | Trazabilidad/operación | ProcessingRunClosed |
| DRYING | Run, input/output, humedad y pérdida medida | Operación/calidad | ProcessingRunClosed |
| STORAGE | Lote, centro/ubicación, cantidad, entrada/salida, responsable | Operación | StockMovementRecorded |
| PACKAGING | Lote, unidades físicas, peso, fecha, código | Operación | PackagingRecorded |
| SALE | Contraparte, lote/cantidad, moneda/precio si disponible | Gestión/exportación | SaleRecorded |
| SHIPMENT | Embarque, comprador/destino, lotes/cantidades, paquete, despacho | Exportación | ShipmentDispatched |

`CLASSIFICATION` es extensión explícita de los procesos de S1. El CTE define el hecho crítico; KDE define los datos necesarios y su validación. No todo cambio de CRUD es un movimiento de producto.

## Definición KDE

Cada definición guarda `code`, tipo de entidad, unidad/tipo de valor, momento del proceso, condición de obligatoriedad, validación, rol responsable y versión. Ejemplo: `DELIVERY_WEIGHT` exige cantidad positiva y unidad; `PLOT_ID` exige origen válido o estado faltante explícito. Configuración jurídica no se activa sin revisión.

## Envolvente propuesta

```json
{
  "event_id": "<uuid>",
  "organization_id": "<uuid>",
  "event_type": "ReceptionConfirmed",
  "schema_version": 1,
  "aggregate_type": "RECEPTION",
  "aggregate_id": "<uuid>",
  "aggregate_version": 2,
  "actor_id": "<uuid>",
  "occurred_at": "2026-10-09T15:00:00Z",
  "recorded_at": "2026-10-09T15:05:00Z",
  "correlation_id": "<uuid>",
  "causation_id": "<command-or-event-id>",
  "operation_id": "<idempotency-id>",
  "payload": {
    "delivery_id": "<uuid>",
    "quantity_received": "500.000000",
    "unit": "KG",
    "location_id": "<uuid>"
  }
}
```

UUIDs en ejemplos son marcadores de documentación. No son fixtures ejecutables. `occurred_at` del dispositivo puede ser imperfecto; `recorded_at` es del servidor. Conservar zona/offset original cuando ayuda a investigar; alertar desfase sin corregir el hecho silenciosamente.

## Categorías distintas

| Registro | Propósito |
| --- | --- |
| Evento de dominio | Hecho operativo/estado y causalidad |
| Ledger | Efecto cuantitativo de inventario |
| Auditoría | Quién hizo qué, acceso y cambios |
| Job/outbox | Entrega/reintento de tarea técnica |

No usar logs de servidor como única trazabilidad. No convertir esta propuesta de eventos en obligación de event sourcing total; el repositorio puede usar tablas de estado + eventos inmutables, ADR-0003.

## Correcciones y consistencia

`ReceptionCorrected` referencia evento/versión original, motivo, responsable y ajuste de cantidad. Si ya hay descendientes, calcular impacto y bloquear hasta resolverlo. Preservar original; el saldo actual cambia por entradas de corrección. Cierre de proceso guarda ledger, inputs/outputs, eventos y outbox atómicamente.

Unique `(organization_id, operation_id)` para comando idempotente; unique `(organization_id, aggregate_id, aggregate_version)` para orden del agregado. Repetir clave con payload distinto produce conflicto. Publicación al menos una vez, consumo idempotente, retry acotado, DLQ revisable. No asumir orden global entre agregados.

## Eventos de evidencia y diligencia

`DocumentUploaded`, `DocumentScanCompleted`, `EvidenceSubmitted`, `EvidenceVerified`, `EvidenceRejected`, `PlotGeometryVersionCreated`, `SatelliteAnalysisRequested/Completed/Failed`, `RiskAssessmentCreated`, `MitigationEvidenceSubmitted/Verified/Rejected`, `DDPackageApproved/Generated/Exported`, `ShareGranted/Revoked`.

Si el repositorio ya usa nombres como `RunClosed` u `OutputLotMaterialized`, mapearlos sin renombrar por estética. Versionar payload antes de introducir un cambio incompatible.

## Implementación vigente (TECH-001, 2026-10-10)

Código: `apps/api/src/events/` y migración `0004_domain_events_outbox`. **No cierra** CTE/KDE, P0-015 (historial causal completo) ni el framework de reglas: es la base técnica que esas historias usarán.

| Elemento del contrato | Implementación |
| --- | --- |
| Envolvente | `domain_events`: `event_id`, `organization_id`, `event_type`, `schema_version`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `actor_id`, `occurred_at`, `recorded_at` (reloj del servidor), `correlation_id` (id de solicitud), `causation_id`, `operation_id`, `payload` |
| Inmutabilidad | Trigger append-only (UPDATE/DELETE rechazados) |
| Orden por agregado | `UNIQUE (organization_id, aggregate_type, aggregate_id, aggregate_version)`; la versión es la `row_version` del agregado |
| Idempotencia de comando | `UNIQUE (organization_id, operation_id)` cuando hay `operation_id` (aún ningún endpoint lo exige; P0-012/P0-023 lo usarán) |
| Outbox | `event_deliveries` (una fila por consumidor suscrito), escrita con el **mismo** `trx` que el cambio de dominio y la auditoría |
| Entrega | **Al menos una vez.** Worker con reclamo `FOR UPDATE SKIP LOCKED` y arrendamiento (`locked_until`); al vencer, otra instancia retoma la entrega. No hay orden global entre agregados |
| Consumo idempotente | `consumer_receipts (consumer, event_id)` + efectos + `DONE` en una transacción; una reentrega encuentra el recibo y no repite efectos |
| Fallos | Reintento con espera exponencial (base 2 s, máx. 15 min); al agotar `OUTBOX_MAX_ATTEMPTS` (8) pasa a `DEAD` con `last_error` saneado (≤300 caracteres). `DEAD` no se reintenta solo: requiere revisión |
| Consumidores en producción | `organization-event-stats` (conteo por tipo) y `producer-status-counts` (productores por estado, `GET …/producers/summary`, consistencia eventual) |
| Proceso | `node dist/worker-main.js` (servicio `worker` del perfil `app`, escalable) |

Eventos emitidos hoy: `ProducerRegistered`, `ProducerUpdated`, `ProducerAssigned`, `ProducerStatusChanged` (schema 1). Payloads sin datos personales: identificadores, código, estados y **nombres** de campos cambiados, nunca sus valores.

**Auditoría frente a eventos:** `audit_logs` responde «quién hizo qué» (incluye accesos denegados, logins y administración) y no alimenta procesos. `domain_events` expresa hechos de dominio para consumidores. Ambos se escriben en la misma transacción; ninguno sustituye al otro. Organizaciones, membresías e invitaciones todavía solo auditan (no emiten eventos de dominio).

Pendientes separados: catálogo CTE/KDE y su validación (doc 08), ledger de inventario (ADR-0003), P0-015 (vista causal de eventos para auditor), framework de reglas (doc 13), DLQ con herramienta de reproceso.
