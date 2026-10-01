# ADR 0003 — Mobile ergonomics: clearance, reach and feedback

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

The PRD's user is a studio host on a phone, one-handed, with clay on their hands (§3.4). The
frontend already took that seriously before this ADR: a 44px minimum touch target, a 16px
input floor so iOS never zooms on focus, `env(safe-area-inset-bottom)` on both tab bars,
`dvh` in the chat, and an `e2e/mobile.spec.ts` that measures all of it at 375px.

That suite measures **size**. It never measured **occlusion**, **reach** or **touch
feedback**, and a class of defects had settled underneath it. Measured in Chrome at 375×812:

| Defect | Measurement |
| --- | --- |
| Toast rendered on top of the tab bar | toast y 744–788 vs bar y 747–812 — **41px of overlap** |
| "More" sheet pinned at a hardcoded `bottom-[68px]` above a bar that is 64px **+** safe-area inset | clears by 3px here, covers ~31px of the tabs on a phone with a home indicator |
| "More" sheet ignored Escape, never took focus, leaked Tab into the bar beneath it | — |
| `Modal` capped at `max-h-[90vh]` | 713px tall in an 812 viewport, submit button at y 694–738 — behind the keyboard, and `vh` does not shrink |
| No `interactiveWidget` in the viewport | Android Chrome overlays the keyboard, so the chat's `h-dvh` rows report space that is not there |
| `GuestRow`'s only target was the name text | 72×44 inside a 343×100 row — ~90% dead |
| Create actions at the top of the screen | `+ Add a guest` y=167, `+ new session` y=265 — 480–580px from the thumb |
| Booking card's forward arrow was `group-hover:opacity-100` | never appears on a phone; no `active:` state either |
| `/today` rendered one column in DOM order | critical alerts below the fold, under a card the host had already read |

## Decisions

**1. A pinned element is positioned from what it has to clear, never from a number.**
`--tab-bar-host` and `--tab-bar-guest` in `styles/tokens.css` are the single source for both
bars' heights. The bars set their own `min-height` from them; the "More" sheet and the floating
create button are `calc(var(--tab-bar-host) + …)`. `styles/tokens.test.ts` asserts both against
`--tap-min`.

Two corrections to this, both from naming the wrong part of a box:

- The bar tokens are the bar's **content** height; its box is that plus `border-t`. The "More"
  sheet named the height alone and so landed *on* that border — 1.0px of overlap at 375×812,
  one tick under an occlusion guard that rejected above 1, so the suite written for this defect
  passed with nothing to spare. The border is now `--tab-bar-border`, both bars draw their
  `border-t` from it, the sheet adds it, and the guard's threshold is 0 rather than 1 (nothing
  else comes within 1rem of the bar).
- `env(safe-area-inset-bottom)` has exactly one owner for in-flow content: `body`
  (`app/globals.css`, since before this ADR). `<main>` and the guest column are *inside* that
  padding box, so naming it again counted it twice — 194px of `main` padding plus 34px of
  `body` padding to clear a 98px bar and a button 170px up, ~58px of dead scroll on every host
  screen on a notched phone. Only surfaces outside the flow — the bars, the Fab, the toast, the
  sheet, the modal — name the inset themselves. `AppShell.test.tsx` asserts `main` does *not*
  (headless Chromium reports the inset as 0px, so no browser measurement can see this).

The toast is rendered as a *sibling* of the shell, so it cannot inherit a variable set on it.
`ToastProvider` therefore wraps its subtree in a `display: contents` element carrying the
offset — no box, no layout effect, but a common ancestor the custom property can inherit
through. Each shell passes the class describing its own bar; the fallback of `0px` keeps the
plain 1rem inset wherever there is no bar (desktop, and the open chat thread).

**2. Overlay behaviour lives in one hook.** `lib/useDismissable.ts`, extracted from `Modal`,
which already had it right. Escape, focus-in, focus-return, Tab trap and body scroll lock.
Any overlay added later gets it rather than reimplementing a worse version, which is exactly
what the "More" sheet had been. That sheet is a `dialog`, not a `menu`: `role="menu"` promises
`menuitem` children and these are ordinary navigation links.

**3. Heights that must survive the keyboard use `dvh`, and the viewport opts into resizing.**
`dvh` alone is not enough: Android Chrome's default `interactiveWidget` is `resizes-visual`,
which paints the keyboard over the page without changing `dvh` at all. Both are required —
`interactiveWidget: 'resizes-content'` in `app/layout.tsx` and `dvh` at the call site.

