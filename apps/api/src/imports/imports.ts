import {
  Body, Controller, Get, HttpCode, Inject, Injectable, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import type { Response } from 'express';
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import { DB } from '../db/database';
import type { Database, ImportBatchesTable } from '../db/schema';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import type { Permission } from '../authz/catalog';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { PII_CIPHER, PiiCipher } from '../crypto/pii';
import { ProducersService, type EditableField } from '../producers/producers';
import { ProductsService } from '../products/products';
import { DEFAULT_XLSX_LIMITS, XlsxError, readXlsx, writeXlsx, type XlsxCell } from './xlsx';
import {
  CLEAR_TOKEN, PRODUCER_FIELDS, PRODUCER_TEMPLATE_SHEET, PRODUCER_TEMPLATE_VERSION, TEMPLATE_RULES, type TemplateField,
} from './producer-template';
import { PRODUCT_FIELDS, PRODUCT_TEMPLATE_RULES, PRODUCT_TEMPLATE_SHEET, PRODUCT_TEMPLATE_VERSION } from './product-template';
import { PLOT_FIELDS, PLOT_TEMPLATE_RULES, PLOT_TEMPLATE_SHEET, PLOT_TEMPLATE_VERSION } from './plot-template';
import { PlotsService, type PlotEditable } from '../plots/plots';

// P0-026 — Importación Excel (RF-26, QA-03; S1 §§61–63; docs/09 «Importación»; docs/UX_UI §20.3).
// Flujo común a todas las plantillas: plantilla → carga (análisis del archivo, sin tocar entidades) → mapeo explícito →
// vista previa (solo lectura, calculada en vivo con los permisos actuales) → confirmación atómica (revalida permisos,
// alcance y versiones con bloqueo y exige que el plan no haya cambiado: plan_hash) → resultado e informe.
// - Clave de reimportación: el código de la entidad dentro de la organización. Un código existente ACTUALIZA solo los
//   campos mapeados con valor (o #BORRAR en campos que lo admiten); sin diferencias → «sin cambios» (sin versión, evento
//   ni auditoría de entidad). Reimportar el mismo archivo no duplica nada.
// - Celda vacía = sin dato (no borra). Columna sin mapear = desconocido (no cambia). #BORRAR = petición explícita de vaciar.
// - Cada plantilla aplica los casos de uso de su entidad (createInTx/updateInTx): mismos permisos, versiones, eventos,
//   auditoría y restricciones que el alta y la edición manuales.
// - Atomicidad: todo el lote o nada. Una fila con error bloquea la confirmación (no hay importación parcial).
// - `import:manage` no concede nada sobre las entidades: cada plantilla exige además los permisos de su entidad.

type Batch = Selectable<ImportBatchesTable>;
type Db = Kysely<Database> | Transaction<Database>;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MEDIA_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ATOMICITY = {
  mode: 'ATOMIC',
  description: 'Se guarda todo el lote o nada. Un lote con filas con error no se puede confirmar: corrige el archivo y vuelve a cargarlo. Si algo cambia entre la vista previa y la confirmación, no se guarda nada y se pide revisar de nuevo.',
} as const;

interface UploadedXlsx { buffer: Buffer; originalname?: string; size: number }
/** Celda almacenada (cifrada): v = valor, f = tenía fórmula, n = celda numérica. */
interface StoredCell { v: string; f?: 1; n?: 1 }
interface Mapping { columns: Record<string, string> }

type FieldState = 'PROVIDED' | 'MISSING' | 'CLEAR' | 'NOT_MAPPED';
/** Calidad del dato (S1 §63). Importar nunca produce VERIFIED. */
const QUALITY: Record<FieldState, 'LEGACY' | 'MISSING' | 'UNKNOWN'> = { PROVIDED: 'LEGACY', CLEAR: 'MISSING', MISSING: 'MISSING', NOT_MAPPED: 'UNKNOWN' };
interface RowIssue { column: string | null; field: string | null; code: string; message: string }
export interface PlannedRow {
  row_number: number;
  key: string | null;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  entity_id: string | null;
  expected_version: number | null;
  changed_fields: string[];
  fields: Record<string, { state: FieldState; quality: string; value?: string | null }>;
  errors: RowIssue[];
  warnings: RowIssue[];
  /** Valores a escribir (null = vaciar). Interno: no se devuelve. */
  patch: Record<string, string | null>;
}
interface ApplyFrom { reason: string; source: Record<string, unknown> }

/** Plantilla: campos, reglas y la parte específica de su entidad (resolver contra lo registrado y aplicar). */
interface ImportTemplate {
  version: 'PRODUCTORES_V1' | 'PRODUCTOS_V1' | 'PARCELAS_V1';
  slug: 'producers' | 'products' | 'plots';
  sheet: string;
  entity: string;
  keyField: string;
  fields: TemplateField[];
  rules: string[];
  /** Permisos de la entidad (basta uno) sin los cuales la plantilla no se puede usar (además de import:manage). */
  usePermissions?: Permission[];
  /**
   * Permisos necesarios (todos) para ver muestras de columnas NO mapeadas o mapeadas a campos de identidad: una columna
   * suelta puede traer datos personales o coordenadas. Sin ellos solo se muestran columnas mapeadas a campos no sensibles.
   */
  samplePermissions: Permission[];
  newStatus: string;
  entityColumn: 'producer_id' | 'product_id' | 'plot_id';
  keyFormatMessage: string;
  resolve(db: Db, ctx: TenantContext, rows: PlannedRow[], colOf: Map<string, string>, lock: boolean): Promise<void>;
  apply(trx: Transaction<Database>, ctx: TenantContext, user: AuthUser, p: PlannedRow, from: ApplyFrom, requestId?: string): Promise<{ id: string; reviews: number }>;
  /** Códigos de error y restricciones que indican un cambio concurrente durante la confirmación. */
  concurrency: { codes: string[]; constraints: string[] };
  codeOf(db: Db, orgId: string, ids: string[]): Promise<Map<string, string>>;
}

const colName = (i: number) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const normHeader = (h: string) => h.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const rowAad = (org: string, batch: string, row: number) => `import_row|${org}|${batch}|${row}`;

class MappingDto {
  @ApiProperty({ description: 'Columna (letra) → campo de la plantilla. Las columnas no incluidas se ignoran.', example: { A: 'producer_code', B: 'first_name' } })
  @IsObject() columns!: Record<string, string>;
  @ApiProperty({ description: 'row_version del lote leído' }) @IsInt() @Min(1) expected_version!: number;
}

class CommitDto {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiProperty({ description: 'plan_hash de la vista previa revisada' }) @Matches(/^[0-9a-f]{64}$/) plan_hash!: string;
}

class PreviewQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

@Injectable()
export class ImportsService {
  private readonly templates: Record<ImportTemplate['version'], ImportTemplate>;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(PII_CIPHER) private readonly cipher: PiiCipher,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly producers: ProducersService,
    private readonly products: ProductsService,
    private readonly plots: PlotsService,
  ) {
    this.templates = { PRODUCTORES_V1: this.producerTemplate(), PRODUCTOS_V1: this.productTemplate(), PARCELAS_V1: this.plotTemplate() };
  }

  private tpl(version: string): ImportTemplate {
    const t = this.templates[version as ImportTemplate['version']];
    if (!t) throw new AppError(422, 'TEMPLATE_NOT_AVAILABLE', 'Esa plantilla no está disponible. Plantillas: productores, productos y parcelas.', [{ field: 'template', reason: 'NOT_IMPLEMENTED' }]);
    return t;
  }
  private bySlug(slug: string): ImportTemplate {
    const t = Object.values(this.templates).find((x) => x.slug === slug);
    if (!t) throw notFound();
    return t;
  }

  /** import:manage + permiso propio de la plantilla (si lo tiene). `mutation` bloquea organizaciones suspendidas. */
  private async ctx(user: AuthUser, orgId: string, mutation: boolean, t?: ImportTemplate): Promise<TenantContext> {
    const ctx = await this.authz.require(user, orgId, 'import:manage', { mutation });
    if (t && !this.usable(ctx, t)) {
      throw forbidden('PERMISSION_DENIED', `Tu rol no permite gestionar ${t.entity}: el permiso general de importación no basta.`);
    }
    return ctx;
  }
  private usable(ctx: TenantContext, t: ImportTemplate) { return !t.usePermissions || t.usePermissions.some((p) => ctx.permissions.includes(p)); }
  private identity(ctx: TenantContext) { return ctx.permissions.includes('producer:read_identity'); }

  // ------------------------------------------------------------------ plantillas

  private producerTemplate(): ImportTemplate {
    const svc = this.producers;
    return {
      version: PRODUCER_TEMPLATE_VERSION, slug: 'producers', sheet: PRODUCER_TEMPLATE_SHEET, entity: 'productores', keyField: 'producer_code',
      fields: PRODUCER_FIELDS, rules: TEMPLATE_RULES, newStatus: 'DRAFT', entityColumn: 'producer_id', samplePermissions: ['producer:read_identity'],
      keyFormatMessage: 'Código no válido: letras, números, punto, guion o guion bajo (1–40).',
      concurrency: { codes: ['PRODUCER_CODE_TAKEN', 'VERSION_CONFLICT'], constraints: ['producers_code_uq'] },
      codeOf: async (db, orgId, ids) => new Map((ids.length ? await db.selectFrom('producers').select(['id', 'producer_code']).where('organization_id', '=', orgId).where('id', 'in', ids).execute() : []).map((r) => [r.id, r.producer_code])),
      resolve: async (db, ctx, planned, colOf, lock) => {
        const keyCol = colOf.get('producer_code') ?? null;
        const identity = this.identity(ctx);
        const existing = await svc.byCodes(db, ctx.organizationId, planned.filter((p) => p.key).map((p) => p.key!), lock);
        // Mismo mensaje para un código inexistente que el rol no puede crear y para un código ocupado fuera del alcance de
        // lectura: ninguna de las dos respuestas revela si el productor existe, su id, sus datos ni su estado.
        const notAvailable = (p: PlannedRow) => p.errors.push({ column: keyCol, field: 'producer_code', code: 'CODE_NOT_AVAILABLE', message: 'Ese código no está disponible para tu importación.' });
        for (const p of planned) {
          if (!p.key || p.errors.length) continue;
          const row = existing.get(p.key);
          if (!row) {
            if (!ctx.permissions.includes('producer:create')) { notAvailable(p); continue; }
            const fields = Object.fromEntries(Object.entries(p.patch).filter(([, v]) => v !== null)) as Partial<Record<EditableField, string | null>>;
            for (const code of svc.validateNames(fields)) p.errors.push({ column: null, field: null, code, message: code === 'DOCUMENT_PAIR_REQUIRED' ? 'El tipo y el número de documento van juntos.' : 'Indica nombre y apellido, o la razón social.' });
            if (p.errors.length) continue;
            p.action = 'CREATE';
            p.patch = fields;
            p.changed_fields = Object.keys(fields);
            continue;
          }
          const scope = svc.scopeOf(ctx, row);
          if (!scope.read) { notAvailable(p); continue; }
          if (row.status === 'INACTIVE') { p.errors.push({ column: null, field: null, code: 'PRODUCER_INACTIVE', message: 'El productor está dado de baja; no se actualiza por importación.' }); continue; }
          if (!scope.update) { p.errors.push({ column: null, field: null, code: 'PERMISSION_DENIED_UPDATE', message: 'Tu rol no permite modificar este productor.' }); continue; }
          const current = svc.decrypted(row, identity);
          const patch = p.patch as Partial<Record<EditableField, string | null>>;
          const changed = (Object.keys(patch) as EditableField[]).filter((k) => patch[k] !== current[k]);
          for (const code of svc.validateNames({ ...current, ...patch })) p.errors.push({ column: null, field: null, code, message: code === 'DOCUMENT_PAIR_REQUIRED' ? 'El tipo y el número de documento van juntos (contando lo ya registrado).' : 'El productor quedaría sin nombre y apellido ni razón social.' });
          if (p.errors.length) continue;
          p.entity_id = row.id;
          p.expected_version = Number(row.row_version);
          p.changed_fields = changed;
          p.patch = Object.fromEntries(changed.map((k) => [k, patch[k] ?? null]));
          p.action = changed.length ? 'UPDATE' : 'UNCHANGED';
        }
      },
      apply: async (trx, ctx, user, p, from, requestId) => {
        if (p.action === 'CREATE') {
          const r = await svc.createInTx(trx, ctx, user, p.key!, p.patch as Partial<Record<EditableField, string | null>>, { status: 'DRAFT', assignee: svc.defaultAssignee(ctx), requestId, changeType: 'IMPORT_CREATE', ...from });
          return { id: r.producer.id, reviews: Number(r.pendingReviews ?? 0) };
        }
        const r = await svc.updateInTx(trx, ctx, user, p.entity_id!, p.expected_version!, p.patch as Partial<Record<EditableField, string | null>>, { requestId, changeType: 'IMPORT_UPDATE', ...from });
        return { id: p.entity_id!, reviews: Number(r.pendingReviews ?? 0) };
      },
    };
  }

  private productTemplate(): ImportTemplate {
    const svc = this.products;
    const IMMUTABLE = PRODUCT_FIELDS.filter((f) => f.immutable).map((f) => f.field as string);
    return {
      version: PRODUCT_TEMPLATE_VERSION, slug: 'products', sheet: PRODUCT_TEMPLATE_SHEET, entity: 'productos', keyField: 'code',
      fields: PRODUCT_FIELDS, rules: PRODUCT_TEMPLATE_RULES, usePermissions: ['product:manage'], samplePermissions: [], newStatus: 'ACTIVE', entityColumn: 'product_id',
      keyFormatMessage: 'Código no válido: MAYÚSCULAS, números, guion o guion bajo (2–40).',
      concurrency: { codes: ['PRODUCT_CODE_TAKEN', 'VERSION_CONFLICT'], constraints: ['products_code_uq'] },
      codeOf: async (db, orgId, ids) => new Map((ids.length ? await db.selectFrom('products').select(['id', 'code']).where('organization_id', '=', orgId).where('id', 'in', ids).execute() : []).map((r) => [r.id, r.code])),
      resolve: async (db, ctx, planned, colOf, lock) => {
        const manage = ctx.permissions.includes('product:manage');
        const cats = await svc.catalogs(db);
        const existing = await svc.byCodes(db, ctx.organizationId, planned.filter((p) => p.key).map((p) => p.key!), lock);
        for (const p of planned) {
          // Catálogos de sistema: código exacto, sin equivalencias ni conversiones.
          for (const [field, set, code, label] of [['product_state', cats.states, 'PRODUCT_STATE_UNKNOWN', 'estado o presentación'], ['unit', cats.units, 'UNIT_UNKNOWN', 'unidad']] as const) {
            const v = p.patch[field];
            if (typeof v === 'string' && !set.has(v)) p.errors.push({ column: colOf.get(field) ?? null, field, code, message: `«${v.slice(0, 40)}» no es un código de ${label} del catálogo. Valores admitidos: ${[...set].sort().join(', ')}.` });
          }
          if (!p.key || p.errors.length) continue;
          const row = existing.get(p.key);
          if (!manage) { p.errors.push({ column: null, field: null, code: row ? 'PERMISSION_DENIED_UPDATE' : 'PERMISSION_DENIED_CREATE', message: 'Tu rol no permite gestionar productos.' }); continue; }
          if (!row) {
            for (const f of PRODUCT_FIELDS.filter((x) => x.requiredOnCreate)) {
              if (typeof p.patch[f.field] !== 'string') p.errors.push({ column: colOf.get(f.field) ?? null, field: f.field, code: 'REQUIRED_FOR_CREATE', message: `${f.label}: obligatorio para un producto nuevo.` });
            }
            if (p.errors.length) continue;
            p.action = 'CREATE';
            p.patch = Object.fromEntries(Object.entries(p.patch).filter(([, v]) => v !== null));
            p.changed_fields = Object.keys(p.patch);
            continue;
          }
          if (row.status === 'INACTIVE') { p.errors.push({ column: null, field: null, code: 'PRODUCT_INACTIVE', message: 'El producto está inactivo; no se reactiva ni se edita por importación.' }); continue; }
          for (const f of IMMUTABLE) {
            const v = p.patch[f];
            if (v !== undefined && v !== row[f as 'product_state' | 'unit']) p.errors.push({ column: colOf.get(f) ?? null, field: f, code: 'PRODUCT_FIELD_IMMUTABLE', message: `No se puede cambiar después del alta (registrado: ${row[f as 'product_state' | 'unit']}). Crea otro producto.` });
          }
          if (p.errors.length) continue;
          const editable = Object.fromEntries(Object.entries(p.patch).filter(([k]) => !IMMUTABLE.includes(k)));
          const changed = Object.keys(editable).filter((k) => editable[k] !== row[k as 'name' | 'scientific_name' | 'variety']);
          p.entity_id = row.id;
          p.expected_version = Number(row.row_version);
          p.changed_fields = changed;
          p.patch = Object.fromEntries(changed.map((k) => [k, editable[k]]));
          p.action = changed.length ? 'UPDATE' : 'UNCHANGED';
        }
      },
      apply: async (trx, ctx, user, p, from, requestId) => {
        if (p.action === 'CREATE') {
          const r = await svc.createInTx(trx, ctx.organizationId, user, { code: p.key!, name: p.patch.name!, product_state: p.patch.product_state!, unit: p.patch.unit!, scientific_name: p.patch.scientific_name ?? null, variety: p.patch.variety ?? null }, requestId, from);
          return { id: r.id, reviews: 0 };
        }
        await svc.updateInTx(trx, ctx.organizationId, user, p.entity_id!, { expected_version: p.expected_version!, ...p.patch } as never, requestId, from);
        return { id: p.entity_id!, reviews: 0 };
      },
    };
  }

  private plotTemplate(): ImportTemplate {
    const plots = this.plots;
    const producers = this.producers;
    const EDITABLE = ['name', 'crop', 'variety', 'land_use', 'province', 'canton', 'parish'];
    const has = (ctx: TenantContext, p: string) => ctx.permissions.includes(p as Permission);
    return {
      version: PLOT_TEMPLATE_VERSION, slug: 'plots', sheet: PLOT_TEMPLATE_SHEET, entity: 'parcelas', keyField: 'plot_code',
      fields: PLOT_FIELDS, rules: PLOT_TEMPLATE_RULES, newStatus: 'ACTIVE', entityColumn: 'plot_id',
      usePermissions: ['plot:create', 'plot:create_assigned', 'plot:update', 'plot:update_assigned'],
      samplePermissions: ['plot:read_geometry', 'producer:read_identity'],
      keyFormatMessage: 'Código no válido: letras, números, punto, guion o guion bajo (1–40).',
      concurrency: { codes: ['PLOT_CODE_TAKEN', 'VERSION_CONFLICT', 'GEOMETRY_PRESENT', 'PRODUCER_NOT_AVAILABLE', 'PRODUCER_INACTIVE', 'PLOT_INACTIVE'], constraints: ['plots_code_uq', 'plot_versions_number_uq'] },
      codeOf: async (db, orgId, ids) => new Map((ids.length ? await db.selectFrom('plots').select(['id', 'plot_code']).where('organization_id', '=', orgId).where('id', 'in', ids).execute() : []).map((r) => [r.id, r.plot_code])),
      resolve: async (db, ctx, planned, colOf, lock) => {
        const keyCol = colOf.get('plot_code') ?? null;
        const prodCol = colOf.get('producer_code') ?? null;
        const canCreate = has(ctx, 'plot:create') || has(ctx, 'plot:create_assigned');
        const existing = await plots.byCodes(db, ctx.organizationId, planned.filter((p) => p.key).map((p) => p.key!), lock);
        const producerCodes = [...new Set(planned.map((p) => p.patch.producer_code).filter((c): c is string => typeof c === 'string'))];
        const producerRows = await producers.byCodes(db, ctx.organizationId, producerCodes);
        // Mismo mensaje para referencias inexistentes y fuera de alcance: no revelan existencia, id, datos ni estado.
        const codeNotAvailable = (p: PlannedRow) => p.errors.push({ column: keyCol, field: 'plot_code', code: 'CODE_NOT_AVAILABLE', message: 'Ese código de parcela no está disponible para tu importación.' });
        const producerNotAvailable = (p: PlannedRow) => p.errors.push({ column: prodCol, field: 'producer_code', code: 'PRODUCER_NOT_AVAILABLE', message: 'El productor indicado no está disponible para ti en esta organización.' });
        for (const p of planned) {
          const area = p.patch.area_declared_ha;
          if (typeof area === 'string' && !p.errors.some((e) => e.field === 'area_declared_ha') && !(Number(area) > 0)) p.errors.push({ column: colOf.get('area_declared_ha') ?? null, field: 'area_declared_ha', code: 'INVALID_AREA', message: 'La superficie declarada debe ser mayor que 0 hectáreas.' });
          if (!p.key || p.errors.length) continue;
          const row = existing.get(p.key);
          const { producer_code: producerCode, area_declared_ha: _a, ...rest } = p.patch;
          void _a;
          if (!row) {
            if (!canCreate) { codeNotAvailable(p); continue; }
            for (const f of PLOT_FIELDS.filter((x) => x.requiredOnCreate)) {
              if (typeof p.patch[f.field] !== 'string') p.errors.push({ column: colOf.get(f.field) ?? null, field: f.field, code: 'REQUIRED_FOR_CREATE', message: `${f.label}: obligatorio para una parcela nueva.` });
            }
            if (p.errors.length) continue;
            const producer = producerRows.get(producerCode!);
            if (!producer || !plots.scope(ctx, producer.assigned_membership_id).create) { producerNotAvailable(p); continue; }
            if (producer.status === 'INACTIVE') { p.errors.push({ column: prodCol, field: 'producer_code', code: 'PRODUCER_INACTIVE', message: 'El productor está dado de baja; no se le registran parcelas.' }); continue; }
            const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null));
            p.action = 'CREATE';
            p.patch = { ...fields, ...(typeof area === 'string' ? { area_declared_ha: area } : {}), _producer_id: producer.id };
            p.changed_fields = [...Object.keys(fields), ...(typeof area === 'string' ? ['area_declared_ha'] : [])];
            continue;
          }
          const scope = plots.scope(ctx, row.producer_assignee);
          if (!scope.read) { codeNotAvailable(p); continue; }
          if (row.status === 'INACTIVE') { p.errors.push({ column: null, field: null, code: 'PLOT_INACTIVE', message: 'La parcela está dada de baja; no se reactiva ni se edita por importación.' }); continue; }
          if (!scope.update) { p.errors.push({ column: null, field: null, code: 'PERMISSION_DENIED_UPDATE', message: 'Tu rol no permite modificar esta parcela.' }); continue; }
          if (typeof producerCode === 'string' && producerCode !== row.producer_code) {
            p.errors.push({ column: prodCol, field: 'producer_code', code: 'PLOT_PRODUCER_CHANGE_NOT_ALLOWED', message: 'El productor no coincide con el de la parcela: la importación no reasigna parcelas.' });
            continue;
          }
          const changed = EDITABLE.filter((k) => k in rest && rest[k] !== row[k as PlotEditable]);
          let areaChanged = false;
          if (typeof area === 'string' && (row.current_area_declared_ha === null || Number(row.current_area_declared_ha) !== Number(area))) {
            if (row.current_geometry_type) {
              p.errors.push({ column: colOf.get('area_declared_ha') ?? null, field: 'area_declared_ha', code: 'DECLARED_AREA_WITH_GEOMETRY', message: 'La parcela tiene geometría registrada: una versión solo con superficie declarada la sustituiría. Registra la superficie desde el flujo de geometría de la parcela.' });
              continue;
            }
            areaChanged = true;
          }
          p.entity_id = row.id;
          p.expected_version = Number(row.row_version);
          p.changed_fields = [...changed, ...(areaChanged ? ['area_declared_ha'] : [])];
          p.patch = { ...Object.fromEntries(changed.map((k) => [k, rest[k]])), ...(areaChanged ? { area_declared_ha: area as string } : {}) };
          p.action = p.changed_fields.length ? 'UPDATE' : 'UNCHANGED';
        }
      },
      apply: async (trx, ctx, user, p, from, requestId) => {
        const { area_declared_ha: area, _producer_id: producerId, ...fields } = p.patch;
        let id = p.entity_id;
        let version = p.expected_version;
        if (p.action === 'CREATE') {
          const r = await plots.createInTx(trx, ctx, user, producerId!, p.key!, fields as Partial<Record<PlotEditable, string | null>> & { crop: string }, requestId, from);
          id = r.plot.id;
          version = Number(r.plot.row_version);
        } else if (Object.keys(fields).length) {
          const r = await plots.updateInTx(trx, ctx, user, id!, version!, fields as Partial<Record<PlotEditable, string | null>>, requestId, from);
          version = Number(r.after.row_version);
        }
        if (typeof area === 'string') await plots.declaredVersionInTx(trx, ctx, user, id!, version!, area, requestId, from);
        return { id: id!, reviews: 0 };
      },
    };
  }

  private templateInfoOf(t: ImportTemplate) {
    return {
      template: t.version, sheet: t.sheet, entity: t.entity, key_field: t.keyField, clear_token: CLEAR_TOKEN, new_status: t.newStatus,
      fields: t.fields.map((f) => ({ field: f.field, header: f.header, label: f.label, required: !!f.required, required_on_create: !!f.requiredOnCreate, immutable: !!f.immutable, clearable: !!f.clearable, catalog: f.catalog ?? null, identity: f.identity, max_length: f.maxLength, rule: f.rule })),
      rules: t.rules, atomicity: ATOMICITY,
      limits: { max_file_bytes: MAX_FILE_BYTES, max_rows: DEFAULT_XLSX_LIMITS.maxRows, max_columns: DEFAULT_XLSX_LIMITS.maxColumns, formats: ['.xlsx'] },
      not_implemented: ['entregas', 'lotes'],
    };
  }

  async templateInfo(user: AuthUser, orgId: string, slug: string) {
    const t = this.bySlug(slug);
    await this.ctx(user, orgId, false, t);
    return this.templateInfoOf(t);
  }

  /** Plantillas que este rol puede usar (la UI no ofrece las demás; el servidor las rechaza igual). */
  async availableTemplates(user: AuthUser, orgId: string) {
    const ctx = await this.ctx(user, orgId, false);
    return Object.values(this.templates).map((t) => ({ template: t.version, slug: t.slug, entity: t.entity, usable: this.usable(ctx, t), required_permission: t.usePermissions?.join(' | ') ?? null }));
  }

  async template(user: AuthUser, orgId: string, slug: string) {
    const t = this.bySlug(slug);
    await this.ctx(user, orgId, false, t);
    const catalogs = t.slug === 'products' ? await this.products.catalogs(this.db) : null;
    return {
      version: t.version,
      bytes: writeXlsx([
        { name: t.sheet, rows: [t.fields.map((f) => f.header)], widths: t.fields.map((f) => Math.max(14, f.header.length + 4)) },
        {
          name: 'instrucciones',
          rows: [
            ['columna', 'campo', 'obligatorio', 'dato de identidad', 'regla'],
            ...t.fields.map((f) => [f.header, f.label, f.required ? 'sí' : f.requiredOnCreate ? 'para altas' : 'no', f.identity ? 'sí' : 'no', f.rule]),
            ...(catalogs ? [[], ['catálogo', 'códigos admitidos'], ['estado_presentacion', [...catalogs.states].sort().join(', ')], ['unidad', [...catalogs.units].sort().join(', ')]] : []),
            [], ['reglas generales'], ...t.rules.map((r) => [r]),
            [], [`plantilla ${t.version}`],
          ],
          widths: [20, 22, 12, 16, 100],
        },
      ]),
    };
  }

  // ------------------------------------------------------------------ carga

  async upload(user: AuthUser, orgId: string, operationId: string | undefined, template: string | undefined, file: UploadedXlsx | undefined, requestId?: string) {
    if (!operationId || !/^[0-9a-f-]{36}$/i.test(operationId)) throw new AppError(400, 'VALIDATION_FAILED', 'operation_id es obligatorio (UUID).', [{ field: 'operation_id', reason: 'REQUIRED_UUID' }]);
    const t = this.tpl(template ?? PRODUCER_TEMPLATE_VERSION);
    if (!file) throw new AppError(400, 'VALIDATION_FAILED', 'Adjunta un archivo .xlsx.', [{ field: 'file', reason: 'REQUIRED' }]);
    const ctx = await this.ctx(user, orgId, true, t);
    if (!/\.xlsx$/i.test(file.originalname ?? '')) {
      throw new AppError(422, 'FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan libros de Excel .xlsx (sin macros). Los formatos .xls, .xlsm y .csv no se admiten.', [{ field: 'file', reason: 'EXTENSION' }]);
    }
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const prior = await this.db.selectFrom('import_batches').selectAll().where('organization_id', '=', orgId).where('operation_id', '=', operationId).executeTakeFirst();
    if (prior) {
      if (prior.sha256 !== hash || prior.template !== t.version) throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó con otro archivo. Vuelve a seleccionar el archivo.');
      return { replayed: true, batch: await this.batchView(ctx, prior) };
    }

    let sheet;
    try {
      sheet = readXlsx(file.buffer, t.sheet);
    } catch (e) {
      if (e instanceof XlsxError) throw new AppError(422, e.code, e.message, [{ field: 'file', reason: e.code }]);
      throw e;
    }
    const [head, ...data] = sheet.rows;
    if (!head || data.length === 0) throw new AppError(422, 'FILE_EMPTY', 'La hoja no tiene filas de datos debajo de los encabezados.', [{ field: 'file', reason: 'FILE_EMPTY' }]);
    if (data.length > DEFAULT_XLSX_LIMITS.maxRows) throw new AppError(422, 'FILE_TOO_MANY_ROWS', `La hoja tiene más de ${DEFAULT_XLSX_LIMITS.maxRows} filas de datos.`);
    const width = Math.max(head.cells.length, ...data.map((r) => r.cells.length));
    const headers = Array.from({ length: width }, (_, i) => ({ column: colName(i), header: (head.cells[i]?.value ?? '').trim().slice(0, 120) || null }));

    const id = randomUUID();
    try {
      const batch = await this.db.transaction().execute(async (trx) => {
        const row = await trx.insertInto('import_batches').values({
          id, organization_id: orgId, template: t.version, status: 'UPLOADED', sha256: hash, byte_size: file.buffer.length,
          original_filename: (file.originalname ?? '').slice(0, 255) || null, sheet_name: sheet.name.slice(0, 120), headers: JSON.stringify(headers),
          row_count: data.length, operation_id: operationId, created_by: user.id,
        }).returningAll().executeTakeFirstOrThrow();
        for (let i = 0; i < data.length; i += 500) {
          await trx.insertInto('import_rows').values(data.slice(i, i + 500).map((r) => {
            const cells: Record<string, StoredCell> = {};
            r.cells.forEach((c: XlsxCell | undefined, ci) => { if (c && (c.value !== '' || c.formula)) cells[colName(ci)] = { v: c.value, ...(c.formula ? { f: 1 as const } : {}), ...(c.numeric ? { n: 1 as const } : {}) }; });
            return { organization_id: orgId, batch_id: id, row_number: r.rowNumber, cells_enc: this.cipher.encrypt(JSON.stringify(cells), rowAad(orgId, id, r.rowNumber)) };
          })).execute();
        }
        await this.audit.record(trx, {
          organizationId: orgId, actorUserId: user.id, action: 'import.upload', entityType: 'import_batch', entityId: id, requestId, result: 'SUCCESS',
          after: { template: t.version, sha256: hash, byte_size: file.buffer.length, rows: data.length, columns: width },
        });
        return row;
      });
      return { replayed: false, batch: await this.batchView(ctx, batch) };
    } catch (e) {
      if ((e as { constraint?: string }).constraint === 'import_batches_operation_uq') {
        const again = await this.db.selectFrom('import_batches').selectAll().where('organization_id', '=', orgId).where('operation_id', '=', operationId).executeTakeFirst();
        if (again && again.sha256 === hash) return { replayed: true, batch: await this.batchView(ctx, again) };
        throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó con otro archivo.');
      }
      throw e;
    }
  }

  /** Lote de la organización. Un lote de una plantilla que el rol no puede usar → 403 (no se muestra su contenido). */
  private async load(db: Db, ctx: TenantContext, id: string, lock = false) {
    let q = db.selectFrom('import_batches').selectAll().where('organization_id', '=', ctx.organizationId).where('id', '=', id);
    if (lock) q = q.forUpdate();
    const row = await q.executeTakeFirst();
    if (!row) throw notFound();
    const t = this.tpl(row.template);
    if (!this.usable(ctx, t)) throw forbidden('PERMISSION_DENIED', `Tu rol no permite gestionar ${t.entity}: el permiso general de importación no basta.`);
    return { b: row, t };
  }

  private async rows(db: Db, b: Batch) {
    const rows = await db.selectFrom('import_rows').selectAll().where('organization_id', '=', b.organization_id).where('batch_id', '=', b.id).orderBy('row_number').execute();
    return rows.map((r) => ({ ...r, cells: r.cells_enc ? JSON.parse(this.cipher.decrypt(r.cells_enc, rowAad(b.organization_id, b.id, r.row_number))) as Record<string, StoredCell> : null }));
  }

  /** Vista del lote. Muestras de columnas: con identidad visible, todas; si no, solo de columnas mapeadas a campos no personales. */
  private async batchView(ctx: TenantContext, b: Batch) {
    const t = this.tpl(b.template);
    const byKey = new Map(t.fields.map((f) => [f.field, f]));
    const headers = b.headers as Array<{ column: string; header: string | null }>;
    const mapping = (b.mapping as Mapping | null)?.columns ?? {};
    const identity = this.identity(ctx);
    const allSamples = t.samplePermissions.every((p) => ctx.permissions.includes(p));
    const sampleRows = b.status === 'DISCARDED' ? [] : (await this.rows(this.db, b)).slice(0, 3);
    const byHeader = new Map(t.fields.map((f) => [normHeader(f.header), f.field]));
    const previous = await this.db.selectFrom('import_batches').select(['id', 'status', 'created_at', 'closed_at'])
      .where('organization_id', '=', b.organization_id).where('sha256', '=', b.sha256).where('template', '=', b.template).where('id', '!=', b.id).orderBy('created_at', 'desc').limit(5).execute();
    return {
      id: b.id, template: b.template, entity: t.entity, status: b.status, row_version: Number(b.row_version), created_at: b.created_at, closed_at: b.closed_at,
      file: { filename: b.original_filename, byte_size: b.byte_size, sha256: b.sha256, sheet: b.sheet_name }, row_count: b.row_count,
      columns: headers.map((h) => {
        const mapped = mapping[h.column] ?? null;
        const showSamples = allSamples || (mapped !== null && !byKey.get(mapped)?.identity);
        return {
          column: h.column, header: h.header, mapped_field: mapped,
          suggested_field: h.header ? byHeader.get(normHeader(h.header)) ?? null : null,
          samples: showSamples ? sampleRows.map((r) => r.cells?.[h.column]?.v ?? '').filter((v) => v !== '').map((v) => v.slice(0, 60)) : null,
        };
      }),
      samples_hidden_reason: allSamples ? null : t.slug === 'plots'
        ? 'Una columna sin asociar puede traer coordenadas o datos personales: solo se muestran ejemplos de columnas asociadas a campos de esta plantilla, porque tu rol no ve coordenadas exactas o datos de identidad.'
        : 'Tu rol no ve datos de identidad: las muestras solo se muestran para columnas asociadas a campos no personales.',
      mapping: b.mapping ? mapping : null, summary: b.summary,
      same_file_previous_imports: previous,
      atomicity: ATOMICITY,
      can_map_identity: identity || !t.fields.some((f) => f.identity),
    };
  }

  async list(user: AuthUser, orgId: string) {
    const ctx = await this.ctx(user, orgId, false);
    const usable = Object.values(this.templates).filter((t) => this.usable(ctx, t)).map((t) => t.version);
    return this.db.selectFrom('import_batches')
      .select(['id', 'template', 'status', 'original_filename', 'row_count', 'summary', 'created_at', 'closed_at'])
      .where('organization_id', '=', orgId).where('template', 'in', usable).orderBy('created_at', 'desc').limit(20).execute();
  }

  async get(user: AuthUser, orgId: string, id: string) {
    const ctx = await this.ctx(user, orgId, false);
    return this.batchView(ctx, (await this.load(this.db, ctx, id)).b);
  }

  // ------------------------------------------------------------------ mapeo

  async setMapping(user: AuthUser, orgId: string, id: string, dto: MappingDto, requestId?: string) {
    const ctx = await this.ctx(user, orgId, true);
    return this.db.transaction().execute(async (trx) => {
      const { b, t } = await this.load(trx, ctx, id, true);
      if (b.status === 'COMMITTED' || b.status === 'DISCARDED') throw conflict(b.status === 'COMMITTED' ? 'IMPORT_ALREADY_COMMITTED' : 'IMPORT_DISCARDED', 'Este lote ya está cerrado.');
      if (Number(b.row_version) !== dto.expected_version) throw conflict('VERSION_CONFLICT', 'Otra persona cambió este lote. Recarga para ver el mapeo actual.');
      const byKey = new Map(t.fields.map((f) => [f.field, f]));
      const columns = new Set((b.headers as Array<{ column: string }>).map((h) => h.column));
      const out: Record<string, string> = {};
      const issues: Array<{ field: string; reason: string }> = [];
      const used = new Set<string>();
      for (const [col, field] of Object.entries(dto.columns ?? {})) {
        if (field === null || field === '') continue;
        if (!columns.has(col)) { issues.push({ field: col, reason: 'UNKNOWN_COLUMN' }); continue; }
        const def = byKey.get(field);
        if (!def) { issues.push({ field: col, reason: 'UNKNOWN_FIELD' }); continue; }
        if (used.has(field)) { issues.push({ field: col, reason: 'FIELD_MAPPED_TWICE' }); continue; }
        used.add(field);
        out[col] = def.field;
      }
      if (!used.has(t.keyField)) issues.push({ field: t.keyField, reason: 'REQUIRED_FIELD_NOT_MAPPED' });
      if (issues.length) throw new AppError(422, 'MAPPING_INVALID', 'Revisa el mapeo: cada campo una sola vez, columnas existentes y el código asociado.', issues);
      const identityMapped = Object.values(out).filter((f) => byKey.get(f)!.identity);
      if (identityMapped.length && !this.identity(ctx)) {
        throw new AppError(403, 'MAPPING_IDENTITY_NOT_ALLOWED', 'Tu rol no permite importar datos de identidad (documento, teléfono, dirección). Quita esas columnas del mapeo.', identityMapped.map((f) => ({ field: f, reason: 'IDENTITY_PERMISSION_REQUIRED' })));
      }
      const after = await trx.updateTable('import_batches')
        .set({ status: 'MAPPED', mapping: JSON.stringify({ columns: out }), plan_hash: null, mapped_by: user.id, mapped_at: new Date(), row_version: sql`row_version + 1` })
        .where('id', '=', id).where('organization_id', '=', orgId).returningAll().executeTakeFirstOrThrow();
      await this.audit.record(trx, {
        organizationId: orgId, actorUserId: user.id, action: 'import.map', entityType: 'import_batch', entityId: id, requestId, result: 'SUCCESS',
        after: { mapped_fields: Object.values(out), ignored_columns: [...columns].filter((c) => !out[c]).length },
      });
      return this.batchView(ctx, after);
    });
  }

  // ------------------------------------------------------------------ plan (vista previa y confirmación)

  /** Calcula el plan con los permisos y datos ACTUALES. `lock` bloquea las entidades existentes (confirmación). */
  private async plan(db: Db, ctx: TenantContext, b: Batch, t: ImportTemplate, lock: boolean) {
    const mapping = (b.mapping as Mapping).columns;
    const colOf = new Map(Object.entries(mapping).map(([c, f]) => [f, c]));
    const rows = await this.rows(db, b);
    const planned: PlannedRow[] = rows.map((r) => {
      const p: PlannedRow = { row_number: r.row_number, key: null, action: 'ERROR', entity_id: null, expected_version: null, changed_fields: [], fields: {}, errors: [], warnings: [], patch: {} };
      for (const def of t.fields) {
        const col = colOf.get(def.field);
        if (!col) { p.fields[def.field] = { state: 'NOT_MAPPED', quality: QUALITY.NOT_MAPPED }; continue; }
        const cell = r.cells?.[col];
        const issue = (code: string, message: string) => p.errors.push({ column: col, field: def.field, code, message });
        if (cell?.f) { issue('FORMULA_NOT_ALLOWED', 'La celda tiene una fórmula; escribe el valor.'); p.fields[def.field] = { state: 'MISSING', quality: QUALITY.MISSING }; continue; }
        const raw = (cell?.v ?? '').trim();
        if (raw === '') { p.fields[def.field] = { state: 'MISSING', quality: QUALITY.MISSING }; continue; }
        if (raw === CLEAR_TOKEN) {
          if (!def.clearable) issue('CANNOT_CLEAR', `${def.label} no se puede vaciar con ${CLEAR_TOKEN}.`);
          p.fields[def.field] = { state: 'CLEAR', quality: QUALITY.CLEAR, value: null };
          if (def.field !== t.keyField) p.patch[def.field] = null;
          continue;
        }
        if (raw.length > def.maxLength) issue('TOO_LONG', `Máximo ${def.maxLength} caracteres.`);
        else if (def.pattern && !def.pattern.test(raw)) issue('INVALID_FORMAT', def.field === t.keyField ? t.keyFormatMessage : 'Formato no válido.');
        if (cell?.n && (def.field === 'document_number' || def.field === 'phone')) {
          p.warnings.push({ column: col, field: def.field, code: 'NUMERIC_CELL', message: 'Celda numérica de Excel: comprueba que no se perdieron ceros iniciales.' });
        }
        p.fields[def.field] = { state: 'PROVIDED', quality: QUALITY.PROVIDED, value: raw };
        if (def.field === t.keyField) p.key = raw;
        else p.patch[def.field] = raw;
      }
      if (!p.key && !p.errors.some((e) => e.field === t.keyField)) p.errors.push({ column: colOf.get(t.keyField)!, field: t.keyField, code: 'REQUIRED', message: 'Falta el código.' });
      return p;
    });

    // Códigos repetidos dentro del archivo: ninguna de esas filas se aplica (no se elige una «ganadora»).
    const seen = new Map<string, number[]>();
    for (const p of planned) if (p.key) seen.set(p.key, [...(seen.get(p.key) ?? []), p.row_number]);
    for (const p of planned) {
      const dup = p.key ? seen.get(p.key)! : [];
      if (dup.length > 1) p.errors.push({ column: colOf.get(t.keyField)!, field: t.keyField, code: 'DUPLICATE_IN_FILE', message: `Código repetido en las filas ${dup.join(', ')}.` });
    }

    await t.resolve(db, ctx, planned, colOf, lock);
    for (const p of planned) if (p.errors.length) { p.action = 'ERROR'; p.entity_id = null; p.expected_version = null; p.changed_fields = []; }

    const hash = createHash('sha256').update(JSON.stringify([b.id, b.row_version, b.mapping, planned.map((p) => [p.row_number, p.action, p.entity_id, p.expected_version, p.changed_fields, p.errors.map((e) => e.code)])])).digest('hex');
    const count = (a: PlannedRow['action']) => planned.filter((p) => p.action === a).length;
    return {
      rows: planned, plan_hash: hash,
      summary: { total: planned.length, create: count('CREATE'), update: count('UPDATE'), unchanged: count('UNCHANGED'), error: count('ERROR'), warnings: planned.filter((p) => p.warnings.length).length },
    };
  }

  /** Fila para la respuesta: identidad visible solo con producer:read_identity; sin `patch` interno. */
  private rowView(ctx: TenantContext, t: ImportTemplate, p: PlannedRow) {
    const identity = this.identity(ctx);
    const byKey = new Map(t.fields.map((f) => [f.field, f]));
    const fields = Object.fromEntries(Object.entries(p.fields).map(([f, v]) => [f, byKey.get(f)?.identity && !identity && v.value !== undefined ? { ...v, value: v.value === null ? null : '••••' } : v]));
    const { patch: _patch, key, entity_id, ...rest } = p;
    void _patch;
    return { ...rest, code: key, entity_id, [t.entityColumn]: entity_id, ...(t.slug === 'producers' ? { producer_code: key } : {}), fields, validation_status: 'NOT_VALIDATED' as const };
  }

  async preview(user: AuthUser, orgId: string, id: string, q: PreviewQuery) {
    const ctx = await this.ctx(user, orgId, false);
    const { b, t } = await this.load(this.db, ctx, id);
    if (b.status === 'UPLOADED') throw conflict('MAPPING_REQUIRED', 'Asocia primero las columnas a los campos.');
    if (b.status === 'DISCARDED') throw conflict('IMPORT_DISCARDED', 'Este lote fue descartado.');
    if (b.status === 'COMMITTED') throw conflict('IMPORT_ALREADY_COMMITTED', 'Este lote ya se confirmó; consulta su resultado.');
    const plan = await this.plan(this.db, ctx, b, t, false);
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 100;
    return {
      batch_id: b.id, template: b.template, batch_row_version: Number(b.row_version), plan_hash: plan.plan_hash, summary: plan.summary, atomicity: ATOMICITY,
      can_commit: plan.summary.error === 0 && plan.summary.create + plan.summary.update > 0 && ctx.organizationStatus === 'ACTIVE',
      new_status: t.newStatus, persisted: false,
      rows: plan.rows.slice(offset, offset + limit).map((p) => this.rowView(ctx, t, p)), offset, limit,
    };
  }

  // ------------------------------------------------------------------ confirmación

  async commit(user: AuthUser, orgId: string, id: string, dto: CommitDto, requestId?: string) {
    const ctx = await this.ctx(user, orgId, true); // permisos ACTUALES: la autorización de la vista previa no basta
    let tpl: ImportTemplate | null = null;
    try {
      return await this.db.transaction().execute(async (trx) => {
        const { b, t } = await this.load(trx, ctx, id, true);
        tpl = t;
        if (b.status === 'COMMITTED') {
          if (b.commit_operation_id === dto.operation_id) return { replayed: true, batch_id: b.id, status: b.status, summary: b.summary };
          throw conflict('IMPORT_ALREADY_COMMITTED', 'Este lote ya se confirmó.');
        }
        if (b.status === 'DISCARDED') throw conflict('IMPORT_DISCARDED', 'Este lote fue descartado.');
        if (b.status === 'UPLOADED') throw conflict('MAPPING_REQUIRED', 'Asocia primero las columnas a los campos.');
        const plan = await this.plan(trx, ctx, b, t, true);
        if (plan.plan_hash !== dto.plan_hash) {
          throw conflict('PREVIEW_STALE', 'Algo cambió desde la vista previa (datos, permisos o mapeo). No se guardó nada: revisa la vista previa de nuevo.');
        }
        if (plan.summary.error > 0) throw new AppError(422, 'BATCH_HAS_ERRORS', `Hay ${plan.summary.error} fila(s) con error. La importación es atómica: corrige el archivo y vuelve a cargarlo.`);
        if (plan.summary.create + plan.summary.update === 0) throw conflict('NOTHING_TO_IMPORT', 'Todas las filas coinciden con lo registrado: no hay nada que importar.');

        let duplicateReviews = 0;
        for (const p of plan.rows) {
          const from = { reason: `Importación Excel ${b.id} · fila ${p.row_number}`, source: { kind: 'EXCEL_IMPORT', import_batch_id: b.id, row_number: p.row_number, template: b.template } };
          let entityId = p.entity_id;
          let action: 'CREATED' | 'UPDATED' | 'UNCHANGED' = 'UNCHANGED';
          if (p.action === 'CREATE' || p.action === 'UPDATE') {
            const r = await t.apply(trx, ctx, user, p, from, requestId);
            entityId = r.id;
            duplicateReviews += r.reviews;
            action = p.action === 'CREATE' ? 'CREATED' : 'UPDATED';
          }
          await trx.updateTable('import_rows').set({ result_action: action, [t.entityColumn]: entityId, changed_fields: p.changed_fields } as never)
            .where('organization_id', '=', orgId).where('batch_id', '=', b.id).where('row_number', '=', p.row_number).execute();
        }
        const summary = { created: plan.summary.create, updated: plan.summary.update, unchanged: plan.summary.unchanged, failed: 0, duplicate_reviews_pending: duplicateReviews, new_status: t.newStatus };
        await trx.updateTable('import_batches')
          .set({ status: 'COMMITTED', plan_hash: plan.plan_hash, summary: JSON.stringify(summary), commit_operation_id: dto.operation_id, closed_by: user.id, closed_at: new Date(), row_version: sql`row_version + 1` })
          .where('id', '=', b.id).where('organization_id', '=', orgId).execute();
        await this.audit.record(trx, {
          organizationId: orgId, actorUserId: user.id, action: 'import.commit', entityType: 'import_batch', entityId: b.id, requestId, result: 'SUCCESS',
          after: { template: b.template, ...summary, plan_hash: plan.plan_hash, sha256: b.sha256 },
        });
        return { replayed: false, batch_id: b.id, status: 'COMMITTED' as const, summary };
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      const c = (e as { constraint?: string }).constraint;
      if (c === 'import_batches_commit_operation_uq') throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó en otra confirmación.');
      // Cambio concurrente en mitad de la confirmación (p. ej. otra importación creó el mismo código): nada se guardó.
      const t = tpl as ImportTemplate | null;
      if (t && ((code && t.concurrency.codes.includes(code)) || (c && t.concurrency.constraints.includes(c)))) {
        throw conflict('IMPORT_CONCURRENT_CHANGE', `Otro cambio afectó a estos ${t.entity} mientras confirmabas. No se guardó nada: revisa la vista previa de nuevo.`);
      }
      throw e;
    }
  }

  async discard(user: AuthUser, orgId: string, id: string, requestId?: string) {
    const ctx = await this.ctx(user, orgId, true);
    return this.db.transaction().execute(async (trx) => {
      const { b } = await this.load(trx, ctx, id, true);
      if (b.status === 'COMMITTED' || b.status === 'DISCARDED') throw conflict(b.status === 'COMMITTED' ? 'IMPORT_ALREADY_COMMITTED' : 'IMPORT_DISCARDED', 'Este lote ya está cerrado.');
      await trx.updateTable('import_batches').set({ status: 'DISCARDED', closed_by: user.id, closed_at: new Date(), row_version: sql`row_version + 1` })
        .where('id', '=', id).where('organization_id', '=', orgId).execute();
      // Las celdas leídas (pueden traer identidad) no se conservan en un lote descartado.
      await trx.updateTable('import_rows').set({ cells_enc: null }).where('organization_id', '=', orgId).where('batch_id', '=', id).execute();
      await this.audit.record(trx, { organizationId: orgId, actorUserId: user.id, action: 'import.discard', entityType: 'import_batch', entityId: id, requestId, result: 'SUCCESS', after: { rows: b.row_count } });
      return { id, status: 'DISCARDED' as const };
    });
  }

  /** Informe por fila (XLSX de solo texto). Sin valores de identidad: campos, estados, códigos y mensajes. */
  async report(user: AuthUser, orgId: string, id: string, requestId?: string) {
    const ctx = await this.ctx(user, orgId, false);
    const { b, t } = await this.load(this.db, ctx, id);
    const head = ['fila', 'codigo', 'resultado', 'campos_cambiados', 'errores', 'advertencias', ...t.fields.map((f) => `estado_${f.header}`)];
    let body: string[][];
    if (b.status === 'COMMITTED') {
      const rows = await this.db.selectFrom('import_rows').select(['row_number', 'result_action', 'changed_fields', 'producer_id', 'product_id', 'plot_id'])
        .where('organization_id', '=', orgId).where('batch_id', '=', id).orderBy('row_number').execute();
      const idOf = (r: { producer_id: string | null; product_id: string | null; plot_id: string | null }) => (r.producer_id ?? r.product_id ?? r.plot_id) as string;
      const codes = await t.codeOf(this.db, orgId, rows.map(idOf).filter(Boolean));
      body = rows.map((r) => [String(r.row_number), codes.get(idOf(r)) ?? '', r.result_action ?? '', (r.changed_fields ?? []).join(' '), '', '']);
    } else if (b.status === 'MAPPED') {
      const plan = await this.plan(this.db, ctx, b, t, false);
      body = plan.rows.map((p) => [String(p.row_number), p.key ?? '', p.action, p.changed_fields.join(' '),
        p.errors.map((e) => `${e.column ?? ''} ${e.code}: ${e.message}`.trim()).join(' | '), p.warnings.map((w) => `${w.column ?? ''} ${w.code}`.trim()).join(' | '),
        ...t.fields.map((f) => `${p.fields[f.field]?.state ?? ''} (${p.fields[f.field]?.quality ?? ''})`)]);
    } else {
      throw conflict(b.status === 'UPLOADED' ? 'MAPPING_REQUIRED' : 'IMPORT_DISCARDED', b.status === 'UPLOADED' ? 'Asocia primero las columnas a los campos.' : 'Este lote fue descartado.');
    }
    await this.audit.record(this.db, { organizationId: orgId, actorUserId: user.id, action: 'import.report_download', entityType: 'import_batch', entityId: id, requestId, result: 'SUCCESS', after: { status: b.status } });
    return {
      filename: `informe-importacion-${b.id.slice(0, 8)}.xlsx`,
      bytes: writeXlsx([{ name: 'informe', rows: [head, ...body] }, { name: 'lote', rows: [['campo', 'valor'], ['lote', b.id], ['plantilla', b.template], ['estado', b.status], ['archivo_sha256', b.sha256], ['atomicidad', ATOMICITY.description], ['validación', 'Datos importados: LEGACY / NOT_VALIDATED. Importar no verifica ni aprueba nada.']] }]),
    };
  }
}

@ApiTags('imports')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Plantillas de importación y si tu rol puede usarlas' })
  templates(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.availableTemplates(user, orgId);
  }

  @Get('templates/producers')
  @ApiOperation({ summary: 'Reglas de la plantilla de productores (PRODUCTORES_V1)' })
  producersInfo(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.templateInfo(user, orgId, 'producers');
  }

  @Get('templates/producers.xlsx')
  @ApiOperation({ summary: 'Descargar la plantilla de productores' })
  producersFile(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Res() res: Response) {
    return this.sendTemplate(user, orgId, 'producers', res);
  }

  @Get('templates/products')
  @ApiOperation({ summary: 'Reglas de la plantilla de productos (PRODUCTOS_V1); exige product:manage' })
  productsInfo(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.templateInfo(user, orgId, 'products');
  }

  @Get('templates/products.xlsx')
  @ApiOperation({ summary: 'Descargar la plantilla de productos; exige product:manage' })
  productsFile(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Res() res: Response) {
    return this.sendTemplate(user, orgId, 'products', res);
  }

  @Get('templates/plots')
  @ApiOperation({ summary: 'Reglas de la plantilla de parcelas (PARCELAS_V1); exige permiso de alta o edición de parcelas' })
  plotsInfo(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.templateInfo(user, orgId, 'plots');
  }

  @Get('templates/plots.xlsx')
  @ApiOperation({ summary: 'Descargar la plantilla de parcelas' })
  plotsFile(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Res() res: Response) {
    return this.sendTemplate(user, orgId, 'plots', res);
  }

  private async sendTemplate(user: AuthUser, orgId: string, slug: string, res: Response) {
    const { bytes, version } = await this.service.template(user, orgId, slug);
    res.setHeader('Content-Type', MEDIA_XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-${version.toLowerCase()}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'operation_id'], properties: { file: { type: 'string', format: 'binary' }, operation_id: { type: 'string', format: 'uuid' }, template: { type: 'string', enum: [PRODUCER_TEMPLATE_VERSION, PRODUCT_TEMPLATE_VERSION, PLOT_TEMPLATE_VERSION], default: PRODUCER_TEMPLATE_VERSION } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @UploadedFile() file: UploadedXlsx | undefined,
    @Body() body: Record<string, string>, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.service.upload(user, orgId, body?.operation_id, body?.template, file, req.requestId);
    res.status(r.replayed ? 200 : 201);
    return r;
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.service.list(user, orgId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user, orgId, id);
  }

  @Post(':id/mapping')
  @HttpCode(200)
  mapping(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MappingDto, @Req() req: AuthedRequest) {
    return this.service.setMapping(user, orgId, id, dto, req.requestId);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Vista previa (no guarda nada)' })
  preview(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Query() q: PreviewQuery) {
    return this.service.preview(user, orgId, id, q);
  }

  @Post(':id/commit')
  async commit(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommitDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.commit(user, orgId, id, dto, req.requestId);
    res.status(r.replayed ? 200 : 201);
    return r;
  }

  @Post(':id/discard')
  @HttpCode(200)
  discard(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.service.discard(user, orgId, id, req.requestId);
  }

  @Get(':id/report')
  async report(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const { bytes, filename } = await this.service.report(user, orgId, id, req.requestId);
    res.setHeader('Content-Type', MEDIA_XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  }
}
