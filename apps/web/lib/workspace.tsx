'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, ROLE_LABELS, api, session, type Me, type Organization } from './api';
import { Loading, ErrorPanel, StatusBadge } from './ui';

// Workspace (docs/UX_UI.md §6): persona + organización activa + permisos efectivos + estado de la
// organización. Los roles de distintas organizaciones nunca se mezclan. Los permisos se vuelven a leer
// en cada navegación, de modo que una revocación se refleja sin nuevo login (la API sigue decidiendo).

interface OrgPermissions {
  organization_id: string;
  organization_status: 'ACTIVE' | 'SUSPENDED';
  roles: string[];
  permissions: string[];
}

interface PermissionsResponse {
  platform_permissions: string[];
  organizations: OrgPermissions[];
}

export interface Workspace {
  me: Me;
  myOrgs: Organization[];
  allOrgs: Organization[] | null; // solo administración de plataforma
  platformPermissions: string[];
  activeOrg: Organization | null;
  activePerms: OrgPermissions | null;
  can: (permission: string) => boolean;
  isPlatformAdmin: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const ws = useContext(Ctx);
  if (!ws) throw new Error('useWorkspace fuera de WorkspaceProvider');
  return ws;
}

interface NavItem { href: string; label: string; match: (p: string) => boolean }

function navFor(ws: Workspace, orgId: string | null): Array<{ title: string; items: NavItem[] }> {
  const groups: Array<{ title: string; items: NavItem[] }> = [];
  if (orgId) {
    const base = `/organizaciones/${orgId}`;
    const inicio: NavItem[] = [];
    if (ws.can('organization:read') || ws.isPlatformAdmin) {
      inicio.push({ href: base, label: 'Resumen de la organización', match: (p) => p === base });
    } else {
      inicio.push({ href: base, label: 'Mi espacio', match: (p) => p === base });
    }
    groups.push({ title: 'Inicio', items: inicio });
    const origen: NavItem[] = [];
    if (ws.can('producer:read') || ws.can('producer:read_assigned')) {
      origen.push({ href: `${base}/productores`, label: 'Productores', match: (p) => p.startsWith(`${base}/productores`) && !p.endsWith('/coincidencias') });
    }
    if (ws.can('plot:read') || ws.can('plot:read_assigned')) {
      origen.push({ href: `${base}/parcelas`, label: 'Parcelas', match: (p) => p.startsWith(`${base}/parcelas`) });
    }
    if (ws.can('producer:review_duplicates')) {
      origen.push({ href: `${base}/productores/coincidencias`, label: 'Posibles duplicados', match: (p) => p.endsWith('/coincidencias') });
    }
    if (origen.length) groups.push({ title: 'Origen', items: origen });
    // Operación (UX_UI §8): solo módulos conectados a operaciones reales.
    const operacion: NavItem[] = [];
    if (ws.can('product:read')) operacion.push({ href: `${base}/productos`, label: 'Productos', match: (p) => p.startsWith(`${base}/productos`) });
    if (operacion.length) groups.push({ title: 'Operación', items: operacion });
    const trazabilidad: NavItem[] = [];
    if (ws.can('traceability:read_catalog')) trazabilidad.push({ href: `${base}/trazabilidad/hitos`, label: 'Hitos (CTE)', match: (p) => p.startsWith(`${base}/trazabilidad/hitos`) });
    if (ws.can('document:read')) trazabilidad.push({ href: `${base}/documentos`, label: 'Documentos', match: (p) => p.startsWith(`${base}/documentos`) });
    if (trazabilidad.length) groups.push({ title: 'Trazabilidad', items: trazabilidad });
    const admin: NavItem[] = [];
    const onboardingOnly = ws.isPlatformAdmin && !ws.activePerms;
    if (ws.can('membership:read') || onboardingOnly) {
      admin.push({ href: `${base}/miembros`, label: onboardingOnly ? 'Incorporar administrador' : 'Miembros e invitaciones', match: (p) => p.startsWith(`${base}/miembros`) });
    }
    if (ws.can('audit:read')) admin.push({ href: `${base}/auditoria`, label: 'Auditoría', match: (p) => p.startsWith(`${base}/auditoria`) });
    if (ws.can('events:reprocess')) admin.push({ href: `${base}/entregas-eventos`, label: 'Entregas de eventos', match: (p) => p.startsWith(`${base}/entregas-eventos`) });
    if (admin.length) groups.push({ title: 'Administración', items: admin });
  }
  const general: NavItem[] = [{ href: '/organizaciones', label: ws.isPlatformAdmin ? 'Organizaciones (plataforma)' : 'Mis organizaciones', match: (p) => p === '/organizaciones' }];
  groups.push({ title: ws.isPlatformAdmin ? 'Plataforma' : 'General', items: general });
  return groups;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const orgId = params?.id ?? null;
  const [state, setState] = useState<{ me: Me; myOrgs: Organization[]; allOrgs: Organization[] | null; perms: PermissionsResponse } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, perms, myOrgs] = await Promise.all([
        api<Me>('/api/v1/me'),
        api<PermissionsResponse>('/api/v1/me/permissions'),
        api<Organization[]>('/api/v1/organizations'),
      ]);
      const allOrgs = me.platform_role === 'SUPER_ADMIN' ? await api<Organization[]>('/api/v1/organizations?scope=all') : null;
      setState({ me, myOrgs, allOrgs, perms });
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace('/');
        return;
      }
      setError(err as ApiError);
    }
  }, [router]);

  // Se recarga al cambiar de ruta: permisos vigentes en cada pantalla.
  useEffect(() => {
    void load();
  }, [load, pathname]);

  const ws = useMemo<Workspace | null>(() => {
    if (!state) return null;
    const activePerms = orgId ? state.perms.organizations.find((o) => o.organization_id === orgId) ?? null : null;
    const activeOrg = orgId ? (state.myOrgs.find((o) => o.id === orgId) ?? state.allOrgs?.find((o) => o.id === orgId) ?? null) : null;
    return {
      me: state.me,
      myOrgs: state.myOrgs,
      allOrgs: state.allOrgs,
      platformPermissions: state.perms.platform_permissions,
      activeOrg,
      activePerms,
      can: (p) => !!activePerms?.permissions.includes(p),
      isPlatformAdmin: state.me.platform_role === 'SUPER_ADMIN',
      refresh: load,
    };
  }, [state, orgId, load]);

  if (error) return <div className="tl-access"><div className="tl-access-card"><ErrorPanel error={error} onRetry={load} /></div></div>;
  if (!ws) return <div className="tl-access"><div className="tl-access-card"><Loading label="Cargando tu espacio de trabajo…" /></div></div>;
  return <Ctx.Provider value={ws}><Shell orgId={orgId}>{children}</Shell></Ctx.Provider>;
}

