// P0-028 — ENSAYO REAL de integración con Whisp 2.3.1 usando UNA GEOMETRÍA ARTIFICIAL. NO se ejecuta solo ni en validate.
//
//   node e2e/review/whisp-ensayo-real.mjs --simular      # muestra qué se enviaría; NO abre ninguna conexión
//   WHISP_API_KEY=… WHISP_ENSAYO_AUTORIZADO=SI_TERMINOS_ACEPTADOS_POR_EL_PROPIETARIO node e2e/review/whisp-ensayo-real.mjs
//
// Se niega a correr sin las DOS condiciones: (1) una clave de API de Whisp propia del propietario y (2) su autorización expresa, que implica que
// aceptó él mismo los términos del servicio (https://whisp.openforis.org/legal/terms-of-service). Terra Link NO acepta términos por él, NO usa parcelas
// reales, NO envía nombres, códigos ni identificadores (`properties` va vacío) y NO escribe nada en la base: solo guarda la respuesta cruda en
// validation-results/ (la clave se lee del entorno y nunca se imprime ni se guarda). Whisp conserva los resultados ~10 min: aquí se guarda la copia.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.WHISP_BASE_URL ?? 'https://whisp.openforis.org';
// Cuadrado de ~100 m ARTIFICIAL (no corresponde a ninguna parcela ni persona); en una zona agrícola cacaotera de Ecuador para que el análisis sea representativo.
const GEOMETRIA = { type: 'Polygon', coordinates: [[[-79.4000, -1.0000], [-79.3991, -1.0000], [-79.3991, -0.9991], [-79.4000, -0.9991], [-79.4000, -1.0000]]] };
const cuerpo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: GEOMETRIA }], analysisOptions: { async: false } };

if (process.argv.includes('--simular')) {
  console.log(`SIMULACIÓN (sin red). Destino: ${BASE}\n  GET  /api/config\n  POST /api/submit/geojson  (cabecera x-api-key)\n  [si 202] GET /api/status/{data.token} hasta analysis_completed\n  [si el resultado no viene] GET /api/generate-geojson/{data.token}\nCuerpo:\n${JSON.stringify(cuerpo, null, 1)}`);
  process.exit(0);
}
const clave = process.env.WHISP_API_KEY;
if (!clave || process.env.WHISP_ENSAYO_AUTORIZADO !== 'SI_TERMINOS_ACEPTADOS_POR_EL_PROPIETARIO') {
  console.error('NO SE EJECUTA. Falta:' + (!clave ? '\n  - WHISP_API_KEY: la clave de API del propietario (se crea en su cuenta de https://whisp.openforis.org, inicio de sesión FAO; vale 365 días y solo hay una activa).' : '')
    + (process.env.WHISP_ENSAYO_AUTORIZADO !== 'SI_TERMINOS_ACEPTADOS_POR_EL_PROPIETARIO' ? '\n  - WHISP_ENSAYO_AUTORIZADO=SI_TERMINOS_ACEPTADOS_POR_EL_PROPIETARIO: su autorización expresa de enviar esta geometría ARTIFICIAL, habiendo aceptado él los términos.' : ''));
  process.exit(2);
}
const pedir = async (ruta, init = {}) => {
  const r = await fetch(BASE + ruta, { ...init, headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.auth ? { 'x-api-key': clave } : {}) }, redirect: 'manual', signal: AbortSignal.timeout(120000) });
  const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch { /* no JSON */ }
  return { status: r.status, texto, json };
};
const sal = join('validation-results', `whisp-ensayo-real-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(sal, { recursive: true });
const cfg = await pedir('/api/config');
console.log('config', cfg.status, cfg.json && { geometryLimitSync: cfg.json.geometryLimitSync, openforisWhispVersion: cfg.json.openforisWhispVersion });
let r = await pedir('/api/submit/geojson', { method: 'POST', body: JSON.stringify(cuerpo), auth: true });
console.log('submit', r.status, r.json?.code);
const token = r.json?.data?.token;
for (let i = 0; token && r.json?.code !== 'analysis_completed' && i < 40; i++) {
  await new Promise((ok) => setTimeout(ok, 3000));
  r = await pedir(`/api/status/${encodeURIComponent(token)}`, { auth: true });
  console.log('estado', r.status, r.json?.code, r.json?.data?.percent ?? '');
  if (r.status >= 400) break;
}
writeFileSync(join(sal, 'respuesta.json'), r.texto);
const props = r.json?.data?.features?.[0]?.properties;
console.log(`respuesta guardada en ${sal}/respuesta.json (sha256 ${createHash('sha256').update(r.texto).digest('hex').slice(0, 16)}…)`);
console.log(props ? { risk_pcrop: props.risk_pcrop ?? '(no informado)', metadata: props.whisp_processing_metadata ?? '(no informada)' } : 'SIN RESULTADO: un fallo o un trabajo incompleto NO es «sin deforestación».');
process.exit(props ? 0 : 1);
