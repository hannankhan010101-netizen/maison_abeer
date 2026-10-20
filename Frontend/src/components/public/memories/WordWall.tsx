import type { JSX } from 'react';

import type { PublicWord } from '@/lib/public/api';

/**
 * The words guests chose to share, once the host has approved them.
 *
 * Renders nothing until there is at least one. An empty "be the first" panel
 * would invite a guest to do something they cannot do from the booking page —
 * the form for it arrives by message after a class. Text only: a word is never
 * a link, an image or markup, and is cut short rather than allowed to break the
 * wall.
 */

const MAX_CHARS = 24;
const TILTS = [-3, 2, -1.5, 3, -2.5, 1];

export function shorten(word: string): string {
  const clean = word.trim();
  return clean.length > MAX_CHARS ? `${clean.slice(0, MAX_CHARS - 1)}…` : clean;
}

export function WordWall({ words }: { words?: PublicWord[] }): JSX.Element | null {
  if (!words || words.length === 0) return null;

  return (
    <ul
      aria-label="Words from guests"
      className="memory-words mt-8 flex flex-wrap justify-center gap-3"
    >
      {words.map((item, index) => (
        <li
          key={item.id}
          className="font-hand text-cocoa bg-butter-soft max-w-full rounded-xl px-4 py-2 text-xl break-words shadow-sm"
          style={{ transform: `rotate(${TILTS[index % TILTS.length]}deg)` }}
        >
          {shorten(item.word)}
        </li>
      ))}
    </ul>
  );
}
