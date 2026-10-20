import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DateLeaf } from './DateLeaf';
import { HowItWorks, STEPS } from './HowItWorks';
import { StudioFooter } from './StudioFooter';
import { StudioRibbon, ribbonItems } from './StudioRibbon';

/**
 * The sections around the booking form. Each is small; what matters is the
 * promise it makes — the steps are the true ones, the footer never links
 * nowhere, the ribbon never advertises a craft the studio does not run.
 */

describe('HowItWorks', () => {
  it('tells the whole booking in three steps, in order', () => {
    render(<HowItWorks />);

    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(
      STEPS.map((step, index) => `${index + 1}${step.title}${step.copy}`),
    );
  });

  it('is the target the hero’s "How it works" link scrolls to', () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelector('#how-it-works')).toBeInTheDocument();
  });
});

describe('StudioFooter', () => {
  it('links the Instagram handle in a new tab, safely', () => {
    render(<StudioFooter studioName="Maison Abeer" handle="maisonabeer" />);

    const link = screen.getByRole('link', { name: '@maisonabeer' });
    expect(link).toHaveAttribute('href', 'https://instagram.com/maisonabeer');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('offers no dead link when the studio has no handle', () => {
    render(<StudioFooter studioName="Maison Abeer" handle={null} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/see you at the studio/)).toBeInTheDocument();
  });
});

describe('StudioRibbon', () => {
  it('weaves the real crafts between the studio phrases, each once', () => {
    expect(ribbonItems(['Pottery', 'Made by hand'])).toEqual([
      'Pottery',
      'Made by hand',
      'Small groups',
      'Aprons on us',
      'Just bring yourself',
    ]);
  });

  it('draws the track twice for the loop but reads it once', () => {
    render(<StudioRibbon crafts={['Pottery']} />);

    expect(screen.getAllByText('Pottery')).toHaveLength(2);
    // The second copy is aria-hidden, so only one list reaches a screen reader.
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(screen.getAllByRole('list', { hidden: true })).toHaveLength(2);
  });
});

describe('DateLeaf', () => {
  it('stays blank until the browser clock is known, so it never hydrates wrong', () => {
    const { container } = render(
      <DateLeaf iso="2026-10-23T07:00:00.000Z" token="terra" ready={false} />,
    );

    expect(container.textContent?.trim()).toBe('');
  });

  it('shows the day large with the weekday and month beneath', () => {
    const iso = new Date(2026, 9, 23, 12).toISOString();
    const { container } = render(<DateLeaf iso={iso} token="terra" ready />);

    expect(container.textContent).toContain('23');
    expect(container.textContent).toMatch(/Fri\s+Oct/i);
  });
});
