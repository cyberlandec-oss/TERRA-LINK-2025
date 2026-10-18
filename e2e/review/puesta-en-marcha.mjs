// P1-004 — «Puesta en marcha y madurez»: recorrido completo en navegador real y por API
// (RF-35; S3 §16; UX_UI §10.4).
//
//   node e2e/review/puesta-en-marcha.mjs [--web http://localhost:3000] [--base http://localhost:4000]
//
// Lo que tiene que quedar demostrado:
//   1. el **nivel y su fundamento**, con la evidencia de cada señal y su fuente;
//   2. que **no se afirma lo no observado**: sin datos NO se declara «nivel 0», y no hay porcentajes;
//   3. que se distinguen **dato faltante**, **capacidad no implementada** y **decisión pendiente**;
//   4. el recorrido: **identificar lo pendiente → abrir la acción → completarla → ver el nivel actualizado**;
//   5. que **no levanta compuertas** ni concede acceso, y que el detalle respeta el alcance;
//   6. **teclado** y **390 px**.
//
// CAMBIA DATOS DEMO en un punto, y solo en ese: el caso del recorrido crea un **centro de acopio** en
// «DEMO · Acopio San Isidro», que es justo lo que a esa organización le falta. El resto solo lee.
// Las cuentas DEMO se leen con la utilidad segura; nunca se imprimen credenciales.
import { chromium } from '@playwright/test';
import { cuentaDemo } from './consulta-api.mjs';
import { exigeEntrada } from './comprobacion.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const WEB = arg('--web', 'http://localhost:3000');
const API = arg('--base', 'http://localhost:4000');
const COOP = 'e8dbdab9-08ec-4867-908e-f23138dbca28';

