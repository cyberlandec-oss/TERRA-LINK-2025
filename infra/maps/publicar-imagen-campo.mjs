// Publica datos satelitales públicos preparados; nunca lee .env ni datos de productores.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const source = resolve(process.argv[2] ?? 'infra/maps/prepared/clear');
const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8'));
if (!Array.isArray(manifest.packages) || manifest.packages.length !== 1) throw new Error('Se publica un paquete verificado a la vez');
const p = manifest.packages[0];
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || p.image_url !== `/offline/${p.id}.png`) throw new Error('Identificador inválido');
const bytes = readFileSync(resolve(source, `${p.id}.png`));
if (bytes.length !== p.bytes || createHash('sha256').update(bytes).digest('hex') !== p.sha256) throw new Error('Integridad inválida');
const script = `const fs=require('fs');const next=JSON.parse(fs.readFileSync('/entrada/manifest.json','utf8'));fs.mkdirSync('/data/offline',{recursive:true});const path='/data/offline/manifest.json';const prev=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):{packages:[]};for(const p of next.packages){const target='/data/offline/'+p.id+'.png';if(fs.existsSync(target)){if(!fs.readFileSync(target).equals(fs.readFileSync('/entrada/'+p.id+'.png')))throw Error('El paquete ya existe con otros bytes: usar ID versionado');}else fs.copyFileSync('/entrada/'+p.id+'.png',target);}const merged={packages:[...prev.packages.filter(p=>!next.packages.some(n=>n.id===p.id)),...next.packages]};fs.writeFileSync(path+'.tmp',JSON.stringify(merged,null,2));fs.renameSync(path+'.tmp',path);console.log('Paquetes publicados: '+merged.packages.length);`;
const r = spawnSync('docker', ['run','--rm','--network','none','--user','0','--entrypoint','node',
  '--mount',`type=bind,source=${source},target=/entrada,readonly`,
  '--mount','type=volume,source=terra-link_map-data,target=/data','terra-link-api:local','-e',script], { stdio:'inherit' });
process.exitCode = r.status ?? 1;
