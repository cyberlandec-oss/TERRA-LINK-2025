# Cierre reproducible de importación multiformato

## Candidato aislado

Solicitud del propietario de 2026-11-24: conservar su carpeta actual y separar la importación en un worktree. Base `0b968c9`; rama `feat/importacion-done-local`; ubicación `C:/Users/mario/AppData/Local/Temp/vscode-agent-codex-sandbox-bIHGJ5/tl-importacion-cierre`.

Incluye lectores GeoJSON/GPKG/Shapefile ZIP/KML-KMZ/CSV-XLSX, migración 0080, API/persistencia/autorización/auditoría, UI de importación y mapa, enlace y traducción propios, plantillas y pruebas. Incluye el rechazo explícito de código de productor ajeno, la evolución Point → Polygon en el mismo registro y la corrección del selector exacto de menú en QA. Next 16.4.6 es un prerrequisito mínimo de compilación ya comprobado; del lockfile solo se trasladan Next y @next.

Excluye los cambios locales previos de estilos, iconos, menú plegable y sus traducciones. La carpeta original no se modifica, ni se cambia su rama o índice. Se registraron huellas de sus archivos modificados/no rastreados para comprobar conservación al terminar. No se hace merge, despliegue nuevo ni push desde este cierre: el despliegue local existente sigue siendo una referencia distinta al candidato aislado.

## Gate

Estado inicial: **PENDIENTE DE VALIDACIÓN INTEGRAL SOBRE COMMIT**. Orden: commit de código → `npm.cmd run validate` completo desde este worktree → documentación de resultados en commit posterior. Los informes copiados de la carpeta original son históricos, no acreditan este candidato. El resultado, SHA probado, árbol limpio, omisiones, lectores y nuevas capturas PRODUCER se registrarán aquí cuando existan.

No acredita producción, Android real, precisión de levantamiento, titularidad ni conformidad EUDR. GPX/CAD siguen fuera de esta entrega. No se envían geometrías a proveedores externos durante las conversiones ni las pruebas.
