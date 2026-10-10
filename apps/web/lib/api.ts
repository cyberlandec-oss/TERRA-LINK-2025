// Cliente mínimo de la API. Autorización real en el backend; la UI solo refleja permisos efectivos.
// Limitación conocida (TECH-001): el token vive en sessionStorage; migrar a cookie httpOnly con OIDC (ADR-0005).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'tl_token';

export interface ApiErrorBody {
  code: string;
  message: string;
  request_id: string | null;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: ApiErrorBody) {
    super(body.message);
  }
}

export interface Organization {
  id: string;
  name: string;
  legal_name: string | null;
  organization_type: string;
  tax_id: string | null;
  country: string;
  province: string | null;
  canton: string | null;
  parish: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  status_reason: string | null;
  row_version: number;
  roles?: string[];
  permissions?: string[];
}

export interface Me {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  platform_role: 'SUPER_ADMIN' | null;
}

export interface Member {
  membership_id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified_at: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  status_reason: string | null;
  user_status: 'ACTIVE' | 'INACTIVE';
  roles: string[];
}

export interface Invitation {
  id: string;
  email: string;
  role_code: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expires_at: string;
  created_at: string;
}

export const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: 'Administrador de organización',
  MANAGER: 'Supervisor',
  FIELD_TECHNICIAN: 'Técnico de campo',
  RECEPTION_OPERATOR: 'Operador de recepción',
  QUALITY_OPERATOR: 'Operador de calidad',
  TRACEABILITY_MANAGER: 'Responsable de trazabilidad',
  EUDR_MANAGER: 'Responsable EUDR',
  EXPORT_MANAGER: 'Responsable de exportación',
  BUYER: 'Comprador',
  AUDITOR: 'Auditor',
  PRODUCER: 'Productor',
};

/** Enlace de invitación: el token va en el fragmento (#), que el navegador no envía al servidor ni en Referer. */
export function invitationLink(origin: string, token: string): string {
  return `${origin}/invitacion#token=${encodeURIComponent(token)}`;
}

export function tokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)token=([A-Za-z0-9_-]{43})(?:&|$)/.exec(hash);
  return m ? m[1] : null;
}

export const session = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* almacenamiento bloqueado: la sesión dura lo que la pestaña */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* sin almacenamiento */
    }
  },
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = session.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'No se pudo contactar el servidor. Revisa tu conexión y reintenta.', request_id: null });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? { code: `HTTP_${res.status}`, message: 'Error inesperado.', request_id: null });
  }
  return data as T;
}

/** Texto de recuperación por código de error (la UI no traduce 403 en «sin datos»). */
export function recoveryHint(err: ApiError): string {
  switch (err.body.code) {
    case 'UNAUTHENTICATED':
      return 'Tu sesión terminó. Vuelve a iniciar sesión.';
    case 'VERSION_CONFLICT':
      return 'Otra persona modificó este registro. Recarga para ver la versión actual.';
    case 'ORGANIZATION_SUSPENDED':
      return 'Puedes consultar la información, pero no registrar cambios hasta que se reactive.';
    case 'PERMISSION_DENIED':
      return 'Solicita el permiso al administrador de tu organización.';
    case 'NOT_FOUND':
      return 'Verifica el enlace o elige otra organización.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Por seguridad se pausaron los intentos. Espera unos minutos antes de reintentar.';
    case 'INVITATION_EXPIRED':
    case 'INVITATION_REVOKED':
      return 'Pide al administrador de la organización una invitación nueva.';
    case 'INVITATION_USED':
      return 'Si ya aceptaste, inicia sesión con tu correo y contraseña.';
    case 'INVITATION_RECIPIENT_MISMATCH':
      return 'Cierra sesión e ingresa con la cuenta del correo invitado.';
    case 'INVITATION_PENDING':
      return 'Revoca la invitación pendiente en la lista y emite una nueva.';
    case 'ALREADY_MEMBER':
      return 'Esa persona ya tiene acceso; revisa la lista de miembros.';
    case 'ROLE_NOT_GRANTABLE':
      return 'Elige un rol con permisos que tú tengas.';
    case 'SELF_MEMBERSHIP_CHANGE':
    case 'SELF_ROLE_CHANGE':
      return 'Pide a otro administrador que realice el cambio.';
    case 'ELEVATION_REQUIRED':
      return 'Esta acción necesita una política de elevación auditada que aún no existe.';
    case 'ORGANIZATION_TYPE_UNKNOWN':
      return 'Elige un tipo de la lista.';
    case 'NO_CHANGE':
      return 'No hay cambios que guardar.';
    default:
      return err.body.request_id ? `Si persiste, comparte este código con soporte: ${err.body.request_id}` : 'Reintenta en unos minutos.';
  }
}

export const can = (org: Pick<Organization, 'permissions'>, permission: string) =>
  (org.permissions ?? []).includes(permission);
