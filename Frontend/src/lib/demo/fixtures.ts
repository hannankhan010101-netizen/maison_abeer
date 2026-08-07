import type {
  Booking,
  Checklist,
  ChecklistItem,
  Guest,
  Roster,
  Session,
  StudioSettings,
  UpcomingBirthday,
} from '@/lib/api/types';

/**
 * Demo data.
 *
 * Mirrors the prototype's cast — Sana, Ayesha with her nut allergy and
 * birthday, Meerab the first-timer, Fatima the regular, Zainab with a
 * rain-check credit — so the seeded app looks like the design it was built
 * from rather than like lorem ipsum.
 *
 * Dates are computed from a supplied `now` so the data is always plausibly
 * current: a fixture with hardcoded 2026 dates reads as broken the moment the
 * calendar disagrees.
 */

function at(now: Date, dayOffset: number, hour: number, minute = 0): string {
  const date = new Date(now);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function guest(overrides: Partial<Guest> & Pick<Guest, 'id' | 'full_name'>): Guest {
  return {
    phone: '03001234567',
    email: null,
    preferred_channel: 'whatsapp',
    opted_out: false,
    is_contactable: true,
    visit_count: 1,
    visit_badge: null,
    is_regular: false,
    birthday: null,
    days_until_birthday: null,
    memory_note: null,
    allergies: [],
    available_credits: 0,
    ...overrides,
  };
}

export function demoGuests(now: Date): Guest[] {
  const birthdayIn = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  return [
    guest({
      id: 'g-sana',
      full_name: 'Sana R.',
      visit_count: 4,
      visit_badge: '4th visit',
      is_regular: true,
      memory_note: 'Brought her mum last time · loved the matcha buttercream',
    }),
    guest({
      id: 'g-ayesha',
      full_name: 'Ayesha K.',
      phone: '03002222222',
      visit_count: 2,
      visit_badge: '2nd visit',
      birthday: birthdayIn(4),
      days_until_birthday: 4,
      memory_note: 'Surprise from her sister — bring the candle',
      allergies: [
        {
          id: 'a-nut',
          label: 'Nut allergy',
          severity: 'severe',
          notes: 'no traces, please',
          is_critical: true,
        },
      ],
    }),
    guest({
      id: 'g-meerab',
      full_name: 'Meerab A.',
      phone: '03003333333',
      visit_count: 1,
      memory_note: 'Found you on Instagram',
    }),
    guest({
      id: 'g-fatima',
      full_name: 'Fatima N.',
      phone: '03004444444',
      visit_count: 3,
      visit_badge: '3rd visit',
      is_regular: true,
      memory_note: 'Sits with Sana, always early',
    }),
    guest({
      id: 'g-zainab',
      full_name: 'Zainab T.',
      phone: null,
      email: null,
      is_contactable: false,
      memory_note: 'Added from a DM — no number yet',
      available_credits: 1,
    }),
    guest({
      id: 'g-hira',
      full_name: 'Hira S.',
      phone: '03006666666',
      visit_count: 0,
    }),
  ];
}

export function demoSessions(now: Date): Session[] {
  return [
    {
      id: 's-bento',
      class_type_id: 'ct-bento',
      class_type_name: 'Bento cake decorating',
      color_token: 'pink',
      title: null,
      location: 'Studio A',
      notes: null,
      starts_at: at(now, 2, 14),
      ends_at: at(now, 2, 16, 30),
      status: 'scheduled',
      capacity: {
        seats: 10,
        booked: 8,
        available: 2,
        state: 'nearly_full',
        waitlist_is_open: false,
        accepts_bookings: true,
      },
      // Drives the dashboard's "guests need a table" nudge.
      unassigned_guest_count: 2,
      roster_changed_since_export: true,
    },
    {
      id: 's-pottery',
      class_type_id: 'ct-pottery',
      class_type_name: 'Pottery & wheel throwing',
      color_token: 'terra',
      title: null,
      location: 'Studio B',
      notes: null,
      starts_at: at(now, 4, 18),
      ends_at: at(now, 4, 20),
      status: 'locked',
      capacity: {
        seats: 8,
        booked: 8,
        available: 0,
        state: 'sold_out',
        waitlist_is_open: true,
        accepts_bookings: false,
      },
      unassigned_guest_count: 0,
      roster_changed_since_export: false,
    },
    {
      id: 's-ceramic',
      class_type_id: 'ct-ceramic',
      class_type_name: 'Ceramic painting',
      color_token: 'sage',
      title: null,
      location: 'Studio A',
      notes: null,
      starts_at: at(now, 6, 17, 30),
      ends_at: at(now, 6, 19, 30),
      status: 'scheduled',
      capacity: {
        seats: 12,
        booked: 4,
        available: 8,
        state: 'filling',
        waitlist_is_open: false,
        accepts_bookings: true,
      },
      unassigned_guest_count: 0,
      roster_changed_since_export: false,
    },
    {
      // Already finished, so "Your Week, Wrapped" has something to celebrate.
      id: 's-past',
      class_type_id: 'ct-bento',
      class_type_name: 'Bento cake decorating',
      color_token: 'pink',
      title: null,
      location: 'Studio A',
      notes: null,
      starts_at: at(now, -2, 14),
      ends_at: at(now, -2, 16, 30),
      status: 'completed',
      capacity: {
        seats: 10,
        booked: 10,
        available: 0,
        state: 'sold_out',
        waitlist_is_open: true,
        accepts_bookings: false,
      },
      unassigned_guest_count: 0,
      roster_changed_since_export: false,
    },
  ];
}

export function demoRoster(now: Date, sessionId: string): Roster {
  const guests = demoGuests(now);
  const byId = (id: string) => guests.find((g) => g.id === id)!;

  const bookings: Booking[] = [
    {
      id: 'b-sana',
      guest: byId('g-sana'),
      status: 'confirmed',
      table_number: 2,
      sit_with_note: null,
      booking_answers: { flavour: 'Team gulab jamun 🍮' },
    },
    {
      id: 'b-ayesha',
      guest: byId('g-ayesha'),
      status: 'confirmed',
      table_number: 2,
      sit_with_note: 'With her sister',
      booking_answers: { note: 'Birthday girl 🎂' },
    },
    {
      id: 'b-meerab',
      guest: byId('g-meerab'),
      status: 'confirmed',
      table_number: null,
      sit_with_note: null,
      booking_answers: { note: 'First-timer, be nice ✨' },
    },
    {
      id: 'b-fatima',
      guest: byId('g-fatima'),
      status: 'confirmed',
      table_number: 1,
      sit_with_note: 'Sits with Sana',
      booking_answers: { note: '3rd class, basically staff 💅' },
    },
    {
      id: 'b-zainab',
      guest: byId('g-zainab'),
      status: 'confirmed',
      table_number: null,
      sit_with_note: null,
      booking_answers: null,
    },
  ];

  return {
    session_id: sessionId,
    bookings,
    unassigned_count: bookings.filter((b) => b.table_number === null).length,
    critical_allergy_count: 1,
  };
}

export function demoChecklist(now: Date, sessionId: string): Checklist {
  const session = demoSessions(now).find((s) => s.id === sessionId) ?? demoSessions(now)[0]!;
  const start = new Date(session.starts_at);

  const deadline = (hoursBefore: number) =>
    new Date(start.getTime() - hoursBefore * 3_600_000).toISOString();

  const items: ChecklistItem[] = [
    {
      id: 'c-bases',
      text: 'Bake 12 cake bases',
      quantity: 12,
      hours_before: 24,
      t_minus_label: 'T-24h',
      deadline_at: deadline(24),
      status: 'upcoming',
      phase: 'prep',
      is_high_priority: true,
      is_one_off: false,
      completed_at: new Date(now.getTime() - 3_600_000).toISOString(),
      // Seats went 10 → 12 after this was ticked (PRD §2.5).
      needs_attention: true,
    },
    {
      id: 'c-buttercream',
      text: 'Make buttercream · 3 batches',
      quantity: 3,
      hours_before: 24,
      t_minus_label: 'T-24h',
      deadline_at: deadline(24),
      status: 'upcoming',
      phase: 'prep',
      is_high_priority: false,
      is_one_off: false,
      completed_at: new Date(now.getTime() - 7_200_000).toISOString(),
      needs_attention: false,
    },
    {
      id: 'c-piping',
      text: 'Mix pastel piping bags ×12',
      quantity: 12,
      hours_before: 4,
      t_minus_label: 'T-4h',
      deadline_at: deadline(4),
      status: 'upcoming',
      phase: 'prep',
      is_high_priority: false,
      is_one_off: false,
      completed_at: null,
      needs_attention: false,
    },
    {
      id: 'c-sprinkles',
      text: 'Set out the sprinkle bar',
      quantity: null,
      hours_before: 1,
      t_minus_label: 'T-1h',
      deadline_at: deadline(1),
      status: 'upcoming',
      phase: 'prep',
      is_high_priority: false,
      is_one_off: false,
      completed_at: null,
      needs_attention: false,
    },
    {
      id: 'c-candle',
      text: "Ayesha's birthday candle 🎂",
      quantity: null,
      hours_before: 1,
      t_minus_label: 'T-1h',
      deadline_at: deadline(1),
      status: 'upcoming',
      phase: 'prep',
      is_high_priority: false,
      is_one_off: true,
      completed_at: null,
      needs_attention: false,
    },
    {
      id: 'c-kiln',
      text: 'Load the kiln for glaze pieces',
      quantity: null,
      hours_before: 48,
      t_minus_label: 'T-48h',
      deadline_at: new Date(now.getTime() - 3_600_000).toISOString(),
      // Deliberately overdue, so the escalation is visible.
      status: 'overdue',
      phase: 'prep',
      is_high_priority: true,
      is_one_off: false,
      completed_at: null,
      needs_attention: false,
    },
    {
      id: 'c-wash',
      text: 'Wash piping tips',
      quantity: null,
      hours_before: -2,
      t_minus_label: 'T+2h',
      deadline_at: deadline(-2),
      status: 'upcoming',
      phase: 'post_class',
      is_high_priority: false,
      is_one_off: false,
      completed_at: null,
      needs_attention: false,
    },
    {
      id: 'c-aprons',
      text: 'Restock aprons',
      quantity: null,
      hours_before: -2,
      t_minus_label: 'T+2h',
      deadline_at: deadline(-2),
      status: 'upcoming',
      phase: 'post_class',
      is_high_priority: false,
      is_one_off: false,
      completed_at: null,
      needs_attention: false,
    },
  ];

  return {
    session_id: sessionId,
    items,
    completed_count: items.filter((i) => i.completed_at !== null).length,
    total_count: items.length,
    overdue_count: items.filter((i) => i.status === 'overdue').length,
  };
}

export function demoBirthdays(now: Date): UpcomingBirthday[] {
  const ayesha = demoGuests(now).find((g) => g.id === 'g-ayesha')!;

  return [
    {
      guest_id: ayesha.id,
      full_name: ayesha.full_name,
      birthday: ayesha.birthday!,
      days_away: 4,
      has_upcoming_booking: true,
    },
  ];
}

export const demoSettings: StudioSettings = {
  timezone: 'Asia/Karachi',
  quiet_hours_start: '09:00:00',
  quiet_hours_end: '21:00:00',
  weekly_class_cap: 4,
  rest_days: [7],
  default_voice: 'soft_sweet',
  emoji_density: 'full',
  show_greeting: true,
};

export const demoBrandKit = {
  logo_url: null,
  primary_color: null,
  accent_color: null,
  instagram_handle: 'maisonabeer',
};
