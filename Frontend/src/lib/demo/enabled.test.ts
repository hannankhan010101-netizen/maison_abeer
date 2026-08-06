import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Demo mode bypasses authentication, so the guard on it is security-relevant.
 * These tests exist to make it impossible for that bypass to reach a
 * production build unnoticed.
 */

/** Re-import so the module reads the patched environment. */
async function load(nodeEnv: string | undefined, flag: string | undefined) {
  vi.resetModules();

  vi.stubEnv('NODE_ENV', nodeEnv ?? '');
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', flag ?? '');

  return import('./enabled');
}

afterEach(() => {
  // vi.stubEnv snapshots and restores the originals for us.
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('isDemoMode', () => {
  it('is off in production even when the flag is set', async () => {
    const { isDemoMode } = await load('production', '1');

    // The single most important assertion in this file: an auth bypass must
    // never be reachable in a production build.
    expect(isDemoMode()).toBe(false);
  });

  it('is off in development without the flag', async () => {
    const { isDemoMode } = await load('development', undefined);
    expect(isDemoMode()).toBe(false);
  });

  it('is off in test without the flag', async () => {
    const { isDemoMode } = await load('test', undefined);
    expect(isDemoMode()).toBe(false);
  });

  it('is on only with both development and the exact flag', async () => {
    const { isDemoMode } = await load('development', '1');
    expect(isDemoMode()).toBe(true);
  });

  it.each(['true', 'yes', 'on', '0', 'TRUE', ' 1'])(
    'ignores the near-miss flag value %o',
    async (value) => {
      // Only "1" counts, so a stray truthy value cannot switch off auth.
      const { isDemoMode } = await load('development', value);
      expect(isDemoMode()).toBe(false);
    },
  );

  it('refuses to permit demo mode at all in production', async () => {
    const { demoModeIsPermitted } = await load('production', '1');
    expect(demoModeIsPermitted()).toBe(false);
  });
});
