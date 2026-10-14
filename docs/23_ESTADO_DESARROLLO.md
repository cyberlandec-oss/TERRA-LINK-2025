# Estado compartido de desarrollo

Última actualización: 2026-10-10. Repositorio `cyberlandec-oss/TERRA-LINK-2025`, rama de trabajo `feat/tech-001-ci-p0-002` (PR #1 abierto como respaldo y revisión; `main` en `03bb2f6`).

> Resultados ajenos a este proyecto: la auditoría inicial del repo `cacao` no aplica a Terra Link 2025.

## Criterio vigente: validación local

GitHub Actions no es requisito en esta etapa (workflow inactivo en `infra/ci/github-actions-ci.yml`). La facturación de GitHub **no es un bloqueo**. **DONE_LOCAL** = criterios de la historia cumplidos con evidencia local (`npm run validate` aprobado + suites de la historia). DONE_LOCAL no acredita producción, Android real ni conformidad EUDR.

Última validación: `npm run validate` **APROBADA** el 2026-10-14 sobre el commit `c5e44da`
(`validation-results/2026-10-14T04-25-23-695Z`, no versionado): 7 pasos — servicios 1,1 s, typecheck 27,6 s, lint 11,2 s,
build 31,7 s, OpenAPI validado 27,4 s, **50 suites y 389 pruebas** de unitarias + integración (520,7 s) y **57 pruebas**
E2E de navegador (124,5 s). La anterior, sobre `ad03b80` (`2026-10-14T02-21-43-641Z`), acreditó P0-029 con 49 suites y
381 pruebas.

**Pendiente de entorno, abierto**: entre el 2026-10-12 y el 2026-10-14 cinco corridas seguidas fallaron, cada una con una
suite distinta superando el timeout de 60 s. La causa no está confirmada; la hipótesis principal es la latencia del disco
USB donde se trasladó el almacenamiento de Docker. Una corrida aprobada **no** la confirma ni la descarta. Diagnóstico y
mediciones en `docs/qa/DIAGNOSTICO_VALIDACION_INESTABLE_2026-10-13.md`.

## Estado por historia

| Historia | Estado | Motivo |
| --- | --- | --- |
| TECH-001 | **DONE_LOCAL (fundamentos)** | Ver tabla; lo funcional pendiente pasa a sus historias |
| P0-001 Organización | **DONE_LOCAL** | Criterios cumplidos; D-18 provisional no afecta el criterio |
| P0-002 Usuarios | **DONE_LOCAL** | Criterios cumplidos con la autenticación vigente; entrega de invitaciones provisional (D-19) registrada |
| P0-003 RBAC y aislamiento | **ABIERTA, bloqueada en 2 criterios** | «buyer/grants» sin contrato (ADR-0002, P1-001) y «superadmin/elevación» sin D-04. El resto, verificado |
| P0-004 Productor | **DONE_LOCAL** | Brecha de cifrado de identidad resuelta (migración 0006) |
| P0-005 Código y deduplicación | **DONE_LOCAL** | Unicidad concurrente, coincidencia de identidad y revisión sin fusión |
| P0-006 Parcela | **DONE_LOCAL** (brecha corregida el 2026-10-10) | Clasificación de geometría exacta (doc 06) faltaba: detectada al iniciar P0-007, corregida con `plot:read_geometry` y probada antes de volver a declararla cumplida |
| P0-007 Punto GPS | **DONE_LOCAL** con evidencia **simulada**; captura real pendiente de comprobación humana | Ver criterios abajo |
| P0-030 Reportes e indicadores | **ABIERTA** (2026-10-14, revisión 2). Demostrado: 11 KPI de §60 desde consultas reales con **cinco estados** (`OK` con cero observado, `NO_DENOMINATOR`, `UNKNOWN`, `CRITERION_UNDEFINED`, `RESTRICTED`) y conteos `observed`; **seis reportes por entidad de §97** con alcance antes de agregar y totales sobre el conjunto completo; **GeoJSON técnico** reutilizando P0-009 con `plot:read_geometry`; cobertura histórica corregida (incompleta, sin excluir registros por fecha operativa anterior al 13-oct); zona horaria y límites declarados; CSV/GeoJSON con hash, auditoría y aviso de recálculo. Bloqueado: `plots_valid`, distribución de riesgo y **perfil regulatorio del GeoJSON** (D-05 y dependientes). Pendiente: paginación de volumen, reportes programados y series comparables | Ver `docs/decisiones/P0-030-CRITERIOS.md` (estado por criterio), `docs/decisiones/P0-030-REPORTES.md` y `docs/qa/EVIDENCIA_P0-030_2026-10-14.md` |
| P0-029 Movimientos y embarque | **ABIERTA**: reserva/liberación/cancelación en el ledger, preflight y destino en el Lot Hub demostrados; **despacho no demostrado** (bloqueado por D-34, DD READY inalcanzable y calidad pendiente; mecánica probada solo con preflight sintético). `npm run validate` **APROBADA** el 2026-10-14 sobre `ad03b80` (`2026-10-14T02-21-43-641Z`): es la primera completa que incluye esta historia, y no cierra el pendiente funcional. CTE `SHIPMENT` figura INTEGRATED en su sentido de contrato —la operación y su evento existen—, no como despacho acreditado | Ver `docs/decisiones/P0-029-EMBARQUES.md` y `docs/qa/EVIDENCIA_P0-029_2026-10-12.md` |
| P0-027 Web por rol y Lot Hub | **DONE_LOCAL** (2026-10-12): reabierta por la condición de «Parcelas sin ubicación» y el aviso de parcelas restringidas; corregida y `npm run validate` aprobada (`2026-10-12T17-51-31-124Z`) | Ver `docs/decisiones/P0-027-WEB-POR-ROL-Y-LOT-HUB.md` |
| P0-026 Importación Excel | **DONE_LOCAL** (2026-10-12): cinco plantillas (productores, productos, parcelas, entregas, lotes) con criterios originales contrastados; `npm run validate` aprobada sobre el commit. No acredita uso con un Excel real de una asociación | Ver `docs/decisiones/P0-026-IMPORTACION-EXCEL.md` |
| Superficie declarada (P0-006) | **Adopción para desarrollo local** (2026-10-12): actualizarla conserva la geometría vigente; no hereda evaluaciones GIS | Ver `docs/decisiones/SUPERFICIE-DECLARADA-CONSERVA-GEOMETRIA.md` |
| P0-024 Sync | **ABIERTA**: servidor y motor móvil para ubicación y foto; probado en integración y con cliente Node contra la API; sin dispositivo ni inventario | Ver criterios abajo |
| P0-023 Captura offline | **ABIERTA**: sesión sin ventana extra, cifrado obligatorio en build nativo y fotos en la base probados en Node; sin ensayo Android real ni SQLCipher en dispositivo | Ver criterios abajo |
| P0-022 Diligencia y paquete | **ABIERTA**: capacidades independientes DONE_LOCAL; aprobación READY y `DD_PACKAGE` con datos reales no demostrables (requisitos dependientes de decisiones y capacidades inexistentes, sin rebajar) | Ver criterios abajo |
| P0-021 Mitigación | **DONE_LOCAL** (criterios originales demostrados); causas que dependen de D-05 o del proveedor satelital no se mitigan (no se simula su resolución) | Ver criterios abajo |
| P0-020 Riesgo | **DONE_LOCAL** para sus criterios originales con reglas técnicas **no aprobadas**: severidad NOT_ASSESSED y conclusión UNDETERMINED por diseño; reglas dependientes de D-05, P0-028 y P0-021 no evaluables | Ver criterios abajo |
| P0-017 Inventario y balance de masa | **Criterios demostrados localmente excepto despacho**; STORAGE integrada (CTE 1.3.0); reserva para embarques demostrada con P0-029 (2026-10-12). **Historia abierta**: el despacho sigue bloqueado (P0-029, D-34) | Ver criterios abajo |
| P0-016 Lotes y procesos | **Criterios originales demostrados localmente**; FERMENTATION integrada (CTE 1.2.0). **Historia abierta**: integración de DRYING pendiente (cierre bloqueado por la unidad de humedad, D-32/D-39.3) | Ver criterios abajo |
| P0-012 Entregas y recepción | **Capacidades demostradas: verificadas localmente** (entrega, peso recibido, parciales, vínculos, calidad básica como decisión humana, no duplicación). **Historia completa: ABIERTA**, pendiente del criterio «diferencias con causa» (cierre y tolerancias sin política, D-33). Evidencia por criterio abajo (entrega, recepción física parcial, pesaje, soportes, calidad separada, correcciones, compuertas por transición) con decisiones de diseño MVP D-33/34/35 no validadas en campo; cierre por debajo de lo declarado, tolerancias, catálogo de límites, centros asignados e inventario (P0-017) pendientes | Ver criterios abajo |
| P0-025 Auditoría | **DONE_LOCAL** (criterios de la historia sobre los módulos existentes); auditoría de riesgo, entregas, procesamiento, expediente y concesiones pendiente de sus historias; formato de exportación provisional (D-38) | Ver criterios abajo |
| P0-019 Evidencias | **DONE_LOCAL** (criterios de la historia); afirmaciones de lote, análisis ambiental y mitigación esperan sus entidades; uso en riesgo/expediente es P0-020/P0-022 | Ver criterios abajo |
| P0-018 Documentos | **DONE_LOCAL** (criterios de la historia); usa auditoría ya verificada; P0-025 y P0-019 ya cerradas en local | Ver criterios abajo |
| P0-015 Eventos | **DONE_LOCAL** para los criterios internos de la organización (correction_of con efecto real en productor, historial autorizado, reproceso DEAD, fencing); concesiones externas y elevación siguen en P0-003 | Ver criterios abajo |
| P0-014 KDE | **DONE_LOCAL** para catálogo y servicio de validación; 0 compuertas integradas (cada operación lo demuestra en su historia); D-33, D-34 y configuración jurídica pendientes | Ver criterios abajo |
| P0-013 CTE | **DONE_LOCAL** (catálogo versionado y mapeo de lo existente; la integración de cada operación es criterio de su propia historia) | Ver criterios abajo |
| P0-011 Productos | **DONE_LOCAL** (2026-10-10): el criterio pendiente «transformación cambia estado con evento/rendimiento» quedó demostrado con la fermentación de P0-016 (`lots.int-spec.ts`, E2E) | Ver criterios abajo |
| P0-010 Validación GIS | **ABIERTA**: parte técnica verificada localmente (`TL_GIS_TECH 1.0.0`); umbral debajo/igual/encima y perfil de destino dependen de D-05 (propuesta no aprobada) | Ver criterios abajo |
| P0-009 GeoJSON | **ABIERTA**: alcance independiente verificado localmente; «perfil destino» depende de P0-010/D-05 (dependencia del backlog conservada) | Ver criterios abajo |
| P0-008 Polígono | **DONE_LOCAL** con evidencia de integración (PostGIS real) y navegador **[SIMULADA]**; captura real de campo pendiente | Ver criterios abajo |

### TECH-001 — criterio por criterio

| Criterio (doc 18) | Estado | Evidencia o destino |
| --- | --- | --- |
| Inventario, stack y estructura (ADR-0001), rules mapeadas | Cumplido | ADR-0001, `.claude/rules` |
| Comandos reproducibles | Cumplido | docs/20, `npm run validate` |
| Validación automatizada («CI») | **Cumplido en local**: `npm run validate` sustituye a Actions en esta etapa | docs/20 |
| Migraciones versionadas | Cumplido (0001–0007) | `apps/api/src/db/migrations` |
| OpenAPI ejecutable **validada** | Cumplido: generada y validada en cada `validate` | `npm run openapi -w apps/api` |
| ERD/diccionario contrastados | Cumplido para lo implementado | doc 06 «Esquema implementado» |
| Matriz RBAC real | Cumplido | doc 07 |
| Envolvente de eventos + outbox | Cumplido | doc 08 «Implementación vigente», `events.int-spec.ts` |
| Contenedores (API, web, worker) | Cumplido | docs/20 |
| Catálogos CTE/KDE | **Trasladado** a P0-013 (CTE) y P0-014 (KDE): son funcionalidad de dominio | backlog |
| Framework de reglas / riesgo | **Trasladado** a P0-020 (risk engine) | backlog |
| Ledger de inventario | **Trasladado** a P0-016/P0-017 (ADR-0003) | backlog |
| Reproceso manual de entregas DEAD | Pendiente técnico menor; se hará con el primer consumidor crítico (P0-015/P0-028) | doc 08 |

### P0-003 — criterios

Verificados: catálogo efectivo, permisos por acción y recurso, organización y membresía activas, referencias del mismo tenant, anti-escalamiento, efecto inmediato de revocaciones, ausencia de datos de otra organización, varios roles y organizaciones (`rbac.int-spec.ts`, `members.int-spec.ts`, E2E). **Bloqueados**: concesiones a BUYER/AUDITOR externos (falta contrato de grants) y elevación de SUPER_ADMIN (falta D-04; decisión mínima en docs/22). Jobs y objetos se verificarán cuando existan esos recursos.

### P0-004 — protección de identidad (revisión)

Doc 06 exige «identidad **cifrada**/restringida». Antes solo estaba restringida (brecha registrada). Ahora:
- Documento, teléfono y dirección se guardan con AES-256-GCM por campo. El AAD liga cada valor a su organización, registro y campo; las claves son versionadas, viven solo en `.env` (`PII_*`) y nunca en el repositorio.
- El número de documento tiene un índice ciego (HMAC con clave aparte) para la búsqueda exacta.
- No queda texto plano en la tabla ni en el historial (`producer_versions` cifra por versión).
- La migración 0006 cifra los datos existentes y se detiene sin cambios si faltan claves.
- Se mantiene la restricción por permiso (`producer:read_identity`): cifrado **y** permisos, no uno en lugar del otro.
- Pruebas: `pii.spec.ts`, `producer-identity-encryption.int-spec.ts` (sin texto plano en tablas, eventos ni auditoría; texto cifrado trasladado entre registros rechazado; migración con y sin claves).
- Pendiente operativo: custodia y respaldo de claves fuera del equipo y rotación con re-cifrado (antes de producción).

### P0-005 — criterios

| Criterio | Resultado | Evidencia (`producer-matching.int-spec.ts`) |
| --- | --- | --- |
| Código único por organización bajo concurrencia | 8 altas simultáneas → 1 × 201 y 7 × 409 `PRODUCER_CODE_TAKEN` | «unicidad del código bajo concurrencia» |
| Mismo código en otra organización | Permitido | «normalización del código…» |
| Normalización según contrato | Recorte de espacios; mayúsculas no unificadas (D-21, no bloquea) | ídem |
| Coincidencia de identidad | Mismo tipo y número normalizados → caso PENDING, sin cambios en productores | «coincidencia de identidad…»; mutante de la comparación de tipo detectado |
| Falsos positivos | Otro tipo, otro documento con el mismo nombre, otra organización → sin caso | «falsos positivos…» |
| Revisión asistida sin fusión | Resolver solo cambia el caso; productores intactos; par resuelto no se reabre; auditado | «resolver no fusiona…» |
| Permisos y aislamiento | `producer:review_duplicates` (ORG_ADMIN, MANAGER); técnico y auditor 403; otra org 404; quien registra solo ve el conteo | «permisos y aislamiento…» |
| UI en español | Aviso al registrar; página de revisión con identidad según permiso | E2E «posible duplicado…» |
| Fuera de alcance | Fusión de registros (sin contrato) y reglas no documentadas (D-22) | docs/22 |

### P0-006 — criterios

| Criterio (doc 18 / pedido) | Resultado | Evidencia (`plots.int-spec.ts` salvo indicación) |
| --- | --- | --- |
| FK productor mismo tenant | 422 `PRODUCER_NOT_AVAILABLE` (misma respuesta que fuera de alcance); FK compuesta en BD | «productor de otra organización…» |
| Código único por organización bajo concurrencia | 8 altas simultáneas → 1×201, 7×409 `PLOT_CODE_TAKEN`; mismo código en otra org permitido | «código concurrente…», «mismo código…» |
| Campos del contrato | Productor, código, cultivo obligatorios; nombre, variedad, uso del suelo y ubicación administrativa opcionales (doc 06, S1 §13) | «alta autorizada…» |
| Alta, búsqueda, listado paginado, detalle, edición | Cursor estable; filtros por texto, estado, situación geométrica y productor | API + E2E `parcelas.spec.ts` |
| Control de versión | Dos ediciones simultáneas → 200 + 409; versión geométrica con versión obsoleta → 409 | «conflicto de edición…»; E2E con borrador conservado |
| Geometría histórica y versión actual | `plot_versions` inmutable (trigger), `current_version_id` con FK compuesta; declarada → punto → polígono; la anterior intacta | «versiones geométricas…» |
| Superficie declarada y calculada separadas | Calculada solo para polígonos válidos con geodesia (~1,23 ha para 0,001°); punto sin superficie calculada (CHECK) | ídem |
| Comprobaciones estructurales ≠ validación GIS | 422 por anillo abierto o rango; autointersección guardada NOT_VALIDATED sin área; GPS/importación → 422 | «comprobaciones estructurales…», `geometry.spec.ts` |
| Técnico dentro de sus asignaciones | Solo productores asignados; parcela ajena por id → 404; la reasignación cambia el alcance | «técnico…»; mutante detectado; revisión visual (técnico no asignado) |
| Listados sin parcelas ajenas | ✔ | «listados sin parcelas ajenas…» |
| Historial y baja lógica | `plot_history` append-only; baja conserva versiones; productor de baja no admite parcelas | «baja lógica…» |
| Atomicidad y rollback | Fallos no dejan evento, historial ni auditoría; eventos sin coordenadas | «rollback…» |
| Interfaz (UI-06) | Menú por permiso, listado, alta contextual desde el productor, ficha con situación geométrica, esquema y tabla de coordenadas, navegación productor ↔ parcela; sin botones de GPS/importación | E2E + revisión visual |
| Fuera de alcance | Captura GPS (P0-007), polígono de campo (P0-008), GeoJSON (P0-009), validación GIS y umbral (P0-010, D-05) | — |

### P0-007 — criterios

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Coordenadas originales, fuente, adquisición, recepción, precisión, actor/organización/parcela/versión | `location_samples` + versión POINT `BROWSER_GEOLOCATION`, en una transacción con historial, evento y auditoría | `location-capture.int-spec.ts` «captura válida…» |
| La fuente no se presenta como GPS | Fuente `BROWSER_GEOLOCATION`; la UI explica que puede ser GPS, Wi-Fi o red | ídem; E2E |
| Fecha de adquisición preservada; recepción del servidor | `captured_at` = `position.timestamp`; `received_at` = `now()`; adquisición en el futuro → 422 | «captura válida…», «coordenadas, fecha y fuente inválidas…» |
| Precisión null explícita, 0 reportado, inválidas | null se conserva; 0 se conserva sin presentarse como perfecta; negativa, texto u omitida → 400 | «precisión…»; vitest `accuracyLabel` |
| Orden longitud/latitud | `ST_MakePoint(lon, lat)`; `ST_X` = longitud, `ST_Y` = latitud | «captura válida…» |
| Punto sin superficie | `area_calculated_ha` NULL; la declarada vigente se arrastra | «captura válida…», «versiones inmutables…» |
| Alcance del técnico y reasignación antes de guardar | No asignado 404; tras reasignar, el anterior 404 y el nuevo 201 | «alcance del técnico…» |
| Acceso entre organizaciones | 404 (ruta e id ajenos) | «acceso entre organizaciones…» |
| Conflicto y doble envío | 409 con muestra conservada; mismo `operation_id` → un efecto (201 + 200 réplica); reutilizado con otros datos → 409 | «doble envío…», «conflicto concurrente…»; E2E |
| Rollback y datos sensibles | Rechazos sin versión ni evento; eventos y auditoría sin coordenadas | «coordenadas, fecha…», «versiones inmutables…» |
| Captura web (UI-07) | Solicitar → revisar → confirmar → resultado; denegado, no disponible, timeout, sin soporte, cancelar; sin guardado automático | E2E `ubicacion.spec.ts` **[SIMULADA]** 8/8 |
| Captura real en este equipo | **No obtenida**: Chromium de Playwright sin proveedor de ubicación (timeout, código 3), con y sin ventana | Pendiente de comprobación humana en Edge/Chrome |

### P0-008 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T16-01-06-176Z`): API 131/131, web 4/4, E2E 30/30, OpenAPI 45 rutas. Revisión visual 23 entradas, 0 incidencias.

| Criterio | Resultado | Evidencia (`polygon-drafts.int-spec.ts` salvo indicación) |
| --- | --- | --- |
| Borrador en servidor, reapertura tras recargar, orden explícito, versión del borrador | `polygon_drafts` + `draft_vertices` (0010); `acquisition_seq`; `row_version` | «recuperación tras recargar»; E2E |
| Muestra por vértice (coordenadas originales, fuente, adquisición, recepción, precisión o null, operation_id) | Append-only | ídem |
| Doble envío idempotente; id reutilizado con otros datos | 201 + 200 réplica; 409 `OPERATION_ID_REUSED` | «doble envío idempotente» |
| Deshacer sin falsear la muestra | Fila en `draft_vertex_exclusions`; UPDATE/DELETE de vértices rechazados por trigger | «deshacer…» |
| Dos pestañas | 409 `VERSION_CONFLICT`, muestra conservada, recarga visible | «dos pestañas»; E2E |
| <3 vértices distintos / repetidos | 422, borrador conservado; repetidos advertidos | «menos de 3…» |
| Cierre sin muestra extra | Anillo cerrado con el primer vértice; 4 muestras → 5 posiciones; `accuracy_m` de la versión null | «cierre sin muestra adicional…» |
| Confirmación atómica e inmutable; cambio posterior = otra versión | Versión POLYGON + borrador CONFIRMED + historial + evento + auditoría en una transacción | ídem |
| Estructura / validez técnica / GIS P0-010 separadas | `storable`, `technically_valid` (ST_IsValid), `NOT_VALIDATED` | ídem; E2E |
| Autointersección | Rechazada (422 `POLYGON_NOT_VALID`, borrador conservado) salvo `keep_invalid_for_review`: sin superficie, motivo en notas, sin reparar (D-26 provisional) | «autointersección» |
| Resumen de precisión completo/mixto/ausente; 0 conservado | `summarizeAccuracy` | unitarias `accuracy-summary.spec.ts`; integración |
| Acceso: `plot:read_geometry`, revalidación por escritura, otra organización | Auditor 403 y sin coordenadas; reasignado 404; membresía desactivada rechazada; org suspendida 403; org ajena 404 | «reasignación y revocación…», «entre organizaciones…» |
| Sin coordenadas en eventos/auditoría | Verificado sobre el payload y `audit_logs` | «cierre…» |
| Rollback sin efectos parciales | Conflicto de versión y fallo forzado en la transacción: sin versión, evento ni cierre | «rollback…» |
| UI (añadir, lista, vista previa, deshacer, revisar, confirmar, estados, teclado, 390 px) | `lib/polygon-capture.tsx` | E2E `poligono.spec.ts` **[SIMULADA]** 4/4; revisión por rol |
| Captura real en campo | **No obtenida** (mismo límite que P0-007) | Pendiente humano en Edge/Chrome |

Límite: la emulación de Chromium siempre informa precisión; «precisión no informada» se prueba solo en integración.

### P0-009 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T17-00-24-210Z`): API 153/153, web 4/4, E2E 36/36, OpenAPI 53 rutas. Revisión visual 24 entradas, 0 incidencias. Perfil documentado en docs/10 §«Perfil de importación GeoJSON».

| Criterio | Resultado | Evidencia (`geometry-imports.int-spec.ts`, `geojson-profile.spec.ts`, E2E `geojson.spec.ts`) |
| --- | --- | --- |
| Import/export autorizado | Escritura: update en alcance + `plot:read_geometry` + org activa; lectura de original/exportación: read + `plot:read_geometry`. Auditor 403; técnico no asignado 404; otra organización 404 | «descarga del original…», «acceso entre organizaciones…», revisión por rol |
| `[lon, lat]` | Perfil RFC 7946; `ST_X` = longitud con ejemplo inequívoco; ejes nunca intercambiados (advertencia `POSSIBLE_AXIS_SWAP`) | integración «Polygon en Feature…», unitaria «orden de ejes» |
| Límites y errores | Bytes, profundidad, componentes, anillos y posiciones configurables; JSON mal formado, tipo, CRS, dimensiones, anillo abierto → 422 comprensible, sin eco ni almacenamiento | unitarias; «archivos fuera del perfil…»; E2E |
| Reintento sin duplicar | `operation_id` en análisis y confirmación; concurrente → una versión (201 + 200) | «doble confirmación…» |
| Revisión previa y versión única | Análisis → revisión (hash, tipo, componentes, huecos, posiciones, validez, advertencias, vista previa) → confirmación atómica con historia, evento y auditoría | «Polygon en Feature…», E2E |
| Original privado e intacto | S3 privado sin URL; SHA-256 del servidor; descarga revalida permisos y verifica el hash | «descarga del original…», E2E (bytes idénticos) |
| Staging y compensación (sin transacción S3+BD) | Fallo de subida → sin fila; fallo de BD → objeto borrado; original ausente → sin versión; descarte con fallo de borrado → barrido | «fallos de almacenamiento…» |
| Validez técnica vs P0-010 | Autointersección sin superficie, solo «conservar para revisión» (D-26), `NOT_VALIDATED`, sin reparar | «autointersección…» |
| Exportación actual/anterior; reimportación | Feature RFC 7946 sin identidad personal y con aviso «no es paquete EUDR»; serialización de 17 dígitos; reimportar conserva `geometry_hash` | «exportación…», E2E |
| Revocación/reasignación tras el análisis | Reasignado 404; membresía desactivada rechazada; org suspendida 403; la importación queda ANALYZED | «revocación o reasignación…» |
| MultiPolygon con huecos y compatibilidad | Versiones previas sin cambios (`source_import_id` NULL) | «MultiPolygon con hueco…», suites P0-006/007/008 en verde |
| **Perfil destino** | **Pendiente**: especificación GeoJSON del sistema receptor y reglas regulatorias dependen de P0-010/D-05 | — |
| Evidencia visual de precisión null (P0-008) | **[FIXTURE]**: muestras sintéticas enviadas a la API real con `accuracy_m` null; «Precisión no informada» y «(resumen incompleto)» en pantalla | E2E `poligono.spec.ts` |

Correcciones laterales: (1) el motivo de `ST_IsValidReason` incluía una coordenada y P0-008 lo guardaba en `notes` (visible sin `plot:read_geometry`); ahora se elimina en notas, eventos, auditoría y errores. (2) Las vistas de versiones usaban `ST_AsGeoJSON` con 9 decimales; ahora 17 (ida y vuelta exacta).

### P0-010 — criterios (parte técnica)

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T17-37-17-103Z`): API 168/168, web 4/4, E2E 37/37, OpenAPI 54 rutas. Revisión visual 25 entradas, 0 incidencias. Perfil documentado en docs/10 §«Evaluación GIS técnica».

| Criterio | Resultado | Evidencia (`gis-evaluation.int-spec.ts`, `storage-sweeper.int-spec.ts`) |
| --- | --- | --- |
| Geometría, CRS, coordenadas, vacía/degenerada, validez con motivos seguros | Comprobaciones con códigos controlados; ubicación del error solo con `plot:read_geometry` | «inválida…», «vacía y degenerada…» |
| Área solo cuando corresponde | Polígono válido → ha geodésicas; punto → no aplica; inválida → no ejecutada; huecos descontados | «punto sin área; huecos y MultiPolygon…» |
| Duplicados | Igualdad topológica (`ST_Equals`) distinta de igualdad de hash; distinto orden de vértices detectado | «igualdad topológica…» |
| Solapamiento vs contacto | Superficie compartida (DE-9IM) → REVIEW_REQUIRED; solo borde → VALID; sin intersección → VALID | «igualdad topológica…», «solo contacto…» |
| Cobertura de precisión | Completa, mixta, ausente, no disponible (importada) y no aplica | «punto sin área…», «vacía…» |
| Estados y versión de regla | VALID/WARNING/INVALID/REVIEW_REQUIRED con alcance técnico; regla y parámetros guardados | todos |
| Inmutable, versionado y desactualización | Append-only; reevaluar crea otro registro; GEOMETRY_CHANGED, COMPARED_PLOTS_CHANGED, RULES_CHANGED; sin compararse con su propio historial | «resultados inmutables…» |
| Acceso y privacidad | Auditor consulta sin evaluar ni coordenadas; técnico fuera de alcance 404; relaciones fuera de alcance sin identidad; otra organización 404; suspendida 403 | «acceso…», «igualdad topológica…» |
| Reintentos y rollback | `operation_id` concurrente → un registro; fallo forzado → sin evaluación, evento ni auditoría | «reintentos idempotentes…» |
| Errores, logs y NOTICE | NOTICE de PostGIS bloqueado (`client_min_messages=warning`, `ST_IsValidDetail`); errores de base registrados solo con SQLSTATE | «NOTICE de PostGIS…», «reintentos…» |
| Sin reparación destructiva | La evaluación no modifica versiones (plot_versions append-only) | — |
| **Umbral debajo/igual/encima** | **Pendiente de D-05** (propuesta en `docs/decisiones/D-05-PROPUESTA.md`, no aprobada) | — |
| Barrido programado (P0-009/D-29) | Worker: huérfanos con gracia y descartados; protección de referenciados bajo bloqueo; tareas reintentables; varios workers sin duplicar | `storage-sweeper.int-spec.ts` 6/6 |

### P0-011 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T18-06-40-557Z`): API 178/178, web 4/4, E2E 42/42, OpenAPI 60 rutas. Revisión visual 26 entradas, 0 incidencias. Contrato en docs/06 y D-31/D-32.

