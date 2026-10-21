# Storefront v3 — Phase B (the doors) Implementation Plan

> **For agentic workers:** This plan executes as **turbo FULL** (the owner's standing rule for
> multi-unit work): the orchestrator does the baseline and integration inline; units L, E, T and C go
> to turbo-builders in their own worktrees, two at a time; an independent turbo-reviewer reads the
> merged result. **Nothing starts until the owner approves this plan.** Steps use `- [ ]` syntax.

**Goal:** Carry the storefront's bar through the doors: a sign-in screen that looks like the same
studio, a recovery link page that is calm and correct, a booking confirmation the guest can keep as a
picture, and a portal that explains itself when it cannot find a booking.

**Architecture:** Four units on disjoint files, no shared scaffold. Presentation changes stay out of
auth logic: `login/page.tsx` keeps its handlers, `enter/page.tsx` keeps its effect and ref, and new
look lives in extracted components and one stylesheet per unit. The ticket image is drawn in the
guest's own browser on a canvas (their clock, their timezone, the page's loaded fonts), so no server
route, no URL carrying booking details and no dependency.

**Tech Stack:** Next.js 15.5, React 19, Tailwind v4 + `tokens.css`, Vitest + Testing Library (jsdom),
Playwright 1.62 (projects `mobile`, `tablet`, `desktop`). Browser Canvas 2D and the Web Share API.

**Spec:** `docs/superpowers/specs/2026-10-21-storefront-v3-shop-window-design.md` (Phases table, row B;
§8 "Login"), building on Phase A (tip ef86449). Read both; the plan argues from them.

## Global Constraints

- No new runtime dependency. `three` and the dead 3D files stay until the owner decides (decision 4).
- Fraunces is the **storefront's** face. `/login` and `/enter` must not fetch it (`hero.spec.ts` asserts
  this at line ~281). Doors use the existing display face (`font-display`).
- No invented number, quote or count. An illustration says "for example" in the page's own hand.
- Auth hardening stays exactly as is: one sign-in error message for every failure, `safeDestination` on
  `?next=`, `method="post"`, the button disabled until mounted, the `/enter` token stripped from the
  address bar before any network call and redeemed exactly once.
- `portal_token` is a credential: never in a URL, a file name, storage, a log or the ticket image.
- Animate `transform`, `opacity`, `clip-path` and registered properties only; every effect has a
  reduced-motion end state, new CSS motion under `@media (prefers-reduced-motion: no-preference)`.
- Touch targets >= 44px, inputs >= 16px, WCAG AA on every ink/surface pair, no sideways scroll at 375px.
- Builds and verification use `NEXT_DIST_DIR=.next-build`. Heavy commands (whole-suite vitest,
  `next build`, Playwright) run under `flock -w 540 /tmp/claude-1000/bbt-heavy.lock`, with the `pgrep`
  wait in its own Bash call first. Run only the browser specs a change touches.
- Builders branch from the **local** `feat/deploy-vercel` HEAD (origin lacks the work), in their own
  worktrees on `turbo/b-<unit>` branches, edit only owned files, and end commits with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commands run from `Frontend/` unless stated.

## Review Focus

1. **Ticket with awkward data:** a 60-character class name wraps to two lines and ends in an ellipsis,
   `location: null` prints no line (never "null"), an emoji in the name does not break the layout. Tests:
   Task B8.
2. **Share cancelled or unsupported:** the guest dismissing the share sheet (AbortError) shows no error;
   no Web Share file support falls back to a download; `toBlob` returning null shows a retry line, not a
   crash. A waitlist place gets **no** ticket (it is not a seat). Tests: Tasks B9, B10.
3. **`/enter` under StrictMode and with no token:** the token is redeemed once, never twice; no token reads
   as "already used"; a network failure reads as "something went wrong on our side". Tests: Task B5.
