import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

    // The tab bar goes further than the 44px floor — 64px, because a tab is
    // aimed at with a thumb while holding a phone one-handed.
    for (const link of screen.getAllByRole('link')) {
      const size = link.className.match(/min-h-\[(\d+)px\]/);
      expect(size, `no min-height on ${link.getAttribute('href')}`).not.toBeNull();
      expect(Number(size![1])).toBeGreaterThanOrEqual(44);
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

  it('bottom-pads content so the last row clears the fixed tab bar', () => {
    render(<AppShell>content</AppShell>);

    const padding = screen.getByRole('main').className.match(/pb-(\d+)/);
    expect(padding).not.toBeNull();
    // The bar is 64px plus the safe-area inset; the padding has to clear it.
    expect(Number(padding![1]) * 4).toBeGreaterThanOrEqual(96);
  });
});
