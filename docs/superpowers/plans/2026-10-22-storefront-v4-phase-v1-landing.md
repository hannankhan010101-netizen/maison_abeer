# Storefront v4, Phase V1 (the landing page) Implementation Plan

> **For agentic workers:** This plan executes as **turbo FULL**: the orchestrator builds the scaffold
> (Z1-Z3) and the integration (I1-I5) inline with TDD; units K, P, C and Q go to turbo-builders in
> their own worktrees, two at a time; an independent turbo-reviewer reads the merged result.
> **Nothing starts until the owner approves this plan.** Steps use `- [ ]` syntax.

**Goal:** Turn the link-in-bio page into the cute, advanced pop-up workshop world: a hero with a small
cast of craft characters, venue-first pop-up cards a girl reaches in two screens, a Craft Corner that
teaches Bento cakes, pottery and painting, a "which workshop are you?" quiz with a Story-size share
image, and a footer with the right Instagram. Every button works and the page stays fast.

**Architecture:** `StorefrontPage` (the composition root, edited only by the orchestrator) is
reordered: hero, pop-ups (the existing booking widget, restyled), then lazy-loaded islands. Every
below-the-fold section, old and new, loads through a `LazySection` wrapper when it nears the
viewport, which also frees first-load JavaScript for the hero's characters. Craft knowledge is typed
data in one file. Motion follows the tier system from V0. No new dependency.

**Tech Stack:** Next.js 15.5, React 19, Tailwind v4 + `tokens.css`, Vitest + Testing Library,
Playwright 1.62 (dev-server specs) and production-build specs (ISR, lab, font-swap).

**Spec:** `docs/superpowers/specs/2026-10-22-storefront-v4-whimsy-design.md` (sections 1 to 3, 6 to 8).

## Assumptions (the owner's seven open decisions, settled by my recommendation; change any before approval)

1. **Characters: yes.** Three SVG characters with working names Pip (clay), Bento (cake) and Dot
   (palette). The owner can rename them in one data file.
2. **Booking contact:** unchanged (phone or email).
3. **Teens:** the page says nothing about age or parents. No policy is invented.
4. **Venues:** the database change is **not** in this phase. Cards use today's location text and the
   class photo, designed as the real product, with a "Maps" link built from the location text.
5. **"Tell me about the next pop-up" sign-up:** not in V1.
6. **Name tags:** not in V1.
7. **Studio facts** (prices, payment, cancellation, when pottery is ready): the FAQ entries exist but
   are marked `owner` and are **hidden** until the owner supplies the answer.
8. **Photos:** stock until the owner's Instagram export arrives (a later content pass; faces of
   guests only with their consent).

## Global Constraints

