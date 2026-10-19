import { Controller, Get, Inject, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql, type Kysely } from 'kysely';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { AuthorizationService } from '../authz/authorization.service';
import type { TenantContext } from '../authz/authorization.service';
import { CurrentUser, type AuthUser } from '../auth/auth';
import { APP_CONFIG, type AppConfig } from '../config';
import { MAX_CHARS, MAX_MS, MAX_PAGES, MAX_STREAM_BYTES, MOTOR, MOTOR_VERSION } from '../extraction/pdf-text';

// P1-015 — Límites y consumo (RF-46; parte «**límites … comprobados**» de `docs/18:216`).
//
// QUÉ ES, Y POR QUÉ NO INVENTA NADA
// Los límites **ya existen** en el producto: tamaño de archivo, cuota de la organización, tope de geometría,
// intentos de acceso, límites de procesamiento de la extracción… Lo que faltaba era **poder comprobarlos**.
// Este módulo los **lee de la configuración y del código vigentes** y los publica con:
//   · **qué limita** y **dónde se aplica**;
//   · **su valor y su unidad**;
//   · **de dónde sale** —variable de entorno o constante del código—, para poder contrastarlo;
//   · **cómo se comprueba**, es decir qué respuesta da el producto cuando se supera.
//
// **No fija ningún límite nuevo** y **no decide** ninguna tarifa: eso sería inventar. Los valores son los que
// el producto aplica hoy; si alguien los cambia por entorno, esta pantalla muestra el valor cambiado.
//
// CONSUMO
// Junto a los límites se publica el **consumo observado de la organización** —lo que ocupa y cuánto lleva
// registrado—, medido con consultas reales y con su denominador explícito. El consumo **no es un coste**: no
// hay ninguna tarifa acordada, y decirlo es parte del contrato (RF-46: «decisiones de **coste**» está abierto).

interface Limite {
  code: string;
  label: string;
  /** Qué limita exactamente, en una frase. */
  what: string;
  value: number | string;
  unit: string;
  /** De dónde sale el valor: una variable de entorno o una constante del código. */
  source: string;
  /** Dónde se aplica, y qué pasa al superarlo: así se puede comprobar. */
  enforced_at: string;
  on_exceed: string;
}

