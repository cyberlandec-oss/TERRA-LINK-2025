# Diccionario de datos propuesto

Base: S1 §§10–48. Alcance: contratos mínimos para el MVP y extensiones de soporte; no DDL listo para aplicar. Campos existentes deben mapearse durante TECH-001. `R`: requerido; `C`: condicional; `O`: opcional. Un dato ausente se registra como ausente y no se completa con valores inventados.

## Convenciones comunes

| Campo | Tipo propuesto | Regla |
| --- | --- | --- |
| id | UUID | R, PK; generado offline cuando aplique |
| organization_id | UUID FK | R en datos operativos; obtenido del contexto autorizado |
| created_at / updated_at | timestamptz | R, reloj servidor en UTC |
| created_by / updated_by | UUID | R o identidad de servicio; actor verificable |
| row_version | bigint | R, concurrencia optimista |
| deleted_at / deleted_by / deletion_reason | timestamp/UUID/text | C para baja lógica; no borrado de historia |
| data_status | enum | `UNKNOWN/MISSING/NOT_VALIDATED/LEGACY/VERIFIED`, si aplica |
| public_reference | text | C para QR; no concede permiso ni vuelve público el objeto |

Cantidades `numeric(20,6)` y dinero `numeric(20,4)` son propuestas de precisión, a confirmar con volúmenes y monedas reales. API transmite decimales como string, unidad y moneda explícitas. Índices deben responder a queries reales y límites por tenant.

## Identidad, actores y catálogo

| Entidad | Campos mínimos adicionales | Restricciones |
| --- | --- | --- |
| organizations | name R; legal_name C; organization_type R; tax_id C; country R; province/canton/parish O; status R | Registro empresarial y tenant no se confunden |
| users | first_name/last_name R; email R; phone O; status R; last_login_at O; external_subject C | Normalizar email; no guardar secreto OIDC |
| memberships | user_id R; organization_id R; status R | Único usuario/organización; reactivación auditada |
| roles/permissions | code R; description R; permission resource/action R | Catálogo versionado; role_assignment a membresía |
| producers | producer_code R; first_name/last_name o legal_name R; document_type/number C; phone O; community y división territorial O; status R | Único código por tenant; identidad cifrada/restringida |
| counterparties | name R; actor_type R; official_reference O; country O; linked_organization_id O | Contraparte externa no implica tenant ni integración |
| locations | code/name/type R; coordinates O; official_reference O | Centro/acopio/bodega; no duplicar parcela |
| products | code/name/product_type/unit R; scientific_name/variety O; status R | Cacao baba/fermentado/seco/clasificado; no conversión implícita |

## GIS y producción

| Entidad | Campos mínimos adicionales | Restricciones |
| --- | --- | --- |
| plots | producer_id R; plot_code R; name O; current_version_id C; crop R; variety O; status R | Código único por tenant; FK productor mismo tenant |
| plot_versions | plot_id R; geometry C; geometry_type C; area_declared_ha O; area_calculated_ha C; survey_method R; surveyed_at C; validation_status R; validation_rule_version R; accuracy_m O; previous_version_id O | SRID 4326 para persistencia; punto no tiene superficie calculada |
| gps_samples | plot_version_id R; longitude/latitude R; captured_at R; horizontal_accuracy_m O; device_reference O | Precisión desconocida permanece null; muestras originales conservadas |
| production_records | plot_id R; product_id R; period_start/end R; quantity_estimated O; quantity_actual O; unit R | Estimación no crea inventario; cantidades y periodos no negativos |
| satellite_jobs/results | plot_version_id R; provider R; job_status R; dataset/version/date/method C; resolution/confidence C; raw_object_key C | C al completar; resultado ligado a geometría exacta |

## Operaciones y custodia

