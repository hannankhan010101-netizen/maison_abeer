import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShell, NAV_ITEMS, isActive } from './AppShell';

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
  it('renders both navigations from one route table', () => {
    render(<AppShell>content</AppShell>);

    const navs = screen.getAllByRole('navigation', { name: 'Main' });

    // One sidebar, one mobile strip — a screen cannot be added to one and
    // forgotten in the other.
    expect(navs).toHaveLength(2);

    for (const nav of navs) {
      for (const item of NAV_ITEMS) {
        expect(within(nav).getByRole('link', { name: new RegExp(item.label) })).toBeInTheDocument();
      }
    }
  });

  it('marks the current route for assistive technology', () => {
    mockPathname.mockReturnValue('/guests');
    render(<AppShell>content</AppShell>);

    const current = screen.getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(2); // one per navigation
    for (const link of current) {
      expect(link).toHaveAttribute('href', '/guests');
    }
  });

  it('gives every nav link a 44px touch target', () => {
    mockPathname.mockReturnValue('/today');
    render(<AppShell>content</AppShell>);

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass('min-h-[44px]');
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

    const [link] = screen.getAllByRole('link', { name: /today/ });
    if (!link) throw new Error('expected a today link');
    const icon = link.querySelector('[aria-hidden="true"]');

    // The label carries the meaning; the emoji is decoration.
    expect(icon).not.toBeNull();
  });

  it('bottom-pads content on mobile so the last row clears the viewport edge', () => {
    render(<AppShell>content</AppShell>);

    expect(screen.getByRole('main')).toHaveClass('pb-24');
  });
});
