import { expect, test } from '@playwright/test';
import { randomBytes, randomUUID } from 'crypto';
import { API_URL, SUPER_EMAIL } from '../env';

// AJ-08: cómo se MUESTRAN en la evaluación de riesgo los análisis satelitales como insumo (los que entraron y los que hay ahora). El lote, la parcela y la evaluación son
// reales (API); la sección satelital se completa interceptando la respuesta del navegador con la forma del contrato, porque crear resultados satelitales exige el corredor
// y un proveedor. La lógica de frescura y de instantánea está probada con base real en `test/satelite-riesgo-expediente.int-spec.ts`.
test.describe.configure({ mode: 'serial' });

const ADMIN = { email: 'admin-risksat@e2e.local', password: randomBytes(12).toString('base64url') };
let orgId = ''; let lotId = ''; let token = '';
const today = new Date().toISOString().slice(0, 10);

async function api(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${API_URL}${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(body?.error?.code)}`);
  return body;
}

test('preparación: organización, lote con parcela de origen y una evaluación', async () => {
  const superTok = (await api('/api/v1/auth/login', { method: 'POST', body: { email: SUPER_EMAIL, password: process.env.E2E_SUPER_PASSWORD } })).access_token;
  orgId = (await api('/api/v1/organizations', { method: 'POST', token: superTok, body: { name: 'Cooperativa Riesgo Satelital', organization_type: 'COOPERATIVE', country: 'EC' } })).id;
  const inv = await api(`/api/v1/organizations/${orgId}/invitations`, { method: 'POST', token: superTok, body: { email: ADMIN.email, role_code: 'ORG_ADMIN' } });
  await api('/api/v1/invitations/accept', { method: 'POST', body: { token: inv.token, first_name: 'Admin', last_name: 'Riesgo', password: ADMIN.password } });
  token = (await api('/api/v1/auth/login', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } })).access_token;
  const b = `/api/v1/organizations/${orgId}`;
  const producer = (await api(`${b}/producers`, { method: 'POST', token, body: { producer_code: 'RS-1', legal_name: 'Finca Riesgo Satelital (sintética)' } })).id;
  const plot = (await api(`${b}/plots`, { method: 'POST', token, body: { producer_id: producer, plot_code: 'RS-1-P1', crop: 'Cacao' } })).id;
  await api(`${b}/plots/${plot}/geometry-versions`, { method: 'POST', token, body: { expected_version: 1, survey_method: 'MANUAL_COORDINATES', geometry: { type: 'Point', coordinates: [-80.1601, -0.8479] }, area_declared_ha: 2 } });
  const product = (await api(`${b}/products`, { method: 'POST', token, body: { code: 'CACAO_BABA', name: 'Cacao en baba', product_state: 'CACAO_BABA', unit: 'KG' } })).id;
  const centro = (await api(`${b}/locations`, { method: 'POST', token, body: { code: 'CRS', name: 'Centro riesgo satelital', location_type: 'COLLECTION_CENTER' } })).id;
  const d = (await api(`${b}/deliveries`, { method: 'POST', token, body: { operation_id: randomUUID(), producer_id: producer, product_id: product, delivery_date: today, quantity_declared: '60', unit: 'KG', origins: [{ plot_id: plot }], register: true } })).delivery;
  const r = (await api(`${b}/deliveries/${d.id}/receptions`, { method: 'POST', token, body: { operation_id: randomUUID(), location_id: centro, received_at: new Date().toISOString(), weighing: { method: 'B', quantity: '60', unit: 'KG', weighed_on: today } } })).reception_id;
  lotId = (await api(`${b}/lots`, { method: 'POST', token, body: { operation_id: randomUUID(), inputs: [{ reception_id: r, quantity: '60' }] } })).lot.id;
  await api(`${b}/risk/lots/${lotId}/evaluations`, { method: 'POST', token, body: { operation_id: randomUUID() } });
});

const sat = (over: Record<string, unknown> = {}) => ({ plot_code: 'RS-1-P1', provider_code: 'WHISP', is_synthetic: false, coverage_status: 'UNKNOWN', analysis_date: '2026-06-11T01:59:15.000Z', method: 'Whisp API 2.3.1', raw_sha256: 'c'.repeat(64), ...over });

async function abrir(browser: import('@playwright/test').Browser, satellite_inputs: unknown) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((t) => { sessionStorage.setItem('tl_token', t); localStorage.setItem('tl_lang', 'es'); }, token);
  const page = await ctx.newPage();
  await page.route(new RegExp(`/risk/lots/${lotId}$`), async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    if (j.latest) j.latest.satellite_inputs = satellite_inputs;
    await route.fulfill({ response: r, json: j });
  });
  await page.goto(`/organizaciones/${orgId}/riesgo/${lotId}`);
  return { ctx, page };
}

test('un análisis llegó después de evaluar: se avisa, se distinguen «incluidos» y «disponibles ahora», con cobertura declarada, fecha y huella; nada se presenta como favorable', async ({ browser }) => {
  const { ctx, page } = await abrir(browser, { in_evaluation: [], now: [sat()], changed_since_evaluation: true, note: 'Un análisis satelital es un insumo con límites declarados por el proveedor: no es una conclusión de deforestación ni de cumplimiento.' });
  const sec = page.locator('section[aria-labelledby="rk-sat"]');
  await expect(sec.getByRole('heading', { name: 'Análisis satelitales de origen' })).toBeVisible();
  await expect(sec).toContainText('Hay análisis satelitales que esta evaluación no incluye');
  await expect(sec.getByRole('list', { name: 'Incluidos en esta evaluación' })).toHaveCount(0);       // vacío: «Ninguno.»
  await expect(sec.getByRole('list', { name: 'Disponibles ahora' })).toContainText('WHISP');
  await expect(sec.getByRole('list', { name: 'Disponibles ahora' })).toContainText('cobertura no declarada');
  await expect(sec.getByRole('list', { name: 'Disponibles ahora' })).toContainText('fecha declarada 2026-06-11');
  await expect(sec).toContainText('no es una conclusión de deforestación ni de cumplimiento');
  expect(await sec.innerText()).not.toMatch(/sin deforestación|cumple|favorable/i);
  await ctx.close();
});

test('un resultado sintético se rotula ENSAYO; sin análisis la sección no aparece', async ({ browser }) => {
  const a = await abrir(browser, { in_evaluation: [], now: [sat({ provider_code: 'FIXTURE_SYNTHETIC', is_synthetic: true, coverage_status: 'COVERED' })], changed_since_evaluation: true, note: 'x' });
  await expect(a.page.locator('section[aria-labelledby="rk-sat"]')).toContainText('ENSAYO (sintético)');
  await a.ctx.close();
  const b = await abrir(browser, { in_evaluation: [], now: [], changed_since_evaluation: false, note: 'x' });
  await expect(b.page.getByRole('heading', { name: /Hallazgos técnicos/ })).toBeVisible();
  await expect(b.page.locator('section[aria-labelledby="rk-sat"]')).toHaveCount(0);
  await b.ctx.close();
});
