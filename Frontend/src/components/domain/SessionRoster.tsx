'use client';

import { useState } from 'react';

import { GuestRow } from '@/components/domain/GuestRow';
import { AlertCard } from '@/components/ui/AlertCard';
import { Button } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import { useAssignTable, useCancelBooking, useInviteNext, useRoster } from '@/lib/api/hooks';
import type { Booking, Session } from '@/lib/api/types';

/**
 * The roster for one class (PRD §2.4).
 *
 * Seating, cancellations and the waitlist all live here because they are the
 * same job: deciding who is coming and where they sit.
 */

const MAX_TABLES = 12;

export interface SessionRosterProps {
  session: Session;
}

export function SessionRoster({ session }: SessionRosterProps) {
  const { toast } = useToast();
  const roster = useRoster(session.id);
  const assignTable = useAssignTable(session.id);
  const inviteNext = useInviteNext(session.id);

  const [cancelling, setCancelling] = useState<Booking | null>(null);

  const bookings = (roster.data?.bookings ?? []).filter(
    (booking) => booking.status !== 'cancelled',
  );
  const unassigned = roster.data?.unassigned_count ?? 0;

  async function invite() {
    try {
      const result = await inviteNext.mutateAsync();
      // The API's message covers both outcomes — invited, or why not.
      toast(result.message, result.invited_guest_id ? 'default' : 'error');
    } catch (caught) {
      toast(
        caught instanceof ApiError ? caught.displayMessage : "We couldn't send that invite.",
        'error',
      );
    }
  }

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Eyebrow className="mb-0">who&rsquo;s coming</Eyebrow>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="neutral">
            {session.capacity.booked}/{session.capacity.seats} booked
          </Chip>
          {unassigned > 0 ? <Chip tone="butter">{unassigned} without a table</Chip> : null}
        </div>
      </div>

      {session.capacity.waitlist_is_open ? (
        <AlertCard
          className="mb-3"
          tone={session.capacity.available > 0 ? 'warning' : 'gentle'}
          icon="💌"
          title={
            session.capacity.available > 0
              ? 'a seat is free — offer it to the next person?'
              : 'waitlist is open'
          }
          description="invites hold a seat for 12h, then pass down the list · quiet hours respected"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={invite}
              loading={inviteNext.isPending}
              loadingLabel="inviting…"
              disabled={session.capacity.available === 0}
            >
              invite next
            </Button>
          }
        />
      ) : null}

      {roster.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading the roster…</span>
          <div
            aria-hidden="true"
            className="border-line h-24 rounded-[var(--radius-md)] border-[1.5px] border-dashed"
          />
        </div>
      ) : null}

      {roster.isError ? (
        <div role="alert" className="text-sm">
          <p className="font-bold">
            {roster.error instanceof ApiError
              ? roster.error.displayMessage
              : "We couldn't load the roster."}
          </p>
          <Button variant="ghost" className="mt-2" onClick={() => void roster.refetch()}>
            try again
          </Button>
        </div>
      ) : null}

      {roster.isSuccess && bookings.length === 0 ? (
        <p className="text-latte py-5 text-center text-sm">
          nobody booked in yet — add a guest and they&rsquo;ll appear here
        </p>
      ) : null}

      <ul>
        {bookings.map((booking) => (
          <li key={booking.id}>
            <GuestRow
              guest={booking.guest}
              action={
                <div className="flex items-center gap-1.5">
                  <label className="sr-only" htmlFor={`table-${booking.id}`}>
                    Table for {booking.guest.full_name}
                  </label>
                  {/* A dropdown, not drag-only: the PRD requires a tap path
                      on mobile alongside dragging on desktop (§2.4). */}
                  <select
                    id={`table-${booking.id}`}
                    value={booking.table_number ?? ''}
                    onChange={(event) =>
                      assignTable.mutate({
                        bookingId: booking.id,
                        tableNumber: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                    className="border-line bg-paper text-latte min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-3 text-xs font-extrabold"
                  >
                    <option value="">no table</option>
                    {Array.from({ length: MAX_TABLES }, (_, index) => index + 1).map((table) => (
                      <option key={table} value={table}>
                        table {table}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelling(booking)}
                    aria-label={`Cancel ${booking.guest.full_name}'s booking`}
                  >
                    cancel
                  </Button>
                </div>
              }
            />
          </li>
        ))}
      </ul>

      {cancelling ? (
        <CancelBookingModal
          sessionId={session.id}
          booking={cancelling}
          onClose={() => setCancelling(null)}
        />
      ) : null}
    </Card>
  );
}

/**
 * Cancelling (PRD §2.4).
 *
 * The choice between a refund and a credit is the whole point: a credit turns
 * an awkward money conversation into a reason to come back. Money itself is
 * off-platform in v1, so "refunded" only records what the host did.
 */
function CancelBookingModal({
  sessionId,
  booking,
  onClose,
}: {
  sessionId: string;
  booking: Booking;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const cancelBooking = useCancelBooking(sessionId);

  const [resolution, setResolution] = useState<'credit' | 'refunded'>('credit');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);

    try {
      await cancelBooking.mutateAsync({
        bookingId: booking.id,
        guestId: booking.guest.id,
        resolution,
        note: note.trim() || undefined,
      });

      toast(resolution === 'credit' ? 'seat credit saved for next time 🫶' : 'booking cancelled');

      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.displayMessage : "We couldn't cancel that booking.",
      );
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`cancel ${booking.guest.full_name}'s seat`}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            keep the booking
          </Button>
          <Button
            variant="danger"
            onClick={confirm}
            loading={cancelBooking.isPending}
            loadingLabel="cancelling…"
          >
            cancel the seat
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="text-latte mb-2 text-xs font-extrabold tracking-[0.06em] uppercase">
          how are you handling it?
        </legend>

        {[
          {
            id: 'credit' as const,
            label: 'save a class credit',
            note: 'sends a warm note and keeps their seat for next time',
          },
          {
            id: 'refunded' as const,
            label: 'refunded them',
            note: 'just records it — money is handled outside the app',
          },
        ].map((option) => (
          <label
            key={option.id}
            className="border-line mb-2 flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] border-[1.5px] p-3"
          >
            <input
              type="radio"
              name="resolution"
              value={option.id}
              checked={resolution === option.id}
              onChange={() => setResolution(option.id)}
              className="accent-rose mt-0.5 size-5"
            />
            <span>
              <b className="block text-sm">{option.label}</b>
              <small className="text-latte">{option.note}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <label htmlFor="cancel-note" className="sr-only">
        Note
      </label>
      <input
        id="cancel-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="anything to remember? (optional)"
        className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3.5 text-sm"
      />

      {error ? (
        <p role="alert" className="text-danger mt-2 text-sm font-extrabold">
          {error}
        </p>
      ) : null}

      <p className="mt-3">
        <HandNote>life happens 🫶</HandNote>
      </p>
    </Modal>
  );
}