| Entidad | Campos mínimos adicionales | Restricciones |
| --- | --- | --- |
| deliveries | delivery_code R; producer_id/supplier_id R según flujo; product_id R; delivery_date R; quantity_declared R; unit R; production_period C; notes O | Peso declarado separado de recepción |
| delivery_origins | delivery_id R; plot_id C; plot_version_id C; origin_quantity R; origin_status R | Cantidades no exceden entrega; origen faltante explícito |
| receptions | delivery_id R; location_id R; quantity_received R; received_at/receiver_id R; status R; difference_reason C | Distinguir parcial/completa; idempotencia de confirmación |
| quality_samples/results | reception_id o lot_id R; sampled_at/by R; moisture O; fermentation O; impurities O; method/unit/limits_version C; decision R | Si libera, justificar con parámetros vigentes; una muestra no reduce peso sola |
| lots | lot_code R; product_id R; operational_status R; created_quantity C | Cantidad disponible es proyección de ledger, no campo libre editable |
| lot_inputs/origin_edges | destination_id R; source_type/id R; source_quantity R; unit R; event_id R | DAG; tenant y unidad compatibles |
| process_runs | process_type R; location_id R; status R; started_at C; closed_at C; loss_quantity C; loss_reason C | Al cerrar: inputs = outputs + pérdidas contabilizadas |
| process_inputs/outputs | run_id R; lot_id R; quantity R; unit R | Consumir y materializar una vez; outputs trazan todos los inputs |
| stock_entries | lot_id/location_id R; movement_type R; signed_quantity R; unit R; event_id R; effective_at R; recorded_at R; correction_of O | Ledger append-only; débito y crédito enlazados en traslado |
| reservations | lot_id R; shipment_id R; quantity R; status R; expires_at O | Bloquear exceso de reserva con transacción |
| shipments/items | shipment_code/buyer/destination/status R; lot_id/quantity/unit R por item; dd_package_id C; dispatch_at C | Reservar → liberar → despachar; no debitar dos veces |

## Documentos, evidencia, riesgo y DD

| Entidad | Campos mínimos adicionales | Restricciones |
| --- | --- | --- |
| documents | document_type R; owner_type/id R; status R; current_version_id C | Referencia autorizada; visibilidad explícita |
| document_versions | document_id R; object_key/file_name/mime_type/size_bytes/checksum R; issued_at/expires_at O; uploaded_by R; scan_status R | SHA-256; objeto privado; no reemplazar bytes de una versión |
| evidence | evidence_type/claim/source/status R; valid_from/to C; confidence O; reviewer C | No inferir veracidad del checksum |
| evidence_sources/links | evidence_id R; source_version_id C; entity_type/id R; relationship_type R | `SUPPORTS/CONTRADICTS/BASED_ON`; misma organización o grant probado |
| rule_sets/rules | version R; effective_from R; source_reference R; approval_status R; condition/action/explanation R | Reglas jurídicas no aprobadas no activan conclusiones |
| risk_assessments | subject_type/id R; severity R; workflow_status R; score O; rule_set_version R; input_snapshot_hash R; evaluated_at R; legal_conclusion R | Score null si inputs insuficientes; snapshot inmutable |
| risk_factors | assessment_id R; category/code/value R; weight/score O; explanation R; evidence_required R | Mantener discrepancias y motivos, no solo un total |
| mitigation_actions | assessment_id R; action_type/description/assignee/due_date/status R; evidence_id C; verified_by/at C | Responsable con acceso; separación de ejecución y revisión |
| legal_requirements | jurisdiction/topic R; applicability_rule R; required_evidence R; authoritative_source/version R; approved_by C | Validación legal previa a activación |
| dd_cases | reference/operator/status R; subject_scope R; started_at R; reviewed_by/at C | Expediente independiente de envío oficial |
| dd_packages/items | case_id R; snapshot_version/hash R; object_key R; generated_at/by R; manifest R; referenced_version R por item | `READY` solo para snapshot validado; descarga auditada |
| dds_submissions | package_id R; environment R; official_reference C; submission_status R; receipt_key C; submitted_by/at C | Sin referencia real, no marcar presentación aceptada |

## Soporte transversal

| Entidad | Campos mínimos | Regla |
| --- | --- | --- |
| traceability_events | event_id/org/type/schema_version/actor/occurred_at/recorded_at/aggregate_id/version/payload | Append-only, unique aggregate version |
| audit_logs | org/actor/action/entity/time/request_id/result; before/after C | Redactar PII/secretos, no guardar tokens |
| outbox/jobs | event_id/org/type/payload/status/attempts/next_attempt_at | Reintento e idempotencia; DLQ tras política agotada |
| sync_operations | org/device/operation_id/payload_hash/base_version/status/result | Clave única tenant/operation_id; resultado reutilizable |
| import_batches/rows | org/file_hash/mapping/status/row_errors/imported_refs | Preview no crea entidades; commit reproducible |
| share_grants | owner_org/recipient/scope/fields/expires_at/revoked_at | Revocación aplica a nuevas consultas y URLs temporales |
| tasks/notifications | org/source/assignee/due_date/status/action_reference | Si derivable del dominio, proyectar en vez de duplicar estado |

