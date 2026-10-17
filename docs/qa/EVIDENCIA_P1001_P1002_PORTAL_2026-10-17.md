# Evidencia — P1-001 y P1-002: acceso del destinatario y pasaporte por audiencia (2026-10-17)

Octava entrega agrupada. **Esta vez la dependencia viene dentro**: P1-002 dependía de P1-001, y las dos se
entregan juntas.

| | |
| --- | --- |
| Candidato | **`7044cfe`** |
| Validación | `2026-10-17T23-18-37` — **APROBADA** |
| Pruebas | **72 suites, 728** unitarias e integración · **72** E2E · 0 fallos |
| Respecto de `76ea920` | 721→**728** pruebas |
| Migraciones | **49**, sin cambios: **no toca el esquema** |
| Respaldo | **No corresponde**: sin migración, sin cambio criptográfico, sin intervención sobre datos |

## 1. Contraste: qué exige cada criterio y qué faltaba de verdad

| Fuente | Qué exige | Estado al empezar |
| --- | --- | --- |
| **P1-001** (backlog) | «Recurso/fields/período compartidos; revocación bloquea nueva consulta; QA-02/14» | **API hecha** en P0-003; **faltaba la pantalla** |
| **P1-002** (backlog) | «Referencia pública sin IDs/PII, vistas por audiencia, no sustituye DDS» | Referencia y resolución **hechas** (RF-47/RF-33); **faltaba la audiencia externa** |
| **ADR-0002** | «Compartición mediante grants tipados, campos/vigencia/revocación y no joins implícitos por identidad» | **Satisfecho en sustancia** por `access_grants` |

**La decisión que parecía bloqueante no lo era.** ADR-0002 sigue marcado como PROPUESTO, pero lo que pedía
—concesiones tipadas con recurso, vigencia y revocación— **ya está implementado y probado** desde P0-003. Lo
que faltaba no era una decisión: era **construir el recorrido**.

**Decisión de alcance adoptada** (local, para desarrollo): la **audiencia externa inicial** es el
**destinatario autenticado de una concesión vigente**. **El rol `BUYER` por sí solo no concede acceso entre
organizaciones** — lo demuestra la primera comprobación del recorrido. No se amplió ningún campo de la
proyección: cualquier ampliación exigiría una decisión explícita, y no se tomó ninguna.

## 2. La identidad de `Package`, resuelta sin inventar un identificador

El informe anterior decía que «`Package` no tiene referencia propia» y a la vez daba RF-47 por completo. **Esa
contradicción era mía**, y así se resuelve:

| Paso | Qué dicen las fuentes y el código |
| --- | --- |
| **S1 §44** | Define `DueDiligenceEvidencePackage`: el paquete de evidencia de debida diligencia |
| **S1 §49** | Lo lista entre las entidades que pueden tener `public_reference` |
| **Implementación** | El paquete **se genera desde la instantánea** (`buildPackage` es una función pura del contenido), y `dd_exports` registra el **acto** de exportarlo |
| **El matiz** | La huella del paquete depende también del **perfil de redacción** de quien exporta (`plot:read_geometry`, `producer:read_identity`) |
| **Lo comprobado** | **Solo `ORG_ADMIN` y `EUDR_MANAGER`** pueden exportar, y **ambos tienen el mismo perfil completo** |

**Conclusión: hoy el paquete queda identificado por su instantánea**, que **sí** tiene referencia pública
(`DD_SNAPSHOT`). **No hay brecha demostrada**, así que **no se crea un identificador nuevo**.

**Y queda una alarma, no una nota al pie**: `catalog.spec.ts` comprueba que **todos** los roles capaces de
exportar comparten perfil de redacción. Si alguien añade un rol que exporte con un perfil más estrecho, dos
paquetes de la misma instantánea tendrían huellas distintas, la identidad dejaría de ser la instantánea, y
**la prueba falla diciéndolo**.

## 3. Qué se construyó

**Nada nuevo en el modelo de datos.** Se reutilizan `access_grants`, su revalidación y la proyección de
P0-003; el registro y el resolver de RF-47; el QR de RF-33.

### 3.1 La referencia reconoce la concesión

`resolve()` ya exigía membresía. Ahora, **si no hay membresía**, busca una **concesión vigente sobre ese
recurso exacto** antes de responder opaco, y declara la audiencia:

| Audiencia | Cuándo | Adónde lleva |
| --- | --- | --- |
| `MEMBER` | Miembro con permiso y alcance | Pantalla interna del recurso |
| `GRANTEE` | **Sin membresía**, con concesión viva de **ese** recurso y **lectura** concedida | **Su vista compartida** |

No amplía nada: exige recurso exacto, concesión viva (ni vencida ni revocada), `can_read`, y cuenta activa.
**Al vencer o revocarse, deja de resolver.**

### 3.2 El portal del destinatario

`/compartido`, **fuera del espacio de trabajo** porque quien entra **no es miembro**: no tiene organización
activa, ni menú de operación, ni permisos de tenant. Montarlo dentro daría a entender una pertenencia que no
existe.

