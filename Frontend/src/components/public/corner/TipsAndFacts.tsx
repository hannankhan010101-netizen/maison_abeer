'use client';

import { useState } from 'react';

import { haptic } from '@/lib/motion';

/**
 * The craft's tips as a short list, and one fun fact on a sticker. Tapping
 * "Another fun fact" shows the next one, wrapping round; the sticker is a
 * polite live region so a screen reader hears the new fact.
 */
export function TipsAndFacts({
  tips,
  funFacts,
}: {
  tips: readonly string[];
  funFacts: readonly string[];
}) {
  const [index, setIndex] = useState(0);
  const fact = funFacts.length > 0 ? funFacts[index % funFacts.length] : null;

  return (
    <div className="corner-block">
      <h4 className="corner-block-title">Good to know</h4>
      <ul className="corner-tips">
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      {fact && (
        <div className="corner-fact">
          <p className="corner-fact-label">Fun fact</p>
          <div aria-live="polite" aria-atomic="true">
            <p key={fact} className="corner-fact-text">
              {fact}
            </p>
          </div>
          {funFacts.length > 1 && (
            <button
              type="button"
              className="corner-fact-next"
              onClick={() => {
                haptic('tap');
                setIndex((current) => (current + 1) % funFacts.length);
              }}
            >
              Another fun fact
            </button>
          )}
        </div>
      )}
    </div>
  );
}
