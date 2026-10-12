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
import { AppError, conflict, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { PII_CIPHER, PiiCipher } from '../crypto/pii';
import { ProducersService, type EditableField } from '../producers/producers';
import { DEFAULT_XLSX_LIMITS, XlsxError, readXlsx, writeXlsx, type XlsxCell } from './xlsx';
import {
  CLEAR_TOKEN, FIELD_BY_KEY, PRODUCER_FIELDS, PRODUCER_TEMPLATE_SHEET, PRODUCER_TEMPLATE_VERSION, TEMPLATE_RULES, type ImportField,
} from './producer-template';

// P0-026 — Importación Excel (RF-26, QA-03; S1 §§61–63; docs/09 «Importación»; docs/UX_UI §20.3).
// Flujo: plantilla → carga (análisis del archivo, sin tocar entidades) → mapeo explícito → vista previa (solo lectura,
// calculada en vivo con los permisos actuales) → confirmación atómica (revalida permisos, alcance y versiones con bloqueo
// y exige que el plan no haya cambiado: plan_hash) → resultado e informe.
// - Clave de reimportación: código de productor dentro de la organización (único por tenant, P0-005). Un código existente
//   ACTUALIZA solo los campos mapeados con valor (o #BORRAR); si nada cambia, la fila queda «sin cambios» y no genera
//   versión, evento ni auditoría de entidad. Reimportar el mismo archivo no duplica nada.
// - Celda vacía = sin dato (no borra). Columna sin mapear = desconocido (no cambia). #BORRAR = petición explícita de vaciar.
// - Se reutilizan los casos de uso de productor (createInTx/updateInTx): alcance, versión, cifrado de identidad, eventos,
//   auditoría y detección de posibles duplicados (sin fusión). Altas nuevas en BORRADOR: dato heredado no validado.
// - Atomicidad: todo el lote o nada. Una fila con error bloquea la confirmación (no hay importación parcial).

type Batch = Selectable<ImportBatchesTable>;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MEDIA_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ATOMICITY = {
  mode: 'ATOMIC',
  description: 'Se guarda todo el lote o nada. Un lote con filas con error no se puede confirmar: corrige el archivo y vuelve a cargarlo. Si algo cambia entre la vista previa y la confirmación, no se guarda nada y se pide revisar de nuevo.',
} as const;

interface UploadedXlsx { buffer: Buffer; originalname?: string; size: number }
/** Celda almacenada (cifrada): v = valor, f = tenía fórmula, n = celda numérica. */
interface StoredCell { v: string; f?: 1; n?: 1 }
interface Mapping { columns: Record<string, ImportField> }

type FieldState = 'PROVIDED' | 'MISSING' | 'CLEAR' | 'NOT_MAPPED';
/** Calidad del dato (S1 §63). Importar nunca produce VERIFIED. */
const QUALITY: Record<FieldState, 'LEGACY' | 'MISSING' | 'UNKNOWN'> = { PROVIDED: 'LEGACY', CLEAR: 'MISSING', MISSING: 'MISSING', NOT_MAPPED: 'UNKNOWN' };
interface RowIssue { column: string | null; field: ImportField | null; code: string; message: string }
interface PlannedRow {
  row_number: number;
  producer_code: string | null;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  producer_id: string | null;
  expected_version: number | null;
  changed_fields: EditableField[];
  fields: Partial<Record<ImportField, { state: FieldState; quality: string; value?: string | null }>>;
  errors: RowIssue[];
  warnings: RowIssue[];
  patch: Partial<Record<EditableField, string | null>>;
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
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(PII_CIPHER) private readonly cipher: PiiCipher,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly producers: ProducersService,
  ) {}

  private ctx(user: AuthUser, orgId: string, mutation: boolean): Promise<TenantContext> {
    return this.authz.require(user, orgId, 'import:manage', { mutation });
  }

  private identity(ctx: TenantContext) { return ctx.permissions.includes('producer:read_identity'); }

  // ------------------------------------------------------------------ plantilla

  templateInfo() {
    return {
      template: PRODUCER_TEMPLATE_VERSION, sheet: PRODUCER_TEMPLATE_SHEET, clear_token: CLEAR_TOKEN,
      fields: PRODUCER_FIELDS.map((f) => ({ field: f.field, header: f.header, label: f.label, required: !!f.required, identity: f.identity, max_length: f.maxLength, rule: f.rule })),
      rules: TEMPLATE_RULES, atomicity: ATOMICITY,
      limits: { max_file_bytes: MAX_FILE_BYTES, max_rows: DEFAULT_XLSX_LIMITS.maxRows, max_columns: DEFAULT_XLSX_LIMITS.maxColumns, formats: ['.xlsx'] },
      not_implemented: ['parcelas', 'entregas', 'productos', 'lotes'],
    };
  }

  async template(user: AuthUser, orgId: string) {
    await this.ctx(user, orgId, false);
    return writeXlsx([
      { name: PRODUCER_TEMPLATE_SHEET, rows: [PRODUCER_FIELDS.map((f) => f.header)], widths: PRODUCER_FIELDS.map((f) => Math.max(14, f.header.length + 4)) },
      {
        name: 'instrucciones',
        rows: [
          ['columna', 'campo', 'obligatorio', 'dato de identidad', 'regla'],
          ...PRODUCER_FIELDS.map((f) => [f.header, f.label, f.required ? 'sí' : 'no', f.identity ? 'sí' : 'no', f.rule]),
          [], ['reglas generales'], ...TEMPLATE_RULES.map((r) => [r]),
          [], [`plantilla ${PRODUCER_TEMPLATE_VERSION}`],
        ],
        widths: [20, 22, 12, 16, 100],
      },
    ]);
  }

  // ------------------------------------------------------------------ carga

  async upload(user: AuthUser, orgId: string, operationId: string | undefined, template: string | undefined, file: UploadedXlsx | undefined, requestId?: string) {
    if (!operationId || !/^[0-9a-f-]{36}$/i.test(operationId)) throw new AppError(400, 'VALIDATION_FAILED', 'operation_id es obligatorio (UUID).', [{ field: 'operation_id', reason: 'REQUIRED_UUID' }]);
    if ((template ?? PRODUCER_TEMPLATE_VERSION) !== PRODUCER_TEMPLATE_VERSION) {
      throw new AppError(422, 'TEMPLATE_NOT_AVAILABLE', 'Por ahora solo está disponible la plantilla de productores.', [{ field: 'template', reason: 'NOT_IMPLEMENTED' }]);
    }
    if (!file) throw new AppError(400, 'VALIDATION_FAILED', 'Adjunta un archivo .xlsx.', [{ field: 'file', reason: 'REQUIRED' }]);
    const ctx = await this.ctx(user, orgId, true);
    if (!/\.xlsx$/i.test(file.originalname ?? '')) {
      throw new AppError(422, 'FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan libros de Excel .xlsx (sin macros). Los formatos .xls, .xlsm y .csv no se admiten.', [{ field: 'file', reason: 'EXTENSION' }]);
    }
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const prior = await this.db.selectFrom('import_batches').selectAll().where('organization_id', '=', orgId).where('operation_id', '=', operationId).executeTakeFirst();
    if (prior) {
      if (prior.sha256 !== hash) throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó con otro archivo. Vuelve a seleccionar el archivo.');
      return { replayed: true, batch: await this.batchView(ctx, prior) };
    }

    let sheet;
    try {
      sheet = readXlsx(file.buffer, PRODUCER_TEMPLATE_SHEET);
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
          id, organization_id: orgId, template: PRODUCER_TEMPLATE_VERSION, status: 'UPLOADED', sha256: hash, byte_size: file.buffer.length,
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
          after: { template: PRODUCER_TEMPLATE_VERSION, sha256: hash, byte_size: file.buffer.length, rows: data.length, columns: width },
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

  private async load(db: Kysely<Database> | Transaction<Database>, orgId: string, id: string, lock = false) {
    let q = db.selectFrom('import_batches').selectAll().where('organization_id', '=', orgId).where('id', '=', id);
    if (lock) q = q.forUpdate();
    const row = await q.executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  private async rows(db: Kysely<Database> | Transaction<Database>, b: Batch) {
    const rows = await db.selectFrom('import_rows').selectAll().where('organization_id', '=', b.organization_id).where('batch_id', '=', b.id).orderBy('row_number').execute();
    return rows.map((r) => ({ ...r, cells: r.cells_enc ? JSON.parse(this.cipher.decrypt(r.cells_enc, rowAad(b.organization_id, b.id, r.row_number))) as Record<string, StoredCell> : null }));
  }

  /** Vista del lote. Muestras de columnas: con identidad visible, todas; si no, solo de columnas mapeadas a campos no personales. */
  private async batchView(ctx: TenantContext, b: Batch) {
    const headers = b.headers as Array<{ column: string; header: string | null }>;
    const mapping = (b.mapping as Mapping | null)?.columns ?? {};
    const identity = this.identity(ctx);
    const sampleRows = b.status === 'DISCARDED' ? [] : (await this.rows(this.db, b)).slice(0, 3);
    const byHeader = new Map(PRODUCER_FIELDS.map((f) => [normHeader(f.header), f.field]));
    const previous = await this.db.selectFrom('import_batches').select(['id', 'status', 'created_at', 'closed_at'])
      .where('organization_id', '=', b.organization_id).where('sha256', '=', b.sha256).where('id', '!=', b.id).orderBy('created_at', 'desc').limit(5).execute();
    return {
      id: b.id, template: b.template, status: b.status, row_version: Number(b.row_version), created_at: b.created_at, closed_at: b.closed_at,
      file: { filename: b.original_filename, byte_size: b.byte_size, sha256: b.sha256, sheet: b.sheet_name }, row_count: b.row_count,
      columns: headers.map((h) => {
        const mapped = mapping[h.column] ?? null;
        const showSamples = identity || (mapped !== null && !FIELD_BY_KEY.get(mapped)!.identity);
        return {
          column: h.column, header: h.header, mapped_field: mapped,
          suggested_field: h.header ? byHeader.get(normHeader(h.header)) ?? null : null,
          samples: showSamples ? sampleRows.map((r) => r.cells?.[h.column]?.v ?? '').filter((v) => v !== '').map((v) => v.slice(0, 60)) : null,
        };
      }),
      samples_hidden_reason: identity ? null : 'Tu rol no ve datos de identidad: las muestras solo se muestran para columnas asociadas a campos no personales.',
      mapping: b.mapping ? mapping : null, summary: b.summary,
      same_file_previous_imports: previous,
      atomicity: ATOMICITY,
      can_map_identity: identity,
    };
  }

  async list(user: AuthUser, orgId: string) {
    await this.ctx(user, orgId, false);
    return this.db.selectFrom('import_batches')
      .select(['id', 'template', 'status', 'original_filename', 'row_count', 'summary', 'created_at', 'closed_at'])
      .where('organization_id', '=', orgId).orderBy('created_at', 'desc').limit(20).execute();
  }

  async get(user: AuthUser, orgId: string, id: string) {
    const ctx = await this.ctx(user, orgId, false);
    return this.batchView(ctx, await this.load(this.db, orgId, id));
  }

  // ------------------------------------------------------------------ mapeo

  async setMapping(user: AuthUser, orgId: string, id: string, dto: MappingDto, requestId?: string) {
    const ctx = await this.ctx(user, orgId, true);
    return this.db.transaction().execute(async (trx) => {
      const b = await this.load(trx, orgId, id, true);
      if (b.status === 'COMMITTED' || b.status === 'DISCARDED') throw conflict(b.status === 'COMMITTED' ? 'IMPORT_ALREADY_COMMITTED' : 'IMPORT_DISCARDED', 'Este lote ya está cerrado.');
      if (Number(b.row_version) !== dto.expected_version) throw conflict('VERSION_CONFLICT', 'Otra persona cambió este lote. Recarga para ver el mapeo actual.');
      const columns = new Set((b.headers as Array<{ column: string }>).map((h) => h.column));
      const out: Record<string, ImportField> = {};
      const issues: Array<{ field: string; reason: string }> = [];
      const used = new Set<string>();
      for (const [col, field] of Object.entries(dto.columns ?? {})) {
        if (field === null || field === '') continue;
        if (!columns.has(col)) { issues.push({ field: col, reason: 'UNKNOWN_COLUMN' }); continue; }
        const def = FIELD_BY_KEY.get(field as ImportField);
        if (!def) { issues.push({ field: col, reason: 'UNKNOWN_FIELD' }); continue; }
        if (used.has(field)) { issues.push({ field: col, reason: 'FIELD_MAPPED_TWICE' }); continue; }
        used.add(field);
        out[col] = def.field;
      }
      if (!used.has('producer_code')) issues.push({ field: 'producer_code', reason: 'REQUIRED_FIELD_NOT_MAPPED' });
      if (issues.length) throw new AppError(422, 'MAPPING_INVALID', 'Revisa el mapeo: cada campo una sola vez, columnas existentes y el código de productor asociado.', issues);
      const identityMapped = Object.values(out).filter((f) => FIELD_BY_KEY.get(f)!.identity);
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

  /** Calcula el plan con los permisos y datos ACTUALES. `lock` bloquea los productores existentes (confirmación). */
  private async plan(db: Kysely<Database> | Transaction<Database>, ctx: TenantContext, b: Batch, lock: boolean) {
    const mapping = (b.mapping as Mapping).columns;
    const colOf = new Map(Object.entries(mapping).map(([c, f]) => [f, c]));
    const identity = this.identity(ctx);
    const rows = await this.rows(db, b);
    const planned: PlannedRow[] = rows.map((r) => {
      const p: PlannedRow = { row_number: r.row_number, producer_code: null, action: 'ERROR', producer_id: null, expected_version: null, changed_fields: [], fields: {}, errors: [], warnings: [], patch: {} };
      for (const def of PRODUCER_FIELDS) {
        const col = colOf.get(def.field);
        if (!col) { p.fields[def.field] = { state: 'NOT_MAPPED', quality: QUALITY.NOT_MAPPED }; continue; }
        const cell = r.cells?.[col];
        const issue = (code: string, message: string) => p.errors.push({ column: col, field: def.field, code, message });
        if (cell?.f) { issue('FORMULA_NOT_ALLOWED', 'La celda tiene una fórmula; escribe el valor.'); p.fields[def.field] = { state: 'MISSING', quality: QUALITY.MISSING }; continue; }
        const raw = (cell?.v ?? '').trim();
        if (raw === '') { p.fields[def.field] = { state: 'MISSING', quality: QUALITY.MISSING }; continue; }
        if (raw === CLEAR_TOKEN) {
          if (def.required) issue('CANNOT_CLEAR_REQUIRED', 'El código de productor no se puede vaciar.');
          p.fields[def.field] = { state: 'CLEAR', quality: QUALITY.CLEAR, value: null };
          if (def.field !== 'producer_code') p.patch[def.field as EditableField] = null;
          continue;
        }
        if (raw.length > def.maxLength) issue('TOO_LONG', `Máximo ${def.maxLength} caracteres.`);
        else if (def.pattern && !def.pattern.test(raw)) issue('INVALID_FORMAT', def.field === 'producer_code' ? 'Código no válido: letras, números, punto, guion o guion bajo (1–40).' : 'Formato no válido.');
        if (cell?.n && (def.field === 'document_number' || def.field === 'phone')) {
          p.warnings.push({ column: col, field: def.field, code: 'NUMERIC_CELL', message: 'Celda numérica de Excel: comprueba que no se perdieron ceros iniciales.' });
        }
        p.fields[def.field] = { state: 'PROVIDED', quality: QUALITY.PROVIDED, value: raw };
        if (def.field === 'producer_code') p.producer_code = raw;
        else p.patch[def.field as EditableField] = raw;
      }
      if (!p.producer_code && !p.errors.some((e) => e.field === 'producer_code')) p.errors.push({ column: colOf.get('producer_code')!, field: 'producer_code', code: 'REQUIRED', message: 'Falta el código de productor.' });
      return p;
    });

    // Códigos repetidos dentro del archivo: ninguna de esas filas se aplica (no se elige una «ganadora»).
    const seen = new Map<string, number[]>();
    for (const p of planned) if (p.producer_code) seen.set(p.producer_code, [...(seen.get(p.producer_code) ?? []), p.row_number]);
    for (const p of planned) {
      const dup = p.producer_code ? seen.get(p.producer_code)! : [];
      if (dup.length > 1) p.errors.push({ column: colOf.get('producer_code')!, field: 'producer_code', code: 'DUPLICATE_IN_FILE', message: `Código repetido en las filas ${dup.join(', ')}.` });
    }

    const existing = await this.producers.byCodes(db, ctx.organizationId, [...seen.keys()], lock);
    for (const p of planned) {
      if (!p.producer_code || p.errors.length) continue;
      const row = existing.get(p.producer_code);
      if (!row) {
        if (!ctx.permissions.includes('producer:create')) { p.errors.push({ column: null, field: null, code: 'PERMISSION_DENIED_CREATE', message: 'Tu rol no permite registrar productores nuevos.' }); continue; }
        const fields = Object.fromEntries(Object.entries(p.patch).filter(([, v]) => v !== null)) as Partial<Record<EditableField, string | null>>;
        for (const code of this.producers.validateNames(fields)) p.errors.push({ column: null, field: null, code, message: code === 'DOCUMENT_PAIR_REQUIRED' ? 'El tipo y el número de documento van juntos.' : 'Indica nombre y apellido, o la razón social.' });
        if (p.errors.length) continue;
        p.action = 'CREATE';
        p.patch = fields;
        p.changed_fields = Object.keys(fields) as EditableField[];
        continue;
      }
      const scope = this.producers.scopeOf(ctx, row);
      // Fuera del alcance de lectura: no se revela nada del productor existente (ni id, ni datos, ni estado).
      if (!scope.read) { p.errors.push({ column: colOf.get('producer_code')!, field: 'producer_code', code: 'CODE_NOT_AVAILABLE', message: 'Ese código ya está en uso en tu organización y no está disponible para tu importación.' }); continue; }
      if (row.status === 'INACTIVE') { p.errors.push({ column: null, field: null, code: 'PRODUCER_INACTIVE', message: 'El productor está dado de baja; no se actualiza por importación.' }); continue; }
      if (!scope.update) { p.errors.push({ column: null, field: null, code: 'PERMISSION_DENIED_UPDATE', message: 'Tu rol no permite modificar este productor.' }); continue; }
      const current = this.producers.decrypted(row, identity);
      const changed = (Object.keys(p.patch) as EditableField[]).filter((k) => p.patch[k] !== current[k]);
      for (const code of this.producers.validateNames({ ...current, ...p.patch })) p.errors.push({ column: null, field: null, code, message: code === 'DOCUMENT_PAIR_REQUIRED' ? 'El tipo y el número de documento van juntos (contando lo ya registrado).' : 'El productor quedaría sin nombre y apellido ni razón social.' });
      if (p.errors.length) continue;
      p.producer_id = row.id;
      p.expected_version = Number(row.row_version);
      p.changed_fields = changed;
      p.patch = Object.fromEntries(changed.map((k) => [k, p.patch[k]])) as Partial<Record<EditableField, string | null>>;
      p.action = changed.length ? 'UPDATE' : 'UNCHANGED';
    }
    for (const p of planned) if (p.errors.length) { p.action = 'ERROR'; p.producer_id = null; p.expected_version = null; p.changed_fields = []; }

    const hash = createHash('sha256').update(JSON.stringify([b.id, b.row_version, b.mapping, planned.map((p) => [p.row_number, p.action, p.producer_id, p.expected_version, p.changed_fields, p.errors.map((e) => e.code)])])).digest('hex');
    const count = (a: PlannedRow['action']) => planned.filter((p) => p.action === a).length;
    return {
      rows: planned, plan_hash: hash,
      summary: { total: planned.length, create: count('CREATE'), update: count('UPDATE'), unchanged: count('UNCHANGED'), error: count('ERROR'), warnings: planned.filter((p) => p.warnings.length).length },
    };
  }

  /** Fila para la respuesta: identidad visible solo con producer:read_identity; sin `patch` interno. */
  private rowView(ctx: TenantContext, p: PlannedRow) {
    const identity = this.identity(ctx);
    const fields = Object.fromEntries(Object.entries(p.fields).map(([f, v]) => [f, FIELD_BY_KEY.get(f as ImportField)!.identity && !identity && v.value !== undefined ? { ...v, value: v.value === null ? null : '••••' } : v]));
    const { patch: _patch, ...rest } = p;
    void _patch;
    return { ...rest, fields, validation_status: 'NOT_VALIDATED' as const };
  }

  async preview(user: AuthUser, orgId: string, id: string, q: PreviewQuery) {
    const ctx = await this.ctx(user, orgId, false);
    const b = await this.load(this.db, orgId, id);
    if (b.status === 'UPLOADED') throw conflict('MAPPING_REQUIRED', 'Asocia primero las columnas a los campos.');
    if (b.status === 'DISCARDED') throw conflict('IMPORT_DISCARDED', 'Este lote fue descartado.');
    if (b.status === 'COMMITTED') throw conflict('IMPORT_ALREADY_COMMITTED', 'Este lote ya se confirmó; consulta su resultado.');
    const plan = await this.plan(this.db, ctx, b, false);
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 100;
    return {
      batch_id: b.id, batch_row_version: Number(b.row_version), plan_hash: plan.plan_hash, summary: plan.summary, atomicity: ATOMICITY,
      can_commit: plan.summary.error === 0 && plan.summary.create + plan.summary.update > 0 && ctx.organizationStatus === 'ACTIVE',
      new_producers_status: 'DRAFT', persisted: false,
      rows: plan.rows.slice(offset, offset + limit).map((p) => this.rowView(ctx, p)), offset, limit,
    };
  }

  // ------------------------------------------------------------------ confirmación

  async commit(user: AuthUser, orgId: string, id: string, dto: CommitDto, requestId?: string) {
    const ctx = await this.ctx(user, orgId, true); // permisos ACTUALES: la autorización de la vista previa no basta
    try {
      return await this.db.transaction().execute(async (trx) => {
        const b = await this.load(trx, orgId, id, true);
        if (b.status === 'COMMITTED') {
          if (b.commit_operation_id === dto.operation_id) return { replayed: true, batch_id: b.id, status: b.status, summary: b.summary };
          throw conflict('IMPORT_ALREADY_COMMITTED', 'Este lote ya se confirmó.');
        }
        if (b.status === 'DISCARDED') throw conflict('IMPORT_DISCARDED', 'Este lote fue descartado.');
        if (b.status === 'UPLOADED') throw conflict('MAPPING_REQUIRED', 'Asocia primero las columnas a los campos.');
        const plan = await this.plan(trx, ctx, b, true);
        if (plan.plan_hash !== dto.plan_hash) {
          throw conflict('PREVIEW_STALE', 'Algo cambió desde la vista previa (datos, permisos o mapeo). No se guardó nada: revisa la vista previa de nuevo.');
        }
        if (plan.summary.error > 0) throw new AppError(422, 'BATCH_HAS_ERRORS', `Hay ${plan.summary.error} fila(s) con error. La importación es atómica: corrige el archivo y vuelve a cargarlo.`);
        if (plan.summary.create + plan.summary.update === 0) throw conflict('NOTHING_TO_IMPORT', 'Todas las filas coinciden con lo registrado: no hay nada que importar.');

        let duplicateReviews = 0;
        for (const p of plan.rows) {
          const source = { kind: 'EXCEL_IMPORT', import_batch_id: b.id, row_number: p.row_number, template: b.template };
          const reason = `Importación Excel ${b.id} · fila ${p.row_number}`;
          let producerId = p.producer_id;
          let action: 'CREATED' | 'UPDATED' | 'UNCHANGED' = 'UNCHANGED';
          if (p.action === 'CREATE') {
            const r = await this.producers.createInTx(trx, ctx, user, p.producer_code!, p.patch, { status: 'DRAFT', assignee: this.producers.defaultAssignee(ctx), requestId, changeType: 'IMPORT_CREATE', reason, source });
            producerId = r.producer.id;
            duplicateReviews += Number(r.pendingReviews ?? 0);
            action = 'CREATED';
          } else if (p.action === 'UPDATE') {
            const r = await this.producers.updateInTx(trx, ctx, user, p.producer_id!, p.expected_version!, p.patch, { requestId, changeType: 'IMPORT_UPDATE', reason, source });
            duplicateReviews += Number(r.pendingReviews ?? 0);
            action = 'UPDATED';
          }
          await trx.updateTable('import_rows').set({ result_action: action, producer_id: producerId, changed_fields: p.changed_fields })
            .where('organization_id', '=', orgId).where('batch_id', '=', b.id).where('row_number', '=', p.row_number).execute();
        }
        const summary = { created: plan.summary.create, updated: plan.summary.update, unchanged: plan.summary.unchanged, failed: 0, duplicate_reviews_pending: duplicateReviews, new_producers_status: 'DRAFT' };
        await trx.updateTable('import_batches')
          .set({ status: 'COMMITTED', plan_hash: plan.plan_hash, summary: JSON.stringify(summary), commit_operation_id: dto.operation_id, closed_by: user.id, closed_at: new Date(), row_version: sql`row_version + 1` })
          .where('id', '=', b.id).where('organization_id', '=', orgId).execute();
        await this.audit.record(trx, {
          organizationId: orgId, actorUserId: user.id, action: 'import.commit', entityType: 'import_batch', entityId: b.id, requestId, result: 'SUCCESS',
          after: { ...summary, plan_hash: plan.plan_hash, sha256: b.sha256 },
        });
        return { replayed: false, batch_id: b.id, status: 'COMMITTED' as const, summary };
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      const c = (e as { constraint?: string }).constraint;
      if (c === 'import_batches_commit_operation_uq') throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó en otra confirmación.');
      // Cambio concurrente en mitad de la confirmación (p. ej. otra importación creó el mismo código): nada se guardó.
      if (code === 'PRODUCER_CODE_TAKEN' || code === 'VERSION_CONFLICT' || c === 'producers_code_uq') {
        throw conflict('IMPORT_CONCURRENT_CHANGE', 'Otro cambio afectó a estos productores mientras confirmabas. No se guardó nada: revisa la vista previa de nuevo.');
      }
      throw e;
    }
  }

  async discard(user: AuthUser, orgId: string, id: string, requestId?: string) {
    await this.ctx(user, orgId, true);
    return this.db.transaction().execute(async (trx) => {
      const b = await this.load(trx, orgId, id, true);
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
    const b = await this.load(this.db, orgId, id);
    const head = ['fila', 'codigo_productor', 'resultado', 'campos_cambiados', 'errores', 'advertencias', ...PRODUCER_FIELDS.map((f) => `estado_${f.header}`)];
    let body: string[][];
    if (b.status === 'COMMITTED') {
      const rows = await this.db.selectFrom('import_rows as r').leftJoin('producers as p', (j) => j.onRef('p.id', '=', 'r.producer_id').onRef('p.organization_id', '=', 'r.organization_id'))
        .select(['r.row_number', 'r.result_action', 'r.changed_fields', 'p.producer_code']).where('r.organization_id', '=', orgId).where('r.batch_id', '=', id).orderBy('r.row_number').execute();
      body = rows.map((r) => [String(r.row_number), r.producer_code ?? '', r.result_action ?? '', (r.changed_fields ?? []).join(' '), '', '']);
    } else if (b.status === 'MAPPED') {
      const plan = await this.plan(this.db, ctx, b, false);
      body = plan.rows.map((p) => [String(p.row_number), p.producer_code ?? '', p.action, p.changed_fields.join(' '),
        p.errors.map((e) => `${e.column ?? ''} ${e.code}: ${e.message}`.trim()).join(' | '), p.warnings.map((w) => `${w.column ?? ''} ${w.code}`.trim()).join(' | '),
        ...PRODUCER_FIELDS.map((f) => `${p.fields[f.field]?.state ?? ''} (${p.fields[f.field]?.quality ?? ''})`)]);
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

  @Get('templates/producers')
  @ApiOperation({ summary: 'Reglas de la plantilla de productores (PRODUCTORES_V1)' })
  async templateInfo(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    await this.service.template(user, orgId); // misma autorización que la descarga
    return this.service.templateInfo();
  }

  @Get('templates/producers.xlsx')
  @ApiOperation({ summary: 'Descargar la plantilla de productores' })
  async templateFile(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Res() res: Response) {
    const bytes = await this.service.template(user, orgId);
    res.setHeader('Content-Type', MEDIA_XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-${PRODUCER_TEMPLATE_VERSION.toLowerCase()}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'operation_id'], properties: { file: { type: 'string', format: 'binary' }, operation_id: { type: 'string', format: 'uuid' }, template: { type: 'string', enum: [PRODUCER_TEMPLATE_VERSION] } } } })
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

