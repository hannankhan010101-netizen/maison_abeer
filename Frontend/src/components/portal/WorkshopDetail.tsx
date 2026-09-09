'use client';

import Link from 'next/link';

import { countdownFrom } from '@/components/portal/WorkshopCard';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ApiError } from '@/lib/api/errors';
import { useAcceptInvite, useDeclineInvite, usePortalWorkshop } from '@/lib/api/hooks';
import { useResolvedNow } from '@/lib/useNow';
import { cn } from '@/lib/cn';
import { formatDateLong, formatRange } from '@/lib/dates';
import type { AttendeePeek } from '@/lib/api/types';

/**
 * One workshop, and who else is going.
 *
 * The attendee stack is the social hook, and also the riskiest thing on the
 * page: it shows guests to each other. The API sends a display name and
 * nothing else — no phone, no email, no allergies — so there is no identifying
 * detail here to render even by mistake.
 */

/** Deterministic from the id, so a person keeps the same colour everywhere. */
const TONES = [
  'bg-blush text-rose-ink',
  'bg-sage-soft text-sage-ink',
  'bg-butter-soft text-butter-ink',
  'bg-pink text-on-pink',
] as const;

function toneFor(id: string): string {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return TONES[sum % TONES.length]!;
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export interface WorkshopDetailProps {
  sessionId: string;
}

export function WorkshopDetail({ sessionId }: WorkshopDetailProps) {
  const workshop = usePortalWorkshop(sessionId);
  const now = useResolvedNow();

  if (workshop.isError) {
    return (
      <Card>
        <div role="alert">
          <p className="font-bold">
            {workshop.error instanceof ApiError
              ? workshop.error.displayMessage
              : "We couldn't find that workshop on your list."}
          </p>
          <Link href="/portal" className={`${buttonClasses('secondary')} mt-3`}>
            Back to your workshops
          </Link>
        </div>
      </Card>
    );
  }

  if (!workshop.data) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading workshop</span>
        <div
          aria-hidden="true"
          className="border-line h-40 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
        />
      </div>
    );
  }

  const item = workshop.data;

  return (
    <section>
      <Link
        href="/portal"
        className="text-rose-ink mb-3 inline-flex min-h-[44px] items-center text-sm font-extrabold"
      >
        ← Your workshops
      </Link>

      <header className="mb-4">
        <h1 className="font-display text-[clamp(26px,6vw,34px)] leading-tight">{item.name}</h1>

        <p className="text-cocoa mt-1" suppressHydrationWarning>
          {formatDateLong(item.starts_at)} · {formatRange(item.starts_at, item.ends_at)}
        </p>
        {item.location ? <p className="text-latte">{item.location}</p> : null}

        {item.status === 'upcoming' && now ? (
          <p className="mt-2">
            <span
              className="bg-blush text-rose-ink rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-extrabold"
              suppressHydrationWarning
            >
              {countdownFrom(item.starts_at, now)}
            </span>
          </p>
        ) : null}

        {item.status === 'cancelled' ? (
          <p className="mt-2">
            <Chip tone="butter">This workshop was cancelled</Chip>
          </p>
        ) : null}
      </header>

      {item.status === 'invited' ? <InviteOffer sessionId={sessionId} /> : null}

      {item.notes ? (
        <Card className="mb-4">
          <Eyebrow>Good to know</Eyebrow>
          <p className="text-sm">{item.notes}</p>
        </Card>
      ) : null}

      <Card>
        <Eyebrow>Who&rsquo;s pulling up</Eyebrow>
        <AttendeeStack attendees={item.attendees} othersCount={item.others_count} />
      </Card>
    </section>
  );
}

/**
 * A held seat, waiting on a tap.
 *
 * The only place either action lives: an offer can be accepted or declined
 * exactly once, and burying that choice in a list card next to nine other
 * workshops is how it gets missed until the hold expires on its own.
 */
function InviteOffer({ sessionId }: { sessionId: string }) {
  const accept = useAcceptInvite(sessionId);
  const decline = useDeclineInvite(sessionId);

  const pending = accept.isPending || decline.isPending;

  return (
    <Card className="mb-4">
      <Eyebrow>A seat opened up</Eyebrow>
      <p className="text-sm">
        It&rsquo;s yours if you want it — accept to lock it in, or let it pass to whoever&rsquo;s
        next.
      </p>

      {accept.isError ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {accept.error instanceof ApiError
            ? accept.error.displayMessage
            : "That didn't go through — try again."}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          loading={accept.isPending}
          loadingLabel="Claiming your seat…"
          disabled={pending}
          onClick={() => accept.mutate()}
        >
          Claim my seat
        </Button>

        <Button
          variant="secondary"
          size="sm"
          loading={decline.isPending}
          loadingLabel="Passing it along…"
          disabled={pending}
          onClick={() => decline.mutate()}
        >
          Not this time
        </Button>
      </div>
    </Card>
  );
}

function AttendeeStack({
  attendees,
  othersCount,
}: {
  attendees: AttendeePeek[];
  othersCount: number;
}) {
  if (attendees.length === 0) {
    return (
      <p className="text-latte text-sm">
        <HandNote>You&rsquo;re first in — someone has to be ♡</HandNote>
      </p>
    );
  }

  // Overlapping avatars read as a group at a glance; the full list is below
  // for anyone who actually wants to read the names.
  const shown = attendees.slice(0, 8);

  return (
    <>
      <div className="mb-2 flex items-center">
        {shown.map((attendee, index) => (
          <span
            key={attendee.guest_id}
            aria-hidden="true"
            style={{ marginLeft: index === 0 ? 0 : '-10px', zIndex: shown.length - index }}
            className={cn(
              'grid size-10 place-items-center rounded-full text-sm font-extrabold',
              'border-paper border-2',
              toneFor(attendee.guest_id),
            )}
          >
            {initialOf(attendee.display_name)}
          </span>
        ))}

        {attendees.length > shown.length ? (
          <span
            aria-hidden="true"
            style={{ marginLeft: '-10px' }}
            className="border-paper bg-buttercream text-latte grid size-10 place-items-center rounded-full border-2 text-xs font-extrabold"
          >
            +{attendees.length - shown.length}
          </span>
        ) : null}
      </div>

      <p className="text-[15px] font-bold">
        {othersCount === 0
          ? 'Just you so far'
          : `You + ${othersCount} other${othersCount === 1 ? '' : 's'} are going`}
      </p>

      <ul className="text-latte mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm">
        {attendees.map((attendee) => (
          <li key={attendee.guest_id}>
            {attendee.is_you ? <b className="text-cocoa">You</b> : attendee.display_name}
          </li>
        ))}
      </ul>
    </>
  );
}
