# Evidencia — QA integral local y revisión de seguridad (2026-10-22)

**Alcance:** comprobaciones automatizadas del propio repositorio, en el equipo local. **No es una auditoría independiente**;
la revisión externa de ciberseguridad sigue siendo un gate aparte (docs/16 §Definition of Done). No se probaron servicios
externos, no se alteraron datos operativos y no se registró ninguna aprobación regulatoria.

## 1. Estado de partida
- `9cb5156` frente a `747ac41`: solo `package.json`, `package-lock.json` y documentación. `9cb5156` está acreditado por su propia validación (`2026-10-22T22-20-37-609Z`). No se repitió nada para documentarlo.

## 2. Hueco de verificación identificado
docs/16 §«Comprobaciones críticas de seguridad» pide enumerar **todos** los métodos de la superficie con prueba positiva A→A y negativa A→B. La evidencia previa
(`CONTRASTE_SEGURIDAD_2026-10-15.md`) era **por módulo**; no existía un barrido de toda la superficie.

## 3. Barrido de la superficie HTTP — `apps/api/test/barrido-rutas.int-spec.ts`
Enumera las 288 rutas del OpenAPI real. Base desechable `*_test`, datos sintéticos. Las pruebas de autorización usan una instancia **sin la pipe de validación**
(con ella, una escritura con cuerpo vacío responde 400 antes de llegar a la autorización y no probaría nada) y rellenan parámetros obligatorios de consulta y archivos sintéticos.
- Sin credenciales: toda ruta responde **401**, salvo 12 públicas por diseño (cada una con su razón en el código); ninguna da 5xx.
- Usuario de **otra organización** sobre cada ruta de la organización ajena: **403/404** (excepción documentada: `GET …/exchange/format`, descriptor estático sin datos, exige sesión).
- Rutas de plataforma con un administrador de organización (sin SUPER_ADMIN): 403/404.
- **AUDITOR** (solo lectura) sobre cada escritura de su organización: nunca 2xx ni 5xx.
- Controles: A→A responde 200; con el administrador propio el mismo recorrido obtiene >20 respuestas 2xx (sensibilidad: un 2xx indebido sería visible).
- **Resultado: sin fugas ni escrituras indebidas.** Límites: el AUDITOR es el único rol probado en escrituras; los permisos finos por rol siguen cubiertos por las pruebas de cada módulo; el barrido envía cuerpos vacíos, no prueba referencias cruzadas dentro de cuerpos válidos (cubiertas por módulo, QA-02).
- En el entorno desplegado (`29ab9bf`): 171 rutas GET sin credenciales, 0 anomalías.

## 4. Hallazgos y correcciones
| # | Hallazgo (reproducido) | Corrección | Prueba |
| --- | --- | --- | --- |
| 1 | PostgreSQL (5440), Redis **sin contraseña** (6379) y almacenamiento S3 con clave raíz (9000) se publicaban en `0.0.0.0` (solo el escáner estaba en loopback) | `docker-compose.yml`: los tres en `127.0.0.1`. El móvil usa `adb reverse` y no hay URLs prefirmadas, así que nada depende de la red local | `apps/api/src/infra-exposicion.spec.ts` (incluye sensibilidad con un compose sintético); comprobado en el despliegue |
| 2 | La API y la web no enviaban cabeceras de seguridad básicas; la API mostraba `X-Powered-By: Express` | API: sin `x-powered-by`, `nosniff`, `Referrer-Policy: no-referrer`. Web: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (geolocalización y cámara solo del propio origen) | barrido (3 rutas, incluidos errores 401/404) y `e2e/tests/cabeceras-seguridad.spec.ts`; comprobado en el despliegue |

**No se añadió CSP** a propósito: exige revisar scripts en línea de Next y orígenes de mapas; queda como mejora pendiente. Los datos quedan en la red de Docker y el host solo los alcanza por loopback.

## 5. Validaciones (todas conservadas)
| SHA | Resultado | Corrida |
| --- | --- | --- |
| `3335cd1` | **FALLIDA** en E2E: 1 fallo de 135 (`parcelas.spec.ts:67`); el resto, incluidos los nuevos, pasó | `2026-10-22T23-40-58-898Z` |
| **`29ab9bf`** | **APROBADA** (integración 2 283 s, e2e 500 s) | `2026-10-23T00-37-00-488Z` |

Diagnóstico del fallo: la captura final muestra el aviso de conflicto aún visible y el formulario sin la variedad guardada por la otra pestaña. El test pulsaba «Guardar» justo
después de «Recargar versión actual» **sin esperar a que terminara la recarga**, por lo que enviaba la versión vieja y volvía a dar conflicto. Se clasifica como **carrera del test**
(inferida de ese estado; el producto actualiza `row_version` al terminar la recarga). Corrección en `29ab9bf`: el test espera a que desaparezca el aviso antes de guardar; no se redujo ninguna aserción ni se subió ningún plazo. Que la corrida siguiente pase **no demuestra por sí solo** la causa.

## 6. Despliegue
`29ab9bf` desplegado (`/version`, esquema 0065, sin `+sucio`); contenedores de datos recreados con volúmenes intactos (27) y datos presentes (13 evaluaciones). Sin migración: no se hizo respaldo nuevo.

## 7. Revisado sin hueco nuevo (evidencia existente reutilizada)
Aislamiento y permisos por módulo (`rbac`, `members`, `access-grants`), concesiones, documentos y fotografías (`documents`, `scanner-limits`), SSO (`sso`), inventario/concurrencia/idempotencia (`inventory`, `lots`, `shipments`), vigencia de evaluaciones/conclusiones (`risk`, `risk-conclusion`), rechazo de READY y despacho (`dd`, `d34a-despacho`), traspasos (`custody-transfers`), dependencias (`npm audit --omit=dev`: 0) y secretos (`.env` y credenciales ignorados por git; sin secretos versionados en el código revisado con búsqueda de patrones).

## 8. Pendiente de aceptación externa o de decisión
Revisión independiente de ciberseguridad; CSP (evaluación); avisos de desarrollo de la cadena jest; aceptación regulatoria de D-07.6; D-05.B, D-07.5(a)/P1-005, D-09.B, GUIA/EUDR-IS; piloto de P1-015 (criterio original, no sustituible por evidencia local); Android físico.
