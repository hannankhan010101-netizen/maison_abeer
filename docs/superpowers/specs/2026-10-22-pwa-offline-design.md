# A full PWA, with offline reminders for the host

- **Status:** Design drafted 2026-10-22 from the owner's answers. Nothing is built until this
  document and its plan are approved.
- **Date:** 2026-10-22
- **Scope:** the installable app and its offline behaviour. The host side is the offline audience.
  Guests and the booking page only degrade politely.
- **Builds on:** the existing web manifest (`src/app/manifest.ts`, standalone, 192/512/maskable
  icons, `e2e/installable.spec.ts`). Its rules still hold: `start_url` stays `/`, no `orientation`,
  no invented numbers, allergies stay visible, no new runtime dependency.

## Intent

One person, the studio owner, runs everything from one app. Today the app is installable but
online-only: with no signal she sees a blank screen. Studios have patchy wifi and phone signal, and
the moments she most needs the app (setting up before a class, checking who is coming and what to
prepare) are the moments signal is worst.

The owner's words, which fix the scope: offline is "a reminder for myself about the workshop", she
"can manage the checklist as well", and "when anyone books through the booking page, get them booked
and show it to the owner when she gets online". The last one means **saved on the server**, not
queued on the guest's phone: a booking needs the server, because seats are limited.

## What success looks like

Airplane mode, phone on a studio table:

1. She opens the app from her home screen. It opens, instantly, to Today.
2. Today, the calendar and each upcoming workshop show what she last saw: when, where, how many are
   booked, who is coming, their allergies, and the prep checklist. A strip says "Offline. Showing
   what was saved at 4:12 pm".
3. She ticks a prep item and adds a new one. They show at once, marked "waiting to send".
4. Signal returns. The waiting items send on their own, the marks disappear, and anything guests
   booked meanwhile appears within seconds, with a short "new since you were away" note on Today.

## Goals

1. The host app opens with no signal, on every route she has used and on Today, Calendar, Prep and
   each workshop in the next 14 days even if she never opened them.
2. Her saved view is honest: it always says it is saved data and when it was saved.
3. Checklist changes (tick, untick, add a step) work offline, are visible immediately and are never
   silently lost.
4. Reconnecting refreshes everything and sends the waiting changes, in order, once each.
5. The app is a complete PWA: service worker, offline page, version updates that never pull a screen
   out from under her, a richer manifest (id, lang, categories).
6. Nothing gets slower or heavier: initial-route JavaScript grows by no more than 3 KB gzipped, and
   the perf, contrast, axe and reduced-motion guards stay green.

## Non-goals

- Creating, moving, cancelling or rescheduling workshops and slots offline. These need the server
  (seats change as guests book; some actions message guests).
- Offline guest edits, messages, chat, broadcasts, settings, exports. They show "needs a connection".
- Offline for guests: the booking page and the guest portal need the server. Offline they show a
  clear message and keep what the guest typed. A booking is never confirmed without the server.
- Push notifications (for example "new booking"). They need server keys and a sender. Offered as a
  follow-up, not part of this.
- A custom "Install app" prompt. The browser's own install prompt and the manifest are enough.

## Anti-goals

- Stale data presented as current. A saved screen without its "saved at" time is a failure.
- A queued change that vanishes, replays twice, or reorders (adding a step and then ticking it).
- The service worker caching API responses. They carry bearer tokens and guest details.
- Her being locked out by a broken service worker, or stuck on an old version.
- Guest names, phones or allergies left readable on the device after she signs out.

## The design

### 1. Service worker (hand-written, no dependency)

One `public/sw.js`, registered from a small client component in the root layout, **production
builds only** (never under `next dev`). It does three things and nothing else:

- **Static files, cache-first:** `/_next/static/*`, the four self-hosted fonts, icons. These are
  content-hashed, so a cached copy is always right.
- **Pages, network-first with a fallback:** a navigation tries the network, and if it fails serves
  the last good copy of that page, else a generated `/offline` page. The host pages are client
  components that fetch their data after load, so the cached HTML is a shell with no guest data in it.
- **API calls are never touched.** The worker passes them straight through. Offline data comes from
  section 2, not from the worker.

Updates: a new worker installs in the background and takes over only when every app window is closed
and reopened. It never reloads a screen in use. The worker file is served `no-cache` so a fix always
reaches her. There is a documented kill switch: shipping a worker that unregisters itself.

### 2. Saved data (host reads, no dependency)

The data layer is TanStack Query (`ApiProvider`, `createQueryClient`). A small module of ours saves a
**whitelist** of its host read queries to IndexedDB after each successful fetch, and restores them
before first paint:

- sessions in a window, session detail, roster (names, allergies), checklist, class types, settings.
- Each entry keeps its saved-at time, and the whole store is tagged with the build id, so a new
  release never reads an old shape.
- Entries older than 14 days are dropped.
- On open, and on reconnect, the app prefetches the next 14 days of workshops with their detail,
  roster and checklist, so a workshop she never opened is still there offline.
- Restored data shows as stale: queries stay "offline" instead of erroring, and the strip says so.

Signing out, or a **different person** signing in, clears the saved data, the saved role, the waiting
changes and the page cache. A 401 alone clears the saved data and page cache but **never the waiting
changes**: after a long offline stretch the access token has expired, and the `online` event can fire
before the session has refreshed.

### 3. Waiting changes (checklist only)

Three actions work offline: tick or untick an item, and add a step to a workshop. Each is written to
an IndexedDB queue and applied to the screen at once (optimistically, marked "waiting to send").

- **Order is kept**, and a tick on a step that was added offline waits for that add, then uses the
  real id the server returns.
