import {
  demoBirthdays,
  demoBrandKit,
  demoChecklist,
  demoGuests,
  demoRoster,
  demoSessions,
  demoSettings,
} from './fixtures';
import type {
  ChatMessage,
  Checklist,
  ChecklistItem,
  ExportRecord,
  Guest,
  MessagePreview,
  Roster,
  ScheduledMessage,
  Session,
  StudioSettings,
  TagSheet,
} from '@/lib/api/types';

/** Demo chat, module-scoped so a sent message survives to the next poll. */
const demoChat: ChatMessage[] = [];
let demoBanner: string | null = null;

const GUEST_MESSAGE_KINDS = ['guest_reminder', 'guest_thank_you'] as const;

/**
 * A `fetch` that answers the API from memory.
 *
 * Deliberately stateful: writes mutate the store so the app behaves like a
 * real one — ticking a prep step stays ticked, cancelling removes a guest,
 * changing seats moves the ring. A read-only mock would look right and feel
 * broken the moment anything was clicked.
 *
 * It also enforces the same refusals the API does, so the error paths are
 * reachable: dropping seats below the booking count still fails with the
 * same message the backend would send.
 */

interface Store {
  sessions: Session[];
  guests: Guest[];
  rosters: Map<string, Roster>;
  checklists: Map<string, Checklist>;
  settings: StudioSettings;
  brandKit: typeof demoBrandKit;
  messages: ScheduledMessage[];
  exports: ExportRecord[];
}

