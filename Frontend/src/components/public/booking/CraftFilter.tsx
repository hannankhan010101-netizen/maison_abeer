'use client';

import { cn } from '@/lib/cn';
import { type CraftKind } from '@/lib/public/studioPhotos';

import { craftLabel } from './PopupCard';

const CHIP =
  'inline-flex min-h-[44px] items-center rounded-[var(--radius-pill)] border-[1.5px] px-4 text-sm font-extrabold ' +
  'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2';

/**
 * Craft chips over the pop-up list. Only drawn when there is a choice to
 * make: a studio running one craft gets no filter at all. Toggle buttons
 * (`aria-pressed`) rather than tabs, so Tab and Enter or Space just work.
 * `null` means All.
 */
export function CraftFilter({
  crafts,
  value,
  onChange,
}: {
  crafts: readonly CraftKind[];
  value: CraftKind | null;
  onChange: (craft: CraftKind | null) => void;
}) {
  if (crafts.length < 2) return null;

  const options: { key: CraftKind | null; label: string }[] = [
    { key: null, label: 'All' },
    ...crafts.map((craft) => ({ key: craft, label: craftLabel(craft) })),
  ];

  return (
    <div role="group" aria-label="Filter by craft" className="mb-4 flex flex-wrap gap-2">
      {options.map(({ key, label }) => {
        const on = value === key;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={cn(
              CHIP,
              on ? 'bg-cocoa text-paper border-cocoa' : 'bg-paper text-cocoa border-line',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