4. **Claim edge cases:** `claimed: false` with the server's message; the claim request itself failing
   (must not read as "no booking found" — it is "we could not check"); a guest with real workshops and a
   late `claimed: false` shows no alarming notice. Tests: Tasks B12, B13.
5. **Login regressions:** still disabled until mounted, still one error message, still 16px inputs,
   headline sparkle stays with its word at 1440 and 375, the example card is labelled and carries no
   numbers. Tests: Tasks B2, B3.

---

## Batch plan

| Order       | Tasks   | Who                                             |
| ----------- | ------- | ----------------------------------------------- |
| Baseline    | B1      | orchestrator                                    |
| Batch 1     | B2-B7   | L (login v2) and E (`/enter` v2), in parallel   |
| Batch 2     | B8-B14  | T (ticket image) and C (claim states), parallel |
| Integration | B15-B18 | orchestrator                                    |

Batch 2 is cut from the tip after Batch 1 merges, so T and C see the merged login and enter.

## Baseline (orchestrator)

### Task B1: Record the baseline and cut the base

- [ ] **Step 1:** in a Bash call of its own, wait for other heavy commands: `pgrep -f '[n]ext build|[p]laywright|[v]itest'`.
- [ ] **Step 2:** under the flock, run `npm run typecheck && npx vitest run`; record unit counts in this file under "Baseline".
- [ ] **Step 3:** under the flock, `NEXT_DIST_DIR=.next-build npx next build`; record First Load JS for `/login`, `/enter`, `/book/[slug]`.
- [ ] **Step 4:** write `BASE_SHA` to `.turbo/storefront-v3/phase-b/BASE_SHA`, and the unit briefs beside it (gitignored); commit the baseline numbers: `docs(plan): phase B baseline`.

## Unit L — Login v2 (builder)

**Owns:** `src/app/(auth)/login/page.tsx`, `BrandPanel.tsx`, `BrandPanel.test.tsx`, new `login/page.test.tsx`,
new `login/ShowcaseTicket.tsx` (+ test), new `src/styles/units/login.css` (+ `login-css.test.ts`), new `e2e/login.spec.ts`.

### Task B2: Characterise the form before touching it

- [ ] **Step 1: Tests** in `login/page.test.tsx` (mock `getSupabaseBrowserClient`, `next/navigation`): `signs in disabled until mounted` (button is disabled on the first render, enabled after effect); `shows one message for any failure` (error from Supabase and a thrown client both render the text matching /don't match|couldn't reach/ and never the Supabase error text); `only follows a same-origin next` (`?next=https://evil.test` replaces to `/`, `?next=/calendar` to `/calendar`); `form posts` (`method="post"`).
- [ ] **Step 2:** run `npx vitest run "src/app/(auth)/login/page.test.tsx"`. Expected: PASS against the current code (characterisation). If a case fails, the code or the test is wrong; stop and report.
- [ ] **Step 3: Commit** — `test(login): pin the form's behaviour before the redesign`.

### Task B3: A sign-in door that looks like the studio

**Interfaces — Produces:** `ShowcaseTicket(): JSX.Element` in `login/ShowcaseTicket.tsx`, replacing the local `ShowcaseCard` in `BrandPanel.tsx`.

