# Advanced motion, real memories, and a whole-app design pass

- **Status:** Proposed — nothing is built until this is approved.
- **Date:** 2026-10-21
- **Scope:** the public booking page first, then the guest portal and login, then the host portal.

## Intent

The booking page now looks like a boutique: cream paper, polaroids, photographs, a drifting
backdrop. It still _feels_ thin in two ways. It is **empty of memory** — there is no sense that
people have been here, laughed, made things — and its **motion is decorative rather than
expressive**: things fade and drift, but nothing responds to a hand, carries an object from one
moment to the next, or rewards a tap.

This work makes the page feel lived-in and alive, and then carries the same language through the
rest of the app so the booking page is not a beautiful lobby in front of a plain building.

## What exists (measured, not assumed)

| Fact                                                                                                 | Consequence                                                                 |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 7 guests, 15 bookings, 6 sessions, **0 guest feedback**, no studio photos, no story text             | There are no real memories to display yet. See "Honest memories".           |
| `gsap` 3.15 ships Flip, Draggable, Inertia, MorphSVG, SplitText, DrawSVG, ScrollSmoother, MotionPath | Every advanced technique below needs **no new dependency**.                 |
| Fraunces is available through `next/font` with `SOFT`, `WONK`, `opsz`, `wght` axes                   | A variable display face we can animate. Young Serif has no axes.            |
| No view transitions, `@property`, or scroll-driven CSS anywhere today                                | Native, zero-JS motion is untouched headroom.                               |
| Front end: 24 domain components (6.7k lines), 21 public (3.8k), 12 ui primitives                     | The host portal is the biggest surface; it is a phase, not an afterthought. |
| `BookingFlow.tsx` is ~1000 lines and is every public unit's integration point                        | Split it first (Phase 0) or parallel work will collide.                     |

## Goals

1. A booking page that feels **inhabited**: memories, small stories, things that react to touch.
2. A **motion language** (tokens + a small kit of primitives) used by every screen, so "advanced"
   is a system and not a pile of one-off effects.
3. The same quality carried through guest portal and host portal, **without** hurting the
   one-handed, clay-dusted-fingers ergonomics of ADR 0003.
4. Everything degrades: reduced motion, Data Saver, slow connections, old browsers, no JS.

## Non-goals

- A rewrite of any screen's behaviour or data flow. This is presentation and motion.
- Dark mode on the storefront (it is pinned light on purpose — see `.storefront`).
- AI-adaptive layouts: with seven guests there is nothing to adapt to.
- New product features (drag-to-reschedule, payments). Flagged where tempting.

## Anti-goals — what would make this a failure even if it technically works

- **Invented social proof.** No made-up testimonials, counts, or "12 people are looking at this".
  An audit of this codebase already removed invented guest quotes once.
- **Stock photos passed off as this studio's own memories.** A section called "our memories"
  filled with strangers' photographs is a small lie. See below.
- Jank on a mid-tier phone, a slower first paint, layout shift, or a page that needs WebGL
  to be usable.
- Motion that is the only carrier of meaning, or that ignores `prefers-reduced-motion`.

## Honest memories

"Fill it with memories" is the heart of the request, and the data to do it honestly is mostly
not there yet. The plan gives the page **three real sources**, and frames anything else
for what it is.

1. **The studio's own photographs and captions** — a new _Settings → Memories_ (paste a link, add a
   caption and a craft tag, order them), the same pattern as Brand Kit's logo and class photos.
   Until the studio adds any, the page shows craft photography framed as **"what you'll make
   here"**, never as "our memories".
2. **Guests' one-word memories.** The post-class feedback form already collects a rating and
   _one word_. With an explicit "share my word on the studio's page" tick, and **host approval
   before anything shows**, these become a wall of floating word-stickers. There are zero today,
   so the section **does not appear at all** until at least one word is approved — an empty
   "be the first memory" panel would invite guests to do something they cannot do from that page.
   The designed empty state lives where it makes sense: the host's approval queue.
3. **Real numbers, only when they mean something** — classes held, guests welcomed — computed live
   and shown once they pass a sensible threshold (proposed: 25). Five classes is not a brag.

Plus one source that needs no data at all: **a scroll story about the craft** ("the making of" — a
lump of clay becoming a vase, drawn in SVG), which is true of pottery everywhere and claims
nothing about this studio.

## The concept audit — what to use from the list

