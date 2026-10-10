

lunes, 5 de octubre de 2026
19:59

DOCUMENTACIÓN TÉCNICA MAESTRA
Plataforma de Trazabilidad, Riesgo y Debida Diligencia para Cacao — Ecuador
Versión: 0.1
Estado: Inicio de desarrollo
Audiencia: CTO, Tech Lead, Backend, Frontend, Mobile, GIS/Data Engineer, QA, DevOps
Producto inicial: Cacao — Ecuador
Arquitectura: SaaS multi-organización + Web + Mobile Offline + GIS + Risk Engine + Evidence Management
	Instrucción para el equipo: este documento constituye la línea base técnica inicial. No se debe comenzar desarrollando pantallas aisladas. Primero deben implementarse dominio, modelo de datos, contratos API, gobernanza de datos, trazabilidad de eventos y arquitectura GIS; después se construyen las interfaces.

1. OBJETIVO DEL PROYECTO
Construir desde cero una plataforma que permita registrar, administrar, verificar y relacionar:
productores → parcelas → producción → entregas → acopio → procesamiento → lotes → movimientos → exportación → evidencia → evaluación de riesgos → debida diligencia.
La documentación proporcionada establece que la trazabilidad debe permitir seguir el producto desde origen hasta destino, incluyendo paso atrás, paso adelante y trazabilidad interna. También identifica como elementos fundamentales la identificación de lotes, registros, responsables, procedimientos, CTE y KDE. Guia-de-Trazabilidad_ok-17-09-2… Guia-de-Trazabilidad_ok-17-09-2…
El sistema debe, por tanto, tratar los datos y sus relaciones como el núcleo del producto, no como un complemento de la interfaz.

2. PRINCIPIO FUNDAMENTAL
No construiremos una colección de formularios.
Construiremos un:
Sistema de Evidencia de Cadena de Suministro
Cada dato importante debe poder responder:
	• ¿quién lo registró?
	• ¿cuándo?
	• ¿dónde?
	• ¿para qué proceso?
	• ¿de qué entidad proviene?
	• ¿qué otros datos lo respaldan?
	• ¿qué lote afecta?
	• ¿qué riesgo modifica?
	• ¿quién puede modificarlo?
	• ¿qué versión existía anteriormente?
La guía de trazabilidad insiste en que la gobernanza de datos debe asegurar que la información sea confiable, segura, organizada, actualizada y gestionada por personas responsables. Guia-de-Trazabilidad_ok-17-09-2…

3. ALCANCE DE LA PRIMERA VERSIÓN
Incluido
Core
	• multi-organización;
	• usuarios;
	• roles;
	• productores;
	• organizaciones;
	• proveedores;
	• parcelas;
	• GIS;
	• productos;
	• entregas;
	• recepción;
	• calidad;
	• inventario;
	• lotes;
	• movimientos;
	• procesamiento;
	• documentos;
	• evidencias;
	• auditoría;
	• riesgo;
	• debida diligencia;
	• reportes;
	• exportación de datos;
	• aplicación móvil offline.
GIS/Data
	• puntos;
	• polígonos;
	• GeoJSON;
	• validación geométrica;
	• cálculo de superficie;
	• historial de parcela;
	• capas externas;
	• análisis satelital mediante proveedores/integraciones.
EUDR
	• expediente de debida diligencia;
	• evaluación de riesgo;
	• evidencia de geolocalización;
	• evidencia de deforestación;
	• legalidad;
	• mezcla;
	• trazabilidad;
	• preparación de información para DDS.
La documentación de debida diligencia exige mapear la cadena hasta la parcela específica y mantener información precisa y detallada de productos y proveedores. GuiaPracticadeDebidaDiligenciap…

4. FUENTES FUNCIONALES DEL PRODUCTO
El equipo deberá considerar como documentos funcionales principales:
	1. Guía de implementación de trazabilidad para asociaciones de productores de café y cacao.
	2. Guía práctica de debida diligencia para organizaciones de pequeños productores de cacao en Ecuador.
	3. Guías para intermediarios y exportadores.
	4. Evaluación de riesgos EUDR en la cadena de cacao de Ecuador.
Estas fuentes establecen requisitos de:
	• trazabilidad;
	• gobernanza;
	• KDE;
	• procesos;
	• productores;
	• parcelas;
	• geolocalización;
	• riesgo;
	• deforestación;
	• legalidad;
	• mezcla;
	• mitigación;
	• verificación;
	• debida diligencia. GuiaPracticadeDebidaDiligenciap… Guia-de-Trazabilidad_ok-17-09-2…
Importante: donde la documentación no defina una especificación técnica concreta, el equipo debe registrar la decisión como ADR — Architecture Decision Record, en vez de convertir una suposición en requisito.

5. ARQUITECTURA GENERAL
Arquitectura inicial
Recomiendo:
Modular Monolith + servicios especializados externos
No comenzar con microservicios.
                    ┌────────────────────┐
                    │    WEB CLIENT      │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │   MOBILE CLIENT    │
                    └─────────┬──────────┘
                              │
                         HTTPS / API
                              │
                  ┌───────────▼───────────┐
                  │      API BACKEND      │
                  │   Modular Monolith    │
                  └───────────┬───────────┘
                              │
        ┌─────────────┬───────┼────────┬─────────────┐
        ▼             ▼       ▼        ▼             ▼
    Identity       Trace    GIS      Risk        Evidence
        │             │       │        │             │
        └─────────────┴───────┼────────┴─────────────┘
                              ▼
                       PostgreSQL
                         + PostGIS
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
            Object Storage              Queue
                 │                         │
                 ▼                         ▼
             Documents                Workers
                                           │
                         ┌─────────────────┼─────────────┐
                         ▼                 ▼             ▼
                     Satellite          Analytics      Notifications
                     providers

