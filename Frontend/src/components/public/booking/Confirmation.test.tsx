import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BookingResult } from '@/lib/public/api';

const haptic = vi.hoisted(() => vi.fn());
vi.mock('@/lib/motion', () => ({ haptic }));

import { Confirmation } from './Confirmation';

const result = {
  outcome: 'booked',
  class_name: 'Bento cake',
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  location: null,
  waitlist_position: null,
} as BookingResult;

function stubMotion(allowed: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? !allowed : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => haptic.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('Confirmation', () => {
  it('buzzes success exactly once, even under StrictMode double effects', () => {
    stubMotion(true);
    render(
      <StrictMode>
        <Confirmation result={result} token="pink" />
      </StrictMode>,
    );
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('success');
  });

  it('bursts 24 confetti pieces with fixed custom properties when motion is allowed', () => {
    stubMotion(true);
    const first = render(<Confirmation result={result} token="pink" />);
    const pieces = first.container.querySelectorAll<HTMLElement>('[data-confetti]');
    expect(pieces).toHaveLength(24);
    for (const piece of pieces) {
      for (const prop of ['--dx', '--dy', '--rot', '--delay']) {
        expect(piece.style.getPropertyValue(prop)).not.toBe('');
      }
    }
    const signature = Array.from(pieces).map((p) => p.getAttribute('style'));
    first.unmount();

    const second = render(<Confirmation result={result} token="pink" />);
    expect(
      Array.from(second.container.querySelectorAll('[data-confetti]')).map((p) =>
        p.getAttribute('style'),
      ),
    ).toEqual(signature);
  });

  it('has no confetti under reduced motion, and the check is simply drawn', () => {
    stubMotion(false);
    const { container } = render(<Confirmation result={result} token="pink" />);
    expect(container.querySelectorAll('[data-confetti]')).toHaveLength(0);
    expect(container.querySelector('.booking-check path')).not.toBeNull();
  });

  it('draws the check only for a booked seat, never for the waitlist', () => {
    stubMotion(true);
    const { container } = render(
      <Confirmation
        result={{ ...result, outcome: 'waitlisted', waitlist_position: 2 } as BookingResult}
        token="pink"
      />,
    );
    expect(container.querySelector('.booking-check')).toBeNull();
  });
});
