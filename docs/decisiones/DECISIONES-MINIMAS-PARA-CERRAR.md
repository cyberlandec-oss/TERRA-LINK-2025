# Decisiones mínimas para terminar las historias abiertas (2026-10-15)

Lista corta y ordenada por lo que **realmente** bloquea criterios originales. Todo lo que sigue es **recomendación**,
no decisión aprobada: ninguna de estas líneas debe leerse como que ya se decidió algo.

Estado de origen: `docs/22_DECISIONES_Y_PENDIENTES.md` (texto completo de cada decisión) y
`docs/qa/MATRIZ_RECORRIDO_INTEGRAL.md` (dónde se detiene la cadena hoy).

## Adoptadas el 2026-10-15 (ya no bloquean)

| Decisión | Qué se adoptó | Qué desbloqueó | Qué sigue pendiente de ella |
| --- | --- | --- | --- |
| **D-32** · humedad del secado | Medición en **`%BH`** con método y responsable, **obligatoria para cerrar**; 6 decimales conservados y más precisión **rechazada**, nunca redondeada; tope 100 **estructural** | **P0-016 DONE_LOCAL**; `DRYING` INTEGRATED; transición 10 de la matriz | **Límites de aceptación**, **unidades de peso adicionales** con sus factores y **comprobación con operadores reales** |
| **D-07.1, D-07.2 y D-07.4** · mecanismos de riesgo | **Mecanismos**, no catálogo: aprobación con permiso propio y **adopción por organización** separada de la publicación global; severidad **por regla** agregada por **máximo**, con su **cobertura**, y `NOT_ASSESSED` cuando no hay hallazgos (A.2); desactualización por cambio de datos o reglas | Nada todavía: habilitan publicar y adoptar un catálogo con severidades, que es un acto posterior | **La matriz del catálogo** (`D-07-MATRIZ-CATALOGO.md`, **no aprobada**), con tres asignaciones que son **decisión de producto**; **D-07.5** y **D-07.6** para la conclusión regulatoria |
| **D-05.A** · perfil técnico de intercambio geoespacial | Perfil `EUDR_GEO_V1`, con regla y tabla **propias**, separado de `TL_GIS_TECH`: umbral **estricto** (4 ha exactas se admiten, sin banda), punto sin superficie **no exportable**, huecos no exportables, simulación de truncamiento **hacia cero** sobre copia, y exportación **por productor** sin datos personales | **P0-009** y **P0-010** DONE_LOCAL; transición 4b de la matriz | **Aplicabilidad jurídica (D-05.B)**; **prueba contra el servicio real** del destino; contrato del **período de producción** del Art. 9(1)(d); `ProducerName` |
| **D-33** · cierre de entregas | Cierre **explícito**; **toda** diferencia exige motivo (lo que no prohíbe cerrar con diferencia); con diferencia exige `delivery:correct`; cerrada **no se reabre** ni admite recepciones; una corrección posterior **añade** justificación y conserva la anterior | **P0-012 DONE_LOCAL**; transiciones 5–6b de la matriz | **Tolerancias** y **límites de aceptación de calidad**; **comprobación con operadores reales** |

Las cuatro entradas son **mecanismos y reglas provisionales del MVP local**: aprobación **para desarrollo**, no validación en campo ni para
producción. En el caso de D-05.A, además: **no acredita conformidad jurídica y no autoriza presentar nada**.

## Las que bloquean la cadena operativa

| Decisión | Qué hay que decidir, en concreto | Desbloquea | Recomendación (no aprobada) |
| --- | --- | --- | --- |
| **D-34** · condición de `dd_package_id` y `dispatch_at` | Qué exige exactamente despachar: paquete DD aprobado y vigente, y qué fecha es `dispatch_at` | **P0-029** y **P0-017** (despacho) · transición 17 | No despachar sin paquete DD aprobado, vigente y exportado; `dispatch_at` = salida física registrada |

| **D-05.B** · aplicabilidad jurídica | A qué actores y operaciones de Terra Link alcanzan las obligaciones: quién es «operator» (Art. 2(15)), clasificación de riesgo de Ecuador (Art. 29), condiciones del Art. 2(15a), Anexo III | Qué **significa** el resultado del perfil · requisito `GEOLOCATION_PROFILE` de **P0-022** · transiciones 14, 22 | **No decidible por el equipo**: responsable regulatorio. La norma ya está leída y guardada con su hash (`docs/sources/eudr-norma-2026-10-15/`); lo que falta es el criterio, no el texto |
| **D-07.5 y D-07.6** · perfil jurídico y quién concluye | Qué requisitos legales aplican y quién puede afirmar `NEGLIGIBLE` / `NON_NEGLIGIBLE` | `LEGAL_PROFILE`, `RISK_CATALOG_APPROVED` y `REGULATORY_CONCLUSION` de **P0-022** · transición 12 | **Responsable regulatorio.** El motor **no puede** concluir: lo prohíbe S1 §35. Decidir D-07.6 **no abre el expediente** por sí solo: quedan otras cinco condiciones |

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

~~1. **D-32 y D-33**~~ — **adoptadas el 2026-10-15** (ver la sección de arriba).

~~1. **D-05.A** — perfil técnico~~ — **adoptado e implementado el 2026-10-15** (ver arriba).

1. **D-05.B** — aplicabilidad jurídica. Trabajo de un responsable regulatorio: qué actor es cada usuario bajo el
   Art. 2(15), y las condiciones del Art. 2(15a). **La clasificación de Ecuador ya está verificada: riesgo
   ESTÁNDAR**, lo que deja la vía de dirección postal **fuera de alcance mientras siga así**.
2. **D-07, lo que queda.** Los **mecanismos** D-07.1, D-07.2 y D-07.4 ya están adoptados e implementados
   (2026-10-15). Lo siguiente es, por orden: **revisar la matriz del catálogo** —tres asignaciones de severidad
   son decisión de producto— y luego **D-07.5 y D-07.6**, que necesitan un responsable regulatorio y son las que
   tocan el expediente. Hasta que no se publique y adopte un catálogo con severidades, la distribución de riesgo
   de P0-030 sigue en `UNKNOWN`.
3. **D-34** — depende de que exista un paquete DD aprobado, que a su vez depende de las anteriores.
4. **D-09 parte B** (empezando por el ensayo sintético) y después **D-42**.
5. **D-04** y el **contrato de concesiones** — los dos criterios que faltan para cerrar **P0-003**.
6. **D-38** — no cierra ninguna historia (P0-025 ya es DONE_LOCAL); hace falta antes de operar con datos reales.
