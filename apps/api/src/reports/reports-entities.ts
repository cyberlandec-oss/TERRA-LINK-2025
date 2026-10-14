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
import { AppError, forbidden, notFound } from '../common/errors';
import { csvCell } from '../audit/audit-query';
import { ReportPeriodDto } from './reports.dto';
import {
  ASSIGNED_SCOPE_NOTE, COVERAGE, EXPORT_RECALC_NOTE, GEOJSON_EXPORT_FORMAT, INTERPRETATION_NOTE, REPORT_CATALOG_VERSION,
  REPORT_EXPORT_FORMAT, SCOPE_NOTE, has, timeBasis, type Period,
} from './reports-shared';

// P0-030 — Reportes por entidad (S1 §97 «Sprint 11 — Reporting»: productor, parcela, lote, riesgo, trazabilidad, DD
// y exportación GeoJSON). Contrato: docs/decisiones/P0-030-REPORTES.md.
//
// Reglas propias de estos reportes, además de las de los indicadores:
//  1. Organización y alcance se aplican ANTES de agregar: el filtro de tenant y el de asignación entran en la misma
//     consulta que produce filas y totales. Los totales no se calculan sobre la página mostrada sino sobre el conjunto
//     completo YA filtrado, de modo que truncar la tabla no altera ninguna cifra.
//  2. Un sujeto sin evaluar NO se omite: aparece con su estado «sin evaluar». Omitirlo escondería el desconocido y
//     haría parecer completo lo que no lo está.
//  3. Pesos y cantidades llevan su unidad y NUNCA se suman entre unidades distintas: los totales van por unidad.
//  4. Identidad: los nombres exigen `producer:read_identity`. Sin ese permiso el reporte usa solo el código.
//     Coordenadas exactas: nunca en estos reportes tabulares; solo en la exportación GeoJSON, con `plot:read_geometry`.
export const ENTITY_REPORT_LIMIT = 500;

export type EntityKind = 'producers' | 'plots' | 'lots' | 'risk' | 'traceability' | 'dd';

interface Column { key: string; label: string; note?: string }
type Cell = string | number | null;
interface Built { columns: Column[]; rows: Record<string, Cell>[]; totals: Array<{ key: string; label: string; value: string }>; notes: string[]; total_rows: number }

interface Definition {
  kind: EntityKind;
  title: string;
  source: string;
  /** Todos los permisos exigidos. El alcance por asignación no abre reportes de organización (ver nota). */
  requires: Permission[];
  period_applies: boolean;
  period_note: string;
}

export const ENTITY_REPORTS: Definition[] = [
  { kind: 'producers', title: 'Reporte de productores', source: 'S1 §97 «Producer report»', requires: ['producer:read'], period_applies: true,
    period_note: 'El período se aplica solo a la columna de entregas registradas, por `delivery_date`. El resto describe el estado actual.' },
  { kind: 'plots', title: 'Reporte de parcelas', source: 'S1 §97 «Plot report»', requires: ['plot:read'], period_applies: false,
    period_note: 'Reporte de estado actual: el período no se aplica. No se filtra por `created_at`.' },
  { kind: 'lots', title: 'Reporte de lotes', source: 'S1 §97 «Lot report»', requires: ['lot:read'], period_applies: false,
    period_note: 'Reporte de estado actual: el período no se aplica. Las cantidades son las vigentes, no un saldo a una fecha.' },
  { kind: 'risk', title: 'Reporte de riesgo', source: 'S1 §97 «Risk report»', requires: ['risk:read', 'lot:read'], period_applies: false,
    period_note: 'Reporte de estado actual: muestra la ÚLTIMA evaluación de cada lote. Los lotes sin evaluar aparecen como tales.' },
  { kind: 'traceability', title: 'Reporte de trazabilidad', source: 'S1 §97 «Traceability report»', requires: ['lot:read'], period_applies: false,
    period_note: 'Reporte de estado actual: completitud del origen declarado de cada lote, no conformidad.' },
  { kind: 'dd', title: 'Reporte de debida diligencia', source: 'S1 §97 «DD report»', requires: ['dd:read'], period_applies: false,
    period_note: 'Reporte de estado actual: la ÚLTIMA instantánea de cada expediente.' },
];

const GEOJSON_NOTICE =
  'Exportación TÉCNICA de las geometrías vigentes registradas en Terra Link (RFC 7946, WGS84 longitud/latitud). No es un paquete de debida ' +
  'diligencia EUDR, no es una declaración presentada y no sigue el perfil de ningún sistema de destino.';
const GEOJSON_REGULATORY =
  'El PERFIL DE DESTINO REGULATORIO sigue pendiente de D-05: qué geometría exige cada caso (punto o polígono y su umbral de superficie), ' +
  'qué precisión y redondeo admite el destino, qué propiedades espera y qué parcelas quedan calificadas. Nada de eso se decide aquí: esta ' +
  'exportación entrega lo registrado, sin recortar ni reproyectar, y declara lo que falta.';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/reports/entities')
export class EntityReportsController {
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

  private def(kind: string): Definition {
    const d = ENTITY_REPORTS.find((r) => r.kind === kind);
    if (!d) throw new AppError(404, 'REPORT_NOT_FOUND', 'Ese reporte no existe.');
    return d;
  }

  /** Permisos del reporte. Faltando uno solo, no se entrega nada parcial: el reporte entero queda restringido. */
  private requireAll(ctx: TenantContext, d: Definition) {
    const faltan = d.requires.filter((p) => !has(ctx, p));
    if (faltan.length) {
      throw forbidden('PERMISSION_DENIED', `Este reporte exige ${d.requires.join(' y ')}; tu rol no tiene ${faltan.join(' ni ')}. No se entrega una versión parcial: un total sobre una parte se leería como total de la organización.`);
    }
  }

