import { Body, Controller, Get, Inject, Injectable, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Response } from 'express';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { PII_CIPHER, PiiCipher } from '../crypto/pii';
import { PlotsService } from '../plots/plots';
import { structuralIssues, reasonWithoutCoordinates } from '../plots/geometry';
import { readPlotFile, type ReaderOptions, type ReaderResult } from './reader';

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const aad = (org: string, id: string, kind: string) => `plot-file-import:${org}:${id}:${kind}`;
type Db = Kysely<Database> | Transaction<Database>;
interface Batch { id: string; organization_id: string; created_by: string; filename: string; sha256: string; original_enc: string; metadata_enc: string; plan_enc: string | null; plan_hash: string | null; status: string; result: unknown; confirm_operation_id: string | null }
interface PlanRow { row_numbers: number[]; plot_code: string; producer_id: string | null; producer_code: string; crop: string; plot_id: string | null; expected_version: number | null; action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR'; geometry: Record<string, unknown> | null; geometry_changed: boolean; crop_changed: boolean; previous_geometry: unknown; area_calculated_ha: string | null; errors: string[]; warnings: string[] }
interface Plan { options: ReaderOptions; source_crs: string | null; default_crop: string; default_producer_code: string; default_plot_code: string; rows: PlanRow[] }

class PreviewDto {
  @ApiProperty() @IsObject() options!: ReaderOptions;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) default_crop?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) default_producer_code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) default_plot_code?: string;
}
class ConfirmDto {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiProperty() @Matches(/^[0-9a-f]{64}$/) plan_hash!: string;
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() confirm_geometry_changes?: boolean;
}

