'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { AlertCard } from '@/components/ui/AlertCard';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Field, Modal, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import {
  useGuest,
  useGuestHistory,
  useGuestMessages,
  useOpenDirectRoom,
  useUpdateGuest,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDateLong, formatTime } from '@/lib/dates';
import type { Guest, GuestVisit, MessageChannel, ScheduledMessage } from '@/lib/api/types';

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[clamp(21px,4vw,34px)]">{person.full_name}</h1>
          <MessageGuestButton guestId={guestId} name={person.full_name} />
        </div>

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
            <MemoryNote guest={person} />

            <dl className="mt-4 grid gap-1.5 text-sm">
              <Detail label="Phone" value={person.phone} />
              <Detail label="Email" value={person.email} />
              <Detail
                label="Birthday"
                value={person.birthday ? formatDateLong(person.birthday) : null}
              />
              <Detail label="Reach them on" value={person.preferred_channel} />
            </dl>

            <GuestDetailControls guest={person} />

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

/**
 * Start (or return to) a private thread with this guest.
 *
 * The only way a DM comes into existence. Guests cannot open one themselves —
 * that would put an empty conversation at the top of their list that the host
 * never asked for, and hand every guest a private line to the studio owner
 * whether or not the studio wants that.
 *
 * The call is get-or-create, so a second press reopens the same thread rather
 * than making another.
 */
function MessageGuestButton({ guestId, name }: { guestId: string; name: string }) {
  const router = useRouter();
  const open = useOpenDirectRoom();

  return (
    <button
      type="button"
      disabled={open.isPending}
      onClick={() =>
        open.mutate(guestId, {
          onSuccess: (room) => router.push(`/chat?room=${room.id}`),
        })
      }
      aria-label={`Message ${name} privately`}
      className={cn(
        'text-on-rose inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-pill)] px-4 font-extrabold',
        'bg-[image:var(--chat-bubble-you)] shadow-[var(--chat-bubble-shadow)]',
        'transition-transform duration-150 [transition-timing-function:var(--ease-spring)]',
        'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-cocoa focus-visible:outline-[3px] focus-visible:outline-offset-2',
        'disabled:opacity-60',
      )}
    >
      <span aria-hidden="true">✿</span>
      {open.isPending ? 'Opening…' : 'Message'}
    </button>
  );
}

/**
 * The memory note, editable in place.
 *
 * The headline of the mini-CRM — "came with her sister; loved the matcha
 * buttercream" — used to be typeable only in the add-a-guest modal and
 * read-only forever after, so a host who learned something at the class had
 * nowhere to write it down.
 */