6. STACK TECNOLÓGICO PROPUESTO
Backend
TypeScript + NestJS
Motivos:
	• arquitectura modular;
	• tipado fuerte;
	• DTO;
	• validación;
	• testing;
	• OpenAPI;
	• facilidad para separar módulos posteriormente.
Frontend Web
React + Next.js + TypeScript
Mobile
React Native + Expo
con almacenamiento local para funcionamiento offline.
Database
PostgreSQL + PostGIS
Cache
Redis
Queue
BullMQ / Redis inicialmente.
Object Storage
S3-compatible.
GIS
PostGIS + MapLibre/Mapbox-compatible layer.
API
REST + OpenAPI.
Authentication
OIDC/OAuth2 compatible.
Infrastructure
Docker desde desarrollo.
Producción preparada para AWS/Azure/GCP.

7. REGLA DE ARQUITECTURA
El código debe estar separado por dominio de negocio, no por tipo de archivo.
No:
controllers/
models/
services/
como estructura global.
Sí:
modules/
    identity/
    organizations/
    producers/
    plots/
    products/
    traceability/
    inventory/
    lots/
    documents/
    evidence/
    risk/
    due-diligence/
    integrations/
    notifications/
    audit/
Cada módulo tendrá internamente:
domain/
application/
infrastructure/
presentation/

8. MULTI-TENANCY
La plataforma será multi-organización desde el primer día.
Todas las entidades operativas deberán poder determinar:
organization_id
Ejemplo:
Producer
 └── organization_id
Plot
 └── organization_id
Lot
 └── organization_id
Regla
Un usuario solamente podrá consultar/modificar datos pertenecientes a organizaciones autorizadas.
Nunca confiar únicamente en filtros del frontend.
La autorización debe verificarse en backend.

9. MODELO DE ROLES
Implementar inicialmente:
SUPER_ADMIN
ORG_ADMIN
MANAGER
FIELD_TECHNICIAN
RECEPTION_OPERATOR
QUALITY_OPERATOR
TRACEABILITY_MANAGER
EUDR_MANAGER
EXPORT_MANAGER
BUYER
AUDITOR
PRODUCER
La documentación de trazabilidad destaca que deben definirse funciones y responsabilidades para cada persona y relacionarlas con procesos. Guia-de-Trazabilidad_ok-17-09-2…
Por eso el RBAC deberá estar vinculado a:
Role
   ↓
Permissions
   ↓
Resources
   ↓
Actions
Ejemplo:
FIELD_TECHNICIAN
producer:create
producer:read
plot:create
plot:update
plot:read
delivery:create
Pero:
FIELD_TECHNICIAN
NO:
risk:approve
dds:submit
organization:delete

10. MODELO DE DATOS PRINCIPAL
Organizaciones
organizations
----------------
id UUID PK
name
legal_name
organization_type
tax_id
country
province
canton
parish
address
status
created_at
updated_at

11. Usuarios
users
----------------
id UUID PK
organization_id FK
first_name
last_name
email
phone
status
last_login_at
created_at
updated_at

12. Productores
producers
----------------
id UUID PK
organization_id FK
producer_code UNIQUE
first_name
last_name
document_type
document_number
phone
address
community
province
canton
parish
status
created_at
updated_at
Los códigos únicos de productor son importantes porque la guía de trazabilidad exige identificación del operador y un número único que permita establecer responsabilidad sobre la trazabilidad. Guia-de-Trazabilidad_ok-17-09-2…

13. Parcelas
plots
----------------
id UUID PK
organization_id FK
producer_id FK
plot_code
name
area_declared
area_calculated
geometry GEOMETRY
geometry_type
latitude
longitude
province
canton
parish
land_use
crop
variety
survey_method
surveyed_at
validation_status
created_at
updated_at
Índices
Obligatorios:
GIST(geometry)
INDEX(producer_id)
INDEX(organization_id)
INDEX(plot_code)

14. Reglas GIS
El sistema deberá distinguir entre:
Parcela < 4 ha
Registrar al menos punto geográfico.
Parcela > 4 ha
Registrar polígono suficiente para determinar perímetro.
Esto está expresamente indicado en la documentación proporcionada. Guia-Intermediarios-Final
El sistema debe validar, no simplemente guardar.

15. Validación de geometría
Al guardar una parcela:
1. Geometry exists?
2. Valid geometry?
3. Correct coordinate reference system?
4. Coordinates valid?
5. Area calculated?
6. Area consistent with declared?
7. Required geometry type?
8. Duplicate/overlap check?
9. Country boundary?
10. Save validation result.
Resultado:
VALID
WARNING
INVALID
REVIEW_REQUIRED

16. GeoJSON
La plataforma debe tener exportador:
GET /plots/{id}/geojson
y:
GET /plots/export/geojson
La guía de trazabilidad señala GeoJSON como formato interoperable requerido para EUDR. Guia-de-Trazabilidad_ok-17-09-2…