| Criterio | Resultado | Evidencia (`products.int-spec.ts`, E2E `productos.spec.ts`) |
| --- | --- | --- |
| Catálogo de cacao y unidades | Estados de sistema de las fuentes (4) y KG (masa); opciones servidas por la API; sin variedades, calidades, códigos regulatorios ni unidades inventadas | «opciones desde la API…» |
| Códigos por ámbito | Único por organización (mismo código válido en otra); unicidad bajo concurrencia (201 + 409 + 409) | «validaciones…», «consulta y administración…» |
| Unidades explícitas, sin conversión implícita | Respuestas con código, etiqueta, símbolo y dimensión; `conversions: []`; unidad desconocida 422 | «opciones…», «validaciones…» |
| Consulta/administración por rol; entre organizaciones | Recepción consulta, MANAGER no administra, BUYER 403, otra organización 404, suspendida 403 | «consulta y administración…», «organización suspendida…» |
| Edición concurrente e inmutables | `expected_version` (200 + 409); código/estado/unidad → 422 y trigger en BD | «edición concurrente…» |
| Inactivos, historia y referencias protegidas | Desactivar/activar con motivo; inactivo no se edita; sin borrado; historial append-only con instantáneas | «desactivar y activar…» |
| Rollback | Fallo forzado → sin producto, evento ni auditoría | «rollback…» |
| UI-09 | Listado, búsqueda, filtros, alta, edición con conflicto y borrador conservado, confirmación de desactivación, 403 sin enlace, 390 px y teclado | E2E 5/5; revisión por rol |
| **Transformación con evento/rendimiento** | **Pendiente de P0-016/017**: el catálogo impide cambiar estado o unidad por edición; el proceso con evento y rendimiento llega con procesamiento | — |

