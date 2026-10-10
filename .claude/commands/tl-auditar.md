---
description: Auditar el repositorio Terra Link y acreditar la línea base antes de implementar.
---

Lee CLAUDE.md, docs/01_ESTADO_Y_FUENTES.md y docs/20_COMANDOS_Y_ENTORNO.md.
Inspecciona rama/commit/working tree y reglas existentes sin modificar cambios ajenos.
Identifica manifests/lockfiles, stack, módulos, DB/migraciones, API, RBAC, web/mobile y pruebas.
No imprimas .env ni secretos. Descubre comandos reales antes de ejecutar verificaciones locales no destructivas.
Contrasta docs/03_REQUISITOS.md y docs/18_BACKLOG.md con evidencia de código/comportamiento.
No implementes módulos durante esta auditoría.
Actualiza docs/23_ESTADO_DESARROLLO.md, docs/20_COMANDOS_Y_ENTORNO.md y ADR-0001;
ajusta paths de rules a rutas reales; registra gaps y siguiente historia pendiente.
Separa código existente, pruebas ejecutadas, Android, conformidad y operación real.
Contexto adicional del usuario: $ARGUMENTS
