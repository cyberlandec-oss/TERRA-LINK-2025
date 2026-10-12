# Backlog ejecutable

Estado inicial para todas las historias: `PENDIENTE_DE_VERIFICAR`. P0-001–026 conservan IDs y temas de S1 §100. Las historias 027–031 hacen explícitas capacidades incluidas en otras secciones de las fuentes. Criterios son propuesta de ingeniería. Antes de implementar, acreditar lo que ya existe y abrir solo gaps.

## TECH-001 — Foundation y auditoría del repositorio

Prioridad P0; sin dependencia de código nuevo. Como equipo, necesito una línea base real para continuar sin recrear módulos ni aplicar un stack desactualizado.

Aceptación: inventario con commit/rama, manifiestos/lockfiles, módulos, migraciones, catálogo RBAC, tests y comandos; comparar con RF; decidir stack/estructura en ADR-0001; mapear documentos a paths reales; ajustar globs de rules; producir ERD/diccionario/OpenAPI ejecutable/CTE-KDE/eventos/riesgo/CI; registrar verificaciones y gaps en estado. Si repo vacío, crear skeleton mínimo validado después de decidir stack. No atribuir implementación a este paquete.

## Historias P0 de la fuente

### P0-001 — Organización
Depende TECH-001. Como ORG_ADMIN, necesito organización activa/configurada.
Aceptación: crear con datos mínimos, selección por membresía, suspensión impide nueva operación autorizada sin borrar historia; usuario A no accede B. RF-01; QA-01/02.

### P0-002 — Usuarios
Depende P0-001. Como administrador, necesito gestionar acceso del equipo.
Aceptación: alta/invitación según auth real, membresía, desactivación y reactivación auditadas; sin credenciales publicadas ni acceso heredado tras baja. RF-02; QA-01.

### P0-003 — RBAC y aislamiento
Depende P0-001/002. Como dueño de datos, necesito mínimo privilegio.
Aceptación: catálogo efectivo, permisos por acción/recurso, checks de FK/jobs/objects; casos A→A y A→B, buyer/grants y superadmin/elevación; UI no sustituye backend. RF-03; QA-02.

### P0-004 — Productor
Depende P0-003. Como técnico, necesito registrar/consultar productor.
Aceptación: crear/buscar/editar con validación, historial y asignación; identidad protegida; baja lógica mantiene entregas/parcela. RF-04; QA-03/13.

### P0-005 — Código y deduplicación
Depende P0-004. Como steward, necesito identificar sin duplicar.
Aceptación: código único por tenant bajo concurrencia; mismos códigos en A/B permitidos según regla; coincidencia de identidad genera revisión sin fusión silenciosa. RF-05; QA-03.

### P0-006 — Parcela
Depende P0-004. Como técnico, necesito vincular productor y parcela.
Aceptación: FK mismo tenant, código/datos, geometría histórica/version actual y permisos; cambiar parcela genera versión y conserva snapshot utilizado. RF-06; QA-04/02.

### P0-007 — Punto GPS
Depende P0-006. Como técnico, necesito capturar ubicación verificable.
Aceptación: coordenadas/método/hora, precisión null explícita, permiso GPS recuperable; punto no calcula área de finca. RF-07; QA-04/08.

### P0-008 — Polígono GPS
Depende P0-006/007. Como técnico, necesito perímetro trazable.
Aceptación: vértices persistentes, cierre/validación, precisiones por muestra y resumen incompleto cuando falten; edición crea versión. RF-08; QA-04/08.

### P0-009 — GeoJSON
Depende P0-006/010. Como trazabilidad, necesito intercambio geográfico.
Aceptación: import/export autorizado, `[lon,lat]`, perfil destino, límites y errores; file import no duplica registros al reintentar. RF-09; QA-04/02.

