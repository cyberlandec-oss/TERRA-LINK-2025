import {
  Controller,
  Get,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  ServiceUnavailableException,
  type DynamicModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import { sql, type Kysely } from 'kysely';
import { APP_CONFIG, type AppConfig } from './config';
import { DB, LATEST_MIGRATION } from './db/database';
import type { Database } from './db/schema';
import { ErrorFilter } from './common/errors';
import { AuditService } from './audit/audit.service';
import { AuthController, AuthGuard, CurrentUser, Public, type AuthUser, type AuthedRequest } from './auth/auth';
import { AuthorizationService } from './authz/authorization.service';
import { RBAC_CATALOG_VERSION } from './authz/catalog';
import { OrganizationsController, OrganizationsService } from './organizations/organizations';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  // Readiness: base accesible y esquema en la última migración conocida por este build.
  @Public()
  @Get('ready')
  async ready() {
    try {
      const row = await sql<{ name: string }>`
        SELECT name FROM kysely_migration ORDER BY name DESC LIMIT 1`.execute(this.db);
      const current = row.rows[0]?.name ?? null;
      if (current !== LATEST_MIGRATION) throw new Error('schema');
      return { status: 'ok', migration: current };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible o esquema desactualizado');
    }
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
}

@Module({})
export class AppModule implements NestModule {
  static forRoot(config: AppConfig, db: Kysely<Database>): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, AuthController, MeController, OrganizationsController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: DB, useValue: db },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
        AuditService,
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
