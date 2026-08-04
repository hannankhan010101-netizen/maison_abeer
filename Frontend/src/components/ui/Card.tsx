import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The base surface. `sticker` applies the signature tilt — used sparingly,
 * per the prototype's own note.
 */

export interface CardProps {
  children: ReactNode;
  /** Small rotation, as though stuck on with tape. */
  sticker?: false | 'left' | 'right';
  /** Washi tape at the top edge. Only meaningful with `sticker`. */
  tape?: boolean;
  className?: string;
}

export function Card({ children, sticker = false, tape = false, className }: CardProps) {
  return (
    <div
      className={cn(
        'border-line bg-paper relative rounded-[var(--radius-lg)] border-[1.5px] p-5',
        'shadow-[var(--shadow-soft)]',
        sticker === 'left' && '-rotate-[1.3deg]',
        sticker === 'right' && 'rotate-[1.2deg]',
        className,
      )}
    >
      {tape ? (
        <span
          aria-hidden="true"
          className="bg-butter absolute -top-3 left-6 h-[22px] w-[74px] -rotate-3 rounded-[3px] opacity-75"
        />
      ) : null}
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('font-display text-lg', className)}>{children}</h3>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'text-latte mb-2.5 text-[11.5px] font-extrabold tracking-[0.14em] uppercase',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A handwritten aside — the app leaving the host a little note. */
export function HandNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('font-hand text-rose-ink text-[16.5px] leading-tight', className)}>
      {children}
    </span>
  );
}
