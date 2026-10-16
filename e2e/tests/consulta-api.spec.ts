import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Utilidad de consulta segura (`e2e/review/consulta-api.mjs`). Se prueba con credenciales FICTICIAS, en un
// directorio temporal: ninguna cuenta real interviene. Lo que se fija aquí es lo que provocó la incidencia —
// que una contraseña acabe en la salida— y la regla de qué archivo manda cuando hay dos.
//
// No abre navegador ni toca la API: es lógica pura del lector de credenciales.
interface Util {
  archivoVigente(dir?: string): string;
  cuentaDemo(local: string, dir?: string): { email: string; contrasena: string; rol: string; organizacion: string };
  sanear<T>(valor: T): T;
}
let util: Util;
test.beforeAll(async () => { util = (await import('../review/consulta-api.mjs')) as unknown as Util; });

const CABECERA = 'nombre_usuario,email,contrasena,rol,organizacion,tipo_organizacion,perfil_cadena,es_admin_empresa,es_admin_plataforma,url_acceso,estado_acceso,observaciones';
const fila = (local: string, pwd: string, rol = 'ORG_ADMIN (Administración)') =>
  `Ficticio ${local},${local}@ficticio.invalid,${pwd},${rol},ORG FICTICIA,COOPERATIVE (Cooperativa),acopio,SI,NO,http://localhost:3000,LOGIN_VERIFICADO,`;

function escenario(principal: string[], pendiente?: string[], pendienteMasNuevo = true) {
  const dir = mkdtempSync(join(tmpdir(), 'tl-cred-'));
  writeFileSync(join(dir, 'CREDENCIALES.csv'), `﻿${[CABECERA, ...principal].join('\r\n')}\r\n`);
  if (pendiente) {
    const p = join(dir, 'CREDENCIALES.pendiente.csv');
    writeFileSync(p, `﻿${[CABECERA, ...pendiente].join('\r\n')}\r\n`);
    // Fechas explícitas: la prueba no debe depender de la resolución del reloj del sistema de archivos.
    const viejo = new Date(Date.now() - 60_000);
    const nuevo = new Date();
    utimesSync(join(dir, 'CREDENCIALES.csv'), pendienteMasNuevo ? viejo : nuevo, pendienteMasNuevo ? viejo : nuevo);
    utimesSync(p, pendienteMasNuevo ? nuevo : viejo, pendienteMasNuevo ? nuevo : viejo);
  }
  return dir;
}

test('la consulta publica cuenta, organización y rol, y nunca la contraseña', async () => {
  const dir = escenario([fila('ficticia.uno', 'NoDebeSalir-0000000000')]);
  const cuenta = util.cuentaDemo('ficticia.uno', dir);
  // La utilidad SÍ lee la contraseña —la necesita para autenticar—, pero lo que se publica no la lleva.
  expect(cuenta.contrasena).toBe('NoDebeSalir-0000000000');
  const publicado = {
    cuenta: cuenta.email.split('@')[0],
    organizacion: cuenta.organizacion,
    rol: cuenta.rol,
    resultado: util.sanear({ code: 'risk_critical', value: '1', contrasena: cuenta.contrasena, access_token: 'jwt-ficticio' }),
  };
  const texto = JSON.stringify(publicado);
  expect(texto).not.toContain('NoDebeSalir-0000000000');
  expect(texto).not.toContain('jwt-ficticio');
  expect(publicado).toMatchObject({ cuenta: 'ficticia.uno', organizacion: 'ORG FICTICIA', rol: 'ORG_ADMIN (Administración)' });
  expect(publicado.resultado).toEqual({ code: 'risk_critical', value: '1' });
});

test('el saneado quita claves sensibles a cualquier profundidad, incluso dentro de listas', async () => {
  const salida = util.sanear([{ lote: 'L-1', interno: { token: 'jwt-ficticio', password: 'x', estado: 'OK' } }]);
  expect(salida).toEqual([{ lote: 'L-1', interno: { estado: 'OK' } }]);
  expect(JSON.stringify(salida)).not.toMatch(/jwt-ficticio|password/);
});

test('manda el archivo más reciente: un CREDENCIALES.csv bloqueado y atrasado no impone una credencial muerta', async () => {
  const dir = escenario(
    [fila('ficticia.dos', 'Antigua-1111111111')],
    [fila('ficticia.dos', 'Vigente-2222222222')],
  );
  expect(util.archivoVigente(dir)).toContain('CREDENCIALES.pendiente.csv');
  expect(util.cuentaDemo('ficticia.dos', dir).contrasena).toBe('Vigente-2222222222');

  // Y al revés: si el principal es el más reciente, manda él.
  const dir2 = escenario(
    [fila('ficticia.dos', 'Vigente-3333333333')],
    [fila('ficticia.dos', 'Antigua-4444444444')],
    false,
  );
  expect(util.archivoVigente(dir2)).toContain('CREDENCIALES.csv');
  expect(util.cuentaDemo('ficticia.dos', dir2).contrasena).toBe('Vigente-3333333333');
});

test('una cuenta sin credencial conocida se rechaza en vez de consultarse a ciegas', async () => {
  const dir = escenario([fila('ficticia.tres', '')]);
  expect(() => util.cuentaDemo('ficticia.tres', dir)).toThrow(/no tiene credencial conocida/);
  expect(() => util.cuentaDemo('no.existe', dir)).toThrow(/no está en el archivo/);
});
