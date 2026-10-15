# Sesión 2026-10-15 — Consolidación de P0-012/P0-016 y revisión 2 de D-05

Continuación de `SESION_2026-10-15_D32_D33.md`. **No se adoptó ninguna decisión nueva** y **no se modificó ninguna
compuerta regulatoria.** D-07, D-09, D-34, D-37, D-38 y D-42 siguen exactamente donde estaban.

## 0. Despliegue levantado y verificado

| Comprobación | Resultado |
| --- | --- |
| Contenedores | 7, todos arriba; api/web/postgres/redis/scanner `healthy` |
| `localhost:3000` · `4000/api/docs` · `3001` | **200**, **200**, **200** (3001 relanzado: es un proceso de Node, no un contenedor) |
| Migraciones | **40** |
| Marcas de migración | de `2026-10-13T15:14:19Z` a `2026-10-15T04:41:52Z` → **no se reejecutaron sobre almacenamiento nuevo**: los datos siguen |
| Catálogo CTE | `1.6.0`; `DRYING` v2 publicado en esa versión |
| `delivery_closures` | **0** filas: la tabla existe y no se ha usado en la base de desarrollo |
| Datos DEMO | 9 productores · 107 tablas |

Datos, volúmenes, credenciales, respaldos y APK **intactos**. `SATELLITE_LIVE_CALLS` sigue apagado.

## 1. Consolidación de los cierres (P0-012 y P0-016)

Se actualizaron `docs/qa/MATRIZ_RECORRIDO_INTEGRAL.md`, `docs/23_ESTADO_DESARROLLO.md`, `docs/MANUAL_OPERACION.md`,
`docs/sesiones/REANUDAR_2026-10-15.md` y `docs/decisiones/DECISIONES-MINIMAS-PARA-CERRAR.md`.

El secado y el cierre de entregas **dejan de figurar como bloqueados**. Lo que **sí** queda explícito, en cada
documento y no en una nota al pie:

- **Límites de aceptación** de calidad y de humedad: **sin decidir**. El tope de 100 de la humedad es estructural.
- La versión de límites que se registra al liberar calidad es **declarada por quien decide** y el sistema **no la
  verifica**.
- **Unidades de peso adicionales** (D-32): no existen; hoy solo kg.
- **Validación con operadores reales**: ninguna. Todo lo demostrado usa datos sintéticos.
- Las **demás historias abiertas** y los bloqueos de expediente y despacho siguen igual: cerrar una entrega o un
  secado **no acerca** el `READY` ni el despacho.

### Una cifra que estaba mal y se corrigió

La matriz decía **«cuatro bloqueos comprobados»** y omitía el factor satelital. El recorrido integral imprime la
cifra real al terminar. Antes de esta sesión eran **6**; ahora son **5**.

## 2. Recorrido integral ampliado

`apps/api/test/recorrido-integral.int-spec.ts` ya no anota el cierre de entregas como corte
(`SIN_POLITICA_DE_CIERRE`): lo recorre.

| Lo que ahora demuestra | Cómo |
| --- | --- |
| Cerrar **sin motivo** se rechaza | 422 con `reason` entre los campos |
| Quien **solo confirma recepciones** no puede cerrar con diferencia | 403: hace falta `delivery:correct` |
| El cierre con motivo funciona | 200; diferencia **+20 kg** (500 declarados − 480 recibidos) justificada |
| Una entrega cerrada **no admite recepciones nuevas** | 409 `DELIVERY_CLOSED`; `actions.receive = false` |
| Cerrar **no ajusta** lo declarado | 500 y 480 siguen conservados por separado |

Resultado: **11 transiciones demostradas y 5 bloqueos**, frente a 10 y 6. Ejecutado: **10/10 casos**, 56 s.

Lo que el recorrido ya demostraba y se conserva intacto: fermentación (480 = 430 + 50), secado con su medición
(sin humedad no cierra; con 7,2 %BH, 100 = 90 + 10), conciliación del ledger sin diferencias después de cada
cierre, origen `COMPLETE` tras dos transformaciones, recorrido inverso hasta el productor y la parcela, y los
cinco bloqueos restantes con su decisión responsable.

## 3. Aislamiento de las pruebas de navegador

**El problema.** Las tres pruebas de D-32/D-33 estaban al final de `e2e/tests/productos.spec.ts` para que el secado
no moviera los saldos que verifican inventario, riesgo y reportes. Eso hacía de la **posición** parte del contrato,
y el motivo vivía solo en un comentario. Además, la tercera se **saltaba en silencio** (`test.skip`) si no
encontraba una entrega cerrada dejada por la anterior: una comprobación no ejecutada que parecía aprobada.

