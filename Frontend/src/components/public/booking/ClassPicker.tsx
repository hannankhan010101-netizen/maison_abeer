'use client';

import { DateLeaf } from '@/components/public/DateLeaf';
import { cn } from '@/lib/cn';
import { type PublicClass } from '@/lib/public/api';
import { accentFor, formatDay, formatTime, seatCopy } from '@/lib/public/bookingCopy';
import { durationCopy } from '@/lib/public/format';
import { useMountedNow } from '@/lib/public/useMountedNow';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

// ---------------------------------------------------------------------------
// Step 1 — pick a class
// ---------------------------------------------------------------------------

export function ClassPicker({
  classes,
  onPick,
}: {
  classes: PublicClass[];
  onPick: (item: PublicClass) => void;
}) {
  const now = useMountedNow();
  const [listRef, listVisible] = useRevealOnScroll<HTMLUListElement>();

  if (classes.length === 0) {
    return (
      <div className="p-1 text-center">
        <p className="text-5xl" aria-hidden="true">
          🌷
        </p>
        <p className="font-display mt-2 text-xl">No classes open right now</p>
        <p className="text-latte mt-1 text-sm">
          New dates go up often — follow along and you&rsquo;ll catch the next one.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="pick-heading">
      <h2 id="pick-heading" className="font-display text-xl">
        Pick your class
      </h2>
      <p className="text-latte mt-0.5 mb-4 text-sm">
        Tap one to save your seat — it takes about a minute.
      </p>

      <ul ref={listRef} className="grid gap-3">
        {classes.map((item, index) => {
          const seats = seatCopy(item);
          const accent = accentFor(item.color_token);
          const duration = durationCopy(item.starts_at, item.ends_at);

          return (
            <li
              key={item.id}
              className={listVisible ? 'animate-rise-in' : undefined}
              style={listVisible ? { animationDelay: `${index * 60}ms` } : { opacity: 0 }}
            >
              <button
                type="button"
                onClick={() => onPick(item)}
                data-cursor-label="BOOK"
                className={cn(
                  'group border-line bg-paper relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-3.5',
                  'rounded-[var(--radius-md)] border-[1.5px] p-3.5 text-left sm:p-4',
                  'min-h-[44px] shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200',
                  // Lifted a little and ringed in the craft's own colour on
                  // hover (`hoverGlow`) — picked up, not recoloured.
                  'hover:-translate-y-1 hover:border-transparent',
                  // A phone has no hover, so the lift above never fires there
                  // and the card confirmed nothing when tapped. This is the
                  // whole of the feedback on the app's conversion surface.
                  'active:scale-[0.98] motion-reduce:active:scale-100',
                  accent.hoverGlow,
                  'motion-reduce:transform-none',
                  'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
                )}
              >
                {/* The date as a calendar leaf, banded in the class-type
                    colour — same colour language as the admin calendar, so
                    a returning guest's eye already knows what pink versus
                    terracotta means here. */}
                <DateLeaf iso={item.starts_at} token={item.color_token} ready={now !== null} />

                <span className="min-w-0">
                  <span className="font-display block text-lg leading-tight">{item.name}</span>

                  {/* suppressHydrationWarning: the date is formatted in the
                      visitor's locale, which the server cannot know. */}
                  <span className="text-cocoa mt-1 block text-sm" suppressHydrationWarning>
                    {now
                      ? [`${formatDay(item.starts_at)} · ${formatTime(item.starts_at)}`, duration]
                          .filter(Boolean)
                          .join(' · ')
                      : ' '}
                  </span>

                  {item.location ? (
                    <span className="text-latte block text-sm">{item.location}</span>
                  ) : null}

                  <span
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold',
                      item.is_full
                        ? 'bg-butter-soft text-butter-ink'
                        : seats.urgent
                          ? 'bg-blush text-rose-ink animate-pulse motion-reduce:animate-none'
                          : 'bg-sage-soft text-sage-ink',
                    )}
                  >
                    {seats.urgent && !item.is_full ? <span aria-hidden="true">🔥</span> : null}
                    {seats.text}
                  </span>
                </span>

                {/* Always visible: it was once revealed on hover only, so on
                    every phone the one mark telling a guest the card moves
                    them forward never appeared at all. Hover nudges it. */}
                <span
                  aria-hidden="true"
                  className="text-rose-ink text-xl opacity-100 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
                >
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
