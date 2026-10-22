# Evidencia — D-07.6 conclusión humana del responsable EUDR (2026-10-22)

**Alcance de lo demostrado:** el *mecanismo* existe, está validado localmente y desplegado. **No** acredita aceptación regulatoria
real, conformidad EUDR ni preparación para producción. No se registró ninguna conclusión sobre datos operativos.
La cobertura de requisitos aceptados (42/60; MVP 30/44 = 68,2 %) **no cambia** y no es un porcentaje de código construido.

## 1. Candidatos y validaciones (todas conservadas en `validation-results/`)

| SHA | Contenido | Resultado | Corrida |
| --- | --- | --- | --- |
| `0864fc4` | D-07.6 inicial (migración 0064) | **FALLIDO** (76 fallos: *timeouts* y 401; suite de 35 144 s) | `2026-10-22T04-55-41-097Z` |
| `5176d70` | favorable exige resolver cada carencia (0065) + excepción de asignación exacta | **FALLIDO** (E2E) | `2026-10-22T15-56-26-119Z` |
| `6ea3d10` | aislamiento de los specs E2E de la base compartida | **FALLIDO** (3 corridas) | `…T16-51-23-415Z`, `…T17-26-19-665Z`, `…T17-28-29-014Z` |
| **`747ac41`** | `6ea3d10` + Next.js 16.4.2 | **APROBADA** (servicios, typecheck, lint, build, openapi-validado, unitarias+integración 1 922 s, e2e 405 s) | `2026-10-22T17-36-04-543Z` |

Diagnósticos (primer error de cada corrida):
- `0864fc4`: la causa **no está establecida**. Hubo una posible suspensión del equipo durante la corrida; es **una hipótesis**, no
  una conclusión. **No se afirma que se descartara un defecto de código**; la corrida siguiente se hizo con el equipo mantenido
  despierto y el código corregido en otros puntos, de modo que no la aísla.
- `5176d70`: colisión de correo entre `conclusion-humana.spec.ts` y `concesiones.spec.ts` (401 al aceptar invitación) y
  contaminación entre specs por el estado global compartido (perfil jurídico y catálogo son globales y *append-only*).
  Corrección: correos y versiones propias y aserciones que no dependen del estado global (`6ea3d10`).
- `6ea3d10`: el CLI de Next.js 16.4.0 abortó la compilación (`SecurityFatalError`: versión con vulnerabilidad conocida) en el paso
  `build` en tres corridas; una compilación manual posterior continuaba ("continuing after the upgrade reminder"). Corrección:
  actualizar Next.js (§4). No se repitió hasta obtener verde: la repetición respondió a ese diagnóstico.

Arnés: `synchronous_commit=off` solo en bases desechables `*_test`; las pruebas de durabilidad/recuperación usan la configuración
operativa (`durable: true`, `apps/api/test/harness-durabilidad.int-spec.ts`). El fallo de `576aa53` se registra como *timeout*
con latencia observada; **no se afirma una causa física**.

## 2. Criterio de la conclusión favorable (NEGLIGIBLE)

Base: Reg. (UE) 2023/1115 arts. 2(26), 10(1)-(2) y 11; `docs/13`; S1 §722–724. El criterio del ejemplo de S1 usado antes en
`D-07-PROPUESTA.md` §11.4 era una propuesta de ingeniería, no un criterio original (errata en esa sección).

La favorable exige, además de las condiciones comunes (evaluación vigente y última; registrante ≠ evaluador; catálogo adoptado):
perfil jurídico enlazado, completo y con revisión vigente; sin hallazgos bloqueantes; proceso de revisión resuelto si se requería;
y **cada carencia** de la evaluación (`risk_evaluation_gaps`: factor de regla no evaluable o categoría sin reglas) resuelta
**por separado**: «no aplicable» con justificación y evidencia, o «valorada por una persona» con justificación y versión de
documento. Cada resolución queda vinculada a su carencia concreta y a su soporte autorizado.

Límites que se mantienen:
- Mostrar una limitación **no** la resuelve; una evidencia adjunta **no** resuelve todas las carencias.
- Registrar «no aplicable» o adjuntar un documento **no** convierte información faltante en una evaluación favorable ni sustituye
  otros requisitos obligatorios (`RISK_NO_BLOCKING_FINDINGS`, `GEOLOCATION_PROFILE`, `DEFORESTATION_ANALYSIS`, `READY`).
- **Rechazar justificaciones idénticas es solo una comprobación formal**: no demuestra que el análisis sea suficiente. La
  valoración de fondo es humana y de la persona responsable; este mecanismo no la sustituye ni la mide.
- El motor nunca concluye (`conclusion = UNDETERMINED` por `CHECK`). Registrar una conclusión no anula requisitos pendientes ni
  habilita READY o despacho. Una conclusión se invalida si cambian evaluación, perfil o catálogo.

## 3. Roles: enmienda acotada a `docs/07` líneas 91–92

