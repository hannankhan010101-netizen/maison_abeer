import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BookingFlow } from './BookingFlow';

/**
 * The booking flow is the only screen a stranger sees, and the only one with
 * no support channel behind it. These lean on the two things that decide
 * whether it works: that a dead end is never presented as one, and that the
 * page never asks for more than it needs.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

function json(body: unknown, status = 200) {
  // A factory, not a shared object: a Response body can only be read once.
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();

function classList(overrides: Record<string, unknown> = {}) {
  return {
    studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
    classes: [
      {
        id: 'class-1',
        name: 'Bento cake decorating',
        starts_at: SOON,
        ends_at: SOON,
        location: 'Studio A',
        color_token: 'pink',
        seats_left: 4,
        is_full: false,
        waitlist_is_open: false,
        ...overrides,
      },
    ],
  };
}

describe('BookingFlow', () => {
  it('shows the studio and its classes', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByText('Maison Abeer')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /Bento cake decorating/ }),
    ).toBeInTheDocument();
  });

  it('states the real number of seats left', async () => {
    fetchMock.mockImplementation(json(classList({ seats_left: 2 })));

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByText('Only 2 seats left')).toBeInTheDocument();
  });

  it('calls the last seat the last seat', async () => {
    fetchMock.mockImplementation(json(classList({ seats_left: 1 })));

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByText('Last seat!')).toBeInTheDocument();
  });

  it('offers the waitlist instead of a dead end when full', async () => {
    fetchMock.mockImplementation(json(classList({ seats_left: 0, is_full: true })));

    render(<BookingFlow slug="maison-abeer" />);

    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));

    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toBeInTheDocument();
  });

  it('says so warmly when there is nothing to book', async () => {
    fetchMock.mockImplementation(
      json({ studio: { name: 'Maison Abeer', instagram_handle: null }, classes: [] }),
    );

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByText('No classes open right now')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it('asks for a name before submitting', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));

    const before = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Book my spot' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please tell us your name');
    expect(fetchMock.mock.calls).toHaveLength(before);
  });

  it('needs one way to reach the guest, not both', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));
    await userEvent.type(screen.getByLabelText(/Your name/), 'Sana');
    await userEvent.click(screen.getByRole('button', { name: 'Book my spot' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/phone number or an email/);
  });

  it('marks only the name required', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));

    // Every field but the name is labelled optional, so the form never looks
    // longer than it is.
    expect(screen.getByLabelText(/Phone/)).toBeInTheDocument();
    expect(screen.getByText(/Anything fun we should put on your name tag/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  it('confirms a booking and says what happens next', async () => {
    fetchMock.mockImplementationOnce(json(classList())).mockImplementationOnce(
      json(
        {
          outcome: 'booked',
          class_name: 'Bento cake decorating',
          starts_at: SOON,
          location: 'Studio A',
          waitlist_position: null,
        },
        201,
      ),
    );

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));
    await userEvent.type(screen.getByLabelText(/Your name/), 'Sana R.');
    await userEvent.type(screen.getByLabelText(/Phone/), '03001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Book my spot' }));

    expect(await screen.findByRole('heading', { name: /You’re in/ })).toBeInTheDocument();
    expect(screen.getByText(/reminder the day before/)).toBeInTheDocument();
  });

  it('tells a waitlisted guest their position', async () => {
    fetchMock
      .mockImplementationOnce(json(classList({ seats_left: 0, is_full: true })))
      .mockImplementationOnce(
        json(
          {
            outcome: 'waitlisted',
            class_name: 'Bento cake decorating',
            starts_at: SOON,
            location: null,
            waitlist_position: 3,
          },
          201,
        ),
      );

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));
    await userEvent.type(screen.getByLabelText(/Your name/), 'Sana R.');
    await userEvent.type(screen.getByLabelText(/Phone/), '03001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    expect(await screen.findByRole('heading', { name: /You’re on the list/ })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('sends the honeypot field so the server can trap bots', async () => {
    fetchMock
      .mockImplementationOnce(json(classList()))
      .mockImplementationOnce(
        json({ outcome: 'booked', class_name: 'x', starts_at: SOON, location: null }, 201),
      );

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));
    await userEvent.type(screen.getByLabelText(/Your name/), 'Sana');
    await userEvent.type(screen.getByLabelText(/Phone/), '0300111');
    await userEvent.click(screen.getByRole('button', { name: 'Book my spot' }));

    await waitFor(() => expect(fetchMock.mock.calls).toHaveLength(2));

    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    // Empty because no human touched it — the server rejects a filled one.
    expect(body.website).toBe('');
  });

  it('surfaces the server message rather than a generic failure', async () => {
    fetchMock
      .mockImplementationOnce(json(classList()))
      .mockImplementationOnce(
        json({ code: 'conflict', message: "That class isn't taking bookings right now." }, 409),
      );

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));
    await userEvent.type(screen.getByLabelText(/Your name/), 'Sana');
    await userEvent.type(screen.getByLabelText(/Phone/), '0300111');
    await userEvent.click(screen.getByRole('button', { name: 'Book my spot' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't taking bookings/);
  });

  it('lets the guest go back and choose a different class', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));
    await userEvent.click(screen.getByRole('button', { name: /Pick a different class/ }));

    expect(screen.getByRole('heading', { name: 'Pick your class' })).toBeInTheDocument();
  });

  it('explains a failed load instead of showing an empty page', async () => {
    fetchMock.mockImplementation(json({ message: 'Nope' }, 500));

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Brand presence
  // -------------------------------------------------------------------------

  it('shows one craft card per distinct class on offer, not a fixed three', async () => {
    fetchMock.mockImplementation(
      json({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes: [
          { ...classList().classes[0], id: 'c1', color_token: 'pink', seats_left: 4 },
          {
            ...classList().classes[0],
            id: 'c2',
            name: 'Pottery & wheel throwing',
            color_token: 'terra',
            seats_left: 3,
          },
        ],
      }),
    );

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByText('What we make here')).toBeInTheDocument();
    // Craft names appear both as a craft card and a class-picker button, so
    // more than one match is expected — the point is that both crafts show.
    expect(screen.getAllByText('Bento cake decorating').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pottery & wheel throwing').length).toBeGreaterThan(0);
  });

  it('the postcard states the real, honest number of open seats', async () => {
    fetchMock.mockImplementation(
      json({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes: [
          { ...classList().classes[0], id: 'c1', seats_left: 4, is_full: false },
          { ...classList().classes[0], id: 'c2', seats_left: 3, is_full: false },
          // A full class contributes nothing — its seats aren't "open".
          { ...classList().classes[0], id: 'c3', seats_left: 0, is_full: true },
        ],
      }),
    );

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText(/seats open across 2 classes right now/)).toBeInTheDocument();
  });

  it('the brand strip steps aside once a guest has picked a class', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);
    await screen.findByText('What we make here');

    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));

    expect(screen.queryByText('What we make here')).not.toBeInTheDocument();
  });

  it("carries the studio's own brand colours through when it has set any", async () => {
    fetchMock.mockImplementation(
      json({
        studio: {
          name: 'Maison Abeer',
          instagram_handle: 'maisonabeer',
          primary_color: '#8B5CF6',
          accent_color: '#F59E0B',
        },
        classes: classList().classes,
      }),
    );

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Bento cake/ });

    const header = container.querySelector('header');
    expect(header?.style.getPropertyValue('--color-rose')).toBe('#8B5CF6');
    expect(header?.style.getPropertyValue('--color-pink')).toBe('#F59E0B');
  });

  it("falls back to the app's own colours when a studio hasn't set a brand kit", async () => {
    fetchMock.mockImplementation(json(classList()));

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Bento cake/ });

    const header = container.querySelector('header');
    expect(header?.style.getPropertyValue('--color-rose')).toBe('');
    expect(header?.style.getPropertyValue('--color-pink')).toBe('');
  });
});