  private meta(period: Period, asOf: string) {
    return {
      catalog_version: REPORT_CATALOG_VERSION,
      time_basis: timeBasis(asOf),
      scope_note: SCOPE_NOTE,
      assigned_scope_note: ASSIGNED_SCOPE_NOTE,
      interpretation_note: INTERPRETATION_NOTE,
      coverage: COVERAGE,
      period: { from: period.from, to: period.to },
      limit_note: `La tabla devuelve como máximo ${ENTITY_REPORT_LIMIT} filas, ordenadas por código. Los TOTALES se calculan sobre el conjunto completo ya filtrado por organización y alcance, no sobre las filas mostradas: truncar la tabla no altera ninguna cifra.`,
    };
  }

  // ---------------------------------------------------------------- reportes

  private async build(ctx: TenantContext, kind: EntityKind, period: Period): Promise<Built> {
    const org = ctx.organizationId;
    const lim = ENTITY_REPORT_LIMIT;
    // Alcance por asignación aplicado en la MISMA consulta (hoy estos reportes exigen el permiso completo, de modo que
    // el filtro no recorta nada; se mantiene para que un cambio de catálogo no abra un agregado por descuido).
    const soloAsignados = !has(ctx, 'producer:read');
    const memb = ctx.membershipId;
    const identidad = has(ctx, 'producer:read_identity');
    const nombre = (r: { legal_name: string | null; first_name: string | null; last_name: string | null }) =>
      identidad ? (r.legal_name ?? ([r.first_name, r.last_name].filter(Boolean).join(' ') || null)) : null;

    if (kind === 'producers') {
      const where = sql`pr.organization_id = ${org} AND pr.deleted_at IS NULL AND (${!soloAsignados} OR pr.assigned_membership_id = ${memb})`;
      const periodo = sql`(${period.from}::date IS NULL OR d.delivery_date >= ${period.from}::date) AND (${period.to}::date IS NULL OR d.delivery_date <= ${period.to}::date)`;
      const rows = (await sql<{ producer_code: string; status: string; legal_name: string | null; first_name: string | null; last_name: string | null; plots: string; plots_with_geometry: string; deliveries: string; asignado: boolean }>`
        SELECT pr.producer_code, pr.status, pr.legal_name, pr.first_name, pr.last_name,
               (SELECT count(*) FROM plots pl WHERE pl.organization_id = pr.organization_id AND pl.producer_id = pr.id AND pl.deleted_at IS NULL)::text AS plots,
               (SELECT count(*) FROM plots pl JOIN plot_versions v ON v.id = pl.current_version_id
                 WHERE pl.organization_id = pr.organization_id AND pl.producer_id = pr.id AND pl.deleted_at IS NULL AND v.geometry_type IS NOT NULL)::text AS plots_with_geometry,
               (SELECT count(*) FROM deliveries d WHERE d.organization_id = pr.organization_id AND d.producer_id = pr.id
                 AND d.status = 'REGISTERED' AND d.delivery_date IS NOT NULL AND ${periodo})::text AS deliveries,
               (pr.assigned_membership_id IS NOT NULL) AS asignado
        FROM producers pr WHERE ${where} ORDER BY pr.producer_code LIMIT ${lim}`.execute(this.db)).rows;
      const t = (await sql<{ productores: string; con_parcela: string; parcelas: string; con_geometria: string; entregas: string }>`
        SELECT count(*)::text AS productores,
               count(*) FILTER (WHERE (SELECT count(*) FROM plots pl WHERE pl.organization_id = pr.organization_id AND pl.producer_id = pr.id AND pl.deleted_at IS NULL) > 0)::text AS con_parcela,
               coalesce(sum((SELECT count(*) FROM plots pl WHERE pl.organization_id = pr.organization_id AND pl.producer_id = pr.id AND pl.deleted_at IS NULL)), 0)::text AS parcelas,
               coalesce(sum((SELECT count(*) FROM plots pl JOIN plot_versions v ON v.id = pl.current_version_id
                 WHERE pl.organization_id = pr.organization_id AND pl.producer_id = pr.id AND pl.deleted_at IS NULL AND v.geometry_type IS NOT NULL)), 0)::text AS con_geometria,
               coalesce(sum((SELECT count(*) FROM deliveries d WHERE d.organization_id = pr.organization_id AND d.producer_id = pr.id
                 AND d.status = 'REGISTERED' AND d.delivery_date IS NOT NULL AND ${periodo})), 0)::text AS entregas
        FROM producers pr WHERE ${where}`.execute(this.db)).rows[0];
      return {
        columns: [
          { key: 'producer_code', label: 'Código' },
          { key: 'nombre', label: 'Nombre', note: 'Solo con producer:read_identity; sin ese permiso queda vacío y el reporte se lee por código.' },
          { key: 'status', label: 'Estado' },
          { key: 'plots', label: 'Parcelas' },
          { key: 'plots_with_geometry', label: 'Parcelas con geometría', note: 'Versión vigente con geometría registrada. No dice si es válida: eso exige el criterio de D-05.' },
          { key: 'deliveries', label: 'Entregas registradas en el período', note: 'Por delivery_date (fecha civil declarada), nunca created_at.' },
          { key: 'asignado', label: '¿Asignado?' },
        ],
        rows: rows.map((r) => ({ producer_code: r.producer_code, nombre: nombre(r), status: r.status, plots: Number(r.plots), plots_with_geometry: Number(r.plots_with_geometry), deliveries: Number(r.deliveries), asignado: r.asignado ? 'Sí' : 'No' })),
        totals: [
          { key: 'productores', label: 'Productores vigentes', value: t.productores },
          { key: 'con_parcela', label: 'Con al menos una parcela', value: t.con_parcela },
          { key: 'parcelas', label: 'Parcelas (suma)', value: t.parcelas },
          { key: 'con_geometria', label: 'Parcelas con geometría (suma)', value: t.con_geometria },
          { key: 'entregas', label: 'Entregas registradas en el período (suma)', value: t.entregas },
        ],
        notes: [
          'No se suman cantidades entregadas: cada entrega lleva su unidad y sumar entre unidades distintas daría una cifra sin significado. El reporte cuenta entregas.',
          identidad ? 'Incluye nombres porque tu rol tiene producer:read_identity.' : 'Sin producer:read_identity: el reporte no incluye nombres, solo códigos.',
          'Nunca incluye documento, teléfono ni dirección, que están cifrados y fuera de todo reporte.',
        ],
        total_rows: Number(t.productores),
      };
    }

    if (kind === 'plots') {
      const soloAsignadasPlot = !has(ctx, 'plot:read');
      const where = sql`pl.organization_id = ${org} AND pl.deleted_at IS NULL AND (${!soloAsignadasPlot} OR pr.assigned_membership_id = ${memb})`;
      const rows = (await sql<{ plot_code: string; producer_code: string; status: string; geometry_type: string | null; survey_method: string | null; validation_status: string | null; area_declared_ha: string | null; area_calculated_ha: string | null; current_version_id: string | null }>`
        SELECT pl.plot_code, pr.producer_code, pl.status, v.geometry_type, v.survey_method, v.validation_status,
               v.area_declared_ha::text, v.area_calculated_ha::text, pl.current_version_id
        FROM plots pl JOIN producers pr ON pr.id = pl.producer_id AND pr.organization_id = pl.organization_id
        LEFT JOIN plot_versions v ON v.id = pl.current_version_id AND v.organization_id = pl.organization_id
        WHERE ${where} ORDER BY pl.plot_code LIMIT ${lim}`.execute(this.db)).rows;
      const t = (await sql<{ parcelas: string; con_geometria: string; solo_superficie: string; sin_version: string; evaluadas: string; validas: string; superficie_declarada: string }>`
        SELECT count(*)::text AS parcelas,
               count(*) FILTER (WHERE v.geometry_type IS NOT NULL)::text AS con_geometria,
               count(*) FILTER (WHERE v.id IS NOT NULL AND v.geometry_type IS NULL)::text AS solo_superficie,
               count(*) FILTER (WHERE pl.current_version_id IS NULL)::text AS sin_version,
               count(*) FILTER (WHERE v.validation_status IS NOT NULL AND v.validation_status <> 'NOT_VALIDATED')::text AS evaluadas,
               count(*) FILTER (WHERE v.validation_status = 'VALID')::text AS validas,
               coalesce(sum(v.area_declared_ha), 0)::text AS superficie_declarada
        FROM plots pl JOIN producers pr ON pr.id = pl.producer_id AND pr.organization_id = pl.organization_id
        LEFT JOIN plot_versions v ON v.id = pl.current_version_id AND v.organization_id = pl.organization_id
        WHERE ${where}`.execute(this.db)).rows[0];
      const estado = (r: typeof rows[number]) => (!r.current_version_id ? 'SIN VERSIÓN' : r.geometry_type ? 'GEOMETRÍA REGISTRADA' : 'SOLO SUPERFICIE DECLARADA');
      return {
        columns: [
          { key: 'plot_code', label: 'Código' },
          { key: 'producer_code', label: 'Productor' },
          { key: 'status', label: 'Estado' },
          { key: 'geometry_status', label: 'Ubicación', note: 'La superficie declarada NO es ubicación: se distingue de una geometría registrada.' },
          { key: 'survey_method', label: 'Método' },
          { key: 'validation_status', label: 'Validación GIS', note: 'NOT_VALIDATED significa SIN EVALUAR, no inválida: el criterio depende de D-05 (P0-010).' },
          { key: 'area_declared_ha', label: 'Superficie declarada (ha)' },
          { key: 'area_calculated_ha', label: 'Superficie calculada (ha)' },
        ],
        rows: rows.map((r) => ({
          plot_code: r.plot_code, producer_code: r.producer_code, status: r.status, geometry_status: estado(r),
          survey_method: r.survey_method, validation_status: r.validation_status === 'NOT_VALIDATED' ? 'SIN EVALUAR' : r.validation_status,
          area_declared_ha: r.area_declared_ha, area_calculated_ha: r.area_calculated_ha,
        })),
        totals: [
          { key: 'parcelas', label: 'Parcelas vigentes', value: t.parcelas },
          { key: 'con_geometria', label: 'Con geometría registrada', value: t.con_geometria },
          { key: 'solo_superficie', label: 'Solo superficie declarada', value: t.solo_superficie },
          { key: 'sin_version', label: 'Sin versión vigente', value: t.sin_version },
          { key: 'evaluadas', label: 'Con validación GIS evaluada', value: t.evaluadas },
          { key: 'validas', label: 'Válidas (VALID)', value: Number(t.evaluadas) === 0 ? 'DESCONOCIDO (ninguna evaluada; criterio pendiente de D-05)' : t.validas },
          { key: 'superficie_declarada', label: 'Superficie declarada (ha, suma)', value: t.superficie_declarada },
        ],
        notes: [
          'Este reporte no incluye coordenadas. Las geometrías exactas se obtienen en la exportación GeoJSON, que exige plot:read_geometry.',
          'Las superficies se suman solo entre sí, en hectáreas; no se mezclan con la superficie calculada, que procede de la geometría y no de la declaración.',
        ],
        total_rows: Number(t.parcelas),
      };
    }

    if (kind === 'lots') {
      const where = sql`l.organization_id = ${org}`;
      const rows = (await sql<{ lot_code: string; status: string; origin_status: string; unit: string; output_quantity: string | null; product_code: string | null; entradas: string; created_at: string }>`
        SELECT l.lot_code, l.status, l.origin_status, l.unit, l.output_quantity::text, p.code AS product_code,
               (SELECT count(*) FROM lot_inputs li LEFT JOIN lot_input_releases lr ON lr.input_id = li.id
                 WHERE li.organization_id = l.organization_id AND li.lot_id = l.id AND lr.input_id IS NULL)::text AS entradas,
               to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM lots l LEFT JOIN products p ON p.id = l.product_id AND p.organization_id = l.organization_id
        WHERE ${where} ORDER BY l.lot_code LIMIT ${lim}`.execute(this.db)).rows;
      const t = (await sql<{ lotes: string; abiertos: string; cerrados: string; origen_completo: string; origen_incompleto: string }>`
        SELECT count(*)::text AS lotes, count(*) FILTER (WHERE l.status = 'OPEN')::text AS abiertos,
               count(*) FILTER (WHERE l.status = 'CLOSED_FOR_INPUT')::text AS cerrados,
               count(*) FILTER (WHERE l.origin_status = 'COMPLETE')::text AS origen_completo,
               count(*) FILTER (WHERE l.origin_status = 'INCOMPLETE')::text AS origen_incompleto
        FROM lots l WHERE ${where}`.execute(this.db)).rows[0];
      // Cantidades: una línea por unidad. Nunca una suma única entre unidades distintas.
      const porUnidad = (await sql<{ unit: string; total: string; n: string }>`
        SELECT l.unit, coalesce(sum(l.output_quantity), 0)::text AS total, count(*) FILTER (WHERE l.output_quantity IS NOT NULL)::text AS n
        FROM lots l WHERE ${where} GROUP BY l.unit ORDER BY l.unit`.execute(this.db)).rows;
      return {
        columns: [
          { key: 'lot_code', label: 'Código' },
          { key: 'product_code', label: 'Producto' },
          { key: 'status', label: 'Estado' },
          { key: 'origin_status', label: 'Origen', note: 'COMPLETE significa origen declarado completo; no acredita verificación.' },
          { key: 'entradas', label: 'Entradas vigentes', note: 'Entradas no liberadas; una entrada liberada deja de contar.' },
          { key: 'output_quantity', label: 'Cantidad' },
          { key: 'unit', label: 'Unidad' },
          { key: 'created_at', label: 'Creado (UTC)' },
        ],
        rows: rows.map((r) => ({ lot_code: r.lot_code, product_code: r.product_code, status: r.status, origin_status: r.origin_status, entradas: Number(r.entradas), output_quantity: r.output_quantity, unit: r.unit, created_at: r.created_at })),
        totals: [
          { key: 'lotes', label: 'Lotes', value: t.lotes },
          { key: 'abiertos', label: 'Abiertos (OPEN)', value: t.abiertos },
          { key: 'cerrados', label: 'Cerrados a entrada', value: t.cerrados },
          { key: 'origen_completo', label: 'Con origen declarado completo', value: t.origen_completo },
          { key: 'origen_incompleto', label: 'Con origen incompleto', value: t.origen_incompleto },
          ...porUnidad.map((u) => ({ key: `cantidad_${u.unit}`, label: `Cantidad total en ${u.unit} (${u.n} lote(s) con cantidad)`, value: u.total })),
        ],
        notes: [
          'Las cantidades se totalizan POR UNIDAD. No existe un total único entre unidades distintas.',
          'La cantidad del lote es la producida/registrada, no una existencia ni un saldo: el saldo lo lleva el ledger y no se reconstruye a una fecha aquí.',
          'Una reserva de embarque no es un despacho (P0-029) y no aparece como salida en este reporte.',
        ],
        total_rows: Number(t.lotes),
      };
    }

    if (kind === 'risk') {
      // Todos los lotes, con su ÚLTIMA evaluación si existe. Un lote sin evaluar aparece como «SIN EVALUAR»: omitirlo
      // escondería el desconocido y haría parecer que la organización está evaluada.
      const where = sql`l.organization_id = ${org}`;
      const rows = (await sql<{ lot_code: string; severity: string | null; technical_result: string | null; conclusion: string | null; rule_set_version: string | null; evaluated_at: string | null; evaluaciones: string; revisiones: string }>`
        SELECT l.lot_code, e.severity, e.technical_result, e.conclusion, e.rule_set_version,
               to_char(e.evaluated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS evaluated_at,
               (SELECT count(*) FROM risk_evaluations x WHERE x.organization_id = l.organization_id AND x.subject_id = l.id)::text AS evaluaciones,
               (SELECT count(*) FROM risk_reviews rv WHERE rv.organization_id = l.organization_id AND rv.evaluation_id = e.id)::text AS revisiones
        FROM lots l
        LEFT JOIN LATERAL (
          SELECT * FROM risk_evaluations re WHERE re.organization_id = l.organization_id AND re.subject_id = l.id
          ORDER BY re.evaluation_number DESC LIMIT 1
        ) e ON true
        WHERE ${where} ORDER BY l.lot_code LIMIT ${lim}`.execute(this.db)).rows;
      const t = (await sql<{ lotes: string; evaluados: string; sin_evaluar: string; sin_severidad: string; alto: string; medio: string; bajo: string }>`
        SELECT count(*)::text AS lotes,
               count(*) FILTER (WHERE e.id IS NOT NULL)::text AS evaluados,
               count(*) FILTER (WHERE e.id IS NULL)::text AS sin_evaluar,
               count(*) FILTER (WHERE e.severity IN ('NOT_ASSESSED','UNDETERMINED'))::text AS sin_severidad,
               count(*) FILTER (WHERE e.severity = 'HIGH')::text AS alto,
               count(*) FILTER (WHERE e.severity = 'MEDIUM')::text AS medio,
               count(*) FILTER (WHERE e.severity = 'LOW')::text AS bajo
        FROM lots l LEFT JOIN LATERAL (
          SELECT * FROM risk_evaluations re WHERE re.organization_id = l.organization_id AND re.subject_id = l.id
          ORDER BY re.evaluation_number DESC LIMIT 1
        ) e ON true WHERE ${where}`.execute(this.db)).rows[0];
      const clasificados = Number(t.alto) + Number(t.medio) + Number(t.bajo);
      return {
        columns: [
          { key: 'lot_code', label: 'Lote' },
          { key: 'severity', label: 'Severidad (última)', note: 'NOT_ASSESSED significa DESCONOCIDO: el motor no concluye mientras D-05, P0-028 y P0-021 sigan abiertos.' },
          { key: 'technical_result', label: 'Resultado técnico' },
          { key: 'conclusion', label: 'Conclusión' },
          { key: 'rule_set_version', label: 'Versión de reglas' },
          { key: 'evaluated_at', label: 'Evaluado (UTC)' },
          { key: 'evaluaciones', label: 'Evaluaciones' },
          { key: 'revisiones', label: 'Revisiones' },
        ],
        rows: rows.map((r) => ({
          lot_code: r.lot_code, severity: r.severity ?? 'SIN EVALUAR', technical_result: r.technical_result, conclusion: r.conclusion,
          rule_set_version: r.rule_set_version, evaluated_at: r.evaluated_at, evaluaciones: Number(r.evaluaciones), revisiones: Number(r.revisiones ?? 0),
        })),
        totals: [
          { key: 'lotes', label: 'Lotes', value: t.lotes },
          { key: 'evaluados', label: 'Con al menos una evaluación', value: t.evaluados },
          { key: 'sin_evaluar', label: 'Sin evaluación', value: t.sin_evaluar },
          { key: 'sin_severidad', label: 'Evaluados sin severidad asignada (desconocido)', value: t.sin_severidad },
          { key: 'alto', label: 'Riesgo alto', value: clasificados === 0 ? 'DESCONOCIDO (ningún lote clasificado)' : t.alto },
          { key: 'medio', label: 'Riesgo medio', value: clasificados === 0 ? 'DESCONOCIDO (ningún lote clasificado)' : t.medio },
          { key: 'bajo', label: 'Riesgo bajo', value: clasificados === 0 ? 'DESCONOCIDO (ningún lote clasificado)' : t.bajo },
        ],
        notes: [
          'Un lote sin evaluar aparece en la tabla como «SIN EVALUAR». No se omite: omitirlo escondería lo desconocido.',
          'Mientras ningún lote tenga severidad asignada, los totales por severidad salen DESCONOCIDO en vez de cero: un cero se leería como resultado favorable.',
          'La severidad es un resultado técnico interno; no es una conclusión jurídica ni acredita conformidad EUDR.',
        ],
        total_rows: Number(t.lotes),
      };
    }

    if (kind === 'traceability') {
      // Completitud del origen declarado, lote a lote, desde las entradas reales (lot_inputs.origin_known).
      const where = sql`l.organization_id = ${org}`;
      const rows = (await sql<{ lot_code: string; origin_status: string; entradas: string; origen_conocido: string; origen_desconocido: string; entregas: string; parcelas: string }>`
        SELECT l.lot_code, l.origin_status,
               count(li.id)::text AS entradas,
               count(li.id) FILTER (WHERE li.origin_known)::text AS origen_conocido,
               count(li.id) FILTER (WHERE NOT li.origin_known)::text AS origen_desconocido,
               count(DISTINCT r.delivery_id)::text AS entregas,
               count(DISTINCT do2.plot_id)::text AS parcelas
        FROM lots l
        LEFT JOIN lot_inputs li ON li.lot_id = l.id AND li.organization_id = l.organization_id
          AND NOT EXISTS (SELECT 1 FROM lot_input_releases lr WHERE lr.input_id = li.id)
        LEFT JOIN receptions r ON r.id = li.reception_id AND r.organization_id = l.organization_id
        LEFT JOIN delivery_origins do2 ON do2.delivery_id = r.delivery_id AND do2.organization_id = l.organization_id
        WHERE ${where} GROUP BY l.id, l.lot_code, l.origin_status ORDER BY l.lot_code LIMIT ${lim}`.execute(this.db)).rows;
      const t = (await sql<{ lotes: string; completos: string; incompletos: string; sin_entradas: string }>`
        SELECT count(*)::text AS lotes, count(*) FILTER (WHERE l.origin_status = 'COMPLETE')::text AS completos,
               count(*) FILTER (WHERE l.origin_status = 'INCOMPLETE')::text AS incompletos,
               count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM lot_inputs li WHERE li.lot_id = l.id AND li.organization_id = l.organization_id
                 AND NOT EXISTS (SELECT 1 FROM lot_input_releases lr WHERE lr.input_id = li.id)))::text AS sin_entradas
        FROM lots l WHERE ${where}`.execute(this.db)).rows[0];
      const lotes = Number(t.lotes);
      return {
        columns: [
          { key: 'lot_code', label: 'Lote' },
          { key: 'origin_status', label: 'Origen declarado' },
          { key: 'entradas', label: 'Entradas vigentes' },
          { key: 'origen_conocido', label: 'Entradas con origen conocido' },
          { key: 'origen_desconocido', label: 'Entradas con origen desconocido', note: 'Origen desconocido sigue siendo desconocido: no se completa ni se estima.' },
          { key: 'entregas', label: 'Entregas enlazadas' },
          { key: 'parcelas', label: 'Parcelas declaradas como origen' },
        ],
        rows: rows.map((r) => ({ lot_code: r.lot_code, origin_status: r.origin_status, entradas: Number(r.entradas), origen_conocido: Number(r.origen_conocido), origen_desconocido: Number(r.origen_desconocido), entregas: Number(r.entregas), parcelas: Number(r.parcelas) })),
        totals: [
          { key: 'lotes', label: 'Lotes', value: t.lotes },
          { key: 'completos', label: 'Con origen declarado completo', value: t.completos },
          { key: 'incompletos', label: 'Con origen incompleto', value: t.incompletos },
          { key: 'sin_entradas', label: 'Sin entradas vigentes', value: t.sin_entradas },
          { key: 'completitud', label: 'Completitud de origen declarado (%)', value: lotes === 0 ? 'SIN DENOMINADOR (no hay lotes)' : ((Number(t.completos) * 100) / lotes).toFixed(1) },
        ],
        notes: [
          'Mide ORIGEN DECLARADO, no verificación de campo ni conformidad EUDR.',
          'Sin lotes, la completitud sale SIN DENOMINADOR: no es 0 % ni 100 %.',
          'Las parcelas se cuentan por su vínculo declarado con la entrega; este reporte no incluye coordenadas.',
        ],
        total_rows: lotes,
      };
    }

    // kind === 'dd'
    const verLote = has(ctx, 'lot:read');
    const where = sql`c.organization_id = ${org}`;
    const rows = (await sql<{ case_number: string; subject_type: string; lot_code: string | null; readiness: string | null; snapshot_number: number | null; captured_at: string | null; instantaneas: string; revisiones: string; exportaciones: string }>`
      SELECT c.case_number, c.subject_type, l.lot_code, s.readiness, s.snapshot_number,
             to_char(s.captured_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS captured_at,
             (SELECT count(*) FROM dd_snapshots x WHERE x.organization_id = c.organization_id AND x.case_id = c.id)::text AS instantaneas,
             (SELECT count(*) FROM dd_reviews rv JOIN dd_snapshots sx ON sx.id = rv.snapshot_id WHERE rv.organization_id = c.organization_id AND sx.case_id = c.id)::text AS revisiones,
             (SELECT count(*) FROM dd_exports ex JOIN dd_snapshots sx ON sx.id = ex.snapshot_id WHERE ex.organization_id = c.organization_id AND sx.case_id = c.id)::text AS exportaciones
      FROM dd_cases c
      LEFT JOIN lots l ON l.id = c.subject_id AND l.organization_id = c.organization_id
      LEFT JOIN LATERAL (
        SELECT * FROM dd_snapshots ds WHERE ds.organization_id = c.organization_id AND ds.case_id = c.id
        ORDER BY ds.snapshot_number DESC LIMIT 1
      ) s ON true
      WHERE ${where} ORDER BY c.case_number LIMIT ${lim}`.execute(this.db)).rows;
    const t = (await sql<{ expedientes: string; ready: string; in_progress: string; blocked: string; sin_instantanea: string; exportados: string }>`
      SELECT count(*)::text AS expedientes,
             count(*) FILTER (WHERE s.readiness = 'READY')::text AS ready,
             count(*) FILTER (WHERE s.readiness = 'IN_PROGRESS')::text AS in_progress,
             count(*) FILTER (WHERE s.readiness = 'BLOCKED')::text AS blocked,
             count(*) FILTER (WHERE s.id IS NULL)::text AS sin_instantanea,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM dd_exports ex JOIN dd_snapshots sx ON sx.id = ex.snapshot_id
               WHERE ex.organization_id = c.organization_id AND sx.case_id = c.id AND ex.kind = 'DD_PACKAGE'))::text AS exportados
      FROM dd_cases c LEFT JOIN LATERAL (
        SELECT * FROM dd_snapshots ds WHERE ds.organization_id = c.organization_id AND ds.case_id = c.id
        ORDER BY ds.snapshot_number DESC LIMIT 1
      ) s ON true WHERE ${where}`.execute(this.db)).rows[0];
    return {
      columns: [
        { key: 'case_number', label: 'Expediente' },
        { key: 'subject', label: 'Sujeto', note: verLote ? 'Lote del expediente.' : 'Sin lot:read el reporte no revela el código del lote.' },
        { key: 'readiness', label: 'Preparación (última instantánea)', note: 'READY es preparación INTERNA; no es conformidad ni presentación de DDS.' },
        { key: 'snapshot_number', label: 'Instantánea nº' },
        { key: 'captured_at', label: 'Capturada (UTC)' },
        { key: 'instantaneas', label: 'Instantáneas' },
        { key: 'revisiones', label: 'Revisiones' },
        { key: 'exportaciones', label: 'Exportaciones', note: 'EXPORTED es descarga del paquete, no presentación oficial.' },
      ],
      rows: rows.map((r) => ({
        case_number: r.case_number, subject: verLote ? (r.lot_code ?? r.subject_type) : r.subject_type,
        readiness: r.readiness ?? 'SIN INSTANTÁNEA', snapshot_number: r.snapshot_number, captured_at: r.captured_at,
        instantaneas: Number(r.instantaneas), revisiones: Number(r.revisiones), exportaciones: Number(r.exportaciones),
      })),
      totals: [
        { key: 'expedientes', label: 'Expedientes', value: t.expedientes },
        { key: 'ready', label: 'READY (preparación interna)', value: t.ready },
        { key: 'in_progress', label: 'IN_PROGRESS', value: t.in_progress },
        { key: 'blocked', label: 'BLOCKED', value: t.blocked },
        { key: 'sin_instantanea', label: 'Sin instantánea', value: t.sin_instantanea },
        { key: 'exportados', label: 'Con paquete DD exportado', value: t.exportados },
      ],
      notes: [
        'Contar expedientes BLOCKED es un conteo observado y se publica: lo que no se deduce de él es conformidad.',
        'READY indica preparación interna y EXPORTED indica descarga: ninguno significa presentación oficial de DDS.',
        'Hoy READY es inalcanzable por dependencias abiertas (catálogo de riesgo, D-05, P1-005, P0-028); un 0 en READY no mide el desempeño del equipo.',
      ],
      total_rows: Number(t.expedientes),
    };
  }