**4. Below `sm`, a modal is a bottom sheet.** It rises from the bottom edge and stacks its
footer in DOM order, which puts the primary action lowest — nearest the thumb and the last
thing above the keyboard. Every footer in the app is already written secondary-first, so no
call site reorders itself.

`flex-col-reverse` is right for exactly one footer: the one whose last child is destructive.
`CancelBookingModal` (`SessionRoster`) is the only `variant="danger"` in the app, and the
default made "Cancel the seat" the lowest, full-width control in a sheet flush with the screen
edge, with "Keep the booking" — the safe escape — further from the thumb. That is a
`destructiveFooterAction` prop on `Modal`, default off, rather than a global choice, which
would invert every other footer. Scoped below `sm`: reversing the desktop row too would put
visual order out of step with Tab and the reading order for keyboard users, who are
overwhelmingly at desktop width, and the hazard being fixed is a thumb. `Modal.test.tsx` and
`SessionRoster.test.tsx` assert both halves.

**5. The primary create action moves into the thumb zone below `lg`, and replaces the header
button rather than joining it.** `ui/Fab.tsx`. Two visible controls with one accessible name
is a worse outcome than the reach problem being fixed, so the header button is `hidden
lg:inline-flex` and the FAB is `lg:hidden` — the same breakpoint the tab bar itself uses, so
a tablet never shows both.

**6. A list row is the target, not the words in it.** Stretched link (`after:absolute
after:inset-0` over a `relative` row); anything else interactive in the row gets `relative
z-10` — as does text a host *copies* rather than reads, because under the overlay a drag starts
a link drag and a long-press offers Open-in-New-Tab instead of the selection handles. That is
why `GuestRow`'s memory note is `relative z-10 w-fit`: it is the mini-CRM field (PRD §2.4) that
gets pasted into a WhatsApp reply.

This is a property of a *navigation* list, not of a row, so it is opt-in (`linkWholeRow`) and
off by default. `GuestRow` has two call sites: `GuestList` is a navigation list, while
`SessionRoster` is an editing surface where the host is assigning tables, and a reach for the
`<select>` that lands 20px short — the exact mis-tap the 44px floor exists for — must not
navigate away mid-seating with no undo. The pressed state (`active:bg-blush/60`) is gated with
the link, since it is what advertises a row as a navigation target.

**7. Nothing may depend on hover.** A phone has none. Any affordance revealed by `hover:` or
`group-hover:` is either visible by default and *enhanced* on hover from `sm` up, or paired
with an `active:` state.

**8. A gesture is never the only route.** The calendar's week swipe is an addition; the
prev/next buttons stay visible at every width. A gesture as the sole way to reach a view
fails WCAG 2.5.1 and strands anyone using a screen reader or a keyboard on a phone.

A touch gesture is also keyed to one `pointerId` and wired to the cancel path. Tracking "the
last pointerdown" is wrong on a phone held one-handed: the base of the thumb rests on the edge
of the list while the index finger taps, the second contact overwrites the start point, and the
finger that lifts first is diffed against the other's origin — a 310px "swipe" out of a
stationary tap, rewinding the week while `onSelect` navigates. Pinch-zoom (`maximumScale: 5`)
did the same. And a pointer the browser claims for a scroll ends in `pointercancel`, never
`pointerup`, so the agenda declares `touch-pan-y` (taking the x axis out of the browser's
scroll candidates, which is what made diagonal swipes "flaky") and clears its start point on
`pointercancel`/`lostpointercapture` — without which the "already tracking one finger" guard
latches on the first scroll and no swipe ever starts again.

**9. Priority beats symmetry in a single column.** Below `lg` the dashboard grid is one
column, so DOM order is reading order: critical alerts lead the main column, ahead of the
Next Up card. Rendered once, not once per breakpoint — a copy hidden by a media query is
still in the DOM, and `role="alert"` appearing twice is ambiguous to anything reading the
page. On desktop it leads the main column instead of sitting in the side rail, which is the
right weight for it there too.

**10. Installability is an ergonomic feature — and it is global.** `app/manifest.ts` with
`display: standalone` recovers roughly 100px of browser chrome on an 812px screen for a tool
opened daily in a studio, and removes the collapsing-toolbar behaviour `dvh` exists to work
around.

`start_url` is `/`, not `/today`. Next links one manifest from every route, including the guest
portal, so a guest can install from `/portal` as easily as a host from their dashboard, and `/`
is the only start URL that asks who opened the app (`page.tsx` → `RoleRouter`) — the same
reasoning that sends a signed-in caller off `/login` to `/`. A host-shaped start URL launches a
guest into the host shell, which is the failure `HostOnly` exists to prevent, arriving through
the front door. A host-specific launch would need a second, scoped manifest.

