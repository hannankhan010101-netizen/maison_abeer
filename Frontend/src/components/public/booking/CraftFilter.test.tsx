import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CraftFilter } from './CraftFilter';

describe('CraftFilter', () => {
  it('renders nothing for fewer than two crafts', () => {
    const { container } = render(
      <CraftFilter crafts={['cake']} value={null} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('puts All first, marks the chosen chip, and is keyboard operable', async () => {
    const onChange = vi.fn();
    render(<CraftFilter crafts={['cake', 'pottery']} value="pottery" onChange={onChange} />);
    const chips = screen.getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['All', 'Cake', 'Pottery']);
    expect(chips[2]).toHaveAttribute('aria-pressed', 'true');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'false');

    chips[0]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(null);
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('cake');
  });
});