17. PRODUCTOS
La trazabilidad requiere identificar claramente el producto y su variedad. Guia-de-Trazabilidad_ok-17-09-2…
Modelo:
products
----------------
id
organization_id
code
name
scientific_name
variety
product_type
unit
status
Ejemplos:
CACAO_BABA
CACAO_FERMENTADO
CACAO_SECO
CACAO_CLASIFICADO

18. KDE — KEY DATA ELEMENTS
Este concepto debe ser una entidad explícita.
kde_definitions
----------------
id
code
name
description
entity_type
required
validation_rule
responsible_role
stage
Ejemplo:
DELIVERY_WEIGHT
DELIVERY_DATE
SUPPLIER
LOT_CODE
MOISTURE
PLOT_ID
La guía recomienda identificar KDE y determinar qué datos se necesitan, en qué etapa, momento y quién es responsable de registrarlos. Guia-de-Trazabilidad_ok-17-09-2… Guia-de-Trazabilidad_ok-17-09-2…

19. CTE — CRITICAL TRACEABILITY EVENTS
También deben ser explícitos.
cte_definitions
----------------
id
code
name
description
stage
required
Inicialmente:
HARVEST
DELIVERY
RECEPTION
WEIGHING
FERMENTATION
DRYING
STORAGE
PACKAGING
SALE
SHIPMENT
La documentación identifica procesos como recepción, pesado/clasificado, fermentación, secado, acondicionamiento y envasado como etapas de trazabilidad interna. Guia-de-Trazabilidad_ok-17-09-2…

20. ENTREGAS
deliveries
----------------
id
organization_id
producer_id
plot_id
product_id
delivery_code
delivery_date
quantity
unit
quality_status
moisture
receiver_id
location
notes
created_at
Cada entrega debe generar un evento de trazabilidad.

21. EVENT STORE
Crear:
traceability_events
----------------
id UUID
organization_id
event_type
entity_type
entity_id
actor_id
event_time
location
quantity
unit
payload JSONB
created_at
Ejemplo:
{
  "event_type": "DELIVERY_RECEIVED",
  "entity_type": "DELIVERY",
  "entity_id": "...",
  "quantity": 250,
  "unit": "KG"
}

22. REGLA IMPORTANTE
No sobrescribir eventos históricos.
Si se comete un error:
Evento original
       ↓
Correction event
       ↓
New state
No:
UPDATE histórico
Esto permite reconstruir el historial.

23. LOTES
lots
----------------
id
organization_id
lot_code
product_id
status
initial_quantity
current_quantity
unit
created_at

24. RELACIÓN LOTE-ORIGEN
Un lote puede provenir de:
	• una entrega;
	• varias entregas;
	• procesamiento;
	• otro lote.
Por tanto:
lot_inputs
----------------
lot_id
source_type
source_id
quantity
y:
lot_outputs
----------------
lot_id
destination_type
destination_id
quantity
Esto permite construir un grafo de trazabilidad.

25. BALANCE DE MASA
Implementar desde el MVP.
Regla:
available =
inputs
-
outputs
-
losses
Nunca permitir:
available < 0
salvo que un administrador cree una excepción justificada.

26. EJEMPLO
Delivery A      500 kg
Delivery B      300 kg
                -------
Input           800 kg
Processing loss  50 kg
Output          750 kg
El sistema deberá conservar:
800 kg
    ↓
process event
    ↓
50 kg loss
    ↓
750 kg

27. TRAZABILIDAD HACIA ATRÁS
Desde:
Shipment
el usuario debe poder llegar a:
Lot
 ↓
Processing
 ↓
Inputs
 ↓
Deliveries
 ↓
Plots
 ↓
Producers

28. TRAZABILIDAD HACIA ADELANTE
Desde:
Producer
debe poder llegar a:
Plot
 ↓
Delivery
 ↓
Lot
 ↓
Shipment
 ↓
Buyer

29. TRAZABILIDAD INTERNA
Debe reconstruir:
RECEPTION
 ↓
WEIGHING
 ↓
CLASSIFICATION
 ↓
FERMENTATION
 ↓
DRYING
 ↓
STORAGE
 ↓
PACKAGING
 ↓
SHIPMENT
La guía identifica precisamente esta trazabilidad interna como seguimiento de lo que sucede dentro de la asociación. Guia-de-Trazabilidad_ok-17-09-2…

30. DOCUMENT MANAGEMENT
Crear:
documents
----------------
id
organization_id
document_type
owner_type
owner_id
file_key
file_name
mime_type
size
checksum
issued_at
expires_at
status
uploaded_by
created_at
Los archivos reales van a object storage.
La base de datos guarda metadatos.

31. EVIDENCE
Separar documento de evidencia.
evidence
----------------
id
organization_id
evidence_type
source_type
source_id
description
valid_from
valid_to
confidence
status
created_at
Ejemplo:
Evidence
   ↓
Plot
   ↓
Satellite Analysis
Otro:
Evidence
   ↓
Producer
   ↓
Land Document

32. EVIDENCE GRAPH
Esta será una pieza estratégica.
Crear relaciones:
evidence_links
----------------
evidence_id
entity_type
entity_id
relationship_type
Ejemplo:
SatelliteEvidence
   └── SUPPORTS → Plot
