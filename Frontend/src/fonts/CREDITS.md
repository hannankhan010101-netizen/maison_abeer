# Typefaces

Self-hosted, latin subset, all under the [SIL Open Font License 1.1](https://openfontlicense.org).
Downloaded 2026-10-21 from fonts.gstatic.com (Google Fonts) and loaded by `next/font/local`
so the app neither depends on Google at build time nor sends a guest to a third party.

| File                      | Family                                                                                | Used for                                        |
| ------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `young-serif.woff2`       | [Young Serif](https://fonts.google.com/specimen/Young+Serif)                          | Display headings (host portal and guest portal) |
| `nunito-variable.woff2`   | [Nunito](https://fonts.google.com/specimen/Nunito) (`wght` 200–1000)                  | Body text                                       |
| `caveat-variable.woff2`   | [Caveat](https://fonts.google.com/specimen/Caveat) (`wght` 400–700)                   | The handwritten asides                          |
| `fraunces-variable.woff2` | [Fraunces](https://fonts.google.com/specimen/Fraunces) (`wght` 100–900, `SOFT` 0–100) | Storefront display headings                     |
| `fraunces-og.woff`        | [Fraunces](https://fonts.google.com/specimen/Fraunces) (static, `opsz` 144, `wght` 600)  | The share card only (`next/og` reads no WOFF2)  |

Fraunces is requested with only the two axes the design uses; its `opsz` and `WONK` axes are left
out to keep the file at about 62 KB. Of its axes only `SOFT` may be animated — `wght` changes glyph
widths and would reflow the line.

Latin only: a guest name outside that range falls back to the system font for those glyphs.
