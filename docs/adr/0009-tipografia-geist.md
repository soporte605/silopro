# 0009 · Tipografía: Geist + Geist Mono

**Evaluadas:** Geist, IBM Plex Sans/Mono, Inter, Manrope.

| Criterio               | Geist                             | IBM Plex                       | Inter                      |
| ---------------------- | --------------------------------- | ------------------------------ | -------------------------- |
| Legibilidad a 12–13 px | Muy buena, aberturas amplias      | Buena, algo más ancha          | Muy buena                  |
| Personalidad           | Geométrica, técnica, sobria       | Industrial, con carácter «IBM» | Neutra, muy vista          |
| Monoespaciada hermana  | Geist Mono (misma métrica visual) | Plex Mono                      | No (requiere otra familia) |
| Cifras tabulares       | Sí                                | Sí                             | Sí                         |
| Licencia               | SIL OFL 1.1                       | SIL OFL 1.1                    | SIL OFL 1.1                |
| Peso (variable, latín) | ~1 archivo variable por familia   | Familias estáticas más pesadas | Variable                   |

**Decisión.** Geist para interfaz y logotipo, Geist Mono para SKU, códigos y posiciones. Se autoalojan con `@fontsource-variable` (sin CDN externo: privacidad y funcionamiento sin Internet / Tauri). IBM Plex queda como alternativa si se busca más carácter industrial.

**Consecuencias.** El logotipo usa contornos derivados de Geist (permitido por OFL); los archivos fuente están en `brand/source-fonts/` con su licencia.