**Qué se hizo.** Las tres preparan ahora por API su propio material —productor, centro de acopio y productos
exclusivos— y la tercera crea y cierra su propia entrega. **Las verificaciones de inventario no se tocaron**:
P0-017 sigue comprobando los 750 kg en Centro E2E, el traslado de 100 kg y la merma de 2 kg con motivo.

**Cómo se demostró** (no por argumento, por ejecución):

| Corrida | Posición del bloque | Resultado |
| --- | --- | --- |
| 1 | Al final, como estaba | **24/24** · 3,0 min |
| 2 | **Antes** de lotes, inventario, riesgo y reportes | **24/24** · 1,0 min |

El bloque quedó **en la posición nueva**, que es justamente la que antes rompía las pruebas de saldos.

**Lo que esto no demuestra**: que el archivo sea paralelizable. Sigue siendo serial, con un trabajador, y las
pruebas comparten la organización y las cuentas que crea la de preparación.

## 4. Evidencia de versión precisada

La corrida `validation-results/2026-10-15T04-25-29-508Z` se ejecutó **antes** de que existiera `2c1ab60`: su
resumen anota `commit: 7e62c74` y 31 entradas sin confirmar. Ahora está escrito así, con las comprobaciones que
sostienen la correspondencia —padre del commit, 31 segundos de diferencia, y los registros de la corrida mostrando
la suite `d32-d33.int-spec.ts`, los títulos de las tres pruebas E2E nuevas y la salida del recorrido integral tal
como quedó en ese commit— y **con su límite declarado**: git no guarda el árbol de trabajo, así que es
correspondencia fuerte, no igualdad demostrada.

Se deja anotada la mejora que la volvería comprobable: que `scripts/validate-local.mjs` registre un **hash del árbol
probado**. **No se hizo aquí**, para no mezclarla con esta entrega.

## 5. D-05, revisión 2 — propuesta, NO aprobada

`docs/decisiones/D-05-PROPUESTA.md`. Separa tres capas que antes se mezclaban: **norma**, **especificación técnica
del destino** y **regla interna de Terra Link**.

**Verificado directamente** (documentación oficial del *EUDR Information System*, página de 17-08-2026, API v1.2):

- **El caso del umbral exacto queda resuelto**: un punto con `Area` de **4,000000 ha se acepta**; el error aparece
  *higher than 4ha*. El operador es **estricto**. Mínimo: 0,0001 ha.
- Un punto **sin** `Area` recibe **4 ha por defecto** en destino. De ahí la propuesta de **no exportar nunca** un
  punto sin superficie: sería convertir un desconocido en dato.
- Tipos aceptados, CRS, orden de ejes, tamaño (25 MB) y propiedades de exportación.

**Dos supuestos de la revisión 1 quedan contradichos**: los **huecos no se procesan** (un polígono OGC-válido puede
no cumplir el perfil) y los decimales **se truncan** a 6, no se redondean —lo que además abre una comprobación
nueva: dos vértices distintos pueden **colapsar** al truncar e invalidar el polígono—.

**No verificado, y así queda escrito**: el **texto literal** de la norma. EUR-Lex no respondió a las herramientas
del entorno (HTML consolidado, página ELI y PDF del DOUE, los tres vacíos). **No se cita ningún artículo a partir de
resúmenes de terceros.** Queda pendiente, además, si la vía de **dirección postal** que introdujo el Reglamento (UE)
2025/2650 alcanza a los productores del proyecto: eso cambiaría el **alcance** del perfil, no solo sus parámetros.

La propuesta incluye 13 casos de prueba, **ninguno escrito todavía**: son posteriores a la aprobación.

## 6. Qué NO se hizo

- **No** se aprobó D-05 ni ninguna otra decisión.
- **No** se tocó ninguna compuerta ni ningún `CHECK` del esquema para cerrar historias.
- **No** se reejecutó `npm run validate` completa: los cambios son de prueba y documentación. Lo ejecutado fue el
  recorrido integral (10/10), `productos.spec.ts` completo dos veces (24/24 cada una), `typecheck` y `lint`.
- **No** se encendió `SATELLITE_LIVE_CALLS` ni se tocaron datos, volúmenes, credenciales, respaldos ni APK.

## 7. Siguiente paso

**D-05 necesita una persona con acceso a EUR-Lex**, no más desarrollo: adjuntar el texto de los dos artículos y
aclarar la vía de dirección postal. **D-07** sigue independiente y con propuesta escrita.