@Injectable()
export class LimitsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly authz: AuthorizationService,
  ) {}

  private tiene(ctx: TenantContext, p: string) { return ctx.permissions.includes(p as never); }

  /** Los límites vigentes, leídos de la configuración y del código. Ninguno es inventado aquí. */
  private limites(): Limite[] {
    const c = this.config;
    return [
      {
        code: 'DOCUMENT_MAX_BYTES', label: 'Tamaño máximo de un documento',
        what: 'Bytes que puede ocupar un archivo al subirlo.',
        value: c.documents.maxBytes, unit: 'bytes', source: 'variable de entorno DOCUMENT_MAX_BYTES',
        enforced_at: 'POST /documents y POST /documents/:id/versions',
        on_exceed: '422 FILE_TOO_LARGE, y el archivo no se almacena.',
      },
      {
        code: 'DOCUMENT_ORG_QUOTA_BYTES', label: 'Cuota de almacenamiento por organización',
        what: 'Bytes totales que una organización puede tener almacenados en documentos.',
        value: c.documents.orgQuotaBytes, unit: 'bytes', source: 'variable de entorno DOCUMENT_ORG_QUOTA_BYTES',
        enforced_at: 'POST /documents y POST /documents/:id/versions',
        on_exceed: '422 al superar la cuota: la subida se rechaza.',
      },
      {
        code: 'GEOJSON_MAX_BYTES', label: 'Tamaño máximo de una geometría',
        what: 'Bytes de un GeoJSON aceptado.',
        value: c.geojson.maxBytes, unit: 'bytes', source: 'variable de entorno GEOJSON_MAX_BYTES',
        enforced_at: 'Alta y versiones de geometría de parcela',
        on_exceed: '422: la geometría se rechaza entera, no se recorta.',
      },
      {
        code: 'GEOJSON_MAX_POSITIONS', label: 'Vértices máximos de una geometría',
        what: 'Número de posiciones de un GeoJSON.',
        value: c.geojson.maxPositions, unit: 'posiciones', source: 'variable de entorno GEOJSON_MAX_POSITIONS',
        enforced_at: 'Validación de geometría', on_exceed: '422: se rechaza, no se simplifica.',
      },
      {
        code: 'LOGIN_RL_MAX_PER_ACCOUNT_IP', label: 'Intentos de acceso por cuenta y origen',
        what: 'Intentos fallidos admitidos en la ventana antes de frenar.',
        value: c.loginRateLimit.maxPerAccountAndIp, unit: `intentos / ${c.loginRateLimit.windowSeconds} s`,
        source: 'variables de entorno LOGIN_RL_MAX_PER_ACCOUNT_IP y LOGIN_RL_WINDOW_SECONDS',
        enforced_at: 'POST /auth/login',
        on_exceed: '429 TOO_MANY_ATTEMPTS. El freno es temporal, nunca permanente.',
      },
      {
        code: 'JWT_TTL_SECONDS', label: 'Duración de la sesión',
        what: 'Segundos de validez del testigo de acceso.',
        value: c.jwtTtlSeconds, unit: 'segundos', source: 'variable de entorno JWT_TTL_SECONDS',
        enforced_at: 'Toda petición autenticada', on_exceed: '401: hay que iniciar sesión otra vez.',
      },
      {
        code: 'EXTRACTION_MAX_CHARS', label: 'Texto máximo extraído de un documento',
        what: 'Caracteres que la extracción asistida acumula de un PDF.',
        value: MAX_CHARS, unit: 'caracteres', source: 'constante del código (extraction/pdf-text.ts)',
        enforced_at: 'POST /documents/:id/versions/:v/extraction',
        on_exceed: 'Se corta y se marca el texto como INCOMPLETO; nunca se presenta como completo.',
      },
      {
        code: 'EXTRACTION_MAX_PAGES', label: 'Páginas máximas leídas de un PDF',
        what: 'Páginas que la extracción asistida recorre.',
        value: MAX_PAGES, unit: 'páginas', source: 'constante del código (extraction/pdf-text.ts)',
        enforced_at: 'Extracción asistida', on_exceed: 'Se corta y se declara incompleto.',
      },
      {
        code: 'EXTRACTION_MAX_MS', label: 'Tiempo máximo de lectura de un PDF',
        what: 'Milisegundos que puede durar la lectura antes de cortar.',
        value: MAX_MS, unit: 'milisegundos', source: 'constante del código (extraction/pdf-text.ts)',
        enforced_at: 'Extracción asistida', on_exceed: 'Se corta y se declara incompleto.',
      },
      {
        code: 'EXTRACTION_MAX_STREAM_BYTES', label: 'Bytes máximos por flujo descomprimido',
        what: 'Tamaño de un único flujo tras descomprimir.',
        value: MAX_STREAM_BYTES, unit: 'bytes', source: 'constante del código (extraction/pdf-text.ts)',
        enforced_at: 'Extracción asistida', on_exceed: 'Ese flujo se omite y el texto se declara incompleto.',
      },
      {
        code: 'EXTRACTION_ENGINE', label: 'Motor de lectura de PDF',
        what: 'Componente local que decodifica la capa de texto, con su versión.',
        value: `${MOTOR} ${MOTOR_VERSION}`, unit: 'componente local',
        source: 'dependencia fijada en package.json',
        enforced_at: 'Extracción asistida',
        on_exceed: 'Si una fuente compuesta no declara su mapa de caracteres: TEXTO_NO_INTERPRETABLE, sin texto ni sugerencias.',
      },
    ];
  }

  async ver(user: AuthUser, orgId: string) {
    const ctx = await this.authz.require(user, orgId, 'organization:read', { mutation: false });

    // Consumo observado, con consultas reales. Cada cifra dice qué cuenta.
    const docs = (await sql<{ n: number; bytes: string }>`
      SELECT count(*)::int AS n, coalesce(sum(v.size_bytes), 0)::text AS bytes
      FROM document_versions v WHERE v.organization_id = ${orgId}`.execute(this.db)).rows[0];
    const otros = (await sql<{ documentos: number; parcelas: number; entregas: number; eventos: number }>`
      SELECT (SELECT count(*)::int FROM documents WHERE organization_id = ${orgId}) AS documentos,
             (SELECT count(*)::int FROM plots WHERE organization_id = ${orgId}) AS parcelas,
             (SELECT count(*)::int FROM deliveries WHERE organization_id = ${orgId}) AS entregas,
             (SELECT count(*)::int FROM domain_events WHERE organization_id = ${orgId}) AS eventos`
      .execute(this.db)).rows[0];

    const cuota = this.config.documents.orgQuotaBytes;
    const usados = Number(docs.bytes);
    return {
      limits: this.limites(),
      usage: {
        documents: otros.documentos,
        document_versions: docs.n,
        stored_bytes: usados,
        quota_bytes: cuota,
        quota_note: `${usados} de ${cuota} bytes. El denominador es la cuota configurada, no una estimación.`,
        plots: otros.parcelas,
        deliveries: otros.entregas,
        events: otros.eventos,
      },
      /** El idioma del producto, comprobable: RF-46 exige «español primero». */
      language: {
        primary: 'es',
        available: ['es'],
        note: 'El producto está en español y no hay una segunda lengua instalada. Añadir otra NO puede degradar '
          + 'el español: ese es el límite que fija RF-46 («español primero»). Ver ADR-0007.',
      },
      cost_note: 'El consumo NO es un coste: no hay tarifa acordada ni proveedor contratado. Qué se cobra, a '
        + 'quién y con qué unidad es una decisión abierta (D-54, ADR-0009). Este módulo solo mide y publica los '
        + 'límites vigentes.',
      sso_note: 'La autenticación es local (contraseña y testigo propio). NO hay inicio de sesión federado: '
        + 'elegir proveedor y asumir su coste es una decisión abierta (D-54, ADR-0008). Ver también ADR-0005.',
      note: 'Los límites se leen de la configuración y del código vigentes: si alguien los cambia por entorno, '
        + 'aquí se ve el valor cambiado. Ninguno se fija en esta pantalla.',
      restricted: this.tiene(ctx, 'organization:read') ? [] : ['usage'],
    };
  }
}

@ApiTags('limits')
@ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/limits')
export class LimitsController {
  constructor(private readonly service: LimitsService) {}

  @Get()
  @ApiOperation({ summary: 'Límites vigentes del producto y consumo observado de la organización' })
  ver(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) o: string) {
    return this.service.ver(u, o);
  }
}
