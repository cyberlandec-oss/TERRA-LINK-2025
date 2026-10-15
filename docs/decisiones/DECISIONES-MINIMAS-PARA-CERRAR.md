# Decisiones mínimas para terminar las historias abiertas (2026-10-15)

Lista corta y ordenada por lo que **realmente** bloquea criterios originales. Todo lo que sigue es **recomendación**,
no decisión aprobada: ninguna de estas líneas debe leerse como que ya se decidió algo.

Estado de origen: `docs/22_DECISIONES_Y_PENDIENTES.md` (texto completo de cada decisión) y
`docs/qa/MATRIZ_RECORRIDO_INTEGRAL.md` (dónde se detiene la cadena hoy).

## Las que bloquean la cadena operativa

| Decisión | Qué hay que decidir, en concreto | Desbloquea | Recomendación (no aprobada) |
| --- | --- | --- | --- |
| **D-32** · unidad y definición de humedad (**propuesta escrita**: `docs/decisiones/D-32-PROPUESTA-HUMEDAD.md`) | Qué unidad (% base húmeda/seca), con qué método de medición y qué precisión; si el cierre de secado la exige siempre o admite «no medida» | **P0-016** (cerrar secado) y con ello el estado `CACAO_SECO` en la cadena · desatasca la transición 10 de la matriz | Adoptar **% en base húmeda** con método declarado por muestra, exigida para cerrar; sin ella el cierre sigue bloqueado |
| **D-33** · cierre de entregas y diferencias con causa (**propuesta escrita**: `docs/decisiones/D-33-PROPUESTA-CIERRE-ENTREGAS.md`) | Cuándo una entrega queda cerrada; si se admite cerrar por debajo de lo declarado y con qué tolerancia; qué causas son válidas | **P0-012** (criterio «diferencias con causa») · transiciones 5–7 | Cerrar por recepción confirmada, con diferencia registrada y **causa obligatoria**; tolerancia 0 hasta tener datos de campo |
| **D-34** · condición de `dd_package_id` y `dispatch_at` | Qué exige exactamente despachar: paquete DD aprobado y vigente, y qué fecha es `dispatch_at` | **P0-029** y **P0-017** (despacho) · transición 17 | No despachar sin paquete DD aprobado, vigente y exportado; `dispatch_at` = salida física registrada |
| **D-05** · perfil GIS y umbral | Umbral de superficie (incluido el caso exacto de 4 ha), precisión y **formato del sistema de destino** | **P0-010**, **P0-009** (perfil destino), 2 indicadores de **P0-030**, requisito `GEOLOCATION_PROFILE` de **P0-022** · transiciones 4, 14, 22 | Partir de la propuesta ya escrita (`docs/decisiones/D-05-PROPUESTA.md`) y ratificarla con el responsable regulatorio |
| **D-07** · severidad, proceso y conclusión de riesgo | Enums reales, mapeo de factores a severidad y **quién aprueba** el catálogo de reglas | **P0-020** (severidad), distribución de riesgo de **P0-030**, `RISK_CATALOG_APPROVED` de **P0-022** · transición 12 | Aprobar primero el catálogo `0.1.0` tal cual (sin pesos) y decidir severidad por regla, no por promedio |

## Las que bloquean el satélite y la evidencia

| Decisión | Qué hay que decidir | Desbloquea | Recomendación (no aprobada) |
| --- | --- | --- | --- |
| **D-09 parte B** · uso real del proveedor | Autorización para enviar geometrías a un tercero, aceptación de términos, titularidad y custodia de la clave | Criterio «resultado con procedencia» de **P0-028** · `DEFORESTATION_ANALYSIS` de **P0-022** · transición 21 | Empezar por el **ensayo con geometría sintética** (`docs/decisiones/P0-028-ENSAYO-EXTERNO-PROPUESTA.md`), que no necesita datos de productores |
| **D-42** · resultado satelital como evidencia | Qué afirmación es, sobre qué entidad, qué acredita y cuándo caduca | Cadena `Result → Evidence → Risk` de S1 §95 · cierre de **P0-019** para esta afirmación | Decidirla **después** de tener un resultado real que mirar; antes se decidiría a ciegas |
| **D-37** · autoverificación de evidencias | Si quien aporta puede verificar lo que aportó; plazo de revisión tras una versión nueva | Criterio de separación de funciones de **P0-019** | Prohibir la autoverificación salvo excepción registrada |

## Las que bloquean seguridad y operación

| Decisión | Qué hay que decidir | Desbloquea | Recomendación (no aprobada) |
| --- | --- | --- | --- |
| **D-04** · elevación de SUPER_ADMIN | Quién eleva, con qué aprobación, alcance, duración máxima, notificación y auditoría | **Uno** de los dos criterios abiertos de **P0-003** · QA-02 completo | Elevación temporal con motivo obligatorio, de solo lectura, notificada a la organización y auditada |
| **D-38** · formato y retención de la bitácora | Formato definitivo, límite por archivo, retención y si se audita también la consulta | **Nada bloqueado**: P0-025 ya es DONE_LOCAL con sus criterios originales. D-38 es una política pendiente que condiciona el **uso en producción**, no el cierre de la historia | Mantener CSV `TL_AUDIT_CSV 0.1` y decidir retención con el responsable de datos |
| **Concesiones entre organizaciones** (ADR-0002) | Recurso, campos y período compartidos; revocación; qué ve un comprador o un auditor externo | El **segundo** criterio abierto de **P0-003**, y la base de **P1-001** (Buyer Portal) | Definir el contrato antes de implementar nada; hoy no existe ninguna concesión |
| **D-14** · retención y base del tratamiento | Qué se conserva, cuánto y con qué base legal, por clase de dato | Condición previa de **D-09 parte B**; afecta a fotos de campo (D-41) y documentos (D-36) | Resolverla junto con D-09 parte B: la misma pregunta de fondo |

## Lo que **no** es una decisión pendiente, aunque lo parezca

- **Volumen del piloto y Android real**: no son decisiones, son **trabajo de P0-031** sin ejecutar.
- **Respaldo y restauración**: ya está **verificado** (13-oct y 15-oct); lo que falta de QA-16 es el recorrido sobre
  la copia y medir RPO/RTO con volumen real. Tampoco es una decisión.
- **Manual de operación**: escrito (`docs/MANUAL_OPERACION.md`). Impartir la capacitación sigue pendiente.
- **Revisión de ciberseguridad independiente**: es un encargo, no una decisión de producto.
- **Reportes programados y saldo a una fecha**: no los exige ninguna fuente (comprobado por búsqueda literal en
  P0-030). No añadirlos como condición de cierre.

## Orden sugerido

1. **D-32 y D-33** — son las más baratas, no dependen de nadie externo y desatascan la parte operativa de la cadena.
2. **D-05 y D-07** — tienen propuesta escrita; desbloquean GIS, riesgo, dos indicadores y dos requisitos del expediente.
3. **D-34** — depende de que exista un paquete DD aprobado, que a su vez depende de las anteriores.
4. **D-09 parte B** (empezando por el ensayo sintético) y después **D-42**.
5. **D-04** y el **contrato de concesiones** — los dos criterios que faltan para cerrar **P0-003**.
6. **D-38** — no cierra ninguna historia (P0-025 ya es DONE_LOCAL); hace falta antes de operar con datos reales.
