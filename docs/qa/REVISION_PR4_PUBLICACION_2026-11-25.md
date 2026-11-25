# Revisión del candidato del PR #4

## Estado de entrada

Carpeta original limpia en `01c3e11`; origin confirmado como `cyberlandec-oss/TERRA-LINK-2025`. Se hizo fetch y se creó worktree limpio `C:/Users/mario/AppData/Local/Temp/vscode-agent-codex-sandbox-hzfnjw/tl-pr4-candidato`, rama `feat/pr4-candidato`. La carpeta original no se altera durante la preparación ni validación.

`00c1c1b..01c3e11`: solo 16 archivos de documentos, resúmenes y capturas; ninguna diferencia de aplicación/infraestructura/pruebas. `01c3e11` añadió el resumen de inspección/publicación y su registro operativo; `5260d82` agregó evidencias de validación/TLS y despliegue.

## PR relacionados

- PR #2, head `f2d10a3`: ancestro del #4. Ningún commit exclusivo; trabajo incorporado por ascendencia.
- PR #3, head `63d5aa2`: NO era ancestro; un commit exclusivo y no equivalente por patch-id. Aporta sección de análisis satelitales en riesgo, tipos de referencia y tres casos E2E; el backend ya tenía evolución posterior y regresiones más fuertes. Se integra mediante merge, conservando la clave de fixture actual y las comprobaciones posteriores. No se cierra como incorporado antes de que este candidato llegue a main.
- Se incorporará también origin/main (`4d9464e`) al candidato para validar un árbol que ya contiene la base y evitar diferencias funcionales del merge final. Solo había un merge commit exclusivo en main; conservar su historial.

## Revisión de contenido e historial

Sondeo heurístico de todo el historial alcanzable desde el head original del #4: 8.927 objetos, 3.455 blobs de texto, 95.215.418 bytes examinados. Ninguna coincidencia para claves privadas, tokens GitHub conocidos, claves AWS AKIA o claves OpenAI; tampoco archivos privados `.env`/credenciales rastreados en ese historial. `.env.example` es la plantilla permitida. No es auditoría exhaustiva ni OCR de capturas. Los PDF son fuentes legales públicas o fixtures; los tres CSV de parcelas son ejemplos sintéticos declarados, no archivos de productores reales. No aparecen GeoPackage/XLSX/GeoJSON de productores, respaldos de bases ni claves privadas rastreadas.

Se detectó un `.log` de 231 bytes: sonda sintética del bloqueo de almacenamiento, con secretos marcados false y sin valores sensibles. Se retira del árbol por el criterio de no incorporar logs crudos y se conserva su resumen en la evidencia original. Es recuperable en Git; no se purga ni reescribe historia. Se agregan exclusiones de logs y respaldos. No se detectó material sensible confirmado que requiera detener la fusión; cualquier hallazgo nuevo la bloqueará.

## Gate pendiente

Commit final de candidato → OpenSSL de Git en PATH de sesión → `npm.cmd run validate` íntegro con E2E → registrar SHA/resultados en PR #4 → merge con historial y head esperado. Si falla una compuerta, no fusionar. Comparar también hashes de menú/estilos/idioma frente a `01c3e11`; PRODUCTOR a 390 px y TLS ejecutadas/omitidas deben constar por separado. Evidencias posteriores no reetiquetan las corridas históricas.