- **Each change is sent once.** A tick sets a state, so repeating it is harmless. An add is not
  repeatable, so before replaying one the app reads the checklist and skips it if an identical step
  was created meanwhile.
- **Failures are visible.** If the server refuses a change (for example the class or the step is
  gone), it moves to a "couldn't send" list with the reason and a Dismiss, and is never silently
  dropped.
- Replay starts on the browser's `online` event, on the app regaining focus, and on launch. It first
  waits for the session to refresh and retries a 401 once. If it still fails with 401, the changes
  stay queued, the chip says "Sign in again to send", and they send after she signs in as the same
  person.

### 4. What she sees

- **Offline strip** (top of every host screen, only when offline): "Offline. Showing what was saved
  at <time>". Polite live region, not an alarm.
- **"Waiting to send (n)"** chip with a list, shown whenever the queue is not empty, online or not.
- Screens that need the server show "Needs a connection" instead of an error, and keep any
  unsaved text. Guests' booking form is the same: it keeps what was typed and says so.
- **"New since you were away"** on Today, only after a stretch in which the app was offline and then
  reconnected in the same app session: the bookings and cancellations that differ between the saved
  data and the refresh, with no invented counts. A normal launch while online shows nothing, and no
  extra snapshot of guest data is stored for it.

### 5. The manifest, completed

Add `id`, `lang` and `categories`. **No shortcuts and no host-only `scope`:** one manifest serves
both hosts and guests, and a shortcut straight into a host screen is the launch `HostOnly` exists to
stop. Existing rules stay: `start_url` `/`, no `orientation`, the three icons.

### 6. Opening offline

The home-screen launch opens `/`, which today asks the server who she is (`RoleRouter` calling
`whoami`). Offline that fails. So the app saves the last known role on the device whenever the server
answers, and **offline only** uses it to choose the screen: a saved `host` goes to Today from cached
data. The saved role grants nothing: every data request still carries her token and the server decides
what she gets. Online behaviour is unchanged. The saved role is wiped with the rest on sign-out.
A caller with no saved role who opens `/` offline sees the existing "couldn't work out where to send
you" page, now with the offline strip. If the session itself is gone, she is sent to sign in, as today.

## Architecture

- **New files, each with one owner:** `public/sw.js`, `src/lib/pwa/registerServiceWorker.ts`,
  `src/lib/pwa/offlineStore.ts` (IndexedDB wrapper), `src/lib/pwa/persistQueries.ts`,
  `src/lib/pwa/changeQueue.ts`, `src/lib/pwa/useOnline.ts`, `src/components/pwa/OfflineStrip.tsx`,
  `src/components/pwa/PendingChanges.tsx`, `src/app/offline/page.tsx`.
- **Touched:** `src/lib/api/provider.tsx` (restore and persist hooks, 401 handling),
  `src/components/RoleRouter.tsx` and `src/lib/auth/role.ts` (saved role), the two checklist hooks in
  `src/lib/api/hooks.ts`, the host layout (strip and chip), `src/app/manifest.ts`.
- **No new dependencies.** IndexedDB and the service worker are used directly.
- **No backend change.** Every endpoint used exists. Add-step is not idempotent, so replay checks
  first (section 3).

## Verification

- Unit tests for the store (round trip, build-id mismatch, 14-day expiry, clear on sign-out), the
  query whitelist (nothing outside it is saved), and the queue (order, add-then-tick, once-only
  replay, refused change lands in the failed list, StrictMode safe).
- Browser tests on a **production build** (the worker does not run in dev): load Today with stubbed
  API responses, go offline (`context.setOffline(true)`), reload, and see Today, a workshop with its
  roster and allergies, and the strip; tick and add a step offline and see "waiting to send"; go
  online and see the requests sent once each, in order, and the chip gone; sign out and see the store
  empty. Also: the manifest fields, the worker controls the page, the `/offline` fallback.
- axe clean with and without reduced motion at 375px and 1440px; the strip and chip meet 44px and
  contrast rules.
- Initial-route JavaScript delta measured; perf-scroll guard unchanged.
- Looked at in a real browser, including once on a phone in airplane mode.

## Risks

| Risk                                                      | Handling                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A bad worker traps users on an old version                | `no-cache` worker file, update on next launch, a self-unregistering kill-switch release                          |
| Guest data left on the device                             | Whitelist, 14-day expiry, wiped on sign-out and on 401                                                           |
| The session ends while offline (token refresh cannot run) | Verify Supabase keeps the session on a network error; the saved role (section 6) launches her offline either way |
| Demo mode's in-process fake API hides the network         | The offline browser tests use stubbed network responses on a production build, not demo mode                     |
| Browsers that evict IndexedDB under storage pressure      | Treat the store as a cache: an empty store falls back to the online-only behaviour                               |
| A replayed add-step creates a duplicate                   | Read-then-skip before replay; one pending-add per text per workshop                                              |

## Decisions and my calls (mark any you disagree with)

- Hand-written worker and our own IndexedDB persistence, not a library. This avoids a dependency
  change you would have to approve, and the surface is small.
- 14-day window, 14-day expiry.
- Updates apply on the next launch, never mid-session.
- Replay on `online`, focus and launch rather than the Background Sync API (not available everywhere).
- The "new since you were away" note on Today.
- No manifest shortcuts, because guests install the same manifest.
- Push notifications for new bookings stay out of this and are the natural next step.

## Left to the builder

The IndexedDB schema and migration; offline states for the Today cards outside the whitelist
(birthdays, failed messages) and for date-range queries when the day changes; the exact worker cache names and eviction; the strip's and
chip's visual design within the existing tokens and motion rules; how `/offline` looks; copy beyond
the lines above; how the production-build browser tests are launched.
