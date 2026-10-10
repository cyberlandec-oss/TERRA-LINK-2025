// Revisión de P0-012 sobre el recorrido DEMO (Cooperativa): administrador (entrega con soporte y recepción parcial),
// técnico asignado (390 px: su borrador, sin recibir), operador de recepción (teclado: revisión previa visible, sin
// identidad del productor). No confirma recepciones nuevas sobre los datos DEMO (solo abre la revisión).
import { join } from 'node:path';

export async function reviewDeliveries({ browser, BASE, accounts, DEMO_ORGS, orgIdByName, shots }) {
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
  const list = async (page) => {
    await page.goto(`${BASE}/organizaciones/${coop}/entregas`);
    await page.getByRole('table', { name: 'Entregas' }).or(page.getByText('Aún no hay entregas a tu alcance.')).first().waitFor({ timeout: 15000 });
  };
  const casos = [];
  {
    const { ctx, page } = await loginAs(acc('admin.cooperativa'));
    await list(page);
    await page.getByRole('row', { name: /DEMO-RV-001/ }).getByRole('link').first().click();
    await page.getByRole('heading', { name: /Entrega ENT-/ }).waitFor({ timeout: 15000 });
    const text = await page.locator('main').innerText();
    await page.screenshot({ path: join(shots, 'entregas--admin-detalle.png'), fullPage: true });
    const ok = text.includes('Mes: septiembre de 2026') && text.includes('Nota de entrega o recibo firmado') && text.includes('Recepción parcial') && text.includes('Pendiente de evaluación') && /no es un expediente completo/.test(text);
    casos.push({ cuenta: 'admin.cooperativa', resultado: `periodo por mes sin días; soporte vinculado (sin aprobar); recepción parcial; calidad pendiente; aviso de no conformidad=${ok}`, ok });
    await ctx.close();
  }
  {
    const { ctx, page } = await loginAs(acc('tecnico1.cooperativa'), { width: 390, height: 844 });
    await list(page);
    const rows = await page.getByRole('table', { name: 'Entregas' }).locator('tbody tr').allInnerTexts();
    const onlyAssigned = rows.length > 0 && rows.every((r) => !r.includes('DEMO-RV-005'));
    await page.getByRole('row', { name: /DEMO-RV-002/ }).getByRole('link').first().click();
    await page.getByRole('heading', { name: /Entrega ENT-/ }).waitFor({ timeout: 15000 });
    const receive = await page.getByRole('button', { name: 'Revisar recepción' }).count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: join(shots, 'entregas--tecnico1-390.png'), fullPage: true });
    casos.push({ cuenta: 'tecnico1.cooperativa (390 px)', resultado: `solo entregas de productores asignados=${onlyAssigned}; borrador visible; puede recibir=${receive}; desborde=${overflow}`, ok: onlyAssigned && receive === 0 && !overflow });
    await ctx.close();
  }
  {
    const rec = acc('recepcion.acopio');
    if (rec) {
      const { ctx, page } = await loginAs(rec);
      await list(page);
      await page.getByRole('row', { name: /DEMO-RV-005/ }).getByRole('link').first().click();
      await page.getByRole('heading', { name: /Entrega ENT-/ }).waitFor({ timeout: 15000 });
      const text = await page.locator('main').innerText();
      const noIdentity = text.includes('identidad no visible para tu rol');
      await page.getByLabel('Peso recibido (kg)').fill('1');
      await page.getByLabel('Método de pesaje').fill('Revisión DEMO (no se confirma)');
      await page.getByRole('button', { name: 'Revisar recepción' }).focus();
      await page.keyboard.press('Enter');
      const review = await page.getByText('Revisa antes de confirmar').count();
      await page.screenshot({ path: join(shots, 'entregas--recepcion-revision.png'), fullPage: true });
      await page.getByRole('button', { name: 'Volver a editar' }).click(); // no se registra nada sobre los datos DEMO
      casos.push({ cuenta: 'recepcion.acopio (membresía en la Cooperativa, teclado)', resultado: `origen faltante y periodo desconocido visibles=${text.includes('Origen faltante') && text.includes('Desconocido (declarado')}; sin identidad del productor=${noIdentity}; revisión previa con Enter=${review === 1}`,
        ok: noIdentity && review === 1 && text.includes('Origen faltante') });
      await ctx.close();
    }
  }
  return { tipo: 'entregas', casos, ok: casos.every((c) => c.ok) };
}
