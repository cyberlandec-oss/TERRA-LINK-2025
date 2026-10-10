# Requisitos verificables

Estado inicial de todos: especificados, pendientes de contrastar con repositorio. RF son capacidades; RNF son condiciones transversales. Las restricciones legales del documento 13 requieren fuentes primarias y aprobación de su perfil.

## Requisitos P0

| ID | Capacidad y resultado obligatorio | Historia | Validación |
| --- | --- | --- | --- |
| RF-01 | Crear/suspender organización y seleccionar solo una membresía autorizada | P0-001 | QA-01 |
| RF-02 | Alta, baja e invitación de usuarios sin pérdida de historial | P0-002 | QA-01 |
| RF-03 | Permisos por recurso/acción y controles por tenant en API, jobs, descargas y relaciones | P0-003 | QA-01, QA-02 |
| RF-04 | Registrar, buscar y actualizar productores con trazabilidad de cambios | P0-004 | QA-03 |
| RF-05 | Código de productor único por organización con deduplicación asistida | P0-005 | QA-03 |
| RF-06 | Parcela vinculada a productor y geometría versionada | P0-006 | QA-04 |
| RF-07 | Capturar punto y precisión GPS conocida o desconocida explícita | P0-007 | QA-04, QA-08 |
| RF-08 | Capturar/importar polígono y conservar muestras/calidad | P0-008 | QA-04, QA-08 |
| RF-09 | Importar/exportar GeoJSON autorizado y compatible con perfil de destino | P0-009 | QA-04, QA-02 |
| RF-10 | Validar coordenadas, CRS, geometría, superficie, duplicados y necesidad de revisión | P0-010 | QA-04 |
| RF-11 | Catálogo de productos y estados del cacao con unidad | P0-011 | QA-05 |
| RF-12 | Entrega con origen/cantidad y recepción con peso real sin doble stock | P0-012 | QA-05, QA-06 |
| RF-13 | Catálogo CTE y registro de hitos físicos de la cadena | P0-013 | QA-05 |
| RF-14 | KDE por hito, validación y responsable, sin inventar datos | P0-014 | QA-05 |
| RF-15 | Eventos persistentes e inmutables, correcciones enlazadas y causalidad | P0-015 | QA-05, QA-07 |
| RF-16 | Lotes con entradas, salidas y grafo completo sin ciclos | P0-016 | QA-07 |
| RF-17 | Inventario, pérdidas, reservas y balance conservativo con protección concurrente | P0-017 | QA-06 |
| RF-18 | Subir/versionar documentos privados, escanear y gestionar vigencia | P0-018 | QA-09 |
| RF-19 | Vincular evidencia con afirmación, fuente y versión; revisión separada | P0-019 | QA-09, QA-10 |
| RF-20 | Evaluación de riesgo explicable, versionada y reproducible | P0-020 | QA-10 |
| RF-21 | Acción de mitigación con responsable, plazo, soporte y verificación/rechazo | P0-021 | QA-11 |
| RF-22 | Expediente y paquete de diligencia con bloqueos/readiness y snapshot | P0-022 | QA-12 |
| RF-23 | Capturar productores, parcelas, entregas y evidencias offline persistentes | P0-023 | QA-08 |
| RF-24 | Sync idempotente, dependencias y conflictos visibles con revalidación | P0-024 | QA-08, QA-02 |
| RF-25 | Auditar cambios, aprobaciones, descargas, exports y permisos | P0-025 | QA-13 |
| RF-26 | Excel con mapeo, preview, errores y commit sin duplicación | P0-026 | QA-03 |
| RF-27 | Web con navegación por permisos, Lot Hub y rutas de recuperación | P0-027 | QA-14 |
| RF-28 | Proveedor satelital sustituible con procedencia y fallo explícito | P0-028 | QA-15 |
| RF-29 | Movimientos y embarques con asignaciones y preflight de despacho | P0-029 | QA-06, QA-12 |
| RF-30 | Reportes/KPI calculados con denominadores y permisos reales | P0-030 | QA-13, QA-14 |
| RF-31 | Piloto completo y restauración demostrada | P0-031 | QA-16, QA-17 |

