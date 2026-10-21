# Storefront v4 — the pop-up workshop world

- **Status:** Design drafted 2026-10-22 from the owner's answers. Nothing is built until this
  document and each phase's plan are approved.
- **Date:** 2026-10-22
- **Scope:** the whole product's look, feel and speed, with the public landing page first. The landing
  page is the link in the Instagram bio of `@maison._abeer`, so it is the brand's front door.
- **Builds on:** the storefront v3 shop window (Phases A and B, built locally), the PWA and offline
  design (`2026-10-22-pwa-offline-design.md`, approved, runs in parallel), and chat being hidden.
  Their rules still hold: no invented numbers, quotes or counts; stock photos never called the
  studio's own; allergies stay visible; only Fraunces' `SOFT` axis animates; no new runtime
  dependency; every effect degrades under reduced motion.

## Intent

Maison Abeer runs pop-up workshops (Bento cakes, pottery, painting and more) at cafés and
restaurants, almost always at a new place each time. About nine in ten guests are teenage and
young-adult girls who arrive from Instagram on a phone. One person, the owner, runs everything.

The brand's own words: the existing cream, blush and handwriting look is right, but it is "too
simple". It should become **more cute, more modern and more alive**, carry real knowledge about the
crafts, have every button work, and still run smooth. Premium, professional and whimsical, in one
look: a boutique that feels like a hand-made zine, not a template.

## What exists (measured 2026-10-22)

- The landing page is 4,565 px tall on a phone for one class and has **17 tappable things**, nearly
  all links. It is lovely to look at and mostly passive.
- **A wrong Instagram account.** The page and its "Message us" button point at `@maisonabeer`, not
  `@maison._abeer`. The handle comes from the studio's settings data.
