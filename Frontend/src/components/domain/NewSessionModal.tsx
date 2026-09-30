'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Field, Modal, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import { useClassTypes, useCreateSession } from '@/lib/api/hooks';
import { dayKey } from '@/lib/dates';
import type { ClassType } from '@/lib/api/types';

/**
 * Quick-add (PRD §2.2).
 *
 * "Tapping any blank date launches a lightweight modal." Kept deliberately
 * short — class type, time, seats, optional weekly repeat — because the host
 * is adding a class between other things, not filling in a form.
 *
 * The class types come from `useClassTypes`, which reads the studio's
 * catalogue. They used to be derived from the sessions the calendar had
 * loaded, which meant the dropdown was empty on any week without classes —
 * including the only week a brand-new studio ever sees.
 */

export interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefills the date when opened from a specific calendar day. */
  defaultDate?: Date;
}

/** Local datetime string for `<input type="datetime-local">`. */
export function toLocalInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${dayKey(date)}T${hours}:${minutes}`;
}

/** Durations offered, plus whatever this class type actually runs for. */
export function durationOptions(defaultMinutes: number): number[] {
  const offered = new Set([90, 120, 150, 180, 240, defaultMinutes]);

  return [...offered].filter((minutes) => minutes > 0).sort((a, b) => a - b);
}

export function NewSessionModal({ open, onClose, defaultDate }: NewSessionModalProps) {
  const classTypes = useClassTypes();

  // Unmounted while closed, so the form below always mounts fresh: its state
  // is seeded from `defaultDate` and the loaded catalogue, and a `useState`
  // initialiser only runs on mount. Keeping it mounted is what used to freeze
  // the class type at '' and the date at whatever "now" was on first paint.
  if (!open) return null;

  const options = classTypes.data ?? [];

  if (classTypes.isPending || classTypes.isError || options.length === 0) {
    return (
      <Modal
        open
        onClose={onClose}
        title="New session ✨"
        footer={
          <Button variant="secondary" onClick={onClose} type="button">
            Close
          </Button>
        }
      >
        <p className="text-latte text-sm" role={classTypes.isPending ? undefined : 'alert'}>
          {classTypes.isPending
            ? 'Fetching your class types…'
            : classTypes.isError
              ? "We couldn't load your class types. Try again in a moment?"
              : 'No class types yet — add one in Settings and it will show up here.'}
        </p>
      </Modal>
    );
  }

  return (
    <NewSessionForm
      onClose={onClose}
      defaultDate={defaultDate}
      classTypes={options}
      // A different day is a different form. Remounting reseeds the date
      // rather than leaving yesterday's value in a field the host will not
      // think to check.
      key={defaultDate ? dayKey(defaultDate) : 'today'}
    />
  );
}

function NewSessionForm({
  onClose,
  defaultDate,
  classTypes,
}: {
  onClose: () => void;
  defaultDate?: Date;
  /** Non-empty: the caller has already handled the empty catalogue. */
  classTypes: ClassType[];
}) {
  const { toast, celebrate } = useToast();
  const createSession = useCreateSession();

  const first = classTypes[0]!;
  const start = defaultDate ?? new Date();

  const [classTypeId, setClassTypeId] = useState(first.id);
  const [startsAt, setStartsAt] = useState(toLocalInputValue(start));
  const [durationMinutes, setDurationMinutes] = useState(first.default_duration_minutes);
  const [seats, setSeats] = useState(first.default_seats);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  /**
   * Picking a class type brings its defaults with it.
   *
   * That is what `default_seats` and `default_duration_minutes` are for: the
   * host who picks "Pottery" means the three-hour, eight-seat class they
   * always run, and should not have to correct two fields to say so.
   */
  function selectClassType(id: string) {
    setClassTypeId(id);

    const picked = classTypes.find((type) => type.id === id);
    if (!picked) return;

    setSeats(picked.default_seats);
    setDurationMinutes(picked.default_duration_minutes);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const startDate = new Date(startsAt);

    if (Number.isNaN(startDate.getTime())) {
      toast('That date and time needs a second look.', 'error');
      return;
    }

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
      open
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
        <Field label="Class type" htmlFor="class-type" error={error?.fieldError('class_type_id')}>
          <select
            id="class-type"
            value={classTypeId}
            onChange={(event) => selectClassType(event.target.value)}
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
            {durationOptions(durationMinutes).map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDuration(minutes)}
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

/** "2 hours", "2.5 hours", "90 minutes" — whichever reads cleanly. */
export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  if (minutes % 30 === 0) return `${minutes / 60} hours`;

  return `${minutes} minutes`;
}
