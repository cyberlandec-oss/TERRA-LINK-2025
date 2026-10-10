# Revisión visual por rol — Terra Link (local)

**Fecha:** 2026-10-10 · **Entorno:** aplicación de desarrollo en contenedores (`docker compose --profile app`), web `http://localhost:3000`, API `http://localhost:4000`, base `terra_link` (PostgreSQL en 5440) con datos DEMO sintéticos · **Base de código:** rama `feat/tech-001-ci-p0-002`, commit de esta sesión (ver registro de sesión) · **Especificación:** `docs/UX_UI.md`.

**Método.** Script reproducible `node e2e/review/revision-por-rol.mjs` (Playwright, Chromium). Abre una sesión de navegador **aislada** por cada fila de `CREDENCIALES.csv` (usuario + organización + rol), inicia sesión con la contraseña del CSV (nunca se imprime), entra en la organización, registra contexto, navegación y rutas, ejecuta una tarea real permitida, intenta acceder a otra organización DEMO y busca nombres de organizaciones ajenas en sus pantallas. Resultados completos en `docs/qa/revision-resultados.json` y capturas en `docs/qa/capturas/` (solo datos sintéticos rotulados DEMO; sin contraseñas).

Esta revisión no acredita producción, conformidad EUDR ni WCAG. Las experiencias de módulos inexistentes figuran como **pendientes**, no como aprobadas.

## Resultado

- **18 combinaciones usuario/organización/rol** (17 cuentas; una con roles en dos organizaciones): login correcto, organización y rol efectivos visibles en la cabecera, navegación derivada de permisos reales, **denegación coherente** (otra organización → «El recurso no está disponible», sin su nombre; módulo sin permiso → «No tienes permiso…»), **sin datos de otras organizaciones**, tarea real con el resultado esperado. **0 incidencias abiertas** en la última corrida.
- **Teclado:** foco visible (anillo sólido de 2 px) al recorrer el login con Tab.
- **Móvil (390 px):** menú oculto al inicio, se abre, marca visible, se cierra desde el panel y con Escape, sin desbordamiento horizontal (admin y técnico de la cooperativa).

## Detalle por cuenta

