'use client';

import { useWorkspace } from '../../../../lib/workspace';
import { Breadcrumb, ErrorPanel, PageHeader } from '../../../../lib/ui';
import { ApiError } from '../../../../lib/api';
import { AuditSection } from '../_componentes/actividad';

// UI-18 Auditoría (docs/UX_UI.md §20.1): solo consulta; filas de esta organización (audit:read).
export default function AuditPage() {
  const ws = useWorkspace();
  const org = ws.activeOrg;
  if (!org || !ws.can('audit:read')) {
    return <ErrorPanel error={new ApiError(403, { code: 'PERMISSION_DENIED', message: 'Tu rol no permite consultar la auditoría de esta organización.', request_id: null })} />;
  }
  return (
    <>
      <Breadcrumb items={[{ label: org.name, href: `/organizaciones/${org.id}` }, { label: 'Auditoría' }]} />
      <PageHeader title="Auditoría" meta={<>{org.name} · Registro de solo lectura: quién hizo qué y cuándo.</>} />
      <AuditSection orgId={org.id} />
    </>
  );
}