Corrección de privacidad P0-010 (misma entrega): las evaluaciones ya no devuelven tipo ni cantidad de relaciones fuera del alcance; prueba negativa «privacidad: el técnico no puede inferir…» (vistas indistinguibles con y sin coincidencias ocultas).

### P0-013 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T18-26-11-088Z`): API 183/183, web 4/4, E2E 43/43, OpenAPI 63 rutas. Revisión visual 27 entradas, 0 incidencias.

| Criterio | Resultado | Evidencia (`cte.int-spec.ts`, E2E en `productos.spec.ts`) |
| --- | --- | --- |
| Catálogo versionado de los hitos de las fuentes | 10 hitos de S1 §19 + CLASSIFICATION (docs/08), versión de catálogo 1.0.0, códigos únicos por versión | «catálogo 1.0.0…» |
| Ámbito, consulta y administración | Sistema; consulta con `traceability:read_catalog`; productor 403; no miembro 404; sin rutas de administración (no hay facultad definida) | «permisos y aislamiento…» |
| Referencias estables, vigencia y retirada | `CODE@n` e id; nueva versión retira la anterior sin cambiarla; retirada con motivo; referencias antiguas resolubles | «nueva versión del catálogo…» |
| Auditoría de cambios | Cada publicación queda en `cte_catalog_releases` (inmutable); tablas append-only | «permisos…», «nueva versión…» |
| Rollback | Publicación fallida sin versión, definiciones ni retiradas parciales | «rollback…» |
| Hechos operativos mapeados a eventos existentes | Ningún evento existente es un hito (datos maestros); las 11 operaciones quedan PENDING con evento e historia previstos; el modelo distingue INTEGRATED | «catálogo 1.0.0…», «operación integrada frente a vínculo pendiente…» |
| UI | Consulta de solo lectura con código, descripción, versión, vigencia e integración; sin botones operativos; 390 px y teclado | E2E; revisión por rol |

