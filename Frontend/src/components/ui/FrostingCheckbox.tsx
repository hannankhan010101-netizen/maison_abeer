'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The frosting-dot checkbox: a round control that pops to a 🎀 when ticked.
 *
 * The visual dot is 24px to match the prototype, but the hit area is expanded
 * to 44px via a pseudo-element so the control stays tappable in a studio
 * (PRD §3.4) without changing the layout around it.
 */

export interface FrostingCheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label: ReactNode;
  /** Secondary line, e.g. "T-24h · friday" or "due today". */
  meta?: ReactNode;
  /** Renders the meta line in the danger tone for overdue steps. */
  overdue?: boolean;
}

export const FrostingCheckbox = forwardRef<HTMLInputElement, FrostingCheckboxProps>(
  function FrostingCheckbox({ label, meta, overdue = false, className, id, ...props }, ref) {
    return (
      <div
        className={cn(
          'border-line flex items-start gap-3 border-b-[1.5px] border-dashed py-3 last:border-b-0',
          className,
        )}
      >
        <span className="relative flex shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            className={cn(
              'peer border-pink bg-paper size-6 appearance-none rounded-full border-2',
              'grid cursor-pointer place-items-center transition-transform duration-150',
              'checked:border-rose checked:bg-rose',
              'hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none',
              // 44px hit area centred on the 24px dot, without affecting layout.
              'before:absolute before:top-1/2 before:left-1/2 before:size-11',
              'before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
            )}
            {...props}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute text-[12px] opacity-0 peer-checked:opacity-100"
          >
            🎀
          </span>
        </span>

        <label htmlFor={id} className="flex-1 cursor-pointer">
          <span className="peer-checked:text-latte font-bold">{label}</span>
          {meta ? (
            <span
              className={cn(
                'block text-[12.5px]',
                overdue ? 'text-danger font-extrabold' : 'text-latte',
              )}
            >
              {meta}
            </span>
          ) : null}
        </label>
      </div>
    );
  },
);
