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

export interface Database {
  invitations: InvitationsTable;
  users: UsersTable;
  organizations: OrganizationsTable;
  memberships: MembershipsTable;
  roles: RolesTable;
  role_assignments: RoleAssignmentsTable;
  audit_logs: AuditLogsTable;
}
