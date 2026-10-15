# Propuesta: primer ensayo externo con Whisp usando geometría sintética (2026-10-15)

**PROPUESTA. NO EJECUTADA. NO AUTORIZADA.** D-09 parte B sigue pendiente. Este documento describe un ensayo que
**no se ha hecho** y que no debe hacerse hasta que esté aprobado. No se solicita ninguna clave aquí.

## La idea, y por qué separa dos problemas

Hoy hay dos preguntas mezcladas en una sola decisión:

1. **¿Funciona el adaptador contra el servicio real?** Su formato real, sus códigos, sus cuotas, su TLS.
2. **¿Podemos enviar geometrías de productores a un tercero?** Autorización de datos, términos, base del tratamiento.

La segunda es una decisión de datos personales y contratos. La primera es una comprobación técnica. **Con una
geometría sintética se responde la primera sin tocar la segunda**: un polígono inventado sobre una zona sin relación
con ninguna parcela, ningún productor y ninguna entrega del sistema no es dato de nadie.

Eso no convierte el ensayo en gratis —sigue siendo una llamada a un tercero con una clave— pero reduce lo que está en
juego a lo técnico y permite decidir la parte B con información real en la mano.

## Qué geometría

Un **polígono sintético** que cumpla tres condiciones, en este orden:

1. **Sin vínculo con el sistema**: no procede de ninguna parcela, no se registra como parcela, no se guarda en
   `plot_versions` y no aparece en ningún lote, entrega ni expediente. Vive solo en el ensayo.
2. **Sin relación con un predio real identificable**: no se usan coordenadas de una finca de la cooperativa ni de un
   productor DEMO. Un cuadrado de ~2 ha sobre una zona boscosa conocida y pública sirve: el objetivo es que el
   proveedor **tenga algo que analizar**, no que el resultado signifique algo.
3. **Rotulada como sintética** en todo lo que se conserve del ensayo.

Conviene preparar **dos**: una que probablemente dé indicadores de cobertura forestal y otra sobre una zona sin
bosque. Lo que interesa no es el veredicto, sino que **dos entradas distintas produzcan respuestas distintas** y que
el adaptador las traduzca bien.

## Qué demostraría (y qué no)

| Demostraría | No demostraría |
| --- | --- |
| Que el contrato implementado (OpenAPI 2.3.0, consultado 2026-10-15) **coincide con el servicio vivo**: rutas, campos, códigos | Nada sobre parcelas reales ni sobre deforestación |
| Que el flujo `submit → status → descarga` funciona de verdad, con sus tiempos reales | Que el sistema pueda usar el resultado: eso es D-07 |
| Que la autenticación por `x-api-key` y el TLS del proveedor funcionan con la defensa de salida puesta | Que el resultado sea evidencia: eso es D-42 |
| Qué trae realmente `whisp_processing_metadata` y si hay `unavailable_datasets` en la práctica | Conformidad EUDR de nada |
| Cuotas y plazos reales frente a los publicados | Que la parte B esté aprobada |

El resultado del ensayo se guardaría con `is_synthetic` en **false** (procede de un proveedor real) pero sobre un
sujeto que no existe en el dominio. Por eso el ensayo **no debe ejecutarse contra una parcela del sistema**: no habría
forma de distinguir después un resultado de prueba de uno de producción.

## Requisitos para poder ejecutarlo

| # | Requisito | Estado |
| --- | --- | --- |
| 1 | **Aprobación explícita de D-09 parte B**, aunque sea acotada a este ensayo | **Pendiente** |
| 2 | **Términos del servicio** leídos y aceptados por el responsable | **Pendiente** |
| 3 | **Clave de API** obtenida por registro y guardada por el responsable **fuera del chat** (se registra cifrada por organización con el mecanismo existente) | **Pendiente** |
| 4 | `SATELLITE_LIVE_CALLS=enabled` solo en el entorno del ensayo y solo mientras dure | **Pendiente** |
| 5 | Marcar `WHISP` como `SELECTED` con responsable y referencia de la decisión | **Pendiente** |
| 6 | Las dos geometrías sintéticas acordadas y escritas antes de ejecutar | Preparable sin autorización |
| 7 | Alcance temporal acotado: una ventana corta, un número máximo de llamadas, y apagar el interruptor al terminar | — |

Lo que **no** hace falta y conviene no tocar: parcelas reales, productores, datos DEMO y la base de desarrollo.
El ensayo puede correr contra una base aislada.

## Cómo se registraría

Como cualquier otra evidencia del proyecto: comando exacto, hora, commit, entorno, respuesta original con su SHA-256,
desenlace y límites. Más dos cosas propias de este ensayo:

- **Qué se envió**: la geometría sintética literal, en el propio informe. No hay nada que redactar porque no es dato
  de nadie — y eso es justamente lo que lo hace apto para un primer ensayo.
- **Qué se apagó después**: el interruptor, con la hora.

Si el ensayo revela que el contrato vivo difiere del publicado, el resultado del ensayo es **corregir el adaptador y
la referencia fechada**, no «ajustar» la documentación para que encaje.
