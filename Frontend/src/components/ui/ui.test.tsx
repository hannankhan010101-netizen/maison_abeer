import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AlertCard } from './AlertCard';
import { Announcer } from './Announcer';
import { Button } from './Button';
import { CapacityRing, RING_CIRCUMFERENCE, deriveState } from './CapacityRing';
import { Chip } from './Chip';
import { FrostingCheckbox } from './FrostingCheckbox';
import { Icing } from './Icing';

describe('Icing', () => {
  it('exposes progress to assistive technology', () => {
    render(<Icing value={4} max={6} label="Prep for Saturday" />);

    const bar = screen.getByRole('progressbar', { name: 'Prep for Saturday' });
    expect(bar).toHaveAttribute('aria-valuenow', '4');
    expect(bar).toHaveAttribute('aria-valuemax', '6');
    expect(bar).toHaveAttribute('aria-valuetext', '4 of 6 done');
  });

  it('fills proportionally', () => {
    render(<Icing value={3} max={4} label="Prep" />);
    expect(screen.getByTestId('icing-fill')).toHaveStyle({ width: '75%' });
  });

  it('does not divide by zero on an empty checklist', () => {
    render(<Icing value={0} max={0} label="Prep" />);
    expect(screen.getByTestId('icing-fill')).toHaveStyle({ width: '0%' });
  });

  it('clamps values outside the range', () => {
    render(<Icing value={99} max={5} label="Prep" />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByTestId('icing-fill')).toHaveStyle({ width: '100%' });
  });
});

describe('CapacityRing', () => {
  it('announces the seat count as text, not just colour', () => {
    render(<CapacityRing booked={8} seats={10} />);
    expect(screen.getByRole('img', { name: '8 of 10 seats booked' })).toBeInTheDocument();
  });

  it('matches the prototype geometry at 8 of 10', () => {
    render(<CapacityRing booked={8} seats={10} />);

    const offset = Number(
      screen.getByTestId('capacity-ring-fill').getAttribute('stroke-dashoffset'),
    );
    // The prototype hardcodes stroke-dashoffset: 53 for this state.
    expect(offset).toBeCloseTo(52.8, 0);
    expect(RING_CIRCUMFERENCE).toBeCloseTo(263.9, 0);
  });

  it('closes the ring completely when sold out', () => {
    render(<CapacityRing booked={10} seats={10} />);
    expect(screen.getByTestId('capacity-ring-fill')).toHaveAttribute('stroke-dashoffset', '0');
  });

  it.each([
    [0, 10, 'open'],
    [3, 10, 'open'],
    [4, 10, 'filling'],
    [8, 10, 'nearly_full'],
    [10, 10, 'sold_out'],
    [11, 10, 'sold_out'],
    [0, 0, 'sold_out'],
  ])('derives state for %i of %i seats', (booked, seats, expected) => {
    // Mirrors the backend thresholds so copy and colour never disagree.
    expect(deriveState(booked, seats)).toBe(expected);
  });
});

