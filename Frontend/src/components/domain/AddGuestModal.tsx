'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Field, Modal, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import { useCreateGuest } from '@/lib/api/hooks';
import type { Guest, MessageChannel } from '@/lib/api/types';

/**
 * Add a guest (PRD §2.4).
 *
 * A name alone is enough — hosts add people from DMs and phone calls, and
 * refusing that would push them back to the notes app this replaces.
 *
 * A duplicate comes back as a 409 rather than merging silently. Merging
 * blends allergy records, so the host decides; this offers the choice in
 * place instead of making them start over.
 */

export interface AddGuestModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created (or merged) guest, e.g. to book them straight in. */
  onCreated?: (guest: Guest) => void;
}

const CHANNELS: { id: MessageChannel; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms', label: 'SMS' },
  { id: 'email', label: 'Email' },
];

export function AddGuestModal({ open, onClose, onCreated }: AddGuestModalProps) {
  const { toast } = useToast();
  const createGuest = useCreateGuest();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState<MessageChannel>('whatsapp');
  const [birthday, setBirthday] = useState('');
  const [memoryNote, setMemoryNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  function reset() {
    setFullName('');
    setPhone('');
    setEmail('');
    setChannel('whatsapp');
    setBirthday('');
    setMemoryNote('');
    setError(null);
    setDuplicate(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit(merge: boolean) {
    setError(null);

    try {
      const guest = await createGuest.mutateAsync({
        body: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          preferred_channel: channel,
          birthday: birthday || null,
          memory_note: memoryNote.trim() || null,
        },
        merge,
      });

      toast(merge ? 'added to their history 💗' : 'guest added ✨');
      onCreated?.(guest);
      close();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === 'duplicate_guest') {
          // Offer the merge in place rather than making them start over.
          setDuplicate(caught.displayMessage);
          return;
        }

        setError(caught);
        return;
      }

      toast("We couldn't add that guest. Try again?", 'error');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(false);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a guest 💌"
      footer={
        duplicate ? (
          <>
            <Button variant="secondary" type="button" onClick={() => setDuplicate(null)}>
              Edit details
            </Button>
            <Button
              onClick={() => void submit(true)}
              loading={createGuest.isPending}
              loadingLabel="Merging…"
            >
              Add to their history
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" type="button" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-guest"
              loading={createGuest.isPending}
              loadingLabel="Adding…"
            >
              Add guest
            </Button>
          </>
        )
      }
    >
      {duplicate ? (
        <div role="alert">
          <p className="text-sm font-bold">{duplicate}</p>
          <p className="text-latte mt-2 text-sm">
            Adding to their history keeps their visits, notes and allergies in one place.
          </p>
        </div>
      ) : (
        <form id="add-guest" onSubmit={handleSubmit} noValidate>
          <Field
            label="Name"
            htmlFor="guest-name"
            hint="A name on its own is enough to start"
            error={error?.fieldError('full_name')}
          >
            <input
              id="guest-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={inputClasses}
              autoComplete="name"
              required
            />
          </Field>

          <Field label="Phone" htmlFor="guest-phone" error={error?.fieldError('phone')}>
            <input
              id="guest-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClasses}
              autoComplete="tel"
            />
          </Field>

          <Field label="Email" htmlFor="guest-email" error={error?.fieldError('email')}>
            <input
              id="guest-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClasses}
              autoComplete="email"
            />
          </Field>

          <Field
            label="Reach them on"
            htmlFor="guest-channel"
            error={error?.fieldError('preferred_channel')}
          >
            <select
              id="guest-channel"
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

          <Field
            label="Birthday"
            htmlFor="guest-birthday"
            hint="Optional — powers the birthday radar"
          >
            <input
              id="guest-birthday"
              type="date"
              value={birthday}
              onChange={(event) => setBirthday(event.target.value)}
              className={inputClasses}
            />
          </Field>

          <Field
            label="A note to remember them by"
            htmlFor="guest-note"
            hint="&ldquo;came with her sister; loved the matcha buttercream&rdquo;"
          >
            <textarea
              id="guest-note"
              value={memoryNote}
              onChange={(event) => setMemoryNote(event.target.value)}
              rows={2}
              className={`${inputClasses} py-2.5`}
            />
          </Field>

          {error && error.fields.length === 0 ? (
            <p role="alert" className="text-danger mt-2 text-sm font-extrabold">
              {error.displayMessage}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
