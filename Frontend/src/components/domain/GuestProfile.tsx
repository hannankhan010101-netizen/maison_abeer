'use client';

import Link from 'next/link';

import { AlertCard } from '@/components/ui/AlertCard';
import { buttonClasses } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ApiError } from '@/lib/api/errors';
import { useGuest, useGuestHistory, useGuestMessages } from '@/lib/api/hooks';
import { formatDateLong, formatTime } from '@/lib/dates';
import type { GuestVisit, ScheduledMessage } from '@/lib/api/types';

/**
 * One guest, everything about them (PRD §2.4).
 *
 * The product's premise is that remembering people is what brings them back,
 * and until now the app had nowhere to look someone up. The ordering is
 * deliberate: allergies first because they are safety-critical, then the
 * memory note because it is what the host actually wants at the door, then
 * history, then the message log.
 */

const STATUS_COPY: Record<string, string> = {
  confirmed: 'Booked',
  attended: 'Came along',
  no_show: "Didn't make it",
  cancelled: 'Cancelled',
};

const MESSAGE_STATUS_TONE: Record<string, 'sage' | 'butter' | 'terra' | 'neutral'> = {
  sent: 'sage',
  delivered: 'sage',
  scheduled: 'neutral',
  queued: 'butter',
  failed: 'terra',
  cancelled: 'neutral',
};

export interface GuestProfileProps {
  guestId: string;
}

export function GuestProfile({ guestId }: GuestProfileProps) {
  const guest = useGuest(guestId);
  const history = useGuestHistory(guestId);
  const messages = useGuestMessages(guestId);

  if (guest.isError) {
    return (
      <Card>
        <div role="alert">
          <p className="font-bold">
            {guest.error instanceof ApiError
              ? guest.error.displayMessage
              : "We couldn't find that guest."}
          </p>
          <Link href="/guests" className={`${buttonClasses('secondary')} mt-3`}>
            Back to guests
          </Link>
        </div>
      </Card>
    );
  }

  if (!guest.data) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading guest…</span>
        <div
          aria-hidden="true"
          className="border-line h-40 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
        />
      </div>
    );
  }

  const person = guest.data;
  const critical = person.allergies.filter((allergy) => allergy.is_critical);

  return (
    <section>
      <Link
        href="/guests"
        className="text-rose-ink mb-3 inline-block min-h-[44px] text-sm font-extrabold"
      >
        ← All guests
      </Link>

      <header className="mb-4">
        <h1 className="font-display text-[clamp(26px,4vw,34px)]">{person.full_name}</h1>

        <p className="mt-1 flex flex-wrap items-center gap-1.5">
          {person.visit_badge ? <Chip tone="pink">{person.visit_badge}</Chip> : null}
          {person.is_regular ? <Chip tone="sage">Regular 💗</Chip> : null}
          {!person.is_contactable ? <Chip tone="butter">No way to reach them</Chip> : null}
          {person.available_credits > 0 ? (
            <Chip tone="butter">
              {person.available_credits} credit{person.available_credits === 1 ? '' : 's'}
            </Chip>
          ) : null}
        </p>
      </header>

      {/* First, and unmissable. */}
      {critical.length > 0 ? (
        <AlertCard
          className="mb-4"
          tone="critical"
          icon="⚠️"
          title={critical.map((allergy) => allergy.label).join(' · ')}
          description={
            critical
              .map((a) => a.notes)
              .filter(Boolean)
              .join(' · ') || 'Check before every class'
          }
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <Eyebrow>Remember</Eyebrow>
            {person.memory_note ? (
              <p className="text-[15px]">
                <HandNote>{person.memory_note}</HandNote>
              </p>
            ) : (
              <p className="text-latte text-sm">
                Nothing noted yet — add something you&rsquo;d want to remember at the door.
              </p>
            )}

            <dl className="mt-4 grid gap-1.5 text-sm">
              <Detail label="Phone" value={person.phone} />
              <Detail label="Email" value={person.email} />
              <Detail
                label="Birthday"
                value={person.birthday ? formatDateLong(person.birthday) : null}
              />
              <Detail label="Reach them on" value={person.preferred_channel} />
            </dl>

            {person.allergies.length > 0 ? (
              <>
                <Eyebrow className="mt-4">Allergies &amp; preferences</Eyebrow>
                <ul className="flex flex-wrap gap-1.5">
                  {person.allergies.map((allergy) => (
                    <li key={allergy.id}>
                      <Chip tone={allergy.is_critical ? 'allergy' : 'neutral'}>
                        {allergy.label}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>

          <Card>
            <Eyebrow>Their classes</Eyebrow>
            {history.data ? (
              <p className="text-latte mb-2 text-sm">
                {history.data.attended_count} attended
                {history.data.upcoming_count > 0
                  ? ` · ${history.data.upcoming_count} coming up`
                  : ''}
              </p>
            ) : null}
            <VisitList visits={history.data?.visits ?? []} loading={history.isPending} />
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <Eyebrow>Messages</Eyebrow>
            <MessageLog messages={messages.data ?? []} loading={messages.isPending} />
          </Card>
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="flex gap-2">
      <dt className="text-latte min-w-[92px] font-extrabold">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function VisitList({ visits, loading }: { visits: GuestVisit[]; loading: boolean }) {
  if (loading) {
    return (
      <p className="text-latte text-sm" role="status">
        Loading their history…
      </p>
    );
  }

  if (visits.length === 0) {
    return <p className="text-latte text-sm">No classes yet — their first one is still to come.</p>;
  }

  return (
    <ul aria-label="Class history" className="grid gap-2">
      {visits.map((visit) => (
        <li
          key={visit.booking_id}
          className="border-line bg-buttercream rounded-[var(--radius-sm)] border-[1.5px] p-2.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <b className="text-[14.5px]">{visit.class_name}</b>
            {visit.is_upcoming ? <Chip tone="pink">Coming up</Chip> : null}
          </div>

          <p className="text-latte text-sm">
            {formatDateLong(visit.starts_at)} · {formatTime(visit.starts_at)}
            {visit.location ? ` · ${visit.location}` : ''}
          </p>

          <p className="text-latte text-xs">
            {STATUS_COPY[visit.status] ?? visit.status}
            {visit.table_number !== null ? ` · table ${visit.table_number}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

function MessageLog({ messages, loading }: { messages: ScheduledMessage[]; loading: boolean }) {
  if (loading) {
    return (
      <p className="text-latte text-sm" role="status">
        Loading messages…
      </p>
    );
  }

  if (messages.length === 0) {
    return <p className="text-latte text-sm">Nothing sent to them yet.</p>;
  }

  return (
    <ul aria-label="Message history" className="grid gap-2">
      {messages.map((message) => (
        <li
          key={message.id}
          className="border-line rounded-[var(--radius-sm)] border-[1.5px] p-2.5"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Chip tone={MESSAGE_STATUS_TONE[message.status] ?? 'neutral'}>
              {message.status.replace(/_/g, ' ')}
            </Chip>
            <span className="text-latte text-xs">
              {formatDateLong(message.sent_at ?? message.send_at)}
            </span>
          </div>

          <p className="text-sm">{message.body}</p>

          {/* A failure the host cannot see is the failure mode this product
              cannot have (PRD §3.2). */}
          {message.last_error ? (
            <p className="text-danger mt-1 text-xs font-bold">{message.last_error}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
