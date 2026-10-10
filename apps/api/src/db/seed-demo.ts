import { randomInt } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { AddressInfo } from 'net';
import { createApp } from '../bootstrap';
import { loadConfig } from '../config';
import { hashPassword } from '../auth/passwords';
import { createDb } from './database';

// Seed DEMO/QA para revisión visual local (npm run seed:demo -w apps/api).
// - Solo desarrollo local: se niega a ejecutar contra bases *_test / *_e2e o con NODE_ENV=production.
// - Datos sintéticos rotulados «DEMO». Conserva todo lo existente; es idempotente.
// - Usa los flujos reales de la API (organizaciones, invitaciones, aceptación, roles, productores): todo
//   queda auditado, cifrado y con eventos. Solo la cuenta de revisión de plataforma se inserta directa
//   (no existe endpoint para crear SUPER_ADMIN).
// - Contraseñas: solo en CREDENCIALES.csv (raíz, ignorado por git). Se reutilizan entre ejecuciones;
//   nunca se regeneran ni se resetean cuentas existentes. No se imprimen.

const ROOT = resolve(__dirname, '..', '..', '..', '..');
const CSV_PATH = resolve(ROOT, 'CREDENCIALES.csv');
const WEB_URL = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const DOMAIN = 'demo.terralink.local';

interface OrgSpec { key: string; name: string; type: string; typeLabel: string; profile: string }
const ORGS: OrgSpec[] = [
  { key: 'coop', name: 'DEMO · Cooperativa Río Verde', type: 'COOPERATIVE', typeLabel: 'Cooperativa', profile: 'productor (cooperativa de productores)' },
  { key: 'acopio', name: 'DEMO · Acopio San Isidro', type: 'COLLECTOR', typeLabel: 'Acopiador / centro de acopio', profile: 'acopiador' },
  { key: 'export', name: 'DEMO · Exportadora Pacífico', type: 'EXPORTER', typeLabel: 'Exportador', profile: 'exportador' },
  { key: 'import', name: 'DEMO · Chocolates Europa (importador UE)', type: 'IMPORTER', typeLabel: 'Importador', profile: 'comprador europeo' },
];

