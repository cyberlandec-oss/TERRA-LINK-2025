---
paths:
  - "apps/api/src/auth/**/*"
  - "apps/api/src/authz/**/*"
  - "apps/api/src/audit/**/*"
  - "**/identity/**/*"
  - "**/auth/**/*"
  - "**/permissions/**/*"
  - "**/integrations/**/*"
  - "**/documents/**/*"
  - "**/evidence/**/*"
  - "**/risk/**/*"
  - "**/due_diligence/**/*"
  - "**/due-diligence/**/*"
---
# Seguridad, evidencia y riesgo

Consulta docs/07_RBAC_Y_GOBERNANZA.md y docs/12_DOCUMENTOS_Y_EVIDENCIA.md / docs/13_RIESGO_LEGALIDAD_Y_DD.md según tarea.
PII/geometrías exactas/documentos privados solo por alcance; auditar descargas/exports.
Verificar egress/redirects antes de adjuntar claves; no descargar URL arbitraria sin política SSRF.
Escáner caído no aprueba archivo; checksum no acredita autenticidad.
Revisor/regla/evidencia/snapshot versionados; cambios relevantes invalidan readiness actual.
Conclusión regulatoria necesita perfil y revisión autorizados; LOW/READY no son cumplimiento.
Producción DDS requiere acción y autorización específica, recibo real y conciliación de timeout.
