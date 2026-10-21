import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HowItWorks } from './HowItWorks';

const LINES = [
  ['Pick a class', 'See what’s on below and tap the one you like the look of.'],
  ['Save your seat', 'Your name and one way to reach you. That really is the whole form.'],
  [
    'Come make something',
    'We’ll remind you the day before. Aprons are on us — just bring yourself.',
  ],
] as const;

describe('HowItWorks, as a receipt', () => {
  it('keeps its anchor, its name and its heading', () => {
    const { container } = render(<HowItWorks />);

    const section = container.querySelector('section#how-it-works')!;
    expect(section).toHaveAttribute('aria-labelledby', 'how-heading');
    expect(screen.getByRole('heading', { level: 2, name: 'How it works' })).toHaveAttribute(
      'id',
      'how-heading',
    );
    expect(screen.getByText('easy as one, two, three')).toBeInTheDocument();
    expect(section.className).toMatch(/sm:max-w-\[640px\]/);
  });

  it('prints three numbered lines on one receipt, the same three sentences', () => {
    render(<HowItWorks />);

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(list).toHaveClass('receipt');

    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    items.forEach((item, index) => {
      const [title, copy] = LINES[index]!;
      expect(item).toHaveClass('receipt__line');
      expect(within(item).getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
      expect(item).toHaveTextContent(copy);
      expect(item.querySelector('.font-display')).toHaveTextContent(String(index + 1));
    });
  });

  it('rules dashed lines between the lines and tears the foot', () => {
    const { container } = render(<HowItWorks />);

    const items = container.querySelectorAll('.receipt__line');
    for (const item of [...items].slice(1)) {
      expect(item).toHaveClass('border-t', 'border-dashed', 'border-line');
    }
    expect(items[0]).not.toHaveClass('border-t');
    expect(container.querySelector('.receipt__edge')).toBeInTheDocument();
  });
});
