# PWA with offline reminders — Implementation Plan

> **For agentic workers:** This plan executes as **turbo FULL**: the orchestrator builds the scaffold
> (P1-P3) and the integration (I1-I4) inline with TDD; units W, S, Q and N go to turbo-builders in
> their own worktrees, two at a time; an independent turbo-reviewer reads the merged result.
> **Nothing starts until the owner approves this plan.** Steps use `- [ ]` syntax.

**Goal:** Make the host app a full PWA: it opens with no signal, shows her workshops, rosters and prep
checklists as saved reminders, lets her tick and add checklist steps offline, and sends those changes
when signal returns. Guests' bookings stay on the server and appear when she is online.

**Architecture:** A hand-written service worker caches only static files and page shells and never
touches the API. A small store in IndexedDB holds a whitelist of TanStack Query reads (saved data) and
a queue of checklist changes. The data layer (`ApiProvider`) restores saved data before first paint
and saves after each fetch. No library, no backend change.

**Tech Stack:** Next.js 15.5, React 19, TanStack Query 5, Supabase auth, Vitest + Testing Library
(jsdom has no IndexedDB), Playwright 1.62 on a **production build** (the worker does not run in dev).

**Spec:** `docs/superpowers/specs/2026-10-22-pwa-offline-design.md` (read it first; the plan argues
from it, including its section 6 "Opening offline").

## Global Constraints

- **No new dependency** of any kind (no workbox, idb, fake-indexeddb, serwist). IndexedDB and the
  service worker are used directly; unit tests use an in-memory backend behind the store interface.
- Initial-route JS grows by at most **3 KB gzipped** (`next build`, compared with the baseline in P1).
- The service worker is registered in **production builds only**, never under `next dev`.
- The worker never caches or answers an API, Supabase, non-GET or cross-origin request.
- **No test-only bypass in auth code.** The production-build browser tests use a small fake Supabase
  server (`e2e/helpers/fakeSupabase.ts`), not a flag in the app.
- A 401 clears saved data and page cache but **never the waiting changes**; only a sign-out or a
  different person signing in clears those (spec section 2).
- Saved data is whitelisted, expires after 14 days and carries the build id (`NEXT_PUBLIC_BUILD_ID`).
- Every screen showing saved data says so and says when it was saved (anti-goal: stale as current).
- Reduced motion: any new motion sits under `@media (prefers-reduced-motion: no-preference)`; 44px
  targets; WCAG AA; no sideways scroll at 375px.
- Heavy commands (whole-suite vitest, `next build`, Playwright) run under
  `flock -w 540 /tmp/claude-1000/bbt-heavy.lock`, one per Bash call, no `pgrep` in the same call. Run
  only the specs a change touches. Builders branch from the **local** `feat/deploy-vercel` HEAD
  (origin lacks the work), in their own worktrees on `turbo/pwa-<unit>` branches, edit only owned
  files, commit per task with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commands run from `Frontend/` unless stated.

## Review Focus

1. **Token expired while offline, then reconnect:** replay waits for the session to refresh and
   retries a 401 once; if it still fails the changes stay queued with "Sign in again to send" and are
   never wiped. Tests: Q4, S4.
2. **Add a step offline, tick it offline, reconnect:** order kept, the tick uses the server's real id;
   a lost response never creates a duplicate step. Tests: Q3, Q4.
3. **Sign-out and a different person signing in** wipe saved data, saved role, queue and page cache;
   a plain 401 wipes everything except the queue. Tests: S3, S4, W3.
4. **The worker never serves or stores account data:** no `/api`, Supabase, POST or cross-origin
   caching; a cached page shell contains no guest data. Tests: W2, W3.
5. **A new day while offline:** window queries are keyed by date, so a day she never saved shows "no
   saved data for this day" and the strip, never a blank error. Tests: S5, N2.

---

## Batch plan

| Order       | Tasks | Who                                                        |
| ----------- | ----- | ---------------------------------------------------------- |
| Scaffold    | P1-P3 | orchestrator, sequential                                   |
| Batch 1     | W1-W5 | W (worker, offline page, manifest)                         |
| Batch 1     | S1-S5 | S (saved data, saved role, restore, wipe rules)            |
| Batch 2     | Q1-Q6 | Q (waiting changes, strip, chip), cut after Batch 1 merges |
| Batch 2     | N1-N3 | N (new-since-away note, Today offline states)              |
| Integration | I1-I4 | orchestrator                                               |