### P0-010 — Validación GIS
Depende P0-006. Como responsable de datos, necesito motivos de validez.
Aceptación: geometría/CRS/área/duplicados/cobertura, estados y versión de regla; umbral debajo/igual/encima probado tras aprobar perfil; sin reparación destructiva silenciosa. RF-10; QA-04.

### P0-011 — Productos
Depende P0-003. Como operador, necesito producto/estado/unidad coherentes.
Aceptación: catálogo de cacao y unidades, códigos por ámbito; transformación cambia estado con evento/rendimiento, no conversión implícita. RF-11; QA-05/06.
Capacidades (2026-10-10): «catálogo y unidades» verificada y disponible para P0-012; «transformación con evento/rendimiento» pendiente y demostrable solo con P0-016 (procesamiento). P0-011 sigue abierta hasta demostrarla.
**2026-10-10: transformación demostrada en P0-016** (fermentación CACAO_BABA → CACAO_FERMENTADO con `ProcessingRunClosed`, rendimiento en masa y sin conversión implícita): P0-011 **DONE_LOCAL**.

### P0-012 — Entrega y recepción
Depende P0-004/006/013/014/015 y de la **capacidad** «catálogo de productos y unidades» de P0-011 (verificada el 2026-10-10; el criterio de transformación de P0-011 no bloquea Entregas). Como recepción, necesito cantidad y origen reales.
Aceptación: entrega declarada, peso recibido, recepción parcial/completa, diferencias con causa, vínculos válidos y quality básica; confirmar repetido no crea doble stock. RF-12; QA-05/06.
Estado (2026-10-10): capacidades demostradas verificadas localmente; **historia abierta** por «diferencias con causa» (requiere política de cierre y tolerancias, D-33). P0-016 puede usar las cantidades ya recibidas sin esperar ese cierre (propuesta sin aprobar en `docs/decisiones/P0-016-017-PROPUESTA-LOTES-INVENTARIO.md`).

### P0-013 — CTE
Depende TECH-001. Como trazabilidad, necesito hitos definidos.
Aceptación: catálogo versionado de harvest/delivery/reception/weighing/processing/storage/packaging/sale/shipment; hechos operativos mapeados a eventos existentes. RF-13; QA-05.
Nota (2026-10-10): cada historia que implemente una operación (P0-012, P0-016, P0-017, P0-029) debe pasar su vínculo CTE de PENDING a INTEGRATED con una nueva versión del catálogo. HARVEST, PACKAGING y SALE no tienen historia asignada (D-33).

### P0-014 — KDE
Depende P0-013. Como steward, necesito datos mínimos por hito.
Aceptación: definición, validación, condición, responsable y versión; faltantes aparecen como tales e impiden transición aplicable sin inventarlos. RF-14; QA-05.

### P0-015 — Eventos
Depende TECH-001 y de la **capacidad** «autorización dentro del tenant» de P0-003 (verificada). Los criterios abiertos de P0-003 (concesiones externas/grants y elevación de plataforma, D-04) bloquean solo la visibilidad de eventos para terceros con concesión y el acceso de plataforma a eventos. Como auditor, necesito historial causal.
Aceptación: envolvente/versión/tenant/actor/tiempos, append-only, correction_of, outbox atómico y consumo idempotente; evento repetido no duplica efectos. RF-15; QA-05/07/13.

### P0-016 — Lotes y procesos
Depende P0-012/015. Al cerrar un proceso se demuestra el criterio pendiente de P0-011 (transformación con evento y rendimiento) y se integra el vínculo CTE FERMENTATION/DRYING. Como trazabilidad, necesito reconstruir mezclas/transformaciones.
Aceptación: lote con inputs/outputs/run; DAG sin ciclos; origen conservado en salida; cierre atómico y consulta upstream/downstream con cantidades y permisos. RF-16; QA-07.
Contrato propuesto (2026-10-10, sin aprobar): `docs/decisiones/P0-016-017-PROPUESTA-LOTES-INVENTARIO.md` (asignación sin doble uso desde P0-016; ledger completo en P0-017). Decisiones bloqueantes: D-39 (adoptadas para desarrollo local el 2026-10-10).
Estado (2026-10-10): criterios originales demostrados localmente (lote con entradas/salidas/proceso, DAG sin ciclos, origen conservado, cierre atómico, consultas con cantidades y permisos); FERMENTATION integrada. **Historia abierta** por la integración de DRYING (cierre bloqueado hasta definir la unidad de humedad, D-32), que el backlog asocia a P0-016.

