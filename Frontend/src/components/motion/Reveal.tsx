'use client';

import type { ComponentType, CSSProperties, ElementType, ReactNode, Ref } from 'react';

import { cn } from '@/lib/cn';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

/**
 * Content that arrives as it scrolls into view: it rises a little and fades in,
 * once.
 *
 * A thin wrapper over `useRevealOnScroll`, which already knows the three cases
 * that matter — a guest who asked for less motion gets the content at once and
 * no fade, a browser without IntersectionObserver gets it at once rather than
 * never, and everyone else gets the reveal when it is actually on screen.
 *
 * The distance and delay are inline style because they are per-use values;
 * Tailwind finds classes by reading source text and cannot see a number that is
 * only known at render time.
 */
export interface RevealProps {
  children: ReactNode;
  as?: ElementType;
  /** Wait this long after becoming visible, to stagger siblings. */
  delayMs?: number;
  /** How far it rises from, in px. */
  distance?: number;
  className?: string;
}

export function Reveal({
  children,
  as: Tag = 'div',
  delayMs = 0,
  distance = 24,
  className,
}: RevealProps) {
  const [ref, visible] = useRevealOnScroll<HTMLElement>();
  // `ElementType` is a union of every tag, so TypeScript resolves its props to
  // `never`. Say what this wrapper actually passes down.
  const Component = Tag as ComponentType<{
    ref?: Ref<HTMLElement>;
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
  }>;

  return (
    <Component
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-[var(--dur-slow)] ease-[var(--ease-out-expo)]',
        'motion-reduce:transition-none',
        className,
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : `translateY(${distance}px)`,
        transitionDelay: `${delayMs}ms`,
      }}
    >
      {children}
    </Component>
  );
}
