# Motion & Memories — Phases 0 and 1 Implementation Plan

> **Execution (the user's standing rules, which override the generic handoff):** Phase 0 is one
> unit of sequential tasks — run it **inline with TDD**. Phase 1 is five units on disjoint files —
> run it as **turbo FULL**: show the unit breakdown and **wait for approval** before any builder
> starts, never `/batch`, `subagent-driven-development`, `executing-plans` or
> `dispatching-parallel-agents`. Review each phase with `turbo-reviewer`. Steps use checkbox syntax.

**Goal:** Make the public booking page feel inhabited and alive — real typefaces, a shared motion
language, a memory wall, a scroll story, a shared-element booking flow — without breaking
accessibility, performance or the phone ergonomics already guarded by tests.

**Architecture:** Phase 0 lays tokens, a small motion kit and a composition root
(`StorefrontPage`) so Phase 1's units each own separate files and merge with one-line edits.
Everything heavy loads by `import()` after mount and degrades to a complete static page.

**Tech Stack:** Next 15.5 (App Router), React 19, Tailwind 4, `gsap` 3.15 (Flip, Draggable,
InertiaPlugin, MorphSVGPlugin, DrawSVGPlugin, ScrollTrigger — all already installed), Vitest +
Testing Library, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-21-advanced-motion-and-memories-design.md`

## Global Constraints

- **No new dependencies.** (`three`/`@react-three/fiber` stay in `package.json`; removing them is a separate ask.)
- New JS in the initial route **≤ +10 KB gzipped**. Everything else by `import()` after mount, gated by `useMayAnimate`.
- Animate `transform`, `opacity`, `clip-path` and registered custom properties only. **Font axes:** `SOFT` may animate on headlines; `wght`, `opsz` and `WONK` never may — they change glyph widths and would reflow the line.
- Content and layout work with **no JS and no motion**; motion only adds.
- Anything a gesture does, a button also does (ADR 0003 §8). Tap targets ≥ 44px; inputs ≥ 16px.
- The storefront is light-only (`.storefront`); host portal keeps mocha.
- **No invented testimonials, counts or urgency.** Stock photos are never labelled as the studio's own memories. Real numbers only once they pass 25.
- **The allergies field stays visible on the booking form.** It is safety-critical; only the name-tag note may be disclosed.
- Fraunces on the storefront only; Young Serif / Nunito / Caveat elsewhere. **All fonts are self-hosted** (`next/font/local`), not fetched from Google.
- Copy claims nothing a class would have to keep (length, price, what you take home, firing).
- Phase 1 units do **not** edit `tokens.css` or `globals.css`: each owns `src/styles/units/<name>.css`, imported by its root component.
- Base branch: **local `feat/deploy-vercel` HEAD** (ahead of `origin`, which has none of the storefront work). Builders branch from it, never from `origin`. Pushing is the user's pending step.

## Review Focus

Failure modes the spec implies that no task would otherwise exercise, most likely first. Each has a
test named in the task that owns the code.

1. **Real fonts are wider than the fallbacks** — a headline or tab label can overflow at 375px on _any_ screen, host portal included. → T0.1 runs the sideways-scroll spec over every portal, guest and booking path.
2. **The gsap chunk fails to load** (offline, blocked, slow) — every effect must leave a complete page and no unhandled rejection. → T0.3 `loadGsap` returns `null`; 1A, 1B, 1C and 1E each test their component with it.
3. **A touch that starts on a tossable polaroid must still scroll the page.** → 1A.3 mobile e2e: a vertical swipe beginning on a polaroid changes `scrollY`; no horizontal overflow after a drag.
4. **Memory wall with 0, 1, 2 or very many items and very long captions** — no empty cells, no filter chips for one craft, lightbox works with one photo. → 1B.1–1B.4.
5. **View-transition double activation** — two fast taps, Back during a transition, Escape while the lightbox opens: exactly one `view-transition-name` at a time, no console error, consistent state. → 1B.4 and 1D.2.

## Gate

Run before every commit that closes a task (`G`), and the browser part at the end of each unit (`GB`).

```bash
# G — from Frontend/
npm run typecheck && npm run lint && npm test
git diff --name-only --diff-filter=AM | grep -E '\.(ts|tsx|css|md)$' | xargs npx prettier --check
# GB — one heavy command at a time on this machine; wait in its own call first
flock -w 540 /tmp/claude-1000/bbt-heavy.lock npx playwright test --workers=1 \
  --project=mobile --project=desktop e2e/booking.spec.ts e2e/a11y.spec.ts e2e/mobile.spec.ts \
  e2e/mobile-reach.spec.ts e2e/fonts.spec.ts e2e/reduced-motion.spec.ts \
  -g "booking|photo strip|sideways|44px|16px|keypad|pressed|forward arrow|fonts|reduced motion"
```

Expected: typecheck/lint clean, all unit tests pass, Playwright all pass (phone-only tests skip on desktop).
Only booking-page specs run; say which specs were skipped.

## File map

| Phase | Owner        | Creates / modifies                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | inline       | `src/fonts/*`, `src/app/layout.tsx`, `src/styles/{tokens.css,contrast.ts}`, `src/app/globals.css` (`.clay`), `src/lib/motion/*`, `src/components/motion/*`, `src/lib/public/{bookingCopy.ts,useScrollParallax.ts}`, `src/components/public/{BookingFlow,StorefrontPage}.tsx`, `src/components/public/booking/*`, `e2e/{fonts,reduced-motion}.spec.ts`, `e2e/helpers/booking.ts` |
| 1A    | unit         | `src/app/book/layout.tsx`, `BookingHero.tsx`, `PhotoFan.tsx`, `hero/DragToss.tsx`, `styles/units/hero.css`, `e2e/hero.spec.ts`                                                                                                                                                                                                                                                  |
| 1B    | unit         | `memories/*`, `lib/public/memories.ts`, `lib/public/api.ts` (types), `styles/units/memories.css`, `e2e/memories.spec.ts`                                                                                                                                                                                                                                                        |
| 1C    | unit         | `making/*`, `styles/units/making.css`, `e2e/making.spec.ts`                                                                                                                                                                                                                                                                                                                     |
| 1D    | unit         | `booking/*`, `BookingFlow.tsx`, `BookingFlow.test.tsx`, `styles/units/booking.css`                                                                                                                                                                                                                                                                                              |
| 1E    | unit         | `StorefrontBackdrop.tsx`, `StudioRibbon.tsx`, `HowItWorks.tsx`, `CraftChapters.tsx`, `CraftStickers.tsx`, `atmosphere/*`, `styles/units/atmosphere.css`, `e2e/atmosphere.spec.ts`                                                                                                                                                                                               |
| merge | orchestrator | `StorefrontPage.tsx` only — one line per unit (1B, 1C, 1E)                                                                                                                                                                                                                                                                                                                      |

---

# Phase 0 — Foundation (inline, sequential)

### Task T0.1: Typefaces self-hosted and read through their variables

> **Correction:** this task was first written as a bug fix ("the fonts never apply"). That was wrong. The live site's fonts load; only local dev and builds on this machine fell back to system fonts, because Node cannot reach Google. The task is still worth doing — it makes local match production, removes the Google build dependency, and uses the size-adjusted fallback — but it is hardening, not a fix.

**Files:**

- Create: `Frontend/src/fonts/{young-serif,nunito-variable,caveat-variable,fraunces-variable}.woff2`, `Frontend/src/fonts/CREDITS.md`
- Modify: `Frontend/src/app/layout.tsx` (`next/google` → `next/font/local`, same `variable` names), `Frontend/src/styles/tokens.css:119-121`
- Test: `Frontend/src/styles/fonts.test.ts`, `Frontend/e2e/fonts.spec.ts`

**Interfaces:**

- Produces: `--font-display-loaded`, `--font-body-loaded`, `--font-hand-loaded` set on `<html>`, consumed by `--font-display|body|hand`. Fraunces is downloaded here but wired in 1A.

- [ ] **Step 1: Ask permission to download** four latin `.woff2` files, all SIL OFL, from `fonts.gstatic.com`: Young Serif 27 KB, Nunito variable (wght 200–1000) 39 KB, Caveat variable (400–700) 75 KB, Fraunces variable 121 KB. Trim Fraunces to the axes used (`wght`, `SOFT`) if the file is over 80 KB. **Do not proceed without a yes.**
- [ ] **Step 2: Write the failing unit test** `fonts.test.ts`:
  - `every font token consumes the variable next/font defines` — for each of `display|body|hand`, `tokens.css` declares `--font-<x>: var(--font-<x>-loaded)` first, and `layout.tsx` contains `variable: '--font-<x>-loaded'`.
  - `loads from files in the repo, never from Google` — `layout.tsx` imports `next/font/local` and not `next/font/google`; every `path:` it names exists under `src/fonts`.
- [ ] **Step 3: Write the failing e2e** `fonts.spec.ts` (`/login`, no API needed): `await document.fonts.ready`, read the first family of each `--font-*-loaded`, assert `document.fonts.check('16px ' + family)` is true for all three. Expected before the fix: FAIL.
- [ ] **Step 4: Implement** — local font declarations in `layout.tsx` (`weight: '100 900'`-style ranges for variable files, `display: 'swap'`), tokens as `var(--font-x-loaded), <fallbacks>`.
- [ ] **Step 5: Overflow sweep (Review Focus 1)** — run `e2e/mobile.spec.ts -g "never scrolls sideways|never smaller than 12px"` on the **mobile** project over _every_ path, not only `/book`. Fix any overflow by letting text wrap in the offending component, never by shrinking type. Expected: pass.
- [ ] **Step 6:** Run `G`, then commit `build(fonts): self-host the typefaces and read them through their variables`.

### Task T0.2: Motion tokens, glass tokens, `.clay`

**Files:**

- Modify: `Frontend/src/styles/tokens.css`, `Frontend/src/styles/contrast.ts`, `Frontend/src/app/globals.css` (utility)
- Test: `Frontend/src/styles/motion-tokens.test.ts`, `Frontend/src/styles/glass.test.ts`

**Interfaces:**

- Produces: `--dur-fast: 150ms`, `--dur-base: 280ms`, `--dur-slow: 600ms`; `--ease-out-expo`; `--ease-spring-soft`, `--ease-spring-bouncy` (CSS `linear(…)` curves sampled from a damped spring; soft ≈ ζ 0.8, bouncy ≈ ζ 0.45); `--glass-bg: rgb(255 253 250 / 72%)`, `--glass-border`, `--glass-blur: 14px`; `.clay` utility; `composite(fg: string, alpha: number, bg: string): string` (hex over hex, in `contrast.ts`).

- [ ] **Step 1: Failing tests.** `motion-tokens.test.ts`: durations are ms and ascend `fast < base < slow`; both springs start with `linear(`; `--ease-spring` (existing) untouched; `globals.css` defines `.clay`. `glass.test.ts`: `composite('#ffffff', 0.5, '#000000') === '#808080'`; and `ratio(--color-cocoa, composite(paper, 0.72, X)) ≥ 4.5` and the same for `--color-rose-ink`, for X in blush, butter-soft, sage-soft, terra-soft, pink.
- [ ] **Step 2: Run** `npx vitest run src/styles` — Expected: FAIL (tokens missing).
- [ ] **Step 3: Implement** the tokens, `composite()`, and `.clay` (inner top highlight, inner bottom shade, soft outer shadow; `:active` presses it 1px and shortens the shadow; its glow colour reads `--clay-glow`).
- [ ] **Step 4:** `G` — Expected: pass, including `storefront.test.ts` (glass tokens are not `--color-*`, so the pin is unaffected).
- [ ] **Step 5: Commit** `feat(tokens): motion, glass and clay`.

### Task T0.3: The motion kit

**Files:**

- Create: `src/lib/motion/{gsap,haptics,viewTransition,useTilt,index}.ts`, `src/components/motion/{Reveal,SplitHeading,Tilt}.tsx`, a `*.test.ts(x)` beside each
- Modify: `src/lib/public/useScrollParallax.ts` (use `loadGsap` instead of its own `import()`s)

**Interfaces — Produces:**

```ts
export type GsapPluginName =
  'ScrollTrigger' | 'Flip' | 'Draggable' | 'InertiaPlugin' | 'MorphSVGPlugin' | 'DrawSVGPlugin';
// PluginExports (defined in gsap.ts) maps each plugin name to the value its module exports, e.g. Flip → typeof import('gsap/Flip').Flip
export type GsapKit<N extends GsapPluginName> = { gsap: typeof import('gsap').gsap } & {
  [K in N]: PluginExports[K];
};
export function loadGsap<N extends GsapPluginName>(...plugins: N[]): Promise<GsapKit<N> | null>;
export type HapticKind = 'tap' | 'success';
export function haptic(kind: HapticKind): void;
export function withViewTransition(update: () => void): Promise<void>;
export function Reveal(p: {
  children: ReactNode;
  as?: ElementType;
  delayMs?: number;
  distance?: number;
  className?: string;
}): JSX.Element;
export function SplitHeading(p: {
  text: string;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  staggerMs?: number;
  startDelayMs?: number;
}): JSX.Element;
export function Tilt(p: {
  children: ReactNode;
  maxDeg?: number;
  glare?: boolean;
  className?: string;
}): JSX.Element;
export { useMayAnimate } from '@/lib/public/useMayAnimate';
```

Consumes: `useMayAnimate`, `prefersReducedMotion`, `useRevealOnScroll`.

- [ ] **Step 1: Failing tests, one file each:**
  - `gsap.test.ts` — the import factory runs once for repeated calls with the same plugins; **resolves `null`** (and warns once, no unhandled rejection) when a plugin import rejects.
  - `haptics.test.ts` — with `navigator.vibrate` mocked: `tap` → `vibrate(10)`, `success` → `vibrate([12, 40, 18])`; not called under reduced motion; not called when `(pointer: coarse)` is false; no throw when `vibrate` is missing.
  - `viewTransition.test.ts` — with `document.startViewTransition` mocked to invoke its callback: `update` runs exactly once, inside it; without the API: `update` runs synchronously; reduced motion: runs without the API even if present; a rejected `finished` (AbortError) is swallowed.
  - `Reveal.test.tsx` — content is present and not `opacity-0` under reduced motion; visible when `IntersectionObserver` is absent.
  - `SplitHeading.test.tsx` — accessible name is the full text; `"Maison Abeer"` renders 11 `[data-letter]` spans, all inside an `aria-hidden` wrapper; words are `nowrap` so wrapping happens only between words; `staggerMs` produces strictly increasing `animation-delay`s.
  - `Tilt.test.tsx` — `pointermove` sets `--rx`/`--ry` within `±maxDeg`; `pointerleave` resets to `0`; no listeners are attached under reduced motion or a coarse pointer.
- [ ] **Step 2: Run** `npx vitest run src/lib/motion src/components/motion` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** each module to its signature. `loadGsap`: memoise per sorted plugin set, `registerPlugin`, catch → `null`. `SplitHeading`: split with `Array.from(text)` in React (server-rendered, no library). `Tilt`: rAF-throttled, CSS 3D via `perspective` + `rotateX/Y`, glare as a radial-gradient overlay driven by `--gx/--gy`.
- [ ] **Step 4: Migrate `useScrollParallax`** to `loadGsap('ScrollTrigger')`; `if (!kit) return`.
- [ ] **Step 5:** `G` — Expected: pass.
- [ ] **Step 6: Commit** `feat(motion): loadGsap, haptic, withViewTransition, Reveal, SplitHeading, Tilt`.

### Task T0.4: The reduced-motion guard

**Files:**

- Create: `Frontend/e2e/reduced-motion.spec.ts`, `Frontend/e2e/helpers/booking.ts` (extract `stubBookingApi` from `a11y.spec.ts`; accept a class list)
- Modify: `Frontend/e2e/a11y.spec.ts` (import the helper)

- [ ] **Step 1: Write the test.** `with reduced motion nothing on the storefront is animating once it has settled`: emulate `reduce`, stub **three** classes, load, scroll to the bottom in steps, wait 1.5 s, assert `document.getAnimations().filter(a => a.playState === 'running')` is empty **and** an idle `requestAnimationFrame` counter (installed via `addInitScript`) rose by ≤ 2 in 1 s. Sanity twin: with motion allowed, running animations `> 0`.
- [ ] **Step 2: Prove it can fail.** Temporarily comment out the `@media (prefers-reduced-motion: reduce)` block in `tokens.css`; run the spec — Expected: FAIL. Restore the block.
- [ ] **Step 3:** Run `GB` — Expected: pass.
- [ ] **Step 4: Commit** `test(e2e): nothing animates under reduced motion`.

### Task T0.5: Split `BookingFlow.tsx` into a composition root

**Files:**

- Create: `src/lib/public/bookingCopy.ts`, `src/components/public/StorefrontPage.tsx`, `src/components/public/booking/{ClassPicker,DetailsStep,Field,Confirmation,TicketStub,LoadingClasses,StorySection}.tsx`
- Modify: `src/components/public/BookingFlow.tsx` (state and fetch only)
- Test: `src/lib/public/bookingCopy.test.ts`; the existing `BookingFlow.test.tsx` passes **unchanged**

**Interfaces — Produces:**

```ts
export function formatDay(iso: string): string;
export function formatTime(iso: string): string;
export function seatCopy(item: PublicClass): { text: string; urgent: boolean };
export const ACCENT: Record<string, { bar: string; hoverGlow: string }>;
export function accentFor(token: string): { bar: string; hoverGlow: string };
export interface StorefrontPageProps {
  children: ReactNode;
  studioName?: string;
  handle?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  heroPhotoUrl?: string | null;
  story?: string | null;
  step?: 1 | 2 | 3;
  showBrandSections?: boolean;
  classes?: PublicClass[];
}
export function StorefrontPage(p: StorefrontPageProps): JSX.Element; // today's `Shell`
```

Component signatures under `booking/` are exactly today's (`ClassPicker({classes,onPick})`, `DetailsStep({slug,item,onBack,onDone})`, `Confirmation({result,token})`, `TicketStub({current})`, `LoadingClasses()`, `StorySection({story})`).

- [ ] **Step 1: Failing test** `bookingCopy.test.ts` — full class → `{ text: 'Fully booked · join the waitlist', urgent: false }`; `seats_left: 1` → `'Last seat!'`, urgent; `3` → `'Only 3 seats left'`, urgent; `4` → `'4 seats left'`, not urgent.
- [ ] **Step 2: Move code verbatim** — no behaviour or styling change. `StorefrontPage` lists its sections in one array-like JSX block so later units add a line each.
- [ ] **Step 3:** `G` and `GB` — Expected: all existing tests pass unchanged; `wc -l BookingFlow.tsx` < 150.
- [ ] **Step 4: Commit** `refactor(booking): split BookingFlow into a composition root and step components`.

**Phase 0 exit:** a face with each family reaches `loaded`, nothing scrolls sideways at 375px on any route, the kit is tested, nothing animates under reduced motion. There is **no visible change** on production from Phase 0; locally, the page now shows the real typefaces.

---

# Phase 1 — Storefront v2 (turbo FULL, five units in parallel)

After Phase 0, show this breakdown and **wait for approval**. Each builder works in its own worktree cut from local `feat/deploy-vercel`, edits only the files it owns, writes tests in its own new files, and reports a summary of ≤ 1,500 tokens.

### Unit 1A — Hero and typography

**Consumes:** `SplitHeading`, `Tilt`, `loadGsap('Draggable','InertiaPlugin')`, `.clay`.
**Produces:** `DragToss(p: { children: ReactNode; boundsRef: RefObject<HTMLElement | null>; className?: string }): JSX.Element`.

- [ ] **1A.1 Fraunces on the storefront only.** `app/book/layout.tsx` loads `fraunces-variable.woff2` (`variable: '--font-storefront-display-loaded'`) and wraps children in a div setting `--font-display: var(--font-storefront-display-loaded), Georgia, serif`. Tests: layout renders children inside that wrapper; e2e — storefront `h1` family is Fraunces and `document.fonts.check` is true; **`/login` makes no request for the Fraunces file**.
- [ ] **1A.2 Headline wakes up.** `BookingHero`'s `h1` becomes `SplitHeading`; `hero.css` animates `font-variation-settings: "SOFT" 0 → "SOFT" 100` per letter with stagger. Tests: a `hero.css` text test asserts **no `wght`, `opsz` or `WONK` inside any `@keyframes`**; computed end state contains `"SOFT" 100`.
- [ ] **1A.3 Tossable polaroids.** `DragToss` creates `Draggable` (`type:'x,y'`, `inertia:true`, `bounds: boundsRef`, `edgeResistance:0.85`, `allowNativeTouchScrolling:true`, `dragClickables:false`), brings the card to front on press, kills it on unmount, sets `touch-action: pan-y`. Wrap each `PhotoFan` polaroid. Tests: renders its child when `loadGsap` → `null` (**Review Focus 2**); unmount calls `kill`; **mobile e2e (Review Focus 3):** a vertical swipe starting on a polaroid increases `scrollY`, and after a drag `scrollWidth ≤ clientWidth`; desktop e2e: dragging changes the card's bounding box and it stays inside the fan.
- [ ] **1A.4 Ticket chip and CTA.** Wrap `NextClassChip` in `Tilt` with glare; give the primary CTA `.clay`. Tests: chip is inside a `Tilt`; CTA has `clay`; existing hero tests unchanged.
- [ ] **1A.5:** `G`, `GB`, `e2e/hero.spec.ts`. Commit.

### Unit 1B — Memory wall

**Consumes:** `buildMemories` input from `craftsIn`/`photosOfCrafts`, `withViewTransition`, `loadGsap('Flip')`, `useDismissable`, `Reveal`.
**Produces:**

```ts
export interface PublicMemory {
  id: string;
  photo_url: string;
  caption: string;
  craft: 'pottery' | 'cake' | 'painting' | null;
}
export interface PublicWord {
  id: string;
  word: string;
}
// PublicClassList gains optional: memories?: PublicMemory[]; words?: PublicWord[]   (api.ts, types only)
export interface Memory {
  id: string;
  photo: { src: string; small?: string; width: number; height: number; alt: string; tone: string };
  caption: string;
  craft: CraftKind | null;
  origin: 'studio' | 'craft';
}
export function buildMemories(
  crafts: readonly CraftKind[],
  studio: readonly PublicMemory[] | undefined,
): { heading: string; eyebrow: string; items: Memory[] };
export function MemoryWall(p: {
  classes: PublicClass[];
  memories?: PublicMemory[];
  words?: PublicWord[];
}): JSX.Element | null;
```

- [ ] **1B.1 `buildMemories`.** Tests: no studio memories → `origin:'craft'`, heading `"What you'll make here"`, items only of crafts on offer; any studio memories → `origin:'studio'`, heading `"Memories from the studio"`, **no stock mixed in**; no crafts and no studio memories → `items: []` and `MemoryWall` renders `null` (**Review Focus 4**).
- [ ] **1B.2 Tiles and bento.** A tile is a `button` named by its caption; portrait tiles span two rows (`data-span`); a heart button toggles `aria-pressed`, persisted in `localStorage` inside `try/catch`, and **no count is ever rendered**. Tests for each.
- [ ] **1B.3 Filter chips with Flip.** Chips only when ≥ 2 crafts are present; `aria-pressed`; filtering sets `hidden` on tiles and animates with `Flip` when motion is allowed, instantly otherwise. Tests: one craft → no chips; two → chips; reduced motion → no `loadGsap` call.
- [ ] **1B.4 Lightbox.** `useDismissable` for Escape/focus/trap; opens via `withViewTransition`; the clicked tile carries `view-transition-name: memory` until close, so **at most one element has it** (**Review Focus 5**); ←/→ navigate; with one item there is no navigation. Tests: Escape returns focus to the tile; double-activation opens once; names unique.
- [ ] **1B.5 `WordWall`.** Renders nothing when `words` is empty/undefined; otherwise word-stickers (text only, truncated to 24 chars). Test both.
- [ ] **1B.6:** `G`, `GB`, `e2e/memories.spec.ts` (0, 1, 2, 12 items; long caption; keyboard-only lightbox; axe). Add the one `MemoryWall` line to `StorefrontPage` after `CraftChapters`. Commit.

### Unit 1C — The making of

**Consumes:** `loadGsap('ScrollTrigger','MorphSVGPlugin')`, `useMayAnimate`.
**Produces:**

```ts
export const MAKING_STAGES: readonly {
  id: 'lump' | 'centred' | 'opened' | 'pulled';
  caption: string;
  path: string;
}[]; // 4 entries, shared viewBox 0 0 200 240
export function stageForProgress(progress: number): 0 | 1 | 2 | 3; // <.25→0, <.5→1, <.75→2, else 3; clamped; NaN→0
export function MakingOf(): JSX.Element;
```

Captions: "A lump of clay", "Centred on the wheel", "Opened up", "Pulled into shape".

- [ ] **1C.1** `stageForProgress` table test (including −1, 0, 0.25, 0.4999, 0.75, 1, 2, NaN).
- [ ] **1C.2 Static first.** `MakingOf` always renders four captioned frames (for screen readers, no-JS, reduced motion, and `loadGsap` → `null`). Tests: four captions in the DOM in every mode; no `[data-pinned]` under reduced motion or a null kit.
- [ ] **1C.3 Pinned scrub.** Motion allowed and `≥ 768px`: ScrollTrigger pins the section (`end: '+=250%'`, `scrub: 0.6`) and one path morphs through the stages; below `768px` nothing is pinned and each stage morphs as it enters view. Tests (mocked kit): pin created only at `≥ 768px`; cleaned up on unmount.
- [ ] **1C.4 Replace the vase.** One-line swap in `StorefrontPage`: `CeramicShowcase` → `MakingOf`. **Do not delete** the old files. e2e: scrolling the whole page never sets `window.__THREE__` (three never loaded); desktop scroll-through ends on the vase stage with no sideways scroll; axe with and without reduced motion.
- [ ] **1C.5:** `G`, `GB`, `e2e/making.spec.ts`. Commit.

### Unit 1D — Booking card

**Consumes:** `withViewTransition`, `haptic`, `.clay`, `DateLeaf`.

- [ ] **1D.1 Shaped skeleton.** `LoadingClasses` shows three ticket-shaped placeholders with a shimmer; `role="status"` with sr-only "Loading classes"; static under reduced motion. Test.
- [ ] **1D.2 Shared-element step change.** `ClassPicker` calls `withViewTransition(() => onPick(item))`; the picked card's `DateLeaf` has `view-transition-name: class-leaf` and so does the details stub; a ref guard ignores a second activation. Tests: `withViewTransition` called once per pick even on a double click; at most one element carries the name (**Review Focus 5**); back reverses it.
- [ ] **1D.3 Clay.** Submit button gets `.clay`; inputs get an inset focus treatment; 48px height and 16px font stay. The existing 44px and iOS-zoom e2e specs stay green.
- [ ] **1D.4 Disclosure, with allergies visible.** The name-tag note sits behind a button (`aria-expanded`, `aria-controls`) "Anything fun for your name tag?"; opening focuses the field. Tests: the **allergies textbox is present with no interaction**; the note textbox is absent until opened; its value is sent as `note`. Update the one `BookingFlow.test.tsx` assertion that expects the note label to be visible.
- [ ] **1D.5 Celebration.** The check draws on via CSS `stroke-dashoffset`; confetti becomes 24 CSS pieces with fixed per-piece `--dx/--dy/--rot/--delay`; `haptic('success')` fires **once** (ref guard against StrictMode's double effect). Tests: haptic called once; confetti hidden under reduced motion; check is fully drawn statically.
- [ ] **1D.6:** `G`, `GB`. Commit.

### Unit 1E — Atmosphere and chapters

**Consumes:** `--glass-*`, `loadGsap('MorphSVGPlugin')`, `Reveal`.
**Produces:** `StickyCta(): JSX.Element` (`atmosphere/StickyCta.tsx`), `StickerMorph(p: { className?: string }): JSX.Element`.

- [ ] **1E.1 Aurora.** `@property --aurora-shift` (`<percentage>`, `inherits: false`) animates the stop positions of the top wash only. Tests: `atmosphere.css` registers it; the T0.4 guard covers reduced motion.
- [ ] **1E.2 Native scroll-driven reveals.** Under `@supports (animation-timeline: view())` chapter text reveals with no JS and `useRevealOnScroll` is bypassed there (no double animation); otherwise unchanged. e2e (Chromium): a chapter's text opacity differs at two scroll positions.
- [ ] **1E.3 Stacking chapters** at `≥ md`: each chapter `position: sticky`, the previous scaling to `.94` via scroll-driven animation; normal flow elsewhere. e2e: after scrolling to each chapter, `document.elementFromPoint` at its "Save a seat" link's centre returns that link (nothing covers it).
- [ ] **1E.4 Glass and the sticky bar.** Ribbon and ticket stub use `--glass-*`. `StickyCta` appears once the hero has left the view, hides while `#booking-widget` is visible, pads for `env(safe-area-inset-bottom)`, is ≥ 44px tall, and is hidden at `md+`. Tests with a mocked `IntersectionObserver` for each condition.
- [ ] **1E.5 `StickerMorph`.** Cake ↔ pot ↔ palette morph as chapters change; first frame only under reduced motion or a `null` kit. Test both.
- [ ] **1E.6:** `G`, `GB`, `e2e/atmosphere.spec.ts`. Add the `StickyCta` line to `StorefrontPage`. Commit.

### Merge and Phase 1 gate (orchestrator)

- [ ] Merge units; resolve the three one-line `StorefrontPage.tsx` edits (1B, 1C, 1E).
- [ ] **Perf measurement:** add `e2e/perf-scroll.spec.ts` against a production build (own `NEXT_DIST_DIR`), 4× CPU throttle, scripted scroll top-to-bottom, recording `longtask` entries and dropped frames. Record the baseline from `main` of Phase 0, then set the budget at baseline + 20%. This replaces `hero-perf.spec.ts`; **ask before deleting it.**
- [ ] Run `G` and the full booking `GB`; run `turbo-reviewer` adversarially across the merged branch.
- [ ] Look at the page in a real browser at 375px and desktop width. Show the user. **Stop for review.**

---

# Phases 2–4 (outline only — detailed plans are written after Phase 1 is reviewed)

- **Phase 2 — Guest portal and login:** view-transition route changes, card tilt, staggered lists, shaped skeletons. Units: login; portal home + workshop; chat.
- **Phase 3 — Host portal:** sliding tab-bar indicator, bento Today with count-ups, calendar week change by Flip, list stagger, density toggle; the Fraunces decision is made again here. Units: shell/nav; Today; calendar; guests; settings/tags/wrapped. ADR 0003's occlusion, reach and 44px specs must pass unchanged.
- **Phase 4 — Memories pipeline:** `memory` table and consent + approval on feedback; _Settings → Memories_; host approval queue; and the public payload's live counts (classes held, guests welcomed), shown only above 25. **Migrations need an explicit go.**
