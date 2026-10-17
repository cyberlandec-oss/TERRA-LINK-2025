import { Controller, Get, Inject, Injectable, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sql, type Kysely } from 'kysely';
import type Redis from 'ioredis';
import { Public } from '../auth/auth';
import { DB, LATEST_MIGRATION } from '../db/database';
import type { Database } from '../db/schema';
import { MALWARE_SCANNER, type MalwareScanner } from '../storage/scanner';
import { REDIS } from '../auth/login-rate-limit';

// RNF-10 — Avisos operativos verificables, **sin secretos y sin datos de ninguna organización**.
//
// QUÉ ES UN AVISO AQUÍ
// Cada uno tiene **condición comprobable**, **estado** (`FIRING`/`OK`), **lo observado**, **qué hacer** y una
// **recuperación reconocible**: cuando la condición deja de cumplirse, el aviso vuelve a `OK` solo. No hay
// estados intermedios opinables ni severidades inventadas.
//
// QUÉ NO SE INVENTA
// **No hay objetivos p95, de disponibilidad ni umbrales sin contrato**: TECH-001 sigue pendiente y sin él no
// hay nada que aprobar. Todos los avisos de aquí se apoyan en condiciones **ya definidas** en el producto:
// dependencias del núcleo, migración aplicada frente a la que el código conoce, análisis antimalware y cartas
// muertas del outbox.
//
// DEGRADACIÓN NO ES CAÍDA
// El escáner no disponible **no es un fallo de toda la API** ni se presenta como análisis limpio: los
// documentos quedan **pendientes**, la API sigue atendiendo y el aviso lo dice con `degradacion: true`. Solo
// las dependencias del **núcleo** (base, esquema, Redis) marcan indisponibilidad.
//
// ALCANCE
// Sin servicios de pago, sin envíos a terceros y **sin permisos nuevos**: es una ruta pública como `/health`,
// y por eso solo publica **recuentos agregados**, nunca identificadores, nombres ni datos de organización.

export type EstadoAviso = 'FIRING' | 'OK';

export interface Aviso {
  code: string;
  state: EstadoAviso;
  /** Condición comprobable, redactada para que se pueda verificar a mano. */
  condition: string;
  /** Lo que se observó al evaluarla. Solo agregados. */
  observed: string;
  /** Qué hacer si está activo. Vacío cuando está en OK. */
  action: string | null;
  /** `true` cuando el servicio sigue atendiendo con capacidad reducida; `false` cuando es indisponibilidad. */
  degradacion: boolean;
}

export interface Dependencias {
  database: 'ok' | 'unavailable';
  schema: 'ok' | 'unavailable';
  redis: 'ok' | 'unavailable';
  scanner: 'ok' | 'unavailable';
  migration: string | null;
}

/**
 * Fuente ÚNICA del estado de dependencias: la usan `/health/ready` y los avisos, para que no puedan
 * contradecirse. Nunca lanza: una dependencia caída es un estado, no una excepción.
 */
export async function evaluarDependencias(
  db: Kysely<Database>,
  redis: Redis,
  scanner: MalwareScanner,
): Promise<Dependencias> {
  const d: Dependencias = { database: 'unavailable', schema: 'unavailable', redis: 'unavailable', scanner: 'unavailable', migration: null };
  try {
    const row = await sql<{ name: string }>`SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1`.execute(db);
    d.database = 'ok';
    d.migration = row.rows[0]?.name ?? null;
    if (d.migration === LATEST_MIGRATION) d.schema = 'ok';
  } catch { /* base no disponible */ }
  try {
    if ((await redis.ping()) === 'PONG') d.redis = 'ok';
  } catch { /* redis no disponible */ }
  try {
    if (scanner.ping ? await scanner.ping() : false) d.scanner = 'ok';
  } catch { /* escáner no disponible */ }
  return d;
}

@Injectable()
export class OperationsAlertsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async avisos(): Promise<{ generated_at: string; status: 'ok' | 'degraded' | 'unavailable'; alerts: Aviso[] }> {
    const dep = await evaluarDependencias(this.db, this.redis, this.scanner);
    const avisos: Aviso[] = [];

    // 1) Núcleo caído: ESTO sí es indisponibilidad.
    const caidas = (['database', 'schema', 'redis'] as const).filter((k) => dep[k] !== 'ok');
    avisos.push({
      code: 'CORE_DEPENDENCY_DOWN',
      state: caidas.length ? 'FIRING' : 'OK',
      condition: 'Alguna dependencia del núcleo (base de datos, esquema al día o Redis) no responde.',
      observed: caidas.length ? `sin responder: ${caidas.join(', ')}` : 'base de datos, esquema y Redis responden',
      action: caidas.length ? 'La API no puede atender con garantías: revisa esa dependencia antes de seguir operando.' : null,
      degradacion: false,
    });