## Calidad y privacidad

Completitud, validez, consistencia, unicidad y vigencia son resultados separados con denominador y regla. Evitar un campo de «confidence» global sin método. Campos personales y geometrías exactas exigen clasificación de acceso; una exportación debe aplicar la misma política que la consulta.

## Esquema implementado (contraste con el repositorio, 2026-10-10)

| Tabla real | Migración | Diferencias con la propuesta |
| --- | --- | --- |
| users, organizations, memberships, roles, role_assignments, audit_logs | 0001, 0002 | `users.platform_role` para SUPER_ADMIN; `token_version`; `email_verified_at` (nunca lo marca una invitación); `role_assignments` con FK compuesta por tenant |
| invitations | 0002 | Solo hash del token; una pendiente por correo y organización |
| organization_types | 0003 | Catálogo provisional D-18 |
| domain_events, event_deliveries, consumer_receipts | 0004 | Envolvente del doc 08; outbox por consumidor |
| producers | 0005, 0006 | Campos de S1 §12. **Identidad cifrada**: `document_type_enc`, `document_number_enc`, `phone_enc`, `address_enc` (AES-256-GCM, AAD por registro) + `document_number_bidx` (índice ciego). Sin texto plano en tabla ni historial. `assigned_membership_id` con FK compuesta. Baja lógica `deleted_*` |
| producer_versions | 0005, 0006 | Historial append-only; identidad cifrada por versión |
| producer_status_counts, organization_event_stats | 0004, 0005 | Proyecciones alimentadas por eventos |
| producer_match_reviews | 0007 | Revisión asistida de duplicados (P0-005) |
| plots, plot_versions, plot_history | 0008 | P0-006: geometría PostGIS 4326 inmutable por versión; superficie declarada y calculada separadas |
| location_samples (equivale a `gps_samples`) | 0009 | P0-007: coordenadas originales, fuente `BROWSER_GEOLOCATION`, `captured_at` del dispositivo, `received_at` del servidor, precisión en m o NULL explícito, `operation_id` idempotente. Sin `device_reference` (no hay contrato de dispositivo). Append-only |
| polygon_drafts | 0010 | P0-008: borrador de polígono **en el servidor** (no offline). Un solo OPEN por parcela; OPEN → CONFIRMED (`confirmed_version_id`, FK compuesta) o CANCELLED; `row_version` para concurrencia entre pestañas |
| draft_vertices | 0010 | P0-008: cada muestra adquirida (lon/lat originales, `BROWSER_GEOLOCATION`, `captured_at`, `received_at`, precisión o NULL, `operation_id` idempotente, `acquisition_seq` = orden explícito). Append-only |
| geometry_imports | 0011 | P0-009: importación GeoJSON. Original en S3 privado (`object_key`), `sha256` calculado en el servidor, tamaño, nombre, perfil, geometría analizada (PostGIS, clasificada como geometría exacta), validez técnica y motivo sin coordenadas, `analysis` (advertencias y conteos, sin coordenadas), `operation_id` (análisis) y `confirm_operation_id` (confirmación) idempotentes. ANALYZED → CONFIRMED / DISCARDED; original y análisis inmutables (trigger) |
| plot_versions.source_import_id | 0011 | Referencia (FK compuesta, mismo tenant, única) al original importado; solo con `survey_method = FILE_IMPORT`. Versiones anteriores sin cambios (NULL) |
| draft_vertex_exclusions | 0010 | P0-008: «deshacer» excluye un vértice sin borrar ni alterar la muestra. Composición vigente = vértices no excluidos por `acquisition_seq`. Append-only |

Clasificación de la identidad del productor: documento, teléfono y dirección se cifran y solo se devuelven con `producer:read_identity`. Nombre, razón social y ubicación administrativa quedan en claro porque la operación los necesita para buscar e identificar; su exposición se controla por permisos de lectura.