Justificación de DONE_LOCAL: la aceptación pide el catálogo y el mapeo de los hechos **existentes**; ambos están verificados. La integración de cada operación futura queda como criterio explícito de P0-012/016/017/029 (backlog) y HARVEST/PACKAGING/SALE sin historia se registran en D-33. Mantener P0-013 abierta por operaciones futuras recrearía el ciclo con P0-012, que necesita la capacidad «catálogo de hitos».

GIS: `TL_GIS_TECH 1.0.1` publicada como versión de corrección (el alcance por evaluador cambia el conjunto comparado); registros 1.0.0 inmutables y marcados desactualizados.

### P0-014 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T18-57-26-508Z`): API 195/195, web 4/4, E2E 44/44, OpenAPI 66 rutas. Revisión visual 27 entradas, 0 incidencias.
Fallo intermitente previo (`validation-results/2026-10-10T18-49-29-397Z`): `producers.int-spec.ts` superó 60 s en «búsqueda y paginación…» (la suite tardó 291 s; aislada tarda 12 s). Causa no determinada: sin conexiones pendientes en la base al revisar; hipótesis de contención del equipo durante la corrida. Se conserva la evidencia; no se declara resuelto.

| Criterio | Resultado | Evidencia (`kde-validator.spec.ts` [fixtures], `kde.int-spec.ts`) |
| --- | --- | --- |
| Definición | 62 KDE con código, versión, hito exacto, entidad/campo, tipo, unidad/dimensión, obligatoriedad y condición, regla tipada, responsable, fuente y diferencias | «catálogo 1.0.0…» |
| Validación | Válido, inválido, requerido/opcional ausente, no aplica, condición no evaluable y referencia no verificable; 0/false/""/null distinguidos; sin conversión | unitarias 6/6; «validación con referencias…», «condición entre hitos…» |
| Condición | Verdadera, falsa, desconocida (no equivale a falsa) y no definida en el contrato | unitarias; «condición entre hitos…» |
| Faltantes como faltantes e impedir la transición | `gate.transition_allowed=false` ante bloqueantes; nada se completa | unitarias; «validación…» |
| Versión y responsable | Referencia `CODE@n` a la versión exacta del hito; nueva versión preserva la anterior; hito retirado → 409 para operaciones nuevas | «versionado…» |
| Publicación atómica y esquema cerrado | Publicación fallida sin efectos; reglas fuera del esquema rechazadas | «publicación fallida…»; unitaria de esquema |
| Autorización y privacidad | Productor 403, no miembro 404, referencias fuera de alcance/organización/inexistentes con el mismo código, respuestas sin valores ni datos sensibles | «validación…», «respuestas sin valores…» |
| UI | Consulta por hito (tipo, unidad, obligatoriedad, condición, regla, responsable, fuente, integración) sin formularios; 390 px y teclado | E2E; revisión por rol |
| **Integración en operaciones** | **0 integradas**; cada historia (P0-012, P0-016, P0-017, P0-029) debe demostrar el bloqueo | — |

### P0-015 — criterios (alcance interno)

Validación: `npm run validate` APROBADA a la primera (`validation-results/2026-10-10T19-28-15-559Z`): API 203/203, web 4/4, E2E 45/45, OpenAPI 70 rutas. Revisión visual 28 entradas, 0 incidencias.

| Criterio | Resultado | Evidencia (`event-corrections.int-spec.ts`, `events.int-spec.ts`, E2E) |
| --- | --- | --- |
| Envolvente/versión/tenant/actor/tiempos, append-only | Existentes (TECH-001); actor de la sesión | `events.int-spec.ts` |
| correction_of | Misma organización y agregado, motivo, cadena, sin autorreferencia ni referencias ajenas (también en BD); original inmutable; efecto de dominio real en el productor | «corrección real…», «rechazos…» |
| Idempotencia y concurrencia | Reintento idéntico → réplica (con autorización revalidada); mismo id con otro contenido → 409; 3 correcciones simultáneas → 1; cambio posterior → obsoleta | «idempotencia y concurrencia…» |
| Rollback | Fallo forzado → sin cambio, evento ni auditoría | «rollback…» |
| Historial causal | Por recurso con alcance efectivo, orden y paginación estables, corrección y vínculo al original, campos permitidos, sin identidad ni secretos; tipo desconocido sin campos; reasignación y membresía desactivada retiran acceso | «historial por recurso…» |
| Outbox atómico y consumo idempotente | Fallo de confirmación tras efectos → efectos revertidos; reintento aplica una vez; entrega repetida sin efectos; recibos no se borran | «el consumidor completa sus efectos…» |
| Reproceso DEAD | Autorizado (ORG_ADMIN) con motivo y auditoría; auditor/técnico/otra organización denegados; solicitudes simultáneas → una; historial de intentos y recibos conservados | «DEAD → reproceso…» |
| Fencing de arrendamientos | Un worker con arrendamiento vencido no confirma la entrega reclamada después (LEASE_LOST); efectos una vez | «fencing…» |
| UI | Historial en fichas de productor y parcela; corrección solo con permiso y contrato; original visible y marcado; página de entregas DEAD; 390 px y teclado | E2E; revisión por rol |
| **Concesiones externas y elevación** | **Pendientes en P0-003** | — |

Diagnóstico del timeout de P0-004: `validate` guarda ahora `api-test-timings/` (duración por suite y prueba, fases del arnés —reinicio del esquema, migraciones, arranque, cierre— y consultas ≥ 1 s solo con texto SQL). En esta corrida no reapareció (suite más lenta 11,3 s; 0 consultas lentas). La causa original sigue sin determinar; evidencia en `validation-results/2026-10-10T18-49-29-397Z`. No se aumentó ningún timeout.

### Revisión 2026-10-11 (4) — intento 5 en emulador, vista previa web y prueba negativa

