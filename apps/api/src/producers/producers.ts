import {
  Body, Controller, Get, HttpCode, Inject, Injectable, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import { DB } from '../db/database';
import type { Database, ProducerStatus, ProducersTable } from '../db/schema';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { EVENT_STORE, type EventConsumer, type EventStore } from '../events/events';
import { permissionsForRoles } from '../authz/catalog';

// P0-004 — Productor (RF-04). Alcance:
// - producer:read ve todos los productores de la organización; producer:read_assigned solo los
//   asignados a su membresía. Igual para update/update_assigned.
// - Identidad (documento, teléfono, dirección) solo con producer:read_identity; nunca en eventos,
//   auditoría ni logs. El historial completo vive en producer_versions y se redacta al leerlo.
// - Fuera de alcance (P0-005): deduplicación asistida, fusiones, corrección del código.

const IDENTITY_FIELDS = ['document_type', 'document_number', 'phone', 'address'] as const;
const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'legal_name', 'document_type', 'document_number', 'phone', 'address',
  'community', 'province', 'canton', 'parish',
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];
type ProducerRow = Selectable<ProducersTable>;

const CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;

class ProducerFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) first_name?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) last_name?: string | null;
  @ApiPropertyOptional({ description: 'Razón social (alternativa a nombre y apellido)' })
  @IsOptional() @IsString() @Length(1, 200) legal_name?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 40) document_type?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 40) document_number?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[+0-9 ()-]{6,20}$/, { message: 'phone: formato no válido' }) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) community?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) province?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) canton?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) parish?: string | null;
}

class CreateProducerDto extends ProducerFieldsDto {
  @ApiProperty({ example: 'PRD-0001' }) @Matches(CODE, { message: 'producer_code: 1–40 caracteres alfanuméricos, . _ -' }) producer_code!: string;
  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE'], default: 'ACTIVE' }) @IsOptional() @IsIn(['DRAFT', 'ACTIVE']) status?: 'DRAFT' | 'ACTIVE';
  @ApiPropertyOptional({ description: 'Membresía responsable (misma organización)' })
  @IsOptional() @IsUUID() assigned_membership_id?: string;
}

class UpdateProducerDto extends ProducerFieldsDto {
  @ApiProperty() @IsInt() @Min(1) expected_version!: number;
}

class AssignDto {
  @ApiProperty() @IsInt() @Min(1) expected_version!: number;
  @ApiProperty({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsUUID() membership_id!: string | null;
}

class StatusDto {
  @ApiProperty() @IsInt() @Min(1) expected_version!: number;
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
}

class ListQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'INACTIVE', 'ALL']) status?: ProducerStatus | 'ALL';
  @IsOptional() @IsIn(['me']) assigned?: 'me';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
}

const encodeCursor = (code: string, id: string) => Buffer.from(JSON.stringify([code, id])).toString('base64url');
function decodeCursor(c: string): [string, string] {
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') return [v[0], v[1]];
  } catch {
    /* cae al error */
  }
  throw new AppError(400, 'INVALID_CURSOR', 'El cursor de paginación no es válido. Vuelve a la primera página.');
}

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim());

