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

Resueltas el 2026-10-09: **D-01** (stack NestJS/Next.js/PostGIS, ADR-0001, adoptado por delegación del usuario) y **D-02** (monorepo nuevo `cyberlandec-oss/TERRA-LINK-2025`). Pendiente: ratificación del responsable técnico.

## Decisiones operativas de esta entrega

- Mantener los originales intactos y separarlos de las instrucciones activas.
- Audit-first para no confundir documento objetivo con estado implementado.
- Preservar IDs P0 originales y añadir historias explícitas para capacidades omitidas de su tabla.
- Bloqueos críticos independientes del score; datos desconocidos no se inventan.
- Los detalles adicionales de arquitectura son propuestas para revisión del equipo.

No marcar «aceptado por el usuario» si la decisión fue inferida en esta entrega. Tras resolver, enlazar ADR, responsable, fecha, commit/artefacto y pruebas afectadas.