### P0-017 — Inventario/balance de masa
Depende P0-016. Como operación, necesito cantidades conservadas.
Aceptación: ledger, merma, traslado, reserva/despacho y ajuste con motivo; 800→750+50 válido, exceso rechazado; prueba concurrente impide doble consumo/saldo negativo. RF-17; QA-06.
Estado (2026-10-10): ledger como única fuente, merma, traslado, ajuste con motivo, 800→750+50 y concurrencia demostrados localmente; STORAGE integrada. **Historia abierta**: «reserva/despacho» requiere embarques (docs/06 `reservations.shipment_id` R) → P0-029. Efectos por operación: `docs/decisiones/P0-017-EFECTOS-LEDGER.md`.

### P0-018 — Documentos
Depende P0-003/025. Como usuario, necesito soportes privados/versionados.
Aceptación: carga/cuotas/checksum/cuarentena/escaneo, vigencia y nueva versión; descarga exige permiso; malware y escáner caído no se aprueban. RF-18; QA-09.

### P0-019 — Evidence graph
Depende P0-018. Como EUDR_MANAGER, necesito saber qué respalda una afirmación.
Aceptación: claim, fuentes/versiones y enlaces tipados; soporta contradicción, revisión/verificación y expiración; nueva versión no hereda aprobación. RF-19; QA-09/10.

### P0-020 — Risk engine
Depende P0-010/016/019. Como EUDR_MANAGER, necesito causas reproducibles.
Aceptación: categorías/factores/reglas/snapshot; separar severidad/proceso/conclusión; faltantes no son score cero; reevaluación crea versión y factor crítico no se diluye. RF-20; QA-10.
Estado (2026-10-10): criterios demostrados localmente con reglas técnicas de docs/13 **no aprobadas** (sin pesos, umbrales ni severidades); conclusión regulatoria UNDETERMINED. Reglas dependientes de D-05, proveedor satelital (P0-028) y mitigaciones (P0-021) quedan no evaluables. Sin mitigaciones ni expediente (P0-021/P0-022).

### P0-021 — Mitigación
Depende P0-020. Como responsable, necesito resolver causa con evidencia.
Aceptación: acción/assignee/plazo/soporte; aportar→verificar/rechazar con motivos y permisos; resolver dispara reevaluación y actualiza pendientes reales. RF-21; QA-11.
Estado (2026-10-10): criterios demostrados localmente. Separación de funciones de docs/13 aplicada (el ejecutor no verifica; sin política de excepción); D-37 (Evidencias) no se modifica. Reevaluación asíncrona por outbox; catálogo de riesgo sigue NO APROBADO y conclusión UNDETERMINED.
Revisión (2026-10-10): la verificación ahora exige declarar el criterio de aceptación; se distinguen soporte aceptado, acción ejecutada y causa. La verificación DEMO anterior se corrigió (soporte aceptado, criterio no cumplido, causa persiste) con la decisión original conservada; la reevaluación separa quién la desencadenó, el worker que la ejecutó y la revisión humana.
Recorrido visual completo (2026-10-10): ejecutor aporta y entrega → segunda persona DEMO (`eudr.cooperativa`, rol EUDR_MANAGER existente) verifica → outbox crea la evaluación 2 → DATA_MISSING_ORIGIN y MATERIAL_OF_UNKNOWN_ORIGIN siguen bloqueantes; conclusión Indeterminada.

