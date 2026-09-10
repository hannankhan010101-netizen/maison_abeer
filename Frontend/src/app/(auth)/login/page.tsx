'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { HandNote } from '@/components/ui/Card';
import { MochaToggle } from '@/components/ui/MochaToggle';
import { cn } from '@/lib/cn';
import { safeDestination } from '@/lib/auth/redirect';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Sign in.
 *
 * The one screen that talks to Supabase directly. Everything after this goes
 * through the API gateway.
 */

// ---------------------------------------------------------------------------
// Icons — small inline line-icons, decorative only. The label text next to
// each one is the real accessible name, so every icon here is aria-hidden.
// ---------------------------------------------------------------------------

function MailIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-[18px]">
      <path
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="m3.5 5.5 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-[18px]">
      <rect x="4" y="9" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 9V6.5a3.5 3.5 0 1 1 7 0V9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-[18px]">
      <path
        d="M1.75 10S4.5 4.5 10 4.5 18.25 10 18.25 10 15.5 15.5 10 15.5 1.75 10 1.75 10Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-[18px]">
      <path
        d="M2.5 2.5l15 15M8.37 8.45a2.25 2.25 0 0 0 3.17 3.19M6.1 6.14C3.87 7.36 2.2 9.5 1.75 10c.68.86 3.46 4.5 8.25 4.5 1.4 0 2.6-.31 3.62-.79M12.9 5.31A8.6 8.6 0 0 0 10 4.5c-.75 0-1.45.08-2.1.23M14.9 7.06c1.6 1.13 2.66 2.55 3.35 3.44a13 13 0 0 1-2.02 2.16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-[18px] shrink-0">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.5v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.25" r="0.9" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// A labelled, icon-fronted field. Local to this page rather than a shared
// component — nothing else in the app shares this exact icon-in-input shape
// yet, and duplicating a dozen lines here beats a one-off abstraction guessed
// at from a single caller.
// ---------------------------------------------------------------------------

function AuthField({
  id,
  label,
  icon,
  trailing,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-latte mb-1.5 block text-[11.5px] font-extrabold tracking-[0.08em] uppercase"
      >
        {label}
      </label>
      <div className="relative">
        <span className="text-latte pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
          {icon}
        </span>
        {children}
        {trailing ? (
          <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>
        ) : null}
      </div>
    </div>
  );
}

// No explicit text-size utility here, deliberately: globals.css sets
// `input,select,textarea { font-size: max(16px, 1em) }` specifically to stop
// iOS Safari zooming the whole page on focus, and a utility class here would
// win that fight — Tailwind's utilities layer overrides its base layer
// regardless of selector specificity, so `text-[15px]` would silently
// reintroduce the zoom bug on a real phone despite looking identical on a
// desktop browser or in a snapshot test.
const FIELD_CLASSES = cn(
  'border-line bg-buttercream text-cocoa min-h-[46px] w-full rounded-[var(--radius-md)]',
  'border-[1.5px] py-2.5 pr-3.5 pl-10',
  'transition-[border-color,box-shadow] duration-150',
  'placeholder:text-latte/70',
  'hover:border-pink',
  'focus:border-rose focus:shadow-[0_0_0_4px_var(--color-blush)] focus:outline-none',
);

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Sign-in needs JavaScript, so the button waits for it.
   *
   * Server-rendered HTML arrives with a working-looking form before the
   * handler exists. Tapping it then does a native submit — which on a slow
   * phone is a real thing to do, and lands the password somewhere it should
   * never be. Disabled until mounted, the tap simply does nothing.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // One message for every failure. Distinguishing "no such account"
        // from "wrong password" tells an attacker which emails are real.
        setError("That email and password don't match. Want to try again?");
        return;
      }

      // Only same-origin paths, so a crafted ?next= cannot bounce the host
      // to another site immediately after they authenticate.
      router.replace(safeDestination(searchParams.get('next')));
      router.refresh();
    } catch (caught) {
      // A misconfigured client throws before any request is made, and
      // reporting that as a connection problem sends whoever is debugging it
      // to the wrong place entirely. Keep the reassuring copy for the host,
      // put the real cause in the console for whoever is fixing it.
      console.error('[login] sign-in failed before reaching Supabase:', caught);
      setError("We couldn't reach the studio. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        'animate-rise-in w-full max-w-[420px]',
        'border-line bg-paper/95 relative rounded-[var(--radius-lg)] border-[1.5px]',
        'p-6 shadow-[0_28px_60px_-24px_rgb(64_48_42_/22%)] backdrop-blur-xl sm:p-8',
      )}
    >
      {/* A wordmark badge — this is the sign-in door for the whole product,
          so it gets to say who it belongs to even before the heading does. */}
      <div className="border-line bg-blush mb-5 inline-flex size-11 items-center justify-center rounded-full border-[1.5px] text-xl">
        <span aria-hidden="true">🌷</span>
      </div>

      <h1 className="font-display text-[26px] leading-tight sm:text-[28px]">Welcome back ✨</h1>
      <p className="mt-1.5 mb-6">
        <HandNote>Let&rsquo;s get you into the studio</HandNote>
      </p>

      {/*
        `method="post"` matters even though the submit is handled in JS.
        Until this component hydrates there is no `onSubmit`, so tapping the
        button falls back to a native submit — and a form with no method
        submits GET, which writes the typed password into the address bar,
        the browser history and any proxy log on the way. A POST cannot be
        put in a URL. The disabled button below makes that path unreachable
        in the first place; this is the belt to its braces.
      */}
      <form onSubmit={handleSubmit} method="post" noValidate className="space-y-4">
        <AuthField id="email" label="Email" icon={<MailIcon />}>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@yourstudio.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASSES}
          />
        </AuthField>

        <AuthField
          id="password"
          label="Password"
          icon={<LockIcon />}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="text-latte hover:text-cocoa grid size-9 place-items-center rounded-full transition-colors"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        >
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(FIELD_CLASSES, 'pr-11')}
          />
        </AuthField>

        {error ? (
          // role=alert so the failure is announced, not just recoloured.
          <p
            role="alert"
            className="border-danger-line bg-danger-soft text-danger animate-rise-in flex items-start gap-2 rounded-[var(--radius-md)] border-[1.5px] px-3.5 py-3 text-sm font-bold"
          >
            <AlertIcon />
            <span>{error}</span>
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={!ready}
          loading={pending}
          loadingLabel="Signing you in…"
          className="w-full"
        >
          Sign in
        </Button>
      </form>

      <p className="text-latte mt-6 text-center text-[13px]">
        Trouble signing in? Ask your studio for help.
      </p>
    </div>
  );
}

