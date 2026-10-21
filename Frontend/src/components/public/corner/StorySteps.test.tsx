import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ tier: 0 }));
vi.mock('@/lib/motion', () => ({ useMotionTier: () => motion.tier, haptic: vi.fn() }));

import { guideFor } from '@/lib/public/craftGuide';

import { StorySteps } from './StorySteps';

const steps = guideFor('cake').steps;

describe('StorySteps', () => {
  beforeEach(() => {
    motion.tier = 0;
  });

  it('renders the steps in order with their numbers', () => {
    render(<StorySteps steps={steps} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(steps.length);
    items.forEach((item, index) => {
      expect(item).toHaveTextContent(String(index + 1));
      expect(item).toHaveTextContent(steps[index]!.title);
      expect(item).toHaveTextContent(steps[index]!.text);
    });
  });

  it('is a plain ordered list at tier 0 (reduced motion)', () => {
    render(<StorySteps steps={steps} />);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(list).toHaveAttribute('data-motion', 'none');
    expect(list.className).not.toMatch(/is-reveal|is-scroll/);
  });

  it('asks the stylesheet for reveals at tier 1 and scroll-linking at tier 2', () => {
    motion.tier = 1;
    const { unmount } = render(<StorySteps steps={steps} />);
    expect(screen.getByRole('list')).toHaveClass('is-reveal');
    unmount();
    motion.tier = 2;
    render(<StorySteps steps={steps} />);
    expect(screen.getByRole('list')).toHaveClass('is-scroll');
  });
});
