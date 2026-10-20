'use client';

import { cn } from '@/lib/cn';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

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

// Washi tape across the top of each card, each strip stuck on a little
// differently — three identical strips would read as a UI pattern, not tape.
const TAPES = [
  'bg-butter left-6 -rotate-3',
  'bg-pink right-6 rotate-2',
  'bg-sage left-8 -rotate-2',
];

export function HowItWorks() {
  const [ref, visible] = useRevealOnScroll<HTMLElement>();

  return (
    <section
      ref={ref}
      id="how-it-works"
      aria-labelledby="how-heading"
      className="scroll-mt-6 px-4 sm:px-6"
    >
      <div className="mx-auto max-w-[880px] text-center">
        <p className="font-hand text-rose-ink text-xl">easy as one, two, three</p>
        <h2
          id="how-heading"
          className="font-display mt-1 text-[clamp(26px,5vw,38px)] leading-[1.08] text-balance"
        >
          How it works
        </h2>

        <ol className="mt-9 grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={cn(
                'border-line bg-paper relative rounded-[var(--radius-lg)] border-[1.5px] p-5 pt-6 text-left',
                'shadow-[var(--shadow-card)] transition-[opacity,transform] duration-700 motion-reduce:transition-none',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
              )}
              style={{ transitionDelay: `${index * 110}ms` }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -top-3 h-[22px] w-[72px] rounded-[3px] opacity-80',
                  TAPES[index],
                )}
              />
              <span
                aria-hidden="true"
                className="font-display bg-blush text-rose-ink inline-flex size-11 items-center justify-center rounded-full text-xl"
              >
                {index + 1}
              </span>
              <h3 className="font-display mt-3 text-lg">{step.title}</h3>
              <p className="text-latte mt-1 text-sm leading-relaxed">{step.copy}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