P0-027–031 son historias añadidas para cubrir capacidades ya mencionadas en las fuentes pero sin ID en su lista P0 original. No presentan nuevas pruebas como ejecutadas.

## Requisitos de evolución

| ID | Capacidad | Historia | Restricción |
| --- | --- | --- | --- |
| RF-32 | Buyer Portal con lote/embarque, evidencia y descarga autorizada | P1-001 | Grant, expiración y revocación |
| RF-33 | QR/pasaporte digital por audiencia | P1-002 | No exponer PII ni prometer DDS |
| RF-34 | My Work con tareas reales de dominios operativos | P1-003 | Cerrar por acción real, respetar assignee/permisos |
| RF-35 | Wizard de onboarding y diagnóstico de madurez 0–6 | P1-004 | Madurez ≠ conformidad legal |
| RF-36 | Perfil de legalidad Ecuador y documentos requeridos | P1-005 | Fuente, versión, vigencia y revisor |
| RF-37 | Intercambio con GUIA/Agrocalidad | P1-006 | Solo canal/acuerdo comprobados |
| RF-38 | Integración oficial EUDR-IS | P1-007 | Acceptance antes de producción; permiso de presentar |
| RF-39 | ERP/API/webhooks con asociación de referencias | P1-008 | Idempotencia y tenant |
| RF-40 | Simulación de preparación de lote | P1-009 | Solo lectura, inputs/fecha visibles |
| RF-41 | Medir costes de preparación por productor/tonelada | P1-010 | Costes medidos y asignación explicada |
| RF-42 | Historial temporal de parcela y alertas avanzadas | P1-011 | Versiones comparables; datos no disponibles explícitos |
| RF-43 | Registro de precio, prima y pagos informados | P1-012 | No ejecutar transferencias; moneda y privacidad |
| RF-44 | Extracción asistida de documentos | P1-013 | Revisión humana y evidencia de extracción |
| RF-45 | Analytics/supplier score comercial | P1-014 | Métrica independiente de riesgo legal |
| RF-46 | Extensión multilenguaje/SSO/consumo | P1-015 | Español primero y decisiones de coste |

## Requisitos no funcionales

| ID | Condición | Verificación y objetivo |
| --- | --- | --- |
| RNF-01 | Aislamiento y mínimo privilegio | Cero accesos cruzados en matriz QA-02, incluidos objetos y relaciones |
| RNF-02 | Integridad transaccional | Confirmación/despacho/cierre repetidos y concurrentes no duplican efecto |
| RNF-03 | Auditabilidad | Cada transición crítica reconstruible con actor, tiempo, regla y evidencia |
| RNF-04 | Offline | Ensayo de 7 días simulados y de interrupción/cierre real; duración objetivo final por ADR |
| RNF-05 | Rendimiento | Medir dataset del piloto y carga; budgets p95/SLO acordados en TECH-001, sin promesa inventada |
| RNF-06 | Recuperación | Restaurar DB y objetos coherentes; RPO/RTO medidos antes de producción |
| RNF-07 | Privacidad | Clasificación de campos y redacción en UI, API, logs, reportes y portal |
| RNF-08 | Interoperabilidad | OpenAPI validada y fixtures de GeoJSON/importación/exportación |
| RNF-09 | Accesibilidad | Controles con teclado, etiquetas, estados no dependientes solo de color |
| RNF-10 | Observabilidad | Request/job IDs, health/readiness y alertas verificadas sin secretos |
| RNF-11 | Mantenibilidad | Módulos y límites conservados; linters/formatters del repo, ADR de cambios estructurales |
| RNF-12 | Operación segura | Entornos separados, secretos fuera de git, rollback/migración revisados |

## Condiciones de cierre

Una historia incluye permisos, validación, persistencia, API, auditoría, errores y prueba del resultado. UI/móvil/offline aplican según alcance. Si falta prueba de dispositivo, regulatoria o integración externa, se registra como gate pendiente; no se declara producto listo por porcentajes de avance.