function MemoryNote({ guest }: { guest: Guest }) {
  const { toast } = useToast();
  const update = useUpdateGuest(guest.id);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guest.memory_note ?? '');

  async function save() {
    const next = draft.trim() || null;

    if (next === (guest.memory_note ?? null)) {
      setEditing(false);
      return;
    }

    try {
      await update.mutateAsync({ memory_note: next });
      setEditing(false);
    } catch (caught) {
      toast(
        caught instanceof ApiError ? caught.displayMessage : "We couldn't save that note.",
        'error',
      );
    }
  }

  if (!editing) {
    return (
      <>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <Eyebrow className="mb-0">Remember</Eyebrow>
          <button
            type="button"
            onClick={() => {
              setDraft(guest.memory_note ?? '');
              setEditing(true);
            }}
            className="text-latte min-h-[44px] text-xs font-extrabold underline decoration-dotted"
          >
            {guest.memory_note ? 'Edit' : 'Add a note'}
          </button>
        </div>

        {guest.memory_note ? (
          <p className="text-[15px]">
            <HandNote>{guest.memory_note}</HandNote>
          </p>
        ) : (
          <p className="text-latte text-sm">
            Nothing noted yet — add something you&rsquo;d want to remember at the door.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <Eyebrow>Remember</Eyebrow>
      <label className="sr-only" htmlFor={`note-${guest.id}`}>
        What to remember about {guest.full_name}
      </label>
      <textarea
        id={`note-${guest.id}`}
        value={draft}
        rows={3}
        maxLength={2000}
        disabled={update.isPending}
        onChange={(event) => setDraft(event.target.value)}
        className="border-line bg-buttercream text-cocoa w-full rounded-[var(--radius-sm)] border-[1.5px] p-3 text-[15px]"
        placeholder="Came with her sister; loved the matcha buttercream"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save()} loading={update.isPending}>
          Save
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </>
  );
}

/** The opt-out switch and the details editor, neither of which existed. */
function GuestDetailControls({ guest }: { guest: Guest }) {
  const { toast } = useToast();
  const update = useUpdateGuest(guest.id);
  const [editing, setEditing] = useState(false);

  async function toggleOptOut(optedOut: boolean) {
    try {
      await update.mutateAsync({ opted_out: optedOut });
      toast(optedOut ? 'They won&rsquo;t be messaged again ♡' : 'messages back on ✨');
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.displayMessage : "We couldn't save that.", 'error');
    }
  }

  return (
    <>
      <label className="border-line mt-3 flex min-h-[44px] items-center justify-between gap-3 border-t-[1.5px] border-dashed pt-2 text-[13.5px] font-bold">
        Opted out of messages
        <input
          type="checkbox"
          checked={guest.opted_out}
          disabled={update.isPending}
          onChange={(event) => void toggleOptOut(event.target.checked)}
          className="accent-rose size-6"
        />
      </label>

      <Button variant="secondary" size="sm" className="mt-2" onClick={() => setEditing(true)}>
        Edit details
      </Button>

      {editing ? <EditGuestModal guest={guest} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

const CHANNELS: { id: MessageChannel; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms', label: 'SMS' },
  { id: 'email', label: 'Email' },
];

/**
 * Correct a guest's details.
 *
 * Mounted only while open, so its state is seeded from the guest it is
 * actually editing rather than from whoever was on screen first.
 */
function EditGuestModal({ guest, onClose }: { guest: Guest; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateGuest(guest.id);

  const [fullName, setFullName] = useState(guest.full_name);
  const [phone, setPhone] = useState(guest.phone ?? '');
  const [email, setEmail] = useState(guest.email ?? '');
  const [channel, setChannel] = useState<MessageChannel>(guest.preferred_channel);
  const [birthday, setBirthday] = useState(guest.birthday ?? '');
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      // Every field is sent, including the blanks: an explicit null is how a
      // wrong email or a wrong birthday gets cleared rather than kept.
      await update.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        preferred_channel: channel,
        birthday: birthday || null,
      });

      toast('saved ✨');
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
        return;
      }

      toast("We couldn't save that. Try again?", 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${guest.full_name}`}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-guest" loading={update.isPending} loadingLabel="Saving…">
            Save
          </Button>
        </>
      }
    >
      <form id="edit-guest" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="edit-name" error={error?.fieldError('full_name')}>
          <input
            id="edit-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className={inputClasses}
            required
          />
        </Field>

        <Field
          label="Phone"
          htmlFor="edit-phone"
          hint="Leave empty to remove it"
          error={error?.fieldError('phone')}
        >
          <input
            id="edit-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={inputClasses}
          />
        </Field>

        <Field
          label="Email"
          htmlFor="edit-email"
          hint="Leave empty to remove it"
          error={error?.fieldError('email')}
        >
          <input
            id="edit-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClasses}
          />
        </Field>

        <Field label="Reach them on" htmlFor="edit-channel">
          <select
            id="edit-channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value as MessageChannel)}
            className={inputClasses}
          >
            {CHANNELS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Birthday" htmlFor="edit-birthday" error={error?.fieldError('birthday')}>
          <input
            id="edit-birthday"
            type="date"
            value={birthday}
            onChange={(event) => setBirthday(event.target.value)}
            className={inputClasses}
          />
        </Field>

        {error && error.fields.length === 0 ? (
          <p role="alert" className="text-danger mt-2 text-sm font-extrabold">
            {error.displayMessage}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
