import { describe, expect, it } from 'vitest';
import { ApiError, can, recoveryHint } from './api';

describe('cliente web', () => {
  it('muestra acciones solo con el permiso efectivo devuelto por la API, no por nombre de rol', () => {
    expect(can({ permissions: ['organization:read', 'organization:update'] }, 'organization:update')).toBe(true);
    expect(can({ permissions: ['organization:read'] }, 'organization:update')).toBe(false);
    expect(can({}, 'organization:read')).toBe(false);
  });

  it('ofrece recuperación específica para suspensión y conflicto de versión', () => {
    const err = (code: string) => new ApiError(409, { code, message: 'x', request_id: 'req-1' });
    expect(recoveryHint(err('ORGANIZATION_SUSPENDED'))).toMatch(/consultar/);
    expect(recoveryHint(err('VERSION_CONFLICT'))).toMatch(/Recarga/);
    expect(recoveryHint(err('OTRO'))).toContain('req-1');
  });
});
