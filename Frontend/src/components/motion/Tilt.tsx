'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useTilt } from '@/lib/motion/useTilt';

/**
 * A card that leans toward the pointer, with a soft glare that follows it.
 *
 * The outer element owns the pointer and the perspective; the inner one is what
 * actually rotates, so the hit area never shifts under the cursor (a rotating
 * hit area flickers at its edges). Geometry is all CSS, driven by the four
 * custom properties `useTilt` writes — until a pointer arrives they are unset
 * and the card sits flat, which is also its whole behaviour on a touch screen
 * and under reduced motion.
 *
 * The glare is a radial gradient over the card, `pointer-events: none` and
 * `aria-hidden`; it appears on hover and is never information.
 */
export interface TiltProps {
  children: ReactNode;
  /** Largest lean, in degrees. */
  maxDeg?: number;
  glare?: boolean;
  className?: string;
}

export function Tilt({ children, maxDeg = 8, glare = true, className }: TiltProps) {
  const ref = useTilt<HTMLDivElement>(maxDeg);

  return (
    <div ref={ref} data-tilt className={cn('group/tilt [perspective:800px]', className)}>
      <div className="relative h-full [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring-soft)] [transform-style:preserve-3d] motion-reduce:transition-none">
        {children}
        {glare ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-[var(--dur-base)] group-hover/tilt:opacity-100 motion-reduce:hidden"
            style={{
              background:
                'radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgb(255 255 255 / 38%), transparent 55%)',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
