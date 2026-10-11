import { Body, Controller, Get, Inject, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { conflict, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import type { Permission } from '../authz/catalog';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { EVENT_STORE, type EventStore } from '../events/events';
import { reconcile } from '../inventory/ledger';

// P0-020 Riesgo (RF-20, QA-10; docs/13). Evaluación técnica reproducible de un LOTE sobre su grafo de origen:
// - reglas del catálogo de sistema versionado (NO APROBADO): sin pesos, umbrales, puntuaciones ni severidades;
// - por factor: HIT / NOT_HIT / NOT_EVALUABLE con efecto, explicación, límite, fuente y referencias legibles;
// - dimensiones separadas: hallazgos técnicos · calidad de datos (no evaluable/faltantes) · resultado de riesgo
//   (severidad NOT_ASSESSED, conclusión UNDETERMINED: no hay perfil jurídico) · proceso de revisión humana;
// - un factor bloqueante NO se diluye: el resultado técnico se decide por precedencia, nunca por promedio;
// - faltantes/no evaluables nunca producen un resultado favorable (como mucho INCOMPLETE);
// - instantánea (versiones de datos y evidencias) con hash; reevaluar crea una versión nueva; una evaluación cuya
//   instantánea actual difiere queda STALE (no se modifica). TL_GIS_TECH no es análisis de deforestación.
// Alcance: las evaluaciones recorren datos de toda la organización; leerlas o crearlas exige lectura de organización
// completa (si no, 403), así no se revelan referencias, conteos ni razones de recursos ocultos.

type Db = Kysely<Database> | Transaction<Database>;
type Result = 'HIT' | 'NOT_HIT' | 'NOT_EVALUABLE';
interface Factor { code: string; category: string; result: Result; effect: string; explanation: string; limit: string; source: string; depends_on: string | null; reason: string; references: string[] }

class EvaluateDto {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiPropertyOptional({ description: 'Última evaluación conocida por quien solicita: si ya hay una posterior, se rechaza (un trabajo antiguo no pisa uno nuevo)' }) @IsOptional() @IsUUID() based_on_evaluation_id?: string;
}
class ReviewDto {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiProperty({ enum: ['START_REVIEW', 'RESOLVE'] }) @IsIn(['START_REVIEW', 'RESOLVE']) action!: 'START_REVIEW' | 'RESOLVE';
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
}

const CATEGORIES = ['DEFORESTATION', 'LEGALITY', 'MIXING', 'SUPPLY_CHAIN', 'DOCUMENT_CREDIBILITY', 'TRACEABILITY', 'EVASION', 'HUMAN_RIGHTS', 'INDIGENOUS_RIGHTS', 'DATA_QUALITY'];
const RESULT_LABEL: Record<string, string> = {
  BLOCKED: 'Bloqueado por un hallazgo', REVIEW_REQUIRED: 'Requiere revisión', INCOMPLETE: 'Incompleto: hay reglas no evaluables o datos faltantes',
  NO_FINDINGS_IN_EVALUATED_RULES: 'Sin hallazgos en las reglas evaluadas',
};
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);

@Injectable()
export class RiskService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async ctx(user: AuthUser, orgId: string, perm: Permission, mutation: boolean) {
    const ctx = await this.authz.tenantContext(user, orgId);
    if (!ctx) throw notFound();
    if (!ctx.permissions.includes(perm)) throw forbidden();
    const need: Permission[] = ['delivery:read', 'lot:read', 'plot:read', 'producer:read', 'document:read'];
    if (!need.every((p) => ctx.permissions.includes(p))) throw forbidden('PERMISSION_DENIED', 'Las evaluaciones de riesgo usan datos de toda la organización: requieren alcance de organización completo.');
    if (mutation && ctx.organizationStatus !== 'ACTIVE') throw forbidden('ORGANIZATION_SUSPENDED', 'La organización está suspendida; no admite nuevas operaciones.');
    return ctx;
  }

  private async currentRuleSet(db: Db) {
    const rs = (await sql<{ version: string; approval_status: string; notes: string }>`SELECT version, approval_status, notes FROM risk_rule_sets ORDER BY published_at DESC, version DESC LIMIT 1`.execute(db)).rows[0];
    const rules = (await sql<{ code: string; category: string; condition_kind: string; effect: string; explanation: string; limit_note: string; source: string; depends_on: string | null; inputs: string[]; evidence_required: string }>`
      SELECT code, category, condition_kind, effect, explanation, limit_note, source, depends_on, inputs, evidence_required FROM risk_rules WHERE rule_set_version = ${rs.version} ORDER BY code`.execute(db)).rows;
    return { ...rs, rules };
  }

  /** Instantánea del grafo de origen del lote: versiones de datos y evidencias usadas (sin valores personales ni coordenadas). */
  private async snapshot(db: Db, orgId: string, lotId: string) {
    const lot = (await sql<{ id: string; lot_code: string; origin_status: string; row_version: string }>`SELECT id, lot_code, origin_status, row_version::text FROM lots WHERE organization_id = ${orgId} AND id = ${lotId}`.execute(db)).rows[0];
    if (!lot) throw notFound();
    const lots = (await sql<{ id: string; lot_code: string; origin_status: string; row_version: string; source: string }>`
      WITH RECURSIVE up(id) AS (SELECT ${lotId}::uuid UNION SELECT e.parent_lot_id FROM lot_edges e JOIN up ON e.child_lot_id = up.id)
      SELECT l.id, l.lot_code, l.origin_status, l.row_version::text, l.source FROM up JOIN lots l ON l.id = up.id WHERE l.organization_id = ${orgId} ORDER BY l.lot_code`.execute(db)).rows;
    const receptions = (await sql<{ reception_id: string; lot_id: string; weighing_id: string; reception_version: number; delivery_id: string; delivery_code: string; delivery_version: string }>`
      SELECT i.reception_id, i.lot_id, i.weighing_id, i.reception_version, d.id AS delivery_id, d.delivery_code, d.row_version::text AS delivery_version
      FROM lot_inputs i JOIN receptions r ON r.id = i.reception_id JOIN deliveries d ON d.id = r.delivery_id
      WHERE i.lot_id = ANY(${lots.map((l) => l.id)}::uuid[]) AND NOT EXISTS (SELECT 1 FROM lot_input_releases x WHERE x.input_id = i.id) ORDER BY d.delivery_code, i.reception_id`.execute(db)).rows;
    const deliveryIds = [...new Set(receptions.map((r) => r.delivery_id))];
    const origins = deliveryIds.length ? (await sql<{ delivery_id: string; plot_id: string; plot_code: string; current_version_id: string | null; geometry_type: string | null; gis_evaluation_id: string | null; gis_status: string | null }>`
      SELECT o.delivery_id, p.id AS plot_id, p.plot_code, p.current_version_id, v.geometry_type,
             (SELECT g.id FROM gis_evaluations g WHERE g.plot_version_id = p.current_version_id ORDER BY g.evaluated_at DESC LIMIT 1) AS gis_evaluation_id,
             (SELECT g.status FROM gis_evaluations g WHERE g.plot_version_id = p.current_version_id ORDER BY g.evaluated_at DESC LIMIT 1) AS gis_status
      FROM delivery_origins o JOIN plots p ON p.id = o.plot_id LEFT JOIN plot_versions v ON v.id = p.current_version_id
      WHERE o.delivery_id = ANY(${deliveryIds}::uuid[]) ORDER BY p.plot_code`.execute(db)).rows : [];
    const supports = deliveryIds.length ? (await sql<{ delivery_id: string; document_version_id: string; expires_at: string | null; expired: boolean }>`
      SELECT s.delivery_id, s.document_version_id, v.expires_at::text, (v.expires_at IS NOT NULL AND v.expires_at < current_date) AS expired
      FROM delivery_supports s JOIN document_versions v ON v.id = s.document_version_id
      WHERE s.delivery_id = ANY(${deliveryIds}::uuid[]) AND NOT EXISTS (SELECT 1 FROM delivery_support_withdrawals w WHERE w.support_id = s.id) ORDER BY s.document_version_id`.execute(db)).rows : [];
    const corrections = deliveryIds.length ? (await sql<{ delivery_id: string; n: number }>`SELECT delivery_id, count(*)::int AS n FROM delivery_corrections WHERE delivery_id = ANY(${deliveryIds}::uuid[]) GROUP BY delivery_id`.execute(db)).rows : [];
    const rec = await reconcile(db, orgId);
    const lotIds = new Set(lots.map((l) => l.id));
    const recIds = new Set(receptions.map((r) => r.reception_id));
    const ledgerDiffs = rec.differences.filter((d) => lotIds.has(d.id) || recIds.has(d.id)).map((d) => ({ kind: d.kind, id: d.id }));
    const mitigations = (await sql<{ id: string; factor_code: string; status: string; row_version: string }>`
      SELECT id, factor_code, status, row_version::text FROM mitigation_actions WHERE organization_id = ${orgId} AND subject_id = ${lotId} ORDER BY created_at, id`.execute(db)).rows;
    return { lot: { id: lot.id, code: lot.lot_code, origin_status: lot.origin_status }, lots, receptions, origins, supports, corrections, ledger_differences: ledgerDiffs, mitigations };
  }

  private evaluateRules(rules: Awaited<ReturnType<RiskService['currentRuleSet']>>['rules'], s: Awaited<ReturnType<RiskService['snapshot']>>): Factor[] {
    const base = (r: (typeof rules)[number]) => ({ code: r.code, category: r.category, effect: r.effect, explanation: r.explanation, limit: r.limit_note, source: r.source, depends_on: r.depends_on });
    const deliveries = [...new Map(s.receptions.map((r) => [r.delivery_id, r.delivery_code])).entries()];
    return rules.map((r): Factor => {
      const f = base(r);
      if (r.depends_on) return { ...f, result: 'NOT_EVALUABLE', reason: `Depende de ${r.depends_on}: no puede evaluarse. ${r.limit_note}`, references: [] };
      switch (r.condition_kind) {
        case 'delivery_without_origin': {
          if (!deliveries.length) return { ...f, result: 'NOT_EVALUABLE', reason: 'El lote no tiene entregas de origen en su grafo: no hay datos que evaluar.', references: [] };
          const missing = deliveries.filter(([id]) => !s.origins.some((o) => o.delivery_id === id)).map(([, code]) => code);
          return missing.length ? { ...f, result: 'HIT', reason: `${missing.length} entrega(s) sin parcela de origen declarada.`, references: missing } : { ...f, result: 'NOT_HIT', reason: 'Todas las entregas de origen declaran parcela.', references: deliveries.map(([, c]) => c) };
        }
        case 'lot_origin_incomplete':
          return s.lots.some((l) => l.origin_status === 'INCOMPLETE') ? { ...f, result: 'HIT', reason: 'El lote (o un lote de su grafo) está marcado «Origen incompleto».', references: s.lots.filter((l) => l.origin_status === 'INCOMPLETE').map((l) => l.lot_code) }
            : { ...f, result: 'NOT_HIT', reason: 'Todos los lotes del grafo declaran origen.', references: [] };
        case 'plot_geometry_technically_invalid': {
          if (!s.origins.length) return { ...f, result: 'NOT_EVALUABLE', reason: 'Sin parcelas de origen declaradas: no hay geometría que evaluar.', references: [] };
          const invalid = s.origins.filter((o) => o.gis_status === 'INVALID').map((o) => o.plot_code);
          const unknown = s.origins.filter((o) => !o.geometry_type || !o.gis_evaluation_id).map((o) => o.plot_code);
          if (invalid.length) return { ...f, result: 'HIT', reason: `Geometría técnicamente inválida en ${invalid.length} parcela(s).`, references: invalid };
          if (unknown.length) return { ...f, result: 'NOT_EVALUABLE', reason: `Parcela(s) sin geometría vigente o sin evaluación técnica: no se presume válida.`, references: unknown };
          return { ...f, result: 'NOT_HIT', reason: 'Las geometrías vigentes no tienen invalidez técnica (TL_GIS_TECH). No es análisis de deforestación.', references: s.origins.map((o) => o.plot_code) };
        }
        case 'support_expired': {
          if (!s.supports.length) return { ...f, result: 'NOT_EVALUABLE', reason: 'Las entregas de origen no tienen soportes documentales: evidencia insuficiente, no se presume vigente.', references: [] };
          const expired = s.supports.filter((x) => x.expired);
          const codes = [...new Set(expired.map((x) => s.receptions.find((r) => r.delivery_id === x.delivery_id)?.delivery_code ?? ''))];
          return expired.length ? { ...f, result: 'HIT', reason: `${expired.length} soporte(s) vencido(s).`, references: codes } : { ...f, result: 'NOT_HIT', reason: 'Los soportes vinculados no están vencidos (no prueba autenticidad ni validez jurídica).', references: [] };
        }
        case 'ledger_reconciliation':
          return s.ledger_differences.length ? { ...f, result: 'HIT', reason: `${s.ledger_differences.length} diferencia(s) entre el ledger y el dominio en el grafo.`, references: s.lots.filter((l) => s.ledger_differences.some((d) => d.id === l.id)).map((l) => l.lot_code) }
            : { ...f, result: 'NOT_HIT', reason: 'El ledger concilia en los lotes y recepciones del grafo.', references: [] };
        case 'mitigation_status': {
          if (!s.mitigations.length) return { ...f, result: 'NOT_HIT', reason: 'El sujeto no tiene mitigaciones abiertas.', references: [] };
          const pending = s.mitigations.filter((m) => m.status !== 'VERIFIED');
          return pending.length ? { ...f, result: 'HIT', reason: `${pending.length} mitigación(es) sin verificar.`, references: [...new Set(pending.map((m) => m.factor_code))] }
            : { ...f, result: 'NOT_HIT', reason: 'Las mitigaciones están verificadas. Verificar no resuelve por sí solo las causas: cada regla se vuelve a evaluar con los datos actuales.', references: [] };
        }
        default:
          return { ...f, result: 'NOT_EVALUABLE', reason: 'Condición no implementada: no se presume resultado.', references: [] };
      }
    });
  }

  /** Resultado técnico por precedencia (un bloqueante no se diluye); faltantes nunca dan un resultado favorable. */
  private technicalResult(factors: Factor[]) {
    if (factors.some((f) => f.result === 'HIT' && f.effect === 'BLOCKING')) return 'BLOCKED';
    if (factors.some((f) => f.result === 'HIT')) return 'REVIEW_REQUIRED';
    if (factors.some((f) => f.result === 'NOT_EVALUABLE')) return 'INCOMPLETE';
    return 'NO_FINDINGS_IN_EVALUATED_RULES';
  }

  async evaluate(user: AuthUser, orgId: string, lotId: string, dto: EvaluateDto, requestId?: string) {
    const ctx = await this.ctx(user, orgId, 'risk:evaluate', true);
    const prior = await this.db.selectFrom('risk_evaluations').select(['id', 'subject_id']).where('organization_id', '=', orgId).where('operation_id', '=', dto.operation_id).executeTakeFirst();
    if (prior) {
      if (prior.subject_id !== lotId) throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó con otro contenido.');
      return { replayed: true, evaluation: await this.view(this.db, ctx, prior.id) };
    }
    const id = await this.db.transaction().execute((trx) => this.evaluateInTrx(trx, { orgId, lotId, actorId: user.id, operationId: dto.operation_id, requestId, basedOn: dto.based_on_evaluation_id ?? null, trigger: null }));
    return { replayed: false, evaluation: await this.view(this.db, ctx, id) };
  }

  /**
   * Núcleo de la evaluación dentro de una transacción (lo usan la API y el consumidor de reevaluación del outbox).
   * Bloqueo por sujeto + número creciente: un trabajo basado en una evaluación vieja se rechaza (`basedOn`).
   */
  async evaluateInTrx(trx: Transaction<Database>, p: { orgId: string; lotId: string; actorId: string; operationId: string; requestId?: string; basedOn: string | null; trigger: Record<string, unknown> | null }) {
    const { orgId, lotId } = p;
    await sql`SELECT pg_advisory_xact_lock(hashtext(${'risk:' + lotId}))`.execute(trx);
    const last = (await sql<{ id: string; n: number }>`SELECT id, evaluation_number AS n FROM risk_evaluations WHERE organization_id = ${orgId} AND subject_id = ${lotId} ORDER BY evaluation_number DESC LIMIT 1`.execute(trx)).rows[0];
    if (p.basedOn && last && last.id !== p.basedOn) throw conflict('STALE_BASE', 'Ya existe una evaluación posterior a la que conocías: recarga antes de reevaluar (un trabajo antiguo no reemplaza uno nuevo).');
    const rs = await this.currentRuleSet(trx);
    const snap = await this.snapshot(trx, orgId, lotId);
    const factors = this.evaluateRules(rs.rules, snap);
    const technical = this.technicalResult(factors);
    const categories = CATEGORIES.map((c) => {
      const fs = factors.filter((f) => f.category === c);
      return { category: c, rules: fs.length, status: !fs.length ? 'NO_RULES' : fs.some((f) => f.result === 'HIT') ? 'FINDINGS' : fs.some((f) => f.result === 'NOT_EVALUABLE') ? 'NOT_ASSESSED' : 'NO_FINDINGS',
        note: !fs.length ? 'Sin reglas en las fuentes del proyecto: no evaluada (requiere perfil aprobado).' : null };
    });
    const hash = createHash('sha256').update(canonical(snap)).digest('hex');
    const eid = randomUUID();
    await trx.insertInto('risk_evaluations').values({
      id: eid, organization_id: orgId, subject_type: 'LOT', subject_id: lotId, evaluation_number: (last?.n ?? 0) + 1, rule_set_version: rs.version,
      parameters: JSON.stringify({ weights: null, thresholds: null, note: 'Sin pesos ni umbrales aprobados' }), snapshot: JSON.stringify(snap), snapshot_hash: hash,
      factors: JSON.stringify(factors), categories: JSON.stringify(categories), technical_result: technical, severity: 'NOT_ASSESSED', conclusion: 'UNDETERMINED', evaluated_by: p.actorId, operation_id: p.operationId,
      trigger: p.trigger ? JSON.stringify(p.trigger) : null,
    }).execute();
    await this.events.append(trx, { organizationId: orgId, eventType: 'RiskEvaluationRecorded', schemaVersion: 1, aggregateType: 'RISK_SUBJECT', aggregateId: lotId, aggregateVersion: (last?.n ?? 0) + 1, actorId: p.actorId, correlationId: p.requestId,
      payload: { evaluation_id: eid, subject_type: 'LOT', subject_id: lotId, rule_set_version: rs.version, snapshot_hash: hash, technical_result: technical, severity: 'NOT_ASSESSED', conclusion: 'UNDETERMINED',
        trigger: p.trigger, factors: factors.map((f) => ({ code: f.code, result: f.result })) } });
    await this.audit.record(trx, { organizationId: orgId, actorUserId: p.actorId, action: p.trigger ? 'risk.reevaluate_after_mitigation' : 'risk.evaluate', entityType: 'lot', entityId: lotId, requestId: p.requestId, result: 'SUCCESS',
      after: { code: snap.lot.code, reason: `${technical}; reglas ${rs.version} (no aprobadas)` } });
    return eid;
  }

  async review(user: AuthUser, orgId: string, evaluationId: string, dto: ReviewDto, requestId?: string) {
    const ctx = await this.ctx(user, orgId, 'risk:review', true);
    const prior = await this.db.selectFrom('risk_reviews').select(['evaluation_id', 'action']).where('organization_id', '=', orgId).where('operation_id', '=', dto.operation_id).executeTakeFirst();
    if (prior) {
      if (prior.evaluation_id !== evaluationId || prior.action !== dto.action) throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó con otro contenido.');
      return { replayed: true, evaluation: await this.view(this.db, ctx, evaluationId) };
    }
    await this.db.transaction().execute(async (trx) => {
      const e = (await sql<{ id: string; subject_id: string }>`SELECT id, subject_id FROM risk_evaluations WHERE organization_id = ${orgId} AND id = ${evaluationId} FOR UPDATE`.execute(trx)).rows[0];
      if (!e) throw notFound();
      const done = (await sql<{ action: string }>`SELECT action FROM risk_reviews WHERE evaluation_id = ${evaluationId}`.execute(trx)).rows.map((r) => r.action);
      if (dto.action === 'START_REVIEW' && done.length) throw conflict('INVALID_TRANSITION', 'La revisión ya se inició.');
      if (dto.action === 'RESOLVE' && !done.includes('START_REVIEW')) throw conflict('INVALID_TRANSITION', 'Inicia la revisión antes de resolverla.');
      if (dto.action === 'RESOLVE' && done.includes('RESOLVE')) throw conflict('INVALID_TRANSITION', 'La revisión ya está resuelta.');
      // docs/13 MITIGATION_UNVERIFIED: bloqueo de cierre de revisión mientras haya mitigaciones sin verificar.
      if (dto.action === 'RESOLVE') {
        const open = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM mitigation_actions WHERE organization_id = ${orgId} AND subject_id = ${e.subject_id} AND status <> 'VERIFIED'`.execute(trx)).rows[0].n;
        if (open > 0) throw conflict('MITIGATION_UNVERIFIED', 'Hay mitigaciones sin verificar para este lote: la revisión no puede resolverse todavía.');
      }
      await trx.insertInto('risk_reviews').values({ id: randomUUID(), organization_id: orgId, evaluation_id: evaluationId, action: dto.action, reason: dto.reason.trim(), reviewer_id: user.id, operation_id: dto.operation_id }).execute();
      await this.audit.record(trx, { organizationId: orgId, actorUserId: user.id, action: `risk.${dto.action.toLowerCase()}`, entityType: 'lot', entityId: e.subject_id, requestId, result: 'SUCCESS', after: { reason: dto.reason.trim() } });
    });
    return { replayed: false, evaluation: await this.view(this.db, ctx, evaluationId) };
  }

  private async view(db: Db, ctx: TenantContext, id: string) {
    const e = (await sql<{ trigger: unknown; id: string; subject_id: string; evaluation_number: number; rule_set_version: string; parameters: unknown; snapshot: { lot: { code: string } }; snapshot_hash: string; factors: Factor[]; categories: unknown;
      technical_result: string; severity: string; conclusion: string; evaluated_at: string; first_name: string | null; last_name: string | null; approval_status: string }>`
      SELECT e.trigger, e.id, e.subject_id, e.evaluation_number, e.rule_set_version, e.parameters, e.snapshot, e.snapshot_hash, e.factors, e.categories, e.technical_result, e.severity, e.conclusion, e.evaluated_at,
             u.first_name, u.last_name, rs.approval_status
      FROM risk_evaluations e LEFT JOIN users u ON u.id = e.evaluated_by JOIN risk_rule_sets rs ON rs.version = e.rule_set_version
      WHERE e.organization_id = ${ctx.organizationId} AND e.id = ${id}`.execute(db)).rows[0];
    if (!e) throw notFound();
    const latest = (await sql<{ id: string }>`SELECT id FROM risk_evaluations WHERE organization_id = ${ctx.organizationId} AND subject_id = ${e.subject_id} ORDER BY evaluation_number DESC LIMIT 1`.execute(db)).rows[0];
    const current = createHash('sha256').update(canonical(await this.snapshot(db, ctx.organizationId, e.subject_id))).digest('hex');
    const rs = await this.currentRuleSet(db);
    const stale = current !== e.snapshot_hash || rs.version !== e.rule_set_version;
    const reviews = (await sql<{ action: string; reason: string; reviewed_at: string; first_name: string | null; last_name: string | null }>`
      SELECT r.action, r.reason, r.reviewed_at, u.first_name, u.last_name FROM risk_reviews r LEFT JOIN users u ON u.id = r.reviewer_id WHERE r.evaluation_id = ${id} ORDER BY r.reviewed_at`.execute(db)).rows;
    const process = reviews.some((r) => r.action === 'RESOLVE') ? 'RESOLVED' : reviews.length ? 'UNDER_REVIEW' : 'OPEN';
    const findings = e.factors.filter((f) => f.result === 'HIT');
    const notEvaluable = e.factors.filter((f) => f.result === 'NOT_EVALUABLE');
    return {
      id: e.id, subject: { type: 'LOT', id: e.subject_id, code: e.snapshot.lot.code }, evaluation_number: e.evaluation_number, is_latest: latest.id === e.id,
      freshness: { status: stale ? 'STALE' : 'CURRENT', reason: stale ? (rs.version !== e.rule_set_version ? 'Hay una versión de reglas más reciente.' : 'Cambiaron datos o evidencias del grafo de origen desde esta evaluación: reevalúa (esta evaluación no se modifica).') : null },
      rules: { version: e.rule_set_version, approval_status: e.approval_status, note: 'Reglas técnicas de docs/13 sin aprobación: sin pesos, umbrales ni severidades.' },
      parameters: e.parameters, snapshot: { hash: e.snapshot_hash, data: e.snapshot },
      technical_findings: findings, data_quality: notEvaluable,
      factors: e.factors, categories: e.categories,
      technical_result: { status: e.technical_result, label: RESULT_LABEL[e.technical_result] },
      risk_result: { severity: e.severity, conclusion: e.conclusion, note: 'Severidad NOT_ASSESSED y conclusión UNDETERMINED: no hay perfil jurídico ni pesos aprobados. Un resultado técnico no es conclusión regulatoria ni cumplimiento EUDR.' },
      review: { process_status: process, history: reviews.map((r) => ({ action: r.action, reason: r.reason, at: r.reviewed_at, reviewer: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Miembro' })),
        note: 'La revisión humana registra el trabajo (iniciar, resolver con motivo). Resolver no cambia la evaluación ni la vuelve favorable; mitigaciones: P0-021.' },
      trigger: e.trigger,
      evaluated_at: e.evaluated_at, evaluated_by: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Miembro',
      actions: { reevaluate: ctx.permissions.includes('risk:evaluate'), review: ctx.permissions.includes('risk:review') && process !== 'RESOLVED' },
    };
  }

  async evaluation(user: AuthUser, orgId: string, id: string) {
    const ctx = await this.ctx(user, orgId, 'risk:read', false);
    return this.view(this.db, ctx, id);
  }

  async lotRisk(user: AuthUser, orgId: string, lotId: string) {
    const ctx = await this.ctx(user, orgId, 'risk:read', false);
    const lot = await this.db.selectFrom('lots').select(['id', 'lot_code']).where('organization_id', '=', orgId).where('id', '=', lotId).executeTakeFirst();
    if (!lot) throw notFound();
    const evals = (await sql<{ id: string }>`SELECT id FROM risk_evaluations WHERE organization_id = ${orgId} AND subject_id = ${lotId} ORDER BY evaluation_number DESC`.execute(this.db)).rows;
    const versions = [];
    for (const e of evals) versions.push(await this.view(this.db, ctx, e.id));
    const rs = await this.currentRuleSet(this.db);
    return { lot, latest: versions[0] ?? null, history: versions.map((v) => ({ id: v.id, evaluation_number: v.evaluation_number, technical_result: v.technical_result, freshness: v.freshness, evaluated_at: v.evaluated_at, evaluated_by: v.evaluated_by, process_status: v.review.process_status })),
      rule_set: { version: rs.version, approval_status: rs.approval_status, notes: rs.notes, rules: rs.rules },
      can_evaluate: ctx.permissions.includes('risk:evaluate') };
  }

  async list(user: AuthUser, orgId: string) {
    const ctx = await this.ctx(user, orgId, 'risk:read', false);
    const rows = (await sql<{ lot_id: string; lot_code: string; product: string; evaluation_id: string | null; technical_result: string | null; evaluated_at: string | null }>`
      SELECT l.id AS lot_id, l.lot_code, p.name AS product, e.id AS evaluation_id, e.technical_result, e.evaluated_at
      FROM lots l JOIN products p ON p.id = l.product_id
      LEFT JOIN LATERAL (SELECT id, technical_result, evaluated_at FROM risk_evaluations x WHERE x.subject_id = l.id ORDER BY x.evaluation_number DESC LIMIT 1) e ON TRUE
      WHERE l.organization_id = ${ctx.organizationId} ORDER BY l.lot_code`.execute(this.db)).rows;
    const out = [];
    for (const r of rows) out.push({ ...r, technical_label: r.technical_result ? RESULT_LABEL[r.technical_result] : 'Sin evaluar', freshness: r.evaluation_id ? (await this.view(this.db, ctx, r.evaluation_id)).freshness.status : null });
    return out;
  }
}

@ApiTags('risk')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId')
export class RiskController {
  constructor(private readonly service: RiskService) {}

  @Get('risk/lots') list(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string) { return this.service.list(u, o); }
  @Get('risk/lots/:lotId') lot(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('lotId', ParseUUIDPipe) l: string) { return this.service.lotRisk(u, o, l); }
  @Post('risk/lots/:lotId/evaluations') evaluate(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('lotId', ParseUUIDPipe) l: string, @Body() dto: EvaluateDto, @Req() req: AuthedRequest) { return this.service.evaluate(u, o, l, dto, req.requestId); }
  @Get('risk/evaluations/:id') evaluation(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.evaluation(u, o, id); }
  @Post('risk/evaluations/:id/reviews') review(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto, @Req() req: AuthedRequest) { return this.service.review(u, o, id, dto, req.requestId); }
}
