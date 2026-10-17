import {
  Controller,
  Get,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  Res,
  OnApplicationShutdown,
  Injectable,
  type DynamicModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import Redis from 'ioredis';
import { sql, type Kysely } from 'kysely';
import { APP_CONFIG, type AppConfig } from './config';
import { DB, LATEST_MIGRATION } from './db/database';
import type { Database } from './db/schema';
import { ErrorFilter } from './common/errors';
import { AuditService } from './audit/audit.service';
import { AuditController, AuditQueryService } from './audit/audit-query';
import { ReportsController } from './reports/reports';
import { EntityReportsController } from './reports/reports-entities';
import { DeliveriesController, DeliveriesService } from './deliveries/deliveries';
import { LotsController, LotsService } from './lots/lots';
import { InventoryController, InventoryService } from './inventory/inventory';
import { RiskController, RiskService } from './risk/risk';
import { MitigationsController, MitigationsService } from './mitigations/mitigations';
import { DdController, DdService } from './dd/dd';
import { ShipmentsController, ShipmentsService } from './shipments/shipments';
import { SatelliteController, SatelliteService } from './satellite/satellite';
import { SyncController, SyncService } from './sync/sync';
import { ImportsController, ImportsService } from './imports/imports';
import { MyWorkController, MyWorkService } from './work/my-work';
import { AuthController, AuthGuard, CurrentUser, Public, type AuthUser, type AuthedRequest } from './auth/auth';
import { AuthorizationService } from './authz/authorization.service';
import { PLATFORM_PERMISSIONS, RBAC_CATALOG_VERSION, ROLE_PERMISSIONS } from './authz/catalog';
import { CatalogController, OrganizationsController, OrganizationsService } from './organizations/organizations';
import { InvitationsController, MembersController, MembersService, UsersController } from './members/members';
import { EVENT_STORE, EventStore } from './events/events';
import { ProducersController, ProducersService } from './producers/producers';
import { ProducerMatchingController, ProducerMatchingService } from './producers/matching';
import { PlotsController, PlotsService } from './plots/plots';
import { PolygonDraftsController, PolygonDraftsService } from './plots/polygon-drafts';
import { PII_CIPHER, PiiCipher } from './crypto/pii';
import { OBJECT_STORE, S3ObjectStore, type ObjectStore } from './storage/object-store';
import { GeometryImportsController, GeometryImportsService } from './plots/geometry-imports';
import { GisEvaluationController, GisEvaluationService } from './plots/gis-evaluation';
import { GeoProfileController, GeoProfileService } from './plots/geo-profile';
import { ProductsController, ProductsService } from './products/products';
import { CteController, CteService } from './traceability/cte';
import { KdeController, KdeService } from './traceability/kde';
import { PublicReferencesController, PublicReferencesService } from './traceability/public-references';
import { EventHistoryController, EventHistoryService } from './events/event-history';
import { DocumentsController, DocumentsService } from './documents/documents';
import { EvidenceController, EvidenceService } from './evidence/evidence';
import { ClamdScanner, MALWARE_SCANNER, type MalwareScanner } from './storage/scanner';
import { PRODUCTION_CONSUMERS } from './events/consumers';
import { LOGIN_RATE_LIMITER, LoginRateLimiter, REDIS, RedisAttemptStore } from './auth/login-rate-limit';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  // Readiness: estado por dependencia (sin detalles internos). 503 si falla una dependencia NÚCLEO (base, esquema,
  // Redis). El escáner antimalware es una capacidad: si está caído la API sigue atendiendo (las subidas se aceptan y
  // quedan «análisis pendiente», nunca limpias) y la respuesta es 200 con status «degraded», checks.scanner
  // «unavailable» y capabilities.document_analysis «UNAVAILABLE». No se informa todo como sano.
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks: Record<'database' | 'schema' | 'redis', 'ok' | 'unavailable'> = {
      database: 'unavailable', schema: 'unavailable', redis: 'unavailable',
    };
    let migration: string | null = null;
    try {
      const row = await sql<{ name: string }>`SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1`.execute(this.db);
      checks.database = 'ok';
      migration = row.rows[0]?.name ?? null;
      if (migration === LATEST_MIGRATION) checks.schema = 'ok';
    } catch {
      /* base no disponible */
    }
    try {
      if ((await this.redis.ping()) === 'PONG') checks.redis = 'ok';
    } catch {
      /* redis no disponible */
    }
    const ok = Object.values(checks).every((c) => c === 'ok');
    const scannerOk = this.scanner.ping ? await this.scanner.ping().catch(() => false) : false;
    if (!ok) res.status(503);
    return {
      status: !ok ? 'unavailable' : scannerOk ? 'ok' : 'degraded',
      checks: { ...checks, scanner: scannerOk ? 'ok' : 'unavailable' },
      capabilities: { document_analysis: scannerOk ? 'AVAILABLE' : 'UNAVAILABLE' },
      migration,
      ...(scannerOk ? {} : { note: 'Escáner antimalware no disponible: los archivos nuevos quedan con análisis pendiente y no se habilitan; el resto de la API funciona.' }),
    };
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('api/v1/me')
class MeController {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'first_name', 'last_name', 'platform_role'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    return { ...u, rbac_catalog_version: RBAC_CATALOG_VERSION };
  }

  // Catálogo efectivo: permisos por organización con membresía activa (cada org por separado; un rol
  // en una organización nunca aparece ni cuenta en otra) y permisos de plataforma.
  @Get('permissions')
  async permissions(@CurrentUser() user: AuthUser) {
    const memberships = await this.db
      .selectFrom('memberships')
      .select('organization_id')
      .where('user_id', '=', user.id)
      .where('status', '=', 'ACTIVE')
      .execute();
    const organizations = [];
    for (const m of memberships) {
      const ctx = await this.authz.tenantContext(user, m.organization_id);
      if (ctx) {
        organizations.push({
          organization_id: ctx.organizationId,
          organization_status: ctx.organizationStatus,
          roles: ctx.roles.sort(),
          permissions: ctx.permissions,
        });
      }
    }
    return {
      rbac_catalog_version: RBAC_CATALOG_VERSION,
      platform_permissions: user.platformRole === 'SUPER_ADMIN' ? PLATFORM_PERMISSIONS.SUPER_ADMIN : [],
      organizations,
    };
  }
}