| Cuenta | Organización | Rol | Navegación visible | / | /productores | /coincidencias | /miembros | /auditoria | Tarea real | Denegación | Datos ajenos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| superadmin.revision | (plataforma) | SUPER_ADMIN | Resumen de la organización, Incorporar administrador, Organizaciones (plataforma) | ✔ DEMO · Cooperativa Río Verde | 403 explicado | 403 explicado | ✔ Incorporar administrador | 403 explicado | Listar organizaciones de la plataforma: 6 organizaciones visibles | Denegado (sin elevación, D-04) | n/a (plataforma ve metadatos de organizaciones por diseño) |
| admin.cooperativa | Cooperativa Río Verde | ORG_ADMIN | Resumen de la organización, Productores, Posibles duplicados, Miembros e invitaciones, Auditoría, Mis organizaciones | ✔ DEMO · Cooperativa Río Verde | ✔ Productores | ✔ Posibles duplicados | ✔ Miembros e invitaciones | ✔ Auditoría | Consultar miembros y formulario de invitación: 6 miembros; invitar disponible | Recurso no disponible; sin datos de la otra organización | ninguno |
| supervisor.cooperativa | Cooperativa Río Verde | MANAGER | Resumen de la organización, Productores, Posibles duplicados, Miembros e invitaciones, Mis organizaciones | ✔ DEMO · Cooperativa Río Verde | ✔ Productores | ✔ Posibles duplicados | ✔ Miembros e invitaciones | 403 explicado | Listar productores (alcance por rol): 8 productores visibles (esperado 8); 1 caso(s) de posible duplicado pendientes | Recurso no disponible; sin datos de la otra organización | ninguno |
| tecnico1.cooperativa | Cooperativa Río Verde | FIELD_TECHNICIAN | Resumen de la organización, Productores, Mis organizaciones | ✔ DEMO · Cooperativa Río Verde | ✔ Productores | 403 explicado | 403 explicado | 403 explicado | Listar productores (alcance por rol): 5 productores visibles (esperado 5) | Recurso no disponible; sin datos de la otra organización | ninguno |
| tecnico2.cooperativa | Cooperativa Río Verde | FIELD_TECHNICIAN | Resumen de la organización, Productores, Mis organizaciones | ✔ DEMO · Cooperativa Río Verde | ✔ Productores | 403 explicado | 403 explicado | 403 explicado | Listar productores (alcance por rol): 2 productores visibles (esperado 2) | Recurso no disponible; sin datos de la otra organización | ninguno |
| productor.cooperativa | Cooperativa Río Verde | PRODUCER | Mi espacio, Mis organizaciones | ✔ Mi espacio | 403 explicado | 403 explicado | 403 explicado | 403 explicado | Ver su espacio y capacidades pendientes rotuladas: 1 capacidad(es) pendientes rotuladas; aviso de rol sin pantallas | Recurso no disponible; sin datos de la otra organización | ninguno |
| admin.acopio | Acopio San Isidro | ORG_ADMIN | Resumen de la organización, Productores, Posibles duplicados, Miembros e invitaciones, Auditoría, Mis organizaciones | ✔ DEMO · Acopio San Isidro | ✔ Productores | ✔ Posibles duplicados | ✔ Miembros e invitaciones | ✔ Auditoría | Consultar miembros y formulario de invitación: 3 miembros; invitar disponible | Recurso no disponible; sin datos de la otra organización | ninguno |
| recepcion.acopio | Acopio San Isidro | RECEPTION_OPERATOR | Resumen de la organización, Mis organizaciones | ✔ DEMO · Acopio San Isidro | 403 explicado | 403 explicado | 403 explicado | 403 explicado | Ver su espacio y capacidades pendientes rotuladas: 1 capacidad(es) pendientes rotuladas | Recurso no disponible; sin datos de la otra organización | ninguno |
| calidad.acopio | Acopio San Isidro | QUALITY_OPERATOR | Resumen de la organización, Mis organizaciones | ✔ DEMO · Acopio San Isidro | 403 explicado | 403 explicado | 403 explicado | 403 explicado | Ver su espacio y capacidades pendientes rotuladas: 1 capacidad(es) pendientes rotuladas | Recurso no disponible; sin datos de la otra organización | ninguno |
| admin.exportadora | Exportadora Pacífico | ORG_ADMIN | Resumen de la organización, Productores, Posibles duplicados, Miembros e invitaciones, Auditoría, Mis organizaciones | ✔ DEMO · Exportadora Pacífico | ✔ Productores | ✔ Posibles duplicados | ✔ Miembros e invitaciones | ✔ Auditoría | Consultar miembros y formulario de invitación: 6 miembros; invitar disponible | Recurso no disponible; sin datos de la otra organización | ninguno |
| trazabilidad.exportadora | Exportadora Pacífico | TRACEABILITY_MANAGER | Resumen de la organización, Productores, Mis organizaciones | ✔ DEMO · Exportadora Pacífico | ✔ Productores | 403 explicado | 403 explicado | 403 explicado | Consultar productores de su organización (solo lectura): vacío autorizado (la organización no tiene productores) | Recurso no disponible; sin datos de la otra organización | ninguno |
| eudr.exportadora | Exportadora Pacífico | EUDR_MANAGER | Resumen de la organización, Productores, Mis organizaciones | ✔ DEMO · Exportadora Pacífico | ✔ Productores | 403 explicado | 403 explicado | 403 explicado | Consultar productores de su organización (solo lectura): vacío autorizado (la organización no tiene productores) | Recurso no disponible; sin datos de la otra organización | ninguno |
| exportacion.exportadora | Exportadora Pacífico | EXPORT_MANAGER | Resumen de la organización, Mis organizaciones | ✔ DEMO · Exportadora Pacífico | 403 explicado | 403 explicado | 403 explicado | 403 explicado | Ver su espacio y capacidades pendientes rotuladas: 1 capacidad(es) pendientes rotuladas | Recurso no disponible; sin datos de la otra organización | ninguno |
| auditor.exportadora | Exportadora Pacífico | AUDITOR | Resumen de la organización, Productores, Auditoría, Mis organizaciones | ✔ DEMO · Exportadora Pacífico | ✔ Productores | 403 explicado | 403 explicado | ✔ Auditoría | Consultar la auditoría de su organización: 13 registros visibles | Recurso no disponible; sin datos de la otra organización | ninguno |
| admin.importador | Chocolates Europa (importador UE) | ORG_ADMIN | Resumen de la organización, Productores, Posibles duplicados, Miembros e invitaciones, Auditoría, Mis organizaciones | ✔ DEMO · Chocolates Europa (importador UE) | ✔ Productores | ✔ Posibles duplicados | ✔ Miembros e invitaciones | ✔ Auditoría | Consultar miembros y formulario de invitación: 2 miembros; invitar disponible | Recurso no disponible; sin datos de la otra organización | ninguno |
| comprador.importador | Chocolates Europa (importador UE) | BUYER | Mi espacio, Mis organizaciones | ✔ Mi espacio | 403 explicado | 403 explicado | 403 explicado | 403 explicado | Ver su espacio y capacidades pendientes rotuladas: 1 capacidad(es) pendientes rotuladas; aviso de rol sin pantallas | Recurso no disponible; sin datos de la otra organización | ninguno |
| coordinador.multi | Cooperativa Río Verde | MANAGER | Resumen de la organización, Productores, Posibles duplicados, Miembros e invitaciones, Mis organizaciones | ✔ DEMO · Cooperativa Río Verde | ✔ Productores | ✔ Posibles duplicados | ✔ Miembros e invitaciones | 403 explicado | Listar productores (alcance por rol): 8 productores visibles (esperado 8); 1 caso(s) de posible duplicado pendientes | Recurso no disponible; sin datos de la otra organización | ninguno |
| coordinador.multi | Exportadora Pacífico | TRACEABILITY_MANAGER | Resumen de la organización, Productores, Mis organizaciones | ✔ DEMO · Exportadora Pacífico | ✔ Productores | 403 explicado | 403 explicado | 403 explicado | Consultar productores de su organización (solo lectura): vacío autorizado (la organización no tiene productores) | Recurso no disponible; sin datos de la otra organización | ninguno |

