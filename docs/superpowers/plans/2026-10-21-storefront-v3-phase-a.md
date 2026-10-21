# Storefront v3 — Phase A Implementation Plan

> **For agentic workers:** This plan executes as **turbo FULL** (the owner's standing rule for
> multi-unit work): the orchestrator builds S0 and the integration tasks inline with TDD; units
> A1–A7 go to turbo-builders in their own worktrees, in two batches; an independent turbo-reviewer
> reads the merged result. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public booking page into a 2026 shop window — a kinetic promise under the name, a
floating glass pill, a photo budget with honest labels, a making-of worth its scroll, a bigger
footer, and a share card — without a new dependency or a slower first paint.

**Architecture:** Every unit exports a component or a pure helper and never edits
`StorefrontPage.tsx`; the orchestrator wires the page once at integration. Motion is CSS first
(transitions, `@property`, scroll timelines under `@supports`), GSAP only where it already is
(making-of morph, fan toss). Pure helpers (`photoBudget`, `craftVerbs`, `format`, `bookingCopy`,
`metadata`) carry the decisions and are unit-tested exactly; components are tested for what they
render; browsers are tested by Playwright at 375px and 1280/1440px.

**Tech Stack:** Next.js 15.5 (App Router), React 19, Tailwind v4 + `tokens.css`, GSAP 3.15, Lenis,
Vitest + Testing Library (jsdom), Playwright 1.62 (projects `mobile`, `tablet`, `desktop`),
`next/og` for the share card.

**Spec:** `docs/superpowers/specs/2026-10-21-storefront-v3-shop-window-design.md` — read it first;
the plan argues from it.

## Global Constraints

- No new runtime dependency. No Framer Motion, Lottie, Rive. `three` stays installed until the
  owner says otherwise (its removal is a separate ask).
- Initial-route JS for `/book/[slug]` grows by **≤ 8 KB gzipped** (measured with `next build`).
- Only Fraunces' `SOFT` axis may animate (`hero-css.test.ts` enforces it).
- No invented number, quote or count anywhere. Stock photographs are never labelled the studio's own.
- Allergies field stays visible on the booking form.
- Animate `transform`, `opacity`, `clip-path` and registered custom properties only. Every effect has
  a reduced-motion end state; new CSS motion sits under `@media (prefers-reduced-motion: no-preference)`.
- Touch targets ≥ 44px (`--tap-min`), inputs ≥ 16px, WCAG AA on every ink/surface pair (`contrast.test.ts`,
  `glass.test.ts`).
- No sideways scroll at 375px, with or without a studio story.
- Vocabulary: a **craft** is a class type by colour token (`craftOf`); a **class** is one dated session.
- Builds and verification runs use `NEXT_DIST_DIR=.next-build` so they never tread on the dev server
  on 3010. Heavy commands (vitest whole-suite, `next build`, Playwright) go under
  `flock -w 540 /tmp/claude-1000/bbt-heavy.lock`, with the `pgrep` wait in its own Bash call first.
- Branch from the **local** `feat/deploy-vercel` HEAD (origin lacks the storefront work). Builders work
  in their own worktrees on `turbo/a<n>-<name>` branches, edit only the files their unit owns, and
  commit with conventional lowercase messages ending in
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Commands below run from `Frontend/` unless stated.

## Review Focus

1. **A studio with no upcoming classes** (`classes: []`): the promise line must say "make", the pill
   must show no next-class brief, the stub no seats line, the footer no crafts column — never
   "undefined" or an empty pill. Tests: Task 6 (`verbsFor([])`), Task 21, Task 25, Task 27.
2. **A long studio name** (≥ 28 characters, e.g. "The Buttercream & Clay Collective"): the pill's
   wordmark truncates with an ellipsis inside a 44px pill and the share card drops to a smaller
   size. Tests: Task 21 (CSS `text-overflow`), Task 31 (size step).
3. **A story over 300 characters:** the description cuts at a word boundary under 160 characters,
   and the story section still clips its pattern. Tests: Task 29, Task 3.
4. **Reduced motion and Data Saver** (`useMayAnimate() === false`): static verb, pill with no
   transition, footer stroke drawn, making-of frames finished, no CSS animation running. Tests:
   Task 7, Task 22, Task 28, Task 19, plus `e2e/reduced-motion.spec.ts` extended in Task 35.
5. **A browser without scroll timelines** (`animation-timeline` unsupported): the specular sweep is
   static, the pill still appears via the observers, no console errors. Tests: Task 22 (CSS gated
   under `@supports`), Task 23 (desktop spec passes in the `desktop` project regardless of support).

---

## Batch plan

| Order              | Tasks | Who                                   |
| ------------------ | ----- | ------------------------------------- |
| S0 scaffold        | 1–5   | orchestrator, sequential              |
| Batch 1 (parallel) | 6–20  | A2 hero, A3 budget, A4 making-of      |
| Batch 2 (parallel) | 21–32 | A1 pill, A5 card, A6 footer, A7 share |
| Integration        | 33–37 | orchestrator                          |

Builders in Batch 2 branch from the merge of Batch 1. Each builder's gate: `npm run typecheck`,
`npx vitest run <its files>`, `npx playwright test <its spec> --project=mobile --project=desktop`,
all under the flock.

