import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShowcaseTicket } from './ShowcaseTicket';

/** The ticket's text with the date leaf cut out: the only place a digit may live. */
function textOutsideLeaf(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-leaf]').forEach((leaf) => leaf.remove());
  return copy.textContent ?? '';
}

describe('ShowcaseTicket', () => {
  it('says "for example" in the page\'s own hand', () => {
    const { container } = render(<ShowcaseTicket />);
    const note = [...container.querySelectorAll('.font-hand')].find((el) =>
      el.textContent?.includes('for example'),
    );
    expect(note, 'no font-hand element says "for example"').toBeTruthy();
  });

  it('invents no number: no digit outside the date leaf', () => {
    const { container } = render(<ShowcaseTicket />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.querySelector('[data-leaf]'), 'the date leaf is missing').not.toBeNull();
    expect(textOutsideLeaf(root)).toMatch(/^\D*$/);
    expect(container.textContent).not.toMatch(/seats|nearly full/i);
  });

  it('is decoration, hidden from the accessibility tree', () => {
    const { container } = render(<ShowcaseTicket />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});
