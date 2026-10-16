# Rotación de credenciales DEMO — segunda exposición (2026-10-16)

Entorno local de desarrollo, cuentas **DEMO sintéticas**. No existe entorno de producción. Este documento no
contiene ninguna contraseña, ni anterior ni nueva. Continúa `docs/qa/ROTACION_CREDENCIALES_DEMO_2026-10-14.md`.

## 1. Qué pasó, y por qué volvió a pasar

Preparando una consulta de verificación a la API se inspeccionó `CREDENCIALES.csv` con
`cut -d, -f1-3`. La tercera columna es `contrasena`. Se imprimieron **la cabecera y cinco filas**.

Es **la misma causa que el 2026-10-14**: para armar un `curl` hacía falta una contraseña, y se miró el archivo con
una herramienta de texto que seleccionaba la columna del secreto. La corrección de aquel día fue una **regla
escrita** («no se imprime nunca la columna `contrasena`»). Una regla no impide repetir el gesto cuando la tarea
—consultar la API con una cuenta— no tiene una herramienta que la haga sin secretos. Por eso esta vez la
corrección es una **herramienta**, no otra advertencia.

**Segunda exposición, en la misma sesión**: al comprobar la configuración del despliegue se ejecutó un `grep` sobre
`.env` que imprimió `PII_KEYS`, `PII_INDEX_KEY` y `SEED_ADMIN_PASSWORD`. Son secretos **de distinta naturaleza** y
**no están cubiertos por la autorización de rotación** de esta tarea; se tratan en §6.

## 2. Alcance exacto de la exposición de cuentas

Delimitado con certeza: el comando y su salida constan en la transcripción de la sesión.

| | |
| --- | --- |
| Cuentas expuestas | `superadmin.revision`, `admin.cooperativa`, `supervisor.cooperativa`, `tecnico1.cooperativa`, `tecnico2.cooperativa` (**5**, dominio `@demo.terralink.local`) |
| Incluye plataforma | **Sí**: `superadmin.revision` es la cuenta `SUPER_ADMIN` de revisión, y es la que más urgía |
| No expuestas | Las otras 14 cuentas DEMO: el listado se cortó en la quinta fila |

Un segundo comando leyó la contraseña de `admin.cooperativa` **a una variable de shell**, sin imprimirla; esa
cuenta ya estaba en las cinco anteriores.

## 3. Rotación

Se usó **solo** el modo de rotación, `npm run seed:demo -w apps/api -- --rotar=<cuenta>`, una cuenta por
invocación. Comprobado en el código antes de ejecutarlo: esa rama **retorna antes** de cualquier alta de
organizaciones, usuarios, parcelas o datos operativos — **no repuebla nada**.

Orden seguro, sin cambios: 1) guardar la credencial nueva en los archivos locales; 2) activarla en la base e
invalidar sesiones (`token_version + 1`); 3) verificar login nuevo y rechazo del anterior; si 2 falla, se
restauran los archivos.

### Dos defectos del mecanismo, corregidos antes de rotar

1. **`--rotar` se bloqueaba con el archivo abierto.** Escribía en *todos* los archivos de credenciales que
   existieran, así que un `CREDENCIALES.csv` abierto en Excel hacía fallar la rotación entera. Ahora escribe en los
   que **se puedan escribir**, aborta solo si no puede escribir ninguno, y **avisa** de que el bloqueado conserva
   una credencial muerta.
2. **La precedencia entre archivos era por orden fijo**, de modo que un principal bloqueado y atrasado imponía una
   contraseña que ya no servía. Ahora manda el **más reciente** — la regla que ya usaba `revision-por-rol.mjs` —, y
   al verificar se comprueba que **todas** las contraseñas anteriores conocidas quedan rechazadas, no solo una.

### Resultado

| | |
| --- | --- |
| Cuentas rotadas | Las **5** de §2, una por invocación |
| Verificación por cuenta | login nuevo correcto · credencial anterior **rechazada** · sesiones previas invalidadas — las 5 |
| Comprobación independiente | `token_version = 2` **exactamente** en esas 5; las otras 14 cuentas DEMO siguen en 1 o en 0 |
| Bitácora | 5 registros `user.password_rotated` |
| Datos conservados | 4 organizaciones, 20 usuarios, 21 membresías, 6 parcelas, 9 productores, 3 lotes, 3 entregas, 4 evaluaciones — **sin cambios** |

