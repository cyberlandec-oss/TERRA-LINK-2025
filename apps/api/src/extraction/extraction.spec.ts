import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { pdfConTexto, pdfEscaneado } from '../../test/pdf-sintetico';
import { textoDePdf, paginasDePdf } from './pdf-text';
import { sugerir } from './reglas';

// P1-013 — El extractor y las reglas, probados **sin base de datos y sin red**.
//
// Lo que estas pruebas protegen: que el texto salga **del archivo de verdad** —no de una maqueta—, que una
// fecha ambigua **no se decida**, que sin etiqueta no se **invente** un emisor, y que la «confianza» sea
// siempre **la regla que disparó la sugerencia**.

describe('P1-013 lectura local del texto de un PDF', () => {
  it('lee la capa de texto de un PDF real, descomprimiendo su flujo', () => {
    const pdf = pdfConTexto(['Certificado de tenencia', 'Emitido por: Registro de la Propiedad de Manabi', 'Fecha de emision: 2026-03-04']);
    const r = textoDePdf(pdf);
    expect(r.streams).toBe(1);
    expect(r.truncated).toBe(false);
    expect(r.text).toContain('Certificado de tenencia');
    expect(r.text).toContain('Registro de la Propiedad de Manabi');
    expect(r.text).toContain('2026-03-04');
  });

  it('un PDF sin capa de texto devuelve vacío, y NO se inventa nada', () => {
    const r = textoDePdf(pdfEscaneado());
    expect(r.text).toBe('');
    expect(r.streams).toBe(0);
  });

  it('un archivo que no es PDF no revienta: devuelve vacío', () => {
    expect(textoDePdf(Buffer.from('esto no es un pdf')).text).toBe('');
    expect(textoDePdf(Buffer.alloc(0)).text).toBe('');
  });

  it('cuenta las páginas declaradas, o devuelve null en vez de inventarlas', () => {
    expect(paginasDePdf(pdfConTexto(['hola']))).toBe(1);
    expect(paginasDePdf(Buffer.from('nada'))).toBeNull();
  });
});