/**
 * A little slice of what's on the other side of this door — the bento cake
 * class card is fictional but shaped exactly like a real one (PRD §2.1), so
 * this reads as "the product," not a stock illustration.
 */
function ShowcaseCard() {
  return (
    <div
      className={cn(
        'border-line bg-paper/80 animate-rise-in w-[248px] rounded-[var(--radius-lg)] border-[1.5px]',
        'p-4 shadow-[var(--shadow-soft)] backdrop-blur-md',
      )}
      style={{ animationDelay: '150ms' }}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <span className="bg-pink text-on-pink rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-extrabold">
          Bento cake decorating
        </span>
        <span className="text-latte text-[11px] font-bold">Sat 2:00pm</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <svg viewBox="0 0 44 44" className="size-11 -rotate-90">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="var(--color-blush)"
            strokeWidth="5"
          />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="var(--color-rose)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="113"
            strokeDashoffset="22.6"
          />
        </svg>
        <div>
          <p className="text-cocoa text-sm font-extrabold">8 / 10 seats</p>
          <p className="text-latte text-xs">Nearly full 🔥</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The desktop-only left half: brand, mood, and one honest glimpse of the
 * product rather than generic marketing art. Hidden below `lg` — on a phone
 * this space belongs entirely to the form.
 */
function BrandPanel() {
  return (
    <div className="from-blush via-buttercream to-pink/50 relative hidden overflow-hidden bg-gradient-to-br lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* Ambient blobs — decorative texture, drifting slowly. Reduced motion
          zeroes the animation globally, leaving the shapes static. */}
      <div
        aria-hidden="true"
        className="bg-terra-soft animate-drift absolute -top-24 -left-16 size-72 rounded-full opacity-60 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-sage-soft animate-drift absolute top-1/3 -right-20 size-80 rounded-full opacity-50 blur-3xl"
        style={{ animationDelay: '4s' }}
      />
      <div
        aria-hidden="true"
        className="bg-butter-soft animate-drift absolute -bottom-24 left-1/4 size-64 rounded-full opacity-50 blur-3xl"
        style={{ animationDelay: '8s' }}
      />

      <div className="relative">
        <span className="font-display text-2xl">Maison Abeer</span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-8">
        <div>
          <p className="font-display max-w-[15ch] text-[clamp(32px,3vw,44px)] leading-[1.1]">
            Your studio bestie ✨
          </p>
          <p className="text-cocoa/80 mt-4 max-w-[38ch] text-[15px]">
            <HandNote className="text-[19px]">
              Bookings, prep lists, name tags and guest chat — all in one calm place that still
              feels like your brand.
            </HandNote>
          </p>
        </div>

        <ShowcaseCard />
      </div>

      <p className="text-latte relative text-[13px] font-bold">
        &copy; {new Date().getFullYear()} Maison Abeer — your studio bestie
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main id="main" className="relative min-h-screen overflow-x-hidden lg:grid lg:grid-cols-2">
      <BrandPanel />

      <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-8">
        {/* Soft ambient wash behind the form on mobile/tablet, where the
            brand panel is hidden — an empty flat background read as unfinished. */}
        <div
          aria-hidden="true"
          className="bg-blush animate-drift pointer-events-none absolute -top-28 -right-24 size-72 rounded-full opacity-50 blur-3xl lg:hidden"
        />
        <div
          aria-hidden="true"
          className="bg-butter-soft animate-drift pointer-events-none absolute -bottom-24 -left-20 size-72 rounded-full opacity-50 blur-3xl lg:hidden"
          style={{ animationDelay: '5s' }}
        />

        <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
          <MochaToggle />
        </div>

        {/* useSearchParams needs a Suspense boundary to prerender. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
