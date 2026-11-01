import { Body, Controller, Get, Inject, Injectable, Optional, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { sql, type Kysely } from 'kysely';
import { DB } from '../db/database';
import type { Database, EudrIsSubmissionEventKind } from '../db/schema';
import { AppError } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authz/authorization.service';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { DdService } from '../dd/dd';
import { ENVIRONMENTS, EUDR_IS_TRANSPORT, EudrIsService, eudrIsLiveCalls } from './eudr-is';
import { fetchTransport, type Environment, type SoapTransport } from './echo';
import { ddsVersionFor, sendGetByInternalReference, sendGetDds, sendSubmitDds, validateDdsInput, type DdsInput, type DdsProducerInput } from './dds';

// P1-007 tramo 2 — Presentación de una DDS a EUDR-IS (PRUEBA en ACCEPTANCE; PRODUCTION bloqueada por defecto). Reglas que este servicio hace cumplir:
//  · PREPARAR, ENVIAR, CONCILIAR y CONSULTAR son actos distintos, con permiso propio `dd:submit`; revisar, aprobar, concluir y exportar el paquete son otros actos y no lo conceden.
//  · Solo se presenta una instantánea VIGENTE, APROBADA y con todos los requisitos cumplidos (READY). READY/EXPORTED no son presentación oficial: la presentación es este acto y su resultado
//    es el que devuelve el sistema (UUID, estado, número de referencia y de verificación), nunca uno fabricado aquí.
//  · Antes de llamar se ANOTA el intento como incierto: si el proceso cae a mitad de camino o no llega respuesta, el estado queda «requiere conciliación» y NO se reenvía solo. Se concilia
//    consultando por la referencia interna; solo si el sistema confirma que NO la recibió, una persona autoriza un reenvío explícito.
//  · Terra Link relaciona y presenta lo declarado; no certifica la autenticidad de los documentos ni la conformidad legal.
export const PRODUCTION_SUBMISSIONS_FLAG = 'EUDR_IS_PRODUCTION_SUBMISSIONS';
export const productionSubmissionsEnabled = (env: NodeJS.ProcessEnv = process.env) => env[PRODUCTION_SUBMISSIONS_FLAG] === 'enabled';

export type SubmissionState = 'PREPARED' | 'READY_TO_SEND' | 'SUBMITTED' | 'REJECTED' | 'NEEDS_RECONCILIATION' | 'CONFIRMED_NOT_RECEIVED';
interface EventRow { kind: EudrIsSubmissionEventKind; eudr_uuid: string | null; reference_number: string | null; verification_number: string | null; remote_status: string | null; detail: string | null; errors: unknown; created_at: Date }

/** Estado derivado de los eventos (de solo añadir): el último acto decisivo manda; las consultas de estado no cambian el estado. */
export function deriveState(events: Array<Pick<EventRow, 'kind'>>): SubmissionState {
  let s: SubmissionState = 'PREPARED';
  for (const e of events) {
    if (e.kind === 'ATTEMPT_ACCEPTED' || e.kind === 'RECONCILED_FOUND') s = 'SUBMITTED';
    else if (e.kind === 'ATTEMPT_REJECTED') s = 'REJECTED';
    else if (e.kind === 'ATTEMPT_NOT_PROCESSED') s = 'READY_TO_SEND';
    else if (e.kind === 'ATTEMPT_UNCERTAIN') s = 'NEEDS_RECONCILIATION';
    else if (e.kind === 'RECONCILED_NOT_FOUND') s = 'CONFIRMED_NOT_RECEIVED';
    else if (e.kind === 'RESEND_AUTHORIZED') s = 'READY_TO_SEND';
  }
  return s;
}

const SCALE = 1_000_000n;
const toScaled = (v: string) => { const [i, f = ''] = v.split('.'); return BigInt(i || '0') * SCALE + BigInt((f + '000000').slice(0, 6)); };
const fromScaled = (n: bigint) => { const i = n / SCALE; const f = (n % SCALE).toString().padStart(6, '0').replace(/0+$/, ''); return f ? `${i}.${f}` : `${i}`; };
const canon = (o: unknown): string => JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

export class PrepareSubmissionDto {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiProperty({ enum: ['ACCEPTANCE', 'PRODUCTION'] }) @IsIn(['ACCEPTANCE', 'PRODUCTION']) environment!: Environment;
  @ApiProperty({ enum: ['OPERATOR', 'REPRESENTATIVE_OPERATOR'], description: 'Quién presenta en TRACES: el operador o su representante autorizado. No se deduce del rol de Terra Link.' }) @IsIn(['OPERATOR', 'REPRESENTATIVE_OPERATOR']) operator_role!: 'OPERATOR' | 'REPRESENTATIVE_OPERATOR';
  @ApiProperty({ enum: ['IMPORT', 'EXPORT', 'DOMESTIC'] }) @IsIn(['IMPORT', 'EXPORT', 'DOMESTIC']) activity_type!: 'IMPORT' | 'EXPORT' | 'DOMESTIC';
  @ApiPropertyOptional({ description: 'Estado miembro de la UE donde ocurre la actividad (ISO 3166-1 alfa-2).' }) @IsOptional() @Matches(/^[A-Za-z]{2}$/) country_of_activity?: string;
  @ApiPropertyOptional({ description: 'País de entrada (IMPORT) o salida (EXPORT) en la frontera aduanera.' }) @IsOptional() @Matches(/^[A-Za-z]{2}$/) border_cross_country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) represented_operator_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) represented_operator_reference_type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) represented_operator_reference_value?: string;
  @ApiProperty({ description: 'Código HS de 2 a 10 dígitos. No se deduce del producto.' }) @Matches(/^\d{2,10}$/) hs_heading!: string;
  @ApiProperty({ description: 'Descripción comercial (hasta 150 caracteres).' }) @IsString() @Length(1, 150) description!: string;
  @ApiPropertyOptional({ description: 'Masa neta en kg. Si se omite se usa la suma de las reservas del embarque (en KG) de la instantánea.' }) @IsOptional() @Matches(/^\d{1,10}(\.\d{1,6})?$/) net_weight_kg?: string;
  @ApiProperty() @IsBoolean() geolocation_confidential!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) comment?: string;
}
export class SendSubmissionDto {
  @ApiPropertyOptional({ description: 'Solo tras conciliar y confirmar que EUDR-IS NO recibió la declaración: autoriza el reenvío explícito.' }) @IsOptional() @IsBoolean() confirm_not_received?: boolean;
}

