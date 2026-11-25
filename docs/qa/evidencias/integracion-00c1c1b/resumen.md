# Validación local APROBADA

Fecha: 2026-11-25T05:45:45.336Z · commit `00c1c1b` · archivos con cambios sin commit: 0

| Paso | Comando | Código | s |
| --- | --- | --- | --- |
| servicios | `docker compose up -d --build --wait postgres redis object-storage scanner plot-import-reader plot-import-gateway` | 0 | 25.2 |
| typecheck | `npm run typecheck` | 0 | 20.7 |
| lint | `npm run lint` | 0 | 14.2 |
| build | `npm run build` | 0 | 24.8 |
| openapi-validado | `npm run openapi -w apps/api` | 0 | 22.1 |
| pruebas-unitarias-integracion | `npm test` | 0 | 1063.6 |
| e2e-navegador | `npm run test:e2e` | 0 | 304.2 |

La aceptación local no acredita producción ni conformidad EUDR.
