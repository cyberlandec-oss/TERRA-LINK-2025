# D-43 — Rotación de las claves de cifrado de datos personales (PROPUESTA, no ejecutada)

Archivo: `docs/decisiones/D-43-ROTACION-CLAVES-PII.md` · Revisión **1** (2026-10-16) · Estado: **PROPUESTA**.

**Nada de esto se ha ejecutado.** El documento existe para que la decisión se tome con los hechos delante, no
para registrar algo ya hecho. No contiene ninguna clave ni ningún valor.

## 0. Por qué

El 2026-10-16 un `grep` sobre `.env` imprimió en consola `PII_KEYS`, `PII_INDEX_KEY` y `SEED_ADMIN_PASSWORD`.
La tercera ya está **rotada** (`docs/qa/ROTACION_CREDENCIALES_DEMO_2026-10-16.md`). Las dos primeras son claves
criptográficas y no se rotan con un cambio de valor.

### Tres cosas distintas que conviene no confundir

| | Qué es | Exposición |
| --- | --- | --- |
| `SEED_ADMIN_PASSWORD` | **Contraseña de acceso** de una cuenta. Se guarda como hash argon2id; el valor solo sirve para iniciar sesión | **Resuelta**: rotada, sesiones invalidadas |
| `PII_KEYS` | **Claves criptográficas** AES-256-GCM. Descifran lo ya escrito, esté donde esté | **Abierta**: quien tenga `k1` descifra todo lo cifrado con `k1`, aquí y en los respaldos |
| `PII_ACTIVE_KEY_ID` | **Identificador** de cuál clave del llavero se usa al escribir. **No es un secreto**: aparece en claro dentro de cada token (`v1.<kid>.…`) | **Ninguna**: no hay nada que rotar |
| `PII_INDEX_KEY` | **Clave HMAC** del índice ciego. No descifra nada; permite **recalcular** el índice y, con ello, comprobar si un número de documento concreto está en la base | **Abierta**, con otro efecto: no revela datos, habilita confirmarlos por fuerza bruta sobre un espacio pequeño (una cédula tiene 10 dígitos) |

Que `PII_ACTIVE_KEY_ID` estuviera en la salida **no añade exposición**: su valor viaja en claro en cada token
cifrado, por diseño, para saber con qué clave descifrar.

## 1. Dónde vive cada cosa (inventario, sin valores)

### Configuración y contenedores

| Sitio | Qué contiene | Nota |
| --- | --- | --- |
| `.env` (raíz, no versionado) | Las tres variables | Origen de todo lo demás |
| `.env.example` | Solo los **nombres**, sin valores | Correcto como está |
| `docker-compose.yml` → `migrate`, `api` | `${PII_*:?definir en .env}` | El worker **no** las recibe: no descifra |
| `infra/qa16/docker-compose.ensayo.yml` | `${PII_*:?falta …}` | Ensayo de restauración |
| `scripts/validate-local.mjs` | Comprueba que **existen**; no las lee | Correcto |
| `apps/api/src/config.ts`, `src/crypto/pii.ts` | Las parsea y usa | Nunca las registra |

### Pruebas

`src/crypto/pii.spec.ts` y `test/producer-identity-encryption.int-spec.ts` **generan claves al vuelo** con
`randomBytes`. No usan las reales ni las incrustan. No hay nada que rotar ahí.

### Datos cifrados en la base

| Tabla · columna | Filas con dato | ¿Mutable? |
| --- | --- | --- |
| `producers.document_number_enc` | 6 | Sí |
| `producers.document_type_enc` | 6 | Sí |
| `producers.phone_enc` | 6 | Sí |
| `producers.address_enc` | 0 | Sí |
| `producers.document_number_bidx` (índice ciego) | 6 | Sí |
| `producer_versions.snapshot` → `*_enc` | **7 de 10 versiones** | **NO: `producer_versions_no_mutation` bloquea UPDATE y DELETE** |
| `import_rows.cells_enc` | 0 | **NO: `import_rows_guard` bloquea UPDATE y DELETE** |

