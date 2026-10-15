# Contraste de las comprobaciones de seguridad exigidas frente a la evidencia disponible (2026-10-15)

**Esto no es una auditoría independiente.** Son las pruebas automatizadas del propio repositorio, escritas por quien
escribió el código, ejecutadas en el equipo local. Una revisión de ciberseguridad externa sigue **pendiente** y es un
gate aparte (docs/16 §Definition of Done).

Exigencia contrastada: docs/16 §«Comprobaciones críticas de seguridad», QA-01/02/09/13/15, docs/07 (autorización),
docs/12 (archivos privados), docs/15 §«Seguridad de llamadas externas» y docs/17.

## Resumen por área

| Área | Exigencia | Evidencia disponible | Veredicto |
| --- | --- | --- | --- |
| **Autorización entre dominios** | «Prueba positiva A→A junto a negativa A→B»; cada vista agregada exige el permiso de **su** dominio | `rbac.int-spec` + pruebas de autorización en cada módulo; reportes exigen el permiso de cada dominio del que publican datos (`reports-entities`); riesgo y expediente exigen alcance de organización completo | **Cubierto** |
| **Aislamiento entre organizaciones** | IDs, listas, grafo, instantáneas, parcelas, exportaciones, objetos y trabajos de B no accesibles desde A; FK de B rechazada | Pruebas por módulo + **recorrido integral**: productor, parcela, entrega, recepción y lote de A son invisibles e inutilizables desde B | **Cubierto** |
| **Exportaciones** | Permiso separado revalidado al descargar; sin PII; con huella y registro | `audit:export`, `report:export` (revalidado), `dd:export_package`; CSV con `X-Content-Sha256`; GeoJSON exige `plot:read_geometry` | **Cubierto** |
| **Archivos privados** | Contenido autorizado por clasificación; nada de claves de almacenamiento; análisis antimalware; barrido que no borra lo referenciado | `documents`, `scanner-limits`, `storage-sweeper`; descarga por id + clasificación (`PERSONAL_DATA` exige `producer:read_identity`); el barrido usa **lista blanca** de claves gestionadas | **Cubierto, con un defecto corregido hoy** (abajo) |
| **Llamadas salientes** | Hosts/protocolos permitidos, redirecciones, SSRF/DNS, plazo, tamaño, redacción | QA-15 en niveles: decisión pura (13), transporte con servidores controlados (7), adaptador Whisp contra servidor controlado (18), desenlaces de extremo a extremo (25) | **Cubierto salvo el nivel de proveedor real** (D-09 parte B) |
| **Elevación de SUPER_ADMIN** | «superadmin con elevación explícita» (QA-02) | Hoy **no existe** elevación: el acceso a una organización donde no es miembro responde `ELEVATION_REQUIRED`/404 | **Brecha abierta por decisión: D-04** |
| **Concesiones entre organizaciones** | Buyer y auditor externos según grants | No implementadas (ADR-0002 propuesto, P1-001) | **Fuera de alcance actual, declarado** |
| **Revisión externa** | — | Ninguna | **PENDIENTE** |

## Defecto encontrado y corregido hoy

**Qué pasaba.** La API satelital devolvía la **clave de almacenamiento** del original del proveedor:
`raw_evidence: { object_key: "satellite/<organización>/<trabajo>.json", sha256 }`.

**Por qué importa.** Ningún otro módulo publica una clave de objeto: los documentos exponen su SHA-256 y su número de
versión, nunca la ruta en el almacén privado. Publicarla revela la estructura interna del almacenamiento (y en este
caso incluía el identificador de la organización). No era una vía de descarga —no existe ningún endpoint que acepte
una clave arbitraria, el barrido usa lista blanca y el contenido se sirve siempre por identificador con su
clasificación—, pero sí una fuga de estructura interna contraria a la propia regla de redacción del proyecto
(«nunca se presentan secretos, tokens, enlaces, claves…», docs/07 §auditoría).

**Qué se hizo.** La respuesta pasa a `raw_evidence: { stored: true, sha256 }`: el original se **acredita por su
huella**, que es lo que permite verificarlo, sin publicar dónde vive. Prueba añadida en `satellite.int-spec.ts`: el
resultado conserva el SHA-256 y la respuesta **no contiene** `object_key` ni ninguna ruta del almacén.

Alcance del hallazgo: **una respuesta de API**, dentro del código escrito en esta misma entrega. No hay indicio de que
el patrón exista en otros módulos (se comprobó: ningún otro devuelve `object_key`).

## Brechas priorizadas, sin maquillaje

| Prioridad | Brecha | Por qué sigue abierta | Qué la cierra |
| --- | --- | --- | --- |
| **1** | **Ninguna revisión de seguridad independiente** | Nadie ajeno al código ha mirado | Encargar la revisión; es un gate aparte de P0-031 |
| **2** | **Elevación de SUPER_ADMIN sin política** (QA-02 parcial) | **D-04** sin decidir: quién eleva, con qué aprobación, alcance, duración y notificación | D-04 |
| **3** | **Llamada saliente contra un proveedor real nunca ejecutada** | **D-09 parte B** sin aprobar | D-09 parte B (ver ensayo propuesto con geometría sintética) |
| **4** | **Concesiones entre organizaciones** (buyer/auditor externos) | Sin contrato definido (ADR-0002, P1-001) | Decisión de producto + P1-001 |
| **5** | **Restauración de respaldo (QA-16)** | No hay comandos de respaldo verificados | Definir y verificar respaldo/restauración; parte de P0-031 |
| **6** | **Pruebas de mutación dirigidas** | docs/16 las admite como demostración puntual («mutación dirigida del tenant filter o del guard de stock»); no se han ejecutado | Ejercicio acotado sobre el filtro de tenant y el guard de stock |

## Lo que esta evidencia **no** dice

- No dice que el sistema sea seguro. Dice que **estas comprobaciones** pasan.
- No sustituye revisión de código independiente, análisis de dependencias ni prueba de penetración.
- No cubre producción: no hay despliegue, ni TLS propio, ni gestión de secretos operativa, ni endurecimiento de
  infraestructura. Todo eso está fuera de la etapa local vigente y así consta en docs/17 y docs/20.
