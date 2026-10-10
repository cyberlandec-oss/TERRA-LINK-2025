'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../../../lib/api';
import { useWorkspace } from '../../../../lib/workspace';
import { Breadcrumb, EmptyState, ErrorPanel, Loading, PageHeader, StatusBadge } from '../../../../lib/ui';
import { GEOMETRY_STATUS, ha, type Plot } from '../../../../lib/plots';

// UI-06 Parcelas: listado y filtros con datos reales. El alta es contextual desde la ficha del productor.
export default function PlotsPage() {
  const ws = useWorkspace();
  const orgId = ws.activeOrg?.id ?? '';
  const canList = ws.can('plot:read') || ws.can('plot:read_assigned');
  const [items, setItems] = useState<Plot[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ q: '', status: 'ACTIVE', geometry: '' });
  const [applied, setApplied] = useState(filters);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (append = false, from: string | null = null, f = filters) => {
    if (!orgId || !canList) return;
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '25', status: f.status });
      if (f.q.trim()) params.set('q', f.q.trim());
      if (f.geometry) params.set('geometry', f.geometry);
      if (from) params.set('cursor', from);
      const res = await api<{ items: Plot[]; next_cursor: string | null }>(`/api/v1/organizations/${orgId}/plots?${params}`);
      setItems((prev) => (append && prev ? [...prev, ...res.items] : res.items));
      setCursor(res.next_cursor);
      setApplied(f);
    } catch (err) {
      setError(err as ApiError);
    }
  }, [orgId, canList, filters]);

  useEffect(() => {
    void load();
    // Solo al entrar; los filtros se aplican con el formulario.
  }, [orgId]);

  if (!ws.activeOrg) return null;
  if (!canList) return <ErrorPanel error={new ApiError(403, { code: 'PERMISSION_DENIED', message: 'Tu rol no permite consultar parcelas.', request_id: null })} />;
  const filtered = applied.q !== '' || applied.status !== 'ACTIVE' || applied.geometry !== '';
  const onlyAssigned = !ws.can('plot:read');
  const reset = { q: '', status: 'ACTIVE', geometry: '' };

  return (
    <>
      <Breadcrumb items={[{ label: ws.activeOrg.name, href: `/organizaciones/${orgId}` }, { label: 'Parcelas' }]} />
      <PageHeader title="Parcelas" meta={onlyAssigned ? 'Ves las parcelas de los productores asignados a ti.' : 'Parcelas de la organización.'} />
      <form className="card" role="search" aria-label="Buscar parcelas" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <div className="grid-3">
          <div>
            <label htmlFor="q">Buscar por código, nombre o código de productor</label>
            <input id="q" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
          <div>
            <label htmlFor="status">Estado</label>
            <select id="status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="ACTIVE">Activas</option>
              <option value="INACTIVE">De baja</option>
              <option value="ALL">Todas</option>
            </select>
          </div>
          <div>
            <label htmlFor="geometry">Situación geométrica</label>
            <select id="geometry" value={filters.geometry} onChange={(e) => setFilters({ ...filters, geometry: e.target.value })}>
              <option value="">Todas</option>
              <option value="WITH">Con ubicación registrada</option>
              <option value="WITHOUT">Geometría pendiente</option>
            </select>
          </div>
        </div>
        <div className="actions">
          <button type="submit">Buscar</button>
          {filtered && <button type="button" className="secondary" onClick={() => { setFilters(reset); void load(false, null, reset); }}>Limpiar filtros</button>}
        </div>
      </form>
      {error && <ErrorPanel error={error} onRetry={() => load()} />}
      {!items && !error && <Loading label="Cargando parcelas…" />}
      {items && items.length === 0 && (filtered
        ? <EmptyState title="No encontramos resultados con estos filtros."><p className="muted">Ajusta la búsqueda o limpia los filtros.</p></EmptyState>
        : <EmptyState title={onlyAssigned ? 'Tus productores asignados aún no tienen parcelas.' : 'Aún no hay parcelas registradas.'}>
            {(ws.can('plot:create') || ws.can('plot:create_assigned')) && <p className="muted">Registra una parcela desde la ficha de su <Link href={`/organizaciones/${orgId}/productores`}>productor</Link>.</p>}
          </EmptyState>)}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table aria-label="Parcelas">
            <thead><tr><th scope="col">Parcela</th><th scope="col">Productor</th><th scope="col">Cultivo</th><th scope="col">Situación geométrica</th><th scope="col">Superficie</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/organizaciones/${orgId}/parcelas/${p.id}`}>{p.plot_code}{p.name ? ` · ${p.name}` : ''}</Link></td>
                  <td>{p.producer.producer_code} · {p.producer.display_name}</td>
                  <td>{p.crop}</td>
                  <td><StatusBadge tone={GEOMETRY_STATUS[p.geometry_status].tone}>{GEOMETRY_STATUS[p.geometry_status].label}</StatusBadge></td>
                  <td>
                    {ha(p.area_declared_ha) ? <div>Declarada: {ha(p.area_declared_ha)}</div> : null}
                    {ha(p.area_calculated_ha) ? <div>Calculada: {ha(p.area_calculated_ha)}</div> : null}
                    {!p.area_declared_ha && !p.area_calculated_ha && <span className="muted">Sin registrar</span>}
                  </td>
                  <td><StatusBadge tone={p.status === 'ACTIVE' ? 'valid' : 'blocked'}>{p.status === 'ACTIVE' ? 'Activa' : 'De baja'}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && <button className="secondary" onClick={() => load(true, cursor)}>Cargar más</button>}
    </>
  );
}
