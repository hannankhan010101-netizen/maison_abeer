import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PublicClass } from '@/lib/public/api';

import { DetailsStep } from './DetailsStep';

const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();
const item = {
  id: 'class-1',
  name: 'Bento cake',
  starts_at: SOON,
  ends_at: SOON,
  location: 'Studio A',
  color_token: 'pink',
  seats_left: 4,
  is_full: false,
  waitlist_is_open: false,
} as PublicClass;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('DetailsStep', () => {
  it('shows allergies at once and keeps the name-tag note behind a disclosure', () => {
    render(<DetailsStep slug="s" item={item} onBack={() => {}} onDone={() => {}} />);

    // Safety-critical: visible with no interaction at all.
    expect(screen.getByRole('textbox', { name: /allergies/i })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /name tag/i })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Anything fun for your name tag?' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.getAttribute('aria-controls')).toBeTruthy();
  });

  it('opens the note, focuses it, and sends what was typed as note', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            outcome: 'booked',
            class_name: 'Bento cake',
            starts_at: SOON,
            location: null,
            waitlist_position: null,
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const onDone = vi.fn();
    render(<DetailsStep slug="s" item={item} onBack={() => {}} onDone={onDone} />);

    const toggle = screen.getByRole('button', { name: 'Anything fun for your name tag?' });
    await userEvent.click(toggle);

    const note = screen.getByRole('textbox', { name: /name tag/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(note).toHaveFocus();
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toContainElement(note);

    await userEvent.type(note, 'Bunny');
    // Collapsing must not lose the typed value.
    await userEvent.click(toggle);
    expect(screen.queryByRole('textbox', { name: /name tag/i })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Your name/), 'Sana');
    await userEvent.type(screen.getByLabelText(/Phone/), '0501234567');
    await userEvent.click(screen.getByRole('button', { name: 'Book my spot' }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      note: string | null;
    };
    expect(body.note).toBe('Bunny');
  });

  it('gives the details stub the shared-element name', () => {
    render(<DetailsStep slug="s" item={item} onBack={() => {}} onDone={() => {}} />);
    const carriers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
      (el) => el.style.viewTransitionName === 'class-leaf',
    );
    expect(carriers).toHaveLength(1);
  });

  it('puts the submit button in clay with a rose glow', () => {
    render(<DetailsStep slug="s" item={item} onBack={() => {}} onDone={() => {}} />);
    const submit = screen.getByRole('button', { name: 'Book my spot' });
    expect(submit).toHaveClass('clay', 'sheen-on-hover');
    expect(submit.style.getPropertyValue('--clay-glow')).toBe('var(--color-rose)');
  });
});
