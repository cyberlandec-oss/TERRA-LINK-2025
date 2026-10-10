'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, ROLE_LABELS, api, type Organization } from '../../../lib/api';
import { useWorkspace } from '../../../lib/workspace';
import { Alert, Breadcrumb, ErrorPanel, Loading, PageHeader, StatusBadge } from '../../../lib/ui';

// Experiencias por rol aún sin módulo (docs/UX_UI.md §7, §25). Se muestran en una superficie separada y
// rotulada; nunca como entradas de menú ni con datos inventados.
const PENDING_BY_ROLE: Record<string, Array<{ capability: string; story: string }>> = {
  MANAGER: [{ capability: 'Centro de operaciones (entregas, recepciones, lotes y excepciones)', story: 'P0-012, P0-016 y cola de trabajo (UI-04)' }],
  FIELD_TECHNICIAN: [{ capability: 'Parcelas y captura GPS/polígono', story: 'P0-006 a P0-008' }, { capability: 'Trabajo offline y sincronización', story: 'P0-023/P0-024' }],
  RECEPTION_OPERATOR: [{ capability: 'Nueva recepción y pesaje', story: 'P0-012' }],
  QUALITY_OPERATOR: [{ capability: 'Cola de calidad y resultados de muestras', story: 'Backlog por confirmar (UX-D12)' }],
  TRACEABILITY_MANAGER: [{ capability: 'Lotes, procesamiento y explorador de trazabilidad', story: 'P0-013 a P0-017' }],
  EUDR_MANAGER: [{ capability: 'Evidencias, riesgo, mitigación y expedientes', story: 'P0-018 a P0-022' }],
  EXPORT_MANAGER: [{ capability: 'Preparación de embarques', story: 'P0-029' }],
  AUDITOR: [{ capability: 'Explorador de auditoría con comparación de versiones', story: 'P0-025' }],
  BUYER: [{ capability: 'Portal comprador', story: 'P1-001; requiere contrato de concesiones entre organizaciones (UX-D09)' }],
  PRODUCER: [{ capability: '«Mi finca»: parcelas, entregas y documentos propios', story: 'Requiere vínculo cuenta–productor (UX-D08)' }],
};

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
  const pending = roles.flatMap((r) => (PENDING_BY_ROLE[r] ?? []).map((p) => ({ ...p, role: r })));

  return (
    <>
      <Breadcrumb items={[{ label: ws.isPlatformAdmin ? 'Organizaciones' : 'Mis organizaciones', href: '/organizaciones' }, { label: ws.activeOrg.name }]} />
      {!canRead ? (
        <>
          <PageHeader title="Mi espacio" meta={<>{ws.activeOrg.name} · {roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}</>} />
          <Alert tone="info" title="Tu rol todavía no tiene pantallas disponibles en esta etapa.">
            <p>Tu cuenta y tu membresía están activas. Las funciones previstas para tu rol se habilitarán cuando existan sus operaciones y contratos.</p>
          </Alert>
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
          <h2 id="pendientes-rol">Próximas capacidades para tu rol</h2>
          <p className="muted">Aún no disponibles: se listan para orientar la revisión, no son accesos.</p>
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
