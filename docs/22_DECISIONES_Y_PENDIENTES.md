# Decisiones y pendientes

Estas cuestiones no bloquean la lectura ni preparación del paquete. Bloquean únicamente la implementación que dependa de ellas. Resolver primero mediante repositorio/evidencia; preguntar al responsable solo lo que no se pueda determinar.

| ID | Decisión/diferencia | Responsable propuesto | Evidencia de cierre |
| --- | --- | --- | --- |
| D-01 | Stack NestJS/Next vs antecedente FastAPI/React | Tech lead | Manifiestos/commit y ADR-0001 |
| D-02 | Repo existente/vacío, monorepo o repos separados | Tech lead | Layout real; estrategia de integración sin duplicación |
| D-03 | 12 roles fuente vs catálogo ampliado previo | Backend/producto | Catálogo/migraciones/permisos; no inventar códigos |
| D-04 | Política de elevación SUPER_ADMIN y grants | Seguridad/dueño datos | Matriz aprobada y QA-02 |
| D-05 | Umbral GIS, borde =4 ha, precisión/formato de destino | GIS/regulatorio | Texto consolidado + perfil versionado y pruebas boundary |
| D-06 | Stock negativo y ajustes | Operaciones/traceability | ADR-0003 y QA-06; no bypass de consumo |
| D-07 | Severidad/proceso/conclusión riesgo | Producto/regulatorio | Enums reales, mapping y regla aprobada |
| D-08 | Estados expediente vs DDS existente | Backend/EUDR | Contrato y migración no destructiva; QA-12 |
| D-09 | Proveedor satelital y cobertura/coste | GIS/comercial | Canal/contrato/fixture/resultados reales |
| D-10 | Requisitos legales Ecuador | Responsable legal | Fuentes completas vigentes y perfil de aplicabilidad |
| D-11 | GUIA/Agrocalidad | Integraciones | API/acuerdo/export oficial comprobados |
| D-12 | EUDR-IS/rol legal/representación | Regulatorio/integraciones | Documentación vigente, acceso ACCEPTANCE y autorización |
| D-13 | Persistencia y sesión offline | Mobile/seguridad | Arquitectura real, política, QA Android |
| D-14 | Retención y base del tratamiento | Privacidad/Data Owner | Política aplicable por clase de dato |
| D-15 | SLO/RPO/RTO y costes | Operaciones/comercial | Medición del piloto/restore y compromiso acordado |
| D-16 | Tarifas/planes y titularidad de datos | Comercial/legal | Hipótesis validadas/contrato, no precios de benchmark |
| D-17 | OpenAPI y enlaces tipados | Backend | Schema executable validado + integridad DB |
| D-18 | Catálogo de `organization_type` (hoy código libre `^[A-Z_]{2,40}$`) | Producto | Catálogo aprobado y migración con CHECK/FK |
| D-19 | Mecanismo definitivo de invitación y verificación de correo (hoy enlace provisional) | Producto/seguridad | Tres decisiones separadas en ADR-0005: autenticación (local u OIDC), verificación del correo y entrega de invitaciones |
| D-20 | Umbrales del límite de login (5/20/50 por 15 min) y tolerancia al bloqueo temporal por terceros | Seguridad | Valores aprobados o ajustados con datos del piloto |

### Supuestos vigentes de desarrollo (2026-10-10)

Se usan para avanzar; **no son decisiones ratificadas** ni están validados para producción.

- **D-18:** catálogo provisional de 8 tipos en la tabla `organization_types` (migración `0003`, estado `PROVISIONAL`, etiquetas en español). Los cambios se hacen con nueva migración (`RATIFIED`, `RETIRED`; los códigos previos fuera de catálogo quedan `LEGACY`). El tipo no concede permisos.
- **D-19:** invitaciones por enlace de un solo uso, sin proveedor externo. Tener el enlace no verifica el correo (`email_verified_at` sigue nulo).
- **D-20:** límites 5/20/50 por 900 s, configurables. Riesgo, recuperación y fallo de Redis en ADR-0005.
- **ADR-0001 y ADR-0005:** adoptados para desarrollo; ratificación pendiente del responsable técnico. No hay aprobación del usuario registrada.

### D-04: parte bloqueada y decisión mínima

Implementado sin D-04: SUPER_ADMIN solo administra metadatos de organizaciones, incorpora al primer ORG_ADMIN (`organization:onboard_admin`) y desactiva cuentas. No hay bypass global.
**Bloqueado por D-04:** cualquier acceso de plataforma a miembros, datos personales, bitácora u operación de una organización donde no es miembro (hoy `ELEVATION_REQUIRED` o 404). Decisión mínima necesaria: (1) quién puede elevar y con qué aprobación, (2) motivo obligatorio y duración máxima, (3) alcance (lectura o escritura, qué recursos), (4) cómo se notifica a la organización y cómo se audita. Con eso se implementa una elevación temporal registrada y se prueba QA-02 «superadmin con elevación explícita».

Concesiones entre organizaciones (BUYER/AUDITOR externos): sin contrato definido (ADR-0002 propuesto, P1-001). Fuera del alcance de P0-003.

### D-18: catálogo provisional (NO ratificado; implementado como supuesto de desarrollo)

Las fuentes no enumeran `organization_type`: S1 §10 solo nombra el campo. Sí mencionan estos actores de la cadena: asociación/cooperativa de productores (S1 guía de asociaciones, S3), acopiador y centro de acopio (S2), procesamiento/industria (S2, GUIA en S3), exportador (S1, S2), importador UE y fabricante/retail (S2). Propuesta para revisión de producto:

| Código | Actor | Origen en fuentes |
| --- | --- | --- |
| ASSOCIATION | Asociación de productores | S1, S3 |
| COOPERATIVE | Cooperativa | S2, S3 |
| COLLECTOR | Acopiador / centro de acopio | S2, GUIA (S3) |
| PROCESSOR | Procesador / industria | S2, GUIA (S3) |
| EXPORTER | Exportador | S1, S2 |
| IMPORTER | Importador (UE) | S2 |
| MANUFACTURER | Fabricante / retail | S2 |
| OTHER | Otro (requiere descripción) | Propuesta |

Etiquetas en español en `organization_types.label_es`. Desde la migración `0003`, `organizations.organization_type` tiene FK al catálogo y la API rechaza códigos fuera de él (`ORGANIZATION_TYPE_UNKNOWN`). La ratificación sigue pendiente.

Resueltas el 2026-10-09: **D-01** (stack NestJS/Next.js/PostGIS, ADR-0001, adoptado por delegación del usuario) y **D-02** (monorepo nuevo `cyberlandec-oss/TERRA-LINK-2025`). Pendiente: ratificación del responsable técnico.

## Decisiones operativas de esta entrega

- Mantener los originales intactos y separarlos de las instrucciones activas.
- Audit-first para no confundir documento objetivo con estado implementado.
- Preservar IDs P0 originales y añadir historias explícitas para capacidades omitidas de su tabla.
- Bloqueos críticos independientes del score; datos desconocidos no se inventan.
- Los detalles adicionales de arquitectura son propuestas para revisión del equipo.

No marcar «aceptado por el usuario» si la decisión fue inferida en esta entrega. Tras resolver, enlazar ADR, responsable, fecha, commit/artefacto y pruebas afectadas.
