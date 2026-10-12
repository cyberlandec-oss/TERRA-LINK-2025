# P0-026 — Importación Excel: decisiones de implementación (2026-10-11)

Estado: **implementado para la plantilla de productores**; historia **ABIERTA** (ver «Pendiente»). Fuentes: S1 §§61–63,
S3 §§15–16, RF-26, QA-03, docs/09 «Importación», docs/UX_UI §20.3. Estas decisiones son de diseño local; no son
validación de campo ni conformidad EUDR.

## Alcance implementado

- **Plantilla `PRODUCTORES_V1`** (S1 §62 «producers.xlsx»): solo los campos que ya existen en la entidad productor
  (P0-004). Ningún campo inventado. Descargable (`.xlsx` con hoja de instrucciones) y con reglas en JSON para la UI.
- **No implementadas** (S1 §62): parcelas, entregas, productos y lotes. Motivos: parcelas exigen geometría (P0-009 ya
  cubre GeoJSON; un Excel sin geometría no debe inventarla) y perfil D-05; entregas mueven recepción e inventario
  (P0-012/P0-017) y sus estados y pendientes deben conservarse; productos y lotes tienen casos de uso propios que aún no
  se han expuesto a importación. Importar un registro **no** confirmaría recepción, calidad, inventario ni debida diligencia.

## Flujo y reglas

| Paso | Regla |
| --- | --- |
| Carga | `.xlsx` ≤ 2 MB, ≤ 5000 filas, ≤ 50 columnas. ZIP comprobado sobre bytes reales descomprimidos (entrada ≤ 16 MB, total ≤ 40 MB, razón ≤ 200). Sin ZIP64 ni cifrado. Macros (`vbaProject.bin`, macroEnabled) → rechazo. DOCTYPE/ENTITY → rechazo. No se guarda el original: SHA-256, tamaño y nombre. Celdas cifradas por fila (AAD organización/lote/fila). `operation_id` idempotente. |
| Mapeo | Explícito, columna → campo. Las sugerencias por nombre de encabezado se muestran pero solo se aplican si la persona las acepta y guarda. Cada campo una vez; `codigo_productor` obligatorio. Campos de identidad solo con `producer:read_identity`. |
| Vista previa | Solo lectura, calculada en vivo con datos y permisos actuales. No crea ni modifica entidades. Devuelve `plan_hash`. |
| Confirmación | Atómica. Revalida permiso `import:manage`, permisos y alcance de productor, versiones (filas bloqueadas `FOR UPDATE`) y exige el mismo `plan_hash`. Idempotente por `operation_id`. |
| Resultado | Creados / actualizados / sin cambios / fallidos; informe `.xlsx` por fila sin valores de identidad. |

**Clave de reimportación**: `producer_code` dentro de la organización (único por tenant, P0-005). Código inexistente → alta;
existente → actualización de los campos mapeados; si nada difiere → «sin cambios» (sin versión, evento ni auditoría de
entidad). Reimportar el mismo archivo no duplica entidades ni efectos.

**Columna ausente / celda vacía / petición explícita**:
- Campo sin mapear → `NOT_MAPPED` (calidad `UNKNOWN`): no cambia.
- Celda vacía → `MISSING`: no cambia (no borra por omisión).
- `#BORRAR` → `CLEAR`: vacía el campo, sujeto a las mismas reglas (nombre o razón social, par de documento).
- Celda con valor → `PROVIDED` (calidad `LEGACY`, `validation_status NOT_VALIDATED`). Importar nunca produce `VERIFIED`.

**Atomicidad (decidida en backend, mostrada antes de confirmar)**: todo el lote o nada. Una sola fila con error impide
confirmar; se corrige el archivo y se vuelve a cargar. Si algo cambió desde la vista previa (`PREVIEW_STALE`) o hubo un
cambio concurrente (`IMPORT_CONCURRENT_CHANGE`), la transacción se revierte entera y el lote sigue «mapeado».

**Altas en BORRADOR**: dato heredado no validado; activarlo es `producer:archive` (decisión de gestión ya existente).
Responsable por defecto: el mismo criterio que el alta manual.

**Casos de uso reutilizados**: `ProducersService.createInTx` / `updateInTx` (extraídos de `create`/`update` sin cambiar su
comportamiento): alcance, estado, versión esperada, permiso de identidad, cifrado, `producer_versions` (`IMPORT_CREATE` /
`IMPORT_UPDATE` con motivo que cita lote y fila), eventos `ProducerRegistered` / `ProducerUpdated` con `source`
(`EXCEL_IMPORT`, lote, fila), auditoría y detección de posibles duplicados (P0-005, nunca fusiona).

