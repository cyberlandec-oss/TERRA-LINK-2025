// Política PROVISIONAL de sesión offline (propuesta D-40, no aprobada; docs/11 §Flujo y UX_UI §21.2):
// - El inicio de sesión es solo online. El token no se renueva ni se prolonga sin red (no hay refresh token: ADR-0005).
// - La captura local se permite durante una ventana desde la última autenticación online exitosa
//   (OFFLINE_CAPTURE_WINDOW_HOURS, valor de propuesta). La ventana no es una credencial: no autoriza envíos; al volver la
//   red el servidor revalida sesión, membresía y permisos (P0-024).
// - Sin red NO se detectan revocaciones, bajas ni cambios de permisos: la UI lo dice.
// - Reloj: si la hora del dispositivo retrocede respecto de la última hora vista, la captura se bloquea hasta volver online.
// - Vencida la ventana: la captura nueva se bloquea; borradores, cola y adjuntos se conservan visibles y no se borran.

export const OFFLINE_CAPTURE_WINDOW_HOURS = 72;

export interface StoredSession {
  user_id: string;
  email: string;
  token_expires_at: string; // exp del JWT emitido por el servidor (no se modifica en el dispositivo)
  last_online_auth_at: string;
  last_seen_at: string; // hora máxima observada en el dispositivo (detección de reloj atrasado)
  organizations: Array<{ organization_id: string; name: string; status: string; roles: string[]; permissions: string[] }>;
}

export type CaptureGate =
  | { allowed: true; mode: 'ONLINE_TOKEN_VALID' | 'OFFLINE_WINDOW'; until: string; note: string }
  | { allowed: false; reason: 'NO_SESSION' | 'WINDOW_EXPIRED' | 'CLOCK_BACKWARDS' | 'NO_PERMISSION' | 'ORG_NOT_ACTIVE'; note: string };

/** Permisos que habilitan la captura de campo de parcelas (asignadas o de toda la organización). */
export const CAPTURE_PERMISSIONS = ['plot:update', 'plot:update_assigned'];

export function captureGate(s: StoredSession | null, orgId: string | null, now: Date): CaptureGate {
  if (!s || !orgId) return { allowed: false, reason: 'NO_SESSION', note: 'Inicia sesión con conexión para preparar el trabajo de campo.' };
  const org = s.organizations.find((o) => o.organization_id === orgId);
  if (!org || !org.permissions.some((p) => CAPTURE_PERMISSIONS.includes(p))) return { allowed: false, reason: 'NO_PERMISSION', note: 'Tu rol en esta organización no permite capturar en parcelas (según los permisos descargados al iniciar sesión).' };
  if (org.status !== 'ACTIVE') return { allowed: false, reason: 'ORG_NOT_ACTIVE', note: 'La organización no estaba activa al iniciar sesión.' };
  if (now.getTime() + 60_000 < Date.parse(s.last_seen_at)) return { allowed: false, reason: 'CLOCK_BACKWARDS', note: 'La hora del dispositivo retrocedió: conéctate para revalidar la sesión. Tus capturas se conservan.' };
  const windowEnd = new Date(Date.parse(s.last_online_auth_at) + OFFLINE_CAPTURE_WINDOW_HOURS * 3_600_000);
  if (now > windowEnd) return { allowed: false, reason: 'WINDOW_EXPIRED', note: `Pasaron más de ${OFFLINE_CAPTURE_WINDOW_HOURS} h desde la última autenticación con conexión: conéctate e inicia sesión. Tus capturas se conservan.` };
  if (now < new Date(s.token_expires_at)) return { allowed: true, mode: 'ONLINE_TOKEN_VALID', until: windowEnd.toISOString(), note: 'Sesión vigente. Sin conexión no se detectan revocaciones.' };
  return { allowed: true, mode: 'OFFLINE_WINDOW', until: windowEnd.toISOString(), note: 'Token vencido: captura local permitida hasta el fin de la ventana; para enviar hará falta iniciar sesión con conexión. Sin conexión no se detectan revocaciones.' };
}

/** Clave estable de aislamiento local por cuenta + organización (nombre de archivo de base y carpeta de adjuntos). */
export async function accountKey(sha256: (b: Uint8Array) => Promise<string>, userId: string, orgId: string): Promise<string> {
  const hex = await sha256(new TextEncoder().encode(`terra-link:${userId}:${orgId}`));
  return hex.slice(0, 32);
}

/** exp (segundos) del JWT, sin verificar firma: solo para mostrar/limitar localmente; la autorización es del servidor. */
export function jwtExpiry(token: string): Date | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = JSON.parse(globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, 'base64').toString('utf8')) as { exp?: number };
    return typeof json.exp === 'number' ? new Date(json.exp * 1000) : null;
  } catch { return null; }
}
