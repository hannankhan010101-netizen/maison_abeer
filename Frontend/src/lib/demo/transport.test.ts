import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The demo claim scenario lets the e2e see the "no booking found" and "check
 * failed" notices without a backend. It is a test switch, so it must be inert
 * anywhere demo mode is off — above all in a production build.
 */

const COOKIE = 'ma-demo-claim';

async function load(nodeEnv: string, flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', flag ?? '');
  return import('./transport');
}

function setCookie(value: string | null) {
  document.cookie =
    value === null
      ? `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      : `${COOKIE}=${value}; path=/`;
}

async function claim(nodeEnv: string, flag: string | undefined) {
  const { createDemoFetch } = await load(nodeEnv, flag);
  const response = await createDemoFetch()('http://demo.local/api/v1/portal/claim', {
    method: 'POST',
  });
  return { status: response.status, body: await response.json() };
}

afterEach(() => {
  setCookie(null);
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('demo claim scenario', () => {
  it('matches by default', async () => {
    const { status, body } = await claim('development', '1');
    expect(status).toBe(200);
    expect(body.claimed).toBe(true);
  });

  it('answers claimed:false with the server wording when asked to', async () => {
    setCookie('unmatched');
    const { status, body } = await claim('development', '1');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      claimed: false,
      message: "We couldn't find a booking for that email. Ask your host to add it.",
    });
  });

  it('fails the request when asked to', async () => {
    setCookie('error');
    const { status } = await claim('development', '1');
    expect(status).toBeGreaterThanOrEqual(500);
  });

  it('is folded away in production even with the cookie set', async () => {
    setCookie('unmatched');
    const { demoClaimScenario } = await load('production', '1');
    expect(demoClaimScenario()).toBe('matched');
  });

  it('is ignored when demo mode is off', async () => {
    setCookie('error');
    const { demoClaimScenario } = await load('development', undefined);
    expect(demoClaimScenario()).toBe('matched');
  });
});