LandDocument
   └── SUPPORTS → Producer
RiskAssessment
   └── BASED_ON → Evidence

33. RISK ENGINE
El motor de riesgo no debe ser un simple campo:
risk = 72
Debe guardar:
risk_assessments
risk_factors
risk_evidence
risk_actions
risk_reviews

34. CATEGORÍAS DE RIESGO
Basado en la documentación:
DEFORESTATION
LEGALITY
MIXING
SUPPLY_CHAIN
DOCUMENT_CREDIBILITY
TRACEABILITY
EVASION
HUMAN_RIGHTS
INDIGENOUS_RIGHTS
DATA_QUALITY
La documentación de debida diligencia incluye factores como presencia de bosques, tasa de deforestación/degradación, grupos indígenas, credibilidad documental, complejidad de cadena y riesgo de elusión. Guia-Intermediarios-Final

35. ESTADOS DE RIESGO
Utilizar inicialmente:
NOT_ASSESSED
LOW
MEDIUM
HIGH
CRITICAL
MITIGATION_REQUIRED
UNDER_REVIEW
RESOLVED
La evaluación de riesgo proporcionada distingue expresamente entre riesgo insignificante y riesgo no despreciable, con justificación y medidas cuando corresponde. EvaluacionRiesgosEUDRenlaCadena…
Por ello, no debemos convertir automáticamente:
LOW = insignificante legalmente
Eso requiere reglas jurídicas configurables.

36. RISK FACTOR
Modelo:
risk_factors
----------------
id
assessment_id
category
code
value
weight
score
severity
evidence_required
explanation
Ejemplo:
category:
DEFORESTATION
factor:
FOREST_CHANGE_AFTER_BASELINE
score:
85

37. RIESGO EXPLICABLE
El sistema debe responder:
¿Por qué tiene riesgo alto?
Ejemplo:
RIESGO: ALTO
Factores:
+25 geometría incompleta
+30 alerta de cobertura
+15 evidencia legal insuficiente
+10 cadena compleja
Score: 80
No queremos un algoritmo opaco.

38. MITIGACIÓN
mitigation_actions
----------------
id
risk_assessment_id
action_type
description
responsible_user_id
due_date
status
completed_at
evidence_id
Acciones posibles según la documentación:
	• solicitar información;
	• solicitar documentos;
	• verificación adicional;
	• encuesta;
	• auditoría;
	• apoyo al productor;
	• fortalecimiento de capacidades;
	• certificación orientada al riesgo.
Estas medidas aparecen expresamente en la documentación de debida diligencia. Guia-Intermediarios-Final

39. RIESGO DE DEFORESTACIÓN
El motor deberá soportar:
National / regional risk
        ↓
Plot-level analysis
        ↓
Satellite / land-cover evidence
        ↓
Risk assessment
La guía establece que cuando existe riesgo regional se requiere análisis geoespacial a escala de parcela mediante superposición de la geolocalización con imágenes satelitales o mapas de cobertura/uso de suelo. GuiaPracticadeDebidaDiligenciap…

40. CAPA SATELITAL
No acoplar el core a un único proveedor.
Crear interfaz:
interface SatelliteProvider {
  getForestCover(plot: Plot): Promise<ForestCoverResult>;
  getDeforestationAlerts(plot: Plot): Promise<Alert[]>;
  getHistoricalAnalysis(plot: Plot): Promise<HistoricalAnalysis>;
}
Implementaciones:
WHISPProvider
GFWProvider
EUObservatoryProvider
CustomProvider
La documentación identifica WHISP, EU Observatory y Global Forest Watch como fuentes posibles. GuiaPracticadeDebidaDiligenciap…

41. IMPORTANTE SOBRE SATÉLITE
El resultado de un proveedor externo no debe convertirse automáticamente en verdad legal.
Guardar:
source
dataset
version
analysis_date
resolution
method
result
confidence
Esto permite reconstruir por qué se obtuvo una conclusión.

42. LEGALIDAD
No codificar todas las leyes ecuatorianas directamente dentro del backend.
Crear:
legal_requirements
legal_documents
legal_assessments
para que las reglas puedan evolucionar.
Ejemplo:
LEGAL_REQUIREMENT
    ↓
DOCUMENT TYPE
    ↓
VALIDATION RULE
    ↓
RISK FACTOR

43. DEBIDA DILIGENCIA
Crear:
due_diligence_cases
----------------
id
organization_id
reference
operator
status
started_at
completed_at
reviewed_by
Estados:
DRAFT
DATA_COLLECTION
RISK_ASSESSMENT
MITIGATION
VERIFICATION
READY
EXPORTED
CLOSED
REOPENED
La guía estructura el SDD en cinco pasos: política/sistema, identificación y evaluación, estrategia de riesgo, verificación y reporte. GuiaPracticadeDebidaDiligenciap…

44. DDS PACKAGE
No implementar inicialmente una “declaración automática de cumplimiento”.
Implementar:
DueDiligenceEvidencePackage
Debe contener:
operator
product
quantity
country
plots
production_period
suppliers
chain_actors
deforestation_evidence
legality_evidence
risk_assessment
mitigation
verification
audit_trail
La documentación enumera como información requerida, entre otros elementos, nombre, cantidad, país de producción, geolocalización de parcelas, periodo de producción, proveedor, comprador, información de libre deforestación y aspectos legales. Guia-Intermediarios-Final