Leyenda: ✔ pantalla disponible (título mostrado) · «403 explicado» = mensaje «No tienes permiso para realizar esta acción.» (no se presenta como «sin datos») · «vacío autorizado» = la organización no tiene registros.

## Incidencias encontradas y corregidas en esta revisión

| # | Incidencia | Causa | Corrección | Verificación |
| --- | --- | --- | --- | --- |
| 1 | SUPER_ADMIN en `/productores/coincidencias` veía «El recurso no está disponible» mientras en `/productores` veía «No tienes permiso» | La página de duplicados llamaba a la API sin comprobar el permiso efectivo | Comprobación de `producer:review_duplicates` antes de cargar; mensaje 403 coherente | Ruta revisada de nuevo: «403 explicado» |
| 2 | Móvil: la marca «TERRA LINK» desaparecía al abrir el menú | El color global `a:hover` (bosque) se aplicaba al enlace de marca sobre fondo bosque | Color fijo de la marca en hover/visitado | `marca_visible: true` |
| 3 | Móvil: el panel abierto tapaba el botón «Cerrar menú» | El botón estaba solo en la cabecera, bajo el panel | Botón de cierre dentro del panel + cierre con Escape | `cierra_desde_panel`, `cierra_con_escape: true` |
| 4 | Revisión de duplicados mostraba el estado interno «ACTIVE» | Código del contrato sin traducir | Etiqueta en español (Activo, Borrador, De baja) | Captura `admin-cooperativa--coincidencias.png` |

