import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BookingResult } from '@/lib/public/api';

const haptic = vi.hoisted(() => vi.fn());
vi.mock('@/lib/motion', () => ({ haptic }));

import { Confirmation } from './Confirmation';

const TOKEN = 'secret-portal-token-123';

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
        <Confirmation result={result} token="pink" studioName="Maison Abeer" />
      </StrictMode>,
    );
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('success');
  });

  it('bursts 24 confetti pieces with fixed custom properties when motion is allowed', () => {
    stubMotion(true);
    const first = render(<Confirmation result={result} token="pink" studioName="Maison Abeer" />);
    const pieces = first.container.querySelectorAll<HTMLElement>('[data-confetti]');
    expect(pieces).toHaveLength(24);
    for (const piece of pieces) {
      for (const prop of ['--dx', '--dy', '--rot', '--delay']) {
        expect(piece.style.getPropertyValue(prop)).not.toBe('');
      }
    }
    const signature = Array.from(pieces).map((p) => p.getAttribute('style'));
    first.unmount();

    const second = render(<Confirmation result={result} token="pink" studioName="Maison Abeer" />);
    expect(
      Array.from(second.container.querySelectorAll('[data-confetti]')).map((p) =>
        p.getAttribute('style'),
      ),
    ).toEqual(signature);
  });

  it('has no confetti under reduced motion, and the check is simply drawn', () => {
    stubMotion(false);
    const { container } = render(
      <Confirmation result={result} token="pink" studioName="Maison Abeer" />,
    );
    expect(container.querySelectorAll('[data-confetti]')).toHaveLength(0);
    expect(container.querySelector('.booking-check path')).not.toBeNull();
  });

  it('draws the check only for a booked seat, never for the waitlist', () => {
    stubMotion(true);
    const { container } = render(
      <Confirmation
        result={{ ...result, outcome: 'waitlisted', waitlist_position: 2 } as BookingResult}
        token="pink"
        studioName="Maison Abeer"
      />,
    );
    expect(container.querySelector('.booking-check')).toBeNull();
  });

  it('offers to save the ticket for a booked seat, after the stub and before the portal', () => {
    stubMotion(false);
    const { container } = render(
      <Confirmation
        result={{ ...result, portal_token: TOKEN, portal_token_type: 'magiclink' }}
        token="pink"
        studioName="Maison Abeer"
      />,
    );
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Save my ticket', 'Open my portal ✨']);
  });

  it('does not promise a message for a waitlist place: the studio decides when to offer a seat', () => {
    const { container } = render(
      <Confirmation
        result={{ ...result, outcome: 'waitlisted', waitlist_position: 2 } as BookingResult}
        token="pink"
        studioName="Maison Abeer"
      />,
    );

    expect(container.textContent).not.toMatch(/straight away|message you/i);
    expect(container.textContent).toMatch(/studio can offer it to you/i);
  });

  it('offers no ticket for a waitlist place: it is not a seat', () => {
    stubMotion(false);
    render(
      <Confirmation
        result={{ ...result, outcome: 'waitlisted', waitlist_position: 2 } as BookingResult}
        token="pink"
        studioName="Maison Abeer"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Save my ticket' })).toBeNull();
  });

  it('never puts the portal token in the page text or any attribute', () => {
    stubMotion(false);
    const { container } = render(
      <Confirmation
        result={{ ...result, portal_token: TOKEN, portal_token_type: 'magiclink' }}
        token="pink"
        studioName="Maison Abeer"
      />,
    );
    expect(container.textContent).not.toContain(TOKEN);
    for (const node of container.querySelectorAll('*')) {
      for (const attribute of Array.from(node.attributes)) {
        expect(attribute.value).not.toContain(TOKEN);
      }
    }
  });
});
