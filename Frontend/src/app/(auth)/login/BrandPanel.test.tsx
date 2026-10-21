import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandPanel } from './BrandPanel';

describe('BrandPanel', () => {
  it('keeps the sparkle on the same line as its word', () => {
    render(<BrandPanel />);

    const pair = screen.getByText('bestie ✨');

    expect(pair.className).toContain('whitespace-nowrap');
  });

  it('calls the example booking card an example', () => {
    const { container } = render(<BrandPanel />);

    // The card is aria-hidden decoration, so look at the DOM rather than the
    // accessibility tree.
    expect(container.textContent).toContain('for example');
  });
});
