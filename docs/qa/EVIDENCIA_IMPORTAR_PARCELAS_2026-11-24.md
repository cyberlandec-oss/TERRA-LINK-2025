# Importación multiformato de parcelas — evidencia local

**Corte histórico del árbol original.** El cierre posterior sobre un commit separado está en [DONE_LOCAL de `e4c3a93`](CIERRE_IMPORTACION_WORKTREE_2026-11-24.md); no reemplaza ni reetiqueta las corridas fallidas registradas aquí.

Ampliación de verificación por cuenta: [recorrido específico PRODUCER, punto → perímetro y rechazo explícito ajeno](EVIDENCIA_IMPORTAR_PARCELAS_PRODUCER_2026-11-24.md). Incluye ajuste posterior de autorización y distingue sus pruebas de las corridas históricas de este informe.

Fecha: 2026-11-24. Rama: `feat/importar-parcelas-multiformato`, base `0b968c9`, árbol con cambios previos conservados. No se declara DONE_LOCAL sobre un commit.

## Entrega

Nuevo recorrido «Origen → Importar parcelas»: cargar original, elegir capa/hoja, asociar códigos y columnas, confirmar CRS/ejes, convertir, revisar y guardar. Admite GeoJSON, GeoPackage, Shapefile ZIP, KML/KMZ y CSV/XLSX. CSV/XLSX: puntos, WKT/GeoJSON o vértices ordenados con partes/anillos explícitos. GPX y los otros formatos avanzados quedan fuera de esta primera entrega.

La confirmación crea parcelas reales y geometrías PostGIS WGS84; los puntos quedan como referencias con perímetro pendiente. Los perímetros tienen superficie geodésica calculada. Las correcciones conservan versiones anteriores; los mismos códigos y geometrías no crean duplicados. Original, metadatos y plan se conservan cifrados en PostgreSQL, con SHA-256 y origen por capa/filas. No se trasladan a S3 en esta entrega.

El conversor GDAL usa contenedor sin salida externa, usuario no privilegiado, sistema de archivos de solo lectura y límites de recursos/tiempo/tamaño. El gateway de pruebas publica exclusivamente `127.0.0.1:8091`. No se enviaron geometrías a proveedores satelitales.

## Verificaciones ejecutadas

- Lector real: 11/11 pruebas aprobadas en imagen `terra-link-plot-reader:local`, sin red. Incluyen los formatos admitidos, capas GPKG, XLSX, reproyección UTM conocida, coma decimal, WKT, vértices y rechazo de ZIP/XML peligrosos.
- Integración específica: 8/8 aprobadas dentro de la batería general, con PostGIS y lector real. Incluye persistencia, original privado, autorización propia y entre tenants, historial, concurrencia, idempotencia y geometría única sin atributos con códigos explícitos. Antes de añadir el octavo caso, la ejecución enfocada había aprobado 7/7.
- Navegador: el caso nuevo aprobó enfocado y en las dos baterías completas; carga CSV, revisión, confirmación y navegación a parcela persistida a 390 px. Se espera al mapa dinámico. Captura sintética: [vista previa](capturas/importacion/importar-parcelas-multiformato-390.png).
- Despliegue `node scripts/desplegar.mjs`: aprobado; API/web/worker y dependencias saludables. `/version` declara `0b968c9+sucio`, esquema `0080_plot_file_imports`; `/health/ready` confirma base, esquema, Redis y escáner. No acredita producción.
- Validación completa `validation-results/2026-11-24T20-05-34-467Z/`: servicios, typecheck, lint, build y OpenAPI aprobados; API **115 suites/1.212 pruebas aprobadas**, 2 suites/55 pruebas omitidas; web **6 archivos/27 pruebas aprobadas**. Navegador **178/179**: único fallo en el selector ambiguo de una prueba existente, `getByRole('button', { name: 'Menú' })`, que coincidía también con Cerrar menú y Plegar menú. Corrida integral registrada como FALLIDA, sin alterar sus resultados.
- Corrección de prueba: nombre exacto en `e2e/tests/idiomas-coste-acceso.spec.ts`; no cambia la aplicación ni elimina comprobaciones. Repetición **completa** `npm.cmd run test:e2e`: **179/179 aprobadas**, salida 0, 9,3 minutos. La validación integral no se repitió después de esa corrección exclusivamente de selector. No se declara una corrida integral aprobada ni DONE_LOCAL sobre commit.
- El worker local del mapa quedó incluido en la segunda reconstrucción/despliegue, y volvió a aprobar typecheck y lint web. La batería E2E reconstruyó la web con ese ajuste. `git diff --check`: aprobado.

Fallos previos conservados: primera validación detenida por `SecurityFatalError` de Next.js 16.4.2; resuelta con parche 16.4.6. Segunda validación alcanzó 114 suites aprobadas y 2 omitidas, pero falló nuestra suite por conectividad desde Windows al lector aislado. Se incorporó gateway localhost; después la integración enfocada aprobó. También se instaló Chromium requerido por el proyecto. No se ocultaron estos fallos ni se desactivaron pruebas.

## Respaldo y límites

Antes de aplicar 0080 se obtuvo un `pg_dump -Fc` de la base local, guardado en `C:/Users/mario/AppData/Local/Temp/vscode-agent-codex-sandbox-bIHGJ5/terra-link-before-0080/terra_link.dump`. SHA-256: `C9FE1BC8903EB45C3894DCD04724EE7D618E5C8931A36A4BFCA74ECF2FF32241`. Se leyó su índice; no se ensayó restauración en esta sesión. No se borraron volúmenes ni datos existentes.

Límites: 20 MB, 5.000 filas por capa, 100.000 posiciones; CSV UTF-8. Se necesitan productores existentes y códigos exactos; no hay vinculación por nombres. Se mapean códigos y cultivo; los demás atributos permanecen en el original. No se reparan automáticamente anillos ni se convierten líneas a linderos. No hay una pantalla de historial para retomar cargas tras recargar el navegador. La importación no acredita titularidad, precisión de levantamiento ni conformidad EUDR.

Guía y ejemplos: [plantillas](../templates/IMPORTAR_PARCELAS.md). Contrato y alcance: [decisión](../decisiones/IMPORTACION-PARCELAS-MULTIFORMATO.md).
