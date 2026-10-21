import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Chat is hidden for now. The switch is one build-time flag, off unless
 * `NEXT_PUBLIC_CHAT_ENABLED` is exactly `1`, so bringing chat back is a
 * setting and not a code change.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return import('./features');
}

describe('CHAT_ENABLED', () => {
  it('is off by default', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '');
    expect((await load()).CHAT_ENABLED).toBe(false);
  });

  it('is off for anything but 1', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', 'true');
    expect((await load()).CHAT_ENABLED).toBe(false);
  });

  it('is on when set to 1', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '1');
    expect((await load()).CHAT_ENABLED).toBe(true);
  });
});
