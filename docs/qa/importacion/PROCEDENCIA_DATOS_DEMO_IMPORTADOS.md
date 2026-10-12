# Procedencia de los registros DEMO creados por las revisiones de P0-026

Base de **desarrollo local** `terra_link`, organización «DEMO · Cooperativa Río Verde». Se conservan a propósito: son la
huella real de las revisiones en navegador y no se borran para ocultar el ensayo. Datos sintéticos, rotulados «(demo)».
No son datos de ninguna asociación real.

## Productores (revisión del 2026-10-11, `e2e/review/importaciones.mjs`)

| Código | Estado | Creado (UTC) | Lote de importación | Fila | Archivo (SHA-256) |
| --- | --- | --- | --- | --- | --- |
| `DEMO-IMP-001` | BORRADOR | 2026-10-12 01:37 | `40baaf7a-dbc1-4c6d-9882-d1e1b2050ce1` | 2 | `demo-importacion-productores.xlsx` (`d6eeb1d3d832532867c8d055467c7c458e01904b8ab8480e866f09f9e947b607`) |
| `DEMO-IMP-002` | BORRADOR | 2026-10-12 01:37 | `40baaf7a-dbc1-4c6d-9882-d1e1b2050ce1` | 3 | idem |

Confirmación hecha **con teclado** por la cuenta DEMO de administración de la cooperativa (captura
`docs/qa/capturas/importacion/04-admin-resultado.png`). Cada uno tiene versión `IMPORT_CREATE` con el lote y la fila en el
motivo, evento `ProducerRegistered` con `source.kind = EXCEL_IMPORT` y auditoría. Siguen en BORRADOR: nadie los activó.

## Productos (revisión del 2026-10-12, `e2e/review/importaciones-productos.mjs`)

| Código | Estado | Unidad | Lote de importación | Fila | Archivo (SHA-256) |
| --- | --- | --- | --- | --- | --- |
| `DEMO-IMP-CACAO-SECO` | ACTIVO | KG | `c822af85-19ab-4364-893e-035b3c7b1735` | 2 | `demo-importacion-productos.xlsx` (`95e520cbe366e0907782ae83d1966940e676b17f316a0dbec2d31d8d4f428e12`) |
| `DEMO-IMP-CACAO-BABA` | ACTIVO | KG | `c822af85-19ab-4364-893e-035b3c7b1735` | 3 | idem |

Confirmación hecha **con teclado** (captura `p04-admin-resultado-productos.png`). Versión `CREATED` con el lote y la fila en
el motivo, evento `ProductCreated` con `source.kind = EXCEL_IMPORT` y auditoría. Quedan en el catálogo DEMO de la cooperativa.

## Cómo comprobarlo

```sql
-- productores y productos importados, con su lote y fila de origen
SELECT coalesce(p.producer_code, pr.code) AS codigo, r.batch_id, r.row_number, r.result_action, b.template, b.sha256
FROM import_rows r JOIN import_batches b ON b.id = r.batch_id
LEFT JOIN producers p ON p.id = r.producer_id LEFT JOIN products pr ON pr.id = r.product_id
WHERE r.result_action = 'CREATED' ORDER BY b.created_at, r.row_number;
```
