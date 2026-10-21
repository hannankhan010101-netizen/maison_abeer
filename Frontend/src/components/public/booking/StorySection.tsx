'use client';

import { MagicalPattern } from '@/components/public/MagicalPattern';
import { cn } from '@/lib/cn';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

/**
 * "What happens here" — the studio's own words, when they've written any
 * (Brand Kit → Story). Absent entirely otherwise: a placeholder paragraph
 * saying nothing is worse than no section at all.
 *
 * Set directly on the page's own surface rather than boxed in a bordered
 * card: in `.mocha` a `bg-paper` card sits only one shade off the page
 * behind it, which read as a flat, barely-outlined panel floating with no
 * clear reason to be there. A large serif pull-quote with a single accent
 * rule reads as an editorial moment instead — the studio speaking in its
 * own voice, not copy trapped in a UI component.
 */
export function StorySection({ story }: { story: string }) {
  const [ref, visible] = useRevealOnScroll<HTMLElement>();

  // `overflow-hidden`: the pattern behind is drawn wider than the section so
  // its edge never shows, which on a phone means wider than the screen — and
  // unclipped it pushed the whole page sideways (e2e/story-overflow.spec.ts).
  return (
    <section ref={ref} className="relative overflow-hidden px-5 sm:px-8">
      <MagicalPattern className="inset-0 -z-10" />
      <div
        className={cn(
          'mx-auto max-w-[46ch] text-center',
          'transition-[opacity,transform] duration-700',
          visible ? 'opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <span aria-hidden="true" className="bg-rose mx-auto mb-6 block h-[3px] w-10 rounded-full" />
        <p className="font-display text-[clamp(20px,4vw,26px)] leading-[1.35]">{story}</p>
      </div>
    </section>
  );
}
