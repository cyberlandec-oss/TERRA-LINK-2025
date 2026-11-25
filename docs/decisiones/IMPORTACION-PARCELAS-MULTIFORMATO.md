# Importar parcelas desde distintas fuentes

Solicitud del propietario: 2026-11-24. Ampliación de P0-026/P0-009; no migración de stack. Estado vigente (2026-11-25): **DONE_LOCAL, INTEGRADO Y DESPLEGADO LOCALMENTE sobre `00c1c1b84e3f626fdd20a877802b4e6acdfdfe69`**, conservando los cambios visuales del propietario y con validación integral limpia. [Evidencia vigente de integración, TLS y despliegue](../qa/INTEGRACION_IMPORTACION_2026-11-25.md). Históricos: [cierre aislado e4c3a93](../qa/CIERRE_IMPORTACION_WORKTREE_2026-11-24.md) y [corridas previas](../qa/EVIDENCIA_IMPORTAR_PARCELAS_2026-11-24.md).

## Alcance acordado

Integración (2026-11-25): **`00c1c1b` validado íntegramente y desplegado localmente**, incorporando `a56f020` y preservando menú/estilos/idioma. TLS 55/55 ejecutadas y aprobadas, 0 omitidas. [Resultado combinado y comprobaciones de despliegue](../qa/INTEGRACION_IMPORTACION_2026-11-25.md).

Primera entrega: GeoJSON, GeoPackage, Shapefile ZIP, KML/KMZ y CSV/XLSX desde «Importar parcelas». GPX, GML, FileGDB, MapInfo y DXF no pertenecen a esta primera entrega. Los proyectos QGIS `.qgs`/`.qgz` no sustituyen las capas exportadas. GeoPackage es preferido para entrega desde QGIS; GeoJSON RFC 7946 para intercambiar una capa en WGS84.

El repositorio vigente ya persiste parcelas con P0-026 (Excel sin geometría). La afirmación del antecedente `cacao` sobre confirmaciones que no guardan parcelas no es un defecto demostrado de Terra Link.

## Contrato funcional

1. Cargar el original, identificar formato y ofrecer capas o pestañas. No seleccionar silenciosamente una de varias. Preservar original y SHA-256 con acceso privado.
2. Mapear códigos exactos de productor y parcela, cultivo y atributos, según permisos. Nunca asignar productor por nombre o similitud. El productor con acceso propio no puede elegir otra ficha: el servidor resuelve su vínculo vigente.
3. Resolver CRS de origen antes de confirmar: usar la referencia del archivo si es válida; exigir entrada explícita cuando falta. No suponer UTM, zona ni hemisferio. Normalizar WGS84, ejes longitud/latitud. No hacer reparaciones topológicas silenciosas.
4. CSV/XLSX: punto X/Y; geometría WKT o GeoJSON por fila; o vértices agrupados por código de parcela con orden explícito. Partes/anillos explícitos para multipolígonos y huecos. Admitir delimitador configurable y coma decimal no ambigua. Las fórmulas no se ejecutan.
5. Previsualizar geometría normalizada, superficie calculada geodésica para perímetros, errores y advertencias. Diferenciar CREATE/UPDATE/UNCHANGED/ERROR, punto de referencia y perímetro pendiente. Las líneas no se convierten en linderos automáticamente.
6. Confirmar con revalidación de permisos, alcance tenant, referencias y versiones. Cambiar una geometría existente exige revisión y motivo; crea versión nueva y conserva la anterior. Repetir un archivo/operación no duplica las parcelas.
7. Conservar quién confirmó, origen (capa/hoja/filas), CRS y conversión aplicada. La vista previa no crea productores, parcelas ni versiones operativas; solo el registro de carga/preparación.

## Seguridad y límites

Lectores extensibles y acotados: tamaño y número de objetos, tiempo/memoria de conversión, ZIP con límites de expansión y rutas seguras, XML sin entidades externas, formatos/drivers permitidos y sin acceso de los archivos a red o ficheros del servidor. Nunca registrar coordenadas, secretos ni datos personales en mensajes de error del conversor. No enviar geometrías a proveedores externos para convertirlas.

El permiso general de importación no amplía el alcance sobre parcelas/productores. Las descargas originales y vistas de geometría requieren autorización actual. Rechazar identificadores de otro tenant sin revelar si existen.

## Evidencia requerida

- Lectores reales por formato, capas/hojas, puntos/polígonos/multipolígonos y atributos.
- Reproyección conocida, CRS ausente/incorrecto, ejes, UTM y coma decimal.
- Tres modalidades tabulares; orden ausente/duplicado y anillos/partes.
- Confirmación crea parcelas y versiones consultables en PostGIS; reimportación sin duplicados; corrección conserva historial.
- Preview sin efectos operativos; concurrencia y rollback; aislamiento y productor propio.
- ZIP/XML maliciosos y límites; original privado y huella.
- Recorrido UI de revisión/errores/confirmación y responsive.
- `npm run validate` y pruebas específicas con resultados reales antes de DONE_LOCAL.

## Fuentes técnicas

- [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946.html).
- [GDAL: conversión y reproyección](https://gdal.org/en/stable/programs/ogr2ogr.html).
- [GDAL: GeoPackage](https://gdal.org/en/stable/drivers/vector/gpkg.html).
- [GDAL: CSV](https://gdal.org/en/stable/drivers/vector/csv.html).

La admisión técnica no certifica origen, titularidad, precisión de medición ni conformidad EUDR.
