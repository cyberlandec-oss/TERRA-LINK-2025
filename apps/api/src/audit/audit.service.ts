import { Injectable } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';

export interface AuditEntry {
  organizationId?: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

// Se escribe con el mismo `trx` de la mutación: si la auditoría falla, la mutación se revierte.
// No incluir secretos, hashes ni tokens en before/after.
@Injectable()
export class AuditService {
  async record(db: Kysely<Database> | Transaction<Database>, e: AuditEntry): Promise<void> {
    await db
      .insertInto('audit_logs')
      .values({
        organization_id: e.organizationId ?? null,
        actor_user_id: e.actorUserId,
        action: e.action,
        entity_type: e.entityType,
        entity_id: e.entityId ?? null,
        request_id: e.requestId ?? null,
        result: e.result,
        before: e.before === undefined ? null : JSON.stringify(e.before),
        after: e.after === undefined ? null : JSON.stringify(e.after),
        reason: e.reason ?? null,
      })
      .execute();
  }
}