## Scaffold (orchestrator)

### Task P1: Baseline and build id

**Files:** Modify `next.config.*` (headers, env); record numbers in this file under "Baseline".

- [ ] **Step 1:** wait-free baseline under the flock: `npm run typecheck && npx vitest run`, then `NEXT_DIST_DIR=.next-build npx next build`; record unit counts and First Load JS for `/today`, `/portal`, `/book/[slug]`, `/login`.
- [ ] **Step 2: Test** `next.config` exports an `env.NEXT_PUBLIC_BUILD_ID` that is non-empty (`VERCEL_GIT_COMMIT_SHA`, else a build timestamp) and a `headers()` rule giving `/sw.js` `Cache-Control: no-cache, no-store, must-revalidate` and `Service-Worker-Allowed: /`; implement; PASS.
- [ ] **Step 3: Commit** `feat(pwa): build id and no-cache headers for the worker`.

### Task P2: The offline store

**Files:** Create `src/lib/pwa/offlineStore.ts`, `offlineStore.test.ts`.
**Produces:**

```ts
export type StoreName = 'queries' | 'meta' | 'queue';
export interface KeyValueBackend {
  get(s: StoreName, k: string): Promise<unknown>;
  set(s: StoreName, k: string, v: unknown): Promise<void>;
  delete(s: StoreName, k: string): Promise<void>;
  entries(s: StoreName): Promise<Array<[string, unknown]>>;
  clear(s: StoreName): Promise<void>;
}
export function createIndexedDbBackend(): KeyValueBackend | null; // null when IndexedDB is unavailable
export function createOfflineStore(
  backend: KeyValueBackend | null,
  now?: () => number,
): OfflineStore;
export interface OfflineStore {
  getItem<T>(s: StoreName, k: string): Promise<T | undefined>;
  setItem(s: StoreName, k: string, v: unknown): Promise<void>;
  deleteItem(s: StoreName, k: string): Promise<void>;
  entries<T>(s: StoreName): Promise<Array<[string, T]>>;
  wipeSavedData(): Promise<void>;
  wipeAll(): Promise<void>;
}
export const offlineStore: OfflineStore; // the app's instance (IndexedDB, or a no-op when unavailable)
```

- [ ] **Step 1: Tests** (`Map`-backed fake in the test): round trip; `wipeSavedData` clears `queries` and `meta` keys `role`, `savedAt` but keeps `queue` and `meta.ownerId`; `wipeAll` clears all three; a `null` backend makes every call resolve to `undefined`/no-op and never throw; a backend that throws is swallowed (the store is a cache, never a crash).
- [ ] **Step 2:** run; FAIL. **Step 3:** implement `createIndexedDbBackend` (one DB `maison-abeer-offline`, three object stores, values structured-cloned). **Step 4:** PASS. **Step 5: Commit** `feat(pwa): the offline store`.

### Task P3: Online state

**Files:** Create `src/lib/pwa/useOnline.ts`, `useOnline.test.tsx`.
**Produces:** `useOnline(): boolean` (true on the server; follows `online`/`offline` events via `useSyncExternalStore`).

