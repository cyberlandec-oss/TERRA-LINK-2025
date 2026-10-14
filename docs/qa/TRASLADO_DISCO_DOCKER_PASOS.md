# Traslado del almacenamiento de Docker de D: (USB) a C: (NVMe) — pasos exactos

Motivo y mediciones: `docs/qa/DIAGNOSTICO_VALIDACION_INESTABLE_2026-10-13.md`.
Hallazgo relacionado: `docs/qa/HALLAZGO_PERDIDA_DATOS_DEMO_2026-10-13.md`.

**El traslado requiere la interfaz de Docker Desktop y no puede completarse desde la línea de órdenes.** Docker Desktop
4.95.0 no atiende `-Shutdown` cuando ya hay una instancia en marcha (responde `backend already running, signaling
show-dashboard`), y forzar el cierre de sus procesos con el disco virtual montado es exactamente el riesgo que este
procedimiento trata de evitar. Los respaldos ya están hechos y **verificados**; faltan solo los pasos manuales.

## Estado de partida (comprobado el 2026-10-13)

| Dato | Valor |
| --- | --- |
| Ubicación actual del disco | `D:\DOCKER DESCKTOP\DockerDesktopWSL\disk\docker_data.vhdx` |
| Tamaño actual | 6,9 GB |
| Espacio libre en C: | 72,1 GB (suficiente) |
| Distro WSL | `docker-desktop`, `BasePath = \\?\D:\DOCKER DESCKTOP\DockerDesktopWSL\main` |
| Docker Desktop | 4.95.0.242831 |
| Migraciones en `terra_link` | 37, de `2026-10-13T15:14:19Z` a `15:14:38Z` |
| Conteos | orgs 4 · users 20 · producers 9 · plots 6 · deliveries 3 · lots 3 · documents 2 · document_versions 2 · evidence 1 · dd_cases 1 · dd_snapshots 1 · stock_movements 7 · domain_events 63 |

El repositorio **permanece en D:**. Solo se traslada el almacenamiento de Docker.

## Respaldo verificado (hecho, no pendiente)

`D:\PROYECTOS CYBER LAND\TERRA LINK EUDR 2026\_respaldos\2026-10-13-pretraslado\`

| Archivo | Contenido |
| --- | --- |
| `terra_link.dump` | Base completa, formato custom, con las escrituras de la aplicación **pausadas** (api, web y worker detenidos) |
| `object-data.tar.gz` | Volumen `terra-link_object-data` (S3 local) |
| `claves.env` | `PII_KEYS`, `PII_ACTIVE_KEY_ID`, `PII_INDEX_KEY`, `S3_*`, `JWT_SECRET`, `POSTGRES_*`. ACL restringida al usuario (`icacls /inheritance:r`). **Nunca versionado ni mostrado** |
| `SHA256SUMS.txt` | Huellas de los tres |
| `estado-previo.txt` | Conteos y migraciones de arriba |

**Comprobaciones realizadas (todas superadas):**

1. `sha256sum -c SHA256SUMS.txt` → los tres `OK`.
2. Restauración en base **aislada** `terra_link_verif` (creada y eliminada después; `terra_link` no se tocó).
3. Cotejo de conteos restaurada vs original: **idénticos en las 13 tablas y en las 37 migraciones**.
4. **Descifrado con las claves del respaldo**: 9 productores, 6 con identidad cifrada, **12 campos descifrados** en
   `producers` y **14 en `producer_versions`**, **0 fallos**. Ningún valor se imprimió.
5. Versiones de clave: `PII_KEYS` contiene el id `k1`; `PII_ACTIVE_KEY_ID` = `k1`; la activa está entre las conservadas.
6. Objetos por hash: referencias de la base restaurada vs contenido del `tar`, **2 y 2, coincidencia exacta en clave,
   tamaño y sha256**; 0 rotas, 0 huérfanas.

## Pasos manuales (los ejecuta la persona; Claude no puede)

1. **Cerrar Docker Desktop del todo**: icono de la bandeja → *Quit Docker Desktop*. Esperar a que desaparezcan los
   procesos `Docker Desktop` y `com.docker.backend`.

2. **Copia privada del VHDX** (red de seguridad adicional; con Docker ya detenido). En PowerShell:

   ```powershell
   $src = 'D:\DOCKER DESCKTOP\DockerDesktopWSL\disk\docker_data.vhdx'
   $dst = 'D:\PROYECTOS CYBER LAND\TERRA LINK EUDR 2026\_respaldos\2026-10-13-pretraslado\docker_data.vhdx'
   Copy-Item $src $dst
   (Get-FileHash $dst -Algorithm SHA256).Hash | Tee-Object -FilePath "$dst.sha256"
   ```

   Anotar el hash. Si la copia falla por espacio o por bloqueo, **detenerse aquí** y no trasladar.

3. **Trasladar con el procedimiento oficial**: abrir Docker Desktop → **Settings → Resources → Advanced** →
   *Disk image location* → **Browse** → elegir una carpeta en **C:** (por ejemplo `C:\DockerDesktopWSL`) →
   **Apply & restart**. Docker mueve el disco y conserva imágenes y volúmenes.

   **No usar** *Reset to factory defaults*, *Clean / Purge data* ni reinstalar: cualquiera de esas opciones crea un
   almacenamiento nuevo y vacío — que es exactamente lo que pasó el 2026-10-12.

4. **Avisar a Claude** cuando Docker vuelva a estar en marcha, sin levantar la aplicación todavía.

## Verificación posterior (la hace Claude, antes de levantar la aplicación)

1. `docker volume ls` → deben aparecer `terra-link_postgres-data`, `terra-link_object-data`, `terra-link_scanner-db`.
2. Levantar **solo** `postgres` y comprobar `kysely_migration`: deben seguir siendo **37**, con las marcas de tiempo
   **`15:14:19Z`–`15:14:38Z` del 2026-10-13**. Si alguna migración tiene fecha posterior, **se reejecutaron sobre un
   almacenamiento nuevo**: detener y reportar.
3. Cotejar los 13 conteos contra `estado-previo.txt`.
4. Repetir el cotejo de objetos por clave, tamaño y sha256.
5. **Si aparece una base vacía o cualquier discrepancia: detener la puesta en marcha y reportar. No ejecutar el seed ni
   recrear registros para disimularlo.**
6. Solo entonces: volver a medir `pg_test_fsync` y las fases del harness, y lanzar `npm run validate` completa con el
   muestreador ligero.

## Reversión

Mismo camino: **Settings → Resources → Advanced → Disk image location** → volver a apuntar a
`D:\DOCKER DESCKTOP\DockerDesktopWSL` → *Apply & restart*. Si el disco quedara inservible, restaurar
`docker_data.vhdx` desde la copia del paso 2, o reconstruir desde `terra_link.dump` + `object-data.tar.gz` + `claves.env`
siguiendo `_respaldos\2026-10-13\LEEME.md`.

## Lo que este traslado no promete

Está medido que el fsync de D: es 181 ops/s frente a 794 ops/s en C: (y C: se midió con la penalización de un montaje
Windows, así que el real es mejor), y que `migrate_ms` pasó de 2789 ms a 7172 ms tras el traslado del 2026-10-12. Lo que
**no** está demostrado es que los picos que provocan los timeouts de 60 s procedan del disco: esa sigue siendo la
hipótesis H1. Una corrida verde después del traslado **no** demostrará por sí sola la causa de los cinco fallos previos.
