import { cn } from '@/lib/cn';
import { dateLeaf } from '@/lib/public/format';

/**
 * A calendar leaf: the day large, the weekday and month beneath, a band of
 * the craft's colour across the top — the date as a small object rather
 * than a line of text, so a list of classes scans by date at a glance.
 *
 * Decorative in the accessibility tree (`aria-hidden`): the full date is
 * always written out in text beside it, so nothing is lost and nothing is
 * read twice.
 *
 * `ready` is the caller's "the browser clock is known" flag (see
 * `useMountedNow`). Until then the leaf keeps its size and shows nothing,
 * because the weekday and month are formatted in the visitor's locale and
 * the server cannot know it — rendering a guess would hydrate wrong.
 */

const ACCENT: Record<string, string> = {
  pink: 'bg-pink',
  rose: 'bg-rose',
  terra: 'bg-terra',
  sage: 'bg-sage',
  butter: 'bg-butter',
};

export function DateLeaf({
  iso,
  token,
  ready,
  className,
}: {
  iso: string;
  token: string;
  ready: boolean;
  className?: string;
}) {
  const parts = ready ? dateLeaf(iso) : null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'border-line bg-paper flex w-[60px] shrink-0 flex-col items-center overflow-hidden',
        'rounded-[var(--radius-sm)] border-[1.5px] text-center shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <span className={cn('block h-[7px] w-full', ACCENT[token] ?? 'bg-pink')} />
      <span className="font-display text-cocoa block pt-1.5 text-[22px] leading-none">
        {parts?.day ?? ' '}
      </span>
      <span className="text-latte block pb-1.5 text-[11px] font-extrabold tracking-[0.06em] uppercase">
        {parts ? `${parts.weekday} ${parts.month}` : ' '}
      </span>
    </span>
  );
}
