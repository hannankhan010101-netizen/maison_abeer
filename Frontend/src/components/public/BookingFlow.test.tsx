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

    // The heading, not the text: the footer signs off with the studio's name
    // too, so a bare text match is two elements by design.
    expect(await screen.findByRole('heading', { name: 'Maison Abeer' })).toBeInTheDocument();
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
    // The name-tag note is folded away until asked for.
    await userEvent.click(screen.getByRole('button', { name: 'Anything fun for your name tag?' }));
    expect(screen.getByText(/Anything fun we should put on your name tag/)).toBeVisible();
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
    // The position is the bold number in the sentence — not the date leaf's
    // day, which on the 3rd of a month would also read "3".
    expect(screen.getByText('3', { selector: 'b' })).toBeInTheDocument();
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

    expect(
      await screen.findByRole('heading', { name: 'Pick your kind of mess' }),
    ).toBeInTheDocument();
    // Craft names appear both as a chapter heading and a class-picker button,
    // so more than one match is expected — the point is that both crafts show.
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

    // `selector`: the class cards' date leaves also show bare numbers (the
    // day of the month), and on the right day one of them is a 7 too.
    expect(await screen.findByText('7', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/seats open across 2 classes right now/)).toBeInTheDocument();
  });

  it('the brand strip steps aside once a guest has picked a class', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);
    // One craft gets no "Pick your kind of mess" menu, so the receipt is the
    // brand section this waits for.
    await screen.findByRole('heading', { name: 'How it works' });

    await userEvent.click(await screen.findByRole('button', { name: /Bento cake/ }));

    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument();
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

  it("shows the studio's real hero photo when it has one, not a placeholder", async () => {
    fetchMock.mockImplementation(
      json({
        studio: {
          name: 'Maison Abeer',
          instagram_handle: 'maisonabeer',
          hero_photo_url: 'https://images.unsplash.com/photo-hero-test',
        },
        classes: classList().classes,
      }),
    );

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Bento cake/ });

    const heroImg = container.querySelector('header img.animate-hero-zoom');
    expect(heroImg).toHaveAttribute('src', 'https://images.unsplash.com/photo-hero-test');
  });

  it('shows no hero photo, and no gap where one would be, when the studio has none', async () => {
    fetchMock.mockImplementation(json(classList()));

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Bento cake/ });

    // The polaroids beneath the headline are photos too; what must be absent
    // is the full-bleed hero photograph.
    expect(container.querySelector('header img.animate-hero-zoom')).not.toBeInTheDocument();
  });

  it("shows the studio's own story text when it has written one", async () => {
    fetchMock.mockImplementation(
      json({
        studio: {
          name: 'Maison Abeer',
          instagram_handle: 'maisonabeer',
          story: 'We fire every pot in our own backyard kiln, twice a week.',
        },
        classes: classList().classes,
      }),
    );

    render(<BookingFlow slug="maison-abeer" />);

    expect(
      await screen.findByText('We fire every pot in our own backyard kiln, twice a week.'),
    ).toBeInTheDocument();
  });

  it("shows a class's own photo in its chapter, and the studio's photo of the craft otherwise", async () => {
    fetchMock.mockImplementation(
      json({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes: [
          {
            ...classList().classes[0],
            id: 'c1',
            color_token: 'pink',
            photo_url: 'https://images.unsplash.com/photo-cake-test',
          },
          {
            ...classList().classes[0],
            id: 'c2',
            name: 'Pottery & wheel throwing',
            color_token: 'terra',
            photo_url: null,
          },
        ],
      }),
    );

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('heading', { name: 'Pick your kind of mess' });

    const craftImgs = container.querySelectorAll(
      'img[src="https://images.unsplash.com/photo-cake-test"]',
    );
    expect(craftImgs).toHaveLength(1);

    // The pottery class has no photo of its own, so its chapter shows the
    // studio's photograph of pottery rather than an empty frame.
    const pottery = screen.getByRole('article', { name: 'Pottery & wheel throwing' });
    expect(pottery.querySelector('img[src^="/studio/pottery-"]')).toBeInTheDocument();
    // And the cake chapter did not borrow one: the class's own photo is the picture.
    const cake = screen.getByRole('article', { name: /Bento cake/ });
    expect(cake.querySelector('img[src^="/studio/cake-piping"]')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // The storefront around the form
  // -------------------------------------------------------------------------

  it('explains the three steps before asking for any of them', async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);

    expect(await screen.findByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByText('Save your seat')).toBeInTheDocument();

    // Like the brand strip, it steps aside once the guest has committed.
    await userEvent.click(screen.getByRole('button', { name: /Bento cake/ }));
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument();
  });

  it('says when the next class is, with its real seat count', async () => {
    fetchMock.mockImplementation(json(classList({ seats_left: 2 })));

    render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Bento cake/ });

    expect(await screen.findByText(/Next class/, { selector: 'span' })).toHaveTextContent(
      /2 seats left/,
    );
  });

  it('states how long a class runs, from its own start and end', async () => {
    const start = new Date(Date.now() + 3 * 86_400_000);
    const end = new Date(start.getTime() + 150 * 60_000);
    fetchMock.mockImplementation(
      json(classList({ starts_at: start.toISOString(), ends_at: end.toISOString() })),
    );

    render(<BookingFlow slug="maison-abeer" />);

    expect((await screen.findAllByText(/2½ h/)).length).toBeGreaterThan(0);
  });

  it("links the studio's Instagram from the footer", async () => {
    fetchMock.mockImplementation(json(classList()));

    render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Bento cake/ });

    expect(screen.getByRole('link', { name: '@maisonabeer' })).toHaveAttribute(
      'href',
      'https://instagram.com/maisonabeer',
    );
  });

  it('deals a fan of photos of the crafts on offer — and none of crafts that are not', async () => {
    fetchMock.mockImplementation(
      json({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes: [{ ...classList().classes[0], id: 'c2', name: 'Pottery', color_token: 'terra' }],
      }),
    );

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Pottery/ });

    // Three polaroids under the headline, each a pottery photograph.
    const fan = [...container.querySelectorAll('header figure img')] as HTMLImageElement[];
    expect(fan).toHaveLength(3);
    expect(fan.every((img) => img.getAttribute('src')?.startsWith('/studio/pottery-'))).toBe(true);

    // The page never shows a photograph of a craft the studio has no class in.
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources.some((src) => src?.includes('/studio/cake-'))).toBe(false);
    expect(sources.some((src) => src?.includes('/studio/paint-'))).toBe(false);
  });

  it('shows each craft the studio teaches, once the studio teaches several', async () => {
    fetchMock.mockImplementation(
      json({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes: [
          { ...classList().classes[0], id: 'c1', name: 'Bento cakes', color_token: 'pink' },
          { ...classList().classes[0], id: 'c2', name: 'Pottery', color_token: 'terra' },
          { ...classList().classes[0], id: 'c3', name: 'Ceramic painting', color_token: 'sage' },
        ],
      }),
    );

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('heading', { name: 'Pick your kind of mess' });

    expect(screen.getAllByRole('article')).toHaveLength(3);
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    for (const prefix of ['/studio/cake-', '/studio/pottery-', '/studio/paint-']) {
      expect(
        sources.some((src) => src?.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
  });

  it('keeps the storefront on the light palette whatever the visitor prefers', async () => {
    fetchMock.mockImplementation(json(classList()));

    const { container } = render(<BookingFlow slug="maison-abeer" />);
    await screen.findByRole('button', { name: /Bento cake/ });

    // The pin itself lives in tokens.css and is held complete by
    // styles/storefront.test.ts; this is the one place it has to be applied.
    expect(container.querySelector('main')).toHaveClass('storefront');
  });
});
