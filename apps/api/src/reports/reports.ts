import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Kysely, sql } from 'kysely';
import { createHash } from 'crypto';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import type { Permission } from '../authz/catalog';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { forbidden, notFound } from '../common/errors';
import { csvCell } from '../audit/audit-query';
import { ReportPeriodDto } from './reports.dto';

// P0-030 Reportes e indicadores (S1 §60 «construir los indicadores desde queries reales»; RF-30; QA-13/14).
// Contrato completo, con definición, unidad, fecha usada y denominador de cada KPI: docs/decisiones/P0-030-REPORTES.md.
//
// Tres reglas gobiernan este módulo:
//  1. `report:read` abre la pantalla, NO los datos: cada indicador exige el permiso de su dominio. Sin él sale
//     RESTRICTED, sin valor ni conteo, y ningún indicador agrega sobre dominios ajenos: no se deduce lo oculto.
//  2. Ausencia de capacidad no es cero. Si la condición no es evaluable (GIS sin D-05, riesgo NOT_ASSESSED), el
//     indicador sale NOT_CALCULABLE con su motivo, nunca como 0 — que se leería como resultado favorable.
//  3. Denominador cero produce NOT_CALCULABLE, nunca 0 % ni 100 %.
export const REPORT_EXPORT_FORMAT = 'TL_REPORT_CSV 0.1 (provisional)';
export const REPORT_CATALOG_VERSION = '2026-10-14.1';

/** Estado de un indicador. RESTRICTED y NOT_CALCULABLE nunca llevan valor. */
type Status = 'OK' | 'NOT_CALCULABLE' | 'RESTRICTED';
/** E: estado actual · A: actividad en un período · S: saldo a una fecha (ningún KPI de la fuente lo es hoy). */
type Kind = 'STATE' | 'ACTIVITY' | 'BALANCE_AT';

interface Indicator {
  code: string;
  name: string;
  definition: string;
  unit: 'count' | 'percent';
  kind: Kind;
  date_basis: string | null;
  requires: Permission;
  status: Status;
  value: string | null;
  numerator: number | null;
  denominator: number | null;
  reason: string | null;
}

const PERIOD_NOTE = 'Indicador de estado actual: el período no se aplica. No se filtra por `created_at`, que es la fecha de carga y no una fecha operativa.';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/reports')
export class ReportsController {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async ctx(user: AuthUser, orgId: string, perm: Permission) {
    const ctx = await this.authz.tenantContext(user, orgId);
    if (!ctx) throw notFound();
    if (!ctx.permissions.includes(perm)) throw forbidden();
    return ctx;
  }

  /** Cálculo único: la pantalla y la exportación leen de aquí, así lo exportado coincide con lo mostrado. */
  async compute(ctx: TenantContext, period: { from: string | null; to: string | null }) {
    const org = ctx.organizationId;
    const has = (p: Permission) => ctx.permissions.includes(p);
    const one = async (q: ReturnType<typeof sql<{ n: string }>>) => Number((await q.execute(this.db)).rows[0]?.n ?? 0);

    const out: Indicator[] = [];
    const push = (i: Indicator) => out.push(i);
    /** Un indicador sin el permiso de su dominio: sin valor, sin numerador, sin denominador y sin conteo. */
    const restricted = (base: Omit<Indicator, 'status' | 'value' | 'numerator' | 'denominator' | 'reason'>) =>
      push({ ...base, status: 'RESTRICTED', value: null, numerator: null, denominator: null,
        reason: `Tu rol no permite leer este dominio (${base.requires}). El indicador no se calcula ni se informa parcialmente.` });
    const ratio = (num: number, den: number) => (den === 0 ? null : ((num * 100) / den).toFixed(1));

    // ---- Productores (estado) ----
    const b1 = { code: 'producers_total', name: 'Productores', definition: 'Productores del tenant no dados de baja (deleted_at nulo).', unit: 'count' as const, kind: 'STATE' as const, date_basis: null, requires: 'producer:read' as Permission };
    if (!has('producer:read')) restricted(b1);
    else {
      const n = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM producers WHERE organization_id = ${org} AND deleted_at IS NULL`);
      push({ ...b1, status: 'OK', value: String(n), numerator: n, denominator: null, reason: PERIOD_NOTE });
    }

    // ---- Parcelas (estado) ----
    const b2 = { code: 'plots_total', name: 'Parcelas', definition: 'Parcelas del tenant no dadas de baja (deleted_at nulo).', unit: 'count' as const, kind: 'STATE' as const, date_basis: null, requires: 'plot:read' as Permission };
    if (!has('plot:read')) restricted(b2);
    else {
      const n = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM plots WHERE organization_id = ${org} AND deleted_at IS NULL`);
      push({ ...b2, status: 'OK', value: String(n), numerator: n, denominator: null, reason: PERIOD_NOTE });
    }

