'use client';

import { useEffect, useRef, useState } from 'react';
import { DateLeaf } from '@/components/public/DateLeaf';
import { cn } from '@/lib/cn';
import { type BookingResult } from '@/lib/public/api';
import { formatDay, formatTime } from '@/lib/public/bookingCopy';
import { useMountedNow } from '@/lib/public/useMountedNow';

// ---------------------------------------------------------------------------
// Step 3 — done
// ---------------------------------------------------------------------------

export function Confirmation({ result, token }: { result: BookingResult; token: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useMountedNow();

  useEffect(() => headingRef.current?.focus(), []);

  const waitlisted = result.outcome === 'waitlisted';
  const portalToken = result.portal_token;
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
        className="font-display animate-rise-in mt-2 text-[clamp(26px,6vw,34px)] outline-none"
        style={{ animationDelay: '140ms' }}
      >
        {/* A real apostrophe, not an entity: this is a JS string, so `&rsquo;`
            would render as those eight characters. */}
        {waitlisted ? 'You’re on the list' : 'You’re in!'}
      </h2>

      {/* The stub — the half of the ticket a guest keeps. */}
      <div
        className="border-line bg-buttercream animate-rise-in mx-auto mt-4 flex max-w-[380px] items-center gap-3.5 rounded-[var(--radius-md)] border-[1.5px] border-dashed p-3.5 text-left"
        style={{ animationDelay: '200ms' }}
      >
        <DateLeaf iso={result.starts_at} token={token} ready={now !== null} />
        <p className="text-cocoa min-w-0">
          <b className="font-display block text-lg leading-tight">{result.class_name}</b>
          <span className="text-latte block text-sm" suppressHydrationWarning>
            {now ? `${formatDay(result.starts_at)} · ${formatTime(result.starts_at)}` : ' '}
          </span>
          {result.location ? (
            <span className="text-latte block text-sm">{result.location}</span>
          ) : null}
        </p>
      </div>

      {waitlisted ? (
        <p
          className="text-latte animate-rise-in mx-auto mt-4 max-w-[38ch] text-sm"
          style={{ animationDelay: '260ms' }}
        >
          You&rsquo;re number <b>{result.waitlist_position}</b> in the queue. If a seat opens up
          we&rsquo;ll message you straight away — no need to check back.
        </p>
      ) : (
        <p
          className="text-latte animate-rise-in mx-auto mt-4 max-w-[38ch] text-sm"
          style={{ animationDelay: '260ms' }}
        >
          We&rsquo;ll send you a reminder the day before with everything you need. Just bring
          yourself — aprons are on us.
        </p>
      )}

      {portalToken && tokenType ? (
        <PortalHandoff token={portalToken} tokenType={tokenType} waitlisted={waitlisted} />
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
