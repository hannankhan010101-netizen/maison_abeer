import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell, NAV_ITEMS, PRIMARY_NAV, isActive } from './AppShell';

const mockPathname = vi.fn(() => '/today');

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('isActive', () => {
  it('matches the exact route', () => {
    expect(isActive('/today', '/today')).toBe(true);
  });

  it('matches a nested route', () => {
    expect(isActive('/guests/abc-123', '/guests')).toBe(true);
  });

  it('does not match a prefix collision', () => {
    // "/tags" must not light up when the host is on "/tags-archive".
    expect(isActive('/tags-archive', '/tags')).toBe(false);
  });

  it('does not match an unrelated route', () => {
    expect(isActive('/calendar', '/guests')).toBe(false);
  });
});

describe('AppShell', () => {
  it('gives the sidebar every destination', () => {
    render(<AppShell>content</AppShell>);

    const [sidebar] = screen.getAllByRole('navigation', { name: 'Main' });
    if (!sidebar) throw new Error('expected a sidebar');

    for (const item of NAV_ITEMS) {
      expect(
        within(sidebar).getByRole('link', { name: new RegExp(item.label) }),
      ).toBeInTheDocument();
    }
  });

  it('puts the frequent destinations in the phone tab bar', () => {
    render(<AppShell>content</AppShell>);

    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    const tabs = navs.at(-1);
    if (!tabs) throw new Error('expected a tab bar');

    // Four tabs plus More. Any more and they stop being thumb-sized.
    expect(within(tabs).getAllByRole('link')).toHaveLength(PRIMARY_NAV.length);
    expect(within(tabs).getByRole('button', { name: /more/i })).toBeInTheDocument();
  });

  it('leaves no destination unreachable on a phone', () => {
    /*
     * The invariant that matters after collapsing nine items into five.
     *
     * The old strip scrolled sideways and showed three of nine on a 390px
     * screen, with nothing to suggest the rest existed — so most of the app
     * was, in practice, undiscoverable. Every route must now be either a tab
     * or behind "More", and this fails if one is ever added to neither.
     */
    render(<AppShell>content</AppShell>);

    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    const tabs = navs.at(-1);
    if (!tabs) throw new Error('expected a tab bar');

    const onTabBar = within(tabs)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    for (const item of NAV_ITEMS) {
      const reachable = onTabBar.includes(item.href) || !PRIMARY_NAV.includes(item.href);
      expect(reachable, `${item.href} is in neither the tab bar nor More`).toBe(true);
    }

    expect(PRIMARY_NAV.every((href) => NAV_ITEMS.some((item) => item.href === href))).toBe(true);
  });

  it('marks the current route for assistive technology', () => {
    mockPathname.mockReturnValue('/guests');
    render(<AppShell>content</AppShell>);

    const current = screen.getAllByRole('link', { current: 'page' });

    // Sidebar and tab bar both mark it — /guests is in each.
    expect(current).toHaveLength(2);
    for (const link of current) {
      expect(link).toHaveAttribute('href', '/guests');
    }
  });

  it('gives every nav link a thumb-sized touch target', () => {
    mockPathname.mockReturnValue('/today');
    render(<AppShell>content</AppShell>);

    /*
     * The tab bar goes further than the 44px floor, because a tab is aimed at
     * with a thumb while holding a phone one-handed.
     *
     * The bar's own height is `--tab-bar-host` rather than a literal, because
     * the toast and the "More" sheet have to clear it and cannot measure it —
     * so the number lives in tokens.css, where `tokens.test.ts` asserts it
     * against `--tap-min`, and `e2e/mobile.spec.ts` measures the rendered
     * result. This checks only that every link declares a floor at all.
     */
    for (const link of screen.getAllByRole('link')) {
      const size = link.className.match(/min-h-\[(?:(\d+)px|var\(--tab-bar-host\))\]/);
      expect(size, `no min-height on ${link.getAttribute('href')}`).not.toBeNull();
      if (size![1]) expect(Number(size![1])).toBeGreaterThanOrEqual(44);
    }
  });

  it('renders a single main landmark', () => {
    render(<AppShell>content</AppShell>);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveTextContent('content');
  });

  it('renders the top bar slot', () => {
    render(<AppShell topBar={<span>tue · aug 4</span>}>content</AppShell>);

    expect(screen.getByText('tue · aug 4')).toBeInTheDocument();
  });

  it('hides decorative icons from screen readers', () => {
    render(<AppShell>content</AppShell>);

    const [link] = screen.getAllByRole('link', { name: /Today/ });
    if (!link) throw new Error('expected a today link');
    const icon = link.querySelector('[aria-hidden="true"]');

    // The label carries the meaning; the emoji is decoration.
    expect(icon).not.toBeNull();
  });

  it('bottom-pads content from the tab bar\u2019s own height', () => {
    render(<AppShell>content</AppShell>);

    /*
     * The padding has to clear the tab bar, the home-indicator inset and the
     * floating create button sitting above it — a sum no fixed number stays
     * correct for, which is why it is now derived from `--tab-bar-host`
     * instead of from a literal that had to be remembered.
     *
     * What that resolves to in pixels is measured for real in
     * `e2e/mobile-occlusion.spec.ts`; a class name cannot evaluate `calc`.
     */
    const main = screen.getByRole('main').className;

    expect(main).toMatch(/pb-\[calc\(/);
    expect(main).toContain('--tab-bar-host');

    // The inset is owned by `body` (globals.css) and `main` is inside that
    // padding box, so naming it here would count it twice. The guarantee is
    // that exactly one layer owns it.
    expect(main).not.toContain('env(safe-area-inset-bottom)');
  });

  it('pins the More sheet above the bar’s border, not on it', async () => {
    /*
     * `--tab-bar-host` is the bar's content height; its box is that plus
     * `border-t`. Pinned at the height alone, the sheet's bottom edge landed
     * inside the bar — measured at 1.0px of overlap in Chromium at 375×812,
     * one tick under the `mobile-occlusion` guard that rejects above 1, so the
     * suite written for this defect passed with nothing to spare. Raising the
     * border to 2px would have started failing it in a file nobody had touched.
     */
    mockPathname.mockReturnValue('/today');
    render(<AppShell>content</AppShell>);

    await userEvent.click(screen.getByRole('button', { name: /More sections/ }));

    const sheet = screen.getByRole('dialog', { name: 'More sections' }).className;

    expect(sheet).toContain('--tab-bar-host');
    expect(sheet).toContain('--tab-bar-border');
    expect(sheet).toContain('env(safe-area-inset-bottom)');
  });
});

describe('while chat is hidden', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('has no Chats destination in the table or the phone tab bar', () => {
    expect(NAV_ITEMS.some((item) => item.href === '/chat')).toBe(false);
    expect(PRIMARY_NAV).not.toContain('/chat');

    render(<AppShell>content</AppShell>);
    expect(screen.queryByRole('link', { name: /Chats/ })).not.toBeInTheDocument();
  });

  it('keeps every other destination, Messages included', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toEqual([
      '/today',
      '/calendar',
      '/tags',
      '/guests',
      '/prep',
      '/messages',
      '/wrapped',
      '/settings',
    ]);
  });

  it('brings Chats back when the flag is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '1');
    vi.resetModules();
    const shell = await import('./AppShell');

    expect(shell.NAV_ITEMS.some((item) => item.href === '/chat')).toBe(true);
    expect(shell.PRIMARY_NAV).toContain('/chat');
  });
});
