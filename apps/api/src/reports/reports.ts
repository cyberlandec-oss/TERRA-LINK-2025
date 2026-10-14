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
import {
  ASSIGNED_SCOPE_NOTE, COVERAGE, EXPORT_RECALC_NOTE, INTERPRETATION_NOTE, REPORT_CATALOG_VERSION, REPORT_EXPORT_FORMAT,
  SCOPE_NOTE, has, timeBasis, type Period,
} from './reports-shared';

// P0-030 Reportes e indicadores (S1 §60 «construir los indicadores desde queries reales»; RF-30; QA-13/14).
// Contrato completo, con definición, unidad, fecha usada y denominador de cada KPI: docs/decisiones/P0-030-REPORTES.md.
//
// Reglas que gobiernan este módulo:
//  1. `report:read` abre la pantalla, NO los datos: cada indicador exige el permiso de su dominio. Sin él sale
//     RESTRICTED, sin valor ni conteo, y ningún indicador agrega sobre dominios ajenos: no se deduce lo oculto.
//  2. CINCO situaciones distintas, cada una con su estado propio (nunca todas bajo «no calculable»):
//       OK                  -> valor calculado desde la base. Un 0 aquí es CERO OBSERVADO y se publica como tal.
//       NO_DENOMINATOR      -> el denominador es cero: el cociente no existe. Ni 0 % ni 100 %.
//       UNKNOWN             -> el universo se conoce, pero la condición no ha sido evaluada en ningún sujeto.
//       CRITERION_UNDEFINED -> el criterio carece de definición aprobada (D-05): todavía no puede evaluarse.
//       RESTRICTED          -> el lector no tiene el permiso de ese dominio.
//  3. Un resultado desfavorable NO es motivo para declarar nada «no calculable»: si se puede contar, se cuenta.
//     Por eso `due_diligence_ready` publica su cero observado y el desglose de expedientes BLOCKED, que sí es calculable.
export { REPORT_CATALOG_VERSION, REPORT_EXPORT_FORMAT };

/** Estado de un indicador. Solo OK lleva valor. */
export type Status = 'OK' | 'NO_DENOMINATOR' | 'UNKNOWN' | 'CRITERION_UNDEFINED' | 'RESTRICTED';
/** E: estado actual · A: actividad en un período · S: saldo a una fecha (ningún KPI de la fuente lo es hoy). */
type Kind = 'STATE' | 'ACTIVITY' | 'BALANCE_AT';

export interface Indicator {
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
  /** Conteos que SÍ son observables aunque el indicador principal no lo sea. Nunca se usan para rellenar `value`. */
  observed: Record<string, number> | null;
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

  /** Cálculo único: la pantalla y la exportación leen de aquí, así una misma lectura es coherente consigo misma. */
  async compute(ctx: TenantContext, period: Period) {
    const org = ctx.organizationId;
    const can = (p: Permission) => has(ctx, p);
    const one = async (q: ReturnType<typeof sql<{ n: string }>>) => Number((await q.execute(this.db)).rows[0]?.n ?? 0);
    /** Desglose por una columna: lo que se puede contar, se cuenta, aunque el indicador principal sea desconocido. */
    const group = async (q: ReturnType<typeof sql<{ k: string | null; n: string }>>) => {
      const rows = (await q.execute(this.db)).rows;
      return Object.fromEntries(rows.map((r) => [r.k ?? 'SIN_DATO', Number(r.n)])) as Record<string, number>;
    };
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

    const out: Indicator[] = [];
    type Base = Omit<Indicator, 'status' | 'value' | 'numerator' | 'denominator' | 'observed' | 'reason'>;
    type Rest = Pick<Indicator, 'status' | 'value' | 'numerator' | 'denominator' | 'observed' | 'reason'>;
    const push = (b: Base, rest: Rest) => out.push({ ...b, ...rest });
    /** Sin el permiso del dominio: sin valor, sin numerador, sin denominador, sin desglose y sin conteo. */
    const restricted = (b: Base) => push(b, {
      status: 'RESTRICTED', value: null, numerator: null, denominator: null, observed: null,
      reason: `Tu rol no permite leer este dominio (${b.requires}). El indicador no se calcula ni se informa parcialmente, y ningún total lo incluye.`,
    });
    const pct = (num: number, den: number) => ((num * 100) / den).toFixed(1);

    // ---- Productores (estado) ----
    const b1: Base = { code: 'producers_total', name: 'Productores', definition: 'Productores del tenant no dados de baja (deleted_at nulo).', unit: 'count', kind: 'STATE', date_basis: null, requires: 'producer:read' };
    if (!can('producer:read')) restricted(b1);
    else {
      const n = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM producers WHERE organization_id = ${org} AND deleted_at IS NULL`);
      const bajas = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM producers WHERE organization_id = ${org} AND deleted_at IS NOT NULL`);
      push(b1, { status: 'OK', value: String(n), numerator: n, denominator: null, observed: { activos: n, dados_de_baja: bajas },
        reason: `${PERIOD_NOTE} Un 0 aquí sería un cero observado: no hay productores vigentes en el tenant.` });
    }

