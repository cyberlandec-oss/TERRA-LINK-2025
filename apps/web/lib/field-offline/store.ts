import type { DownloadedImagery, ImageryPackage } from '../field-imagery';

export interface FieldGrantPayload { id:string;user_id:string;organization_id:string;device_id:string;server_device_id:string;producer_id:string;issued_at:string;expires_at:string;permissions:string[] }
export interface FieldGrant {payload:FieldGrantPayload;signature:string;public_key:JsonWebKey}
export interface FieldPlot {id:string;plot_code:string;crop:string;row_version:number;geometry:Geometry|null}
export interface FieldSetup {grant:FieldGrant;producer:{id:string;producer_code:string};plots:FieldPlot[]}
export interface Geometry {type:'Point'|'Polygon'|'MultiPolygon';coordinates:unknown}
export interface FieldSample {longitude:number;latitude:number;accuracy_m:number|null;captured_at:string}
export interface FieldOperation {operation_id:string;grant_id:string;plot_code:string;crop:string;base_version:number|null;previous_operation_id?:string;geometry:Geometry;captured_at:string;reason:string;samples:FieldSample[]}
export interface FieldEvidence {id:string;name:string;mime:string;data:string;status:'PENDING'|'SYNCED'|'REJECTED';message?:string;document_id?:string}
export interface FieldDraft {operation:FieldOperation;status:'PENDING'|'SYNCED'|'CONFLICT'|'REJECTED'|'REVIEWED';message?:string;plot_id?:string;row_version?:number;replacement_operation_id?:string;evidence:FieldEvidence[]}
interface Snapshot {setup:FieldSetup;drafts:FieldDraft[];last_seen:number;map?:{metadata:ImageryPackage;data:string}}
interface Vault {id:string;salt:string;iv:string;data:ArrayBuffer;revision:number}
const DB='terra-link-field-offline-v1';
const DEVICE='tl.field.device';
const ITERATIONS=600000;
const encode=(bytes:Uint8Array)=>{let result='';for(const byte of bytes)result+=String.fromCharCode(byte);return btoa(result);};
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const fieldAccount=(setup:FieldSetup)=>`${setup.grant.payload.user_id}:${setup.grant.payload.organization_id}`;
export function fieldDeviceId():string {let id=localStorage.getItem(DEVICE);if(!id){id=crypto.randomUUID();localStorage.setItem(DEVICE,id);}return id;}

async function database():Promise<IDBDatabase> {
  if(!window.isSecureContext || !crypto.subtle || !window.indexedDB)throw new Error('Necesitas HTTPS (o localhost), WebCrypto y almacenamiento IndexedDB.');
  return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('vaults',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('No se pudo abrir el almacenamiento de campo. Lo guardado no se borró.'));});
}
async function readVault(id:string):Promise<Vault|undefined> {const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('vaults','readonly');const req=tx.objectStore('vaults').get(id);req.onsuccess=()=>resolve(req.result as Vault|undefined);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
async function writeVault(vault:Vault,expected:number):Promise<void> {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('vaults','readwrite');const object=tx.objectStore('vaults');const read=object.get(vault.id);let stale=false;
    read.onsuccess=()=>{if((read.result?.revision??0)!==expected){stale=true;tx.abort();return;}try{object.put(vault);}catch{tx.abort();}};
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error(stale?'Otra pestaña modificó el trabajo local. Bloquea y vuelve a desbloquear antes de continuar; no se sobrescribieron capturas.':'No se pudo guardar: falta espacio o el navegador bloqueó el almacenamiento. Tus borradores anteriores se conservan.'));};
  });
}
async function derive(pin:string,salt:Uint8Array):Promise<CryptoKey> {const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:salt as Uint8Array<ArrayBuffer>,iterations:ITERATIONS},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}

