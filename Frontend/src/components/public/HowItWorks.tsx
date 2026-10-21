'use client';

import { cn } from '@/lib/cn';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';
import '@/styles/units/receipt.css';

/**
 * "Easy as one, two, three" — the whole booking in three sentences, before
 * the guest is asked to do any of it.
 *
 * A stranger from an ad does not know how long this will take or what it
 * wants from them, and that uncertainty is what makes people leave. Saying
 * up front that step two is a name and a phone number is worth more than
 * any amount of polish on the form itself. Each line is the truth about the
 * form below it; the third repeats the confirmation's own promises.
 *
 * Set as a receipt: one paper slip, three numbered lines between dashed
 * rules and a torn foot (`receipt.css`), so it reads as one short thing
 * rather than three cards.
 *
 * Also the target of the hero's secondary link (`#how-it-works`).
 */

export const STEPS = [
  {
    title: 'Pick a class',
    copy: 'See what’s on below and tap the one you like the look of.',
  },
  {
    title: 'Save your seat',
    copy: 'Your name and one way to reach you. That really is the whole form.',
  },
  {
    title: 'Come make something',
    copy: 'We’ll remind you the day before. Aprons are on us — just bring yourself.',
  },
] as const;

export function HowItWorks() {
  const [ref, visible] = useRevealOnScroll<HTMLElement>();

  return (
    <section
      ref={ref}
      id="how-it-works"
      aria-labelledby="how-heading"
      className="mx-auto scroll-mt-6 px-4 sm:max-w-[640px] sm:px-6"
    >
      <div className="text-center">
        <p className="font-hand text-rose-ink text-xl">easy as one, two, three</p>
        <h2
          id="how-heading"
          className="font-display mt-1 text-[clamp(26px,5vw,38px)] leading-[1.08] text-balance"
        >
          How it works
        </h2>
      </div>

      {/* The shadow is a `drop-shadow` on the wrapper so it follows the torn
          teeth too; a box-shadow would draw a straight line under them. */}
      <div
        className={cn(
          'mt-7 drop-shadow-[0_12px_18px_rgb(64_48_42_/14%)]',
          'transition-[opacity,transform] duration-700 motion-reduce:transition-none',
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <ol className="receipt bg-paper rounded-t-[var(--radius-lg)] px-5 pt-2 sm:px-7">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={cn(
                'receipt__line grid grid-cols-[2.25rem_1fr] items-baseline gap-x-3 py-4 text-left',
                index > 0 && 'border-line border-t border-dashed',
              )}
            >
              <span aria-hidden="true" className="font-display text-rose-ink text-2xl leading-none">
                {index + 1}
              </span>
              <div>
                <h3 className="font-display text-lg leading-snug">{step.title}</h3>
                <p className="text-latte mt-0.5 text-sm leading-relaxed">{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
        <div aria-hidden="true" className="receipt__edge" />
      </div>
    </section>
  );
}