45. MOBILE OFFLINE
Esto es obligatorio para nuestro contexto de campo.
La aplicación debe poder:
LOGIN
↓
DOWNLOAD ASSIGNED DATA
↓
GO OFFLINE
↓
CAPTURE
↓
VALIDATE LOCALLY
↓
STORE LOCAL
↓
SYNC
↓
SERVER VALIDATION

46. BASE LOCAL MOBILE
Usar SQLite.
Tablas locales:
sync_queue
producers
plots
deliveries
products
draft_events
documents_metadata

47. SYNC ENGINE
Cada operación offline tendrá:
local_id
operation_id
entity_id
operation_type
payload
created_at
sync_status
retry_count
error
Estados:
PENDING
UPLOADING
SYNCED
FAILED
CONFLICT

48. CONFLICTOS
Nunca resolver silenciosamente.
Ejemplo:
Mobile:
Plot area = 3.2 ha
Server:
Plot area = 3.5 ha
Resultado:
CONFLICT_REQUIRES_REVIEW

49. QR
Agregar QR desde la primera arquitectura aunque no sea obligatorio en el MVP.
Entidades:
Producer
Plot
Delivery
Lot
Package
Shipment
Cada una podrá tener:
public_reference
Nunca exponer directamente IDs internos.

50. API
Versionar desde el inicio:
/api/v1
Ejemplos:
POST /api/v1/producers
GET /api/v1/producers/:id
POST /api/v1/plots
GET /api/v1/plots/:id
POST /api/v1/deliveries
POST /api/v1/lots
GET /api/v1/lots/:id/traceability
POST /api/v1/risk-assessments
POST /api/v1/due-diligence-cases

51. API DE TRAZABILIDAD
Endpoint crítico:
GET /api/v1/traceability/:entityType/:entityId
Respuesta conceptual:
{
  "entity": {},
  "upstream": [],
  "internal": [],
  "downstream": [],
  "evidence": [],
  "risks": []
}

52. API GIS
GET /api/v1/plots/{id}/geometry
GET /api/v1/plots/{id}/geojson
GET /api/v1/plots/{id}/satellite
GET /api/v1/plots/{id}/risk
POST /api/v1/plots/{id}/geometry/validate

53. API DE RIESGO
POST /risk/assessments
GET /risk/assessments/{id}
POST /risk/assessments/{id}/recalculate
GET /risk/assessments/{id}/explanation
POST /risk/assessments/{id}/mitigations

54. EVENTOS ASÍNCRONOS
Usaremos workers para:
SATELLITE_ANALYSIS_REQUESTED
DOCUMENT_PROCESSING_REQUESTED
RISK_RECALCULATION_REQUESTED
GEOJSON_EXPORT_REQUESTED
DDS_PACKAGE_GENERATION_REQUESTED
NOTIFICATION_REQUESTED
No bloquear una petición HTTP durante un análisis satelital.

55. DOCUMENT PROCESSING
Pipeline:
Upload
 ↓
Virus Scan
 ↓
Metadata Extraction
 ↓
Checksum
 ↓
Object Storage
 ↓
Document Classification
 ↓
Evidence Link
 ↓
Validation
Posteriormente:
OCR/IA, pero no en la primera versión como dependencia crítica.

56. AUDITORÍA
Tabla:
audit_logs
----------------
id
organization_id
actor_id
action
entity_type
entity_id
before JSONB
after JSONB
ip
user_agent
timestamp
Debe registrar:
	• creación;
	• modificación;
	• eliminación lógica;
	• aprobación;
	• rechazo;
	• exportación;
	• descarga;
	• cambios de permisos;
	• cambios de riesgo.

57. ELIMINACIÓN
No borrar entidades críticas físicamente.
Usar:
deleted_at
deleted_by
deletion_reason
excepto cuando exista una política de retención que obligue a otra cosa.

58. DATA GOVERNANCE
Implementar desde MVP:
Data Owner
quién responde por el dato.
Data Steward
quién mantiene calidad.
Data Collector
quién captura.
Data Consumer
quién utiliza.
Esto deriva directamente de la necesidad de gobernanza, roles, responsabilidades, reglas de captura/validación/compartición/protección y controles de calidad señalada en la guía. Guia-de-Trazabilidad_ok-17-09-2…

59. DATA QUALITY ENGINE
Cada registro podrá tener:
completeness
validity
consistency
uniqueness
timeliness
confidence
Ejemplo:
Producer:
Completeness 96%
Validity      98%
Consistency   91%

60. DASHBOARD TÉCNICO
No empezar por un dashboard bonito.
Primero construir los indicadores desde queries reales.
KPIs
producers_total
plots_total
plots_valid
deliveries_total
lots_active
traceability_completeness
risk_high
risk_medium
risk_low
evidence_completeness
due_diligence_ready

61. IMPORTACIÓN DE EXCEL
Esto es P0.
La documentación reconoce que muchas organizaciones parten de registros manuales o Excel y propone una migración progresiva hacia sistemas digitales especializados. Guia-de-Trazabilidad_ok-17-09-2…
Por tanto:
Excel
 ↓
Upload
 ↓
Column mapping
 ↓
Preview
 ↓
Validation
 ↓
