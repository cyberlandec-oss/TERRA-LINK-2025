# Análisis satelital: ensayo local acotado (2026-11-01)

Esta guía describe cómo ejecutar, **en el equipo local**, un análisis real con Whisp sobre una **geometría artificial de ensayo**, sin registrar la decisión D-09 parte B (uso real) y sin automatismos. No autoriza parcelas reales, no activa el análisis de forma general y no satisface ningún requisito del expediente.

## Por qué hace falta
Para encargar un análisis el código exige un proveedor en `SELECTED` (parte B) **y** `SATELLITE_LIVE_CALLS=enabled`. Whisp está en `SELECTED_FOR_DEVELOPMENT` (parte A): sin este mecanismo la única vía sería marcar toda la plataforma como «aprobada para uso real», que es una decisión del propietario. El ensayo acotado separa las dos cosas.

## Qué se exige (las cuatro condiciones a la vez)
1. `SATELLITE_LIVE_CALLS=enabled` (API y worker).
2. `SATELLITE_TRIAL_PLOT_IDS` es una lista **válida**: `<id de la parcela>:<huella sha256 de la geometría autorizada>`, separadas por comas. **Una sola entrada mal formada invalida toda la lista** (falla cerrada). El formato antiguo (solo el identificador) tampoco vale.
3. La parcela **y la huella de la versión que se analizaría** figuran en la lista. Si la geometría cambia, la huella deja de coincidir y la autorización deja de valer.
4. El código de la parcela empieza por `ENSAYO-` (etiqueta adicional; no sustituye a la huella).
Además siguen vigentes los controles de siempre: permiso `satellite:request` (y `plot:read_geometry` en parcelas propias), credencial de la organización **solicitante**, y autorización explícita por parcela cuando la propietaria es otra organización.

## Qué queda registrado
- El trabajo guarda `scope = LOCAL_TRIAL` (inmutable). Una respuesta de una fixture sintética se distingue aparte (`is_ensayo`/`is_synthetic`); el uso operativo es `OPERATIONAL`.
- El alcance viaja a las entradas del expediente (`scope: LOCAL_TRIAL`) y el requisito de análisis de deforestación **excluye** esos resultados por lo que son, **aunque Whisp pase después a `SELECTED`**.
- El worker revalida las cuatro condiciones al ejecutar (no solo al encargar): si la parcela sale de la lista, el trabajo termina `TRIAL_SCOPE_NOT_ALLOWED` y no sale ninguna llamada.

## Configuración local (`.env` privado, ignorado por Git)
```
SATELLITE_LIVE_CALLS=enabled
SATELLITE_TRIAL_PLOT_IDS=<idParcela1>:<huella1>,<idParcela2>:<huella2>
```
`docker-compose.yml` pasa ambas variables a la API y al worker. **Reiniciar un contenedor con configuración antigua no basta**: hay que recrear los servicios (`node scripts/desplegar.mjs`). Para dejar el ensayo cerrado basta vaciar la lista o poner el interruptor en `disabled`; no se cierra solo.

## Límites
Es manual: cada análisis lo encarga una persona autorizada. Un resultado de Whisp con cobertura `UNKNOWN` o `PARTIAL` no es «cero deforestación». No es un recibo ni una conformidad. Ampliar a parcelas reales o activar de forma permanente exige la decisión D-09 parte B del propietario.
