# QA-16 · Respaldo y restauración: evidencia histórica y verificación sobre el estado actual (2026-10-15)

QA-16 pide «restaurar DB+objetos en entorno aislado y ejecutar recorrido → snapshot consistente, archivos disponibles
y tiempos/RPO/RTO medidos».

## Corrección de un dato que yo di mal

En `docs/qa/CONTRASTE_SEGURIDAD_2026-10-15.md` y en la primera versión de la matriz del recorrido escribí que la
restauración de respaldo estaba «no ejecutada» y que «no existen comandos de respaldo verificados». **Es falso.**
El 13 de octubre se hizo un respaldo completo y **se verificó restaurándolo**, con cotejo de tablas y migraciones,
descifrado con las claves del respaldo y comprobación de objetos por hash. Está documentado en
`docs/qa/TRASLADO_DISCO_DOCKER_PASOS.md` §«Respaldo verificado (hecho, no pendiente)» y el respaldo sigue en
`D:\PROYECTOS CYBER LAND\TERRA LINK EUDR 2026\_respaldos\2026-10-13-pretraslado\`.

Lo que sí faltaba —y es lo que se hizo hoy— era **repetirlo sobre el estado actual**, que ya no es el de entonces:
37 migraciones entonces, **39** ahora, con tablas nuevas (satélite) que aquel respaldo no podía contener.

## Lo verificado el 2026-10-13 (histórico, intacto)

| | |
| --- | --- |
| Respaldo | `_respaldos/2026-10-13-pretraslado/`: `terra_link.dump`, `object-data.tar.gz`, `claves.env` (ACL restringida), `SHA256SUMS.txt`, `estado-previo.txt`, `docker_data.vhdx` |
| Estado capturado | **37 migraciones**, 13 tablas con conteos |
| Restauración | Base aislada `terra_link_verif` (creada y eliminada; `terra_link` no se tocó) |
| Resultado | Conteos idénticos en las 13 tablas y en las 37 migraciones · **12 campos descifrados** en `producers` y **14** en `producer_versions`, 0 fallos · objetos 2/2 por clave, tamaño y sha256, 0 rotas, 0 huérfanas |

**Ese respaldo no se ha tocado ni sobrescrito.** Sigue siendo el punto de retorno del traslado de disco.

## Lo verificado hoy, 2026-10-15, sobre el estado actual

### Respaldo nuevo

`_respaldos/2026-10-15-qa16/` — **no sustituye** al del 13 de octubre.

| Archivo | Qué es |
| --- | --- |
| `terra_link.dump` | Base completa (`pg_dump -Fc`) con las escrituras de la aplicación **pausadas** |
| `object-data.tar.gz` | Volumen `terra-link_object-data` (los tres buckets: privado, test y e2e) |
| `claves.env` | Las 9 variables necesarias para descifrar y acceder (`PII_*`, `S3_*`, `JWT_SECRET`, `POSTGRES_*`). ACL restringida al usuario; **nunca versionado ni impreso** |
| `estado-actual.txt` | 25 tablas con conteos, migraciones e inventario de objetos referenciados |
| `SHA256SUMS.txt` | Huellas de los cuatro; `sha256sum -c` → los cuatro `OK` |

**Coordinación de escrituras**: antes del volcado se detuvieron `api`, `web` y `worker` (`docker compose stop api web
worker`), dejando solo `postgres`, `redis`, `object-storage` y `scanner`. Así la base y los objetos corresponden al
**mismo instante**: el worker es el único que escribe objetos fuera de una petición.

### Restauración en un entorno **totalmente aislado**

No una base aparte en el mismo servidor, como en octubre: un **contenedor PostgreSQL nuevo con su propio volumen**,
creado para esto y destruido después. **Sin seed y sin migraciones** sobre la copia: solo `pg_restore`.

```
docker run -d --name tl-restore-qa16 -e POSTGRES_USER=... -v tl-restore-qa16-data:/var/lib/postgresql/data postgis/postgis:16-3.4
docker exec tl-restore-qa16 psql -U restore -d postgres -c "CREATE DATABASE terra_link_restaurada OWNER restore;"
docker exec tl-restore-qa16 pg_restore -U restore -d terra_link_restaurada --no-owner --no-privileges /tmp/terra_link.dump
```

### Resultados

| Comprobación | Resultado |
| --- | --- |
| **Migraciones** | **39/39**, de `0001_identity_organizations` a `0039_satellite_whisp_development`; **0 sin marca de tiempo** |
| **Tablas y conteos** | **Idénticos** a `estado-actual.txt`: `diff` sin diferencias en las 28 líneas (25 tablas + migraciones + 2 objetos) |
| **Satélite** | `satellite_providers` 4 filas con su estado (`WHISP = SELECTED_FOR_DEVELOPMENT`, 1 operación declarada); `satellite_jobs`, `satellite_results` y `satellite_credentials` en 0, como en origen |
| **Reportes** | Sus fuentes restauradas: `risk_rule_sets` (0.1.0 y 0.2.0, ambas `NOT_APPROVED`), `risk_rules` 16, `risk_evaluations` 2, `dd_cases`/`dd_snapshots` 1, `audit_logs` 276, `domain_events` 63 |
| **Relaciones** | **265 FK, 311 CHECK y 125 UNIQUE** reconstruidas en la copia |
| **Descifrado** | **18 campos** en `producers` (6 de 9 productores con identidad) y **21** en `producer_versions`; **0 fallos**. Clave `k1` presente y activa. **Ningún valor se imprimió** |
| **Objetos** | 2/2 referenciados: **clave, tamaño y sha256 exactos**; 0 faltantes, 0 diferentes, **0 huérfanos** en el bucket privado |

### Tiempos medidos

| Fase | Duración |
| --- | --- |
| Volcado de base + volumen de objetos | **3 s** |
| Arranque del entorno aislado | 6 s |
| Restauración (`pg_restore`) | **14 s** |
| Verificación completa (cotejo, descifrado, objetos) | < 2 min |

Con estos volúmenes (dump de 538 KB, 2 objetos) los tiempos **no son extrapolables** a un piloto real. Sirven como
línea base del procedimiento, no como RPO/RTO.

### Qué se comparó contra qué

Contra **`estado-actual.txt`, capturado por el propio respaldo** con las escrituras pausadas; no contra la base de
desarrollo, que volvió a admitir escrituras al reanudar los servicios. Comparar contra una base viva habría producido
diferencias que no dirían nada sobre el respaldo.

## Límites de esta verificación

- **No se ejecutó un recorrido operativo sobre la copia restaurada.** QA-16 lo pide («y ejecutar recorrido»). Falta
  levantar una API contra la copia y repetir el recorrido integral ahí. **Pendiente declarado.**
- **RPO/RTO no están medidos**: estos tiempos son de un conjunto de datos mínimo. Medirlos exige volumen de piloto.
- **No se probó la restauración del VHDX completo** (el respaldo de octubre lo incluye). Hoy solo base + objetos.
- **No se verificó el bucket `terra-link-private` frente a objetos no referenciados antiguos**: el inventario
  comparado es el de `document_versions`. Los buckets de test y e2e se respaldan pero no se cotejan: son desechables.
- La base y los volúmenes de desarrollo **no se tocaron**: la copia vivió en un contenedor y un volumen propios, ya
  destruidos.

## Comandos reproducibles

Registrados en `docs/20_COMANDOS_Y_ENTORNO.md` §«Respaldo y restauración verificada (QA-16)».
