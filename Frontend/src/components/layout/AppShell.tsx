'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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

/**
 * The five that live in the tab bar on a phone.
 *
 * Not a ranking of importance — a ranking of *frequency*. Today and the
 * calendar are opened daily, guests and chats several times a week. Name
 * tags, prep, messages, receipts and settings are either occasional or
 * reached from the class you are already looking at, so they sit behind
 * "More" rather than competing for a thumb-sized slot.
 *
 * Five is the ceiling: below about 68px a tab is hard to hit accurately, and
 * five is what fits across the narrowest phone this has to work on.
 */
export const PRIMARY_NAV: readonly string[] = ['/today', '/calendar', '/guests', '/chat'] as const;

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/today', label: 'Today', icon: '🌷' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/tags', label: 'Name tags', icon: '🏷️' },
  { href: '/guests', label: 'Guests', icon: '💌' },
  { href: '/prep', label: 'Prep', icon: '✅' },
  { href: '/messages', label: 'Messages', icon: '💬' },
  { href: '/chat', label: 'Chats', icon: '👀' },
  { href: '/wrapped', label: 'Receipts', icon: '📊' },
  { href: '/settings', label: 'Settings', icon: '🎨' },
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
          <span className="font-hand text-latte block text-base">Your studio bestie ✨</span>
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
          You&rsquo;ve got this ♡
        </p>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-6 lg:px-10 lg:pt-4">
          <span className="font-display text-lg lg:hidden">
            Maison Abeer<span className="text-rose-ink">.</span>
          </span>
          {topBar}
        </header>

        <main id="main" className="px-4 pb-28 sm:px-6 lg:px-10 lg:pb-16">
          {children}
        </main>

        <MobileTabs pathname={pathname} />
      </div>
    </div>
  );
}

/**
 * The phone navigation.
 *
 * Was a horizontally scrolling strip of all nine destinations. On a 390px
 * screen three of them fitted, and nothing indicated the other six existed —
 * so the app looked like it had three sections, and Guests, Prep, Messages,
 * Chats, Receipts and Settings were effectively undiscoverable.
 *
 * A fixed bottom bar fixes both halves of that: every primary destination is
 * visible at once, and it sits under the thumb rather than at the top of a
 * page you have to scroll back up through.
 */
function MobileTabs({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = PRIMARY_NAV.map((href) => NAV_ITEMS.find((item) => item.href === href)!).filter(
    Boolean,
  );

  const rest = NAV_ITEMS.filter((item) => !PRIMARY_NAV.includes(item.href));
  const restIsActive = rest.some((item) => isActive(pathname, item.href));

  return (
    <>
      {moreOpen ? (
        <>
          {/* Tapping away closes it — the gesture people try first. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="bg-cocoa/30 fixed inset-0 z-30 lg:hidden"
          />

          <div
            className="border-line bg-paper fixed inset-x-0 bottom-[68px] z-40 border-t-[1.5px] px-3 py-3 lg:hidden"
            role="menu"
            aria-label="More"
          >
            <ul className="grid grid-cols-2 gap-2">
              {rest.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[52px] items-center gap-2.5 rounded-[var(--radius-md)] px-3 font-bold',
                      isActive(pathname, item.href)
                        ? 'bg-blush text-rose-ink'
                        : 'bg-buttercream text-cocoa',
                    )}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <nav
        aria-label="Main"
        className="border-line bg-paper fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto flex max-w-[560px]">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[64px] flex-col items-center justify-center gap-0.5 px-1 text-[12px] font-extrabold',
                    active ? 'text-rose-ink' : 'text-latte',
                  )}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              aria-label="More sections"
              className={cn(
                'flex min-h-[64px] w-full flex-col items-center justify-center gap-0.5 px-1 text-[12px] font-extrabold',
                moreOpen || restIsActive ? 'text-rose-ink' : 'text-latte',
              )}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {moreOpen ? '✕' : '⋯'}
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
