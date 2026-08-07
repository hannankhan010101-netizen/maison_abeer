import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackFlow } from './FeedbackFlow';

/**
 * One tap and one word.
 *
 * The thing that decides whether this works is friction: a guest a day past a
 * class will give you exactly one interaction. These assert that the tap
 * alone is enough, and that nothing blocks it.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

const PROMPT = {
  class_name: 'Bento cake decorating',
  starts_at: new Date(Date.now() - 86_400_000).toISOString(),
  already_answered: false,
};

function json(body: unknown, status = 200) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

describe('FeedbackFlow', () => {
  it('asks about the class by name', async () => {
    fetchMock.mockImplementation(json(PROMPT));

    render(<FeedbackFlow bookingId="b-1" />);

    expect(
      await screen.findByRole('heading', { name: /How was Bento cake decorating/ }),
    ).toBeInTheDocument();
  });

  it('submits on the tap alone', async () => {
    fetchMock
      .mockImplementationOnce(json(PROMPT))
      .mockImplementationOnce(json({ ...PROMPT, already_answered: true }));

    render(<FeedbackFlow bookingId="b-1" />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Loved it' }));

    // No second "send" press — requiring one loses everyone who thought they
    // were finished.
    expect(await screen.findByRole('heading', { name: 'Thank you' })).toBeInTheDocument();
  });

  it('sends the rating that matches the emoji', async () => {
    fetchMock.mockImplementationOnce(json(PROMPT)).mockImplementationOnce(json(PROMPT));

    render(<FeedbackFlow bookingId="b-1" />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Not for me' }));

    await waitFor(() => expect(fetchMock.mock.calls).toHaveLength(2));

    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    // Ascending with sentiment: 1 = 😕, matching the column.
    expect(body.rating).toBe(1);
    expect(body.one_word).toBeNull();
  });

  it('treats an already-answered link as a correction, not an error', async () => {
    fetchMock.mockImplementation(json({ ...PROMPT, already_answered: true }));

    render(<FeedbackFlow bookingId="b-1" />);

    expect(await screen.findByText(/tap again to change it/)).toBeInTheDocument();
    // Still answerable.
    expect(screen.getByRole('radio', { name: 'Loved it' })).toBeEnabled();
  });

  it('explains a dead link rather than showing an empty page', async () => {
    fetchMock.mockImplementation(json({ message: 'gone' }, 404));

    render(<FeedbackFlow bookingId="nope" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired|no longer valid/);
  });

  it('surfaces a save failure', async () => {
    fetchMock
      .mockImplementationOnce(json(PROMPT))
      .mockImplementationOnce(json({ message: "That class hasn't happened yet." }, 409));

    render(<FeedbackFlow bookingId="b-1" />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Loved it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/hasn't happened yet/);
  });

  it('never posts a word without a rating', async () => {
    fetchMock.mockImplementation(json(PROMPT));

    render(<FeedbackFlow bookingId="b-1" />);
    const word = await screen.findByLabelText(/One word/);

    await userEvent.type(word, 'calm');
    await userEvent.tab();

    // Only the initial GET — a stray word alone is not an answer.
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});
