import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mayAnimate } = vi.hoisted(() => ({ mayAnimate: vi.fn(() => true) }));

vi.mock('@/lib/public/useMayAnimate', () => ({ useMayAnimate: mayAnimate }));

import { VerbRoll } from './VerbRoll';

/**
 * The hero's rolling verb. Decoration only — the sentence a screen reader hears
 * lives beside it — so it must be hidden from assistive tech, never shift the
 * line, stop when nobody is looking, and stand still under reduced motion.
 */

const VERBS = ['throw', 'centre', 'trim'];

function verbs(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-verb]')];
}

function verb(container: HTMLElement, text: string) {
  return verbs(container).find((node) => node.textContent === text)!;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mayAnimate.mockReset();
  mayAnimate.mockReturnValue(true);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VerbRoll', () => {
  it('renders every verb in one aria-hidden inline grid, the first active', () => {
    const { container } = render(<VerbRoll verbs={VERBS} />);

    const roll = container.firstElementChild as HTMLElement;
    expect(roll).toHaveAttribute('aria-hidden', 'true');
    expect(roll).toHaveClass('verb-roll', 'inline-grid');
    expect(verbs(container).map((node) => node.textContent)).toEqual(VERBS);
    for (const node of verbs(container)) expect(node).toHaveClass('[grid-area:1/1]');
    expect(verb(container, 'throw')).toHaveAttribute('data-active');
    expect(verb(container, 'centre')).not.toHaveAttribute('data-active');
  });

  it('after 2600ms the second verb is active and the first is leaving', () => {
    const { container } = render(<VerbRoll verbs={VERBS} />);

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(verb(container, 'centre')).toHaveAttribute('data-active');
    expect(verb(container, 'throw')).toHaveAttribute('data-leaving');
    expect(verb(container, 'throw')).not.toHaveAttribute('data-active');
    expect(verb(container, 'trim')).not.toHaveAttribute('data-leaving');
  });

  it('wraps from the last verb back to the first', () => {
    const { container } = render(<VerbRoll verbs={VERBS} />);

    act(() => {
      vi.advanceTimersByTime(2600 * 3);
    });

    expect(verb(container, 'throw')).toHaveAttribute('data-active');
    expect(verb(container, 'trim')).toHaveAttribute('data-leaving');
  });

  it('renders only the first verb, still, when it may not animate', () => {
    mayAnimate.mockReturnValue(false);
    const { container } = render(<VerbRoll verbs={VERBS} />);

    expect(verbs(container).map((node) => node.textContent)).toEqual(['throw']);
    act(() => {
      vi.advanceTimersByTime(2600 * 2);
    });
    expect(verbs(container).map((node) => node.textContent)).toEqual(['throw']);
  });

  it('renders a single verb statically', () => {
    const { container } = render(<VerbRoll verbs={['pipe']} />);
    expect(verbs(container).map((node) => node.textContent)).toEqual(['pipe']);
  });

  it('says "make" when given no verbs', () => {
    const { container } = render(<VerbRoll verbs={[]} />);
    expect(verbs(container).map((node) => node.textContent)).toEqual(['make']);
  });

  it('stops advancing while the tab is hidden, and resumes when it is back', () => {
    const { container } = render(<VerbRoll verbs={VERBS} />);

    setVisibility('hidden');
    act(() => {
      vi.advanceTimersByTime(2600 * 2);
    });
    expect(verb(container, 'throw')).toHaveAttribute('data-active');

    setVisibility('visible');
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(verb(container, 'centre')).toHaveAttribute('data-active');
  });

  it('pauses while hovered', () => {
    const { container } = render(<VerbRoll verbs={VERBS} />);
    const roll = container.firstElementChild as HTMLElement;

    fireEvent.pointerEnter(roll);
    act(() => {
      vi.advanceTimersByTime(2600 * 2);
    });
    expect(verb(container, 'throw')).toHaveAttribute('data-active');

    fireEvent.pointerLeave(roll);
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(verb(container, 'centre')).toHaveAttribute('data-active');
  });
});