    // ---- Parcelas válidas (estado) — bloqueado por D-05 ----
    const b3 = { code: 'plots_valid', name: 'Parcelas válidas (GIS)', definition: 'Parcelas cuya versión vigente tiene validation_status = VALID, sobre las parcelas con versión vigente.', unit: 'count' as const, kind: 'STATE' as const, date_basis: null, requires: 'plot:read' as Permission };
    if (!has('plot:read')) restricted(b3);
    else {
      // Se consulta de verdad: si algún día hubiera versiones VALID, el motivo deja de aplicarse y el fallo se ve.
      const evaluadas = await one(sql<{ n: string }>`
        SELECT count(*)::text AS n FROM plots p JOIN plot_versions v ON v.id = p.current_version_id
        WHERE p.organization_id = ${org} AND p.deleted_at IS NULL AND v.validation_status <> 'NOT_VALIDATED'`);
      push({ ...b3, status: evaluadas === 0 ? 'NOT_CALCULABLE' : 'OK',
        value: evaluadas === 0 ? null : String(await one(sql<{ n: string }>`
          SELECT count(*)::text AS n FROM plots p JOIN plot_versions v ON v.id = p.current_version_id
          WHERE p.organization_id = ${org} AND p.deleted_at IS NULL AND v.validation_status = 'VALID'`)),
        numerator: null, denominator: evaluadas === 0 ? 0 : evaluadas,
        reason: evaluadas === 0
          ? 'Ninguna versión geométrica ha sido evaluada: la validación GIS exige el umbral y el perfil de destino de D-05, sin aprobar (P0-010). «0 válidas» insinuaría que ninguna parcela cumple, cuando lo cierto es que ninguna ha sido evaluada.'
          : PERIOD_NOTE });
    }

