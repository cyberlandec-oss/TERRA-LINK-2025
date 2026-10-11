import type { Platform } from '../core/ports';
import { accountKey, captureGate, jwtExpiry, type StoredSession } from '../core/session';
import { LocalStore, type DatasetPlot } from '../core/store';

// Sesión del dispositivo (P0-023). Inicio de sesión SOLO con conexión; el token vive en almacenamiento seguro y nunca
// se renueva sin red. Cerrar sesión elimina token y sesión, pero NO las bases ni adjuntos por cuenta: las capturas
// pendientes quedan para esa misma cuenta y organización (otra cuenta abre su propio almacén y no las ve).
// device_id: identificador local generado una vez; describe el dispositivo pero NO autoriza nada (el contrato de
// dispositivo y su registro/revocación en servidor son de P0-024).

const K = { token: 'tl.session.token', session: 'tl.session.data', device: 'tl.device.id', apiUrl: 'tl.api.url' };

export class ApiFailure extends Error {
  constructor(readonly kind: 'NETWORK' | 'HTTP', readonly status: number | null, message: string, readonly code?: string) { super(message); }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function http<T>(f: FetchLike, apiUrl: string, path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await f(`${apiUrl.replace(/\/$/, '')}${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch {
    throw new ApiFailure('NETWORK', null, 'Sin conexión con el servidor. El inicio de sesión requiere conexión; tus capturas guardadas se conservan.');
  }
  const data = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiFailure('HTTP', res.status, data?.error?.message ?? `Error ${res.status}`, data?.error?.code);
  return data as T;
}

export class SessionManager {
  constructor(private readonly p: Platform, private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i)) {}

  async deviceId(): Promise<string> {
    let id = await this.p.secrets.get(K.device);
    if (!id) { id = this.p.uuid(); await this.p.secrets.set(K.device, id); }
    return id;
  }
  async apiUrl(fallback: string) { return (await this.p.secrets.get(K.apiUrl)) ?? fallback; }

  async load(): Promise<StoredSession | null> {
    const raw = await this.p.secrets.get(K.session);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    const now = this.p.now().toISOString();
    if (now > s.last_seen_at) { s.last_seen_at = now; await this.p.secrets.set(K.session, JSON.stringify(s)); }
    return s;
  }
  async token() { return this.p.secrets.get(K.token); }

  async login(apiUrl: string, email: string, password: string): Promise<StoredSession> {
    const t = await http<{ access_token: string }>(this.fetchImpl, apiUrl, '/api/v1/auth/login', { method: 'POST', body: { email, password } });
    const me = await http<{ id: string; email: string }>(this.fetchImpl, apiUrl, '/api/v1/me', { token: t.access_token });
    const perms = await http<{ organizations: Array<{ organization_id: string; organization_status: string; roles: string[]; permissions: string[] }> }>(this.fetchImpl, apiUrl, '/api/v1/me/permissions', { token: t.access_token });
    const orgs = await http<Array<{ id: string; name: string }>>(this.fetchImpl, apiUrl, '/api/v1/organizations', { token: t.access_token }).catch(() => [] as Array<{ id: string; name: string }>);
    const now = this.p.now().toISOString();
    const s: StoredSession = {
      user_id: me.id, email: me.email, token_expires_at: (jwtExpiry(t.access_token) ?? new Date(this.p.now().getTime() + 3_600_000)).toISOString(), last_online_auth_at: now, last_seen_at: now,
      organizations: perms.organizations.map((o) => ({ organization_id: o.organization_id, name: orgs.find((x) => x.id === o.organization_id)?.name ?? 'Organización', status: o.organization_status, roles: o.roles, permissions: o.permissions })),
    };
    await this.p.secrets.set(K.token, t.access_token);
    await this.p.secrets.set(K.session, JSON.stringify(s));
    await this.p.secrets.set(K.apiUrl, apiUrl);
    return s;
  }

  async logout(): Promise<void> {
    await this.p.secrets.delete(K.token);
    await this.p.secrets.delete(K.session);
  }

  async openStore(s: StoredSession, orgId: string): Promise<LocalStore> {
    return LocalStore.open(this.p, await accountKey(this.p.sha256, s.user_id, orgId));
  }

  /** Descarga SOLO las parcelas que el servidor autoriza a esta cuenta en esta organización (requiere conexión y token vigente). */
  async downloadDataset(s: StoredSession, orgId: string, store: LocalStore): Promise<number> {
    const token = await this.token();
    if (!token || this.p.now() >= new Date(s.token_expires_at)) throw new ApiFailure('HTTP', 401, 'La sesión venció: inicia sesión con conexión para descargar datos.');
    const apiUrl = await this.apiUrl('');
    const plots: DatasetPlot[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: Array<{ id: string; plot_code: string; name: string | null; row_version: number; status: string; producer: { id: string; producer_code: string | null; display_name: string | null }; geometry_status: string }>; next_cursor: string | null } =
        await http(this.fetchImpl, apiUrl, `/api/v1/organizations/${orgId}/plots?status=ACTIVE&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { token });
      for (const x of page.items) plots.push({ id: x.id, plot_code: x.plot_code, name: x.name, row_version: x.row_version, status: x.status, producer_id: x.producer.id, producer_code: x.producer.producer_code, producer_display_name: x.producer.display_name || null, geometry_status: x.geometry_status });
      cursor = page.next_cursor;
    } while (cursor && plots.length < 2000);
    await store.replaceDataset(plots);
    return plots.length;
  }

  gate(s: StoredSession | null, orgId: string | null) { return captureGate(s, orgId, this.p.now()); }
}
