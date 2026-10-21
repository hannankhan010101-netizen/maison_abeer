'use client';

import { useEffect, useRef, useState } from 'react';
import { StorefrontPage } from '@/components/public/StorefrontPage';
import { ClassPicker } from '@/components/public/booking/ClassPicker';
import { Confirmation } from '@/components/public/booking/Confirmation';
import { DetailsStep } from '@/components/public/booking/DetailsStep';
import { LoadingClasses } from '@/components/public/booking/LoadingClasses';
import {
  BookingError,
  type BookingResult,
  fetchClasses,
  type PublicClass,
  type PublicClassList,
} from '@/lib/public/api';
import { withViewTransition } from '@/lib/motion';

/**
 * The guest-facing booking flow.
 *
 * Someone reaches this from an ad, on a phone, with no account and no
 * patience. Every decision below follows from that:
 *
 * * **Three screens, one job each** — pick, fill, done. A single long page
 *   asks a stranger to commit before they know what they are committing to.
 * * **Four fields, one required.** Name plus one way to be reached. Everything
 *   else is optional and says so, because each extra required field costs
 *   completions.
 * * **A full class is not a dead end.** It offers the waitlist in the same tap.
 * * **Focus moves with the step** and each step announces itself, so this
 *   works on a screen reader rather than merely passing a colour check.
 * * **No layout shift on submit** — the button keeps its size and swaps its
 *   label, so a slow connection does not move the tap target.
 * * **The hero is décor, never a gate.** It draws before the booking widget
 *   is even requested, and every animated pixel in it is optional weight —
 *   see `BookingHero` for exactly how that's enforced.
 */

export interface BookingFlowProps {
  slug: string;
  /** The schedule the server already fetched, or null when it could not. */
  initialData?: PublicClassList | null;
}

export function BookingFlow({ slug, initialData = null }: BookingFlowProps) {
  const [data, setData] = useState<PublicClassList | null>(initialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PublicClass | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  // The class we came back from, so its leaf can carry the shared-element name home.
  const [returnedFromId, setReturnedFromId] = useState<string | null>(null);
  const goingBack = useRef(false);

  function goBack(from: PublicClass) {
    // A second tap during the transition would abort it halfway.
    if (goingBack.current) return;
    goingBack.current = true;

    void withViewTransition(() => {
      setReturnedFromId(from.id);
      setChosen(null);
    }).finally(() => {
      goingBack.current = false;
    });
  }

  const hasInitialData = initialData !== null;

  useEffect(() => {
    const controller = new AbortController();

    // Always asked for, even with the server's schedule in hand: that copy may
    // be up to 15 s old, and seat counts are the one thing that must be true.
    // A fresh answer replaces it in place; a failed one leaves it alone — the
    // guest already has a working page, and an alert would take it away.
    fetchClasses(slug, controller.signal)
      .then(setData)
      .catch((error: unknown) => {
        if (controller.signal.aborted || hasInitialData) return;
        setLoadError(
          error instanceof BookingError
            ? error.message
            : 'We could not load the classes. Please refresh.',
        );
      });

    return () => controller.abort();
  }, [slug, hasInitialData]);

  if (loadError) {
    return (
      <StorefrontPage>
        <p role="alert" className="text-danger text-center font-bold">
          {loadError}
        </p>
      </StorefrontPage>
    );
  }

  if (!data) return <StorefrontPage>{<LoadingClasses />}</StorefrontPage>;

  const step = result ? 3 : chosen ? 2 : 1;

  return (
    <StorefrontPage
      studioName={data.studio.name}
      handle={data.studio.instagram_handle}
      primaryColor={data.studio.primary_color}
      accentColor={data.studio.accent_color}
      heroPhotoUrl={data.studio.hero_photo_url}
      story={data.studio.story}
      memories={data.memories}
      words={data.words}
      step={step}
      // The brand strip and postcard are the arrival experience — once a
      // guest has committed to a class or finished booking, the page's job
      // narrows to "get this done," so they step aside rather than compete
      // with the form for attention.
      showBrandSections={step === 1}
      classes={data.classes}
    >
      {result ? (
        <Confirmation
          result={result}
          token={chosen?.color_token ?? 'pink'}
          studioName={data.studio.name}
        />
      ) : chosen ? (
        <DetailsStep slug={slug} item={chosen} onBack={() => goBack(chosen)} onDone={setResult} />
      ) : (
        <ClassPicker classes={data.classes} onPick={setChosen} returnedFromId={returnedFromId} />
      )}
    </StorefrontPage>
  );
}
