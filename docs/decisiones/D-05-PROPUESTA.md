# D-05 — Propuesta de perfil de destino geoespacial (NO APROBADA)

Estado: **PROPUESTA**, pendiente de responsable GIS/regulatorio. Nada de este documento está activo en el código: la evaluación técnica `TL_GIS_TECH 1.0.0` informa «Perfil de destino: no evaluado (D-05)». Aprobarla exige verificar el texto consolidado vigente y la especificación oficial del sistema receptor, que no se consultaron para redactar esta propuesta.

## 1. Qué decide D-05
- Qué perfil de destino aplica a la geolocalización de parcelas (requisitos de punto o polígono, umbral de superficie y caso igual al umbral, superficie de referencia, formato y precisión de intercambio).
- Con qué fuente legal y técnica, con qué vigencia, y cómo se versiona.
- Qué hace la plataforma cuando una parcela no cumple el perfil, sin convertir el incumplimiento en conclusión legal automática.

## 2. Fuente aplicable (por verificar)
| Fuente | Uso propuesto | Verificación pendiente |
| --- | --- | --- |
| Reglamento (UE) 2023/1115 (EUDR), definición de «geolocalización» (art. 2) y deber de información (art. 9) | Regla de punto o polígono según la superficie | Texto **consolidado vigente**, incluidas las modificaciones posteriores (aplazamientos y simplificaciones), y la interpretación de «más de cuatro hectáreas» |
| Especificación GeoJSON del Sistema de Información de la UE (TRACES) para declaraciones de diligencia debida | Perfil de exportación (envolvente, propiedades, tamaño, decimales) | Versión oficial vigente del documento técnico y su fecha |
| Guías o FAQ oficiales de la Comisión sobre geolocalización | Casos frontera (parcelas contiguas, MultiPolygon, huecos) | Vigencia y estado jurídico de cada guía |
| Normativa nacional de Ecuador (catastro, áreas protegidas) | Ninguno en esta propuesta | Fuera de D-05: no se infieren restricciones territoriales |

## 3. Perfil candidato `EUDR_GEO_V1` (borrador)
| Parámetro | Valor propuesto | Motivo |
| --- | --- | --- |
| `threshold_ha` | 4 | Umbral citado por la fuente técnica (S1) y por el texto del reglamento (por verificar) |
| `operator` | `polygon_required_if_area_gt` (estrictamente mayor) | La fuente técnica escribe `<4 ha` y `>4 ha` y deja indefinido `=4`; el texto citado usa «más de cuatro hectáreas». **Decisión explícita requerida** |
| Caso `= 4,0000 ha` | Punto admitido (no supera el umbral), con advertencia de borde | Consecuencia del operador estricto; debe ratificarse |
| Superficie de referencia | Calculada (`ST_Area` geodésica) cuando hay polígono válido; si solo hay punto, la **declarada** | Un punto no tiene superficie calculada |
| Redondeo para comparar | Ninguno: comparar el valor calculado con 6 decimales de hectárea; mostrar con 4 | Evita que 4,00004 ha se presente como «4 ha» y cambie el resultado |
| Discrepancia declarada/calculada | Si una supera el umbral y la otra no → REVIEW_REQUIRED | No elegir silenciosamente la favorable |
| Punto con superficie declarada > umbral | No cumple el perfil: requiere polígono | Regla de punto/polígono |
| Polígono inválido técnicamente | Perfil no evaluable hasta corregir | Validez técnica es prerrequisito |
| MultiPolygon y huecos | Admitidos si la especificación de destino los admite; superficie = suma neta | Por verificar en la especificación |
| Decimales de exportación | Al menos 6 decimales en la serialización | Requisito de representación citado; **no es precisión de medición** |
| Productos | Cacao | Alcance del proyecto |
| Vigencia | Fecha de aprobación + fuente con versión | Perfil versionado; cambios crean `EUDR_GEO_V2` |

## 4. Casos frontera que la prueba debe cubrir tras aprobar
1. Polígono válido de 3,9999 ha, 4,0000 ha y 4,0001 ha (debajo, igual, encima).
2. Punto con superficie declarada 3,5 ha / 4 ha / 4,5 ha.
3. Polígono de 4,2 ha con superficie declarada 3,8 ha (discrepancia).
4. MultiPolygon cuya suma supera el umbral y cuyos componentes no.
5. Polígono con hueco: superficie neta por debajo y bruta por encima.
6. Polígono inválido (autointersección) cercano al umbral.
7. Exportación con 5 decimales en el origen (no se inventan decimales: se informa).
8. Versión importada vs capturada con la misma geometría.

## 5. Consecuencias en la plataforma si se aprueba
- Nueva regla `EUDR_GEO_V1` separada de `TL_GIS_TECH`: un tercer bloque «Perfil de destino» con resultado propio (CUMPLE PERFIL / NO CUMPLE / NO EVALUABLE). Nunca «conforme EUDR».
- Las evaluaciones técnicas existentes no cambian; se marcan desactualizadas solo si su regla cambia.
- P0-009 podrá cerrar «perfil destino»: exportación según la especificación oficial, con pruebas de contrato.
- P0-010 podrá cerrar «umbral debajo/igual/encima probado tras aprobar perfil».
- Riesgo si se aprueba sin verificar la fuente: decisiones de diligencia debida basadas en un umbral o formato no vigente. Por eso la aprobación debe adjuntar la fuente y su versión.

## 6. Qué se necesita para aprobar
Responsable GIS/regulatorio designado; copia o referencia exacta del texto consolidado y de la especificación de destino; respuesta explícita al caso `= 4 ha`, a la superficie de referencia y a la discrepancia declarada/calculada.