- [ ] **Step 1: Tests.** `ShowcaseTicket.test.tsx`: renders the text `for example` in a `font-hand` element; contains **no digit** other than inside the date leaf (assert the text content outside `[data-leaf]` matches `/^\D*$/`); is `aria-hidden`. `login-css.test.ts` (read the file, as `nav-css.test.ts` does): every `animation`/`transition` sits under `prefers-reduced-motion: no-preference`; no `font-variation-settings`; no `@import`.
- [ ] **Step 2:** run both. Expected: FAIL (file missing).
- [ ] **Step 3: Implement.** `ShowcaseTicket`: a ticket-shaped card in the booking card's language (dashed stub edge, `DateLeaf` with a craft colour, a shaped seat ring drawn on with `stroke-dashoffset`), tilted with `Tilt` from `components/motion/Tilt`; two paper cards fanned behind it. It shows no seat count or "nearly full": the ring is decorative and labelled by the hand note `for example`. `login.css` holds the draw-on and the fan, motion under `no-preference`.
- [ ] **Step 4:** headline: `Your studio <span class="whitespace-nowrap">bestie ✨</span>` stays; the form card gains the same paper/clay treatment as the storefront's booking card (radius, border, `--shadow-soft`); on `<lg` the brand panel is still hidden and the two ambient washes remain. Do **not** change handlers, field ids, `FIELD_CLASSES`' no-size rule or the disabled-until-ready logic.
- [ ] **Step 5:** run `npx vitest run "src/app/(auth)"` and `npx prettier --check` on owned files. Expected: PASS.
- [ ] **Step 6: Commit** — `feat(login): a ticket on the brand panel, the form in the booking card's hand`.

### Task B4: Login measured in a browser

- [ ] **Step 1:** `e2e/login.spec.ts` (`mobile` and `desktop`): axe clean with and without reduced motion; inputs >= 16px; targets >= 44px; no sideways scroll at 375; the headline's sparkle and word share a line at 1440 and 375 (bounding boxes of the span lie on one row); the page requests no Fraunces file (copy the request-collection from `hero.spec.ts:275-290`).
- [ ] **Step 2:** under the flock: `E2E_PORT=3111 npx playwright test e2e/login.spec.ts e2e/fonts.spec.ts --project=mobile --project=desktop`. Expected: PASS.
- [ ] **Step 3:** screenshot `/login` at 1440 and 375, look at both, commit `test(login): browser specs for the new door`.

## Unit E — `/enter` v2 (builder)

**Owns:** `src/app/enter/page.tsx`, new `src/app/enter/page.test.tsx`, new `src/components/public/doors/EnterStates.tsx` (+ test), new `src/styles/units/enter.css` (+ `enter-css.test.ts`), new `e2e/enter.spec.ts`.

### Task B5: Pin the redeem logic first

- [ ] **Step 1: Tests** in `enter/page.test.tsx` (mock `@/lib/supabase/client` `redeemPortalToken`, `next/navigation`, `window.location.assign`, `history.replaceState`): `redeems once under StrictMode` (render inside `<StrictMode>`, `redeemPortalToken` called once, with the token and type); `strips the token before the network` (`replaceState` called before `redeemPortalToken`); `type=signup is passed through, anything else is magiclink`; `success navigates to /portal`; `false result reads as used` (`role=alert` with "already been used"); `a throw reads as our side` ("couldn't sign you in just now"); `no token reads as used`.
- [ ] **Step 2:** run `npx vitest run src/app/enter`. Expected: PASS against current code. **Commit** — `test(enter): pin the redeem-once behaviour`.

### Task B6: Calm states, same logic

**Interfaces — Produces:** `EnterWaiting(): JSX.Element`, `EnterFailed({ kind }: { kind: 'spent' | 'broken' }): JSX.Element` in `doors/EnterStates.tsx`; `page.tsx` renders them in place of its local `Waiting` and `Card`.

