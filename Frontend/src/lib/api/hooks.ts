'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './provider';
import {
  keysInvalidatedByBooking,
  keysInvalidatedByReschedule,
  keysInvalidatedBySeatChange,
  queryKeys,
} from './keys';
import type {
  BrandKit,
  Booking,
  Checklist,
  ChecklistItem,
  Guest,
  InviteResult,
  RescheduleResponse,
  Roster,
  Session,
  SessionCreateResponse,
  StudioSettings,
  UpcomingBirthday,
} from './types';

/**
 * Typed hooks over the API.
 *
 * Each mutation invalidates the full set its change makes stale — see
 * `keys.ts`. Under-invalidating is the failure mode that matters: the host
 * acts on a number that is quietly wrong.
 */

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function useSessions(start: string, end: string) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.sessions.window(start, end),
    queryFn: ({ signal }) =>
      api.get<Session[]>('/api/v1/sessions', { query: { start, end }, signal }),
  });
}

export function useSession(id: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.sessions.detail(id),
    queryFn: ({ signal }) => api.get<Session>(`/api/v1/sessions/${id}`, { signal }),
    enabled: enabled && Boolean(id),
  });
}

export function useCreateSession() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<SessionCreateResponse>('/api/v1/sessions', body),
    onSuccess: () => {
      // A new class can land in any window the calendar has cached.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

export function useChangeSeats(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seats: number) =>
      api.patch<Session>(`/api/v1/sessions/${sessionId}/seats`, { seats }),
    onSuccess: () => {
      for (const key of keysInvalidatedBySeatChange(sessionId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/**
 * Preview a reschedule without saving.
 *
 * Deliberately a mutation, not a query: it is an explicit action the host
 * takes, and caching a preview would show a stale impact after the roster
 * changes underneath it.
 */
export function usePreviewReschedule(sessionId: string) {
  const api = useApi();

  return useMutation({
    mutationFn: (startsAt: string) =>
      api.post<RescheduleResponse>(`/api/v1/sessions/${sessionId}/reschedule`, {
        starts_at: startsAt,
        confirm: false,
      }),
  });
}

export function useReschedule(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ startsAt, notifyGuests }: { startsAt: string; notifyGuests: boolean }) =>
      api.post<RescheduleResponse>(`/api/v1/sessions/${sessionId}/reschedule`, {
        starts_at: startsAt,
        confirm: true,
        notify_guests: notifyGuests,
      }),
    onSuccess: () => {
      for (const key of keysInvalidatedByReschedule(sessionId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------

export interface GuestListParams {
  search?: string;
  regularsOnly?: boolean;
}

export function useGuests(params: GuestListParams = {}) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.guests.list(params),
    queryFn: ({ signal }) =>
      api.get<Guest[]>('/api/v1/guests', {
        query: { search: params.search || undefined, regulars_only: params.regularsOnly },
        signal,
      }),
  });
}

export function useGuest(id: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.guests.detail(id),
    queryFn: ({ signal }) => api.get<Guest>(`/api/v1/guests/${id}`, { signal }),
    enabled: enabled && Boolean(id),
  });
}

export function useUpcomingBirthdays() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.guests.birthdays,
    queryFn: ({ signal }) => api.get<UpcomingBirthday[]>('/api/v1/guests/birthdays', { signal }),
  });
}

export function useCreateGuest() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body, merge }: { body: Record<string, unknown>; merge?: boolean }) =>
      api.post<Guest>('/api/v1/guests', body, { query: { merge_duplicates: merge } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Roster and waitlist
// ---------------------------------------------------------------------------

export function useRoster(sessionId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.sessions.roster(sessionId),
    queryFn: ({ signal }) => api.get<Roster>(`/api/v1/sessions/${sessionId}/roster`, { signal }),
    enabled: enabled && Boolean(sessionId),
  });
}

export function useAssignTable(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bookingId,
      tableNumber,
      sitWithNote,
    }: {
      bookingId: string;
      tableNumber: number | null;
      sitWithNote?: string | null;
    }) =>
      api.patch<Booking>(`/api/v1/bookings/${bookingId}/table`, {
        table_number: tableNumber,
        sit_with_note: sitWithNote ?? null,
      }),
    onSuccess: () => {
      // The unassigned counter lives on the session, not just the roster.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.roster(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
    },
  });
}

export function useCancelBooking(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bookingId,
      guestId,
      resolution,
      note,
    }: {
      bookingId: string;
      guestId: string;
      resolution: 'refunded' | 'credit';
      note?: string;
    }) =>
      api
        .post<Booking>(`/api/v1/bookings/${bookingId}/cancel`, { resolution, note })
        .then((booking) => ({ booking, guestId })),
    onSuccess: ({ guestId }) => {
      for (const key of keysInvalidatedByBooking(sessionId, guestId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useInviteNext(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<InviteResult>(`/api/v1/sessions/${sessionId}/waitlist/invite`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.waitlist(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Prep checklist
// ---------------------------------------------------------------------------

export function useChecklist(sessionId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.sessions.checklist(sessionId),
    queryFn: ({ signal }) =>
      api.get<Checklist>(`/api/v1/sessions/${sessionId}/checklist`, { signal }),
    enabled: enabled && Boolean(sessionId),
  });
}

export function useToggleChecklistItem(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      api.patch<ChecklistItem>(`/api/v1/checklist/${itemId}`, { completed }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.checklist(sessionId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function useSettings() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: ({ signal }) => api.get<StudioSettings>('/api/v1/settings', { signal }),
  });
}

export function useUpdateSettings() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<StudioSettings>) =>
      api.patch<StudioSettings>('/api/v1/settings', body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.settings.all, updated);
      // Quiet hours and rest days change what the calendar and messages
      // screens say, so those must not keep showing the old rules.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

export function useBrandKit() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.settings.brandKit,
    queryFn: ({ signal }) => api.get<BrandKit>('/api/v1/settings/brand-kit', { signal }),
  });
}

export function useUpdateBrandKit() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<BrandKit>) =>
      api.patch<BrandKit>('/api/v1/settings/brand-kit', body),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.settings.brandKit, updated),
  });
}
