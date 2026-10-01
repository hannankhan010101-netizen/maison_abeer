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
  /**
   * Make the whole row open the guest (ADR 0003 decision 6).
   *
   * Off by default, because the shared component cannot decide this for both
   * call sites: `GuestList` is a navigation list, where the name alone measured
   * 72×44px inside a 343×100px row and nine taps in ten landed on nothing —
   * but a roster row is an *editing* row. There the host is assigning tables on
   * a 343px row whose `<select>` occupies the right ~110px, and a reach that
   * lands 20px short is the exact mis-tap the 44px floor exists for. Under a
   * stretched link that mis-tap abandons the seating pass for `/guests/<id>`,
   * with no undo and no explanation; before it, the same tap was inert, which
   * is the correct behaviour for a row you edit in place.
   */
  linkWholeRow?: boolean;
  className?: string;
}

export function GuestRow({ guest, action, linkWholeRow = false, className }: GuestRowProps) {
  const criticalAllergies = guest.allergies.filter((a) => a.is_critical);
  const hasBirthdaySoon = guest.days_until_birthday !== null && guest.days_until_birthday <= 30;

  return (
    <div
      className={cn(
        'border-line flex flex-wrap items-center gap-3 border-b-[1.5px] border-dashed py-3 last:border-b-0',
        /*
         * All of this belongs to the stretched link, so it is gated with it.
         *
         * `relative` anchors the `after` overlay and the inset padding lets the
         * pressed state read as a whole row rather than a word — but
         * `active:bg-blush/60` also *advertises* the row as a navigation
         * target, which on the session roster would be a promise the row must
         * not keep.
         */
        linkWholeRow &&
          'active:bg-blush/60 relative -mx-2 rounded-[var(--radius-sm)] px-2 transition-colors motion-reduce:transition-none',
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
              /*
               * With `linkWholeRow`, the `after` pseudo-element covers the
               * whole row, so a tap anywhere on it opens the guest.
               *
               * The link itself measured 72×44px inside a 343×100px row —
               * about a tenth of it — so nine taps in ten landed on nothing.
               * Every list on a phone makes the row the target; this one made
               * you hit a word. `inline-flex min-h-[44px]` stays either way,
               * for the visible text that sits inline beside the chips, and is
               * the whole target on a roster row.
               */
              className={cn(
                'hover:text-rose-ink focus-visible:outline-rose inline-flex min-h-[44px] items-center rounded focus-visible:outline-[3px] focus-visible:outline-offset-2',
                linkWholeRow && "after:absolute after:inset-0 after:content-['']",
              )}
            >
              {guest.full_name}
            </Link>
          </b>

          {guest.visit_badge ? <Chip tone="pink">{guest.visit_badge} 💗</Chip> : null}

          {/*
            Three of the five chips stand down on a phone.

            A guest with a badge, a birthday, an allergy, credits and "no
            messages" wrapped to a 100px row — and five pastel chips means none
            of them stands out, which defeats the point of the one that is
            health-adjacent. The visit badge and critical allergies stay,
            because those are what the host acts on at the door; birthday,
            credits and contactability are all already on `GuestProfile`, one
            tap away on the row that is now tappable everywhere.
          */}
          {hasBirthdaySoon ? (
            <Chip tone="butter" srPrefix="Birthday:" className="hidden sm:inline-flex">
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
            <Chip tone="neutral" srPrefix="Note:" className="hidden sm:inline-flex">
              No messages
            </Chip>
          ) : null}

          {guest.available_credits > 0 ? (
            <Chip tone="sage" srPrefix="Credits:" className="hidden sm:inline-flex">
              🫶 {guest.available_credits} credit{guest.available_credits === 1 ? '' : 's'}
            </Chip>
          ) : null}
        </div>

        {guest.memory_note ? (
          /*
           * The note that makes personal recognition scale past memory — and
           * the one thing in this row a host copies rather than reads: "window
           * seat, partner is gluten-free" gets pasted into a WhatsApp reply.
           *
           * So it has to come out from under the stretched link, like the
           * action slot below. Under the `after:inset-0` overlay a drag starts
           * a link drag and a long-press opens Open-in-New-Tab instead of the
           * selection handles, so the note could not be copied at all.
           *
           * `w-fit` keeps the lifted box to the glyphs: a tap on the words
           * themselves no longer opens the guest, and that is the whole cost —
           * the rest of the row stays tappable.
           */
          <p className="font-hand text-latte relative z-10 w-fit text-[15.5px]">
            {guest.memory_note}
          </p>
        ) : null}
      </div>

      {/* Above the stretched link, or the table picker becomes unclickable. */}
      {action ? <div className="relative z-10 shrink-0">{action}</div> : null}
    </div>
  );
}
