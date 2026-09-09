'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { apiBaseUrl } from './base-url';
import { ApiClient } from './client';
import { ApiError } from './errors';
import { getAccessToken } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/demo/enabled';
import { createDemoFetch } from '@/lib/demo/transport';

const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const client = useContext(ApiContext);

  if (!client) {
    throw new Error('useApi must be used inside <ApiProvider>.');
  }

  return client;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The host checks the app many times a day; a short stale window
        // keeps the dashboard current without refetching on every glance.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // Retrying a refusal is pointless and delays the message the host
          // needs to read. Only transient failures are worth another attempt.
          if (error instanceof ApiError) {
            const permanent = error.status < 500 && error.status !== 429;
            if (permanent) return false;
          }

          return failureCount < 2;
        },
      },
      mutations: {
        // Never silently repeat a write: a retried booking could double-book.
        retry: false,
      },
    },
  });
}

export function ApiProvider({
  children,
  unauthorizedRedirectTo = '/login',
}: {
  children: ReactNode;
  /**
   * Where a rejected token sends the caller.
   *
   * Defaults to the host's `/login`. The guest shell overrides this to
   * `/enter` — guests are provisioned with a random, immediately-forgotten
   * password (see `portal_tokens.py`), so `/login` is a dead end for them;
   * see `middleware.ts`'s PUBLIC_PATHS note for the same invariant.
   */
  unauthorizedRedirectTo?: string;
}) {
  const router = useRouter();

  // useState, not useMemo: the client must survive re-renders, and useMemo is
  // explicitly not a caching guarantee.
  const [queryClient] = useState(createQueryClient);

  const apiClient = useMemo(() => {
    // Demo mode answers from fixtures instead of the network, so the app is
    // usable without a Supabase project or a database. Dev-only; see
    // lib/demo/enabled.ts.
    if (isDemoMode()) {
      return new ApiClient({
        baseUrl: 'http://demo.local',
        fetchImpl: createDemoFetch(),
      });
    }

    return new ApiClient({
      baseUrl: apiBaseUrl(),
      getToken: getAccessToken,
      onUnauthorized: () => {
        queryClient.clear();
        router.replace(unauthorizedRedirectTo);
      },
    });
  }, [queryClient, router, unauthorizedRedirectTo]);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={apiClient}>{children}</ApiContext.Provider>
    </QueryClientProvider>
  );
}
