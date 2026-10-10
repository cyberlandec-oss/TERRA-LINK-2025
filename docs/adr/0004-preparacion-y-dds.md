# ADR-0004 — Readiness, paquete y DDS

Estado: PROPUESTO · fecha 2026-10-09.

## Contexto

S1 pide paquete de evidencia, no declaración automática de cumplimiento. Benchmark cita TRACES/DDS. El producto necesita evitar que «listo», score bajo o archivo exportado se interpreten como presentación oficial.

## Decisión propuesta

Separar expediente, readiness interno, paquete snapshot y submission oficial. Snapshot versiona reglas/geometrías/evidencias/cantidades; cambio relevante invalida readiness actual y exige nueva revisión. Envío oficial solo por permiso/operador/canal real, con entorno y referencia auténtica. Timeout se reconcilia; nunca inventar aceptación. Tests en ACCEPTANCE, producción únicamente con autorización específica.

## Consecuencias

UI y modelos distinguen preparación y obligación legal. Un EUDR_MANAGER puede preparar sin tener permiso de presentar. Requiere mapear enums y estados existentes sin migración destructiva. Fuentes y datos de ejemplo no acreditan conformidad de cacao real.

## Validación

QA-12 con bloqueos, export, modificación posterior, snapshot histórico, permiso y timeout. Perfil jurídico/rol económico validado por responsable. Referencia oficial EU-IS en docs/13, a revalidar antes de activar integración.
