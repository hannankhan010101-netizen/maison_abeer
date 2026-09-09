'use client';

import { useEffect, useId, useRef, useState } from 'react';

import {
  BookingError,
  fetchClasses,
  submitBooking,
  type BookingResult,
  type PublicClass,
  type PublicClassList,
} from '@/lib/public/api';
import { cn } from '@/lib/cn';

/**
 * The guest-facing booking flow.
 *
 * Someone reaches this from an ad, on a phone, with no account and no
 * patience. Every decision below follows from that:
 *
 * * **Three screens, one job each** — pick, fill, done. A single long page
 *   asks a stranger to commit before they know what they are committing to.
 * * **Four fields, one required.** Name plus one way to be reached. Everything
 *   else is optional and says so, because each extra required field costs
 *   completions.
 * * **A full class is not a dead end.** It offers the waitlist in the same tap.
 * * **Focus moves with the step** and each step announces itself, so this
 *   works on a screen reader rather than merely passing a colour check.
 * * **No layout shift on submit** — the button keeps its size and swaps its
 *   label, so a slow connection does not move the tap target.
 */

function useMountedNow(): Date | null {
  // Rendering a date on the server and again on the client produces a
  // hydration mismatch the moment the two clocks disagree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  return now;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Scarcity, honestly stated. Never invented — it is the real seat count. */
function seatCopy(item: PublicClass): { text: string; urgent: boolean } {
  if (item.is_full) return { text: 'Fully booked · join the waitlist', urgent: false };
  if (item.seats_left === 1) return { text: 'Last seat!', urgent: true };
  if (item.seats_left <= 3) return { text: `Only ${item.seats_left} seats left`, urgent: true };
  return { text: `${item.seats_left} seats left`, urgent: false };
}

export interface BookingFlowProps {
  slug: string;
}

export function BookingFlow({ slug }: BookingFlowProps) {
  const [data, setData] = useState<PublicClassList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PublicClass | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchClasses(slug, controller.signal)
      .then(setData)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof BookingError
            ? error.message
            : 'We could not load the classes. Please refresh.',
        );
      });

    return () => controller.abort();
  }, [slug]);

  if (loadError) {
    return (
      <Shell>
        <p role="alert" className="text-danger text-center font-bold">
          {loadError}
        </p>
      </Shell>
    );
  }

  if (!data) return <Shell>{<LoadingClasses />}</Shell>;

  if (result) {
    return (
      <Shell studioName={data.studio.name} handle={data.studio.instagram_handle}>
        <Confirmation result={result} />
      </Shell>
    );
  }

  if (chosen) {
    return (
      <Shell studioName={data.studio.name} handle={data.studio.instagram_handle}>
        <DetailsStep slug={slug} item={chosen} onBack={() => setChosen(null)} onDone={setResult} />
      </Shell>
    );
  }

  return (
    <Shell studioName={data.studio.name} handle={data.studio.instagram_handle}>
      <ClassPicker classes={data.classes} onPick={setChosen} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function Shell({
  children,
  studioName,
  handle,
}: {
  children: React.ReactNode;
  studioName?: string;
  handle?: string | null;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-[560px] px-4 py-8 sm:px-6 sm:py-12">
      {studioName ? (
        <header className="mb-6 text-center">
          <h1 className="font-display text-[clamp(28px,7vw,38px)] leading-tight">{studioName}</h1>
          <p className="font-hand text-latte text-lg">Come make something with us ♡</p>
        </header>
      ) : null}

      {children}

      {handle ? (
        <p className="text-latte mt-8 text-center text-sm">
          Find us on Instagram <b>@{handle}</b>
        </p>
      ) : null}
    </main>
  );
}

function LoadingClasses() {
  return (
    <div aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading classes</span>
      <ul className="grid gap-3">
        {[0, 1, 2].map((key) => (
          <li
            key={key}
            className="border-line bg-blush/40 h-28 animate-pulse rounded-[var(--radius-md)] border-[1.5px] motion-reduce:animate-none"
          />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — pick a class
// ---------------------------------------------------------------------------

function ClassPicker({
  classes,
  onPick,
}: {
  classes: PublicClass[];
  onPick: (item: PublicClass) => void;
}) {
  const now = useMountedNow();

  if (classes.length === 0) {
    return (
      <div className="border-line bg-paper rounded-[var(--radius-lg)] border-[1.5px] p-6 text-center">
        <p className="font-display text-xl">No classes open right now</p>
        <p className="text-latte mt-1 text-sm">
          New dates go up often — follow along and you&rsquo;ll catch the next one.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="pick-heading">
      <h2 id="pick-heading" className="font-display mb-3 text-xl">
        Pick your class
      </h2>

      <ul className="grid gap-3">
        {classes.map((item) => {
          const seats = seatCopy(item);

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className={cn(
                  'border-line bg-paper w-full rounded-[var(--radius-md)] border-[1.5px]',
                  'min-h-[44px] p-4 text-left transition-transform',
                  'hover:border-rose hover:-translate-y-0.5 motion-reduce:transform-none',
                  'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
                )}
              >
                <span className="font-display block text-lg">{item.name}</span>

                {/* suppressHydrationWarning: the date is formatted in the
                    visitor's locale, which the server cannot know. */}
                <span className="text-cocoa mt-0.5 block text-sm" suppressHydrationWarning>
                  {now ? `${formatDay(item.starts_at)} · ${formatTime(item.starts_at)}` : ' '}
                </span>

                {item.location ? (
                  <span className="text-latte block text-sm">{item.location}</span>
                ) : null}

                <span
                  className={cn(
                    'mt-2 inline-block rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold',
                    item.is_full
                      ? 'bg-butter-soft text-butter-ink'
                      : seats.urgent
                        ? 'bg-blush text-rose-ink'
                        : 'bg-sage-soft text-sage-ink',
                  )}
                >
                  {seats.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — your details
// ---------------------------------------------------------------------------

function DetailsStep({
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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<'name' | 'contact' | null>(null);

  // Moving focus is what makes this a step rather than a silent swap.
  useEffect(() => headingRef.current?.focus(), []);

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

      <div className="border-line bg-buttercream mb-4 rounded-[var(--radius-md)] border-[1.5px] p-3.5">
        <b className="font-display block text-lg">{item.name}</b>
        <span className="text-latte block text-sm" suppressHydrationWarning>
          {now ? `${formatDay(item.starts_at)} · ${formatTime(item.starts_at)}` : ' '}
        </span>
        {item.is_full ? (
          <span className="bg-butter-soft text-butter-ink mt-2 inline-block rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold">
            Fully booked — you&rsquo;ll join the waitlist
          </span>
        ) : null}
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
          autoComplete="name"
          required
          invalid={fieldError === 'name'}
        />

        <Field
          id={`${ids}-phone`}
          name="phone"
          label="Phone (WhatsApp)"
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
          hint="Optional — but please do tell us, we take it seriously"
        />

        <Field
          id={`${ids}-note`}
          name="note"
          label="Anything fun we should put on your name tag?"
          hint="Optional — a flavour, a nickname, whatever you like"
        />

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
          className="text-danger text-sm font-bold empty:hidden"
        >
          {error}
        </p>

        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'bg-rose text-on-rose min-h-[48px] rounded-[var(--radius-pill)]',
            'px-5 text-base font-extrabold shadow-[var(--shadow-soft)]',
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

function Field({
  id,
  name,
  label,
  hint,
  invalid,
  required,
  ...input
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  invalid?: boolean;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-extrabold">
        {label}
        {required ? null : <span className="text-latte font-normal"> · optional</span>}
      </label>

      {hint ? (
        <p id={hintId} className="text-latte mb-1 text-xs">
          {hint}
        </p>
      ) : null}

      <input
        {...input}
        id={id}
        name={name}
        aria-describedby={hintId}
        aria-invalid={invalid || undefined}
        className={cn(
          'bg-paper text-cocoa min-h-[48px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3',
          'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
          invalid ? 'border-danger' : 'border-line',
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — done
// ---------------------------------------------------------------------------

function Confirmation({ result }: { result: BookingResult }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useMountedNow();

  useEffect(() => headingRef.current?.focus(), []);

  const waitlisted = result.outcome === 'waitlisted';
  const token = result.portal_token;
  const tokenType = result.portal_token_type;

  return (
    <section className="text-center" aria-live="polite">
      <p className="text-5xl" aria-hidden="true">
        {waitlisted ? '💌' : '🎀'}
      </p>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display mt-2 text-[clamp(24px,6vw,30px)] outline-none"
      >
        {/* A real apostrophe, not an entity: this is a JS string, so `&rsquo;`
            would render as those eight characters. */}
        {waitlisted ? 'You’re on the list' : 'You’re in!'}
      </h2>

      <p className="text-cocoa mt-2">
        <b>{result.class_name}</b>
        <br />
        <span suppressHydrationWarning>
          {now ? `${formatDay(result.starts_at)} · ${formatTime(result.starts_at)}` : ' '}
        </span>
        {result.location ? (
          <>
            <br />
            {result.location}
          </>
        ) : null}
      </p>

      {waitlisted ? (
        <p className="text-latte mx-auto mt-4 max-w-[38ch] text-sm">
          You&rsquo;re number <b>{result.waitlist_position}</b> in the queue. If a seat opens up
          we&rsquo;ll message you straight away — no need to check back.
        </p>
      ) : (
        <p className="text-latte mx-auto mt-4 max-w-[38ch] text-sm">
          We&rsquo;ll send you a reminder the day before with everything you need. Just bring
          yourself — aprons are on us.
        </p>
      )}

      {token && tokenType ? (
        <PortalHandoff token={token} tokenType={tokenType} waitlisted={waitlisted} />
      ) : (
        <p className="font-hand text-latte mt-5 text-lg">Can&rsquo;t wait to see you ♡</p>
      )}
    </section>
  );
}

/**
 * The way in.
 *
 * Until now the confirmation screen was where a guest and this app said
 * goodbye. One tap here signs them in instead — no password to invent, no
 * inbox to go and find, because the token came back with the booking itself.
 *
 * It is single-use, so there is exactly one attempt. That shapes everything:
 * the button disables on press (a double-tap would spend the token and then
 * fail on its own retry), and failure offers the login page rather than a
 * "try again" that cannot work.
 */
function PortalHandoff({
  token,
  tokenType,
  waitlisted,
}: {
  token: string;
  tokenType: 'signup' | 'magiclink';
  waitlisted: boolean;
}) {
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');

  async function open() {
    setState('opening');

    const { redeemPortalToken } = await import('@/lib/supabase/client');

    if (await redeemPortalToken(token, tokenType)) {
      // A hard navigation, not a router push. The session was just written to
      // a cookie, and the portal is server-rendered behind middleware that
      // reads it — a client transition can outrun that and land on /login.
      window.location.assign('/portal');
      return;
    }

    setState('failed');
  }

  if (state === 'failed') {
    return (
      <div className="mt-6">
        <p role="alert" className="text-latte mx-auto max-w-[38ch] text-sm">
          We couldn&rsquo;t open your portal just now — but your{' '}
          {waitlisted ? 'place in the queue' : 'seat'} is saved and safe.
        </p>
        <a
          href="/login"
          className="text-rose-ink mt-2 inline-flex min-h-[44px] items-center font-extrabold underline"
        >
          Try signing in instead
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => void open()}
        disabled={state === 'opening'}
        className={cn(
          'bg-pink text-on-pink inline-flex min-h-[52px] w-full max-w-[320px] items-center justify-center',
          'rounded-[var(--radius-pill)] px-6 text-[17px] font-extrabold',
          'shadow-[var(--shadow-soft)] transition-transform motion-reduce:transition-none',
          'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
          'active:scale-[0.98] disabled:opacity-70',
        )}
      >
        {state === 'opening' ? 'Opening…' : 'Open my portal ✨'}
      </button>

      <p className="text-latte mx-auto mt-3 max-w-[38ch] text-sm">
        See who else is coming{waitlisted ? ' and keep an eye on your spot' : ''} — and say hi 👋
      </p>
    </div>
  );
}
