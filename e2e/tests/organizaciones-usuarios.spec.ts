import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomBytes } from 'crypto';
import { SUPER_EMAIL } from '../env';

// Recorrido P0-001 + P0-002 en navegador real: login, selección, creación, invitación y aceptación,
// edición, errores de autorización, suspensión/reactivación y desactivación de un miembro.
test.describe.configure({ mode: 'serial' });

const ADMIN = { email: 'admin@e2e.local', first: 'Ana', last: 'Admin', password: randomBytes(12).toString('base64url') };
const TECH = { email: 'tecnico@e2e.local', first: 'Tomás', last: 'Técnico', password: randomBytes(12).toString('base64url') };

async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Organizaciones' })).toBeVisible();
}

async function inviteAndGetLink(page: Page, email: string, roleLabel: string): Promise<string> {
  await page.getByLabel('Correo', { exact: true }).last().fill(email);
  await page.getByLabel('Rol').selectOption({ label: roleLabel });
  await page.getByRole('button', { name: 'Generar enlace de invitación' }).click();
  await expect(page.getByText('Enlace secreto de un solo uso.')).toBeVisible();
  return page.getByLabel('Enlace de invitación').inputValue();
}

async function acceptInvitation(browser: Browser, link: string, who: typeof ADMIN) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByText('Te invitaron a')).toBeVisible();
  // El token se retira de la barra de direcciones al leerlo.
  expect(page.url()).not.toContain('token=');
  await page.getByLabel('Nombre').fill(who.first);
  await page.getByLabel('Apellido').fill(who.last);
  await page.getByLabel('Contraseña (mínimo 12 caracteres)').fill(who.password);
  await page.getByLabel('Repite la contraseña').fill(who.password);
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByRole('heading', { name: 'Asociación E2E' })).toBeVisible();
  return { ctx, page };
}

let superPage: Page;
let orgAUrl: string;
let orgBUrl: string;
let adminPage: Page;
let techPage: Page;
let adminLink: string;

test('login con credenciales incorrectas muestra error recuperable', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Correo').fill(SUPER_EMAIL);
  await page.getByLabel('Contraseña').fill('incorrecta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.locator('.error[role="alert"]')).toContainText('Email o contraseña incorrectos.');
});

test('SUPER_ADMIN crea organizaciones e invita al administrador', async ({ browser }) => {
  superPage = await (await browser.newContext()).newPage();
  await login(superPage, SUPER_EMAIL, process.env.E2E_SUPER_PASSWORD!);
  for (const name of ['Asociación E2E', 'Exportadora Ajena']) {
    await superPage.getByLabel('Nombre').fill(name);
    await superPage.getByLabel('Tipo (código, p. ej. ASSOCIATION, EXPORTER)').fill('ASSOCIATION');
    await superPage.getByRole('button', { name: 'Crear organización' }).click();
    await expect(superPage.getByRole('link', { name })).toBeVisible();
  }
  await superPage.getByRole('link', { name: 'Exportadora Ajena' }).click();
  await expect(superPage.getByRole('heading', { name: 'Exportadora Ajena' })).toBeVisible();
  orgBUrl = superPage.url();
  await superPage.goto('/organizaciones');
  await superPage.getByRole('link', { name: 'Asociación E2E' }).click();
  await expect(superPage.getByRole('heading', { name: 'Asociación E2E' })).toBeVisible();
  orgAUrl = superPage.url();
  adminLink = await inviteAndGetLink(superPage, ADMIN.email, 'Administrador de organización');
  expect(adminLink).toMatch(/\/invitacion#token=[A-Za-z0-9_-]{43}$/);
});

test('el administrador acepta, selecciona su organización y edita la configuración', async ({ browser }) => {
  ({ page: adminPage } = await acceptInvitation(browser, adminLink, ADMIN));
  await adminPage.goto('/organizaciones');
  await expect(adminPage.getByRole('link', { name: 'Asociación E2E' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Exportadora Ajena' })).toHaveCount(0);
  await adminPage.getByRole('link', { name: 'Asociación E2E' }).click();
  await adminPage.getByLabel('Provincia').fill('Manabí');
  await adminPage.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(adminPage.getByText('Cambios guardados.')).toBeVisible();
});

test('un enlace ya usado muestra el motivo y cómo continuar', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(adminLink);
  await expect(page.locator('.error[role="alert"]')).toContainText('ya fue utilizada');
});

test('un miembro sin permiso ve la organización en solo lectura y no accede a otra', async ({ browser }) => {
  const link = await inviteAndGetLink(adminPage, TECH.email, 'Técnico de campo');
  ({ page: techPage } = await acceptInvitation(browser, link, TECH));
  await expect(techPage.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
  await expect(techPage.getByText('Razón social')).toBeVisible();
  await techPage.goto(orgBUrl);
  await expect(techPage.locator('.error[role="alert"]')).toContainText('no existe o no está disponible');
});

test('suspensión bloquea cambios con aviso; reactivación los restablece', async () => {
  await superPage.goto(orgAUrl);
  await superPage.getByLabel('Motivo (queda en la auditoría)').last().fill('Revisión documental');
  await superPage.getByRole('button', { name: 'Suspender' }).click();
  await expect(superPage.getByRole('heading', { name: 'Reactivar organización' })).toBeVisible();

  await adminPage.goto(orgAUrl);
  await expect(adminPage.getByText('Organización suspendida: Revisión documental')).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  await expect(adminPage.getByText('no se pueden invitar ni modificar miembros')).toBeVisible();

  await superPage.getByLabel('Motivo (queda en la auditoría)').last().fill('Documentos completos');
  await superPage.getByRole('button', { name: 'Reactivar' }).click();
  await expect(superPage.getByRole('heading', { name: 'Suspender organización' })).toBeVisible();

  await adminPage.reload();
  await adminPage.getByLabel('Cantón').fill('Portoviejo');
  await adminPage.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(adminPage.getByText('Cambios guardados.')).toBeVisible();
});

test('desactivar a un miembro corta su acceso de inmediato', async () => {
  const row = adminPage.getByRole('list', { name: 'Miembros' }).getByRole('listitem').filter({ hasText: TECH.email });
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await row.getByLabel('Motivo (queda en la auditoría)').fill('Fin de temporada');
  await row.getByRole('button', { name: 'Confirmar desactivación' }).click();
  await expect(adminPage.getByRole('list', { name: 'Miembros' }).getByRole('listitem').filter({ hasText: TECH.email })).toContainText('Desactivado');

  await techPage.goto(orgAUrl);
  await expect(techPage.locator('.error[role="alert"]')).toContainText('no existe o no está disponible');
});