**Referencias**: un código existente fuera del alcance de lectura → `CODE_NOT_AVAILABLE` sin id, datos ni estado (la
unicidad del código por organización ya revela que el código está ocupado, igual que el alta manual). Productor dado de
baja → error de fila; no se reactiva por importación. Lotes de otra organización → 404.

**Permiso nuevo** `import:manage` (catálogo `2026-10-11.20`): ORG_ADMIN y MANAGER. No concede nada sobre entidades.

## Plantilla de productos `PRODUCTOS_V1` (2026-10-12)

Mismo pipeline (carga, mapeo explícito, vista previa, errores por fila, confirmación atómica, informe). Diferencias:

- **Campos**: solo los de la entidad producto (P0-011): `codigo_producto` (clave), `nombre`, `estado_presentacion`,
  `unidad`, `nombre_cientifico`, `variedad`. El estado ACTIVO/INACTIVO no se importa (activar/desactivar es un caso de uso
  con motivo).
- **Catálogos reales**: estado/presentación ∈ `product_states` y unidad ∈ `measurement_units` (hoy solo `KG`), por
  **código exacto**. «kg» o «LB» son errores de fila: no hay equivalencias ni conversiones (D-32).
- **Inmutables**: código, estado/presentación y unidad no cambian después del alta. En una reimportación, un valor distinto
  es `PRODUCT_FIELD_IMMUTABLE` en esa fila y el lote entero no se puede confirmar (sin escritura parcial). Un valor igual se acepta.
- **Obligatorios de alta**: nombre, estado/presentación y unidad (`REQUIRED_FOR_CREATE`); en una actualización, la celda
  vacía no cambia nada.
- **#BORRAR** solo en opcionales editables (nombre científico, variedad); en nombre, estado o unidad → `CANNOT_CLEAR`.
- **Desactivados**: `PRODUCT_INACTIVE`; ni se reactivan ni se editan.
- **Altas ACTIVAS**, igual que el alta manual de P0-011.
- **Procedencia** conforme al modelo existente: `product_versions.change_type` sigue siendo `CREATED`/`UPDATED` (su CHECK
  no admite otros valores y no se cambió); la procedencia va en `product_versions.reason` («Importación Excel <lote> · fila
  <n>») y en `source` del evento `ProductCreated`/`ProductUpdated` y de la auditoría. Sin cambios → sin versión ni evento.
- **Autorización**: la plantilla exige `product:manage` además de `import:manage` para plantilla, carga, mapeo, vista
  previa, informe, confirmación y para ver sus lotes; cada fila vuelve a comprobarlo. MANAGER (tiene `import:manage`, no
  `product:manage`) recibe 403 y la UI le muestra «Productos» deshabilitado con el motivo.
- **Casos de uso reutilizados**: `ProductsService.createInTx` / `updateInTx`, extraídos de `create`/`update` sin cambiar su
  comportamiento (catálogo, inmutables, inactivo, versión esperada, versión, evento, auditoría).
- **Migración 0031** (amplía 0030 sin reescribirla): plantilla `PRODUCTOS_V1` e `import_rows.product_id` (FK compuesta
  mismo tenant; una fila apunta a un productor o a un producto, nunca a ambos).

## Protecciones de productores revisadas (2026-10-12)

- Código inexistente que el rol no puede crear y código ocupado fuera del alcance de lectura devuelven **la misma**
  respuesta (`CODE_NOT_AVAILABLE`, mismo mensaje, columna y campo), sin id, datos ni estado del productor. Antes, el primer
  caso respondía `PERMISSION_DENIED_CREATE` y era distinguible. Si el rol sí puede crear, un código ocupado sigue siendo
  distinguible de uno libre, exactamente como en el alta manual (la unicidad por organización es del contrato P0-005).
- Probado con **fixtures de autorización** (`test/imports-authz-fixtures.int-spec.ts`): permisos sintéticos sustituidos en
  memoria en `AuthorizationService.tenantContext` para dos usuarios de prueba. No se cambió ningún rol de producción ni la
  base de datos de roles.

## Pendiente (motivo de que la historia siga abierta)

1. Plantillas de parcelas, entregas y lotes (S1 §62). Entregas deben conservar estados y pendientes de P0-012 y no
   confirmar recepción, calidad, inventario ni debida diligencia; parcelas no deben inventar geometría (P0-009/D-05).
2. Evidencia de navegador con archivos sintéticos y datos DEMO en desarrollo local; no hay uso con un Excel real de una asociación.