const resultados = [];
async function caso(titulo, fn) {
  try {
    const [ok, detalle] = await fn();
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${titulo.padEnd(66)} ${detalle}`);
    resultados.push(ok);
  } catch (e) {
    console.log(`FALLA ${titulo.padEnd(66)} ${e.message}`);
    resultados.push(false);
  }
}

async function sesion(local) {
  const c = cuentaDemo(local);
  const r = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: c.email, password: c.contrasena }) });
  if (!r.ok) throw new Error(`login de ${local}: ${r.status}`);
  const token = (await r.json()).access_token;
  const perms = await (await fetch(`${API}/api/v1/me/permissions`, { headers: { authorization: `Bearer ${token}` } })).json();
  return { cuenta: c, token, orgId: perms.organizations?.[0]?.organization_id ?? null };
}
const pedir = async (token, metodo, path) => {
  const r = await fetch(`${API}${path}`, { method: metodo, headers: { authorization: `Bearer ${token}` } });
  const texto = await r.text();
  let body = null; try { body = JSON.parse(texto); } catch { /* no JSON */ }
  return { status: r.status, body, texto };
};
const diagnostico = async (token, org) => {
  const r = await pedir(token, 'GET', `/api/v1/organizations/${org}/onboarding`);
  if (r.status !== 200) throw new Error(`el diagnóstico respondió ${r.status}, esperado 200`);
  exigeEntrada('niveles del diagnóstico', r.body?.levels);
  exigeEntrada('pasos del asistente', r.body?.steps);
  return r.body;
};
const senal = (d, l, code) => d.levels.find((n) => n.level === l)?.signals.find((s) => s.code === code);
const paso = (d, code) => d.steps.find((p) => p.code === code);

const admin = await sesion('admin.cooperativa');
const tecnico = await sesion('tecnico1.cooperativa');
const acopio = await sesion('admin.acopio');
const ORG_ACOPIO = exigeEntrada('organización del acopio', acopio.orgId);

// ------------------------------------------------------------------ API
await caso('CONTROL: las tres cuentas reciben su diagnóstico, así que un vacío significa «nada»', async () => {
  const a = await diagnostico(admin.token, COOP);
  const t = await diagnostico(tecnico.token, COOP);
  const s = await diagnostico(acopio.token, ORG_ACOPIO);
  return [a.levels.length === 7 && t.levels.length === 7 && s.levels.length === 7,
    `cooperativa=${a.level.reached ?? 'sin nivel'} · técnico ve ${t.levels.length} niveles · acopio=${s.level.reached ?? 'sin nivel'}`];
});

await caso('SIN DATOS no es «nivel 0»: los niveles 0–2 quedan NO DETERMINABLES', async () => {
  const d = await diagnostico(acopio.token, ORG_ACOPIO);
  const bajos = [0, 1, 2].every((l) => d.levels.find((n) => n.level === l).state === 'NO_DETERMINABLE');
  return [d.level.reached === null && bajos && /no se afirman/.test(d.level.basis),
    `nivel=${d.level.reached ?? 'ninguno'} · 0–2 no determinables=${bajos}`];
});

await caso('NINGÚN porcentaje ni puntuación de avance en la respuesta', async () => {
  const d = await diagnostico(admin.token, COOP);
  const texto = JSON.stringify(d);
  const cifra = /\d+\s*%/.test(texto);
  const campo = /"(progress|score|completion|percent)\w*":/i.test(texto);
  return [!cifra && !campo, `cifra de porcentaje=${cifra} · campo de avance=${campo}`];
});

await caso('CRITERIO declarado como decisión de producto, con su umbral escrito', async () => {
  const d = await diagnostico(admin.token, COOP);
  return [d.criterion?.id === 'D-49' && d.criterion.status === 'PROPUESTA'
    && /NO fija umbrales/.test(d.criterion.note) && /PRESENCIA/.test(d.criterion.threshold),
  `${d.criterion?.id} ${d.criterion?.version} (${d.criterion?.status})`];
});

await caso('EVIDENCIA: cada señal observada trae número, alcance, fecha cuando existe y fuente', async () => {
  const d = await diagnostico(admin.token, COOP);
  const observadas = d.levels.flatMap((n) => n.signals).filter((s) => s.state === 'OBSERVADA');
  const completas = observadas.every((s) => typeof s.evidence.count === 'number' && s.evidence.scope && /S3 §16/.test(s.source));
  const conFecha = observadas.filter((s) => s.evidence.as_of).length;
  return [observadas.length > 0 && completas, `${observadas.length} señal(es) observada(s), todas con evidencia=${completas} · ${conFecha} con fecha`];
});

await caso('TRES CLASES de bloqueo, separadas: dato, capacidad y decisión', async () => {
  const d = await diagnostico(admin.token, COOP);
  const b = d.blockers;
  const decision = b.undecided.some((x) => x.code === 'INSTANTANEA_READY');
  const capacidad = b.not_implemented.some((x) => x.code === 'ANALITICA_COMERCIAL');
  const noMezcla = !b.missing_data.some((x) => x.code === 'INSTANTANEA_READY' || x.code === 'ANALITICA_COMERCIAL');
  return [decision && capacidad && noMezcla,
    `datos=${b.missing_data.length} · capacidades=${b.not_implemented.length} · decisiones=${b.undecided.length} · sin mezclar=${noMezcla}`];
});

await caso('NO LEVANTA COMPUERTAS: nivel 4 con la conclusión todavía UNDETERMINED', async () => {
  const d = await diagnostico(admin.token, COOP);
  const lotes = await pedir(admin.token, 'GET', `/api/v1/organizations/${COOP}/lots`);
  const lote = exigeEntrada('lote de la cooperativa', (lotes.body?.items ?? lotes.body ?? [])[0]?.id);
  const riesgo = await pedir(admin.token, 'GET', `/api/v1/organizations/${COOP}/risk/lots/${lote}/evaluations`);
  const evs = riesgo.body?.evaluations ?? riesgo.body?.items ?? riesgo.body ?? [];
  const concl = [...new Set((Array.isArray(evs) ? evs : []).map((e) => e.conclusion))];
  return [d.level.reached === 4 && /NO levanta ninguna compuerta/.test(d.disclaimer)
    && concl.every((c) => c === 'UNDETERMINED'),
  `nivel=${d.level.reached} · conclusiones=${concl.join(',') || 'sin evaluaciones'} · aviso presente`];
});

await caso('ALCANCE: el técnico ve el estado, pero el número se acota o no se entrega', async () => {
  const d = await diagnostico(tecnico.token, COOP);
  const prod = senal(d, 3, 'PRODUCTORES');
  const riesgo = senal(d, 4, 'CATALOGO_DE_RIESGO');
  const acotado = prod.evidence.scope === 'ASIGNADOS' && /SOLO a lo que tienes asignado/.test(prod.evidence.note);
  const sinNumero = riesgo.evidence.count === null && riesgo.evidence.scope === 'RESTRINGIDO';
  return [acotado && sinNumero && prod.state === 'OBSERVADA',
    `productores: alcance=${prod.evidence.scope} n=${prod.evidence.count} · riesgo: ${riesgo.evidence.scope} sin número=${sinNumero}`];
});

await caso('NO CONCEDE ACCESO: sin permiso, el paso no ofrece enlace; y otra organización es 404', async () => {
  const d = await diagnostico(tecnico.token, COOP);
  const equipo = paso(d, 'EQUIPO');
  const ajena = await pedir(tecnico.token, 'GET', `/api/v1/organizations/${ORG_ACOPIO}/onboarding`);
  return [equipo.state === 'RESTRINGIDO' && equipo.action_href === null && ajena.status === 404,
    `paso EQUIPO=${equipo.state} enlace=${equipo.action_href ?? 'ninguno'} · organización ajena=${ajena.status}`];
});

await caso('SOLO LECTURA: no hay forma de marcar un paso como hecho', async () => {
  const post = await pedir(admin.token, 'POST', `/api/v1/organizations/${COOP}/onboarding`);
  const patch = await pedir(admin.token, 'PATCH', `/api/v1/organizations/${COOP}/onboarding`);
  return [post.status === 404 && patch.status === 404, `POST=${post.status} · PATCH=${patch.status}`];
});

// ------------------------------------------------------------------ NAVEGADOR
const navegador = await chromium.launch();
try {
  const entrar = async (cuenta, viewport = { width: 1280, height: 900 }) => {
    const ctx = await navegador.newContext({ viewport, locale: 'es-EC' });
    const page = await ctx.newPage();
    await page.goto(WEB);
    await page.getByLabel('Correo').fill(cuenta.cuenta.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(cuenta.cuenta.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.getByRole('heading', { level: 1, name: /organizaciones/i }).waitFor({ timeout: 20000 });
    return { ctx, page };
  };
  const abrir = async (page, org) => {
    await page.goto(`${WEB}/organizaciones/${org}/onboarding`);
    await page.getByRole('heading', { level: 1, name: 'Puesta en marcha y madurez' }).waitFor({ timeout: 20000 });
    await page.getByRole('heading', { name: 'Nivel', exact: true }).waitFor({ timeout: 20000 });
  };

  const { ctx, page } = await entrar(admin);

  await caso('PANTALLA: se llega desde el menú y se ve el nivel con su fundamento', async () => {
    await page.goto(`${WEB}/organizaciones/${COOP}`);
    await page.getByRole('link', { name: 'Puesta en marcha' }).first().click();
    await page.getByRole('heading', { level: 1, name: 'Puesta en marcha y madurez' }).waitFor({ timeout: 20000 });
    const t = await page.locator('main').innerText();
    return [/Nivel 4/.test(t) && /Trazabilidad \+ riesgo/.test(t) && /todas sus señales se observan/.test(t),
      `nivel visible=${/Nivel 4/.test(t)} · con fundamento=${/todas sus señales se observan/.test(t)}`];
  });

  await caso('PANTALLA: el aviso de que no acredita conformidad está arriba, no en una nota al pie', async () => {
    const t = await page.locator('main').innerText();
    const arriba = t.indexOf('NO acredita conformidad');
    return [arriba >= 0 && arriba < t.indexOf('Los siete niveles'),
      `posición del aviso=${arriba} · antes de los niveles=${arriba < t.indexOf('Los siete niveles')}`];
  });

  await caso('PANTALLA: los siete niveles, con su estado y su evidencia visible', async () => {
    const t = await page.locator('main').innerText();
    const siete = [0, 1, 2, 3, 4, 5, 6].every((l) => t.includes(`Nivel ${l}:`));
    const estados = /Alcanzado/.test(t) && /No determinable aquí/.test(t) && /Capacidad no implementada/.test(t);
    const fuente = /Fuente: S3 §16/.test(t);
    return [siete && estados && fuente, `siete niveles=${siete} · estados distinguidos=${estados} · fuente citada=${fuente}`];
  });

  await caso('PANTALLA: las tres clases de bloqueo aparecen separadas y rotuladas', async () => {
    const t = await page.locator('main').innerText();
    const tres = /Datos por cargar/.test(t) && /Capacidades no implementadas/.test(t) && /Decisiones pendientes/.test(t);
    return [tres, `las tres secciones presentes=${tres}`];
  });

  await caso('ENLACES del asistente: todos abren una pantalla real, ninguno es un 404', async () => {
    const d = await diagnostico(admin.token, COOP);
    const destinos = [...new Set(d.steps.map((p) => p.action_href).filter(Boolean))];
    const malos = [];
    for (const href of destinos) {
      const r = await page.goto(`${WEB}${href}`);
      const t = await page.locator('body').innerText();
      if (!r || r.status() >= 400 || /no existe o no está disponible|404/.test(t)) malos.push(href);
    }
    await abrir(page, COOP);
    return [destinos.length > 0 && malos.length === 0, `${destinos.length} destino(s) · rotos=${malos.join(', ') || 'ninguno'}`];
  });

  await caso('TECLADO: se recorre la pantalla y se alcanza un enlace del asistente sin ratón', async () => {
    let enTabla = false;
    for (let i = 0; i < 80 && !enTabla; i++) {
      await page.keyboard.press('Tab');
      enTabla = await page.evaluate(() => !!document.activeElement?.closest('table'));
    }
    return [enTabla, `foco dentro de una tabla del diagnóstico=${enTabla}`];
  });

  await caso('390 px: la pantalla se usa sin desbordamiento horizontal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrir(page, COOP);
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    return [!desborda, `desborda=${desborda}`];
  });
  await ctx.close();

  // ---------------------------------------------------------------- el recorrido completo
  // Conocer el nivel y su fundamento → identificar lo pendiente → abrir la acción → completarla → ver el
  // resultado actualizado. Se hace en el Acopio, que es a quien de verdad le falta el centro.
  const s = await entrar(acopio);
  await caso('RECORRIDO: identificar lo pendiente, completarlo en su módulo y ver el nivel actualizado', async () => {
    await abrir(s.page, ORG_ACOPIO);
    const antes = await diagnostico(acopio.token, ORG_ACOPIO);
    if (paso(antes, 'CENTROS').state !== 'PENDIENTE') throw new Error('el paso CENTROS ya está hecho en DEMO: el caso no se ejecuta en falso');
    const textoAntes = await s.page.locator('main').innerText();
    const sinNivel = /Sin nivel observable/.test(textoAntes);

    // Se abre la acción DESDE el asistente, no por una ruta inventada.
    const fila = s.page.getByRole('table', { name: 'Pasos de puesta en marcha' }).locator('tbody tr').filter({ hasText: 'Centros y ubicaciones' });
    await fila.getByRole('link', { name: 'Abrir' }).click();
    await s.page.getByRole('heading', { level: 1, name: /Centros|Ubicaciones/i }).waitFor({ timeout: 20000 });

    const codigo = `MARCHA-${Date.now().toString().slice(-5)}`;
    await s.page.getByLabel('Código').fill(codigo);
    await s.page.getByLabel('Nombre').fill('Centro de acopio principal');
    await s.page.getByRole('button', { name: /Registrar|Crear|Guardar/ }).first().click();
    await s.page.getByText(codigo).first().waitFor({ timeout: 20000 });

    await abrir(s.page, ORG_ACOPIO);
    const despues = await diagnostico(acopio.token, ORG_ACOPIO);
    const hecho = paso(despues, 'CENTROS').state === 'HECHO';
    const enPantalla = /Centros y ubicaciones/.test(await s.page.locator('main').innerText());
    return [sinNivel && hecho && enPantalla,
      `antes: sin nivel=${sinNivel}, CENTROS=PENDIENTE · después: CENTROS=${paso(despues, 'CENTROS').state} con ${paso(despues, 'CENTROS').evidence}`];
  });
  await s.ctx.close();
} finally {
  await navegador.close();
}

const ok = resultados.every(Boolean);
console.log(`\nP1-004 puesta en marcha y madurez: ${ok ? 'APROBADO' : 'CON FALLAS'} (${resultados.filter(Boolean).length}/${resultados.length} casos)`);
process.exitCode = ok ? 0 : 1;
