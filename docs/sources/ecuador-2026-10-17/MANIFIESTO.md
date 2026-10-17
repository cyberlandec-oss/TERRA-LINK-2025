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

| Archivo | Qué es | Autoridad emisora | Bytes | sha256 |
| --- | --- | --- | ---: | --- |
| `coa-ro-s-983-2017-04-12.pdf` | **Texto normativo** (ver §2.1) | Asamblea Nacional del Ecuador (repositorio propio) | 1 660 486 | `033ffdd280975aabb0b89f6634b4e7f9462b3a835d49abcbbecefdaed96e61af` |
| `mag-indice-normativa.pdf` | **Índice institucional, NO texto normativo** (ver §2.2) | Ministerio de Agricultura y Ganadería | 501 628 | `c513533bcc7ff3c88848169706c811c9a84929e31cd58cc4e6465fc181609651` |

URLs y fecha de consulta en §5.

### 2.1 `coa-ro-s-983-2017-04-12.pdf` — Código Orgánico del Ambiente

| | |
| --- | --- |
| Autoridad emisora | **Asamblea Nacional del Ecuador** (el archivo procede de su repositorio institucional) |
| Publicación declarada | Registro Oficial **Suplemento 983**, de **12 de abril de 2017** |
| Versión consultada | **Publicación original**, no consolidada |
| Formato | PDF de **136 páginas**, **escaneado**: imágenes `DCTDecode` y **sin capa de texto** (`ToUnicode` ausente) |
| Fecha de consulta | 2026-10-17 |

**Dos límites que hay que declarar, y no son menores:**

1. **El contenido no se ha verificado.** Sin capa de texto no se puede leer ni buscar automáticamente. La
   identificación de arriba procede del **nombre y la ruta del archivo en el repositorio de la Asamblea** y de
   la referencia secundaria de la búsqueda, **no de haber leído el documento**. Confirmarlo exige abrirlo o
   pasarle OCR, y el OCR **no es fuente**: introduce errores y no puede sustentar una regla jurídica.
2. **No incorpora reformas.** Es el texto tal como se publicó en 2017. Una búsqueda secundaria menciona una
   reforma en el Suplemento del Registro Oficial **309, de 21 de agosto de 2018**; **no se ha verificado
   contra el Registro Oficial** y aquí se registra como **dato sin confirmar**, no como hecho.

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
| **Texto normativo** | Lo publicado en el Registro Oficial | Una regla, **si** se confirma su vigencia | `coa-…pdf` (original 2017, vigencia **sin confirmar**) |
| **Índice o compilación institucional** | Listado que una entidad hace de las normas que la rigen | Orientación; **nunca** una regla | `mag-indice-normativa.pdf` |
| **Guía, manual o resolución técnica** | Material operativo de una agencia (p. ej. manuales de Agrocalidad) | Práctica administrativa; **no** sustituye a la norma | **Ninguno** incorporado |
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
| Ley Orgánica de Tierras Rurales y Territorios Ancestrales | RO-S 711, 14-mar-2016 | **Uso del suelo y tenencia**: el núcleo de la legalidad de la parcela | **No obtenido**: copia localizada de ~22,8 MB, no descargada |
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
| `coa-ro-s-983-2017-04-12.pdf` | `https://www.asambleanacional.gob.ec/sites/default/files/private/asambleanacional/filesasambleanacionalnameuid-29/Leyes%202013-2017/102-ambiente/ro-cod-ambiente-ro-s-983-12-04-2017.pdf` |
| `mag-indice-normativa.pdf` | `https://www.agricultura.gob.ec/wp-content/plugins/download-monitor/download.php?id=4475&force=1` |
| Portal del Registro Oficial (estructura, §1) | `https://www.registroficial.gob.ec/` |

## 6. Qué haría falta para que P1-005 avance

En este orden, porque cada paso depende del anterior:

1. **Resolver la consolidación.** Decidir si se acepta reconstruir la vigencia reforma a reforma desde el
   Registro Oficial —trabajo manual y auditable— o si se recurre a una consolidación comercial, **declarando
   que no es fuente oficial**. Sin esto, ninguna regla puede declararse vigente.
2. **Obtener los textos de §4**, empezando por la **Ley de Tierras Rurales**, que es la que gobierna la
   legalidad de la parcela.
3. **Conseguir textos legibles**, no escaneados: una copia sin capa de texto no permite citar artículo por
   artículo. El OCR **no es fuente**.
4. **Recién entonces** proponer el perfil: requisito, documento que lo acredita, regla, versión y aprobador.
   **Eso es una decisión, no un trabajo de recopilación**, y exige un aprobador con competencia jurídica.

**Nada de lo anterior está hecho**, y por eso **P1-005 sigue abierta** y el expediente sigue bloqueado.