Falsos positivos del propio script (conteos antes de terminar la carga) se corrigieron esperando el estado de datos; no eran defectos de la aplicación.

## Observaciones (sin defecto)

- ORG_ADMIN de la acopiadora y de la importadora ve «Productores» y «Posibles duplicados»: es coherente con la matriz (los permisos dependen del rol, no del tipo comercial, D-18). Si Producto quiere ocultarlos por tipo de organización, requiere decisión explícita.
- SUPER_ADMIN ve todas las organizaciones (metadatos) e «Incorporar administrador»; miembros, auditoría y productores de cada empresa están denegados (D-04).
- Organizaciones sin productores (exportadora, importadora) muestran el estado «vacío autorizado», distinto del filtro sin resultados y de la denegación.

## Experiencias pendientes de implementación

| Rol | Experiencia (UX_UI §7) | Dependencia |
| --- | --- | --- |
| MANAGER | Centro de operaciones | P0-012, P0-016, cola de trabajo (UI-04) |
| FIELD_TECHNICIAN | Parcelas, captura GPS/polígono, offline | P0-006 a P0-008, P0-023/P0-024 |
| RECEPTION_OPERATOR | Nueva recepción y pesaje | P0-012 |
| QUALITY_OPERATOR | Cola de calidad | Backlog por confirmar (UX-D12) |
| TRACEABILITY_MANAGER | Lotes y explorador de trazabilidad | P0-013 a P0-017 |
| EUDR_MANAGER | Evidencias, riesgo, mitigación, expedientes | P0-018 a P0-022 |
| EXPORT_MANAGER | Embarques | P0-029 |
| AUDITOR | Explorador con comparación de versiones (hoy: bitácora de su organización) | P0-025 |
| BUYER | Portal comprador | P1-001 + contrato de concesiones (UX-D09) |
| PRODUCER | «Mi finca» | Vínculo cuenta–productor (UX-D08) |
| Todos | Logotipo oficial (hoy identificación textual) | Activos oficiales (UX-D01) |

## Actualización 2026-10-10 · P0-006 Parcelas

Script: `node e2e/review/revision-por-rol.mjs` (módulo `e2e/review/parcelas.mjs`), contra la aplicación de desarrollo con 6 parcelas DEMO de coordenadas sintéticas. 22 entradas, 0 incidencias.

| Cuenta | Comprobación | Resultado |
| --- | --- | --- |
| admin.cooperativa | Listado, ficha con polígono, teclado, vuelta al productor | 6 parcelas; esquema + 5 coordenadas + 2 versiones; sin botones de GPS/importación; foco visible; productor muestra sus 2 parcelas |
| tecnico1.cooperativa (asignado) | Alcance y ficha de punto | 5 parcelas (sin las de tecnico2); puede editar; «un punto no tiene superficie» |
| tecnico2.cooperativa (no asignado) | Abrir DEMO-PAR-002 por URL directa | «El recurso no está disponible», sin datos de la parcela |
| coordinador.multi | Dos organizaciones | Cooperativa (Supervisor): 6 parcelas; exportadora (Trazabilidad): vacío autorizado |
| tecnico1.cooperativa (390 px) | Ficha en móvil | Sin desbordamiento horizontal; la tabla de versiones se desplaza dentro de su marco |

Capturas: `parcelas--admin-listado.png`, `parcelas--admin-ficha-poligono.png`, `parcelas--tecnico1-ficha-punto.png`, `parcelas--tecnico2-id-ajeno.png`, `movil--parcela-ficha.png`. Ajuste aplicado tras la revisión: espaciado entre la tabla de coordenadas y «Registrar superficie declarada».
