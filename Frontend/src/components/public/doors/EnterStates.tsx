'use client';

import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

import '@/styles/units/enter.css';

/**
 * What `/enter` shows while it redeems a sign-in link, and when it cannot.
 *
 * Presentation only. The redeem logic — once, ever, with the token out of the
 * address bar first — lives in `app/enter/page.tsx` and does not come here.
 */

const INK = {
  stroke: 'var(--color-cocoa)',
  strokeWidth: 2.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  pathLength: 1,
} as const;

/**
 * A ticket with a key resting across it, in the storefront stickers' ink.
 * Decorative: the words beside it carry the meaning.
 */
function KeyTicket({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 100"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'enter-sticker overflow-visible drop-shadow-[0_10px_16px_rgb(64_48_42_/18%)]',
        className,
      )}
    >
      {/* The ticket: a stub notched at both ends, tilted as if just set down. */}
      <g transform="rotate(-6 60 50)">
        <path
          className="enter-sticker__fill"
          d="M18 28h84v14a8 8 0 0 0 0 16v14H18V58a8 8 0 0 0 0-16z"
          fill="var(--color-butter-soft)"
        />
        <path
          className="enter-sticker__line"
          d="M18 28h84v14a8 8 0 0 0 0 16v14H18V58a8 8 0 0 0 0-16z"
          fill="none"
          {...INK}
        />
        {/* The perforation: dashed, so it fades in rather than draws. */}
        <path
          className="enter-sticker__fill"
          d="M80 32v36"
          fill="none"
          stroke="var(--color-cocoa)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="3 5"
        />
      </g>
      {/* The key, lying across the stub. */}
      <g transform="rotate(18 60 50)">
        <circle className="enter-sticker__fill" cx="34" cy="52" r="12" fill="var(--color-blush)" />
        <circle
          className="enter-sticker__line enter-sticker__line--late"
          cx="34"
          cy="52"
          r="12"
          fill="none"
          {...INK}
        />
        <circle
          className="enter-sticker__line enter-sticker__line--late"
          cx="34"
          cy="52"
          r="4"
          fill="none"
          {...INK}
        />
        <path
          className="enter-sticker__line enter-sticker__line--late"
          d="M46 52h44M80 52v9M88 52v6"
          fill="none"
          {...INK}
          stroke="var(--color-rose-deep)"
        />
      </g>
    </svg>
  );
}

function Door({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="grid min-h-[70vh] place-items-center px-4 py-10">
      {children}
    </main>
  );
}

export function EnterWaiting() {
  return (
    <Door>
      <div className="flex flex-col items-center text-center">
        <KeyTicket className="h-24 w-28" />
        <p role="status" aria-live="polite" className="text-latte mt-4">
          <span className="sr-only">Signing you in</span>
          <span aria-hidden="true" className="font-hand text-rose-ink text-[18px]">
            letting you in…
          </span>
        </p>
      </div>
    </Door>
  );
}

export function EnterFailed({ kind }: { kind: 'spent' | 'broken' }) {
  return (
    <Door>
      <Card className="w-full max-w-[38ch] px-6 pt-6 pb-7 text-center">
        <KeyTicket className="mx-auto h-20 w-24" />

        {kind === 'spent' ? (
          <>
            <p role="alert" className="font-display mt-3 text-xl">
              That link has already been used
            </p>
            <p className="text-latte mt-2 text-sm">
              They only work once, and not for long. Ask your studio for a fresh one and
              you&rsquo;ll be straight back in.
            </p>
          </>
        ) : (
          <>
            <p role="alert" className="font-display mt-3 text-xl">
              We couldn&rsquo;t sign you in just now
            </p>
            <p className="text-latte mt-2 text-sm">
              Something went wrong on our side, not yours — your link may still work. Give it a
              minute, then open the link from your message again.
            </p>
          </>
        )}
      </Card>
    </Door>
  );
}
