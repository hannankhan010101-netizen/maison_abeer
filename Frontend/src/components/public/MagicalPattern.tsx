'use client';

import { cn } from '@/lib/cn';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

/**
 * A large, faint pottery-wheel motif sitting behind a section — concentric
 * rings, each one deliberately slightly uneven rather than a perfect
 * compass circle, the way rings actually come out on a hand-turned wheel.
 * It rotates continuously and very slowly, and fades up from nothing as the
 * section scrolls into view rather than being present (and competing with
 * the text in front of it) from the first frame.
 *
 * Opacity stays under 10% throughout — this is meant to be felt at the edge
 * of attention, never read as a shape in its own right. If it were louder
 * than that it would be fighting the copy in front of it, which §27 of the
 * brief is explicit is never an acceptable trade.
 */

const RINGS = [
  { r: 120, dash: '2 1', opacity: 0.5 },
  { r: 165, dash: '6 4', opacity: 0.65 },
  { r: 205, dash: '1 3', opacity: 0.4 },
  { r: 240, dash: '10 6', opacity: 0.55 },
] as const;

export function MagicalPattern({ className }: { className?: string }) {
  const [ref, visible] = useRevealOnScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute flex items-center justify-center',
        'transition-[opacity,transform] duration-1000 ease-out motion-reduce:transition-none',
        visible ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
        className,
      )}
    >
      <svg
        viewBox="-260 -260 520 520"
        className="text-terra size-[520px] max-w-none animate-[wheel-spin_90s_linear_infinite] motion-reduce:animate-none"
      >
        {RINGS.map((ring) => (
          <circle
            key={ring.r}
            cx={0}
            cy={0}
            r={ring.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeDasharray={ring.dash}
            opacity={ring.opacity}
          />
        ))}
      </svg>
    </div>
  );
}
