import { cn } from '@/lib/cn';

/**
 * The piped-frosting progress bar — the product's signature element.
 *
 * Renders as a real progressbar for assistive technology: the prototype's
 * version was a decorative div, which left screen-reader users with no way to
 * know how much prep was done.
 */

export interface IcingProps {
  /** Completed steps. */
  value: number;
  /** Total steps. Zero renders an empty bar rather than dividing by zero. */
  max: number;
  /** Announced to assistive tech, e.g. "Prep for Saturday". */
  label: string;
  /** Sage instead of rose — used for post-class reset lists. */
  tone?: 'rose' | 'sage';
  className?: string;
}

export function Icing({ value, max, label, tone = 'rose', className }: IcingProps) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  const percent = safeMax === 0 ? 0 : Math.round((safeValue / safeMax) * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuetext={`${safeValue} of ${safeMax} done`}
      aria-label={label}
      className={cn('bg-blush h-3.5 overflow-hidden rounded-[var(--radius-pill)]', className)}
    >
      <div
        data-testid="icing-fill"
        className={cn(
          'h-full rounded-[var(--radius-pill)] transition-[width] duration-500',
          // The piped-frosting highlight: a repeating soft dot along the fill.
          '[background-image:radial-gradient(circle_at_7px_50%,rgb(255_255_255/45%)_2.5px,transparent_3px)]',
          '[background-size:14px_14px]',
          tone === 'rose' ? 'bg-rose' : 'bg-sage-ink',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
