import type { PublicClass } from '@/lib/public/api';
import { nextClass, whenCopy } from '@/lib/public/format';

/**
 * The words and colours on the booking page that come straight from a class.
 *
 * Pure, so what a guest reads — "Last seat!", "Only 3 seats left" — can be pinned
 * by a unit test rather than found by looking at the page.
 */

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Scarcity, honestly stated. Never invented — it is the real seat count. */
export function seatCopy(item: PublicClass): { text: string; urgent: boolean } {
  if (item.is_full) return { text: 'Fully booked · join the waitlist', urgent: false };
  if (item.seats_left === 1) return { text: 'Last seat!', urgent: true };
  if (item.seats_left <= 3) return { text: `Only ${item.seats_left} seats left`, urgent: true };
  return { text: `${item.seats_left} seats left`, urgent: false };
}

/**
 * The one honest number on the ticket stub: "8 seats left this Friday",
 * "last seat tomorrow", or "14 seats across 3 classes". Counted from open
 * classes only (a seat left and not full); null when there are none, so the
 * stub says nothing rather than "0 seats".
 */
export function seatsLine(classes: readonly PublicClass[], now: Date): string | null {
  const open = classes.filter((item) => item.seats_left > 0 && !item.is_full);
  const only = open.length === 1 ? nextClass(open) : null;

  if (open.length === 0) return null;
  if (only) {
    const when = whenCopy(only.starts_at, now);
    return only.seats_left === 1 ? `last seat ${when}` : `${only.seats_left} seats left ${when}`;
  }

  const seats = open.reduce((sum, item) => sum + item.seats_left, 0);
  return `${seats} seats across ${open.length} classes`;
}

/**
 * The class-type colour system, ported from the admin app: pink is bento
 * cake, terracotta is pottery, sage is ceramic painting. Load-bearing there,
 * decorative here — but reusing it is what makes a class card look like it
 * belongs to this studio rather than a generic booking widget.
 */
// Written as complete, literal class strings — Tailwind's build-time scanner
// finds classes by grepping source text, so constructing one by string
// concatenation or `.replace()` at runtime produces a class no CSS is ever
// generated for. The hover variant has to be spelled out here rather than
// derived from `glow`.
export const ACCENT: Record<string, { bar: string; hoverGlow: string }> = {
  pink: {
    bar: 'bg-pink',
    hoverGlow: 'hover:shadow-[0_0_0_1px_var(--color-pink),0_12px_28px_-16px_var(--color-pink)]',
  },
  terra: {
    bar: 'bg-terra',
    hoverGlow: 'hover:shadow-[0_0_0_1px_var(--color-terra),0_12px_28px_-16px_var(--color-terra)]',
  },
  sage: {
    bar: 'bg-sage',
    hoverGlow: 'hover:shadow-[0_0_0_1px_var(--color-sage),0_12px_28px_-16px_var(--color-sage)]',
  },
};

export function accentFor(token: string) {
  return ACCENT[token] ?? ACCENT.pink!;
}