- [ ] **Step 1: Tests** in `EnterStates.test.tsx`: waiting has `role="status"` with sr-only "Signing you in" and no visible digits; `spent` and `broken` each render a `role="alert"` with the current headline text (so B5's tests still pass unchanged); `broken` offers a `Try again` button that reloads (calls `window.location.reload`), `spent` does not (a spent token cannot be retried); each has one 44px action or none. `enter-css.test.ts`: motion only under `no-preference`.
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3: Implement.** A drawn key-and-ticket sticker in SVG (hand-drawn stroke, the storefront's stickers' ink), a pulsing-free waiting state (a slow stroke draw, static under reduced motion), failure cards in the same paper/clay treatment. Extract presentation only; the `useEffect`, the `attempted` ref and the `history.replaceState` stay in `page.tsx` byte for byte.
- [ ] **Step 4:** run `npx vitest run src/app/enter src/components/public/doors`. Expected: PASS (B5's cases included). **Commit** — `feat(enter): calmer waiting and failure states`.

### Task B7: Measured

- [ ] **Step 1:** `e2e/enter.spec.ts`: `/enter` (no token) shows the "already used" alert; `/enter?token=x` with the Supabase verify call routed to a 500 shows the "our side" alert and a Try again button; axe clean with and without reduced motion at 375 and 1440; no sideways scroll.
- [ ] **Step 2:** under the flock: `E2E_PORT=3112 npx playwright test e2e/enter.spec.ts --project=mobile --project=desktop`. Expected: PASS. Screenshot both states at both widths, look, commit `test(enter): browser specs`.

## Unit T — The saveable ticket (builder)

**Owns:** `src/components/public/booking/Confirmation.tsx` (+ test), `booking/SaveTicket.tsx` (+ test), `src/components/public/BookingFlow.tsx` (the one prop pass-through), new `src/lib/public/ticket.ts` (+ test), new `src/lib/public/ticketCanvas.ts`, `src/styles/units/booking.css`, new `e2e/ticket.spec.ts`.

### Task B8: The ticket model

**Interfaces — Produces** (`ticket.ts`, pure, no DOM):

```ts
export interface TicketModel {
  studio: string;
  className: string;
  day: string;
  time: string;
  location: string | null;
}
export function ticketModel(input: { result: BookingResult; studioName: string }): TicketModel;
export function ticketFilename(className: string): string;
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[];
```

- [ ] **Step 1: Tests** (`ticket.test.ts`): `ticketModel` uses `formatDay`/`formatTime` from `bookingCopy` and copies `location` (null stays null); it has **no** `portal_token` key and `JSON.stringify(model)` never contains the token passed in `result`; `ticketFilename('Bento cake decorating')` → `bento-cake-decorating-ticket.png`, `''` and `'🎂🎂'` → `ticket.png`, a 120-character name is cut to 60 characters of slug; `wrapLines` with a 10-per-character measure: fits one line, wraps at spaces, a single 40-character word is hard-cut, overflow past `maxLines` ends the last line in `…` and never exceeds `maxWidth`.
- [ ] **Step 2:** run `npx vitest run src/lib/public/ticket.test.ts`. Expected: FAIL.
- [ ] **Step 3:** implement the three functions in `ticket.ts` (greedy wrap on spaces; slug = lowercase, non-alphanumerics to `-`, trimmed). **Step 4:** run. Expected: PASS. **Step 5: Commit** — `feat(ticket): model, filename and line wrapping`.

### Task B9: Drawing and saving

**Interfaces — Produces** (`ticketCanvas.ts`, client only):

```ts
export const TICKET_SIZE = { width: 1080, height: 1350 } as const;
export async function renderTicket(model: TicketModel): Promise<Blob | null>;
export async function saveTicket(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded' | 'cancelled'>;
```

- [ ] **Step 1: Tests** (`ticketCanvas.test.ts`, with a stubbed `navigator` and a fake anchor): `saveTicket` calls `navigator.share({ files })` when `canShare({ files })` is true and returns `'shared'`; an `AbortError` from share returns `'cancelled'` and does not download; without `canShare` it clicks a download anchor named `filename`, revokes the object URL, and returns `'downloaded'`; any other share error falls back to the download. (`renderTicket` is proven in the browser in B11; jsdom has no canvas.)
- [ ] **Step 2:** run. Expected: FAIL. **Step 3: Implement.** `renderTicket`: `await document.fonts.load('600 64px "Young Serif"')` and the hand face, then draw 1080x1350 in literal hex copied from `ogCard.tsx` (`#fff8f0` paper with the dotted texture, `#40302a` ink, the dashed stub edge, a tear-line notch, the studio name small, the class name large wrapped with `wrapLines` over `ctx.measureText`, day and time, location when present, and "see you at the studio" in the hand face); resolve `null` when `canvas.toBlob` yields null. No `portal_token` anywhere in the module.
- [ ] **Step 4:** run. Expected: PASS. **Step 5: Commit** — `feat(ticket): canvas drawing and share-or-download`.

### Task B10: The button on the confirmation

**Interfaces — Consumes:** `ticketModel`, `renderTicket`, `saveTicket`, `ticketFilename`. **Produces:** `SaveTicket({ model }: { model: TicketModel }): JSX.Element`; `Confirmation` gains the prop `studioName: string`; `BookingFlow` passes `data.studio.name`.

- [ ] **Step 1: Tests.** `SaveTicket.test.tsx` (mock the canvas module): idle label `Save my ticket`; while working the button is disabled with `Saving…`; `'cancelled'` returns to idle with no alert; `'downloaded'` shows a polite `Saved to your photos or downloads`; a `null` blob shows `role="alert"` "We couldn't make your ticket just now" and a retry. `Confirmation.test.tsx` gains: booked result renders `Save my ticket`; **waitlisted renders none**; the token never appears in the document text or any attribute.
- [ ] **Step 2:** run. Expected: FAIL. **Step 3: Implement** a secondary (non-clay) 44px button under the stub, above the portal handoff, so the primary action stays "Open my portal". Focus order: heading, ticket, Save, Open portal. **Step 4:** run `npx vitest run src/components/public/booking`. Expected: PASS. **Step 5: Commit** — `feat(booking): save the ticket as a picture`.

### Task B11: The picture, measured

- [ ] **Step 1:** `e2e/ticket.spec.ts` (copy the stub/booking helpers from `booking.spec.ts`): book, click `Save my ticket`, catch the `download` event, assert the file name ends `-ticket.png`, the bytes start with the PNG magic, width 1080 and height 1350 (read the IHDR chunk), size < 600 KB. Repeat with a 60-character class name and `location: null`. Add the waitlist case: no Save button. Axe clean with and without reduced motion.
- [ ] **Step 2:** under the flock: `E2E_PORT=3113 npx playwright test e2e/ticket.spec.ts e2e/booking.spec.ts --project=desktop --project=mobile`. Expected: PASS.
- [ ] **Step 3:** open a saved PNG with the Read tool and look at it for the normal, long-name and no-location cases. Commit `test(ticket): the saved picture, measured`.

## Unit C — The claim flow explains itself (builder)

**Owns:** `src/components/portal/GuestShell.tsx` (the claim part only), new `src/components/portal/ClaimNotice.tsx` (+ test), `src/components/portal/MyWorkshops.tsx` (`NothingYet` only), new `MyWorkshops.test.tsx`, `src/lib/demo/transport.ts` (a claim scenario for demo mode only), new `e2e/claim.spec.ts`.

### Task B12: The notice

**Interfaces — Produces:** `ClaimNotice(): JSX.Element | null`, replacing `ClaimOnFirstVisit` (same single `claim.mutate()` on mount, same eslint note); rendered inside the guest container below the header.

- [ ] **Step 1: Tests** (`ClaimNotice.test.tsx`, mock `useClaimAccount`): pending renders nothing; `claimed: true` renders nothing; `claimed: false` renders a `role="status"` card with the server's `message` and the lines "Use the email you booked with, or ask your studio to resend your link"; the request **erroring** renders `role="alert"` "We couldn't check your bookings just now" and a `Try again` button that calls `mutate` again; `mutate` is called exactly once on mount (StrictMode too).
- [ ] **Step 2:** run `npx vitest run src/components/portal/ClaimNotice.test.tsx`. Expected: FAIL. **Step 3:** implement; the open-thread branch of `GuestShell` renders the hook with no visible output (thread is full-screen). **Step 4:** run. Expected: PASS. **Step 5: Commit** — `feat(portal): say so when no booking is found`.

### Task B13: The empty list

- [ ] **Step 1: Tests** (`MyWorkshops.test.tsx`, mock `usePortalProfile`/`usePortalWorkshops`): empty success shows `Nothing here yet…`, never "undefined"; error shows the alert and a working Try again; waitlisted rows stay in "upcoming" (the existing guarantee, now pinned).
- [ ] **Step 2:** run. Expected: PASS for the guarantees, FAIL for the new `NothingYet` copy: "Booked already? It can take a minute to appear. Otherwise ask your studio for the booking link" in the hand face; no emoji-only meaning.
- [ ] **Step 3:** implement; **Step 4:** run; **Step 5: Commit** — `feat(portal): an empty list that says what to do`.

### Task B14: Measured

- [ ] **Step 1:** add a demo-mode scenario so the e2e can see `claimed: false` (read `lib/demo/transport.ts`; the least invasive switch, e.g. a cookie or query flag honoured only when `isDemoMode()`; add a unit case that production folds it away). `e2e/claim.spec.ts`: notice visible and axe clean at 375 and 1440; hidden when claimed; Try again path; no sideways scroll.
- [ ] **Step 2:** under the flock: `E2E_PORT=3114 npx playwright test e2e/claim.spec.ts e2e/portal.spec.ts --project=mobile --project=desktop`. Expected: PASS (portal.spec:103 may fail on its own as on f39f8de; report, do not fix).
- [ ] **Step 3:** screenshot, look, commit `test(portal): the claim notice, measured`.

## Integration (orchestrator)

### Task B15: Merge

- [ ] After each batch: merge each `turbo/b-*` branch into `feat/deploy-vercel`; `npm run typecheck && npx vitest run` green before the next merge. Resolve nothing by hand: a conflict means two units touched one file, which is a plan bug to report.

### Task B16: The full gate

- [ ] Under the flock: `npm run lint && npm run typecheck && npx vitest run && npx prettier --check .` (pre-existing prettier drift in four untouched files is known; list anything else). `NEXT_DIST_DIR=.next-build npx next build`: First Load JS for `/login`, `/enter` and `/book/[slug]` <= baseline + 4 kB each. Then only the doors' specs plus `fonts.spec`, `hero.spec`, `booking.spec`, `a11y.spec`, `reduced-motion.spec`, `mobile.spec`. The perf guard from a checkout with no dev server; score >= baseline.
- [ ] Record the numbers below. Look at login, enter (both states), the confirmation with its ticket, and the portal notice at 1440 and 375.

### Task B17: Independent review and the fix round

- [ ] Dispatch `turbo-reviewer` (model: opus, read-only) with the spec, this plan and the diff range. Ask for correctness, auth regressions (the five hardening rules above), honesty-rule breaches, a11y and perf. Summary <= 1,500 tokens. Fix findings inline, TDD, one commit each; re-run the touched specs.

### Task B18: Show the owner, clean up

- [ ] Show the numbers and the frames; ask for the Phase B review before Phase C (guest portal).
- [ ] Ask before deleting: the builder worktrees and `turbo/b-*` branches (and the Phase A and 1 leftovers).

## Baseline

_Filled in by Task B1._

## Self-review

- **Spec coverage:** login v2 (L), `/enter` (E), "confirmation screen's saveable ticket image" (T), "claim flow's empty states" (C); the spec's §8 login items were done in Phase A's S0. Not in this phase by design: deletions and the `three` removal (decision 4), the guest portal's motion (Phase C), the Fraunces-on-doors question (kept off, per the hero spec guard).
- **Assumptions to confirm:** a waitlist place gets no ticket picture; the ticket is drawn in the guest's browser rather than by a server route; the doors keep the existing display face.
- **Proportion:** 18 tasks against four spec lines; every code block is a signature, not a body.
