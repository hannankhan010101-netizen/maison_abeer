'use client';

import { useEffect, useState } from 'react';

import { Tilt } from '@/components/motion/Tilt';
import { DateLeaf } from '@/components/public/DateLeaf';
import { cn } from '@/lib/cn';

import '@/styles/units/login.css';

/**
 * A glimpse of the other side of this door: a booking ticket shaped exactly
 * like the storefront's, with two paper cards fanned behind it.
 *
 * It is an illustration and says so in the page's own hand ("for example").
 * It carries no seat count, no "nearly full" and no other number: the ring on
 * the stub is decoration, not a measurement. The only digits live in the date
 * leaf, which is a calendar object rather than a claim.
 *
 * The leaf's weekday and month are formatted in the visitor's locale, so they
 * wait for mount (`ready`) rather than hydrate a server guess.
 */

// A Saturday afternoon, chosen only so the leaf has something to show.
const EXAMPLE_DATE = '2026-11-14T14:00:00';

const PAPER = 'border-line bg-paper rounded-[var(--radius-lg)] border-[1.5px]';

export function ShowcaseTicket() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div aria-hidden="true" className="login-showcase relative w-[300px]">
      {/* The fan: two blank paper cards behind the ticket. */}
      <span
        className={cn(
          PAPER,
          'login-fan login-fan--back absolute inset-0 shadow-[var(--shadow-card)]',
        )}
      />
      <span
        className={cn(
          PAPER,
          'login-fan login-fan--mid bg-buttercream absolute inset-0 shadow-[var(--shadow-card)]',
        )}
      />

      <Tilt maxDeg={6} className="relative [&>div]:rounded-[var(--radius-lg)]">
        <div className={cn(PAPER, 'relative overflow-hidden shadow-[var(--shadow-soft)]')}>
          <div className="flex items-center gap-3.5 p-4">
            <span data-leaf>
              <DateLeaf iso={EXAMPLE_DATE} token="sage" ready={ready} />
            </span>
            <div className="min-w-0">
              <p className="font-hand text-latte -mt-1 mb-1.5 text-[15px]">for example</p>
              <span className="bg-pink text-on-pink inline-block rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-extrabold">
                Bento cake decorating
              </span>
              <p className="text-latte mt-1.5 text-xs font-bold">An afternoon at the studio</p>
            </div>
          </div>

          {/* The perforation: a dashed tear line with a notch at each end. */}
          <div className="relative">
            <span className="border-line block border-t-[1.5px] border-dashed" />
            <span className="border-line bg-buttercream absolute -top-[9px] -left-[9px] size-[18px] rounded-full border-[1.5px]" />
            <span className="border-line bg-buttercream absolute -top-[9px] -right-[9px] size-[18px] rounded-full border-[1.5px]" />
          </div>

          <div className="flex items-center gap-3 px-4 py-3">
            <svg viewBox="0 0 44 44" className="size-10 -rotate-90">
              <circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke="var(--color-blush)"
                strokeWidth="4"
              />
              <circle
                className="login-ring"
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke="var(--color-rose)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* A little seat in the middle of the ring. */}
              <path
                d="M16 17v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5M15 24v4M29 24v4"
                transform="rotate(90 22 22)"
                fill="none"
                stroke="var(--color-cocoa)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-cocoa text-sm font-extrabold">A seat with a name on it</p>
          </div>
        </div>
      </Tilt>
    </div>
  );
}