@Injectable()
export class PlotFileImportsService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>, @Inject(PII_CIPHER) private readonly cipher: PiiCipher,
    private readonly authz: AuthorizationService, private readonly plots: PlotsService, private readonly audit: AuditService) {}

  private async context(user: AuthUser, org: string) {
    const ctx = await this.authz.tenantContext(user, org);
    if (!ctx) throw notFound();
    if (!this.plots.geometryAllowed(ctx) || !['plot:create', 'plot:create_assigned', 'plot:create_own', 'plot:update', 'plot:update_assigned', 'plot:update_own'].some(p => ctx.permissions.includes(p as never))) throw forbidden();
    if (ctx.organizationStatus !== 'ACTIVE') throw forbidden('ORGANIZATION_SUSPENDED', 'La organización está suspendida.');
    return ctx;
  }
  private async batch(db: Db, user: AuthUser, org: string, id: string, lock = false) {
    const result = await sql<Batch>`SELECT * FROM plot_file_imports WHERE organization_id=${org} AND id=${id} AND created_by=${user.id} ${lock ? sql`FOR UPDATE` : sql``}`.execute(db);
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }
  private view(b: Batch) {
    return { id: b.id, filename: b.filename, sha256: b.sha256, status: b.status,
      metadata: JSON.parse(this.cipher.decrypt(b.metadata_enc, aad(b.organization_id, b.id, 'metadata'))) as ReaderResult,
      result: b.result };
  }
  async upload(user: AuthUser, org: string, operation: string | undefined, file: { buffer: Buffer; originalname: string } | undefined, requestId?: string) {
    await this.context(user, org);
    if (!operation || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation)) throw new AppError(422, 'OPERATION_ID_REQUIRED', 'Indica un identificador de operación válido.');
    if (!file || file.buffer.length > 20 * 1024 * 1024) throw new AppError(422, 'FILE_REQUIRED', 'Selecciona un archivo de hasta 20 MB.');
    const hash = digest(file.buffer);
    const prior = await sql<Batch>`SELECT * FROM plot_file_imports WHERE organization_id=${org} AND created_by=${user.id} AND operation_id=${operation}`.execute(this.db);
    if (prior.rows[0]) {
      if (prior.rows[0].sha256 !== hash) throw conflict('OPERATION_ID_REUSED', 'La operación ya corresponde a otro archivo.');
      return this.view(prior.rows[0]);
    }
    const metadata = await readPlotFile(file.originalname, file.buffer);
    // Inspection returns schema, never unassigned geometry or attributes through this endpoint.
    metadata.features = [];
    const id = randomUUID();
    const enc = (text: string, kind: string) => this.cipher.encrypt(text, aad(org, id, kind));
    await this.db.transaction().execute(async trx => {
      await sql`INSERT INTO plot_file_imports (id,organization_id,created_by,operation_id,filename,sha256,original_enc,metadata_enc)
        VALUES (${id},${org},${user.id},${operation},${file.originalname.slice(0,255)},${hash},${enc(file.buffer.toString('base64'), 'original')},${enc(JSON.stringify(metadata), 'metadata')})`.execute(trx);
      await this.audit.record(trx, { organizationId: org, actorUserId: user.id, action: 'plot_import.uploaded', entityType: 'plot_import', entityId: id, requestId, result: 'SUCCESS', after: { sha256: hash, format: metadata.format } });
    });
    return this.view(await this.batch(this.db, user, org, id));
  }
  async get(user: AuthUser, org: string, id: string) {
    await this.context(user, org);
    return this.view(await this.batch(this.db, user, org, id));
  }
  private async resolve(db: Db, ctx: TenantContext, source: ReaderResult['features'], options: ReaderOptions, defaultCrop: string, lock: boolean, defaultProducer = '', defaultPlot = ''): Promise<PlanRow[]> {
    const columns = options.columns ?? {};
    const rows: PlanRow[] = [];
    const seen = new Set<string>();
    // A producer account can only target its current self-link. No frontend identifier grants this scope.
    const ownOnly = !ctx.permissions.includes('plot:create' as never) && !ctx.permissions.includes('plot:create_assigned' as never)
      && !ctx.permissions.includes('plot:update' as never) && !ctx.permissions.includes('plot:update_assigned' as never);
    for (const feature of source) {
      const value = (key: keyof NonNullable<ReaderOptions['columns']>) => columns[key] ? String(feature.properties[columns[key]!] ?? '').trim() : '';
      const row: PlanRow = { row_numbers: feature.row_numbers, plot_code: value('plot_code') || (source.length === 1 ? defaultPlot : ''), producer_code: value('producer_code') || defaultProducer, producer_id: null, crop: value('crop') || defaultCrop,
        plot_id: null, expected_version: null, action: 'ERROR', geometry: feature.geometry, geometry_changed: false, crop_changed: false, previous_geometry: null, area_calculated_ha: null, errors: [...feature.errors], warnings: [...feature.warnings] };
      rows.push(row);
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(row.plot_code)) row.errors.push('PLOT_CODE_REQUIRED_OR_INVALID');
      if (seen.has(row.plot_code)) row.errors.push('PLOT_CODE_DUPLICATED');
      seen.add(row.plot_code);
      if (!row.crop || row.crop.length > 60) row.errors.push('CROP_REQUIRED_OR_INVALID');
      let producersQuery = db.selectFrom('producers').select(['id', 'producer_code', 'status', 'assigned_membership_id', 'self_membership_id']).where('organization_id', '=', ctx.organizationId);
      producersQuery = ownOnly ? producersQuery.where('self_membership_id', '=', ctx.membershipId) : producersQuery.where('producer_code', '=', row.producer_code);
      const producers = await (lock ? producersQuery.forShare() : producersQuery).execute();
      const producer = producers.length === 1 ? producers[0] : undefined;
      const existing = await this.plots.byCodes(db, ctx.organizationId, [row.plot_code], lock);
      const plot = existing.get(row.plot_code);
      if (producer && producer.status === 'ACTIVE'
        && (!ownOnly || !row.producer_code || row.producer_code === producer.producer_code)
        && this.plots.scope(ctx, producer.assigned_membership_id, producer.self_membership_id)[plot ? 'update' : 'create']) {
        row.producer_id = producer.id;
        row.producer_code = producer.producer_code;
      } else row.errors.push('PRODUCER_NOT_AVAILABLE');
      if (plot) {
        if (!producer || plot.producer_id !== producer.id || !this.plots.scope(ctx, plot.producer_assignee, producer.self_membership_id).update) row.errors.push('PLOT_NOT_AVAILABLE');
        else {
          row.plot_id = plot.id;
          row.expected_version = Number(plot.row_version);
          if (plot.status !== 'ACTIVE') row.errors.push('PLOT_INACTIVE');
        }
      }
      if (!row.geometry) row.errors.push('GEOMETRY_REQUIRED');
      else if (structuralIssues(row.geometry).length) row.errors.push('GEOMETRY_STRUCTURE_INVALID');
      if (row.errors.length) { row.geometry = null; continue; }
      const g = await sql<{ valid: boolean; reason: string | null; area: string | null; same: boolean; previous: unknown }>`
        WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(row.geometry)}),4326) geom)
        SELECT (ST_IsValidDetail(g.geom)).valid AS valid,(ST_IsValidDetail(g.geom)).reason AS reason,
          CASE WHEN GeometryType(g.geom) IN ('POLYGON','MULTIPOLYGON') AND (ST_IsValidDetail(g.geom)).valid THEN round((ST_Area(g.geom::geography)/10000)::numeric,6)::text ELSE NULL END AS area,
          coalesce((SELECT ST_Equals(v.geometry,g.geom) FROM plot_versions v WHERE v.organization_id=${ctx.organizationId} AND v.id=${plot?.current_version_id ?? null}),false) AS same,
          (SELECT ST_AsGeoJSON(v.geometry,17)::jsonb FROM plot_versions v WHERE v.organization_id=${ctx.organizationId} AND v.id=${plot?.current_version_id ?? null}) AS previous FROM g`.execute(db);
      const info = g.rows[0];
      if (!info.valid) { row.errors.push(`GEOMETRY_INVALID: ${reasonWithoutCoordinates(info.reason) ?? 'INVALID'}`); continue; }
      row.geometry_changed = !info.same;
      row.crop_changed = !!plot && plot.crop !== row.crop;
      row.previous_geometry = info.previous;
      row.area_calculated_ha = info.area;
      if (row.geometry?.type === 'Point') row.warnings.push('REFERENCE_POINT_PERIMETER_PENDING');
      else {
        const overlaps = await sql<{ n: string }>`WITH proposed AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(row.geometry)}),4326) geom)
          SELECT count(*) n FROM plots p JOIN producers pr ON pr.organization_id=p.organization_id AND pr.id=p.producer_id
          JOIN plot_versions v ON v.organization_id=p.organization_id AND v.id=p.current_version_id CROSS JOIN proposed g
          WHERE p.organization_id=${ctx.organizationId} AND p.id IS DISTINCT FROM ${plot?.id ?? null}::uuid AND p.deleted_at IS NULL
          AND (${ctx.permissions.includes('plot:read' as never)} OR (${ctx.permissions.includes('plot:read_assigned' as never)} AND pr.assigned_membership_id=${ctx.membershipId})
            OR (${ctx.permissions.includes('plot:read_own' as never)} AND pr.self_membership_id=${ctx.membershipId}))
          AND CASE WHEN GeometryType(v.geometry) IN ('POLYGON','MULTIPOLYGON') AND (ST_IsValidDetail(v.geometry)).valid
            THEN ST_Area(ST_Intersection(v.geometry,g.geom)::geography)>0 ELSE false END`.execute(db);
        if (Number(overlaps.rows[0].n)>0) row.warnings.push('POSSIBLE_OVERLAP_REVIEW_REQUIRED');
      }
      row.action = !plot ? 'CREATE' : row.geometry_changed || plot.crop !== row.crop ? 'UPDATE' : 'UNCHANGED';
      if (plot && row.geometry_changed) row.warnings.push('EXISTING_GEOMETRY_REVIEW_REQUIRED');
    }
    return rows;
  }
  private summary(rows: PlanRow[]) { return { total: rows.length, create: rows.filter(r => r.action === 'CREATE').length, update: rows.filter(r => r.action === 'UPDATE').length, unchanged: rows.filter(r => r.action === 'UNCHANGED').length, error: rows.filter(r => r.action === 'ERROR').length }; }
  async preview(user: AuthUser, org: string, id: string, dto: PreviewDto) {
    const ctx = await this.context(user, org);
    const b = await this.batch(this.db, user, org, id);
    if (b.status === 'COMMITTED') throw conflict('IMPORT_ALREADY_COMMITTED', 'Esta importación ya fue confirmada.');
    const original = Buffer.from(this.cipher.decrypt(b.original_enc, aad(org, id, 'original')), 'base64');
    const file = await readPlotFile(b.filename, original, dto.options);
    if (!file.selected_layer) throw new AppError(422, 'LAYER_REQUIRED', 'Selecciona la capa o pestaña que deseas importar.');
    const rows = await this.resolve(this.db, ctx, file.features, dto.options, dto.default_crop?.trim() ?? '', false, dto.default_producer_code?.trim() ?? '', dto.default_plot_code?.trim() ?? '');
    const plan: Plan = { options: { ...dto.options, layer: file.selected_layer }, source_crs: file.source_crs, default_crop: dto.default_crop?.trim() ?? '', default_producer_code: dto.default_producer_code?.trim() ?? '', default_plot_code: dto.default_plot_code?.trim() ?? '', rows };
    const hash = digest(JSON.stringify(plan));
    await sql`UPDATE plot_file_imports SET plan_enc=${this.cipher.encrypt(JSON.stringify(plan), aad(org,id,'plan'))},plan_hash=${hash},status='PREVIEWED' WHERE organization_id=${org} AND id=${id} AND status <> 'COMMITTED'`.execute(this.db);
    return { plan_hash: hash, can_commit: rows.length > 0 && rows.every(r => r.action !== 'ERROR'), source_crs: file.source_crs, target_crs: 'EPSG:4326', summary: this.summary(rows), rows };
  }
  async confirm(user: AuthUser, org: string, id: string, dto: ConfirmDto, requestId?: string) {
    const ctx = await this.context(user, org);
    if (dto.reason.trim().length < 3) throw new AppError(422, 'REASON_REQUIRED', 'Indica el motivo de la importación.');
    return this.db.transaction().execute(async trx => {
      const organization = await trx.selectFrom('organizations').select('status').where('id','=',org).forShare().executeTakeFirst();
      const membership = await trx.selectFrom('memberships').select('status').where('id','=',ctx.membershipId).where('organization_id','=',org).forShare().executeTakeFirst();
      if (organization?.status !== 'ACTIVE' || membership?.status !== 'ACTIVE') throw forbidden();
      const b = await this.batch(trx, user, org, id, true);
      if (b.status === 'COMMITTED') {
        if (b.confirm_operation_id !== dto.operation_id) throw conflict('IMPORT_ALREADY_COMMITTED', 'La importación ya está confirmada.');
        return { replayed: true, result: b.result };
      }
      if (!b.plan_enc || dto.plan_hash !== b.plan_hash) throw conflict('IMPORT_PREVIEW_STALE', 'Revisa de nuevo el archivo antes de confirmar.');
      const plan = JSON.parse(this.cipher.decrypt(b.plan_enc, aad(org,id,'plan'))) as Plan;
      const source = plan.rows.map(r => ({ row_numbers: r.row_numbers, properties: { _plot: r.plot_code, _producer: r.producer_code, _crop: r.crop }, geometry: r.geometry, errors: r.errors, warnings: r.warnings.filter(w => !['REFERENCE_POINT_PERIMETER_PENDING', 'EXISTING_GEOMETRY_REVIEW_REQUIRED', 'POSSIBLE_OVERLAP_REVIEW_REQUIRED'].includes(w)) }));
      const options: ReaderOptions = { columns: { plot_code: '_plot', producer_code: '_producer', crop: '_crop' } };
      const rows = await this.resolve(trx, ctx, source, options, plan.default_crop, true);
      if (!rows.length || rows.some(r => r.action === 'ERROR')) throw conflict('IMPORT_ROWS_INVALID', 'Hay parcelas por corregir; revisa de nuevo antes de confirmar.');
      if (digest(JSON.stringify({ ...plan, rows })) !== b.plan_hash) throw conflict('IMPORT_PREVIEW_STALE', 'Las parcelas cambiaron. Genera y revisa una nueva vista previa.');
      if (rows.some(r => r.plot_id && r.geometry_changed) && !dto.confirm_geometry_changes) throw conflict('GEOMETRY_CHANGE_CONFIRMATION_REQUIRED', 'Confirma expresamente los cambios de geometrías existentes.');
      const result = { ...this.summary(rows), plots: [] as Array<{ id: string; plot_code: string; action: string }> };
      for (const row of rows) {
        let plotId = row.plot_id;
        const from = { reason: dto.reason.trim(), source: { kind: 'PLOT_FILE_IMPORT', import_id: id, row_numbers: row.row_numbers, source_crs: plan.source_crs, layer: plan.options.layer } };
        if (row.action === 'CREATE') plotId = (await this.plots.createInTx(trx, ctx, user, row.producer_id!, row.plot_code, { crop: row.crop }, requestId, from)).plot.id;
        else if (row.action === 'UPDATE' && row.crop_changed) await this.plots.updateInTx(trx, ctx, user, plotId!, row.expected_version!, { crop: row.crop }, requestId, from);
        if (row.action !== 'UNCHANGED' && row.geometry_changed) await this.plots.importGeometryInTx(trx, ctx, user, plotId!, row.geometry!, { batch_id: id, row_numbers: row.row_numbers }, dto.reason.trim(), requestId);
        result.plots.push({ id: plotId!, plot_code: row.plot_code, action: row.action });
      }
      await sql`UPDATE plot_file_imports SET status='COMMITTED',confirmed_at=now(),confirmed_by=${user.id},confirm_operation_id=${dto.operation_id},result=${JSON.stringify(result)}::jsonb WHERE id=${id} AND organization_id=${org}`.execute(trx);
      await this.audit.record(trx, { organizationId: org, actorUserId: user.id, action: 'plot_import.confirmed', entityType: 'plot_import', entityId: id, requestId, result: 'SUCCESS', reason: dto.reason.trim(), after: this.summary(rows) });
      return { replayed: false, result };
    });
  }
  async original(user: AuthUser, org: string, id: string, requestId?: string) {
    const ctx = await this.context(user, org);
    const b = await this.batch(this.db, user, org, id);
    if (b.plan_enc) {
      const plan = JSON.parse(this.cipher.decrypt(b.plan_enc, aad(org,id,'plan'))) as Plan;
      for (const row of plan.rows) {
        if (!row.producer_id) throw forbidden();
        const producer = await this.db.selectFrom('producers').select(['assigned_membership_id','self_membership_id']).where('organization_id','=',org).where('id','=',row.producer_id).executeTakeFirst();
        if (!producer || !this.plots.scope(ctx,producer.assigned_membership_id,producer.self_membership_id).read) throw forbidden();
      }
    }
    await this.audit.record(this.db, { organizationId: org, actorUserId: user.id, action: 'plot_import.original_download', entityType: 'plot_import', entityId: id, requestId, result: 'SUCCESS' });
    const bytes = Buffer.from(this.cipher.decrypt(b.original_enc, aad(org,id,'original')), 'base64');
    if (digest(bytes) !== b.sha256) throw new AppError(409, 'ORIGINAL_INTEGRITY_MISMATCH', 'El archivo original no pasó la comprobación de integridad.');
    return bytes;
  }
}

@ApiTags('plot-imports')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/plot-imports')
export class PlotFileImportsController {
  constructor(private readonly service: PlotFileImportsService) {}
  @Post() @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, operation_id: { type: 'string', format: 'uuid' } }, required: ['file','operation_id'] } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 1 } }))
  upload(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) org: string, @Body('operation_id') op: string, @UploadedFile() f: { buffer: Buffer; originalname: string }, @Req() req: AuthedRequest) { return this.service.upload(u,org,op,f,req.requestId); }
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) org: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(u,org,id); }
  @Post(':id/preview')
  preview(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) org: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewDto) { return this.service.preview(u,org,id,dto); }
  @Post(':id/confirm')
  confirm(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) org: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto, @Req() req: AuthedRequest) { return this.service.confirm(u,org,id,dto,req.requestId); }
  @Get(':id/original')
  async original(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) org: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const bytes = await this.service.original(u,org,id,req.requestId);
    const file = await this.service.get(u,org,id);
    res.setHeader('Content-Type','application/octet-stream'); res.setHeader('Content-Disposition',`attachment; filename="${file.filename.replace(/[^A-Za-z0-9_.-]/g,'_')}"`); res.setHeader('X-Content-SHA256',digest(bytes)); res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.send(bytes);
  }
}
