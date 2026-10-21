# Storefront v4, Phase V0 (foundations) Implementation Plan

> **For agentic workers:** This plan executes as **turbo FULL**: the orchestrator does the baseline,
> the data fix and the integration inline with TDD; units S, B and G go to turbo-builders in their own
> worktrees, two at a time; an independent turbo-reviewer reads the merged result. **Nothing starts
> until the owner approves this plan.** Steps use `- [ ]` syntax.

**Goal:** Lay the ground the cute, advanced storefront stands on: the page's schedule arrives in the
first HTML instead of after a browser round trip, the Instagram handle is right and can never render
wrong, a motion-tier system keeps effects smooth on every phone, and automated guards make a dead
button or a heavier page impossible to ship.

**Architecture:** `/book/[slug]` becomes a revalidating cached page (15 s, the API's own seat-count
rule). The server fetch has a 1.2 s timeout and never blocks on a cold API: a miss renders the
existing shell that fetches in the browser. The client revalidates on mount and reconciles seats in
place. No new library, no TanStack Query on the page. A pure tier module decides how much motion a
device gets. A tap-everything test and static guards enforce "every button works". A lab harness
measures the page under Slow 4G and a 4x CPU slowdown.

**Tech Stack:** Next.js 15.5 (App Router, ISR), React 19, Tailwind v4 + `tokens.css`, Vitest +
Testing Library, Playwright 1.62 on **production builds** (ISR and cache do not run in dev).

**Spec:** `docs/superpowers/specs/2026-10-22-storefront-v4-whimsy-design.md` (sections 1, 7, 8,
"Scope note", "Interplay with the offline plan"). Read it first.

## Global Constraints

- **No new dependency.** Fake servers in tests are small Node `http` scripts.
- `/book/[slug]` First Load JS stays at or below the baseline of **139 kB**. No TanStack Query on
  the page.
- A failed or slow server fetch never blocks or breaks the HTML: the page falls back to the existing
  browser fetch, and that fallback is cached at most 15 s.
- Never show a count or claim the API did not return. A stale seat count is corrected in place with
  no layout shift.
- New CSS motion sits under `@media (prefers-reduced-motion: no-preference)`; animate only
  `transform`, `opacity`, `clip-path` and registered properties; 44 px targets; WCAG AA on every new
  ink and surface pair; only Fraunces' `SOFT` axis may animate.
- **Human gates (stop and ask):** O3 changes the sign-in check in `middleware.ts` (auth). O2 writes
  one value to the live database. Neither runs without an explicit "yes" at that moment.
- Heavy commands (whole-suite vitest, `next build`, Playwright) run under
  `flock -w 540 /tmp/claude-1000/bbt-heavy.lock`, one per Bash call, no `pgrep` in the same call. Run
  only the specs a change touches. Builders branch from the **local** `feat/deploy-vercel` HEAD, in
  their own worktrees on `turbo/v0-<unit>` branches, edit only owned files, and end commits with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commit after every task, and report as
  soon as the last acceptance command is green (builders have about 40 turns).
- Commands run from `Frontend/` unless stated. Chat is hidden (`NEXT_PUBLIC_CHAT_ENABLED` off).

## Review Focus

1. **Cold or failing API:** the server fetch times out or returns 5xx, so the page serves the shell,
   fetches in the browser and shows the classes; never a blank page, never a long-cached error. Tests:
   S2, S4.
2. **Seats disagree after hydration:** the cached copy says 3 left, the fresh fetch says full. Only
   the seats text changes, the height is reserved, the button flips to the waitlist. Tests: S3, S4.
3. **Handle edge cases:** `@maison._abeer`, a leading `@`, spaces, capitals, a pasted
   `instagram.com/x/` link, invalid characters, empty and null. Never a link to `@null`, never a link
   to the wrong account. Tests: B1, G1.
4. **Motion tiers:** reduced motion, Data Saver or a slow connection give tier 0; low memory or few
   cores cap at 1; a sustained fps drop steps down mid-session and never back up; the first render is
   tier 0 so hydration cannot mismatch. Tests: B4, B5.
5. **The inventory cannot rot:** a new tappable element with no inventory entry fails the build, and
   every Instagram link is checked against the studio's own handle. Tests: G1, G2.

---

## Batch plan