interface UserSpec { local: string; first: string; last: string; memberships: Array<{ org: string; role: string; note?: string }>; platform?: boolean; note?: string }
const USERS: UserSpec[] = [
  { local: 'superadmin.revision', first: 'Revisión', last: 'Plataforma (demo)', platform: true, memberships: [],
    note: 'Administra la plataforma: organizaciones, estado e incorporación del ORG_ADMIN. Sin acceso a miembros, auditoría ni operación de las empresas (D-04).' },
  { local: 'admin.cooperativa', first: 'Carmen', last: 'Zambrano (demo)', memberships: [{ org: 'coop', role: 'ORG_ADMIN' }] },
  { local: 'supervisor.cooperativa', first: 'Luis', last: 'Mera (demo)', memberships: [{ org: 'coop', role: 'MANAGER' }] },
  { local: 'tecnico1.cooperativa', first: 'Rosa', last: 'Cedeño (demo)', memberships: [{ org: 'coop', role: 'FIELD_TECHNICIAN' }] },
  { local: 'tecnico2.cooperativa', first: 'Jorge', last: 'Loor (demo)', memberships: [{ org: 'coop', role: 'FIELD_TECHNICIAN' }] },
  { local: 'productor.cooperativa', first: 'Ana', last: 'Vélez (demo)', memberships: [{ org: 'coop', role: 'PRODUCER',
    note: 'Cuenta sin vínculo con un registro de productor (UX-D08): «Mi finca» pendiente.' }] },
  { local: 'admin.acopio', first: 'Patricia', last: 'Intriago (demo)', memberships: [{ org: 'acopio', role: 'ORG_ADMIN' }] },
  { local: 'recepcion.acopio', first: 'Kevin', last: 'Macías (demo)', memberships: [{ org: 'acopio', role: 'RECEPTION_OPERATOR', note: 'Recepción y pesaje pendientes (P0-012).' }] },
  { local: 'calidad.acopio', first: 'Diana', last: 'Pinargote (demo)', memberships: [{ org: 'acopio', role: 'QUALITY_OPERATOR', note: 'Cola de calidad pendiente (UX-D12).' }] },
  { local: 'admin.exportadora', first: 'Fernando', last: 'Alcívar (demo)', memberships: [{ org: 'export', role: 'ORG_ADMIN' }] },
  { local: 'trazabilidad.exportadora', first: 'Gabriela', last: 'Moreira (demo)', memberships: [{ org: 'export', role: 'TRACEABILITY_MANAGER', note: 'Lotes y explorador de trazabilidad pendientes (P0-013 a P0-017).' }] },
  { local: 'eudr.exportadora', first: 'Andrés', last: 'Vera (demo)', memberships: [{ org: 'export', role: 'EUDR_MANAGER', note: 'Riesgo, evidencias y debida diligencia pendientes (P0-018 a P0-022).' }] },
  { local: 'exportacion.exportadora', first: 'Mónica', last: 'Bravo (demo)', memberships: [{ org: 'export', role: 'EXPORT_MANAGER', note: 'Embarques pendientes (P0-029).' }] },
  { local: 'auditor.exportadora', first: 'Ricardo', last: 'Solórzano (demo)', memberships: [{ org: 'export', role: 'AUDITOR', note: 'Auditor interno de su organización; sin acceso a otras empresas.' }] },
  { local: 'admin.importador', first: 'Claire', last: 'Dubois (demo)', memberships: [{ org: 'import', role: 'ORG_ADMIN' }] },
  { local: 'comprador.importador', first: 'Lukas', last: 'Weber (demo)', memberships: [{ org: 'import', role: 'BUYER',
    note: 'Solo membresía en su organización. Sin portal comprador (P1) ni concesiones entre organizaciones (UX-D09).' }] },
  { local: 'coordinador.multi', first: 'Esteban', last: 'Ponce (demo)', memberships: [
    { org: 'coop', role: 'MANAGER', note: 'Usuario con roles distintos en dos organizaciones: usar el selector de organización.' },
    { org: 'export', role: 'TRACEABILITY_MANAGER', note: 'Mismo usuario; rol distinto en otra organización.' },
  ] },
];

const PRODUCERS = [
  { code: 'DEMO-RV-001', first_name: 'María', last_name: 'Quijije (demo)', community: 'La Unión', parish: 'Calceta', doc: '0990000001', tech: 1 },
  { code: 'DEMO-RV-002', first_name: 'Pedro', last_name: 'Menéndez (demo)', community: 'La Unión', parish: 'Calceta', doc: '0990000002', tech: 1 },
  { code: 'DEMO-RV-003', first_name: 'Teresa', last_name: 'Chávez (demo)', community: 'El Carmen', parish: 'Quiroga', doc: '0990000003', tech: 1 },
  { code: 'DEMO-RV-004', legal_name: 'Finca Los Almendros (demo)', community: 'El Carmen', parish: 'Quiroga', tech: 1 },
  { code: 'DEMO-RV-005', first_name: 'Segundo', last_name: 'Cevallos (demo)', community: 'Río Chico', parish: 'Membrillo', doc: '0990000005', tech: 2 },
  { code: 'DEMO-RV-006', first_name: 'Lucía', last_name: 'Palma (demo)', community: 'Río Chico', parish: 'Membrillo', tech: 2, draft: true },
  { code: 'DEMO-RV-007', first_name: 'Ramón', last_name: 'García (demo)', community: 'Río Chico', parish: 'Membrillo', doc: '0990000007', tech: 2, archive: 'Dejó de producir cacao (dato de demostración)' },
  { code: 'DEMO-RV-008', first_name: 'Elena', last_name: 'Mendoza (demo)', community: 'La Unión', parish: 'Calceta' },
  // Mismo documento que DEMO-RV-003 con otro formato: abre un caso de posible duplicado (P0-005).
  { code: 'DEMO-RV-009', first_name: 'Teresa', last_name: 'Chávez Q. (demo)', community: 'El Carmen', parish: 'Quiroga', doc: '099-000-0003', tech: 1 },
];

