'use client';

import '@/styles/units/booking.css';

/**
 * Three ticket-shaped placeholders, so the page already has the shape of what
 * is coming: a date leaf, two lines of text, a seats pill. The shimmer lives in
 * `booking.css` so reduced motion can switch it off and leave the shapes still.
 */
export function LoadingClasses() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading classes</span>
      <ul aria-hidden="true" className="grid gap-3">
        {[0, 1, 2].map((key) => (
          <li
            key={key}
            data-skeleton="ticket"
            className="border-line bg-paper grid grid-cols-[auto_1fr] items-center gap-3.5 rounded-[var(--radius-md)] border-[1.5px] p-3.5 sm:p-4"
          >
            <span className="booking-shimmer block h-[72px] w-[60px] rounded-[var(--radius-sm)]" />
            <span className="grid gap-2">
              <span className="booking-shimmer block h-4 w-3/4 rounded-full" />
              <span className="booking-shimmer block h-3 w-1/2 rounded-full" />
              <span className="booking-shimmer mt-1 block h-6 w-24 rounded-[var(--radius-pill)]" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
