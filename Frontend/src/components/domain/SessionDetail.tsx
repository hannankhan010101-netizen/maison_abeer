'use client';

import Link from 'next/link';
import { useState } from 'react';

import { RescheduleModal, SeatModal } from '@/components/domain/SessionEditModals';
import { SessionRoster } from '@/components/domain/SessionRoster';
import { AlertCard } from '@/components/ui/AlertCard';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { CapacityRing } from '@/components/ui/CapacityRing';
import { Chip } from '@/components/ui/Chip';
import { ApiError } from '@/lib/api/errors';
import { useCancelMessage, useLockSession, useSession, useSessionMessages } from '@/lib/api/hooks';
import { formatDateLong, formatRange, formatTime } from '@/lib/dates';
import type { ScheduledMessage } from '@/lib/api/types';

/**
 * One class, everything about it.
 *
 * Until now tapping a class in the calendar opened the seat editor and
 * nothing else — the roster lived inside the guests screen behind a picker,
 * and the queued messages had nowhere to be seen at all. This is the page
 * those belong on.
 *
 * Ordered by what a host actually needs on the day: who is coming, then the
 * things that change it, then what has been said to them.
 */

const CANCELLABLE = new Set(['scheduled', 'queued']);

export interface SessionDetailProps {
  sessionId: string;
}

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const session = useSession(sessionId);
  const lock = useLockSession(sessionId);

  const [editing, setEditing] = useState<'seats' | 'reschedule' | null>(null);

  if (session.isError) {
    return (
      <Card>
        <div role="alert">
          <p className="font-bold">
            {session.error instanceof ApiError
              ? session.error.displayMessage
              : "We couldn't find that class."}
          </p>
          <Link href="/calendar" className={`${buttonClasses('secondary')} mt-3`}>
            Back to the calendar
          </Link>
        </div>
      </Card>
    );
  }

  if (!session.data) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading class…</span>
        <div
          aria-hidden="true"
          className="border-line h-40 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
        />
      </div>
    );
  }

  const item = session.data;
  const { capacity } = item;
  const isLocked = item.status === 'locked';

  return (
    <section>
      <Link
        href="/calendar"
        className="text-rose-ink mb-3 inline-flex min-h-[44px] items-center text-sm font-extrabold"
      >
        ← Calendar
      </Link>

      <header className="mb-4">
        <h1 className="font-display text-[clamp(21px,4vw,34px)]">
          {item.title ?? item.class_type_name}
        </h1>
        <p className="text-latte">
          {formatDateLong(item.starts_at)} · {formatRange(item.starts_at, item.ends_at)}
          {item.location ? ` · ${item.location}` : ''}
        </p>
      </header>

      {isLocked ? (
        <AlertCard
          className="mb-4"
          tone="warning"
          icon="🔒"
          title="This class is closed"
          description="No new bookings — the roster and seats are untouched"
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <CapacityRing
                booked={capacity.booked}
                seats={capacity.seats}
                state={capacity.state}
              />

              <div className="min-w-0">
                <CardTitle>{item.class_type_name}</CardTitle>

                <p className="mt-1 flex flex-wrap gap-1.5">
                  {capacity.state === 'sold_out' ? <Chip tone="pink">Sold out 🎀</Chip> : null}
                  {capacity.state === 'nearly_full' ? (
                    <Chip tone="pink">Filling fast 🔥</Chip>
                  ) : null}
                  {capacity.waitlist_is_open ? <Chip tone="butter">Waitlist open</Chip> : null}
                  {item.unassigned_guest_count > 0 ? (
                    <Chip tone="butter">{item.unassigned_guest_count} without a table</Chip>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button variant="secondary" onClick={() => setEditing('seats')}>
                Adjust seats
              </Button>
              <Button variant="secondary" onClick={() => setEditing('reschedule')}>
                Move this class
              </Button>
              <Button
                variant="ghost"
                disabled={lock.isPending}
                onClick={() => lock.mutate(!isLocked)}
              >
                {isLocked ? 'Reopen bookings' : 'Close bookings'}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2.5">
              <Link href="/tags" className={buttonClasses('secondary', 'sm')}>
                Print name tags
              </Link>
              <Link href="/prep" className={buttonClasses('secondary', 'sm')}>
                Prep list
              </Link>
            </div>
          </Card>

          <SessionRoster session={item} />
        </div>

        <div className="grid content-start gap-4">
          <MessagePanel sessionId={sessionId} />
        </div>
      </div>

      <SeatModal session={item} open={editing === 'seats'} onClose={() => setEditing(null)} />
      <RescheduleModal
        session={item}
        open={editing === 'reschedule'}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function MessagePanel({ sessionId }: { sessionId: string }) {
  const messages = useSessionMessages(sessionId);
  const cancel = useCancelMessage();

  return (
    <Card>
      <Eyebrow>Messages for this class</Eyebrow>

      {messages.isPending ? (
        <p className="text-latte text-sm" role="status">
          Loading messages…
        </p>
      ) : null}

      {messages.isSuccess && messages.data.length === 0 ? (
        <>
          <p className="text-latte text-sm">Nothing queued yet.</p>
          <Link href="/messages" className={`${buttonClasses('secondary', 'sm')} mt-3`}>
            Queue reminders
          </Link>
        </>
      ) : null}

      {messages.data && messages.data.length > 0 ? (
        <ul aria-label="Queued messages" className="grid gap-2">
          {messages.data.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              onCancel={() => cancel.mutate({ messageId: message.id })}
              cancelling={cancel.isPending}
            />
          ))}
        </ul>
      ) : null}

      <p className="text-latte mt-3 text-xs">
        <HandNote>Nothing sends outside 9 am – 9 pm 💤</HandNote>
      </p>
    </Card>
  );
}

function MessageRow({
  message,
  onCancel,
  cancelling,
}: {
  message: ScheduledMessage;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <li className="border-line rounded-[var(--radius-sm)] border-[1.5px] p-2.5">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Chip tone={message.status === 'failed' ? 'terra' : 'neutral'}>
          {message.status.replace(/_/g, ' ')}
        </Chip>
        <span className="text-latte text-xs">
          {formatDateLong(message.send_at)} · {formatTime(message.send_at)}
        </span>
      </div>

      <p className="text-sm">{message.body}</p>

      {/* A failure the host cannot see is the failure mode this product
          cannot have (PRD §3.2). */}
      {message.last_error ? (
        <p className="text-danger mt-1 text-xs font-bold">{message.last_error}</p>
      ) : null}

      {/* Only while it is still stoppable — offering to cancel something
          already delivered would be a lie. */}
      {CANCELLABLE.has(message.status) ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5"
          disabled={cancelling}
          onClick={onCancel}
        >
          Cancel this one
        </Button>
      ) : null}
    </li>
  );
}