  // ---------------------------------------------------------------- endpoints

  @Get()
  async catalog(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    const ctx = await this.ctx(user, orgId, 'report:read');
    return {
      catalog_version: REPORT_CATALOG_VERSION,
      source: 'S1 §97 «Sprint 11 — Reporting». Contrato: docs/decisiones/P0-030-REPORTES.md',
      scope_note: SCOPE_NOTE,
      assigned_scope_note: ASSIGNED_SCOPE_NOTE,
      can_export: has(ctx, 'report:export'),
      reports: ENTITY_REPORTS.map((d) => ({
        kind: d.kind, title: d.title, source: d.source, requires: d.requires, period_applies: d.period_applies, period_note: d.period_note,
        available: d.requires.every((p) => has(ctx, p)),
        missing: d.requires.filter((p) => !has(ctx, p)),
      })),
      geojson: {
        kind: 'plots_geojson', title: 'Exportación GeoJSON de parcelas', source: 'S1 §97 «GeoJSON export»',
        requires: ['plot:read', 'plot:read_geometry', 'report:export'],
        available: ['plot:read', 'plot:read_geometry', 'report:export'].every((p) => has(ctx, p as Permission)),
        missing: ['plot:read', 'plot:read_geometry', 'report:export'].filter((p) => !has(ctx, p as Permission)),
        notice: GEOJSON_NOTICE, regulatory_profile: GEOJSON_REGULATORY,
      },
    };
  }

