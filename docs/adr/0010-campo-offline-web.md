# ADR-0010 — Campo offline exclusivamente web

Estado: ACEPTADA e implementada; recorrido PRODUCER de parcelas/evidencias **DONE_LOCAL** sobre `742b0da`, validación integral y despliegue locales aprobados. Fecha: 2026-11-25. [Evidencia y límites](../qa/CAMPO_PWA_2026-11-25.md).

## Autoridad y alcance

El propietario sustituye el cierre Android nativo y teléfono físico por un recorrido PWA web completo con PRODUCER. Se mantienen los antecedentes de ADR-0006, sin aplicarlos como gate a esta entrega. El importador multiformato permanece conectado y separado. No se afirma que todo el backoffice web funcione offline.

## Decisión

- Ruta autónoma `/campo-offline`, instalable bajo HTTPS o localhost, con shell público descargado por service worker de alcance limitado. Sin cachear APIs, tokens, respuestas de usuarios ni capturas en CacheStorage.
- Dataset mínimo propio, borradores, cola, evidencias e imágenes en IndexedDB cifrada con AES-GCM. Desbloqueo local por PIN, clave derivada con PBKDF2 y sal aleatoria; no persistir JWT en el almacén de campo.
- Autorización online previa, firmada por servidor, vinculada a usuario, organización, dispositivo y productor. Propuesta implementable de jornada: 24 horas; no equivale a una sesión HTTP ni autoriza sincronización. El JWT online conserva su vigencia anterior. Reloj atrasado y autorización caducada bloquean nuevas escrituras, nunca borran borradores.
- Sincronización con JWT vigente y permisos/organización/productor/dispositivo revalidados; operación estable por captura, resultado persistente y rechazo de un ID reutilizado con otro contenido. Punto y perímetro posteriores del mismo código operan sobre la misma parcela y conservan versiones. Conflictos y rechazos permanecen visibles y recuperables.
- Fondo satelital: datos abiertos descargados y preparados en el servidor. PNG georreferenciado por zona WGS84, fecha y resolución declaradas, hash y tamaño verificados antes de persistirlo. Imágenes independientes de la escritura de captura. Sin fondo se sigue capturando; no se declara preparación completa con una imagen ausente/incompleta.
- Fuente inicial de evaluación: Sentinel-2 L2A, Copernicus/Element 84 AWS Open Data. No Google Maps ni WhispMap incrustado; WHISP queda online y no se activa automáticamente.

## Límites declarados

No hay login ni renovación de autorización sin red. Revocaciones solo pueden conocerse al reconectar. El navegador puede denegar persistencia, quedarse sin espacio o perder datos si el usuario borra el sitio: informar, no prometer almacenamiento infalible. El PIN no sustituye el cifrado del dispositivo ni protege frente a scripts maliciosos del mismo origen mientras el almacén esté desbloqueado. Sentinel-2 tiene resolución nativa de 10 m; ampliar no crea detalle ni prueba linderos, titularidad o conformidad EUDR. La fecha de preparación no es la fecha de adquisición.

## Gate de cierre

Contexto persistente de Chromium y origen seguro, servidor inaccesible, sesión online vencida/autorización vigente, mapa descargado, punto/perímetro/evidencia, cierre/reapertura, recuperación y envío único tras respuesta perdida. Repetir sin imagen, con descarga incompleta y cuota insuficiente. Incluir aislamiento entre cuentas/tenant y rechazos/conflictos que conservan datos. Pruebas específicas y `npm run validate` sobre SHA identificado, documentación posterior de resultados reales. No otorgar DONE_LOCAL por compilar ni por pruebas sintéticas de imágenes solamente.
