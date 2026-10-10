---
paths:
  - "**/tests/**/*"
  - "**/test/**/*"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/test_*.py"
---
# Pruebas

Consulta docs/16_PLAN_QA.md y aceptación de la historia.
Prueba comportamiento/invariantes, no copies la implementación como expectativa.
Tenant/FK y concurrencia de saldo deben probarse con DB/PostGIS reales donde apliquen.
Siempre incluye caso permitido y prohibido para autorización.
Fixture satelital no es resultado de proveedor real; Android real tiene gate separado.
Registra comando, commit/entorno/resultado y limita claims a lo ejecutado.