Error report
 ↓
Import

62. PLANTILLAS DE IMPORTACIÓN
Crear:
producers.xlsx
plots.xlsx
deliveries.xlsx
products.xlsx
lots.xlsx
Con una plantilla descargable desde la plataforma.

63. MIGRACIÓN DE DATOS
Debe soportar:
UNKNOWN
MISSING
NOT_VALIDATED
LEGACY
VERIFIED
No inventar datos faltantes.

64. FRONTEND
La interfaz Web tendrá:
Dashboard
Organizations
Producers
Plots
Map
Deliveries
Inventory
Lots
Traceability
Documents
Risk
Due Diligence
Reports
Settings

65. MAPA PRINCIPAL
Debe permitir:
zoom
search
filter
select plot
show producer
show risk
show satellite status
show validation
show alerts
Colores no deben codificarse solamente en frontend.
El backend entrega:
risk_status
validation_status

66. PANTALLA PRODUCTOR
Debe mostrar:
Identity
Plots
Production
Deliveries
Documents
Risk
Traceability
History

67. PANTALLA PARCELA
Debe mostrar:
Mapa
Geometry
Area
Producer
Crop
History
Satellite
Deforestation
Legal evidence
Risk
Documents
Traceability
Audit

68. PANTALLA LOTE
Debe ser una de las pantallas más importantes.
LOT-2026-00023
Product
Quantity
Status
Origin
  37 producers
  42 plots
Inputs
Processing
Outputs
Risk
Evidence
Traceability graph
DDS readiness

69. GRAFO DE TRAZABILIDAD
Implementar inicialmente como árbol/graph visual.
LOT
│
├── DELIVERY 001
│   └── PLOT 001
│       └── PRODUCER 001
│
├── DELIVERY 002
│   └── PLOT 002
│       └── PRODUCER 002
│
└── PROCESSING

70. TESTING
Cada módulo debe tener:
Unit tests
Reglas de dominio.
Integration tests
DB/API.
E2E
Flujos completos.
GIS tests
Geometrías válidas/inválidas.
Offline tests
Sin conectividad.
Security tests
RBAC/tenant isolation.

71. TEST CRÍTICO
Crear desde el comienzo un test:
	Un usuario de organización A nunca puede recuperar información de organización B.
Debe existir como test automatizado.

72. TEST CRÍTICO GIS
Casos:
<4ha + point = valid
>4ha + polygon = valid
>4ha + point = review/error
invalid polygon = error
wrong CRS = error
duplicate plot = warning
Las reglas de punto/polígono se derivan directamente de la documentación proporcionada. Guia-Intermediarios-Final

73. TEST CRÍTICO DE TRAZABILIDAD
Caso:
Producer A
 ↓
Plot A
 ↓
Delivery A 500kg
 ↓
Lot A
 ↓
Shipment A 300kg
Debe ser posible consultar:
Shipment A → Producer A
y:
Producer A → Shipment A

74. TEST CRÍTICO DE BALANCE
Input = 1000
Output = 900
Loss = 100
PASS
pero:
Input = 1000
Output = 1100
FAIL

75. CI/CD
Pipeline:
Pull Request
 ↓
Lint
 ↓
Typecheck
 ↓
Unit tests
 ↓
Integration tests
 ↓
Security scan
 ↓
Build
 ↓
Deploy staging
 ↓
E2E
 ↓
Production

76. ENTORNOS
Mínimo:
development
staging
production
Nunca usar base de producción para desarrollo.

77. OBSERVABILIDAD
Implementar:
	• structured logs;
	• metrics;
	• tracing;
	• error monitoring;
	• health checks.
Endpoints:
/health
/ready
/version

78. BACKUPS
Base de datos:
	• backups automáticos;
	• point-in-time recovery;
	• pruebas periódicas de restauración.
Object storage:
	• versionado;
	• lifecycle;
	• redundancia.

79. SEGURIDAD
Mínimos:
TLS
JWT/OIDC
RBAC
tenant isolation
rate limiting
input validation
SQL injection protection
XSS protection
CSRF protection
file scanning
audit logging
secret management

80. PRIVACIDAD
El sistema manejará información de productores.
Por tanto:
No mostrar públicamente
	• documentos de identidad;
	• teléfonos;
	• documentos legales;
	• coordenadas exactas sin autorización.
El buyer portal debe usar permisos y vistas de datos.

81. API PÚBLICA
No exponer directamente:
/database IDs
Crear:
public_reference
Ejemplo:
PLT-EC-00000452
LOT-EC-2026-00451

82. CONFIGURACIÓN
No hardcodear:
4 hectares
6 decimals
risk weights
document expiration
product types
Crear configuración versionada.
Especialmente las reglas relacionadas con EUDR.

83. RULE ENGINE
Crear una abstracción:
Rule
 ├── condition
 ├── severity
 ├── explanation
 ├── evidence_required
 └── action
Ejemplo conceptual:
IF
plot.area > threshold
AND geometry.type != polygon
THEN
validation = REVIEW_REQUIRED

84. VERSIONAMIENTO DE REGLAS
Toda evaluación debe guardar:
rule_set_version
Ejemplo:
EUDR-ECUADOR-2026.1
Esto es fundamental porque una reevaluación futura podría utilizar reglas diferentes.

