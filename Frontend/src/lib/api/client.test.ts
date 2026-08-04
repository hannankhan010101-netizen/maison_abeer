import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from './client';
import { ApiError, NetworkError } from './errors';

const BASE = 'https://api.test';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Await a request that must reject, and return the error narrowed.
 *
 * `.catch(e => e as ApiError)` widens the promise back to `unknown`, so each
 * assertion would need its own cast. This keeps the narrowing in one place
 * and fails loudly if the call unexpectedly resolves.
 */
async function rejection<E extends Error = ApiError>(promise: Promise<unknown>): Promise<E> {
  try {
    await promise;
  } catch (error) {
    return error as E;
  }

  throw new Error('Expected the request to reject, but it resolved.');
}

/** The arguments fetch was called with, asserted to exist. */
function fetchCall(mock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = mock.mock.calls[0];

  if (!call) {
    throw new Error('Expected fetch to have been called.');
  }

  return { url: String(call[0]), init: call[1] as RequestInit };
}

/** Headers as a plain record — the client always passes an object literal. */
function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>;
}

describe('ApiClient', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  function client(overrides: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
    return new ApiClient({
      baseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ...overrides,
    });
  }

  describe('requests', () => {
    it('sends the bearer token when one is available', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, { ok: true }));

      await client({ getToken: () => 'token-123' }).get('/api/v1/sessions');

      expect(headersOf(fetchCall(fetchImpl).init).Authorization).toBe('Bearer token-123');
    });

    it('omits the header when there is no token', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, {}));

      await client().get('/health');

      expect(headersOf(fetchCall(fetchImpl).init).Authorization).toBeUndefined();
    });

    it('awaits an async token provider', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, {}));

      await client({ getToken: async () => 'async-token' }).get('/x');

      expect(headersOf(fetchCall(fetchImpl).init).Authorization).toBe('Bearer async-token');
    });

    it('never caches responses', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, {}));

      await client().get('/api/v1/guests');

      // Guest contact and allergy data must not sit in a shared cache.
      const { init } = fetchCall(fetchImpl);
      expect(init.cache).toBe('no-store');
      expect(init.credentials).toBe('omit');
    });

    it('serialises a JSON body', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(201, {}));

      await client().post('/api/v1/guests', { full_name: 'Sana R.' });

      const { init } = fetchCall(fetchImpl);
      expect(init.body).toBe('{"full_name":"Sana R."}');
      expect(headersOf(init)['Content-Type']).toBe('application/json');
    });

    it('does not set a content type on bodyless requests', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, {}));

      await client().get('/x');

      expect(headersOf(fetchCall(fetchImpl).init)['Content-Type']).toBeUndefined();
    });
  });

  describe('query strings', () => {
    it('appends parameters', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, []));

      await client().get('/api/v1/guests', { query: { search: 'sana', regulars_only: true } });

      const { url } = fetchCall(fetchImpl);
      expect(url).toContain('search=sana');
      expect(url).toContain('regulars_only=true');
    });

    it('omits null and undefined rather than sending them as strings', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, []));

      await client().get('/api/v1/guests', { query: { search: undefined, filter: null } });

      const { url } = fetchCall(fetchImpl);
      expect(url).not.toContain('undefined');
      expect(url).not.toContain('filter');
    });

    it('encodes values that need it', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, []));

      await client().get('/api/v1/guests', { query: { search: 'a&b c' } });

      const { url } = fetchCall(fetchImpl);
      expect(url).toContain('search=a%26b+c');
    });

    it('normalises slashes between base and path', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, {}));

      await new ApiClient({
        baseUrl: `${BASE}/`,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }).get('health');

      expect(fetchCall(fetchImpl).url).toBe(`${BASE}/health`);
    });
  });

  describe('errors', () => {
    it('preserves the API message verbatim', async () => {
      fetchImpl.mockResolvedValue(
        jsonResponse(409, {
          code: 'seats_below_bookings',
          message: 'You have 8 guests booked, so you cannot drop to 6 seats.',
        }),
      );

      // The API writes host-facing copy; replacing it with "Request failed"
      // would throw away the product voice.
      await expect(client().patch('/x', {})).rejects.toThrow(
        'You have 8 guests booked, so you cannot drop to 6 seats.',
      );
    });

    it('exposes the code and conflict flag', async () => {
      fetchImpl.mockResolvedValue(
        jsonResponse(409, { code: 'duplicate_guest', message: 'Already in your guests.' }),
      );

      const error = await rejection(client().post('/x', {}));

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('duplicate_guest');
      expect(error.isConflict).toBe(true);
    });

    it('surfaces field errors for form binding', async () => {
      fetchImpl.mockResolvedValue(
        jsonResponse(422, {
          code: 'validation_failed',
          message: 'Some details need a second look.',
          details: {
            fields: [{ field: 'ends_at', message: 'A class has to end after it starts.' }],
          },
        }),
      );

      const error = await rejection(client().post('/x', {}));

      expect(error.isValidation).toBe(true);
      expect(error.fieldError('ends_at')).toBe('A class has to end after it starts.');
      expect(error.fieldError('missing')).toBeUndefined();
    });

    it('calls onUnauthorized exactly once for a 401', async () => {
      const onUnauthorized = vi.fn();
      fetchImpl.mockResolvedValue(
        jsonResponse(401, { code: 'not_authenticated', message: 'Please sign in.' }),
      );

      await client({ onUnauthorized })
        .get('/x')
        .catch(() => undefined);

      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it('does not call onUnauthorized for other failures', async () => {
      const onUnauthorized = vi.fn();
      fetchImpl.mockResolvedValue(jsonResponse(404, { code: 'not_found', message: 'Nope.' }));

      await client({ onUnauthorized })
        .get('/x')
        .catch(() => undefined);

      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('falls back gracefully when the body is not our envelope', async () => {
      // A gateway timeout returns HTML, not JSON.
      fetchImpl.mockResolvedValue(
        new Response('<html>504 Gateway Timeout</html>', {
          status: 504,
          headers: { 'content-type': 'text/html' },
        }),
      );

      const error = await rejection(client().get('/x'));

      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).not.toContain('<html>');
      expect(error.message.length).toBeGreaterThan(0);
    });

    it('survives a malformed JSON body', async () => {
      fetchImpl.mockResolvedValue(
        new Response('{not json', { status: 500, headers: { 'content-type': 'application/json' } }),
      );

      const error = await rejection(client().get('/x'));

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('unexpected_error');
    });

    it('distinguishes a network failure from a refusal', async () => {
      fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));

      const error = await rejection<NetworkError>(client().get('/x'));

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toContain("couldn't reach the studio");
    });
  });

  describe('responses', () => {
    it('returns parsed JSON', async () => {
      fetchImpl.mockResolvedValue(jsonResponse(200, { id: '1', full_name: 'Sana R.' }));

      const guest = await client().get<{ full_name: string }>('/api/v1/guests/1');

      expect(guest.full_name).toBe('Sana R.');
    });

    it('handles an empty 204', async () => {
      fetchImpl.mockResolvedValue(new Response(null, { status: 204 }));

      await expect(client().delete('/x')).resolves.toBeUndefined();
    });
  });
});