describe('P1-013 reglas de sugerencia: la confianza es la regla, no un número', () => {
  const campo = (texto: string, code: string) => sugerir(texto).find((s) => s.field_code === code)!;

  it('ETIQUETA EXPLÍCITA: el documento rotula el valor → confianza ALTA con su fragmento', () => {
    const t = 'Certificado\nEmitido por: Registro de la Propiedad\nFecha de emision: 2026-03-04\nVigente hasta: 2027-03-04';
    const emisor = campo(t, 'ISSUER');
    expect(emisor.basis).toBe('ETIQUETA_EXPLICITA');
    expect(emisor.confidence).toBe('ALTA');
    expect(emisor.suggested_value).toBe('Registro de la Propiedad');
    expect(emisor.source_excerpt).toContain('Emitido por');
    expect(emisor.source_offset).toBeGreaterThanOrEqual(0);

    expect(campo(t, 'ISSUED_AT').suggested_value).toBe('2026-03-04');
    expect(campo(t, 'ISSUED_AT').confidence).toBe('ALTA');
    expect(campo(t, 'EXPIRES_AT').suggested_value).toBe('2027-03-04');
  });

  it('PATRÓN ÚNICO: sin etiqueta pero con un solo candidato → confianza MEDIA', () => {
    const f = campo('Documento sin rotulos.\nSolo aparece 2025-12-31 en todo el texto.', 'ISSUED_AT');
    expect(f.basis).toBe('PATRON_UNICO');
    expect(f.confidence).toBe('MEDIA');
    expect(f.suggested_value).toBe('2025-12-31');
  });

  it('AMBIGUO: con varios candidatos NO se sugiere ninguno, y se listan todos', () => {
    const f = campo('Fechas sueltas: 2025-01-02 y 2026-07-08 y 2027-09-10.', 'ISSUED_AT');
    expect(f.basis).toBe('PATRON_AMBIGUO');
    expect(f.confidence).toBe('BAJA');
    expect(f.suggested_value).toBeNull();
    expect(f.candidates.map((c) => c.value)).toEqual(['2025-01-02', '2026-07-08', '2027-09-10']);
    expect(f.candidates[0].excerpt).toContain('2025-01-02');
  });

  it('una fecha 03/04/2026 NO se decide entre marzo y abril: queda como candidato sin normalizar', () => {
    const f = campo('Fecha: 03/04/2026', 'ISSUED_AT');
    expect(f.suggested_value).toBeNull();
    expect(f.basis).toBe('PATRON_AMBIGUO');
    expect(f.candidates.map((c) => c.value)).toContain('03/04/2026');
    // Y no aparece ninguna normalización inventada.
    expect(JSON.stringify(f)).not.toMatch(/2026-03-04|2026-04-03/);
  });

  it('una fecha imposible no se propone', () => {
    const f = campo('Vence el 2026-02-30 segun el sello.', 'EXPIRES_AT');
    expect(f.suggested_value).toBeNull();
  });

  it('una etiqueta MENCIONADA no es una etiqueta que rotula: «Sin emisor rotulado» no sugiere nada', () => {
    // Defecto real encontrado por la prueba de integración: sin dos puntos, la palabra suelta proponía basura
    // con confianza ALTA.
    const f = campo('ACTA SIMPLE\nSin emisor rotulado ni fechas.', 'ISSUER');
    expect(f.suggested_value).toBeNull();
    expect(f.basis).toBe('PATRON_AMBIGUO');
    // Y una mención de fecha sin fecha detrás tampoco sugiere.
    expect(campo('Aqui deberia ir la fecha de emision, pero falta.', 'ISSUED_AT').suggested_value).toBeNull();
  });

  it('sin etiqueta NO se adivina un emisor', () => {
    const f = campo('Un texto cualquiera con nombres como Registro y Propiedad sueltos.', 'ISSUER');
    expect(f.suggested_value).toBeNull();
    expect(f.basis).toBe('PATRON_AMBIGUO');
  });

  it('los tres campos se publican SIEMPRE: la ausencia también es información', () => {
    const s = sugerir('texto sin nada util');
    expect(s.map((x) => x.field_code).sort()).toEqual(['EXPIRES_AT', 'ISSUED_AT', 'ISSUER']);
    expect(s.every((x) => x.suggested_value === null)).toBe(true);
  });

  it('la pareja base↔confianza es fija: no hay forma de publicar ALTA sin etiqueta', () => {
    const casos = [
      'Emitido por: X\nFecha de emision: 2026-01-01',
      'Solo 2026-01-01',
      'Varias 2026-01-01 y 2026-02-02',
      '',
    ];
    for (const c of casos) {
      for (const s of sugerir(c)) {
        const esperado = { ETIQUETA_EXPLICITA: 'ALTA', PATRON_UNICO: 'MEDIA', PATRON_AMBIGUO: 'BAJA' }[s.basis];
        expect(s.confidence).toBe(esperado);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// COMPROBACIÓN DIRIGIDA DE LÍMITES (2026-10-18)
//
// Superar las pruebas con PDF que genera el propio autor **no demuestra compatibilidad general**. Esta sección
// usa un PDF producido por una **herramienta independiente** —el motor de impresión de Chromium— y empuja el
// motor contra sus bordes. Destapó cuatro defectos, corregidos aquí y fijados con su regresión.
// ---------------------------------------------------------------------------------------------------------
describe('P1-013 límites del motor, comprobados contra un PDF ajeno', () => {
  const ajeno = () => readFileSync(join(__dirname, '../../test/fixtures/chromium-capa-texto.pdf'));
  const conFlujos = (ops: string[]) => {
    const partes: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
    ops.forEach((o, i) => {
      const z = deflateSync(Buffer.from(o, 'latin1'));
      partes.push(Buffer.from(`${i + 1} 0 obj<</Length ${z.length}/Filter/FlateDecode>>stream\n`, 'latin1'));
      partes.push(z);
      partes.push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    });
    partes.push(Buffer.from('trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1'));
    return Buffer.concat(partes);
  };

  it('DEFECTO 1 — un PDF de otra herramienta NO se publica como texto ilegible', () => {
    const r = textoDePdf(ajeno());
    // Tiene capa de texto de verdad…
    expect(r.hasTextLayer).toBe(true);
    // …pero este motor no sabe interpretarla (fuentes subconjuntadas, sin ToUnicode).
    expect(r.interpretable).toBe(false);
    // Y por eso NO publica nada: antes devolvía miles de caracteres que no son el texto del documento.
    expect(r.text).toBe('');
    // LO IMPORTANTE: la legibilidad por repertorio NO bastaba para detectarlo —da 87 %— porque los índices
    // de glifo **parecen** ASCII imprimible («0DQDEt» es «Manabí» desplazado). Lo delata otra señal.
    expect(r.legibility).toBeGreaterThan(0.8);
    expect(['CARACTERES_DE_CONTROL', 'SIN_ESPACIOS']).toContain(r.reason);
  });

  it('DEFECTO 2 — «sin capa de texto» y «no supe interpretarla» son distintos', () => {
    const escaneo = textoDePdf(pdfEscaneado());
    expect(escaneo.hasTextLayer).toBe(false);      // no hay nada que leer
    expect(escaneo.interpretable).toBe(true);      // y eso no es un fallo de interpretación
    const ilegible = textoDePdf(ajeno());
    expect(ilegible.hasTextLayer).toBe(true);      // sí hay
    expect(ilegible.interpretable).toBe(false);    // pero no se entiende
  });

  it('DEFECTO 3 — multipágina: se leen TODOS los flujos, no solo el primero', () => {
    const r = textoDePdf(conFlujos(['BT (Pagina uno) Tj ET', 'BT (Pagina dos) Tj ET', 'BT (Pagina tres) Tj ET']));
    expect(r.streams).toBe(3);
    expect(r.text).toContain('Pagina uno');
    expect(r.text).toContain('Pagina dos');
    expect(r.text).toContain('Pagina tres');
  });

  it('DEFECTO 4 — codificaciones: hexadecimal y UTF-16BE se decodifican', () => {
    expect(textoDePdf(conFlujos(['BT <48656C6C6F> Tj ET'])).text).toContain('Hello');
    const o = String.fromCharCode(92);
    const utf16 = textoDePdf(conFlujos([`BT (${o}376${o}377${o}000H${o}000o${o}000l${o}000a) Tj ET`]));
    expect(utf16.text).toBe('Hola');          // antes salía «þÿHola», con el BOM dentro
  });

  it('LÍMITES de procesamiento: se corta y SE DICE, nunca se presenta como completo', () => {
    const r = textoDePdf(conFlujos([`BT (${'A B '.repeat(75000)}) Tj ET`]));
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(200000);
  });

  it('un flujo con Flate corrupto no revienta ni inventa', () => {
    const buf = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj<</Length 8/Filter/FlateDecode>>stream\n', 'latin1'),
      Buffer.from([0x78, 0x9c, 0x00, 0xff, 0xff, 0x01, 0x02, 0x03]),
      Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1')]);
    const r = textoDePdf(buf);
    expect(r.text).toBe('');
    expect(r.streams).toBe(0);
  });

  it('NO se afirma compatibilidad general: el motor publica su legibilidad medida', () => {
    const propio = textoDePdf(pdfConTexto(['Emitido por: Entidad', 'Fecha de emision: 2026-01-01']));
    expect(propio.interpretable).toBe(true);
    expect(propio.legibility).toBeGreaterThanOrEqual(0.8);
    // Pasar con el formato propio no dice nada del ajeno, y el ajeno lo demuestra.
    expect(textoDePdf(ajeno()).interpretable).toBe(false);
  });
});
