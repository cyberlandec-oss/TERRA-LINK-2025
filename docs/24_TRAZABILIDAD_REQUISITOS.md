# Matriz fuente → requisito → historia → prueba

Referencias S1–S4 y secciones corresponden a los originales conservados en `sources/`. La matriz justifica alcance, no acredita implementación.

| Fuente | Requisitos | Historias | Especificación | Verificación |
| --- | --- | --- | --- | --- |
| S1 §§8–12, 71; S4 §§2–4 | RF-01–05, RNF-01 | P0-001–005 | 05/06/07 | QA-01/02/03 |
| S1 §§13–16, 72, 82–84; S3 §40 | RF-06–10 | P0-006–010 | 05/06/10 | QA-04 |
| S1 §§17–23; S4 §§7–8 | RF-11–15 | P0-011–015 | 05/06/08/09 | QA-05 |
| S1 §§24–29, 73–74; S4 §§9–11 | RF-16–17, RNF-02 | P0-016–017 | 05/06/08 | QA-06/07 |
| S1 §§30–32, 55; S4 §§12–13 | RF-18–19 | P0-018–019 | 06/12 | QA-09/10 |
| S1 §§33–42, 82–85; S3 §§20–21, 35–39 | RF-20–21, RF-36 | P0-020–021; P1-005 | 06/13 | QA-10/11 |
| S1 §§43–44; S4 §15 | RF-22 | P0-022 | 09/13 | QA-12 |
| S1 §§45–48; S3 §18; S4 §§5–6 | RF-23–24, RNF-04 | P0-023–024 | 11/14 | QA-08/02 |
| S1 §§56–59; S4 §18 | RF-25, RNF-03/07 | P0-025 | 07/08/12 | QA-13 |
| S1 §§61–63; S3 §§15–16 | RF-26 | P0-026 | 06/09/14 | QA-03 · `test/imports.int-spec.ts` (11), `imports-products` (11), `imports-plots` (13), `imports-deliveries` (14), `imports-lots` (10), `imports-authz-fixtures` (3), `src/imports/xlsx.spec.ts` (7), `e2e/review/importaciones*.mjs`; DONE_LOCAL |
| S1 §§64–69; S4 §§1–24 | RF-27, RNF-09 | P0-027; P1-003 | 14 | QA-14 · `test/my-work.int-spec.ts` (6), `e2e/review/web-por-rol.mjs` (22 combinaciones), `e2e/review/estados-web.mjs`; P0-027 DONE_LOCAL |
| S1 §§39–41, 54, 95; S2 §§4–9 | RF-28 | P0-028 | 10/13/15 | QA-15 |
| S1 §§27–29, 44; S4 §16 | RF-29 | P0-029 | 05/06/13/14 | QA-06/12 · `test/shipments.int-spec.ts` (6), `e2e/review/embarques-web.mjs`; P0-029 ABIERTA (despacho bloqueado por D-34) |
| S1 §§60, 97 | RF-30 | P0-030 | 09/17 | QA-13/14 · `test/reports.int-spec.ts` (8), `e2e/tests/productos.spec.ts` (P0-030 ×2); DONE_LOCAL para §60, §97 (reportes por entidad y GeoJSON) fuera de alcance declarado |
| S1 §§75–81, 98–99 | RF-31, RNF-05/06/10/12 | P0-031; TECH-001 | 16/17/19/20 | QA-16/17 |
| S2 §§18–20, 24; S3 §§22, 38; S4 §17 | RF-32–33 | P1-001–002 | 07/14/15 | QA-02/14 |
| S3 §§16, 18, 28; S4 §3 | RF-35 | P1-004 | 02/14 | Wizard/madurez con evidencia |
| S2 §29; S3 §§14, 19, 27 | RF-37 | P1-006 | 15 | Intercambio autorizado/conciliación |
| S1 §44, S3 §18; consulta oficial EU-IS | RF-38 | P1-007 | 13/15 | Receipt ACCEPTANCE/UNKNOWN, no producción implícita |
| S2 §§6–8; S3 §§5, 17 | RF-39 | P1-008 | 09/15 | Contratos/webhook/idempotencia |
| S3 §§33, 37, 40–41 | RF-40–42/45 | P1-009–011/014 | 02/10/13/15 | Snapshot/coste/métrica documentados |
| S2 §§7, 19, 26; S3 §§32, 39 | RF-43–46 | P1-012–015 | 02/12/15 | Revisión/moneda/alcance/ADR |

Propuestas adicionales rastreables: outbox y ledger (ADR-0003), membresías/grants (ADR-0002), separación paquete/submission (ADR-0004), audit-first y conservación del stack (ADR-0001). Ninguna debe convertirse en hecho del repo sin evidencia.