| Punto | Estado | Evidencia |
| --- | --- | --- |
| Recorrido en emulador, intento 5 (APK `184cbfa8`) | Todos los pasos OK salvo almacenamiento lleno | `docs/qa/EVIDENCIA_EMULADOR_INTENTO5_2026-10-11.md` |
| Almacenamiento lleno: error técnico de SQLite al crear borrador | **DEFECTO DE LA APP**, corregido en código; pendiente de APK nuevo | `storageFullMessage` + prueba unitaria |
| APK `184cbfa8` | **NO APTO** (renombrado `NO-APTO-mensaje-almacenamiento-lleno-184cbfa8.apk`) | README móvil |
| Vista previa web móvil (3001) | Funciona; 32/32 pasos en 390 px y escritorio; 3 defectos visuales corregidos | `docs/qa/REVISION_WEB_MOVIL_2026-10-11.md` |
| Prueba negativa sin SQLCipher | OK en emulador: bloqueo antes del login, sin base/token/fotos (etiqueta de variante incorrecta, documentada) | `docs/qa/EVIDENCIA_APK_9996a9b4_Y_NEGATIVA_2026-10-11.md` |
| APK `9996a9b4` (commit `0ba960a`) | **APTO para el ensayo físico**: autoprueba 9/9 y recorrido completo en emulador (intento 6) | idem |
| Teléfono físico | NO EJECUTADO | — |

P0-023 y P0-024 siguen ABIERTAS.

### Revisión 2026-10-11 (3) — recorrido en emulador, prueba negativa y orientación

Móvil (separado de `npm run validate`): `validation-results/2026-10-11T17-08-34-732Z-movil` (typecheck, 25 pruebas de núcleo, recorrido contra la API, bundle Android, expo-doctor). API: solo cambió una prueba (`sync.int-spec.ts` 7/7, lint OK); la última `npm run validate` sigue siendo `validation-results/2026-10-11T07-46-54-839Z`. Evidencia: `docs/qa/EVIDENCIA_EMULADOR_Y_NEGATIVA_2026-10-11.md`.

| Punto | Estado | Evidencia |
| --- | --- | --- |
| Recorrido integrado en emulador | **INTERRUMPIDO** | Login por la interfaz OK; apertura del almacén cifrado falló (defecto real) |
| Defecto SQLCipher + transacción (conexión sin clave) | CORREGIDO EN CÓDIGO, **APK SIN RECOMPILAR** | `apps/mobile/src/adapters/expo.ts`; guardia de disco detuvo Gradle |
| Prueba negativa sin SQLCipher | PREPARADA, **NO COMPILADA** | Variante aislada en `app.config.js`; 2,73 GB libres |
| Sonda de cifrado antes del login | IMPLEMENTADA (sin ejecutar en emulador) | Bloquea sin token/dataset/fotos |
| Orientación visual y aceptación del servidor | DEMOSTRADO | Chromium + `sync.int-spec.ts` |
| APK para el ensayo físico | **NO APTO** (`43f26c95…` contiene el defecto) | Recompilar tras recuperar espacio |
| Teléfono físico | NO EJECUTADO | — |

### Revisión 2026-10-11 (2) — limpieza, build nativo y autoprueba en emulador

Validación web/API: `npm run validate` APROBADA (`validation-results/2026-10-11T07-46-54-839Z`): 290/290 unitarias + integración, 55/55 E2E, OpenAPI 146 rutas. Móvil (separado): `validation-results/2026-10-11T07-58-10-356Z-movil` (typecheck, 24 pruebas de núcleo, recorrido contra la API en contenedor, bundle Android, expo-doctor).

| Punto | Estado | Evidencia |
| --- | --- | --- |
| Limpieza autorizada | HECHA | +5,70 GB en C: (npm); caché Docker 11,25 GB → 0 dentro del disco virtual (sin compactar) |
| Build nativo Android (release, clave de depuración) | GENERADO | APK `e484cf4a…`; SQLCipher en `libexpo-sqlite.so` |
| SQLCipher real | DEMOSTRADO EN EMULADOR | Autoprueba 8/8 (API 30 x86_64) |
| Fallo cerrado sin SQLCipher | PARCIAL | Lógica en el runtime real; sin build nativo sin SQLCipher |
| Copia temporal de subida | DEMOSTRADO EN EMULADOR | Limpieza tras fallo y tras interrupción |
| Salud con escáner caído | DEMOSTRADO | `degraded`, scanner `unavailable` (contenedor e integración) |
| Orientación tras quitar metadatos | DEMOSTRADO (fixtures) | Orientación EXIF conservada; resto eliminado |
| Teléfono físico (captura real, cierre, reinicio, vencimiento, cuentas, almacenamiento, conflictos) | **NO EJECUTADO** | Pasos en `apps/mobile/README.md` § B |

### Revisión 2026-10-11 — escáner, D-41, Expo Go y entorno Android

Validación web/API: `npm run validate` APROBADA (`validation-results/2026-10-11T05-58-21-233Z`): unitarias + integración (API y web) 289/289, E2E 55/55, OpenAPI 146 rutas. Móvil (separado): `validation-results/2026-10-11T05-56-44-934Z-movil (typecheck, 17 pruebas de núcleo, recorrido contra la API en contenedor, bundle Android, expo-doctor)`.

| Punto | Estado | Evidencia |
| --- | --- | --- |
| SCANNER_HOST en docker-compose | CONFIRMADO (commit `761d07f`) | Servicio `api` recreado conservando volúmenes; `printenv SCANNER_HOST` = scanner |
| Foto sintética pendiente → disponible por la API en contenedor | DEMOSTRADO | `docs/qa/evidencia-escaner-contenedor.json` (fase disponible) |
| Escáner inaccesible nunca da limpio | DEMOSTRADO | Fase caído: `FAILED`/`PENDING_SCAN`; fase reintento: `AVAILABLE` tras volver el escáner |
| D-41 adoptada; metadatos sin eludir clasificación | DEMOSTRADO (servidor y Node) | EXIF eliminado en el móvil; `PHOTO_METADATA_PRESENT` en el servidor; título/nombre neutros; eventos y auditoría sin leyenda, nombre ni coordenadas |
| Expo Go solo con fixtures | IMPLEMENTADO (no ejecutado en teléfono) | La app reemplaza cámara y ubicación por fixtures en Expo Go |
| SDK/JDK, build nativo, SQLCipher real, emulador, dispositivo | **NO EJECUTADO** | Bloqueado: 6,3 GB libres en el único disco |

### P0-024 — criterios

Validación web/API: `npm run validate` APROBADA (`validation-results/2026-10-11T05-28-58-923Z`): unitarias + integración (API y web) 289/289, E2E 55/55, OpenAPI 146 rutas; revisión por rol 40 entradas, 0 incidencias (corrida previa FALLIDA por lint en 2026-10-11T05-27-10-806Z, corregida). Móvil (separado): `validation-results/2026-10-11T05-25-49-416Z-movil`. Recorrido cliente-API: foto sincronizada con archivo verificado y escaneado (`AVAILABLE`), conflicto sin efecto, idempotencia y separación de cuentas. **No es validación en dispositivo.**

| Criterio original | Estado | Evidencia |
| --- | --- | --- |
| operation_id estable | DEMOSTRADO | Reintento tras timeout y desde otro dispositivo con el mismo id y hash (`sync.int-spec.ts`, `sync.test.ts`) |
| Dedup por hash | DEMOSTRADO | Mismo id+hash → `DUPLICATE` sin efecto doble; otro hash → `CONFLICT`; hash alterado → `HASH_MISMATCH` |
| Dependencias | DEMOSTRADO | `DEPENDENCY_PENDING` sin bloquear independientes; dependiente de conflicto → `DEPENDENCY_FAILED` |
| Cursor y tombstones | DEMOSTRADO (parcelas) | Cursor de servidor por org/usuario/dispositivo; tombstone al reasignar; cursor ajeno o caducado; bootstrap sin tocar pendientes |
| Conflictos visibles | PARCIAL | Servidor y motor: conflicto con versiones y resolución por nueva operación; **interfaz del dispositivo no ejercitada** |
| Adjuntos | DEMOSTRADO | Registro y archivo separados; integridad SHA-256/tamaño; Documentos (escaneo, permisos); subida incompleta rechazada |
| Revalidación tenant/permisos | DEMOSTRADO | Dispositivo ajeno/otra org/revocado; permisos retirados → `FORBIDDEN` también al reenviar |
| Timeout/retry no duplica inventario | PARCIAL | Demostrado para versiones de geometría (timeout tras commit, concurrencia); **inventario y entregas no tienen operaciones móviles** |
| Recorrido integrado | PARCIAL | Cliente móvil en Node contra la API local; **sin dispositivo** |

Defecto de entorno encontrado: la API en contenedor no tenía `SCANNER_HOST` (documentos quedaban sin analizar). Corregido localmente en `docker-compose.yml`, no confirmado en git (archivo raíz).

### P0-023 — criterios

Validación web/API: `npm run validate` APROBADA (`validation-results/2026-10-11T04-45-29-062Z`): unitarias + integración (API y web) 283/283, E2E 55/55, OpenAPI 141 rutas; revisión por rol 40 entradas, 0 incidencias. **No es validación del móvil.** Móvil: typecheck OK; `npm test` 9/9 (Node + SQLite real); `TL_API_SMOKE=1` 1/1 (cliente en Node contra la API local: tecnico1 recibió 5 parcelas, tecnico2 1, ninguna común); bundle Android exportado; expo-doctor 21/21.

| Criterio original | Estado | Tipo de evidencia |
| --- | --- | --- |
| Entidad/cola en transacción local | DEMOSTRADO EN NODE | Unitaria con SQLite real: todo o nada; operation_id estable; dependencias |
| Borradores/fotos/GPS sobreviven cierre y reboot | PARCIAL | Reapertura simulada en Node (nueva instancia, mismos archivos) y caché borrada; **sin cierre forzado ni reinicio en Android** |
| Dataset limitado y separación por cuenta | DEMOSTRADO EN NODE + API | Base y adjuntos por cuenta+organización; dataset según asignación del servidor; otra cuenta no ve capturas |
| Sesión offline definida | PROPUESTA | D-40 / ADR-0006 sin aprobar; ventana de 72 h; token no se renueva; revocaciones no detectables offline |
| Ensayo Android real (docs/11) | NO EJECUTADO | Este equipo no tiene Android SDK, JDK ni adb; instrucciones en `apps/mobile/README.md` |
| Cifrado local probado en la plataforma | NO EJECUTADO | SQLCipher requiere build de desarrollo; Expo Go queda sin cifrar (lo muestra «Diagnóstico») |