### P0-022 — Diligencia y paquete
Depende P0-017/019/020/021. Como EUDR_MANAGER, necesito preparación verificable.
Aceptación: guards por requisito, revisión autorizada, snapshot/manifest, export auditado; cambio relevante invalida readiness actual; export no marca DDS aceptada. RF-22; QA-12.
Estado (2026-10-10): **ABIERTA**. Capacidades independientes implementadas y probadas localmente (expediente, guards, instantánea/manifest, revisión, borrador interno exportado y auditado, desactualización por cambio relevante, redacción). No demostrable todavía: aprobar una preparación READY y exportar `DD_PACKAGE` con datos reales (bloqueados por catálogo de riesgo no aprobado, conclusión UNDETERMINED, perfil jurídico P1-005, D-05, satélite P0-028 y embarques P0-017/P0-029); el generador se probó solo con una fixture sintética.

### P0-023 — Captura offline
Depende P0-004/006/007/008 y auth real. Como técnico, necesito trabajar sin red.
Aceptación: entidad/cola en transacción local; borradores/fotos/GPS sobreviven cierre y reboot; dataset limitado y separación por cuenta; sesión offline definida. RF-23; QA-08.
Estado (2026-10-10): **ABIERTA**. `apps/mobile` (Expo SDK 57): transacción local, recuperación, separación por cuenta/organización, fotos persistentes y fallos de almacenamiento probados en Node con SQLite real; dataset autorizado probado contra la API local. Pendiente obligatorio: ensayo en Android real (cierre, reinicio, fotos, ubicación) y cifrado SQLCipher en build de desarrollo; política de sesión D-40 sin aprobar.
Revisión (2026-10-11): la captura termina al vencer la sesión del servidor (sin ventana de 72 h); build nativo sin cifrado no abre el almacén; Expo Go limitado a fixtures sintéticos (sin cámara ni ubicación reales); fotos dentro de la base y sin metadatos embebidos. Build nativo y ensayo Android bloqueados por espacio en disco (6,3 GB libres). Sigue ABIERTA.

### P0-024 — Sync
Depende P0-023/015. Como técnico, necesito sincronizar sin pérdidas.
Aceptación: operation_id estable, dedup por hash, dependencias/cursor/tombstones, conflictos visibles y adjuntos; servidor revalida tenant/permisos; timeout/retry no duplica inventario. RF-24; QA-08/02.
Estado (2026-10-11): **ABIERTA**. Servidor y motor móvil implementados para `PLOT_LOCATION_SAMPLE_CREATE` y `PLOT_PHOTO_ATTACH`, probados en integración (API real) y con el cliente en Node contra la API local. No demostrado: inventario/entregas (sin operaciones móviles; la protección contra duplicar inventario no se acredita con ubicación y fotos), recorrido en dispositivo Android y resolución de conflictos en la interfaz del dispositivo.

### P0-025 — Audit trail
Depende P0-003/015. Como auditor, necesito reconstruir quién cambió qué.
Aceptación: creación/corrección/aprobación/rechazo/descarga/export/permisos/risks, metadata/versiones y redacción; lectura/export por alcance. RF-25; QA-13.

### P0-026 — Excel import
Depende P0-004/005/006/011/012 según plantilla. Como asociación, necesito migrar registros.
Aceptación: plantilla/mapeo/preview/errores por fila/commit controlado; IDs no cruzan tenant; reimport no duplica ni borra campos fuera de mapping; legacy/missing explícitos. RF-26; QA-03.
Estado (2026-10-12): **DONE_LOCAL**. Las cinco plantillas de S1 §62 implementadas y verificadas localmente: productores, productos, parcelas (sin geometría), entregas (solo borradores, identidad por código o referencia de importación) y lotes (asignación de recepciones confirmadas vía ledger). Criterios contrastados en `docs/decisiones/P0-026-IMPORTACION-EXCEL.md`. Limitación registrada: solo archivos sintéticos y datos DEMO; sin Excel real de una asociación.

## Cobertura operativa P0 adicional

