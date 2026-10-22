'use client';

import { BookingHero } from '@/components/public/BookingHero';
import { CustomCursor } from '@/components/public/CustomCursor';
import { LazySection } from '@/components/public/LazySection';
import { FloatingPill } from '@/components/public/nav/FloatingPill';
import { SmoothScroll } from '@/components/public/SmoothScroll';
import { StorefrontBackdrop } from '@/components/public/StorefrontBackdrop';
import { StudioFooter } from '@/components/public/StudioFooter';
import { StudioRibbon } from '@/components/public/StudioRibbon';
import { StorySection } from '@/components/public/booking/StorySection';
import { TicketStub } from '@/components/public/booking/TicketStub';
import { cn } from '@/lib/cn';
import { seatsLine } from '@/lib/public/bookingCopy';
import { useMountedNow } from '@/lib/public/useMountedNow';
import { type PublicClass, type PublicMemory, type PublicWord } from '@/lib/public/api';
import { craftsIn } from '@/lib/public/studioPhotos';

/**
 * Everything below the first screen loads as an island: its code is fetched
 * when it is within a screen or so of the viewport, not with the page. Each
 * placeholder holds the section's measured height (phone, then wide) so
 * nothing jumps. The heights were measured on 2026-10-22 with one pottery
 * class and no memories: how it works 423 / 368, chapters 687 / 650, memory
 * wall 508 / 403, the pinned making-of 716 / 1800 (375 / 1440 px).
 */
const loadHowItWorks = () =>
  import('@/components/public/HowItWorks').then((module) => ({ default: module.HowItWorks }));
const loadChapters = () =>
  import('@/components/public/CraftChapters').then((module) => ({
    default: module.CraftChapters,
  }));
const loadMemoryWall = () =>
  import('@/components/public/memories/MemoryWall').then((module) => ({
    default: module.MemoryWall,
  }));
const loadMakingOf = () =>
  import('@/components/public/making/MakingOf').then((module) => ({ default: module.MakingOf }));
const loadMarquee = () =>
  import('@/components/public/PhotoMarquee').then((module) => ({
    default: module.PhotoMarquee,
  }));

const NO_PROPS = {};

export interface StorefrontPageProps {
  children: React.ReactNode;
  studioName?: string;
  handle?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  heroPhotoUrl?: string | null;
  story?: string | null;
  step?: 1 | 2 | 3;
  showBrandSections?: boolean;
  classes?: PublicClass[];
  memories?: PublicMemory[];
  words?: PublicWord[];
}

/**
 * The storefront's composition root: it lays the page's sections out in order
 * and puts the booking card in the middle of them.
 *
 * Each section is one line of JSX below, so a unit that adds a section adds a
 * line here and nothing else — which is what lets several be built at once
 * without editing the same file. (This was `Shell`, inside `BookingFlow`.)
 */
