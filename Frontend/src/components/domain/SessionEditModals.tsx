'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Field, Modal, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import { usePreviewReschedule, useReschedule, useChangeSeats } from '@/lib/api/hooks';
import { formatDateLong, formatTime } from '@/lib/dates';
import { toLocalInputValue } from './NewSessionModal';
import type { RescheduleImpact, Session } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

/**
 * Adjust capacity (PRD §2.2).
 *
 * The API refuses to drop below the booking count and explains why in the
 * product voice, so the refusal is shown verbatim rather than restated.
 */
export function SeatModal({
  session,
  open,
  onClose,
  onRequestMove,
}: {
  session: Session;
  open: boolean;
  onClose: () => void;
  /** Hands off to the reschedule flow without closing and reopening. */
  onRequestMove?: () => void;
}) {
  const { toast, celebrate } = useToast();
  const changeSeats = useChangeSeats(session.id);

  const [seats, setSeats] = useState(session.capacity.seats);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const updated = await changeSeats.mutateAsync(seats);

      if (updated.capacity.state === 'sold_out' && session.capacity.state !== 'sold_out') {
        // The sell-out moment (PRD §2.1).
        celebrate('SOLD OUT! milestone saved 🎀');
      } else {
        toast('seats updated ✨');
      }

      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.displayMessage
          : "We couldn't change the seats just now.",
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="adjust seats"
      footer={
        <>
          {onRequestMove ? (
            <Button variant="ghost" type="button" onClick={onRequestMove} className="mr-auto">
              move this class instead
            </Button>
          ) : null}
          <Button variant="secondary" type="button" onClick={onClose}>
            cancel
          </Button>
          <Button
            type="submit"
            form="seat-form"
            loading={changeSeats.isPending}
            loadingLabel="saving…"
          >
            save
          </Button>
        </>
      }
    >
      <form id="seat-form" onSubmit={handleSubmit} noValidate>
        <p className="text-latte mb-3 text-sm">
          {session.capacity.booked} of {session.capacity.seats} seats are booked.
        </p>

        <Field label="seats" htmlFor="seat-count" error={error ?? undefined}>
          <input
            id="seat-count"
            type="number"
            min={0}
            max={200}
            value={seats}
            onChange={(event) => setSeats(Number(event.target.value))}
            aria-describedby={error ? 'seat-count-error' : undefined}
            className={inputClasses}
            required
          />
        </Field>

        <p className="text-latte text-xs">
          quantity-linked prep steps rescale automatically — you&rsquo;ll be told if something you
          already ticked needs more.
        </p>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

/**
 * Move a class (PRD §2.2).
 *
 * Two steps by design: the host sees exactly who is affected and which prep
 * deadlines shift *before* anything saves. Skipping the preview would make
 * this the most dangerous button in the app.
 */
export function RescheduleModal({
  session,
  open,
  onClose,
}: {
  session: Session;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const preview = usePreviewReschedule(session.id);
  const reschedule = useReschedule(session.id);

  const [startsAt, setStartsAt] = useState(toLocalInputValue(new Date(session.starts_at)));
  const [impact, setImpact] = useState<RescheduleImpact | null>(null);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setImpact(null);
    setError(null);
    onClose();
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const result = await preview.mutateAsync(new Date(startsAt).toISOString());
      if (result.preview) setImpact(result.impact);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.displayMessage : "We couldn't check that slot.");
    }
  }

  async function confirm() {
    setError(null);

    try {
      await reschedule.mutateAsync({
        startsAt: new Date(startsAt).toISOString(),
        notifyGuests: notify && (impact?.requires_guest_notification ?? false),
      });

      toast(
        notify && impact?.requires_guest_notification
          ? `moved — ${impact.affected_guest_count} guests notified 💗`
          : 'class moved ✨',
      );

      close();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.displayMessage : "We couldn't move that class.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="move this class"
      footer={
        impact ? (
          <>
            <Button variant="secondary" type="button" onClick={() => setImpact(null)}>
              back
            </Button>
            <Button onClick={confirm} loading={reschedule.isPending} loadingLabel="moving…">
              confirm move
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" type="button" onClick={close}>
              cancel
            </Button>
            <Button
              type="submit"
              form="reschedule-form"
              loading={preview.isPending}
              loadingLabel="checking…"
            >
              see what changes
            </Button>
          </>
        )
      }
    >
      {impact ? (
        <div>
          <p className="mb-3 text-sm">
            moving from <b>{formatDateLong(impact.previous_start)}</b> to{' '}
            <b>{formatDateLong(impact.new_start)}</b> at <b>{formatTime(impact.new_start)}</b>.
          </p>

          <ul className="mb-3 grid gap-1.5 text-sm">
            <li>
              <b>{impact.affected_guest_count}</b> guest
              {impact.affected_guest_count === 1 ? '' : 's'} booked in
              {impact.contactable_guest_count < impact.affected_guest_count ? (
                <span className="text-latte">
                  {' '}
                  ({impact.affected_guest_count - impact.contactable_guest_count} can&rsquo;t be
                  messaged — reach them yourself)
                </span>
              ) : null}
            </li>
            <li>
              <b>{impact.deadline_shifts.length}</b> prep deadline
              {impact.deadline_shifts.length === 1 ? '' : 's'} shift with it
            </li>
            {impact.newly_overdue_count > 0 ? (
              <li className="text-danger font-extrabold">
                {impact.newly_overdue_count} step
                {impact.newly_overdue_count === 1 ? '' : 's'} would already be overdue
              </li>
            ) : null}
          </ul>

          {impact.deadline_shifts.length > 0 ? (
            <ul className="border-line text-latte mb-3 grid gap-1 border-t-[1.5px] border-dashed pt-2.5 text-xs">
              {impact.deadline_shifts.map((shift) => (
                <li key={shift.item_id}>
                  {shift.label}: {formatDateLong(shift.previous_deadline)} →{' '}
                  {formatDateLong(shift.new_deadline)}
                </li>
              ))}
            </ul>
          ) : null}

          {impact.requires_guest_notification ? (
            <label className="flex min-h-[44px] items-center gap-2.5 text-sm font-bold">
              <input
                type="checkbox"
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
                className="accent-rose size-6"
              />
              tell the {impact.contactable_guest_count} guests I can reach
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-danger mt-2 text-sm font-extrabold">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <form id="reschedule-form" onSubmit={handlePreview} noValidate>
          <Field label="new date & time" htmlFor="new-starts-at" error={error ?? undefined}>
            <input
              id="new-starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className={inputClasses}
              required
            />
          </Field>

          <p className="text-latte text-xs">
            nothing saves yet — you&rsquo;ll see exactly what changes first.
          </p>
        </form>
      )}
    </Modal>
  );
}
