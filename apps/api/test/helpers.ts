import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { sql, type Kysely } from 'kysely';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import type { AppConfig } from '../src/config';
import { createDb, migrateToLatest } from '../src/db/database';
import type { Database } from '../src/db/schema';
import { hashPassword } from '../src/auth/passwords';

// Arnés de integración: PostgreSQL/PostGIS real (base *_test, esquema recreado) y Redis real con
// prefijo de claves único por corrida. Sin credenciales reales: todo sale de TEST_DATABASE_URL/REDIS_URL.
export const TEST_URL = process.env.TEST_DATABASE_URL;
export const REDIS_URL = process.env.REDIS_URL;
export const describeDb = TEST_URL && REDIS_URL ? describe : describe.skip;
export const PASSWORD = 'password-de-prueba-123';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    databaseUrl: TEST_URL!,
    redisUrl: REDIS_URL!,
    redisKeyPrefix: `tl-test:${randomUUID()}:`,
    jwtSecret: 'x'.repeat(40),
    jwtTtlSeconds: 600,
    webOrigin: 'http://localhost:3000',
    trustProxy: false,
    loginRateLimit: { windowSeconds: 900, maxPerAccountAndIp: 5, maxPerAccount: 20, maxPerIp: 50 },
    invitationTtlHours: 72,
    ...overrides,
  };
}

export async function setupHarness(overrides: Partial<AppConfig> = {}) {
  if (!new URL(TEST_URL!).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL debe apuntar a una base *_test');
  const db: Kysely<Database> = createDb(TEST_URL!);
  await sql`DROP SCHEMA IF EXISTS public CASCADE`.execute(db);
  await sql`CREATE SCHEMA public`.execute(db);
  await migrateToLatest(db);
  const config = testConfig(overrides);
  const app: INestApplication = await createApp(config, db);
  await app.init();
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  async function login(email: string, password = PASSWORD) {
    const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    tokens[email] = res.body.access_token;
    return res.body.access_token as string;
  }

  async function user(email: string, platformRole: 'SUPER_ADMIN' | null = null) {
    const row = await db
      .insertInto('users')
      .values({ email, first_name: 'Prueba', last_name: email, password_hash: await hashPassword(PASSWORD), status: 'ACTIVE', platform_role: platformRole })
      .returning('id')
      .executeTakeFirstOrThrow();
    await login(email);
    return row.id;
  }

  const as = (email: string) => ({ Authorization: `Bearer ${tokens[email]}` });
  const close = async () => {
    await app.close();
    await db.destroy();
  };
  return { db, app, config, http, user, login, as, tokens, close };
}