@Injectable()
export class ProducersService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  /** Contexto con permiso de lectura (todos o asignados). */
  private async readContext(user: AuthUser, orgId: string): Promise<TenantContext> {
    const ctx = await this.authz.tenantContext(user, orgId);
    if (!ctx) throw notFound();
    if (!ctx.permissions.includes('producer:read') && !ctx.permissions.includes('producer:read_assigned')) throw forbidden();
    return ctx;
  }

  private inScope(ctx: TenantContext, p: Pick<ProducerRow, 'assigned_membership_id'>, kind: 'read' | 'update'): boolean {
    if (ctx.permissions.includes(`producer:${kind}` as never)) return true;
    return ctx.permissions.includes(`producer:${kind}_assigned` as never) && p.assigned_membership_id === ctx.membershipId;
  }

  /** Carga un productor de la organización respetando el alcance; fuera de alcance = 404. */
  private async load(db: Kysely<Database> | Transaction<Database>, ctx: TenantContext, id: string, kind: 'read' | 'update', lock = false) {
    let q = db.selectFrom('producers').selectAll().where('organization_id', '=', ctx.organizationId).where('id', '=', id);
    if (lock) q = q.forUpdate();
    const p = await q.executeTakeFirst();
    if (!p || !this.inScope(ctx, p, 'read')) throw notFound();
    if (kind === 'update' && !this.inScope(ctx, p, 'update')) throw forbidden();
    return p;
  }

  private view(p: ProducerRow, ctx: TenantContext) {
    const identity = ctx.permissions.includes('producer:read_identity');
    return {
      id: p.id,
      producer_code: p.producer_code,
      first_name: p.first_name,
      last_name: p.last_name,
      legal_name: p.legal_name,
      display_name: p.legal_name ?? [p.first_name, p.last_name].filter(Boolean).join(' '),
      community: p.community,
      province: p.province,
      canton: p.canton,
      parish: p.parish,
      status: p.status,
      assigned_membership_id: p.assigned_membership_id,
      row_version: Number(p.row_version),
      created_at: p.created_at,
      updated_at: p.updated_at,
      deleted_at: p.deleted_at,
      deletion_reason: p.deletion_reason,
      identity_visible: identity,
      ...(identity
        ? { document_type: p.document_type, document_number: p.document_number, phone: p.phone, address: p.address }
        : {}),
    };
  }

  /** La membresía asignada debe estar activa, en la misma organización y con acceso a productores. */
  private async assertAssignee(trx: Transaction<Database>, orgId: string, membershipId: string) {
    const ctx = await trx
      .selectFrom('memberships as m')
      .leftJoin('role_assignments as ra', (j) => j.onRef('ra.membership_id', '=', 'm.id').onRef('ra.organization_id', '=', 'm.organization_id'))
      .select(['m.id', 'm.status', 'ra.role_code'])
      .where('m.id', '=', membershipId)
      .where('m.organization_id', '=', orgId)
      .execute();
    if (ctx.length === 0) {
      throw new AppError(422, 'ASSIGNEE_NOT_FOUND', 'El responsable indicado no es miembro de esta organización.', [{ field: 'assigned_membership_id', reason: 'NOT_IN_ORGANIZATION' }]);
    }
    if (ctx[0].status !== 'ACTIVE') {
      throw new AppError(422, 'ASSIGNEE_INACTIVE', 'El responsable indicado tiene la membresía desactivada.', [{ field: 'assigned_membership_id', reason: 'INACTIVE' }]);
    }
    const perms = permissionsForRoles(ctx.map((r) => r.role_code).filter((r): r is string => !!r));
    if (!perms.includes('producer:read') && !perms.includes('producer:read_assigned')) {
      throw new AppError(422, 'ASSIGNEE_WITHOUT_ACCESS', 'El responsable indicado no tiene acceso a productores.', [{ field: 'assigned_membership_id', reason: 'NO_PRODUCER_ACCESS' }]);
    }
  }

  private snapshot(p: ProducerRow) {
    return { ...p, row_version: Number(p.row_version) };
  }

  private async recordVersion(trx: Transaction<Database>, p: ProducerRow, changeType: string, changed: string[], actorId: string, reason?: string | null) {
    await trx
      .insertInto('producer_versions')
      .values({
        organization_id: p.organization_id, producer_id: p.id, version: String(p.row_version), change_type: changeType,
        changed_fields: changed, snapshot: JSON.stringify(this.snapshot(p)), reason: reason ?? null, changed_by: actorId,
      })
      .execute();
  }

  async create(user: AuthUser, orgId: string, dto: CreateProducerDto, requestId?: string) {
    const ctx = await this.authz.require(user, orgId, 'producer:create', { mutation: true });
    let assignee = dto.assigned_membership_id ?? null;
    if (assignee && assignee !== ctx.membershipId && !ctx.permissions.includes('producer:assign')) {
      throw forbidden('PERMISSION_DENIED', 'No tienes permiso para asignar productores a otra persona.');
    }
    // Quien solo trabaja con asignados queda como responsable de lo que registra (si no, no podría verlo).
    if (!assignee && !ctx.permissions.includes('producer:read')) assignee = ctx.membershipId;
    const fields = this.normalize(dto);
    this.assertNames(fields);
    return this.db.transaction().execute(async (trx) => {
      if (assignee) await this.assertAssignee(trx, orgId, assignee);
      let p: ProducerRow;
      try {
        p = await trx
          .insertInto('producers')
          .values({
            ...fields, organization_id: orgId, producer_code: dto.producer_code.trim(), status: dto.status ?? 'ACTIVE',
            assigned_membership_id: assignee, created_by: user.id, updated_by: user.id,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow();
      } catch (e) {
        throw this.mapConstraint(e);
      }
      await this.recordVersion(trx, p, 'CREATE', Object.keys(fields).filter((k) => fields[k as EditableField] != null), user.id);
      await this.events.append(trx, {
        organizationId: orgId, eventType: 'ProducerRegistered', schemaVersion: 1, aggregateType: 'PRODUCER',
        aggregateId: p.id, aggregateVersion: Number(p.row_version), actorId: user.id, correlationId: requestId,
        payload: { producer_code: p.producer_code, status: p.status, assigned_membership_id: p.assigned_membership_id },
      });
      await this.audit.record(trx, {
        organizationId: orgId, actorUserId: user.id, action: 'producer.create', entityType: 'producer', entityId: p.id,
        requestId, result: 'SUCCESS', after: { producer_code: p.producer_code, status: p.status, assigned_membership_id: p.assigned_membership_id },
      });
      return this.view(p, ctx);
    });
  }

  private normalize(dto: ProducerFieldsDto): Partial<Record<EditableField, string | null>> {
    const out: Partial<Record<EditableField, string | null>> = {};
    for (const f of EDITABLE_FIELDS) {
      const v = blankToNull((dto as Record<string, string | null | undefined>)[f]);
      if (v !== undefined) out[f] = v;
    }
    return out;
  }

  private assertNames(f: Partial<Record<EditableField, string | null>>) {
    const hasPerson = !!f.first_name && !!f.last_name;
    if (!hasPerson && !f.legal_name) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Indica nombre y apellido, o la razón social.', [
        { field: 'first_name', reason: 'NAME_OR_LEGAL_NAME_REQUIRED' }, { field: 'legal_name', reason: 'NAME_OR_LEGAL_NAME_REQUIRED' },
      ]);
    }
    if ((f.document_type == null) !== (f.document_number == null)) {
      throw new AppError(400, 'VALIDATION_FAILED', 'El tipo y el número de documento van juntos.', [
        { field: 'document_number', reason: 'DOCUMENT_PAIR_REQUIRED' },
      ]);
    }
  }

  private mapConstraint(e: unknown): unknown {
    const c = (e as { constraint?: string }).constraint;
    if (c === 'producers_code_uq') return conflict('PRODUCER_CODE_TAKEN', 'Ya existe un productor con ese código en tu organización.');
    if (c === 'producers_assignee_fk') return new AppError(422, 'ASSIGNEE_NOT_FOUND', 'El responsable indicado no es miembro de esta organización.');
    if (c === 'producers_name_required' || c === 'producers_document_pair') {
      return new AppError(400, 'VALIDATION_FAILED', 'Revisa nombre/razón social y el par tipo–número de documento.');
    }
    return e;
  }

  async list(user: AuthUser, orgId: string, q: ListQuery) {
    const ctx = await this.readContext(user, orgId);
    const limit = q.limit ?? 25;
    const status = q.status ?? 'ACTIVE_OR_DRAFT';
    let query = this.db.selectFrom('producers').selectAll().where('organization_id', '=', orgId);
    if (status === 'ACTIVE_OR_DRAFT') query = query.where('status', 'in', ['ACTIVE', 'DRAFT']);
    else if (status !== 'ALL') query = query.where('status', '=', status);
    if (!ctx.permissions.includes('producer:read') || q.assigned === 'me') {
      query = query.where('assigned_membership_id', '=', ctx.membershipId);
    }
    if (q.q?.trim()) {
      const term = q.q.trim();
      const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const identity = ctx.permissions.includes('producer:read_identity');
      query = query.where((eb) => {
        const ors = [
          eb('producer_code', 'ilike', like),
          eb(sql`coalesce(first_name,'') || ' ' || coalesce(last_name,'')`, 'ilike', like),
          eb('legal_name', 'ilike', like),
          eb('community', 'ilike', like),
        ];
        // Buscar por documento solo con permiso de identidad, y por coincidencia exacta.
        if (identity) ors.push(eb('document_number', '=', term));
        return eb.or(ors);
      });
    }
    if (q.cursor) {
      const [code, id] = decodeCursor(q.cursor);
      query = query.where((eb) => eb.or([eb('producer_code', '>', code), eb.and([eb('producer_code', '=', code), eb('id', '>', id)])]));
    }
    const rows = await query.orderBy('producer_code').orderBy('id').limit(limit + 1).execute();
    const page = rows.slice(0, limit);
    return {
      items: page.map((p) => this.view(p, ctx)),
      next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1].producer_code, page[page.length - 1].id) : null,
    };
  }

  async get(user: AuthUser, orgId: string, id: string) {
    const ctx = await this.readContext(user, orgId);
    const p = await this.load(this.db, ctx, id, 'read');
    return {
      ...this.view(p, ctx),
      can_update: p.status !== 'INACTIVE' && this.inScope(ctx, p, 'update') && ctx.organizationStatus === 'ACTIVE',
      can_assign: ctx.permissions.includes('producer:assign') && ctx.organizationStatus === 'ACTIVE',
      can_archive: ctx.permissions.includes('producer:archive') && ctx.organizationStatus === 'ACTIVE',
    };
  }

  async update(user: AuthUser, orgId: string, id: string, dto: UpdateProducerDto, requestId?: string) {
    const ctx = await this.authz.tenantContext(user, orgId);
    if (!ctx) throw notFound();
    if (!ctx.permissions.includes('producer:update') && !ctx.permissions.includes('producer:update_assigned')) throw forbidden();
    if (ctx.organizationStatus !== 'ACTIVE') throw forbidden('ORGANIZATION_SUSPENDED', 'La organización está suspendida; no admite nuevas operaciones.');
    const { expected_version, ...rest } = dto;
    const patch = this.normalize(rest);
    if (Object.keys(patch).length === 0) throw conflict('NO_CHANGE', 'No hay cambios que guardar.');
    return this.db.transaction().execute(async (trx) => {
      const before = await this.load(trx, ctx, id, 'update', true);
      if (before.status === 'INACTIVE') throw conflict('PRODUCER_INACTIVE', 'El productor está dado de baja; reactívalo para editarlo.');
      if (Number(before.row_version) !== expected_version) {
        throw conflict('VERSION_CONFLICT', 'Otra persona modificó este productor. Recarga para ver la versión actual.');
      }
      const changed = (Object.keys(patch) as EditableField[]).filter((k) => patch[k] !== before[k]);
      if (changed.length === 0) throw conflict('NO_CHANGE', 'No hay cambios que guardar.');
      this.assertNames({ ...before, ...patch });
      let after: ProducerRow;
      try {
        after = await trx
          .updateTable('producers')
          .set({ ...patch, updated_by: user.id, updated_at: new Date(), row_version: sql`row_version + 1` } as never)
          .where('id', '=', id)
          .where('organization_id', '=', orgId)
          .returningAll()
          .executeTakeFirstOrThrow();
      } catch (e) {
        throw this.mapConstraint(e);
      }
      await this.recordVersion(trx, after, 'UPDATE', changed, user.id);
      // Eventos y auditoría: nombres de campos cambiados, nunca sus valores personales.
      await this.events.append(trx, {
        organizationId: orgId, eventType: 'ProducerUpdated', schemaVersion: 1, aggregateType: 'PRODUCER',
        aggregateId: id, aggregateVersion: Number(after.row_version), actorId: user.id, correlationId: requestId,
        payload: { changed_fields: changed },
      });
      await this.audit.record(trx, {
        organizationId: orgId, actorUserId: user.id, action: 'producer.update', entityType: 'producer', entityId: id,
        requestId, result: 'SUCCESS', after: { changed_fields: changed, version: Number(after.row_version) },
      });
      return this.view(after, ctx);
    });
  }

  async assign(user: AuthUser, orgId: string, id: string, dto: AssignDto, requestId?: string) {
    const ctx = await this.authz.require(user, orgId, 'producer:assign', { mutation: true });
    return this.db.transaction().execute(async (trx) => {
      const before = await this.load(trx, ctx, id, 'read', true);
      if (before.status === 'INACTIVE') throw conflict('PRODUCER_INACTIVE', 'El productor está dado de baja.');
      if (Number(before.row_version) !== dto.expected_version) throw conflict('VERSION_CONFLICT', 'Otra persona modificó este productor. Recarga.');
      if (before.assigned_membership_id === dto.membership_id) throw conflict('NO_CHANGE', 'Ese responsable ya está asignado.');
      if (dto.membership_id) await this.assertAssignee(trx, orgId, dto.membership_id);
      const after = await trx
        .updateTable('producers')
        .set({ assigned_membership_id: dto.membership_id, updated_by: user.id, updated_at: new Date(), row_version: sql`row_version + 1` })
        .where('id', '=', id).where('organization_id', '=', orgId)
        .returningAll().executeTakeFirstOrThrow();
      await this.recordVersion(trx, after, 'ASSIGN', ['assigned_membership_id'], user.id);
      await this.events.append(trx, {
        organizationId: orgId, eventType: 'ProducerAssigned', schemaVersion: 1, aggregateType: 'PRODUCER',
        aggregateId: id, aggregateVersion: Number(after.row_version), actorId: user.id, correlationId: requestId,
        payload: { from_membership_id: before.assigned_membership_id, to_membership_id: dto.membership_id },
      });
      await this.audit.record(trx, {
        organizationId: orgId, actorUserId: user.id, action: 'producer.assign', entityType: 'producer', entityId: id, requestId,
        result: 'SUCCESS', before: { assigned_membership_id: before.assigned_membership_id }, after: { assigned_membership_id: dto.membership_id },
      });
      return this.view(after, ctx);
    });
  }

  async changeStatus(user: AuthUser, orgId: string, id: string, target: ProducerStatus, dto: StatusDto, requestId?: string) {
    // Activar un borrador, dar de baja y reactivar son decisiones de gestión: producer:archive.
    const ctx = await this.authz.require(user, orgId, 'producer:archive', { mutation: true });
    return this.db.transaction().execute(async (trx) => {
      const before = await this.load(trx, ctx, id, 'read', true);
      if (Number(before.row_version) !== dto.expected_version) throw conflict('VERSION_CONFLICT', 'Otra persona modificó este productor. Recarga.');
      const allowed: Record<ProducerStatus, ProducerStatus[]> = { DRAFT: ['ACTIVE', 'INACTIVE'], ACTIVE: ['INACTIVE'], INACTIVE: ['ACTIVE'] };
      if (!allowed[before.status].includes(target)) throw conflict('INVALID_TRANSITION', 'Ese cambio de estado no está permitido.');
      const archiving = target === 'INACTIVE';
      const after = await trx
        .updateTable('producers')
        .set({
          status: target,
          deleted_at: archiving ? new Date() : null,
          deleted_by: archiving ? user.id : null,
          deletion_reason: archiving ? dto.reason : null,
          updated_by: user.id, updated_at: new Date(), row_version: sql`row_version + 1`,
        })
        .where('id', '=', id).where('organization_id', '=', orgId)
        .returningAll().executeTakeFirstOrThrow();
      await this.recordVersion(trx, after, archiving ? 'ARCHIVE' : 'ACTIVATE', ['status'], user.id, dto.reason);
      await this.events.append(trx, {
        organizationId: orgId, eventType: 'ProducerStatusChanged', schemaVersion: 1, aggregateType: 'PRODUCER',
        aggregateId: id, aggregateVersion: Number(after.row_version), actorId: user.id, correlationId: requestId,
        payload: { from_status: before.status, to_status: target },
      });
      await this.audit.record(trx, {
        organizationId: orgId, actorUserId: user.id, action: archiving ? 'producer.archive' : 'producer.activate',
        entityType: 'producer', entityId: id, requestId, result: 'SUCCESS', reason: dto.reason,
        before: { status: before.status }, after: { status: target },
      });
      return this.view(after, ctx);
    });
  }

  async history(user: AuthUser, orgId: string, id: string) {
    const ctx = await this.readContext(user, orgId);
    await this.load(this.db, ctx, id, 'read');
    const identity = ctx.permissions.includes('producer:read_identity');
    const rows = await this.db
      .selectFrom('producer_versions as v')
      .leftJoin('memberships as m', (j) => j.onRef('m.user_id', '=', 'v.changed_by').onRef('m.organization_id', '=', 'v.organization_id'))
      .leftJoin('users as u', 'u.id', 'm.user_id')
      .select(['v.version', 'v.change_type', 'v.changed_fields', 'v.snapshot', 'v.reason', 'v.changed_at', 'u.email as actor_email'])
      .where('v.organization_id', '=', orgId)
      .where('v.producer_id', '=', id)
      .orderBy('v.version', 'desc')
      .execute();
    return rows.map((r) => {
      const snap = { ...(r.snapshot as Record<string, unknown>) };
      if (!identity) for (const f of IDENTITY_FIELDS) delete snap[f];
      return {
        version: Number(r.version), change_type: r.change_type, changed_fields: r.changed_fields, reason: r.reason,
        changed_at: r.changed_at, actor: r.actor_email ?? 'PLATFORM', snapshot: snap, identity_visible: identity,
      };
    });
  }

  async summary(user: AuthUser, orgId: string) {
    await this.authz.require(user, orgId, 'producer:read', { mutation: false });
    const rows = await this.db.selectFrom('producer_status_counts').select(['status', 'producer_count']).where('organization_id', '=', orgId).execute();
    const counts = { DRAFT: 0, ACTIVE: 0, INACTIVE: 0 } as Record<ProducerStatus, number>;
    for (const r of rows) counts[r.status] = Number(r.producer_count);
    return { counts, consistency: 'EVENTUAL' };
  }
}

