# ADR 0002 — Porting the Maison Abeer palette to WCAG AA

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

`creative-workshop-portal-design.html` is the visual source of truth and its palette is central
to the product's positioning — the PRD makes the emotional register a requirement, not polish,
and measures it directly ("does the app feel like part of your brand?", §4).

The same PRD requires **WCAG 2.1 AA with 4.5:1 for body text**, and explicitly warns against
"pale-on-pale" (§3.4).

Measuring every foreground/background pair in the prototype found seven failures:

| Pair | Ratio |
|---|---|
| white on `--pink` (active nav) | 1.86:1 |
| `--rose` as text on paper | 2.58:1 |
| white on `--rose` (primary button) | 2.62:1 |
| `.chip-pink` ink on blush | 3.50:1 |
| `.chip-sage` ink on sage-soft | 3.50:1 |
| `.chip-warn` ink (allergy chip) | 3.92:1 |
| `--latte` muted text | 4.27:1 |

The allergy chip failing matters operationally, not just legally — the PRD routes a guest's nut
allergy through that component (§2.4).

## Options considered

**Darken the fills, preserving hue.** Mechanically correct and easy to compute, but drives
`--pink #F2AABE` to `#DF2C5E` to carry white text — a hot fuchsia that abandons the soft pastel
identity the whole product is built on. Rejected.

**Flip the ink instead of the fill.** Keep every pastel exactly as drawn and change the text
sitting on it from white to `--cocoa #40302A`.

## Decision

Flip the ink. No fill colour changes.

| Fix | Before | After |
|---|---|---|
| Button/nav text on `--rose`: white → `--cocoa` | 2.62:1 | **4.80:1** |
| Active nav text on `--pink`: white → `--cocoa` | 1.86:1 | **6.73:1** |
| New `--rose-ink #B44363` for all rose-coloured *text* | 2.58:1 | **5.27:1** paper · 5.08 buttercream · 4.52 blush |
| `.chip-sage` ink → `#5F714D` | 3.50:1 | **4.51:1** |
| `.chip-warn` ink → `#BB463D` | 3.92:1 | **4.53:1** |
| `--latte` muted text → `#866E60` | 4.27:1 | **4.52:1** |

A single new token, `--rose-ink`, covers rose-coloured text on all three light surfaces, so
authors never have to pick between variants by background.

Dark ink on a pastel fill also reads as deliberately art-directed rather than as a default
primary button, which serves the design intent as well as the requirement. Every swatch on the
prototype's style-guide screen renders unchanged.

## Enforcement

`Frontend/src/styles/contrast.test.ts` parses `tokens.css` and asserts every documented pair
meets 4.5:1. The palette cannot regress without failing CI.

Behaviour already correct in the prototype is preserved verbatim: `prefers-reduced-motion`
disables all animation and hides confetti, and `:focus-visible` renders a 3px rose outline.