No `orientation`. Pinning the installed window to portrait restricts content to a single
display orientation, which SC 1.3.4 (AA) forbids unless that orientation is essential, and
"we designed for portrait" is not essential: it holds the viewport under 1024px, so the sidebar
nav, the seven-column week grid and the A4 tag-sheet print flow that is the stated desktop job
(PRD §1) all become unreachable from the installed app while a browser tab still has them.

The `theme-color` pair is written once, in `styles/themeColor.ts`, rather than restated in the
toggle, the manifest and the e2e spec. It has to be a literal — the init script runs before any
stylesheet is parsed and the manifest is JSON — so `styles/tokens.test.ts` holds it against
`--color-buttercream` in both themes. Drift there is invisible to `contrast.test.ts` and shows
up only as a seam at the top of the installed app.
`<meta name="theme-color">` is written by the pre-paint init script and kept in step by
`setMocha()`, because dark mode here is a `.mocha` class, not `prefers-color-scheme` — keying
the tag on the media query gave a cream browser bar above a dark-brown app. The media-keyed
declaration in `app/layout.tsx` was **removed** rather than left alongside: with both present
the browser picks whichever media query matches, which is precisely the wrong one.

**11. One answer per question.** `prefersReducedMotion` existed twice with opposite fallbacks
when `matchMedia` is missing — `lib/public/motion` assumed reduced, `ui/Toast` assumed full
motion. `ui/Toast` now re-exports the shared one; the safe default for a visitor who cannot
be asked is to do less. In the same pass `.tap-target` was deleted from `app/globals.css`: it
had zero usages app-wide while reading as the mechanism enforcing the 44px floor, so the next
person would have reached for it instead of the `min-h-[44px]` that actually carries it.

## Consequences

Two new e2e suites, because the existing one could not have caught any of this:

- `e2e/mobile-occlusion.spec.ts` — no fixed element's rect intersects the fixed nav's, on
  every route, at rest and with a toast, a sheet and a modal open; plus the sheet's dialog
  behaviour and the modal's `dvh` cap and bottom-edge placement.
- `e2e/mobile-reach.spec.ts` — the create action sits in the bottom third and clears the bar,
  there is exactly one of it, the last row is not stranded under it, a tap far from a guest's
  name still opens them, and the booking card's arrow is visible without hover.
- `e2e/installable.spec.ts` — the manifest is served and standalone, every icon it names is
  actually served as a PNG, and the theme-color tag follows the mocha toggle.

All three run at every viewport the suite defines, so each test that describes phone-width
behaviour skips itself above its breakpoint (`SM`/`LG` helpers at the top of each file) rather
than failing at 1440px for asking the wrong question.

Both were verified against the original code before being relied on: reintroducing the toast
and sheet defects failed them with `DIV.fixed bottom-6 … covers 41px of the tab bar`.

Three unit assertions that matched literal Tailwind class strings as a proxy for a pixel
guarantee were rewritten to assert the guarantee itself, since a class name cannot evaluate
`calc()` and a 56px square control is not required to say `min-h-[44px]` to be big enough. Two
of those rewrites needed a second pass: the square arm was not anchored to the unprefixed
utility, so `sm:size-11` satisfied a check that only ever speaks about phone width, and
`AppShell`'s padding assertion pinned the doubled safe-area inset rather than the one-owner
rule it should state.

Overlay bookkeeping that touches the document — the body scroll lock and the Escape/Tab
listener — is counted across all open overlays (`lib/useDismissable.ts`) rather than saved per
overlay. A saved value is only correct while exactly one overlay is open, and two are already
reachable: the "More" sheet is `lg:hidden`, so it goes invisible at `lg` while its lock and its
listener stay live, and any page modal opened after that is the second. The release clamps at
zero, because a count that can only be driven down is safer than one a single skipped cleanup
can strand above zero — that would lock the document permanently, where the saved-value version
at least self-heals on the next open and close. (`moreOpen` not resetting across the `lg`
breakpoint is its own small defect — an invisible dialog that stays logically open — and is not
fixed here.)

## Out of scope, found while here

`CalendarView` shipped ~15 lines of seat/reschedule wiring no user could reach: `setEditing` was
only ever called from inside the `editing !== null` branch, and the chip's `onSelect` navigates
to `/sessions/<id>` instead, where `SessionDetail` already owns both flows. The dead state,
block and import were deleted. This is not a mobile-ergonomics decision and is recorded here
only so the next reader knows where it went; it belongs in its own commit.