describe('Button', () => {
  it('meets the 44px minimum touch target in every size', () => {
    const { rerender } = render(<Button size="md">print name tags</Button>);
    expect(screen.getByRole('button')).toHaveClass('min-h-[44px]');

    rerender(<Button size="sm">assign</Button>);
    expect(screen.getByRole('button')).toHaveClass('min-h-[44px]');
  });

  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>adjust seats</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('blocks clicks while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="printing…" onClick={onClick}>
        print
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('printing…');

    await userEvent.click(button, { pointerEventsCheck: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('uses cocoa ink on filled variants, never white', () => {
    render(<Button variant="primary">go</Button>);
    // White on rose measured 2.62:1; the token resolves to cocoa (4.80:1).
    expect(screen.getByRole('button')).toHaveClass('text-on-rose');
  });
});

describe('Chip', () => {
  it('gives the allergy chip a spoken prefix', () => {
    render(
      <Chip tone="allergy" srPrefix="Allergy:">
        Nut allergy
      </Chip>,
    );

    // Colour alone must never carry health-adjacent meaning.
    expect(screen.getByText('Allergy:')).toHaveClass('sr-only');
    expect(screen.getByText('Nut allergy')).toBeInTheDocument();
  });

  it('applies the craft tone that identifies a class type', () => {
    const { container } = render(<Chip tone="terra">pottery</Chip>);
    expect(container.firstChild).toHaveClass('bg-terra-soft', 'text-terra-deep');
  });
});

describe('FrostingCheckbox', () => {
  it('associates its label so the whole row is clickable', async () => {
    const onChange = vi.fn();
    render(<FrostingCheckbox id="c1" label="Load kiln for glaze pieces" onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Load kiln for glaze pieces'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks overdue steps with more than colour', () => {
    render(<FrostingCheckbox id="c2" label="Load kiln" meta="due today — don't forget!" overdue />);

    // The wording itself signals urgency; the tint is reinforcement.
    expect(screen.getByText(/due today/)).toHaveClass('text-danger');
  });

  it('is keyboard operable', async () => {
    const onChange = vi.fn();
    render(<FrostingCheckbox id="c3" label="Wedge clay" onChange={onChange} />);

    await userEvent.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();

    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('AlertCard', () => {
  it('announces critical alerts', () => {
    render(<AlertCard tone="critical" title="Kiln alert" description="Load by 6 pm" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Kiln alert');
  });

  it('does not interrupt for gentle nudges', () => {
    render(<AlertCard tone="gentle" title="Waitlist +1" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides decorative icons from assistive technology', () => {
    const { container } = render(<AlertCard title="Kiln alert" icon="🔥" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('🔥');
  });
});

/**
 * The live region, and the four ways it can be silent while looking right.
 *
 * No test in this repo can hear a screen reader — jsdom has no assistive
 * technology and Playwright drives a Chromium with none attached — so these
 * assert the mechanical preconditions AT needs before it will speak: the
 * right role, a node that survives the change, exactly one announcement per
 * change, and nothing read out that the host did not ask for. ADR 0004
 * records the rest as a human pass with VoiceOver and NVDA.
 */
describe('Announcer', () => {
  it('is a polite status region, empty on arrival', () => {
    render(<Announcer state="6 guests" />);

    const region = screen.getByTestId('announcer');

    // `role="status"` rather than a bare `aria-live="polite"` div: status
    // implies `aria-atomic="true"`, so "Week of August 10" is read as one
    // sentence instead of as the words that changed since the last one.
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveClass('sr-only');

    // The count the page loaded with is not news. Announcing it would read
    // the result of opening a page back at the host who just opened it.
    expect(region.textContent).toBe('');
  });

  it('speaks the first state when the host is the one who caused it', () => {
    // /chat's case: `state` is null only because no room is open, so the
    // first non-null value *is* the tap. Suppressing it would leave the only
    // announcement on a one-room studio unspoken, and an e2e written against
    // it would have to click twice to see anything.
    render(<Announcer state="Reading The lounge" announceFirst />);

    expect(screen.getByTestId('announcer').textContent).toBe('Reading The lounge');
  });

  it('announces a change without replacing the node', () => {
    const { rerender } = render(<Announcer state="6 guests" />);
    const region = screen.getByTestId('announcer');

    rerender(<Announcer state="2 guests, regulars" />);

    // The defect this component exists to fix: the old region had its text
    // *inserted with it*, because it lived inside the branch that re-rendered.
    // AT announces changes to a region it is already watching, so the node
    // identity is the guarantee — not the text.
    expect(screen.getByTestId('announcer')).toBe(region);
    expect(region.isConnected).toBe(true);
    expect(region.textContent).toBe('2 guests, regulars');
  });

  it('keeps the last sentence while the next state is unknown', () => {
    const { rerender } = render(<Announcer state="6 guests" announceFirst />);
    const region = screen.getByTestId('announcer');

    // A refetch: `isPending` again, nothing to say. Clearing the region here
    // would make the identical value that comes back a *change*, and the host
    // would hear the same count twice for one tap.
    rerender(<Announcer state={null} announceFirst />);
    expect(region.textContent).toBe('6 guests');

    rerender(<Announcer state="6 guests" announceFirst />);
    expect(region.textContent).toBe('6 guests');
  });

  it('does not touch the DOM for a state that has not changed', () => {
    const { rerender } = render(<Announcer state="6 guests" />);
    const region = screen.getByTestId('announcer');

    rerender(<Announcer state="1 guest" />);
    expect(region.textContent).toBe('1 guest');

    /*
     * Searching "sana" and then "sanaa" is one guest either way. The region
     * must say nothing the second time: forcing a mutation — an invisible
     * counter, a zero-width space — would make it fire on states that did not
     * change, which is the noise this component is for. The silence is
     * recorded as a deliberate limit in ADR 0004, not fixed here.
     */
    const observer = new MutationObserver(() => {});
    observer.observe(region, { childList: true, characterData: true, subtree: true });

    rerender(<Announcer state="1 guest" />);

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});