| Concept                          | Verdict                                    | Where, and why                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Glassmorphism                    | **Adopt, sparingly**                       | Ribbon, ticket stub, sticky mobile "Save a seat" bar — over the backdrop and photos, where blur earns its keep. Kept opaque enough for AA; contrast test extended to glass surfaces. |
| Neumorphism                      | **Skip**                                   | Low contrast by construction; fails the PRD's AA commitment.                                                                                                                         |
| Bento grids                      | **Adopt**                                  | The memory wall (mixed-size tiles) and the host dashboard.                                                                                                                           |
| Dark-mode-first                  | **Skip (storefront)** / keep (host portal) | The storefront is the brand's shop window, pinned light. Host portal keeps mocha.                                                                                                    |
| Bold minimalism                  | **Adapt**                                  | Large-type moments (hero, section openers) inside a whimsical system, not a minimal one.                                                                                             |
| Claymorphism                     | **Adopt — it is literally on-brand**       | Puffy buttons, chips and stickers with inner highlights and soft shadows. A pottery studio in clay.                                                                                  |
| Micro-interactions               | **Adopt**                                  | Button squish, seat-count pulse, heart-a-memory, checkbox pop, success burst.                                                                                                        |
| Skeleton / shimmer               | **Adopt**                                  | Replace the pulsing blocks with placeholders shaped like the ticket and the photo tiles.                                                                                             |
| Progressive disclosure           | **Adopt (booking form)**                   | Optional fields behind "anything we should know?" — fewer fields on first sight.                                                                                                     |
| Adaptive density                 | **Adopt (host portal only)**               | Compact / comfortable toggle on lists and the calendar.                                                                                                                              |
| Variable fonts                   | **Adopt**                                  | Fraunces (`SOFT`/`WONK`/`wght`/`opsz`) for display; Nunito's `wght` for emphasis. Headline "wakes up": softness and weight ease in on load and hover.                                |
| Custom easing                    | **Adopt**                                  | A token set; CSS `linear()` curves for real spring overshoot with no library.                                                                                                        |
| Spring physics                   | **Adopt via CSS `linear()` + GSAP**        | No Framer Motion: it would be a new dependency for what GSAP and CSS already do.                                                                                                     |
| Staggering                       | **Adopt**                                  | Already used; extended with SplitText letter reveals on headlines.                                                                                                                   |
| Shared-element transitions       | **Adopt**                                  | View Transitions API: the chosen class's date-leaf _becomes_ the stub on the details step; a memory tile _becomes_ the lightbox. Instant swap where unsupported.                     |
| Scroll-linked animation          | **Adopt**                                  | Pinned "making of" story (ScrollTrigger + MorphSVG); chapters that stack and scale as the next arrives; native `animation-timeline: view()` as a no-JS enhancement.                  |
| FLIP                             | **Adopt**                                  | Memory-wall filter (All / Pottery / Cake / Painting) with `gsap/Flip`; host calendar week change.                                                                                    |
| Gesture-driven motion            | **Adopt**                                  | Polaroids you can toss (Draggable + Inertia, velocity-aware); swipeable chapters on phones.                                                                                          |
| SVG path morphing                | **Adopt, small**                           | The making-of vase; stickers that morph cake → pot → palette between chapters; the step dots.                                                                                        |
| 3D / WebGL                       | **Adapt**                                  | CSS 3D tilt with a light glare on tickets and cards. The WebGL vase is replaced by the SVG story — see decisions.                                                                    |
| Lottie / Rive                    | **Skip for now**                           | A runtime for assets nobody has authored. Hand-drawn SVG + GSAP covers it. Revisit if a designer supplies one celebration animation.                                                 |
| Design tokens                    | **Adopt**                                  | Motion tokens (durations, easings, springs), glass tokens, `@property` colours.                                                                                                      |
| `@property`, view-transition API | **Adopt**                                  | Animatable gradients (aurora drift, a gold edge that travels around the ticket); shared-element transitions.                                                                         |
| Accessible motion                | **Mandatory**                              | Every effect behind `useMayAnimate`; every primitive has a reduced-motion end state and an e2e that proves it.                                                                       |
| Haptics                          | **Adopt, tiny**                            | `navigator.vibrate` on key taps and on booking success — Android only, feature-detected, off under reduced motion.                                                                   |
| Atomic design                    | **Adapt**                                  | Not a folder rewrite. The motion primitives become `components/motion/`, documented, so screens compose them.                                                                        |
| AI-adaptive UI                   | **Skip**                                   | Nothing to learn from yet.                                                                                                                                                           |

## Architecture

**Tokens.** `tokens.css` gains motion tokens: `--ease-out-expo`, `--ease-spring-soft`,
`--ease-spring-bouncy` (the last two as CSS `linear()` curves), durations, glass surfaces
(`--glass-bg`, `--glass-border`, `--glass-blur`), and `@property`-registered colours so gradients
can be animated and tested.

**The motion kit** — `components/motion/` and `lib/motion/`, each with a reduced-motion end state:
`Reveal`, `SplitHeading`, `Tilt` (CSS 3D + glare), `Magnetic`, `DragToss`, `FlipGrid`, `Morph`,
`PinStory`, plus `viewTransition()` (feature-detected `document.startViewTransition`), `haptic()`,
and one GSAP loader so the library is fetched once, after mount, as its own chunk.

**Progressive enhancement rules (every unit):**

1. Content and layout work with no JS and no motion. Motion only ever _adds_.
2. Heavy code loads by `import()` after mount, gated by `useMayAnimate` (reduced motion, Data Saver, slow link).
3. Animate `transform`, `opacity`, `clip-path` and registered custom properties only.
4. Anything a gesture does, a button also does (ADR 0003 §8).
5. New JS in the initial route: ≤ +10 KB gzipped. Everything else is deferred.

