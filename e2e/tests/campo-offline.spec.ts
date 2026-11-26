import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { randomBytes, createHash, createHmac } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { API_URL, WEB_URL, SUPER_EMAIL } from '../env';

test('PWA PRODUCER: sesión vencida, reapertura persistente, punto → perímetro, evidencia y respuesta perdida; 390 px',async({},info)=>{
  test.setTimeout(240000);
  const suffix=randomBytes(5).toString('hex');
  async function api(path:string,token='',method='GET',body?:unknown){
    const r=await fetch(API_URL+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    expect(r.status,`${method} ${path}`).toBeLessThan(300);return r.json();
  }
  const superToken=(await api('/api/v1/auth/login','','POST',{email:SUPER_EMAIL,password:process.env.E2E_SUPER_PASSWORD})).access_token;
  const org=(await api('/api/v1/organizations',superToken,'POST',{name:`PWA sintética ${suffix}`,organization_type:'COOPERATIVE',country:'EC'})).id;
  const base=`/api/v1/organizations/${org}`;
  async function actor(role:string,by:string){const email=`${role}-${suffix}@e2e.local`;const password=randomBytes(18).toString('base64url');const inv=await api(base+'/invitations',by,'POST',{email,role_code:role});await api('/api/v1/invitations/accept','','POST',{token:inv.token,first_name:'Campo',last_name:'Sintético',password});return {email,password,token:(await api('/api/v1/auth/login','','POST',{email,password})).access_token};}
  const admin=await actor('ORG_ADMIN',superToken);const producer=await actor('PRODUCER',admin.token);
  const members=await api(base+'/members',admin.token);const member=(Array.isArray(members)?members:members.members).find((m:{email:string})=>m.email===producer.email.toLowerCase());
  const own=await api(base+'/producers',admin.token,'POST',{producer_code:'PWA-OWN',legal_name:'Productor sintético PWA'});
  await api(`${base}/producers/${own.id}/self-membership`,admin.token,'PUT',{expected_version:own.row_version,membership_id:member.membership_id,reason:'Preparación de prueba PWA'});
  // Imagen mínima SINTÉTICA, explícitamente etiquetada: el recorrido no depende de servicios externos.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n1sAAAAASUVORK5CYII=','base64');
  const manifest={packages:[{id:'synthetic-pwa',bounds:[-80.09,-1.26,-80.06,-1.23],acquired_at:'2025-09-25T00:00:00Z',source:'Fixture sintética E2E, no imagen satelital real',license:'Datos sintéticos',resolution_m:10,sha256:createHash('sha256').update(png).digest('hex'),image_url:'/offline/synthetic-pwa.png',bytes:png.length,synthetic:true}]};
  const directory=await mkdtemp(join(tmpdir(),'tl-field-pwa-'));let ctx:BrowserContext|undefined;
  async function launch(offline=false){
    ctx=await chromium.launchPersistentContext(directory,{headless:true,baseURL:WEB_URL,viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{longitude:-80.078,latitude:-1.244,accuracy:4},offline});
    await ctx.route('**/offline/manifest.json',r=>r.fulfill({json:manifest,headers:{'access-control-allow-origin':'*'}}));
    await ctx.route('**/offline/synthetic-pwa.png',r=>r.fulfill({body:png,contentType:'image/png',headers:{'access-control-allow-origin':'*'}}));
    return ctx.pages()[0]??await ctx.newPage();
  }
  try{
    let page=await launch();await page.goto(`/campo-offline?org=${org}`);
    const cdp=await ctx!.newCDPSession(page);await cdp.send('Browser.grantPermissions',{origin:WEB_URL,permissions:['durableStorage','geolocation']});
    expect(await page.evaluate(()=>navigator.storage.persist())).toBe(true);
    await page.evaluate(token=>sessionStorage.setItem('tl_token',token),producer.token);
    await page.getByLabel('PIN local').fill('73918264');await page.getByRole('button',{name:'Preparar jornada con conexión',exact:true}).click();
    await expect(page.getByText('Aplicación: Descargada',{exact:false})).toBeVisible({timeout:60000});
    await page.getByRole('button',{name:'Descargar imagen de la zona',exact:true}).click();
    await expect(page.getByText('Listo para trabajar sin conexión',{exact:true})).toBeVisible();
    // JWT de prueba acortado, misma firma/claims: la configuración de producción no cambia.
    const [header,payload]=producer.token.split('.');const claims=JSON.parse(Buffer.from(payload,'base64url').toString());claims.exp=Math.floor(Date.now()/1000)-1;
    const value=header+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');const expired=value+'.'+createHmac('sha256',process.env.JWT_SECRET!).update(value).digest('base64url');
    expect((await fetch(API_URL+'/api/v1/me',{headers:{authorization:`Bearer ${expired}`}})).status).toBe(401);
    await page.evaluate(token=>sessionStorage.setItem('tl_token',token),expired);await ctx!.setOffline(true);
    await page.getByLabel('Código de parcela',{exact:true}).fill('PWA-JOURNEY');await page.getByRole('button',{name:'Obtener ubicación del punto',exact:true}).click();
    await page.getByLabel('Evidencia (PNG').setInputFiles({name:'campo-sintetico.png',mimeType:'image/png',buffer:png});
    await page.getByRole('button',{name:'Guardar captura local',exact:true}).click();await expect(page.getByText('1 capturas locales',{exact:false})).toBeVisible();
    await ctx!.close();page=await launch(true);await page.goto('/campo-offline');
    await page.getByLabel('PIN local').fill('00000000');await page.getByRole('button',{name:'Desbloquear capturas con PIN'}).click();await expect(page.getByRole('alert').filter({hasText:'PIN incorrecto'})).toBeVisible();
    await page.getByLabel('PIN local').fill('73918264');await page.getByRole('button',{name:'Desbloquear capturas con PIN'}).click();
    await expect(page.getByText('PWA-JOURNEY · Punto',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'Imagen satelital descargada y puntos capturados'})).toBeVisible();
    await page.getByLabel('Código de parcela',{exact:true}).fill('PWA-JOURNEY');await page.getByLabel('Tipo de captura').selectOption('Polygon');
    for(const [longitude,latitude] of [[-80.078,-1.244],[-80.077,-1.244],[-80.077,-1.243]]){await ctx!.setGeolocation({longitude,latitude,accuracy:5});await page.getByRole('button',{name:'Añadir vértice desde mi ubicación'}).click();await expect(page.getByRole('button',{name:'Añadir vértice desde mi ubicación'})).toBeEnabled();}
    await page.getByRole('button',{name:'Cerrar perímetro y guardar captura local'}).click();await expect(page.getByText('2 capturas locales',{exact:false})).toBeVisible();
    await ctx!.close();page=await launch(true);await page.goto('/campo-offline');await page.getByLabel('PIN local').fill('73918264');await page.getByRole('button',{name:'Desbloquear capturas con PIN'}).click();await expect(page.getByText('2 capturas locales',{exact:false})).toBeVisible();
    await ctx!.setOffline(false);await page.evaluate(token=>sessionStorage.setItem('tl_token',token),producer.token);
    let lost=false;await ctx!.route('**/field-offline/sync',async route=>{if(!lost){lost=true;const r=await route.fetch();expect(r.status()).toBe(201);await route.abort('failed');}else await route.continue();});
    await page.getByRole('button',{name:'Sincronizar capturas guardadas'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('2 pendientes.',{exact:false})).toBeVisible();
    await ctx!.unroute('**/field-offline/sync');await page.getByRole('button',{name:'Sincronizar capturas guardadas'}).click();
    await expect(page.getByText('Parcela sincronizada',{exact:true})).toHaveCount(2,{timeout:30000});await expect(page.getByText(/Evidencia campo-sintetico.png: recibida/)).toBeVisible();
    const plots=await api(base+'/plots',producer.token);expect(plots.items).toHaveLength(1);const id=plots.items[0].id;expect(await api(`${base}/plots/${id}/geometry-versions`,producer.token)).toHaveLength(2);
    await page.screenshot({path:info.outputPath('pwa-campo-recuperada-390.png'),fullPage:true});
    await page.getByRole('button',{name:'Retirar solo el fondo descargado'}).click();await ctx!.setOffline(true);
    await page.getByLabel('Código de parcela',{exact:true}).fill('PWA-NO-BACKGROUND');await page.getByLabel('Tipo de captura').selectOption('Point');
    await page.getByRole('button',{name:'Obtener ubicación del punto',exact:true}).click();
    // Fallo de cuota inyectado: demuestra atomicidad, no una medición de disco real.
    await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){IDBObjectStore.prototype.put=original;throw new DOMException('Cuota de prueba','QuotaExceededError');};});
    await page.getByRole('button',{name:'Guardar captura local',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Tus borradores anteriores se conservan'})).toBeVisible();await expect(page.getByText('2 capturas locales',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Guardar captura local',exact:true}).click();await expect(page.getByText('3 capturas locales',{exact:false})).toBeVisible();
    await ctx!.close();page=await launch(true);await page.goto('/campo-offline');await page.getByLabel('PIN local').fill('73918264');await page.getByRole('button',{name:'Desbloquear capturas con PIN'}).click();await expect(page.getByText('3 capturas locales',{exact:false})).toBeVisible();await expect(page.getByText('Sin imagen descargada. Puedes seguir capturando y guardando.',{exact:true})).toBeVisible();
    await ctx!.setOffline(false);await page.evaluate(token=>sessionStorage.setItem('tl_token',token),producer.token);await page.getByRole('button',{name:'Sincronizar capturas guardadas'}).click();await expect(page.getByText('Parcela sincronizada',{exact:true})).toHaveCount(3);expect((await api(base+'/plots',producer.token)).items).toHaveLength(2);
    await page.getByLabel('Código de parcela',{exact:true}).fill('PWA-NO-BACKGROUND');await page.getByRole('button',{name:'Obtener ubicación del punto',exact:true}).click();await page.getByRole('button',{name:'Guardar captura local',exact:true}).click();await expect(page.getByText('4 capturas locales',{exact:false})).toBeVisible();
    const current=(await api(base+'/plots',producer.token)).items.find((p:{plot_code:string})=>p.plot_code==='PWA-NO-BACKGROUND');
    await api(`${base}/plots/${current.id}`,admin.token,'PATCH',{expected_version:current.row_version,name:'Cambio concurrente sintético'});
    await page.getByRole('button',{name:'Sincronizar capturas guardadas'}).click();await expect(page.getByText(/Conflicto: revisar versión del servidor/)).toBeVisible();
    await page.getByRole('button',{name:/Revisar captura PWA-NO-BACKGROUND/}).click();await expect(page.getByRole('button',{name:'Crear nueva propuesta revisada'})).toBeDisabled();
    await page.getByRole('checkbox',{name:/He revisado la versión del servidor/}).check();await page.getByRole('button',{name:'Crear nueva propuesta revisada'}).click();await expect(page.getByText(/Captura original conservada:/)).toBeVisible();
    await page.getByRole('button',{name:'Sincronizar capturas guardadas'}).click();await expect(page.getByText('Parcela sincronizada',{exact:true})).toHaveCount(4);
    const second=await ctx!.newPage();await second.goto('/campo-offline');await second.getByLabel('PIN local').fill('73918264');await second.getByRole('button',{name:'Desbloquear capturas con PIN'}).click();await expect(second.getByText('5 capturas locales',{exact:false})).toBeVisible();
    await page.getByLabel('Código de parcela',{exact:true}).fill('PWA-CAS-1');await page.getByRole('button',{name:'Obtener ubicación del punto',exact:true}).click();await page.getByRole('button',{name:'Guardar captura local',exact:true}).click();await expect(page.getByText('6 capturas locales',{exact:false})).toBeVisible();
    await second.getByLabel('Código de parcela',{exact:true}).fill('PWA-CAS-2');await second.getByRole('button',{name:'Obtener ubicación del punto',exact:true}).click();await second.getByRole('button',{name:'Guardar captura local',exact:true}).click();await expect(second.getByRole('alert').filter({hasText:'Otra pestaña modificó el trabajo local'})).toBeVisible();
    await second.close();
  }finally{await ctx?.close();await rm(directory,{recursive:true,force:true});}
});
