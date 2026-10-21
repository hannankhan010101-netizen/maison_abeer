'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { ClaimNotice, ClaimSilently } from '@/components/portal/ClaimNotice';
import { MochaToggle } from '@/components/ui/MochaToggle';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiProvider } from '@/lib/api/provider';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';
import { CHAT_ENABLED } from '@/lib/features';

/**
 * The guest side's chrome.
 *
 * Deliberately thinner than the host shell: a guest has two destinations, not
 * eight, and the whole point of this surface is that it does not look like an
 * admin tool. While chat is hidden there is one, and a tab bar with a single
 * tab is noise, so the bar goes and the page stops reserving room for it.
 */

const NAV = [
  { href: '/portal', label: 'Workshops', icon: '🌷' },
  { href: '/portal/chat', label: 'Chats', icon: '💬' },
].filter((item) => CHAT_ENABLED || item.href !== '/portal/chat');

const SHOW_TABS = NAV.length > 1;

/**
 * Is this an open conversation?
 *
 * A thread takes the whole screen: no wordmark, no tab bar, no page scroll.
 * That is what WhatsApp, Messenger and Instagram all do, and it is not
 * decoration — a conversation needs a pinned header, a pinned composer, and
 * exactly one scrolling region between them. Leaving the shell in place cost
 * roughly 150px of a 664px screen and pushed the composer underneath the tab
 * bar, where it could not be typed into at all.
 */
function isOpenThread(pathname: string): boolean {
  return /^\/portal\/chat\/[^/]+$/.test(pathname);
}

export function GuestShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isOpenThread(pathname)) {
    return (
      <ApiProvider unauthorizedRedirectTo="/enter">
        {/* No `offsetClassName`: an open thread renders no tab bar, so the
            toast keeps its plain 1rem inset above the composer. */}
        <ToastProvider>
          <ClaimSilently />
          {/* The thread owns the viewport and does its own scrolling. */}
          <main id="main">{children}</main>
        </ToastProvider>
      </ApiProvider>
    );
  }

  return (
    <ApiProvider unauthorizedRedirectTo="/enter">
      <ToastProvider offsetClassName={SHOW_TABS ? '[--tab-bar-h:var(--tab-bar-guest)]' : undefined}>
        {/* Derived from the guest bar's own height, not remembered as `pb-24`:
            24px of clearance above a 56px bar plus its border, with the
            home-indicator inset left to `body` (`globals.css`), which is the
            one owner of it for in-flow content. The remembered number cleared
            the bar by 6px on a notched phone. */}
        <div
          className={cn(
            'mx-auto w-full max-w-[720px] px-4 sm:px-6',
            SHOW_TABS ? 'pb-[calc(var(--tab-bar-guest)+1.5rem)]' : 'pb-6',
          )}
        >
          <header className="flex items-center justify-between py-4">
            {/* inline-flex + min-height: a 28px link is a real target on a
                phone, not a decorative wordmark. */}
            <Link
              href="/portal"
              className="font-display inline-flex min-h-[44px] items-center text-lg"
            >
              Maison Abeer
            </Link>

            <div className="flex items-center gap-2">
              <MochaToggle />
              <SignOut />
            </div>
          </header>

          {/* Says so when this sign-in matches no booking, or the check fails;
              silent once matched. */}
          <ClaimNotice />

          <main id="main">{children}</main>
        </div>

        {SHOW_TABS ? <GuestNav /> : null}
      </ToastProvider>
    </ApiProvider>
  );
}

function SignOut() {
  return (
    <button
      type="button"
      onClick={async () => {
        await getSupabaseBrowserClient().auth.signOut();
        // Not '/login': a guest has no password to sign back in with. '/enter'
        // is the recovery path — with no token it tells them to ask their
        // studio for a fresh link, which is the only way back in.
        window.location.href = '/enter';
      }}
      className="text-latte min-h-[44px] px-2 text-sm font-extrabold"
    >
      Sign out
    </button>
  );
}

function GuestNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="border-line bg-paper fixed inset-x-0 bottom-0 border-t-[length:var(--tab-bar-border)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-[720px]">
        {NAV.map((item) => {
          const active =
            item.href === '/portal'
              ? pathname === '/portal' || pathname.startsWith('/portal/workshops')
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[var(--tab-bar-guest)] flex-col items-center justify-center gap-0.5 text-xs font-extrabold',
                  active ? 'text-rose-ink' : 'text-latte',
                )}
              >
                <span aria-hidden="true" className="text-base">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
