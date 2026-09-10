'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { BookingHero } from '@/components/public/BookingHero';
import { BookingPostcard } from '@/components/public/BookingPostcard';
import { CraftStrip } from '@/components/public/CraftStrip';
import {
  BookingError,
  fetchClasses,
  submitBooking,
  type BookingResult,
  type PublicClass,
  type PublicClassList,
} from '@/lib/public/api';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';
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
 * * **The hero is décor, never a gate.** It draws before the booking widget
 *   is even requested, and every animated pixel in it is optional weight —
 *   see `BookingHero` for exactly how that's enforced.
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

/**
 * The class-type colour system, ported from the admin app: pink is bento
 * cake, terracotta is pottery, sage is ceramic painting. Load-bearing there,
 * decorative here — but reusing it is what makes a class card look like it
 * belongs to this studio rather than a generic booking widget.
 */
// Written as complete, literal class strings — Tailwind's build-time scanner
// finds classes by grepping source text, so constructing one by string
// concatenation or `.replace()` at runtime produces a class no CSS is ever
// generated for. The hover variant has to be spelled out here rather than
// derived from `glow`.
const ACCENT: Record<string, { bar: string; hoverGlow: string }> = {
  pink: {
    bar: 'bg-pink',
    hoverGlow: 'hover:shadow-[0_0_0_1px_var(--color-pink),0_12px_28px_-16px_var(--color-pink)]',
  },
  terra: {
    bar: 'bg-terra',
    hoverGlow: 'hover:shadow-[0_0_0_1px_var(--color-terra),0_12px_28px_-16px_var(--color-terra)]',
  },
  sage: {
    bar: 'bg-sage',
    hoverGlow: 'hover:shadow-[0_0_0_1px_var(--color-sage),0_12px_28px_-16px_var(--color-sage)]',
  },
};

function accentFor(token: string) {
  return ACCENT[token] ?? ACCENT.pink!;
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

  const step = result ? 3 : chosen ? 2 : 1;

  return (
    <Shell
      studioName={data.studio.name}
      handle={data.studio.instagram_handle}
      primaryColor={data.studio.primary_color}
      accentColor={data.studio.accent_color}
      heroPhotoUrl={data.studio.hero_photo_url}
      story={data.studio.story}
      step={step}
      // The brand strip and postcard are the arrival experience — once a
      // guest has committed to a class or finished booking, the page's job
      // narrows to "get this done," so they step aside rather than compete
      // with the form for attention.
      showBrandSections={step === 1}
      classes={data.classes}
    >
      {result ? (
        <Confirmation result={result} />
      ) : chosen ? (
        <DetailsStep slug={slug} item={chosen} onBack={() => setChosen(null)} onDone={setResult} />
      ) : (
        <ClassPicker classes={data.classes} onPick={setChosen} />
      )}
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
  primaryColor,
  accentColor,
  heroPhotoUrl,
  story,
  step,
  showBrandSections,
  classes,
}: {
  children: React.ReactNode;
  studioName?: string;
  handle?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  heroPhotoUrl?: string | null;
  story?: string | null;
  step?: 1 | 2 | 3;
  showBrandSections?: boolean;
  classes?: PublicClass[];
}) {
  const brandSections = Boolean(showBrandSections && classes && classes.length > 0);

  return (
    <main id="main" className="bg-buttercream min-h-screen">
      {studioName ? (
        <BookingHero
          studioName={studioName}
          handle={handle}
          primaryColor={primaryColor}
          accentColor={accentColor}
          heroPhotoUrl={heroPhotoUrl}
        />
      ) : null}

      {/* The brand strip and postcard overlap the hero's rounded bottom
          edge the same way the widget card used to on its own — laid on
          top of the scene, not starting a new page beneath it. */}
      {brandSections ? (
        <div className="relative z-10 -mt-8 space-y-7 pb-2 sm:-mt-10">
          {story ? <StorySection story={story} /> : null}
          <CraftStrip classes={classes!} />
          <BookingPostcard classes={classes!} />
        </div>
      ) : null}

      <div
        className={cn(
          'mx-auto w-full max-w-[560px] px-4 sm:px-6',
          !studioName && 'py-8 sm:py-12',
          studioName && !brandSections && '-mt-8 pb-14 sm:-mt-10',
          studioName && brandSections && 'mt-6 pb-14 sm:mt-8',
        )}
      >
        <div
          className={cn(
            'border-line bg-paper relative rounded-[var(--radius-lg)] border-[1.5px] p-5 sm:p-7',
            studioName && 'shadow-[0_24px_48px_-24px_rgb(64_48_42_/25%)]',
          )}
        >
          {step ? <StepDots current={step} /> : null}
          {/* Re-keyed per step: picking a class, filling the form, and
              landing on the confirmation are three different screens
              wearing one card. Without this the swap between them is
              instant and flat; the key forces React to remount the whole
              subtree so the same rise-in used everywhere else on this page
              plays here too, making the step change read as a deliberate
              transition rather than a layout jump. */}
          <div key={step} className="animate-rise-in">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

function StepDots({ current }: { current: 1 | 2 | 3 }) {
  const labels = ['Pick a class', 'Your details', 'Confirmed'];

  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={3}
      aria-label={`Step ${current} of 3: ${labels[current - 1]}`}
      className="mb-5 flex items-center justify-center gap-2"
    >
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn(
            'h-2 rounded-[var(--radius-pill)] transition-[width,background-color] duration-300',
            n === current ? 'bg-rose w-7' : n < current ? 'bg-rose/50 w-2' : 'bg-blush w-2',
          )}
        />
      ))}
    </div>
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