- The place of a class is one line of text ("Studio A"), though each class is at a different café.
- Photos are Unsplash stock, credited as such. There is one craft story (pottery's making-of). Bento
  cakes and painting have no knowledge content.
- The schedule is fetched by the browser after the page loads, so the first thing a visitor waits on
  is the API (about 1 to 2 s locally; the live API also cold-starts for about 4 s after idle).
- Production build: the page itself paints in about 0.25 s. All waiting is the API.
- The host side is tidy but flat (emoji icons, empty space, almost no motion).

## Goals

1. **Cuter and more advanced, without clutter.** A richer world of stickers, characters and motion
   that still reads calm at rest.
2. **Venue first.** Every class shows its café or restaurant (name, area, map link, a photo, the
   café's Instagram) as the hero of its card.
3. **Teach the crafts.** A "Craft Corner" per craft (Bento cakes, pottery, painting) with what you
   make, the tools, how it goes, good-to-know tips, what to bring and an FAQ. Playful and tappable.
4. **Every button works, and stays working.** A written contract and an automated tap-everything
   test, so a dead button cannot ship.
5. **Flash fast.** Measured in the lab on a production build: Slow 4G (1.6 Mbps, 150 ms round trip),
   a 4x CPU slowdown and a Moto G-class viewport, for both a warm and a cold server cache. Targets:
   LCP at or under 1.8 s, CLS under 0.05, INP under 200 ms. Initial JavaScript for `/book/[slug]` is
   no larger than today's 139 kB **at the end of every phase**; new code beyond the first screen is
   lazy-loaded. No field monitoring service is added (no new service or dependency), so these are lab
   numbers recorded in each phase's plan.
6. **Smooth everywhere.** 60 fps scrolling on a mid-range phone; animation only on the compositor.
7. **Made for sharing.** Quiz results, tickets and class cards are made as Instagram Story images
   that carry `@maison._abeer`.
8. **One identity across the app.** Booking, ticket, guest portal, host screens and name tags speak
   the same visual language.

## Scope note: one brand first

The product is multi-studio underneath (`/book/[slug]` serves any studio), but this design is for
**Maison Abeer first**. Where it is cheap, content comes from the studio's data and not a constant:
the Instagram handle, the venue, the craft of each class (already derived from the class type's
colour). The Craft Corner content is keyed by craft kind, not by studio. The tap-everything test
checks links against the studio's data. Making the characters and corner content configurable per
studio is out of scope.

## Non-goals

- A new visual identity. Cream paper, blush pink, terracotta, sage, butter, the handwriting accent
  and the taped-photo feel stay. This design grows them.
- Payments, reviews or a social feed. Chat stays hidden.
- Dark mode on the public pages.
- Anything that needs a new third-party service or library.

## Anti-goals

- A page that is noisy at rest, or that janks on a three-year-old phone.
- Made-up proof: no invented testimonials, guest counts, "X people viewing", or studio policies
  (prices, ages, cancellation terms) the owner has not stated.
- A knowledge section that is wrong, or that quietly states studio promises. Craft facts are general
  and checked; anything studio-specific is a clearly marked owner answer.
- Motion that is the only carrier of meaning, or a gesture with no button that does the same job.
- A beautiful page whose buttons point at the wrong place (as the Instagram link does today).

## The design

### 1. The whimsy system (the brand layer)

- **Characters.** A small cast of cute sticker characters, one per craft: a clay blob, a bento
  cake, a paint palette. Simple SVG faces (two dots and a smile), a few expressions each, no
  external art. They live in the hero, peek from section edges, react to touch (squish, blink,
  wiggle) and celebrate on booking. (Owner decision 1.)
- **Craft worlds.** Each craft has its own tint (bento: blush and cherry; pottery: terracotta and
  butter; painting: sage and lilac). The page background and accents drift between them as you
  scroll, so each section feels like its own corner.
- **Motion language.** Squishy spring on every press; stickers that peel and stick; confetti and
  heart bursts on delight moments; scroll-linked reveals; floating parallax stickers; a touch
  sparkle trail; haptic ticks on phones. One easing family and one duration scale in tokens.
- **Adaptive tiers.** Tier 0 is static and complete. Tier 1 is CSS-only motion. Tier 2 adds the
  JavaScript effects. The tier is chosen from reduced-motion, Data Saver, device memory, CPU cores
  and a frame monitor that steps down to Tier 1 if the page drops under 45 fps for a second.
- **Tokens.** New tokens (craft tints, sticker shadows, spring curves, tier flags) join `tokens.css`;
  the contrast guards extend to the new pairs.

### 2. The landing page (link in bio), section by section

Ordered for a girl who just tapped the link:

1. **Hero.** The name, a rolling verb line, the **next pop-up** as a chip with its café, one big
   "Save a seat". The three characters float; tapping a sticker pops it with a tiny craft fact.
2. **Next pop-ups.** A swipeable, filterable list of upcoming classes. Each card leads with the café
   photo and name, the area, a date leaf, a craft chip, an honest seats-left line, the café's tag
   and a map link. Tapping opens a sheet with the full details and "Save a seat". With no upcoming
   class it shows a friendly "next one is coming" state and the follow link, never an empty hole.
3. **Craft Corner.** Three corners (Bento cakes, Pottery, Painting) chosen by tabs or by swiping.
   Each has: _What you'll make_ (finished examples), _The tools_ (tap a tool for a small card),
   _How it goes_ (a short scroll story, four to five steps, drawn in the sticker style),
   _Good to know_ (tips and fun facts), _Bring and wear_ (a tickable checklist) and _Questions_
   (an accordion). Content is typed data (section 6).
4. **Which workshop are you?** A short, playful quiz. The result is a craft, a vibe line and a
   **Story-size share image** with `@maison._abeer`, plus "Book this one".
5. **How it works.** The receipt, kept.
6. **The vibe wall.** Photos from real workshops when the owner has them; until then it stays
   small and honest about stock.
7. **Footer.** The correct Instagram, "tag us", a clay "Save a seat", and, if the owner agrees
   (decision 5), a "tell me when the next pop-up is announced" sign-up.

The floating pill stays. The page length target is two phone screens to reach a bookable class.

### 3. Booking and the ticket

- Class sheet, details step and confirmation keep the current flow, polished: character
  celebration, a confetti burst, haptics.
- **Bring a friend** is **not** in V2's core. A friend takes a seat and needs their own allergies,
  name tag and place on the host list, which means a schema change and a rule for one seat left. It
  becomes its own item, V2b, with a short design and its own explicit go for the migration.
- **Contact:** the form keeps accepting a phone or an email, as today. An Instagram handle or
  WhatsApp field can be added if the owner wants it (decision 2).
- **Add to calendar** (an `.ics` file) on the confirmation.
- The saveable ticket from Phase B gains a **Story-size** version (1080 by 1920) with the café, the
  date and `@maison._abeer`, still drawn in the guest's browser.

### 4. Venue first (needs a database change)

**Order.** Because the café is the hero of every card, V3 is best done right after V0 and before V1
(V0, V3, V1), if the owner gives the migration go. If she does not, V1 ships with text-only venues:
the location line and the class photo get a properly designed card, not a fallback line, and the
venue fields slot in later.

A `venue` record (name, area, map link, Instagram handle, photo, notes) and a `venue_id` on a
session. The host picks from places she has used, so a repeat café fills itself in; a new café is one
short form. The public API returns the venue; the page uses it everywhere. Until the change is
applied, everything falls back to the existing location text. **The migration needs the owner's
explicit go** (decision 4).

### 5. The rest of the app

- **Guest portal, "your passport":** a stamp for each class actually attended, a few cute badges
  (first class, tried a second craft), a countdown with the craft's character, and short care and
  prep cards per upcoming class. Computed only from real attendance.
- **Host app:** the earlier Phase D design (bento Today, calendar transitions, sliding nav
  marker, density toggle) in the new whimsy language, with SVG icons replacing emoji, the venue
  picker, a three-step "new pop-up" flow, and warm empty states.
- **Name tags:** art packs per craft (clay shapes, frosting and cherries, brushes and palettes)
  chosen automatically from the class's craft, plus the existing themes. Drawn, not generated.
  (Owner decision 6.)
- **Messages:** reminder and confirmation copy in the same voice.
- **The PWA and offline work** continues in parallel and also gives repeat opens instant saved data.

### 6. Craft knowledge as typed data

`lib/public/craftGuide.ts` holds, per craft, typed entries: `makes`, `tools` (name, what it does),
`steps`, `tips`, `funFacts`, `bring`, `faq`, `glossary`. The page renders from it, so adding a fact
is a data edit. Sketch of the general (not studio-specific) content:

- **Bento cakes:** small lunchbox-style cakes, buttercream piping, text and charms. Tools: piping
  bag and tips, offset spatula, scraper, turntable, gel colours. Steps: level, crumb coat, chill,
  final coat, colour, pipe, write, box. Tips: a cold cake gives smoother edges; gel colour beats
  liquid; room-temperature butter pipes best. FAQ includes allergens (eggs, dairy, gluten, nuts).
- **Pottery:** wheel throwing and hand-building. Tools: wheel, sponge, wire cutter, ribs, needle
  tool, trimming tool. Steps: wedge, centre, open, pull the walls, shape, cut off. After class:
  dry, trim, bisque fire, glaze, fire again. Facts: clay shrinks as it fires; glaze looks chalky and
  different until fired.
- **Painting:** ceramic or canvas, per class. Tools: round, flat and liner brushes, palette, water
  cup, sponge. Steps: light sketch, base coats, let layers dry, details last. Facts: add white to
  any colour for pastels; no talent needed.

Anything about the studio itself (prices, ages, cancellations, when pieces are ready, what food
safety claims apply) is an **owner answer**: the typed data marks each with an `owner` flag, the page
shows nothing for it until it is filled, and nothing is guessed.

### 7. Every button works

- A written inventory: every interactive element on every public page, its target and its
  expected outcome.
- `e2e/tap-everything.spec.ts`: walks each public page at 375 and 1440, taps or follows every
  interactive element and asserts a visible result (scroll, sheet opens, navigation, copy, share).
  Links to Instagram are checked against the studio's configured handle.
- Static guards: no `href="#"`, no empty `onClick`, every control has an accessible name and a
  44 px target.
- The wrong-handle bug is fixed first and pinned by a test.

### 8. Fast, and coded with care

- **Server-render the schedule, with a stale-while-revalidate cache of 15 seconds.** That is the
  API's own rule for seat counts (`max-age=15`, `stale-while-revalidate=60`), so the page never
  claims more freshness than the API does. The server fetch uses a 1.2 s timeout: on a cache hit
  the pop-ups are in the first HTML; on a miss with a cold API the page serves the last cached copy
  or, with none, renders the shell and fetches in the browser, as today. It never blocks the HTML on
  a cold API. This makes `/book/[slug]` a revalidating cached page, not just a header change. The
  metadata fetch moves to the same cache so the two cannot disagree.
- **Seats-left reconciles in place.** If the browser's fresh fetch disagrees with the cached copy,
  only the seats text swaps (the line's height is reserved, so there is no layout shift) and a
  class that has since filled flips its button to the waitlist. Nothing is promised that the API did
  not say.
- **No new data library on the page.** The client does not pull TanStack Query into `/book` (today
  it ships only with the signed-in area). The server passes initial data as props and the existing
  small fetch-on-mount revalidates it.
- **The middleware** currently runs a Supabase session check on `/book` for any visitor carrying a
  session cookie. Skipping that check on `/book` removes a round trip from returning guests. It is an
  **auth change, so it is asked for at V0's plan, not assumed here.**
- **Islands.** Everything below the first screen (Craft Corner, quiz, vibe wall, FAQ) loads lazily
  when it nears the viewport; the Craft Corner's three corners load separately.
- **Images.** Photos that we host are served optimised, with fixed dimensions and blur placeholders,
  and the first one is preloaded. Today's photos are plain `<img>` because their hosts were arbitrary.
  Venue and studio photos will be **uploaded to the existing Supabase Storage** (one known host, one
  image-host entry in the Next config) and not pasted as links. That is an infrastructure change,
  asked for at V3's plan. Until then the existing images stay as they are, and stock photos that ship
  with the app are optimised now.
- **Rendering.** `content-visibility: auto` on long sections; animate only `transform`, `opacity`,
  `clip-path` and registered properties; one shared animation scheduler; effects run only while
  visible and pause when the tab is hidden; `will-change` only during an effect.
- **Budgets enforced, not hoped for.** A build check fails if `/book/[slug]` First Load JS grows
  beyond its baseline; the perf-scroll guard extends to a 4x CPU slowdown on Slow 4G with Web
  Vitals captured; the tier monitor is unit-tested.
- **Instagram's in-app browser** is the primary target: a test matrix covers iOS and Android
  WebView behaviour (viewport units, no install prompt, link handling) as far as can be emulated,
  and the owner checks on a real phone from her own bio link.

## Interplay with the offline plan

The offline worker's page cache is an allowlist of host screens only. `/book`, `/portal`, `/login`
and `/enter` are outside it, so the public page's HTML (which will now contain seat counts) is never
cached by the worker. Offline, the booking page shows a short "you're offline" message and keeps
anything typed. Both designs touch the root layout; their plans edit it one after the other, never in
parallel.

## Phases

| Phase | Scope                                                                                          | Gate                          |
| ----- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| V0    | Foundations: handle fix, tokens, tier system, server-rendered schedule, tap-everything harness | This document                 |
| V1    | The landing page: hero, pop-up cards, Craft Corner, quiz, FAQ, footer                          | Review of V0                  |
| V2    | Booking polish, calendar file, Story ticket (V2b: bring a friend, own design and migration go) | Review of V1                  |
| V3    | Venue model: migration, API, host picker, public use                                           | **Explicit go for migration** |
| V4    | Guest passport                                                                                 | Review of V2                  |
| V5    | Host app redesign, name-tag art packs, message voice                                           | Review of V4                  |

The PWA and offline plan runs beside these and is not blocked by them.

## Verification

- Unit tests for every pure helper (tiers, craft data, quiz scoring, share-image layout, venue
  fallback); component tests for what renders; Playwright at 375 and 1440 for each touched page.
- The tap-everything spec, axe with and without reduced motion, 44 px targets, no sideways scroll.
- Performance: First Load JS, LCP, CLS and INP measured on a production build under CPU and network
  throttling; the perf-scroll guard; numbers recorded in each phase's plan.
- Looked at in a real browser at both widths, and on a real phone inside Instagram, before each
  phase is called done.

## Risks

| Risk                                                | Handling                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| More delight makes the page heavy                   | Islands, tiers, budgets enforced in CI, first screen unchanged in weight              |
| Cute turns into clutter                             | Calm at rest: motion on touch and scroll, not constant; a density review each phase   |
| Craft facts that are wrong or imply studio promises | General facts only, checked; studio items are owner-flagged and hidden until answered |
| The quiz or share image feels off-brand             | Built from the same characters and tokens; the owner reviews copy                     |
| Venue migration disturbs live data                  | Additive columns only, a fallback to the old text, explicit go first                  |
| Stock photos undercut the brand                     | Honest labels now; the vibe wall and venue photos take over as real photos arrive     |

## Decisions for the owner

1. **Characters:** yes to a small cast of cute craft characters? If yes, are their looks and names
   mine to propose, or do you have ideas?
2. **Contact on the booking form:** keep phone or email as today, or also add an Instagram handle or WhatsApp?
3. **Teen guests:** what should the page say about age and parents? I will not invent a policy.
4. **Venue records:** go ahead with the database change in phase V3 (additive, reversible), and do it before the landing page (V0, V3, V1)?
5. **"Tell me about the next pop-up" sign-up:** yes or no? It stores a contact with consent.
6. **Name tags:** drawn art packs per craft (my recommendation), or AI-made pictures later?
7. **Studio facts for the FAQ:** prices, how payment works, cancellations, when pottery is ready.
   Until you answer, the page says nothing about them.

## My calls (mark any you disagree with)

- No new dependency. Everything is CSS, small React and the motion kit already in the repo.
- Characters are drawn in SVG, with no external art or animation library.
- The page leads with the next pop-up and the café, not the studio's story.
- Quiz and share images are drawn in the guest's browser, like the ticket.
- Server rendering with a 60-second cache for the schedule, with the client query taking over.
- Add-to-calendar is in V2. Bring a friend moves to V2b with its own design and migration go.
- The Instagram handle is fixed in the studio's settings data and the page also refuses to render a
  handle that fails a basic format check.

## Left to the builder

Character designs and expressions; the exact tints and easing curves within the token rules; quiz
questions and result copy; sticker art; the Craft Corner's layout and the scroll-story drawings;
tile and sheet layouts; the frame-monitor thresholds; the share images' compositions.