### P0-027 — Web por rol y Lot Hub
Depende contratos aplicables P0-003/004/006/016/019/020/022. Como operador, necesito completar trabajo desde contexto.
Aceptación: home/menu por permiso, hub y enlaces seguros, estados loading/vacío/403/error separados, formularios conservan datos y acciones tienen efecto de dominio; no métricas falsas. RF-27; QA-14.
Estado (2026-10-12): **DONE_LOCAL** (reabierta y cerrada de nuevo el mismo día: «Parcelas sin ubicación» exige punto o polígono —la superficie declarada no la resuelve— y el aviso de parcelas restringidas depende solo del permiso; `validation-results/2026-10-12T17-51-31-124Z`). «Mi trabajo» con tareas reales por alcance, Lot Hub con evidencias y riesgo/mitigación/expediente por permiso, fuga de parcelas de origen corregida, organización ajena «no disponible», filtros en la URL; matriz de 22 combinaciones cuenta–organización–rol, estados, teclado, 390 px y zoom 200 %. Ver `docs/decisiones/P0-027-WEB-POR-ROL-Y-LOT-HUB.md`. Limitaciones: destino/embarques (P0-029), evidencias por origen (P0-019), BUYER/PRODUCER/SUPER_ADMIN sin acceso implícito.

### P0-028 — Primer proveedor satelital
Depende P0-010/019/020. Como EUDR_MANAGER, necesito resultado con procedencia.
Aceptación: adapter/job, contrato real y coste, credenciales protegidas, dataset/versión/fecha/método/cobertura; timeout/no coverage no generan verde; defensa egress/SSRF probada. RF-28; QA-15.

### P0-029 — Movimientos y embarque
Depende P0-017/022. Como exportación, necesito despacho consistente.
Aceptación: ubicaciones/contraparte/ítems, reserva y saldo concurrentes, preflight/calidad/evidencia/DD, despacho idempotente y grafo destino; sin saltar bloqueos. RF-29; QA-06/12.

### P0-030 — Reportes e indicadores
Depende dominios reportados y P0-025. Como gerente, necesito cifras demostrables.
Aceptación: filtro tenant/periodo, denominador/definición, datos reales, export autorizado con snapshot y audit; reporte no filtra PII ni confunde readiness con conformidad. RF-30; QA-13/14.

### P0-031 — Piloto y operación reproducible
Depende P0-001–030 aplicables. Como cliente piloto, necesito operar la cadena sin intervención de desarrollador.
Aceptación: recorrido con dataset/usuarios de piloto, Android real, discrepancias gestionadas, restore DB+objetos y capacitación/manual; hallazgos priorizados y gates pendientes explícitos. RF-31; QA-16/17.

## Historias P1

| ID | Resultado | Dependencia | Aceptación mínima |
| --- | --- | --- | --- |
| P1-001 | Buyer Portal | P0-022/029, grants | Recurso/fields/período compartidos; revocación bloquea nueva consulta; QA-02/14 |
| P1-002 | QR/pasaporte | P1-001 | Referencia pública sin IDs/PII, vistas por audiencia, no sustituye DDS |
| P1-003 | My Work ampliado | P0-021/022/027/029 | Cola personal/supervisión y filtros reales; acción resuelve dominio; QA-11/14 |
| P1-004 | Onboarding y madurez | P0-026/027 | Wizard, evidencia de nivel 0–6, tareas; madurez no conclusión jurídica |
| P1-005 | Perfil Ecuador legal validado | P0-019/020 | Fuente/requisito/aplicabilidad/documento/regla/version/aprobador; pruebas de vigencia |
| P1-006 | GUIA | Canal verificado, P1-005 | Mapping/conciliación/log y acuerdo de intercambio; fallback import/export |
| P1-007 | EUDR-IS | P0-022, rol/canal verificados | Fixture/ensayo ACCEPTANCE, recibos auténticos, reconciliation ante timeout; permiso separado de producción |
| P1-008 | ERP/API/webhooks | P0-015/029 | Firma/idempotencia/tenant/mapping; referencia de paquete/submission exacta |
| P1-009 | Simulador de readiness | P0-022/029 | Solo lectura, mismas reglas/snapshot que preflight; bloqueos aunque porcentaje alto |
| P1-010 | Coste de preparación | P0-028/030 | Coste real/moneda, asignación por productor/tonelada y supuestos visibles |
| P1-011 | Histórico temporal/alertas | P0-006/028 | Comparar geometría/datasets/periodos con limitaciones; no inferir datos inexistentes |
| P1-012 | Precio/prima/pagos registrados | P0-012/029 | Dato informado/versionado y moneda; privacidad; ninguna transferencia automática |
| P1-013 | OCR/IA asistida | P0-018/019 | Campos sugeridos con fuente/confianza y revisión; no decisión regulatoria automática |
| P1-014 | Analytics/supplier score | P0-030 | Métricas comerciales separadas de riesgo jurídico, denominadores y permiso |
| P1-015 | Idiomas/SSO/consumo | TECH-001 y piloto | ADR por componente, español conservado y límites/coste/SSO comprobados |

