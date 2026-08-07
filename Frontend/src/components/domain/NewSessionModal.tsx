'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Field, Modal, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import { useCreateSession } from '@/lib/api/hooks';
import { dayKey } from '@/lib/dates';
import type { Session } from '@/lib/api/types';

/**
 * Quick-add (PRD §2.2).
 *
 * "Tapping any blank date launches a lightweight modal." Kept deliberately
 * short — class type, time, seats, optional weekly repeat — because the host
 * is adding a class between other things, not filling in a form.
 */

export interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefills the date when opened from a specific calendar day. */
  defaultDate?: Date;
  classTypes: { id: string; name: string }[];
}

/** Local datetime string for `<input type="datetime-local">`. */
export function toLocalInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${dayKey(date)}T${hours}:${minutes}`;
}

export function NewSessionModal({ open, onClose, defaultDate, classTypes }: NewSessionModalProps) {
  const { toast, celebrate } = useToast();
  const createSession = useCreateSession();

  const start = defaultDate ?? new Date();
  const [classTypeId, setClassTypeId] = useState(classTypes[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInputValue(start));
  const [durationMinutes, setDurationMinutes] = useState(150);
  const [seats, setSeats] = useState(10);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const startDate = new Date(startsAt);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);

    try {
      const result = await createSession.mutateAsync({
        class_type_id: classTypeId,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        seats,
        repeat_weekly_until: repeatUntil ? new Date(repeatUntil).toISOString() : null,
      });

      const count = result.sessions.length;
      celebrate(count > 1 ? `${count} classes added ✨` : 'session added — checklist created ✨');

      // Advisory only: the class is already saved. The system cares, it does
      // not control (PRD §2.2).
      if (result.energy.warning !== 'none') {
        setTimeout(() => toast(result.energy.message), 400);
      }

      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
        return;
      }

      toast("We couldn't add that class. Try again?", 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New session ✨"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-session"
            loading={createSession.isPending}
            loadingLabel="Adding…"
          >
            Add session
          </Button>
        </>
      }
    >
      <form id="new-session" onSubmit={handleSubmit} noValidate>
        <Field label="Class type" htmlFor="class-type">
          <select
            id="class-type"
            value={classTypeId}
            onChange={(event) => setClassTypeId(event.target.value)}
            className={inputClasses}
            required
          >
            {classTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Date & time"
          htmlFor="starts-at"
          error={error?.fieldError('starts_at') ?? error?.fieldError('ends_at')}
        >
          <input
            id="starts-at"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={inputClasses}
            required
          />
        </Field>

        <Field label="How long" htmlFor="duration">
          <select
            id="duration"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className={inputClasses}
          >
            {[90, 120, 150, 180, 240].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes / 60} hours
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Seats"
          htmlFor="seats"
          hint="The checklist scales its quantities to match"
          error={error?.fieldError('seats')}
        >
          <input
            id="seats"
            type="number"
            min={0}
            max={200}
            value={seats}
            onChange={(event) => setSeats(Number(event.target.value))}
            className={inputClasses}
            required
          />
        </Field>

        <Field
          label="Repeat weekly until"
          htmlFor="repeat-until"
          hint="Leave empty for a one-off"
          error={error?.fieldError('repeat_weekly_until')}
        >
          <input
            id="repeat-until"
            type="date"
            value={repeatUntil}
            onChange={(event) => setRepeatUntil(event.target.value)}
            className={inputClasses}
          />
        </Field>

        {/* A message the field-level errors did not already explain. */}
        {error && error.fields.length === 0 ? (
          <p role="alert" className="text-danger mt-2 text-sm font-extrabold">
            {error.displayMessage}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/** Class types, derived from the sessions already loaded. */
export function classTypesFrom(sessions: Session[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();

  for (const session of sessions) {
    if (!seen.has(session.class_type_id)) {
      seen.set(session.class_type_id, session.class_type_name);
    }
  }

  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}
