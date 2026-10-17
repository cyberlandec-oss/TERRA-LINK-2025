# Fuentes ecuatorianas para P1-005 — copia fechada (consultadas el 2026-10-17)

**Esto no es un perfil jurídico.** Es la preparación de fuentes que P1-005 exige antes de poder proponer uno:
qué documento es, quién lo emitió, dónde se publicó, qué versión se consultó, qué reformas se le conocen, de
qué URL salió, cuándo se consultó y qué huella tiene. **Ninguna compuerta se tocó, nada se aprobó y la
conclusión `UNDETERMINED` sigue igual.** Las llamadas satelitales siguen deshabilitadas.

Se sigue el mismo criterio que `docs/sources/eudr-norma-2026-10-15/`: copia fechada, con sha256, y lo que no se
pudo comprobar se declara como no comprobado.

## 1. El hallazgo que condiciona todo lo demás: no hay texto consolidado oficial y gratuito

Con la norma europea existe un **texto consolidado** publicado por la propia autoridad, con identificación de
versión (`02023R1115 — EN — 18.09.2026 — 003.001`) y lista de modificaciones. **En Ecuador no hay equivalente
gratuito.**

| | Unión Europea | **Ecuador** |
| --- | --- | --- |
| Publicación oficial | EUR-Lex / Oficina de Publicaciones | **Registro Oficial** (`registroficial.gob.ec`, alcanzable el 2026-10-17) |
| Qué publica | Ediciones **y consolidaciones** | **Solo ediciones cronológicas**: Registro Oficial, Suplemento, Edición Especial, Constitucional, Jurídica e Índice Mensual |
| Texto vigente consolidado | Sí, identificado y fechado | **No consultable por esa vía** |

Consecuencia directa, y hay que escribirla antes de cualquier regla: **la vigencia consolidada de ninguno de
los cuerpos legales de esta carpeta puede confirmarse con las fuentes obtenidas.** Reconstruirla exige aplicar
una por una las reformas publicadas en ediciones posteriores, o recurrir a una consolidación **comercial**
(LEXIS/SILEC), que no se ha contratado y que **no es fuente oficial**.

**Por eso P1-005 no puede cerrarse con este material.** Lo que sí queda es la base fechada para trabajar.

## 2. Lo que se obtuvo

### Originales (no se modifican nunca)

| Archivo | Qué es | Autoridad emisora | Bytes | sha256 |
| --- | --- | --- | ---: | --- |
| `lotrta-ro-s-711-2016-03-14.pdf` | **Texto normativo**: Ley Orgánica de Tierras Rurales y Territorios Ancestrales (ver §2.0) | Asamblea Nacional del Ecuador (ficha oficial de la ley) | 1 025 486 | `8ee8598db5735098e278194995993a43e3b343dd78fba47acebb538f82cfc76b` |
| `coa-ro-s-983-2017-04-12.pdf` | **Texto normativo**: Código Orgánico del Ambiente (ver §2.1) | Asamblea Nacional del Ecuador (repositorio propio) | 1 660 486 | `033ffdd280975aabb0b89f6634b4e7f9462b3a835d49abcbbecefdaed96e61af` |
| `mag-indice-normativa.pdf` | **Índice institucional, NO texto normativo** (ver §2.2) | Ministerio de Agricultura y Ganadería | 501 628 | `c513533bcc7ff3c88848169706c811c9a84929e31cd58cc4e6465fc181609651` |

### Derivados (extracción de texto; **no son fuente**)

Los dos suplementos son **escaneos con capa de texto**, así que el texto se extrae sin OCR, con
`pdftotext -enc UTF-8`. **El original queda intacto**; la extracción se guarda aparte, con su propia huella, y
**no sustituye al original**: cualquier artículo que vaya a convertirse en regla se lee contra el PDF.

| Archivo | Origen | Bytes | sha256 |
| --- | --- | ---: | --- |
| `derivados/lotrta-lectura.txt` | `lotrta-ro-s-711-2016-03-14.pdf` | 174 588 | *orden de lectura (columna a columna)* |
| `derivados/lotrta-ro-s-711-2016-03-14.txt` | el mismo, con `-layout` | 222 348 | `e425c587da88e23dfb0470d2f4eed1f9479e2582e4c8d2d0b8d6c2478956ee25` |
| `derivados/coa-ro-s-983-2017-04-12.txt` | `coa-ro-s-983-2017-04-12.pdf`, con `-layout` | 429 743 | `9b8d0186f88e0e110f1447ca36ba436ccc00b178306c6e6ce93dfe613ccc7cb2` |

