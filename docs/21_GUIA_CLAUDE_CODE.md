# Cómo desarrollar con Claude Code en VS Code

## Diseño del paquete

`CLAUDE.md` mantiene contexto e invariantes breves. `.claude/rules/` limita reglas especializadas por rutas. `.claude/commands/` ofrece flujos invocables en Markdown; las especificaciones extensas se leen según la tarea, sin importarlas todas al inicio. Esto evita cargar el benchmarking completo en cada sesión.

Se usó como referencia la [guía de DataCamp](https://www.datacamp.com/tutorial/writing-the-best-claude-md), solicitada por el usuario. Su enlace corto no fue accesible y se localizó el artículo por título. La referencia técnica prioritaria es la documentación oficial de [memoria y reglas](https://code.claude.com/docs/en/memory) y [extensiones/comandos](https://code.claude.com/docs/en/skills), consultadas el 9 de octubre de 2026. Las ubicaciones y disponibilidad pueden depender de versión/política de la instalación.

## Primera sesión

1. Integrar el paquete sin sobrescribir instrucciones existentes; trabajar desde raíz del repo.
2. Consultar `/memory` para revisar lo cargado. Confirmar que `.claude` viajó al descomprimir.
3. Ejecutar `/tl-auditar` o pegar el prompt equivalente del documento 25.
4. Completar estado/comandos y ADR-0001 con resultados reales; mapear rutas y ajustar `paths` de rules.
5. Elegir gap confirmado en backlog. Empezar TECH-001 si faltan fundamentos, no por un dashboard.

## Flujo por historia

`/tl-implementar P0-XXX`: inspeccionar caso, contratos, dependencias y código existente; describir alcance; implementar; validar; actualizar evidencia/estado. Evitar pedir al modelo «desarrolla toda la plataforma» en un solo turno.

`/tl-revisar P0-XXX`: revisar diff y comportamiento, con pruebas críticas de dominio/seguridad y documentación. Enumerar hallazgos con evidencia y severidad; no aprobar por estilo de código.

`/tl-continuar`: recuperar último registro, verificar que commit/working tree siguen vigentes, ejecutar próximo paso concreto y actualizar resultados. Cierre de sesión con la plantilla correspondiente permite continuidad sin depender solo del chat.

## Reglas por rutas

Los globs entregados cubren nombres frecuentes `backend/`, `api/`, `apps/api/`, `frontend/`, `web/`, `mobile/`, `apps/mobile/` y archivos SQL/migraciones. Son una propuesta de mapping, no rutas acreditadas. TECH-001 los ajusta al layout real, incluido `src/` u otras rutas si corresponden. Los invariantes de seguridad/domino permanecen globales en raíz/00-domain y no dependen de un glob sin coincidencias.

Usar YAML válido; reglas sin `paths` aplican globalmente, las acotadas se cargan al trabajar con archivos coincidentes. No crear un CLAUDE por cada carpeta ni duplicar instrucciones contradictorias. Documentación `docs/` es contexto a demanda, no mandato de lectura total.

## Permisos y automatización

Estos Markdown son instrucciones de contexto. CI/linters, constraints SQL, validación de API y políticas de ejecución imponen controles comprobables. Hooks requieren scripts reales, configuración y revisión; no se incluyen hooks ficticios ni permisos amplios en `settings.json`.

No crear un `MEMORY.md` raíz como si fuese la memoria automática de Claude. El estado compartido de este proyecto está en docs/23 y registros de sesión versionados. Preferencias personales pueden ir en archivos locales conforme a la instalación, sin secretos y excluidos de git.

## Mantenimiento

Tras cada error recurrente, mejorar la regla específica o el control técnico que lo habría prevenido. Actualizar comandos cuando cambien manifiestos; retirar contexto obsoleto; resolver diferencias con ADR. Conservar el raíz breve y evitar importar specs largas mediante `@` indiscriminadamente. Revisar instrucciones como cualquier cambio del repo, sin considerarlas garantía de seguridad o conformidad.
