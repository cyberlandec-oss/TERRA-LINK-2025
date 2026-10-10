---
paths:
  - "backend/**/*"
  - "api/**/*"
  - "apps/api/**/*"
  - "services/api/**/*"
---
# Backend y contratos

Lee docs/04_ARQUITECTURA.md y docs/09_CONTRATOS_API.md para la sección afectada.
Preserva framework/patrones y prefijos existentes; los endpoints de la spec son propuestas.
Autoriza antes de cargar/serializar; valida todas las relaciones y campos, incluidos exports/jobs.
Confirmar/cerrar/verificar son casos de uso con guards, no PATCH libre de status.
Mutación/evento/auditoría/outbox comparten transacción cuando corresponde.
Decimales y unidades explícitas; concurrencia/idempotencia probadas con DB real.
Jobs largos responden aceptación, no resultado final; no filtrar secretos en errores.
Actualiza OpenAPI real y cliente/contract tests cuando cambie schema.
