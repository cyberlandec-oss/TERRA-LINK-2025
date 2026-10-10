// Revisión de P0-013 (catálogo de hitos CTE) sobre datos DEMO: administrador de la cooperativa (390 px y
// teclado), responsable de trazabilidad (coordinador.multi en la exportadora) y productor sin permiso.
import { join } from 'node:path';

export async function reviewCte({ browser, BASE, accounts, DEMO_ORGS, orgIdByName, shots }) {
  const acc = (local) => accounts.find((x) => x.email.startsWith(local));
  const orgOf = (part) => orgIdByName[DEMO_ORGS.find((o) => o.includes(part))];
  const loginAs = async (a, viewport = { width: 1280, height: 860 }) => {
    const ctx = await browser.newContext({ viewport, locale: 'es-EC' });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.getByLabel('Correo').fill(a.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(a.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.getByRole('heading', { level: 1, name: /organizaciones/i }).waitFor({ timeout: 15000 });
    return { ctx, page };
  };
  const inspect = async (page, org) => {
    await page.goto(`${BASE}/organizaciones/${org}/trazabilidad/hitos`);
    const table = page.getByRole('table', { name: 'Hitos de trazabilidad' });
    await table.waitFor({ timeout: 15000 });
    return {
      rows: await table.locator('tbody tr').count(),
      pending: await table.getByText('Pendiente', { exact: true }).count(),
      integrated: await table.getByText('Integrada', { exact: true }).count(),
      actions: await page.getByRole('button', { name: /cosecha|entrega|recepción|procesar|registrar/i }).count(),
      link: await page.getByRole('link', { name: 'Hitos (CTE)' }).count(),
    };
  };
  const casos = [];
  {
    const { ctx, page } = await loginAs(acc('admin.cooperativa'), { width: 390, height: 844 });
    const r = await inspect(page, orgOf('Cooperativa'));
    await page.getByLabel('Mostrar definiciones retiradas o sustituidas').focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: join(shots, 'cte--admin-390.png'), fullPage: true });
    casos.push({ cuenta: 'admin.cooperativa (390 px, teclado)', resultado: `${r.rows} hitos; pendientes=${r.pending}; integradas=${r.integrated}; botones operativos=${r.actions}; desborde=${overflow}`,
      ok: r.rows === 11 && r.pending === 11 && r.integrated === 0 && r.actions === 0 && !overflow });
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAs(acc('coordinador.multi'));
    const r = await inspect(page, orgOf('Exportadora'));
    await page.screenshot({ path: join(shots, 'cte--trazabilidad.png'), fullPage: true });
    casos.push({ cuenta: 'coordinador.multi (responsable de trazabilidad, exportadora)', resultado: `enlace=${r.link}; ${r.rows} hitos; botones operativos=${r.actions}`, ok: r.link === 1 && r.rows === 11 && r.actions === 0 });
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAs(acc('productor.cooperativa'));
    await page.goto(`${BASE}/organizaciones/${orgOf('Cooperativa')}/trazabilidad/hitos`);
    await page.getByText('Tu rol no permite consultar el catálogo de hitos de trazabilidad.').waitFor({ timeout: 15000 });
    const link = await page.getByRole('link', { name: 'Hitos (CTE)' }).count();
    await page.screenshot({ path: join(shots, 'cte--productor-sin-permiso.png'), fullPage: true });
    casos.push({ cuenta: 'productor.cooperativa (sin permiso)', resultado: `enlace=${link}; acceso directo denegado=1`, ok: link === 0 });
    await ctx.close();
  }
  return { tipo: 'cte', casos, ok: casos.every((c) => c.ok) };
}
