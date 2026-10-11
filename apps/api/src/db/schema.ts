import type { ColumnType, Generated } from 'kysely';

// Tipos de las tablas según las migraciones de src/db/migrations.
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED';
export type MembershipStatus = 'ACTIVE' | 'INACTIVE';

export interface UsersTable {
  id: Generated<string>;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string | null;
  status: UserStatus;
  platform_role: 'SUPER_ADMIN' | null;
  last_login_at: Timestamp | null;
  token_version: Generated<number>;
  email_verified_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OrganizationsTable {
  id: Generated<string>;
  name: string;
  legal_name: string | null;
  organization_type: string;
  tax_id: string | null;
  country: string;
  province: string | null;
  canton: string | null;
  parish: string | null;
  status: OrganizationStatus;
  status_reason: string | null;
  row_version: Generated<string>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface MembershipsTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string;
  status: MembershipStatus;
  status_reason: string | null;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}

export interface RolesTable {
  code: string;
  scope: 'PLATFORM' | 'ORGANIZATION';
  description: string;
}

export interface RoleAssignmentsTable {
  id: Generated<string>;
  organization_id: string;
  membership_id: string;
  role_code: string;
  created_at: Timestamp;
  created_by: string;
}

export interface AuditLogsTable {
  id: Generated<string>;
  organization_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_id: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  before: unknown | null;
  after: unknown | null;
  reason: string | null;
  occurred_at: Timestamp;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface InvitationsTable {
  id: Generated<string>;
  organization_id: string;
  email: string;
  role_code: string;
  token_hash: string;
  status: InvitationStatus;
  expires_at: Timestamp;
  created_at: Timestamp;
  created_by: string;
  accepted_at: Timestamp | null;
  accepted_by: string | null;
  revoked_at: Timestamp | null;
  revoked_by: string | null;
}

export interface OrganizationTypesTable {
  code: string;
  label_es: string;
  status: 'PROVISIONAL' | 'RATIFIED' | 'LEGACY' | 'RETIRED';
  sort_order: number;
}

export interface DomainEventsTable {
  event_id: string;
  organization_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string;
  actor_id: string | null;
  occurred_at: Timestamp;
  recorded_at: Timestamp;
  correlation_id: string | null;
  causation_id: string | null;
  operation_id: string | null;
  payload: unknown;
  correction_of_event_id: Generated<string | null>;
  correction_reason: Generated<string | null>;
}

export interface EventDeliveriesTable {
  event_id: string;
  consumer: string;
  status: 'PENDING' | 'PROCESSING' | 'FAILED' | 'DONE' | 'DEAD';
  attempts: Generated<number>;
  next_attempt_at: Timestamp;
  locked_by: string | null;
  locked_until: Timestamp | null;
  last_error: string | null;
  delivered_at: Timestamp | null;
  created_at: Timestamp;
  lease_token: string | null;
  manual_requeues: Generated<number>;
}

export interface ConsumerReceiptsTable {
  consumer: string;
  event_id: string;
  processed_at: Timestamp;
}

export interface OrganizationEventStatsTable {
  organization_id: string;
  event_type: string;
  event_count: string;
  last_event_at: Timestamp;
}

export type ProducerStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface ProducersTable {
  id: Generated<string>;
  organization_id: string;
  producer_code: string;
  first_name: string | null;
  last_name: string | null;
  legal_name: string | null;
  // Identidad cifrada (crypto/pii.ts); nunca en texto plano.
  document_type_enc: string | null;
  document_number_enc: string | null;
  phone_enc: string | null;
  address_enc: string | null;
  document_number_bidx: string | null;
  community: string | null;
  province: string | null;
  canton: string | null;
  parish: string | null;
  status: ProducerStatus;
  assigned_membership_id: string | null;
  row_version: Generated<string>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  deleted_at: Timestamp | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface ProducerVersionsTable {
  id: Generated<string>;
  organization_id: string;
  producer_id: string;
  version: string;
  change_type: string;
  changed_fields: string[];
  snapshot: unknown;
  reason: string | null;
  changed_by: string;
  changed_at: Timestamp;
}

export interface ProducerStatusCountsTable {
  organization_id: string;
  status: ProducerStatus;
  producer_count: string;
}

export interface ProducerMatchReviewsTable {
  id: Generated<string>;
  organization_id: string;
  producer_a_id: string;
  producer_b_id: string;
  rule_code: 'IDENTITY_DOCUMENT';
  status: 'PENDING' | 'NOT_DUPLICATE' | 'DUPLICATE_CONFIRMED';
  detected_at: Timestamp;
  detected_by: string;
  resolved_at: Timestamp | null;
  resolved_by: string | null;
  resolution_note: string | null;
  row_version: Generated<string>;
}

export type PlotStatus = 'ACTIVE' | 'INACTIVE';

export interface PlotsTable {
  id: string;
  organization_id: string;
  producer_id: string;
  plot_code: string;
  name: string | null;
  crop: string;
  variety: string | null;
  land_use: string | null;
  province: string | null;
  canton: string | null;
  parish: string | null;
  status: PlotStatus;
  current_version_id: string | null;
  row_version: Generated<string>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  deleted_at: Timestamp | null;
  deleted_by: string | null;
  deletion_reason: string | null;
}

export interface PlotVersionsTable {
  id: string;
  organization_id: string;
  plot_id: string;
  version_number: number;
  geometry: unknown | null;
  geometry_type: 'POINT' | 'POLYGON' | 'MULTIPOLYGON' | null;
  geometry_hash: string | null;
  area_declared_ha: string | null;
  area_calculated_ha: string | null;
  survey_method: 'DECLARED' | 'MANUAL_COORDINATES' | 'BROWSER_GEOLOCATION' | 'GPS_POINT' | 'GPS_POLYGON' | 'FILE_IMPORT';
  surveyed_at: Timestamp | null;
  accuracy_m: string | null;
  validation_status: 'NOT_VALIDATED' | 'VALID' | 'WARNING' | 'INVALID' | 'REVIEW_REQUIRED';
  validation_rule_version: string;
  previous_version_id: string | null;
  notes: string | null;
  created_at: Timestamp;
  created_by: string;
  source_import_id: Generated<string | null>;
}

export interface PlotHistoryTable {
  id: Generated<string>;
  organization_id: string;
  plot_id: string;
  row_version: string;
  change_type: string;
  changed_fields: string[];
  snapshot: unknown;
  reason: string | null;
  changed_by: string;
  changed_at: Timestamp;
}

export interface LocationSamplesTable {
  id: string;
  organization_id: string;
  plot_id: string;
  plot_version_id: string;
  source: 'BROWSER_GEOLOCATION';
  longitude: number;
  latitude: number;
  horizontal_accuracy_m: number | null;
  captured_at: Timestamp;
  received_at: Timestamp;
  operation_id: string;
  payload_hash: string;
  created_by: string;
}

export interface PolygonDraftsTable {
  id: string;
  organization_id: string;
  plot_id: string;
  status: 'OPEN' | 'CONFIRMED' | 'CANCELLED';
  row_version: Generated<string>;
  confirmed_version_id: string | null;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
  closed_at: Timestamp | null;
  closed_by: string | null;
}

export interface DraftVerticesTable {
  id: string;
  organization_id: string;
  draft_id: string;
  acquisition_seq: number;
  source: 'BROWSER_GEOLOCATION';
  longitude: number;
  latitude: number;
  horizontal_accuracy_m: number | null;
  captured_at: Timestamp;
  received_at: Timestamp;
  operation_id: string;
  payload_hash: string;
  created_by: string;
}

export interface DraftVertexExclusionsTable {
  vertex_id: string;
  organization_id: string;
  excluded_at: Timestamp;
  excluded_by: string;
}

export interface GeometryImportsTable {
  id: string;
  organization_id: string;
  plot_id: string;
  status: 'ANALYZED' | 'CONFIRMED' | 'DISCARDED';
  object_key: string;
  sha256: string;
  byte_size: number;
  original_filename: string | null;
  media_type: string;
  profile_version: string;
  geometry: unknown;
  geometry_type: 'POLYGON' | 'MULTIPOLYGON';
  technically_valid: boolean;
  validity_reason: string | null;
  analysis: unknown;
  operation_id: string;
  confirm_operation_id: string | null;
  confirmed_version_id: string | null;
  row_version: Generated<string>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  created_by: string;
  closed_at: Timestamp | null;
  closed_by: string | null;
}

export interface ObjectDeletionsTable {
  object_key: string;
  reason: 'DISCARDED' | 'ORPHAN';
  status: 'PENDING' | 'FAILED' | 'DONE' | 'SKIPPED_REFERENCED';
  attempts: Generated<number>;
  last_error_code: string | null;
  next_attempt_at: ColumnType<Date, Date | string | undefined, Date | string>;
  leased_by: string | null;
  lease_until: Timestamp | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  completed_at: Timestamp | null;
}

export interface GisEvaluationsTable {
  id: string;
  organization_id: string;
  plot_id: string;
  plot_version_id: string;
  geometry_hash: string | null;
  rule_id: string;
  rule_version: string;
  parameters: unknown;
  status: 'VALID' | 'WARNING' | 'INVALID' | 'REVIEW_REQUIRED';
  checks: unknown;
  capture_quality: unknown;
  destination_profile: unknown;
  error_location: unknown;
  compared_set_hash: string;
  compared_count: number;
  operation_id: string;
  evaluated_by: string;
  comparison_scope: Generated<'ORGANIZATION' | 'EVALUATOR_ASSIGNED'>;
  scope_membership_id: string | null;
  evaluated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface GisEvaluationComparisonsTable {
  evaluation_id: string;
  organization_id: string;
  compared_plot_id: string;
  compared_version_id: string;
  compared_geometry_hash: string;
  relation: 'EQUAL' | 'OVERLAP' | 'TOUCH';
  same_hash: boolean;
  shared_area_m2: string | null;
}

export interface ProductStatesTable { code: string; label: string; sort_order: number; source: string }
export interface MeasurementUnitsTable { code: string; label: string; symbol: string; dimension: 'MASS'; source: string }
export interface ProductsTable {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  product_state: string;
  unit: string;
  scientific_name: string | null;
  variety: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  status_reason: string | null;
  row_version: Generated<string>;
  created_at: Timestamp;
  created_by: string;
  updated_at: Timestamp;
  updated_by: string;
}
export interface ProductVersionsTable {
  product_id: string;
  organization_id: string;
  version: string;
  change_type: 'CREATED' | 'UPDATED' | 'DEACTIVATED' | 'ACTIVATED';
  changed_fields: string[];
  snapshot: unknown;
  reason: string | null;
  changed_by: string;
  changed_at: Timestamp;
}

export interface EventDeliveryAttemptsTable {
  id: Generated<string>;
  event_id: string;
  consumer: string;
  attempt: number;
  worker_id: string | null;
  lease_token: string | null;
  outcome: 'DONE' | 'DUPLICATE' | 'FAILED' | 'DEAD' | 'LEASE_LOST' | 'MANUAL_REQUEUE';
  error_code: string | null;
  actor_id: string | null;
  reason: string | null;
  recorded_at: Generated<Timestamp>;
}

export interface DocumentTypesTable { code: string; label: string; allowed_owner_types: string[]; classification: 'OPERATIONAL' | 'PERSONAL_DATA'; source: string }
export interface DocumentsTable {
  id: string; organization_id: string; document_type: string; owner_type: string; owner_id: string; title: string;
  current_version_id: string | null; row_version: Generated<string>; created_by: string; created_at: Generated<Timestamp>;
}
export interface DocumentVersionsTable {
  id: string; organization_id: string; document_id: string; version_number: number; object_key: string; file_name: string; mime_type: string;
  size_bytes: number; sha256: string; issuer: string | null; issued_at: string | null; expires_at: string | null; previous_version_id: string | null;
  operation_id: string; uploaded_by: string; uploaded_at: Generated<Timestamp>;
}
export interface DocumentVersionScansTable {
  id: Generated<string>; organization_id: string; version_id: string; result: 'CLEAN' | 'INFECTED' | 'FAILED'; engine: string;
  signature: string | null; error_code: string | null; scanned_at: Generated<Timestamp>;
}
export interface DocumentVersionReviewsTable {
  id: Generated<string>; organization_id: string; version_id: string; decision: 'ACCEPTED' | 'REJECTED'; reason: string; reviewer_id: string; reviewed_at: Generated<Timestamp>;
}
export interface DocumentLinksTable { document_id: string; organization_id: string; entity_type: string; entity_id: string; created_by: string; created_at: Generated<Timestamp> }

export interface EvidenceClaimTypesTable { code: string; label: string; entity_types: string[]; limitation: string; source: string }
export interface EvidenceTable {
  id: string; organization_id: string; claim_type: string; entity_type: string; entity_id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'REVOKED'; valid_from: string | null; valid_to: string | null;
  row_version: Generated<string>; operation_id: string; created_by: string; created_at: Generated<Timestamp>;
}
export interface EvidenceSourcesTable {
  id: string; organization_id: string; evidence_id: string; document_version_id: string; relationship: 'SUPPORTS' | 'CONTRADICTS' | 'BASED_ON';
  note: string | null; operation_id: string; added_by: string; added_at: Generated<Timestamp>;
}
export interface EvidenceSourceWithdrawalsTable { source_id: string; organization_id: string; reason: string; withdrawn_by: string; withdrawn_at: Generated<Timestamp> }
export interface EvidenceDecisionsTable {
  id: Generated<string>; organization_id: string; evidence_id: string; action: 'SUBMIT' | 'VERIFY' | 'REJECT' | 'REVOKE' | 'REOPEN';
  from_status: string; to_status: string; reason: string; sources_snapshot: unknown; contradictions_acknowledged: Generated<boolean>;
  actor_id: string; decided_at: Generated<Timestamp>;
}

// P0-012 Entregas y recepción
export interface LocationsTable { id: string; organization_id: string; code: string; name: string; location_type: 'COLLECTION_CENTER' | 'WAREHOUSE' | 'OTHER'; status: 'ACTIVE' | 'INACTIVE'; row_version: Generated<string>; created_by: string; created_at: Generated<Timestamp> }
export interface DeliveriesTable {
  id: string; organization_id: string; delivery_code: string; status: 'DRAFT' | 'REGISTERED'; producer_id: string; product_id: string | null; location_id: string | null;
  delivery_date: string | null; quantity_declared: string | null; unit: string | null; harvest_precision: 'DAY' | 'MONTH' | 'UNKNOWN' | null; harvest_start: string | null; harvest_end: string | null;
  harvest_derived_start: string | null; harvest_derived_end: string | null; notes: string | null; created_by: string; registered_by: string | null; registered_at: Timestamp | null;
  operation_id: string; row_version: Generated<string>; created_at: Generated<Timestamp>; updated_at: Generated<Timestamp>;
}
export interface DeliveryOriginsTable { id: string; organization_id: string; delivery_id: string; plot_id: string; origin_quantity: string | null; created_at: Generated<Timestamp> }
export interface DeliverySupportsTable { id: string; organization_id: string; delivery_id: string; document_id: string; document_version_id: string; support_kind: string; added_by: string; added_at: Generated<Timestamp>; operation_id: string }
export interface DeliverySupportWithdrawalsTable { support_id: string; organization_id: string; reason: string; withdrawn_by: string; withdrawn_at: Generated<Timestamp> }
export interface DeliveryCorrectionsTable {
  id: string; organization_id: string; delivery_id: string; correction_number: number; corrected_event_id: string; correction_event_id: string; reason: string; changed_fields: string[];
  delivery_date: string; quantity_declared: string; harvest_precision: string | null; harvest_start: string | null; harvest_end: string | null; harvest_derived_start: string | null; harvest_derived_end: string | null;
  notes: string | null; created_by: string; created_at: Generated<Timestamp>; operation_id: string;
}
export interface ReceptionsTable {
  id: string; organization_id: string; delivery_id: string; location_id: string; receiver_membership_id: string; receiver_user_id: string; received_at: Timestamp;
  quantity_received: string; unit: string; notes: string | null; operation_id: string; created_at: Generated<Timestamp>;
}
export interface WeighingsTable {
  id: string; organization_id: string; reception_id: string; method: string; quantity: string; unit: string; weighed_on: string; responsible_membership_id: string; responsible_user_id: string;
  corrects_weighing_id: string | null; created_at: Generated<Timestamp>;
}
export interface ReceptionAdjustmentsTable {
  id: string; organization_id: string; reception_id: string; adjustment_number: number; weighing_id: string; previous_quantity: string; new_quantity: string; reason: string;
  corrected_event_id: string; correction_event_id: string; created_by: string; created_at: Generated<Timestamp>; operation_id: string;
}
export interface QualitySamplesTable { id: string; organization_id: string; reception_id: string; moment: 'DURING_RECEPTION' | 'AFTER_WEIGHING'; sample_reference: string | null; sampled_at: Timestamp; sampled_by_membership_id: string; sampled_by: string; operation_id: string; created_at: Generated<Timestamp> }
export interface QualityResultsTable {
  id: string; organization_id: string; sample_id: string; method: string; decision: 'PENDING' | 'RELEASED' | 'REJECTED'; limits_version: string | null; decision_reason: string | null;
  recorded_by_membership_id: string; recorded_by: string; recorded_at: Generated<Timestamp>; operation_id: string;
}
export interface QualityMeasurementsTable { id: string; organization_id: string; result_id: string; parameter: 'MOISTURE' | 'FERMENTATION' | 'IMPURITIES'; value: string; unit: string }
export interface GateEvaluationsTable { id: string; organization_id: string; entity_type: 'delivery' | 'reception' | 'quality_result' | 'process_run' | 'stock_movement'; entity_id: string; transition: string; release_version: string; allowed: boolean; result: unknown; evaluated_by: string; evaluated_at: Generated<Timestamp> }

// P0-016 Lotes y procesos
export interface ProcessRunsTable {
  id: string; organization_id: string; run_code: string; process_type: 'FERMENTATION' | 'DRYING'; status: 'DRAFT' | 'RUNNING' | 'CLOSED' | 'CANCELLED'; output_product_id: string;
  started_at: Timestamp | null; closed_at: Timestamp | null; loss_quantity: string | null; moisture_value: string | null; moisture_unit: string | null; notes: string | null; cancel_reason: string | null;
  created_by: string; operation_id: string; start_operation_id: string | null; close_operation_id: string | null; cancel_operation_id: string | null; row_version: Generated<string>; created_at: Generated<Timestamp>;
}
export interface LotsTable {
  id: string; organization_id: string; lot_code: string; product_id: string; unit: string; source: 'RECEPTIONS' | 'PROCESS_OUTPUT'; status: 'OPEN' | 'CLOSED_FOR_INPUT';
  origin_status: 'COMPLETE' | 'INCOMPLETE'; process_run_id: string | null; output_quantity: string | null; created_by: string; operation_id: string; row_version: Generated<string>; created_at: Generated<Timestamp>;
}
export interface LotInputsTable { id: string; organization_id: string; lot_id: string; reception_id: string; weighing_id: string; reception_version: number; quantity: string; unit: string; origin_known: boolean; assigned_by: string; assigned_at: Generated<Timestamp>; operation_id: string }
export interface LotInputReleasesTable { input_id: string; organization_id: string; reason: string; released_by: string; released_at: Generated<Timestamp>; operation_id: string }
export interface ProcessInputsTable { id: string; organization_id: string; run_id: string; lot_id: string; lot_version: string; quantity: string; unit: string; location_id: string | null }
export interface LotEdgesTable { id: string; organization_id: string; parent_lot_id: string; child_lot_id: string; run_id: string; quantity: string; unit: string }
export interface ProcessOutputsTable { id: string; organization_id: string; run_id: string; lot_id: string; quantity: string; unit: string }

// P0-017 ledger
export interface StockMovementsTable { id: string; organization_id: string; movement_type: string; source_type: string | null; source_id: string | null; operation_id: string | null; actor_id: string | null; reason: string | null; process_loss: string | null; reference: unknown; recorded_at: Generated<Timestamp> }
export interface StockEntriesTable { id: string; organization_id: string; movement_id: string; reception_id: string | null; lot_id: string | null; location_id: string | null; bucket: 'PHYSICAL' | 'RESERVED'; signed_quantity: string; unit: string }

// P0-020 riesgo
export interface RiskEvaluationsTable {
  id: string; organization_id: string; subject_type: 'LOT'; subject_id: string; evaluation_number: number; rule_set_version: string; parameters: unknown; snapshot: unknown; snapshot_hash: string;
  factors: unknown; categories: unknown; technical_result: string; severity: string; conclusion: string; evaluated_by: string; evaluated_at: Generated<Timestamp>; operation_id: string; trigger: unknown | null;
}
export interface RiskReviewsTable { id: string; organization_id: string; evaluation_id: string; action: 'START_REVIEW' | 'RESOLVE'; reason: string; reviewer_id: string; reviewed_at: Generated<Timestamp>; operation_id: string }

// P0-021 mitigaciones
export interface MitigationActionsTable {
  id: string; organization_id: string; evaluation_id: string; factor_code: string; subject_type: 'LOT'; subject_id: string; title: string; acceptance_criteria: string; evidence_required: string;
  assignee_membership_id: string; due_date: string; status: 'OPEN' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED'; created_by: string; created_at: Generated<Timestamp>; operation_id: string; row_version: Generated<string>;
}
export interface MitigationSupportsTable { id: string; organization_id: string; action_id: string; submission_number: number; document_version_id: string | null; evidence_id: string | null; evidence_version: string | null; added_by: string; added_at: Generated<Timestamp>; operation_id: string }
export interface MitigationSubmissionsTable { id: string; organization_id: string; action_id: string; submission_number: number; note: string; submitted_by: string; submitted_at: Generated<Timestamp>; operation_id: string }
// P0-022 expediente de debida diligencia
export interface DdCasesTable { id: string; organization_id: string; case_number: string; subject_type: 'LOT'; subject_id: string; scope_note: string; created_by: string; created_at: Generated<Timestamp>; operation_id: string }
export interface DdSnapshotsTable { id: string; organization_id: string; case_id: string; snapshot_number: number; content: unknown; content_hash: string; section_hashes: unknown; manifest: unknown; requirements: unknown; readiness: 'BLOCKED' | 'IN_PROGRESS' | 'READY'; captured_by: string; captured_at: Generated<Timestamp>; operation_id: string }
export interface DdReviewsTable { id: string; organization_id: string; snapshot_id: string; action: 'START_REVIEW' | 'RETURN' | 'APPROVE'; reason: string; reviewer_id: string; reviewed_at: Generated<Timestamp>; operation_id: string }
export interface DdExportsTable { id: string; organization_id: string; snapshot_id: string; kind: 'INTERNAL_REVIEW' | 'DD_PACKAGE'; redaction_profile: unknown; package_hash: string; size_bytes: number; exported_by: string; exported_at: Generated<Timestamp>; operation_id: string }
export interface MitigationDecisionsTable { id: string; organization_id: string; action_id: string; submission_number: number; decision: 'VERIFIED' | 'REJECTED'; reason: string; decided_by: string; decided_at: Generated<Timestamp>; operation_id: string }

export interface Database {
  evidence_claim_types: EvidenceClaimTypesTable;
  evidence: EvidenceTable;
  evidence_sources: EvidenceSourcesTable;
  evidence_source_withdrawals: EvidenceSourceWithdrawalsTable;
  evidence_decisions: EvidenceDecisionsTable;
  document_types: DocumentTypesTable;
  documents: DocumentsTable;
  document_versions: DocumentVersionsTable;
  document_version_scans: DocumentVersionScansTable;
  document_version_reviews: DocumentVersionReviewsTable;
  document_links: DocumentLinksTable;
  event_delivery_attempts: EventDeliveryAttemptsTable;
  product_states: ProductStatesTable;
  measurement_units: MeasurementUnitsTable;
  products: ProductsTable;
  product_versions: ProductVersionsTable;
  object_deletions: ObjectDeletionsTable;
  gis_evaluations: GisEvaluationsTable;
  gis_evaluation_comparisons: GisEvaluationComparisonsTable;
  geometry_imports: GeometryImportsTable;
  polygon_drafts: PolygonDraftsTable;
  draft_vertices: DraftVerticesTable;
  draft_vertex_exclusions: DraftVertexExclusionsTable;
  location_samples: LocationSamplesTable;
  plots: PlotsTable;
  plot_versions: PlotVersionsTable;
  plot_history: PlotHistoryTable;
  producer_match_reviews: ProducerMatchReviewsTable;
  producers: ProducersTable;
  producer_versions: ProducerVersionsTable;
  producer_status_counts: ProducerStatusCountsTable;
  domain_events: DomainEventsTable;
  event_deliveries: EventDeliveriesTable;
  consumer_receipts: ConsumerReceiptsTable;
  organization_event_stats: OrganizationEventStatsTable;
  organization_types: OrganizationTypesTable;
  invitations: InvitationsTable;
  users: UsersTable;
  organizations: OrganizationsTable;
  memberships: MembershipsTable;
  roles: RolesTable;
  role_assignments: RoleAssignmentsTable;
  audit_logs: AuditLogsTable;
  locations: LocationsTable;
  deliveries: DeliveriesTable;
  delivery_origins: DeliveryOriginsTable;
  delivery_supports: DeliverySupportsTable;
  delivery_support_withdrawals: DeliverySupportWithdrawalsTable;
  delivery_corrections: DeliveryCorrectionsTable;
  receptions: ReceptionsTable;
  weighings: WeighingsTable;
  reception_adjustments: ReceptionAdjustmentsTable;
  quality_samples: QualitySamplesTable;
  quality_results: QualityResultsTable;
  quality_measurements: QualityMeasurementsTable;
  gate_evaluations: GateEvaluationsTable;
  process_runs: ProcessRunsTable;
  lots: LotsTable;
  lot_inputs: LotInputsTable;
  lot_input_releases: LotInputReleasesTable;
  process_inputs: ProcessInputsTable;
  lot_edges: LotEdgesTable;
  process_outputs: ProcessOutputsTable;
  stock_movements: StockMovementsTable;
  stock_entries: StockEntriesTable;
  risk_evaluations: RiskEvaluationsTable;
  risk_reviews: RiskReviewsTable;
  mitigation_actions: MitigationActionsTable;
  mitigation_supports: MitigationSupportsTable;
  mitigation_submissions: MitigationSubmissionsTable;
  mitigation_decisions: MitigationDecisionsTable;
  dd_cases: DdCasesTable;
  dd_snapshots: DdSnapshotsTable;
  dd_reviews: DdReviewsTable;
  dd_exports: DdExportsTable;
}
