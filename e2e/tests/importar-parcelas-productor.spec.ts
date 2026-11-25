import { expect, test } from '@playwright/test';
import { randomBytes } from 'crypto';
import { API_URL, SUPER_EMAIL } from '../env';

// Cuenta real de prueba PRODUCER; preparación administrativa por API, recorrido por UI.
// Solo datos sintéticos en terra_link_e2e. No usa cuentas ni parcelas del despliegue.
test('PRODUCER: CSV punto → misma parcela → perímetro versionado; códigos ajenos bloqueados; 390 px', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = randomBytes(5).toString('hex');
  async function api(path: string, token = '', method = 'GET', body?: unknown) {
    const response = await fetch(`${API_URL}${path}`, { method,
      headers: { 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
    const value = await response.json();
    expect(response.status, `${method} ${path}`).toBeLessThan(300);
    return value;
  }
  const superToken = (await api('/api/v1/auth/login','','POST',{email:SUPER_EMAIL,password:process.env.E2E_SUPER_PASSWORD})).access_token;
  const org = (await api('/api/v1/organizations',superToken,'POST',{name:`GIS productor ${suffix}`,organization_type:'COOPERATIVE',country:'EC'})).id;
  const base = `/api/v1/organizations/${org}`;
  async function account(role: string, actor: string) {
    const email = `${role.toLowerCase()}-gis-${suffix}@e2e.local`;
    const password = randomBytes(15).toString('base64url');
    const invitation = await api(`${base}/invitations`,actor,'POST',{email,role_code:role});
    await api('/api/v1/invitations/accept','','POST',{token:invitation.token,first_name:'Persona',last_name:'Sintética',password});
    return { email, token:(await api('/api/v1/auth/login','','POST',{email,password})).access_token as string };
  }
  const admin = await account('ORG_ADMIN',superToken);
  const producer = await account('PRODUCER',admin.token);
  const members = await api(`${base}/members`,admin.token);
  const membership = (Array.isArray(members) ? members : members.members).find((m: {email:string}) => m.email === producer.email).membership_id;
  const own = await api(`${base}/producers`,admin.token,'POST',{producer_code:'GIS-OWN-PROD',legal_name:'Finca propia sintética'});
  const other = await api(`${base}/producers`,admin.token,'POST',{producer_code:'GIS-OTHER-PROD',legal_name:'Finca ajena sintética'});
  await api(`${base}/producers/${own.id}/self-membership`,admin.token,'PUT',{expected_version:own.row_version,membership_id:membership,reason:'Preparación sintética del recorrido PRODUCER'});
  const otherPlot = await api(`${base}/plots`,admin.token,'POST',{producer_id:other.id,plot_code:'GIS-OTHER-PLOT',crop:'Cacao'});
  const ctx = await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(token => sessionStorage.setItem('tl_token',token),producer.token);
  const page = await ctx.newPage();
  const route = `/organizaciones/${org}/importar-parcelas`;
  await page.goto(`/organizaciones/${org}/parcelas`);
  await page.getByRole('button',{name:'Menú',exact:true}).click();
  await page.getByRole('link',{name:'Importar parcelas',exact:true}).click();
  await page.getByLabel('Archivo de parcelas').setInputFiles({name:'punto.csv',mimeType:'text/csv',buffer:Buffer.from('codigo_parcela;cultivo;longitud;latitud\nGIS-OWN-PLOT;Cacao;-80,1;-1,2\n')});
  await page.getByRole('button',{name:'Identificar archivo'}).click();
  await expect(page.getByText('Importación para tu propia ficha',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Código de productor',{exact:true})).toHaveCount(0);
  await page.getByLabel('CRS de origen (código EPSG)').fill('EPSG:4326');
  await page.getByRole('button',{name:'Convertir y revisar'}).click();
  await expect(page.getByText('Punto de referencia · Perímetro pendiente',{exact:true})).toBeVisible();
  expect((await api(`${base}/plots`,producer.token)).items).toHaveLength(0);
  await page.getByLabel('Motivo de la importación o corrección').fill('Referencia inicial sintética del productor');
  await page.getByRole('button',{name:'Confirmar importación',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Importación guardada'})).toBeVisible();
  await page.getByRole('link',{name:'GIS-OWN-PLOT',exact:true}).click();
  await expect(page.getByRole('heading',{name:'GIS-OWN-PLOT',exact:true})).toBeVisible();
  const plotId = new URL(page.url()).pathname.split('/').pop()!;
  const initial = await api(`${base}/plots/${plotId}`,producer.token);
  expect(initial.producer.id).toBe(own.id);
  expect(initial.current_version.geometry_type).toBe('POINT');
  expect(initial.current_version.area_calculated_ha).toBeNull();
  await page.screenshot({path:testInfo.outputPath('producer-punto-390.png'),fullPage:true});

  const polygon = {type:'Polygon',coordinates:[[[-80.101,-1.201],[-80.099,-1.201],[-80.099,-1.199],[-80.101,-1.199],[-80.101,-1.201]]]};
  await page.goto(route);
  await page.getByLabel('Archivo de parcelas').setInputFiles({name:'perimetro.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify({type:'Feature',properties:{codigo_parcela:'GIS-OWN-PLOT',cultivo:'Cacao'},geometry:polygon}))});
  await page.getByRole('button',{name:'Identificar archivo'}).click();
  await page.getByRole('button',{name:'Convertir y revisar'}).click();
  await expect(page.getByRole('table',{name:'Parcelas de la importación'})).toContainText('Se actualizará');
  await page.getByLabel('Motivo de la importación o corrección').fill('Completar el perímetro sintético de mi parcela');
  const confirm = page.getByRole('button',{name:'Confirmar importación',exact:true});
  await expect(confirm).toBeDisabled();
  await page.getByRole('checkbox',{name:/He revisado los cambios/}).check();
  await confirm.click();
  await expect(page.getByRole('heading',{name:'Importación guardada'})).toBeVisible();
  await page.getByRole('link',{name:'GIS-OWN-PLOT',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/parcelas/${plotId}$`));
  const completed = await api(`${base}/plots/${plotId}`,producer.token);
  expect(completed.producer.id).toBe(own.id);
  expect(completed.current_version.geometry_type).toBe('POLYGON');
  expect(Number(completed.current_version.area_calculated_ha)).toBeGreaterThan(0);
  const versions = await api(`${base}/plots/${plotId}/geometry-versions`,producer.token);
  expect(versions).toHaveLength(2);
  expect(versions.map((v:{geometry_type:string})=>v.geometry_type).sort()).toEqual(['POINT','POLYGON']);
  expect((await api(`${base}/plots`,producer.token)).items.map((p:{id:string})=>p.id)).toEqual([plotId]);
  await page.screenshot({path:testInfo.outputPath('producer-perimetro-390.png'),fullPage:true});

  await page.goto(route);
  await page.getByLabel('Archivo de parcelas').setInputFiles({name:'ajena.csv',mimeType:'text/csv',buffer:Buffer.from('codigo_parcela;codigo_productor;cultivo;longitud;latitud\nGIS-ATTACK;GIS-OTHER-PROD;Cacao;-80,1;-1,2\n')});
  await page.getByRole('button',{name:'Identificar archivo'}).click();
  await page.getByLabel('CRS de origen (código EPSG)').fill('EPSG:4326');
  const previewResponse = page.waitForResponse(r=>r.url().endsWith('/preview') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Convertir y revisar'}).click();
  const response = await previewResponse;
  const preview = await response.json();
  expect(preview.can_commit).toBe(false);
  expect(preview.rows[0].errors).toContain('PRODUCER_NOT_AVAILABLE');
  await page.getByLabel('Motivo de la importación o corrección').fill('Intento negativo sintético de asociación ajena');
  await expect(page.getByRole('button',{name:'Confirmar importación',exact:true})).toBeDisabled();
  // El servidor rechaza también el POST forjado, no solo el botón deshabilitado.
  const rejected = await fetch(response.url().replace(/\/preview$/,'/confirm'),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${producer.token}`},body:JSON.stringify({operation_id:crypto.randomUUID(),plan_hash:preview.plan_hash,reason:'Sondeo negativo sintético'})});
  expect(rejected.status).toBe(409);
  const forbidden = await fetch(`${API_URL}${base}/plots/${otherPlot.id}`,{headers:{authorization:`Bearer ${producer.token}`}});
  expect(forbidden.status).toBe(404);
  expect((await api(`${base}/plots/${otherPlot.id}`,admin.token)).producer.id).toBe(other.id);
  expect((await api(`${base}/plots`,producer.token)).items.map((p:{id:string})=>p.id)).toEqual([plotId]);
  await page.screenshot({path:testInfo.outputPath('producer-ajena-bloqueada-390.png'),fullPage:true});
  await ctx.close();
});