| Order       | Tasks  | Who                                                 |
| ----------- | ------ | --------------------------------------------------- |
| Baseline    | O1     | orchestrator                                        |
| Batch 1     | S1-S5  | S (server-rendered schedule)                        |
| Batch 1     | B1-B6  | B (handle, tokens, motion tiers)                    |
| Batch 2     | G1-G5  | G (tap-everything, dead-control guard, lab harness) |
| Gated       | O2, O3 | orchestrator, each needs an explicit yes            |
| Integration | X1-X4  | orchestrator                                        |

G goes last because it measures and inventories the merged page.

## Orchestrator

### Task O1: Baseline

- [ ] **Step 1:** under the flock: `npm run typecheck && npx vitest run`, then `NEXT_DIST_DIR=.next-build npx next build`. Record unit counts and First Load JS for `/book/[slug]`, `/login`, `/portal`, `/today` under "Baseline" below.
- [ ] **Step 2:** write `BASE_SHA` and the unit briefs under `.turbo/storefront-v4-v0/` (gitignored); commit the numbers `docs(plan): v0 baseline`.

## Unit S — Server-rendered schedule (builder)

**Owns:** `src/app/book/[slug]/page.tsx` (+ `page.test.tsx`), `src/lib/public/serverClasses.ts` (+ test), `src/lib/public/metadata.ts` (+ test), `src/components/public/BookingFlow.tsx` (+ test), `src/components/public/booking/ClassPicker.tsx` (+ test), `playwright.ssr.config.ts`, `e2e/helpers/fakeApi.ts`, `e2e/server-render.spec.ts`.

### Task S1: One cached server fetch

**Produces:** `fetchClassesServer(slug: string): Promise<PublicClassList | null>` in `serverClasses.ts`: `fetch(`${serverApiBase()}/api/v1/public/${encodeURIComponent(slug)}/classes`, { signal: AbortSignal.timeout(1200), next: { revalidate: 15 } })`; `null` on rejection, timeout or non-2xx. `fetchStudioForMetadata(slug)` becomes a one-line delegate to it, so the page and the metadata share one cached request.

- [ ] **Tests:** returns the parsed list; returns `null` on a rejected fetch, a 500, a 404 and an aborted timeout; passes a signal and `next.revalidate === 15`; `fetchStudioForMetadata` and `fetchClassesServer` call `fetch` once for one render (same URL and options). Implement; PASS; **Commit** `feat(book): one cached server fetch for the schedule`.

### Task S2: The page renders with data, or falls back

**Modifies:** `page.tsx`: `export const revalidate = 15`, `export function generateStaticParams() { return []; }`, and `BookPage` awaits `fetchClassesServer(slug)` and renders `<BookingFlow slug={slug} initialData={data} />`.

- [ ] **Tests** (`page.test.tsx`, mock `serverClasses`): data present is passed as `initialData`; `null` is passed as `null` and the page still renders (no throw); `revalidate` is 15; `generateStaticParams` returns `[]`. Implement; PASS; **Commit** `feat(book): revalidating page with the schedule in the first HTML`.

### Task S3: The client keeps good data and reconciles seats

**Interfaces — Consumes:** `PublicClassList`. **Modifies:** `BookingFlow` gains `initialData?: PublicClassList | null`; state starts from it; no loading skeleton when it is present; the mount fetch still runs (`cache: 'no-store'`); a failed refresh **keeps** the initial data and shows no error; a successful one replaces it. `ClassPicker` rows reserve the seats line's height (`min-h` on the line) so a changed count does not move anything.

- [ ] **Tests:** initial data renders the classes on the first render with no `LoadingClasses`; a rejected refresh leaves them and shows no alert; with no initial data and a rejected fetch the existing error alert shows; a refresh that returns `is_full: true` for a class flips its row to the waitlist wording; the seats line container has the reserved-height class in both states. Implement; PASS; **Commit** `feat(book): reconcile fresh seats in place`.

### Task S4: Proved on a production build

**Produces:** `e2e/helpers/fakeApi.ts` (Node `http` server on 54398 serving `/api/v1/public/maison-abeer/classes`, switchable to slow, 500 and "different seats" modes through a control endpoint), `playwright.ssr.config.ts` (builds with `NEXT_DIST_DIR=.next-ssr`, `API_URL` and `NEXT_PUBLIC_API_URL` pointing at the fake, `next start -p 3141`), and `npm run test:e2e:ssr`.

