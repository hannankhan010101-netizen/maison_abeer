import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * While chat is hidden, its four pages are not reachable: a bookmark, an
 * installed app's history or a typed address lands on the screen that replaced
 * it, and never on a half-hidden feature. With the flag on they render again.
 */

const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT ${to}`);
});
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

type Page = (props: unknown) => unknown;

const PAGES: ReadonlyArray<{
  name: string;
  to: string;
  props: unknown;
  load: () => Promise<{ default: Page }>;
}> = [
  {
    name: 'host chat oversight',
    to: '/today',
    props: {},
    load: () => import('@/app/(portal)/chat/page') as Promise<{ default: Page }>,
  },
  {
    name: 'host broadcast',
    to: '/today',
    props: {},
    load: () => import('@/app/(portal)/chat/broadcast/page') as Promise<{ default: Page }>,
  },
  {
    name: 'guest chat list',
    to: '/portal',
    props: {},
    load: () => import('@/app/(guest)/portal/chat/page') as Promise<{ default: Page }>,
  },
  {
    name: 'guest chat room',
    to: '/portal',
    props: { params: Promise.resolve({ roomId: 'room-1' }) },
    load: () => import('@/app/(guest)/portal/chat/[roomId]/page') as Promise<{ default: Page }>,
  },
];

async function load(page: (typeof PAGES)[number]): Promise<Page> {
  vi.resetModules();
  return (await page.load()).default;
}

beforeEach(() => {
  redirect.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('chat pages while chat is hidden', () => {
  for (const page of PAGES) {
    it(`${page.name} sends the visitor to ${page.to}`, async () => {
      vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '');
      const Page = await load(page);

      await expect(Promise.resolve().then(() => Page(page.props))).rejects.toThrow(
        `NEXT_REDIRECT ${page.to}`,
      );
      expect(redirect).toHaveBeenCalledWith(page.to);
    });
  }
});

describe('chat pages with chat enabled', () => {
  for (const page of PAGES) {
    it(`${page.name} renders instead of redirecting`, async () => {
      vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '1');
      const Page = await load(page);

      await expect(Promise.resolve(Page(page.props))).resolves.toBeTruthy();
      expect(redirect).not.toHaveBeenCalled();
    });
  }
});
