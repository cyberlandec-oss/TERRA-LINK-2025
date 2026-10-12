# Contratos API de partida

Base: S1 §§50–54. Todas las rutas aquí son propuestas para un proyecto nuevo, no endpoints probados. Conservar versión/prefijos reales y documentar equivalencia. TECH-001 debe producir OpenAPI JSON/YAML validada con schemas, seguridad, responses y operation IDs; este Markdown no sustituye ese artefacto ejecutable.

## Convenciones

REST `/api/v1`; autenticación del repositorio; tenant derivado de membresía y contexto validado. Listas paginadas con límites y orden estable; filtros whitelist. ISO 8601 UTC; decimales string/unidad. Mutaciones críticas requieren clave idempotente. Update usa `expected_version` o ETag documentado; rechazo 409/412 consistente según convención elegida. No enviar relaciones cruzadas sin validar.

| Grupo | Rutas propuestas | Permiso conceptual |
| --- | --- | --- |
| Identidad | `GET /me`, `GET /me/permissions`, `POST /organizations`, `POST /organizations/{id}/memberships` | organization/membership |
| Productores | `POST /producers`, `GET /producers`, `GET /producers/{id}`, `PATCH /producers/{id}` | producer:create/read/update_draft |
| Parcelas | `POST /plots`, `GET /plots/{id}`, `POST /plots/{id}/geometry-versions`, `POST /plots/{id}/geometry/validate`, `GET /plots/{id}/geojson` | plot:create/read/correct |
| Entregas/recepción | `POST /deliveries`, `GET /deliveries/{id}`, `POST /receptions`, `POST /receptions/{id}/confirm` | delivery:create/read; reception:confirm |
| Calidad | `POST /quality-samples`, `POST /quality-samples/{id}/results` | quality:analyze |
| Lotes/proceso | `GET /lots/{id}`, `POST /lots`, `POST /processing-runs`, `POST /processing-runs/{id}/close` | lot/process |
| Inventario | `GET /inventory`, `POST /stock-movements`, `POST /stock-adjustments` | stock:read/adjust |
| Grafo | `GET /traceability/{entity_type}/{id}?direction=both` | permiso de recurso raíz y cada nodo |
| Documentos | `POST /documents/uploads`, `POST /documents/{id}/finalize`, `GET /documents/{id}/download` | upload/read/download |
| Evidencia | `POST /evidence`, `POST /evidence/{id}/links`, `POST /evidence/{id}/verify` | evidence:link/verify |
| Riesgo | `POST /risk/assessments`, `GET /risk/assessments/{id}`, `POST /risk/assessments/{id}/recalculate` | risk:assess/read/recalculate |
| Mitigación | `POST /mitigations`, `POST /mitigations/{id}/evidence`, `POST /mitigations/{id}/verify`, `POST /mitigations/{id}/reject` | mitigation según acción |
| Diligencia | `POST /dd-cases`, `GET /dd-cases/{id}/readiness`, `POST /dd-cases/{id}/approve`, `POST /dd-cases/{id}/packages` | dd:read/approve_package/export_package |
| Diligencia (implementado P0-022) | `GET/POST /dd-cases`, `GET /dd-cases/{id}`, `POST /dd-cases/{id}/snapshots`, `GET /dd-snapshots/{id}`, `POST /dd-snapshots/{id}/reviews` (START_REVIEW/RETURN/APPROVE), `POST /dd-snapshots/{id}/exports` (INTERNAL_REVIEW/DD_PACKAGE), `GET /dd-exports/{id}/download` | dd:read/manage/approve_package/export_package |
| Embarque | `POST /shipments`, `POST /shipments/{id}/reserve`, `GET /shipments/{id}/preflight`, `POST /shipments/{id}/dispatch` | shipment según acción |
| Importación | `POST /imports`, `POST /imports/{id}/mapping`, `GET /imports/{id}/preview`, `POST /imports/{id}/commit` | permiso de importación y de cada entidad |
| Importación (implementado, P0-026) | Bajo `/api/v1/organizations/{orgId}/imports`: `GET templates` (plantillas y si el rol puede usarlas), `GET templates/{producers,products,plots,deliveries}` y `.xlsx`, `POST` (multipart `file`, `operation_id`, `template` = `PRODUCTORES_V1` \| `PRODUCTOS_V1` \| `PARCELAS_V1` \| `ENTREGAS_V1`), `GET`, `GET {id}`, `POST {id}/mapping`, `GET {id}/preview`, `POST {id}/commit` (`operation_id`, `plan_hash`), `POST {id}/discard`, `GET {id}/report` | `import:manage` + permisos y alcance de la entidad (productos: `product:manage`; parcelas: alta/edición de parcela; entregas: `delivery:create`/`_assigned`) revalidados al confirmar |
| Superficie declarada (implementado) | `POST /api/v1/organizations/{orgId}/plots/{id}/declared-area` (`expected_version`, `area_declared_ha`, `notes?`); `geometry-versions` con método `DECLARED` usa el mismo caso de uso | `plot:update` o `plot:update_assigned` con alcance; conserva la geometría vigente |
| Sync | `GET /sync/bootstrap`, `POST /sync/push`, `GET /sync/pull?cursor=...` | alcance asignado y permisos por operación |
| Jobs/reportes | `GET /jobs/{id}`, `POST /reports`, `GET /reports/{id}/download` | recurso y exportación |
| Compartición P1 | `POST /share-grants`, `POST /share-grants/{id}/revoke` | share:grant/revoke |