- [ ] **Step 1: Test** it reads `navigator.onLine`, flips on `window` events, and is `true` during SSR. **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(pwa): useOnline`.

## Unit W — Worker, offline page, manifest (builder)

**Owns:** `public/sw.js`, `src/lib/pwa/registerServiceWorker.ts` (+ test), `src/components/pwa/ServiceWorkerRegistrar.tsx`, `src/app/layout.tsx` (one line), `src/app/offline/page.tsx` (+ test), `src/app/manifest.ts`, `e2e/installable.spec.ts`, `playwright.pwa.config.ts`, `e2e/helpers/fakeSupabase.ts`, `e2e/pwa.spec.ts`.

### Task W1: Register only in production

**Produces:** `registerServiceWorker(): Promise<ServiceWorkerRegistration | null>` and `<ServiceWorkerRegistrar />` (renders null; registers `/sw.js` after load).

- [ ] **Step 1: Tests:** returns `null` without calling `navigator.serviceWorker.register` when `NODE_ENV !== 'production'` or the API is missing; registers `/sw.js` with `{ scope: '/' }` in production; swallows a rejection and logs once. A new waiting worker is **never** told to `skipWaiting` (it takes over on the next launch).
- [ ] **Step 2-4:** FAIL, implement, PASS; add `<ServiceWorkerRegistrar />` to the root layout. **Step 5: Commit** `feat(pwa): register the worker in production`.

### Task W2: The worker's routing

**Produces:** `public/sw.js`, plain JavaScript, cache names `ma-static-<v>`, `ma-pages-<v>`, `<v>` = a build id read from `sw.js?v=` at registration (add `?v=${NEXT_PUBLIC_BUILD_ID}` in W1).

- [ ] **Step 1: Tests** (`src/lib/pwa/sw.test.ts`: read `public/sw.js`, evaluate in a `node:vm` context with stub `self`, `caches`, `fetch`): `/_next/static/*`, fonts and icons are cache-first; a navigation is network-first and falls back to the last cached copy of that URL, else the precached `/offline`; **a request is passed through untouched** (the handler does not call `respondWith`) when it is non-GET, cross-origin, `/api/`, under the Supabase origin, or has an `Authorization` header; activation deletes caches whose version differs and never calls `skipWaiting`/`clients.claim` before the old windows close.
- [ ] **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(pwa): the service worker`.

### Task W3: Page shells hold no account data

- [ ] **Step 1: Test** (in `sw.test.ts`): a navigation response with `Set-Cookie`, or `Cache-Control: no-store` on an HTML page that is not in the allowlist `['/', '/today', '/calendar', '/guests', '/prep', '/messages', '/settings', '/tags', '/wrapped', '/offline']`, is not stored; a message `{type: 'WIPE'}` from the page deletes every `ma-pages-*` cache. Export `wipePageCache(): Promise<void>` from `registerServiceWorker.ts` (posts that message) for S to call.
- [ ] **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(pwa): page cache allowlist and wipe`.

### Task W4: The offline page and the manifest

**Produces:** `/offline` (static, calm, "You're offline. Open Today or Prep from your home screen once you've been online"), manifest gains `id: '/'`, `lang: 'en'`, `categories: ['business', 'productivity']`; **no shortcuts, no `scope`**.

- [ ] **Step 1: Tests:** `offline/page.test.tsx` (heading, no digits, one action); `installable.spec.ts` asserts the new fields, `start_url` still `/`, `orientation` undefined, `shortcuts` undefined, every icon still exists. **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(pwa): offline page and richer manifest`.

### Task W5: Measured on a production build

**Produces:** `playwright.pwa.config.ts` (project `pwa`, `webServer`: `NEXT_DIST_DIR=.next-pwa next build && next start -p 3140`, plus the fake Supabase on 54399; env `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399`), `fakeSupabase.ts` (`/auth/v1/user`, `/auth/v1/token`), script `npm run test:e2e:pwa`.

- [ ] **Step 1:** `e2e/pwa.spec.ts`: the worker registers and controls the page after a second load; `/offline` is served with the network off; `/sw.js` has the no-cache header; no `/api/` response is in any cache (`caches.keys()` + `match`); the manifest is linked.
- [ ] **Step 2:** under the flock: `npm run test:e2e:pwa -- e2e/pwa.spec.ts`. Expected: PASS. **Step 3: Commit** `test(pwa): the worker on a production build`.

## Unit S — Saved data and the saved role (builder)

**Owns:** `src/lib/pwa/persistQueries.ts`, `savedRole.ts`, `prefetchUpcoming.ts`, `useSavedAt.ts` (+ tests), `src/lib/api/provider.tsx`, `src/components/RoleRouter.tsx`, `src/lib/auth/role.ts` (+ tests).

### Task S1: What may be saved

**Produces:** `shouldPersist(key: readonly unknown[]): boolean` — true only for `['sessions', 'window'|'detail'|'roster'|'checklist', ...]`, `['class-types']`, `['settings']` (not `brand-kit`), nothing from `guests`, `messages`, `portal`, `adminChat`, `feedback`, `waitlist`, `tags`, `exports`.

- [ ] **Tests:** a table of keys in/out, including a guest list key and a chat key (out). Implement; PASS; **Commit** `feat(pwa): the saved-data whitelist`.

### Task S2: Save after fetch, restore before paint

**Produces:** `attachPersistence(queryClient: QueryClient, store = offlineStore): { restore(): Promise<void>; stop(): void }`; entries are `{ key, data, savedAt }`, tagged with `BUILD_ID`; entries older than 14 days or with another build id are dropped on restore; restored queries get `setQueryData(key, data, { updatedAt: savedAt })` so they read as stale.

- [ ] **Tests** (Map-backed store, a real `QueryClient`): a successful whitelisted query is written (debounced 500 ms); a failed or non-whitelisted one is not; restore round-trips; a 15-day-old entry and a wrong-build entry are dropped; `meta.savedAt` tracks the latest write. Implement; PASS; **Commit** `feat(pwa): save and restore queries`.

### Task S3: Saved role and who owns the data

**Produces:** `saveRole(role: 'host' | 'guest'): Promise<void>`, `getSavedRole(): Promise<'host' | 'guest' | null>`; `recordOwner(userId: string): Promise<'same' | 'different' | 'first'>` (a `different` result calls `wipeAll()` and `wipePageCache()`).

- [ ] **Tests:** `unknown`/`unreachable` roles are never saved; `getSavedRole` is null after `wipeSavedData`; `recordOwner` with a new user id wipes the queue and everything else; the same id wipes nothing. Implement; PASS; **Commit** `feat(pwa): saved role and owner`.

### Task S4: Wire the provider and the 401 rule

**Interfaces — Consumes:** P2, S1-S3, W3's `wipePageCache`. **Modifies:** `ApiProvider` — attach persistence once, `await restore()` before children's first queries run (render children immediately; restore is fast), call `recordOwner` with the Supabase user id when a session appears; `onUnauthorized` now calls `wipeSavedData()` + `wipePageCache()` + `queryClient.clear()` and **not** `wipeAll()`; `SignOutButton`'s path calls `wipeAll()`.

- [ ] **Tests** (`provider.test.tsx` additions): a 401 clears saved data and leaves a seeded queue item; sign-out clears the queue too; restored data is visible to a query on first render; a throwing store does not break the provider. Implement; PASS; **Commit** `feat(pwa): restore on start, 401 keeps the queue`.

### Task S5: Opening offline, and the next 14 days

**Produces:** `prefetchUpcoming(queryClient, api, today: Date, days = 14): Promise<void>` (the window query for each week in range, then `detail`, `roster`, `checklist` for each session in it; one request at a time, stops quietly on failure); `useSavedAt(): Date | null`. `RoleRouter`: when `fetchRole` returns `'unreachable'` **and** the browser is offline **and** `getSavedRole()` is `'host'`, go to `/today`; online behaviour unchanged; `fetchRole` saves a `host`/`guest` answer.

- [ ] **Tests:** `RoleRouter` offline + saved host -> `router.replace('/today')`; offline + no saved role -> the existing "couldn't work out" alert; online unreachable -> unchanged; `prefetchUpcoming` fetches in order and skips already-fresh keys; a day with no saved window yields `undefined` data and no throw. Implement; PASS.
- [ ] **Verify:** `npx vitest run src/lib/pwa src/lib/api src/components/RoleRouter.test.tsx`; eslint, prettier, typecheck (locked). **Commit** `feat(pwa): open offline to Today, prefetch two weeks`.

## Unit Q — Waiting changes and what she sees (builder, Batch 2)

**Owns:** `src/lib/pwa/changeQueue.ts`, `useReplayQueue.ts`, `src/components/pwa/OfflineStrip.tsx`, `PendingChanges.tsx` (+ tests), the two checklist hooks and `useAddChecklistItem` in `src/lib/api/hooks.ts`, `src/components/domain/PrepList.tsx`, `src/app/(portal)/layout.tsx`, `e2e/offline-checklist.spec.ts`.

### Task Q1: The queue's shape

**Produces:**

```ts
export type QueuedChange =
  | {
      id: string;
      kind: 'toggle';
      sessionId: string;
      itemId: string;
      completed: boolean;
      createdAt: number;
    }
  | { id: string; kind: 'add'; sessionId: string; text: string; tempId: string; createdAt: number };
export interface FailedChange {
  change: QueuedChange;
  reason: string;
}
export function createChangeQueue(store: OfflineStore): {
  enqueue(c: Omit<QueuedChange, 'id' | 'createdAt'>): Promise<QueuedChange>;
  pending(): Promise<QueuedChange[]>;
  failed(): Promise<FailedChange[]>;
  dismiss(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  remove(id: string): Promise<void>;
  replaceItemId(tempId: string, realId: string): Promise<void>;
};
```

- [ ] **Tests:** order is insertion order; two toggles of one item collapse to the last; `replaceItemId` rewrites a later `toggle` that targets a `tempId`; `dismiss` removes a failed one; nothing leaves the queue except `remove`/`dismiss`.
- [ ] Implement; PASS; **Commit** `feat(pwa): the change queue`.

### Task Q2: Offline-aware checklist hooks

**Modifies:** `useToggleChecklistItem(sessionId)` and `useAddChecklistItem(sessionId)` — online they behave exactly as today; when offline or the request fails with a `NetworkError`, they enqueue, update the cached checklist optimistically, and resolve (no error toast). `usePendingChecklist(sessionId): QueuedChange[]` overlays pending adds (temp ids, marked pending) and pending toggles onto `PrepList`.

- [ ] **Tests** (mock `useApi`, `useOnline`): online toggle calls PATCH once; offline toggle enqueues and flips the cached item; offline add shows a temp item; an `ApiError` (4xx) is **not** queued. Implement; PASS; **Commit** `feat(pwa): checklist changes queue offline`.

### Task Q3: Replay

**Produces:** `replayQueue(deps: { queue; api: ApiClient; refreshSession: () => Promise<string | null>; listChecklist(sessionId): Promise<ChecklistItem[]> }): Promise<{ sent: number; failed: number; needsSignIn: boolean }>`, using its **own** `ApiClient` built without `onUnauthorized` (a 401 must not redirect or clear anything).

- [ ] **Tests:** sends in order, each once; a `toggle` whose item was added offline waits for the add and uses the real id (`replaceItemId`); before replaying an `add`, reads the checklist and skips it if an item with the same text exists (lost-response guard); a 404/403 moves it to failed with the reason; a 401 calls `refreshSession` and retries once, and if still 401 returns `needsSignIn: true` and leaves everything queued; a network error stops the run and leaves the rest queued. Implement; PASS; **Commit** `feat(pwa): replay the queue`.

### Task Q4: When replay runs

**Produces:** `useReplayQueue(): { pendingCount: number; failed: FailedChange[]; needsSignIn: boolean }` mounted once in the host layout: runs on mount, on `online`, and on window focus; never two runs at once; invalidates the checklist and session queries after a run.

- [ ] **Tests** (fake timers, mocked `replayQueue`): runs on each trigger once; overlapping triggers coalesce; `needsSignIn` surfaces. Implement; PASS; **Commit** `feat(pwa): replay on reconnect, focus and launch`.

### Task Q5: The strip and the chip

**Produces:** `<OfflineStrip />` (only when `!useOnline()`: "Offline. Showing what was saved at {time}", `role="status"`, polite; "Nothing saved yet" when `useSavedAt()` is null) and `<PendingChanges />` ("Waiting to send (n)", a list with Dismiss for failed ones, "Sign in again to send" when `needsSignIn`); both mounted in `(portal)/layout.tsx` inside `AppShell`.

- [ ] **Tests:** strip absent online, present offline with a formatted time; chip hidden at zero, shows count and the failed reason with a 44px Dismiss; both axe-clean (jest-axe is not installed; assert roles and names instead). Implement; PASS; **Commit** `feat(pwa): offline strip and waiting-changes chip`.

### Task Q6: Measured

- [ ] `e2e/offline-checklist.spec.ts` on the production build (`playwright.pwa.config.ts`): load `/prep` online with stubbed API routes, go offline, reload (the page and its data appear, strip visible), tick a step and add one (marked waiting), go online (requests observed once each, in order, chip gone); a 401 on replay leaves the chip with "Sign in again to send"; sign out empties the store (`indexedDB` check). Axe clean at 375 and 1440 with and without reduced motion.
- [ ] Under the flock: `npm run test:e2e:pwa -- e2e/offline-checklist.spec.ts`. Expected: PASS. **Commit** `test(pwa): offline checklist, measured`.

## Unit N — New since away, Today offline states (builder, Batch 2)

**Owns:** `src/lib/pwa/awayDigest.ts`, `src/components/pwa/NewSinceAway.tsx` (+ tests), `src/components/domain/Dashboard.tsx` (+ test), `e2e/offline-today.spec.ts`.

### Task N1: The digest

**Produces:** `createAwayTracker(): { markOffline(at: number): void; markOnline(at: number): void; snapshot(before: Roster[]): void }` and `digestSince(before: SessionSnapshot[], after: SessionSnapshot[]): { newBookings: Array<{ sessionName: string; guestName: string }>; cancellations: Array<{ sessionName: string; guestName: string }> }` where `SessionSnapshot = { id: string; name: string; roster: Array<{ bookingId: string; guestName: string; status: string }> }`.

- [ ] **Tests:** a booking present only after is "new"; one present before and cancelled after is a cancellation; an empty difference gives empty lists; no digest unless a `markOffline` preceded `markOnline` in this app session; counts come from the data, never invented. Implement; PASS; **Commit** `feat(pwa): the away digest`.

### Task N2: Today, offline and after

**Produces:** `<NewSinceAway />` on Today (only after an offline stretch, dismissible); the Today cards that read outside the whitelist (birthdays, failed messages) render "Needs a connection" when offline and not a spinner or error; a Today window with no saved data says "No saved data for this day. Open it once while online."

- [ ] **Tests:** each card state offline; the note appears after offline -> online with a new booking and not on a normal launch; Dismiss hides it. Implement; PASS; **Commit** `feat(today): new since you were away, offline states`.

### Task N3: Measured

- [ ] `e2e/offline-today.spec.ts` (production build): Today loads offline from saved data with the strip; a day she never saved shows the "no saved data" line; going online with one new booking in the stubbed roster shows the note. Under the flock. Expected: PASS. **Commit** `test(today): offline Today, measured`.

## Integration (orchestrator)

### Task I1: Merge

- [ ] After each batch merge each `turbo/pwa-*` branch, `npm run typecheck && npx vitest run` green before the next merge. A conflict is a plan bug: stop and report.

### Task I2: The full gate

- [ ] Under the flock: `npm run lint && npm run typecheck && npx vitest run`; prettier on the files this plan changed; `NEXT_DIST_DIR=.next-build npx next build` -> First Load JS for `/today`, `/portal`, `/login` within baseline + 3 kB; then `npm run test:e2e:pwa` (all PWA specs), plus the dev-server specs `e2e/installable.spec.ts e2e/a11y.spec.ts e2e/portal.spec.ts e2e/booking.spec.ts` on `mobile` and `desktop`, and the perf guard from a checkout with no dev server running. Record numbers below. (`portal.spec.ts:103` mobile is a known unrelated failure.)

### Task I3: Independent review and the fix round

- [ ] Dispatch `turbo-reviewer` (model: opus, read-only) with the spec, this plan and the diff range. Ask for: auth and data-leak risks (anything account-specific in a cache, the saved role's reach), a queued change that can vanish or repeat, the 401 rules, stale data shown as current, a worker that could trap an old version. Summary <= 1,500 tokens. Fix findings with TDD, one commit each.

### Task I4: Phone check and report

- [ ] Show the owner the numbers; with her phone: install from the browser, open once online, airplane mode, open from the home screen, tick and add a step, reconnect. Ask before deleting builder worktrees and branches. Ask before pushing (Vercel Production Branch must be set first).

## Baseline

_Filled in by Task P1._

## Self-review

- **Spec coverage:** section 1 -> W; 2 -> P2/S; 3 -> Q; 4 -> Q5, N2; 5 -> W4; 6 -> S5; the 401 rule -> S4, Q3; "new since away" -> N; kill switch -> a documented unregister release (W2 note below).
- **W2 note:** the kill switch is a `sw.js` that deletes its caches and unregisters itself; keep a copy at `public/sw-kill.js.txt` with the swap instruction in the file header (docs only, not served as a worker).
- **Assumptions to confirm:** Q hooks queue only on offline or `NetworkError`, never on a 4xx; `prefetchUpcoming` runs on launch and on reconnect, one request at a time; the prep page is where the checklist lives, so "each workshop shows its checklist" means via Prep.
- **Proportion:** 33 tasks against a 190-line spec; every code block is a signature, not a body.
