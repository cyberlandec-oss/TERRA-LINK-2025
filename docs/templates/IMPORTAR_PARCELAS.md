# Ejemplos sintéticos para importar parcelas

Estos archivos contienen coordenadas artificiales de demostración, no levantamientos ni evidencia de una finca real. Sustituir los códigos por los de la organización autorizada antes de preparar una carga real. No crear productores por parecido de nombre.

- [Punto por fila](parcelas-puntos.csv): delimitador punto y coma; coma decimal; X = longitud, Y = latitud; CRS EPSG:4326. Un punto es una referencia: el perímetro queda pendiente y no hay superficie calculada.
- [Geometría WKT por fila](parcelas-geometrias.csv): delimitador punto y coma; CRS EPSG:4326; columna `geometria`. WKT usa X Y, es decir longitud latitud.
- [Vértices por parcela](parcelas-vertices.csv): delimitador punto y coma; CRS EPSG:4326; orden explícito; parte y anillo. El último vértice repite el primero para cerrar el lindero.

En la vista previa comprobar el mapeo de código de productor/parcela y cultivo, la modalidad, el CRS y los ejes. Un archivo UTM necesita su zona, hemisferio y datum correctos: no usar EPSG:4326 para coordenadas en metros.

Para QGIS, exportar la capa a GeoPackage conservando su CRS. El proyecto `.qgs` o `.qgz` no reemplaza la capa. La compatibilidad y el estado de validación de esta entrega se registran en [la decisión de importación](../decisiones/IMPORTACION-PARCELAS-MULTIFORMATO.md).
