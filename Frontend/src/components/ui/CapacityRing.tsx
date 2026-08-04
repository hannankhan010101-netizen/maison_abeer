import { cn } from '@/lib/cn';

/**
 * The capacity ring from the dashboard hero card (PRD §2.1).
 *
 * Geometry matches the prototype exactly: r=42 in a 104×104 viewBox, giving a
 * circumference of 2πr ≈ 264, which is the `strokeDasharray`.
 */

export const RING_RADIUS = 42;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export type CapacityState = 'open' | 'filling' | 'nearly_full' | 'sold_out';

export interface CapacityRingProps {
  booked: number;
  seats: number;
  /** Mirrors the backend's CapacityState so copy and colour stay in step. */
  state?: CapacityState;
  className?: string;
}

const STROKE_BY_STATE: Record<CapacityState, string> = {
  open: 'stroke-sage',
  filling: 'stroke-rose',
  nearly_full: 'stroke-rose',
  sold_out: 'stroke-terra',
};

export function deriveState(booked: number, seats: number): CapacityState {
  if (seats <= 0 || booked >= seats) return 'sold_out';

  const fraction = booked / seats;
  if (fraction >= 0.8) return 'nearly_full';
  if (fraction >= 0.4) return 'filling';
  return 'open';
}

export function CapacityRing({ booked, seats, state, className }: CapacityRingProps) {
  const safeSeats = Math.max(0, seats);
  const safeBooked = Math.max(0, booked);
  const fraction = safeSeats === 0 ? 1 : Math.min(1, safeBooked / safeSeats);
  const resolvedState = state ?? deriveState(safeBooked, safeSeats);

  return (
    <svg
      viewBox="0 0 104 104"
      role="img"
      aria-label={`${safeBooked} of ${safeSeats} seats booked`}
      className={cn('h-26 w-26 shrink-0', className)}
      style={{ width: 104, height: 104 }}
    >
      <circle
        cx="52"
        cy="52"
        r={RING_RADIUS}
        fill="none"
        strokeWidth={11}
        className="stroke-blush"
      />
      <circle
        data-testid="capacity-ring-fill"
        cx="52"
        cy="52"
        r={RING_RADIUS}
        fill="none"
        strokeWidth={11}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
        className={cn(
          'origin-center -rotate-90 transition-[stroke-dashoffset] duration-1000',
          STROKE_BY_STATE[resolvedState],
        )}
      />
      {/* aria-hidden: the accessible name on the <svg> already conveys this. */}
      <text
        x="52"
        y="50"
        textAnchor="middle"
        aria-hidden="true"
        className="fill-cocoa font-body text-[19px] font-extrabold"
      >
        {safeBooked}/{safeSeats}
      </text>
      <text
        x="52"
        y="64"
        textAnchor="middle"
        aria-hidden="true"
        className="fill-latte font-body text-[9.5px] font-bold"
      >
        seats booked
      </text>
    </svg>
  );
}