@Injectable()
export class EudrIsSubmissionsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly eudr: EudrIsService,
    private readonly dd: DdService,
    @Optional() @Inject(EUDR_IS_TRANSPORT) private readonly transport: SoapTransport = fetchTransport,
  ) {}

  private async events(orgId: string, submissionId: string): Promise<EventRow[]> {
    return this.db.selectFrom('eudr_is_submission_events').select(['kind', 'eudr_uuid', 'reference_number', 'verification_number', 'remote_status', 'detail', 'errors', 'created_at'])
      .where('organization_id', '=', orgId).where('submission_id', '=', submissionId).orderBy('seq').execute() as Promise<EventRow[]>;
  }
  private async load(orgId: string, id: string) {
    const s = await this.db.selectFrom('eudr_is_submissions').selectAll().where('organization_id', '=', orgId).where('id', '=', id).executeTakeFirst();
    if (!s) throw new AppError(404, 'NOT_FOUND', 'La presentación no existe en esta organización.');
    return s;
  }

  private view(s: { id: string; snapshot_id: string; environment: string; service_version: string; internal_reference: string; declared_hash: string; created_at: Date; declared: unknown }, ev: EventRow[]) {
    const state = deriveState(ev);
    const last = [...ev].reverse();
    const ok = last.find((e) => e.kind === 'ATTEMPT_ACCEPTED' || e.kind === 'RECONCILED_FOUND');
    const chk = last.find((e) => e.kind === 'STATUS_CHECKED' || e.kind === 'ATTEMPT_ACCEPTED' || e.kind === 'RECONCILED_FOUND');
    const d = s.declared as { producers?: unknown[] } & Record<string, unknown>;
    const { producers, ...resto } = d;
    return {
      id: s.id, snapshot_id: s.snapshot_id, environment: s.environment, service_version: s.service_version, internal_reference: s.internal_reference, declared_hash: s.declared_hash, created_at: s.created_at,
      state, official_submission: state === 'SUBMITTED' ? 'SUBMITTED_TO_EUDR_IS' : 'NOT_SUBMITTED',
      eudr_is: ok ? { uuid: ok.eudr_uuid, reference_number: chk?.reference_number ?? null, verification_number: chk?.verification_number ?? null, remote_status: chk?.remote_status ?? null, note: 'Datos tal cual los devolvió el sistema; Terra Link no los genera.' } : null,
      declared: { ...resto, producers_count: producers?.length ?? 0 },
      next: state === 'PREPARED' || state === 'READY_TO_SEND' ? 'SEND' : state === 'NEEDS_RECONCILIATION' ? 'RECONCILE' : state === 'CONFIRMED_NOT_RECEIVED' ? 'SEND_WITH_CONFIRMATION' : state === 'SUBMITTED' ? 'CHECK_STATUS' : 'PREPARE_NEW',
      events: ev.map((e) => ({ kind: e.kind, at: e.created_at, eudr_uuid: e.eudr_uuid, reference_number: e.reference_number, remote_status: e.remote_status, detail: e.detail, errors: e.errors })),
    };
  }

  async list(user: AuthUser, orgId: string, snapshotId: string) {
    await this.authz.require(user, orgId, 'dd:read', { mutation: false });
    const rows = await this.db.selectFrom('eudr_is_submissions').selectAll().where('organization_id', '=', orgId).where('snapshot_id', '=', snapshotId).orderBy('created_at', 'desc').execute();
    return { items: await Promise.all(rows.map(async (s) => this.view(s, await this.events(orgId, s.id)))) };
  }
  async detail(user: AuthUser, orgId: string, id: string) {
    await this.authz.require(user, orgId, 'dd:read', { mutation: false });
    const s = await this.load(orgId, id);
    return this.view(s, await this.events(orgId, id));
  }

  /** Condiciones de la instantánea a presentar: vigente, aprobada, READY y la última del expediente. */
  private async submittable(user: AuthUser, orgId: string, snapshotId: string) {
    const ctx = await this.authz.tenantContext(user, orgId);
    if (!ctx) throw new AppError(404, 'NOT_FOUND', 'La organización no existe o no tienes acceso.');
    const snap = await this.dd.snapshotView(ctx, snapshotId);
    const problems: string[] = [];
    if (snap.readiness.effective !== 'READY') problems.push(`La instantánea no está lista (${snap.readiness.effective}): todos los requisitos deben estar cumplidos y vigentes.`);
    if (snap.review.process_status !== 'APPROVED') problems.push('La instantánea no está aprobada por la revisión interna.');
    if (!snap.is_latest) problems.push('Hay una instantánea más reciente del expediente.');
    if (problems.length) throw new AppError(409, 'SNAPSHOT_NOT_SUBMITTABLE', problems.join(' '), problems.map((p) => ({ field: 'snapshot', reason: p })));
    return snap;
  }

  async prepare(user: AuthUser, orgId: string, snapshotId: string, dto: PrepareSubmissionDto, requestId?: string) {
    await this.authz.require(user, orgId, 'dd:submit', { mutation: true });
    const prior = await this.db.selectFrom('eudr_is_submissions').selectAll().where('organization_id', '=', orgId).where('operation_id', '=', dto.operation_id).executeTakeFirst();
    if (prior) {
      if (prior.snapshot_id !== snapshotId) throw new AppError(409, 'OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó con otro contenido.');
      return this.view(prior, await this.events(orgId, prior.id));
    }
    if (dto.environment === 'PRODUCTION' && !productionSubmissionsEnabled()) throw new AppError(409, 'PRODUCTION_SUBMISSION_NOT_AUTHORIZED', 'Las presentaciones en PRODUCTION no están autorizadas en esta plataforma. Se pueden preparar pruebas en ACCEPTANCE.');
    const snap = await this.submittable(user, orgId, snapshotId);
    const content = snap.content as unknown as { plots: Array<{ plot_id: string; plot_code: string; version_id: string | null; production_country?: { country: string | null } }>; shipment_links: Array<{ quantity: string; unit: string }> };
    const kc = await this.db.selectFrom('dd_cases').select('case_number').where('organization_id', '=', orgId).where('id', '=', snap.case_id).executeTakeFirstOrThrow();
    const internalReference = `TL-${kc.case_number}-S${snap.snapshot_number}`.slice(0, 50);
    const version = ddsVersionFor(dto.environment);
    // Masa neta: la declarada o la suma de las reservas en KG. Una unidad distinta no se convierte.
    let weight = dto.net_weight_kg;
    if (!weight) {
      if (!content.shipment_links.length || content.shipment_links.some((l) => l.unit !== 'KG')) throw new AppError(422, 'DDS_NET_WEIGHT_REQUIRED', 'Indica la masa neta en kg: la instantánea no tiene reservas de embarque en KG de las que derivarla.', [{ field: 'net_weight_kg', reason: 'REQUIRED' }]);
      weight = fromScaled(content.shipment_links.reduce((a, l) => a + toScaled(l.quantity), 0n));
    }
    // Productores = parcelas de origen de la instantánea, con la versión geométrica y el país DECLARADOS (lo desconocido no se completa).
    const producers: DdsProducerInput[] = [];
    const geomProblems: Array<{ field: string; message: string }> = [];
    for (const p of content.plots) {
      if (!p.version_id) { geomProblems.push({ field: `plots.${p.plot_code}`, message: 'La parcela no tiene una versión geométrica vigente.' }); continue; }
      const r = (await sql<{ gj: string | null; t: string | null; a: string | null }>`
        SELECT ST_AsGeoJSON(geometry)::text AS gj, geometry_type AS t, area_declared_ha::text AS a FROM plot_versions WHERE organization_id = ${orgId} AND id = ${p.version_id}`.execute(this.db)).rows[0];
      const g = r?.gj ? JSON.parse(r.gj) as { type: string; coordinates: unknown } : null;
      if (!g || (g.type !== 'Point' && g.type !== 'Polygon')) { geomProblems.push({ field: `plots.${p.plot_code}`, message: 'La geometría de la parcela no es un punto ni un polígono admitido por EUDR-IS (p. ej. MultiPolygon).' }); continue; }
      producers.push({ country: p.production_country?.country ?? '', geometry: g as DdsProducerInput['geometry'], area_ha: r.a ? Number(r.a) : null, production_place: p.plot_code });
    }
    const input: DdsInput = {
      operator_role: dto.operator_role, activity_type: dto.activity_type, country_of_activity: dto.country_of_activity ?? null, border_cross_country: dto.border_cross_country ?? null,
      internal_reference: internalReference,
      represented_operator: dto.represented_operator_name ? { name: dto.represented_operator_name, reference_type: dto.represented_operator_reference_type ?? null, reference_value: dto.represented_operator_reference_value ?? null } : null,
      commodity: { hs_heading: dto.hs_heading, description: dto.description, net_weight_kg: weight },
      producers, geolocation_confidential: dto.geolocation_confidential, comment: dto.comment ?? null,
    };
    const problems = [...geomProblems, ...validateDdsInput(input, version)];
    if (problems.length) throw new AppError(422, 'DDS_INCOMPLETE', 'La declaración no puede prepararse: faltan o no son válidos datos que Terra Link no completa por su cuenta.', problems.map((p) => ({ field: p.field, reason: p.message })));
    const declared = { ...input };
    const hash = createHash('sha256').update(canon({ declared, version, environment: dto.environment, snapshot: snapshotId })).digest('hex');
    const id = randomUUID();
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx.insertInto('eudr_is_submissions').values({ id, organization_id: orgId, snapshot_id: snapshotId, environment: dto.environment, service_version: version, internal_reference: internalReference, declared: JSON.stringify(declared), declared_hash: hash, operation_id: dto.operation_id, created_by: user.id }).execute();
        await this.audit.record(trx, { organizationId: orgId, actorUserId: user.id, action: 'eudr_is.submission_prepared', entityType: 'eudr_is_submission', entityId: id, requestId, result: 'SUCCESS', after: { snapshot_id: snapshotId, environment: dto.environment, service_version: version, declared_hash: hash } });
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new AppError(409, 'SUBMISSION_ALREADY_PREPARED', 'Ya existe una presentación preparada con esa referencia interna para este entorno: abre la existente.');
      throw e;
    }
    return this.view(await this.load(orgId, id), []);
  }

  private async record(orgId: string, submissionId: string, kind: EudrIsSubmissionEventKind, actor: string | null, extra: Partial<{ eudr_uuid: string; reference_number: string; verification_number: string; remote_status: string; http_status: number; detail: string; errors: unknown }> = {}) {
    await this.db.insertInto('eudr_is_submission_events').values({ id: randomUUID(), organization_id: orgId, submission_id: submissionId, kind, eudr_uuid: extra.eudr_uuid ?? null, reference_number: extra.reference_number ?? null,
      verification_number: extra.verification_number ?? null, remote_status: extra.remote_status ?? null, http_status: extra.http_status ?? null, detail: extra.detail ?? null, errors: extra.errors ? JSON.stringify(extra.errors) : null, actor_user_id: actor } as never).execute();
  }

  private async gates(orgId: string, env: Environment) {
    if (env === 'PRODUCTION' && !productionSubmissionsEnabled()) throw new AppError(409, 'PRODUCTION_SUBMISSION_NOT_AUTHORIZED', 'Las presentaciones en PRODUCTION no están autorizadas en esta plataforma.');
    if (!eudrIsLiveCalls()) throw new AppError(409, 'EUDR_IS_LIVE_CALLS_DISABLED', 'Las llamadas a EUDR-IS están deshabilitadas en esta plataforma.');
    const creds = await this.eudr.load(orgId, env);
    if (!creds) throw new AppError(409, 'EUDR_IS_CREDENTIAL_MISSING', 'Esta organización no tiene credenciales registradas para ese entorno.');
    return creds;
  }

  /** Envía UNA vez. El intento se anota como incierto ANTES de llamar: una caída o un corte deja «requiere conciliación» y nunca un reenvío automático. */
  async send(user: AuthUser, orgId: string, id: string, dto: SendSubmissionDto, requestId?: string) {
    await this.authz.require(user, orgId, 'dd:submit', { mutation: true });
    const s = await this.load(orgId, id);
    const env = s.environment as Environment;
    const creds = await this.gates(orgId, env);
    await this.submittable(user, orgId, s.snapshot_id);
    // Reserva del intento, serializada por fila: dos envíos simultáneos no llegan a llamar los dos.
    await this.db.transaction().execute(async (trx) => {
      await sql`SELECT id FROM eudr_is_submissions WHERE organization_id = ${orgId} AND id = ${id} FOR UPDATE`.execute(trx);
      const ev = await trx.selectFrom('eudr_is_submission_events').select('kind').where('organization_id', '=', orgId).where('submission_id', '=', id).orderBy('seq').execute();
      const state = deriveState(ev);
      if (state === 'SUBMITTED') throw new AppError(409, 'SUBMISSION_ALREADY_SUBMITTED', 'Esta presentación ya fue aceptada por EUDR-IS.');
      if (state === 'REJECTED') throw new AppError(409, 'SUBMISSION_REJECTED', 'EUDR-IS rechazó esta presentación: corrige lo indicado y prepara una nueva.');
      if (state === 'NEEDS_RECONCILIATION') throw new AppError(409, 'RECONCILE_FIRST', 'El resultado del envío anterior es incierto: concílialo antes de enviar. No se reenvía automáticamente.');
      if (state === 'CONFIRMED_NOT_RECEIVED') {
        if (dto.confirm_not_received !== true) throw new AppError(409, 'CONFIRM_NOT_RECEIVED_REQUIRED', 'EUDR-IS no tiene esta presentación. Para reenviar confirma expresamente que no fue recibida.');
        await trx.insertInto('eudr_is_submission_events').values({ id: randomUUID(), organization_id: orgId, submission_id: id, kind: 'RESEND_AUTHORIZED', actor_user_id: user.id, detail: 'Reenvío autorizado tras conciliar: el sistema no tenía la declaración.' } as never).execute();
      }
      await trx.insertInto('eudr_is_submission_events').values({ id: randomUUID(), organization_id: orgId, submission_id: id, kind: 'ATTEMPT_UNCERTAIN', actor_user_id: user.id, detail: 'Intento iniciado; aún sin respuesta registrada.' } as never).execute();
      await this.audit.record(trx, { organizationId: orgId, actorUserId: user.id, action: 'eudr_is.submission_attempt', entityType: 'eudr_is_submission', entityId: id, requestId, result: 'SUCCESS', after: { environment: env } });
    });
    const input = s.declared as DdsInput;
    const out = await sendSubmitDds(env, s.service_version as 'V3' | 'V4', creds, input, this.transport);
    if (out.kind === 'ACCEPTED') await this.record(orgId, id, 'ATTEMPT_ACCEPTED', user.id, { eudr_uuid: out.uuid, http_status: out.httpStatus });
    else if (out.kind === 'REJECTED') await this.record(orgId, id, 'ATTEMPT_REJECTED', user.id, { http_status: out.httpStatus, errors: out.errors, detail: 'Rechazada por las reglas de EUDR-IS.' });
    else if (out.kind === 'NOT_PROCESSED') await this.record(orgId, id, 'ATTEMPT_NOT_PROCESSED', user.id, { http_status: out.httpStatus ?? undefined, detail: out.reason === 'AUTH_FAILED' ? 'Credenciales rechazadas: la solicitud no se procesó.' : 'Sin permiso en EUDR-IS: la solicitud no se procesó.' });
    else await this.record(orgId, id, 'ATTEMPT_UNCERTAIN', user.id, { http_status: out.httpStatus ?? undefined, detail: `${out.detail ?? 'Sin respuesta'} — resultado incierto: concilia antes de reenviar.` });
    await this.audit.record(this.db, { organizationId: orgId, actorUserId: user.id, action: 'eudr_is.submission_result', entityType: 'eudr_is_submission', entityId: id, requestId, result: out.kind === 'ACCEPTED' ? 'SUCCESS' : 'FAILED', after: { outcome: out.kind, environment: env } });
    return this.view(s, await this.events(orgId, id));
  }

  /** Concilia un resultado incierto consultando por la referencia interna (no reenvía nada). */
  async reconcile(user: AuthUser, orgId: string, id: string, requestId?: string) {
    await this.authz.require(user, orgId, 'dd:submit', { mutation: true });
    const s = await this.load(orgId, id);
    const env = s.environment as Environment;
    const creds = await this.gates(orgId, env);
    if (deriveState(await this.events(orgId, id)) !== 'NEEDS_RECONCILIATION') throw new AppError(409, 'NOTHING_TO_RECONCILE', 'Esta presentación no tiene un resultado incierto que conciliar.');
    const out = await sendGetByInternalReference(env, s.service_version as 'V3' | 'V4', creds, s.internal_reference, this.transport);
    if (out.kind === 'FOUND') {
      const it = out.items.find((x) => x.internalReference === s.internal_reference) ?? out.items[0];
      await this.record(orgId, id, 'RECONCILED_FOUND', user.id, { eudr_uuid: it.uuid, reference_number: it.referenceNumber ?? undefined, verification_number: it.verificationNumber ?? undefined, remote_status: it.status ?? undefined, http_status: out.httpStatus, detail: 'EUDR-IS sí tiene la declaración: no se reenvía.' });
    } else if (out.kind === 'NOT_FOUND') await this.record(orgId, id, 'RECONCILED_NOT_FOUND', user.id, { http_status: out.httpStatus, detail: 'EUDR-IS no tiene una declaración con esta referencia interna.' });
    else await this.record(orgId, id, 'RECONCILIATION_UNCERTAIN', user.id, { http_status: out.httpStatus ?? undefined, detail: out.kind === 'UNCERTAIN' ? `${out.detail ?? 'Sin respuesta'} — la conciliación tampoco es concluyente.` : 'No se pudo consultar (credenciales o permiso).' });
    await this.audit.record(this.db, { organizationId: orgId, actorUserId: user.id, action: 'eudr_is.submission_reconciled', entityType: 'eudr_is_submission', entityId: id, requestId, result: out.kind === 'FOUND' || out.kind === 'NOT_FOUND' ? 'SUCCESS' : 'FAILED', after: { outcome: out.kind } });
    return this.view(s, await this.events(orgId, id));
  }

  /** Consulta el estado actual de una presentación aceptada. Guarda lo que el sistema devuelve (estado, referencia, verificación). */
  async checkStatus(user: AuthUser, orgId: string, id: string, requestId?: string) {
    await this.authz.require(user, orgId, 'dd:submit', { mutation: true });
    const s = await this.load(orgId, id);
    const env = s.environment as Environment;
    const creds = await this.gates(orgId, env);
    const ev = await this.events(orgId, id);
    const uuid = [...ev].reverse().find((e) => e.eudr_uuid)?.eudr_uuid;
    if (deriveState(ev) !== 'SUBMITTED' || !uuid) throw new AppError(409, 'NOT_SUBMITTED', 'Solo se consulta el estado de una presentación aceptada por EUDR-IS.');
    const out = await sendGetDds(env, s.service_version as 'V3' | 'V4', creds, uuid, this.transport);
    if (out.kind === 'FOUND') { const it = out.items[0]; await this.record(orgId, id, 'STATUS_CHECKED', user.id, { eudr_uuid: it.uuid, reference_number: it.referenceNumber ?? undefined, verification_number: it.verificationNumber ?? undefined, remote_status: it.status ?? undefined, http_status: out.httpStatus, detail: it.rejectionReason ?? it.referenceNumberInfo ?? undefined }); }
    else await this.record(orgId, id, 'STATUS_CHECKED', user.id, { eudr_uuid: uuid, http_status: out.httpStatus ?? undefined, detail: out.kind === 'NOT_FOUND' ? 'EUDR-IS no devolvió la declaración en esta consulta.' : 'Consulta no concluyente.' });
    await this.audit.record(this.db, { organizationId: orgId, actorUserId: user.id, action: 'eudr_is.submission_status_checked', entityType: 'eudr_is_submission', entityId: id, requestId, result: out.kind === 'FOUND' ? 'SUCCESS' : 'FAILED', after: { outcome: out.kind } });
    return this.view(s, await this.events(orgId, id));
  }
}

void ENVIRONMENTS;
@ApiTags('eudr-is')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/eudr-is')
export class EudrIsSubmissionsController {
  constructor(private readonly service: EudrIsSubmissionsService) {}
  @Get('snapshots/:snapshotId/submissions') list(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('snapshotId', ParseUUIDPipe) s: string) { return this.service.list(u, o, s); }
  @Post('snapshots/:snapshotId/submissions') prepare(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('snapshotId', ParseUUIDPipe) s: string, @Body() dto: PrepareSubmissionDto, @Req() req: AuthedRequest) { return this.service.prepare(u, o, s, dto, req.requestId); }
  @Get('submissions/:id') detail(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(u, o, id); }
  @Post('submissions/:id/send') send(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendSubmissionDto, @Req() req: AuthedRequest) { return this.service.send(u, o, id, dto, req.requestId); }
  @Post('submissions/:id/reconcile') reconcile(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) { return this.service.reconcile(u, o, id, req.requestId); }
  @Post('submissions/:id/status') status(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) { return this.service.checkStatus(u, o, id, req.requestId); }
}
