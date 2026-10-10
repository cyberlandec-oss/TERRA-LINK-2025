'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, recoveryHint } from '../../../lib/api';

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  result: string;
  reason: string | null;
  occurred_at: string;
  actor: string;
}

const ACTION_LABELS: Record<string, string> = {
  'organization.create': 'Organización creada',
  'organization.update': 'Configuración modificada',
  'organization.suspend': 'Organización suspendida',
  'organization.reactivate': 'Organización reactivada',
  'membership.create': 'Membresía creada',
  'membership.deactivate': 'Membresía desactivada',
  'membership.reactivate': 'Membresía reactivada',
  'membership.roles_change': 'Roles modificados',
  'invitation.create': 'Invitación emitida',
  'invitation.revoke': 'Invitación revocada',
  'invitation.accept': 'Invitación aceptada',
};

// Bitácora de la organización (permiso audit:read: ORG_ADMIN y AUDITOR). Solo lectura.
export function AuditSection({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api<AuditRow[]>(`/api/v1/organizations/${orgId}/audit-logs?limit=20`));
    } catch (err) {
      setError(err as ApiError);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card">
      <h2>Actividad reciente</h2>
      {error && (
        <div className="error" role="alert">
          <p>{error.message} {recoveryHint(error)}</p>
          <button onClick={load}>Reintentar</button>
        </div>
      )}
      {!rows && !error && <p className="muted">Cargando…</p>}
      {rows && rows.length === 0 && <p className="muted">Sin actividad registrada.</p>}
      {rows && rows.length > 0 && (
        <ul className="plain" aria-label="Actividad">
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{ACTION_LABELS[r.action] ?? r.action}</strong>{' '}
              <span className="muted">
                · {r.actor === 'PLATFORM' ? 'Administración de plataforma' : r.actor} · {new Date(r.occurred_at).toLocaleString('es-EC')}
                {r.reason && ` · motivo: ${r.reason}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
