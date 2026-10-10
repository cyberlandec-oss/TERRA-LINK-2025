import { expect, test, type Browser } from '@playwright/test';
import { randomBytes } from 'crypto';
import { API_URL, SUPER_EMAIL } from '../env';

// P0-011 UI-09 Productos en navegador: catálogo de la organización con estados y unidades de la API.
test.describe.configure({ mode: 'serial' });

const ADMIN = { email: 'admin-productos@e2e.local', password: randomBytes(12).toString('base64url') };
const BUYER = { email: 'comprador-productos@e2e.local', password: randomBytes(12).toString('base64url') };
let token: string;
let orgUrl: string;

async function open(browser: Browser, t = token, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  await ctx.addInitScript((tk) => sessionStorage.setItem('tl_token', tk), t);
  const page = await ctx.newPage();
  return { ctx, page };
}

test('preparación: organización y administrador', async ({ browser }) => {
  const sp = await (await browser.newContext()).newPage();
  await sp.goto('/');
  await sp.getByLabel('Correo').fill(SUPER_EMAIL);
  await sp.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_SUPER_PASSWORD!);
  await sp.getByRole('button', { name: 'Iniciar sesión' }).click();
  await sp.getByLabel('Nombre').fill('Cooperativa Productos');
  await sp.getByLabel('Tipo de organización (catálogo provisional, no concede permisos)').selectOption({ label: 'Cooperativa' });
  await sp.getByRole('button', { name: 'Crear organización' }).click();
  await sp.getByRole('link', { name: 'Cooperativa Productos' }).click();
  await sp.getByRole('link', { name: 'Incorporar administrador' }).click();
  await sp.getByLabel('Correo', { exact: true }).last().fill(ADMIN.email);
  await sp.getByLabel('Rol').selectOption({ label: 'Administrador de organización' });
  await sp.getByRole('button', { name: 'Generar enlace de invitación' }).click();
  const link = await sp.getByLabel('Enlace de invitación').inputValue();

  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  await page.getByLabel('Nombre').fill('Pablo');
  await page.getByLabel('Apellido').fill('Productos');
  await page.getByLabel('Contraseña (mínimo 12 caracteres)').fill(ADMIN.password);
  await page.getByLabel('Repite la contraseña').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByRole('link', { name: 'Productos', exact: true })).toBeVisible();
  orgUrl = page.url().split('/organizaciones/')[0] + '/organizaciones/' + page.url().split('/organizaciones/')[1].split('/')[0];
  token = (await page.evaluate(() => sessionStorage.getItem('tl_token')))!;
});

test('catálogo vacío, alta con opciones de la API y código duplicado con el formulario conservado', async ({ browser }) => {
  const { ctx, page } = await open(browser);
  await page.goto(`${orgUrl}/productos`);
  await expect(page.getByText('Aún no hay productos en el catálogo.')).toBeVisible();
  await expect(page.getByText(/no define conversiones entre unidades/)).toBeVisible();
  const add = async (code: string, name: string, state: string) => {
    await page.getByLabel('Código', { exact: true }).fill(code);
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByLabel('Estado o presentación', { exact: true }).last().selectOption({ label: state });
    await expect(page.getByLabel('Unidad de medida')).toHaveValue('KG'); // única unidad del catálogo
    await page.getByRole('button', { name: 'Registrar producto' }).click();
  };
  await add('CACAO_SECO', 'Cacao seco', 'Cacao seco');
  await expect(page.getByText('Producto CACAO_SECO registrado.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Productos' })).toContainText('Kilogramo (kg, masa)');
  await add('CACAO_SECO', 'Otro nombre', 'Cacao en baba');
  await expect(page.getByText('Ya existe un producto con ese código en tu organización.')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Otro nombre'); // captura conservada
  await page.getByLabel('Buscar por código, nombre o variedad').fill('inexistente');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('No encontramos productos con estos filtros.')).toBeVisible();
  await ctx.close();
});

