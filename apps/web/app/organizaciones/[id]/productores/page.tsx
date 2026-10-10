'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, can, recoveryHint, session, type Organization } from '../../../../lib/api';

export interface Producer {
  id: string;
  producer_code: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  legal_name: string | null;
  community: string | null;
  province: string | null;
  canton: string | null;
  parish: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  assigned_membership_id: string | null;
  row_version: number;
  identity_visible: boolean;
  document_type?: string | null;
  document_number?: string | null;
  phone?: string | null;
  address?: string | null;
  deletion_reason: string | null;
}

export const STATUS_LABEL: Record<Producer['status'], string> = { DRAFT: 'Borrador', ACTIVE: 'Activo', INACTIVE: 'De baja' };

export default function ProducersPage() {
  const { id: orgId } = useParams<{ id: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
  const [items, setItems] = useState<Producer[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (append = false, from: string | null = null) => {
    setError(null);
    try {
      if (!append) setOrg(await api<Organization>(`/api/v1/organizations/${orgId}`));
      const params = new URLSearchParams({ limit: '25' });
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      if (from) params.set('cursor', from);
      const res = await api<{ items: Producer[]; next_cursor: string | null }>(`/api/v1/organizations/${orgId}/producers?${params}`);
      setItems((prev) => (append && prev ? [...prev, ...res.items] : res.items));
      setCursor(res.next_cursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace('/');
        return;
      }
      setError(err as ApiError);
    }
  }, [orgId, q, status, router]);

  useEffect(() => {
    void load();
    // Solo al entrar; la búsqueda se lanza con el formulario.
  }, [orgId]);

  return (
    <>
      <p><Link href={`/organizaciones/${orgId}`}>← {org?.name ?? 'Organización'}</Link></p>
      <h1>Productores</h1>
      <form className="card" onSubmit={(e) => { e.preventDefault(); void load(); }} role="search">
        <label htmlFor="q">Buscar por código, nombre o comunidad</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="status">Estado</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Activos y borradores</option>
          <option value="ACTIVE">Activos</option>
          <option value="DRAFT">Borradores</option>
          <option value="INACTIVE">De baja</option>
          <option value="ALL">Todos</option>
        </select>
        <button type="submit">Buscar</button>
      </form>
      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          <p>{recoveryHint(error)}</p>
          <button onClick={() => load()}>Reintentar</button>
        </div>
      )}
      {!items && !error && <p className="muted">Cargando…</p>}
      {items && (
        <section className="card">
          {items.length === 0 ? (
            <p>No hay productores que coincidan. Ajusta la búsqueda{org && can(org, 'producer:create') ? ' o registra uno nuevo' : ''}.</p>
          ) : (
            <ul className="plain" aria-label="Productores">
              {items.map((p) => (
                <li key={p.id}>
                  <Link href={`/organizaciones/${orgId}/productores/${p.id}`}>{p.producer_code} · {p.display_name}</Link>{' '}
                  <span className={`badge ${p.status === 'INACTIVE' ? 'suspended' : ''}`}>{STATUS_LABEL[p.status]}</span>
                  {p.community && <span className="muted"> · {p.community}</span>}
                </li>
              ))}
            </ul>
          )}
          {cursor && <button className="secondary" onClick={() => load(true, cursor)}>Cargar más</button>}
        </section>
      )}
      {org && can(org, 'producer:create') && org.status === 'ACTIVE' && (
        <CreateProducer orgId={orgId} onCreated={(p) => router.push(`/organizaciones/${orgId}/productores/${p.id}`)} />
      )}
    </>
  );
}

export function ProducerFields({ value, onChange, showIdentity }: {
  value: Record<string, string>; onChange: (v: Record<string, string>) => void; showIdentity: boolean;
}) {
  const field = (key: string, label: string, extra: Record<string, unknown> = {}) => (
    <>
      <label htmlFor={`f-${key}`}>{label}</label>
      <input id={`f-${key}`} value={value[key] ?? ''} onChange={(e) => onChange({ ...value, [key]: e.target.value })} {...extra} />
    </>
  );
  return (
    <>
      <p className="muted">Indica nombre y apellido, o la razón social.</p>
      {field('first_name', 'Nombre')}
      {field('last_name', 'Apellido')}
      {field('legal_name', 'Razón social')}
      {showIdentity && (
        <>
          {field('document_type', 'Tipo de documento')}
          {field('document_number', 'Número de documento')}
          {field('phone', 'Teléfono', { inputMode: 'tel' })}
          {field('address', 'Dirección')}
        </>
      )}
      {field('community', 'Comunidad')}
      {field('province', 'Provincia')}
      {field('canton', 'Cantón')}
      {field('parish', 'Parroquia')}
    </>
  );
}

/** Convierte el formulario a payload: vacío → null (borra) solo en edición; omitido en alta. */
export function toPayload(v: Record<string, string>, forUpdate: boolean) {
  const out: Record<string, string | null> = {};
  for (const [k, raw] of Object.entries(v)) {
    const t = raw.trim();
    if (t) out[k] = t;
    else if (forUpdate) out[k] = null;
  }
  return out;
}

function CreateProducer({ orgId, onCreated }: { orgId: string; onCreated: (p: Producer) => void }) {
  const [code, setCode] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Si falla, el formulario conserva lo escrito para corregir y reintentar.
      const p = await api<Producer>(`/api/v1/organizations/${orgId}/producers`, {
        method: 'POST', body: { producer_code: code.trim(), status: draft ? 'DRAFT' : 'ACTIVE', ...toPayload(fields, false) },
      });
      onCreated(p);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Registrar productor</h2>
      <form onSubmit={submit}>
        <label htmlFor="f-code">Código de productor</label>
        <input id="f-code" required value={code} onChange={(e) => setCode(e.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,39}" />
        <ProducerFields value={fields} onChange={setFields} showIdentity />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Guardar como borrador
        </label>
        {error && (
          <div className="error" role="alert">
            <p>{error.message} {recoveryHint(error)}</p>
            {error.body.details?.map((d, i) => <p key={i} className="muted">{d.field ? `${d.field}: ` : ''}{d.reason}</p>)}
          </div>
        )}
        <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar productor'}</button>
      </form>
    </section>
  );
}
