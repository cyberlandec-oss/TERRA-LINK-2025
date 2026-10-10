---
paths:
  - "**/gis/**/*"
  - "**/plots/**/*"
  - "**/*geometry*"
  - "**/*polygon*"
  - "**/*satellite*"
---
# GIS

Consulta docs/10_GIS_Y_GEOLOCALIZACION.md.
GeoJSON usa lon/lat; validar CRS/tipo/geometría y conservar original/versiones.
Punto no produce área de perímetro; área declarada y calculada son distintas.
Null de precisión GPS no es cero; mostrar cobertura de muestras y peor conocida etiquetada.
Umbrales/tolerancias/tipos destino vienen de perfil versionado aprobado, con prueba del borde.
Solapamiento y alerta ambiental requieren revisión; no conclusión legal automática.
Resultado satelital apunta a geometría/dataset/método/cobertura exactos.