- [ ] **Step 1: Tests** (`e2e/server-render.spec.ts`): with JavaScript disabled the first HTML contains the class name and the café text; with the fake API slow (3 s) the page still responds in under 2 s and the classes appear after the browser fetch; with a 500 the shell loads and shows the existing error alert; with "different seats" the seats text changes after load and `CLS` stays under 0.05 (PerformanceObserver `layout-shift`).
- [ ] **Step 2:** under the flock: `npm run test:e2e:ssr`. Expected: PASS. **Commit** `test(book): server rendering on a production build`.

### Task S5: Build output

- [ ] **Step 1:** under the flock: `NEXT_DIST_DIR=.next-build npx next build`; the `/book/[slug]` line shows revalidation of 15 s (not a plain dynamic route) and First Load JS is at or below 139 kB. Paste the line into the return report. **Commit** any lint or format fixes.

## Unit B — Handle, tokens and motion tiers (builder)

**Owns:** `src/lib/public/instagram.ts` (+ test), `src/components/public/BookingHero.tsx` and `StudioFooter.tsx` (only their Instagram links, + tests), `src/styles/tokens.css` (additions only), `src/styles/tokens.test.ts`, `src/styles/contrast.test.ts` (new pairs), `src/lib/motion/tier.ts` (+ test), `src/lib/motion/useMotionTier.ts` (+ test), `src/lib/motion/index.ts` (one export line).

### Task B1: The handle, parsed once

**Produces** (`instagram.ts`):

```ts
export function normaliseHandle(raw: string | null | undefined): string | null;
export function instagramUrl(raw: string | null | undefined): string | null; // https://instagram.com/<handle>
export function instagramDmUrl(raw: string | null | undefined): string | null; // https://ig.me/m/<handle>
export function displayHandle(raw: string | null | undefined): string | null; // @<handle>
```

`normaliseHandle` trims, strips a leading `@`, accepts a pasted `instagram.com/<h>` or `https://www.instagram.com/<h>/?x=y` URL, lowercases, and returns the handle only if it matches `/^(?!.*\.\.)[a-z0-9._]{1,30}$/`; else `null`.

- [ ] **Tests:** table: `maison._abeer`, `@maison._abeer`, `  @Maison._Abeer  `, `https://www.instagram.com/maison._abeer/`, `instagram.com/maison._abeer?igsh=1` all give `maison._abeer`; `maisonabeer` stays `maisonabeer`; `''`, `null`, `undefined`, `@@x`, `a b`, `a..b`, a 31-character name and `javascript:alert(1)` give `null`; the three URL helpers return `null` for `null`. Implement; PASS; **Commit** `feat(instagram): one parser for the studio handle`.

### Task B2: Use it everywhere the page links to Instagram

- [ ] **Tests:** `BookingHero` and `StudioFooter` render the link, the `@` text and the `ig.me` message link from the parsed handle; with `null` or an invalid handle they render **no** Instagram link and no stray "@" or "Find us on Instagram". Replace the two template-string links and any `ig.me` link; PASS; **Commit** `fix(storefront): every Instagram link comes from the parsed handle`.

### Task B3: Craft tints and springs

**Produces** in `tokens.css`: `--craft-bento`, `--craft-bento-ink`, `--craft-pottery`, `--craft-pottery-ink`, `--craft-painting`, `--craft-painting-ink` (soft tint and a darker ink for text), `--spring-squish`, `--spring-pop` (easing curves), `--sticker-shadow`.

- [ ] **Tests:** `tokens.test.ts` finds each token; `contrast.test.ts` holds each ink on its tint and on `--color-paper` to AA (4.5:1). Implement; PASS; **Commit** `feat(tokens): craft tints, spring curves, sticker shadow`.

### Task B4: The tier decision

**Produces** (`tier.ts`):

```ts
export type MotionTier = 0 | 1 | 2;
export interface TierSignals {
  reducedMotion: boolean;
  saveData: boolean;
  slowConnection: boolean;
  deviceMemory?: number;
  cores?: number;
  lowFps?: boolean;
}
export function computeTier(signals: TierSignals): MotionTier;
export function createFrameMonitor(opts: {
  raf: (cb: (t: number) => void) => number;
  cancel: (id: number) => void;
  onLow: () => void;
  windowMs?: number;
  lowFps?: number;
}): { start(): void; stop(): void };
```