## P2 fuera del MVP

Marketplace de servicios, red colaborativa de datos/capas, IA asistente avanzada, financiación/seguros, pagos reales, carbono, predicción, blockchain/tokenización y expansión. Cada iniciativa requiere caso de negocio, permiso/privacidad, ADR y requisitos propios; no inferir autorización para implementarlas de su mención en el benchmark.

## Gestión

Estados: `PENDIENTE_DE_VERIFICAR → GAP_CONFIRMADO → READY_FOR_DEV → IN_PROGRESS → IN_REVIEW → VERIFIED`; `BLOCKED` con motivo y siguiente acción. Regla: dependencia satisfecha por evidencia o contrato/mock explícito, no por checkbox. Estimación se hace tras inspeccionar código y equipo; no heredar el calendario ilustrativo como compromiso.

### Corrección de dependencias por capacidad (2026-10-10)

Se detectó un ciclo: P0-012 dependía de P0-011 completa; el criterio de transformación de P0-011 solo se demuestra con P0-016, que depende de P0-012. Fundamento de la corrección: una dependencia expresa la **capacidad** que la historia consumidora necesita. Entregas necesita productos y unidades válidos (verificado), no la transformación. Por eso P0-012 depende de la capacidad «catálogo y unidades» de P0-011, y el criterio de transformación sigue dentro de P0-011, abierto hasta P0-016. No se eliminó ni simuló ningún requisito.

| Capacidad | Historia | Estado | Bloquea a | No bloquea |
| --- | --- | --- | --- | --- |
| Catálogo de productos y unidades | P0-011 | Verificada | — | P0-012 |
| Transformación con evento/rendimiento | P0-011 | Pendiente (demostrable con P0-016) | Cierre de P0-011 | P0-012 |
| Autorización dentro del tenant | P0-003 | Verificada | — | P0-015 (eventos del tenant) |
| Concesiones externas (grants) | P0-003 | Bloqueada (contrato ausente, ADR-0002/P1-001) | Eventos visibles a terceros con concesión (P0-015), P1-001 | Eventos del tenant |
| Elevación de plataforma | P0-003 | Bloqueada (D-04) | Acceso de SUPER_ADMIN a eventos de un tenant | Eventos del tenant |

### Criterio de cierre de la etapa local (desde 2026-10-10)

Estado adicional `DONE_LOCAL`: criterios de la historia cumplidos con evidencia de pruebas locales (`npm run validate` aprobado + suites de la historia) y documentación al día. No requiere GitHub Actions. No equivale a producción ni a conformidad EUDR. Un criterio que dependa de una decisión no tomada o de un contrato inexistente deja la historia abierta solo si ese criterio forma parte de su aceptación; el resto de decisiones provisionales se registran sin bloquear. Estado vigente en docs/23.
