# Prompts listos para Claude Code

Los comandos del paquete contienen versiones reutilizables. Estos textos se pueden pegar si la instalación no los muestra. Cada uno presupone el paquete integrado en la raíz real.

## Auditoría inicial

```text
Lee CLAUDE.md y docs/00_INDICE.md y docs/01_ESTADO_Y_FUENTES.md.
Audita el repositorio actual con lectura y verificaciones no destructivas.
Identifica stack, manifests, directorios, migraciones, permisos, módulos,
tests y comandos reales sin mostrar secretos. No construyas módulos aún.
Compara con docs/03_REQUISITOS.md y docs/18_BACKLOG.md.
Actualiza docs/20_COMANDOS_Y_ENTORNO.md y docs/23_ESTADO_DESARROLLO.md
con evidencia y gaps; conserva trabajo existente y ajusta los globs de rules.
Resuelve ADR-0001 con lo comprobado. No marques verificado sin ejecutar prueba.
Propón la siguiente historia concreta y sus dependencias.
```

## Implementar historia

```text
Implementa [ID de historia] desde docs/18_BACKLOG.md.
Primero inspecciona lo que existe, los contratos implicados y las dependencias.
Conserva el stack y reutiliza código. Declara el gap y alcance de la tarea.
Completa dominio, DB/API, autorización, auditoría y UI/offline cuando apliquen.
Ejecuta comandos comprobados y criterios QA asociados.
Actualiza la historia y estado con resultados, limitaciones y siguiente paso.
No cierres gates Android/regulatorios/producción si falta su evidencia.
```

## Revisar una entrega

```text
Revisa [ID/commit/diff] contra sus requisitos y aceptación.
Inspecciona invariantes de tenant, FK, stock, eventos, evidencia y versiones
aplicables. Ejecuta verificaciones pertinentes en entorno autorizado.
Señala hallazgos concretos con archivo, causa, impacto y reproducción.
Distingue tests ejecutados de propuestos; no apruebes por compilar.
Actualiza evidencia y estado sin cambiar el alcance silenciosamente.
```

## Continuar sin reconstruir

```text
Lee docs/23_ESTADO_DESARROLLO.md y el último registro de sesión.
Comprueba rama, commit y cambios locales. Revalida solo lo que haya cambiado.
Continúa el siguiente paso documentado de la historia pendiente.
No recrees módulos ya verificados y no uses el benchmark como estado del repo.
Al terminar actualiza pruebas/evidencia, pendientes y registro de sesión.
```

## Evidence Center si el núcleo ya existe

```text
Si la auditoría acredita productores, GIS, entregas/lotes, grafo, RBAC,
auditoría, riesgo y DD, analiza los gaps de P0-018 y P0-019.
Lee docs/12_DOCUMENTOS_Y_EVIDENCIA.md. Reutiliza documentos/evidencia/enlaces
existentes. Diseña la vista claim → soporte → versión → revisión → impacto
en riesgo/DD. Comprueba acceso, escaneo/vigencia y readiness invalidado.
Implementa solo la sección pendiente, con QA-09–12 y UI QA-14 pertinentes.
```
