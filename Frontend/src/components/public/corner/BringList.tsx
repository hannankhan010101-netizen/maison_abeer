'use client';

import { useState } from 'react';

import { haptic } from '@/lib/motion';

/**
 * What to bring and wear, as a checklist to tick off while getting ready.
 * Native checkboxes, so Space and taps both work. The ticks live in this
 * component's state only and are never stored.
 */
export function BringList({ items }: { items: readonly string[] }) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const toggle = (item: string) => {
    haptic('tap');
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  return (
    <div className="corner-block">
      <h4 className="corner-block-title">Bring and wear</h4>
      <ul className="corner-bring">
        {items.map((item) => (
          <li key={item}>
            <label className="corner-check">
              <input
                type="checkbox"
                className="corner-check-box"
                checked={ticked.has(item)}
                onChange={() => toggle(item)}
              />
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