Regla vigente: un rol asignable debe ser subconjunto de los permisos del actor; nadie cambia sus propios roles.
**Excepción única y exacta:** el par (`EUDR_MANAGER`, `risk:conclude`) puede ser asignado por quien tenga `membership:assign`,
sin tener `risk:conclude`. Consecuencias comprobadas (`catalog.spec.ts`, `rbac.int-spec.ts`):
`ORG_ADMIN` asigna `EUDR_MANAGER` **solo dentro de su organización**, sigue **sin poder concluir** (403), no obtiene capacidad para
conceder permisos arbitrarios, no asigna `SUPER_ADMIN` ni administra miembros de otra organización (404). `risk:conclude` solo
existe en `EUDR_MANAGER`. Límite: una persona con ambos roles queda fuera de este control (separación administrar/concluir
no aplicable a ella); se registra como pendiente de política.

## 4. Seguridad de dependencias (después de la validación; sin modificar el candidato)

**Next.js 16.4.0 → 16.4.2** (`apps/web`, `^16.4.2`). Avisos identificados y resultado (`npm audit --omit=dev`):
| Aviso | Gravedad | Descripción | Resultado en 16.4.2 |
| --- | --- | --- | --- |
| GHSA-2464-fhr4-w9xw | crítica | RCE sin autenticación en la API de optimización de imágenes con SVG | **ya no figura** |
| GHSA-p3m5-59mp-jv5r | — (DoS) | denegación de servicio en App Router con Server Actions | **ya no figura** |
Afectaba `16.0.0 – 16.4.0`. La auditoría de producción dejó de listar ambos avisos de Next.js. No se probó explotación ni se
ejecutó una prueba específica de esos vectores; la evidencia es la auditoría y la validación completa aprobada.

**Pendientes identificados (moderados; no justifican reiniciar esta entrega):**
- `js-yaml` GHSA-r3ph-w7gj-g6xm (`maxTotalMergeKeys` no limita el uso de CPU con fuentes de fusión vacías). Rangos afectados:
  `3.2.7 – 3.15.2` y `5.0.0 – 5.4.0`; hay versiones 5.4.1–5.5.0 publicadas. Cadena en el árbol:
  - `@nestjs/swagger@11.4.7` → `js-yaml@5.3.0` (**afectada**, dependencia de producción de `apps/api`);
  - `@apidevtools/swagger-parser@13.1.0` → `…json-schema-ref-parser@16.0.3` → `js-yaml@5.4.3` (no afectada según el rango);
  - `ts-jest@29.4.14` → `@jest/transform` → `babel-plugin-istanbul` → `@istanbuljs/load-nyc-config` → `js-yaml@3.15.2`
    (**afectada**, solo desarrollo/pruebas; `^3.13.1` fijado por esa librería, sin versión 3.x corregida publicada).
  `@nestjs/swagger@11.4.7` declara `js-yaml` exacto `5.3.0`; `@nestjs/swagger@12.0.3` declara `5.5.0`. `npm audit fix` propone
  `@nestjs/swagger@12.0.3` (cambio mayor). **Comprobado:** dentro de la serie 11 no hay corrección por actualización simple.
  **No comprobado:** si una resolución (`overrides`) a `js-yaml ≥ 5.4.1` es compatible con `@nestjs/swagger@11`; ni el impacto
  real (solo se parsea la especificación propia). Se decide en una entrega aparte.
- `sprintf-js` GHSA-hp3w-g68c-fv3c (DoS por precisión sin límite), por `argparse` (cadena de `js-yaml@3`): solo desarrollo.
- En la auditoría completa (con desarrollo) figuran además avisos de la cadena de jest (`braces`, `micromatch`, `expect`, `@types/jest`)
  cuya "corrección" propuesta por npm es una degradación o cambio mayor; no se aplicó nada.

## 5. Despliegue, demostración y respaldo

- Despliegue del SHA exacto con `node scripts/desplegar.mjs`: `/version` = `747ac41`, esquema `0065_d076_carencias_conclusion_favorable`, sin `+sucio`; contenedores sanos.
- Demostración `node e2e/review/conclusion-humana-demostracion.mjs`: **11/11** comprobaciones, estado real conservado
  (0 conclusiones, 13 evaluaciones, 13 instantáneas; los expedientes siguen `REGULATORY_CONCLUSION = NOT_EVALUABLE`); la favorable
  aparece deshabilitada con lo que falta; ORG_ADMIN 403 al registrar y 200 al consultar; otra organización 404; la base rechaza
  favorable sin perfil y conclusión sin evidencia; pantalla es/en, teclado y 390 px.
- Respaldo `_respaldos/2026-10-22-conclusion-humana-0064-0065/` (volcado `-Fc`, objetos, `claves.env` restringido, `estado-actual.txt`,
  `SHA256SUMS.txt` verificado). Restauración aislada (`tl-restore`, sin seed ni migraciones): 65 migraciones, conteos idénticos
  (`restaurada.txt`), 7 *triggers* de conclusión presentes; una inserción favorable sintética fue rechazada por la guarda de
  coherencia (antes que por la de resoluciones) y se revirtió (0 conclusiones). El rechazo específico por carencias sin resolver
  se acredita en las pruebas de integración y en la demostración, no en esta restauración. Contenedor y volumen retirados; 27
  volúmenes intactos.

## 6. Pendiente (no ejecutado)

Aceptación regulatoria real de la conclusión y del criterio; revisión jurídica real de los perfiles; Android; producción;
actualización de `js-yaml`/`@nestjs/swagger` (§4); política para quien tenga a la vez `ORG_ADMIN` y `EUDR_MANAGER`.
