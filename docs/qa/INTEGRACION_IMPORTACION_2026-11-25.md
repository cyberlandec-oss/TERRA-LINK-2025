# Integración de importación multiformato con la versión visual local

Solicitud: integrar `feat/importacion-done-local` hasta `a56f020`, conservar menú/estilos/idioma, validar un SHA combinado y desplegarlo únicamente si aprueba. Estado final: **INTEGRADO, DONE_LOCAL Y DESPLEGADO LOCALMENTE** sobre **`00c1c1b84e3f626fdd20a877802b4e6acdfdfe69`**. No acredita producción ni conformidad EUDR.

## Preservación y fusión

- Base de la carpeta actual: `0b968c9`, con cambios locales de importación y visuales. Se preservó todo el árbol en el commit snapshot `e82411f`, en la nueva rama `feat/integracion-importacion-local`.
- Fusión real `--no-ff` de `a56f020`: incorpora el código validado `e4c3a93` y su evidencia. Solo hubo conflictos documentales, resueltos conservando los históricos y el cierre aislado. La fusión automática duplicó el enlace/traducción de importación; se eliminaron esos duplicados, sin cambiar el resto del menú.
- SHA-256 de `apps/web/app/globals.css`, `apps/web/lib/workspace.tsx` y `apps/web/lib/i18n-en.ts`: comprobados **idénticos byte por byte** antes y después. Iconos, plegado, teclado, estilos y traducciones previas conservados. No se descartaron los otros cambios del árbol; el diff de aplicación/infra/lockfile/pruebas frente al snapshot quedó vacío.
- No se hace push ni se modifica otra rama o worktree. No borrar volúmenes ni tocar producción.

## Entorno TLS y validación prevista

La corrida aislada anterior omitió 55 casos porque `openssl` no estaba en PATH. Ahora se localizó el ejecutable ya instalado `C:/Program Files/Git/usr/bin/openssl.exe`, versión **OpenSSL 3.5.9 (29 Sep 2026)**, y se comprobó que Node `spawnSync('openssl',['version'])` devuelve status 0 al añadir ese directorio al PATH de la sesión. No se instala nada ni se cambia el PATH global.

Comando ejecutado sobre el commit combinado limpio, desde la raíz: `$env:Path = 'C:/Program Files/Git/usr/bin;' + $env:Path; npm.cmd run validate`. No hay `--skip-e2e` ni se desactivan pruebas. Ese PATH permitió ejecutar los casos TLS contra servidores controlados locales, no proveedores reales. Las 55 omisiones previas no cambian retroactivamente de estado: existe una nueva ejecución satisfactoria que cubre esos mismos casos.

Tras aprobar se ejecutó `node scripts/desplegar.mjs` con HEAD aún en **el mismo SHA probado**, sin incorporar antes el commit documental posterior. Salida 0; `/version` declara `00c1c1b` desde BUILD_ARG, sin `+sucio`, con esquema `0080_plot_file_imports` conocido y aplicado. El despliegue reutilizó volúmenes y esquema; no hay migraciones nuevas frente a la versión local ya levantada. Este cierre se registra después en un commit documental que no cambia código ni la revisión que está corriendo.

## Corrida integral identificada

`validation-results/2026-11-25T05-21-10-573Z/`, fin UTC `2026-11-25T05:45:45.336Z`. Resultado **APROBADA**, salida **0**, SHA `00c1c1b`, **0 archivos con cambios sin commit**, ningún paso sin ejecutar. Árbol comprobado limpio también al terminar y antes de desplegar. Se guardó el [resumen JSON original](evidencias/integracion-00c1c1b/resumen.json), el [resumen Markdown](evidencias/integracion-00c1c1b/resumen.md) y las [huellas de logs](evidencias/integracion-00c1c1b/SHA256SUMS.txt); los logs completos permanecen en el directorio de validación ignorado por Git.