- **No new dependency.** `/book/[slug]` First Load JS at most **137.47 KiB** (baseline 136.47 plus
  1.0), measured by `node scripts/check-first-load.mjs`. The lab's **cold CLS stays under 0.05**
  (V0's font-swap fix) and warm LCP at or under 1800 ms.
- No invented number, quote, count, price or policy. Seats-left is the API's number. Stock photos are
  never called the studio's own. Allergies stay visible. Only Fraunces' `SOFT` axis animates.
- Craft facts are general and correct; anything about the studio itself is an `owner` entry, hidden
  until filled. A content test forbids prices, currency symbols, "free", "included", "guarantee".
- Motion: only `transform`, `opacity`, `clip-path` and registered properties; new motion under
  `prefers-reduced-motion: no-preference` and gated by `useMotionTier` (tier 0 static, 1 CSS only,
  2 adds JavaScript effects); touch targets at least 44 px; WCAG AA; no sideways scroll at 320 px.
- Every tappable element is in `e2e/helpers/inventory.ts`; the orchestrator is its only editor in
  this phase (units report their elements; integration adds them).
- Chat stays hidden. Instagram links come only from `lib/public/instagram.ts`.
- Heavy commands (whole-suite vitest, `next build`, Playwright) run under
  `flock -w 540 /tmp/claude-1000/bbt-heavy.lock`, one per Bash call, no `pgrep` in the same call. Run
  only the specs a change touches. Builders branch from the **local** `feat/deploy-vercel` HEAD, in
  their own worktrees on `turbo/v1-<unit>` branches, edit only owned files, commit after every task
  and report as soon as the last acceptance command is green (about 40 turns). Commit trailer:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commands run from `Frontend/` unless stated.

## Review Focus

1. **Craft Corner never talks about a craft the studio does not teach** and never states a studio
   fact: a studio with only pottery shows one corner; a hidden `owner` FAQ entry never renders. Tests:
   Z1, K1, K3.
2. **Quiz edge cases:** every answer path ends in a craft; ties break deterministically; going back
   keeps answers; keyboard only works end to end; the share image handles a long handle and no handle.
   Tests: Q1, Q2, Q3.
3. **A studio with no upcoming classes** or one class: the pop-up section shows a friendly state and
   the follow link, never an empty hole or a filter row for one craft. Tests: P1, P2.
4. **Lazy islands never shift the page or vanish:** each reserves its height, loads once near the
   viewport, and a failed chunk leaves the placeholder and no error. Tests: Z2, I2.
5. **Characters never cost the first screen:** fixed sizes (no shift), tier 0 is static and complete,
   idle animation stops when off screen or the tab is hidden. Tests: C1, C2, I3.

---

## Batch plan

| Order       | Tasks | Who                                             |
| ----------- | ----- | ----------------------------------------------- |
| Scaffold    | Z1-Z3 | orchestrator, sequential                        |
| Batch 1     | K1-K4 | K (craft corner and FAQ)                        |
| Batch 1     | P1-P4 | P (pop-up cards, maps link, footer follow line) |
| Batch 2     | C1-C4 | C (character cast and hero)                     |
| Batch 2     | Q1-Q4 | Q (quiz and Story share image)                  |
| Integration | I1-I5 | orchestrator                                    |

## Scaffold (orchestrator)

### Task Z1: Craft knowledge as typed data

**Files:** Create `src/lib/public/craftGuide.ts`, `craftGuide.test.ts`.
**Produces:**

```ts
export interface GuideTool {
  id: string;
  name: string;
  does: string;
}
export interface GuideStep {
  id: string;
  title: string;
  text: string;
}
export interface GuideFaq {
  id: string;
  q: string;
  a: string | null;
  owner?: true;
}
export interface CraftGuide {
  kind: CraftKind;
  title: string;
  blurb: string;
  makes: string[];
  tools: GuideTool[];
  steps: GuideStep[];
  tips: string[];
  funFacts: string[];
  bring: string[];
  faq: GuideFaq[];
}
export const CRAFT_GUIDES: Record<CraftKind, CraftGuide>;
export const COMMON_FAQ: GuideFaq[]; // allergies, age, payment, cancelling, when pieces are ready: all owner-needed
export function guideFor(kind: CraftKind): CraftGuide;
export function visibleFaq(entries: readonly GuideFaq[]): GuideFaq[]; // drops entries whose answer is null
```

- [ ] **Step 1: Tests:** each craft has at least 4 tools, 4 to 5 steps, 3 tips, 3 fun facts, 4 bring items; ids unique per craft; `step.text` at most 140 characters and `does` at most 100; every entry with `a === null` has `owner: true` and `visibleFaq` drops it; **a content guard** fails on `/[$£€]|\bRs\.?\b|\bPKR\b|\bfree\b|\bincluded\b|guarantee|refund|\bdiscount\b|\bhours?\b.*\bfired\b/i` anywhere in the data; allergen note appears in the cake guide's tips.
- [ ] **Step 2:** run; FAIL. **Step 3:** write the data. Bento cakes: small lunchbox-style cakes, buttercream piping, text and charms (tools: piping bag and tips, offset spatula, bench scraper, turntable, gel colours; steps: level, crumb coat, chill, final coat, colour, pipe, write, box; tips: a cold cake gives smoother edges, gel colour beats liquid, room-temperature butter pipes best, ask about eggs, dairy, gluten and nuts). Pottery: wheel throwing and hand-building (tools: wheel, sponge, wire cutter, rib, needle tool, trimming tool; steps: wedge, centre, open, pull the walls, shape, cut off, then dry, trim, bisque fire, glaze, fire again; facts: clay shrinks as it fires, glaze looks chalky until fired). Painting: ceramic or canvas, per class (tools: round, flat and liner brushes, palette, water cup, sponge; steps: light sketch, base coats, let layers dry, details last; facts: add white to any colour for pastels). General knowledge only.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(craft): the craft guide data and its content guard`.

### Task Z2: LazySection

**Files:** Create `src/components/public/LazySection.tsx`, `LazySection.test.tsx`.
**Produces:** `LazySection<P>({ load, props, minHeight, rootMargin?, label }: { load: () => Promise<{ default: ComponentType<P> }>; props: P; minHeight: string; rootMargin?: string; label: string }): JSX.Element` (default `rootMargin` `'600px 0px'`).

- [ ] **Tests** (fake `IntersectionObserver`): renders a placeholder with `min-height` and `aria-hidden` before intersection and does not call `load`; calls `load` once on intersection and renders the component with `props`; disconnects the observer; a rejected `load` leaves the placeholder and logs once, no throw; without `IntersectionObserver` it loads at once; the placeholder uses `content-visibility: auto` with `contain-intrinsic-size`. Implement; PASS; **Commit** `feat(storefront): LazySection for below-the-fold islands`.

### Task Z3: Island the existing sections and measure

**Modifies:** `StorefrontPage.tsx` only: `CraftChapters`, `MemoryWall`, `MakingOf`, `PhotoMarquee`, `HowItWorks` and `StorySection` load through `LazySection` with measured `minHeight`s per breakpoint (record the heights in the commit message); the hero, ribbon and booking card stay eager.

- [ ] **Step 1:** record the current section heights at 375 and 1440 from the lab or a quick Playwright script. **Step 2: Tests** (`StorefrontPage.test.tsx` additions): below-fold sections are not rendered before intersection; the booking widget and hero are. **Step 3:** implement; PASS.
- [ ] **Step 4:** under the flock: `NEXT_DIST_DIR=.next-build npx next build`, `node scripts/check-first-load.mjs .next-build "/book/[slug]/page" 136.47 1.0`; record the new number (expected well below the old); `npm run test:e2e:lab` cold CLS under 0.05; `npx playwright test e2e/tap-everything.spec.ts e2e/memories.spec.ts e2e/making.spec.ts --project=mobile --project=desktop`. **Commit** `perf(storefront): below-the-fold sections load as islands`. This frees the budget the characters need.

## Unit K — The Craft Corner and the questions (builder)

**Owns:** `src/components/public/corner/*` (+ tests), `src/styles/units/corner.css` (+ `src/styles/corner-css.test.ts`), `e2e/corner.spec.ts`.

### Task K1: Tabs and the corner shell

**Produces:** `CraftCorner({ crafts }: { crafts: CraftKind[] }): JSX.Element` (default export of `corner/CraftCorner.tsx`, for `LazySection`). One tab per craft in `crafts` (a studio that teaches only pottery shows one corner and no tab row), WAI-ARIA tabs (`tablist`, `aria-selected`, arrow keys, Home and End), a panel per craft tinted with `--craft-<kind>` and `--craft-<kind>-ink`.

- [ ] **Tests:** one craft renders no `tablist`; three crafts render three tabs; arrow keys move focus and selection; only the selected panel is in the accessibility tree; `crafts: []` renders nothing; a craft not in `crafts` never appears. Implement; PASS; **Commit** `feat(corner): tabs and panels per craft`.

### Task K2: What you make, the tools, the steps

**Produces** (in `corner/`): `ToolGrid` (each tool a button with `aria-expanded` that opens a small card with `does`), `StorySteps` (the steps as a short vertical story; at tier 0 a plain ordered list, at tier 1 CSS reveals, at tier 2 scroll-linked), `MakesStrip` (the `makes` items as stickers).

- [ ] **Tests:** each tool button toggles its card and exposes `aria-expanded`; Escape closes it; steps render in order with step numbers; reduced motion gives the plain list; all text comes from `guideFor(kind)`. Implement; PASS; **Commit** `feat(corner): tools, steps and what you make`.

### Task K3: Bring and wear, tips and the questions

**Produces:** `BringList` (tickable checklist, local state only, never stored), `TipsAndFacts` (a rotating fun-fact sticker, tap for the next, `aria-live="polite"`), `FaqAccordion({ entries }: { entries: GuideFaq[] })` (buttons with `aria-expanded`; renders `visibleFaq(entries)` only).

- [ ] **Tests:** ticking items works with keyboard and touch; the fun fact advances and wraps; an `owner` entry with `a: null` never renders and a filled one does; the FAQ combines the craft's entries with `COMMON_FAQ`. Implement; PASS; **Commit** `feat(corner): bring list, fun facts and FAQ`.

### Task K4: Measured

- [ ] `e2e/corner.spec.ts` (stubbed API with pottery only, then all three crafts): the corner appears after scrolling, tabs switch, a tool card opens and closes, the bring list ticks, the FAQ opens, no `owner` question is visible, axe clean with and without reduced motion, 44 px targets, no sideways scroll at 320 and 375. Under the flock on `mobile` and `desktop`. Screenshot each corner at 375 and 1440 and look. **Commit** `test(corner): browser specs`.

## Unit P — Pop-up cards (builder)

**Owns:** `src/components/public/booking/ClassPicker.tsx` (+ test), `booking/PopupCard.tsx` (+ test), `booking/CraftFilter.tsx` (+ test), `src/lib/public/maps.ts` (+ test), `StudioFooter.tsx` (+ test, the follow line only), `src/styles/units/popups.css`, `e2e/popups.spec.ts`.

### Task P1: The maps link

**Produces:** `mapsUrl(location: string | null | undefined): string | null` = `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(trimmed)>` or `null` for empty or whitespace.

- [ ] **Tests:** a café name and area encode correctly (`Café Lumière, Clifton` safe); empty, null and whitespace give `null`; a 300-character string is cut to 120. Implement; PASS; **Commit** `feat(popups): maps link from the location text`.

### Task P2: Venue-first cards

**Produces:** `PopupCard({ item, now, onPick, returnedFromId }): JSX.Element`: a card whose primary control is the existing row button (still one button named by the class, so booking flows and tests keep working), leading with the class photo, the **location line** as the hero text with a pin, then the date leaf, craft chip, the honest seats line (`seatCopy`, reserved height) and a separate secondary "Maps" link (outside the button, a sibling, from `mapsUrl`). `ClassPicker` renders `PopupCard`s.

- [ ] **Tests:** the card has one primary button and, when a location exists, one link; no location means no pin line and no link and no "undefined"; the seats line keeps its reserved height class; a full class shows the waitlist wording; the existing `ClassPicker.test.tsx` cases still pass. Implement; PASS; **Commit** `feat(popups): venue-first pop-up cards`.

### Task P3: Filter and empty states

**Produces:** `CraftFilter({ crafts, value, onChange })` chips, rendered only when the classes span two or more crafts; "All" first; keyboard operable. Zero upcoming classes: a friendly "next pop-up is coming" card with the studio's Instagram follow link (from `instagramUrl`), no filter.

- [ ] **Tests:** one craft renders no filter; two render chips and filtering narrows the list; with no classes the friendly card shows and the follow link is correct or absent when the handle is invalid. Implement; footer follow line uses the same helpers; PASS; **Commit** `feat(popups): craft filter and the empty state`.

### Task P4: Measured

- [ ] `e2e/popups.spec.ts`: stubbed payloads (0, 1 and 3 classes across 1 and 3 crafts): cards, maps link target, filter, empty state, picking a class still opens the details step, no CLS from the seats line, axe clean, 44 px, no sideways scroll. Under the flock on `mobile` and `desktop`; run `e2e/booking.spec.ts` and `e2e/cls.spec.ts` too. **Commit** `test(popups): browser specs`.

## Unit C — The character cast and the hero (builder, Batch 2)

**Owns:** `src/components/public/characters/*` (+ tests), `src/styles/units/characters.css` (+ `characters-css.test.ts`), `src/components/public/BookingHero.tsx` and `hero/*` (+ tests), `src/styles/units/hero.css` (+ test), `e2e/characters.spec.ts`.

### Task C1: Three characters

**Produces:** `Pip`, `BentoCake`, `Dot` (SVG components) each `({ mood, size }: { mood?: 'happy' | 'wink' | 'wow' | 'sleepy'; size?: number })`, fixed viewBox, `aria-hidden`, drawn in the sticker style (ink outline, two dot eyes and a smile, per-mood eyes and mouth), plus `CAST: Record<CraftKind, ComponentType<...>>`.

- [ ] **Tests:** each renders for every mood; sizes are fixed (no layout-dependent units); `aria-hidden`; no external image or font; `CAST` covers the three crafts. Implement; PASS; **Commit** `feat(characters): the cast`.

### Task C2: Alive, but only as much as the device can bear

**Produces:** `CharacterCast({ crafts, facts }: { crafts: CraftKind[]; facts: Record<CraftKind, string[]> })`: only the crafts the studio teaches; each character is a 44 px-minimum button with an accessible name (`"Pip, tap for a clay fact"`). Tap: squish (CSS), mood to `wow`, a speech sticker with a fact from `guideFor(kind).funFacts` (cycling, `aria-live="polite"`), `haptic('tick')`. Idle: tier 0 static; tier 1 CSS float; tier 2 adds an occasional blink. Animation pauses when off screen (`useIsOnScreen`) or the tab is hidden.

- [ ] **Tests:** only taught crafts render; tap shows the next fact and cycles; tier 0 has no animation classes; reduced motion removes the float; off-screen pauses (mock `useIsOnScreen`); keyboard Enter and Space work. Implement; PASS; **Commit** `feat(characters): tap to pop, tiered idle motion`.

### Task C3: The hero

**Modifies:** `BookingHero` replaces the corner craft stickers with `CharacterCast` and keeps everything else (name, rolling verb, next-class chip, CTA, Instagram line, polaroids). The V0 font-swap guarantees stay (reserved heights, `em` widths).

- [ ] **Tests:** hero renders the cast for the crafts in `classes`; none for `[]`; existing hero tests pass; hero CSS test pins the new rules; initial JS impact measured in C4. Implement; PASS; **Commit** `feat(hero): the cast joins the hero`.

### Task C4: Measured

- [ ] `e2e/characters.spec.ts`: taps pop a fact, keyboard works, reduced motion is static, no CLS, axe clean, 44 px. Under the flock: `npx playwright test e2e/characters.spec.ts e2e/hero.spec.ts e2e/reduced-motion.spec.ts --project=mobile --project=desktop`; `npm run test:e2e:fontswap` still green; `node scripts/check-first-load.mjs <fresh build dir> "/book/[slug]/page" 136.47 1.0`. Screenshot the hero at 320, 375 and 1440 and look. **Commit** `test(characters): browser specs`.

## Unit Q — Which workshop are you? (builder, Batch 2)

**Owns:** `src/lib/public/quiz.ts` (+ test), `storyCard.ts` (+ test), `storyCanvas.ts` (+ test), `src/components/public/quiz/*` (+ tests), `src/styles/units/quiz.css`, `e2e/quiz.spec.ts`.

### Task Q1: The questions and the scoring

**Produces:**

```ts
export interface QuizAnswer {
  id: string;
  label: string;
  scores: Partial<Record<CraftKind, number>>;
}
export interface QuizQuestion {
  id: string;
  text: string;
  answers: QuizAnswer[];
}
export const QUIZ: QuizQuestion[]; // 5 questions, 3 answers each, playful, no claims about the studio
export function scoreQuiz(
  picked: readonly string[],
  crafts: readonly CraftKind[],
): { kind: CraftKind; tied: boolean };
export const RESULT_COPY: Record<CraftKind, { vibe: string; line: string }>;
```

`scoreQuiz` sums scores over only the crafts in `crafts`, breaks ties by the order of `crafts`, and falls back to `crafts[0]`; with `crafts: []` it throws a typed error that the component never reaches.

- [ ] **Tests:** every combination of one answer per question yields a craft among `crafts`; ties break deterministically; restricting `crafts` to one returns it; unknown ids are ignored; copy contains no digits, currency or studio promises (the same content guard as Z1). Implement; PASS; **Commit** `feat(quiz): questions and scoring`.

### Task Q2: The component

**Produces:** `WhichWorkshop({ crafts, onBook }: { crafts: CraftKind[]; onBook: (kind: CraftKind) => void })`: a stepper with progress, a Back button that keeps answers, large tappable answers, a result card with the craft's character, vibe line, "Book this one" (calls `onBook`, which the integration wires to scroll the pop-ups and set the filter) and "Share to Story". Renders nothing for fewer than two crafts (a one-craft studio has nothing to choose).

- [ ] **Tests:** fewer than two crafts renders nothing; completing it shows a result among `crafts`; Back keeps answers; keyboard only works end to end; reduced motion is static; `onBook` receives the kind. Implement; PASS; **Commit** `feat(quiz): which workshop are you`.

### Task Q3: The Story share image

**Produces** (`storyCard.ts`, pure): `storyModel(input: { kind: CraftKind; vibe: string; line: string; handle: string | null }): StoryModel` and `storyLayout(model): StoryLayout`; (`storyCanvas.ts`) `STORY_SIZE = { width: 1080, height: 1920 }`, `renderStoryCard(model): Promise<Blob | null>`, saved with the existing `saveTicket(blob, filename)` from `ticketCanvas.ts` (shared or downloaded, filename `maison-<craft>-vibe.png`). The handle line uses `displayHandle`; no handle means no handle line.

- [ ] **Tests:** the model never contains a token or an undefined; long handle and long vibe wrap or cut with an ellipsis; no handle drops the line; layout stays inside the canvas; `renderStoryCard` is proven in the browser (jsdom has no canvas). Implement; PASS; **Commit** `feat(quiz): the Story share image`.

### Task Q4: Measured

- [ ] `e2e/quiz.spec.ts`: three-craft stub: complete the quiz by keyboard, see a result, Share downloads a PNG of 1080 by 1920 under 600 KB named for the craft (catch the download; headless has no share sheet), "Book this one" scrolls to the pop-ups; one-craft stub: no quiz; axe clean; no sideways scroll. Open a saved PNG with the Read tool and look. Under the flock on `mobile` and `desktop`. **Commit** `test(quiz): browser specs`.

## Integration (orchestrator)

### Task I1: Merge

- [ ] After each batch merge each `turbo/v1-*` branch; `npm run typecheck && npx vitest run` green before the next merge. A conflict is a plan bug: stop and report.

### Task I2: Compose the page

**Modifies:** `StorefrontPage.tsx` (only): order is hero, ribbon, **pop-ups (the booking widget moves up, right after the ribbon)**, then lazy islands: Craft Corner (with the combined FAQ), quiz (only with two or more crafts), How it works, chapters, memory wall, making-of, marquee, footer. `onBook(kind)` sets the pop-up filter and scrolls to the widget. Craft tint drift: a `data-craft` section attribute and a CSS transition of the background wash between the three tints, tier-gated.

- [ ] **Tests** (`StorefrontPage.test.tsx`): the order; the quiz absent with one craft; the corner receives only taught crafts; `onBook` filters and scrolls. Implement; PASS; **Commit** `feat(storefront): v4 page order and islands`.

### Task I3: The inventory and the full gate

- [ ] Update `e2e/helpers/inventory.ts` with every new tappable element reported by K, P, C and Q (characters, tool buttons, tabs, bring items, FAQ buttons, maps links, filter chips, quiz answers and buttons, share). Under the flock: lint, typecheck, `npx vitest run`, prettier on changed files; `NEXT_DIST_DIR=.next-build npx next build` and `node scripts/check-first-load.mjs .next-build "/book/[slug]/page" 136.47 1.0` (record); `npm run test:e2e:ssr`; `npm run test:e2e:lab` (cold CLS under 0.05, warm LCP at or under 1800 ms); `npm run test:e2e:fontswap`; dev-server specs `tap-everything`, `corner`, `popups`, `characters`, `quiz`, `booking`, `hero`, `memories`, `making`, `cls`, `a11y`, `reduced-motion`, `mobile` on `mobile` and `desktop`; the perf-scroll guard from a clean worktree. Known unrelated: `portal.spec.ts:103` mobile; the 150 ms lightbox case is timing-flaky (re-run alone). Record numbers below.

### Task I4: Independent review and the fix round

- [ ] Dispatch `turbo-reviewer` (model: opus, read-only) with the spec, this plan and the diff range. Ask for: a craft or studio claim that is not true or not owner-approved, an interactive element missing from the inventory or without a working target, anything that raises first-load JS or CLS, a tier-0 experience that is incomplete, an accessibility gap in tabs, accordions or the quiz. Summary at most 1,500 tokens. Fix with TDD, one commit each.

### Task I5: Look at it, then show the owner

- [ ] Screenshot the page top to bottom at 375 and 1440 with one craft and with three; look at every frame. Show before and after: page height, First Load JS, lab numbers, the corner, the quiz result and the Story image. Ask the owner to open `/book/maison-abeer` from her Instagram bio link on a real phone. Ask before pushing, before deleting builder worktrees and branches, and before the venue database change (V3).

## Baseline

_Filled in by Task Z3 (before and after of the island change) and I3._

## Self-review

- **Spec coverage:** section 2 hero -> C; pop-ups -> P; Craft Corner -> Z1, K; quiz and share -> Q; how it works and vibe wall kept as islands -> Z3, I2; footer follow line -> P3; craft worlds tint drift -> I2; section 6 typed data -> Z1; section 7 -> I3 inventory; section 8 islands and budgets -> Z2, Z3, I3. Deferred by design: venue records (V3), sign-up, name tags, booking changes (V2).
- **Risks named:** the first-load budget has 0.74 KiB spare, so Z3 comes first and the characters are tiny SVG; the lab's cold CLS depends on the V0 font-swap fix being merged before this starts.
- **Proportion:** 31 tasks against a 312-line design; code blocks are signatures, not bodies.
