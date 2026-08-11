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
  Guest,
  Roster,
  Session,
  StudioSettings,
} from '@/lib/api/types';

/** Demo chat, module-scoped so a sent message survives to the next poll. */
const demoChat: ChatMessage[] = [];

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
      // Demo mode never queues anything, so an empty log is the honest answer.
      return json([]);
    }

    if (path === '/api/v1/messages/failed' && method === 'GET') {
      return json([]);
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
