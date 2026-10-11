// Revisión de P0-021 sobre el recorrido DEMO (Cooperativa): administración (responsable de la mitigación abierta de
// LOT-2026-00002: puede aportar soporte; no se entrega ni se decide sobre datos DEMO), auditor (390 px, teclado; lectura) y
// gerente (sin acceso). No registra soportes, entregas ni decisiones.
import { join } from 'node:path';

export async function reviewMitigations({ browser, BASE, accounts, DEMO_ORGS, orgIdByName, shots }) {
  const acc = (local) => accounts.find((x) => x.email.startsWith(local));
  const coop = orgIdByName[DEMO_ORGS.find((o) => o.includes('Cooperativa'))];
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
  const open = async (page) => {
    await page.goto(`${BASE}/organizaciones/${coop}/mitigaciones`);
    await page.getByRole('table', { name: 'Mitigaciones' }).waitFor({ timeout: 15000 });
    await page.getByRole('link', { name: /Completar el origen de ENT-2026-00002/ }).first().click();
    await page.getByRole('heading', { name: 'Caso y acción' }).waitFor({ timeout: 15000 });
    return page.locator('main').innerText();
  };
  const casos = [];
  {
    const { ctx, page } = await loginAs(acc('admin.cooperativa'));
    const text = await open(page);
    const addSupport = await page.getByRole('button', { name: 'Aportar soporte' }).count();
    await page.screenshot({ path: join(shots, 'mitigaciones--admin.png'), fullPage: true });
    const ok = text.includes('DATA_MISSING_ORIGIN') && text.includes('Abierta (sin entrega)') && text.includes('Quien ejecuta no verifica') && addSupport === 1;
    casos.push({ cuenta: 'admin.cooperativa (responsable)', resultado: `causa y evaluación de origen visibles; abierta sin entregas; aviso de separación de funciones; puede aportar soporte=${addSupport}`, ok });
    await ctx.close();
  }
  {
    const a = acc('auditor.cooperativa');
    if (a) {
      const { ctx, page } = await loginAs(a, { width: 390, height: 844 });
      await open(page);
      const forms = await page.getByRole('button', { name: /Aportar soporte|Entregar|Verificar|Rechazar/ }).count();
      await page.keyboard.press('Tab');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      await page.screenshot({ path: join(shots, 'mitigaciones--auditor-390.png'), fullPage: true });
      casos.push({ cuenta: 'auditor.cooperativa (390 px, teclado)', resultado: `lectura sin acciones (${forms}); desborde=${overflow}`, ok: forms === 0 && !overflow });
      await ctx.close();
    }
  }
  {
    const m = acc('coordinador.multi');
    if (m) {
      const { ctx, page } = await loginAs(m);
      await page.goto(`${BASE}/organizaciones/${coop}/mitigaciones`);
      await page.waitForLoadState('networkidle');
      const denied = /no permite consultar mitigaciones/.test(await page.locator('main').innerText());
      casos.push({ cuenta: 'coordinador.multi (MANAGER)', resultado: `acceso denegado=${denied}`, ok: denied });
      await ctx.close();
    }
  }
  return { tipo: 'mitigaciones', casos, ok: casos.every((c) => c.ok) };
}
