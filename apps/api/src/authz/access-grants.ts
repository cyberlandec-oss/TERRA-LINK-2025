import { Body, Controller, Get, Inject, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { randomUUID } from 'crypto';
import { sql, type Kysely } from 'kysely';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../auth/auth';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { AuthorizationService } from './authorization.service';
import type { Permission } from './catalog';
import { referenciaDe } from '../traceability/public-references';

// P0-003 / D-P0003.1 opción A — Concesiones externas de LECTURA y DESCARGA, sin portal comprador.
//
// Una concesión **no crea membresía, no asigna roles y no da acceso general**. La vía del concesionario
// (`/api/v1/granted/...`) **no consulta membresías en absoluto**: consulta la concesión, el vencimiento y la
// revocación, en **cada** acceso y en **cada** descarga. Por eso una segunda membresía no puede hacerse pasar
// por una concesión.
//
// Lo que esta entrega NO hace: no construye el portal comprador (RF-32/P1-001), no introduce elevación de
// plataforma —D-04 sigue pendiente y no se cierra por omisión—, no crea permisos para `BUYER` ni para
// `SUPER_ADMIN`, y no infiere acceso por identidad (ni correo, ni nombre, ni país).

type Tipo = 'LOT' | 'SHIPMENT' | 'DD_SNAPSHOT';

/** Permiso que el CONCEDENTE debe tener para poder conceder lectura de cada tipo: no se concede lo que no se tiene. */
const LECTURA: Record<Tipo, Permission> = { LOT: 'lot:read', SHIPMENT: 'shipment:read', DD_SNAPSHOT: 'dd:read' };
/** Y para conceder descarga del paquete, además, la facultad de exportarlo. */
const DESCARGA: Record<Tipo, Permission | null> = { LOT: null, SHIPMENT: null, DD_SNAPSHOT: 'dd:export_package' };

class CrearConcesionDto {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiProperty({ description: 'Cuenta destinataria, existente y activa. No se crea ni se invita desde aquí.' })
  @IsUUID() grantee_user_id!: string;
  @ApiProperty({ enum: ['LOT', 'SHIPMENT', 'DD_SNAPSHOT'] }) @IsIn(['LOT', 'SHIPMENT', 'DD_SNAPSHOT']) resource_type!: Tipo;
  @ApiProperty({ description: 'Instancia concreta. No se admiten comodines ni alcances por organización.' })
  @IsUUID() resource_id!: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() can_read?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() can_download?: boolean;
  @ApiProperty({ description: 'Vencimiento obligatorio, en el futuro. No existe la concesión indefinida.' })
  @IsISO8601() expires_at!: string;
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
}

class RevocarDto {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
}

@Injectable()
export class AccessGrantsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  /** Lo mismo para «no existe» y «no te corresponde»: una concesión no es un oráculo de existencia. */
  private get opaca() {
    return notFound('No hay ningún recurso concedido a tu cuenta con ese identificador.');
  }

  // --------------------------------------------------------------- lado del CONCEDENTE
  async crear(user: AuthUser, orgId: string, dto: CrearConcesionDto, requestId?: string) {
    const ctx = await this.authz.require(user, orgId, 'grant:manage', { mutation: true });

    // 1) No se concede lo que no se tiene: el concedente necesita autorización efectiva sobre el recurso y la acción.
    const quiereLeer = dto.can_read !== false;
    const quiereDescargar = dto.can_download === true;
    if (quiereLeer && !ctx.permissions.includes(LECTURA[dto.resource_type])) {
      throw forbidden('GRANT_BEYOND_GRANTOR', 'No puedes conceder una lectura que tú no tienes sobre ese recurso.');
    }
    // La DESCARGA espera una decisión de producto y, mientras tanto, **no se concede para ningún tipo**:
    // conceder algo que el sistema no va a entregar sería peor que rechazarlo. El conflicto está contrastado:
    // construir el paquete para una cuenta sin permisos produce redacciones (geometrías y documentos con datos
    // personales) y la exportación de un DD_PACKAGE **se bloquea** cuando las hay (`EXPORT_SCOPE_INSUFFICIENT`,
    // dd.ts); servir en su lugar el ya exportado ampliaría el acceso, que es justo lo que el punto 6 del
    // contrato prohíbe sin contrato expreso. Decisión en `docs/decisiones/P0-003-CONCESIONES-Y-ELEVACION.md`.
    if (quiereDescargar) {
      throw new AppError(422, 'GRANT_DOWNLOAD_PENDING_DECISION',
        'La concesión de DESCARGA espera una decisión de producto: el paquete final se bloquea si hay que redactarlo, y servir el ya exportado ampliaría el acceso a geometrías y documentos personales. Concede lectura mientras tanto.',
        [{ field: 'can_download', reason: `decisión pendiente; cuando se resuelva exigirá ${DESCARGA[dto.resource_type] ?? 'una facultad de descarga que este tipo no tiene'}` }]);
    }

    // 2) Vencimiento obligatorio y futuro.
    const vence = new Date(dto.expires_at);
    if (Number.isNaN(vence.getTime()) || vence.getTime() <= Date.now()) {
      throw new AppError(422, 'GRANT_EXPIRY_INVALID', 'El vencimiento debe ser una fecha futura.', [{ field: 'expires_at', reason: 'no futura' }]);
    }

    // 3) Destinatario: cuenta existente y activa. No se crea ni se invita desde aquí, y no se infiere por identidad.
    const destinatario = await this.db.selectFrom('users').select(['id', 'status']).where('id', '=', dto.grantee_user_id).executeTakeFirst();
    if (!destinatario) throw new AppError(422, 'REFERENCE_NOT_FOUND', 'La cuenta destinataria no existe.', [{ field: 'grantee_user_id', reason: 'no existe' }]);
    if (destinatario.status !== 'ACTIVE') throw new AppError(422, 'GRANTEE_NOT_ACTIVE', 'La cuenta destinataria no está activa.', [{ field: 'grantee_user_id', reason: destinatario.status }]);
    if (destinatario.id === user.id) throw new AppError(422, 'GRANT_TO_SELF', 'No tiene sentido concederte acceso a ti mismo.', [{ field: 'grantee_user_id', reason: 'es quien concede' }]);

    const id = randomUUID();
    try {
      await this.db.transaction().execute(async (trx) => {
        const previa = await trx.selectFrom('access_grants').select('id').where('organization_id', '=', orgId).where('operation_id', '=', dto.operation_id).executeTakeFirst();
        if (previa) return; // reintento idempotente
        await trx.insertInto('access_grants').values({
          id, organization_id: orgId, grantee_user_id: dto.grantee_user_id, resource_type: dto.resource_type, resource_id: dto.resource_id,
          can_read: quiereLeer, can_download: quiereDescargar, expires_at: vence, reason: dto.reason.trim(),
          granted_by: user.id, operation_id: dto.operation_id,
        }).execute();
        await this.audit.record(trx, { organizationId: orgId, actorUserId: user.id, action: 'grant.create', entityType: 'access_grant', entityId: id, requestId, result: 'SUCCESS',
          after: { resource_type: dto.resource_type, resource_id: dto.resource_id, grantee_user_id: dto.grantee_user_id, can_read: quiereLeer, can_download: quiereDescargar, expires_at: vence.toISOString(), reason: dto.reason.trim() } });
      });
    } catch (e) {
      const c = (e as { constraint?: string }).constraint;
      if (c === 'access_grants_activa_uq') throw conflict('GRANT_ALREADY_ACTIVE', 'Ya hay una concesión activa para esa cuenta sobre ese recurso. Revócala antes de conceder otra.');
      if (c === 'access_grants_operacion_uq') throw conflict('OPERATION_ID_REUSED', 'Ese identificador de operación ya se usó para otra concesión.');
      // El disparador de correspondencia es la última defensa: nadie concede un recurso que no es suyo. Se
      // traduce a 422 para que la respuesta diga qué pasó, en vez de un 500 opaco.
      if (/no pertenece a la organizacion/.test((e as Error).message ?? '')) {
        throw new AppError(422, 'REFERENCE_NOT_FOUND', 'El recurso no pertenece a tu organización.', [{ field: 'resource_id', reason: 'de otra organización' }]);
      }
      throw e;
    }
    return { grant: await this.ver(orgId, dto.operation_id) };
  }

  async revocar(user: AuthUser, orgId: string, id: string, dto: RevocarDto, requestId?: string) {
    const ctx = await this.authz.require(user, orgId, 'grant:manage', { mutation: true });
    await this.db.transaction().execute(async (trx) => {
      const g = await trx.selectFrom('access_grants').selectAll().where('organization_id', '=', ctx.organizationId).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!g) throw notFound('La concesión no existe en tu organización.');
      if (g.revoked_at) return; // revocar dos veces no es un error: ya no concede nada
      await trx.updateTable('access_grants').set({ revoked_at: new Date(), revoked_by: user.id, revoke_reason: dto.reason.trim() } as never).where('id', '=', id).execute();
      await this.audit.record(trx, { organizationId: orgId, actorUserId: user.id, action: 'grant.revoke', entityType: 'access_grant', entityId: id, requestId, result: 'SUCCESS',
        after: { reason: dto.reason.trim() } });
    });
    return { grant: await this.verPorId(orgId, id) };
  }

  async listar(user: AuthUser, orgId: string) {
    const ctx = await this.authz.require(user, orgId, 'grant:manage', { mutation: false });
    const filas = await sql<{ id: string; grantee_user_id: string; grantee_email: string; resource_type: Tipo; resource_id: string; can_read: boolean; can_download: boolean; expires_at: string; revoked_at: string | null; reason: string }>`
      SELECT g.id, g.grantee_user_id, u.email AS grantee_email, g.resource_type, g.resource_id, g.can_read, g.can_download,
             g.expires_at::text, g.revoked_at::text, g.reason
      FROM access_grants g JOIN users u ON u.id = g.grantee_user_id
      WHERE g.organization_id = ${ctx.organizationId} ORDER BY g.created_at DESC`.execute(this.db);
    return { grants: filas.rows.map((g) => ({ ...g, estado: this.estado(g) })) };
  }

  private estado(g: { expires_at: string; revoked_at: string | null }) {
    if (g.revoked_at) return 'REVOCADA';
    return new Date(g.expires_at).getTime() <= Date.now() ? 'VENCIDA' : 'ACTIVA';
  }

  private async ver(orgId: string, operationId: string) {
    const g = await this.db.selectFrom('access_grants').selectAll().where('organization_id', '=', orgId).where('operation_id', '=', operationId).executeTakeFirstOrThrow();
    return { id: g.id, resource_type: g.resource_type, resource_id: g.resource_id, grantee_user_id: g.grantee_user_id, can_read: g.can_read, can_download: g.can_download, expires_at: g.expires_at, revoked_at: g.revoked_at };
  }
  private async verPorId(orgId: string, id: string) {
    const g = await this.db.selectFrom('access_grants').selectAll().where('organization_id', '=', orgId).where('id', '=', id).executeTakeFirstOrThrow();
    return { id: g.id, resource_type: g.resource_type, resource_id: g.resource_id, grantee_user_id: g.grantee_user_id, can_read: g.can_read, can_download: g.can_download, expires_at: g.expires_at, revoked_at: g.revoked_at };
  }

  // --------------------------------------------------------------- lado del CONCESIONARIO
  /**
   * Revalida TODO en cada acceso: cuenta activa, concesión viva, no vencida, no revocada, y la acción pedida.
   * **No mira membresías**: el acceso viene de la concesión, no de pertenecer a la organización.
   */
  private async vigente(user: AuthUser, grantId: string, accion: 'read' | 'download') {
    const cuenta = await this.db.selectFrom('users').select(['id', 'status']).where('id', '=', user.id).executeTakeFirst();
    if (!cuenta || cuenta.status !== 'ACTIVE') throw this.opaca;
    const g = await this.db.selectFrom('access_grants').selectAll()
      .where('id', '=', grantId).where('grantee_user_id', '=', user.id).executeTakeFirst();
    if (!g) throw this.opaca;
    if (g.revoked_at) throw this.opaca;
    if (new Date(g.expires_at as unknown as string).getTime() <= Date.now()) throw this.opaca;
    if (accion === 'read' && !g.can_read) throw this.opaca;
    if (accion === 'download' && !g.can_download) throw this.opaca;
    return g;
  }

  /** Lo que una cuenta externa tiene concedido. No revela nada de la organización más allá de su nombre. */
  async mias(user: AuthUser) {
    const filas = await sql<{ id: string; organization: string; resource_type: Tipo; can_read: boolean; can_download: boolean; expires_at: string }>`
      SELECT g.id, o.name AS organization, g.resource_type, g.can_read, g.can_download, g.expires_at::text
      FROM access_grants g JOIN organizations o ON o.id = g.organization_id
      JOIN users u ON u.id = g.grantee_user_id AND u.status = 'ACTIVE'
      WHERE g.grantee_user_id = ${user.id} AND g.revoked_at IS NULL AND g.expires_at > now()
      ORDER BY g.expires_at`.execute(this.db);
    return { grants: filas.rows };
  }

  /**
   * Proyección permitida. **La concesión no levanta la clasificación**: se construye con las reglas existentes
   * aplicadas a un contexto SIN permisos, que es lo más restrictivo que el producto sabe producir. No hay
   * identidad de productores, ni geometrías, ni documentos personales: solo códigos, estados y agregados,
   * como el Buyer Portal de S3 §22.8 («183 productores», no sus nombres).
   */
  async leer(user: AuthUser, grantId: string) {
    const g = await this.vigente(user, grantId, 'read');
    await this.registrarUso(user, g.organization_id, g.id, 'grant.read');
    const org = g.organization_id;
    if (g.resource_type === 'LOT') {
      const l = (await sql<{ id: string; lot_code: string; status: string; origin_status: string; product: string; productores: number; parcelas: number }>`
        SELECT l.id, l.lot_code, l.status, l.origin_status, p.name AS product,
               (SELECT count(DISTINCT d.producer_id)::int FROM lot_inputs i JOIN receptions r ON r.id = i.reception_id JOIN deliveries d ON d.id = r.delivery_id WHERE i.lot_id = l.id) AS productores,
               (SELECT count(DISTINCT o.plot_id)::int FROM lot_inputs i JOIN receptions r ON r.id = i.reception_id JOIN delivery_origins o ON o.delivery_id = r.delivery_id WHERE i.lot_id = l.id) AS parcelas
        FROM lots l JOIN products p ON p.id = l.product_id WHERE l.id = ${g.resource_id} AND l.organization_id = ${org}`.execute(this.db)).rows[0];
      if (!l) throw this.opaca;
      return { resource_type: 'LOT', lot_code: l.lot_code, status: l.status, product: l.product,
        origin_status: l.origin_status, productores: l.productores, parcelas: l.parcelas,
        public_reference: await referenciaDe(this.db, org, 'LOT', l.id),
        nota: 'Agregados sin identidad: la concesión no levanta la clasificación de datos.' };
    }
    if (g.resource_type === 'SHIPMENT') {
      const s = (await sql<{ id: string; shipment_code: string; status: string; destination_country: string; dispatch_at: string | null; items: number }>`
        SELECT s.id, s.shipment_code, s.status, s.destination_country, s.dispatch_at::text,
               (SELECT count(*)::int FROM shipment_items i WHERE i.shipment_id = s.id) AS items
        FROM shipments s WHERE s.id = ${g.resource_id} AND s.organization_id = ${org}`.execute(this.db)).rows[0];
      if (!s) throw this.opaca;
      return { resource_type: 'SHIPMENT', shipment_code: s.shipment_code, status: s.status,
        destination_country: s.destination_country, dispatch_at: s.dispatch_at, items: s.items,
        public_reference: await referenciaDe(this.db, org, 'SHIPMENT', s.id),
        nota: 'Destino declarado por la organización; Terra Link no lo verifica.' };
    }
    const sn = (await sql<{ id: string; snapshot_number: number; readiness: string; content_hash: string; case_number: string; requirements: Array<{ code: string; status: string }> }>`
      SELECT sn.id, sn.snapshot_number, sn.readiness, sn.content_hash, c.case_number, sn.requirements
      FROM dd_snapshots sn JOIN dd_cases c ON c.id = sn.case_id WHERE sn.id = ${g.resource_id} AND sn.organization_id = ${org}`.execute(this.db)).rows[0];
    if (!sn) throw this.opaca;
    return { resource_type: 'DD_SNAPSHOT', case_number: sn.case_number, snapshot_number: sn.snapshot_number,
      readiness: sn.readiness, content_hash: sn.content_hash,
      requirements: (sn.requirements ?? []).map((r) => ({ code: r.code, status: r.status })),
      public_reference: await referenciaDe(this.db, org, 'DD_SNAPSHOT', sn.id),
      nota: 'Preparación interna. NO acredita presentación de DDS ni conformidad EUDR.' };
  }

  /** Registra el USO, no solo la creación: el contrato exige auditar creación, cambios, revocación y uso. */
  private async registrarUso(user: AuthUser, orgId: string, grantId: string, action: string) {
    await this.audit.record(this.db, { organizationId: orgId, actorUserId: user.id, action, entityType: 'access_grant', entityId: grantId, result: 'SUCCESS', after: { via: 'concesión externa' } });
  }

}

