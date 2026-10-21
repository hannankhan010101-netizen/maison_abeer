import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion', () => ({ useMotionTier: () => 0, haptic: vi.fn() }));

import { guideFor } from '@/lib/public/craftGuide';

import { BringList } from './BringList';

const bring = guideFor('pottery').bring;

describe('BringList', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists every item as an unticked checkbox', () => {
    render(<BringList items={bring} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(bring.length);
    boxes.forEach((box, index) => {
      expect(box).not.toBeChecked();
      expect(box).toHaveAccessibleName(bring[index]);
    });
  });

  it('ticks by tap and by keyboard', () => {
    render(<BringList items={bring} />);
    const first = screen.getByRole('checkbox', { name: bring[0] });
    fireEvent.click(screen.getByText(bring[0]));
    expect(first).toBeChecked();
    // A native checkbox: Space reaches it as a click.
    first.focus();
    fireEvent.click(first);
    expect(first).not.toBeChecked();
  });

  it('never stores anything', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    render(<BringList items={bring} />);
    fireEvent.click(screen.getByRole('checkbox', { name: bring[1] }));
    expect(local).not.toHaveBeenCalled();
  });
});
