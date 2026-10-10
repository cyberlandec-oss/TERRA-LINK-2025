'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, recoveryHint, session, type Me, type Organization } from '../../lib/api';

// Selección de organización: solo se listan membresías activas (o todas, para SUPER_ADMIN).
export default function OrganizationsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const user = await api<Me>('/api/v1/me');
      setMe(user);
      const scope = user.platform_role === 'SUPER_ADMIN' ? 'all' : 'mine';
      setOrgs(await api<Organization[]>(`/api/v1/organizations?scope=${scope}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace('/');
        return;
      }
      setError(err as ApiError);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Organizaciones</h1>
        <button className="secondary" onClick={() => { session.clear(); router.replace('/'); }}>Cerrar sesión</button>
      </div>
      {me && <p className="muted">{me.email}{me.platform_role ? ' · Administración de plataforma' : ''}</p>}
      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          <p>{recoveryHint(error)}</p>
          <button onClick={load}>Reintentar</button>
        </div>
      )}
      {!orgs && !error && <p className="muted">Cargando…</p>}
      {orgs && (
        <section className="card">
          {orgs.length === 0 ? (
            <p>No tienes membresías activas. Pide al administrador de tu organización que te invite.</p>
          ) : (
            <ul className="plain">
              {orgs.map((o) => (
                <li key={o.id}>
                  <Link href={`/organizaciones/${o.id}`}>{o.name}</Link>{' '}
                  <span className={`badge ${o.status === 'SUSPENDED' ? 'suspended' : ''}`}>
                    {o.status === 'ACTIVE' ? 'Activa' : 'Suspendida'}
                  </span>
                  {o.roles && o.roles.length > 0 && <span className="muted"> · {o.roles.join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {me?.platform_role === 'SUPER_ADMIN' && <CreateOrganization onCreated={load} />}
    </>
  );
}

function CreateOrganization({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', organization_type: '', country: 'EC', initial_admin_email: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/organizations', {
        method: 'POST',
        body: {
          name: form.name,
          organization_type: form.organization_type.toUpperCase(),
          country: form.country.toUpperCase(),
          ...(form.initial_admin_email ? { initial_admin_email: form.initial_admin_email } : {}),
        },
      });
      setForm({ name: '', organization_type: '', country: 'EC', initial_admin_email: '' });
      onCreated();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <section className="card">
      <h2>Nueva organización</h2>
      <form onSubmit={submit}>
        <label htmlFor="name">Nombre</label>
        <input id="name" required {...field('name')} />
        <label htmlFor="type">Tipo (código, p. ej. ASSOCIATION, EXPORTER)</label>
        <input id="type" required pattern="[A-Za-z_]{2,40}" {...field('organization_type')} />
        <label htmlFor="country">País (ISO de 2 letras)</label>
        <input id="country" required pattern="[A-Za-z]{2}" {...field('country')} />
        <label htmlFor="admin">Correo del administrador inicial (opcional, usuario existente)</label>
        <input id="admin" type="email" {...field('initial_admin_email')} />
        {error && <p className="error" role="alert">{error.message} {recoveryHint(error)}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear organización'}</button>
      </form>
    </section>
  );
}
