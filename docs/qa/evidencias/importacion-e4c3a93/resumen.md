# Validación local APROBADA

Fecha: 2026-11-25T01:56:29.922Z · commit `e4c3a93` · archivos con cambios sin commit: 0

| Paso | Comando | Código | s |
| --- | --- | --- | --- |
| servicios | `docker compose up -d --build --wait postgres redis object-storage scanner plot-import-reader plot-import-gateway` | 0 | 24.9 |
| typecheck | `npm run typecheck` | 0 | 28.7 |
| lint | `npm run lint` | 0 | 17.2 |
| build | `npm run build` | 0 | 40.2 |
| openapi-validado | `npm run openapi -w apps/api` | 0 | 19.9 |
| pruebas-unitarias-integracion | `npm test` | 0 | 1168.8 |
| e2e-navegador | `npm run test:e2e` | 0 | 301.7 |

La aceptación local no acredita producción ni conformidad EUDR.
