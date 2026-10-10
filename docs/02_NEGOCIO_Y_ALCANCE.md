# Negocio y alcance del producto

Origen: S2 §§14–31, S3 §§17–41 y S1 §§1–4, 98–102.

## Producto

Terra Link es la infraestructura que relaciona productor, parcela, producción, entrega, recepción, procesamiento, lote, movimiento, embarque y comprador. Cada relación puede respaldarse con evidencia, historial y una evaluación de riesgo. EUDR es el primer caso de uso de acceso a mercado.

Cliente pagador inicial: exportador, asociación/cooperativa, acopiador o procesador. Un comprador internacional también puede financiar la captura y verificación de su red. Usuario final y cliente pagador no son necesariamente la misma persona. El productor debe poder conocer y controlar la información compartida sobre su actividad.

## Valor y medida

| Valor comprado | Resultado del sistema | Indicador propuesto |
| --- | --- | --- |
| Visibilidad | Reconstruir origen y destino de un lote | % kg con origen identificado, denominador explícito |
| Control | Operaciones con responsables y saldo consistente | Inconsistencias de peso y doble consumo detectados |
| Evidencia | Reconstruir afirmaciones y sus soportes | Requisitos con evidencia válida / requisitos aplicables |
| Riesgo | Causa, acción, responsable y fecha | Pendientes vencidos y tiempo de resolución |
| Acceso a mercado | Paquete utilizable por el comprador | Tiempo para preparar un paquete y bloqueos restantes |

Estos KPIs no equivalen a porcentaje de cumplimiento jurídico.

## MVP operativo P0

- Identidad, organización, RBAC y aislamiento; gobernanza y auditoría transversal.
- Productores, parcelas GIS, productos, capturas y geolocalización.
- Entregas, recepción/calidad básica, procesamiento, lotes, inventario y movimientos.
- CTE/KDE, eventos y navegación de trazabilidad upstream/downstream.
- Documentos, evidencias vinculadas y verificación autorizada.
- Evaluación de riesgo explicable, mitigación y expediente de debida diligencia.
- Web por rol; captura móvil persistente offline y sincronización con conflictos visibles.
- Importación Excel, reportes/exportación y piloto con una organización.

La primera integración satelital se incorpora antes de exigir análisis automático en el piloto. La fase anterior debe poder gestionar evidencia aportada manualmente con su procedencia; no simular resultados satelitales reales.

## Evolución P1

Buyer Portal, QR/pasaporte con vistas por audiencia, My Work extendido, onboarding por madurez, perfil legal Ecuador validado, adaptador GUIA si hay canal autorizado, ERP/API, simulador de preparación de lote, costes de preparación, historial temporal y datos de precio/prima. Los detalles de priorización están en el backlog.

My Work, Lot Hub o navegación segura ya existentes deben reutilizarse si la auditoría los confirma. El Evidence Center debe aprovechar las entidades de documentos/evidencia presentes.

## Fuera del MVP

Blockchain/tokenización, marketplace, crédito, pagos ejecutados, carbono, IA decisora, predicción de producción, expansión multicommodity/multipaís y microservicios como arquitectura inicial. No bloquear la primera entrega por construir esas capacidades.

## Monetización como hipótesis

SaaS por organización y servicios de onboarding, limpieza y georreferenciación; consumo medible de parcelas/análisis/almacenamiento; enterprise con SSO e integraciones. Los precios del benchmark son hipótesis históricas, no tarifas aprobadas. Instrumentar costes y límites antes de automatizar facturación. Plan comercial, suscripción técnica y permisos de datos son conceptos diferentes.

## Piloto

Fuente: una asociación, 20–50 productores, 20–100 parcelas, un centro de acopio y 1–3 lotes. Se requiere el recorrido operativo sin intervención directa de desarrolladores. La validación de Android real se mantiene como gate separado de pruebas automáticas.
