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

  it('does not ask for a word until the rating is in', async () => {
    fetchMock.mockImplementation(json(PROMPT));

    render(<FeedbackFlow bookingId="b-1" />);
    await screen.findByRole('radiogroup');

    // A text field up front reads as work and suppresses the free tap. It
    // also made a stray word-without-a-rating possible; now it cannot exist.
    expect(screen.queryByLabelText(/One word/)).not.toBeInTheDocument();
  });

  it('takes the word after the tap', async () => {
    fetchMock.mockImplementation(json(PROMPT));

    render(<FeedbackFlow bookingId="b-1" />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Loved it' }));

    // The word ask lives on the thank-you screen. It used to sit above the
    // tap, where the tap's own success unmounted it before anyone could type.
    const word = await screen.findByLabelText(/One word/);
    await userEvent.type(word, 'calm');
    await userEvent.tab();

    await waitFor(() => expect(fetchMock.mock.calls).toHaveLength(3));

    const [, init] = fetchMock.mock.calls[2]!;
    // The rating is resent: the API assigns `one_word` unconditionally, so a
    // word-only body would be a different answer.
    expect(JSON.parse(String(init.body))).toEqual({ rating: 3, one_word: 'calm' });

    expect(await screen.findByText(/noted/)).toBeInTheDocument();
  });

  it('does not re-post when the word field is left empty', async () => {
    fetchMock.mockImplementation(json(PROMPT));

    render(<FeedbackFlow bookingId="b-1" />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Loved it' }));

    await userEvent.click(await screen.findByLabelText(/One word/));
    await userEvent.tab();

    // GET + the rating PUT, and nothing else. An empty word must never post:
    // it would erase a word already stored.
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it('does not re-post a word that has not changed', async () => {
    fetchMock.mockImplementation(json(PROMPT));

    render(<FeedbackFlow bookingId="b-1" />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Loved it' }));

    const word = await screen.findByLabelText(/One word/);
    await userEvent.type(word, 'calm');
    await userEvent.tab();
    await waitFor(() => expect(fetchMock.mock.calls).toHaveLength(3));

    await userEvent.click(word);
    await userEvent.tab();

    expect(fetchMock.mock.calls).toHaveLength(3);
  });
});
