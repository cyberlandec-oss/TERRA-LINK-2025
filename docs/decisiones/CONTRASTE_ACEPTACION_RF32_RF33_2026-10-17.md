# Contraste de aceptación — RF-32, RF-33, P1-001 y P1-002 (2026-10-17)

Contraste **sobre la documentación y la evidencia existentes**. Sin implementación nueva, sin validación y sin
reconstrucción.

## 1. El hallazgo que ordena todo lo demás: «por audiencia» no está en las fuentes

Se buscó la palabra **«audiencia» en las cuatro fuentes**. Aparece **una sola vez**, y es la cabecera de
lectores del propio documento:

> `S1, línea 10: «Audiencia: CTO, Tech Lead, Backend, Frontend, Mobile, GIS/Data Engineer, QA, DevOps»`

**No es un requisito de producto.** «QR/pasaporte digital **por audiencia**» es la redacción de **RF-33 en
`docs/03`**, un documento **derivado**, no de la fuente. Lo que las fuentes sí describen:

| Fuente | Qué dice literalmente |
| --- | --- |
| **S1 §49** | «QR. […] Entidades: Producer, Plot, Delivery, Lot, Package, Shipment. Cada una podrá tener `public_reference`. Nunca exponer directamente IDs internos» |
| **S3 §22.8** | «Buyer Portal […] **Con acceso controlado**», con una lista de indicadores |
| **S3** (dos menciones) | «Tu cacao tiene un **pasaporte digital de origen**» · «DDS + exportación + comprador + pasaporte digital» |

**Las únicas audiencias que las fuentes describen son dos: la interna que opera y el comprador con acceso
controlado.** Las dos están implementadas. **Mantener una historia abierta por audiencias hipotéticas sería
sostener una exigencia que ninguna fuente hace**, y así se corrige: lo dicho en la entrega anterior —«faltan
audiencias»— **era una interpretación añadida durante el desarrollo**, no un criterio.

## 2. Tabla única de aceptación