function Shell({ orgId, children }: { orgId: string | null; children: ReactNode }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = navFor(ws, orgId);
  const switchable = ws.isPlatformAdmin ? ws.allOrgs ?? [] : ws.myOrgs;

  useEffect(() => setMenuOpen(false), [pathname]);
  // Escape cierra el panel de navegación en móvil (UX_UI §23.1).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="tl-app" data-menu={menuOpen ? 'open' : 'closed'}>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <aside className="tl-sidebar" aria-label="Navegación principal">
        {/* Identificación textual: no hay activos oficiales del logotipo en el proyecto (UX-D01). */}
        <button type="button" className="secondary inline tl-menu-close" onClick={() => setMenuOpen(false)}>Cerrar menú</button>
        <Link href="/organizaciones" className="tl-brand">TERRA LINK<small>Trazabilidad de cacao</small></Link>
        <nav className="tl-nav">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="tl-nav-title">{g.title}</p>
              <ul className="tl-nav-group">
                {g.items.map((it) => (
                  <li key={it.href}><Link href={it.href} aria-current={it.match(pathname) ? 'page' : undefined}>{it.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="tl-main">
        <header className="tl-header">
          <button type="button" className="secondary inline tl-menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? 'Cerrar menú' : 'Menú'}
          </button>
          <div className="tl-header-org">
            {switchable.length > 0 && (
              <>
                <label htmlFor="org-switch" className="visually-hidden">Organización activa</label>
                <select
                  id="org-switch"
                  value={orgId ?? ''}
                  onChange={(e) => router.push(e.target.value ? `/organizaciones/${e.target.value}` : '/organizaciones')}
                >
                  <option value="">{ws.isPlatformAdmin ? 'Plataforma (sin organización)' : 'Elige una organización…'}</option>
                  {switchable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </>
            )}
            {ws.activeOrg && (
              <StatusBadge tone={ws.activeOrg.status === 'ACTIVE' ? 'valid' : 'blocked'}>
                {ws.activeOrg.status === 'ACTIVE' ? 'Activa' : 'Suspendida'}
              </StatusBadge>
            )}
          </div>
          <div className="tl-header-user">
            <span className="muted" data-testid="contexto-usuario">
              {ws.me.email}
              {ws.isPlatformAdmin && ' · Administración de plataforma'}
              {ws.activePerms && ` · ${ws.activePerms.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}`}
            </span>
            <button type="button" className="secondary inline" onClick={() => { session.clear(); router.replace('/'); }}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main id="contenido" className="tl-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