`computeTier`: 0 when `reducedMotion`, `saveData` or `slowConnection`; else 1 when `deviceMemory <= 2`, `cores <= 4` or `lowFps`; else 2. The monitor counts frames over `windowMs` (default 1000) and calls `onLow` once when the rate falls under `lowFps` (default 45).

- [ ] **Tests:** the table of signal combinations; a fake `raf` driven at 60 fps never calls `onLow`, at 30 fps calls it once after one window, and `stop()` cancels. Implement; PASS; **Commit** `feat(motion): the tier decision and the frame monitor`.

### Task B5: The hook

**Produces** (`useMotionTier.ts`): `useMotionTier(): MotionTier`. First render (and SSR) is `0`; after mount it reads the signals (`matchMedia`, `navigator.connection`, `deviceMemory`, `hardwareConcurrency`), starts the monitor when the tier is 2, steps down on `onLow` and **never steps up within a session**, and writes `document.documentElement.dataset.motionTier`. It reacts to a reduced-motion change. `useMayAnimate` is **not changed** (existing callers keep their behaviour; a later phase migrates them).

- [ ] **Tests:** first render is 0; a desktop-like signal set settles at 2; reduced motion at 0 and flipping it live drops to 0; a low-fps event drops 2 to 1 and later signals never raise it; the data attribute follows. Implement; export from `lib/motion/index.ts`; PASS; **Commit** `feat(motion): useMotionTier`.

### Task B6: Verify

- [ ] `npx vitest run src/lib/public/instagram.test.ts src/lib/motion src/styles src/components/public`; eslint, prettier on owned files; `npm run typecheck` (locked). All exit 0.

## Unit G — Guards and the lab harness (builder, Batch 2)

**Owns:** `e2e/helpers/inventory.ts`, `e2e/tap-everything.spec.ts`, `src/lib/contracts/deadControls.test.ts`, `e2e/perf-lab.spec.ts`, `playwright.lab.config.ts`, `scripts/check-first-load.mjs` (+ `scripts/check-first-load.test.mjs` via vitest), `package.json` scripts only (`test:e2e:lab`, `check:first-load`).

### Task G1: The inventory and the tap-everything test

**Produces:** `INVENTORY` in `inventory.ts`: a list of `{ page: string; name: RegExp; kind: 'anchor' | 'external' | 'button' | 'toggle'; expect: ... }` entries for every tappable element on the public pages at 375 and 1440 (skip link, Explore classes, How it works, the Instagram link, Save a seat, each photo and its keep-heart, the class row, the footer links, the floating pill).

- [ ] **Tests** (`tap-everything.spec.ts`, `mobile` and `desktop`): enumerates every visible `a, button, [role=button], summary` and **fails on any element with no inventory entry**; each anchor's target exists and scrolls into view; each button's declared outcome occurs (a sheet or card opens, a state changes); each external link's `href` equals the URL built from the studio's own parsed handle (not a constant); every control has an accessible name and a 44 px hit area. Implement against the current page; PASS on the baseline; **Commit** `test(storefront): tap everything`.

### Task G2: Static guard for dead controls

- [ ] **Tests** (`deadControls.test.ts`): reads every non-test `.tsx` under `src` and fails on `href="#"`, `href='#'`, `onClick={() => {}}` and `onClick={undefined}` on an interactive element, and on an `<a>` with no `href`. A short allow-list for `href="#main"` and `#booking-widget` style in-page anchors that match an `id` in the repo. Implement; PASS; **Commit** `test(contracts): no dead controls`.

### Task G3: The lab harness

**Produces:** `playwright.lab.config.ts` (project `lab`, builds with `NEXT_DIST_DIR=.next-lab`, the fake API from S4 on 54398, `next start -p 3142`) and `e2e/perf-lab.spec.ts`: via CDP, `Network.emulateNetworkConditions` Slow 4G (1.6 Mbps down, 150 ms latency), `Emulation.setCPUThrottlingRate` 4, a Moto G-class viewport (412x823, device scale 2.6); loads `/book/maison-abeer` warm and cold-cache, collects LCP, CLS, TBT and total transfer with `PerformanceObserver`, writes JSON to `test-results/lab.json`, and **asserts** LCP <= 1800 ms and CLS < 0.05 on the warm run, recording (not asserting) the cold run.