---

## S0 — scaffold (orchestrator)

### Task 1: The section-gap token

**Files:**

- Modify: `src/styles/tokens.css` (after `--tab-bar-border`)
- Modify: `src/components/public/StorefrontPage.tsx:93` (`space-y-14 pt-10 pb-4 sm:space-y-20 sm:pt-14`)
- Test: `src/styles/tokens.test.ts`, `src/components/public/StorefrontPage.test.tsx`

**Interfaces:**

- Produces: `--section-gap: clamp(56px, 9vw, 112px)` on `:root`; the sections wrapper class
  `flex flex-col gap-[var(--section-gap)] pt-[var(--section-gap)] pb-4`.

- [ ] **Step 1: Write the failing tests**

```ts
// tokens.test.ts
it('names one vertical rhythm for the storefront', () => {
  expect(css).toMatch(/--section-gap:\s*clamp\(56px,\s*9vw,\s*112px\)/);
});
// StorefrontPage.test.tsx
it('spaces its sections with the section-gap token, not per-section margins', () => {
  render(<StorefrontPage studioName="Maison Abeer" showBrandSections classes={[potteryClass]}>x</StorefrontPage>);
  const wrapper = screen.getByRole('heading', { name: 'How it works' }).closest('section')!.parentElement!;
  expect(wrapper.className).toContain('gap-[var(--section-gap)]');
  expect(wrapper.className).not.toMatch(/space-y-/);
});
```