  @Get('plots/geojson')
  async geojson(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Req() req: AuthedRequest, @Res() res: Response) {
    // Exportación de colección (S1 §97). Reutiliza la capacidad técnica de P0-009 —misma geometría guardada, mismas
    // propiedades, sin reproyectar ni recortar— y le añade el alcance y los permisos del reporte.
    const ctx = await this.ctx(user, orgId, 'report:export');
    for (const p of ['plot:read', 'plot:read_geometry'] as Permission[]) {
      if (!has(ctx, p)) throw forbidden('PERMISSION_DENIED', `La exportación GeoJSON exige ${p}: entrega coordenadas exactas de las parcelas.`);
    }
    const org = ctx.organizationId;
    const rows = (await sql<{ plot_code: string; producer_code: string; version_id: string; version_number: number; geometry: unknown; geometry_type: string; survey_method: string; validation_status: string; technically_valid: boolean | null; area_declared_ha: string | null; area_calculated_ha: string | null; geometry_hash: string | null; source_import_sha256: string | null }>`
      SELECT pl.plot_code, pr.producer_code, v.id AS version_id, v.version_number, ST_AsGeoJSON(v.geometry, 17)::jsonb AS geometry,
             v.geometry_type, v.survey_method, v.validation_status, (ST_IsValidDetail(v.geometry)).valid AS technically_valid,
             v.area_declared_ha::text, v.area_calculated_ha::text, v.geometry_hash, gi.sha256 AS source_import_sha256
      FROM plots pl
      JOIN producers pr ON pr.id = pl.producer_id AND pr.organization_id = pl.organization_id
      JOIN plot_versions v ON v.id = pl.current_version_id AND v.organization_id = pl.organization_id
      LEFT JOIN geometry_imports gi ON gi.id = v.source_import_id AND gi.organization_id = v.organization_id
      WHERE pl.organization_id = ${org} AND pl.deleted_at IS NULL AND v.geometry IS NOT NULL
      ORDER BY pl.plot_code`.execute(this.db)).rows;
    const t = (await sql<{ parcelas: string; solo_superficie: string; sin_version: string }>`
      SELECT count(*)::text AS parcelas,
             count(*) FILTER (WHERE v.id IS NOT NULL AND v.geometry IS NULL)::text AS solo_superficie,
             count(*) FILTER (WHERE pl.current_version_id IS NULL)::text AS sin_version
      FROM plots pl LEFT JOIN plot_versions v ON v.id = pl.current_version_id AND v.organization_id = pl.organization_id
      WHERE pl.organization_id = ${org} AND pl.deleted_at IS NULL`.execute(this.db)).rows[0];
    const generatedAt = new Date().toISOString();
    const collection = {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          plot_code: r.plot_code, producer_code: r.producer_code, version_id: r.version_id, version_number: r.version_number,
          geometry_type: r.geometry_type, survey_method: r.survey_method, validation_status: r.validation_status,
          technically_valid: r.technically_valid, area_declared_ha: r.area_declared_ha, area_calculated_ha: r.area_calculated_ha,
          geometry_hash: r.geometry_hash, source_import_sha256: r.source_import_sha256,
          crs: 'WGS84 longitud/latitud (RFC 7946)',
        },
      })),
      // Miembro ajeno (RFC 7946 §6.1 lo permite): declara qué NO va dentro, en vez de dejar un archivo que parezca completo.
      terra_link: {
        format: GEOJSON_EXPORT_FORMAT, catalog_version: REPORT_CATALOG_VERSION, organization_id: org, generated_at: generatedAt,
        counts: { parcelas_vigentes: Number(t.parcelas), exportadas: rows.length, solo_superficie_declarada: Number(t.solo_superficie), sin_version_vigente: Number(t.sin_version) },
        omitted_note: 'Las parcelas sin geometría NO se exportan y NO se inventan: una superficie declarada no es una ubicación. Su número se declara arriba.',
        validation_note: 'validation_status = NOT_VALIDATED significa SIN EVALUAR, no inválida. technically_valid es el dictamen geométrico de PostGIS, no la validación GIS de negocio (P0-010, pendiente de D-05).',
        notice: GEOJSON_NOTICE,
        regulatory_profile: { status: 'PENDING', depends_on: 'D-05', note: GEOJSON_REGULATORY },
        recalculation: EXPORT_RECALC_NOTE,
        coverage: COVERAGE,
      },
    };
    const body = Buffer.from(JSON.stringify(collection, null, 2), 'utf8');
    const sha256 = createHash('sha256').update(body).digest('hex');
    await this.audit.record(this.db, {
      organizationId: org, actorUserId: user.id, action: 'report.geojson_export', entityType: 'report', entityId: null, requestId: req.requestId, result: 'SUCCESS',
      after: { format: GEOJSON_EXPORT_FORMAT, catalog_version: REPORT_CATALOG_VERSION, sha256, features: rows.length, omitted_without_geometry: Number(t.solo_superficie) + Number(t.sin_version), generated_at: generatedAt },
    });
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="parcelas-${generatedAt.slice(0, 10)}.geojson"`);
    res.setHeader('X-Content-Sha256', sha256);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  }

  @Get(':kind')
  async entity(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('kind') kind: string, @Query() q: ReportPeriodDto) {
    const ctx = await this.ctx(user, orgId, 'report:read');
    const d = this.def(kind);
    this.requireAll(ctx, d);
    const period: Period = { from: d.period_applies ? q.from ?? null : null, to: d.period_applies ? q.to ?? null : null };
    const built = await this.build(ctx, d.kind, period);
    return {
      ...this.meta(period, new Date().toISOString()),
      kind: d.kind, title: d.title, source: d.source, requires: d.requires, period_applies: d.period_applies, period_note: d.period_note,
      can_export: has(ctx, 'report:export'),
      ...built,
      returned_rows: built.rows.length,
      truncated: built.rows.length < built.total_rows,
    };
  }

  @Get(':kind/export')
  async exportEntity(
    @CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('kind') kind: string,
    @Req() req: AuthedRequest, @Query() q: ReportPeriodDto, @Res() res: Response,
  ) {
    const ctx = await this.ctx(user, orgId, 'report:export');
    const d = this.def(kind);
    this.requireAll(ctx, d);
    const period: Period = { from: d.period_applies ? q.from ?? null : null, to: d.period_applies ? q.to ?? null : null };
    const built = await this.build(ctx, d.kind, period);
    const org = await this.db.selectFrom('organizations').select('name').where('id', '=', ctx.organizationId).executeTakeFirstOrThrow();
    const generatedAt = new Date().toISOString();
    const m = this.meta(period, generatedAt);
    const head: Array<[string, string]> = [
      ['formato', REPORT_EXPORT_FORMAT], ['catalogo', REPORT_CATALOG_VERSION], ['reporte', d.title], ['fuente', d.source],
      ['organizacion', org.name], ['organizacion_id', ctx.organizationId],
      ['periodo_desde', period.from ?? 'no aplica'], ['periodo_hasta', period.to ?? 'no aplica'], ['periodo_nota', d.period_note],
      ['generado', generatedAt], ['recalculo', EXPORT_RECALC_NOTE], ['fechas', `${m.time_basis.period_bounds} ${m.time_basis.civil_dates}`],
      ['alcance', m.scope_note], ['alcance_asignado', m.assigned_scope_note], ['interpretacion', m.interpretation_note],
      ['cobertura_historica', `${COVERAGE.note} ${COVERAGE.not_reconstructed} Detalle: ${COVERAGE.reference}`],
      ['filas', `${built.rows.length} de ${built.total_rows}${built.rows.length < built.total_rows ? ' (truncado; los totales cubren el conjunto completo)' : ''}`],
      ['limite', m.limit_note],
      ...built.notes.map((n, i) => [`nota_${i + 1}`, n] as [string, string]),
      ...built.totals.map((t) => [`total_${t.key}`, `${t.label}: ${t.value}`] as [string, string]),
      ['nota_formato', 'Formato local provisional. No acredita conformidad EUDR ni aprobación de ninguna autoridad.'],
    ];
    const lines = [
      ...head.map(([k, v]) => `# ${csvCell(k)},${csvCell(v)}`),
      built.columns.map((c) => csvCell(c.key)).join(','),
      ...built.rows.map((r) => built.columns.map((c) => csvCell(r[c.key] === null || r[c.key] === undefined ? '' : String(r[c.key]))).join(',')),
    ];
    const body = Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
    const sha256 = createHash('sha256').update(body).digest('hex');
    await this.audit.record(this.db, {
      organizationId: ctx.organizationId, actorUserId: user.id, action: 'report.export', entityType: 'report', entityId: null, requestId: req.requestId, result: 'SUCCESS',
      after: { format_version: REPORT_EXPORT_FORMAT, catalog_version: REPORT_CATALOG_VERSION, report: d.kind, sha256, period, rows: built.rows.length, total_rows: built.total_rows, generated_at: generatedAt },
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${d.kind}-${generatedAt.slice(0, 10)}.csv"`);
    res.setHeader('X-Content-Sha256', sha256);
    res.send(body);
  }
}