export async function verifyFieldGrant(setup:FieldSetup,device:string,now=Date.now(),checkExpiry=true):Promise<void> {
  const {payload:p,signature,public_key}=setup.grant;
  if(p.device_id!==device || p.producer_id!==setup.producer.id || !p.user_id || !p.organization_id || !p.permissions.includes('plot:create_own') || !p.permissions.includes('plot:update_own'))throw new Error('La autorización no corresponde a este productor y dispositivo.');
  const from=Date.parse(p.issued_at),until=Date.parse(p.expires_at);
  if(!Number.isFinite(from)||!Number.isFinite(until)||until<=from||until-from>24*3600000||from>now+60000)throw new Error('La autorización de campo no es válida.');
  const key=await crypto.subtle.importKey('jwk',public_key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(signature),new TextEncoder().encode(JSON.stringify(p))))throw new Error('No se pudo verificar la firma de la autorización de campo.');
  if(checkExpiry&&now>=until)throw new Error('Venció la autorización de campo. Lo guardado permanece; prepara otra jornada con conexión.');
}

export class FieldOfflineStore {
  private serial:Promise<unknown>=Promise.resolve();
  private constructor(readonly account:string,private readonly key:CryptoKey,private readonly salt:string,private state:Snapshot,private revision=0) {}
  static async accounts():Promise<string[]> {const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('vaults','readonly');const request=tx.objectStore('vaults').getAllKeys();request.onsuccess=()=>resolve(request.result.map(String));request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();});}
  static async create(setup:FieldSetup,pin:string):Promise<FieldOfflineStore> {
    if(!/^\d{8,12}$/.test(pin))throw new Error('Usa un PIN de 8 a 12 cifras para proteger tus capturas.');
    await verifyFieldGrant(setup,fieldDeviceId());
    const account=fieldAccount(setup);
    if(await readVault(account))throw new Error('Esta cuenta ya tiene trabajo local. Desbloquéalo para renovar sin perder capturas.');
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const store=new FieldOfflineStore(account,await derive(pin,salt),encode(salt),{setup,drafts:[],last_seen:Date.now()});
    await store.persist(store.state);return store;
  }
  static async unlock(account:string,pin:string):Promise<FieldOfflineStore> {
    const vault=await readVault(account);if(!vault)throw new Error('No hay una preparación guardada para esta cuenta.');
    const key=await derive(pin,decode(vault.salt));
    let state:Snapshot;
    try {state=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(vault.iv),additionalData:new TextEncoder().encode(account)},key,vault.data))) as Snapshot;}
    catch {throw new Error('PIN incorrecto o almacenamiento dañado. No se borró ninguna captura.');}
    if(fieldAccount(state.setup)!==account)throw new Error('El almacén no corresponde a esta cuenta.');
    await verifyFieldGrant(state.setup,fieldDeviceId(),Date.now(),false);
    const store=new FieldOfflineStore(account,key,vault.salt,state,vault.revision??0);
    return store;
  }
  private async persist(next:Snapshot) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(this.account)},this.key,new TextEncoder().encode(JSON.stringify(next)));
    await writeVault({id:this.account,salt:this.salt,iv:encode(iv),data,revision:this.revision+1},this.revision);this.revision++;
  }
  private mutate(fn:(next:Snapshot)=>void):Promise<void> {
    const work=this.serial.then(async()=>{const next=structuredClone(this.state);fn(next);await this.persist(next);this.state=next;});
    this.serial=work.catch(()=>undefined);return work;
  }
  get setup():FieldSetup{return structuredClone(this.state.setup);}
  drafts():FieldDraft[]{return structuredClone(this.state.drafts);}
  async writable():Promise<void>{if(Date.now()+60000<this.state.last_seen)throw new Error('La hora del dispositivo retrocedió. Reconecta para revalidar; tus capturas permanecen.');await verifyFieldGrant(this.state.setup,fieldDeviceId());}
  async renew(setup:FieldSetup):Promise<void>{if(fieldAccount(setup)!==this.account)throw new Error('La sesión online pertenece a otra cuenta.');await verifyFieldGrant(setup,fieldDeviceId());await this.mutate(next=>{next.setup=setup;next.last_seen=Math.max(Date.now(),next.last_seen);});}
  async proposeReviewed(id:string,reviewedSetup:FieldSetup):Promise<void>{
    if(fieldAccount(reviewedSetup)!==this.account)throw new Error('La revisión pertenece a otra cuenta.');await verifyFieldGrant(reviewedSetup,fieldDeviceId());
    await this.mutate(next=>{
      const original=next.drafts.find(d=>d.operation.operation_id===id);if(!original||!['CONFLICT','REJECTED'].includes(original.status))throw new Error('Esta captura no necesita una nueva propuesta.');
      const current=reviewedSetup.plots.find(p=>p.plot_code===original.operation.plot_code);const replacement=crypto.randomUUID();
      const operation:FieldOperation={...original.operation,operation_id:replacement,grant_id:reviewedSetup.grant.payload.id,base_version:current?.row_version??null,captured_at:new Date().toISOString(),reason:`Revisión explícita de captura ${id}: ${original.operation.reason}`.slice(0,500)};
      delete operation.previous_operation_id;
      original.status='REVIEWED';original.replacement_operation_id=replacement;
      next.drafts.push({operation,status:'PENDING',evidence:structuredClone(original.evidence)});next.setup=reviewedSetup;next.last_seen=Math.max(next.last_seen,Date.now());
    });
  }
  async saveCapture(input:{plot_code:string;crop:string;geometry:Geometry;reason:string;samples:FieldSample[];file?:File}):Promise<string> {
    await this.writable();
    if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(input.plot_code)||!input.crop.trim()||input.reason.trim().length<3)throw new Error('Completa código, cultivo y motivo.');
    const point=input.geometry.type==='Point';
    const validPosition=(p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
    if(point&&!validPosition(input.geometry.coordinates))throw new Error('El punto no contiene longitud y latitud válidas.');
    const ring=(input.geometry.coordinates as number[][][])[0];
    if(!point&&(!Array.isArray(ring)||ring.length<4||JSON.stringify(ring[0])!==JSON.stringify(ring[ring.length-1])))throw new Error('El perímetro necesita tres vértices y cierre explícito.');
    if(!point&&(!ring.every(validPosition)||ring.length>5000))throw new Error('Revisa las coordenadas y el límite de 5.000 vértices.');
    if(input.samples.some(s=>!validPosition([s.longitude,s.latitude])||!Number.isFinite(Date.parse(s.captured_at))||(s.accuracy_m!==null&&(!Number.isFinite(s.accuracy_m)||s.accuracy_m<0))))throw new Error('Revisa las lecturas de ubicación y su precisión.');
    if(input.file&&(!['image/png','image/jpeg','application/pdf'].includes(input.file.type)||input.file.size>10*1024*1024))throw new Error('Adjunta PNG, JPEG o PDF de hasta 10 MB.');
    const evidence:FieldEvidence[]=input.file?[{id:crypto.randomUUID(),name:input.file.name,mime:input.file.type,data:encode(new Uint8Array(await input.file.arrayBuffer())),status:'PENDING'}]:[];
    const id=crypto.randomUUID();
    await this.mutate(next=>{
      const previous=[...next.drafts].reverse().find(d=>d.operation.plot_code===input.plot_code);
      const existing=next.setup.plots.find(p=>p.plot_code===input.plot_code);
      if(previous&&['CONFLICT','REJECTED'].includes(previous.status))throw new Error('Resuelve primero la captura anterior de esta parcela.');
      const operation:FieldOperation={operation_id:id,grant_id:next.setup.grant.payload.id,plot_code:input.plot_code,crop:input.crop.trim(),geometry:input.geometry,reason:input.reason.trim(),samples:input.samples,captured_at:new Date().toISOString(),base_version:previous?.row_version??existing?.row_version??null,...(previous?{previous_operation_id:previous.operation.operation_id}:{})};
      next.drafts.push({operation,status:'PENDING',evidence});next.last_seen=Math.max(Date.now(),next.last_seen);
    });return id;
  }
  async saveMap(image:DownloadedImagery):Promise<void>{await this.writable();const data=encode(new Uint8Array(await image.blob.arrayBuffer()));await this.mutate(next=>{next.map={metadata:image.metadata,data};});}
  async removeMap():Promise<void>{await this.mutate(next=>{delete next.map;});}
  getMap():DownloadedImagery|null {const map=this.state.map;return map?{metadata:structuredClone(map.metadata),blob:new Blob([decode(map.data)],{type:'image/png'})}:null;}
  async sync(apiBase:string,token:string):Promise<void> {
    if(!token)throw new Error('Inicia sesión con conexión antes de sincronizar. Lo guardado permanece.');
    const org=this.state.setup.grant.payload.organization_id;
    const me=await fetch(`${apiBase}/api/v1/me`,{headers:{authorization:`Bearer ${token}`}});
    if(!me.ok||(await me.json() as {id:string}).id!==this.state.setup.grant.payload.user_id)throw new Error('Vuelve a iniciar sesión con la misma cuenta para sincronizar.');
    for(const item of this.drafts()) {
      if(item.status==='PENDING') {
        const res=await fetch(`${apiBase}/api/v1/organizations/${org}/field-offline/sync`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({device_id:fieldDeviceId(),operations:[item.operation]})});
        if(!res.ok)throw new Error('El servidor rechazó el acceso. Conservamos tus capturas: revisa sesión y permisos.');
        const data=await res.json() as {results:Array<{operation_id:string;status:string;plot_id?:string;row_version?:number;message?:string}>};
        const result=data.results.find(r=>r.operation_id===item.operation.operation_id);if(!result)throw new Error('No hubo confirmación del servidor. Se conserva la operación para reintentar.');
        await this.mutate(next=>{const d=next.drafts.find(x=>x.operation.operation_id===item.operation.operation_id)!;d.status=['ACCEPTED','DUPLICATE'].includes(result.status)?'SYNCED':result.status==='CONFLICT'?'CONFLICT':'REJECTED';d.message=result.message;d.plot_id=result.plot_id;d.row_version=result.row_version;});
      }
      const current=this.drafts().find(d=>d.operation.operation_id===item.operation.operation_id)!;
      if(current.status!=='SYNCED'||!current.plot_id)continue;
      for(const file of current.evidence.filter(f=>f.status==='PENDING')) {
        const form=new FormData();form.append('operation_id',file.id);form.append('owner_type','plot');form.append('owner_id',current.plot_id);form.append('document_type',file.mime==='application/pdf'?'FIELD_EVIDENCE':'FIELD_PHOTO');form.append('title',`Evidencia de campo ${current.operation.plot_code}`);form.append('file',new Blob([decode(file.data)],{type:file.mime}),file.name);
        const res=await fetch(`${apiBase}/api/v1/organizations/${org}/documents`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form});
        if(!res.ok)throw new Error('Parcela sincronizada; evidencia pendiente. El archivo local se conserva para reintentar.');
        await this.mutate(next=>{next.drafts.find(d=>d.operation.operation_id===item.operation.operation_id)!.evidence.find(e=>e.id===file.id)!.status='SYNCED';});
      }
    }
  }
}

export async function fieldStorageStatus():Promise<{persistent:boolean;quota:number|null;usage:number|null}> {
  const persistent=await navigator.storage?.persist?.().catch(()=>false)??false;
  const estimate=await navigator.storage?.estimate?.().catch(()=>null);
  return {persistent,quota:estimate?.quota??null,usage:estimate?.usage??null};
}