### Archivo vigente

**`CREDENCIALES.pendiente.csv` es el archivo vigente.** `CREDENCIALES.csv` sigue **abierto en otro programa**
desde el 2026-10-14 (su última escritura es de ese día) y **conserva las credenciales anteriores de esas cinco
cuentas, que ya no sirven**. Al cerrarlo, sustituirlo por el pendiente.

El seed, la revisión por rol y la utilidad de consulta ya resuelven esto solos: todos toman el **más reciente** de
los dos.

## 4. La corrección de fondo: una utilidad en vez de una regla

`e2e/review/consulta-api.mjs` hace lo que llevaba a mirar el CSV:

```
node e2e/review/consulta-api.mjs --listar-consultas
node e2e/review/consulta-api.mjs admin.cooperativa indicadores
node e2e/review/consulta-api.mjs eudr.cooperativa satelite
```

- **Lee la credencial del archivo vigente y la usa**; ni la contraseña ni el token salen por consola.
- La salida se limita a **cuenta, organización, rol y el resultado** de una consulta de una lista cerrada, cada
  una con su **proyección explícita**: no se vuelca la respuesta entera.
- Además, un **saneado por lista negra** recorre el resultado a cualquier profundidad y quita claves sensibles
  (`contrasena`, `access_token`, `password_hash`, `document_number`, `phone_enc`, `email`…). Dos capas, porque la
  proyección la escribe una persona y puede olvidarse.
- Probada con **credenciales ficticias** en un directorio temporal (`e2e/tests/consulta-api.spec.ts`): que la
  salida no lleva el secreto, que el saneado funciona dentro de listas y objetos anidados, que manda el archivo
  más reciente y que una cuenta sin credencial se rechaza en vez de consultarse a ciegas.

**A partir de ahora, para consultar la API con una cuenta DEMO se usa esta utilidad.** Queda prohibido el
procedimiento manual de leer el CSV y pasar la contraseña a `curl`. Para *mirar* el archivo siguen valiendo solo
las columnas de identificación, nunca `contrasena` (regla del 2026-10-14, que sigue vigente).

## 5. Qué NO resuelve esto

La exposición ocurrió en la transcripción de una sesión. La rotación **invalida** lo expuesto —esas contraseñas ya
no abren ninguna sesión—, pero **no borra lo escrito**: la transcripción sigue siendo material sensible.

## 6. Pendiente de decisión: los secretos de `.env`

El `grep` sobre `.env` expuso tres valores que **no** son cuentas DEMO y **no** están cubiertos por la
autorización de esta tarea. Se dejan **sin tocar** a propósito, porque dos de ellos no se rotan sin un
procedimiento:

| Secreto | Qué protege | Qué haría falta |
| --- | --- | --- |
| `SEED_ADMIN_PASSWORD` | La cuenta `admin@terralink.local` del seed de **desarrollo** (SUPER_ADMIN) | Rotación sencilla: cambiar el valor y la contraseña del usuario. **Pendiente de autorización** |
| `PII_KEYS` + `PII_ACTIVE_KEY_ID` | Cifrado AES-256-GCM de datos personales en reposo | El llavero **sí admite rotación**: añadir `k2`, activarla y seguir descifrando con `k1`. Pero `k1` quedó expuesta, así que lo ya cifrado sigue siendo legible para quien la tenga: remediarlo de verdad exige **re-cifrar** los campos existentes |
| `PII_INDEX_KEY` | Índice ciego (HMAC) para búsqueda exacta sin descifrar | Cambiarla **invalida todos los índices existentes**: la búsqueda exacta deja de encontrar nada hasta reindexar. No se toca sin un procedimiento de reindexado |

Los datos protegidos son **sintéticos y locales**. Aun así, la decisión es del responsable del proyecto, no de
quien ejecuta la tarea, porque dos de las tres opciones pueden dejar datos ilegibles o búsquedas rotas.

**Mientras tanto**, la misma regla de §4 se extiende a `.env`: no se imprime, ni entero ni filtrado. Para saber si
una variable está puesta se mira el **efecto** —por ejemplo `live_calls_enabled` en la respuesta de la API— o el
nombre de la variable en el contenedor, nunca su valor.
