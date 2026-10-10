# Estado compartido de desarrollo

Última actualización: 2026-10-10. Repositorio `cyberlandec-oss/TERRA-LINK-2025`. `main` en `03bb2f6`; el trabajo está en la rama `feat/tech-001-ci-p0-002` ([PR #1](https://github.com/cyberlandec-oss/TERRA-LINK-2025/pull/1), **sin fusionar**: falta CI).

> **Resultados ajenos a este proyecto (no usar):** la primera auditoría del 2026-10-09 inspeccionó por error `cyberlandec-oss/cacao`. Nada de aquel repositorio pertenece a Terra Link 2025.

## Estados usados

**Implementado** · **Verificado local** (comando en docs/20) · **Pendiente de CI** (sin veredicto de GitHub Actions sobre el SHA exacto) · **Pendiente de decisión** · **DONE** (todo lo anterior + CI verde). Hoy **ninguna historia está DONE**.

## Línea base

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| Stack | Adoptado para desarrollo (ADR-0001); ratificación pendiente | Manifiestos y lockfile |
| Migraciones | `0001`–`0005_producers` | `apps/api/src/db/migrations` |
| Pruebas locales | API 75/75 (64 integración real), web 3/3, E2E 13/13 | docs/20 |
| Contenedores | API, web, migración y 2 workers verificados local | docs/20 |
| CI | Pendiente: GitHub no inicia jobs por facturación | docs/20 |
| Android/offline, integraciones, satélite | No iniciado | — |
| Conformidad EUDR / preparación productiva | No acreditadas | — |

## Historias

| ID | Implementado | Verificado local | Pendiente de CI | Pendiente de decisión | DONE |
| --- | :-: | :-: | :-: | --- | :-: |
| TECH-001 | Parcial | Parcial | Sí | ADR-0001 | No |
| P0-001 Organización | Sí | Sí | Sí | D-18 | No |
| P0-002 Usuarios | Sí | Sí | Sí | D-19 | No |
| P0-003 RBAC y aislamiento | Sí (sin D-04) | Sí | Sí | D-04 | No |
| P0-004 Productor | Sí | Sí (integración + E2E) | Sí | Matriz `producer:*` provisional; cifrado de identidad en reposo | No |

### Corrección: login con Redis caído

Antes respondía 500. Ahora responde 503 `LOGIN_TEMPORARILY_UNAVAILABLE` con `Retry-After`, sin sesión ni detalles internos. Readiness muestra `checks.redis = unavailable` y la misma instancia se recupera sola. Prueba: `redis-outage.int-spec.ts` (3 casos, proxy TCP).

### TECH-001 — elementos

| Elemento | Estado |
| --- | --- |
| Stack, skeleton, compose, migraciones, comandos, rules | Hecho / verificado local |
| OpenAPI generado (30 rutas) | Verificado local; sin validación de contrato automatizada |
| CI | Implementado; pendiente de CI |
| E2E navegador | Verificado local (13/13) |
| Dockerfiles API/web + worker | Verificado local |
| **Eventos de dominio + outbox** | **Verificado local**: envolvente, inmutabilidad, atomicidad, reintentos/DEAD, reentrega idempotente, 3 workers concurrentes, arrendamiento vencido, recorrido real con contenedores (doc 08 «Implementación vigente») |
| Catálogos CTE/KDE | Pendiente |
| Ledger de inventario (ADR-0003) | Pendiente (P0-016/017) |
| Framework de reglas versionadas | Pendiente (doc 13) |
| ERD y diccionario contrastados | Pendiente por historia (identidad, organización y productor reflejados en migraciones) |
| Herramienta de reproceso de DEAD | Pendiente |

### P0-004 — criterios

| Criterio | Resultado | Evidencia (`producers.int-spec.ts` salvo indicación) |
| --- | --- | --- |
| Modelo con organización obligatoria; código único por tenant | OK; mismo código en otra org permitido | «alta con validación…» |
| Validación de campos de la fuente | Nombre+apellido o razón social; documento en par; formato de código y teléfono; campos extra → 400 | ídem |
| Alta, búsqueda, listado paginado, consulta, edición | OK; cursor estable por código; búsqueda por código, nombre o comunidad | «búsqueda y paginación…»; E2E |
| Historial de cambios | `producer_versions` append-only con instantánea por versión; identidad redactada sin permiso | «baja lógica…» |
| Edición concurrente | Dos ediciones sobre la misma versión → 200 + 409 | «edición con control…»; E2E dos pestañas |
| Asignación de responsable | `producer:assign`; membresía activa de la misma org con acceso a productores; FK compuesta | «referencias por tenant…», «asignación…» |
| Alcance del técnico | Solo asignados; lo que registra queda asignado a él | «el técnico solo ve…» |
| Identidad protegida | Sin `read_identity` no se devuelve ni se busca por documento; ausente de eventos y auditoría | «identidad protegida…», «registro atómico…» |
| Baja lógica que preserva historia | INACTIVE con motivo; sale del listado por defecto; edición bloqueada; reactivable | «baja lógica…»; E2E |
| Acceso cruzado y listados | 404 entre organizaciones; listados sin filas ajenas | «búsqueda…», mutante del filtro de tenant detectado |
| Registro atómico cambio + evento + auditoría | Error de unicidad no deja evento ni versión | «registro atómico…» |
| Eventos consumidos | Proyección por estado correcta e idempotente ante reentrega | «eventos del productor…»; contenedores |
| Recorrido en navegador | alta → búsqueda → detalle → edición (conflicto) → baja | `e2e/tests/productores.spec.ts` |
| Pendiente | Cifrado en reposo de la identidad («identidad cifrada/restringida», doc 06: hoy solo restringida); deduplicación y corrección de código (P0-005) | — |

## Próxima acción

1. Cuando GitHub permita ejecutar: CI sobre el último SHA del PR #1; registrar enlace, SHA y resultado.
2. **Siguiente historia: P0-005 Código y deduplicación** (depende de P0-004, verificada en local): unicidad bajo concurrencia y revisión asistida de coincidencias sin fusión silenciosa. Alternativa: P0-006 Parcela (depende de P0-004) si se prioriza el recorrido de campo.
