# Integraciones y traducción del benchmark

S2 y S3 son fuentes funcionales aportadas, no una verificación nueva de las plataformas. Los nombres sirven como referencia del tipo de experiencia/capacidad deseada; no copiar marcas, código, datasets o propiedad intelectual.

## Benchmark → decisión de producto

| Referente en adjuntos | Capacidad buscada | Adaptación Terra Link | Historia |
| --- | --- | --- | --- |
| Farmforce/KOLTIVA/INATrace | First mile, registro y app de campo | Español, pequeños productores y offline persistente | P0-004/006/023/024 |
| Cacao EUDR/Sourcemap | Onboarding y validación de geodatos | Excel con preview/errores y GIS revisable | P0-009/010/026; P1-004 |
| BanQu/Afarinick | Custodia y transformación | Grafo + ledger sin blockchain inicial | P0-015/016/017 |
| Meridia | Riesgo explicable/evidencia/mitigación | Causa → tarea → soporte → verificación | P0-019/020/021 |
| ICE CoT/Space Intelligence | Evidencia y procedencia verificable | Snapshot de dataset/método/geometría | P0-028/022 |
| Satelligence | Monitoreo/coste colaborativo | Adapter y métricas de coste por análisis | P0-028; P1-010/011 |
| osapiens/Source Intelligence | Red de proveedores e integración ERP | Grants explícitos y conexión por contrato | P1-001/008 |
| GUIA/Agrocalidad | Identidad e intercambio nacional | Canal autorizado, mapeo y conciliación | P1-006 |
| Gaps del benchmark | Madurez, simulación, pasaporte, impacto económico | Medidas independientes de conclusión legal | P1-002/004/009/010/012/014 |

Precios, cifras de cobertura y rankings de adjuntos permanecen históricos. Actualizarlos con fuentes oficiales/cotización antes de una decisión de compra; no implementarlos como tarifa predeterminada.

## Contrato de adapter satelital

Entrada: tenant, versión/hash de geometría, periodo de análisis, operación y credencial referenciada. Salida: job/result con proveedor, dataset/version, fecha/resolución/método, cobertura, observaciones, limitaciones, resultado y referencia de bytes originales. No todas las APIs entregan la misma confianza; no inventarla.

Fallback: evidencia manual versionada y evaluación pendiente; simuladores solo en tests/desarrollo claramente marcados. Cambio de proveedor exige fixture contractual y comparabilidad documentada; no reclasificar jurídicamente por ausencia de alerta.

## Estado de integraciones

| Integración | Estado aquí | Condición de activación |
| --- | --- | --- |
| WHISP/GFW/otro satélite | POR_VERIFICAR (P0-028 implementó el **adapter, el trabajo y la defensa de salida**; el registro documenta los tres candidatos y **ninguno está seleccionado**, D-09) | API, términos, cobertura, coste, seguridad y credenciales comprobadas |
| GUIA/Agrocalidad | PROPUESTA | Acuerdo/canal oficial o formato autorizado; no asumir API disponible |
| EUDR-IS/TRACES | PROPUESTA | Documentación vigente, rol/representación, credenciales y prueba ACCEPTANCE |
| ERP | PROPUESTA | Contrato de evento, referencia, tenant y conciliación |
| Correo/SMS/WhatsApp | Fuera de habilitación automática | Proveedor/consentimiento/contexto real; no enviar por instalar Markdown |

## Seguridad de llamadas externas

Hosts/protocolos permitidos, validación de destinos y redirecciones, protección SSRF/DNS según infraestructura real, timeout, tamaño máximo y redacción de credenciales. No adjuntar clave a host no autorizado; no aceptar URL arbitraria como «documento» para descarga de servidor.

Clave satelital cifrada y referenciada por tenant; no en payload público, log o frontend. Rate limit/cupo/coste medidos; circuit breaker y retry con backoff. Webhook con firma/timestamp/deduplicación; referencia externa no sustituye autorización interna.

## Interoperabilidad gradual

Primero import/export explícitos; luego integración batch/API donde exista canal. Mapear identidad local/oficial con estado `MATCHED/UNMATCHED/CONFLICT`; coincidencia no habilita compartir datos. Guardar fuente, versión y último intercambio. Mostrar diferencias al steward para resolver; evitar sincronización que sobreescriba evidencia validada sin revisión.

## Compartir con comprador

Entregar vista de lote/embarque y paquete específico según grant. Debe mostrar fecha, versiones, límites y bloqueos. Pasaporte comercial no sustituye DDS ni convierte coordenadas/documentos personales en información pública.
