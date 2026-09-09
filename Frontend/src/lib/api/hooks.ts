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
  ExportRecord,
  Feedback,
  AdminMessage,
  AdminRoom,
  BroadcastPreview,
  BroadcastResult,
  ChatBanner,
  ChatMessage,
  ChatRoom,
  ClaimResult,
  DeclineResult,
  Guest,
  GuestHistory,
  PortalProfile,
  PortalWorkshop,
  PortalWorkshopDetail,
  InviteResult,
  MessagePreview,
  MessageScheduleResult,
  RescheduleResponse,
  Roster,
  ScheduledMessage,
  Session,
  SessionCreateResponse,
  StudioSettings,
  TagSheet,
  UpcomingBirthday,
  VoicePreset,
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

// ---------------------------------------------------------------------------
// Messages (PRD §2.6)
// ---------------------------------------------------------------------------

/**
 * What would go out, without queueing anything.
 *
 * A mutation rather than a query despite reading nothing: it is an explicit
 * act by the host, and caching a preview across a voice change would show
 * copy they are no longer looking at.
 */
export function usePreviewMessages(sessionId: string) {
  const api = useApi();

  return useMutation({
    mutationFn: (voice?: VoicePreset) =>
      api.post<MessagePreview[]>(`/api/v1/sessions/${sessionId}/messages/preview`, {
        voice: voice ?? null,
      }),
  });
}

export function useScheduleMessages(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (voice?: VoicePreset) =>
      api.post<MessageScheduleResult>(`/api/v1/sessions/${sessionId}/messages`, {
        voice: voice ?? null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.messages(sessionId) });
      // A newly queued batch can contain failures worth surfacing at once.
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.failed });
    },
  });
}

export function useSessionMessages(sessionId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.sessions.messages(sessionId),
    queryFn: ({ signal }) =>
      api.get<ScheduledMessage[]>(`/api/v1/sessions/${sessionId}/messages`, { signal }),
    enabled: enabled && Boolean(sessionId),
  });
}

export function useGuestMessages(guestId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.messages.forGuest(guestId),
    queryFn: ({ signal }) =>
      api.get<ScheduledMessage[]>(`/api/v1/guests/${guestId}/messages`, { signal }),
    enabled: enabled && Boolean(guestId),
  });
}

/** Feeds the dashboard alert. A failed send must never be invisible. */
export function useFailedMessages() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.messages.failed,
    queryFn: ({ signal }) => api.get<ScheduledMessage[]>('/api/v1/messages/failed', { signal }),
  });
}

export function useRetryMessage() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) =>
      api.post<ScheduledMessage>(`/api/v1/messages/${messageId}/retry`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

export function useCancelMessage() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, reason }: { messageId: string; reason?: string }) =>
      api.post<ScheduledMessage>(`/api/v1/messages/${messageId}/cancel`, {
        reason: reason ?? null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

export function useSubmitFeedback() {
  const api = useApi();

  return useMutation({
    mutationFn: ({
      bookingId,
      rating,
      oneWord,
    }: {
      bookingId: string;
      /** 1 = 😕, 2 = 🙂, 3 = 😍 — ascending with sentiment, matching the API. */
      rating: number;
      oneWord?: string | null;
    }) =>
      api.put<Feedback>(`/api/v1/bookings/${bookingId}/feedback`, {
        rating,
        one_word: oneWord ?? null,
      }),
  });
}

// ---------------------------------------------------------------------------
// Name tags (PRD §2.3)
// ---------------------------------------------------------------------------

export function useTagSheet(sessionId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.sessions.tags(sessionId),
    queryFn: ({ signal }) => api.get<TagSheet>(`/api/v1/sessions/${sessionId}/tags`, { signal }),
    enabled: enabled && Boolean(sessionId),
  });
}

/**
 * Log that tags were printed.
 *
 * Called *after* the print dialog, never before: the stored fingerprint has
 * to describe what actually reached paper, or the staleness banner lies.
 */
export function useRecordExport(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ theme, layout }: { theme: string; layout: string }) =>
      api.post<ExportRecord>(`/api/v1/sessions/${sessionId}/exports`, { theme, layout }),
    onSuccess: () => {
      // The sheet carries roster_changed_since_export, which just became false.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.tags(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.exports(sessionId) });
    },
  });
}

/** A guest's own class history — the mini-CRM's data (PRD §2.4). */
export function useGuestHistory(guestId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.guests.history(guestId),
    queryFn: ({ signal }) => api.get<GuestHistory>(`/api/v1/guests/${guestId}/history`, { signal }),
    enabled: enabled && Boolean(guestId),
  });
}

/**
 * Close or reopen a class.
 *
 * Locking is how a host stops new bookings without cancelling — the seats
 * stay, the roster stays, the door just closes.
 */
export function useLockSession(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    // `locked` is a query parameter, not a body: the endpoint declares a bare
    // bool, which FastAPI reads from the query string. Sending it as JSON
    // would 422 with the flag silently ignored.
    mutationFn: (locked: boolean) =>
      api.patch<Session>(`/api/v1/sessions/${sessionId}/lock`, undefined, {
        query: { locked },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.sessions.detail(sessionId), updated);
      // The calendar and the dashboard both badge a locked class.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Guest portal
// ---------------------------------------------------------------------------

/** The signed-in guest. Their own record, in full — it is theirs. */
export function usePortalProfile() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.portal.me,
    queryFn: ({ signal }) => api.get<PortalProfile>('/api/v1/portal/me', { signal }),
    // A guest who has not claimed an account gets 401 here; retrying would
    // just delay the sign-in prompt.
    retry: false,
  });
}

