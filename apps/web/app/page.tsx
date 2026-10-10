'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError, api, session } from '../lib/api';

// UI-01 Acceso (docs/UX_UI.md §10.1). Sin registro público, recuperación ni OIDC: no están implementados.
function loginMessage(err: ApiError): { title: string; detail: string } {
  if (err.body.code === 'TOO_MANY_ATTEMPTS') {
    const retry = Number(err.body.details?.find((d) => d.reason.startsWith('RETRY_AFTER_'))?.reason.slice(12) ?? 0);
    const minutes = Math.max(1, Math.ceil(retry / 60));
    return { title: 'Demasiados intentos.', detail: `Por seguridad, espera unos ${minutes} min antes de volver a intentarlo.` };
  }
  if (err.status === 503) return { title: 'El inicio de sesión no está disponible temporalmente.', detail: 'Tus credenciales no se evaluaron. Intenta de nuevo en unos minutos.' };
  if (err.status === 0) return { title: 'Sin conexión con el servidor.', detail: 'Revisa tu conexión y reintenta.' };
  if (err.status === 401) return { title: 'Correo o contraseña incorrectos.', detail: 'Revisa los datos e inténtalo de nuevo.' };
  return { title: 'No pudimos iniciar sesión.', detail: err.message };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ access_token: string }>('/api/v1/auth/login', { method: 'POST', body: { email, password } });
      session.set(res.access_token);
      router.push('/organizaciones');
    } catch (err) {
      // Se conserva el correo; la contraseña se limpia tras un rechazo.
      setPassword('');
      setError(err instanceof ApiError ? loginMessage(err) : { title: 'No pudimos iniciar sesión.', detail: '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="tl-access">
      <div className="tl-access-card">
        {/* Identificación textual hasta disponer del lockup oficial (UX-D01). */}
        <p className="tl-access-brand" aria-label="Terra Link">TERRA LINK</p>
        <section className="card">
          <h1>Iniciar sesión</h1>
          <form onSubmit={submit} noValidate={false}>
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="password">Contraseña</label>
            <div className="password-row">
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="secondary inline" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                <p className="alert-title">{error.title}</p>
                {error.detail && <p>{error.detail}</p>}
              </div>
            )}
            <button type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
