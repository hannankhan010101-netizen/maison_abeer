'use client';

import { DateLeaf } from '@/components/public/DateLeaf';
import { cn } from '@/lib/cn';
import { type PublicClass } from '@/lib/public/api';
import { accentFor, seatCopy } from '@/lib/public/bookingCopy';
import { whenLine } from '@/lib/public/format';
import { mapsUrl } from '@/lib/public/maps';
import { coverFor, craftOf, type CraftKind } from '@/lib/public/studioPhotos';
import '@/styles/units/popups.css';

/** The one shared-element name; it must sit on a single element at any moment. */
export const CLASS_LEAF = 'class-leaf';

const CRAFT_LABEL: Record<CraftKind, string> = {
  cake: 'Cake',
  pottery: 'Pottery',
  painting: 'Painting',
};

/** The tokens.css pair for each craft: a tint and an ink that passes AA on it. */
const CRAFT_CHIP: Record<CraftKind, string> = {
  cake: 'bg-[var(--craft-bento)] text-[var(--craft-bento-ink)]',
  pottery: 'bg-[var(--craft-pottery)] text-[var(--craft-pottery-ink)]',
  painting: 'bg-[var(--craft-painting)] text-[var(--craft-painting-ink)]',
};

export function craftLabel(craft: CraftKind): string {
  return CRAFT_LABEL[craft];
}

/**
 * One pop-up, place first: where it is is the first thing a guest reads,
 * because a pop-up in a café across town is a different evening from one
 * round the corner. The whole card body is one button (the booking contract:
 * one button, named by the class); the Maps link is its sibling, never inside
 * it, so the two never fight over a tap.
 *
 * `returnedFromId` names the date leaf for the shared-element flight when it
 * is this card's class; the picker passes its single named id here so two
 * cards can never carry the name together.
 */
export function PopupCard({
  item,
  now,
  onPick,
  returnedFromId = null,
}: {
  item: PublicClass;
  now: Date | null;
  onPick: (item: PublicClass) => void;
  returnedFromId?: string | null;
}) {
  const seats = seatCopy(item);
  const accent = accentFor(item.color_token);
  const craft = craftOf(item.color_token);
  const location = item.location?.trim() || null;
  const maps = mapsUrl(location);
  const fallback = coverFor(craft);
  // Quotes, backslashes and newlines stripped: the URL sits inside url("…").
  const photo = (item.photo_url ?? fallback.small).replace(/["\\\n]/g, '');

  return (
    <div
      data-popup-card=""
      className={cn(
        'popup-card border-line bg-paper overflow-hidden rounded-[var(--radius-md)] border-[1.5px]',
        'shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200',
        'hover:-translate-y-1 hover:border-transparent motion-reduce:transform-none',
        accent.hoverGlow,
      )}
    >
      <button
        type="button"
        onClick={() => onPick(item)}
        data-cursor-label="BOOK"
        className={cn(
          'group relative block min-h-[44px] w-full text-left',
          'active:scale-[0.98] motion-reduce:active:scale-100',
          'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:-outline-offset-[3px]',
        )}
      >
        {/* The box is reserved before the photo arrives, so nothing shifts.
            Painted as a background, not an <img>: it is decoration inside the
            button (the class is named in text), and the page's chapters
            already show the class photo as the described picture. */}
        <span className="popup-photo-frame block aspect-[16/9] overflow-hidden sm:aspect-[21/9]">
          <span
            data-popup-photo=""
            aria-hidden="true"
            className="popup-photo block h-full w-full bg-cover bg-center"
            style={{ backgroundColor: fallback.tone, backgroundImage: `url("${photo}")` }}
          />
        </span>

        <span className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5 p-3.5 sm:p-4">
          <span
            className="flex"
            style={returnedFromId === item.id ? { viewTransitionName: CLASS_LEAF } : undefined}
          >
            <DateLeaf iso={item.starts_at} token={item.color_token} ready={now !== null} />
          </span>

          <span className="min-w-0">
            {location ? (
              <span
                data-location-line=""
                className="font-display flex items-start gap-1 text-lg leading-tight break-words"
              >
                <span data-pin="" aria-hidden="true" className="text-rose-ink">
                  📍
                </span>
                <span className="min-w-0">{location}</span>
              </span>
            ) : null}

            <span
              className={cn(
                'text-cocoa block font-extrabold',
                location ? 'mt-1 text-sm' : 'font-display text-lg leading-tight font-normal',
              )}
            >
              {item.name}
            </span>

            {/* suppressHydrationWarning: the date is formatted in the
                visitor's locale, which the server cannot know. */}
            <span className="text-latte mt-0.5 block text-sm" suppressHydrationWarning>
              {now ? whenLine(item) : ' '}
            </span>

            <span
              data-craft-chip=""
              className={cn(
                'mt-1.5 inline-flex rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-extrabold',
                CRAFT_CHIP[craft],
              )}
            >
              {CRAFT_LABEL[craft]}
            </span>

            {/* The line keeps its height whatever it says, so a seat count
                corrected after load changes text, not layout. */}
            <span data-seats-line="" className="mt-2 block min-h-7">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold',
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
          </span>

          <span
            aria-hidden="true"
            className="text-rose-ink text-xl transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
          >
            →
          </span>
        </span>
      </button>

      {maps ? (
        <div className="border-line flex justify-end border-t border-dashed px-3.5 sm:px-4">
          <a
            href={maps}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cocoa decoration-pink hover:decoration-rose focus-visible:outline-rose inline-flex min-h-[44px] min-w-[44px] items-center gap-1 text-sm font-extrabold underline decoration-2 underline-offset-4 focus-visible:outline-[3px]"
          >
            <span aria-hidden="true">🗺️</span>
            Maps<span className="sr-only">: {location}, opens in a new tab</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
