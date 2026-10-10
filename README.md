# Terra Link — paquete de desarrollo para Claude Code

Versión 1.0 · corte documental 9 de octubre de 2026 · español.

Este paquete convierte cuatro documentos de negocio, benchmarking, especificación técnica y workflows en instrucciones y especificaciones para desarrollar Terra Link. Se puede integrar en el repositorio desde VS Code. No contiene código de aplicación ni asegura que los módulos ya existan.

## Instalación

1. Descomprime el ZIP en una carpeta temporal y abre el repositorio real en VS Code.
2. Revisa los archivos existentes `CLAUDE.md`, `.claude/` y `docs/`. Integra los nuevos mediante diff; evita sobrescribir reglas o documentación del equipo.
3. Coloca el contenido de esta carpeta en la raíz del repositorio. Conserva la carpeta oculta `.claude` al copiar. Si `docs` ya contiene estos nombres, integra o acuerda una ruta y actualiza referencias.
4. Inicia Claude Code desde esa raíz. Consulta `/memory` para comprobar las instrucciones cargadas. Si los comandos no aparecen, reinicia la sesión y revisa las políticas de la instalación.
5. Ejecuta `/tl-auditar`. Luego utiliza `/tl-implementar TECH-001` o la primera historia que la auditoría encuentre pendiente.

No ejecutes `/init` para reemplazar sin revisar el `CLAUDE.md` entregado. Puede servir después para comparar instrucciones con lo descubierto en el repositorio.

## Qué leer

| Necesidad | Archivo |
| --- | --- |
| Instrucciones permanentes de Claude | [CLAUDE.md](CLAUDE.md) |
| Índice completo | [docs/00_INDICE.md](docs/00_INDICE.md) |
| Qué está acreditado y qué falta comprobar | [docs/01_ESTADO_Y_FUENTES.md](docs/01_ESTADO_Y_FUENTES.md) |
| Requisitos verificables | [docs/03_REQUISITOS.md](docs/03_REQUISITOS.md) |
| Historias, dependencias y aceptación | [docs/18_BACKLOG.md](docs/18_BACKLOG.md) |
| Cómo iniciar y continuar en Claude | [docs/21_GUIA_CLAUDE_CODE.md](docs/21_GUIA_CLAUDE_CODE.md) |

## Criterio de uso

Las fuentes describen el producto deseado. Las especificaciones nuevas detallan una propuesta de ingeniería; sus elecciones adicionales están señaladas como propuestas. El código y las pruebas del repositorio determinarán el estado real. La auditoría inicial impide reconstruir funciones existentes o aplicar un stack histórico por accidente.

Los archivos de Markdown orientan a Claude; los permisos de ejecución, validadores, CI, restricciones de base de datos y controles de aplicación deben imponer las reglas críticas. Este paquete no configura hooks, no modifica credenciales ni amplía permisos.
