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
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import type { Kysely } from 'kysely';
import { APP_CONFIG, type AppConfig } from '../config';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { AppError, unauthenticated } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { verifyPassword } from './passwords';

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

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Kysely<Database>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthenticated();
    let sub: string;
    try {
      const payload = jwt.verify(header.slice(7), this.config.jwtSecret, { algorithms: ['HS256'] });
      if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('sub');
      sub = payload.sub;
    } catch {
      throw unauthenticated();
    }
    // El estado del usuario se lee en cada solicitud: una baja surte efecto sin esperar a que caduque el token.
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'platform_role', 'status'])
      .where('id', '=', sub)
      .executeTakeFirst();
    if (!user || user.status !== 'ACTIVE') throw unauthenticated();
    req.user = { id: user.id, email: user.email, platformRole: user.platform_role };
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
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() req: AuthedRequest) {
    const email = body.email.trim().toLowerCase();
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'password_hash', 'status'])
      .where('email', '=', email)
      .executeTakeFirst();
    const ok = user?.status === 'ACTIVE' && (await verifyPassword(user.password_hash, body.password));
    if (!user || !ok) {
      // Mensaje uniforme: no revela si el email existe. No se registra la contraseña.
      if (user) {
        await this.audit.record(this.db, {
          actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id,
          requestId: req.requestId, result: 'DENIED',
        });
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();
      await this.audit.record(trx, {
        actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id,
        requestId: req.requestId, result: 'SUCCESS',
      });
    });
    const accessToken = jwt.sign({}, this.config.jwtSecret, {
      algorithm: 'HS256', subject: user.id, expiresIn: this.config.jwtTtlSeconds,
    });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: this.config.jwtTtlSeconds };
  }
}
