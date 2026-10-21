'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DateLeaf } from '@/components/public/DateLeaf';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/motion';
import { type BookingResult } from '@/lib/public/api';
import { formatDay, formatTime } from '@/lib/public/bookingCopy';
import { ticketModel } from '@/lib/public/ticket';
import { useMayAnimate } from '@/lib/public/useMayAnimate';
import { useMountedNow } from '@/lib/public/useMountedNow';
import '@/styles/units/booking.css';
import { SaveTicket } from './SaveTicket';

// ---------------------------------------------------------------------------
// Step 3 — done
// ---------------------------------------------------------------------------

export function Confirmation({
  result,
  token,
  studioName,
}: {
  result: BookingResult;
  token: string;
  studioName: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useMountedNow();

  const buzzed = useRef(false);

  useEffect(() => headingRef.current?.focus(), []);

  // Once per confirmation. React StrictMode runs effects twice in development;
  // a ref survives that, so the phone buzzes once rather than twice.
  useEffect(() => {
    if (buzzed.current) return;
    buzzed.current = true;
    haptic('success');
  }, []);

  const waitlisted = result.outcome === 'waitlisted';
  const portalToken = result.portal_token;
  const tokenType = result.portal_token_type;

  return (
    <section className="relative text-center" aria-live="polite">
      <Confetti />

      {waitlisted ? (
        <p
          className="animate-rise-in text-6xl"
          aria-hidden="true"
          style={{ animationDelay: '80ms' }}
        >
          💌
        </p>
      ) : (
        <CheckMark />
      )}

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

      {/* A waitlist place is not a seat, so it gets no ticket to keep. */}
      {waitlisted ? null : (
        <div className="animate-rise-in" style={{ animationDelay: '230ms' }}>
          <SaveTicket model={ticketModel({ result, studioName })} />
        </div>
      )}

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
 * The check that says "saved". It is drawn on by CSS (`stroke-dashoffset`, in
 * `booking.css`) and is simply complete wherever motion is off. Only a booked
 * seat gets one: a waitlist place is not a seat, and a tick would say it was.
 */
function CheckMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="booking-check mx-auto size-16 overflow-visible"
      fill="none"
    >
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="var(--color-blush)"
        stroke="var(--color-rose)"
        strokeWidth="3"
      />
      <path
        d="M19 33l9 9 17-19"
        stroke="var(--color-rose)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={30}
      />
    </svg>
  );
}

const CONFETTI_COLORS = ['rose', 'terra', 'sage', 'butter', 'pink'] as const;

/**
 * Twenty-four pieces, each with its own fixed flight (`--dx --dy --rot
 * --delay`). They are worked out once from the piece's index (a golden-angle
 * spiral, so the burst looks scattered without being random) rather than with
 * `Math.random` at render, which would differ between server and client and on
 * every re-render.
 */
const CONFETTI = Array.from({ length: 24 }, (_, index) => {
  const angle = (index * 137.5 * Math.PI) / 180;
  const reach = 70 + (index % 6) * 22;
  return {
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]!,
    dx: Math.round(Math.cos(angle) * reach),
    dy: Math.round(Math.sin(angle) * reach * 0.8 + 60),
    rot: `${(index * 97) % 540}deg`,
    delay: `${(index % 8) * 35}ms`,
  };
});

/**
 * One burst, per the style guide's own rule: not a looping celebration. Left
 * out of the page entirely when motion is not welcome (a field of frozen
 * pieces is clutter), and also hidden by the stylesheet's reduced-motion rule.
 */
function Confetti() {
  const mayAnimate = useMayAnimate();
  if (!mayAnimate) return null;

  return (
    <div aria-hidden="true" className="booking-confetti">
      {CONFETTI.map((piece, index) => (
        <span
          key={index}
          data-confetti=""
          className="booking-confetti__piece"
          style={
            {
              backgroundColor: `var(--color-${piece.color})`,
              '--dx': `${piece.dx}px`,
              '--dy': `${piece.dy}px`,
              '--rot': piece.rot,
              '--delay': piece.delay,
            } as CSSProperties
          }
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
