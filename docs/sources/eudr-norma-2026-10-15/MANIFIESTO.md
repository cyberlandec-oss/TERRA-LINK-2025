# Copia fechada del texto normativo EUDR (descargada el 2026-10-15)

En la sesión anterior se registró que **la norma no se había podido leer literalmente**: EUR-Lex devolvía páginas
vacías. La causa real, comprobada el 2026-10-15, es que `eur-lex.europa.eu` responde **HTTP 202 con un desafío
JavaScript de AWS WAF** (2 035 bytes, sin contenido del documento) a cualquier petición automatizada. No es un
fallo transitorio ni de red.

**La vía que sí funciona** es el servicio de contenido de la Oficina de Publicaciones:
`https://publications.europa.eu/resource/celex/<CELEX>` con cabecera `Accept: application/xhtml+xml` y
`Accept-Language: eng`. Devuelve el documento completo. Por ahí se obtuvieron los textos de esta carpeta.

| Archivo | CELEX | URL | Bytes | sha256 |
| --- | --- | --- | ---: | --- |
| `02023R1115-20251226.xhtml` | `02023R1115-20251226` | `https://publications.europa.eu/resource/celex/02023R1115-20251226` | 267 071 | `a00f759dfaf6daeff3b831e14571bd89828360e29cd9c7e6e1b6d3d1af0ddbe6` |
| `32025R2650.xhtml` | `32025R2650` | `https://publications.europa.eu/resource/celex/32025R2650` | 182 765 | `f9a2440227c4231d359e2816d9fc17bf59643dd1f3c7fa6ff31320180037ae27` |

## Identificación exacta del consolidado

Encabezado literal del documento: **`02023R1115 — EN — 26.12.2025 — 002.001`**

| Acto | Identificación | Diario Oficial |
| --- | --- | --- |
| Base (**B**) | Reglamento (UE) **2023/1115**, de 31 de mayo de 2023 | OJ L 150, 9.6.2023, p. 206 |
| Modificación **M1** | Reglamento (UE) **2024/3234**, de 19 de diciembre de 2024 | OJ L 3234, 23.12.2024, p. 1 |
| Modificación **M2** | Reglamento (UE) **2025/2650**, de 19 de diciembre de 2025 | OJ L 2650, 23.12.2025, p. 1 |

En el texto consolidado, los pasajes marcados **▼M2** son los introducidos por 2025/2650.

## Advertencia que hace el propio documento

> «This text is meant purely as a documentation tool and has no legal effect. The Union's institutions do not assume
> any liability for its contents. The authentic versions of the relevant acts, including their preambles, are those
> published in the Official Journal of the European Union and available in EUR-Lex.»

Es decir: **el consolidado sirve para trabajar, no para fundar una conclusión jurídica**. Para eso hace falta el
texto del Diario Oficial. Esta copia **no sustituye** la revisión de un responsable regulatorio; permite citar con
exactitud en vez de parafrasear de memoria.

## Pasajes citados en `docs/decisiones/D-05-PROPUESTA.md`

Todos verificados contra `02023R1115-20251226.xhtml`:

- **Art. 2(27)** «plot of land» — define la parcela como terreno dentro de **una sola propiedad inmobiliaria**
  reconocida por la ley del país de producción, con condiciones suficientemente homogéneas.
- **Art. 2(28)** «geolocation» — coordenadas con **al menos seis dígitos decimales**; polígono para parcelas de
  **más de cuatro hectáreas** destinadas a productos distintos del ganado.
- **Art. 2(15)** «operator» (▼M2) y **Art. 2(15a)** «micro or small primary operator» (▼M2), con **todas** sus
  condiciones acumulativas.
- **Art. 4a** (▼M2) régimen simplificado, y **Art. 4a(5)** sustitución de la geolocalización por dirección postal.
- **Art. 9(1)(d)** requisito de información de geolocalización.
- **Art. 38(2) y (3)** fechas de aplicación: **30-12-2026** y **30-06-2027**.
