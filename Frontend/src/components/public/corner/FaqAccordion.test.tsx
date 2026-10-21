import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion', () => ({ useMotionTier: () => 0, haptic: vi.fn() }));

import { COMMON_FAQ, guideFor, type GuideFaq } from '@/lib/public/craftGuide';

import CraftCorner from './CraftCorner';
import { FaqAccordion } from './FaqAccordion';

describe('FaqAccordion', () => {
  it('never renders an unanswered owner entry, and renders a filled one', () => {
    const entries: GuideFaq[] = [
      { id: 'blank', q: 'Unanswered owner question?', a: null, owner: true },
      { id: 'filled', q: 'Answered owner question?', a: 'Yes, here it is.', owner: true },
    ];
    render(<FaqAccordion entries={entries} />);
    expect(screen.queryByText('Unanswered owner question?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Answered owner question?' })).toBeInTheDocument();
  });

  it('opens and closes an answer with aria-expanded', () => {
    render(<FaqAccordion entries={COMMON_FAQ} />);
    const button = screen.getByRole('button', { name: COMMON_FAQ[0].q });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(COMMON_FAQ[0].a!)).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(COMMON_FAQ[0].a!)).toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders nothing when no entry has an answer', () => {
    const { container } = render(
      <FaqAccordion entries={[{ id: 'x', q: 'Q?', a: null, owner: true }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('combines the craft entries with the common ones inside the corner', () => {
    render(<CraftCorner crafts={['pottery']} />);
    const pottery = guideFor('pottery').faq;
    for (const entry of [...pottery, ...COMMON_FAQ]) {
      const shown = screen.queryByRole('button', { name: entry.q });
      if (entry.a) expect(shown).toBeInTheDocument();
      else expect(shown).toBeNull();
    }
    expect(screen.queryByText('How do I pay?')).toBeNull();
  });
});
