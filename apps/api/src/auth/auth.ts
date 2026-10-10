import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import type { Kysely } from 'kysely';
import { APP_CONFIG, type AppConfig } from '../config';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { AppError, unauthenticated } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { verifyPassword } from './passwords';
import { LOGIN_RATE_LIMITER, type LoginRateLimiter } from './login-rate-limit';

// Autenticación local (email + contraseña argon2id, JWT de corta vida). OIDC queda pendiente (ADR-0005).
export interface AuthUser {
  id: string;
  email: string;
  platformRole: 'SUPER_ADMIN' | null;
}

export type AuthedRequest = Request & { user?: AuthUser; requestId?: string };

const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user!;
});

/** Emite un JWT ligado a la versión de sesión vigente del usuario (`tv`). */
export function issueAccessToken(config: AppConfig, userId: string, tokenVersion: number) {
  const accessToken = jwt.sign({ tv: tokenVersion }, config.jwtSecret, {
    algorithm: 'HS256', subject: userId, expiresIn: config.jwtTtlSeconds,
  });
  return { access_token: accessToken, token_type: 'Bearer', expires_in: config.jwtTtlSeconds };
}

/** Lee el usuario autenticado si hay Bearer válido; null si no hay cabecera. Lanza 401 si es inválido. */
export async function authenticate(
  req: AuthedRequest,
  config: AppConfig,
  db: Kysely<Database>,
): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header) return null;
  if (!header.startsWith('Bearer ')) throw unauthenticated();
  let sub: string;
  let tv: number;
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.tv !== 'number') {
      throw new Error('claims');
    }
    sub = payload.sub;
    tv = payload.tv;
  } catch {
    throw unauthenticated();
  }
  // Estado y versión de sesión se leen en cada solicitud: una desactivación corta el acceso al instante.
  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'platform_role', 'status', 'token_version'])
    .where('id', '=', sub)
    .executeTakeFirst();
  if (!user || user.status !== 'ACTIVE' || user.token_version !== tv) throw unauthenticated();
  return { id: user.id, email: user.email, platformRole: user.platform_role };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Kysely<Database>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) {
      // Rutas públicas aceptan sesión opcional (p. ej. aceptar invitación con cuenta existente).
      req.user = (await authenticate(req, this.config, this.db)) ?? undefined;
      return true;
    }
    const user = await authenticate(req, this.config, this.db);
    if (!user) throw unauthenticated();
    req.user = user;
    return true;
  }
}

class LoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @MaxLength(200) password!: string;
}

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(LOGIN_RATE_LIMITER) private readonly limiter: LoginRateLimiter,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const email = body.email.trim().toLowerCase();
    const ip = req.ip ?? 'unknown';
    // Se decide antes de consultar la cuenta: la respuesta 429 es igual exista o no el email.
    const decision = await this.limiter.check(email, ip);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.', [
        { reason: `RETRY_AFTER_${decision.retryAfterSeconds}` },
      ]);
    }
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'password_hash', 'status', 'token_version'])
      .where('email', '=', email)
      .executeTakeFirst();
    const ok = user?.status === 'ACTIVE' && (await verifyPassword(user.password_hash, body.password));
    if (!user || !ok) {
      await this.limiter.recordFailure(email, ip);
      // Mensaje uniforme: no revela si el email existe. No se registra la contraseña.
      if (user) {
        await this.audit.record(this.db, {
          actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id,
          requestId: req.requestId, result: 'DENIED',
        });
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }
    await this.limiter.recordSuccess(email, ip);
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();
      await this.audit.record(trx, {
        actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id,
        requestId: req.requestId, result: 'SUCCESS',
      });
    });
    return issueAccessToken(this.config, user.id, user.token_version);
  }
}
