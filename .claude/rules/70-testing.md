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

Criterio de esta etapa: validación local (`npm run validate`, docs/20). Actions no es requisito.
DONE_LOCAL exige criterios de la historia + evidencia local; no acredita producción ni conformidad.
Las pruebas usan solo bases `*_test`/`*_e2e`; nunca la base de desarrollo ni borrado de volúmenes.
Un fallo intermitente se conserva y se analiza su causa antes de declararlo resuelto.
