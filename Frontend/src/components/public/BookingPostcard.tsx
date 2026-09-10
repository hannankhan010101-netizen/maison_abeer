import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';

/**
 * A small "postcard" — the exact gradient + tilt + dashed-border card
 * language the admin app already uses for "Your week, wrapped" (see
 * `components/domain/WeekWrapped.tsx`), reused here so the booking page
 * carries the same signature rather than inventing a new one.
 *
 * The number on it is real, not invented: seats actually open right now,
 * summed from the same class list the guest is about to pick from. No
 * "12 people are viewing this" fake-urgency pattern — the design system's
 * own voice rules already forbid shame copy and invented scarcity, and a
 * number a guest can immediately go verify by scrolling down is worth more
 * than one they can't.
 */
export function BookingPostcard({ classes }: { classes: PublicClass[] }) {
  const openClasses = classes.filter((item) => !item.is_full);
  const seatsOpen = openClasses.reduce((total, item) => total + item.seats_left, 0);

  if (classes.length === 0 || seatsOpen === 0) return null;

  return (
    <div className="px-4 sm:px-6">
      <div
        className={cn(
          'mx-auto max-w-[340px] rounded-[var(--radius-lg)] p-[5px] shadow-[var(--shadow-soft)]',
          'bg-[linear-gradient(140deg,var(--color-pink)_0%,var(--color-butter)_55%,var(--color-sage)_110%)]',
          'rotate-[1.1deg]',
        )}
      >
        <div className="relative rounded-[18px] border-2 border-dashed border-white/75 p-5 text-center text-[#4A2A33]">
          <p className="font-display text-3xl leading-none">{seatsOpen}</p>
          <p className="font-hand mt-1 text-lg">
            seat{seatsOpen === 1 ? '' : 's'} open across {openClasses.length} class
            {openClasses.length === 1 ? '' : 'es'} right now ✨
          </p>
        </div>
      </div>
    </div>
  );
}