test('edición concurrente en dos pestañas: conflicto con el borrador conservado', async ({ browser }) => {
  const { ctx, page } = await open(browser);
  await page.goto(`${orgUrl}/productos`);
  await page.getByRole('link', { name: 'CACAO_SECO' }).click();
  await expect(page.getByRole('heading', { name: /CACAO_SECO/ })).toBeVisible();
  const tab2 = await ctx.newPage();
  await tab2.goto(page.url());
  await tab2.getByLabel('Variedad (opcional)').fill('Nacional');
  await tab2.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(tab2.getByText('Cambios guardados.')).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('Cacao seco en grano');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText(/Otra persona modificó este producto/)).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Cacao seco en grano');
  await page.getByRole('button', { name: 'Recargar versión actual' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Historial del producto' })).toContainText('Edición');
  await ctx.close();
});

test('desactivar con confirmación que explica efectos; 390 px y teclado', async ({ browser }) => {
  const { ctx, page } = await open(browser, token, { width: 390, height: 844 });
  await page.goto(`${orgUrl}/productos`);
  await page.getByRole('link', { name: 'CACAO_SECO' }).click();
  await page.getByLabel('Motivo').fill('Fin de temporada');
  await page.getByRole('button', { name: 'Desactivar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Los registros históricos que lo usen se conservan sin cambios/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar desactivación' }).click();
  await expect(page.getByText('Inactivo: Fin de temporada')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await ctx.close();
});

test('usuario sin permiso: sin enlace en el menú y acceso directo denegado', async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const orgId = orgUrl.split('/organizaciones/')[1];
  const inv = await page.request.post(`${API_URL}/api/v1/organizations/${orgId}/invitations`, { headers: { authorization: `Bearer ${token}` }, data: { email: BUYER.email, role_code: 'BUYER' } });
  expect(inv.status()).toBe(201);
  const accept = await page.request.post(`${API_URL}/api/v1/invitations/accept`, { data: { token: (await inv.json()).token, first_name: 'Bruno', last_name: 'Comprador', password: BUYER.password } });
  expect(accept.status()).toBe(200);
  await ctx.close();
  const bctx = await browser.newContext();
  const bp = await bctx.newPage();
  await bp.goto('/');
  await bp.getByLabel('Correo').fill(BUYER.email);
  await bp.getByLabel('Contraseña', { exact: true }).fill(BUYER.password);
  await bp.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(bp.getByRole('heading', { level: 1, name: /organizaciones/i })).toBeVisible();
  await bp.goto(`${orgUrl}/productos`);
  await expect(bp.getByText('Tu rol no permite consultar el catálogo de productos.')).toBeVisible();
  await expect(bp.getByRole('link', { name: 'Productos', exact: true })).toHaveCount(0);
  await bctx.close();
});

test('P0-013 hitos (CTE): consulta de solo lectura con versión, vigencia e integración pendiente; sin acciones operativas', async ({ browser }) => {
  const { ctx, page } = await open(browser, token, { width: 390, height: 844 });
  await page.goto(`${orgUrl}/trazabilidad/hitos`);
  const table = page.getByRole('table', { name: 'Hitos de trazabilidad' });
  await expect(table.locator('tbody tr')).toHaveCount(11);
  await expect(page.getByText(/Catálogo versión 1\.0\.0/)).toBeVisible();
  await expect(table).toContainText('DELIVERY@1');
  await expect(table).toContainText('DeliveryRegistered');
  await expect(page.getByText(/0 operación\(es\) integrada\(s\) y 11 pendiente\(s\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: /cosecha|entrega|recepción|procesar|registrar/i })).toHaveCount(0);
  await page.getByLabel('Mostrar definiciones retiradas o sustituidas').press('Space');
  await expect(table.locator('tbody tr')).toHaveCount(11); // sin retiradas en 1.0.0
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await ctx.close();
});
