# Storefront v3 — the shop window

- **Status:** Audit done and design proposed 2026-10-21. Nothing is built until the design and the
  plan are approved.
- **Date:** 2026-10-21
- **Scope:** the public booking page (`/book/[slug]`, "the landing page") first, as Phase A. Phases
  B–E carry the same bar through the doors (login, enter, confirmation), the guest portal, the host
  portal and the memories pipeline.
- **Builds on:** `2026-10-21-advanced-motion-and-memories-design.md` (Phases 0–1 are built locally on
  `feat/deploy-vercel`, tip 3f8798c). Its rules still hold: no invented social proof, stock photos
  never labelled as the studio's own, allergies stay visible, only Fraunces' `SOFT` axis animates,
  no new dependencies, everything degrades under reduced motion.

## Intent

The page already has a voice: cream paper, stickers, polaroids, clay buttons, a warm hand. What it
does not yet have is the confidence of a 2026 shop window. It says the studio's _name_ in display
type and its _promise_ in 15px body copy; it repeats six photographs twenty times; it has no way
back to the booking card on a desktop; it stretches one class over eight screens; and the one
section drawn by hand (the making of) is the one that looks least made by hand.

Storefront v3 makes three moves:

1. **Say the promise, not only the name.** Kinetic, editorial type; the name docks into a nav pill.
2. **A page that gets shorter when there is less to say.** A photo budget, honest labels, one rhythm.
3. **Lead the eye, then the thumb.** A floating glass pill, chapters that stack, a making-of that
   earns its scroll, a share card for the link that goes in an Instagram DM.

## What exists (measured 2026-10-21, local dev at 1440×900 and 375×812)