85. NO USAR IA PARA DECISIONES FINALES
La IA podrá ayudar a:
	• clasificar documentos;
	• detectar inconsistencias;
	• resumir evidencia;
	• sugerir acciones.
Pero:
no debe decidir automáticamente que una cadena cumple legalmente.
La documentación señala expresamente que la entidad legalmente obligada mantiene la responsabilidad sobre el cumplimiento. GuiaPracticadeDebidaDiligenciap…

86. ROADMAP DE DESARROLLO
Sprint 0 — Arquitectura
Duración objetivo: 1 semana
Entregables:
	• repositorio;
	• arquitectura;
	• ADR;
	• CI/CD;
	• environments;
	• Docker;
	• PostgreSQL/PostGIS;
	• authentication skeleton;
	• API skeleton;
	• frontend skeleton;
	• mobile skeleton.

87. Sprint 1 — Identity
Construir:
Organization
User
Role
Permission
Tenant isolation
Authentication
Definition of Done
Un usuario puede:
login
↓
ver organización
↓
ver sus permisos
↓
no acceder a otra organización

88. Sprint 2 — Productores
Construir:
Producer CRUD
Producer code
Producer search
Producer filters
Producer history
Además:
Excel import

89. Sprint 3 — GIS
Construir:
Plot CRUD
Point
Polygon
GeoJSON
Area calculation
Geometry validation
Map

90. Sprint 4 — Mobile
Construir:
Login
Offline session
Producer capture
Plot capture
GPS
Photo/document capture
Sync queue

91. Sprint 5 — Trazabilidad
Construir:
Product
Delivery
Reception
Quality
CTE
KDE
Traceability events

92. Sprint 6 — Lotes
Construir:
Lot
Inputs
Outputs
Processing
Inventory
Mass balance
Traceability graph

93. Sprint 7 — Evidence
Construir:
Document upload
Object storage
Evidence
Evidence links
Audit trail

94. Sprint 8 — Risk
Construir:
Risk assessment
Risk factors
Risk score
Explanation
Mitigation actions
Risk history

95. Sprint 9 — Satellite
Integrar primer proveedor.
Arquitectura preparada para varios.
Plot
 ↓
Analysis Job
 ↓
Provider
 ↓
Result
 ↓
Evidence
 ↓
Risk

96. Sprint 10 — Due Diligence
Construir:
DD case
Data completeness
Risk assessment
Mitigation
Verification
Evidence package
Readiness

97. Sprint 11 — Reporting
Producer report
Plot report
Lot report
Risk report
Traceability report
DD report
GeoJSON export

98. Sprint 12 — Pilot
No lanzar a cientos de organizaciones.
Primero:
1 asociación
20–50 productores
20–100 parcelas
1 centro de acopio
1–3 lotes
La propia guía recomienda implementar mediante pilotos, capacitar a los responsables, revisar formularios y hacer ajustes antes de consolidar el sistema. Guia-de-Trazabilidad_ok-17-09-2…

99. CRITERIO DE ÉXITO DEL PILOTO
Debe poder ejecutarse:
Producer
 ↓
Plot
 ↓
Delivery
 ↓
Lot
 ↓
Risk
 ↓
Evidence
 ↓
DD Package
sin intervención manual de los desarrolladores.

100. BACKLOG P0
ID	Epic	Funcionalidad	Prioridad
P0-001	Identity	Organización	P0
P0-002	Identity	Usuarios	P0
P0-003	Identity	RBAC	P0
P0-004	Producers	Productor	P0
P0-005	Producers	Código único	P0
P0-006	GIS	Parcela	P0
P0-007	GIS	Punto GPS	P0
P0-008	GIS	Polígono	P0
P0-009	GIS	GeoJSON	P0
P0-010	GIS	Validación geométrica	P0
P0-011	Traceability	Producto	P0
P0-012	Traceability	Entrega	P0
P0-013	Traceability	CTE	P0
P0-014	Traceability	KDE	P0
P0-015	Traceability	Eventos	P0
P0-016	Lots	Lotes	P0
P0-017	Lots	Balance de masa	P0
P0-018	Evidence	Documentos	P0
P0-019	Evidence	Evidence graph	P0
P0-020	Risk	Risk engine	P0
P0-021	Risk	Mitigación	P0
P0-022	DD	Due diligence	P0
P0-023	Mobile	Offline	P0
P0-024	Mobile	Sync	P0
P0-025	Audit	Audit trail	P0
P0-026	Import	Excel import	P0

101. P1
Después:
Satellite advanced
Buyer portal
QR
Advanced analytics
API integrations
Automated document extraction
Advanced alerts
Benchmarking
Supplier scoring

102. P2
Posteriormente:
Marketplace
AI assistant
Predictive yield
Carbon
Payments
Blockchain
Other commodities
Other countries

103. LO QUE EL EQUIPO NO DEBE HACER
❌ No construir blockchain primero.
❌ No construir IA primero.
❌ No comenzar por dashboards.
❌ No hacer microservicios prematuramente.
❌ No acoplar el sistema a un proveedor satelital.
❌ No guardar geometrías solamente como texto.
❌ No permitir modificar silenciosamente históricos.
❌ No hardcodear reglas legales.
❌ No mezclar datos de organizaciones.
❌ No asumir que una certificación equivale a cumplimiento EUDR.
La documentación indica expresamente que las certificaciones pueden apoyar determinados aspectos, pero no sustituyen los lineamientos del EUDR. Guia-Intermediarios-Final

