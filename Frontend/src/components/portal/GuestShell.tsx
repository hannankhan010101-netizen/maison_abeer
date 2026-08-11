'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { MochaToggle } from '@/components/ui/MochaToggle';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiProvider } from '@/lib/api/provider';
import { useClaimAccount } from '@/lib/api/hooks';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

/**
 * The guest side's chrome.
 *
 * Deliberately thinner than the host shell: a guest has two destinations, not
 * eight, and the whole point of this surface is that it does not look like an
 * admin tool.
 */

const NAV = [
  { href: '/portal', label: 'Workshops', icon: '🌷' },
  // Chat lands in Phase 2; the slot is left out rather than stubbed, so
  // nothing here promises something that does not exist yet.
] as const;

export function GuestShell({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <ToastProvider>
        <ClaimOnFirstVisit />

        <div className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6">
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

          <main id="main">{children}</main>
        </div>

        <GuestNav />
      </ToastProvider>
    </ApiProvider>
  );
}

/**
 * Match this Supabase identity to a guest record, once.
 *
 * Runs on mount rather than in the auth callback so it survives a guest who
 * bookmarks `/portal` and returns later — the callback fires once, but the
 * link between identity and booking has to exist on every visit.
 *
 * Safe to repeat: the endpoint returns the existing match rather than
 * re-pointing anything.
 */
function ClaimOnFirstVisit() {
  const claim = useClaimAccount();

  useEffect(() => {
    claim.mutate();
    // Once per mount. Re-running on every render would hammer the endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function SignOut() {
  return (
    <button
      type="button"
      onClick={async () => {
        await getSupabaseBrowserClient().auth.signOut();
        window.location.href = '/login';
      }}
      className="text-latte min-h-[44px] px-2 text-sm font-extrabold"
    >
      Sign out
    </button>
  );
}

function GuestNav() {
  const pathname = usePathname();

  // One destination today, so the bar is hidden rather than shown with a
  // single lonely tab. It returns in Phase 2 alongside chat.
  if (NAV.length < 2) return null;

  return (
    <nav
      aria-label="Main"
      className="border-line bg-paper fixed inset-x-0 bottom-0 border-t-[1.5px] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-[720px]">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-extrabold',
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