| # | Criterio original (referencia exacta) | Comportamiento implementado | Evidencia | Condición pendiente |
| --- | --- | --- | --- | --- |
| 1 | **S1 §49**: `public_reference` en Producer, Plot, Delivery, Lot, **Package**, Shipment | Registro central con emisión automática para `PRODUCER`, `PLOT`, `DELIVERY`, `LOT`, `SHIPMENT` y `DD_SNAPSHOT` (= Package, §4) | `public-references.int-spec.ts` (18) · migración `0044` | **Ninguna** |
| 2 | **S1 §49**: «Nunca exponer directamente IDs internos» | Referencia opaca de 12 bytes; el enlace y el QR **no** contienen el id del recurso ni el de la organización | Decodificación del QR con `jsqr` (decodificador independiente) · `referencia-qr.mjs` 15/15 | **Ninguna** |
| 3 | **S1 §49**: «Agregar QR desde la primera arquitectura» | QR en SVG generado en proceso, autorizado igual que la resolución | `public-references.int-spec.ts` · `referencia-qr.mjs` | **Ninguna** |
| 4 | **RF-33** (`docs/03:48`): «No exponer PII ni prometer DDS» | La resolución no entrega datos; la vista compartida no lleva identidad, geometrías ni documentos; API, pantalla y archivo declaran que **no sustituye un DDS** | `portal-comprador.mjs` (0 fugas) · `access-grants.int-spec.ts` | **Ninguna** |
| 5 | **P1-002** (`docs/18:203`): «Referencia pública sin IDs/PII» | Igual que 1, 2 y 4 | — | **Ninguna** |
| 6 | **P1-002**: «vistas por audiencia» | Dos audiencias, que son **las que las fuentes describen**: `MEMBER` → pantalla interna con sus permisos; `GRANTEE` → vista compartida autorizada. El resolver las distingue y enruta a cada una | `portal-comprador.mjs` (`audience=GRANTEE`) · `access-grants.int-spec.ts` | **Ninguna** (§1) |
| 7 | **P1-002**: «no sustituye DDS» | Igual que 4 | — | **Ninguna** |
| 8 | **RF-32** (`docs/03:47`): «Grant, expiración y revocación» | Concesión tipada por recurso, vencimiento obligatorio y futuro, revocación inmediata; al vencer o revocarse se cortan resolución, vista, descarga y portal | `access-grants.int-spec.ts` (17, con **vencimiento real por reloj del servidor**) · `portal-comprador.mjs` 12/12 | **Ninguna** |
| 9 | **P1-001** (`docs/18:202`): «Recurso […] compartido» | La concesión es de **un recurso concreto**; otro recurso de la misma organización no se abre | `access-grants.int-spec.ts` | **Ninguna** |
| 10 | **P1-001**: «revocación bloquea nueva consulta» | Revocado: `404` en resolución y vista, portal vacío | `portal-comprador.mjs` | **Ninguna** |
| 11 | **P1-001**: QA-02 (aislamiento) | Tercera organización sin concesión: `404`. Sin concesión, el rol `BUYER` no abre nada | `portal-comprador.mjs` | **Ninguna** |
| 12 | **RF-32**: «Buyer Portal con lote/**embarque**» | `resource_type` admite `LOT`, `SHIPMENT` y `DD_SNAPSHOT`; la proyección y el portal los contemplan | `access-grants.ts` · portal | **SÍ**: el camino de **embarque** y el de **instantánea** **no están demostrados**. Las pruebas y el recorrido solo ejercitan `LOT` |
| 13 | **RF-32**: «**evidencia**» · **S3 §22.8**: «✓ Evidencias» y los demás indicadores | La vista del lote entrega código, producto, estado, origen y agregados de productores y parcelas. **No** entrega evidencias ni el resto de indicadores | `access-grants.ts` §`proyeccion()` | **SÍ**: falta el conjunto de indicadores de S3 §22.8. **Es ampliación de campos ⇒ decisión explícita** (§5) |
| 14 | **P1-001**: «**period** compartido» | La concesión tiene **vencimiento** (hasta cuándo se puede consultar) | `access_grants.expires_at` | **A aclarar**: si «período» significa *vigencia del acceso*, está cumplido; si significa *rango de datos compartidos*, no existe. La fuente no lo define |
| 15 | **P1-001**: «descarga autorizada» · S3 §22.8 | Descarga condicionada a `can_download`, con la **misma** proyección, identificada como **vista compartida interna** | `portal-comprador.mjs` (descarga real) | **Ninguna** (§3) |

## 3. ¿Exige el portal descargar un paquete DD?

**No, según la fuente.** S3 §22.8 presenta el Buyer Portal como una **pantalla de indicadores** «con acceso
controlado»; **«DDS» aparece como un indicador (✓), no como una descarga**. RF-32 pide «descarga autorizada»,
sin decir de qué artefacto.

Por tanto **el criterio de descarga está cumplido** con la vista compartida, **y se mantiene la distinción**:
una **vista compartida interna no sustituye un paquete DD ni una declaración oficial**, y así lo dicen la API,
la pantalla y el propio archivo descargado.

**Si en el futuro se decidiera** entregar al comprador un `DD_PACKAGE`, eso **no sería este criterio**: sería
uno nuevo, y su dependencia exacta es **la aprobación del expediente** (`READY` + instantánea aprobada
vigente), que hoy está bloqueada por D-05.B, D-07.5, D-07.6 y P1-005.

## 4. Package, instantánea y exportación: correspondencia y límites

| Concepto | Qué es | Identidad pública |
| --- | --- | --- |
| **`Package`** (S1 §49) = **`DueDiligenceEvidencePackage`** (S1 §44) | El paquete de evidencia de debida diligencia | **La instantánea** (`DD_SNAPSHOT`), que sí tiene `public_reference` |
| **`dd_snapshots`** | Fija el **contenido** y su `content_hash` | Referencia propia |
| **`dd_exports`** | Registra el **acto** de exportar: quién, cuándo, con qué perfil de redacción y con qué `package_hash` | **Sin referencia propia, y hoy no la necesita** |

**El límite, declarado**: el `package_hash` depende del **perfil de redacción** de quien exporta
(`plot:read_geometry`, `producer:read_identity`). **Hoy solo `ORG_ADMIN` y `EUDR_MANAGER` pueden exportar y
ambos tienen el perfil completo**, así que el paquete queda determinado por su instantánea. **Si se añadiera un
rol que exportase con perfil más estrecho**, dos paquetes de la misma instantánea tendrían huellas distintas y
la identidad dejaría de ser la instantánea. `catalog.spec.ts` **falla** si eso ocurre.

## 5. La ÚNICA decisión pendiente

Todo lo demás está decidido o demostrado. Queda una sola, y es la del criterio 13.

### D-48 — ¿Qué indicadores ve el comprador en la vista compartida?

**S3 §22.8** dibuja el Buyer Portal con: origen identificado · productores · parcelas · **geolocalización
validada** · **deforestación revisada** · **legalidad revisada** · **trazabilidad completa** · **balance de
masa** · **evidencias** · **riesgo final** · **DDS**. Hoy se entregan los **tres primeros**.

| Opción | Qué implica | Efecto |
| --- | --- | --- |
| **(a) Conjunto completo de §22.8, como ESTADOS** | Añadir a la proyección los ocho indicadores restantes, **como estado**, nunca como dato: «revisada / no revisada / no evaluable», sin coordenadas, sin identidad y sin documentos | **Cierra RF-32 y P1-001.** Varios dirían hoy «no evaluable» —riesgo final `UNDETERMINED`, legalidad sin perfil aprobado, deforestación sin satélite— y **eso es exactamente lo que hay que mostrar**, no ocultarlo |
| **(b) Solo «evidencias»** | Añadir únicamente el indicador que **RF-32 nombra explícitamente** | Cumple la letra de RF-32; **deja S3 §22.8 incompleto** |
| **(c) No ampliar** | Dejar la proyección como está | **RF-32 y P1-001 quedan abiertas indefinidamente** por un criterio que sí está en la fuente |

**Recomendación: (a).** Son **estados derivados de lo que el expediente ya calcula** —los requisitos de la
instantánea—, no datos nuevos: no levantan la clasificación, no exponen identidad ni geometrías, y mostrar
«no evaluable» donde corresponde es coherente con el resto del producto. **Consecuencia de no decidir**: RF-32
y P1-001 siguen abiertas, no por falta de trabajo técnico, sino por una ampliación de campos que **no se hace
sin decisión**.

**Lo que esta decisión NO incluye**: entregar el paquete DD, levantar la clasificación, mostrar identidad de
productores, geometrías o documentos, ni prometer un DDS.

## 6. Resultado del contraste

| Historia / requisito | Estado |
| --- | --- |
| **RF-33** | **Todos sus criterios demostrados** → **DONE_LOCAL** |
| **P1-002** | **Todos sus criterios demostrados** → **DONE_LOCAL** |
| **RF-32** | **ABIERTA** por los criterios **12** (embarque e instantánea sin demostrar) y **13** (indicadores de S3 §22.8) |
| **P1-001** | **ABIERTA** por los mismos dos, más la aclaración del criterio **14** («período») |

**RF-47** ya estaba demostrada y no cambia.
