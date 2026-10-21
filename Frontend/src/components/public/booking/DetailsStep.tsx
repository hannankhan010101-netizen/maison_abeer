'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { DateLeaf } from '@/components/public/DateLeaf';
import { Field } from '@/components/public/booking/Field';
import { cn } from '@/lib/cn';
import {
  BookingError,
  type BookingResult,
  type PublicClass,
  submitBooking,
} from '@/lib/public/api';
import { accentFor, formatDay, formatTime } from '@/lib/public/bookingCopy';
import { useMountedNow } from '@/lib/public/useMountedNow';
import '@/styles/units/booking.css';

// The same name ClassPicker puts on the picked card's leaf; the browser flies one to the other.
const CLASS_LEAF = 'class-leaf';

// ---------------------------------------------------------------------------
// Step 2 — your details
// ---------------------------------------------------------------------------

export function DetailsStep({
  slug,
  item,
  onBack,
  onDone,
}: {
  slug: string;
  item: PublicClass;
  onBack: () => void;
  onDone: (result: BookingResult) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useMountedNow();
  const ids = useId();
  const noteWrapRef = useRef<HTMLDivElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<'name' | 'contact' | null>(null);

  // Moving focus is what makes this a step rather than a silent swap.
  useEffect(() => headingRef.current?.focus(), []);

  // Opening moves focus into the field, or a screen-reader user would be left on the button.
  useEffect(() => {
    if (noteOpen) noteWrapRef.current?.querySelector('input')?.focus();
  }, [noteOpen]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get('full_name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();

    // Validated here as well as server-side so a mistake costs a glance
    // rather than a round trip on a phone connection.
    if (!fullName) {
      setFieldError('name');
      setError('Please tell us your name.');
      return;
    }

    if (!phone && !email) {
      setFieldError('contact');
      setError('Please leave a phone number or an email so we can reach you.');
      return;
    }

    setSubmitting(true);

    try {
      onDone(
        await submitBooking(slug, item.id, {
          full_name: fullName,
          phone: phone || null,
          email: email || null,
          allergies: String(form.get('allergies') ?? '').trim() || null,
          note: String(form.get('note') ?? '').trim() || null,
          website: String(form.get('website') ?? ''),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof BookingError
          ? caught.message
          : 'We could not save that. Please try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby={`${ids}-heading`}>
      <button
        type="button"
        onClick={onBack}
        className="text-rose-ink mb-3 min-h-[44px] text-sm font-extrabold"
      >
        ← Pick a different class
      </button>

      {/* What they picked, as the stub of the ticket they are filling in. */}
      <div className="border-line bg-buttercream relative mb-4 flex items-center gap-3.5 overflow-hidden rounded-[var(--radius-md)] border-[1.5px] p-3.5 pl-5">
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0 w-1.5', accentFor(item.color_token).bar)}
        />
        <span className="flex" style={{ viewTransitionName: CLASS_LEAF }}>
          <DateLeaf iso={item.starts_at} token={item.color_token} ready={now !== null} />
        </span>
        <div className="min-w-0">
          <b className="font-display block text-lg leading-tight">{item.name}</b>
          <span className="text-latte block text-sm" suppressHydrationWarning>
            {now ? `${formatDay(item.starts_at)} · ${formatTime(item.starts_at)}` : ' '}
          </span>
          {item.is_full ? (
            <span className="bg-butter-soft text-butter-ink mt-2 inline-block rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold">
              Fully booked — you&rsquo;ll join the waitlist
            </span>
          ) : null}
        </div>
      </div>

      <h2
        id={`${ids}-heading`}
        ref={headingRef}
        tabIndex={-1}
        className="font-display mb-3 text-xl outline-none"
      >
        Your details
      </h2>

      <form onSubmit={onSubmit} noValidate className="grid gap-3.5">
        <Field
          id={`${ids}-name`}
          name="full_name"
          label="Your name"
          icon="user"
          autoComplete="name"
          required
          invalid={fieldError === 'name'}
        />

        <Field
          id={`${ids}-phone`}
          name="phone"
          label="Phone (WhatsApp)"
          icon="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="So we can send you the reminder"
          invalid={fieldError === 'contact'}
        />

        <Field
          id={`${ids}-email`}
          name="email"
          label="Email"
          icon="mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint="Optional if you left a phone number"
          invalid={fieldError === 'contact'}
        />

        <Field
          id={`${ids}-allergies`}
          name="allergies"
          label="Any allergies we should know about?"
          icon="heart"
          hint="Optional — but please do tell us, we take it seriously"
        />

        {/* Only the fun, optional note is folded away. The allergies field above
            is safety-critical and never hides. The field stays mounted (merely
            `hidden`) so a typed value survives closing it and is still sent. */}
        <div>
          <button
            type="button"
            aria-expanded={noteOpen}
            aria-controls={`${ids}-note-wrap`}
            onClick={() => setNoteOpen((open) => !open)}
            className="text-rose-ink focus-visible:outline-rose flex min-h-[44px] items-center gap-2 text-sm font-extrabold focus-visible:outline-[3px] focus-visible:outline-offset-2"
          >
            <span aria-hidden="true">{noteOpen ? '−' : '+'}</span>
            Anything fun for your name tag?
          </button>

          <div id={`${ids}-note-wrap`} ref={noteWrapRef} hidden={!noteOpen} className="mt-1">
            <Field
              id={`${ids}-note`}
              name="note"
              label="Anything fun we should put on your name tag?"
              icon="sparkle"
              hint="Optional — a flavour, a nickname, whatever you like"
            />
          </div>
        </div>

        {/* Honeypot. Hidden from sight and from the accessibility tree, and
            skipped by tabbing, so no human ever reaches it. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={`${ids}-website`}>Leave this empty</label>
          <input
            id={`${ids}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Assertive: this is the response to an action the guest just took. */}
        <p
          role="alert"
          aria-live="assertive"
          className="text-danger animate-rise-in text-sm font-bold empty:hidden"
        >
          {error}
        </p>

        <button
          type="submit"
          disabled={submitting}
          style={{ '--clay-glow': 'var(--color-rose)' } as CSSProperties}
          className={cn(
            'clay sheen-on-hover bg-rose text-on-rose relative min-h-[52px] overflow-hidden rounded-[var(--radius-pill)]',
            'px-5 text-base font-extrabold',
            'motion-reduce:transform-none',
            'focus-visible:outline-cocoa focus-visible:outline-[3px] focus-visible:outline-offset-2',
            'disabled:opacity-70',
          )}
        >
          {submitting ? 'Saving…' : item.is_full ? 'Join the waitlist' : 'Book my spot'}
        </button>

        <p className="text-latte text-center text-xs">
          We&rsquo;ll only use your details to contact you about this class.
        </p>
      </form>
    </section>
  );
}
