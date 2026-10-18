'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../../../lib/api';
import { useWorkspace } from '../../../../lib/workspace';
import { Alert, Breadcrumb, ErrorPanel, Loading, PageHeader, StatusBadge } from '../../../../lib/ui';

// P1-015 — Límites y consumo (RF-46).
//
// Lo que esta pantalla no puede dejar de decir:
//   · cada límite trae **de dónde sale** y **qué pasa al superarlo**: así se puede comprobar, no creer;
//   · el **consumo no es un coste**: no hay tarifa acordada ni proveedor contratado;
//   · la autenticación es **local**: no se insinúa un SSO que no existe;
//   · el producto está **en español**, y eso se ve —no hay claves de traducción a la vista—.

interface Limite {
  code: string; label: string; what: string; value: number | string; unit: string;
  source: string; enforced_at: string; on_exceed: string;
}
interface Vista {
  limits: Limite[];
  usage: {
    documents: number; document_versions: number; stored_bytes: number; quota_bytes: number;
    quota_note: string; plots: number; deliveries: number; events: number;
  };
  language: { primary: string; available: string[]; note: string };
  cost_note: string; sso_note: string; note: string;
}

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default function LimitesPage() {
  const ws = useWorkspace();
  const orgId = ws.activeOrg?.id;
  const [v, setV] = useState<Vista | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    setError(null);
    try { setV(await api<Vista>(`/api/v1/organizations/${orgId}/limits`)); }
    catch (err) { setError(err as ApiError); }
  }, [orgId]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (!ws.activeOrg) {
    return <ErrorPanel error={new ApiError(404, { code: 'NOT_FOUND', message: 'El recurso no existe o no está disponible para ti.', request_id: null })} />;
  }
  const migas = [{ label: ws.activeOrg.name, href: `/organizaciones/${orgId}` }, { label: 'Límites y consumo' }];

  return (
    <>
      <Breadcrumb items={migas} />
      <PageHeader title="Límites y consumo" meta={<span>Solo lectura · valores vigentes del producto</span>} />

      <Alert tone="info" title="El consumo no es un coste.">
        <p>
          Aquí se ve <strong>lo que el producto limita hoy</strong> y <strong>lo que esta organización lleva
          consumido</strong>. <strong>No hay tarifa acordada ni proveedor contratado</strong>, así que ninguna
          de estas cifras es dinero. Tampoco se fija aquí ningún límite nuevo: se leen de la configuración
          vigente, y si alguien los cambia, cambia lo que ves.
        </p>
      </Alert>

      {error && <ErrorPanel error={error} onRetry={cargar} />}
      {!v && !error && <Loading label="Cargando límites y consumo…" />}

      {v && (
        <>
          <section className="card" aria-labelledby="lim-consumo">
            <h2 id="lim-consumo">Consumo de esta organización</h2>
            <dl className="props">
              <dt>Almacenamiento usado</dt>
              <dd>
                <strong>{kb(v.usage.stored_bytes)}</strong> de {kb(v.usage.quota_bytes)}
                <div className="muted">{v.usage.quota_note}</div>
              </dd>
              <dt>Documentos y versiones</dt><dd>{v.usage.documents} documentos · {v.usage.document_versions} versiones</dd>
              <dt>Parcelas</dt><dd>{v.usage.plots}</dd>
              <dt>Entregas</dt><dd>{v.usage.deliveries}</dd>
              <dt>Eventos de dominio</dt><dd>{v.usage.events}</dd>
            </dl>
            <p className="muted">{v.cost_note}</p>
          </section>

          <section className="card" aria-labelledby="lim-tabla">
            <h2 id="lim-tabla">Límites vigentes</h2>
            <div className="table-wrap"><table aria-label="Límites vigentes del producto">
              <thead><tr>
                <th scope="col">Límite</th><th scope="col">Valor</th><th scope="col">Qué limita</th>
                <th scope="col">De dónde sale</th><th scope="col">Dónde se aplica</th><th scope="col">Al superarlo</th>
              </tr></thead>
              <tbody>{v.limits.map((l) => (
                <tr key={l.code}>
                  <td>{l.label}<div className="muted"><code>{l.code}</code></div></td>
                  <td><strong>{typeof l.value === 'number' && l.unit === 'bytes' ? kb(l.value) : l.value}</strong>
                    {l.unit !== 'bytes' ? <div className="muted">{l.unit}</div> : null}</td>
                  <td className="muted">{l.what}</td>
                  <td className="muted">{l.source}</td>
                  <td className="muted">{l.enforced_at}</td>
                  <td className="muted">{l.on_exceed}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <p className="muted">{v.note}</p>
          </section>

          <section className="card" aria-labelledby="lim-idioma">
            <h2 id="lim-idioma">Idioma e inicio de sesión</h2>
            <dl className="props">
              <dt>Idioma principal</dt>
              <dd><StatusBadge tone="valid">{v.language.primary}</StatusBadge> <span className="muted">disponibles: {v.language.available.join(', ')}</span></dd>
              <dt>Inicio de sesión</dt>
              <dd><StatusBadge tone="neutral">local</StatusBadge> <span className="muted">sin acceso federado</span></dd>
            </dl>
            <p className="muted">{v.language.note}</p>
            <p className="muted">{v.sso_note}</p>
            <p className="muted">
              Las decisiones abiertas —unidad de cobro, proveedor de acceso federado y alcance multilenguaje—
              están registradas como <strong>D-54</strong>, con sus ADR <strong>0007</strong>,
              <strong> 0008</strong> y <strong> 0009</strong>. Ninguna está adoptada.
            </p>
          </section>
        </>
      )}
    </>
  );
}
