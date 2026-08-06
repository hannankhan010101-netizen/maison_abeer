'use client';

import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { tallyWords } from '@/lib/wrapped/stats';

/**
 * What people say about your classes.
 *
 * The PRD's post-class feedback asks for one word (§2.6). Individually that is
 * a nice touch; in aggregate it is the most quotable thing the studio owns —
 * proof in the guests' own language rather than the host's.
 *
 * Sizing is by frequency and the order is deterministic, so the cloud does not
 * reshuffle between renders. A layout that jumps looks broken, not lively.
 */

const TONES = [
  'bg-blush text-rose-ink',
  'bg-sage-soft text-sage-ink',
  'bg-terra-soft text-terra-deep',
  'bg-butter-soft text-butter-ink',
] as const;

/** Type scale by rank, so the most-said word reads loudest. */
export function sizeForRank(rank: number, total: number): string {
  if (total === 0) return 'text-base';

  const share = rank / total;

  if (rank === 0) return 'text-[clamp(28px,7vw,40px)]';
  if (share < 0.25) return 'text-[clamp(20px,5vw,28px)]';
  if (share < 0.55) return 'text-[clamp(16px,4vw,20px)]';

  return 'text-[15px]';
}

export interface VibeCloudProps {
  words: string[];
  className?: string;
}

export function VibeCloud({ words, className }: VibeCloudProps) {
  const tallied = tallyWords(words);

  if (tallied.length === 0) {
    return (
      <Card className={className}>
        <Eyebrow>what people say</Eyebrow>
        <p className="text-latte py-4 text-center text-sm">
          nothing yet — after a class, guests get one tap and one word.
          <br />
          <HandNote>their words land here 💬</HandNote>
        </p>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <Eyebrow>what people say about your classes</Eyebrow>

      <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-2 py-1">
        {tallied.map((entry, rank) => (
          <li key={entry.word}>
            <span
              className={cn(
                'font-display inline-block rounded-[var(--radius-pill)] px-3 py-1',
                sizeForRank(rank, tallied.length),
                TONES[rank % TONES.length],
              )}
              // The count is the evidence, so it must be available to a
              // screen reader too, not only on hover.
              title={`said ${entry.count} time${entry.count === 1 ? '' : 's'}`}
            >
              {entry.word}
              <span className="sr-only">
                , said {entry.count} time{entry.count === 1 ? '' : 's'}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2">
        <HandNote>steal these for your captions ✍️</HandNote>
      </p>
    </Card>
  );
}