    // ---- Entregas registradas (ACTIVIDAD, por delivery_date) ----
    const b4 = { code: 'deliveries_total', name: 'Entregas registradas', definition: 'Entregas en estado REGISTERED cuya fecha declarada de entrega cae dentro del período.', unit: 'count' as const, kind: 'ACTIVITY' as const, date_basis: 'deliveries.delivery_date (fecha declarada; nunca created_at)', requires: 'delivery:read' as Permission };
    if (!has('delivery:read')) restricted(b4);
    else {
      const n = await one(sql<{ n: string }>`
        SELECT count(*)::text AS n FROM deliveries
        WHERE organization_id = ${org} AND status = 'REGISTERED' AND delivery_date IS NOT NULL
          AND (${period.from}::date IS NULL OR delivery_date >= ${period.from}::date)
          AND (${period.to}::date IS NULL OR delivery_date <= ${period.to}::date)`);
      const borradores = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM deliveries WHERE organization_id = ${org} AND status = 'DRAFT'`);
      push({ ...b4, status: 'OK', value: String(n), numerator: n, denominator: null,
        reason: `Los borradores quedan fuera: no tienen fecha ni cantidad declaradas (${borradores} en el tenant, sin período).` });
    }

    // ---- Lotes activos (estado) ----
    const b5 = { code: 'lots_active', name: 'Lotes activos', definition: 'Lotes en estado OPEN o CLOSED_FOR_INPUT.', unit: 'count' as const, kind: 'STATE' as const, date_basis: null, requires: 'lot:read' as Permission };
    const lotesTotal = has('lot:read') ? await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM lots WHERE organization_id = ${org}`) : 0;
    if (!has('lot:read')) restricted(b5);
    else {
      const n = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM lots WHERE organization_id = ${org} AND status IN ('OPEN','CLOSED_FOR_INPUT')`);
      push({ ...b5, status: 'OK', value: String(n), numerator: n, denominator: null, reason: PERIOD_NOTE });
    }

    // ---- Completitud de trazabilidad (estado, %) ----
    const b6 = { code: 'traceability_completeness', name: 'Completitud de trazabilidad', definition: 'Lotes con origin_status = COMPLETE ÷ lotes del tenant. Mide origen declarado completo; no es verificación ni conformidad.', unit: 'percent' as const, kind: 'STATE' as const, date_basis: null, requires: 'lot:read' as Permission };
    if (!has('lot:read')) restricted(b6);
    else {
      const num = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM lots WHERE organization_id = ${org} AND origin_status = 'COMPLETE'`);
      const v = ratio(num, lotesTotal);
      push({ ...b6, status: v === null ? 'NOT_CALCULABLE' : 'OK', value: v, numerator: num, denominator: lotesTotal,
        reason: v === null ? 'Sin lotes en el tenant: el denominador es cero y el porcentaje no es calculable. No es 0 % ni 100 %.' : 'Origen declarado completo. No acredita verificación de campo ni conformidad EUDR.' });
    }

    // ---- Riesgo por severidad (estado) — bloqueado por diseño de P0-020 ----
    const evaluados = has('risk:read')
      ? await one(sql<{ n: string }>`SELECT count(DISTINCT subject_id)::text AS n FROM risk_evaluations WHERE organization_id = ${org}`) : 0;
    const sinEvaluar = has('risk:read')
      ? await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM risk_evaluations WHERE organization_id = ${org} AND severity = 'NOT_ASSESSED'`) : 0;
    for (const [code, sev, label] of [['risk_high', 'HIGH', 'alto'], ['risk_medium', 'MEDIUM', 'medio'], ['risk_low', 'LOW', 'bajo']] as const) {
      const b = { code, name: `Lotes de riesgo ${label}`, definition: `Lotes cuya última evaluación tiene severity = ${sev}, sobre los lotes evaluados.`, unit: 'count' as const, kind: 'STATE' as const, date_basis: null, requires: 'risk:read' as Permission };
      if (!has('risk:read')) { restricted(b); continue; }
      const conSeveridad = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM risk_evaluations WHERE organization_id = ${org} AND severity <> 'NOT_ASSESSED'`);
      push({ ...b, status: conSeveridad === 0 ? 'NOT_CALCULABLE' : 'OK',
        value: conSeveridad === 0 ? null : String(await one(sql<{ n: string }>`SELECT count(DISTINCT subject_id)::text AS n FROM risk_evaluations WHERE organization_id = ${org} AND severity = ${sev}`)),
        numerator: null, denominator: conSeveridad === 0 ? 0 : evaluados,
        reason: conSeveridad === 0
          ? `Ninguna evaluación tiene severidad asignada (${sinEvaluar} con NOT_ASSESSED de ${evaluados} sujeto(s) evaluado(s)): el motor devuelve NOT_ASSESSED por diseño mientras D-05, el proveedor satelital (P0-028) y las mitigaciones (P0-021) no cierren. «0 lotes de riesgo ${label}» sería una cifra favorable inventada.`
          : PERIOD_NOTE });
    }

    // ---- Completitud de evidencia (estado, %) ----
    const b7 = { code: 'evidence_completeness', name: 'Completitud de evidencia', definition: 'Afirmaciones de evidencia en estado VERIFIED ÷ afirmaciones del tenant. Mide verificación interna, no validez jurídica.', unit: 'percent' as const, kind: 'STATE' as const, date_basis: null, requires: 'evidence:read' as Permission };
    if (!has('evidence:read')) restricted(b7);
    else {
      const den = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM evidence WHERE organization_id = ${org}`);
      const num = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM evidence WHERE organization_id = ${org} AND status = 'VERIFIED'`);
      const v = ratio(num, den);
      push({ ...b7, status: v === null ? 'NOT_CALCULABLE' : 'OK', value: v, numerator: num, denominator: den,
        reason: v === null ? 'Sin afirmaciones de evidencia: el denominador es cero y el porcentaje no es calculable. No es 0 % ni 100 %.' : 'Verificación interna de afirmaciones. No acredita validez jurídica del soporte.' });
    }

    // ---- Expedientes DD listos (estado) ----
    const b8 = { code: 'due_diligence_ready', name: 'Expedientes con preparación READY', definition: 'Expedientes cuya última instantánea tiene readiness = READY, sobre los expedientes del tenant.', unit: 'count' as const, kind: 'STATE' as const, date_basis: null, requires: 'dd:read' as Permission };
    if (!has('dd:read')) restricted(b8);
    else {
      const den = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM dd_cases WHERE organization_id = ${org}`);
      const num = await one(sql<{ n: string }>`
        SELECT count(*)::text AS n FROM dd_cases c WHERE c.organization_id = ${org}
          AND (SELECT s.readiness FROM dd_snapshots s WHERE s.case_id = c.id ORDER BY s.snapshot_number DESC LIMIT 1) = 'READY'`);
      push({ ...b8, status: den === 0 ? 'NOT_CALCULABLE' : 'OK', value: den === 0 ? null : String(num), numerator: den === 0 ? null : num, denominator: den,
        reason: den === 0
          ? 'Sin expedientes de diligencia en el tenant: no hay denominador.'
          : 'READY indica preparación interna, NO conformidad EUDR ni presentación de DDS. Hoy READY es inalcanzable (catálogo de riesgo sin aprobar, D-05, perfil jurídico P1-005 y satélite P0-028): un 0 aquí no mide el desempeño del equipo.' });
    }

    return out;
  }

  private meta(ctx: TenantContext, period: { from: string | null; to: string | null }) {
    return {
      catalog_version: REPORT_CATALOG_VERSION,
      source: 'S1 §60 (lista de KPI). Contrato: docs/decisiones/P0-030-REPORTES.md',
      period: { from: period.from, to: period.to, applies_to: 'Solo a los indicadores de tipo ACTIVITY. Los de estado describen el momento actual.' },
      scope_note: 'Cada indicador exige el permiso de su dominio. Los que tu rol no permite salen RESTRICTED, sin valor ni conteo: ningún total agrega sobre dominios que no puedes leer.',
      privacy_note: 'Este reporte no contiene datos personales ni coordenadas: solo conteos y porcentajes.',
      interpretation_note: 'Readiness no es conformidad. Reserva no es despacho. INTEGRATED significa que la operación y su evento existen, no que estén acreditados. Calidad, origen, hallazgos GIS, riesgo y preparación DD son dimensiones distintas y no se combinan.',
      history_gap: {
        since: '2026-10-13',
        note: 'El almacenamiento local se recreó el 2026-10-13 y se perdieron los registros de las revisiones anteriores. Toda serie anterior a esa fecha está vacía por pérdida de almacenamiento, NO por falta de actividad.',
        reference: 'docs/qa/HALLAZGO_PERDIDA_DATOS_DEMO_2026-10-13.md',
      },
    };
  }

  @Get('indicators')
  async indicators(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Query() q: ReportPeriodDto) {
    const ctx = await this.ctx(user, orgId, 'report:read');
    const period = { from: q.from ?? null, to: q.to ?? null };
    const indicators = await this.compute(ctx, period);
    return { ...this.meta(ctx, period), can_export: ctx.permissions.includes('report:export'), indicators };
  }

  @Get('indicators/export')
  async export(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Req() req: AuthedRequest, @Query() q: ReportPeriodDto, @Res() res: Response) {
    // `report:export` se revalida aquí: tener la pantalla abierta no basta para descargar.
    const ctx = await this.ctx(user, orgId, 'report:export');
    const period = { from: q.from ?? null, to: q.to ?? null };
    const indicators = await this.compute(ctx, period);
    const org = await this.db.selectFrom('organizations').select('name').where('id', '=', ctx.organizationId).executeTakeFirstOrThrow();
    const generatedAt = new Date().toISOString();
    const m = this.meta(ctx, period);
    const head: Array<[string, string]> = [
      ['formato', REPORT_EXPORT_FORMAT], ['catalogo', REPORT_CATALOG_VERSION], ['organizacion', org.name], ['organizacion_id', ctx.organizationId],
      ['periodo_desde', period.from ?? 'sin límite'], ['periodo_hasta', period.to ?? 'sin límite'], ['generado', generatedAt],
      ['alcance', m.scope_note], ['privacidad', m.privacy_note], ['interpretacion', m.interpretation_note], ['laguna_historica', `${m.history_gap.note} Detalle: ${m.history_gap.reference}`],
      ['nota', 'Formato local provisional. No acredita conformidad EUDR ni aprobación de ninguna autoridad.'],
    ];
    const header = ['code', 'name', 'kind', 'unit', 'status', 'value', 'numerator', 'denominator', 'date_basis', 'definition', 'reason'];
    const lines = [
      ...head.map(([k, v]) => `# ${csvCell(k)},${csvCell(v)}`), header.join(','),
      ...indicators.map((i) => [i.code, i.name, i.kind, i.unit, i.status, i.value ?? '', i.numerator === null ? '' : String(i.numerator),
        i.denominator === null ? '' : String(i.denominator), i.date_basis ?? '', i.definition, i.reason ?? ''].map(csvCell).join(',')),
    ];
    const body = Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
    const sha256 = createHash('sha256').update(body).digest('hex');
    await this.audit.record(this.db, {
      organizationId: ctx.organizationId, actorUserId: user.id, action: 'report.export', entityType: 'report', entityId: null, requestId: req.requestId, result: 'SUCCESS',
      after: { format_version: REPORT_EXPORT_FORMAT, catalog_version: REPORT_CATALOG_VERSION, sha256, period, indicators: indicators.length },
    });
    const fileName = `indicadores-${generatedAt.slice(0, 10)}.csv`;
    // Se escribe directamente en la respuesta: devolver el Buffer con `passthrough` haría que Nest lo serializara
    // como JSON ({"type":"Buffer",...}) y el archivo descargado no sería un CSV.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Content-Sha256', sha256);
    res.send(body);
  }
}