### P0-022 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-11T03-57-59-556Z`): unitarias + integración (API y web) 281/281, E2E 55/55, OpenAPI 140 rutas; revisión por rol 40 entradas, 0 incidencias. Corrida previa FALLIDA conservada (`validation-results/2026-10-11T03-45-52-370Z`): la prueba E2E de P0-022 mostró que, sin evaluación de riesgo, los requisitos de catálogo y conclusión no se listaban; se corrigió el guard (ahora aparecen como pendiente/no evaluable) y se añadió una prueba unitaria. El fallo anterior de arranque E2E (`2026-10-11T02-05-01-152Z`) sigue con **causa no determinada**; no se aumentaron tiempos de espera.

| Criterio original (backlog) | Estado | Evidencia (`dd.int-spec.ts`, `requirements.spec.ts`, E2E, revisión) |
| --- | --- | --- |
| Guards por requisito | DEMOSTRADO | 16 requisitos: MET / PENDING / INVALID / NOT_EVALUABLE; desconocido = no evaluable; porcentaje alto no elimina bloqueos; calidad pendiente, origen incompleto y mitigaciones verificadas no equivalen a aprobación |
| Revisión autorizada | PARCIAL | Iniciar y devolver con motivo, permisos, transiciones inválidas, una aprobación por instantánea (índice único). Aprobar se rechaza con `READINESS_NOT_MET` y la lista de requisitos; la aprobación positiva no puede demostrarse con datos reales |
| Snapshot/manifest | DEMOSTRADO | Captura en REPEATABLE READ; contenido, hash total y por sección, manifest de versiones (lote, entregas, versiones de parcela con hash de geometría, versiones de documento con SHA-256, evidencias, evaluación de riesgo, catálogo, mitigaciones), fecha y autor; append-only |
| Export auditado | PARCIAL | Borrador interno: permiso, auditoría (SUCCESS/DENIED), evento, idempotencia, descarga regenerada desde la instantánea con verificación de hash, redacción de geometrías y documentos PERSONAL_DATA. `DD_PACKAGE`: rechazado sin preparación (probado); éxito solo con fixture sintética en el generador |
| Cambio relevante invalida readiness | DEMOSTRADO | Nueva evaluación de riesgo → instantánea STALE con secciones cambiadas; la instantánea y su paquete no cambian; aprobar/exportar sobre STALE se rechaza |
| Export no marca DDS aceptada | DEMOSTRADO | `submission: NOT_SUBMITTED` en paquete, vista y evento; textos «descargar no es presentar» |

Pendientes reales de P0-022: perfil jurídico (P1-005), D-05, proveedor satelital (P0-028), catálogo de riesgo aprobado, reserva/despacho y embarques (P0-017/P0-029); adjuntos incrustados en el paquete (hoy referencia por versión y SHA-256); política de identidad de productores en el paquete (hoy nunca se copia); un expediente por lote.

### P0-021 — criterios

Validación: `npm run validate` APROBADA en la primera corrida (`validation-results/2026-10-11T02-54-04-972Z`): API 269/269, web 4/4, E2E 54/54, OpenAPI 133 rutas. Revisión por rol: 36 entradas, 0 incidencias. **Fallo anterior de arranque E2E** (`2026-10-11T02-05-01-152Z`: el servidor web de E2E no arrancó en 240 s): **causa no determinada**; puertos libres y sin procesos residuales al revisarlo; no se aumentaron tiempos de espera. No se repitió en las corridas posteriores.

| Criterio original (backlog) | Estado | Evidencia (`mitigations.int-spec.ts`; E2E; revisión) |
| --- | --- | --- |
| Acción ligada a causa | DEMOSTRADO | Evaluación + factor + lote conservados; factores dependientes de D-05/P0-028 rechazados (`CAUSE_NOT_ACTIONABLE`); sin identidad ni coordenadas |
| Assignee / plazo / soporte / criterio | DEMOSTRADO | Responsable activo de la organización con facultad de aportar; plazo; evidencia requerida de la regla; criterio de aceptación documentado por quien crea |
| Aportar soporte | DEMOSTRADO | Versión exacta de documento (disponible, vigente) o evidencia con su versión; adjuntar no verifica; solo el responsable; versión nueva no sustituye ni hereda aprobación (pide revisión) |
| Verificar / rechazar con motivo y permisos | DEMOSTRADO | Ejecutor bloqueado (servicio y trigger de base); rechazo conserva soporte y motivo y abre nueva entrega; decisiones concurrentes: una gana |
| Resolver dispara reevaluación | DEMOSTRADO | Evento `MitigationVerified` → consumidor del outbox → nueva evaluación con disparador; idempotente; un trabajo atrasado no sustituye una evaluación posterior |
| Actualiza pendientes reales | DEMOSTRADO | `MITIGATION_UNVERIFIED` (reglas 0.2.0) bloquea el cierre de la revisión de riesgo; verificar no elimina otros bloqueos (DATA_MISSING_ORIGIN sigue) ni da por resuelta la causa |

### P0-020 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-11T02-28-47-248Z`): API 265/265, web 4/4, E2E 53/53, OpenAPI 127 rutas; revisión por rol 35 entradas, 0 incidencias. Otra corrida fallida conservada: 2026-10-11T02-23-01-580Z (segundo localizador ambiguo en la E2E de riesgo). Corridas previas fallidas conservadas: `2026-10-11T01-58-59-343Z` (localizador ambiguo en la prueba E2E) y `2026-10-11T02-05-01-152Z` (el servidor web de E2E no arrancó en 240 s por lentitud del equipo; puertos libres; sin pruebas ejecutadas).

| Criterio original (backlog) | Estado | Evidencia (`risk.int-spec.ts`; E2E; revisión) |
| --- | --- | --- |
| Categorías / factores / reglas / snapshot | DEMOSTRADO | 10 categorías de docs/13 (las que no tienen reglas: «sin reglas»); 8 reglas versionadas (0.1.0, NO aprobadas) con fuente, límite y evidencia requerida; instantánea con versiones de datos y evidencias y hash SHA-256 |
| Separar severidad / proceso / conclusión | DEMOSTRADO | Hallazgos técnicos · calidad de datos · resultado de riesgo (severidad NOT_ASSESSED, conclusión UNDETERMINED: CHECK en base) · revisión humana (OPEN → UNDER_REVIEW → RESOLVED) sin cambiar el resultado |
| Faltantes no son score cero | DEMOSTRADO | Sin puntuación; no evaluables → INCOMPLETE como máximo, nunca favorable |
| Reevaluación crea versión | DEMOSTRADO | Número de evaluación creciente; la anterior queda STALE sin modificarse (append-only); un trabajo basado en una evaluación vieja se rechaza (`STALE_BASE`) |
| Factor crítico no se diluye | DEMOSTRADO | Resultado por precedencia: un bloqueante da BLOCKED aunque el resto no tenga hallazgos |
| Autorización | DEMOSTRADO | Requiere alcance de organización completo; otra organización 404; roles sin permiso 403; sin referencias de recursos ocultos |
| Límites declarados | — | TL_GIS_TECH = validez técnica, no deforestación; D-05, satélite (P0-028) y mitigaciones (P0-021) no evaluables; no hay perfil jurídico |

### P0-017 — revisión enfocada (2026-10-10)

Brechas corregidas: (1) ajuste positivo en lote de origen declarado ahora rechazado y cantidad añadida identificada sin trazabilidad; (2) conciliación/incorporación con alcance de organización completo; (3) compuerta STOCK_MOVEMENT guardada por línea y bloqueo real probado. Totales y movimientos ya respetaban el alcance (prueba añadida). P0-017 sigue **abierta** por reserva/despacho (P0-029).

### P0-017 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-11T01-20-07-037Z`): API 259/259, web 4/4, E2E 52/52, OpenAPI 122 rutas. Corrida previa fallida conservada: `2026-10-11T01-15-41-630Z` (expectativas de catálogo CTE/KDE/RBAC desactualizadas; código correcto). Revisión por rol: 34 entradas, 0 incidencias. DEMO incorporado al ledger por la migración 0024 (2 entradas por recepción, 2 asignaciones, 2 reservas, 1 cierre) y conciliado sin diferencias.

| Criterio original (backlog) | Estado | Evidencia (`inventory.int-spec.ts`; `lots.int-spec.ts`; E2E; revisión) |
| --- | --- | --- |
| Ledger | DEMOSTRADO | Única fuente de existencia/reserva/disponible para recepciones, asignaciones, procesos y movimientos; append-only; trigger diferido de saldos; referencias exactas, actor y `operation_id` |
| Merma | DEMOSTRADO | Con motivo; nunca sobre lo reservado; pérdida de proceso registrada una sola vez |
| Traslado | DEMOSTRADO | Conserva el total de la organización; centro de otra organización 404; lo reservado no se traslada; asignación de ubicación pendiente |
| Reserva/despacho | Reserva **DEMOSTRADA** (P0-029, 2026-10-12); despacho **NO DEMOSTRADO** | Reservas de proceso y de embarque reducen disponible, no existencia. El despacho está bloqueado por D-34 y por DD READY (P0-029) |
| Ajuste con motivo | DEMOSTRADO | Solo `stock:adjust`; nunca por debajo de lo reservado; no opera sobre recepciones; historia intocable |
| 800 → 750 + 50 válido, exceso rechazado | DEMOSTRADO | Existencia total −50 una sola vez; 3 líneas en el cierre; excesos rechazados (P0-016) |
| Concurrencia: sin doble consumo ni saldo negativo | DEMOSTRADO | Traslados y mermas simultáneos (201/409); reservas y cierres concurrentes; red de seguridad en base |
| Datos existentes | DEMOSTRADO | Incorporación idempotente (repetida no crea nada); conciliación informa diferencias sin ajustes |

### P0-016 — criterios

