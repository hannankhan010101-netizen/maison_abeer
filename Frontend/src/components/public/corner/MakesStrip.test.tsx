import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { guideFor } from '@/lib/public/craftGuide';

import { MakesStrip } from './MakesStrip';

describe('MakesStrip', () => {
  it('shows the idea of the craft as stickers, word for word from the guide', () => {
    const makes = guideFor('painting').makes;
    render(<MakesStrip makes={makes} />);
    expect(screen.getByRole('heading', { name: 'The idea' })).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(makes);
  });

  it('never promises what a class produces', () => {
    render(<MakesStrip makes={guideFor('cake').makes} />);
    expect(document.body.textContent).not.toMatch(/you will make|you'll make/i);
  });
});
