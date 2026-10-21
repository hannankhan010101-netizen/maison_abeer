import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The guest side has two destinations when chat is on and one when it is
 * hidden. A tab bar with a single tab is noise, so it goes, and the page
 * stops reserving room for it.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/portal' }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/api/provider', () => ({
  ApiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/api/hooks', () => ({
  useClaimAccount: () => ({
    mutate: vi.fn(),
    isError: false,
    isSuccess: false,
    data: undefined,
  }),
}));
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function shell() {
  vi.resetModules();
  const { GuestShell } = await import('./GuestShell');
  return GuestShell;
}

describe('GuestShell while chat is hidden', () => {
  it('has no Chats tab and no bottom tab bar', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '');
    const GuestShell = await shell();

    render(<GuestShell>content</GuestShell>);

    expect(screen.queryByRole('link', { name: /Chats/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Maison Abeer' })).toHaveAttribute('href', '/portal');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('does not reserve room for a tab bar that is not there', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '');
    const GuestShell = await shell();

    const { container } = render(<GuestShell>content</GuestShell>);

    expect(container.innerHTML).not.toContain('--tab-bar-guest');
  });
});

describe('GuestShell with chat enabled', () => {
  it('shows Workshops and Chats in the tab bar', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_ENABLED', '1');
    const GuestShell = await shell();

    render(<GuestShell>content</GuestShell>);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('Workshops');
    expect(nav).toHaveTextContent('Chats');
  });
});
