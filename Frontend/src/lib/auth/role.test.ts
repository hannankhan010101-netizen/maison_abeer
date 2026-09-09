import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRole } from './role';

/**
 * The distinction these tests defend is easy to lose in a refactor, and losing
 * it is not a cosmetic bug.
 *
 * `unknown` means the API answered: this identity matches no record on either
 * side. That is a real, expected state — someone signed in whose booking has
 * not been matched yet — and the claim flow is what resolves it, so the caller
 * routes them onward.
 *
 * `unreachable` means nobody answered. Routing on that guess would bounce a
 * host to the guest portal because their wifi dropped.
 *
 * Collapsing the two into one value type-checks perfectly and strands people.
 */

function respondWith(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRole', () => {
  it('reads a host', async () => {
    vi.stubGlobal('fetch', respondWith({ role: 'host' }));
    await expect(fetchRole('token')).resolves.toBe('host');
  });

  it('reads a guest', async () => {
    vi.stubGlobal('fetch', respondWith({ role: 'guest' }));
    await expect(fetchRole('token')).resolves.toBe('guest');
  });

  it('reports an unmatched identity as unknown, not unreachable', async () => {
    // The API answered. There is simply no record yet — the state the claim
    // flow exists for, and the caller must still route them somewhere.
    vi.stubGlobal('fetch', respondWith({ role: 'unknown' }));
    await expect(fetchRole('token')).resolves.toBe('unknown');
  });

  it('reports a network failure as unreachable, not unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchRole('token')).resolves.toBe('unreachable');
  });

  it('reports an error status as unreachable', async () => {
    vi.stubGlobal('fetch', respondWith({}, false, 503));
    await expect(fetchRole('token')).resolves.toBe('unreachable');
  });

  it('treats an unrecognised role as unknown rather than trusting it', async () => {
    vi.stubGlobal('fetch', respondWith({ role: 'administrator' }));
    await expect(fetchRole('token')).resolves.toBe('unknown');
  });

  it('sends the token as a bearer credential', async () => {
    const fetchMock = respondWith({ role: 'guest' });
    vi.stubGlobal('fetch', fetchMock);

    await fetchRole('abc123');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc123');
    // A cached role is a wrong role the moment a guest claims their booking.
    expect(init.cache).toBe('no-store');
  });
});
