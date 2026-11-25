# Archivos para importar parcelas manualmente

24 archivos de prueba: **tres por extensión** (`.geojson`, `.json`, `.gpkg`, `.zip`, `.kml`, `.kmz`, `.csv`, `.xlsx`). En cada subcarpeta se llaman `lote 1`, `lote 2` y `lote 3`, con su extensión correspondiente.

**Todos son datos sintéticos.** Las coordenadas se inventaron en una zona de Ecuador para facilitar la revisión del mapa: no proceden de productores ni identifican fincas o titularidades reales. Usar una organización/productor de demostración; no mezclarlos con una operación real ni solicitar análisis satelitales reales. En Terra Link estos archivos crean **parcelas de origen**, no lotes comerciales de inventario.

## Dónde están y qué muestran

| Carpeta | Archivos | Código de parcela |
| --- | --- | --- |
| GeoJSON | lote 1.geojson, lote 2.geojson, lote 3.geojson | TLTEST-GEOJSON-01 a 03 |
| JSON | lote 1.json, lote 2.json, lote 3.json | TLTEST-JSON-01 a 03 |
| GeoPackage | lote 1.gpkg, lote 2.gpkg, lote 3.gpkg | TLTEST-GPKG-01 a 03 |
| Shapefile-ZIP | lote 1.zip, lote 2.zip, lote 3.zip | TLTEST-ZIP-01 a 03 |
| KML | lote 1.kml, lote 2.kml, lote 3.kml | TLTEST-KML-01 a 03 |
| KMZ | lote 1.kmz, lote 2.kmz, lote 3.kmz | TLTEST-KMZ-01 a 03 |
| CSV | lote 1.csv, lote 2.csv, lote 3.csv | TLTEST-CSV-01 a 03 |
| XLSX | lote 1.xlsx, lote 2.xlsx, lote 3.xlsx | TLTEST-XLSX-01 a 03 |

En todos los formatos:

- **lote 1:** un perímetro rectangular simple.
- **lote 2:** una parcela con dos perímetros separados (MultiPolygon), no dos parcelas distintas.
- **lote 3:** un perímetro con hueco interior, que debe conservarse excluido.

Cada archivo tiene un código distinto y una ubicación diferente: cargar los 24 por primera vez puede crear **24 parcelas**, si no existen ya esos códigos en la organización. Reimportar el mismo archivo no debe crear duplicados. Todos tienen perímetro; no hay ejemplos de puntos con perímetro pendiente en este paquete.

## Paso a paso en Terra Link

1. Abre http://localhost:3000/ e inicia sesión en tu organización de demostración.
2. Verifica que haya un productor **activo** registrado. Con cuenta `PRODUCER`, la cuenta debe estar vinculada a su ficha propia; con administrador/técnico, usa un productor al que tengas permiso de asociar parcelas.
3. Ve a **Origen → Importar parcelas**. Selecciona un solo archivo y pulsa **Identificar archivo**. No descomprimas ZIP/KMZ ni cambies su extensión.
4. Revisa capa/pestaña, CRS y asociación de columnas con la tabla siguiente. Si aparece un selector de capas, usa la capa del inventario: GeoPackage/Excel `parcelas`; el lector puede identificar Shapefile como `parcelas` y KML/KMZ como `Layer #0`.
5. Para administrador/técnico, escribe en **Código de productor** el código real de tu productor de demostración. Los archivos no fijan un productor para permitir reutilizarlos entre organizaciones. Con `PRODUCER`, la plataforma elige su ficha; no hay campo de productor.
6. Usa **Cacao** como cultivo común (obligatorio en KML/KMZ; los demás también traen `crop`). Pulsa **Convertir y revisar**. Comprueba que se muestra el perímetro en el mapa y **Se creará**, sin filas por corregir.
7. Escribe un motivo, por ejemplo: `Prueba manual sintética de importación GIS`. Pulsa **Confirmar importación**. La vista previa sola **no guarda**.
8. En **Importación guardada**, abre el enlace de la parcela. Comprueba código, productor, perímetro en mapa, superficie calculada e historial geométrico. Recarga la ficha y comprueba que permanece guardada. Busca también el código en **Parcelas**.
9. Repite con los otros archivos. Para comprobar idempotencia, vuelve a cargar uno: no debe aparecer otra parcela con el mismo código. Si ya existía o fue editada, revisa la propuesta de actualización; no confirmes cambios sobre una parcela real.

## Ajustes de lectura

| Archivo | Modalidad / CRS | Columnas |
| --- | --- | --- |
| GeoJSON / JSON | Geometría, WGS84 `EPSG:4326` | Código → `plot_code`; cultivo → `crop`. No elegir columna de geometría: es nativa del archivo. |
| GeoPackage lote 1 y 3 | Geometría; CRS detectado `EPSG:4326` | `plot_code`, `crop`; geometría nativa. |
| GeoPackage lote 2 | Geometría; CRS detectado **`EPSG:32717`** (UTM 17 sur) | `plot_code`, `crop`; geometría nativa. **No cambiar el origen a 4326**: el lector reproyecta a WGS84. |
| Shapefile ZIP | Geometría; `.prj` incluido, `EPSG:4326` | `plot_code`, `crop`; geometría nativa. ZIP incluye `.shp`, `.shx`, `.dbf`, `.prj` y `.cpg`. |
| KML / KMZ | Geometría, `EPSG:4326` | Código de parcela → **`Name`**; cultivo común → **Cacao**. Dejar el resto sin asociar. La advertencia de altitud omitida es esperada: perímetro 2D. |
| CSV / XLSX lote 1 y 3 | Geometría WKT o GeoJSON; confirmar **`EPSG:4326`** | Código → `plot_code`; cultivo → `crop`; geometría → `geometry`. |
| CSV / XLSX lote 2 | **Vértices ordenados**; confirmar **`EPSG:4326`** | Código → `plot_code`; cultivo → `crop`; X → `x`; Y → `y`; orden → `order`; parte → `part`; anillo → `ring`. |

CSV en UTF-8, separador **punto y coma** (`;`), punto decimal. Excel contiene valores, no fórmulas. Coordenadas geográficas en orden X/longitud, Y/latitud. Los campos suelen asociarse automáticamente, excepto `Name` en KML/KMZ: compruébalos siempre.

Si el mapa no tiene fondo cartográfico, distingue la disponibilidad del mapa base de la geometría: el lector no descarga mapas ni certifica parcelas. Si hay error de productor, corrige su código/vínculo o permisos; el archivo no crea productores ni evita los controles de acceso.

## Validación realizada y límites

- Generados localmente con GDAL de `terra-link-plot-reader:local`, con red deshabilitada.
- **24/24 aprobados** con el lector real `/app/reader.py`: una geometría válida por archivo, código conservado, sin errores, superficie geométrica equivalente tras lectura/reproyección; multipolígonos y huecos conservados.
- Detalle reproducible de opciones y capas en [inventario.json](./inventario.json). El programa [generar.py](./generar.py) permite volver a verificar los archivos existentes sin sobrescribirlos.
- **No se realizó la importación ni confirmación de estos 24 archivos en la base del despliegue.** Ese es el recorrido manual que se va a comprobar. La validación del lector no sustituye comprobar autorización, persistencia y mapa en la aplicación.
- La aplicación no cambia ni requiere redespliegue por estos ejemplos. No se ejecutó una nueva validación integral del producto para esta entrega de datos.
