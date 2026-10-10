# GIS y geolocalización

FUENTE: S1 §§13–16, 39–41, 72, 82–84; S3 histórico de parcelas y evidencia. PROPUESTA: validación separada y cobertura de precisión.

## Representaciones

PostGIS para geometría consultable e índice GiST. GeoJSON RFC 7946 con coordenadas `[longitud, latitud]` en WGS84; no guardar solo texto para consultas. Puntos y polígonos no son equivalentes. Un punto no permite calcular área del perímetro: área calculada null, área declarada separada.

Para superficie usar geodesia (`geography`) o proyección adecuada validada, expresada en hectáreas. No calcular ha directamente en grados. Precisión decimal de coordenadas no demuestra precisión del GPS. Evitar redondear muestras originales para producir un supuesto de mejor medición.

## Pipeline

1. Comprobar tipo y límites del payload, CRS de entrada y coordenadas válidas.
2. Normalizar explícitamente formato/CRS autorizado, preservando original y método; rechazar CRS desconocido.
3. Validar anillos cerrados, mínimo de vértices, intersecciones propias, vacíos y geometría válida.
4. Calcular área solo si posible; comparar declarada/capturada con tolerancia configurada.
5. Revisar ubicación, solapamiento y duplicados con capas/versiones registradas. Un solapamiento genera revisión, no prueba automática de fraude.
6. Aplicar regla de tipo requerido según área, producto y perfil jurídico aprobado.
7. Guardar resultado `VALID/WARNING/INVALID/REVIEW_REQUIRED`, motivos y rule_set_version.

Corrección automática de una geometría puede cambiar la parcela. Si se propone reparación, mostrar antes/después y obtener confirmación de quien tiene permiso; conservar versiones.

## Umbral pendiente

La fuente técnica escribe `<4 ha` y `>4 ha`, dejando indefinido `=4`. El paquete no convierte esa omisión en norma. Modelar `threshold_ha`, operador de comparación, producto, jurisdicción, vigencia y fuente legal en el perfil. Antes de activarlo, validar texto consolidado y especificación GeoJSON del destino con responsable regulatorio. Probar casos por debajo, igual y por encima; sin perfil aprobado la preparación regulatoria queda pendiente.

La precisión mínima de exportación, tipos admitidos (Polygon/MultiPolygon), holes y límites de tamaño requieren verificación específica del destino. Validez interna no garantiza aceptación en EUDR-IS.

## GPS de campo

Conservar latitud, longitud, hora de captura, precisión horizontal si el dispositivo informa, método y muestras por vértice. Si algunas precisiones faltan, no declarar «peor precisión del polígono: 3 m» basándose solo en las conocidas.

Mostrar número de muestras con precisión, número desconocido y peor precisión conocida con esa etiqueta. El indicador global es incompleto hasta disponer de cobertura suficiente según política. Un null no se sustituye por cero ni por el promedio. Advertir medición débil sin impedir guardar borrador.

## Versionado e impacto

Una evaluación satelital o de riesgo utiliza `plot_version_id` y hash de geometría, no «la parcela actual» mutable. Cambio geométrico crea versión, invalida readiness que dependía del snapshot anterior y genera reevaluación. No reescribir paquetes ya exportados; preparar una nueva revisión.

## Pruebas

Punto válido; polígono válido; self-intersection; CRS distinto/conversión explícita; coordenadas invertidas plausibles; fuera de país con capa conocida; área nula; punto con área declarada; duplicado; borde exacto de umbral; MultiPolygon/hole según perfil; mezcla de GPS conocido/desconocido; modificación con análisis previo; GeoJSON grande/tenant ajeno.

Las capas satelitales deben incluir proveedor, dataset, versión, fecha, resolución, método, cobertura, límites y confianza si el proveedor la define. «Sin alertas» no equivale a «sin deforestación» cuando no existe cobertura suficiente.