- [ ] Under the flock: `npm run test:e2e:lab`. Expected: the numbers print; the warm-run assertions pass or the report says by how much they miss. **Commit** `test(perf): the lab harness`.

### Task G4: The bundle budget

**Produces:** `scripts/check-first-load.mjs <buildLogFile> <route> <maxKb>` exits non-zero when the route's First Load JS exceeds the number in a `next build` log, with a unit test over sample log text (pass, fail, route missing).

- [ ] Implement; PASS; `npm run check:first-load` wired to the log of `NEXT_DIST_DIR=.next-build next build` with `/book/[slug]` and `139`. **Commit** `test(perf): first-load budget check`.

### Task G5: Verify

- [ ] Under the flock: `npm run test:e2e -- e2e/tap-everything.spec.ts --project=mobile --project=desktop` (the existing dev-server config), `npx vitest run src/lib/contracts scripts`, eslint and prettier on owned files, `npm run typecheck`. All exit 0.

## Gated (orchestrator)

### Task O2: The Instagram handle in the live data (needs a yes)

- [ ] **Step 1:** read the current value of `instagram_handle` for the studio (read-only) and show it. **Step 2:** ask the owner: "Set it to `maison._abeer`?". **Step 3:** only on yes, update it through the same brand-kit update the Settings screen uses, then read it back and confirm the public API returns `maison._abeer` and the page links to `https://instagram.com/maison._abeer`.

### Task O3: Skip the session check on `/book` (auth change, needs a yes)

- [ ] **Step 1:** show the owner the exact middleware change (public path `/book` and its children skip `supabase.auth.getUser()`; every other path unchanged) and what it gives up: guests' session refresh on `/book` visits (their sessions still refresh on `/portal`). **Step 2:** only on yes: a failing test in the middleware tests that `/book/x` with a session cookie makes no Supabase call and `/portal` still does; implement; PASS; **Commit** `perf(middleware): no session check on the public booking page`.

## Integration (orchestrator)

### Task X1: Merge

- [ ] After each batch merge each `turbo/v0-*` branch; `npm run typecheck && npx vitest run` green before the next merge. A conflict means two units touched one file, which is a plan bug: stop and report.

### Task X2: The full gate

- [ ] Under the flock: lint, typecheck, `npx vitest run`, prettier on the files this plan changed; `NEXT_DIST_DIR=.next-build npx next build` and `npm run check:first-load`; `npm run test:e2e:ssr`; `npm run test:e2e:lab` (record before and after); the dev-server specs `e2e/booking.spec.ts e2e/hero.spec.ts e2e/memories.spec.ts e2e/cls.spec.ts e2e/a11y.spec.ts e2e/reduced-motion.spec.ts e2e/tap-everything.spec.ts` on `mobile` and `desktop`; the perf-scroll guard from a checkout with no dev server running. `portal.spec.ts:103` mobile is a known unrelated failure. Record numbers below.

### Task X3: Independent review and the fix round

- [ ] Dispatch `turbo-reviewer` (model: opus, read-only) with the spec, this plan and the diff range. Ask for: a failing server fetch that gets cached too long, a wrong or unsafe Instagram link, a tier that can mismatch hydration or step up, an inventory that can be bypassed, anything that adds weight to the first screen. Summary at most 1,500 tokens. Fix findings with TDD, one commit each.

### Task X4: Show the owner

- [ ] Show before and after: the first-HTML check, the lab numbers, First Load JS, and the corrected Instagram link on the live page. Ask for the V0 review before V3 (venues) and V1 (the landing page). Ask before deleting builder worktrees and branches, and before pushing.

## Baseline

_Filled in by Task O1._

## Self-review

- **Spec coverage:** section 8 (server-rendered schedule, 15 s cache, 1.2 s timeout, in-place seats, no TanStack Query, middleware, budgets, lab profile) -> S, O3, G3, G4; the wrong-handle bug and handle guard -> B1, B2, O2; the whimsy tokens and adaptive tiers -> B3, B4, B5; "every button works" -> G1, G2; "Interplay with the offline plan" needs no code here (the worker allowlist already excludes `/book`).
- **Assumptions to confirm:** the tier hook is new and `useMayAnimate` is left alone until a later phase migrates callers; the middleware change and the data write are each asked for at the moment they run; the lab numbers are lab numbers, not field numbers.
- **Proportion:** 30 tasks against a 312-line design; code blocks are signatures, not bodies.
