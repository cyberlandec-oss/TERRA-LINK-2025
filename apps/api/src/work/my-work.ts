import { Controller, Get, Inject, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { notFound } from '../common/errors';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import type { Permission } from '../authz/catalog';
import { CurrentUser, type AuthUser } from '../auth/auth';

// P0-027 — Mi trabajo (UX_UI §11; QA-14). Tareas OBSERVABLES derivadas del dominio real, no un motor de tareas:
// cada tipo aparece solo si el rol puede COMPLETARLA (permiso de la acción) y solo cuenta registros dentro del alcance
// con que el módulo los muestra (organización completa o asignados). Nada de recursos ocultos: ni conteos ni ejemplos.
// Una tarea desaparece cuando el caso de uso del dominio la resuelve (p. ej. registrar el borrador).

interface TaskItem { id: string; label: string; href: string }
interface Task { code: string; title: string; reason: string; action: string; count: number; items: TaskItem[]; list_href: string }
const LIMIT = 5;

@Injectable()
export class MyWorkService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>, private readonly authz: AuthorizationService) {}

  private has(ctx: TenantContext, p: Permission) { return ctx.permissions.includes(p); }
  /** Alcance «todo / asignados / nada» sobre la columna de responsable del productor. */
  private scope(ctx: TenantContext, all: Permission, assigned: Permission | null, col: RawBuilder<unknown>) {
    if (this.has(ctx, all)) return sql<boolean>`TRUE`;
    if (assigned && this.has(ctx, assigned)) return sql<boolean>`${col} = ${ctx.membershipId}`;
    return null;
  }

  async myWork(user: AuthUser, orgId: string) {
    const ctx = await this.authz.tenantContext(user, orgId);
    if (!ctx) throw notFound();
    const base = `/organizaciones/${orgId}`;
    const tasks: Task[] = [];
    const active = ctx.organizationStatus === 'ACTIVE';
    const prAssignee = sql`pr.assigned_membership_id`;

    // 1) Borradores de entrega por completar y registrar (delivery:create / _assigned).
    const delWrite = this.scope(ctx, 'delivery:create', 'delivery:create_assigned', prAssignee);
    if (active && delWrite) {
      const rows = (await sql<{ id: string; delivery_code: string; producer_code: string; n: string }>`
        SELECT d.id, d.delivery_code, pr.producer_code, count(*) OVER ()::text AS n FROM deliveries d
        JOIN producers pr ON pr.id = d.producer_id AND pr.organization_id = d.organization_id
        WHERE d.organization_id = ${orgId} AND d.status = 'DRAFT' AND ${delWrite} ORDER BY d.created_at LIMIT ${LIMIT}`.execute(this.db)).rows;
      if (rows.length) tasks.push({ code: 'DELIVERY_DRAFTS', title: 'Entregas en borrador', reason: 'Borradores sin registrar: completa los datos obligatorios y regístralos.', action: 'Completar y registrar',
        count: Number(rows[0].n), items: rows.map((r) => ({ id: r.id, label: `${r.delivery_code} · ${r.producer_code}`, href: `${base}/entregas/${r.id}` })), list_href: `${base}/entregas?status=DRAFT` });
    }
    // 2) Entregas registradas sin ninguna recepción (reception:confirm, lectura de entregas).
    const delRead = this.scope(ctx, 'delivery:read', 'delivery:read_assigned', prAssignee);
    if (active && delRead && this.has(ctx, 'reception:confirm')) {
      const rows = (await sql<{ id: string; delivery_code: string; producer_code: string; n: string }>`
        SELECT d.id, d.delivery_code, pr.producer_code, count(*) OVER ()::text AS n FROM deliveries d
        JOIN producers pr ON pr.id = d.producer_id AND pr.organization_id = d.organization_id
        WHERE d.organization_id = ${orgId} AND d.status = 'REGISTERED' AND ${delRead}
          AND NOT EXISTS (SELECT 1 FROM receptions r WHERE r.delivery_id = d.id AND r.organization_id = d.organization_id)
        ORDER BY d.registered_at LIMIT ${LIMIT}`.execute(this.db)).rows;
      if (rows.length) tasks.push({ code: 'DELIVERIES_TO_RECEIVE', title: 'Entregas por recibir', reason: 'Registradas y sin recepción física.', action: 'Registrar recepción y pesaje',
        count: Number(rows[0].n), items: rows.map((r) => ({ id: r.id, label: `${r.delivery_code} · ${r.producer_code}`, href: `${base}/entregas/${r.id}` })), list_href: `${base}/entregas?reception=NOT_RECEIVED` });
    }
    // 3) Resultados de calidad sin decisión (quality:decide, lectura de entregas).
    if (active && delRead && this.has(ctx, 'quality:decide')) {
      const rows = (await sql<{ id: string; delivery_code: string; n: string }>`
        WITH pend AS (
          SELECT DISTINCT d.id, d.delivery_code FROM quality_results q
          JOIN quality_samples s ON s.id = q.sample_id AND s.organization_id = q.organization_id
          JOIN receptions r ON r.id = s.reception_id JOIN deliveries d ON d.id = r.delivery_id
          JOIN producers pr ON pr.id = d.producer_id AND pr.organization_id = d.organization_id
          WHERE q.organization_id = ${orgId} AND ${delRead} AND q.decision = 'PENDING'
            AND q.id = (SELECT q2.id FROM quality_results q2 WHERE q2.sample_id = q.sample_id ORDER BY q2.recorded_at DESC, q2.id DESC LIMIT 1))
        SELECT id, delivery_code, (SELECT count(*) FROM pend)::text AS n FROM pend ORDER BY delivery_code LIMIT ${LIMIT}`.execute(this.db)).rows;
      if (rows.length) tasks.push({ code: 'QUALITY_PENDING', title: 'Resultados de calidad pendientes de decisión', reason: 'Hay resultados registrados sin liberar ni rechazar.', action: 'Decidir calidad',
        count: Number(rows[0].n), items: rows.map((r) => ({ id: r.id, label: r.delivery_code, href: `${base}/entregas/${r.id}` })), list_href: `${base}/entregas` });
    }
    // 4) Posibles duplicados de productor por revisar (producer:review_duplicates).
    if (active && this.has(ctx, 'producer:review_duplicates')) {
      const n = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM producer_match_reviews WHERE organization_id = ${orgId} AND status = 'PENDING'`.execute(this.db)).rows[0].n;
      if (Number(n)) tasks.push({ code: 'DUPLICATE_REVIEWS', title: 'Posibles duplicados de productor', reason: 'Coincidencias de identidad pendientes de revisión (no se fusiona nada automáticamente).', action: 'Revisar',
        count: Number(n), items: [], list_href: `${base}/productores/coincidencias` });
    }
    // 5) Parcelas activas sin ubicación ni superficie (plot:update / _assigned).
    const plotWrite = this.scope(ctx, 'plot:update', 'plot:update_assigned', prAssignee);
    if (active && plotWrite) {
      const rows = (await sql<{ id: string; plot_code: string; n: string }>`
        SELECT p.id, p.plot_code, count(*) OVER ()::text AS n FROM plots p
        JOIN producers pr ON pr.id = p.producer_id AND pr.organization_id = p.organization_id
        WHERE p.organization_id = ${orgId} AND p.status = 'ACTIVE' AND p.current_version_id IS NULL AND ${plotWrite}
        ORDER BY p.plot_code LIMIT ${LIMIT}`.execute(this.db)).rows;
      if (rows.length) tasks.push({ code: 'PLOTS_WITHOUT_LOCATION', title: 'Parcelas sin ubicación ni superficie', reason: 'Falta registrar la ubicación o la superficie declarada.', action: 'Registrar',
        count: Number(rows[0].n), items: rows.map((r) => ({ id: r.id, label: r.plot_code, href: `${base}/parcelas/${r.id}` })), list_href: `${base}/parcelas?geometry=WITHOUT` });
    }
    // 6) Mitigaciones asignadas a mí, abiertas (mitigation:contribute).
    if (active && this.has(ctx, 'mitigation:contribute') && this.has(ctx, 'mitigation:read')) {
      const rows = (await sql<{ id: string; factor_code: string; lot_code: string; n: string }>`
        SELECT a.id, a.factor_code, l.lot_code, count(*) OVER ()::text AS n FROM mitigation_actions a JOIN lots l ON l.id = a.subject_id AND l.organization_id = a.organization_id
        WHERE a.organization_id = ${orgId} AND a.assignee_membership_id = ${ctx.membershipId} AND a.status = 'OPEN' ORDER BY a.created_at LIMIT ${LIMIT}`.execute(this.db)).rows;
      if (rows.length) tasks.push({ code: 'MITIGATIONS_ASSIGNED', title: 'Mitigaciones asignadas a ti', reason: 'Acciones abiertas: aporta los soportes y envíalas a verificación.', action: 'Aportar soportes',
        count: Number(rows[0].n), items: rows.map((r) => ({ id: r.id, label: `${r.lot_code} · ${r.factor_code}`, href: `${base}/mitigaciones/${r.id}` })), list_href: `${base}/mitigaciones?status=OPEN` });
    }
    // 7) Mitigaciones enviadas por otra persona, por verificar (mitigation:verify; separación de funciones).
    if (active && this.has(ctx, 'mitigation:verify') && this.has(ctx, 'mitigation:read')) {
      const rows = (await sql<{ id: string; factor_code: string; lot_code: string; n: string }>`
        SELECT a.id, a.factor_code, l.lot_code, count(*) OVER ()::text AS n FROM mitigation_actions a JOIN lots l ON l.id = a.subject_id AND l.organization_id = a.organization_id
        WHERE a.organization_id = ${orgId} AND a.status = 'SUBMITTED'
          AND NOT EXISTS (SELECT 1 FROM mitigation_submissions s WHERE s.action_id = a.id AND s.submitted_by = ${user.id})
        ORDER BY a.created_at LIMIT ${LIMIT}`.execute(this.db)).rows;
      if (rows.length) tasks.push({ code: 'MITIGATIONS_TO_VERIFY', title: 'Mitigaciones por verificar', reason: 'Enviadas por otra persona: verifica o rechaza con motivo.', action: 'Verificar',
        count: Number(rows[0].n), items: rows.map((r) => ({ id: r.id, label: `${r.lot_code} · ${r.factor_code}`, href: `${base}/mitigaciones/${r.id}` })), list_href: `${base}/mitigaciones?status=SUBMITTED` });
    }
    return {
      organization_id: orgId, organization_status: ctx.organizationStatus, generated_at: new Date().toISOString(), tasks,
      note: active ? 'Solo tareas que tu rol puede completar, dentro de tu alcance. Cada tarea desaparece cuando se resuelve en el dominio.' : 'La organización está suspendida: no hay tareas de escritura.',
    };
  }
}

@ApiTags('work')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId')
export class MyWorkController {
  constructor(private readonly service: MyWorkService) {}

  @Get('my-work')
  @ApiOperation({ summary: 'Mi trabajo: tareas observables del dominio que tu rol puede completar, dentro de tu alcance' })
  myWork(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.myWork(user, orgId);
  }
}
