import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StorySection } from './StorySection';

/**
 * The pattern behind the story is drawn wider than the section so its edge
 * never shows. On a phone that is wider than the screen, and an unclipped
 * section let it push the whole page sideways. `e2e/story-overflow.spec.ts`
 * measures the page; this pins the wiring that stops it.
 */

describe('StorySection', () => {
  it('renders the pattern inside a clipped section', () => {
    render(<StorySection story="A small studio above the bakery." />);

    const section = screen.getByText('A small studio above the bakery.').closest('section')!;

    expect(section.className).toContain('overflow-hidden');
  });
});
