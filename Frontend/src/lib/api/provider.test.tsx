import { describe, expect, it } from 'vitest';

import { createQueryClient } from './provider';
import { ApiError } from './errors';

function apiError(status: number): ApiError {
  return new ApiError(status, { code: 'x', message: 'nope' });
}

/** The retry predicate as TanStack Query will call it. */
function shouldRetry(client: ReturnType<typeof createQueryClient>, failures: number, error: Error) {
  const retry = client.getDefaultOptions().queries?.retry;

  if (typeof retry !== 'function') {
    throw new Error('Expected a retry predicate.');
  }

  return retry(failures, error);
}

describe('query client defaults', () => {
  it('does not retry a refusal', () => {
    const client = createQueryClient();

    // Retrying a 409 cannot succeed and delays the message the host needs.
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetry(client, 0, apiError(status))).toBe(false);
    }
  });

  it('retries a server error', () => {
    const client = createQueryClient();

    expect(shouldRetry(client, 0, apiError(500))).toBe(true);
    expect(shouldRetry(client, 0, apiError(503))).toBe(true);
  });

  it('retries a rate limit, which is transient', () => {
    expect(shouldRetry(createQueryClient(), 0, apiError(429))).toBe(true);
  });

  it('gives up after two attempts', () => {
    const client = createQueryClient();

    expect(shouldRetry(client, 1, apiError(500))).toBe(true);
    expect(shouldRetry(client, 2, apiError(500))).toBe(false);
  });

  it('retries an unknown error, which may be the network', () => {
    expect(shouldRetry(createQueryClient(), 0, new Error('boom'))).toBe(true);
  });

  it('never retries a mutation', () => {
    // A repeated write could double-book a guest.
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('keeps data fresh for a short window', () => {
    // The host opens the app many times a day; refetching on every glance
    // would waste their connection in a studio.
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000);
  });
});
