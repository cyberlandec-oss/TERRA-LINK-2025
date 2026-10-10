'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, can, recoveryHint, session, type Me, type Organization } from '../../../lib/api';
import { MembersSection } from './miembros';

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [user, o] = await Promise.all([api<Me>('/api/v1/me'), api<Organization>(`/api/v1/organizations/${id}`)]);
      setMe(user);
      setOrg(o);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace('/');
        return;
      }
      setError(err as ApiError);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <p><Link href="/organizaciones">← Organizaciones</Link></p>
      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          <p>{recoveryHint(error)}</p>
          <button onClick={load}>Reintentar</button>
        </div>
      )}
      {!org && !error && <p className="muted">Cargando…</p>}
      {org && (
        <>
          <h1>{org.name}</h1>
          <p>
            <span className={`badge ${org.status === 'SUSPENDED' ? 'suspended' : ''}`}>{org.status === 'ACTIVE' ? 'Activa' : 'Suspendida'}</span>{' '}
            <span className="muted">{org.organization_type} · {org.country} · versión {org.row_version}</span>
          </p>
          {org.status === 'SUSPENDED' && (
            <p className="notice">Organización suspendida: {org.status_reason}. El historial sigue disponible para consulta; no se admiten nuevas operaciones.</p>
          )}
          {can(org, 'organization:update') ? (
            <EditOrganization org={org} onSaved={setOrg} onReload={load} />
          ) : (
            <section className="card">
              <dl>
                <dt className="muted">Razón social</dt><dd>{org.legal_name ?? 'Sin registrar'}</dd>
                <dt className="muted">Provincia / cantón / parroquia</dt>
                <dd>{[org.province, org.canton, org.parish].map((v) => v ?? '—').join(' / ')}</dd>
              </dl>
            </section>
          )}
          {(me?.platform_role === 'SUPER_ADMIN' || can(org, 'membership:read')) && (
            <MembersSection org={org} canManage={me?.platform_role === 'SUPER_ADMIN' || can(org, 'membership:assign')} />
          )}
          {me?.platform_role === 'SUPER_ADMIN' && <StatusControl org={org} onChanged={setOrg} />}
        </>
      )}
    </>
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
      const o = await api<Organization>(`/api/v1/organizations/${org.id}`, {
        method: 'PATCH',
        body: { expected_version: org.row_version, ...form },
      });
      onSaved({ ...org, ...o });
      setSaved(true);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });
  const disabled = org.status !== 'ACTIVE';

  return (
    <section className="card">
      <h2>Configuración</h2>
      <form onSubmit={submit}>
        <fieldset disabled={disabled} style={{ border: 0, padding: 0 }}>
          <label htmlFor="name">Nombre</label><input id="name" required {...field('name')} />
          <label htmlFor="legal">Razón social</label><input id="legal" {...field('legal_name')} />
          <label htmlFor="tax">Identificación tributaria</label><input id="tax" {...field('tax_id')} />
          <label htmlFor="prov">Provincia</label><input id="prov" {...field('province')} />
          <label htmlFor="canton">Cantón</label><input id="canton" {...field('canton')} />
          <label htmlFor="parish">Parroquia</label><input id="parish" {...field('parish')} />
          <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </fieldset>
        {saved && <p className="muted" role="status">Cambios guardados.</p>}
        {error && (
          <div className="error" role="alert">
            <p>{error.message} {recoveryHint(error)}</p>
            {error.body.code === 'VERSION_CONFLICT' && <button type="button" onClick={onReload}>Recargar</button>}
          </div>
        )}
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
      const o = await api<Organization>(`/api/v1/organizations/${org.id}/${suspending ? 'suspend' : 'reactivate'}`, {
        method: 'POST',
        body: { reason },
      });
      onChanged({ ...org, ...o });
      setReason('');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{suspending ? 'Suspender organización' : 'Reactivar organización'}</h2>
      <p className="muted">
        {suspending
          ? 'Bloquea nuevas operaciones de todos sus miembros. No borra información ni historial.'
          : 'Los miembros con permiso podrán volver a registrar operaciones.'}
      </p>
      <form onSubmit={submit}>
        <label htmlFor="reason">Motivo (queda en la auditoría)</label>
        <input id="reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p className="error" role="alert">{error.message} {recoveryHint(error)}</p>}
        <button type="submit" className={suspending ? 'danger' : ''} disabled={busy}>
          {busy ? 'Aplicando…' : suspending ? 'Suspender' : 'Reactivar'}
        </button>
      </form>
    </section>
  );
}
