'use client';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../../lib/api';
import { fieldShellReady, prepareShell } from '../../lib/field-shell';
import { listImageryPackages, downloadImageryPackage, type ImageryPackage } from '../../lib/field-imagery';
import { FieldOfflineStore, fieldDeviceId, fieldStorageStatus, type FieldDraft, type FieldSample, type FieldSetup, type Geometry } from '../../lib/field-offline/store';

const errorText=(error:unknown)=>error instanceof Error?error.message:'No se pudo completar la acción. Lo guardado anteriormente se conserva.';
export default function FieldPage() {
  const [org,setOrg]=useState(''); const [pin,setPin]=useState(''); const [accounts,setAccounts]=useState<string[]>([]); const [account,setAccount]=useState('');
  const [store,setStore]=useState<FieldOfflineStore|null>(null);const [drafts,setDrafts]=useState<FieldDraft[]>([]);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [now,setNow]=useState(Date.now());
  const [review,setReview]=useState<{id:string;setup:FieldSetup}|null>(null);const [reviewConfirmed,setReviewConfirmed]=useState(false);
  const [shell,setShell]=useState(false);const [persistent,setPersistent]=useState(false);const [packages,setPackages]=useState<ImageryPackage[]>([]);const [packageId,setPackageId]=useState('');
  const [image,setImage]=useState<{url:string;metadata:ImageryPackage}|null>(null);const [code,setCode]=useState('');const [crop,setCrop]=useState('Cacao');const [reason,setReason]=useState('Captura de campo del productor');
  const [samples,setSamples]=useState<FieldSample[]>([]);const [file,setFile]=useState<File|undefined>(); const [mode,setMode]=useState<'Point'|'Polygon'>('Point');
  const fileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{setOrg(new URLSearchParams(location.search).get('org')??'');void FieldOfflineStore.accounts().then(ids=>{setAccounts(ids);setAccount(ids[0]??'');}).catch(e=>setNotice(errorText(e)));void fieldShellReady().then(setShell);void navigator.storage?.persisted?.().then(setPersistent);},[]);
  useEffect(()=>()=>{if(image)URL.revokeObjectURL(image.url);},[image]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),10000);return()=>clearInterval(timer);},[]);
  const refresh=(current:FieldOfflineStore)=>{setDrafts(current.drafts());const map=current.getMap();setImage(map?{url:URL.createObjectURL(map.blob),metadata:map.metadata}:null);};
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setNotice('');try{await action();}catch(e){setNotice(errorText(e));}finally{setBusy(false);}};
  async function setupOnline():Promise<FieldSetup> {
    const token=sessionStorage.getItem('tl_token');if(!token)throw new Error('Primero inicia sesión online en Terra Link y vuelve a Campo sin conexión.');
    if(!/^[0-9a-f-]{36}$/i.test(org))throw new Error('Selecciona tu organización desde el menú de Terra Link.');
    const response=await fetch(`${API_URL}/api/v1/organizations/${org}/field-offline/prepare`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({device_id:fieldDeviceId()})});
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'No se pudo autorizar la jornada. Revisa tu cuenta de productor.');return data as FieldSetup;
  }
  const prepare=()=>run(async()=>{
    const setup=await setupOnline();const current=store??await FieldOfflineStore.create(setup,pin);if(store)await current.renew(setup);
    setStore(current);setAccount(current.account);setPin('');setAccounts(await FieldOfflineStore.accounts());refresh(current);
    const status=await fieldStorageStatus();setPersistent(status.persistent);setShell(await prepareShell());
    setNotice(status.persistent?'Autorización y aplicación guardadas. Descarga la imagen de tu zona para completar la preparación.':'El navegador no concedió almacenamiento persistente. Puedes guardar, pero no garantizamos retención: instala la PWA y revisa la configuración de almacenamiento.');
    try{const available=await listImageryPackages();setPackages(available);setPackageId(available[0]?.id??'');}catch(e){setNotice(errorText(e));}
  });
  const unlock=()=>run(async()=>{const current=await FieldOfflineStore.unlock(account,pin);setStore(current);setOrg(current.setup.grant.payload.organization_id);setPin('');refresh(current);setNotice('Capturas recuperadas desde almacenamiento local.');});
  const loadPackages=()=>run(async()=>{const available=await listImageryPackages();setPackages(available);setPackageId(available[0]?.id??'');});
  const downloadMap=()=>run(async()=>{if(!store)throw new Error('Prepara o desbloquea tu cuenta.');const metadata=packages.find(p=>p.id===packageId);if(!metadata)throw new Error('Selecciona una zona disponible.');await store.saveMap(await downloadImageryPackage(metadata));refresh(store);setNotice('Imagen completa, verificada y guardada en este navegador.');});
  const acquire=()=>run(async()=>{
    if(!store)throw new Error('Prepara o desbloquea tu cuenta.');await store.writable();
    const position=await new Promise<GeolocationPosition>((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('El navegador no ofrece ubicación.'));return;}navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('No se pudo obtener ubicación. Revisa permisos y señal; tus capturas guardadas se conservan.')),{enableHighAccuracy:true,maximumAge:0,timeout:30000});});
    const sample:FieldSample={longitude:position.coords.longitude,latitude:position.coords.latitude,accuracy_m:Number.isFinite(position.coords.accuracy)?position.coords.accuracy:null,captured_at:new Date(position.timestamp).toISOString()};
    setSamples(before=>mode==='Point'?[sample]:[...before,sample]);setNotice('Ubicación obtenida. Aún no está guardada: revisa y pulsa Guardar captura local.');
  });
  const save=()=>run(async()=>{
    if(!store)throw new Error('Prepara o desbloquea tu cuenta.');if(!samples.length||(mode==='Polygon'&&samples.length<3))throw new Error('Captura un punto o al menos tres vértices para el perímetro.');
    const points=samples.map(s=>[s.longitude,s.latitude]);const geometry:Geometry=mode==='Point'?{type:'Point',coordinates:points[0]}:{type:'Polygon',coordinates:[[...points,points[0]]]};
    await store.saveCapture({plot_code:code,crop,geometry,reason,samples,file});refresh(store);setSamples([]);setFile(undefined);if(fileInput.current)fileInput.current.value='';setNotice('Captura guardada localmente y pendiente de sincronizar. Puedes cerrar y volver a abrir la PWA.');
  });
  const synchronize=()=>run(async()=>{if(!store)return;try{await store.sync(API_URL,sessionStorage.getItem('tl_token')??'');setNotice('Sincronización terminada. Revisa por separado parcelas y evidencias.');}finally{refresh(store);}});
  const expires=store?Date.parse(store.setup.grant.payload.expires_at):0;
  const ready=!!store&&shell&&persistent&&!!image&&now<expires;
  const pending=drafts.filter(d=>d.status==='PENDING').length;
  const bounds=image?.metadata.bounds??(samples.length?[samples[0].longitude-.002,samples[0].latitude-.002,samples[0].longitude+.002,samples[0].latitude+.002]:[-80.09,-1.26,-80.06,-1.23]);
  const [west,south,east,north]=bounds;const xy=(lon:number,lat:number)=>[(lon-west)/(east-west)*1000,(north-lat)/(north-south)*600];
  const scene=[...drafts.flatMap(d=>d.operation.samples),...samples];
  return <main style={{maxWidth:1000,margin:'0 auto',padding:16}}>
    <header><a href="/organizaciones">Volver a Terra Link (requiere conexión)</a><h1>Campo sin conexión</h1><p>Parcelas y evidencias de tu propia ficha. El importador multiformato conserva su flujo conectado.</p></header>
    <p role="status">{ready?'Listo para trabajar sin conexión':store?'Preparación parcial: revisa autorización, aplicación, almacenamiento e imagen. Puedes capturar sin fondo mientras la autorización esté vigente.':'Prepara tu jornada con conexión o desbloquea lo ya guardado.'}</p>
    {notice&&<p role="alert">{notice}</p>}
    <section aria-labelledby="field-prepare"><h2 id="field-prepare">1. Preparar la salida</h2>
      <label>Organización (identificador)<input value={org} onChange={e=>setOrg(e.target.value)} disabled={!!store} autoComplete="off"/></label>
      {!store&&<><label>PIN local de 8 a 12 cifras<input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value)}/></label>
      <p>No guardamos tu sesión online para usarla sin conexión. Conserva tu PIN: sin él no podremos recuperar las capturas cifradas.</p></>}
      <button disabled={busy} onClick={prepare}>{store?'Renovar jornada con conexión':'Preparar jornada con conexión'}</button>
      {!store&&accounts.length>0&&<><h3>Recuperar trabajo local</h3><label>Perfil preparado<select value={account} onChange={e=>setAccount(e.target.value)}>{accounts.map((id,index)=><option key={id} value={id}>Perfil local {index+1}</option>)}</select></label><button disabled={busy} onClick={unlock}>Desbloquear capturas con PIN</button></>}
      {store&&<><p>Productor: {store.setup.producer.producer_code}. Autorización de campo hasta {store.setup.grant.payload.expires_at}. No autoriza envíos sin sesión online.</p><p>Aplicación: {shell?'Descargada':'Pendiente'} · Almacenamiento persistente: {persistent?'Concedido':'No concedido'} · Imagen: {image?'Verificada y guardada':'No disponible'}</p>
      <button disabled={busy} onClick={loadPackages}>Consultar zonas satelitales disponibles</button>
      <label>Zona de imagen<select value={packageId} onChange={e=>setPackageId(e.target.value)}><option value="">Selecciona una zona</option>{packages.map(p=><option key={p.id} value={p.id}>{p.id} · {p.acquired_at.slice(0,10)} · {p.resolution_m} m</option>)}</select></label><button disabled={busy||!packageId} onClick={downloadMap}>Descargar imagen de la zona</button>
      {image&&<button disabled={busy} onClick={()=>run(async()=>{await store.removeMap();refresh(store);setNotice('Fondo retirado de este navegador. Las capturas y evidencias se conservan.');})}>Retirar solo el fondo descargado</button>}
      <button disabled={busy} onClick={()=>{setStore(null);setImage(null);setDrafts([]);setSamples([]);setPin('');setFile(undefined);setCode('');setReview(null);setReviewConfirmed(false);setNotice('Almacén bloqueado. Tus capturas cifradas permanecen.');}}>Bloquear trabajo local</button></>}
    </section>
    {store&&<><section aria-labelledby="field-capture"><h2 id="field-capture">2. Capturar y guardar en campo</h2>
      <label>Código de parcela<input value={code} onChange={e=>setCode(e.target.value)} list="field-plots"/></label><datalist id="field-plots">{[...new Set([...store.setup.plots.map(p=>p.plot_code),...drafts.map(d=>d.operation.plot_code)])].map(c=><option key={c} value={c}/>)}</datalist>
      <p>Para completar un punto con un perímetro, conserva exactamente el mismo código de parcela.</p><label>Cultivo<input value={crop} onChange={e=>setCrop(e.target.value)}/></label>
      <label>Tipo de captura<select value={mode} onChange={e=>{setMode(e.target.value as 'Point'|'Polygon');setSamples([]);}}><option value="Point">Punto de referencia</option><option value="Polygon">Perímetro por vértices</option></select></label>
      <button disabled={busy} onClick={acquire}>{mode==='Point'?'Obtener ubicación del punto':'Añadir vértice desde mi ubicación'}</button>
      <button disabled={busy||!samples.length} onClick={()=>setSamples(before=>before.slice(0,-1))}>Quitar última lectura no guardada</button>
      <p>El navegador elige el proveedor de ubicación; no garantiza GPS. Precisión informada por cada lectura, sin ajustar linderos al fondo.</p>
      <div aria-label="Mapa de campo descargado" style={{border:'1px solid #9aada3',background:'#eef1e6'}}>
        <svg viewBox="0 0 1000 600" role="img" aria-label={image?'Imagen satelital descargada y puntos capturados':'Sin fondo satelital; puntos capturados'} style={{width:'100%',display:'block'}}>
          {image&&<image href={image.url} x="0" y="0" width="1000" height="600" preserveAspectRatio="none"/>}
          {drafts.filter(d=>d.operation.geometry.type==='Polygon').map(d=>{const ring=(d.operation.geometry.coordinates as number[][][])[0];return <polygon key={d.operation.operation_id} points={ring.map(p=>xy(p[0],p[1]).join(',')).join(' ')} fill="#00ff9933" stroke="#ffff00" strokeWidth="3"/>;})}
          {samples.length>1&&<polyline points={samples.map(p=>xy(p.longitude,p.latitude).join(',')).join(' ')} fill="none" stroke="#ffff00" strokeWidth="3"/>}
          {scene.map((p,index)=>{const [x,y]=xy(p.longitude,p.latitude);return <circle key={index} cx={x} cy={y} r="6" fill="#ffff00" stroke="#153b2c" strokeWidth="2"/>;})}
        </svg>
      </div>
      {!image?<p>Sin imagen descargada. Puedes seguir capturando y guardando.</p>:<p>{image.metadata.synthetic?'IMAGEN SINTÉTICA DE PRUEBA. ':''}{image.metadata.source} · Adquirida {image.metadata.acquired_at.slice(0,10)} · {image.metadata.resolution_m} m/píxel. {image.metadata.license} Referencia visual, no prueba de titularidad o deforestación.</p>}
      {samples.some(p=>p.longitude<west||p.longitude>east||p.latitude<south||p.latitude>north)&&<p role="status">Las lecturas están fuera de la imagen descargada. Se pueden guardar; prepara otra zona para ver el fondo.</p>}
      <ol>{samples.map((s,i)=><li key={i}>Longitud {s.longitude}, latitud {s.latitude}; precisión {s.accuracy_m===null?'no informada':`${s.accuracy_m} m`}; {s.captured_at}</li>)}</ol>
      <label>Evidencia (PNG, JPEG o PDF, hasta 10 MB)<input ref={fileInput} type="file" accept="image/png,image/jpeg,application/pdf" onChange={e=>setFile(e.target.files?.[0])}/></label>
      <label>Motivo de captura<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button disabled={busy||!samples.length} onClick={save}>{mode==='Polygon'?'Cerrar perímetro y guardar captura local':'Guardar captura local'}</button>
    </section>
    <section aria-labelledby="field-pending"><h2 id="field-pending">3. Capturas y sincronización</h2><p>{drafts.length} capturas locales · {pending} pendientes. No borres los datos del sitio: perderías lo que no se haya enviado.</p>
      {review&&<aside><h3>Revisión de conflicto o rechazo</h3><p>Compara la propuesta en el mapa con la versión actual del servidor. Crear una nueva propuesta no la aplica: vuelve a sincronizar y el servidor comprobará permisos y versión.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(review.setup.plots.find(p=>p.plot_code===drafts.find(d=>d.operation.operation_id===review.id)?.operation.plot_code)??{estado:'No hay parcela propia con este código'},null,2)}</pre><label><input type="checkbox" checked={reviewConfirmed} onChange={e=>setReviewConfirmed(e.target.checked)}/>He revisado la versión del servidor y quiero proponer mi geometría conservando la captura original.</label><button disabled={busy||!reviewConfirmed} onClick={()=>run(async()=>{await store.proposeReviewed(review.id,review.setup);refresh(store);setReview(null);setReviewConfirmed(false);})}>Crear nueva propuesta revisada</button><button onClick={()=>setReview(null)}>Cancelar revisión</button></aside>}
      <p>Para enviar, vuelve a iniciar sesión online con la misma cuenta. No hace falta renovar la autorización de campo para enviar capturas hechas durante su vigencia.</p><a href="/">Iniciar sesión online</a><button disabled={busy} onClick={synchronize}>Sincronizar capturas guardadas</button>
      {drafts.filter(d=>['CONFLICT','REJECTED'].includes(d.status)).map(d=><button key={d.operation.operation_id} disabled={busy} onClick={()=>run(async()=>{setReview({id:d.operation.operation_id,setup:await setupOnline()});setReviewConfirmed(false);})}>Revisar captura {d.operation.plot_code} ({d.operation.operation_id.slice(0,8)}) con conexión</button>)}
      {drafts.filter(d=>d.status==='REVIEWED').map(d=><p key={d.operation.operation_id}>Captura original conservada: {d.operation.operation_id}. Nueva propuesta: {d.replacement_operation_id}.</p>)}
      {drafts.map(d=><article key={d.operation.operation_id} style={{borderBottom:'1px solid #ccd8d0',padding:8}}>
        <h3>{d.operation.plot_code} · {d.operation.geometry.type==='Point'?'Punto':'Perímetro'}</h3>
        <p>{d.status==='PENDING'?'Pendiente':d.status==='SYNCED'?'Parcela sincronizada':d.status==='REVIEWED'?'Original revisado y conservado':d.status==='CONFLICT'?'Conflicto: revisar versión del servidor':'Rechazada: revisar permisos o datos'}{d.message?` · ${d.message}`:''}</p>
        <p>Operación: {d.operation.operation_id}</p>
        {d.evidence.map(f=><p key={f.id}>Evidencia {f.name}: {f.status==='SYNCED'?'recibida por el servidor (revisión documental separada)':'pendiente; archivo conservado localmente'}</p>)}
        {d.plot_id&&<a href={`/organizaciones/${store.setup.grant.payload.organization_id}/parcelas/${d.plot_id}`}>Abrir parcela en el servidor</a>}
      </article>)}
    </section></>}
  </main>;
}
