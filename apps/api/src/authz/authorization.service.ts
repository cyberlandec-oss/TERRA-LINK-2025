import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from '../db/database';
import type { Database, OrganizationStatus } from '../db/schema';
import { forbidden, notFound } from '../common/errors';
import type { AuthUser } from '../auth/auth';
import { PLATFORM_PERMISSIONS, permissionsForRoles, type Permission, type PlatformPermission } from './catalog';

export interface TenantContext {
  organizationId: string;
  organizationStatus: OrganizationStatus;
  membershipId: string;
  roles: string[];
  permissions: Permission[];
}

// Algoritmo (doc 07): membresía activa → tenant desde contexto confiable → permiso → estado del tenant.
// Sin membresía activa: 404 (anti-enumeración). Con membresía y sin permiso: 403.
@Injectable()
export class AuthorizationService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async tenantContext(user: AuthUser, organizationId: string): Promise<TenantContext | null> {
    const rows = await this.db
      .selectFrom('memberships as m')
      .innerJoin('organizations as o', 'o.id', 'm.organization_id')
      .leftJoin('role_assignments as ra', (j) =>
        j.onRef('ra.membership_id', '=', 'm.id').onRef('ra.organization_id', '=', 'm.organization_id'),
      )
      .select(['m.id as membership_id', 'o.status as org_status', 'ra.role_code'])
      .where('m.user_id', '=', user.id)
      .where('m.organization_id', '=', organizationId)
      .where('m.status', '=', 'ACTIVE')
      .execute();
    if (rows.length === 0) return null;
    const roles = rows.map((r) => r.role_code).filter((r): r is string => !!r);
    return {
      organizationId,
      organizationStatus: rows[0].org_status,
      membershipId: rows[0].membership_id,
      roles,
      permissions: permissionsForRoles(roles),
    };
  }

  /**
   * Exige permiso dentro de la organización. `mutation` bloquea toda escritura si el tenant está
   * suspendido; la lectura del historial sigue disponible.
   */
  async require(
    user: AuthUser,
    organizationId: string,
    permission: Permission,
    opts: { mutation: boolean },
  ): Promise<TenantContext> {
    const ctx = await this.tenantContext(user, organizationId);
    if (!ctx) throw notFound();
    if (!ctx.permissions.includes(permission)) throw forbidden();
    if (opts.mutation && ctx.organizationStatus !== 'ACTIVE') {
      throw forbidden('ORGANIZATION_SUSPENDED', 'La organización está suspendida; no admite nuevas operaciones.');
    }
    return ctx;
  }

  hasPlatform(user: AuthUser, permission: PlatformPermission): boolean {
    return user.platformRole === 'SUPER_ADMIN' && PLATFORM_PERMISSIONS.SUPER_ADMIN.includes(permission);
  }

  requirePlatform(user: AuthUser, permission: PlatformPermission): void {
    if (!this.hasPlatform(user, permission)) throw forbidden();
  }
}