| Verificación | Resultado |
| --- | --- |
| Servicios, typecheck, lint, build y OpenAPI | Todos aprobados |
| API unitaria/integración | **117 suites, 1.269 pruebas aprobadas; 0 omitidas, 0 fallidas** |
| Web | **6 archivos, 27 pruebas aprobadas** |
| Chromium | **180/180 aprobadas**, sin omisiones |
| Lector GDAL, ejecución adicional sin red | **11/11 aprobadas**, salida 0 |

Duraciones: servicios 25,2 s; typecheck 20,7 s; lint 14,2 s; build 24,8 s; OpenAPI 22,1 s; npm test (API+web) 1.063,6 s; E2E 304,2 s. El lector se ejecutó con `docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=128m --memory 512m --cpus 1 terra-link-plot-reader:local /usr/bin/python3 /app/reader_test.py`.

### TLS: ejecutadas y omitidas por separado

Desglose obtenido del resultado real del arnés (`apps/api/test-results/timings.json`), con los **55 nombres, estados y tiempos** conservados en [tls-ejecutadas.json](evidencias/integracion-00c1c1b/tls-ejecutadas.json):

| Grupo TLS | Ejecutadas | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: | ---: |
| `src/satellite/whisp.spec.ts` | 34 | 34 | 0 | 0 |
| `src/satellite/egress-transporte.spec.ts` | 7 | 7 | 0 | 0 |
| Bloque Whisp 2.3.1 de `test/satellite.int-spec.ts` | 14 | 14 | 0 | 0 |
| **Total TLS antes pendiente** | **55** | **55** | **0** | **0** |

Estas 55 están incluidas en las 1.269 de API, no son una suma adicional. No se habilitaron llamadas reales a Whisp ni envíos regulatorios. OpenSSL sigue fuera del PATH global; repetir la corrida requiere el prefijo de sesión documentado arriba. Los informes de la corrida anterior que omitió TLS se conservan como históricos.

## PRODUCER a 390 px sobre el resultado combinado

Caso 59, `importar-parcelas-productor.spec.ts`, aprobado en **6,1 s** dentro de los 180 casos de esta corrida. Usa cuenta sintética con rol explícito PRODUCER, sesión propia y bases de prueba aisladas. Demuestra punto CSV sin productor → ficha propia → perímetro GeoJSON sobre **el mismo ID de parcela** → historial POINT y POLYGON, sin duplicar ni reasignar. La actualización requiere reconocimiento expreso. Código ajeno queda bloqueado, POST de confirmación forjado devuelve **409** y acceso a parcela ajena **404**, sin cambios en ella.

Capturas nuevas de esta corrida, con el menú y estilos locales integrados:

- [Punto guardado](capturas/importacion/integracion-producer-punto-390.png).
- [Misma parcela con perímetro y versiones](capturas/importacion/integracion-producer-perimetro-390.png).
- [Asociación ajena bloqueada](capturas/importacion/integracion-producer-ajena-bloqueada-390.png).

## Verificación del despliegue

[Respuesta pública registrada](evidencias/integracion-00c1c1b/despliegue-verificado.json): `/version.commit = 00c1c1b`, `commit_source = BUILD_ARG`; `/health/ready.status = ok`, con database/schema/redis/scanner en `ok`; web raíz **HTTP 200**. Se recargó además la página compartida del navegador en `http://localhost:3000/`: título Terra Link y formulario «Iniciar sesión» renderizados. No se usó una cuenta operativa ni se crearon parcelas de prueba en el despliegue; el recorrido autenticado está acreditado por E2E aislado.

La revisión que corre continúa siendo `00c1c1b`, aunque HEAD avance al commit documental posterior. No se hizo push. No se borraron volúmenes, archivos de usuario ni registros operativos. Se conserva el snapshot `e82411f` y la rama aislada original. Las [huellas visuales antes y después](evidencias/integracion-00c1c1b/preservacion-visual.json) se volvieron a comparar después de validar y desplegar: sin diferencias.
