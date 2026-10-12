'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, ROLE_LABELS, api, type Organization } from '../../../lib/api';
import { useWorkspace } from '../../../lib/workspace';
import { Alert, Breadcrumb, ErrorPanel, Loading, PageHeader, StatusBadge } from '../../../lib/ui';

// Capacidades que SIGUEN sin implementarse para ciertos roles (docs/UX_UI.md §7; revisado 2026-10-12, P0-027). Se muestran
// en una superficie separada y rotulada; nunca como entradas de menú ni con datos. Lo ya implementado no aparece aquí.
const PENDING_BY_ROLE: Record<string, Array<{ capability: string; story: string }>> = {
  FIELD_TECHNICIAN: [{ capability: 'Trabajo de campo sin conexión', story: 'App móvil (P0-023/P0-024): el ensayo en teléfono físico sigue pendiente; la web no guarda datos sin conexión' }],
  EXPORT_MANAGER: [{ capability: 'Preparación de embarques y despacho', story: 'P0-029' }],
  BUYER: [{ capability: 'Portal comprador', story: 'P1-001; requiere contrato de concesiones entre organizaciones (UX-D09). Sin concesión no hay acceso implícito' }],
  PRODUCER: [{ capability: '«Mi finca»: parcelas, entregas y documentos propios', story: 'Requiere vínculo cuenta–productor (UX-D08). Sin vínculo no hay acceso implícito' }],
};
const PLATFORM_PENDING = { capability: 'Acceso a datos operativos de una organización', story: 'Requiere elevación auditada (D-04, pendiente). La administración de plataforma no da acceso implícito' };

interface WorkTask { code: string; title: string; reason: string; action: string; count: number; items: Array<{ id: string; label: string; href: string }>; list_href: string }

