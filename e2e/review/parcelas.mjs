// Revisión de P0-006 Parcelas en navegador: administrador, técnico asignado, técnico NO asignado (abre una
// parcela ajena por id directo), usuario con dos organizaciones, teclado y 390 px. Datos DEMO sintéticos.
import { join } from 'node:path';

export async function reviewPlots({ browser, BASE, accounts, DEMO_ORGS, orgIdByName, shots }) {
  const acc = (local, orgPart) => accounts.find((x) => x.email.startsWith(local) && x.organizacion.includes(orgPart));
  const coopId = orgIdByName[DEMO_ORGS.find((o) => o.includes('Cooperativa'))];
  const exportId = orgIdByName[DEMO_ORGS.find((o) => o.includes('Exportadora'))];
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
  const plotRows = async (page, orgId) => {
    await page.goto(`${BASE}/organizaciones/${orgId}/parcelas`);
    await page.getByRole('table', { name: 'Parcelas' }).or(page.getByText(/Aún no hay parcelas|aún no tienen parcelas/)).first().waitFor({ timeout: 15000 });
    return page.locator('tbody tr').allInnerTexts();
  };
  const casos = [];

  // Administrador: todas las parcelas; ficha con geometría; teclado; vuelta al productor.
  {
    const { ctx, page } = await loginAs(acc('admin.cooperativa', 'Cooperativa'));
    const rows = await plotRows(page, coopId);
    await page.screenshot({ path: join(shots, 'parcelas--admin-listado.png'), fullPage: true });
    await page.getByRole('link', { name: /DEMO-PAR-001/ }).click();
    await page.getByRole('heading', { name: /DEMO-PAR-001/ }).waitFor();
    await page.getByRole('table', { name: 'Versiones geométricas' }).waitFor();
    const sketch = await page.getByRole('img', { name: /Esquema de DEMO-PAR-001/ }).count();
    const coords = await page.getByRole('table', { name: 'Coordenadas (WGS84)' }).locator('tbody tr').count();
    const versions = await page.getByRole('table', { name: 'Versiones geométricas' }).locator('tbody tr').count();
    const forbiddenButtons = await page.getByRole('button', { name: /GPS|Importar|Analizar/ }).count();
    const captureButton = await page.getByRole('button', { name: 'Capturar ubicación' }).count();
    await page.getByRole('button', { name: 'Capturar ubicación' }).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // llegar por teclado activa :focus-visible
    const captureFocus = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    await page.screenshot({ path: join(shots, 'parcelas--admin-ficha-poligono.png'), fullPage: true });
    await page.getByLabel('Nombre (opcional)').focus();
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    await page.getByRole('link', { name: /DEMO-RV-001/ }).first().click();
    await page.getByRole('list', { name: 'Parcelas del productor' }).waitFor();
    const back = await page.getByRole('list', { name: 'Parcelas del productor' }).getByRole('listitem').count();
    casos.push({ cuenta: 'admin.cooperativa', resultado: `${rows.length} parcelas; ficha: esquema=${sketch}, ${coords} coordenadas, ${versions} versiones, botones GPS/importación=${forbiddenButtons}, «Capturar ubicación»=${captureButton} (foco ${captureFocus}); foco campo=${outline}; productor→parcelas=${back}`,
      ok: rows.length === 6 && sketch === 1 && coords === 5 && versions === 2 && forbiddenButtons === 0 && captureButton === 1 && captureFocus === 'solid' && outline === 'solid' && back === 2 });
    await ctx.close();
  }

  // Técnico asignado: solo parcelas de sus productores; guarda la URL de una para el no asignado.
  let foreignPlotUrl = null;
  {
    const { ctx, page } = await loginAs(acc('tecnico1.cooperativa', 'Cooperativa'));
    const rows = await plotRows(page, coopId);
    await page.getByRole('link', { name: /DEMO-PAR-002/ }).click();
    await page.getByRole('heading', { name: /DEMO-PAR-002/ }).waitFor();
    await page.getByRole('button', { name: 'Guardar cambios' }).waitFor();
    foreignPlotUrl = page.url();
    const canEdit = await page.getByRole('button', { name: 'Guardar cambios' }).count();
    const pointArea = await page.getByText('No aplica: un punto no tiene superficie').count();
    const capture = await page.getByRole('button', { name: 'Capturar ubicación' }).count();
    await page.screenshot({ path: join(shots, 'parcelas--tecnico1-ficha-punto.png'), fullPage: true });
    casos.push({ cuenta: 'tecnico1.cooperativa (asignado)', resultado: `${rows.length} parcelas visibles; puede editar=${canEdit}; punto sin superficie calculada=${pointArea}; «Capturar ubicación»=${capture}`,
      ok: rows.length === 5 && !rows.some((r) => r.includes('DEMO-PAR-005')) && canEdit === 1 && pointArea === 1 && capture === 1 });
    await ctx.close();
  }

  // Técnico NO asignado: conocer el id/URL no da acceso.
  {
    const { ctx, page } = await loginAs(acc('tecnico2.cooperativa', 'Cooperativa'));
    const rows = await plotRows(page, coopId);
    await page.goto(foreignPlotUrl);
    await page.locator('.error[role="alert"]').or(page.getByRole('heading', { name: /DEMO-PAR-002/ })).first().waitFor({ timeout: 15000 });
    const text = await page.locator('main').innerText();
    const denied = /no está disponible|no existe/i.test(text) && !text.includes('Loma alta');
    await page.screenshot({ path: join(shots, 'parcelas--tecnico2-id-ajeno.png'), fullPage: true });
    casos.push({ cuenta: 'tecnico2.cooperativa (no asignado)', resultado: `${rows.length} parcela(s) propias; DEMO-PAR-002 por URL directa: ${denied ? 'no disponible, sin datos' : 'INESPERADO'}`,
      ok: rows.length === 1 && rows[0].includes('DEMO-PAR-005') && denied });
    await ctx.close();
  }

  // Auditor de la cooperativa: lee parcelas pero NO recibe coordenadas exactas (clasificación de geometría).
  {
    const auditor = acc('auditor.cooperativa', 'Cooperativa');
    if (auditor) {
      const { ctx, page } = await loginAs(auditor);
      const rows = await plotRows(page, coopId);
      await page.getByRole('link', { name: /DEMO-PAR-001/ }).click();
      await page.getByRole('heading', { name: /DEMO-PAR-001/ }).waitFor();
      await page.getByRole('table', { name: 'Versiones geométricas' }).waitFor();
      const text = await page.locator('main').innerText();
      const noCoords = !text.includes('-80.16') && (await page.getByRole('table', { name: 'Coordenadas (WGS84)' }).count()) === 0;
      const notice = await page.getByText('Tu rol no tiene acceso a las coordenadas exactas').count();
      const capture = await page.getByRole('button', { name: 'Capturar ubicación' }).count();
      const api = await page.evaluate(async (url) => {
        const id = url.split('/').pop();
        const org = url.split('/organizaciones/')[1].split('/')[0];
        const t = sessionStorage.getItem('tl_token');
        const r = await fetch(`http://localhost:4000/api/v1/organizations/${org}/plots/${id}/geometry-versions`, { headers: { authorization: `Bearer ${t}` } });
        return JSON.stringify(await r.json());
      }, page.url());
      await page.screenshot({ path: join(shots, 'parcelas--auditor-sin-coordenadas.png'), fullPage: true });
      casos.push({ cuenta: 'auditor.cooperativa (sin geometría exacta)', resultado: `${rows.length} parcelas; coordenadas en pantalla=${!noCoords}; aviso=${notice}; «Capturar ubicación»=${capture}; respuesta API con coordenadas=${api.includes('coordinates') || api.includes('-80.16')}`,
        ok: rows.length === 6 && noCoords && notice === 1 && capture === 0 && !api.includes('coordinates') && !api.includes('-80.16') });
      await ctx.close();
    }
  }

  // Usuario con dos organizaciones: roles y datos de cada una por separado.
  {
    const { ctx, page } = await loginAs(acc('coordinador.multi', 'Cooperativa'));
    const coop = await plotRows(page, coopId);
    const exp = await plotRows(page, exportId);
    const emptyExport = await page.getByText('Aún no hay parcelas registradas.').count();
    casos.push({ cuenta: 'coordinador.multi', resultado: `cooperativa (Supervisor): ${coop.length} parcelas; exportadora (Trazabilidad): ${exp.length} filas, vacío autorizado=${emptyExport}`,
      ok: coop.length === 6 && exp.length === 0 && emptyExport === 1 });
    await ctx.close();
  }

  // 390 px: ficha de parcela sin desbordamiento horizontal.
  {
    const { ctx, page } = await loginAs(acc('tecnico1.cooperativa', 'Cooperativa'), { width: 390, height: 844 });
    await plotRows(page, coopId);
    await page.getByRole('link', { name: /DEMO-PAR-001/ }).click();
    await page.getByRole('table', { name: 'Versiones geométricas' }).waitFor();
    await page.getByRole('button', { name: 'Capturar ubicación' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: join(shots, 'movil--parcela-ficha.png'), fullPage: true });
    casos.push({ cuenta: 'tecnico1.cooperativa (390 px)', resultado: `desbordamiento horizontal en la ficha=${overflow}`, ok: !overflow });
    await ctx.close();
  }

  return { tipo: 'parcelas', casos, ok: casos.every((c) => c.ok) };
}