**Composition root.** Phase 0 splits `BookingFlow.tsx`: a `StorefrontPage` composes sections, so each
later unit adds its section with one line and units do not edit the same file.

## Phases

Each phase ends at a reviewable, working state and is verified before the next begins.

### Phase 0 — Foundation (small, first, sequential)

Motion + glass tokens; the motion kit; `useMayAnimate` and haptics moved under it; `BookingFlow`
split into `StorefrontPage` + step components; reduced-motion e2e harness that every primitive
must pass. **Done when:** no visual change to the live page, all existing tests green, kit
primitives unit- and e2e-tested.

### Phase 1 — Storefront v2 (large; five units on disjoint files, parallel after Phase 0)

| Unit                         | Contents                                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1A Hero**                  | Fraunces display type with axis animation; SplitText headline; tossable polaroids (Draggable + Inertia); tilt-and-glare ticket chip; clay CTA.                                                                        |
| **1B Memory wall**           | Bento mosaic; Flip filter chips; heart micro-interaction; lightbox with shared-element transition; word-sticker wall (hidden until a word is approved — arrives with Phase 4); framed honestly per "Honest memories". |
| **1C The making of**         | Pinned SVG scene: lump → cylinder → vase, scrubbed by scroll; text beats; a simpler non-pinned version on phones.                                                                                                     |
| **1D Booking card**          | View-transition from class card to details step; clay inputs and buttons; shimmer skeletons shaped like tickets; progressive disclosure of optional fields; success burst with SVG draw-on check and haptic.          |
| **1E Atmosphere & chapters** | `@property` aurora; native scroll-driven layers; glass ribbon and stub; stacking chapters; cake ↔ pot ↔ palette sticker morph.                                                                                        |

### Phase 2 — Guest portal and login (medium)

Route transitions between portal screens (view transitions); card tilt; staggered lists; shaped
skeletons; the workshop detail and chat given the same micro-interaction set. Units: login;
portal home + workshop; chat.

### Phase 3 — Host portal (large; touches the busiest screens)

Sliding tab-bar indicator and sidebar; Today as a bento dashboard with count-ups and progress
rings; calendar week change by FLIP; guests list stagger and skeletons; compact/comfortable
density. Every unit must pass the existing mobile occlusion, reach and 44px specs unchanged.
Units: shell/nav; Today; calendar; guests; settings/tags/wrapped.

### Phase 4 — Memories pipeline (medium; needs migrations — will ask first)

Backend: a `memory` table (photo link, caption, craft, order) and a consent + approval flag on
feedback; public payload gains `memories` and `words`. Front end: _Settings → Memories_ and the
host approval queue; the feedback form's share tick. **Nothing here runs without an explicit go for
the migrations.**

## Verification, per phase

- Unit, typecheck, lint, prettier — all green.
- Playwright at phone and desktop widths for every touched screen: flow, axe (with **and** without
  reduced motion), 44px targets, 16px inputs, no sideways scroll, press states.
- A reduced-motion spec for every motion primitive, **proven by running it against a broken
  version first** (as done for the photo strips).
- Scroll-jank and CPU measurement on a throttled run, replacing `hero-perf.spec.ts`, which measures
  a hero that no longer exists.
- Looked at in a real browser at 375px and desktop before each phase is called done.

## Risks

| Risk                                                                    | Handling                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pinned scroll story fights Lenis smooth scrolling or feels bad on touch | Non-pinned phone variant; falls back to a static three-frame strip under reduced motion.             |
| View Transitions unsupported (older Safari/Firefox)                     | Feature-detected; the swap is simply instant.                                                        |
| Fraunces swap changes the brand voice across the whole app              | A decision (below); can be limited to the storefront.                                                |
| Host-portal motion regresses one-handed ergonomics                      | ADR 0003 specs run unchanged and must pass.                                                          |
| Scope: this is weeks of work for a person                               | Phased; Phases 0–1 deliver the visible change, 2–4 are separate go/no-go decisions.                  |
| GSAP licence terms                                                      | The package is installed and its plugins have been free since 2025; confirm the terms before launch. |

## Decisions needed

1. **Where memories come from** (the biggest one).
2. **Display typeface** — swap Young Serif for Fraunces?
3. **The WebGL vase** — replace with the SVG "making of" story, which removes `three` from the page?
4. **Scope and order** — all phases, or Phases 0–1 first?

## My calls (mark these if you disagree)

- No new dependencies; no Framer Motion, no Lottie, no Rive.
- Nunito and Caveat stay; only the display face changes, and only if you say yes.
- Stock photos remain as craft imagery, never labelled as the studio's own memories.
- Word-sticker wall requires **host approval** before any guest text appears publicly.
- Haptics are Android-only and off under reduced motion.

## Left to the builder

Exact easing curves and durations; the SVG art for the making-of and sticker morphs; tile sizes in
the bento; copy for headlines and captions (in the studio's voice, claiming nothing a class would
have to keep).
