# Estado compartido de desarrollo

Última actualización: 2026-10-10. Repositorio `cyberlandec-oss/TERRA-LINK-2025`, rama de trabajo `feat/tech-001-ci-p0-002` (PR #1 abierto como respaldo y revisión; `main` en `03bb2f6`).

> Resultados ajenos a este proyecto: la auditoría inicial del repo `cacao` no aplica a Terra Link 2025.

## Criterio vigente: validación local

GitHub Actions no es requisito en esta etapa (workflow inactivo en `infra/ci/github-actions-ci.yml`). La facturación de GitHub **no es un bloqueo**. **DONE_LOCAL** = criterios de la historia cumplidos con evidencia local (`npm run validate` aprobado + suites de la historia). DONE_LOCAL no acredita producción, Android real ni conformidad EUDR.

Última validación: `npm run validate` **APROBADA**, 7 pasos (servicios, typecheck, lint, build, OpenAPI validado, API 90/90 + web 3/3, E2E 14/14). Registro en `validation-results/` (no versionado); commit y resultado en el registro de sesión.

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
| P0-011 Productos | **ABIERTA**: catálogo, unidades, permisos, historia y UI-09 verificados localmente; queda 1 criterio que depende de P0-016/017 («transformación cambia estado con evento/rendimiento») | Ver criterios abajo |
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

## Interfaz según docs/UX_UI.md (2026-10-10)

Aplicado a las pantallas existentes y conectadas a operaciones reales: tokens M1/UX-V1 únicos en `apps/web/app/globals.css`; shell adaptable (organización activa con selector, usuario y rol efectivo, navegación por permisos, migas, «Saltar al contenido», menú móvil); login (UI-01) con mostrar/ocultar y mensajes distintos para 401/429/503/red; organizaciones (UI-02); miembros, invitaciones y roles (UI-03) en página propia; auditoría (UI-18) en página propia; productores y revisión de duplicados (UI-05) con tabla, filtros y estados diferenciados (carga, vacío, filtro sin resultados, error, 403, 404, conflicto 409 con recarga). Sin menús de módulos futuros; las capacidades pendientes por rol aparecen rotuladas en una tarjeta aparte. Revisión por rol: `docs/qa/REVISION_VISUAL_POR_ROL.md` (0 incidencias abiertas; 4 corregidas).

## Brechas reales

- P0-003: grants y elevación (decisiones/contratos ausentes).
- Custodia de claves PII fuera del equipo y procedimiento de rotación con re-cifrado.
- Invitaciones: entrega por canal verificado y verificación de correo (D-19) antes de operación real.
- Fallo intermitente E2E del 2026-10-10 (reload sin respuesta): causa no determinada, evidencia perdida; `validate` conserva trazas desde ahora.
- Android/offline, integraciones, despliegue: no iniciados.
- Logotipo oficial y verificación de licencia de Inter (UX-D01/UX-D02). Evaluación de accesibilidad completa (lector de pantalla, zoom 200 %) no realizada: solo foco por teclado y móvil comprobados.

## Próxima acción: P0-013 CTE (depende solo de TECH-001; análisis en `sesiones/2026-10-10-p0-011-productos.md`)

## Anterior: P0-006 Parcela

Dependencias: P0-004 (DONE_LOCAL). Leer docs/10 (GIS), 05/06 (`plots`, `plot_versions`, `gps_samples`) y 18 §P0-006–P0-010. Alcance de P0-006: parcela vinculada a un productor de la misma organización, con código único por tenant, versión geométrica (PostGIS, SRID 4326), permisos `plot:*` y eventos. La validación GIS y el umbral de 4 ha son P0-010 y dependen de D-05.
