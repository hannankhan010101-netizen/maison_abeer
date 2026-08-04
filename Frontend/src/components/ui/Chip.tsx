import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Chips.
 *
 * Craft tones are load-bearing: pink is bento cake, terracotta is pottery,
 * sage is ceramic painting, and those colours identify a class type across the
 * calendar, roster and name tags (PRD §2.2).
 *
 * The `allergy` tone is not decorative. It carries health-adjacent information
 * that must survive being read aloud, so it renders visible text rather than
 * relying on the red outline alone — colour is never the sole carrier.
 */

export type ChipTone = 'pink' | 'terra' | 'sage' | 'butter' | 'allergy' | 'neutral';

export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
  /** Prefix read by assistive tech, e.g. "Allergy:". */
  srPrefix?: string;
  className?: string;
}

const TONES: Record<ChipTone, string> = {
  pink: 'bg-blush text-rose-ink',
  terra: 'bg-terra-soft text-terra-deep',
  sage: 'bg-sage-soft text-sage-ink',
  butter: 'bg-butter-soft text-butter-ink',
  allergy: 'bg-danger-soft text-danger border-danger-line',
  neutral: 'bg-paper text-latte border-line',
};

export function Chip({ tone = 'neutral', children, srPrefix, className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)]',
        'border-[1.5px] border-transparent px-[11px] py-1',
        'text-xs font-extrabold',
        TONES[tone],
        className,
      )}
    >
      {srPrefix ? <span className="sr-only">{srPrefix} </span> : null}
      {children}
    </span>
  );
}
