import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion', () => ({ useMotionTier: () => 0, haptic: vi.fn() }));

import CraftCorner from './CraftCorner';

describe('CraftCorner', () => {
  it('renders nothing for no crafts', () => {
    const { container } = render(<CraftCorner crafts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one corner and no tab row for a single craft', () => {
    render(<CraftCorner crafts={['pottery']} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Pottery' })).toBeInTheDocument();
    expect(screen.queryByText(/Bento/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Painting' })).toBeNull();
  });

  it('renders one tab per craft and only the selected panel', () => {
    render(<CraftCorner crafts={['cake', 'pottery', 'painting']} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Bento cakes', 'Pottery', 'Painting']);
    expect(tabs[0]!).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Bento cakes');
    fireEvent.click(tabs[2]!);
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Painting');
  });

  it('moves focus and selection with arrows, Home and End', () => {
    render(<CraftCorner crafts={['cake', 'pottery', 'painting']} />);
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(tabs[1]!).toHaveFocus();
    expect(tabs[1]!).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]!).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tabs[1]!, { key: 'End' });
    expect(tabs[2]!).toHaveFocus();
    fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' });
    expect(tabs[0]!).toHaveFocus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(tabs[2]!).toHaveFocus();
    fireEvent.keyDown(tabs[2]!, { key: 'Home' });
    expect(tabs[0]!).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Bento cakes');
  });

  it('never shows a craft the studio does not teach', () => {
    render(<CraftCorner crafts={['cake', 'painting']} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByText(/Pottery/)).toBeNull();
    expect(screen.queryByText(/Potter/)).toBeNull();
  });

  it('teaches the selected craft from its guide', () => {
    render(<CraftCorner crafts={['pottery']} />);
    expect(screen.getByRole('button', { name: 'Potter’s wheel' })).toBeInTheDocument();
    expect(screen.getByText('Wedge')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The idea' })).toBeInTheDocument();
  });

  it('tints each panel with its craft tokens', () => {
    render(<CraftCorner crafts={['cake', 'pottery']} />);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('style')).toContain('var(--craft-bento)');
    expect(panel.getAttribute('style')).toContain('var(--craft-bento-ink)');
  });
});
