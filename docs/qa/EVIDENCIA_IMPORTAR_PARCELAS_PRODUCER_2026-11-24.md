# Importar parcelas con PRODUCER — comprobación específica

**Corte histórico del árbol original.** El cierre posterior se hizo en worktree aislado, con nuevos resultados y capturas sobre commit: [DONE_LOCAL de `e4c3a93`](CIERRE_IMPORTACION_WORKTREE_2026-11-24.md). Los pendientes descritos abajo corresponden a este corte previo, no al estado final de la rama aislada.
Fecha: 2026-11-24. Rama `feat/importar-parcelas-multiformato`, base `0b968c9`, cambios sin commit. **Recorrido funcional verificado; DONE_LOCAL pendiente de commit y validación integral sobre ese SHA.** No atribuir estas pruebas al commit base sin los cambios.

## Hallazgo y corrección

Antes, una cuenta de alcance propio no podía reasignar parcelas, pero el código de productor ajeno asociado en el archivo se ignoraba y se sustituía por la ficha propia. Para el criterio de rechazo explícito solicitado se endurece `PlotFileImportsService.resolve`: si una columna asociada o el valor común indican un código distinto al productor vinculado, la fila queda `ERROR / PRODUCER_NOT_AVAILABLE`, sin geometría expuesta y con confirmación bloqueada. Omitir el código sigue resolviendo automáticamente la ficha propia. No se agregan permisos ni se cambian roles.

## Pruebas ejecutadas

| Comando | Resultado |
| --- | --- |
| `npm.cmd test -w apps/api -- --runInBand test/plot-file-imports.int-spec.ts --silent` | **10/10 aprobadas**, corrida final de 34,4 s con PostGIS y lector real |
| `npm.cmd run build -w apps/api` | Aprobado |
| `npm.cmd run typecheck` | API y web aprobadas |
| `npm.cmd run lint` | API y web aprobadas |
| `npm.cmd run test -w e2e -- tests/importar-parcelas-productor.spec.ts` | **1/1 aprobado**, 38,1 s, Chromium real, viewport 390 × 844 |
| `node scripts/desplegar.mjs` | Aprobado; API/web/worker y dependencias saludables; esquema 0080, revisión `0b968c9+sucio` |

El caso E2E crea mediante API una organización y cuentas sintéticas con roles explícitos ORG_ADMIN y **PRODUCER**, vincula esta última a su ficha, y abre un contexto de navegador con su propia sesión. No usa sesión administrativa durante el recorrido de UI. Infraestructura E2E aislada, puertos 4100/3100, base `terra_link_e2e`; integración en `*_test`. No se cargaron parcelas de ensayo en el DEMO.

## Recorrido demostrado

1. PRODUCER entra por el menú «Importar parcelas». Carga CSV sin columna de productor; ve el aviso de ficha propia y no un selector de otros productores.
2. Convierte un punto WGS84 y ve «Punto de referencia · Perímetro pendiente». La revisión no ha creado parcelas.
3. Confirma, abre la ficha y comprueba que pertenece al productor vinculado; geometría POINT y superficie calculada null.
4. Sube el perímetro GeoJSON con el mismo código. La revisión indica actualización; no permite confirmar sin reconocer el cambio geométrico.
5. Confirma y abre **el mismo ID de parcela**. Ahora tiene POLYGON y superficie positiva; historial con exactamente dos versiones, POINT y POLYGON, sin cambiar productor ni duplicar parcela.
6. Carga CSV con código de otro productor: la revisión del servidor bloquea la fila. Incluso forzando el POST de confirmación con un plan/hash auténtico, devuelve **409**. El acceso a la parcela ajena devuelve **404**; el control administrativo confirma que conserva su propietario, y el listado propio sigue teniendo una sola parcela.

La integración añade controles de valor común ajeno y de intento de modificar una parcela ajena mediante su código; las filas fallan, ninguna carga inválida se confirma y no aparecen parcelas `GIS-ATTACK*`.

Capturas sintéticas: [punto guardado](capturas/importacion/producer-punto-390.png), [perímetro y versiones](capturas/importacion/producer-perimetro-390.png), [asociación ajena bloqueada](capturas/importacion/producer-ajena-bloqueada-390.png).

Dos ejecuciones iniciales del test de navegador fallaron en sus aserciones: se buscaba el aviso antes de identificar el archivo y se leía `producer_id` cuando el contrato de detalle expone `producer.id`. Se corrigió la prueba; no se presentan esos intentos como aprobados. La corrida final completó todos los pasos.

## Gate restante

No se ejecutó una nueva validación integral sobre commit en este cierre: el árbol aún contiene cambios previos del propietario en menú/estilos/idioma y se pidió confirmar si deben incluirse en el commit reproducible. Se conservan intactos. Tras resolverlo: commit de código, `npm.cmd run validate` sin exclusiones sobre ese SHA y commit posterior de evidencia. Las 179 pruebas E2E de la entrega anterior son evidencia histórica, no una nueva batería completa con este ajuste; ahora existe un caso adicional.
