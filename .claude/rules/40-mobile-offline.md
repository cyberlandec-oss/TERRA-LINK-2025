---
paths:
  - "mobile/**/*"
  - "apps/mobile/**/*"
  - "**/sync/**/*"
  - "**/offline/**/*"
---
# Mobile y offline

Consulta docs/11_OFFLINE_Y_SINCRONIZACION.md y specs de la entidad.
Entidad/cola se persisten juntas; capturas/adjuntos sobreviven cierre y reboot.
operation_id estable en retries y dedup hash en servidor; sincroniza dependencias.
Conflicto de geometría/peso/origen no se resuelve por last-write-wins silencioso.
Servidor revalida tenant/membresía/permisos; offline no renueva autorización indefinidamente.
Separar datasets por cuenta; preservar borradores ante rechazo/cambio de sesión con recuperación segura.
Comprobar GPS/fotos/almacenamiento/interrupción en Android real; emulador no cierra el gate.
