'use client';

import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { SignOutButton } from '@/components/layout/SignOutButton';
import { MochaToggle } from '@/components/ui/MochaToggle';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiProvider } from '@/lib/api/provider';

/**
 * The signed-in area.
 *
 * The providers sit inside the route group rather than the root layout, so
 * `/login` never constructs an API client it has no session for.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <ToastProvider>
        <AppShell
          topBar={
            <div className="flex items-center gap-2">
              <MochaToggle />
              <SignOutButton />
            </div>
          }
        >
          {children}
        </AppShell>
      </ToastProvider>
    </ApiProvider>
  );
}