    // 2) Esquema por detrás del código: la migración aplicada no es la última que el código conoce.
    const desfase = dep.database === 'ok' && dep.migration !== LATEST_MIGRATION;
    avisos.push({
      code: 'SCHEMA_CODE_MISMATCH',
      state: desfase ? 'FIRING' : 'OK',
      condition: 'La última migración aplicada no coincide con la última que conoce el código desplegado, en cualquiera de los dos sentidos.',
      observed: dep.database === 'ok' ? `aplicada=${dep.migration ?? 'ninguna'} · esperada=${LATEST_MIGRATION}` : 'no evaluable: la base no responde',
      action: desfase ? 'Si el esquema va por detrás, aplica las migraciones pendientes. Si va por DELANTE —lo habitual tras un retorno de la aplicación—, el código desplegado no conoce ese esquema: vuelve a la versión que sí lo conoce o restaura datos coherentes con el código. Ver docs/20 §Retorno y recuperación.' : null,
      degradacion: false,
    });

    // 3) Escáner caído: DEGRADACIÓN. Ni fallo de toda la API, ni análisis limpio.
    const sinEscaner = dep.scanner !== 'ok';
    avisos.push({
      code: 'DOCUMENT_ANALYSIS_UNAVAILABLE',
      state: sinEscaner ? 'FIRING' : 'OK',
      condition: 'El escáner antimalware no responde.',
      observed: sinEscaner ? 'escáner sin responder; el resto de la API sigue atendiendo' : 'escáner responde',
      action: sinEscaner ? 'Los documentos nuevos quedan con análisis PENDIENTE y no se habilitan. No se aprueban como limpios. Restablece el escáner y vuelve a analizarlos.' : null,
      degradacion: true,
    });

    // 4) Documentos esperando análisis: consecuencia observable de (3), con recuperación reconocible.
    let pendientes: number | null = null;
    if (dep.database === 'ok') {
      pendientes = Number((await sql<{ n: string }>`
        SELECT count(*)::text AS n FROM document_versions dv
        WHERE NOT EXISTS (SELECT 1 FROM document_version_scans s WHERE s.version_id = dv.id AND s.result = 'CLEAN')`.execute(this.db)).rows[0].n);
    }
    avisos.push({
      code: 'DOCUMENTS_PENDING_ANALYSIS',
      state: pendientes && pendientes > 0 ? 'FIRING' : 'OK',
      condition: 'Hay versiones de documento sin un análisis antimalware limpio.',
      observed: pendientes === null ? 'no evaluable: la base no responde' : `${pendientes} versión(es) sin análisis limpio`,
      action: pendientes && pendientes > 0 ? 'No se habilitan hasta tener análisis limpio. Si el escáner estuvo caído, vuelve a analizarlas; si alguna es INFECTED, no se habilita nunca.' : null,
      degradacion: true,
    });

    // 5) Cartas muertas del outbox: entregas agotadas que ya no se reintentan solas.
    let muertas: number | null = null;
    if (dep.database === 'ok') {
      muertas = Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM event_deliveries WHERE status = 'DEAD'`.execute(this.db)).rows[0].n);
    }
    avisos.push({
      code: 'EVENT_DELIVERIES_DEAD',
      state: muertas && muertas > 0 ? 'FIRING' : 'OK',
      condition: 'Hay entregas del outbox en estado DEAD: agotaron sus reintentos y no se recuperan solas.',
      observed: muertas === null ? 'no evaluable: la base no responde' : `${muertas} entrega(s) DEAD`,
      action: muertas && muertas > 0 ? 'Revisa la causa y reprocésalas desde el historial de eventos de su organización. Reprocesar no duplica efectos: el consumo es idempotente.' : null,
      degradacion: true,
    });

    const hayCaida = avisos.some((a) => a.state === 'FIRING' && !a.degradacion);
    const hayDegradacion = avisos.some((a) => a.state === 'FIRING' && a.degradacion);
    return {
      generated_at: new Date().toISOString(),
      status: hayCaida ? 'unavailable' : hayDegradacion ? 'degraded' : 'ok',
      alerts: avisos,
    };
  }
}

@ApiTags('Operación')
@Controller('operations')
export class OperationsAlertsController {
  constructor(private readonly service: OperationsAlertsService) {}

  @Public()
  @Get('alerts')
  @ApiOperation({
    summary: 'Avisos operativos verificables (RNF-10)',
    description:
      'Cada aviso tiene condición comprobable, estado, lo observado, qué hacer y una recuperación reconocible. ' +
      'Distingue DEGRADACIÓN (el escáner caído deja documentos pendientes, nunca limpios, y la API sigue atendiendo) ' +
      'de INDISPONIBILIDAD (dependencias del núcleo). Sin objetivos p95 ni umbrales sin contrato. ' +
      'Solo recuentos agregados: ni secretos, ni identificadores, ni datos de ninguna organización.',
  })
  async alerts(@Res({ passthrough: true }) res: Response) {
    const r = await this.service.avisos();
    // 503 solo cuando el núcleo está caído: una degradación responde 200, como `/health/ready`.
    if (r.status === 'unavailable') res.status(503);
    return r;
  }
}