**Aviso de uso**: la extracción `-layout` conserva las **dos columnas** del Registro Oficial y por eso
**entrelaza frases de columnas distintas**. No se puede citar de ahí. Para leer artículos se usa la extracción
en orden de lectura, y aun así se contrasta contra el PDF.

URLs y fecha de consulta en §5.

### 2.0 `lotrta-ro-s-711-2016-03-14.pdf` — Ley Orgánica de Tierras Rurales y Territorios Ancestrales

| | |
| --- | --- |
| Autoridad emisora | **Asamblea Nacional del Ecuador**, desde la **ficha oficial de la ley** (enlace «Descarga aquí») |
| Publicación | Registro Oficial **Suplemento 711**, de **14 de marzo de 2016** |
| Versión consultada | **Publicación original**, no consolidada |
| Formato | PDF de **36 páginas**, escaneado **con capa de texto** |
| Fecha de consulta | 2026-10-17 |

**Comprobado, no supuesto**: la cabecera del documento dice literalmente «SUPLEMENTO · Año III · Nº 711 ·
Quito, lunes 14 de marzo de 2016», y coincide con lo que declara la ficha oficial y con el propio nombre del
archivo en el repositorio. Es la **ley promulgada**, no un proyecto ni una noticia.

### 2.1 `coa-ro-s-983-2017-04-12.pdf` — Código Orgánico del Ambiente

| | |
| --- | --- |
| Autoridad emisora | **Asamblea Nacional del Ecuador** (el archivo procede de su repositorio institucional) |
| Publicación declarada | Registro Oficial **Suplemento 983**, de **12 de abril de 2017** |
| Versión consultada | **Publicación original**, no consolidada |
| Formato | PDF de **136 páginas**, escaneado **con capa de texto** |
| Fecha de consulta | 2026-10-17 |

**Corrección de esta misma ficha (2026-10-17).** La primera versión afirmó que el PDF **no tenía capa de
texto** y que su contenido **no se había verificado**. Ambas cosas eran incorrectas: la comprobación se hizo
contando marcas `ToUnicode`, que este archivo no usa, y de ahí se concluyó de más. Extraído con `pdftotext`,
el documento **sí es legible**, y su cabecera dice «SUPLEMENTO · Año IV · Nº 983 · Quito, miércoles 12 de abril
de 2017», que es exactamente lo que se le atribuía. **La identificación queda comprobada contra el documento**,
no solo contra el nombre del archivo.

**El límite que sí se mantiene:** es el texto tal como se publicó en 2017 y **no incorpora reformas**. Una
búsqueda secundaria menciona una reforma en el Suplemento del Registro Oficial **309, de 21 de agosto de
2018**; **no se ha verificado contra el Registro Oficial** y se registra como **dato sin confirmar**.

### 2.2 `mag-indice-normativa.pdf` — índice institucional, no norma

Documento de **una página** del Ministerio de Agricultura y Ganadería, fechado en el propio archivo el **7 de
diciembre de 2023**, que **enumera y enlaza** los cuerpos legales que rigen a la institución (Constitución,
Código Orgánico Administrativo, COGEP, COOTAD, Código del Trabajo, LOTAIP, LOSNCP, LOGJCC, LOSEP…).

**Es un índice de transparencia, no texto normativo y no una interpretación.** Sirve para orientarse; **no
sustenta ninguna regla** y su fecha (2023) es anterior a esta consulta, de modo que puede estar desactualizado.

## 3. La distinción que P1-005 exige: norma, guía e interpretación

Se separan desde el principio porque sustentan cosas distintas:

| Clase | Qué es | Qué puede sustentar | En esta carpeta |
| --- | --- | --- | --- |
| **Texto normativo** | Lo publicado en el Registro Oficial | Una regla, **si** se confirma su vigencia | `lotrta-…pdf` (original 2016) y `coa-…pdf` (original 2017); en ambos la vigencia está **sin confirmar** |
| **Índice o compilación institucional** | Listado que una entidad hace de las normas que la rigen | Orientación; **nunca** una regla | `mag-indice-normativa.pdf` |
| **Guía, manual o resolución técnica** | Material operativo de una agencia (p. ej. manuales de Agrocalidad) | Práctica administrativa; **no** sustituye a la norma | **Ninguno** incorporado |
| **Consolidación comercial** | Texto refundido por una editorial (LEXIS/SILEC, Ediciones Legales) | **Auxiliar para contrastar**, identificada como tal; **nunca** se presenta como publicación oficial ni se acepta como vigente | **Ninguna incorporada**; se registran como pista en la matriz |
| **Propuesta de interpretación** | Lectura de cómo una norma aplica a EUDR | **Nada por sí sola**: requiere decisión y aprobador | **Ninguna**, y no se formula aquí |

