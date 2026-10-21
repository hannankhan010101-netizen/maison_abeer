import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion', () => ({ useMotionTier: () => 0, haptic: vi.fn() }));

import { guideFor } from '@/lib/public/craftGuide';

import { TipsAndFacts } from './TipsAndFacts';

const { tips, funFacts } = guideFor('painting');

describe('TipsAndFacts', () => {
  it('shows every tip', () => {
    render(<TipsAndFacts tips={tips} funFacts={funFacts} />);
    for (const tip of tips) expect(screen.getByText(tip)).toBeInTheDocument();
  });

  it('advances the fun fact on tap and wraps, politely announced', () => {
    render(<TipsAndFacts tips={tips} funFacts={funFacts} />);
    const live = screen.getByText(funFacts[0]!).closest('[aria-live]');
    expect(live).toHaveAttribute('aria-live', 'polite');
    const next = screen.getByRole('button', { name: /another fun fact/i });
    fireEvent.click(next);
    expect(screen.getByText(funFacts[1]!)).toBeInTheDocument();
    expect(screen.queryByText(funFacts[0]!)).toBeNull();
    for (let i = 1; i < funFacts.length; i += 1) fireEvent.click(next);
    expect(screen.getByText(funFacts[0]!)).toBeInTheDocument();
  });

  it('has no fact button when there is a single fact', () => {
    render(<TipsAndFacts tips={tips} funFacts={[funFacts[0]!]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