104. PRIMER ENTREGABLE REAL DEL EQUIPO
Antes de desarrollar funcionalidades, el equipo debe producir estos 10 artefactos:
01. System Architecture Diagram
02. Domain Model
03. ERD PostgreSQL/PostGIS
04. OpenAPI Specification
05. RBAC Matrix
06. Event Model
07. KDE/CTE Catalogue
08. Risk Rule Catalogue
09. Data Dictionary
10. ADR Repository

105. ORDEN EXACTO DE TRABAJO
Día 1–2
Crear repositorios:
platform-web
platform-api
platform-mobile
platform-infrastructure
platform-docs

Día 3
Crear:
Docker Compose
PostgreSQL
PostGIS
Redis
Object Storage

Día 4
Configurar:
CI
CD
Lint
Tests
TypeScript
Environment config
Secrets

Día 5
Crear:
NestJS modules
React application
React Native application
OpenAPI

106. SEMANA 2
Construir primero:
Organization
User
Role
Permission
Producer
Plot
No dashboard.

107. SEMANA 3
Construir:
GIS
GeoJSON
GPS
Geometry validation
Map

108. SEMANA 4
Construir:
Product
Delivery
CTE
KDE
Traceability Event

109. SEMANA 5–6
Construir:
Lots
Inventory
Processing
Mass balance
Traceability graph

110. SEMANA 7
Construir:
Documents
Evidence
Audit

111. SEMANA 8–9
Construir:
Risk Engine
Risk Rules
Risk Explanation
Mitigation

112. SEMANA 10
Construir:
Due Diligence
Evidence Package
Readiness

113. SEMANA 11
Integrar:
Satellite

114. SEMANA 12
Pilot.

115. DEFINITION OF DONE GLOBAL
Una funcionalidad solamente se considera terminada cuando:
✓ Backend
✓ API
✓ Database
✓ Authorization
✓ Validation
✓ Audit
✓ Tests
✓ Error handling
✓ Documentation
✓ Frontend
✓ Mobile si aplica
✓ Offline si aplica
✓ Observability
están implementados.

116. PRINCIPIO DE CALIDAD
La plataforma debe poder contestar esta pregunta:
	“Muéstrame exactamente de dónde salió este kilogramo de cacao y qué evidencia tengo para demostrar su origen, trazabilidad, riesgo y debida diligencia.”
El sistema debe responder:
1 kg
 ↓
Lot
 ↓
Processing event
 ↓
Delivery
 ↓
Producer
 ↓
Plot
 ↓
Geometry
 ↓
Satellite evidence
 ↓
Legal evidence
 ↓
Risk assessment
 ↓
Mitigation
 ↓
Verification
 ↓
Due diligence package
Si podemos hacer esto de forma confiable, tenemos el núcleo del producto.

117. DECISIÓN ARQUITECTÓNICA FINAL
La primera versión queda definida como:
┌───────────────────────────────────────────────┐
│                 PLATFORM                      │
├───────────────────────────────────────────────┤
│ Identity / Organizations                      │
│ Producers                                     │
│ GIS / Plots                                   │
│ Mobile Offline                                │
│ Traceability                                  │
│ CTE / KDE                                     │
│ Lots / Inventory / Mass Balance               │
│ Documents / Evidence                          │
│ Risk Engine                                   │
│ Satellite Integration                         │
│ Due Diligence                                 │
│ Audit / Governance                            │
│ Reporting                                     │
└───────────────────────────────────────────────┘
                      │
                      ▼
            PostgreSQL + PostGIS
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Storage      Redis       Workers
          │                       │
          └───────────┬───────────┘
                      ▼
               External Data

118. INSTRUCCIÓN PARA EL EQUIPO DE DESARROLLO
A partir de este documento, el proyecto entra formalmente en fase de ingeniería.
La primera tarea no es programar el dashboard.
Es crear:
TECH-001 — Architecture & Domain Foundation
y completar, en este orden:
	1. Repositorio y CI/CD
	2. Arquitectura modular
	3. ERD PostgreSQL/PostGIS
	4. Data Dictionary
	5. RBAC
	6. KDE/CTE Catalogue
	7. Event model
	8. OpenAPI v1
	9. Risk Rule Framework
	10. ADR iniciales
	11. Environment setup
	12. Sprint 1: Identity + Organizations + Producers
La documentación fuente indica que una trazabilidad sólida empieza por organizar procesos, definir responsabilidades, identificar productos y datos clave y establecer formularios/procedimientos antes de consolidar el sistema; nuestra implementación digital debe reflejar ese mismo orden. Guia-de-Trazabilidad_ok-17-09-2… Guia-de-Trazabilidad_ok-17-09-2…
Esta especificación será la base técnica v0.1. La siguiente versión debería convertirse ya en los artefactos de ingeniería propiamente dichos: ERD completo tabla por tabla, diccionario de datos campo por campo, endpoints OpenAPI, estructura exacta del repositorio, contratos JSON, matriz RBAC, reglas del Risk Engine y backlog Jira con historias de usuario y criterios de aceptación.

Desde <https://chatgpt.com/c/6a8619b7-a8ec-83e9-8e9e-fb5907aef498> 