/** Proyección por eventos: productores por estado (S1 «producers_total»). Idempotente por recibo. */
export const producerStatusCountsConsumer: EventConsumer = {
  name: 'producer-status-counts',
  eventTypes: ['ProducerRegistered', 'ProducerStatusChanged'],
  async handle(trx, event) {
    const p = event.payload as { status?: ProducerStatus; from_status?: ProducerStatus; to_status?: ProducerStatus };
    const bump = async (status: ProducerStatus, delta: number) => {
      await trx
        .insertInto('producer_status_counts')
        .values({ organization_id: event.organization_id, status, producer_count: String(Math.max(delta, 0)) })
        .onConflict((oc) => oc.columns(['organization_id', 'status']).doUpdateSet({
          producer_count: sql`producer_status_counts.producer_count + ${delta}`,
        }))
        .execute();
    };
    if (event.event_type === 'ProducerRegistered' && p.status) await bump(p.status, 1);
    if (event.event_type === 'ProducerStatusChanged' && p.from_status && p.to_status) {
      await bump(p.from_status, -1);
      await bump(p.to_status, 1);
    }
  },
};

@ApiTags('producers')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/producers')
export class ProducersController {
  constructor(private readonly service: ProducersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: CreateProducerDto, @Req() req: AuthedRequest) {
    return this.service.create(user, orgId, dto, req.requestId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Query() q: ListQuery) {
    return this.service.list(user, orgId, q);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.summary(user, orgId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user, orgId, id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.history(user, orgId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProducerDto, @Req() req: AuthedRequest) {
    return this.service.update(user, orgId, id, dto, req.requestId);
  }

  @Put(':id/assignment')
  assign(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto, @Req() req: AuthedRequest) {
    return this.service.assign(user, orgId, id, dto, req.requestId);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @Req() req: AuthedRequest) {
    return this.service.changeStatus(user, orgId, id, 'INACTIVE', dto, req.requestId);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @Req() req: AuthedRequest) {
    return this.service.changeStatus(user, orgId, id, 'ACTIVE', dto, req.requestId);
  }
}