Cada fila exige schemas de request/response, ejemplo válido y errores, no solo ruta. Las APIs de tarea crítica son casos de uso (confirmar/cerrar/verificar), no PATCH genérico de `status`.

## Crear entrega: request conceptual

```json
{
  "producer_id": "<uuid>",
  "product_id": "<uuid>",
  "plot_id": "<uuid>",
  "plot_version_id": "<uuid>",
  "delivered_at": "2026-10-09T15:00:00Z",
  "quantity_declared": "500.000000",
  "unit": "KG",
  "production_period": {"start": "2026-09-01", "end": "2026-09-30"},
  "operation_id": "<uuid>"
}
```

No incluir tenant manipulable como autoridad. Validar producto, parcela y productor dentro del ámbito; si modelo de orígenes múltiples, sustituir plot por array tipado. Respuesta 201 con id/código/versión y estado; repetir operación idéntica devuelve el resultado original documentado.

## Error normalizado propuesto

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "La cantidad supera el saldo disponible del lote.",
    "request_id": "<uuid>",
    "details": [{"field": "quantity", "reason": "AVAILABLE_QUANTITY_EXCEEDED"}]
  }
}
```

| Estado | Uso |
| --- | --- |
| 400 / 422 | Validación estructural/dominio según convención del repo |
| 401 | Sin autenticación válida |
| 403 | Permiso insuficiente, no «sin datos» |
| 404 | Recurso inexistente o fuera del alcance visible |
| 409 | Conflicto de versión, idempotencia o transición |
| 413 | Payload/archivo excede límite |
| 429 | Límite de uso, retry indicado |
| 202 | Job aceptado con id; no conclusión anticipada |
| 503 | Dependencia necesaria indisponible, sin filtrar credenciales |

## Grafo y readiness

Grafo: raíz, nodos tipados, edges con cantidad/unidad/tipo de relación, direcciones, versiones, límites de profundidad y cursor. Los permisos se aplican antes de serializar; no revelar counts o identidades ocultas. Distinguir truncamiento técnico, ausencia de origen y sección no autorizada.

Readiness: `snapshot_version`, `evaluated_at`, `rule_set_version`, checks con requisito/estado/motivo/evidence_refs, bloqueos y acciones. Los porcentajes son informativos; un requisito crítico bloquea aunque total sea 98%.

## Jobs y descargas

Operaciones largas responden 202 y job autorizado: `PENDING/RUNNING/SUCCEEDED/FAILED`. Resultado de job lleva tenant, versión de entrada y error recuperable. URLs temporales solo tras autorización y estado de escaneo válido. Expiración o revocación nunca se resuelve convirtiendo el objeto en público.

## Sincronización implementada (P0-024)

`POST /devices`, `GET /devices`, `POST /devices/{id}/revoke`, `POST /sync/push`, `GET /sync/pull`, `POST /sync/attachments/{operation_id}/content` (bajo `/api/v1/organizations/{org}`); permisos `sync:use` y `device:manage`. Contrato detallado en docs/11 y en `apps/api/openapi.json`.