- [ ] **Step 2: Run them** — `npx vitest run src/styles/tokens.test.ts src/components/public/StorefrontPage.test.tsx` → both FAIL.
- [ ] **Step 3: Add the token and swap the wrapper classes.**
- [ ] **Step 4: Run again** → PASS. Run `npx vitest run src/styles` → PASS (`storefront.test.ts` holds `.storefront` to the colour tokens only; `--section-gap` is not a colour, so it must not be required there — if it fails, exclude non-colour tokens in that test's filter, not by restating the token in `.storefront`).
- [ ] **Step 5: Commit** — `feat(storefront): one section-gap token for the page's rhythm`.

### Task 2: The chapter behind fades as the next arrives

**Files:**

- Modify: `src/styles/units/atmosphere.css:143-150` (`@keyframes chapter-settle`)
- Test: `src/components/public/atmosphere/atmosphere-css.test.ts`

- [ ] **Step 1: Failing test** — `chapter-settle ends at scale(0.94) translateY(-8px) and opacity 0.5`:
      regex the keyframes block for `scale\(0\.94\)`, `translateY\(-8px\)`, `opacity:\s*0\.5`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** change the `to` frame; `from` gains `opacity: 1`.
- [ ] **Step 4: Run** → PASS. `npx playwright test e2e/atmosphere.spec.ts --project=desktop` → PASS.
- [ ] **Step 5: Commit** — `style(chapters): the chapter behind dims as the next arrives`.

### Task 3: StorySection clips its pattern — with the spec that proves it

**Files:**

- Modify: `src/components/public/booking/StorySection.tsx:23` (`<section ref={ref} className="relative px-5 sm:px-8">`)
- Create: `e2e/story-overflow.spec.ts`
- Test: `src/components/public/booking/StorySection.test.tsx` (create)

- [ ] **Step 1: Write the e2e spec** (mobile project): stub `**/api/v1/public/**` with one class and
      `story: 'A small studio above the bakery, where Saturday mornings smell of clay and sugar.'`,
      goto `/book/maison-abeer`, wait for the story text, scroll to the bottom, assert
      `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
- [ ] **Step 2: Run** — `npx playwright test e2e/story-overflow.spec.ts --project=mobile` → FAIL (468 > 375). Keep the failing output in the commit message.
- [ ] **Step 3: Unit test:** `renders the pattern inside a clipped section` — the section's class list contains `overflow-hidden`.
- [ ] **Step 4:** add `overflow-hidden` to the section. Run unit → PASS; run the spec → PASS.
- [ ] **Step 5: Commit** — `fix(story): clip the pattern so a story never scrolls the phone sideways`.

### Task 4: Login — the orphan sparkle and the example label

**Files:**

- Modify: `src/app/(auth)/login/page.tsx:390` (`Your studio bestie ✨`) and `:350-351` (the example card)
- Test: `src/app/(auth)/login/page.test.tsx` if present, else `src/components/ui/ui.test.tsx` gains two cases

- [ ] **Step 1: Tests** — the headline renders `bestie ✨` inside a `whitespace-nowrap` span; the example card contains the handwritten text `for example` (`font-hand`).
- [ ] **Step 2: Run** → FAIL. **Step 3:** wrap the last word and the emoji; add `<p className="font-hand text-latte text-sm">for example</p>` above the seat count.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `fix(login): keep the sparkle with its word; call the example card an example`.

### Task 5: Record the baseline and cut the builders' base

- [ ] **Step 1:** wait for other heavy commands (separate Bash call: `pgrep -f '[n]ext build|[p]laywright|[v]itest'`), then under the flock run `npx playwright test --config playwright.perf.config.ts` and `NEXT_DIST_DIR=.next-build npx next build`; record in this file under "Baseline" the perf guard score, the First Load JS of `/book/[slug]`, and the page height at 1440 and 375 for one craft (from `shoot.mjs`).
- [ ] **Step 2:** `npm run typecheck && npm run lint && npx vitest run` → all green.
- [ ] **Step 3: Commit** any formatting; tag the commit in the turbo plan as the base for Batch 1.

**Baseline (fill in):** perf guard —/5 · First Load JS — kB · height 1440 — px · 375 — px.

---

## Unit A2 — Hero v3 (builder)

### Task 6: Craft verbs

**Files:**

- Create: `src/lib/public/craftVerbs.ts`, `src/lib/public/craftVerbs.test.ts`

**Interfaces:**

- Consumes: `CraftKind`, `craftsIn` from `@/lib/public/studioPhotos`.
- Produces: `export const CRAFT_VERBS: Record<CraftKind, readonly [string, string, string]>` =
  pottery `['throw', 'centre', 'trim']`, cake `['pipe', 'frost', 'swirl']`, painting `['paint', 'dab', 'glaze']`;
  `export const FALLBACK_VERB = 'make'`;
  `export function verbsFor(crafts: readonly CraftKind[]): string[]` — the crafts' verbs
  interleaved (first verb of each craft, then second of each, then third) so a three-craft roll
  changes craft every word; `[]` → `[FALLBACK_VERB]`.

- [ ] **Step 1: Failing tests** — `verbsFor(['pottery'])` → `['throw','centre','trim']`;
      `verbsFor(['cake','pottery'])` → `['pipe','throw','frost','centre','swirl','trim']`; `verbsFor([])` → `['make']`;
      every verb is lowercase and ≤ 6 characters (the roll's width lock).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** — `feat(hero): the verbs each craft is made of`.

### Task 7: VerbRoll

**Files:**

- Create: `src/components/public/hero/VerbRoll.tsx`, `src/components/public/hero/VerbRoll.test.tsx`

**Interfaces:**

- Consumes: `useMayAnimate` from `@/lib/public/useMayAnimate`.
- Produces: `export function VerbRoll({ verbs, intervalMs = 2600, className }: { verbs: readonly string[]; intervalMs?: number; className?: string }): JSX.Element` —
  an `aria-hidden` `inline-grid` where every verb occupies grid cell 1/1 (so the box is as wide as the
  widest verb and never shifts), the active one `data-active`, the previous `data-leaving`; a
  `setInterval` advances the index, paused while `document.visibilityState !== 'visible'` and
  while hovered; when `useMayAnimate()` is false or `verbs.length === 1` it renders only `verbs[0]`
  statically (`FALLBACK_VERB` when `verbs` is empty).

- [ ] **Step 1: Failing tests** (fake timers): renders all verbs `aria-hidden`; the first is active;
      after 2600ms the second is active and the first is leaving; under `useMayAnimate` → false
      (mock the module) only the first verb is in the DOM; with `verbs=[]` renders `make`;
      `visibilitychange` to hidden stops advancing.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** — `feat(hero): a verb that rolls through the crafts`.

### Task 8: The roll's CSS

**Files:**

- Modify: `src/styles/units/hero.css` (append)
- Test: `src/styles/hero-css.test.ts` (extend)

- [ ] **Step 1: Failing test** — `.verb-roll` sets `overflow: clip`; `[data-active]` and
      `[data-leaving]` transition `transform` and `opacity` only, on `var(--ease-spring-soft)` and
      `var(--dur-slow)`; transitions sit under `prefers-reduced-motion: no-preference`; no other axis
      than `SOFT` appears in any keyframe (existing assertion keeps holding).
- [ ] **Step 2: Run** → FAIL. **Step 3:** write the rules: resting verbs `translateY(100%) opacity 0`,
      active `translateY(0) opacity 1`, leaving `translateY(-100%) opacity 0`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `style(hero): the verb roll's motion`.

### Task 9: The promise line in the hero

**Files:**

- Modify: `src/components/public/BookingHero.tsx:206-216` (the `<p>` "Come make something…")
- Test: `src/components/public/BookingHero.test.tsx`, `e2e/hero.spec.ts`

**Interfaces:**

- Consumes: `verbsFor`, `VerbRoll`, `craftsIn`.
- Produces: a `<p className="hero-promise font-display …">` with
  `<span className="sr-only">come make something with your own hands</span>` and an `aria-hidden`
  visible line `come <VerbRoll/> something with your own hands`, verb in `text-rose-ink`, size
  `text-[clamp(22px,3.2vw,40px)] leading-[1.1]`, `max-w-[22ch]`, `text-balance`; the old sentence removed.

- [ ] **Step 1: Failing unit tests** — accessible text of the hero contains exactly one "come make something with your own hands"; with a terra class the visible verbs are throw/centre/trim; with `classes=[]` the visible verb is `make`; the old sentence "pick a class below" is gone.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: e2e (`hero.spec.ts`, both projects):** `the promise line never moves while its verb rolls` — bounding box of `.hero-promise` at t=0 and t=3s equal within 0.5px; `under reduced motion the verb is static` — emulate `reducedMotion: 'reduce'`, assert exactly one verb element and text `make`.
- [ ] **Step 6: Run** `npx playwright test e2e/hero.spec.ts --project=mobile --project=desktop` → PASS. **Step 7: Commit** — `feat(hero): say the promise in display type, with a verb that rolls`.

---

## Unit A3 — Photo budget, honesty, receipt (builder)

### Task 10: The allocator

**Files:**

- Create: `src/lib/public/photoBudget.ts`, `src/lib/public/photoBudget.test.ts`

**Interfaces:**

- Consumes: `STUDIO_PHOTOS`, `coverFor`, `chapterPhotoFor`, `accentPhotoFor`, `photosFor`, `CraftKind`, `StudioPhoto`.
- Produces:

  ```ts
  export const MAX_USES = 2;
  export const MARQUEE_MIN = 6;
  export interface PhotoBudget {
    fan: StudioPhoto[]; // exactly 3 when any craft, else []
    chapters: Partial<Record<CraftKind, { large: StudioPhoto; accent: StudioPhoto }>>;
    wall: StudioPhoto[]; // ≤ 8
    marquee: StudioPhoto[]; // [] unless ≥ MARQUEE_MIN
  }
  export function allocatePhotos(crafts: readonly CraftKind[]): PhotoBudget;
  export function usesOf(budget: PhotoBudget): Map<string, number>; // photo id → count
  ```

  Fill order fan → chapters → wall → marquee; each slot takes the first photo of the right craft
  with a use left, preferring zero uses over one; a slot with no candidate stays empty.

- [ ] **Step 1: Failing tests** — the fan is always 3 photos when there is any craft (covers first, then more of the same crafts). For `['pottery']`: fan 3, `chapters.pottery` present, wall length 3, marquee `[]`. For `['cake','pottery']`: fan 3, chapters 4 photos, wall 8, marquee `[]`. For all three: fan 3, chapters 6, wall 8, marquee 7. For every input `Math.max(...usesOf(b).values()) <= 2`; chapter photos are not fan photos when an alternative exists; `[]` → everything empty.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** — `feat(photos): one budget decides where each photograph goes`.

### Task 11: The fan draws from the budget

**Files:**

- Modify: `src/components/public/PhotoFan.tsx:78` (`fanPhotos(...)` → `allocatePhotos(...).fan`)
- Test: `src/components/public/PhotoFan.test.tsx`

- [ ] **Step 1: Failing test** — with one terra class the three polaroids' `src` basenames are the first three of `allocatePhotos(['pottery']).fan`.
- [ ] **Step 2–5:** run FAIL, swap the call, run PASS, commit `refactor(fan): draw from the photo budget`.

### Task 12: Chapters draw from the budget and drop the header for one craft

**Files:**

- Modify: `src/components/public/CraftChapters.tsx:89-100` (header) and the photo lookups (`chapterPhotoFor`/`accentPhotoFor` calls)
- Test: `src/components/public/CraftChapters.test.tsx` (create if absent)

- [ ] **Step 1: Failing tests** — one craft: no heading "Pick your kind of mess", the section's accessible name is the craft's class name, the chapter's eyebrow still renders; three crafts: the heading renders; photos come from `allocatePhotos(crafts).chapters[craft]`; the chapter's text block carries `text-left md:text-left` and `items-start` (the spec's break in cadence — chapters no longer centre their heading), the header above keeps `text-center`.
- [ ] **Step 2–5:** run FAIL, implement (`aria-labelledby` when the header exists, `aria-label={classes[0].name}` otherwise), run PASS, commit `feat(chapters): one craft needs no menu`.

### Task 13: The wall draws from the budget

**Files:**

- Modify: `src/lib/public/memories.ts:54-56` (`photosOfCrafts(crafts).slice(0, MAX_TILES)` → `allocatePhotos(crafts).wall`)
- Test: `src/lib/public/memories.test.ts`

- [ ] **Step 1: Failing test** — `buildMemories(['pottery'], undefined).items` has 3 items whose ids equal the budget's wall ids; studio memories still win when present.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `refactor(memories): the wall takes the photos the budget leaves it`.
- [ ] **Step 6 (also yours: `src/components/public/memories/MemoryWall.tsx`, `MemoryWall.test.tsx`):** failing test — on `md` the wall's header is one row: the heading block and the filter chips share a `md:flex md:items-end md:justify-between` wrapper (class assertion), chips still render after the heading in DOM order. Implement, PASS, commit `style(memories): heading and filters on one line`.

### Task 14: The marquee, honest and budgeted

**Files:**

- Modify: `src/components/public/PhotoMarquee.tsx:56,62-63`
- Test: `src/components/public/PhotoMarquee.test.tsx` (create)

- [ ] **Step 1: Failing tests** — one craft → renders `null`; three crafts → renders, `aria-label="The crafts, up close"`, visible label `the crafts, up close`, no "moments from the studio" anywhere; its photos are `allocatePhotos(crafts).marquee`.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `fix(marquee): call stock photos what they are, and only show them when the budget allows`.

### Task 15: "How it works" as a receipt

**Files:**

- Modify: `src/components/public/HowItWorks.tsx` (rewrite body; keep the export name and `id="how-it-works"`)
- Modify: `src/styles/units/atmosphere.css` is **not** yours — put the receipt's CSS in a new `src/styles/units/receipt.css` imported by the component
- Test: `src/components/public/HowItWorks.test.tsx` (create), `src/styles/receipt-css.test.ts` (create)

**Interfaces:**

- Produces: `<section id="how-it-works" aria-labelledby="how-heading">` with the eyebrow and h2 unchanged, then `<ol className="receipt">` of three `<li className="receipt__line">` (numeral in `font-display`, title `h3`, copy), dashed `border-line` rules between lines, and a `receipt__edge` element whose CSS draws a torn edge with a `mask-image` zigzag; desktop (`sm:`) the section is `max-w-[640px]`.

- [ ] **Step 1: Failing tests** — three `listitem`s with the exact titles "Pick a class", "Save your seat", "Come make something" and the existing copy; the list has class `receipt`; CSS test: `.receipt__edge` uses `mask-image` and no `!important`.
- [ ] **Step 2–5:** FAIL, implement, PASS; `npx playwright test e2e/a11y.spec.ts --project=mobile` → PASS; commit `feat(how): three steps on one receipt`.

### Task 16: The budget, measured on the page

**Files:**

- Modify: `e2e/memories.spec.ts` (append)

- [ ] **Step 1:** add `no photograph appears more than twice` for one craft and for three: collect every `img[src*="/studio/"]` basename stripped of `-800`, count, assert max ≤ 2 (note the lightbox is closed); add `one craft shows no marquee and no chapter menu`: `getByRole('region', { name: 'The crafts, up close' })` count 0 and heading "Pick your kind of mess" count 0.
- [ ] **Step 2:** `npx playwright test e2e/memories.spec.ts --project=mobile --project=desktop` → PASS. **Step 3: Commit** — `test(storefront): the photo budget holds on the rendered page`.

---

## Unit A4 — The making of, v2 (builder)

### Task 17: Hands in the stages

**Files:**

- Modify: `src/components/public/making/makingStages.ts`, `makingStages.test.ts`

**Interfaces:**

- Produces: each stage gains `hands: { left: string; right: string; opacity: 0 | 1 }` (SVG path data in the sticker style — cocoa stroke, no fill), and the exported `PIN_DISTANCE = '+=100%'` (the pinned section's total scroll is two viewports).

- [ ] **Step 1: Failing tests** — every stage has `hands.left` and `hands.right` starting with `M`; stage 1 (lump) has `opacity: 0`, stages 2–4 `1`; `PIN_DISTANCE === '+=100%'`; morph paths keep equal point counts (existing test).
- [ ] **Step 2–5:** FAIL, draw, PASS, commit `feat(making): the hands are the story`.

### Task 18: Clay with a surface

**Files:**

- Modify: `src/components/public/making/MakingOf.tsx` (the SVG scene), `src/styles/units/making.css`
- Test: `src/components/public/making/MakingOf.test.tsx`, `src/styles/making-css.test.ts` (create)

- [ ] **Step 1: Failing tests** — the scene defines `<filter id="clay-grain">` with `feTurbulence` and `<radialGradient id="clay-body">` with a highlight stop; the grain is a `<rect>` with `filter="url(#clay-grain)"` inside a `<g clip-path="url(#clay-clip)">` whose `<clipPath>` holds the morphing silhouette (rasterised once, clipped per frame — never a filter on the morphing path itself); the throwing lines carry `pathLength="1"` and class `making-line`; CSS: `.making-line` animates `stroke-dashoffset` only under reduced-motion no-preference.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(making): clay that looks like clay`.

### Task 19: Layout and the beats

**Files:**

- Modify: `src/components/public/making/MakingOf.tsx` (markup), `src/styles/units/making.css`
- Test: `MakingOf.test.tsx`

**Interfaces:**

- Produces: `<div className="making-layout">` with the scene and `<ol className="making-beats">` of four beats, the active one `aria-current="step"`; from `md` two columns (55/45); the pinned timeline uses `PIN_DISTANCE`; phones keep the 2×2 strip.

- [ ] **Step 1: Failing tests** — four beats rendered with the stage captions; the first is `aria-current="step"` before any scroll; the standalone heading above the scene is gone (heading now inside the beats column); reduced motion: four frames rendered, no `data-pinned`.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(making): the beats beside the wheel, and half the scroll`.

### Task 20: Measured in a browser

**Files:**

- Modify: `e2e/making.spec.ts`

- [ ] **Step 1:** add `desktop: the story takes at most two screens of scroll` — the pin spacer height ≤ 2.1 × viewport height; `hands are present in every frame`; keep the reduced-motion case.
- [ ] **Step 2:** `npx playwright test e2e/making.spec.ts --project=desktop --project=mobile` → PASS.
- [ ] **Step 3:** under the flock, `npx playwright test --config playwright.perf.config.ts` → score ≥ baseline (Task 5). If lower: move the grain rect to a `<pattern>` tile of 64px, re-run; record the number in the commit.
- [ ] **Step 4: Commit** — `test(making): two screens, hands in every frame, budget kept`.

---

## Unit A1 — The floating pill (builder)

### Task 21: FloatingPill

**Files:**

- Create: `src/components/public/nav/FloatingPill.tsx`, `FloatingPill.test.tsx`, `src/lib/public/useStorefrontPosition.ts`
- Modify: `src/components/public/atmosphere/StickyCta.tsx` → `export function StickyCta() { return <FloatingPill />; }` (the observer code moves to the hook); `StickyCta.test.tsx` → its cases move to `FloatingPill.test.tsx`

**Interfaces:**

- Consumes: `scrollToId`, `nextClass`, `whenCopy`, `useMountedNow`, `PublicClass`.
- Produces: `export function useStorefrontPosition(): { heroVisible: boolean; widgetVisible: boolean }` (the two watchers from `StickyCta`, unchanged behaviour);
  `export function FloatingPill({ studioName, classes = [] }: { studioName?: string; classes?: PublicClass[] }): JSX.Element | null` — `null` while `heroVisible || widgetVisible`; else
  `<nav aria-label="Book a seat" data-floating-pill className="floating-pill">` containing
  `<span className="floating-pill__name">{studioName}</span>` (omitted when no name; `max-w-[14ch]`, `truncate`),
  `<span className="floating-pill__next hidden sm:inline">` = `${whenCopy(soonest.starts_at, now)} · ${seats}` (omitted when no class), and
  `<a href="#booking-widget" className="clay … min-h-[44px]">Save a seat →</a>`. Phones: `fixed bottom-0 inset-x-0` padded by `env(safe-area-inset-bottom)`; `md:` `fixed top-4 left-1/2 -translate-x-1/2`, `rounded-[var(--radius-pill)]`, `bg-[var(--glass-bg)]`, `backdrop-blur-[var(--glass-blur)]`.

- [ ] **Step 1: Failing tests** (mock `IntersectionObserver` as the old test did) — hidden while the hero is visible; hidden while the widget is visible; visible otherwise with the name, the next-class brief for one class, and a 44px link; no name → no name span; `classes=[]` → no brief; a 32-character name keeps class `truncate`.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(nav): one floating pill for every width`.

### Task 22: The pill's CSS

**Files:**

- Create: `src/styles/units/nav.css`, `src/styles/nav-css.test.ts`

- [ ] **Step 1: Failing test** — `@property --pill-light` (`<angle>`, `inherits: false`, `0deg`); `.floating-pill` border drawn by a `conic-gradient(from var(--pill-light) …)` mask; `@supports (animation-timeline: scroll())` wraps the sweep's `animation-timeline: scroll(root)`; the name's arrival `scale(1.6)` → `scale(1)` uses `var(--ease-spring-soft)` under `md`; everything motion-related sits under `prefers-reduced-motion: no-preference`; no `!important`; `inset 0 0 0 1px var(--glass-border)` highlight.
- [ ] **Step 2–5:** FAIL, write, PASS, commit `style(nav): glass, a light that moves with the page, a name that settles`.

### Task 23: Measured on both widths

**Files:**

- Modify: `e2e/atmosphere.spec.ts` (the phone-bar cases → `[data-floating-pill]`), add desktop cases

- [ ] **Step 1:** desktop: after scrolling one viewport the pill is visible, its top < 40px, its centre within 2px of the viewport centre, the link's box ≥ 44px high; it is gone while `#booking-widget` is in view; axe on the page with the pill visible → no violations. Phone: the existing bar cases pass against the new selector.
- [ ] **Step 2:** `npx playwright test e2e/atmosphere.spec.ts --project=mobile --project=desktop` → PASS. **Step 3: Commit** — `test(nav): the pill shows up where the thumb and the eye expect it`.

---

## Unit A5 — The booking card, lightly (builder)

### Task 24: Time and duration copy

**Files:**

- Modify: `src/lib/public/format.ts`, `format.test.ts`

**Interfaces:**

- Produces: `export function timeCopy(iso: string, locale?: string): string` → `h:mm am|pm` lowercase with a space ("7:54 pm", "12:00 am"); `durationCopy` now returns "45 min", "1 h", "1½ h", "2½ h", "2 h 10 min", `null` as before; `export function whenLine(item: { starts_at: string; ends_at: string }, locale?: string): string` → `"Fri 23 Oct · 7:54 pm · 2½ h"` (no duration part when `durationCopy` is null).

- [ ] **Step 1: Failing tests** — build ISO strings from local `new Date(2026, 9, 23, 19, 54)` so the assertions hold in any timezone; cover the six duration cases, midnight, noon, and `whenLine` with `'en-GB'`.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(format): times a guest reads at a glance`.

### Task 25: The seats line

**Files:**

- Modify: `src/lib/public/bookingCopy.ts`, `bookingCopy.test.ts`; `src/components/public/booking/TicketStub.tsx`, `TicketStub.test.tsx` (create)

**Interfaces:**

- Consumes: `nextClass`, `whenCopy`.
- Produces: `export function seatsLine(classes: readonly PublicClass[], now: Date): string | null` — open classes = `seats_left > 0 && !is_full`; none → `null`; one → `"8 seats left this Friday"` / `"last seat tomorrow"`; several → `"14 seats across 3 classes"`. `TicketStub({ current, seatsLine }: { current: 1 | 2 | 3; seatsLine?: string | null })` renders the line under "save your seat" in `text-sm font-extrabold text-cocoa` on step 1 only.

- [ ] **Step 1: Failing tests** — the three copy cases and the step-2 omission.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(card): the one honest number, on the stub`.

### Task 26: The picker's line

**Files:**

- Modify: `src/components/public/booking/ClassPicker.tsx:80` and the row's date markup
- Test: `ClassPicker.test.tsx`, `e2e/booking.spec.ts`, `e2e/cls.spec.ts`

- [ ] **Step 1: Failing test** — the row shows `whenLine(item)` and no longer the long date.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5:** `npx playwright test e2e/booking.spec.ts e2e/cls.spec.ts --project=mobile --project=desktop` → PASS. **Step 6: Commit** — `feat(picker): one line per class`.

---

## Unit A6 — The footer, bigger (builder)

### Task 27: Columns, credit, a last CTA

**Files:**

- Modify: `src/components/public/StudioFooter.tsx`; Test: `StudioFooter.test.tsx` (create)

**Interfaces:**

- Produces: `StudioFooter({ studioName, handle, classes = [] }: { studioName: string; handle?: string | null; classes?: PublicClass[] })` — the sign-off (Task 28), the name as `font-display` wordmark, then `sm:grid-cols-3`: **Classes** (distinct `classes[].name`, each an `<a href="#booking-widget">`; column omitted when empty), **Find us** (`@handle` on Instagram and a "Message us" link to `https://ig.me/m/${handle}`; omitted without a handle), **Photos** (`craft photography via Unsplash`, a link to `https://unsplash.com/license`); a clay `Save a seat` link `min-h-[44px]`.

- [ ] **Step 1: Failing tests** — three columns with the right content for three classes of two crafts (names deduped); no Classes column for `[]`; the credit text present; the CTA has `min-h-[44px]`.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(footer): a sign-off worth scrolling to`.

### Task 28: The sign-off that draws itself

**Files:**

- Modify: `StudioFooter.tsx` (the `SignOff` SVG), Create: `src/styles/units/footer.css`, `src/styles/footer-css.test.ts`

- [ ] **Step 1: Failing tests** — the SVG `<path>` has `pathLength="1"`, class `signoff-stroke`, `aria-hidden`, and the visible text "see you at the studio" exists for assistive tech; CSS: `.signoff-stroke` starts `stroke-dashoffset: 1` and animates to `0` only under reduced-motion no-preference and only when the footer carries `data-visible`; otherwise it is `0`.
- [ ] **Step 2–5:** FAIL, implement (`useRevealOnScroll` sets `data-visible`), PASS, commit `feat(footer): the handwritten line draws itself`.

---

## Unit A7 — The share card (builder)

### Task 29: Metadata helpers

**Files:**

- Create: `src/lib/public/metadata.ts`, `metadata.test.ts`

**Interfaces:**

- Produces:
  `export function serverApiBase(): string` — `process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001'`;
  `export function siteBase(): URL` — `NEXT_PUBLIC_SITE_URL`, else `https://${VERCEL_PROJECT_PRODUCTION_URL}`, else `http://localhost:3000`;
  `export async function fetchStudioForMetadata(slug: string): Promise<PublicClassList | null>` — `fetch(\`${serverApiBase()}/api/v1/public/${slug}/classes\`, { signal: AbortSignal.timeout(1500), next: { revalidate: 300 } })`, `null`on any failure;`export function storefrontTitle(name: string | null): string`—`"${name} · book a class"` or `"Book a class"`;
  `export function storefrontDescription(studio: PublicStudio | null, classes: PublicClass[]): string` — the story cut at the last word boundary under 160 chars; else `"${Crafts} classes — pick one and we'll keep you a seat"`with crafts joined "Pottery", "Pottery and cake", "Pottery, cake and painting"; else`"Pick a workshop and save your seat."`;
`export function seatsBlurb(classes: PublicClass[]): string | null`—`"8 seats left in the next class"`/`"last seat in the next class"`/`null`.

- [ ] **Step 1: Failing tests** — env precedence (stub `process.env`); a 320-char story cuts under 160 at a space with no trailing comma; the three crafts phrasings; the fetch helper returns `null` on a rejected fetch and passes a 1500ms signal (mock `global.fetch`, assert `signal` present).
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(share): what the page is called, and where the server asks`.

### Task 30: generateMetadata

**Files:**

- Modify: `src/app/book/[slug]/page.tsx` (replace the static `metadata` export)
- Test: `src/app/book/[slug]/page.test.tsx` (create; mock `fetchStudioForMetadata`)

- [ ] **Step 1: Failing tests** — with a studio: `title` is "Maison Abeer · book a class", `openGraph.images[0].url` ends with `/book/maison-abeer/opengraph-image` and is 1200×630, `twitter.card` is `summary_large_image`, `robots.index` is `false`; with `null`: title "Book a class", description "Pick a workshop and save your seat.", images still present; `metadataBase` equals `siteBase()`.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(share): the link previews as the studio`.

### Task 31: The image

**Files:**

- Create: `src/app/book/[slug]/opengraph-image.tsx`, `src/lib/public/ogCard.tsx` (the JSX, pure, testable), `ogCard.test.tsx`
- Fonts: `src/fonts/fraunces-og.ttf` **only if the owner said yes** (Decision 6); otherwise omit `fonts` and let the renderer use its built-in sans.

**Interfaces:**

- Produces: `export const size = { width: 1200, height: 630 }`, `export const contentType = 'image/png'`, `export const revalidate = 300`, `export default async function Image({ params })` → `new ImageResponse(<OgCard …/>, { ...size, fonts })`;
  `export function OgCard({ name, crafts, seats }: { name: string; crafts: CraftKind[]; seats: string | null }): JSX.Element` — buttercream `#fff8f0`, name in 96px (72px when `name.length > 24`), one sticker per craft drawn with literal hex (`#c96f4a`, `#f2aabe`, `#adbe93`, ink `#40302a`), the seats line in 36px, a dotted paper texture as a repeating radial gradient; **no CSS variables, no Tailwind classes** (the renderer has neither).

- [ ] **Step 1: Failing tests** — `OgCard` with a 30-char name uses 72px; with `crafts=[]` renders no sticker; with `seats=null` renders no seats line; no `var(` substring anywhere in the rendered markup.
- [ ] **Step 2–5:** FAIL, implement, PASS, commit `feat(share): a card for the DM`.

### Task 32: Measured

**Files:**

- Create: `e2e/share.spec.ts`

- [ ] **Step 1:** `GET /book/maison-abeer/opengraph-image` → status 200, `content-type` starts `image/png`, body < 300 KB, PNG header bytes; the page's `<meta property="og:image">` is an absolute URL ending in `/opengraph-image`; `<meta name="twitter:card">` is `summary_large_image`; the title is either `Maison Abeer · book a class` or `Book a class` (the API may be down under e2e).
- [ ] **Step 2:** `npx playwright test e2e/share.spec.ts --project=desktop` → PASS. **Step 3: Commit** — `test(share): the card exists and the page names itself`.

---

## Integration (orchestrator)

### Task 33: Merge Batch 1, then Batch 2, resolving nothing by hand

- [ ] After each batch: merge each `turbo/a<n>-*` branch into the integration branch; `npm run typecheck && npx vitest run` → green before the next merge.

### Task 34: Wire the page

**Files:**

- Modify: `src/components/public/StorefrontPage.tsx`
- Delete: `src/components/public/BookingPostcard.tsx` (and its test), `src/components/public/atmosphere/StickyCta.tsx` (+ test) once nothing imports them
- Test: `StorefrontPage.test.tsx`

- [ ] **Step 1: Failing tests** — the page renders `FloatingPill` with the studio name; no postcard text "seats open across"; `TicketStub` receives `seatsLine(classes, now)` on step 1; `StudioFooter` receives `classes`; `PhotoMarquee` absent with one craft.
- [ ] **Step 2–4:** FAIL; replace `<StickyCta />` with `<FloatingPill studioName={studioName} classes={classes} />`, drop the postcard line and import, pass `seatsLine` and `classes`; PASS. Delete the dead files; `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat(storefront): wire v3 — pill, stub line, footer, no postcard`.

### Task 35: The full gate

- [ ] **Step 1:** separate Bash call: wait with `pgrep -f '[n]ext build|[p]laywright|[v]itest'`.
- [ ] **Step 2:** under the flock: `npm run lint && npm run typecheck && npx vitest run && npx prettier --check .` → green.
- [ ] **Step 3:** under the flock: `NEXT_DIST_DIR=.next-build npx next build` → First Load JS for `/book/[slug]` ≤ baseline + 8 kB. Record it below.
- [ ] **Step 4:** under the flock, the storefront's specs only (not the whole suite — the owner stops five-minute runs): `npx playwright test e2e/hero.spec.ts e2e/atmosphere.spec.ts e2e/memories.spec.ts e2e/making.spec.ts e2e/booking.spec.ts e2e/cls.spec.ts e2e/a11y.spec.ts e2e/reduced-motion.spec.ts e2e/mobile.spec.ts e2e/story-overflow.spec.ts e2e/share.spec.ts --project=mobile --project=desktop` → green; extend `reduced-motion.spec.ts` with the pill, the verb and the footer stroke if not already covered.
- [ ] **Step 5:** under the flock: the perf config → score ≥ baseline. If below: remove `<ParticleField />` from `BookingHero` (both branches), re-run, record.
- [ ] **Step 6:** `node shoot.mjs` at 1440 and 375 for one craft and for three; look at every frame; page heights recorded below.

**After (fill in):** perf guard —/5 · First Load JS — kB · height 1440 — px · 375 — px.

### Task 36: Independent review and the fix round

- [ ] **Step 1:** dispatch `turbo-reviewer` (model: opus, read-only) with the spec, this plan and the diff range; ask for correctness, honesty-rule breaches, a11y, and perf regressions; summary ≤ 1,500 tokens.
- [ ] **Step 2:** fix findings inline (TDD, one commit each); re-run the touched specs.
- [ ] **Step 3:** show the owner: the before/after numbers above and the frames; ask for the Phase A review before Phase B.

### Task 37: Clean up

- [ ] Ask before deleting: builder worktrees under `.claude/worktrees/agent-*` and the `turbo/a*` branches (and the still-present `turbo/1a…1e` from Phase 1).