const ROLE_ES: Record<string, string> = {
  SUPER_ADMIN: 'Administración de plataforma', ORG_ADMIN: 'Administrador de organización', MANAGER: 'Supervisor',
  FIELD_TECHNICIAN: 'Técnico de campo', RECEPTION_OPERATOR: 'Operador de recepción', QUALITY_OPERATOR: 'Operador de calidad',
  TRACEABILITY_MANAGER: 'Responsable de trazabilidad', EUDR_MANAGER: 'Responsable EUDR', EXPORT_MANAGER: 'Responsable de exportación',
  BUYER: 'Comprador', AUDITOR: 'Auditor', PRODUCER: 'Productor',
};

const email = (u: UserSpec) => `${u.local}@${DOMAIN}`;

function newPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 18; i++) out += alphabet[randomInt(alphabet.length)];
  return `Demo-${out}`;
}

// ---- CSV (RFC 4180, UTF-8 con BOM para Excel) ----
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const HEADER = ['nombre_usuario', 'email', 'contrasena', 'rol', 'organizacion', 'tipo_organizacion', 'perfil_cadena',
  'es_admin_empresa', 'es_admin_plataforma', 'url_acceso', 'estado_acceso', 'observaciones'];

function loadKnownPasswords(): Map<string, string> {
  const known = new Map<string, string>();
  if (!existsSync(CSV_PATH)) return known;
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  const head = rows.shift() ?? [];
  const iEmail = head.indexOf('email');
  const iPass = head.indexOf('contrasena');
  for (const r of rows) if (r[iEmail] && r[iPass]) known.set(r[iEmail], r[iPass]);
  return known;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('seed:demo no se ejecuta en producción');
  const config = loadConfig();
  const dbName = new URL(config.databaseUrl).pathname.slice(1);
  if (/_test$|_e2e$/.test(dbName)) throw new Error('seed:demo es para la base de desarrollo, no para bases de prueba');
  const db = createDb(config.databaseUrl);
  const app = await createApp({ ...config, port: 0 }, db);
  app.useLogger(['error']);
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

  async function call<T>(method: string, path: string, token?: string, body?: unknown, okStatuses = [200, 201]): Promise<{ status: number; data: T }> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as T;
    if (!okStatuses.includes(res.status)) {
      const code = (data as { error?: { code?: string } } | null)?.error?.code ?? 'SIN_CODIGO';
      throw new Error(`${method} ${path} → ${res.status} ${code}`);
    }
    return { status: res.status, data };
  }
  const login = async (mail: string, password: string) =>
    (await call<{ access_token: string }>('POST', '/api/v1/auth/login', undefined, { email: mail, password })).data.access_token;

  const known = loadKnownPasswords();
  const passwords = new Map<string, string>(); // email → contraseña conocida
  const withoutCredential = new Set<string>();
  const userExists = async (mail: string) => !!(await db.selectFrom('users').select('id').where('email', '=', mail).executeTakeFirst());

  try {
    // 1) Cuenta de revisión de plataforma (SUPER_ADMIN).
    const superUser = USERS.find((u) => u.platform)!;
    const superMail = email(superUser);
    if (await userExists(superMail)) {
      if (known.has(superMail)) passwords.set(superMail, known.get(superMail)!);
      else withoutCredential.add(superMail);
    } else {
      const pwd = known.get(superMail) ?? newPassword();
      await db.insertInto('users').values({
        email: superMail, first_name: superUser.first, last_name: superUser.last,
        password_hash: await hashPassword(pwd), status: 'ACTIVE', platform_role: 'SUPER_ADMIN',
      }).execute();
      passwords.set(superMail, pwd);
    }
    if (!passwords.has(superMail)) throw new Error('La cuenta de revisión de plataforma existe pero su contraseña no está en CREDENCIALES.csv; no se resetea.');
    const superToken = await login(superMail, passwords.get(superMail)!);

    // 2) Organizaciones DEMO (alta solo si no existen).
    const allOrgs = (await call<Array<{ id: string; name: string }>>('GET', '/api/v1/organizations?scope=all', superToken)).data;
    const orgIds = new Map<string, string>();
    for (const o of ORGS) {
      const existing = allOrgs.find((x) => x.name === o.name);
      const id = existing?.id ?? (await call<{ id: string }>('POST', '/api/v1/organizations', superToken, { name: o.name, organization_type: o.type, country: o.type === 'IMPORTER' ? 'DE' : 'EC' })).data.id;
      orgIds.set(o.key, id);
    }

    // 3) Membresías mediante invitación + aceptación (flujo real). Primero los ORG_ADMIN.
    const tokens = new Map<string, string>();
    const tokenOf = async (mail: string) => {
      if (!tokens.has(mail)) tokens.set(mail, await login(mail, passwords.get(mail)!));
      return tokens.get(mail)!;
    };
    const isMember = async (orgKey: string, mail: string, role: string) => {
      const row = await db.selectFrom('memberships as m').innerJoin('users as u', 'u.id', 'm.user_id')
        .leftJoin('role_assignments as ra', (j) => j.onRef('ra.membership_id', '=', 'm.id'))
        .select(['m.status', 'ra.role_code']).where('u.email', '=', mail).where('m.organization_id', '=', orgIds.get(orgKey)!).execute();
      return { member: row.length > 0 && row[0].status === 'ACTIVE', hasRole: row.some((r) => r.role_code === role) };
    };
    async function ensureMembership(u: UserSpec, orgKey: string, role: string, inviterToken: string) {
      const mail = email(u);
      const state = await isMember(orgKey, mail, role);
      if (state.member) {
        if (await userExists(mail) && known.has(mail)) passwords.set(mail, known.get(mail)!);
        else if (!passwords.has(mail)) withoutCredential.add(mail);
        return;
      }
      const exists = await userExists(mail);
      if (exists && !known.has(mail) && !passwords.has(mail)) { withoutCredential.add(mail); return; }
      const inv = (await call<{ token: string }>('POST', `/api/v1/organizations/${orgIds.get(orgKey)}/invitations`, inviterToken, { email: mail, role_code: role })).data;
      if (exists) {
        if (!passwords.has(mail)) passwords.set(mail, known.get(mail)!);
        await call('POST', '/api/v1/invitations/accept', await tokenOf(mail), { token: inv.token });
      } else {
        const pwd = known.get(mail) ?? newPassword();
        await call('POST', '/api/v1/invitations/accept', undefined, { token: inv.token, first_name: u.first, last_name: u.last, password: pwd });
        passwords.set(mail, pwd);
      }
    }
    for (const u of USERS.filter((x) => x.memberships.some((m) => m.role === 'ORG_ADMIN'))) {
      for (const m of u.memberships) await ensureMembership(u, m.org, m.role, superToken);
    }
    const adminOf = (orgKey: string) => email(USERS.find((u) => u.memberships.some((m) => m.org === orgKey && m.role === 'ORG_ADMIN'))!);
    for (const u of USERS.filter((x) => !x.platform && !x.memberships.some((m) => m.role === 'ORG_ADMIN'))) {
      for (const m of u.memberships) {
        const admin = adminOf(m.org);
        if (!passwords.has(admin)) { withoutCredential.add(email(u)); continue; }
        await ensureMembership(u, m.org, m.role, await tokenOf(admin));
      }
    }

    // 4) Productores sintéticos de la cooperativa (por su ORG_ADMIN; cifrado, historial y eventos reales).
    const coopAdmin = adminOf('coop');
    if (passwords.has(coopAdmin)) {
      const t = await tokenOf(coopAdmin);
      const coopId = orgIds.get('coop')!;
      const members = (await call<Array<{ email: string; membership_id: string }>>('GET', `/api/v1/organizations/${coopId}/members`, t)).data;
      const techMembership = (n: number) => members.find((m) => m.email === `tecnico${n}.cooperativa@${DOMAIN}`)?.membership_id;
      for (const p of PRODUCERS) {
        const found = (await call<{ items: Array<{ id: string; producer_code: string }> }>('GET', `/api/v1/organizations/${coopId}/producers?status=ALL&q=${encodeURIComponent(p.code)}`, t)).data.items;
        if (found.some((x) => x.producer_code === p.code)) continue;
        const body: Record<string, unknown> = {
          producer_code: p.code, community: p.community, parish: p.parish, canton: 'Bolívar', province: 'Manabí',
          status: p.draft ? 'DRAFT' : 'ACTIVE',
          ...(p.legal_name ? { legal_name: p.legal_name } : { first_name: p.first_name, last_name: p.last_name }),
          ...(p.doc ? { document_type: 'CEDULA', document_number: p.doc, phone: '+593 99 000 0000' } : {}),
          ...(p.tech && techMembership(p.tech) ? { assigned_membership_id: techMembership(p.tech) } : {}),
        };
        const created = (await call<{ id: string; row_version: number }>('POST', `/api/v1/organizations/${coopId}/producers`, t, body)).data;
        if (p.archive) {
          await call('POST', `/api/v1/organizations/${coopId}/producers/${created.id}/archive`, t, { expected_version: created.row_version, reason: p.archive });
        }
      }
    }

    // 5) Verificación: login real de cada cuenta con contraseña conocida.
    const verified = new Map<string, boolean>();
    for (const [mail, pwd] of passwords) {
      const res = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: mail, password: pwd }) });
      verified.set(mail, res.status === 200);
    }

    // 6) CREDENCIALES.csv: una fila por usuario + organización + rol.
    const lines: string[][] = [];
    for (const u of USERS) {
      const mail = email(u);
      const pwd = passwords.get(mail) ?? '';
      const estado = withoutCredential.has(mail) && !pwd ? 'SIN_CREDENCIAL_CONOCIDA (cuenta previa; no se resetea)'
        : verified.get(mail) ? 'LOGIN_VERIFICADO' : 'FALLO_LOGIN';
      const name = `${u.first} ${u.last}`;
      if (u.platform) {
        lines.push([name, mail, pwd, 'SUPER_ADMIN', '(plataforma)', '—', 'administración de plataforma', 'NO', 'SI', WEB_URL, estado, u.note ?? '']);
        continue;
      }
      for (const m of u.memberships) {
        const o = ORGS.find((x) => x.key === m.org)!;
        lines.push([name, mail, pwd, `${m.role} (${ROLE_ES[m.role]})`, o.name, `${o.type} (${o.typeLabel})`, o.profile,
          m.role === 'ORG_ADMIN' ? 'SI' : 'NO', 'NO', WEB_URL, estado, m.note ?? u.note ?? '']);
      }
    }
    const csv = '﻿' + [HEADER, ...lines].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
    writeFileSync(CSV_PATH, csv, { encoding: 'utf8' });

    const ok = [...verified.values()].filter(Boolean).length;
    console.log(`Seed DEMO listo: ${ORGS.length} organizaciones, ${USERS.length} cuentas, ${lines.length} filas en CREDENCIALES.csv; login verificado ${ok}/${verified.size}; sin credencial conocida: ${withoutCredential.size}.`);
    if (ok !== verified.size) process.exitCode = 1;
  } finally {
    await app.close();
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('Fallo del seed DEMO:', err instanceof Error ? err.message : err);
  process.exit(1);
});