/** Only this guest's enrollments. There is no parameter that widens it. */
export function usePortalWorkshops() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.portal.workshops,
    queryFn: ({ signal }) => api.get<PortalWorkshop[]>('/api/v1/portal/workshops', { signal }),
  });
}

export function usePortalWorkshop(sessionId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.portal.workshop(sessionId),
    queryFn: ({ signal }) =>
      api.get<PortalWorkshopDetail>(`/api/v1/portal/workshops/${sessionId}`, { signal }),
    enabled: enabled && Boolean(sessionId),
  });
}

/** Claim a held waitlist seat — turns the offer into a real booking. */
export function useAcceptInvite(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<PortalWorkshopDetail>(`/api/v1/portal/workshops/${sessionId}/accept`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.workshop(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.workshops });
    },
  });
}

/** Turn down a held seat. The next person on the list is offered it. */
export function useDeclineInvite(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<DeclineResult>(`/api/v1/portal/workshops/${sessionId}/decline`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.workshop(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.workshops });
    },
  });
}

/** Match a freshly authenticated identity to a guest record. Runs once. */
export function useClaimAccount() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<ClaimResult>('/api/v1/portal/claim'),
    onSuccess: (result) => {
      if (result.claimed) void queryClient.invalidateQueries({ queryKey: queryKeys.portal.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/**
 * The rooms this guest belongs to.
 *
 * Refetched on a slow interval so an unread badge appears without the guest
 * sitting inside a room. Ten seconds rather than three: a badge is ambient,
 * and polling the list as hard as an open conversation is wasted traffic.
 */
export function useChatRooms() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.portal.rooms,
    queryFn: ({ signal }) => api.get<ChatRoom[]>('/api/v1/portal/rooms', { signal }),
    refetchInterval: 10_000,
    // Pauses when the tab is hidden. A phone in a pocket should not poll.
    refetchIntervalInBackground: false,
  });
}

/**
 * One room's messages, polled while it is open.
 *
 * Three seconds is the near-real-time the architecture buys us without moving
 * access control onto RLS, which is not yet enforced. It reads as instant in a
 * group of a dozen people.
 */
export function useChatMessages(roomId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.portal.room(roomId),
    queryFn: ({ signal }) =>
      api.get<ChatMessage[]>(`/api/v1/portal/rooms/${roomId}/messages`, { signal }),
    enabled: enabled && Boolean(roomId),
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });
}

export function useSendMessage(roomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) =>
      api.post<ChatMessage>(`/api/v1/portal/rooms/${roomId}/messages`, { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.room(roomId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.rooms });
    },
  });
}

export function useMarkRoomRead(roomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<void>(`/api/v1/portal/rooms/${roomId}/read`),
    // Only the room list changes — the thread itself is unaffected.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.portal.rooms }),
  });
}

export function useToggleReaction(roomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.put<ChatMessage>(`/api/v1/portal/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.portal.room(roomId) }),
  });
}

// ---------------------------------------------------------------------------
// Admin chat (host only)
// ---------------------------------------------------------------------------

/** Every room in the studio. 403s for a guest — the server is the gate. */
export function useAdminRooms() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.adminChat.rooms,
    queryFn: ({ signal }) => api.get<AdminRoom[]>('/api/v1/chat/rooms', { signal }),
  });
}

export function useAdminRoomMessages(roomId: string, enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.adminChat.room(roomId),
    queryFn: ({ signal }) =>
      api.get<AdminMessage[]>(`/api/v1/chat/rooms/${roomId}/messages`, { signal }),
    enabled: enabled && Boolean(roomId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export function usePinBanner(roomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) =>
      api.put<ChatBanner>(`/api/v1/chat/rooms/${roomId}/banner`, { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminChat.all }),
  });
}

export function useRemoveBanner(roomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete<void>(`/api/v1/chat/rooms/${roomId}/banner`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminChat.all }),
  });
}

/**
 * Add a one-off prep step to a single class.
 *
 * The endpoint has always existed; nothing called it, so a class whose type
 * has no template showed "no steps yet" with no way to add one — and two of
 * the three class types have no template.
 */
export function useAddChecklistItem(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (text: string) =>
      api.post<ChecklistItem>(`/api/v1/sessions/${sessionId}/checklist`, { text }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.checklist(sessionId) }),
  });
}

/**
 * Open the private thread with one guest.
 *
 * Get-or-create on the server, so pressing the button twice cannot split a
 * conversation in two. Invalidates the room list because a first press adds a
 * room to it.
 */
export function useOpenDirectRoom() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (guestId: string) => api.post<AdminRoom>(`/api/v1/guests/${guestId}/chat`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminChat.rooms }),
  });
}

/**
 * Say something in one room, as the host.
 *
 * The counterpart to the guest's `useSendMessage`. Invalidates the room list
 * as well as the thread — a reply changes the room's message count and its
 * last-message preview, and leaving those stale makes a sent message look
 * like it went nowhere.
 */
export function useReplyInRoom(roomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) =>
      api.post<AdminMessage>(`/api/v1/chat/rooms/${roomId}/messages`, { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminChat.room(roomId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminChat.rooms });
    },
  });
}

export function useDeleteMessage(roomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => api.delete<void>(`/api/v1/chat/messages/${messageId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminChat.room(roomId) }),
  });
}

/** What a broadcast would reach, before it is sent. */
export function usePreviewBroadcast() {
  const api = useApi();

  return useMutation({
    mutationFn: (body: string) =>
      api.post<BroadcastPreview>('/api/v1/broadcasts/preview', { body }),
  });
}

export function useSendBroadcast() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    // `confirmed` is a field rather than a second endpoint, so the confirm
    // step cannot be skipped by calling a different route.
    mutationFn: (body: string) =>
      api.post<BroadcastResult>('/api/v1/broadcasts', { body, confirmed: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminChat.all }),
  });
}