export function StorefrontPage({
  children,
  studioName,
  handle,
  primaryColor,
  accentColor,
  heroPhotoUrl,
  story,
  step,
  showBrandSections,
  classes,
  memories,
  words,
}: StorefrontPageProps) {
  const brandSections = Boolean(showBrandSections && classes && classes.length > 0);
  // The stub's seats line needs the browser clock ("this Friday" is relative), so it
  // stays blank until mount — the same rule as the hero's chip.
  const now = useMountedNow();
  // "The making of" is a story about throwing a pot, so it follows the same rule as every
  // other section that draws on the classes: never about a craft the studio does not teach.
  const teachesPottery = craftsIn((classes ?? []).map((item) => item.color_token)).includes(
    'pottery',
  );
  const crafts = classes ? [...new Set(classes.map((item) => item.name))] : [];
  const teachesSeveral = craftsIn((classes ?? []).map((item) => item.color_token)).length > 1;

  return (
    // `storefront` pins this page to the light palette whatever the visitor's
    // phone prefers (tokens.css). Mocha is the host's late-night setting; this
    // is the brand's shop window, reached from an ad that is cream and pink.
    // `isolate`: the backdrop sits at z-index -1, and without a stacking
    // context here it would be painted underneath main's own background.
    <main id="main" className="storefront bg-buttercream isolate min-h-screen">
      <StorefrontBackdrop />
      <SmoothScroll />
      <CustomCursor />

      {studioName ? (
        <BookingHero
          studioName={studioName}
          handle={handle}
          primaryColor={primaryColor}
          accentColor={accentColor}
          heroPhotoUrl={heroPhotoUrl}
          classes={classes}
        />
      ) : null}

      {/* The hero dissolves into this same background colour at its own
          bottom edge (see BookingHero's scrim), so what follows just starts
          here on solid ground. The ribbon, the steps and the brand sections
          are the arrival experience — once a guest has committed to a class
          or finished booking, the page's job narrows to "get this done," so
          they step aside rather than compete with the form for attention. */}
      {brandSections ? (
        <>
          <StudioRibbon crafts={crafts} />
          <div className="space-y-[var(--section-gap)] pt-[var(--section-gap)] pb-4">
            <LazySection
              label="How it works"
              load={loadHowItWorks}
              props={NO_PROPS}
              minHeight="420px"
              minHeightLg="370px"
            />
            {story ? <StorySection story={story} /> : null}
            <LazySection
              label="Craft chapters"
              load={loadChapters}
              props={{ classes: classes! }}
              minHeight="690px"
              minHeightLg="650px"
            />
            <LazySection
              label="Memory wall"
              load={loadMemoryWall}
              props={{ classes: classes!, memories, words }}
              minHeight="500px"
              minHeightLg="400px"
            />
            {teachesPottery ? (
              <LazySection
                label="Making of"
                load={loadMakingOf}
                props={NO_PROPS}
                minHeight="720px"
                minHeightLg="1800px"
              />
            ) : null}
            {/* The marquee is a strip of crafts: with one craft it renders nothing, so
                it gets no placeholder either (an empty reserved block would be a hole). */}
            {teachesSeveral ? (
              <LazySection
                label="Photo marquee"
                load={loadMarquee}
                props={{ classes: classes! }}
                minHeight="240px"
              />
            ) : null}
          </div>
        </>
      ) : null}

      {/* The key is what stops the page jumping. Until the classes arrive this is
          all there is: a placeholder as tall as the screen, centred. When they do,
          the hero and every section render *above* the booking card, and if the
          card were the same element it would be shoved thousands of pixels down —
          a layout shift of 0.5 on a phone. A different key makes React replace the
          placeholder with the card rather than move it, and a replaced element
          does not count as having shifted. (The step changes inside the card do
          not touch this key, so view transitions are unaffected.) */}
      <div
        key={studioName ? 'page' : 'loading'}
        className={cn(!studioName && 'flex min-h-[100svh] items-center')}
      >
        <div
          className={cn(
            'mx-auto w-full max-w-[600px] px-4 sm:px-6',
            !studioName && 'py-8 sm:py-12',
            studioName && !brandSections && 'pt-6 pb-14 sm:pt-8',
            studioName && brandSections && 'pt-8 pb-14 sm:pt-12',
          )}
        >
          {/* The widget is a ticket: a stub across the top with the step
            dots, a perforation, and the form beneath. */}
          <div
            id="booking-widget"
            className={cn(
              'border-line bg-paper relative scroll-mt-6 rounded-[var(--radius-xl)] border-[1.5px]',
              studioName && 'shadow-[var(--shadow-lift)]',
            )}
          >
            {step ? (
              <TicketStub
                current={step}
                seatsLine={now && classes ? seatsLine(classes, now) : null}
              />
            ) : null}
            <div className="p-5 sm:p-7">
              {/* Re-keyed per step: picking a class, filling the form, and
                landing on the confirmation are three different screens
                wearing one card. Without this the swap between them is
                instant and flat; the key forces React to remount the whole
                subtree so the same rise-in used everywhere else on this page
                plays here too, making the step change read as a deliberate
                transition rather than a layout jump. */}
              <div key={step} className="animate-rise-in">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>

      {studioName ? (
        <StudioFooter studioName={studioName} handle={handle} classes={classes} />
      ) : null}
      <FloatingPill studioName={studioName} classes={classes} />
    </main>
  );
}