@ApiTags('rbac')
@ApiBearerAuth()
@Controller('api/v1/rbac')
class RbacController {
  // Matriz rol → permisos del catálogo vigente (no contiene datos de ninguna organización).
  @Get('roles')
  roles() {
    return {
      rbac_catalog_version: RBAC_CATALOG_VERSION,
      organization_roles: Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({ role, permissions })),
      platform_roles: [{ role: 'SUPER_ADMIN', permissions: PLATFORM_PERMISSIONS.SUPER_ADMIN }],
    };
  }
}

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Injectable()
class ObjectStoreLifecycle implements OnApplicationShutdown {
  constructor(@Inject(OBJECT_STORE) private readonly store: ObjectStore) {}
  onApplicationShutdown(): void {
    this.store.close();
  }
}

@Module({})
export class AppModule implements NestModule {
  static forRoot(config: AppConfig, db: Kysely<Database>): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController, AuthController, MeController, OrganizationsController, CatalogController, RbacController,
        MembersController, InvitationsController, UsersController, ProducersController, ProducerMatchingController, PlotsController, PolygonDraftsController, GeometryImportsController, GisEvaluationController, GeoProfileController, ProductsController, CteController, KdeController, PublicReferencesController, EventHistoryController, DocumentsController, EvidenceController, AuditController, DeliveriesController, LotsController, InventoryController, RiskController, MitigationsController, DdController, SyncController, ImportsController, MyWorkController, ShipmentsController, SatelliteController, ReportsController, EntityReportsController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: DB, useValue: db },
        {
          provide: REDIS,
          // Fail-closed: si Redis no responde, el login devuelve error en vez de omitir el límite.
          useFactory: () => new Redis(config.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 1500 }),
        },
        {
          provide: LOGIN_RATE_LIMITER,
          inject: [REDIS],
          useFactory: (redis: Redis) => new LoginRateLimiter(new RedisAttemptStore(redis, config.redisKeyPrefix), config.loginRateLimit),
        },
        RedisLifecycle,
        ObjectStoreLifecycle,
        { provide: EVENT_STORE, useValue: new EventStore(PRODUCTION_CONSUMERS) },
        MembersService,
        ProducersService,
        ProducerMatchingService,
        PlotsService,
        PolygonDraftsService,
        { provide: PII_CIPHER, useValue: new PiiCipher(config.pii) },
        { provide: OBJECT_STORE, useValue: new S3ObjectStore(config.objectStore) },
        GeometryImportsService,
        GisEvaluationService,
        GeoProfileService,
        ProductsService,
        CteService,
        KdeService,
        PublicReferencesService,
        EventHistoryService,
        DocumentsService,
        EvidenceService,
        { provide: MALWARE_SCANNER, useValue: new ClamdScanner(config.scanner.host, config.scanner.port, config.scanner.timeoutMs) },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
        AuditService,
        AuditQueryService,
        DeliveriesService,
        LotsService,
        InventoryService,
        RiskService,
        MitigationsService,
        DdService,
        ShipmentsService,
        SatelliteService,
        SyncService,
        ImportsService,
        MyWorkService,
        AuthorizationService,
        OrganizationsService,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((req: AuthedRequest, res: Response, next: NextFunction) => {
        const incoming = req.headers['x-request-id'];
        req.requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', req.requestId);
        next();
      })
      .forRoutes('*path');
  }
}