Encuentra lo concedido · abre su vista · ve **solo códigos, estados y agregados** · descarga **cuando tiene esa
acción**. La pantalla declara que **la concesión no levanta la clasificación** y que lo descargado es una
**vista compartida interna**, no un paquete DD ni una declaración oficial.

### 3.3 Un defecto de interfaz, encontrado al probar a 390 px

El portal reutilizaba el contenedor de la **tarjeta de ingreso** (`max-width: 440px`, sin `min-width: 0`). El
ancho mínimo de la tabla estiraba el contenedor y **la página desbordaba**. Ahora tiene su propio contenedor.
Lo encontró la comprobación de 390 px, no la revisión a ojo.

## 4. Recorrido comprobado

`e2e/review/portal-comprador.mjs`, **12/12 APROBADO**, con **tres** cuentas DEMO de **tres** organizaciones:

| Comprobación | Resultado |
| --- | --- |
| **Sin concesión**: el rol BUYER por sí solo | resolución **404** |
| **Con concesión**: resuelve **sin membresía** | **200**, `audience=GRANTEE` |
| El QR también se le entrega | **200** |
| La vista **no trae identidad, geometrías ni documentos** | **0 fugas**, agregados presentes |
| **Aislamiento**: tercera organización sin concesión | **404** en resolución y vista |
| **Portal**: encuentra lo concedido | 1 concesión listada |
| Declara que no levanta clasificación ni sustituye paquete DD | ambos avisos |
| **TECLADO**: abre su vista sin ratón | foco + Enter, sin identidad en pantalla |
| **DESCARGA** | `vista-compartida-lot-…json` |
| **ENLACE**: `/r/<ref>` lleva al destinatario a **su** vista | termina en `/compartido` |
| **390 px** | sin desbordamiento |
| **REVOCACIÓN** | resolución **404**, vista **404**, **portal vacío** |

En integración: `access-grants.int-spec.ts` (**17**) suma cinco casos de audiencia externa —resolución con
concesión, **revocación**, **vencimiento real por reloj del servidor**, alcance de **un solo recurso** y
**sin lectura concedida**—; y `public-references.int-spec.ts` (**18**) añade la **decodificación del QR**.

### 4.1 El vencimiento se probó de verdad

Adelantar la fecha en la base **no es posible**: el disparador de P0-003 impide editar los términos de una
concesión, que es lo correcto. Así que la prueba **concede con vencimiento en 2,5 segundos y espera**: vence
**con el reloj del servidor**, no con un `UPDATE`.

### 4.2 El QR se verifica DECODIFICÁNDOLO

No basta con que el SVG tenga trazados. Se rasteriza a partir de su propia geometría y se decodifica con
**`jsqr`**, que **no es el codificador** usado para generarlo —si lo fuera, coincidiría por construcción y no
demostraría nada—. Lo decodificado es exactamente el enlace esperado, y **no contiene** el identificador del
lote ni el de la organización.

## 5. Criterios cumplidos

| Criterio | Estado |
| --- | --- |
| **P1-001** recurso/campos/período compartidos | **Demostrado** |
| **P1-001** revocación bloquea nueva consulta | **Demostrado**: resolución, vista y portal |
| **P1-002** referencia sin IDs ni PII | **Demostrado** (RF-47 + decodificación) |
| **P1-002** vistas por audiencia | **Demostrado** para la audiencia **destinatario de concesión** |
| **P1-002** no sustituye DDS | **Demostrado**: lo dice la API, la pantalla y el archivo |
| QA-02 aislamiento | **Demostrado**: tercera organización sin concesión |

## 6. Lo que NO se cierra, y por qué

**P1-001, P1-002 y RF-33 siguen ABIERTAS.** Lo entregado cubre **una** audiencia externa —la del destinatario
de una concesión— y el recorrido completo para ella. Queda fuera, y **sin decisión tomada**:

| Pendiente | Por qué no se hizo |
| --- | --- |
| **Más audiencias** (p. ej. pública o anónima) | No hay decisión que las defina. Inventarlas sería publicar sin contrato |
| **Ampliar campos** de la proyección | Exige **decisión explícita**; no se tomó |
| **ADR-0002 sigue PROPUESTO** | Lo implementado lo satisface en sustancia, pero **ratificarlo es una decisión**, no código |
| Período compartido como **rango de fechas** | La concesión tiene **vencimiento**, no un período de datos acotado |

## 7. Validación, despliegue y demostración

**Validación APROBADA** sobre `7044cfe`: 72 suites, **728** pruebas, 72 E2E, 0 fallos.

**Un despliegue**, con la revisión inyectada: `/version` declara `commit=7044cfe+sucio (BUILD_ARG)`.

**Demostración sobre el despliegue**, repetida tras la reconstrucción:

| Recorrido | Resultado |
| --- | --- |
| `e2e/review/portal-comprador.mjs` | **12/12 APROBADO** |
| `e2e/review/referencia-qr.mjs` (**sin regresión**) | **15/15 APROBADO** |

**Sin respaldo nuevo**: no hay migración, ni cambio criptográfico, ni intervención sobre datos. Los recorridos
**dejan el entorno como lo encontraron**: revocan las concesiones que crean.

## 8. Métricas

**Sin cambio.** Las historias no se cierran por entregar una audiencia de las varias que su enunciado admite.
