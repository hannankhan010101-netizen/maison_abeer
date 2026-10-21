import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BookingFlow } from '../BookingFlow';

vi.mock('@/lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/motion')>()),
  // Run the update at once, as a browser without view transitions does.
  withViewTransition: (update: () => void) => {
    update();
    return Promise.resolve();
  },
}));

const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();
const list = {
  studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
  classes: ['a', 'b'].map((id) => ({
    id,
    name: id === 'a' ? 'Bento cake' : 'Clay pots',
    starts_at: SOON,
    ends_at: SOON,
    location: 'Studio A',
    color_token: 'pink',
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  })),
};

function carriers() {
  return Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.style.viewTransitionName === 'class-leaf',
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(list), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('the class-leaf shared element across the steps', () => {
  it('is on exactly one element forward, and on the returned-from card going back', async () => {
    render(<BookingFlow slug="maison-abeer" />);

    await userEvent.click(await screen.findByRole('button', { name: /Clay pots/ }));
    // Forward: only the details stub carries it; the picker is gone.
    expect(screen.getByRole('heading', { name: 'Your details' })).toBeInTheDocument();
    expect(carriers()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Pick a different class/ }));
    // Back: only the card we came from carries it.
    expect(carriers()).toHaveLength(1);
    expect(carriers()[0]?.closest('button')).toHaveAccessibleName(/Clay pots/);

    // And a different pick after that still leaves a single carrier.
    await userEvent.click(screen.getByRole('button', { name: /Bento cake/ }));
    expect(carriers()).toHaveLength(1);
  });
});
