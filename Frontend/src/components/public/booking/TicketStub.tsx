'use client';

import { cn } from '@/lib/cn';

/**
 * The top of the ticket: a handwritten line, the step dots, and the
 * perforation they are torn along. The two notches are half-circles of the
 * page colour sitting on the card's edge — each one clipped to the half
 * inside the card (`clip-path`), so the card's own border reads as a punched
 * edge rather than a circle stuck on it.
 */
export function TicketStub({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="border-line relative border-b-[1.5px] border-dashed px-5 pt-5 pb-4 text-center sm:px-7">
      <p className="font-hand text-rose-ink text-xl leading-none">save your seat</p>
      <StepDots current={current} className="mt-3" />
      <span
        aria-hidden="true"
        className="border-line bg-buttercream absolute -bottom-3 -left-3 size-6 rounded-full border-[1.5px] [clip-path:inset(0_0_0_50%)]"
      />
      <span
        aria-hidden="true"
        className="border-line bg-buttercream absolute -right-3 -bottom-3 size-6 rounded-full border-[1.5px] [clip-path:inset(0_50%_0_0)]"
      />
    </div>
  );
}

function StepDots({ current, className }: { current: 1 | 2 | 3; className?: string }) {
  const labels = ['Pick a class', 'Your details', 'Confirmed'];

  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={3}
      aria-label={`Step ${current} of 3: ${labels[current - 1]}`}
      className={cn('flex items-center justify-center gap-2', className)}
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
