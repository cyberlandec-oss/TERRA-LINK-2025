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
  // Recorrido completo (idempotente: si ya se recorrió, solo comprueba el resultado). Cambia datos DEMO: soporte, entrega,
  // verificación y una nueva evaluación de riesgo. No se aportan ni inventan datos de origen: la causa debe seguir visible.
  {
    const { ctx, page } = await loginAs(acc('admin.cooperativa'));
    let text = await open(page);
    let steps = 'ya entregada';
    if (text.includes('Abierta (sin entrega)')) {
      await page.getByLabel('Versión de documento').selectOption({ index: 1 });
      await page.getByRole('button', { name: 'Aportar soporte' }).click();
      await page.getByRole('list', { name: 'Soportes de la mitigación' }).getByText('Entrega 1').first().waitFor({ timeout: 15000 });
      const stillOpen = (await page.locator('main').innerText()).includes('Abierta (sin entrega)');
      await page.getByLabel('Nota de entrega').fill('Soporte documental DEMO aportado; el origen de ENT-2026-00002 sigue sin identificarse.');
      await page.getByRole('button', { name: 'Entregar para verificación' }).click();
      await page.getByText('Entregada: pendiente de verificación').first().waitFor({ timeout: 15000 });
      steps = `soporte aportado (sigue abierta tras adjuntar=${stillOpen}) y entregada`;
      text = await page.locator('main').innerText();
    }
    await page.screenshot({ path: join(shots, 'mitigaciones--admin.png'), fullPage: true });
    const ok = text.includes('DATA_MISSING_ORIGIN') && text.includes('Quien ejecuta no verifica') && !steps.includes('=false');
    casos.push({ cuenta: 'admin.cooperativa (ejecutor/responsable)', resultado: steps, ok });
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAs(acc('eudr.cooperativa'));
    let text = await open(page);
    let step = 'ya decidida';
    if (text.includes('Entregada: pendiente de verificación')) {
      await page.getByLabel('Motivo de la decisión').fill('Soporte de la entrega revisado por una segunda persona; la causa de origen se reevalúa.');
      await page.getByRole('button', { name: 'Verificar' }).focus();
      await page.keyboard.press('Enter');
      await page.getByText(/Verificada \(entrega 1\)/).first().waitFor({ timeout: 15000 });
      step = 'verificada por la segunda persona';
    }
    // Reevaluación asíncrona por el worker del outbox (sin forzarla desde la interfaz).
    let reev = '';
    for (let i = 0; i < 30; i++) {
      await page.reload();
      await page.getByRole('heading', { name: 'Caso y acción' }).waitFor({ timeout: 15000 });
      const m = (await page.locator('main').innerText()).match(/Evaluación (\d+) registrada|Cubierta por la evaluación (\d+)/);
      if (m) { reev = m[1] ?? m[2]; break; }
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: join(shots, 'mitigaciones--verificador.png'), fullPage: true });
    casos.push({ cuenta: 'eudr.cooperativa (verificador distinto)', resultado: `${step}; reevaluación por outbox → evaluación ${reev || 'PENDIENTE'}`, ok: !!reev && (await page.locator('main').innerText()).includes('Verificada') });
    await page.goto(`${BASE}/organizaciones/${coop}/riesgo`);
    await page.getByRole('table', { name: 'Riesgo por lote' }).locator('tbody tr').filter({ hasText: 'LOT-2026-00002' }).first().getByRole('link').first().click();
    await page.getByRole('heading', { name: /Riesgo del lote LOT-2026-00002/ }).waitFor({ timeout: 15000 });
    const rk = await page.locator('main').innerText();
    await page.screenshot({ path: join(shots, 'mitigaciones--riesgo-reevaluado.png'), fullPage: true });
    const current = rk.match(/Evaluación (\d+)\n/)?.[1];
    const dq = (await page.getByRole('list', { name: 'No evaluable o faltante' }).innerText().catch(() => '')) + (await page.getByRole('list', { name: 'Hallazgos técnicos' }).innerText().catch(() => ''));
    const ok = current === reev && rk.includes('Indeterminada') && dq.includes('DATA_MISSING_ORIGIN') && rk.includes('sin aprobar');
    casos.push({ cuenta: 'eudr.cooperativa (riesgo tras reevaluar)', resultado: `evaluación vigente ${current}; conclusión Indeterminada; DATA_MISSING_ORIGIN sigue visible=${dq.includes('DATA_MISSING_ORIGIN')}; reglas sin aprobar`, ok });
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
