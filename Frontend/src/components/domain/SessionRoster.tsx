'use client';

import { useState } from 'react';

import { AddGuestModal } from '@/components/domain/AddGuestModal';
import { GuestRow } from '@/components/domain/GuestRow';
import { AlertCard } from '@/components/ui/AlertCard';
import { Button } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Field, Modal, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import {
  useAssignTable,
  useCancelBooking,
  useCreateBooking,
  useGuests,
  useInviteNext,
  useRoster,
} from '@/lib/api/hooks';
import type { Booking, Guest, Session } from '@/lib/api/types';

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
  const [booking, setBooking] = useState(false);

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
        <Eyebrow className="mb-0">Who&rsquo;s coming</Eyebrow>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="neutral">
            {session.capacity.booked}/{session.capacity.seats} booked
          </Chip>
          {unassigned > 0 ? <Chip tone="butter">{unassigned} without a table</Chip> : null}
          {/* Bookings taken over WhatsApp or the phone had nowhere to go: the
              roster's own empty state said "add a guest and they'll appear
              here", which was advice that could not be followed. */}
          <Button variant="secondary" size="sm" onClick={() => setBooking(true)}>
            Book someone in
          </Button>
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
          description="Invites hold a seat for 12h, then pass down the list · quiet hours respected"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={invite}
              loading={inviteNext.isPending}
              loadingLabel="Inviting…"
              disabled={session.capacity.available === 0}
            >
              Invite next
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
            Try again
          </Button>
        </div>
      ) : null}

      {roster.isSuccess && bookings.length === 0 ? (
        <p className="text-latte py-5 text-center text-sm">
          Nobody booked in yet — &ldquo;Book someone in&rdquo; puts them on this list
        </p>
      ) : null}

      {/* Mounted only while open: it reads the whole guest book, and the
          roster should not fetch that on every render just in case. */}
      {booking ? (
        <BookSomeoneInModal
          session={session}
          onClose={() => setBooking(false)}
          alreadyBooked={bookings.map((b) => b.guest.id)}
        />
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
                    <option value="">No table</option>
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
                    Cancel
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
            Keep the booking
          </Button>
          <Button
            variant="danger"
            onClick={confirm}
            loading={cancelBooking.isPending}
            loadingLabel="Cancelling…"
          >
            Cancel the seat
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="text-latte mb-2 text-xs font-extrabold tracking-[0.06em] uppercase">
          How are you handling it?
        </legend>

        {[
          {
            id: 'credit' as const,
            label: 'Save a class credit',
            note: 'Sends a warm note and keeps their seat for next time',
          },
          {
            id: 'refunded' as const,
            label: 'Refunded them',
            note: 'Just records it — money is handled outside the app',
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
        placeholder="Anything to remember? (optional)"
        className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3.5 text-sm"
      />

      {error ? (
        <p role="alert" className="text-danger mt-2 text-sm font-extrabold">
          {error}
        </p>
      ) : null}

      <p className="mt-3">
        <HandNote>Life happens 🫶</HandNote>
      </p>
    </Modal>
  );
}

/**
 * Seat a guest in this class.
 *
 * Picks from the guest book, or adds someone new and books them in the same
 * step — `AddGuestModal` has exposed an `onCreated` callback for exactly this
 * since it was written, and nothing ever passed one.
 */
function BookSomeoneInModal({
  session,
  onClose,
  alreadyBooked,
}: {
  session: Session;
  onClose: () => void;
  alreadyBooked: string[];
}) {
  const { toast } = useToast();
  const guests = useGuests({});
  const createBooking = useCreateBooking(session.id);

  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const booked = new Set(alreadyBooked);
  const needle = search.trim().toLowerCase();

  // Already-booked guests are filtered out rather than left to fail: the API
  // refuses them with a 409, and offering a choice that cannot work is worse
  // than not offering it.
  const options = (guests.data ?? [])
    .filter((guest) => !booked.has(guest.id))
    .filter((guest) => !needle || guest.full_name.toLowerCase().includes(needle))
    .slice(0, 30);

  async function book(guest: Guest) {
    try {
      await createBooking.mutateAsync({ guestId: guest.id });
      toast(`${guest.full_name.split(' ')[0]} is booked in ✨`);
      onClose();
    } catch (caught) {
      // Two real refusals live behind this: the class filled up since the page
      // loaded, and the guest is already in it. Both are worth reading.
      toast(
        caught instanceof ApiError ? caught.displayMessage : "We couldn't book them in.",
        'error',
      );
    }
  }

  return (
    <>
      <Modal
        open={!adding}
        onClose={onClose}
        title="Book someone in"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => setAdding(true)}>
              New guest
            </Button>
          </>
        }
      >
        {!session.capacity.accepts_bookings ? (
          <AlertCard
            className="mb-3"
            tone="warning"
            icon="🫢"
            title={session.capacity.available === 0 ? 'this class is full' : 'this class is closed'}
            description="The waitlist is the path forward — invite from it once a seat frees up."
          />
        ) : null}

        <Field label="Find a guest" htmlFor="book-search">
          <input
            id="book-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Start typing a name…"
            className={inputClasses}
          />
        </Field>

        {guests.isPending ? (
          <p className="text-latte text-sm" role="status">
            Fetching your guests…
          </p>
        ) : options.length === 0 ? (
          <p className="text-latte text-sm">
            {needle
              ? 'Nobody by that name who is not already booked in.'
              : 'Everyone in your guest book is already in this class.'}
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {options.map((guest) => (
              <li key={guest.id}>
                <button
                  type="button"
                  disabled={createBooking.isPending || !session.capacity.accepts_bookings}
                  onClick={() => void book(guest)}
                  className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3.5 text-left text-sm font-bold disabled:opacity-50"
                >
                  {guest.full_name}
                  {guest.visit_badge ? (
                    <span className="text-latte font-normal"> · {guest.visit_badge}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <AddGuestModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(guest) => {
          setAdding(false);
          void book(guest);
        }}
      />
    </>
  );
}
