import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';

/**
 * A heading whose letters arrive one after another.
 *
 * Split in React, not by a library: it is rendered on the server, so the
 * headline is in the first paint with no script, and it costs no bytes.
 *
 * Three things keep it a heading and not a decoration:
 *
 * - The whole text is in a screen-reader-only span, and the split letters are
 *   `aria-hidden`, so the accessible name is the sentence rather than a spelled
 *   word — and `getByRole('heading', { name })` finds it.
 * - Each word is `white-space: nowrap`, so the line can only break between
 *   words. Without that, `inline-block` letters would let "Abeer" break in the
 *   middle of a word.
 * - Letters are `inline-block` (they must be, to be transformed), which costs
 *   the kerning *between* letters. At display size that is the lesser evil.
 *
 * The entrance is the existing `rise-in`, which the global reduced-motion rule
 * already collapses.
 */
export interface SplitHeadingProps {
  text: string;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  /** Gap between one letter and the next, in ms. */
  staggerMs?: number;
  /** Wait before the first letter, in ms. */
  startDelayMs?: number;
}

export function SplitHeading({
  text,
  as: Tag = 'h2',
  className,
  staggerMs = 28,
  startDelayMs = 0,
}: SplitHeadingProps) {
  // One running index across words, so the stagger carries through the sentence.
  let index = 0;

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text
          .split(' ')
          .filter(Boolean)
          .map((word, wordIndex) => (
            <span key={`${word}-${wordIndex}`}>
              {wordIndex > 0 ? ' ' : null}
              <span data-word className="inline-block whitespace-nowrap">
                {Array.from(word).map((letter, letterIndex) => {
                  const style: CSSProperties = {
                    animationDelay: `${startDelayMs + index * staggerMs}ms`,
                  };
                  index += 1;

                  return (
                    <span
                      key={`${letter}-${letterIndex}`}
                      data-letter
                      className={cn('animate-rise-in inline-block')}
                      style={style}
                    >
                      {letter}
                    </span>
                  );
                })}
              </span>
            </span>
          ))}
      </span>
    </Tag>
  );
}
