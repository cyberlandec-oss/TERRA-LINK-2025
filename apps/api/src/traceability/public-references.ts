import { Controller, Get, Inject, Injectable, Param, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { AuthUser } from '../auth/auth';
import { AuthorizationService, type TenantContext } from '../authz/authorization.service';
import type { Permission } from '../authz/catalog';
import { notFound } from '../common/errors';
import { DB } from '../db/database';
import type { Database, PublicReferenceEntity } from '../db/schema';

// RF-47 — Resolución de una referencia pública. Contrato: `docs/decisiones/RF-47-REFERENCIA-PUBLICA.md`.
//
// **Conocer una referencia no concede acceso.** Este resolver exige autenticación y, además, autorización
// sobre el recurso real: membresía activa en la organización dueña y el permiso de lectura del dominio, con el
// mismo alcance asignado que aplica el resto del producto. No crea permisos nuevos.
//
// **Respuesta indistinguible**: referencia inexistente, recurso de otra organización y recurso fuera de
// alcance devuelven **lo mismo**. Si se distinguieran, la referencia sería un oráculo de existencia: probando
// valores se confirmaría cuáles son válidos (D-47.5).
//
// Lo que esto NO es: publicación. No expone nada a quien no podría verlo ya por las rutas normales, no define
// audiencias y no emite QR. Eso es **RF-33 / P1-002**, que sigue fuera de esta entrega.

/** Permiso de dominio por tipo, y si admite el alcance «asignado» que usa el resto del producto. */
const ACCESO: Record<PublicReferenceEntity, { amplio: Permission; asignado?: Permission }> = {
  PRODUCER: { amplio: 'producer:read', asignado: 'producer:read_assigned' },
  PLOT: { amplio: 'plot:read', asignado: 'plot:read_assigned' },
  DELIVERY: { amplio: 'delivery:read', asignado: 'delivery:read_assigned' },
  LOT: { amplio: 'lot:read' },
  SHIPMENT: { amplio: 'shipment:read' },
  DD_SNAPSHOT: { amplio: 'dd:read' },
};

/**
 * RF-47 — Referencia pública de una entidad, para **adjuntarla a su lectura autorizada**.
 *
 * Entregar la referencia a quien YA puede leer el recurso **no es publicarla por audiencias**: no crea acceso,
 * no define proyecciones por destinatario y no emite ningún QR. Eso último es RF-33. Sin esto, la única forma
 * de obtener una referencia sería consultar la base, que no es una vía aceptable para la revisión ni para un
 * cliente.
 *
 * No toca el contenido de ninguna entidad: la referencia vive en su propio registro, así que adjuntarla a una
 * respuesta **no altera el contenido, el manifiesto ni el hash** de una instantánea.
 */
export async function referenciaDe(db: Kysely<Database> | Transaction<Database>, org: string, tipo: PublicReferenceEntity, id: string): Promise<string | null> {
  const r = await sql<{ reference: string }>`
    SELECT reference FROM public_references WHERE organization_id = ${org} AND entity_type = ${tipo} AND entity_id = ${id}`.execute(db);
  return r.rows[0]?.reference ?? null;
}

/** Varias de un tipo, para listados: devuelve `{ [entity_id]: reference }`. */
export async function referenciasDe(db: Kysely<Database> | Transaction<Database>, org: string, tipo: PublicReferenceEntity, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const r = await sql<{ entity_id: string; reference: string }>`
    SELECT entity_id, reference FROM public_references
    WHERE organization_id = ${org} AND entity_type = ${tipo} AND entity_id = ANY(${ids})`.execute(db);
  return Object.fromEntries(r.rows.map((x) => [x.entity_id, x.reference]));
}

interface Resuelta { reference: string; entity_type: PublicReferenceEntity; organization_id: string; id: string; code: string }

@Injectable()
export class PublicReferencesService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>, private readonly authz: AuthorizationService) {}

  /** Una sola respuesta para todo lo que no se puede entregar: no revela si la referencia existe. */
  private get opaca() {
    return notFound('No hay ningún recurso a tu alcance con esa referencia.');
  }

  async resolve(user: AuthUser, reference: string): Promise<Resuelta> {
    const ref = await this.db.selectFrom('public_references').selectAll().where('reference', '=', reference).executeTakeFirst();
    if (!ref) throw this.opaca;

    // Tenant desde el registro, nunca desde la petición: la referencia no elige organización.
    const ctx = await this.authz.tenantContext(user, ref.organization_id);
    if (!ctx) throw this.opaca;

    const fila = await this.entidad(ref.entity_type, ref.entity_id, ref.organization_id);
    if (!fila) throw this.opaca; // la entidad ya no está, o no es de esa organización
    if (!this.autorizado(ctx, ref.entity_type, fila.assignee)) throw this.opaca;

    return { reference: ref.reference, entity_type: ref.entity_type, organization_id: ref.organization_id, id: fila.id, code: fila.code };
  }

  private autorizado(ctx: TenantContext, tipo: PublicReferenceEntity, assignee: string | null): boolean {
    const { amplio, asignado } = ACCESO[tipo];
    if (ctx.permissions.includes(amplio)) return true;
    // Mismo predicado que el resto del producto: solo lo asignado a la propia membresía.
    return !!asignado && ctx.permissions.includes(asignado) && assignee !== null && assignee === ctx.membershipId;
  }

  /** Identidad mínima del recurso, filtrada por tenant, más la membresía que gobierna el alcance asignado. */
  private async entidad(tipo: PublicReferenceEntity, id: string, org: string): Promise<{ id: string; code: string; assignee: string | null } | undefined> {
    const q = {
      PRODUCER: sql<{ id: string; code: string; assignee: string | null }>`
        SELECT p.id, p.producer_code AS code, p.assigned_membership_id AS assignee
        FROM producers p WHERE p.id = ${id} AND p.organization_id = ${org}`,
      PLOT: sql<{ id: string; code: string; assignee: string | null }>`
        SELECT pl.id, pl.plot_code AS code, pr.assigned_membership_id AS assignee
        FROM plots pl JOIN producers pr ON pr.id = pl.producer_id
        WHERE pl.id = ${id} AND pl.organization_id = ${org}`,
      DELIVERY: sql<{ id: string; code: string; assignee: string | null }>`
        SELECT d.id, d.delivery_code AS code, pr.assigned_membership_id AS assignee
        FROM deliveries d JOIN producers pr ON pr.id = d.producer_id
        WHERE d.id = ${id} AND d.organization_id = ${org}`,
      LOT: sql<{ id: string; code: string; assignee: string | null }>`
        SELECT l.id, l.lot_code AS code, NULL::uuid AS assignee
        FROM lots l WHERE l.id = ${id} AND l.organization_id = ${org}`,
      SHIPMENT: sql<{ id: string; code: string; assignee: string | null }>`
        SELECT s.id, s.shipment_code AS code, NULL::uuid AS assignee
        FROM shipments s WHERE s.id = ${id} AND s.organization_id = ${org}`,
      // La instantánea se identifica por su expediente y su número: ni el contenido ni el hash se tocan.
      DD_SNAPSHOT: sql<{ id: string; code: string; assignee: string | null }>`
        SELECT sn.id, c.case_number || '#' || sn.snapshot_number AS code, NULL::uuid AS assignee
        FROM dd_snapshots sn JOIN dd_cases c ON c.id = sn.case_id
        WHERE sn.id = ${id} AND sn.organization_id = ${org}`,
    }[tipo];
    return (await q.execute(this.db)).rows[0];
  }
}

@ApiTags('Trazabilidad')
@Controller('api/v1/public-references')
export class PublicReferencesController {
  constructor(private readonly service: PublicReferencesService) {}

  @Get(':reference')
  @ApiOperation({
    summary: 'Resolver una referencia pública (RF-47)',
    description:
      'Conocer la referencia NO concede acceso: exige membresía en la organización dueña y el permiso de lectura ' +
      'del dominio, con el mismo alcance asignado que el resto del producto. Una referencia inexistente, un ' +
      'recurso de otra organización y un recurso fuera de alcance devuelven la MISMA respuesta. No publica nada: ' +
      'las audiencias y el QR son RF-33.',
  })
  @ApiOkResponse({ description: 'Identidad mínima del recurso referenciado.' })
  resolve(@Req() req: { user: AuthUser }, @Param('reference') reference: string) {
    return this.service.resolve(req.user, reference);
  }
}