@ApiTags('Autorización')
@Controller('api/v1/organizations/:orgId/access-grants')
export class AccessGrantsController {
  constructor(private readonly service: AccessGrantsService) {}

  @Post()
  @ApiOperation({ summary: 'Conceder acceso externo a una instancia concreta (P0-003)',
    description: 'La concesión NO crea membresía ni asigna roles. Exige vencimiento futuro y solo puede conceder lo que el concedente ya tiene.' })
  crear(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Body() dto: CrearConcesionDto, @Req() req: AuthedRequest) {
    return this.service.crear(u, o, dto, req.requestId);
  }

  @Get()
  listar(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string) {
    return this.service.listar(u, o);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revocar una concesión, con efecto inmediato' })
  revocar(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevocarDto, @Req() req: AuthedRequest) {
    return this.service.revocar(u, o, id, dto, req.requestId);
  }
}

@ApiTags('Autorización')
@Controller('api/v1/granted')
export class GrantedController {
  constructor(private readonly service: AccessGrantsService) {}

  @Get()
  @ApiOperation({ summary: 'Lo que otras organizaciones han concedido a mi cuenta (P0-003)' })
  mias(@CurrentUser() u: AuthUser) {
    return this.service.mias(u);
  }

  @Get(':grantId')
  @ApiOperation({ summary: 'Proyección permitida del recurso concedido',
    description: 'Revalida cuenta, concesión, vencimiento, revocación y acción en CADA acceso. Un recurso inexistente y uno no concedido responden igual.' })
  leer(@CurrentUser() u: AuthUser, @Param('grantId', ParseUUIDPipe) id: string) {
    return this.service.leer(u, id);
  }
}
