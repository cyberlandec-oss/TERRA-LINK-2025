import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EN, EN_PATTERNS } from './i18n-en';
import { translate } from './i18n';
import { ROLE_LABELS, recoveryHint, ApiError } from './api';

// P1-015 / D-54 — Español fuente, inglés segunda lengua (ADR-0007, opción B).
const PANTALLAS = [
  'app/page.tsx', 'app/acceso/sso/page.tsx', 'app/cuenta/page.tsx', 'app/organizaciones/[id]/coste/page.tsx',
  'app/organizaciones/[id]/limites/page.tsx', 'lib/workspace.tsx', 'lib/ui.tsx', 'lib/i18n.tsx',
];

describe('internacionalización', () => {
  it('todo texto marcado con t(…) en el recorrido tiene su traducción al inglés', () => {
    const faltan: string[] = [];
    for (const f of PANTALLAS) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([^']*)'/g)) if (!(m[1] in EN)) faltan.push(`${f}: ${m[1]}`);
    }
    expect(faltan).toEqual([]);
  });

  it('el español es fuente y reserva: sin traducción devuelve el español, nunca una clave', () => {
    expect(translate('es', 'Iniciar sesión')).toBe('Iniciar sesión');
    expect(translate('en', 'Iniciar sesión')).toBe('Sign in');
    expect(translate('en', 'Un texto que no está en el diccionario')).toBe('Un texto que no está en el diccionario');
    expect(translate('en', 'Por seguridad, espera unos {minutes} min antes de volver a intentarlo.', { minutes: 3 })).toBe('For security, wait about 3 min before trying again.');
    expect(translate('es', 'Vincular {proveedor}', { proveedor: 'X' })).toBe('Vincular X');
  });

  it('ninguna traducción está vacía, ni es igual al español por descuido salvo nombres propios', () => {
    const iguales = new Set(['Authorization Code + PKCE', 'Auditor', 'General']);
    for (const [es, en] of Object.entries(EN)) {
      expect(en.trim().length, es).toBeGreaterThan(0);
      if (!iguales.has(es)) expect(en, `sin traducir: ${es}`).not.toBe(es);
      // Las variables {x} se conservan.
      expect([...es.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), es).toEqual([...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
    }
  });

  it('roles, pistas de recuperación y mensajes con cifras también se traducen', () => {
    for (const rol of Object.values(ROLE_LABELS)) expect(rol in EN, rol).toBe(true);
    for (const code of ['UNAUTHENTICATED', 'VERSION_CONFLICT', 'ORGANIZATION_SUSPENDED', 'PERMISSION_DENIED', 'NOT_FOUND', 'TOO_MANY_ATTEMPTS', 'LOGIN_TEMPORARILY_UNAVAILABLE']) {
      const hint = recoveryHint(new ApiError(403, { code, message: 'x', request_id: null }));
      expect(hint in EN, `${code}: ${hint}`).toBe(true);
    }
    expect(translate('en', 'El archivo supera el límite de 65536 bytes.')).toBe('The file exceeds the limit of 65536 bytes.');
    expect(EN_PATTERNS.length).toBeGreaterThan(0);
  });
});
