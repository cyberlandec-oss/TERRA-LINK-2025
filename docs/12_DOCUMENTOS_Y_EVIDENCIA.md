# Documentos y Evidence Center

FUENTE: S1 §§30–32, 55–59; S4 §§12–13. PROPUESTA: afirmaciones explícitas, revisión y trazabilidad de snapshots.

## Conceptos

Documento: archivo o registro con tipo, titular, emisor, fecha, vencimiento y versiones. Evidencia: información utilizada para respaldar o contradecir una afirmación. Un PDF subido no es automáticamente evidencia validada. Un checksum detecta cambios de bytes; no certifica autenticidad ni contenido jurídico.

| Afirmación | Soportes posibles | Limitación |
| --- | --- | --- |
| La parcela fue capturada en campo | GPS/muestras, técnico, fecha, fotos | Precisión y procedencia verificables |
| El lote tiene origen identificado | Entregas, recepción, grafo, versiones de parcelas | No completa un origen desconocido |
| Se realizó análisis ambiental | Resultado proveedor/dataset/fecha/geometría | No concluye legalidad por sí solo |
| Existe documentación de tenencia | Documento/emisor/periodo/revisión | Su aplicabilidad la define perfil validado |
| Una mitigación fue verificada | Acción, soporte, revisión y responsable | Aportar evidencia no es verificarla |

## Carga y revisión

1. Autorizar usuario/recurso y crear sesión de subida con límites de tamaño/tipo.
2. Recibir bytes en cuarentena privada; verificar tipo real y checksum, sin confiar solo en extensión.
3. Escanear y registrar resultado; fallo/indisponibilidad permanece pendiente, no «limpio».
4. Crear versión de documento y metadata; no reemplazar bytes anteriores.
5. Vincular a entidad autorizada y afirmación con relación `SUPPORTS/CONTRADICTS/BASED_ON`.
6. Aportar para revisión. Verificador autorizado acepta/rechaza con motivo y fecha.
7. Caducidad, nueva versión o revocación cambia vigencia y recalcula los expedientes afectados.

## Estados separados

| Dimensión | Estados propuestos |
| --- | --- |
| Subida | INITIATED, UPLOADING, COMPLETE, FAILED |
| Escaneo | PENDING, CLEAN, INFECTED, FAILED |
| Evidencia | DRAFT, SUBMITTED, VERIFIED, REJECTED, EXPIRED, REVOKED |

Solo una combinación autorizada habilita descarga o uso en un paquete. Una versión nueva no hereda aprobación de la anterior automáticamente.

## Evidence Center

Vista orientada a afirmación/requisito, con entidad vinculada, tipo, procedencia, vigencia, revisor, versión y pendientes. Filtros por productor, parcela, lote, categoría de riesgo, responsable y estado. Acción «ver causa» conduce a riesgo; «aportar soporte» a carga; «verificar» exige permiso separado.

Detalle muestra: qué pretende probar, qué archivos/datos utiliza, qué contradicciones hay, quién revisó y qué expedientes dependen de ella. No ocultar evidencia contraria para mejorar un score.

## Reutilización e impacto

Enlaces apuntan a versiones concretas. Una evidencia válida puede respaldar varias afirmaciones, pero la aplicabilidad temporal/espacial se verifica por enlace. Un documento de un productor no prueba automáticamente todos los lotes del tenant. Modificaciones invalidan readiness dependiente; paquetes históricos permanecen inmutables con aviso de revisión posterior.

## Acceso y retención

Objetos privados; URLs temporales, autorización antes de emitirlas y auditoría de descarga. Vistas del comprador/auditor aplican campo y recurso del grant. No servir documentos de identidad por pasaporte público. Retención y eliminación legalmente aplicable requieren política; evidencia de un expediente bajo retención no se borra por eliminar su vista actual.

## Aceptación

Archivo válido y malicioso; escaneo caído; tipo MIME engañoso; subida truncada; checksum distinto; versión nueva; documento vencido; enlace a entidad ajena; intento de aprobar soporte propio si política lo impide; revocación de acceso; paquete histórico intacto tras modificación. Ver QA-09–12.