| Finding                                                                                                                                                                                                                                                                                     | Evidence                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The live studio has **one class** (pottery), no logo, no hero photo, no brand colours, no story. The page was designed around three crafts.                                                                                                                                                 | `GET /api/v1/public/maison-abeer/classes` → 1 class, every studio field `null`.             |
| The same **six pottery photographs** appear about twenty times on the one-craft page: three in the fan, two in the chapter, four on the wall, twelve-plus in the marquee.                                                                                                                   | Screenshots `storefront-d-00…08`; `public/studio` holds 4 photos per craft.                 |
| The photo marquee is labelled **"moments from the studio"** over stock photographs — the exact thing the previous design forbade.                                                                                                                                                           | `PhotoMarquee.tsx:62-63`.                                                                   |
| The one-class page is **7,479px tall on desktop** (8.3 screens) and 5,134px on a phone. Roughly two desktop screens are near-empty: the run-in before "Clay is shaped a little at a time" and the pinned story's run-out.                                                                   | `storefront-d-03`, `-05`, `-06`.                                                            |
| **No wayfinding on desktop.** No wordmark, no nav, no persistent "book" once the hero scrolls away (`StickyCta` is `md:hidden`). The only desktop routes back to the card are the chapter buttons.                                                                                          | `StickyCta.tsx` docstring; desktop frames.                                                  |
| The making-of is **flat vector beside photography** — a terracotta silhouette on a plate, three viewports of scroll for four shapes. The biggest quality gap on the page.                                                                                                                   | `storefront-d-04`, `-05`, `-06`; `storefront-m-04`.                                         |
| **Latent sideways scroll on phones.** With a studio story set, `StorySection`'s decorative `MagicalPattern` SVG extends the document to 468–493px at 375px. Live data has no story, and the e2e fixtures never set one, so the no-sideways-scroll gate never saw it.                        | `overflow2.mjs`: `scrollWidth` 468/489/493 with 1/2/3 classes + story; 375 without a story. |
| **Link previews are generic.** `/book/[slug]` has title "Book a class", description "Pick a workshop and save your seat.", no studio name, no Open Graph image. This link is mostly shared in Instagram DMs and WhatsApp, where the preview _is_ the ad.                                    | `app/book/[slug]/page.tsx` metadata.                                                        |
| Every section has the **same cadence**: handwritten eyebrow, centred Fraunces heading, content. Seven times.                                                                                                                                                                                | All frames.                                                                                 |
| Copy that only works for three crafts: "**Pick** your kind of mess" above one chapter; "8 seats open across **1 class** right now".                                                                                                                                                         | `storefront-d-01`, `-07`.                                                                   |
| The desktop chapter panel leaves ~40% of its text column empty under the button. "How it works" is three identical cards that take a full phone screen. The footer is a name, a sign-off and one link.                                                                                      | `storefront-d-02`, `storefront-m-01`, `-06`.                                                |
| Login (host's door): the headline's ✨ wraps alone at 1440px; the illustrative card says "8 / 10 seats · Nearly full 🔥" — invented numbers, on the one page where the host knows they are invented, but the same smell.                                                                    | `login-d-full`.                                                                             |
| Motion budget is spent on **atmosphere**: four washes, confetti, sparkles, grain, a particle field, a custom cursor and Lenis, before anything the guest can touch. The scroll-smoothness guard passes 4/5 at the edge of budget.                                                           | `StorefrontBackdrop.tsx`; memory of the Phase 1 gate.                                       |
| **What is already right and stays:** the hero composition and tossable fan, the clay CTA, the stickers, the chapter uncover, the memory wall and lightbox, the glass sticky bar on phones, the honest copy, the reduced-motion and contrast guards, the self-hosted fonts, the ticket card. | —                                                                                           |

## What a 2026 visitor expects — the trend audit

Sources agree on the direction and disagree on the labels. Trend pieces from
[GetResponse](https://www.getresponse.com/blog/landing-page-design-trends),
[Zoho](https://www.zoho.com/landingpage/landing-page-design-trends.html),
[Moburst](https://www.moburst.com/blog/landing-page-design-trends-2026/),
[Line25](https://line25.com/articles/web-design-trends-2026/) and
[Pixelmatters](https://pixelmatters.com/insights/7-UI-design-trends-to-watch-in-2026) were read on
2026-10-21; they are vendor opinion, used here only to check that nothing below is already dated.

| Trend                                                  | Verdict            | Where                                                                                                                                               |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editorial, oversized, **kinetic typography**           | **Adopt**          | Hero v3: the promise as a display line whose verb rolls through the crafts taught. Letters already soften in on `SOFT`.                             |
| Headline that **docks into the nav** on scroll         | **Adopt**          | The studio's name shrinks into the floating pill (native scroll timeline; plain fade where unsupported).                                            |
| **Floating glass pill** nav                            | **Adopt**          | One pill for all widths; absorbs the phone-only sticky bar. Glass tokens already measured for AA.                                                   |
| "Liquid glass" refraction                              | **Adapt, lightly** | An inner edge highlight and a specular sweep tied to scroll, on the pill only. No heavy blur over moving photos; blur is expensive while scrolling. |
| **Scroll-driven storytelling**, native CSS timelines   | **Adopt**          | Chapters that really stack (the rule exists, the effect is barely visible), the making-of scrub, the nav docking. Zero new JS for the CSS paths.    |
| **Stacking / sticky cards**                            | **Adopt**          | Chapters on desktop: each sticks and the next slides over it, the one behind scaling to 0.96 and dimming.                                           |
| Bento grids                                            | Keep               | The wall. With one craft it is a plain 4-up; with two or more it is the mosaic.                                                                     |
| Claymorphism, stickers, grain, hand-drawn imperfection | Keep               | The brand's own language; the making-of v2 draws its hands in the sticker outline style.                                                            |
| Micro-interactions, haptics, cursor labels             | Keep               | Already built.                                                                                                                                      |
| **Dynamic link previews** (Open Graph image per page)  | **Adopt**          | A generated 1200×630 card per studio: name, crafts, the next class. The link's first impression in a DM.                                            |
| Horizontal-scroll sections                             | Skip               | A phone gesture region with no other route fails ADR 0003 §8; the ribbon already gives sideways motion.                                             |
| Video hero                                             | Skip               | No footage. Stock video of strangers would break the honesty rule harder than stock stills do.                                                      |
| Brutalism / anti-design                                | Skip               | Off-brand for cream-and-pink.                                                                                                                       |
| Dark-mode-first, AI personalisation, 3D/WebGL, Lottie  | Skip               | Decided in the previous design; nothing has changed.                                                                                                |
| Monochrome palettes                                    | Skip               | The craft colours are load-bearing (they identify class types).                                                                                     |

## Goals

1. A first screen that says what happens here, in type a stranger reads from across the room.
2. A page whose length follows its content: a one-class studio gets a tight page, a three-craft studio gets the long one, and no photograph is shown more than twice.
3. A way back to the booking card from anywhere, on every width, in one tap.
4. A making-of that looks drawn by the same hand as the stickers, and takes two screens, not three.
5. A link that previews as the studio, not as "Book a class".
6. Nothing slower, nothing less accessible: the perf guard, the contrast guards, axe and the reduced-motion specs all stay green, and initial-route JS grows by no more than 8 KB gzipped.

## Non-goals

- New booking features (payments, calendar files, reschedule). The confirmation "ticket" image is Phase B.
- A marketing site for the product at `/`. Today `/` sends an anonymous visitor to `/login`; see the open question.
- Dark mode on the storefront.
- Replacing the stock photographs. The memories pipeline (Phase E) is what replaces them, with the studio's own.

## Anti-goals

- Any invented number, quote, count or "people are looking at this".
- A label that calls stock photography the studio's own. "Moments from the studio" goes.
- Motion that is the only carrier of meaning, or that runs under reduced motion.
- A gesture region (horizontal scroller, drag) with no button that does the same job.
- A heavier first paint: no new runtime dependency, no font beyond the four already self-hosted.

## The design

### 1. Hero v3 — the name stays, the promise grows

The studio's name remains the `h1`, in Fraunces, softening in letter by letter as now. Under it, in
place of the 15px sentence, a **display-size kinetic line**:

> come **throw** something with your own hands

The bold verb rolls vertically through the verbs of the crafts the studio teaches, derived from the
class list exactly as the chapters are: pottery → _throw · centre · trim_, cake → _pipe · frost ·
swirl_, painting → _paint · dab · glaze_. A one-craft studio rolls only its own verbs. Verbs describe
the activity, not what a guest takes home, so the line claims nothing a class would have to keep.
A handwritten underline (an SVG stroke in Caveat's weight) redraws under each new verb.

Mechanics: a clip-path window with a translateY stack of `<span>`s, CSS only, 2.6s per word, paused
while the tab is hidden and on hover. The rolling words are `aria-hidden`; a visually hidden copy
reads "come make something with your own hands" so a screen reader hears one sentence and no live
region. Reduced motion: the verb is a static "make".

Everything else in the hero stays: stickers, next-class chip, clay CTA, "How it works", Instagram
line, the tossable fan. The secondary link's target changes from the three-card section to the new
receipt (below), same `#how-it-works` id.

### 2. The floating pill — one nav for every width

A glass pill appears once the hero leaves the viewport and steps aside while the booking card is on
screen (the two `IntersectionObserver` conditions `StickyCta` already has; that component becomes
this one). Contents: the studio's name as a wordmark, the next class in brief on `sm` and up
("Fri · 8 seats"), and a clay **Save a seat** button.

- Phones: bottom-centre, above the home indicator, as the sticky bar is today.
- `md` and up: top-centre, 16px from the top edge.
- **Docking:** the pill appears the moment the hero has left the viewport, and on `md` and up its
  wordmark arrives large and settles — scaling from 1.6× to 1× on the soft spring as the pill fades
  in — so the name reads as having gone to the top of the page. No shared element and nothing in the
  hero's own files: the hero unit and the pill unit stay independent, and the hero decision (below)
  does not change this unit. Transform and opacity only. Under reduced motion the pill simply
  appears.
- Liquid-glass touches, both cheap: a 1px inner highlight (`inset 0 0 0 1px var(--glass-border)`)
  and a specular sweep — a registered `@property` angle on a conic gradient border, driven by the
  same scroll timeline, so the light on the pill moves as the page does. Static where unsupported.
- Surface is the existing `--glass-bg` (88% paper), already proven AA for cocoa and latte ink by
  `glass.test.ts`. Every target 44px.

### 3. Density, the photo budget, honest labels

Two words, used precisely from here on. A **craft** is a class type, read from its colour token
(terra → pottery, sage → painting, anything else → cake), exactly as the chapters do today. A
**class** is one dated session. The live studio has one craft and one class; a pottery studio with
three Saturdays has one craft and three classes.

A single allocator decides which photograph goes where. The rule is **no photograph more than twice
on the page, and prefer one not yet used**; slots are filled in this order and a slot that cannot be
filled within the rule stays empty:

1. Fan: the cover of each taught craft, then more of the same crafts (one craft → its three best).
2. Chapters: one large + one polaroid per craft, preferring photos the fan did not take.
3. Wall: every photo with a use left, up to eight.
4. Marquee: the uses still left, and only if there are at least six. Otherwise the marquee does not
   render. Its label becomes **"the crafts, up close"**.

With four photographs per craft that works out as: one craft → fan 3, chapter 2, wall 3, no marquee;
two crafts → fan 2, chapters 4, wall 8, no marquee; three crafts → fan 3, chapters 6, wall 8, marquee 7. The marquee is a three-craft treat; a one-craft page shows each photo at most twice instead of
three to four times.

Sections adapt to what there is:

- One **craft**: the "Pick your kind of mess" header goes; the single chapter stands under its own
  eyebrow.
- The postcard section is removed on every page (its number is already in the hero chip and the
  card; three tellings of one fact is two too many). Its one honest fact moves into the ticket stub
  on step 1 only: one open **class** → "8 seats left this Friday" (via the existing `whenCopy`);
  several → "14 seats across 3 classes"; none open → no line.
- Two or more crafts: "Pick your kind of mess", the chapters and the mosaic as now; the marquee when
  the budget allows.

"How it works" becomes a **receipt**: one paper card, three numbered lines separated by dashed rules,
a torn edge at the foot, the same three sentences. Half the height on a phone; on desktop it sits
beside the ribbon's end rather than taking a screen of its own.

The vertical rhythm comes from one token, `--section-gap: clamp(56px, 9vw, 112px)`, instead of
per-section margins, and the cadence breaks on purpose: chapters left-align their heading, the wall's
heading shares a row with its filter chips on desktop, the making-of's heading sits beside the scene,
the footer goes big.

### 4. The making of, v2

Same story, same morph, same four beats, same no-JS fallback — better drawn and better paced.

- **Clay with a surface.** A two-stop radial body with a specular highlight, an SVG `feTurbulence`
  grain masked to the silhouette, a rim shadow on the wheel head. Throwing lines draw on with
  `stroke-dashoffset` as each stage arrives.
- **Hands.** Two outlined hands in the sticker style (cocoa stroke, no fill) approach the clay at
  "centred", cup it at "opened", draw upward at "pulled" and lift away at the end. The hands are the
  story; the pot is what they leave behind.
- **Layout.** Desktop: scene left (55%), the four beats as a vertical list right, the active beat in
  cocoa and the rest in latte, a terracotta dot sliding between them. The lonely heading above a pot
  goes. Pin length drops from ~3 viewports to 2. Phones keep the 2×2 strip with the new art.
- Reduced motion: four finished frames, as now.

### 5. The booking card, lightly

- The stub carries the seats line (see §3) and the date leaf keeps its craft colour.
- Times read "Fri 23 Oct · 7:54 pm · 2½ h" (today: "Friday, October 23 · 12:54 AM · 2 hrs 30 min").
  The odd hour is the test data, not a bug.
- Times stay in the **viewer's** timezone, as today. The studio has no timezone field in the
  database (adding one is a migration, so it belongs to Phase E), and a guest booking a local class
  from a local phone sees the right hour. The one place this bites is the share card, which is drawn
  on a server in UTC — so the card carries no date (see §7).
- Everything else — view transition, clay fields, shimmer skeletons, success burst — stays.

### 6. The footer, bigger

A sign-off that feels like the end of a visit: "see you at the studio" as a handwritten SVG stroke
that draws itself when scrolled into view (static under reduced motion); the studio's name as a
Fraunces wordmark; on desktop three short columns — the crafts taught (each a link to the card), find
us (Instagram, message us), and a credit line, "craft photography via Unsplash" (honest, and the
licence asks for nothing more). On phones the columns stack. A last clay **Save a seat**.

### 7. The share card and the page's name

- `generateMetadata` on `/book/[slug]`: title "{Studio} · book a class", description built from the
  story when there is one, else from the crafts ("Pottery classes — pick one and we'll keep you a
  seat"). Open Graph and Twitter card fields. `robots: noindex` stays (a deliberate earlier decision).
- `opengraph-image.tsx` beside it, rendered with `next/og`'s `ImageResponse`: buttercream paper, the
  name in Fraunces, the stickers of the crafts taught (literal colours — the image renderer has no
  CSS variables), and "8 seats left in the next class" — a count, never a date, because the server's
  clock is not the guest's. Cached five minutes; falls back to a name-only card when the API is
  unreachable; never blocks the page.
- The image renderer (Satori) reads TTF, OTF or WOFF, not the WOFF2 files the site ships. A static
  Fraunces TTF (OFL, same licence as the WOFF2 already in `CREDITS.md`) is a download I will ask for;
  without it the card uses the renderer's built-in sans, which is acceptable but not the brand.
- **Where the server fetches from.** In the browser the API base is derived from the page's host in
  dev and `NEXT_PUBLIC_API_URL` in production; on the server there is nothing to derive from. A
  server-only `API_URL` is read first, then `NEXT_PUBLIC_API_URL`, then `http://127.0.0.1:8001`
  for local dev. Production needs no new variable: `NEXT_PUBLIC_API_URL` is already set there.
- **Absolute image URLs.** Link previews need `metadataBase`: `NEXT_PUBLIC_SITE_URL` when set, else
  Vercel's automatic `VERCEL_PROJECT_PRODUCTION_URL`, else `http://localhost:3000`. Again nothing to
  configure for the Vercel project.
- No JSON-LD events: the page is `noindex`, so structured data would be theatre.

### 8. Fixes folded in

- `StorySection` clips its pattern (`overflow-hidden` on the section). A spec loads the page with a
  story at 375px and asserts no sideways scroll, so the gate covers the branch that failed.
- Login: the headline keeps ✨ with its last word (`white-space: nowrap` on the pair); the
  illustrative card gains a handwritten "for example" so the number is an example by name. (Phase B
  owns the rest of the door.)
- `e2e/hero-perf.spec.ts` measures a hero that no longer exists; the scroll guard replaced it. Its
  deletion, and removing `three`, `@react-three/fiber` and the dead `Hero3D`/`CeramicScene`/
  `CeramicShowcase` files, are separate asks because one is a deletion and one a dependency change.

## Architecture

- **No new dependencies.** Word roll, pill, docking, specular sweep, receipt, footer stroke: CSS plus
  small React. GSAP stays for the making-of morph and the fan toss.
- **New files, each with one owner:** `components/public/nav/FloatingPill.tsx` (+ `styles/units/nav.css`),
  `components/public/hero/VerbRoll.tsx`, `lib/public/craftVerbs.ts`, `lib/public/photoBudget.ts`,
  `components/public/HowItWorksReceipt.tsx` (replacing `HowItWorks.tsx`), `styles/units/footer.css`,
  `app/book/[slug]/opengraph-image.tsx`, `lib/public/metadata.ts`.
- **Composition root** stays `StorefrontPage.tsx`; integration edits it once, after the units merge.
- **Progressive enhancement, unchanged:** content and layout with no JS and no motion; heavy code
  after mount behind `useMayAnimate`; animate transform, opacity, clip-path and registered properties
  only; a button for every gesture; ≤ +8 KB gzipped on the initial route.
- **Server fetch for metadata** uses the server base described in §7, with `revalidate: 300`,
  a 1.5s timeout and a generic fallback, so a slow API cannot slow the page.
- **Motion budget.** The scroll guard must end Phase A at 5/5 or at its score before Phase A, whichever
  is higher. New texture is rasterised once (a filter on a static layer that the silhouette clips),
  never recomputed per frame. If the gate still fails at integration, the first thing cut is the
  hero's `ParticleField`, the lowest-value layer; the washes, grain and stickers are the brand and go
  last.

## Phases

| Phase | Scope                                                                                                                        | Size   | Gate                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| **A** | Storefront v3 — everything above. Units A1–A7 on disjoint files after a small scaffold.                                      | Large  | This document + the plan, approved. |
| B     | The doors: login v2, `/enter`, the confirmation screen's saveable ticket image, the claim flow's empty states.               | Medium | Review of A.                        |
| C     | Guest portal (the previous design's Phase 2): route transitions, tilt, staggered lists, shaped skeletons.                    | Medium | Review of B.                        |
| D     | Host portal (previous Phase 3): bento Today, FLIP calendar, density toggle, sliding nav indicator; ADR 0003 specs unchanged. | Large  | Review of C.                        |
| E     | Memories pipeline (previous Phase 4): migrations, Settings → Memories, approval queue, feedback share tick.                  | Medium | **Explicit go for the migrations.** |

### Phase A units

| Unit                                  | Owns                                                                                                                                                                                                                                                                         | Done when                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0 scaffold** (orchestrator, first) | `tokens.css` (`--section-gap`), `StorefrontPage.tsx` spacing, `StorySection.tsx` clip + spec, `atmosphere.css` (the chapter behind also fades to 0.5 as the next arrives — today it only shrinks to 0.94, which is why the stack is barely visible), login's two small fixes | Existing suites green; the story-overflow spec fails before the clip and passes after.                                                                                           |
| **A1 Pill + docking**                 | `nav/FloatingPill.tsx`, `nav.css`, `atmosphere/StickyCta.tsx` (becomes a re-export), `atmosphere.spec.ts`                                                                                                                                                                    | Appears/hides on both widths; 44px targets; glass contrast spec extended; docking is transform/opacity only; reduced motion = fade.                                              |
| **A2 Hero v3**                        | `BookingHero.tsx`, `hero.css`, `hero/VerbRoll.tsx`, `lib/public/craftVerbs.ts`, `hero.spec.ts`                                                                                                                                                                               | Verb set follows the class list; one accessible sentence; static under reduced motion; no layout shift as words change (fixed-width window measured from the longest verb).      |
| **A3 Budget + honesty**               | `lib/public/photoBudget.ts`, `PhotoFan.tsx`, `CraftChapters.tsx`, `lib/public/memories.ts`, `PhotoMarquee.tsx`, `HowItWorksReceipt.tsx`, `BookingPostcard.tsx` (deleted), `memories.spec.ts`                                                                                 | No photo more than twice (a unit test over the allocator and a DOM test over the page); marquee absent with one craft; header absent with one craft; receipt replaces the cards. |
| **A4 Making-of v2**                   | `making/*`, `making.css`, `making.spec.ts`                                                                                                                                                                                                                                   | Hands + textured clay in all four frames; pin ≤ 2 viewports; perf guard still 5/5 or at its prior score; reduced motion shows four finished frames.                              |
| **A5 Card polish**                    | `booking/TicketStub.tsx`, `booking/ClassPicker.tsx`, `lib/public/format.ts`, `booking.css`, `booking.spec.ts`                                                                                                                                                                | Seats line in the stub; new time format with tests for am/pm, midnight, 90 min, 2½ h; CLS spec unchanged.                                                                        |
| **A6 Footer v2**                      | `StudioFooter.tsx`, `footer.css`                                                                                                                                                                                                                                             | Draw-on stroke; columns from the class list; credit line; a 44px CTA; axe clean.                                                                                                 |
| **A7 Share card**                     | `app/book/[slug]/page.tsx` (metadata only), `opengraph-image.tsx`, `lib/public/metadata.ts`                                                                                                                                                                                  | Image route returns a 1200×630 PNG under 300 KB in under 1s warm; metadata names the studio; a failed API gives the fallback card; page TTFB unchanged.                          |

Batches, for a 15 GB machine: A2, A3, A4 first (the visual core); then A1, A5, A6, A7. Each builder
runs typecheck, unit and its own browser spec under the shared lock; the orchestrator runs the full
gate after each batch, then an independent review, a fix round, and a look in a real browser at
375px and 1440px before Phase A is called done.

## Verification, Phase A

- Unit, typecheck, lint, prettier green; `next build` succeeds; initial-route JS delta measured.
- Browser specs at 375px and 1440px for every touched section: flow, axe with and without reduced
  motion, 44px targets, no sideways scroll (with and without a story), press states, CLS.
- New specs: pill visibility on both widths; verb roll static under reduced motion and one accessible
  sentence; photo budget over the rendered page; marquee and header absence with one craft; story
  overflow; Open Graph route status, size and dimensions.
- The perf-scroll guard before and after, numbers recorded in the plan.
- Looked at in a real browser on both widths before each unit is called done.

## Risks

| Risk                                                  | Handling                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Docking fights Lenis or looks wrong at some widths    | Native scroll timeline only, `md` and up; fade everywhere else; feature-detected and specced.             |
| The verb roll reads as a gimmick                      | 2.6s cadence, pauses on hover and hidden tab, one axis of motion, static under reduced motion.            |
| `next/og` and a local font in the image route         | Spike it first inside A7 (30 minutes); the fallback is a card without Fraunces.                           |
| Server-side metadata fetch slows TTFB                 | 1.5s timeout, `revalidate: 300`, generic fallback. Measured.                                              |
| Photo budget leaves the wall thin on a one-craft page | Three tiles is the honest one-craft wall; the chapter and fan carry the rest. Phase E brings real photos. |
| Builders collide on `StorefrontPage.tsx`              | Nobody but the orchestrator edits it; units export, integration imports.                                  |

## Decisions I am asking you to make

1. **"Landing page" = the studio storefront** at `/book/<slug>`. If you also want a marketing site for
   the product itself at `/` (the README's `LandingPage/` workspace never existed), that is a separate
   design.
2. **Hero:** keep the studio's name as the headline with the kinetic promise under it (my
   recommendation, above), or make the promise the headline and the name the wordmark only.
3. **Drop the postcard section** and **drop the photo marquee for one-craft studios** — both are
   repetition, but both were built this week.
4. **Deletions and the dependency change:** `e2e/hero-perf.spec.ts`, the dead 3D files, `three` and
   `@react-three/fiber`. Yes or no, separately from the rest.
5. **Execution:** turbo FULL, two batches of builders as listed, after this plan is approved.
6. **One font download:** a static Fraunces TTF for the share card (see §7). Yes, or use the
   renderer's built-in sans.

## My calls (mark these if you disagree)

- Verbs, not nouns, in the rolling line — activity, not a promise of what you take home.
- The pill replaces the phone sticky bar rather than joining it.
- "How it works" becomes a receipt; the same three sentences, half the height.
- The marquee's new label is "the crafts, up close".
- The footer credits Unsplash by name even though the licence does not require it.
- `noindex` stays on the booking page; no structured data.
- Login's illustrative card is labelled "for example" now and redesigned in Phase B.

## Left to the builder

Exact easing and durations within the motion tokens; the hand drawings and the clay texture
parameters; the receipt's torn edge; copy for the verb sets beyond the nine listed; the share card's
composition; tile sizes when the wall has five to eight photos.
