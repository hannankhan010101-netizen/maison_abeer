'use client';

import { useId, useState } from 'react';

import { visibleFaq, type GuideFaq } from '@/lib/public/craftGuide';

/**
 * Questions and answers, one tap to open each. Only entries with an answer are
 * ever drawn: an unanswered `owner` question stays hidden until the studio
 * writes its answer in. Duplicate ids are shown once.
 */
export function FaqAccordion({ entries }: { entries: readonly GuideFaq[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const base = useId();

  const seen = new Set<string>();
  const shown = visibleFaq(entries).filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  if (shown.length === 0) return null;

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="corner-block">
      <h4 className="corner-block-title">Questions</h4>
      <ul className="corner-faq">
        {shown.map((entry) => {
          const isOpen = open.has(entry.id);
          const answerId = `${base}-${entry.id}`;
          return (
            <li key={entry.id} className="corner-faq-item">
              <button
                type="button"
                className="corner-faq-button"
                aria-expanded={isOpen}
                aria-controls={answerId}
                onClick={() => toggle(entry.id)}
              >
                {entry.q}
              </button>
              <div id={answerId} className="corner-faq-answer" hidden={!isOpen}>
                {isOpen && <p>{entry.a}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