Validación: `npm run validate` APROBADA (`validation-results/2026-10-11T00-46-10-001Z`): API 254/254, web 4/4, E2E 51/51, OpenAPI 115 rutas. Corridas previas fallidas conservadas: `2026-10-11T00-36-27-453Z` (prueba unitaria usaba «lot» como entidad aún no verificable) y `2026-10-11T00-40-31-876Z` (E2E de hitos esperaba CTE 1.1.0): expectativas desactualizadas, código correcto. Revisión por rol: 33 entradas, 0 incidencias.

| Criterio original (backlog) | Estado | Evidencia (`lots.int-spec.ts`; E2E; revisión) |
| --- | --- | --- |
| Lote con inputs/outputs/run | DEMOSTRADO | Asignaciones parciales con referencias exactas (pesaje vigente, versión de recepción); proceso con reserva, consumo, salidas y pérdida |
| DAG sin ciclos | DEMOSTRADO | Trigger en todo enlace (incluido uno posterior insertado por fuera); lotes de salida cerrados a entradas; aristas append-only |
| Origen conservado en salida | DEMOSTRADO | Upstream hasta entrega, productor y parcela; «Origen incompleto» separado y propagado; sin mezcla (D-39.1) |
| Cierre atómico | DEMOSTRADO | Rollback completo; doble cierre concurrente y reintento → una salida; balance 800 → 750 + 50 y rechazo de 760+50, 750+60, 900+0, 750+49,999999 |
| Consulta upstream/downstream con cantidades y permisos | DEMOSTRADO | Solo nodos legibles; sin `delivery:read` no aparecen recepciones ni productores, sin conteos ni marcadores |
| Sin doble uso | DEMOSTRADO | Asignaciones y reservas concurrentes (201/409); corrección compitiendo con asignación; triggers de red de seguridad |
| Integración FERMENTATION/DRYING (nota del backlog) | FERMENTATION **sí**; DRYING **no** | Secado se inicia; cierre bloqueado (`DECISION_PENDING`) aunque se envíe humedad; DRYING sigue PENDING en el catálogo |

### P0-012 — revisión enfocada por criterio original (2026-10-10)

Criterio de aceptación del backlog: «entrega declarada, peso recibido, recepción parcial/completa, diferencias con causa, vínculos válidos y quality básica; confirmar repetido no crea doble stock». No se eliminó ningún requisito.

| Criterio original | Estado | Evidencia | Pendiente real |
| --- | --- | --- | --- |
| Entrega declarada | DEMOSTRADO | `deliveries.int-spec.ts` «compuertas KDE reales…», «periodo de cosecha…»; E2E P0-012 | — |
| Peso recibido | DEMOSTRADO | «entrega y recepción sin documento…» (pesaje con método, KG, fecha y responsable de la sesión) | — |
| Recepción parcial / completa | DEMOSTRADO (parcial, «recibida por lo declarado», exceso señalado) | «recepciones parciales…», «total recibido… correcciones» | Cierre explícito de la entrega: sin operación (política pendiente); no existe ruta de cierre (404 probado) |
| Diferencias con causa | **NO DEMOSTRADO** | La diferencia se informa como «no evaluada» (KDE 1.1.0 condición no definida) | Requiere política de cierre y tolerancias (D-33, no aprobada) |
| Vínculos válidos | DEMOSTRADO | Ajenos/inexistentes 404; parcela de otro productor; centro de otra organización; documento de otro titular o tipo | — |
| Quality básica | DEMOSTRADO como **decisión humana registrada** | «calidad…»: muestra durante/después, pendiente, liberar/rechazar con responsable | Catálogo publicado de parámetros/límites: no existe; la referencia de límites es **declarada, no verificada** (KDE 1.2.0) |
| Confirmar repetido no crea doble stock | DEMOSTRADO como «no duplica recepción ni cantidad» | «reintentos…», «total recibido…» (correcciones concurrentes 201/409, rollback) | No hay stock ni ledger (P0-017): ninguna cantidad es inventario disponible |

Comprobaciones de esta revisión (pruebas añadidas):
- **Contrato de calidad**: la respuesta expone `limits_reference.status = DECLARED_UNVERIFIED`, `limits_verification = NOT_AVAILABLE` y `downstream_enablement = NOT_EVALUATED`; el evento lleva `limits_reference_status` y `limits_catalog = NOT_AVAILABLE`. Tres estados distintos: recepción física, decisión de calidad, habilitación posterior (no evaluada).
- **Perfiles por transición**: periodo desconocido + sin soporte + calidad pendiente → recepción permitida y pendientes visibles; la completitud enumera exactamente lo que falta (`DELIVERY_PLOTS:REQUIRED_MISSING`, `DELIVERY_PRODUCTION_PERIOD:DECLARED_UNKNOWN`, `DELIVERY_SUPPORT:REQUIRED_MISSING`) y solo es completa con todos los datos de entrega, recepción y pesaje.
- **Cantidades**: total = suma de la cantidad vigente de cada recepción (última corrección o la original); ejemplo probado 100→90/91→95 + 50 = 145, con originales y pesajes conservados; lista y detalle coinciden (defecto corregido: la lista devolvía `145.000000`). Exceso: se registra como «Recibido supera lo declarado», sin tolerancia ni ajuste de la declaración.

Validación de esta revisión: ver sesión `docs/sesiones/2026-10-10-p0-012-revision.md`.

### P0-012 — criterios

Validación: `npm run validate` APROBADA sobre el commit 58ee6fe (`validation-results/2026-10-10T23-29-45-285Z`): API 246/246, web 4/4, E2E 50/50, OpenAPI 104 rutas. Corridas previas fallidas conservadas: `2026-10-10T22-50-19-671Z` (E2E de hitos esperaba el catálogo 1.0.0: expectativa desactualizada; además la pantalla KDE decía «Ninguna operación usa todavía estos datos» para hitos ya integrados → **texto corregido**) y `2026-10-10T22-57-07-369Z` (la sección «Nueva entrega» se nombraba a sí misma con `aria-labelledby` → **defecto de accesibilidad corregido**). Revisión por rol: 32 entradas, 0 incidencias (tras corregir dos supuestos del script: membresías leídas del CSV bloqueado por Excel y conteo de integraciones CTE).

| Criterio (backlog / orden) | Resultado | Evidencia (`deliveries.int-spec.ts`; E2E; revisión) |
| --- | --- | --- |
| Entrega declarada | Borrador → registrada con compuerta DELIVERY_REGISTER (producto, fecha, peso KG bloquean; parcelas, soporte y periodo quedan pendientes); registrada inmutable (trigger) | «compuertas KDE reales…» |
| Periodo de cosecha (D-34) | Día, mes, intervalo de meses y desconocido; precisión conservada, sin días ficticios; derivados marcados; no se deriva de la fecha de entrega | «periodo de cosecha…», E2E |
| Peso recibido / pesaje | Recepción exige pesaje válido (método, valor KG, fecha, responsable = sesión); declarado y recibido separados | «entrega y recepción sin documento…» |
| Recepción parcial/completa | Parciales con historia propia; sin cierre automático ni ajuste de la declaración; exceso señalado | «recepciones parciales…» |
| Diferencias con causa | NO EVALUADO: con parciales la diferencia solo se evalúa al cierre, y el cierre no está definido (D-33); queda visible como «no evaluado» | — (pendiente explícito) |
| Vínculos válidos | Productor, parcela (mismo productor), producto activo, centro, documento: mismo tenant y alcance; ajeno = inexistente (404) | varios casos |
| Soportes (D-35) | Varios por versión exacta; disponibilidad, vigencia y revisión visibles; sin aprobación automática; ausencia no impide la recepción | «varios soportes…» |
| Calidad básica (D-33) | Muestra durante o después del pesaje; «Pendiente de evaluación»; liberar exige versión de límites (declarada); decisión con `quality:decide`; estado separado | «calidad…» |
| Confirmar repetido no crea doble stock | Reintento y doble envío concurrente → una sola recepción y cantidad; operación reutilizada con otro contenido → 409; rollback completo si falla la auditoría. (No hay stock: P0-017) | «reintentos…» |
| Correcciones | DeliveryCorrected / ReceptionCorrected con correction_of; originales y pesajes conservados; fecha posterior a una recepción rechazada; conflicto de versión | «correcciones…» |
| Aislamiento y roles | Otra organización 404; técnico solo asignados; recepción sin identidad ni soportes; calidad/auditor sin recibir | «aislamiento…», revisión |
| UI §14, teclado y 390 px | Registro, revisión previa, recepción, soportes, pendientes, calidad, correcciones, historia | E2E P0-012, revisión `entregas.mjs` |

### P0-025 — criterios (y contenido incrustado del escáner)

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T21-52-03-657Z`): API 237/237 (30 suites), web 4/4, E2E 49/49, OpenAPI 90 rutas. Corridas previas fallidas conservadas: `2026-10-10T21-39-05-402Z` (los filtros se perdían al volver del detalle y la exportación salía sin filtrar → **defecto real**, corregido conservando los filtros en la URL) y `2026-10-10T21-46-27-217Z` (localizador ambiguo en la prueba). Revisión por rol: 31 entradas, 0 incidencias.

Escáner: políglota PDF+ZIP con objeto interno > MaxFileSize respondía `OK` (omitido sin aviso) → **brecha corregida** con rechazo `EMBEDDED_ARCHIVE_NOT_ALLOWED` antes de analizar; PDF con flujo inflado > MaxFileSize ya se detectaba como incompleto (prueba añadida). Detalle en docs/12 y `docs/sesiones/2026-10-10-p0-025-auditoria.md`.

| Criterio | Resultado | Evidencia (`audit.int-spec.ts`; E2E; revisión) |
| --- | --- | --- |
| Alcance de la auditoría | Misma tabla `audit_logs`; cubre alta/edición, corrección, revisiones, descargas, exportaciones (incluida `audit.export`) y permisos; worker en sus tablas propias | sesión §2 |
| Consulta con filtros y paginación estable | Período, tipo, id, operación, actor, resultado, correlación; cursor en SQL sin duplicados ni saltos | «filtros… y paginación estable» |
| Alcance por recurso aun con `audit:read` | Filtro SQL; totales, facetas, detalle y cursor sin fugas; reasignación y revocación inmediatas (técnico con contexto simulado: ningún rol de técnico tiene `audit:read`) | «alcance por recurso…» |
| Redacción | Lista blanca por tipo; sin secretos, enlaces, coordenadas, contenido ni identidad; original intacto y append-only | «redacción de presentación…» |
| Correcciones y versiones | Corrección enlaza evento original y de corrección; historia del registro conserva ambos | «historia inmutable…» |
| Exportación | Mismos filtros/alcance/redacción; metadatos; SHA-256 verificable; límite 5000; auditada; sin enlaces; fórmulas neutralizadas solo en el archivo | «exportación autorizada…», «celdas CSV…», E2E |
| UI §20.1 | Filtros, resultados, detalle, exportación; carga/vacío/error/denegado distintos; teclado y 390 px | E2E P0-025 ×2; revisión |
| Pendiente | Formato definitivo, retención, auditor externo por encargo, auditar consultas (D-38); dominios futuros | — |

### P0-019 — criterios (y comprobación del escáner)

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T21-04-53-544Z`): API 228/228, web 4/4, E2E 47/47, OpenAPI 85 rutas. La 1.ª corrida falló por un localizador ambiguo en la prueba E2E nueva (corregido). Revisión visual 30 entradas, 0 incidencias.

