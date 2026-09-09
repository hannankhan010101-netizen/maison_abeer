'use client';

import { WorkshopCard } from '@/components/portal/WorkshopCard';
import { Button } from '@/components/ui/Button';
import { Card, HandNote } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/errors';
import { usePortalProfile, usePortalWorkshops } from '@/lib/api/hooks';

/**
 * The guest's own list of workshops.
 *
 * Split into what is coming and what has been: a guest opens this to check a
 * date, not to browse history, so anything already finished sinks below the
 * fold rather than competing for attention.
 */

export function MyWorkshops() {
  const profile = usePortalProfile();
  const workshops = usePortalWorkshops();

  if (workshops.isError) {
    return (
      <Card>
        <div role="alert">
          <p className="font-bold">
            {workshops.error instanceof ApiError
              ? workshops.error.displayMessage
              : "We couldn't load your workshops just now."}
          </p>
          <Button variant="ghost" className="mt-3" onClick={() => void workshops.refetch()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  const all = workshops.data ?? [];

  // Waitlisted classes sit with the upcoming ones — they are still ahead of
  // the guest, and their own chip says they are a queue rather than a seat.
  //
  // Listing the two groups by name rather than by "everything else" was how a
  // waitlisted class disappeared entirely: it matched neither filter, so a
  // guest who had just been told "you're on the list" opened their portal to
  // "Nothing here yet". Anything unrecognised now surfaces instead of
  // vanishing.
  const past = all.filter((w) => w.status === 'completed' || w.status === 'cancelled');
  const upcoming = all.filter((w) => !past.includes(w));

  return (
    <section>
      <header className="mb-5">
        <h1 className="font-display text-[clamp(26px,6vw,34px)]">
          {profile.data ? `Hey ${profile.data.display_name.split(' ')[0]} ✨` : 'Your workshops ✨'}
        </h1>
        <p className="text-latte">
          <HandNote>Everything you&rsquo;re signed up for, in one place</HandNote>
        </p>
      </header>

      {workshops.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your workshops</span>
          <ul className="grid gap-3">
            {[0, 1].map((key) => (
              <li
                key={key}
                aria-hidden="true"
                className="border-line bg-blush/40 h-28 animate-pulse rounded-[var(--radius-lg)] border-[1.5px] motion-reduce:animate-none"
              />
            ))}
          </ul>
        </div>
      ) : null}

      {workshops.isSuccess && all.length === 0 ? <NothingYet /> : null}

      {upcoming.length > 0 ? (
        <ul aria-label="Upcoming workshops" className="grid gap-3">
          {upcoming.map((workshop) => (
            <li key={workshop.session_id}>
              <WorkshopCard workshop={workshop} />
            </li>
          ))}
        </ul>
      ) : null}

      {past.length > 0 ? (
        <>
          <h2 className="font-display text-latte mt-7 mb-3 text-lg">Already made</h2>
          <ul aria-label="Past workshops" className="grid gap-3">
            {past.map((workshop) => (
              <li key={workshop.session_id}>
                <WorkshopCard workshop={workshop} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function NothingYet() {
  return (
    <Card className="text-center">
      {/* Decorative: the copy below carries the whole message. */}
      <p className="text-6xl" aria-hidden="true">
        🌷
      </p>

      <p className="font-display mt-2 text-xl">Nothing here yet…</p>
      <p className="text-latte mx-auto mt-1 max-w-[34ch] text-sm">
        Your next era starts when you enrol ✨
      </p>

      <p className="text-latte mt-4 text-sm">
        <HandNote>Ask your studio for the booking link ♡</HandNote>
      </p>
    </Card>
  );
}
