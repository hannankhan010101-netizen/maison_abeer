import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CraftChapters } from './CraftChapters';
import { DateLeaf } from './DateLeaf';
import { HowItWorks, STEPS } from './HowItWorks';
import { PhotoFan } from './PhotoFan';
import { PhotoMarquee } from './PhotoMarquee';
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

  it('offers no dead Instagram link when the studio has no handle', () => {
    render(<StudioFooter studioName="Maison Abeer" handle={null} />);

    // The credit and the last "Save a seat" are always there; only the
    // studio's own channels depend on a handle.
    expect(screen.queryByRole('link', { name: /^@/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /message us/i })).not.toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// The photographs
// ---------------------------------------------------------------------------

function aClass(token: string, name = 'A class') {
  return {
    id: `${token}-1`,
    name,
    starts_at: '2026-10-23T09:00:00.000Z',
    ends_at: '2026-10-23T11:00:00.000Z',
    location: null,
    color_token: token,
    photo_url: null,
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  };
}

describe('PhotoFan', () => {
  it('draws nothing when no craft is known, rather than an empty frame', () => {
    const { container } = render(<PhotoFan classes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('deals three captioned polaroids', () => {
    render(<PhotoFan classes={[aClass('terra')]} />);

    expect(screen.getAllByRole('figure')).toHaveLength(3);
    // The cover of the craft leads.
    expect(screen.getAllByText('on the wheel').length).toBeGreaterThan(0);
  });

  it('sends a phone the small file and a laptop the large one', () => {
    render(<PhotoFan classes={[aClass('pink')]} />);

    const img = screen.getAllByRole('img')[0]!;
    expect(img.getAttribute('src')).toMatch(/-800\.jpg$/);
    expect(img.getAttribute('srcset')).toMatch(/-800\.jpg 800w, .*\.jpg 1400w/);
    // The real pixel size, so the page does not shift when it arrives.
    expect(img).toHaveAttribute('width');
    expect(img).toHaveAttribute('height');
  });
});

describe('PhotoMarquee', () => {
  it('draws nothing for a single photograph — that is a picture, not a strip', () => {
    // No craft produces fewer than three photos, so this guards the rule.
    const { container } = render(<PhotoMarquee classes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for one craft — the budget leaves it no photographs', () => {
    const { container } = render(<PhotoMarquee classes={[aClass('terra')]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lets a screen reader meet each photograph once', () => {
    render(
      <PhotoMarquee
        classes={[aClass('terra'), aClass('pink', 'Cakes'), aClass('sage', 'Paint')]}
      />,
    );

    const section = screen.getByRole('region', { name: 'The crafts, up close' });
    const described = [...section.querySelectorAll('img')].filter(
      (img) => !img.closest('[aria-hidden="true"]') && img.getAttribute('alt'),
    );

    // One of each photograph the budget left for the strip — not the repeats,
    // not the second row. Three crafts leave seven (see photoBudget.test.ts).
    expect(described).toHaveLength(7);
    expect(new Set(described.map((img) => img.getAttribute('alt'))).size).toBe(7);
  });

  it('only shows the crafts on offer', () => {
    const { container } = render(<PhotoMarquee classes={[aClass('sage')]} />);

    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources.every((src) => src?.startsWith('/studio/paint-'))).toBe(true);
  });
});

describe('CraftChapters', () => {
  it('writes a chapter per craft in the studio’s voice', () => {
    render(<CraftChapters classes={[aClass('terra', 'Pottery'), aClass('pink', 'Bento cakes')]} />);

    expect(screen.getByRole('heading', { name: 'Pick your kind of mess' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Pottery' })).toHaveTextContent(
      'clay under your fingertips',
    );
    expect(screen.getByRole('article', { name: 'Bento cakes' })).toHaveTextContent(
      'frosting is a love language',
    );
  });

  it('leads each chapter to the booking card', () => {
    render(<CraftChapters classes={[aClass('terra', 'Pottery')]} />);

    expect(screen.getByRole('link', { name: /Save a seat/ })).toHaveAttribute(
      'href',
      '#booking-widget',
    );
  });

  it('draws nothing when there are no classes', () => {
    const { container } = render(<CraftChapters classes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