## 4. Identificados y NO obtenidos

Relevantes para la «legislación pertinente» del país de producción (EUDR art. 2(40): uso del suelo, protección
ambiental, bosques, derechos de terceros, laboral, derechos humanos, CLPI, tributario, aduanero y
anticorrupción). **Las citas de Registro Oficial proceden de fuentes secundarias y NO se han verificado**; se
anotan para localizarlas, no como hecho acreditado:

| Cuerpo legal | Cita declarada (**sin verificar**) | Por qué importa | Estado |
| --- | --- | --- | --- |
| Constitución de la República | RO 449, 20-oct-2008 | Derechos de la naturaleza, territorios ancestrales | **No obtenido** |
| Reglamento al Código Orgánico del Ambiente | D.E. 752, RO-S 507, 12-jun-2019 | Desarrolla el COA | **No obtenido**: `site.inpc.gob.ec` no resuelve |
| Ley Orgánica de Sanidad Agropecuaria | RO-S 27, 3-jul-2017 | Registro de operadores (Agrocalidad) | **No obtenido**: no se localizó texto completo en sitio oficial; solo resoluciones que la citan |
| Código Orgánico Integral Penal | RO-S 180, 10-feb-2014 | Delitos ambientales | **No obtenido** |
| Código del Trabajo | RO-S 167, 16-dic-2005 | Derechos laborales | **No obtenido** |
| COPCI | RO-S 351, 29-dic-2010 | Aduanas y comercio | **No obtenido** |

**Incidencia técnica registrada:** `www.ambiente.gob.ec` **no se pudo consultar** el 2026-10-17: el saludo TLS
falla (`SEC_E_ILLEGAL_MESSAGE`). No es un fallo de red puntual del lado del cliente —el resto de dominios
respondieron—, y queda anotado igual que en su momento se anotó el desafío de AWS WAF de EUR-Lex.

## 5. URLs y fecha de consulta

Todas consultadas el **2026-10-17**:

| Archivo | URL |
| --- | --- |
| `lotrta-ro-s-711-2016-03-14.pdf` | Ficha oficial: `https://www.asambleanacional.gob.ec/es/multimedios-legislativos/37677-ley-organica-de-tierras-rurales-y` → enlace «Descarga aquí»: `https://www.asambleanacional.gob.ec/sites/default/files/private/asambleanacional/filesasambleanacionalnameuid-29/Leyes%202013-2017/36-ley-tierras/RO-LEY%20DE%20TIERRAS-RO-SUP-711-14-03-2016.pdf` |
| `coa-ro-s-983-2017-04-12.pdf` | `https://www.asambleanacional.gob.ec/sites/default/files/private/asambleanacional/filesasambleanacionalnameuid-29/Leyes%202013-2017/102-ambiente/ro-cod-ambiente-ro-s-983-12-04-2017.pdf` |
| `mag-indice-normativa.pdf` | `https://www.agricultura.gob.ec/wp-content/plugins/download-monitor/download.php?id=4475&force=1` |
| Portal del Registro Oficial (estructura, §1) | `https://www.registroficial.gob.ec/` |

## 6. Qué haría falta para que P1-005 avance

En este orden, porque cada paso depende del anterior:

1. **Reconstruir la vigencia reforma a reforma desde el Registro Oficial** (criterio adoptado el 2026-10-17):
   fuentes oficiales como base, y las consolidaciones comerciales **solo como auxiliares identificadas**, nunca
   como publicación oficial ni como prueba de vigencia. Sin esto, ninguna regla puede declararse vigente.
2. **Obtener los textos de §4 que siguen faltando** y, sobre los ya obtenidos, **localizar y verificar sus
   reformas** en las ediciones posteriores del Registro Oficial. Ver `docs/decisiones/P1-005-MATRIZ-OBLIGACIONES.md`.
3. **Verificar visualmente** contra el PDF cada artículo que vaya a convertirse en regla. La extracción de
   texto es un **derivado**, no la fuente.
4. **Recién entonces** proponer el perfil: requisito, documento que lo acredita, regla, versión y aprobador.
   **Eso es una decisión, no un trabajo de recopilación**, y exige un aprobador con competencia jurídica.

**Nada de lo anterior está hecho**, y por eso **P1-005 sigue abierta** y el expediente sigue bloqueado.
