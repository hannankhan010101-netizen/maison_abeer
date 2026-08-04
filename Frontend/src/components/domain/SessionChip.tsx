import { cn } from '@/lib/cn';
import { formatRange, formatTime } from '@/lib/dates';
import type { Session } from '@/lib/api/types';

/**
 * A class as it appears in the calendar.
 *
 * The craft colour is load-bearing — it is how a host identifies a class type
 * at a glance (PRD §2.2) — so it is resolved from the API's `color_token`
 * rather than a hex value, letting a palette change reach existing data.
 */

const TONE_BY_TOKEN: Record<string, string> = {
  pink: 'bg-blush text-rose-ink',
  terra: 'bg-terra-soft text-terra-deep',
  sage: 'bg-sage-soft text-sage-ink',
  butter: 'bg-butter-soft text-butter-ink',
};

export function toneFor(colorToken: string): string {
  return TONE_BY_TOKEN[colorToken] ?? TONE_BY_TOKEN.pink!;
}

export interface SessionChipProps {
  session: Session;
  /** Agenda rows show the full time range; grid cells show the start only. */
  variant?: 'grid' | 'agenda';
  onSelect?: (session: Session) => void;
  className?: string;
}

export function SessionChip({ session, variant = 'grid', onSelect, className }: SessionChipProps) {
  const { capacity } = session;
  const name = session.title ?? session.class_type_name;

  const time =
    variant === 'agenda'
      ? formatRange(session.starts_at, session.ends_at)
      : formatTime(session.starts_at);

  // Spoken separately, because "8/10 🔒" is not something to read aloud.
  const spokenState = [
    `${capacity.booked} of ${capacity.seats} seats booked`,
    session.status === 'locked' ? 'closed to new bookings' : null,
    capacity.state === 'sold_out' ? 'sold out' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(session) : undefined}
      aria-label={`${name}, ${time}, ${spokenState}`}
      className={cn(
        'w-full rounded-[10px] px-2 py-1.5 text-left text-[11.5px] leading-tight font-extrabold',
        'transition-transform hover:-translate-y-px motion-reduce:transform-none',
        variant === 'agenda' && 'min-h-[44px] px-3 py-2.5 text-sm',
        toneFor(session.color_token),
        className,
      )}
    >
      <span className="block">{name}</span>
      <span aria-hidden="true" className="block font-bold opacity-75">
        {time} · {capacity.booked}/{capacity.seats}
        {session.status === 'locked' ? ' 🔒' : null}
      </span>
    </button>
  );
}