/**
 * "What happens here" — the studio's own words, when they've written any
 * (Brand Kit → Story). Absent entirely otherwise: a placeholder paragraph
 * saying nothing is worse than no section at all.
 */
function StorySection({ story }: { story: string }) {
  const [ref, visible] = useRevealOnScroll<HTMLParagraphElement>();

  return (
    <section className="px-4 sm:px-6">
      <p
        ref={ref}
        className={cn(
          'border-line bg-paper mx-auto max-w-[52ch] rounded-[var(--radius-lg)] border-[1.5px] p-5 text-center text-[15px] leading-relaxed sm:text-base',
          'transition-[opacity,transform] duration-500',
          visible ? 'opacity-100' : 'opacity-0 translate-y-3',
        )}
      >
        {story}
      </p>
    </section>
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
  const [listRef, listVisible] = useRevealOnScroll<HTMLUListElement>();

  if (classes.length === 0) {
    return (
      <div className="p-1 text-center">
        <p className="text-5xl" aria-hidden="true">
          🌷
        </p>
        <p className="font-display mt-2 text-xl">No classes open right now</p>
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

      <ul ref={listRef} className="grid gap-3">
        {classes.map((item, index) => {
          const seats = seatCopy(item);
          const accent = accentFor(item.color_token);

          return (
            <li
              key={item.id}
              className={listVisible ? 'animate-rise-in' : undefined}
              style={listVisible ? { animationDelay: `${index * 60}ms` } : { opacity: 0 }}
            >
              <button
                type="button"
                onClick={() => onPick(item)}
                className={cn(
                  'group border-line bg-paper relative w-full overflow-hidden rounded-[var(--radius-md)] border-[1.5px]',
                  'min-h-[44px] py-4 pr-4 pl-5 text-left transition-[transform,box-shadow] duration-200',
                  'hover:border-transparent hover:[transform:perspective(600px)_rotateX(1.5deg)_translateY(-4px)]',
                  accent.hoverGlow,
                  'motion-reduce:transform-none',
                  'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
                )}
              >
                {/* The class-type accent bar — same colour language as the
                    admin calendar, so a returning guest's eye already knows
                    what pink versus terracotta means here. */}
                <span
                  aria-hidden="true"
                  className={cn('absolute inset-y-0 left-0 w-1.5', accent.bar)}
                />

                <span className="font-display block text-lg">{item.name}</span>

                {/* suppressHydrationWarning: the date is formatted in the
                    visitor's locale, which the server cannot know. */}
                <span className="text-cocoa mt-0.5 block text-sm" suppressHydrationWarning>
                  {now ? `${formatDay(item.starts_at)} · ${formatTime(item.starts_at)}` : ' '}
                </span>

                {item.location ? (
                  <span className="text-latte block text-sm">{item.location}</span>
                ) : null}

                <span
                  className={cn(
                    'mt-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold',
                    item.is_full
                      ? 'bg-butter-soft text-butter-ink'
                      : seats.urgent
                        ? 'bg-blush text-rose-ink animate-pulse motion-reduce:animate-none'
                        : 'bg-sage-soft text-sage-ink',
                  )}
                >
                  {seats.urgent && !item.is_full ? <span aria-hidden="true">🔥</span> : null}
                  {seats.text}
                </span>

                <span
                  aria-hidden="true"
                  className="text-rose-ink absolute top-1/2 right-4 -translate-y-1/2 text-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:hidden"
                >
                  →
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

      <div className="border-line bg-buttercream relative mb-4 overflow-hidden rounded-[var(--radius-md)] border-[1.5px] p-3.5">
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0 w-1.5', accentFor(item.color_token).bar)}
        />
        <b className="font-display block pl-2 text-lg">{item.name}</b>
        <span className="text-latte block pl-2 text-sm" suppressHydrationWarning>
          {now ? `${formatDay(item.starts_at)} · ${formatTime(item.starts_at)}` : ' '}
        </span>
        {item.is_full ? (
          <span className="bg-butter-soft text-butter-ink mt-2 ml-2 inline-block rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold">
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

        <Field
          id={`${ids}-note`}
          name="note"
          label="Anything fun we should put on your name tag?"
          icon="sparkle"
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
          className="text-danger animate-rise-in text-sm font-bold empty:hidden"
        >
          {error}
        </p>

        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'bg-rose text-on-rose min-h-[48px] rounded-[var(--radius-pill)]',
            'px-5 text-base font-extrabold shadow-[0_10px_24px_-10px_var(--color-rose)]',
            'transition-transform hover:-translate-y-0.5 active:translate-y-0',
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

type FieldIcon = 'user' | 'phone' | 'mail' | 'heart' | 'sparkle';

function FieldIconGlyph({ icon }: { icon: FieldIcon }) {
  const common = { viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true, className: 'size-[18px]' } as const;

  switch (icon) {
    case 'user':
      return (
        <svg {...common}>
          <circle cx="10" cy="6.5" r="3.25" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 17c1-3.6 4-5.5 6.5-5.5s5.5 1.9 6.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...common}>
          <path
            d="M6 3h2.2l1 3.2-1.6 1.4a9 9 0 0 0 4.8 4.8l1.4-1.6 3.2 1v2.2c0 .9-.8 1.6-1.7 1.5A13.5 13.5 0 0 1 4.5 4.7C4.4 3.8 5.1 3 6 3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="m3.5 5.5 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common}>
          <path
            d="M10 16.5S3 12.3 3 7.8A3.3 3.3 0 0 1 10 6a3.3 3.3 0 0 1 7 1.8c0 4.5-7 8.7-7 8.7Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path
            d="M10 3.5c.4 2.6 1.2 3.9 4 4.4-2.8.5-3.6 1.8-4 4.4-.4-2.6-1.2-3.9-4-4.4 2.8-.5 3.6-1.8 4-4.4Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M15.5 13c.2 1.4.6 2 1.9 2.3-1.3.3-1.7 1-1.9 2.3-.2-1.4-.6-2-1.9-2.3 1.3-.3 1.7-1 1.9-2.3Z" fill="currentColor" />
        </svg>
      );
  }
}

function Field({
  id,
  name,
  label,
  hint,
  invalid,
  required,
  icon,
  ...input
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  invalid?: boolean;
  required?: boolean;
  icon: FieldIcon;
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

      <div className="relative">
        <span className="text-latte pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
          <FieldIconGlyph icon={icon} />
        </span>

        <input
          {...input}
          id={id}
          name={name}
          aria-describedby={hintId}
          aria-invalid={invalid || undefined}
          className={cn(
            'bg-paper text-cocoa min-h-[48px] w-full rounded-[var(--radius-sm)] border-[1.5px] py-2.5 pr-3 pl-10',
            'transition-[border-color,box-shadow] duration-150',
            'focus-visible:outline-none focus-visible:border-rose focus-visible:shadow-[0_0_0_4px_var(--color-blush)]',
            invalid ? 'border-danger' : 'border-line',
          )}
        />
      </div>
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
    <section className="relative text-center" aria-live="polite">
      <Confetti />

      <p className="animate-rise-in text-6xl" aria-hidden="true" style={{ animationDelay: '80ms' }}>
        {waitlisted ? '💌' : '🎀'}
      </p>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display animate-rise-in mt-2 text-[clamp(24px,6vw,30px)] outline-none"
        style={{ animationDelay: '140ms' }}
      >
        {/* A real apostrophe, not an entity: this is a JS string, so `&rsquo;`
            would render as those eight characters. */}
        {waitlisted ? 'You’re on the list' : 'You’re in!'}
      </h2>

      <p className="text-cocoa animate-rise-in mt-2" style={{ animationDelay: '200ms' }}>
        <b>{result.class_name}</b>
        <br />
        <span suppressHydrationWarning>
          {now ? `${formatDay(result.starts_at)} · ${formatTime(result.starts_at)}` : ' '}
        </span>
        {result.location ? (
          <>
            <br />
            {result.location}
          </>
        ) : null}
      </p>

      {waitlisted ? (
        <p className="text-latte animate-rise-in mx-auto mt-4 max-w-[38ch] text-sm" style={{ animationDelay: '260ms' }}>
          You&rsquo;re number <b>{result.waitlist_position}</b> in the queue. If a seat opens up
          we&rsquo;ll message you straight away — no need to check back.
        </p>
      ) : (
        <p className="text-latte animate-rise-in mx-auto mt-4 max-w-[38ch] text-sm" style={{ animationDelay: '260ms' }}>
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
 * One confetti burst, per the style guide's own rule — not a looping
 * celebration, a single moment. CSS only, and skipped entirely under
 * reduced motion rather than left static: a field of frozen dots is just
 * clutter with no motion left to justify it.
 */
function Confetti() {
  const pieces = [
    { left: '12%', color: 'var(--color-rose)', delay: '0ms' },
    { left: '28%', color: 'var(--color-terra)', delay: '60ms' },
    { left: '45%', color: 'var(--color-sage)', delay: '20ms' },
    { left: '58%', color: 'var(--color-butter)', delay: '90ms' },
    { left: '72%', color: 'var(--color-pink)', delay: '40ms' },
    { left: '86%', color: 'var(--color-rose)', delay: '110ms' },
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-2 h-0 motion-reduce:hidden"
    >
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="absolute top-0 size-2 rounded-full opacity-90"
          style={{
            left: piece.left,
            backgroundColor: piece.color,
            animation: `fall 900ms ease-in ${piece.delay} both`,
          }}
        />
      ))}
    </div>
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
    <div className="animate-rise-in mt-6" style={{ animationDelay: '340ms' }}>
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
