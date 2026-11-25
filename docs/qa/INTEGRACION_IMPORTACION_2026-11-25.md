# Integración de importación multiformato con la versión visual local

Solicitud: integrar `feat/importacion-done-local` hasta `a56f020`, conservar menú/estilos/idioma, validar un SHA combinado y desplegarlo únicamente si aprueba. Estado inicial: **INTEGRADO, VALIDACIÓN Y DESPLIEGUE PENDIENTES**.

## Preservación y fusión

- Base de la carpeta actual: `0b968c9`, con cambios locales de importación y visuales. Se preservó todo el árbol en el commit snapshot `e82411f`, en la nueva rama `feat/integracion-importacion-local`.
- Fusión real `--no-ff` de `a56f020`: incorpora el código validado `e4c3a93` y su evidencia. Solo hubo conflictos documentales, resueltos conservando los históricos y el cierre aislado. La fusión automática duplicó el enlace/traducción de importación; se eliminaron esos duplicados, sin cambiar el resto del menú.
- SHA-256 de `apps/web/app/globals.css`, `apps/web/lib/workspace.tsx` y `apps/web/lib/i18n-en.ts`: comprobados **idénticos byte por byte** antes y después. Iconos, plegado, teclado, estilos y traducciones previas conservados. No se descartaron los otros cambios del árbol; el diff de aplicación/infra/lockfile/pruebas frente al snapshot quedó vacío.
- No se hace push ni se modifica otra rama o worktree. No borrar volúmenes ni tocar producción.

## Entorno TLS y validación prevista

La corrida aislada anterior omitió 55 casos porque `openssl` no estaba en PATH. Ahora se localizó el ejecutable ya instalado `C:/Program Files/Git/usr/bin/openssl.exe`, versión **OpenSSL 3.5.9 (29 Sep 2026)**, y se comprobó que Node `spawnSync('openssl',['version'])` devuelve status 0 al añadir ese directorio al PATH de la sesión. No se instala nada ni se cambia el PATH global.

Comando previsto sobre el commit combinado limpio, desde la raíz: `$env:Path = 'C:/Program Files/Git/usr/bin;' + $env:Path; npm.cmd run validate`. No hay `--skip-e2e` ni se desactivan pruebas. Ese PATH permite al arnés decidir ejecutar los casos TLS contra servidores controlados locales, no proveedores reales. Registrar por separado cuántos TLS se ejecutan/aprueban/fallan/omiten; las 55 omisiones previas no cambian retroactivamente de estado.

Solo tras aprobación: desplegar **el mismo SHA probado**, sin incorporar antes el commit documental posterior. `node scripts/desplegar.mjs` debe declarar en `/version` el SHA exacto sin `+sucio`. Verificar web `http://localhost:3000/` y API `/health/ready` (base/esquema/Redis/escáner). El despliegue reutiliza esquema 0080 y volúmenes existentes; no hay migraciones nuevas frente a la versión local ya levantada. Después, commit separado de resultados y capturas; ese commit no cambia código ni la revisión que está corriendo.
