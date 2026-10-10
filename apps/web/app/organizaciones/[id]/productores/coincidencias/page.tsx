'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, recoveryHint, session } from '../../../../../lib/api';

interface Side {
  id: string;
  producer_code: string;
  display_name: string;
  community: string | null;
  parish: string | null;
  status: string;
  document_type?: string | null;
  document_number?: string | null;
}

interface Review {
  id: string;
  rule_code: string;
  status: 'PENDING' | 'NOT_DUPLICATE' | 'DUPLICATE_CONFIRMED';
  detected_at: string;
  resolution_note: string | null;
  row_version: number;
  identity_visible: boolean;
  producer_a: Side;
  producer_b: Side;
}

const STATUS: Record<Review['status'], string> = { PENDING: 'Pendiente', NOT_DUPLICATE: 'No es duplicado', DUPLICATE_CONFIRMED: 'Duplicado confirmado' };
const RULE: Record<string, string> = { IDENTITY_DOCUMENT: 'Mismo tipo y número de documento' };

// P0-005: revisión asistida. Ninguna acción de esta página fusiona, modifica ni da de baja productores.
export default function MatchReviewsPage() {
  const { id: orgId } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<Review[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api<Review[]>(`/api/v1/organizations/${orgId}/producer-match-reviews?status=${status}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace('/');
        return;
      }
      setError(err as ApiError);
    }
  }, [orgId, status, router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <p><Link href={`/organizaciones/${orgId}/productores`}>← Productores</Link></p>
      <h1>Posibles duplicados</h1>
      <p className="muted">Resolver un caso solo registra la decisión: los productores no se fusionan ni se modifican.</p>
      <label htmlFor="status">Estado</label>
      <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="PENDING">Pendientes</option>
        <option value="DUPLICATE_CONFIRMED">Duplicados confirmados</option>
        <option value="NOT_DUPLICATE">No duplicados</option>
        <option value="ALL">Todos</option>
      </select>
      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          <p>{recoveryHint(error)}</p>
          <button onClick={load}>Reintentar</button>
        </div>
      )}
      {!rows && !error && <p className="muted">Cargando…</p>}
      {rows && rows.length === 0 && <p className="card">No hay casos en este estado.</p>}
      {rows?.map((r) => <ReviewCard key={r.id} orgId={orgId} review={r} onDone={load} />)}
    </>
  );
}

function SideView({ orgId, side, identity }: { orgId: string; side: Side; identity: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <Link href={`/organizaciones/${orgId}/productores/${side.id}`}>{side.producer_code} · {side.display_name}</Link>
      <div className="muted">{[side.community, side.parish].filter(Boolean).join(' · ') || 'Sin ubicación'} · {side.status}</div>
      {identity && side.document_number && <div className="muted">{side.document_type} {side.document_number}</div>}
    </div>
  );
}

function ReviewCard({ orgId, review, onDone }: { orgId: string; review: Review; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve(e: FormEvent, decision: 'NOT_DUPLICATE' | 'DUPLICATE_CONFIRMED') {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/organizations/${orgId}/producer-match-reviews/${review.id}/resolve`, {
        method: 'POST', body: { decision, note, expected_version: review.row_version },
      });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label={`Caso ${review.producer_a.producer_code} y ${review.producer_b.producer_code}`}>
      <p><span className="badge">{STATUS[review.status]}</span> <span className="muted">{RULE[review.rule_code] ?? review.rule_code} · {new Date(review.detected_at).toLocaleString('es-EC')}</span></p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <SideView orgId={orgId} side={review.producer_a} identity={review.identity_visible} />
        <SideView orgId={orgId} side={review.producer_b} identity={review.identity_visible} />
      </div>
      {review.resolution_note && <p className="muted">Nota: {review.resolution_note}</p>}
      {review.status === 'PENDING' && (
        <form onSubmit={(e) => resolve(e, 'NOT_DUPLICATE')}>
          <label htmlFor={`note-${review.id}`}>Nota de la decisión (queda en la auditoría)</label>
          <input id={`note-${review.id}`} required minLength={3} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" disabled={busy}>No es duplicado</button>{' '}
          <button type="button" className="secondary" disabled={busy || note.trim().length < 3} onClick={(e) => resolve(e as unknown as FormEvent, 'DUPLICATE_CONFIRMED')}>
            Es duplicado (sin fusionar)
          </button>
          {error && <p className="error" role="alert">{error.message} {recoveryHint(error)}</p>}
        </form>
      )}
    </section>
  );
}