/** Mi trabajo (UX_UI §11): tareas observables que el rol puede completar, dentro de su alcance (GET my-work). */
function MyWork({ orgId }: { orgId: string }) {
  const [data, setData] = useState<{ tasks: WorkTask[]; note: string } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setData(await api<{ tasks: WorkTask[]; note: string }>(`/api/v1/organizations/${orgId}/my-work`)); } catch (err) { setError(err as ApiError); }
  }, [orgId]);
  useEffect(() => { setData(null); void load(); }, [load]);
  return (
    <section className="card" aria-labelledby="mi-trabajo">
      <h2 id="mi-trabajo">Mi trabajo</h2>
      {error ? <ErrorPanel error={error} onRetry={load} />
        : !data ? <Loading label="Cargando tus pendientes…" />
          : data.tasks.length === 0 ? <p>No tienes pendientes en esta organización. <span className="muted">{data.note}</span></p>
            : (
              <>
                <p className="muted">{data.note}</p>
                <ul className="plain" aria-label="Pendientes">
                  {data.tasks.map((t) => (
                    <li key={t.code} className="work-item">
                      <h3>{t.title} <StatusBadge tone="review">{t.count}</StatusBadge></h3>
                      <p className="muted">{t.reason}</p>
                      {t.items.length > 0 && <ul className="plain">{t.items.map((i) => <li key={i.id}><Link href={i.href}>{i.label}</Link></li>)}</ul>}
                      <Link href={t.list_href}>{t.action}{t.count > t.items.length ? ` (ver ${t.count})` : ''}</Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
    </section>
  );
}

export default function OrganizationHomePage() {
  const ws = useWorkspace();
  const orgId = ws.activeOrg?.id;
  const canRead = ws.can('organization:read') || ws.isPlatformAdmin;
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !canRead) return;
    setError(null);
    try {
      setOrg(await api<Organization>(`/api/v1/organizations/${orgId}`));
    } catch (err) {
      setError(err as ApiError);
    }
  }, [orgId, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ws.activeOrg) {
    return <ErrorPanel error={new ApiError(404, { code: 'NOT_FOUND', message: 'El recurso no existe o no está disponible para ti.', request_id: null })} />;
  }
  const roles = ws.activePerms?.roles ?? [];
  const pending = [...roles.flatMap((r) => (PENDING_BY_ROLE[r] ?? []).map((p) => ({ ...p, role: r }))),
    ...(ws.isPlatformAdmin && !ws.activePerms ? [{ ...PLATFORM_PENDING, role: 'SUPER_ADMIN' }] : [])];

  return (
    <>
      <Breadcrumb items={[{ label: ws.isPlatformAdmin ? 'Organizaciones' : 'Mis organizaciones', href: '/organizaciones' }, { label: ws.activeOrg.name }]} />
      {!canRead ? (
        <>
          <PageHeader title="Mi espacio" meta={<>{ws.activeOrg.name} · {roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}</>} />
          <Alert tone="info" title="Tu rol todavía no tiene pantallas disponibles en esta etapa.">
            <p>Tu cuenta y tu membresía están activas. Las funciones previstas para tu rol se habilitarán cuando existan sus operaciones y contratos.</p>
          </Alert>
          {ws.activePerms && <MyWork orgId={ws.activeOrg.id} />}
        </>
      ) : error ? (
        <ErrorPanel error={error} onRetry={load} />
      ) : !org ? (
        <Loading label="Cargando la organización…" />
      ) : (
        <>
          <PageHeader
            title={org.name}
            meta={<>
              <StatusBadge tone={org.status === 'ACTIVE' ? 'valid' : 'blocked'}>{org.status === 'ACTIVE' ? 'Activa' : 'Suspendida'}</StatusBadge>
              <span>{org.organization_type} · {org.country} · versión {org.row_version}</span>
            </>}
          />
          {ws.activePerms && <MyWork orgId={org.id} />}
          {org.status === 'SUSPENDED' && (
            <Alert tone="review" title={`Organización suspendida: ${org.status_reason ?? ''}`}>
              <p>El historial sigue disponible para consulta; no se admiten nuevas operaciones.</p>
            </Alert>
          )}
          {ws.can('organization:update') ? <EditOrganization org={org} onSaved={setOrg} onReload={load} /> : <OrgDetails org={org} />}
          {(ws.can('producer:read') || ws.can('producer:read_assigned')) && (
            <section className="card">
              <h2>Productores</h2>
              <Link href={`/organizaciones/${org.id}/productores`}>Ver y registrar productores</Link>
            </section>
          )}
          {ws.isPlatformAdmin && <StatusControl org={org} onChanged={setOrg} />}
        </>
      )}
      {pending.length > 0 && (
        <section className="card" aria-labelledby="pendientes-rol">
          <h2 id="pendientes-rol">Capacidades aún no disponibles para tu rol</h2>
          <p className="muted">Se listan para orientar, no son accesos ni se muestran como operativas.</p>
          <ul className="plain">
            {pending.map((p, i) => (
              <li key={i}>
                <StatusBadge tone="neutral">Pendiente de implementación</StatusBadge> {p.capability}
                <div className="muted">{ROLE_LABELS[p.role] ?? p.role} · {p.story}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function OrgDetails({ org }: { org: Organization }) {
  return (
    <section className="card">
      <h2>Datos de la organización</h2>
      <p className="muted">Puedes consultar estos datos; la edición corresponde al administrador de la organización.</p>
      <dl className="props">
        <dt>Razón social</dt><dd>{org.legal_name ?? 'Sin registrar'}</dd>
        <dt>Identificación tributaria</dt><dd>{org.tax_id ?? 'Sin registrar'}</dd>
        <dt>Provincia / cantón / parroquia</dt><dd>{[org.province, org.canton, org.parish].map((v) => v ?? '—').join(' / ')}</dd>
      </dl>
    </section>
  );
}

function EditOrganization({ org, onSaved, onReload }: { org: Organization; onSaved: (o: Organization) => void; onReload: () => void }) {
  const [form, setForm] = useState({
    name: org.name, legal_name: org.legal_name ?? '', tax_id: org.tax_id ?? '',
    province: org.province ?? '', canton: org.canton ?? '', parish: org.parish ?? '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const o = await api<Organization>(`/api/v1/organizations/${org.id}`, { method: 'PATCH', body: { expected_version: org.row_version, ...form } });
      onSaved({ ...org, ...o });
      setSaved(true);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <section className="card form">
      <h2>Configuración</h2>
      <form onSubmit={submit}>
        <fieldset disabled={org.status !== 'ACTIVE'}>
          <div className="grid-2">
            <div><label htmlFor="name">Nombre</label><input id="name" required {...field('name')} /></div>
            <div><label htmlFor="legal">Razón social</label><input id="legal" {...field('legal_name')} /></div>
            <div><label htmlFor="tax">Identificación tributaria</label><input id="tax" {...field('tax_id')} /></div>
            <div><label htmlFor="prov">Provincia</label><input id="prov" {...field('province')} /></div>
            <div><label htmlFor="canton">Cantón</label><input id="canton" {...field('canton')} /></div>
            <div><label htmlFor="parish">Parroquia</label><input id="parish" {...field('parish')} /></div>
          </div>
          <button type="submit" disabled={busy || org.status !== 'ACTIVE'} aria-busy={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </fieldset>
        {saved && <p className="alert valid" role="status">Cambios guardados.</p>}
        {error && <ErrorPanel error={error} onReload={onReload} />}
      </form>
    </section>
  );
}

function StatusControl({ org, onChanged }: { org: Organization; onChanged: (o: Organization) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const suspending = org.status === 'ACTIVE';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const o = await api<Organization>(`/api/v1/organizations/${org.id}/${suspending ? 'suspend' : 'reactivate'}`, { method: 'POST', body: { reason } });
      onChanged({ ...org, ...o });
      setReason('');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card form">
      <h2>{suspending ? 'Suspender organización' : 'Reactivar organización'}</h2>
      <p className="muted">
        {suspending
          ? `Bloquea nuevas operaciones de todos los miembros de «${org.name}». No borra información ni historial.`
          : 'Los miembros con permiso podrán volver a registrar operaciones.'}
      </p>
      <form onSubmit={submit}>
        <label htmlFor="reason">Motivo (queda en la auditoría)</label>
        <input id="reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <ErrorPanel error={error} />}
        <button type="submit" className={suspending ? 'danger' : ''} disabled={busy} aria-busy={busy}>
          {busy ? 'Aplicando…' : suspending ? 'Suspender' : 'Reactivar'}
        </button>
      </form>
    </section>
  );
}
