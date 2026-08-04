'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { ApiClient } from './client';
import { ApiError } from './errors';
import { getAccessToken } from '@/lib/supabase/client';

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

export function ApiProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  // useState, not useMemo: the client must survive re-renders, and useMemo is
  // explicitly not a caching guarantee.
  const [queryClient] = useState(createQueryClient);

  const apiClient = useMemo(
    () =>
      new ApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
        getToken: getAccessToken,
        onUnauthorized: () => {
          queryClient.clear();
          router.replace('/login');
        },
      }),
    [queryClient, router],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={apiClient}>{children}</ApiContext.Provider>
    </QueryClientProvider>
  );
}