function createStore(now: Date): Store {
  const sessions = demoSessions(now);

  return {
    sessions,
    guests: demoGuests(now),
    rosters: new Map(sessions.map((s) => [s.id, demoRoster(now, s.id)])),
    checklists: new Map(sessions.map((s) => [s.id, demoChecklist(now, s.id)])),
    settings: { ...demoSettings },
    brandKit: { ...demoBrandKit },
    messages: [],
    exports: [],
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function error(status: number, code: string, message: string): Response {
  return json({ code, message }, status);
}

/** Recompute a session's derived capacity after a change. */
function recalculate(session: Session): Session {
  const booked = session.capacity.booked;
  const seats = session.capacity.seats;
  const available = Math.max(0, seats - booked);
  const fraction = seats === 0 ? 1 : Math.min(1, booked / seats);

  const state =
    booked >= seats
      ? 'sold_out'
      : fraction >= 0.8
        ? 'nearly_full'
        : fraction >= 0.4
          ? 'filling'
          : 'open';

  return {
    ...session,
    capacity: {
      ...session.capacity,
      available,
      state,
      waitlist_is_open: booked >= seats,
      accepts_bookings: session.status !== 'locked' && booked < seats,
    },
  };
}

export function createDemoFetch(now: Date = new Date()): typeof fetch {
  const store = createStore(now);

  return async function demoFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const path = url.pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    // A touch of latency so loading states are visible rather than skipped.
    await new Promise((resolve) => setTimeout(resolve, 120));

    // ---- sessions --------------------------------------------------------

    if (path === '/api/v1/sessions' && method === 'GET') {
      const start = new Date(url.searchParams.get('start') ?? 0).getTime();
      const end = new Date(url.searchParams.get('end') ?? 0).getTime();

      return json(
        store.sessions.filter((s) => {
          const at = new Date(s.starts_at).getTime();
          return at >= start && at <= end;
        }),
      );
    }

    if (path === '/api/v1/sessions' && method === 'POST') {
      const starts = new Date(body.starts_at);
      const created: Session[] = [];
      const weeks = body.repeat_weekly_until
        ? Math.min(
            52,
            Math.floor(
              (new Date(body.repeat_weekly_until).getTime() - starts.getTime()) / (7 * 86_400_000),
            ) + 1,
          )
        : 1;

      for (let index = 0; index < Math.max(1, weeks); index++) {
        const offset = index * 7 * 86_400_000;
        const session = recalculate({
          id: `s-new-${Date.now()}-${index}`,
          class_type_id: body.class_type_id,
          class_type_name:
            store.sessions.find((s) => s.class_type_id === body.class_type_id)?.class_type_name ??
            'new class',
          color_token:
            store.sessions.find((s) => s.class_type_id === body.class_type_id)?.color_token ??
            'pink',
          title: body.title ?? null,
          location: body.location ?? null,
          notes: body.notes ?? null,
          starts_at: new Date(starts.getTime() + offset).toISOString(),
          ends_at: new Date(new Date(body.ends_at).getTime() + offset).toISOString(),
          status: 'scheduled',
          capacity: {
            seats: body.seats,
            booked: 0,
            available: body.seats,
            state: 'open',
            waitlist_is_open: false,
            accepts_bookings: true,
          },
          unassigned_guest_count: 0,
          roster_changed_since_export: false,
        });

        store.sessions.push(session);
        store.rosters.set(session.id, {
          session_id: session.id,
          bookings: [],
          unassigned_count: 0,
          critical_allergy_count: 0,
        });
        created.push(session);
      }

      const isSunday = starts.getDay() === 0;

      return json(
        {
          sessions: created,
          energy: isSunday
            ? { warning: 'rest_day', message: 'This is your rest day. Schedule anyway?' }
            : { warning: 'none', message: '' },
        },
        201,
      );
    }

    const seatMatch = /^\/api\/v1\/sessions\/([^/]+)\/seats$/.exec(path);
    if (seatMatch && method === 'PATCH') {
      const index = store.sessions.findIndex((s) => s.id === seatMatch[1]);
      const session = store.sessions[index]!;

      if (body.seats < session.capacity.booked) {
        // The same refusal the API gives, so the error path is reachable.
        return error(
          409,
          'seats_below_bookings',
          `You have ${session.capacity.booked} guests booked, so you cannot drop to ` +
            `${body.seats} seats. Cancel a booking first if someone can't make it.`,
        );
      }

      const updated = recalculate({
        ...session,
        capacity: { ...session.capacity, seats: body.seats },
      });

      store.sessions[index] = updated;
      return json(updated);
    }

    const rescheduleMatch = /^\/api\/v1\/sessions\/([^/]+)\/reschedule$/.exec(path);
    if (rescheduleMatch && method === 'POST') {
      const index = store.sessions.findIndex((s) => s.id === rescheduleMatch[1]);
      const session = store.sessions[index]!;
      const newStart = new Date(body.starts_at);

      if (newStart.getTime() < Date.now()) {
        return error(422, 'past_slot', 'That slot is in the past. Pick a time from now onwards.');
      }

      const checklist = store.checklists.get(session.id);
      const shifts = (checklist?.items ?? []).slice(0, 3).map((item) => ({
        item_id: item.id,
        label: item.text,
        previous_deadline: item.deadline_at,
        new_deadline: new Date(newStart.getTime() - item.hours_before * 3_600_000).toISOString(),
        becomes_overdue_immediately: false,
      }));

      const roster = store.rosters.get(session.id);
      const affected = roster?.bookings.length ?? 0;
      const contactable = roster?.bookings.filter((b) => b.guest.is_contactable).length ?? 0;

      const impact = {
        previous_start: session.starts_at,
        new_start: newStart.toISOString(),
        moves_earlier: newStart.getTime() < new Date(session.starts_at).getTime(),
        affected_guest_count: affected,
        contactable_guest_count: contactable,
        requires_guest_notification: contactable > 0,
        deadline_shifts: shifts,
        newly_overdue_count: 0,
      };

      if (!body.confirm) return json({ preview: true, impact });

      const duration = new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime();

      const updated = {
        ...session,
        starts_at: newStart.toISOString(),
        ends_at: new Date(newStart.getTime() + duration).toISOString(),
      };

      store.sessions[index] = updated;
      return json({ preview: false, session: updated, impact });
    }

    const lockMatch = /^\/api\/v1\/sessions\/([^/]+)\/lock$/.exec(path);
    if (lockMatch && method === 'PATCH') {
      const index = store.sessions.findIndex((s) => s.id === lockMatch[1]);
      if (index < 0) return error(404, 'not_found', "We couldn't find that class.");

      const locked = url.searchParams.get('locked') === 'true';
      const session = store.sessions[index]!;

      const updated = recalculate({
        ...session,
        status: locked ? 'locked' : 'scheduled',
      });

      store.sessions[index] = updated;
      return json(updated);
    }

    const rosterMatch = /^\/api\/v1\/sessions\/([^/]+)\/roster$/.exec(path);
    if (rosterMatch && method === 'GET') {
      return json(
        store.rosters.get(rosterMatch[1]!) ?? {
          session_id: rosterMatch[1],
          bookings: [],
          unassigned_count: 0,
          critical_allergy_count: 0,
        },
      );
    }

    const inviteMatch = /^\/api\/v1\/sessions\/([^/]+)\/waitlist\/invite$/.exec(path);
    if (inviteMatch && method === 'POST') {
      const session = store.sessions.find((s) => s.id === inviteMatch[1]);

      if (!session || session.capacity.available === 0) {
        return json({
          invited_guest_id: null,
          send_at: null,
          expired_count: 0,
          message: "There's no free seat to offer.",
        });
      }

      return json({
        invited_guest_id: 'g-hira',
        send_at: new Date(Date.now() + 3_600_000).toISOString(),
        expired_count: 0,
        message: 'Invite sent — their seat is held until they reply.',
      });
    }

    // ---- checklist -------------------------------------------------------

    const checklistMatch = /^\/api\/v1\/sessions\/([^/]+)\/checklist$/.exec(path);
    if (checklistMatch && method === 'GET') {
      return json(
        store.checklists.get(checklistMatch[1]!) ?? demoChecklist(now, checklistMatch[1]!),
      );
    }

    const itemMatch = /^\/api\/v1\/checklist\/([^/]+)$/.exec(path);
    if (itemMatch && method === 'PATCH') {
      for (const checklist of store.checklists.values()) {
        const item = checklist.items.find((i) => i.id === itemMatch[1]);
        if (!item) continue;

        item.completed_at = body.completed ? new Date().toISOString() : null;
        item.status = body.completed ? 'done' : 'upcoming';
        // Ticking resolves the drift prompt: the host has seen the new value.
        if (body.completed) item.needs_attention = false;

        checklist.completed_count = checklist.items.filter((i) => i.completed_at).length;
        checklist.overdue_count = checklist.items.filter((i) => i.status === 'overdue').length;

        return json(item);
      }

      return error(404, 'not_found', "We couldn't find that prep step.");
    }

    const addItemMatch = /^\/api\/v1\/sessions\/([^/]+)\/checklist$/.exec(path);
    if (addItemMatch && method === 'POST') {
      const checklist = store.checklists.get(addItemMatch[1]!);
      if (!checklist) return error(404, 'not_found', "We couldn't find that class.");

      const session = store.sessions.find((s) => s.id === addItemMatch[1]);
      const hoursBefore = Number(body.hours_before ?? 1);
      const deadline = new Date(
        (session ? new Date(session.starts_at).getTime() : now.getTime()) -
          hoursBefore * 3_600_000,
      ).toISOString();

      const item: ChecklistItem = {
        id: `c-new-${checklist.items.length}-${Date.now()}`,
        text: String(body.text ?? ''),
        quantity: null,
        hours_before: hoursBefore,
        t_minus_label: `T-${hoursBefore}h`,
        deadline_at: deadline,
        status: 'upcoming',
        phase: body.phase ?? 'prep',
        is_high_priority: false,
        is_one_off: true,
        completed_at: null,
        needs_attention: false,
      };

      checklist.items.push(item);
      checklist.total_count = checklist.items.length;

      return json(item, 201);
    }

    // ---- tags & exports ----------------------------------------------------

    // Shared by the sheet read and the export write, so a record just made
    // from this roster always reads back as fresh rather than immediately
    // stale from a differently-ordered hash.
    const rosterHash = (sessionId: string) =>
      (store.rosters.get(sessionId)?.bookings ?? [])
        .filter((b) => b.status !== 'cancelled')
        .map((b) => `${b.guest.id}:${b.table_number}`)
        .sort()
        .join('|');

    const tagSheetMatch = /^\/api\/v1\/sessions\/([^/]+)\/tags$/.exec(path);
    if (tagSheetMatch && method === 'GET') {
      const session = store.sessions.find((s) => s.id === tagSheetMatch[1]);
      if (!session) return error(404, 'not_found', "We couldn't find that class.");

      const roster = store.rosters.get(session.id);
      const bookings = (roster?.bookings ?? []).filter((b) => b.status !== 'cancelled');

      const subjects = bookings
        .map((b) => ({
          guest_id: b.guest.id,
          full_name: b.guest.full_name,
          table_number: b.table_number,
          subtext: b.booking_answers ? Object.values(b.booking_answers)[0] ?? null : null,
        }))
        .sort((a, b) =>
          a.table_number === b.table_number
            ? a.full_name.localeCompare(b.full_name)
            : (a.table_number ?? Infinity) - (b.table_number ?? Infinity),
        );

      const hash = rosterHash(session.id);
      const latest = store.exports
        .filter((e) => e.session_id === session.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

      const sheet: TagSheet = {
        session_id: session.id,
        subjects,
        roster_hash: hash,
        last_exported_at: latest?.created_at ?? null,
        last_export_theme: latest?.theme ?? null,
        roster_changed_since_export: Boolean(latest && latest.roster_hash !== hash),
      };

      return json(sheet);
    }

    const recordExportMatch = /^\/api\/v1\/sessions\/([^/]+)\/exports$/.exec(path);
    if (recordExportMatch && method === 'POST') {
      const session = store.sessions.find((s) => s.id === recordExportMatch[1]);
      if (!session) return error(404, 'not_found', "We couldn't find that class.");

      const record: ExportRecord = {
        id: `exp-${store.exports.length}`,
        session_id: session.id,
        theme: String(body.theme ?? ''),
        layout: String(body.layout ?? ''),
        roster_hash: rosterHash(session.id),
        file_url: body.file_url ?? null,
        created_at: now.toISOString(),
      };

      store.exports.push(record);
      return json(record, 201);
    }

    // ---- guests ----------------------------------------------------------

    if (path === '/api/v1/guests/birthdays' && method === 'GET') {
      return json(demoBirthdays(now));
    }

    // Derived from the sessions the fixtures already define, rather than a
    // second hand-written list that would drift out of step with them.
    const historyMatch = /^\/api\/v1\/guests\/([^/]+)\/history$/.exec(path);
    if (historyMatch && method === 'GET') {
      const guestId = historyMatch[1]!;

      const visits = store.sessions.flatMap((session) =>
        demoRoster(now, session.id)
          .bookings.filter((booking) => booking.guest.id === guestId)
          .map((booking) => ({
            booking_id: booking.id,
            session_id: session.id,
            class_name: session.class_type_name,
            starts_at: session.starts_at,
            location: session.location,
            status: booking.status,
            table_number: booking.table_number,
            is_upcoming: new Date(session.starts_at).getTime() > now.getTime(),
          })),
      );

      return json({
        guest_id: guestId,
        visits,
        credits: [],
        attended_count: visits.filter((v) => !v.is_upcoming && v.status !== 'cancelled').length,
        upcoming_count: visits.filter((v) => v.is_upcoming).length,
        available_credit_count: 0,
      });
    }

    const messagesMatch = /^\/api\/v1\/guests\/([^/]+)\/messages$/.exec(path);
    if (messagesMatch && method === 'GET') {
      return json(store.messages.filter((m) => m.guest_id === messagesMatch[1]));
    }

    if (path === '/api/v1/messages/failed' && method === 'GET') {
      return json(store.messages.filter((m) => m.status === 'failed'));
    }

    const previewMatch = /^\/api\/v1\/sessions\/([^/]+)\/messages\/preview$/.exec(path);
    if (previewMatch && method === 'POST') {
      const session = store.sessions.find((s) => s.id === previewMatch[1]);
      if (!session) return error(404, 'not_found', "We couldn't find that class.");

      const voice = body.voice ?? store.settings.default_voice;
      const sendAt = new Date(new Date(session.starts_at).getTime() - 24 * 3_600_000).toISOString();

      const previews: MessagePreview[] = GUEST_MESSAGE_KINDS.map((kind) => ({
        kind,
        voice,
        body:
          kind === 'guest_reminder'
            ? `See you at ${session.class_type_name} tomorrow! 🌷`
            : `Thanks for coming to ${session.class_type_name} — hope you loved it!`,
        send_at: sendAt,
        will_send: true,
        skip_reason: null,
        was_shifted: false,
        unresolved_placeholders: [],
      }));

      return json(previews);
    }

    const scheduleMatch = /^\/api\/v1\/sessions\/([^/]+)\/messages$/.exec(path);
    if (scheduleMatch && method === 'POST') {
      const session = store.sessions.find((s) => s.id === scheduleMatch[1]);
      if (!session) return error(404, 'not_found', "We couldn't find that class.");

      const roster = store.rosters.get(session.id);
      const bookings = (roster?.bookings ?? []).filter((b) => b.status !== 'cancelled');
      const sendAt = new Date(new Date(session.starts_at).getTime() - 24 * 3_600_000).toISOString();

      const existing = new Set(
        store.messages
          .filter((m) => m.session_id === session.id)
          .map((m) => `${m.guest_id}:${m.kind}`),
      );

      const queued: ScheduledMessage[] = [];

      for (const booking of bookings) {
        for (const kind of GUEST_MESSAGE_KINDS) {
          const key = `${booking.guest.id}:${kind}`;
          if (existing.has(key)) continue;

          const message: ScheduledMessage = {
            id: `msg-${store.messages.length}-${queued.length}`,
            session_id: session.id,
            guest_id: booking.guest.id,
            kind,
            channel: booking.guest.preferred_channel,
            status: 'scheduled',
            send_at: sendAt,
            sent_at: null,
            body:
              kind === 'guest_reminder'
                ? `See you at ${session.class_type_name} tomorrow! 🌷`
                : `Thanks for coming to ${session.class_type_name} — hope you loved it!`,
            attempt_count: 0,
            last_error: null,
          };

          store.messages.push(message);
          queued.push(message);
        }
      }

      return json(
        {
          session_id: session.id,
          queued: queued.length,
          skipped: 0,
          skips: {},
          messages: queued,
        },
        201,
      );
    }

    if (scheduleMatch && method === 'GET') {
      return json(store.messages.filter((m) => m.session_id === scheduleMatch[1]));
    }

    const retryMatch = /^\/api\/v1\/messages\/([^/]+)\/retry$/.exec(path);
    if (retryMatch && method === 'POST') {
      const message = store.messages.find((m) => m.id === retryMatch[1]);
      if (!message) return error(404, 'not_found', "We couldn't find that message.");

      message.status = 'scheduled';
      message.last_error = null;
      return json(message);
    }

    const cancelMatch2 = /^\/api\/v1\/messages\/([^/]+)\/cancel$/.exec(path);
    if (cancelMatch2 && method === 'POST') {
      const message = store.messages.find((m) => m.id === cancelMatch2[1]);
      if (!message) return error(404, 'not_found', "We couldn't find that message.");

      message.status = 'cancelled';
      if (body.reason) message.last_error = body.reason;
      return json(message);
    }

    // ---- guest portal ----------------------------------------------------
    //
    // Demo mode skips auth entirely, so the portal answers as though Sana is
    // signed in. Enough for the mobile and accessibility checks to reach
    // these screens, which they otherwise could not.

    const asPortalWorkshop = (session: Session) => {
      const starts = new Date(session.starts_at).getTime();
      const ends = new Date(session.ends_at).getTime();

      return {
        session_id: session.id,
        booking_id: `b-${session.id}`,
        name: session.class_type_name,
        starts_at: session.starts_at,
        ends_at: session.ends_at,
        location: session.location,
        color_token: session.color_token,
        status: ends <= now.getTime() ? 'completed' : starts <= now.getTime() ? 'live' : 'upcoming',
        attendee_count: session.capacity.booked,
      };
    };

    // ---- chat ------------------------------------------------------------
    //
    // Held in module scope so a message sent during a test is still there on
    // the next poll — a store that reset per request would make the thread
    // look broken.

    // ---- admin chat ------------------------------------------------------

    if (path === '/api/v1/chat/rooms' && method === 'GET') {
      return json([
        {
          id: 'room-lounge',
          kind: 'lounge',
          name: 'The lounge',
          session_id: null,
          message_count: demoChat.length,
          last_message_at: demoChat.at(-1)?.created_at ?? null,
          banner: demoBanner ? { body: demoBanner, updated_at: now.toISOString() } : null,
        },
      ]);
    }

    const openDirect = /^\/api\/v1\/guests\/([^/]+)\/chat$/.exec(path);
    if (openDirect && method === 'POST') {
      return json({
        id: `room-direct-${openDirect[1]}`,
        kind: 'direct',
        name: 'Sana R.',
        session_id: null,
        message_count: 0,
        last_message_at: null,
        banner: null,
      });
    }

    const adminRoom = /^\/api\/v1\/chat\/rooms\/([^/]+)\/messages$/.exec(path);
    if (adminRoom && method === 'GET') {
      return json(
        demoChat.map((m) => ({
          id: m.id,
          body: m.body,
          created_at: m.created_at,
          author_id: m.author_id,
          author_name: m.author_name,
          is_host: m.is_host,
          is_broadcast: m.is_broadcast,
          is_deleted: false,
        })),
      );
    }

    if (adminRoom && method === 'POST') {
      // The host replying in one room. Pushed into the same list the reads
      // come from, so the demo behaves like the real thing: send it and it is
      // there on the next poll.
      const reply = {
        id: `demo-host-${demoChat.length}`,
        body: String(body.body ?? ''),
        created_at: now.toISOString(),
        author_id: null,
        author_name: 'You',
        is_you: false,
        is_host: true,
        is_broadcast: false,
        reactions: [],
      };
      demoChat.push(reply);

      return json({ ...reply, is_deleted: false }, 201);
    }

    const adminBanner = /^\/api\/v1\/chat\/rooms\/([^/]+)\/banner$/.exec(path);
    if (adminBanner && method === 'PUT') {
      demoBanner = String(body.body ?? '');
      return json({ body: demoBanner, updated_at: now.toISOString() });
    }
    if (adminBanner && method === 'DELETE') {
      demoBanner = null;
      return new Response(null, { status: 204 });
    }

    if (/^\/api\/v1\/chat\/messages\/[^/]+$/.test(path) && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    if (path === '/api/v1/broadcasts/preview' && method === 'POST') {
      return json({
        body: String(body.body ?? ''),
        room_count: 3,
        room_names: ['The lounge', 'Bento cake decorating', 'Pottery & wheel throwing'],
        guest_count: store.guests.length,
      });
    }

    if (path === '/api/v1/broadcasts' && method === 'POST') {
      return json(
        { id: 'bc-1', body: String(body.body ?? ''), room_count: 3, sent_at: now.toISOString() },
        201,
      );
    }

    if (path === '/api/v1/portal/rooms' && method === 'GET') {
      return json([
        {
          id: 'room-lounge',
          kind: 'lounge',
          name: 'The lounge',
          session_id: null,
          unread_count: demoChat.length > 0 ? 0 : 2,
          last_message_at: demoChat.at(-1)?.created_at ?? null,
          last_message_preview: demoChat.at(-1)?.body ?? 'Say hi first',
        },
        ...store.sessions.slice(0, 2).map((s) => ({
          id: `room-${s.id}`,
          kind: 'workshop' as const,
          name: s.class_type_name,
          session_id: s.id,
          unread_count: 0,
          last_message_at: null,
          last_message_preview: null,
        })),
      ]);
    }

    const roomMessages = /^\/api\/v1\/portal\/rooms\/([^/]+)\/messages$/.exec(path);
    if (roomMessages && method === 'GET') {
      return json(roomMessages[1] === 'room-lounge' ? demoChat : []);
    }

    if (roomMessages && method === 'POST') {
      const message = {
        id: `m-${demoChat.length + 1}`,
        body: String(body.body ?? ''),
        created_at: new Date().toISOString(),
        author_id: 'g-sana',
        author_name: 'Sana R.',
        is_you: true,
        is_host: false,
        is_broadcast: false,
        reactions: [],
      };
      demoChat.push(message);
      return json(message, 201);
    }

    if (/^\/api\/v1\/portal\/rooms\/[^/]+\/read$/.test(path) && method === 'POST') {
      return new Response(null, { status: 204 });
    }

    const reactionPath = /^\/api\/v1\/portal\/messages\/([^/]+)\/reactions$/.exec(path);
    if (reactionPath && method === 'PUT') {
      const message = demoChat.find((m) => m.id === reactionPath[1]);
      if (!message) return json({ code: 'not_found', message: 'Not found' }, 404);

      const emoji = String(body.emoji ?? '');
      const existing = message.reactions.find((r) => r.emoji === emoji);

      message.reactions = existing
        ? message.reactions.filter((r) => r.emoji !== emoji)
        : [...message.reactions, { emoji, count: 1, reacted: true }];

      return json(message);
    }

    if (path === '/api/v1/portal/whoami' && method === 'GET') {
      return json({ role: 'guest' });
    }

    if (path === '/api/v1/portal/claim' && method === 'POST') {
      return json({ claimed: true, display_name: 'Sana R.', message: "You're in." });
    }

    if (path === '/api/v1/portal/me' && method === 'GET') {
      return json({
        guest_id: 'g-sana',
        full_name: 'Sana R.',
        display_name: 'Sana R.',
        email: 'sana@example.com',
        upcoming_count: store.sessions.filter(
          (s) => new Date(s.starts_at).getTime() > now.getTime(),
        ).length,
        attended_count: 1,
      });
    }

    if (path === '/api/v1/portal/workshops' && method === 'GET') {
      return json(store.sessions.map(asPortalWorkshop));
    }

    const portalDetail = /^\/api\/v1\/portal\/workshops\/([^/]+)$/.exec(path);
    if (portalDetail && method === 'GET') {
      const session = store.sessions.find((s) => s.id === portalDetail[1]);
      if (!session) return json({ code: 'not_found', message: 'Not found' }, 404);

      const attendees = demoRoster(now, session.id).bookings.map((b, index) => ({
        guest_id: b.guest.id,
        display_name: b.guest.full_name,
        is_you: index === 0,
      }));

      return json({
        ...asPortalWorkshop(session),
        notes: session.notes,
        attendees,
        others_count: attendees.filter((a) => !a.is_you).length,
      });
    }

    if (path === '/api/v1/guests' && method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase();
      const regularsOnly = url.searchParams.get('regulars_only') === 'true';

      let guests = store.guests;
      if (regularsOnly) guests = guests.filter((g) => g.is_regular);
      if (search) guests = guests.filter((g) => g.full_name.toLowerCase().includes(search));

      return json([...guests].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    }

    if (path === '/api/v1/guests' && method === 'POST') {
      const phone = String(body.phone ?? '').replace(/\D/g, '');
      const merge = url.searchParams.get('merge_duplicates') === 'true';

      const existing = phone
        ? store.guests.find((g) => (g.phone ?? '').replace(/\D/g, '') === phone)
        : undefined;

      if (existing && !merge) {
        return error(
          409,
          'duplicate_guest',
          `${existing.full_name} is already in your guests with those details. ` +
            `Add to their history instead of starting a new record?`,
        );
      }

      if (existing) return json(existing, 201);

      const created: Guest = {
        id: `g-new-${Date.now()}`,
        full_name: body.full_name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        preferred_channel: body.preferred_channel ?? 'whatsapp',
        opted_out: false,
        is_contactable: Boolean(body.phone || body.email),
        visit_count: 0,
        visit_badge: null,
        is_regular: false,
        birthday: body.birthday ?? null,
        days_until_birthday: null,
        memory_note: body.memory_note ?? null,
        allergies: [],
        available_credits: 0,
      };

      store.guests.push(created);
      return json(created, 201);
    }

    // ---- bookings --------------------------------------------------------

    const tableMatch = /^\/api\/v1\/bookings\/([^/]+)\/table$/.exec(path);
    if (tableMatch && method === 'PATCH') {
      for (const roster of store.rosters.values()) {
        const booking = roster.bookings.find((b) => b.id === tableMatch[1]);
        if (!booking) continue;

        booking.table_number = body.table_number;
        roster.unassigned_count = roster.bookings.filter(
          (b) => b.table_number === null && b.status !== 'cancelled',
        ).length;

        return json(booking);
      }

      return error(404, 'not_found', "We couldn't find that booking.");
    }

    const cancelMatch = /^\/api\/v1\/bookings\/([^/]+)\/cancel$/.exec(path);
    if (cancelMatch && method === 'POST') {
      for (const [sessionId, roster] of store.rosters.entries()) {
        const booking = roster.bookings.find((b) => b.id === cancelMatch[1]);
        if (!booking) continue;

        booking.status = 'cancelled';
        roster.unassigned_count = roster.bookings.filter(
          (b) => b.table_number === null && b.status !== 'cancelled',
        ).length;

        const index = store.sessions.findIndex((s) => s.id === sessionId);
        if (index >= 0) {
          const session = store.sessions[index]!;
          store.sessions[index] = recalculate({
            ...session,
            capacity: {
              ...session.capacity,
              booked: Math.max(0, session.capacity.booked - 1),
            },
          });
        }

        if (body.resolution === 'credit') {
          const guest = store.guests.find((g) => g.id === booking.guest.id);
          if (guest) guest.available_credits += 1;
        }

        return json(booking);
      }

      return error(404, 'not_found', "We couldn't find that booking.");
    }

    // ---- settings --------------------------------------------------------

    if (path === '/api/v1/settings' && method === 'GET') return json(store.settings);

    if (path === '/api/v1/settings' && method === 'PATCH') {
      store.settings = { ...store.settings, ...body };
      return json(store.settings);
    }

    if (path === '/api/v1/settings/brand-kit' && method === 'GET') return json(store.brandKit);

    if (path === '/api/v1/settings/brand-kit' && method === 'PATCH') {
      store.brandKit = { ...store.brandKit, ...body };
      return json(store.brandKit);
    }

    return error(404, 'not_found', `Demo mode has no answer for ${method} ${path}.`);
  } as typeof fetch;
}
