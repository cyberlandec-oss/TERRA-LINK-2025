# Roadmap por dependencias y piloto

El cronograma de S1 es orientativo. No se promete entrega en 12 semanas sin conocer repo, equipo, integraciones y datos. Si módulos ya están verificados, pasar directamente al gap pendiente.

| Fase | Historias | Gate de salida |
| --- | --- | --- |
| 0. Línea base | TECH-001 | Estado/stack/paths/comandos/ADR y contratos acreditados |
| 1. Acceso y datos | P0-001–005, 013–015, 025 | Login/tenant/roles, productor, eventos/auditoría; QA-01/02/03 |
| 2. Origen y campo | P0-006–010, 023–024 | GIS válido/versionado, offline/sync con Android real; QA-04/08 |
| 3. Cadena física | P0-011–012, 016–017 | Recepción/proceso/lote/saldo/grafo; QA-05/06/07 |
| 4. Evidencia | P0-018–019, 026–027 según entidades listas | Soportes privados/revisados y UX contextual; QA-09/14 |
| 5. Riesgo y análisis | P0-020–021, 028 | Evaluación reproducible, mitigación y proveedor con procedencia; QA-10/11/15 |
| 6. Diligencia/embarque | P0-022, 029–030 | Snapshot/preflight/reserva/despacho/reportes; QA-12/13 |
| 7. Piloto | P0-031 | Recorrido real, hallazgos y recuperación; QA-16/17 |
| 8. Diferenciación | P1 según evidencia de demanda | Portal/My Work/perfil Ecuador/interop/simulador/costes |

UI se construye con cada sección funcional completa, después de su contrato/dominio, no como una fase final aislada. Evidencia manual con procedencia puede existir antes de proveedor automático; no se llama satélite a un mock. Auditoría/seguridad son transversales desde fase 1.

## Guion del piloto

1. Configurar organización, centros, catálogo, usuarios y permisos.
2. Importar productores con errores reales controlados y resolver mapping/deduplicación.
3. Capturar parcelas/GPS/fotos en Android offline; recuperar tras cierre y sync.
4. Recibir dos entregas sintéticas de 500/300 kg y confirmar pesos.
5. Crear lote, consumir 800 en proceso, registrar 750 output + 50 merma.
6. Reconstruir origen/destino, investigar un caso incompleto y corregir con historia.
7. Aportar documentación, ejecutar análisis real autorizado o soporte manual identificado, evaluar riesgo, crear/verificar mitigación.
8. Preparar paquete; probar bloqueo por evidencia faltante y nueva revisión tras cambio.
9. Reservar/despachar 300, verificar saldo 450 y preflight.
10. Entregar reportes/vista autorizada, reconstruir auditoría y restaurar entorno aislado.

El dataset de prueba no demuestra cumplimiento de cacao real; el piloto operacional/regulatorio requiere sus propios datos, permisos y responsables. No enviar DDS a producción como parte de este guion.

## Go/no-go

Go a ampliación: recorrido sin SQL manual de desarrollador, errores recuperables, integridad/aislamiento probados, Android aceptado, responsables capacitados y hallazgos críticos cerrados. Conformidad jurídica y producción tienen gates propios. Hallazgo IDOR, pérdida de captura, doble consumo o evidencia presentada como válida sin soporte impide ampliación hasta corregirse.
