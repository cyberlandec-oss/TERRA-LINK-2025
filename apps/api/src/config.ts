// Configuración validada al arrancar. Nunca se registran los valores, solo los nombres faltantes.
export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtTtlSeconds: number;
  webOrigin: string;
}

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) throw new Error(`Variable de entorno requerida no definida: ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = required('JWT_SECRET', env);
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  return {
    port: Number(env.API_PORT ?? 4000),
    databaseUrl: required('DATABASE_URL', env),
    jwtSecret,
    jwtTtlSeconds: Number(env.JWT_TTL_SECONDS ?? 3600),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
