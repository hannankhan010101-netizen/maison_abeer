'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The portal frame.
 *
 * Two navigations, not one squeezed: a horizontally scrolling strip on a
 * phone and a persistent sidebar from `lg` up. The prototype does the same,
 * and it is the honest response to the PRD's split — glanceable in the studio
 * on mobile, planning and printing on desktop (§1).
 *
 * Both render from one route table, so a new screen cannot appear in one and
 * be forgotten in the other.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/today', label: 'today', icon: '🌷' },
  { href: '/calendar', label: 'calendar', icon: '📅' },
  { href: '/tags', label: 'name tags', icon: '🏷️' },
  { href: '/guests', label: 'guests', icon: '💌' },
  { href: '/prep', label: 'prep', icon: '✅' },
  { href: '/messages', label: 'messages', icon: '💬' },
] as const;

export function isActive(pathname: string, href: string): boolean {
  // Exact match or a nested route, but never a prefix collision
  // ("/tags" must not light up for "/tags-archive").
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[44px] items-center gap-2.5 whitespace-nowrap',
        'rounded-[var(--radius-pill)] px-3.5 py-2.5 font-bold',
        'transition-colors motion-reduce:transition-none',
        active
          ? 'bg-pink text-on-pink shadow-[var(--shadow-soft)]'
          : 'text-latte hover:bg-blush hover:text-cocoa',
      )}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </Link>
  );
}

export interface AppShellProps {
  children: ReactNode;
  /** Rendered in the top bar — usually the date and account controls. */
  topBar?: ReactNode;
}

export function AppShell({ children, topBar }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="mx-auto grid min-h-screen max-w-[1200px] lg:grid-cols-[216px_1fr]">
      {/* Desktop sidebar. Hidden on phones, where the strip below takes over. */}
      <aside className="border-line hidden border-r-[1.5px] border-dashed p-6 lg:flex lg:flex-col lg:gap-1.5">
        <div className="px-3 pb-4">
          <span className="font-display text-2xl tracking-tight">
            Maison Abeer<span className="text-rose-ink">.</span>
          </span>
          <span className="font-hand text-latte block text-base">your studio bestie ✨</span>
        </div>

        <nav aria-label="Main">
          <ul className="flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item.href)} />
              </li>
            ))}
          </ul>
        </nav>

        <p className="font-hand text-latte mt-auto rotate-[-2deg] p-3 text-[15px]">
          you&rsquo;ve got this ♡
        </p>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 lg:px-10">
          <span className="font-display text-lg lg:hidden">
            Maison Abeer<span className="text-rose-ink">.</span>
          </span>
          {topBar}
        </header>

        {/* Mobile navigation: one-handed, thumb-reachable, scrolls sideways
            rather than wrapping into a tall block that pushes content down. */}
        <nav
          aria-label="Main"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>

        <main id="main" className="px-4 pb-24 sm:px-6 lg:px-10 lg:pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
