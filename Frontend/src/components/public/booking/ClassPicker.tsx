'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type PublicClass } from '@/lib/public/api';
import { instagramUrl } from '@/lib/public/instagram';
import { useMountedNow } from '@/lib/public/useMountedNow';
import { useMotionTier, withViewTransition } from '@/lib/motion';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';
import { craftOf, craftsIn, type CraftKind } from '@/lib/public/studioPhotos';
import { onCraftFilterRequest } from '@/lib/public/pickCraft';
import '@/styles/units/booking.css';

import { CraftFilter } from './CraftFilter';
import { CLASS_LEAF, PopupCard } from './PopupCard';

export { CLASS_LEAF };

// ---------------------------------------------------------------------------
// Step 1 — pick a pop-up
// ---------------------------------------------------------------------------

/** No classes open: a friendly card, and the studio's Instagram if the handle is valid. */
function ComingSoon({ handle }: { handle?: string | null }) {
  const follow = instagramUrl(handle);

  return (
    <div
      data-popups-empty=""
      className="border-line bg-paper rounded-[var(--radius-md)] border-[1.5px] border-dashed p-6 text-center"
    >
      <p className="text-5xl" aria-hidden="true">
        🌷
      </p>
      <h2 className="font-display mt-2 text-xl">No classes open right now</h2>
      <p className="text-latte mt-1 text-sm">
        The next pop-up is coming — new dates go up often, so follow along and you&rsquo;ll catch
        it.
      </p>
      {follow ? (
        <a
          href={follow}
          target="_blank"
          rel="noopener noreferrer"
          className="clay bg-rose text-on-rose focus-visible:outline-cocoa mt-4 inline-flex min-h-[44px] items-center rounded-[var(--radius-pill)] px-6 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Follow on Instagram
        </a>
      ) : null}
    </div>
  );
}

export function ClassPicker({
  classes,
  onPick,
  returnedFromId = null,
  handle = null,
}: {
  classes: PublicClass[];
  onPick: (item: PublicClass) => void;
  /** The class whose details step we just came back from: its leaf is where the stub flies home to. */
  returnedFromId?: string | null;
  /** The studio's Instagram handle, for the follow link when nothing is open. */
  handle?: string | null;
}) {
  const now = useMountedNow();
  const tier = useMotionTier();
  // One id, not one flag per card, so two cards can never carry the name together.
  const [namedId, setNamedId] = useState<string | null>(returnedFromId);
  const [craft, setCraft] = useState<CraftKind | null>(null);

  // Asked for a craft from elsewhere on the page (the quiz's "Book this one"): only
  // one the studio teaches, so a stale request can never empty the list.
  const taught = new Set(classes.map((item) => craftOf(item.color_token)));
  const taughtRef = useRef(taught);
  taughtRef.current = taught;
  useEffect(
    () =>
      onCraftFilterRequest((kind) => {
        if (taughtRef.current.has(kind)) setCraft(kind);
      }),
    [],
  );
  const inFlight = useRef(false);
  const [listRef, listVisible] = useRevealOnScroll<HTMLUListElement>();

  function pick(item: PublicClass) {
    // A second tap while the first transition runs would start a second one and
    // abort the first halfway.
    if (inFlight.current) return;
    inFlight.current = true;

    // The name goes on before the transition starts: the browser photographs
    // the page as it is at that moment, and the leaf must already be in it.
    flushSync(() => setNamedId(item.id));

    void withViewTransition(() => onPick(item)).finally(() => {
      inFlight.current = false;
    });
  }

  if (classes.length === 0) return <ComingSoon handle={handle} />;

  const crafts = craftsIn(classes.map((item) => item.color_token));
  // A chosen craft only applies while the studio still teaches it: a refresh that removes
  // its classes must not leave the guest on an empty list with no filter to undo it.
  const activeCraft = craft && crafts.includes(craft) ? craft : null;
  const shown = activeCraft
    ? classes.filter((item) => craftOf(item.color_token) === activeCraft)
    : classes;

  return (
    <section aria-labelledby="pick-heading">
      <h2 id="pick-heading" className="font-display text-xl">
        Pick your class
      </h2>
      <p className="text-latte mt-0.5 mb-4 text-sm">
        Tap one to save your seat — it takes about a minute.
      </p>

      <CraftFilter crafts={crafts} value={activeCraft} onChange={setCraft} />

      <ul ref={listRef} className="grid gap-3" data-popups-motion={tier >= 1 ? '' : undefined}>
        {shown.map((item, index) => (
          <li
            key={item.id}
            className={listVisible ? 'animate-rise-in' : undefined}
            style={listVisible ? { animationDelay: `${index * 60}ms` } : { opacity: 0 }}
          >
            <PopupCard item={item} now={now} onPick={pick} returnedFromId={namedId} />
          </li>
        ))}
      </ul>
    </section>
  );
}
