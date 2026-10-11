# Offline y sincronización

FUENTE: S1 §§45–48 y S3 §18. La arquitectura móvil y sus librerías se confirman en repo. SQLite es propuesta de la fuente; preservar almacenamiento real si ofrece las garantías y hay ADR.

## Flujo

Autenticación online inicial → descargar solo asignaciones necesarias → sesión local protegida → capturar/validar → guardar entidad y operación de cola en una transacción local → sincronizar cuando vuelva conexión → validar en servidor → reconciliar resultado sin pérdida de datos.

Offline no significa renovar credenciales sin red. Definir política de sesión offline, periodo permitido y desbloqueo local por ADR; al volver online se revalidan membresía y permisos. Datos de un usuario no deben aparecer al iniciar otra cuenta en el mismo teléfono.

## Operación propuesta

```json
{
  "operation_id": "<uuid>",
  "device_id": "<registered-device-id>",
  "entity_id": "<client-generated-uuid>",
  "operation_type": "PLOT_GEOMETRY_CREATE",
  "base_version": 3,
  "depends_on": ["<producer-create-operation-id>"],
  "captured_at": "2026-10-09T15:00:00Z",
  "payload": {"plot_id": "<uuid>", "geometry": "<typed-geojson>"},
  "attachment_refs": ["<local-attachment-id>"]
}
```

Estados locales: `PENDING → UPLOADING → SYNCED`; error transitorio → PENDING con backoff; validación permanente → FAILED; versión divergente → CONFLICT. App cerrada durante UPLOADING recupera la operación como reintentable. UUID de operación se mantiene; un reintento no crea otro ID.

## Contrato de servidor

`push` recibe lote limitado, verifica cada operación/entidad y devuelve por operación: aceptada, duplicada, rechazada, conflicto o dependencia pendiente. Una operación rechazada no hace perder las independientes. Unique tenant/operation_id y hash de payload: mismo contenido retorna mismo resultado; distinto contenido produce conflicto.

`pull` usa cursor opaco estable por tenant y alcance, incluye cambios y tombstones. No paginar cambios solo por timestamp sin desempate. Si expira el cursor, realizar bootstrap reconciliado conservando operaciones locales pendientes. Los límites y política de cursor se fijan con pruebas de volumen.

Resolver productor antes de parcela, parcela antes de entrega y entidad antes de enlace de evidencia. La dependencia local no concede acceso a ninguna entidad. Confirmar estado servidor antes de quitar operación de cola; conservar registro de resultado.

## Conflictos

No last-write-wins para geometría, peso, origen, legalidad o estado confirmado. Mostrar valor local, valor servidor, versiones y motivo. Resolución por usuario autorizado crea nueva operación basada en versión actual, conserva historial y justificación. Fusionar automáticamente solo campos/operaciones no conflictivas con regla explícita y probada.

## Fotografías y documentos

Guardar referencias y bytes locales persistentes; checksum y límites. Subida reanudable/deduplicada según API/objeto real. Metadata sincronizada sin bytes completos no significa evidencia disponible. Estados separados para entidad y adjunto. El servidor finaliza, escanea y valida antes de habilitar descarga/evaluación. Evitar perder una foto al limpiar caches del formulario.

## Seguridad local

Mínimo dataset asignado; claves/tokens en almacenamiento seguro; cifrado disponible y probado en la plataforma elegida; separación por cuenta/tenant y procedimiento de cierre/suspensión sin destruir capturas no enviadas inadvertidamente. Un teléfono revocado no puede enviar como autorizado al volver a red; los borradores quedan en recuperación controlada.

## Aceptación

- Crear offline, cerrar app, reiniciar dispositivo y recuperar captura/cola/adjuntos.
- Reintentar la misma operación tras timeout sin duplicar productor, peso ni stock.
- Sincronizar productor/parcela/entrega en dependencia; error de una operación no bloquea independientes.
- Conflicto local/servidor visible y resoluble con audit trail.
- Sesión o permiso revocado: servidor rechaza; UI explica y conserva trabajo pendiente para recuperación.
- Cambiar cuenta no revela dataset anterior; GPS denegado, almacenamiento lleno y archivo interrumpido tienen recuperación.
- Ensayo Android real con fotos y GPS, offline prolongado, reconnect y reporte reproducible. Emulador no sustituye este gate.

## Implementación P0-023 (2026-10-10) — captura local, sin sincronización

Código: `apps/mobile` (ADR-0006, PROPUESTO). Estado: **ABIERTA**; falta el ensayo en Android real.

- Transacción local: «Guardar en cola» pasa el borrador a `QUEUED` y crea sus operaciones (`PLOT_FIELD_NOTE_CREATE`,
  `PLOT_LOCATION_SAMPLE_CREATE` dependiente de la nota, `PLOT_PHOTO_ATTACH` dependiente de la muestra) en una transacción
  exclusiva; si algo falla no queda nada parcial. `operation_id` se genera al encolar y no cambia.
- Estados implementados: `DRAFT` (borrador local), `QUEUED` con operaciones `PENDING`; recuperación de `UPLOADING` →
  `PENDING` conservando la identidad (`recovered_count`). `SYNCED`, `FAILED` y `CONFLICT` existen en el esquema y se
  implementan en P0-024.
- Dataset: solo las parcelas que `GET /plots` devuelve a la cuenta en la organización (el servidor aplica la asignación).
- Separación: base y adjuntos por cuenta + organización; cerrar sesión borra token y sesión, no las capturas.

### Política de sesión offline (propuesta D-40, no aprobada)

Login solo online; JWT de 1 h sin refresh (ADR-0005) que nunca se renueva sin red. Captura local permitida hasta
72 h desde la última autenticación online (parámetro de propuesta). Pasada la ventana, o si el reloj retrocede, la
captura nueva se bloquea y lo guardado se conserva. Sin red no se detectan revocaciones. Para enviar (P0-024) hará falta
iniciar sesión con conexión y el servidor revalidará sesión, membresía y permisos.

### Contrato de dispositivo (propuesta para P0-024)

- El cliente genera un `device_id` local (UUID en almacenamiento seguro). **No es prueba de autorización**: el servidor
  autoriza por sesión, membresía, permiso y recurso en cada operación.
- Propuesta: `POST /devices` (autenticado) registra el dispositivo para el usuario y la organización y devuelve un
  identificador emitido por el servidor; `push` exige sesión válida y rechaza dispositivos revocados; la revocación no
  borra capturas locales: quedan en recuperación controlada.
- Brecha de contrato: la API de muestras de ubicación solo acepta `source = BROWSER_GEOLOCATION`. P0-024 debe añadir una
  procedencia para el servicio de ubicación nativo (`DEVICE_LOCATION_SERVICE`) sin atribuir GPS.