Escáner (brechas corregidas): `AlertExceedsMax` estaba desactivado (análisis incompleto podía responder «limpio») y `MaxScanTime` sin límite; el puerto se publicaba en todas las interfaces; multer aceptaba hasta 64 MiB antes de rechazar. Ahora: configuración versionada, límites alertados como FAILED, puerto en 127.0.0.1, límite de recepción = configuración. Limitación residual documentada en docs/12 (objeto interno > MaxFileSize → OK). Pruebas: `scanner-limits.int-spec.ts` (4) y casos nuevos en `documents.int-spec.ts` (cuota concurrente, análisis incompleto).

| Criterio | Resultado | Evidencia (`evidence.int-spec.ts`; E2E) |
| --- | --- | --- |
| Claim, fuentes/versiones, enlaces tipados | Afirmación sobre entidad existente; soporte = versión exacta con SUPPORTS/CONTRADICTS/BASED_ON; adjuntar no valida | «flujo autorizado…» |
| Revisión/verificación | Envío, verificación (facultad separada), rechazo, revocación y reapertura con motivo y responsable; historia completa | «flujo…», «nueva versión…» |
| Nueva versión no hereda | Enlace a v1 conservado; «requiere revisión»; reverificación tras vincular v2 y retirar v1 | «nueva versión del documento…» |
| Expiración y estados de soporte | Vencido, rechazado y no disponible bloquean la verificación con motivos distintos | «soportes vencidos…» |
| Contradicción | Preservada; verificar exige reconocimiento expreso; no se sobrescribe (append-only) | «contradicción preservada…» |
| Autorización y privacidad del grafo | Entidad/documento fuera de asignación o de otra organización → 404; soportes no visibles omitidos (sin conteos ni tipos), también en consulta inversa; auditor ve metadatos, no contenido personal | «autorización…», «privacidad del grafo…» |
| Revocación de acceso | Reasignar el productor retira el acceso a sus afirmaciones | «acceso revocado…» |
| Reintentos, concurrencia, rollback | `operation_id` en alta y vínculo; verificar/rechazar simultáneos → una decisión; fallo forzado sin efectos | «reintentos…» |

### P0-018 — criterios

Dependencias: P0-003 aporta la autorización dentro del tenant (verificada); de P0-025 se usa el registro de auditoría existente (`audit_logs`, verificado desde P0-002). La lectura/exportación de auditoría por alcance y la redacción (P0-025) no son necesarias para P0-018 y siguen pendientes. Concesiones externas y elevación: P0-003.

Validación: `npm run validate` APROBADA (`validation-results/2026-10-10T20-08-20-583Z`): API 215/215, web 4/4, E2E 46/46, OpenAPI 78 rutas. Revisión visual 29 entradas, 0 incidencias.

| Criterio | Resultado | Evidencia (`documents.int-spec.ts` con ClamAV/S3/PostgreSQL reales; E2E) |
| --- | --- | --- |
| Carga y descarga autorizadas, privadas | Objeto privado, SHA-256 del servidor, bytes idénticos, descarga con permiso, alcance del titular y hash verificado; auditada | «carga autorizada…» |
| Cuotas, tamaño, formato, MIME engañoso | Límite por archivo y cuota por organización serializada; tipo real por firma; declarado distinto → rechazo | «formatos…», «cuota…» |
| Cuarentena y escaneo | EICAR rechazada por el escáner real sin almacenar; escáner caído → pendiente, sin descarga, revisión ni compuerta; reintento real → disponible; reintento con malware → rechazada | «muestra EICAR…», «escáner indisponible…» |
| Vigencia y nueva versión | Versión vencida visible como «vencida» (no inaccesible); nueva versión conserva la anterior y no hereda revisión; conflicto de versión | «versiones y revisiones…» |
| Acceso y referencias | Otra organización, titular ajeno o inexistente, técnico sin asignación → 404; datos personales sin `producer:read_identity` → metadatos sí, contenido no; entregas → 422 | «clasificación y alcance…», «referencias ajenas…» |
| Idempotencia, almacenamiento y rollback | Reintento idéntico → réplica; mismo id con otro archivo → 409; S3 caído → nada; fallo de BD → objeto compensado; bytes alterados → no se entregan | «reintento…», «fallos de almacenamiento…» |
| Revocación | Membresía desactivada durante la carga → rechazo y compensación; reasignación → sin acceso residual | «revocación…» |
| Sin filtraciones | Errores y eventos sin contenido, nombres de archivo ni identidad | «sin filtraciones…» |

### Preparación de P0-012 Entregas (revisión, sin implementar)

| Aspecto | Situación |
| --- | --- |
| Productos | Capacidad disponible (catálogo por organización, KG) |
| CTE/KDE que usará | DELIVERY@1 (7 KDE), RECEPTION@1 (6), WEIGHING@1 (5), CLASSIFICATION@1 (5) |
| Condiciones indefinidas (D-34) | `DELIVERY_PRODUCTION_PERIOD` → CONDITION_NOT_EVALUABLE en **toda** entrega: la compuerta bloquearía cualquier registro |
| Referencias sin entidad | `DELIVERY_SUPPORT`: **verificable desde P0-018** (referencia y disponibilidad técnica); falta decidir cuándo se exige (D-35); `RECEPTION_LOCATION` (centros: docs/06 `locations`), `WEIGHING_SUBJECT` (modelo de pesaje), `CLASSIFICATION_SAMPLE` (muestras) deben modelarse en P0-012 |
| Diferencias de modelo | `deliveries` sin parcela en docs/06 (arreglo tipado en docs/09); proveedor no productor sin entidad; sin entidad de pesaje |
| Eventos y correcciones | DeliveryRegistered, ReceptionConfirmed, WeightRecorded, QualityDecisionRecorded; `ReceptionCorrected` definido en docs/08 (referencia al original, motivo, ajuste; bloquear si hay descendientes) — usar el mecanismo `correction_of` de P0-015 |
| Decisiones que **bloquean** | **D-34** (condición de production_period), **D-35** (exigencia del soporte documental o P0-018), **D-33** en lo que afecta a P0-012 (si pesaje y clasificación son obligatorios antes de confirmar la recepción) |
| Decisiones que no bloquean | D-32 (KG es suficiente), D-31 (catálogo provisional ya usable), proveedor no productor (P0 puede limitarse a productores si se registra la limitación) |

No se convierte ninguna condición desconocida en opcional para desbloquear Entregas.

## Interfaz según docs/UX_UI.md (2026-10-10)

Aplicado a las pantallas existentes y conectadas a operaciones reales: tokens M1/UX-V1 únicos en `apps/web/app/globals.css`; shell adaptable (organización activa con selector, usuario y rol efectivo, navegación por permisos, migas, «Saltar al contenido», menú móvil); login (UI-01) con mostrar/ocultar y mensajes distintos para 401/429/503/red; organizaciones (UI-02); miembros, invitaciones y roles (UI-03) en página propia; auditoría (UI-18) en página propia; productores y revisión de duplicados (UI-05) con tabla, filtros y estados diferenciados (carga, vacío, filtro sin resultados, error, 403, 404, conflicto 409 con recarga). Sin menús de módulos futuros; las capacidades pendientes por rol aparecen rotuladas en una tarjeta aparte. Revisión por rol: `docs/qa/REVISION_VISUAL_POR_ROL.md` (0 incidencias abiertas; 4 corregidas).

## Brechas reales

- P0-003: grants y elevación (decisiones/contratos ausentes).
- Custodia de claves PII fuera del equipo y procedimiento de rotación con re-cifrado.
- Invitaciones: entrega por canal verificado y verificación de correo (D-19) antes de operación real.
- Fallo intermitente E2E del 2026-10-10 (reload sin respuesta): causa no determinada, evidencia perdida; `validate` conserva trazas desde ahora.
- Android/offline, integraciones, despliegue: no iniciados.
- Logotipo oficial y verificación de licencia de Inter (UX-D01/UX-D02). Evaluación de accesibilidad completa (lector de pantalla, zoom 200 %) no realizada: solo foco por teclado y móvil comprobados.

## Próxima acción: decisiones D-33/D-34/D-35 para P0-012 (propuesta en `docs/decisiones/D-33-34-35-PROPUESTA-ENTREGAS.md`); trabajo independiente: P0-020 Risk engine (revisar dependencias)

## Anterior: P0-006 Parcela

Dependencias: P0-004 (DONE_LOCAL). Leer docs/10 (GIS), 05/06 (`plots`, `plot_versions`, `gps_samples`) y 18 §P0-006–P0-010. Alcance de P0-006: parcela vinculada a un productor de la misma organización, con código único por tenant, versión geométrica (PostGIS, SRID 4326), permisos `plot:*` y eventos. La validación GIS y el umbral de 4 ha son P0-010 y dependen de D-05.
