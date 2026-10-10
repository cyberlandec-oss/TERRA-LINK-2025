import { parsePiiConfig, type PiiKeyConfig } from './crypto/pii';

// Configuración validada al arrancar. Nunca se registran los valores, solo los nombres faltantes.
export interface LoginRateLimitConfig {
  /** Ventana de conteo y duración máxima del bloqueo temporal, en segundos. */
  windowSeconds: number;
  /** Fallos permitidos por cuenta desde un mismo origen (IP). */
  maxPerAccountAndIp: number;
  /** Fallos permitidos por cuenta desde cualquier origen (frena ataques distribuidos). */
  maxPerAccount: number;
  /** Fallos permitidos por origen contra cualquier cuenta (frena barridos de cuentas). */
  maxPerIp: number;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Prefijo de claves Redis; permite aislar entornos y corridas de prueba. */
  redisKeyPrefix: string;
  jwtSecret: string;
  jwtTtlSeconds: number;
  webOrigin: string;
  /** Express `trust proxy`: solo activar detrás de un proxy conocido; si no, X-Forwarded-For es falsificable. */
  trustProxy: boolean;
  loginRateLimit: LoginRateLimitConfig;
  /** Vigencia de las invitaciones (P0-002), en horas. */
  invitationTtlHours: number;
  /** Claves de cifrado de datos personales (obligatorias). */
  pii: PiiKeyConfig;
}

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) throw new Error(`Variable de entorno requerida no definida: ${name}`);
  return value;
}

function positiveInt(name: string, env: NodeJS.ProcessEnv, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} debe ser un entero positivo`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = required('JWT_SECRET', env);
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  return {
    port: positiveInt('API_PORT', env, 4000),
    databaseUrl: required('DATABASE_URL', env),
    redisUrl: required('REDIS_URL', env),
    redisKeyPrefix: env.REDIS_KEY_PREFIX ?? 'tl:',
    jwtSecret,
    jwtTtlSeconds: positiveInt('JWT_TTL_SECONDS', env, 3600),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
    trustProxy: env.TRUST_PROXY === 'true',
    loginRateLimit: {
      windowSeconds: positiveInt('LOGIN_RL_WINDOW_SECONDS', env, 900),
      maxPerAccountAndIp: positiveInt('LOGIN_RL_MAX_PER_ACCOUNT_IP', env, 5),
      maxPerAccount: positiveInt('LOGIN_RL_MAX_PER_ACCOUNT', env, 20),
      maxPerIp: positiveInt('LOGIN_RL_MAX_PER_IP', env, 50),
    },
    invitationTtlHours: positiveInt('INVITATION_TTL_HOURS', env, 72),
    pii: (() => {
      const pii = parsePiiConfig(env);
      if (!pii) throw new Error('Variables requeridas no definidas: PII_KEYS, PII_ACTIVE_KEY_ID, PII_INDEX_KEY');
      return pii;
    })(),
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