**Todo el texto cifrado existente lleva `kid = k1`.** Comprobado leyendo el segundo campo del token, que no es
secreto.

### Respaldos

Tres, en `D:\PROYECTOS CYBER LAND\TERRA LINK EUDR 2026\_respaldos\`:

| Respaldo | ¿Lleva `claves.env`? |
| --- | --- |
| `2026-10-13-pretraslado` | **Sí** |
| `2026-10-13` | No |
| `2026-10-15-qa16` | **Sí** |

Los dos con `claves.env` contienen **la clave expuesta** junto al volcado que cifra. **No se borra ninguno y no se
retira ninguna clave**: sin ellas, ese respaldo deja de ser restaurable, que es peor problema que el que se
intenta resolver. Lo que cambia es **cómo se custodian** (§6).

## 2. Qué soporte de rotación existe realmente

**Comprobado en el código, no supuesto** (`apps/api/src/crypto/pii.ts`):

- `PII_KEYS` admite **varias claves**: `k1:<base64>,k2:<base64>`. `parsePiiConfig` las carga todas.
- `encrypt()` usa **siempre** la de `PII_ACTIVE_KEY_ID` y escribe su identificador dentro del token.
- `decrypt()` elige la clave **por el `kid` del token**, no por la activa.

⇒ **Activar una clave nueva funciona hoy, sin tocar un solo dato**: lo nuevo se cifra con `k2`, lo viejo se sigue
descifrando con `k1`. Hay una prueba que lo fija (`pii.spec.ts`: cifrar con `k1`, rotar a `k2`, descifrar ambos).

**Lo que NO existe**: ninguna herramienta de **recodificación** (releer, descifrar con `k1` y volver a cifrar con
`k2`), y ninguna de **reindexado** del índice ciego. Habría que escribirlas.

**Y lo que ninguna herramienta puede dar**: activar `k2` **no reduce la exposición de lo ya escrito**. Mientras
exista un solo texto cifrado con `k1` —en la base, en un respaldo o en un volcado— quien tenga `k1` lo descifra.
La rotación protege **las escrituras futuras**; el pasado solo se protege recodificándolo **y** controlando las
copias.

## 3. El obstáculo que decide el alcance: el historial es inmutable

`producer_versions` es **append-only por trigger**. Siete de sus diez filas llevan texto cifrado con `k1`. Esto
deja tres caminos, y hay que elegir uno con los ojos abiertos:

| Camino | Qué hace | Qué cuesta |
| --- | --- | --- |
| **A. Solo adelante** | Activar `k2`; lo nuevo con `k2`, lo viejo con `k1`. No se toca ningún dato | **No remedia nada de lo existente.** `k1` sigue siendo necesaria y su exposición sigue valiendo. Coste: nulo. Riesgo: nulo |
| **B. Recodificar lo mutable** | A + recodificar `producers.*_enc` a `k2`. El historial se queda con `k1` | Remedia el **estado actual**, no el historial. `k1` sigue haciendo falta para leer el historial, así que **sigue viva**. Coste: bajo |
| **C. Recodificar todo** | B + reescribir `producer_versions.snapshot` | Exige **desactivar el trigger de inmutabilidad**, es decir, romper la invariante que el proyecto sostiene en todas partes («corrige mediante un nuevo registro relacionado al original»). Deja de ser cierto que el historial no se modificó |

**Recomendación: B, y declarar el límite.** C compra poco —`k1` solo desaparece si además se recodifican los
respaldos, que son inmutables por definición— y paga con la credibilidad del historial, que es justamente lo que
un expediente de debida diligencia necesita. Si el historial debe dejar de ser legible con `k1`, el camino honesto
no es reescribirlo en silencio sino **decidirlo explícitamente**, registrarlo como una decisión con su motivo y
dejar constancia de que esas filas se reescribieron: es un cambio de naturaleza, no una tarea de mantenimiento.

**Dato que pesa en la decisión**: los datos de esta base son **sintéticos** (DEMO y pruebas). La exposición no
afecta a ninguna persona real. Eso no justifica dejarlo sin resolver, pero sí ordena el coste aceptable.

## 4. Procedimiento propuesto (camino B), reversible

### 4.0 Antes de nada

1. **Respaldo nuevo y completo**, con el procedimiento de `docs/20` §«Respaldo y restauración verificada»:
   volcado, objetos, `claves.env` —que aquí debe llevar **`k1` y `k2`**—, `estado-actual.txt` y `SHA256SUMS.txt`.
   Carpeta `_respaldos/<fecha>-pre-rotacion-pii/`.
2. **Restaurarlo y verificarlo** en el entorno aislado **antes** de tocar nada. Si la copia no se restaura, no se
   rota: no se empieza un cambio sin salida.
3. Anotar los conteos de §1 como línea base: 6 productores con documento, 7 versiones con texto cifrado.

### 4.1 Activar la clave nueva (reversible)

1. Generar `k2` (32 bytes) y **añadirla** a `PII_KEYS` **sin quitar `k1`**.
2. `PII_ACTIVE_KEY_ID=k2`.
3. Reiniciar `api` y `migrate`. Comprobar: alta de un productor de prueba → su token empieza por `v1.k2.`; los
   productores existentes se siguen leyendo.

**Reversión**: volver `PII_ACTIVE_KEY_ID=k1`. Lo escrito con `k2` se sigue leyendo mientras `k2` esté en el
llavero. **Nunca se retira una clave del llavero mientras exista un solo token con su `kid`**, aquí o en un
respaldo restaurable.

### 4.2 Recodificar `producers` (reversible)

Herramienta nueva, en una migración o un script de mantenimiento auditado:

1. Por cada fila con `*_enc`: descifrar con el `kid` del token y el **AAD exacto** —`producer|<org>|<id>|<campo>`;
   el AAD liga el texto cifrado a su fila y a su campo, así que un error aquí **falla al autenticar** en vez de
   corromper en silencio— y volver a cifrar con la activa, con el mismo AAD.
2. Fila a fila, en una transacción por fila, comparando **el valor descifrado antes y después**: si no coincide,
   se aborta esa fila y se registra.
3. `UPDATE` sobre `producers` (tabla mutable: no hay trigger que lo impida).
4. **No** se tocan `producer_versions` ni `import_rows`.
5. Registrar en `audit_logs` una entrada por fila, con `action = 'producer.pii_rekeyed'`, sin valores.

**Comprobaciones de integridad** (todas, antes de dar por buena la recodificación):

- Conteo de filas con `*_enc` **idéntico** al de la línea base: 6.
- Ninguna fila con `kid = k1` en `producers` y **todas** con `kid = k2`.
- Descifrado de las 6 filas correcto, **sin imprimir valores**: se compara el hash del valor descifrado contra el
  tomado antes de empezar.
- `producers_document_bidx_consistent` (el `CHECK` que exige que `document_number_enc` y `document_number_bidx`
  sean ambos nulos o ambos no nulos) sigue satisfecho.
- `producer_versions` **intacta**: mismo número de filas y mismo hash del conjunto de `snapshot`.

**Reversión**: restaurar el respaldo de §4.0. Como `k1` sigue en el llavero, una reversión parcial también
funciona: lo recodificado se lee con `k2` y lo no recodificado con `k1`.

### 4.3 Rotar el índice ciego (`PII_INDEX_KEY`) — decisión aparte

**Es un cambio distinto y puede hacerse después, o no hacerse.** Rotarlo exige recalcular
`producers.document_number_bidx` para las 6 filas: descifrar el número, normalizarlo
(`normalizeDocumentNumber`: mayúsculas, sin espacios, puntos ni guiones) y recalcular
`HMAC-SHA256(indexKey, "<org>|DOC|<normalizado>")`.

**Qué se rompe si se hace a medias**: el índice es **determinista y por organización**. Si unas filas quedan con
la clave vieja y otras con la nueva, dos productores con el mismo documento **dejan de coincidir** y la detección
de duplicados (P0-005) empieza a decir que no hay duplicados donde los hay — un falso negativo silencioso, que es
el peor resultado posible. Por eso el reindexado es **todo o nada, en una sola transacción**.

**Comprobaciones obligatorias después de reindexar**:

| Qué | Cómo |
| --- | --- |
| **Búsqueda por documento** | `GET /producers?q=<número>` con un documento conocido devuelve al productor. Antes y después, mismo resultado |
| **Detección de duplicados** | Dar de alta dos productores con el mismo tipo y número en la misma organización abre un caso `PENDING` (regla de P0-005). Debe seguir abriéndose |
| **Casos ya revisados** | Los casos de duplicado existentes siguen enlazados a los mismos pares, sin reabrirse ni duplicarse |
| **Aislamiento entre organizaciones** | El mismo número en dos organizaciones **no** coincide: el índice incluye `organization_id` |
| **Consistencia** | Cero filas con `document_number_enc` no nulo y `document_number_bidx` nulo, o al revés |

**Reversión**: el índice se **recalcula**, no se recuerda; volver a la clave anterior y reindexar otra vez
devuelve exactamente los mismos valores. Es la parte más reversible de todo esto, siempre que la clave anterior se
conserve hasta haber comprobado la nueva.

**El historial no se ve afectado**: `producer_versions.snapshot` **no guarda el índice ciego** (comprobado: sus
claves son `*_enc`, sin `document_number_bidx`). Reindexar no toca ninguna tabla inmutable.

## 5. Qué seguirá expuesto, pase lo que pase

Hay que decirlo sin rodeos, porque ninguna rotación lo cambia:

1. **Los respaldos existentes.** `2026-10-13-pretraslado` y `2026-10-15-qa16` contienen volcados cifrados con
   `k1` **y** un `claves.env` con `k1`. Siguen siendo legibles para quien tenga ambas cosas. **No se borran** —son
   la única vuelta atrás ante un desastre— y **no se les retira la clave** —sin ella no se restauran—.
2. **El historial `producer_versions`**, si se elige el camino B: 7 filas seguirán cifradas con `k1`, y por eso
   `k1` seguirá viva en el llavero.
3. **La transcripción de la sesión** donde se imprimió el valor. Rotar no borra lo escrito.

**Custodia propuesta para los respaldos** (no cambia su contenido):

- Cada carpeta de respaldo, con ACL restringida al usuario (`icacls … /inheritance:r`), ya previsto en `docs/20`;
  **verificarlo** en las tres carpetas, porque hasta ahora solo estaba escrito para `claves.env`.
- Un `LEEME-CLAVES.md` en cada respaldo que diga **qué clave hace falta** —por su `kid`, nunca por su valor— y que
  esa clave está expuesta desde el 2026-10-16.
- En el inventario de respaldos, marcar los dos afectados como **«cifrados con clave expuesta»**, de modo que si
  algún día salen del equipo se sepa qué se está moviendo.
- Para respaldos **nuevos**: se crean ya con `k2` activa, así que no heredan el problema.

## 6. Qué decidir

| # | Decisión | Opciones |
| --- | --- | --- |
| 1 | Alcance de la recodificación | **A** (solo adelante) · **B** (recomendada: + `producers`) · **C** (+ historial, rompiendo su inmutabilidad) |
| 2 | ¿Se rota también `PII_INDEX_KEY`? | Sí (reindexado todo-o-nada + comprobaciones de §4.3) · No (se asume que un atacante con la clave puede confirmar documentos concretos) |
| 3 | Custodia de los respaldos afectados | Aceptar §5 · Otra |
| 4 | Cuándo | Antes de la próxima historia · Después del piloto |

**Mientras no se decida**: `k1` sigue activa, el sistema funciona igual y la exposición sigue siendo la descrita.
Ninguna de estas opciones habilita llamadas satelitales, `READY`, conclusiones regulatorias ni despacho.
