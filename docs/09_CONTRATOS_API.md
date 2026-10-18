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
| Riesgo (implementado, P0-020 + D-07) | `GET /risk/lots`, `GET /risk/lots/{lotId}`, `POST /risk/lots/{lotId}/evaluations`, `GET /risk/evaluations/{id}`, `POST /risk/evaluations/{id}/reviews`, `GET\|POST /risk/rule-sets/adoptions` | `risk:read` / `risk:evaluate` / `risk:review`; adoptar exige `risk:approve_rules` (hoy solo `ORG_ADMIN`). La evaluación devuelve `rules` con **tres hechos distintos**: `global_publication` (publicación global), `adopted_by_organization` (adopción de esa organización, D-07.1) y `regulatory_profile` (perfil jurídico, D-07.5: **hoy `null` en todas las versiones**). `risk_result` lleva `severity` **siempre junto a `severity_coverage`**, y `conclusion` sigue `UNDETERMINED` por `CHECK` |
| Diligencia | `POST /dd-cases`, `GET /dd-cases/{id}/readiness`, `POST /dd-cases/{id}/approve`, `POST /dd-cases/{id}/packages` | dd:read/approve_package/export_package |
| Diligencia (implementado P0-022) | `GET/POST /dd-cases`, `GET /dd-cases/{id}`, `POST /dd-cases/{id}/snapshots`, `GET /dd-snapshots/{id}`, `POST /dd-snapshots/{id}/reviews` (START_REVIEW/RETURN/APPROVE), `POST /dd-snapshots/{id}/exports` (INTERNAL_REVIEW/DD_PACKAGE), `GET /dd-exports/{id}/download` | dd:read/manage/approve_package/export_package |
| Embarque | `POST /shipments`, `POST /shipments/{id}/reserve`, `GET /shipments/{id}/preflight`, `POST /shipments/{id}/dispatch` | shipment según acción |
| Embarques (implementado, P0-029) | `GET\|POST /buyers`; `GET /shipments/options`; `GET\|POST /shipments`; `GET /shipments/{id}`; `POST /shipments/{id}/items`, `/items/{itemId}/remove`, `/reserve`, `/reservations/{rid}/release`, `/dispatch`, `/cancel`; `GET /shipments/{id}/preflight` | `shipment:read` / `shipment:manage` / `stock:reserve` / `shipment:dispatch`; despacho bloqueado por la compuerta SHIPMENT_DISPATCH (D-34) |
| Reportes — indicadores (implementado, P0-030) | `GET /reports/indicators?from=&to=` → metadatos (catálogo `2026-10-15.1`, período y a qué se aplica, `time_basis` con límites inclusivos/fecha civil/`as_of` en UTC, alcance, privacidad, interpretación, `status_legend` y `coverage` de cobertura histórica) + `indicators[]` con `code`, `kind` (STATE/ACTIVITY/BALANCE_AT), `unit`, `status` (**OK / NO_DENOMINATOR / UNKNOWN / CRITERION_UNDEFINED / RESTRICTED**), `value`, `numerator`, `denominator`, `observed` (conteos observables aunque el indicador no lo sea), `date_basis`, `definition`, `reason` y `catalog` (`S1_60` o `TERRA_LINK` para las **extensiones declaradas**, hoy solo `risk_critical`); `GET /reports/indicators/export` (CSV `TL_REPORT_CSV 0.1`, con `X-Content-Sha256` y registro en auditoría) | `report:read`; exportar exige `report:export`, revalidado al descargar. **Cada indicador exige además el permiso de su dominio**: sin él sale `RESTRICTED`, sin valor ni conteo |
| Reportes por entidad y GeoJSON (implementado, P0-030; S1 §97) | `GET /reports/entities` (catálogo con `requires`, `available` y `missing` por reporte), `GET /reports/entities/{kind}` con `kind` = `producers｜plots｜lots｜risk｜traceability｜dd` → `columns[]`, `rows[]`, `totals[]`, `notes[]`, `total_rows`, `returned_rows`, `truncated` (máx. 500 filas; los totales cubren el conjunto completo), `GET /reports/entities/{kind}/export` (CSV con totales en la cabecera) y `GET /reports/entities/plots/geojson` (`FeatureCollection` RFC 7946 con miembro ajeno `terra_link`: conteos, omitidos, `regulatory_profile` PENDING/D-05 y cobertura) | `report:read` + **todos** los permisos del dominio del reporte (faltar uno deniega el reporte entero, no entrega una versión parcial); exportar exige `report:export`; el GeoJSON exige además `plot:read` y `plot:read_geometry` |
| Satélite (implementado, P0-028; S1 §52/§54) | Bajo `/api/v1/organizations/{orgId}`: `GET satellite/providers` (registro con selección, licencia, coste, cobertura, límites y **qué datos saldrían del equipo**); `GET plots/{plotId}/satellite` (estado del análisis, trabajos con procedencia, `can_request` y límites); `POST plots/{plotId}/satellite/analyses` (`operation_id`, `operation` = `FOREST_COVER｜DEFORESTATION_ALERTS｜HISTORICAL_ANALYSIS`, `period_start?`, `period_end?`, `plot_version_id?`) → **aceptación**, nunca resultado; `GET satellite/analyses/{jobId}`; `POST satellite/analyses/{jobId}/cancel` | `satellite:read`; encargar exige `satellite:request` **y** `plot:read_geometry` (saca la geometría exacta del equipo) y el alcance de la parcela. Sin proveedor seleccionado responde `409 SATELLITE_PROVIDER_NOT_SELECTED` (D-09); con un adaptador **solo de desarrollo** o con las llamadas reales deshabilitadas, `409 SATELLITE_REQUESTS_NOT_AUTHORIZED` con el motivo exacto. `GET satellite/providers` distingue `SELECTED`, `SELECTED_FOR_DEVELOPMENT` y `NOT_SELECTED`, e informa `live_calls_enabled` |
| Importación | `POST /imports`, `POST /imports/{id}/mapping`, `GET /imports/{id}/preview`, `POST /imports/{id}/commit` | permiso de importación y de cada entidad |
| Mi trabajo (implementado, P0-027 + **P1-003**) | `GET /api/v1/organizations/{orgId}/my-work?queue=&assignee=&status=` → `queues{mine,supervision}`, `filters`, `rows[]` (`code`, `queue`, `entity`, `reason`, `impact`, `assignee`, `due_date`, `due_state`, `priority`, `priority_rule`, `status`, `evidence_required`, `action`) y `tasks[]` agrupadas (`count`, `items[]`, `list_href`) | membresía activa; cada tarea exige el permiso de su acción y cuenta solo dentro de su alcance. Los filtros se aplican **en el backend** y **no amplían** el alcance; `queue`/`assignee` inválidos → 400. **Solo lectura**: no hay forma de completar una tarea desde aquí |
| Puesta en marcha y madurez (implementado, **P1-004**) | `GET /api/v1/organizations/{orgId}/onboarding` → `criterion` (D-49, versión y estado), `level{reached,name,basis}`, `levels[]` con sus `signals[]` (`state`, `evidence{count,scope,as_of,note}`, `source`), `steps[]` del asistente, `blockers{missing_data,not_implemented,undecided}`, `freshness` y `disclaimer` | membresía activa (`organization:read`). El **estado** de cada señal es de la organización; el **número** se acota al alcance del lector y se omite sin permiso. **Solo lectura**: no hay forma de marcar un paso. La madurez **no levanta compuertas** ni concede acceso |
| Importación (implementado, P0-026) | Bajo `/api/v1/organizations/{orgId}/imports`: `GET templates` (plantillas y si el rol puede usarlas), `GET templates/{producers,products,plots,deliveries,lots}` y `.xlsx` (lotes: con hoja `recepciones_disponibles`), `POST` (multipart `file`, `operation_id`, `template` = `PRODUCTORES_V1` \| `PRODUCTOS_V1` \| `PARCELAS_V1` \| `ENTREGAS_V1` \| `LOTES_V1`), `GET`, `GET {id}`, `POST {id}/mapping`, `GET {id}/preview` (filas con `effects` cuando hay movimientos), `POST {id}/commit` (`operation_id`, `plan_hash`), `POST {id}/discard`, `GET {id}/report` | `import:manage` + permisos y alcance de la entidad (productos `product:manage`; parcelas alta/edición; entregas `delivery:create`/`_assigned`; lotes `lot:create` y alcance de entregas) revalidados al confirmar |
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
