# ADR-0002 — Tenancy y compartición

Estado: PROPUESTO · fecha 2026-10-09.

## Contexto

S1 exige multi-organización desde inicio; S2/S3 proponen red de datos conservando control de cada organización. Usuarios/actores de cadena no son todos tenants independientes.

## Decisión propuesta

Base compartida con organization_id obligatorio en entidades operativas, autorización de aplicación por acción/recurso, integridad relacional por tenant y membresías explícitas. Incorporar RLS como defensa adicional si el runtime/pool/worker permiten contexto seguro probado; no asumir que existe. Compartición mediante grants tipados, campos/vigencia/revocación y no joins implícitos por identidad.

## Alternativas y consecuencias

Base por tenant ofrece aislamiento fuerte pero mayor coste operacional; filtros solo de UI son insuficientes. Filtros de aplicación sin FK/defensa de DB admiten vínculos cruzados si un caso de uso falla. RLS necesita fijar/relimpiar contexto de conexión y no confiar en superusuarios que la evaden. La elección final debe documentar controles reales y pruebas.

## Validación

QA-02 en consultas/listas/links/jobs/exports/objetos y payloads; incluye sesión/worker/cache, memberships/grants y administrador. No aceptar hasta identificar esquema real y estrategia de integridad aplicada.
