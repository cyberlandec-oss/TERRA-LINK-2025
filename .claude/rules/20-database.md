---
paths:
  - "apps/api/src/db/**/*"
  - "**/*.sql"
  - "**/migrations/**/*"
  - "**/models/**/*"
  - "**/repositories/**/*"
---
# Datos y migraciones

Consulta docs/05_DOMINIO_Y_ERD.md y docs/06_DICCIONARIO_DATOS.md.
Mapea modelo propuesto al existente antes de crear tabla/enum duplicados.
FK operativa debe asegurar mismo tenant; links polimórficos requieren integridad explícita.
Versiona esquema; no reescribas migraciones compartidas ya aplicadas.
Ledger append-only y bloqueo transaccional/constraint para stock y reservas.
Probar migración nueva y actualización; plan de retorno si tiene impacto material.
PostGIS para geometría y superficie con método correcto, no grados cuadrados como hectáreas.
No aplicar DDL ni borrar volúmenes sobre producción por una tarea local.
