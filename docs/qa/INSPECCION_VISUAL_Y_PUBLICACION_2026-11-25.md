# Inspección visual y publicación del repositorio — 2026-11-25

## Entorno para inspección

Se encontraron los servicios Docker detenidos salvo el worker. Se ejecutó `node scripts/desplegar.mjs` desde el árbol limpio en `5260d82`, con salida 0; se reutilizaron imágenes, servicios y volúmenes sin borrar datos. `/version` declara **`5260d82`**, origen `BUILD_ARG`, sin `+sucio`; esquema conocido/aplicado `0080_plot_file_imports`. `/health/ready` devuelve `ok` con database/schema/redis/scanner en `ok`; web raíz **HTTP 200**. Se abrió `http://localhost:3000/` en el navegador integrado y se comprobó el formulario «Iniciar sesión».

El código de aplicación, infraestructura y pruebas de `5260d82` es idéntico al validado en `00c1c1b` (`git diff --exit-code 00c1c1b -- apps infra scripts e2e docker-compose.yml package-lock.json`, sin diferencias). El cambio posterior era documental. No se presenta este arranque como otra ejecución integral: se conserva la validación acreditada de 1.269 pruebas API (incluidas 55 TLS), 27 web, 180 navegador y 11 del lector, sin omisiones. Véase [evidencia integrada](INTEGRACION_IMPORTACION_2026-11-25.md).

Para revisar: iniciar sesión con la cuenta local habitual, seleccionar la organización y abrir **Origen → Importar parcelas**. No se restablecieron contraseñas, ejecutaron seeds ni crearon parcelas de prueba en el despliegue. Las pruebas del productor con datos sintéticos y las capturas a 390 px están en el informe integrado.

## Publicado en GitHub

Remoto principal `origin`: `https://github.com/cyberlandec-oss/TERRA-LINK-2025.git`. Se ejecutaron `git fetch origin` y `git ls-remote` antes de publicar; la rama de integración no existía en el remoto. Había **85 commits del historial actual no alcanzables desde ninguna referencia de origin**, incluidos trabajos anteriores al importador.

`git push -u origin feat/integracion-importacion-local` terminó aprobado y creó la rama remota en **`5260d82469f30acf1c24649d542174790a728b7a`**, verificada mediante `git ls-remote`. Los commits `e4c3a93`, `a56f020`, `e82411f`, `00c1c1b` y `5260d82` quedaron publicados como parte de ese historial. Este informe y su registro operativo se agregan después en un commit documental, que también se publica en la misma rama.

Lo publicado incluye:

- Importación GeoJSON, GeoPackage, Shapefile ZIP, KML/KMZ y CSV/XLSX; selección de capas/columnas, tres modalidades tabulares, CRS y normalización WGS84.
- Persistencia PostGIS, original cifrado, procedencia, historial, confirmación explícita e idempotencia; ajuste de alcance PRODUCER y recorrido punto → perímetro sobre la misma parcela, con rechazo ajeno.
- Menú, estilos e idioma locales preservados y versionados; parche Next 16.4.6, lector local aislado e infraestructura de desarrollo.
- Pruebas, plantillas, evidencias, capturas y el historial previo de desarrollo que seguía sin publicar. No equivale a nueva aceptación de todas las historias de ese historial.

No se publican `.env`, credenciales locales, `node_modules`, compilados ni volúmenes/bases de datos. Se comprobó que los archivos privados de credenciales no estaban rastreados; entre las rutas nuevas de configuración privada solo aparece `.env.example`. Un sondeo de patrones de claves privadas/tokens conocidos en HEAD no encontró coincidencias; esto no se declara una auditoría exhaustiva de secretos.

## Qué sigue pendiente

- **Rama de entrega:** tras publicar el commit documental de este informe, no deben quedar cambios ni commits por subir en `feat/integracion-importacion-local`; comprobar de nuevo sincronización local/remota al cerrar.
- **`main`:** sigue en `4d9464e`; la actualización está en la rama de trabajo, no fusionada en main. No se creó un PR ni se cambió la rama predeterminada sin solicitud.
- **Otras ramas experimentales locales:** cinco commits exclusivos (`93ecc44`, `f95cadd`, `ce353fc`, `9aa099e`, `aeb6436`), de pilotos visuales y alternativas Next 16.4.5. No se publicaron como parte de esta entrega ni sustituyen el código integrado con Next 16.4.6. Se conservan sus worktrees y ramas.
- El remoto adicional `eudr` no se modificó. GPX/CAD, producción, Android real e integración oficial no se acreditan por esta publicación.

## Política operativa solicitada

Al cerrar trabajo autorizado: conservar cambios ajenos, commit del alcance, validación pertinente y push normal de la rama de trabajo a origin; verificar SHA remoto y estado limpio. No usar force-push, fusionar main, publicar secretos o activar despliegues externos automáticamente. Si hay divergencias o permisos faltantes, informar el bloqueo y no declarar el repositorio actualizado.
