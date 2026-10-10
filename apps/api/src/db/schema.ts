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
  document_type: string | null;
  document_number: string | null;
  phone: string | null;
  address: string | null;
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

export interface Database {
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
}
