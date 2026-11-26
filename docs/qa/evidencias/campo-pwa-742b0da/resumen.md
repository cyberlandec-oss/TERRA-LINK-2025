# Validación local APROBADA

Fecha: 2026-11-26T03:36:53.891Z · commit `742b0da` · archivos con cambios sin commit: 0

| Paso | Comando | Código | s |
| --- | --- | --- | --- |
| servicios | `docker compose up -d --build --wait postgres redis object-storage scanner plot-import-reader plot-import-gateway` | 0 | 3.4 |
| typecheck | `npm run typecheck` | 0 | 24.6 |
| lint | `npm run lint` | 0 | 15.8 |
| build | `npm run build` | 0 | 24.9 |
| openapi-validado | `npm run openapi -w apps/api` | 0 | 22.7 |
| campo-shell-offline | `node --test scripts/field-shell.test.mjs` | 0 | 0.3 |
| pruebas-unitarias-integracion | `npm test` | 0 | 1090.5 |
| e2e-navegador | `npm run test:e2e` | 0 | 312.7 |

La aceptación local no acredita producción ni conformidad EUDR.