    // ---- Parcelas (estado) ----
    const b2: Base = { code: 'plots_total', name: 'Parcelas', definition: 'Parcelas del tenant no dadas de baja (deleted_at nulo).', unit: 'count', kind: 'STATE', date_basis: null, requires: 'plot:read' };
    if (!can('plot:read')) restricted(b2);
    else {
      const n = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM plots WHERE organization_id = ${org} AND deleted_at IS NULL`);
      push(b2, { status: 'OK', value: String(n), numerator: n, denominator: null, observed: null, reason: PERIOD_NOTE });
    }

    // ---- Parcelas válidas (estado) — criterio sin definición aprobada mientras D-05 no cierre ----
    const b3: Base = { code: 'plots_valid', name: 'Parcelas válidas (GIS)', definition: 'Parcelas cuya versión vigente tiene validation_status = VALID, sobre las parcelas con versión vigente evaluada.', unit: 'count', kind: 'STATE', date_basis: null, requires: 'plot:read' };
    if (!can('plot:read')) restricted(b3);
    else {
      // Se consulta de verdad: si algún día hubiera versiones evaluadas, el motivo deja de aplicarse y el fallo se ve.
      const porEstado = await group(sql<{ k: string | null; n: string }>`
        SELECT v.validation_status AS k, count(*)::text AS n FROM plots p JOIN plot_versions v ON v.id = p.current_version_id
        WHERE p.organization_id = ${org} AND p.deleted_at IS NULL GROUP BY v.validation_status`);
      const conVersion = sum(porEstado);
      const sinEvaluar = porEstado.NOT_VALIDATED ?? 0;
      const evaluadas = conVersion - sinEvaluar;
      if (conVersion === 0) {
        push(b3, { status: 'NO_DENOMINATOR', value: null, numerator: null, denominator: 0, observed: { con_version_vigente: 0 },
          reason: 'Ninguna parcela tiene versión vigente: no hay denominador. No es 0 ni 100 %.' });
      } else if (evaluadas === 0) {
        push(b3, { status: 'CRITERION_UNDEFINED', value: null, numerator: null, denominator: 0, observed: { con_version_vigente: conVersion, sin_evaluar: sinEvaluar },
          reason: `El criterio de validez GIS no tiene definición aprobada: exige el umbral y el perfil de destino de D-05, pendientes (P0-010). Las ${conVersion} parcela(s) con versión vigente están SIN evaluar. «0 válidas» insinuaría que ninguna cumple, cuando lo cierto es que ninguna ha sido evaluada.` });
      } else {
        const validas = porEstado.VALID ?? 0;
        push(b3, { status: 'OK', value: String(validas), numerator: validas, denominator: evaluadas, observed: { ...porEstado, con_version_vigente: conVersion, sin_evaluar: sinEvaluar },
          reason: `${validas === 0 ? 'Cero observado: ninguna de las parcelas evaluadas resultó VALID. ' : ''}Sobre ${evaluadas} parcela(s) evaluada(s); las ${sinEvaluar} sin evaluar no entran en el denominador y siguen siendo desconocidas.` });
      }
    }

    // ---- Entregas registradas (ACTIVIDAD, por delivery_date) ----
    const b4: Base = { code: 'deliveries_total', name: 'Entregas registradas', definition: 'Entregas en estado REGISTERED cuya fecha declarada de entrega cae dentro del período (límites inclusivos).', unit: 'count', kind: 'ACTIVITY', date_basis: 'deliveries.delivery_date (fecha civil declarada; nunca created_at)', requires: 'delivery:read' };
    if (!can('delivery:read')) restricted(b4);
    else {
      const n = await one(sql<{ n: string }>`
        SELECT count(*)::text AS n FROM deliveries
        WHERE organization_id = ${org} AND status = 'REGISTERED' AND delivery_date IS NOT NULL
          AND (${period.from}::date IS NULL OR delivery_date >= ${period.from}::date)
          AND (${period.to}::date IS NULL OR delivery_date <= ${period.to}::date)`);
      const borradores = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM deliveries WHERE organization_id = ${org} AND status = 'DRAFT'`);
      // Una entrega registrada sin fecha no se descarta en silencio: se informa aparte para que se vea y se corrija.
      const sinFecha = await one(sql<{ n: string }>`SELECT count(*)::text AS n FROM deliveries WHERE organization_id = ${org} AND status = 'REGISTERED' AND delivery_date IS NULL`);
      push(b4, { status: 'OK', value: String(n), numerator: n, denominator: null, observed: { en_periodo: n, borradores, registradas_sin_fecha: sinFecha },
        reason: `Los borradores quedan fuera: no tienen fecha ni cantidad declaradas (${borradores} en el tenant, sin período). ${sinFecha} entrega(s) registrada(s) sin fecha declarada quedan fuera de todo período y se informan aquí. Un 0 en un período es un cero observado para esas fechas; la cobertura histórica incompleta se declara aparte.` });
    }

    // ---- Lotes activos (estado) ----
    const b5: Base = { code: 'lots_active', name: 'Lotes activos', definition: 'Lotes en estado OPEN o CLOSED_FOR_INPUT.', unit: 'count', kind: 'STATE', date_basis: null, requires: 'lot:read' };
    const porEstadoLote = can('lot:read') ? await group(sql<{ k: string | null; n: string }>`SELECT status AS k, count(*)::text AS n FROM lots WHERE organization_id = ${org} GROUP BY status`) : {};
    const lotesTotal = sum(porEstadoLote);
    if (!can('lot:read')) restricted(b5);
    else {
      const n = (porEstadoLote.OPEN ?? 0) + (porEstadoLote.CLOSED_FOR_INPUT ?? 0);
      push(b5, { status: 'OK', value: String(n), numerator: n, denominator: null, observed: { ...porEstadoLote, lotes_del_tenant: lotesTotal }, reason: PERIOD_NOTE });
    }

    // ---- Completitud de trazabilidad (estado, %) ----
    const b6: Base = { code: 'traceability_completeness', name: 'Completitud de trazabilidad', definition: 'Lotes con origin_status = COMPLETE ÷ lotes del tenant. Mide origen declarado completo; no es verificación ni conformidad.', unit: 'percent', kind: 'STATE', date_basis: null, requires: 'lot:read' };
    if (!can('lot:read')) restricted(b6);
    else {
      const porOrigen = await group(sql<{ k: string | null; n: string }>`SELECT origin_status AS k, count(*)::text AS n FROM lots WHERE organization_id = ${org} GROUP BY origin_status`);
      const num = porOrigen.COMPLETE ?? 0;
      if (lotesTotal === 0) {
        push(b6, { status: 'NO_DENOMINATOR', value: null, numerator: null, denominator: 0, observed: { lotes_del_tenant: 0 },
          reason: 'Sin lotes en el tenant: el denominador es cero y el porcentaje no existe. No es 0 % ni 100 %.' });
      } else {
        push(b6, { status: 'OK', value: pct(num, lotesTotal), numerator: num, denominator: lotesTotal, observed: { ...porOrigen, lotes_del_tenant: lotesTotal },
          reason: `${num === 0 ? 'Cero observado: ningún lote tiene el origen declarado completo. ' : ''}Origen declarado completo. No acredita verificación de campo ni conformidad EUDR.` });
      }
    }

    // ---- Riesgo por severidad (estado) ----
    // La ÚLTIMA evaluación de cada sujeto (no todas): DISTINCT ON por evaluation_number descendente.
    const ultimaPorSujeto = can('risk:read')
      ? await group(sql<{ k: string | null; n: string }>`
          SELECT severity AS k, count(*)::text AS n FROM (
            SELECT DISTINCT ON (subject_id) subject_id, severity FROM risk_evaluations
            WHERE organization_id = ${org} ORDER BY subject_id, evaluation_number DESC
          ) ultima GROUP BY severity`)
      : {};
    const evaluados = sum(ultimaPorSujeto);
    const sinSeveridad = (ultimaPorSujeto.NOT_ASSESSED ?? 0) + (ultimaPorSujeto.UNDETERMINED ?? 0);
    const conSeveridad = evaluados - sinSeveridad;
    for (const [code, sev, label] of [['risk_high', 'HIGH', 'alto'], ['risk_medium', 'MEDIUM', 'medio'], ['risk_low', 'LOW', 'bajo']] as const) {
      const b: Base = { code, name: `Lotes de riesgo ${label}`, definition: `Lotes cuya ÚLTIMA evaluación tiene severity = ${sev}, sobre los lotes con evaluación.`, unit: 'count', kind: 'STATE', date_basis: null, requires: 'risk:read' };
      if (!can('risk:read')) { restricted(b); continue; }
      const observed = { lotes_del_tenant: lotesTotal, lotes_evaluados: evaluados, sin_severidad_asignada: sinSeveridad, con_severidad_asignada: conSeveridad };
      if (evaluados === 0) {
        push(b, { status: 'NO_DENOMINATOR', value: null, numerator: null, denominator: 0, observed,
          reason: `Ningún lote tiene evaluación de riesgo: el denominador es cero. Que no haya evaluaciones es un hecho observado (${lotesTotal} lote(s) en el tenant), pero no permite afirmar cuántos son de riesgo ${label}.` });
      } else if (conSeveridad === 0) {
        push(b, { status: 'UNKNOWN', value: null, numerator: null, denominator: evaluados, observed,
          reason: `Desconocido: los ${evaluados} lote(s) evaluado(s) salieron SIN severidad asignada (NOT_ASSESSED/UNDETERMINED), porque el motor no concluye mientras D-05, el proveedor satelital (P0-028) y las mitigaciones (P0-021) no cierren. «0 lotes de riesgo ${label}» sería una cifra favorable inventada sobre sujetos sin clasificar.` });
      } else {
        const n = ultimaPorSujeto[sev] ?? 0;
        push(b, { status: 'OK', value: String(n), numerator: n, denominator: evaluados, observed,
          reason: `${n === 0 ? 'Cero observado: ninguno de los lotes clasificados quedó en esta severidad. ' : ''}Hay ${conSeveridad} lote(s) con severidad asignada y ${sinSeveridad} sin asignar; estos últimos siguen siendo desconocidos y no se cuentan como riesgo ${label}.` });
      }
    }

    // ---- Completitud de evidencia (estado, %) ----
    const b7: Base = { code: 'evidence_completeness', name: 'Completitud de evidencia', definition: 'Afirmaciones de evidencia en estado VERIFIED ÷ afirmaciones del tenant. Mide verificación interna, no validez jurídica.', unit: 'percent', kind: 'STATE', date_basis: null, requires: 'evidence:read' };
    if (!can('evidence:read')) restricted(b7);
    else {
      const porEstadoEv = await group(sql<{ k: string | null; n: string }>`SELECT status AS k, count(*)::text AS n FROM evidence WHERE organization_id = ${org} GROUP BY status`);
      const den = sum(porEstadoEv);
      const num = porEstadoEv.VERIFIED ?? 0;
      if (den === 0) {
        push(b7, { status: 'NO_DENOMINATOR', value: null, numerator: null, denominator: 0, observed: { afirmaciones: 0 },
          reason: 'Sin afirmaciones de evidencia en el tenant: el denominador es cero y el porcentaje no existe. No es 0 % ni 100 %.' });
      } else {
        push(b7, { status: 'OK', value: pct(num, den), numerator: num, denominator: den, observed: { ...porEstadoEv, afirmaciones: den },
          reason: `${num === 0 ? 'Cero observado: ninguna afirmación está verificada. ' : ''}Verificación interna de afirmaciones. No acredita validez jurídica del soporte. El desglose por estado es un conteo observado.` });
      }
    }

    // ---- Expedientes DD listos (estado) ----
    // Calculable: contar expedientes por preparación (incluidos los BLOCKED) es un conteo observado. Lo que NO se
    // deduce de aquí es conformidad: READY es preparación interna y hoy, además, inalcanzable por dependencias abiertas.
    const b8: Base = { code: 'due_diligence_ready', name: 'Expedientes con preparación READY', definition: 'Expedientes cuya ÚLTIMA instantánea tiene readiness = READY, sobre los expedientes del tenant.', unit: 'count', kind: 'STATE', date_basis: null, requires: 'dd:read' };
    if (!can('dd:read')) restricted(b8);
    else {
      const porReadiness = await group(sql<{ k: string | null; n: string }>`
        SELECT readiness AS k, count(*)::text AS n FROM (
          SELECT DISTINCT ON (c.id) c.id, s.readiness FROM dd_cases c
          LEFT JOIN dd_snapshots s ON s.case_id = c.id AND s.organization_id = c.organization_id
          WHERE c.organization_id = ${org} ORDER BY c.id, s.snapshot_number DESC NULLS LAST
        ) ultima GROUP BY readiness`);
      const den = sum(porReadiness);
      const num = porReadiness.READY ?? 0;
      if (den === 0) {
        push(b8, { status: 'NO_DENOMINATOR', value: null, numerator: null, denominator: 0, observed: { expedientes: 0 },
          reason: 'Sin expedientes de diligencia en el tenant: no hay denominador.' });
      } else {
        push(b8, { status: 'OK', value: String(num), numerator: num, denominator: den,
          observed: { expedientes: den, READY: num, IN_PROGRESS: porReadiness.IN_PROGRESS ?? 0, BLOCKED: porReadiness.BLOCKED ?? 0, sin_instantanea: porReadiness.SIN_DATO ?? 0 },
          reason: `${num === 0 ? 'Cero observado: ningún expediente alcanza READY. ' : ''}READY indica preparación interna, NO conformidad EUDR ni presentación de DDS. Hoy READY es inalcanzable (catálogo de riesgo sin aprobar, D-05, perfil jurídico P1-005 y satélite P0-028): este cero no mide el desempeño del equipo. El desglose por preparación —incluidos los ${porReadiness.BLOCKED ?? 0} BLOCKED— sí es un conteo observado y se publica.` });
      }
    }

    return out;
  }

  meta(period: Period, asOf: string) {
    return {
      catalog_version: REPORT_CATALOG_VERSION,
      source: 'S1 §60 (lista de KPI). Contrato: docs/decisiones/P0-030-REPORTES.md',
      period: { from: period.from, to: period.to, applies_to: 'Solo a los indicadores de tipo ACTIVITY. Los de estado describen el momento actual (as_of).' },
      time_basis: timeBasis(asOf),
      scope_note: SCOPE_NOTE,
      assigned_scope_note: ASSIGNED_SCOPE_NOTE,
      privacy_note: 'Este reporte de indicadores no contiene datos personales ni coordenadas: solo conteos y porcentajes.',
      interpretation_note: INTERPRETATION_NOTE,
      status_legend: {
        OK: 'Calculado desde la base. Un 0 es un cero observado.',
        NO_DENOMINATOR: 'El denominador es cero: el cociente no existe. Ni 0 % ni 100 %.',
        UNKNOWN: 'El universo se conoce, pero la condición no ha sido evaluada en ningún sujeto.',
        CRITERION_UNDEFINED: 'El criterio carece de definición aprobada (D-05) y todavía no puede evaluarse.',
        RESTRICTED: 'Tu rol no tiene el permiso de ese dominio: no se calcula ni se informa parcialmente.',
      },
      coverage: COVERAGE,
    };
  }

  @Get('indicators')
  async indicators(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Query() q: ReportPeriodDto) {
    const ctx = await this.ctx(user, orgId, 'report:read');
    const period: Period = { from: q.from ?? null, to: q.to ?? null };
    const indicators = await this.compute(ctx, period);
    return { ...this.meta(period, new Date().toISOString()), can_export: ctx.permissions.includes('report:export'), indicators };
  }

  @Get('indicators/export')
  async export(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Req() req: AuthedRequest, @Query() q: ReportPeriodDto, @Res() res: Response) {
    // `report:export` se revalida aquí: tener la pantalla abierta no basta para descargar.
    const ctx = await this.ctx(user, orgId, 'report:export');
    const period: Period = { from: q.from ?? null, to: q.to ?? null };
    const indicators = await this.compute(ctx, period);
    const org = await this.db.selectFrom('organizations').select('name').where('id', '=', ctx.organizationId).executeTakeFirstOrThrow();
    const generatedAt = new Date().toISOString();
    const m = this.meta(period, generatedAt);
    const head: Array<[string, string]> = [
      ['formato', REPORT_EXPORT_FORMAT], ['catalogo', REPORT_CATALOG_VERSION], ['organizacion', org.name], ['organizacion_id', ctx.organizationId],
      ['periodo_desde', period.from ?? 'sin límite'], ['periodo_hasta', period.to ?? 'sin límite'], ['generado', generatedAt],
      ['recalculo', EXPORT_RECALC_NOTE], ['fechas', `${m.time_basis.period_bounds} ${m.time_basis.civil_dates}`], ['as_of', m.time_basis.as_of_note],
      ['alcance', m.scope_note], ['alcance_asignado', m.assigned_scope_note], ['privacidad', m.privacy_note], ['interpretacion', m.interpretation_note],
      ['cobertura_historica', `${COVERAGE.note} ${COVERAGE.not_reconstructed} Detalle: ${COVERAGE.reference}`],
      ['estados', Object.entries(m.status_legend).map(([k, v]) => `${k}: ${v}`).join(' | ')],
      ['nota', 'Formato local provisional. No acredita conformidad EUDR ni aprobación de ninguna autoridad.'],
    ];
    const header = ['code', 'name', 'kind', 'unit', 'status', 'value', 'numerator', 'denominator', 'observed', 'date_basis', 'definition', 'reason'];
    const lines = [
      ...head.map(([k, v]) => `# ${csvCell(k)},${csvCell(v)}`), header.join(','),
      ...indicators.map((i) => [i.code, i.name, i.kind, i.unit, i.status, i.value ?? '', i.numerator === null ? '' : String(i.numerator),
        i.denominator === null ? '' : String(i.denominator), i.observed ? Object.entries(i.observed).map(([k, v]) => `${k}=${v}`).join(' ') : '',
        i.date_basis ?? '', i.definition, i.reason ?? ''].map(csvCell).join(',')),
    ];
    const body = Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
    const sha256 = createHash('sha256').update(body).digest('hex');
    await this.audit.record(this.db, {
      organizationId: ctx.organizationId, actorUserId: user.id, action: 'report.export', entityType: 'report', entityId: null, requestId: req.requestId, result: 'SUCCESS',
      after: { format_version: REPORT_EXPORT_FORMAT, catalog_version: REPORT_CATALOG_VERSION, sha256, period, indicators: indicators.length, generated_at: generatedAt },
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
