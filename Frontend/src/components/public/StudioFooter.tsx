'use client';

import type { MouseEvent, ReactNode } from 'react';

import type { PublicClass } from '@/lib/public/api';
import { scrollToId } from '@/lib/public/lenisBridge';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

import '@/styles/units/footer.css';

const LINK =
  'text-cocoa decoration-pink hover:decoration-rose inline-flex min-h-[44px] items-center font-extrabold underline decoration-2 underline-offset-4';

function toBooking(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  scrollToId('booking-widget');
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-footer-column="">
      <h2 className="text-latte text-xs font-extrabold tracking-[0.14em] uppercase">{title}</h2>
      <ul className="mt-2 flex flex-col items-center sm:items-start">{children}</ul>
    </div>
  );
}

/**
 * "see you at the studio", in the hand face, with a pen stroke under it.
 * The words are real text, so assistive tech reads them; the stroke is
 * decoration and hidden. footer.css draws it on once the footer is seen.
 */
function SignOff() {
  return (
    <p className="font-hand text-rose-ink inline-flex flex-col items-center text-2xl">
      <span>see you at the studio ♡</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 240 16"
        className="-mt-1 h-4 w-60 max-w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          className="signoff-stroke"
          pathLength="1"
          d="M6 10 C 40 4, 70 14, 104 8 S 168 4, 196 9 C 210 11, 222 6, 234 5"
        />
      </svg>
    </p>
  );
}

/**
 * The storefront's sign-off: the end of a visit rather than the end of a
 * page. The name as a wordmark, then what a guest might still want — the
 * crafts on offer, the one real channel the studio has (its Instagram), and
 * where the photographs came from — and a last way back to the booking card.
 * No invented address, hours or phone number; the payload has none, and a
 * footer that guesses is worse than a short one.
 */
export function StudioFooter({
  studioName,
  handle,
  classes = [],
}: {
  studioName: string;
  handle?: string | null;
  classes?: PublicClass[];
}) {
  const crafts = [...new Set(classes.map((item) => item.name))];
  const [ref, visible] = useRevealOnScroll<HTMLElement>();

  return (
    <footer
      ref={ref}
      data-visible={visible ? '' : undefined}
      className="border-line mt-6 border-t-[1.5px] border-dashed px-4 py-12 text-center sm:px-6"
    >
      <SignOff />
      <p className="font-display mt-2 text-4xl tracking-tight sm:text-5xl">
        {studioName}
        <span className="text-rose-ink">.</span>
      </p>

      <div className="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-3 sm:text-left">
        {crafts.length > 0 ? (
          <Column title="Classes">
            {crafts.map((name) => (
              <li key={name}>
                <a href="#booking-widget" onClick={toBooking} className={LINK}>
                  {name}
                </a>
              </li>
            ))}
          </Column>
        ) : null}

        {handle ? (
          <Column title="Find us">
            <li>
              <a
                href={`https://instagram.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                @{handle}
              </a>
            </li>
            <li>
              <a
                href={`https://ig.me/m/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                Message us
              </a>
            </li>
          </Column>
        ) : null}

        {classes.length > 0 ? (
          <Column title="Photos">
            <li>
              <a
                href="https://unsplash.com/license"
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                craft photography via Unsplash
              </a>
            </li>
          </Column>
        ) : null}
      </div>

      <a
        href="#booking-widget"
        onClick={toBooking}
        className="clay bg-rose text-on-rose focus-visible:outline-cocoa mt-10 inline-flex min-h-[44px] items-center rounded-[var(--radius-pill)] px-7 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Save a seat
      </a>
    </footer>
  );
}
