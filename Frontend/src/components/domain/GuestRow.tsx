import Link from 'next/link';

import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/cn';
import type { Guest } from '@/lib/api/types';

/**
 * A guest on the roster.
 *
 * This is where PRD §2.4's "remember every guest like a favourite regular"
 * actually shows up: the visit badge, the mini-CRM note, the allergy chip and
 * the birthday flag all sit on one line the host reads at a glance.
 */

const AVATAR_TONES = [
  'bg-blush text-rose-ink',
  'bg-sage-soft text-sage-ink',
  'bg-terra-soft text-terra-deep',
  'bg-butter-soft text-butter-ink',
] as const;

/** Stable colour per guest, so a face keeps its tone between renders. */
export function avatarTone(guestId: string): string {
  let hash = 0;
  for (const character of guestId) {
    hash = (hash + character.codePointAt(0)!) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}

export function initial(fullName: string): string {
  return fullName.trim().charAt(0).toUpperCase() || '?';
}

export interface GuestRowProps {
  guest: Guest;
  /** Right-hand slot — usually the table picker on a session roster. */
  action?: React.ReactNode;
  className?: string;
}

export function GuestRow({ guest, action, className }: GuestRowProps) {
  const criticalAllergies = guest.allergies.filter((a) => a.is_critical);
  const hasBirthdaySoon = guest.days_until_birthday !== null && guest.days_until_birthday <= 30;

  return (
    <div
      className={cn(
        'border-line flex flex-wrap items-center gap-3 border-b-[1.5px] border-dashed py-3 last:border-b-0',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-[42px] shrink-0 place-items-center rounded-full text-[15px] font-extrabold',
          avatarTone(guest.id),
        )}
      >
        {initial(guest.full_name)}
      </span>

      <div className="min-w-0 flex-1 basis-[150px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <b className="text-[14.5px]">
            <Link
              href={`/guests/${guest.id}`}
              // inline-flex + min-height, not padding: the name sits inline
              // beside chips, and a 20px link is not reliably tappable with
              // clay on your hands.
              className="hover:text-rose-ink focus-visible:outline-rose inline-flex min-h-[44px] items-center rounded focus-visible:outline-[3px] focus-visible:outline-offset-2"
            >
              {guest.full_name}
            </Link>
          </b>

          {guest.visit_badge ? <Chip tone="pink">{guest.visit_badge} 💗</Chip> : null}

          {hasBirthdaySoon ? (
            <Chip tone="butter" srPrefix="Birthday:">
              🎂 {guest.days_until_birthday === 0 ? 'today!' : `in ${guest.days_until_birthday}d`}
            </Chip>
          ) : null}

          {criticalAllergies.map((allergy) => (
            // Colour alone must never carry this; the prefix is spoken.
            <Chip key={allergy.id} tone="allergy" srPrefix="Allergy:">
              ⚠️ {allergy.label}
            </Chip>
          ))}

          {!guest.is_contactable ? (
            <Chip tone="neutral" srPrefix="Note:">
              No messages
            </Chip>
          ) : null}

          {guest.available_credits > 0 ? (
            <Chip tone="sage" srPrefix="Credits:">
              🫶 {guest.available_credits} credit{guest.available_credits === 1 ? '' : 's'}
            </Chip>
          ) : null}
        </div>

        {guest.memory_note ? (
          // The note that makes personal recognition scale past memory.
          <p className="font-hand text-latte text-[15.5px]">{guest.memory_note}</p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
