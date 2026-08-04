import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AlertCard } from './AlertCard';
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
        nut allergy
      </Chip>,
    );

    // Colour alone must never carry health-adjacent meaning.
    expect(screen.getByText('Allergy:')).toHaveClass('sr-only');
    expect(screen.getByText('nut allergy')).toBeInTheDocument();
  });

  it('applies the craft tone that identifies a class type', () => {
    const { container } = render(<Chip tone="terra">pottery</Chip>);
    expect(container.firstChild).toHaveClass('bg-terra-soft', 'text-terra-deep');
  });
});

describe('FrostingCheckbox', () => {
  it('associates its label so the whole row is clickable', async () => {
    const onChange = vi.fn();
    render(<FrostingCheckbox id="c1" label="load kiln for glaze pieces" onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('load kiln for glaze pieces'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks overdue steps with more than colour', () => {
    render(<FrostingCheckbox id="c2" label="load kiln" meta="due today — don't forget!" overdue />);

    // The wording itself signals urgency; the tint is reinforcement.
    expect(screen.getByText(/due today/)).toHaveClass('text-danger');
  });

  it('is keyboard operable', async () => {
    const onChange = vi.fn();
    render(<FrostingCheckbox id="c3" label="wedge clay" onChange={onChange} />);

    await userEvent.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();

    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('AlertCard', () => {
  it('announces critical alerts', () => {
    render(<AlertCard tone="critical" title="kiln alert" description="load by 6 pm" />);
    expect(screen.getByRole('alert')).toHaveTextContent('kiln alert');
  });

  it('does not interrupt for gentle nudges', () => {
    render(<AlertCard tone="gentle" title="waitlist +1" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides decorative icons from assistive technology', () => {
    const { container } = render(<AlertCard title="kiln alert" icon="🔥" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('🔥');
  });
});
