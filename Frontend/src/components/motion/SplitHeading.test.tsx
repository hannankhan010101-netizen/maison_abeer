import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SplitHeading } from './SplitHeading';

describe('SplitHeading', () => {
  it('is named by its whole text, whatever it was split into', () => {
    render(<SplitHeading text="Maison Abeer" as="h1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Maison Abeer' })).toBeInTheDocument();
  });

  it('draws one span per letter, all hidden from assistive technology', () => {
    const { container } = render(<SplitHeading text="Maison Abeer" />);

    const letters = container.querySelectorAll('[data-letter]');
    expect(letters).toHaveLength(11); // the space is not a letter
    for (const letter of letters) {
      expect(letter.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect([...letters].map((letter) => letter.textContent).join('')).toBe('MaisonAbeer');
  });

  it('keeps each word whole, so the line can only break between words', () => {
    const { container } = render(<SplitHeading text="Maison Abeer" />);

    const words = container.querySelectorAll('[data-word]');
    expect(words).toHaveLength(2);
    for (const word of words) expect(word).toHaveClass('whitespace-nowrap');
  });

  it('staggers the letters in order, starting after the delay it was given', () => {
    const { container } = render(<SplitHeading text="Hi you" staggerMs={30} startDelayMs={200} />);

    const delays = [...container.querySelectorAll<HTMLElement>('[data-letter]')].map((letter) =>
      parseFloat(letter.style.animationDelay),
    );

    expect(delays[0]).toBe(200);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBe(delays[i - 1]! + 30);
    }
  });

  it('survives an empty string', () => {
    const { container } = render(<SplitHeading text="" />);
    expect(container.querySelectorAll('[data-letter]')).toHaveLength(0);
  });
});
