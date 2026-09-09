/**
 * Response types, mirroring the API's Pydantic schemas.
 *
 * Hand-written for now. Once the API is reachable these should be generated
 * from its OpenAPI document so drift becomes a build error rather than a
 * runtime surprise — that is the whole reason the backend publishes a schema.
 */

export type CapacityState = 'open' | 'filling' | 'nearly_full' | 'sold_out';
export type SessionStatus = 'scheduled' | 'locked' | 'completed' | 'cancelled';
export type BookingStatus = 'confirmed' | 'attended' | 'no_show' | 'cancelled';
export type MessageChannel = 'sms' | 'whatsapp' | 'email' | 'in_app';
export type EnergyWarning = 'none' | 'rest_day' | 'weekly_cap' | 'back_to_back';

export interface Capacity {
  seats: number;
  booked: number;
  available: number;
  state: CapacityState;
  waitlist_is_open: boolean;
  accepts_bookings: boolean;
}

export interface Session {
  id: string;
  class_type_id: string;
  class_type_name: string;
  /** Token name, not a hex value, so a palette change reaches existing data. */
  color_token: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: SessionStatus;
  capacity: Capacity;
  unassigned_guest_count: number;
  roster_changed_since_export: boolean;
}

export interface EnergyAssessment {
  warning: EnergyWarning;
  message: string;
}

export interface SessionCreateResponse {
  /** More than one when weekly recurrence was requested. */
  sessions: Session[];
  energy: EnergyAssessment;
}

export interface DeadlineShift {
  item_id: string;
  label: string;
  previous_deadline: string;
  new_deadline: string;
  becomes_overdue_immediately: boolean;
}

export interface RescheduleImpact {
  previous_start: string;
  new_start: string;
  moves_earlier: boolean;
  affected_guest_count: number;
  contactable_guest_count: number;
  requires_guest_notification: boolean;
  deadline_shifts: DeadlineShift[];
  newly_overdue_count: number;
}

export type ReschedulePreview = { preview: true; impact: RescheduleImpact };
export type RescheduleApplied = {
  preview: false;
  session: Session;
  impact: RescheduleImpact;
};
export type RescheduleResponse = ReschedulePreview | RescheduleApplied;

export interface Allergy {
  id: string;
  label: string;
  severity: 'preference' | 'intolerance' | 'allergy' | 'severe';
  notes: string | null;
  /** Renders the red-outlined chip and the day-of dashboard alert. */
  is_critical: boolean;
}

export interface Guest {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  preferred_channel: MessageChannel;
  opted_out: boolean;
  /** False means automated messages skip them; the roster badges this. */
  is_contactable: boolean;
  visit_count: number;
  /** "3rd visit", or null before it means anything. */
  visit_badge: string | null;
  is_regular: boolean;
  birthday: string | null;
  days_until_birthday: number | null;
  memory_note: string | null;
  allergies: Allergy[];
  available_credits: number;
}

export interface Booking {
  id: string;
  guest: Guest;
  status: BookingStatus;
  table_number: number | null;
  sit_with_note: string | null;
  /** Fun booking answers — these become name tag subtext. */
  booking_answers: Record<string, string> | null;
}

export interface Roster {
  session_id: string;
  bookings: Booking[];
  unassigned_count: number;
  critical_allergy_count: number;
}

export interface InviteResult {
  invited_guest_id: string | null;
  /** Already adjusted for quiet hours; may be later than now. */
  send_at: string | null;
  expired_count: number;
  message: string;
}

export interface UpcomingBirthday {
  guest_id: string;
  full_name: string;
  birthday: string;
  days_away: number;
  has_upcoming_booking: boolean;
}

// ---------------------------------------------------------------------------
// Prep checklist
// ---------------------------------------------------------------------------

export type DeadlineStatus = 'upcoming' | 'due_soon' | 'overdue' | 'done';
export type ChecklistPhase = 'prep' | 'post_class';

export interface ChecklistItem {
  id: string;
  /** Already rendered — quantity expressions resolved for the seat count. */
  text: string;
  quantity: number | null;
  hours_before: number;
  /** "T-24h", "at start", "T+2h". */
  t_minus_label: string;
  deadline_at: string;
  status: DeadlineStatus;
  phase: ChecklistPhase;
  is_high_priority: boolean;
  is_one_off: boolean;
  completed_at: string | null;
  /**
   * A capacity change moved this item's quantity after it was ticked. The
   * host is told rather than the value being silently rewritten.
   */
  needs_attention: boolean;
}

export interface Checklist {
  session_id: string;
  items: ChecklistItem[];
  completed_count: number;
  total_count: number;
  overdue_count: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type VoicePreset = 'soft_sweet' | 'chaotic_bestie' | 'clean_minimal';
export type EmojiDensity = 'none' | 'light' | 'full';

export interface StudioSettings {
  timezone: string;
  /** "HH:MM:SS" — guest messages only send inside this window. */
  quiet_hours_start: string;
  quiet_hours_end: string;
  weekly_class_cap: number | null;
  /** ISO weekdays, Monday=1 … Sunday=7. */
  rest_days: number[];
  default_voice: VoicePreset;
  emoji_density: EmojiDensity;
  show_greeting: boolean;
}

export interface BrandKit {
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  instagram_handle: string | null;
}

// ---------------------------------------------------------------------------
// Messages (PRD §2.6)
// ---------------------------------------------------------------------------

export type MessageKind =
  | 'guest_reminder'
  | 'guest_thank_you'
  | 'schedule_change'
  | 'waitlist_invite'
  | 'waitlist_position'
  | 'credit_issued'
  | 'birthday_offer'
  | 'host_nudge';

export type MessageStatus =
  | 'scheduled'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'skipped_opted_out'
  | 'skipped_no_contact';

/** A message the host can inspect before anything is queued. */
export interface MessagePreview {
  kind: MessageKind;
  voice: VoicePreset;
  body: string;
  send_at: string | null;
  will_send: boolean;
  /** Why it will not send. Never null-and-silent: one of the skip reasons. */
  skip_reason: string | null;
  /** Quiet hours moved it — surfaced as "sends 9 am" rather than hidden. */
  was_shifted: boolean;
  /** Non-empty means the copy would go out with a literal `{placeholder}`. */
  unresolved_placeholders: string[];
}

export interface ScheduledMessage {
  id: string;
  session_id: string | null;
  guest_id: string | null;
  kind: MessageKind;
  channel: MessageChannel;
  status: MessageStatus;
  send_at: string;
  sent_at: string | null;
  body: string;
  attempt_count: number;
  last_error: string | null;
}

export interface MessageScheduleResult {
  session_id: string;
  queued: number;
  skipped: number;
  /** Reason → count, so the host can see *why* nobody was messaged. */
  skips: Record<string, number>;
  messages: ScheduledMessage[];
}

export interface Feedback {
  id: string;
  booking_id: string;
  /** 1 = 😕, 2 = 🙂, 3 = 😍 */
  rating: number;
  one_word: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Name tags (PRD §2.3)
// ---------------------------------------------------------------------------

export interface TagSubject {
  guest_id: string;
  full_name: string;
  table_number: number | null;
  subtext: string | null;
}

export interface TagSheet {
  session_id: string;
  subjects: TagSubject[];
  /** Fingerprint of what would print right now. */
  roster_hash: string;
  last_exported_at: string | null;
  last_export_theme: string | null;
  /** Drives the "roster updated since your last export" banner. */
  roster_changed_since_export: boolean;
}

export interface ExportRecord {
  id: string;
  session_id: string;
  theme: string;
  layout: string;
  roster_hash: string;
  file_url: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Guest history (PRD §2.4 — the mini-CRM)
// ---------------------------------------------------------------------------

export type CreditStatus = 'available' | 'redeemed' | 'expired';

export interface GuestVisit {
  booking_id: string;
  session_id: string;
  class_name: string;
  starts_at: string;
  location: string | null;
  status: BookingStatus;
  table_number: number | null;
  /** Decided server-side so the client and API agree on "now". */
  is_upcoming: boolean;
}

export interface GuestCredit {
  id: string;
  status: CreditStatus;
  note: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface GuestHistory {
  guest_id: string;
  visits: GuestVisit[];
  credits: GuestCredit[];
  attended_count: number;
  upcoming_count: number;
  available_credit_count: number;
}

// ---------------------------------------------------------------------------
// Guest portal
// ---------------------------------------------------------------------------

export type WorkshopStatus =
  | 'upcoming'
  | 'live'
  | 'completed'
  | 'cancelled'
  | 'waitlisted'
  /** A seat opened up and is held for this guest until `invite_expires_at`. */
  | 'invited';

export interface PortalProfile {
  guest_id: string;
  full_name: string;
  /** What other guests see — first name + initial unless they chose one. */
  display_name: string;
  email: string | null;
  upcoming_count: number;
  attended_count: number;
}

/** Another guest, as far as this guest is concerned. Nothing identifying. */
export interface AttendeePeek {
  guest_id: string;
  display_name: string;
  is_you: boolean;
}

export interface PortalWorkshop {
  session_id: string;
  booking_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  color_token: string;
  /** Decided server-side, so the chip and the countdown cannot disagree. */
  status: WorkshopStatus;

  /** Set only when waitlisted. "You're 3rd" beats an unexplained wait. */
  waitlist_position?: number | null;
  /** Set only when `status` is `invited` — when the hold on the seat runs out. */
  invite_expires_at?: string | null;
  attendee_count: number;
}

export interface PortalWorkshopDetail extends PortalWorkshop {
  notes: string | null;
  attendees: AttendeePeek[];
  /** Attendees excluding you — what "+ 23 others" counts. */
  others_count: number;
}

export interface ClaimResult {
  claimed: boolean;
  display_name: string | null;
  message: string;
}

export interface DeclineResult {
  declined: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether *you* tapped it, so the pill renders active. */
  reacted: boolean;
}

export interface ChatMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string;
  is_you: boolean;
  is_host: boolean;
  is_broadcast: boolean;
  reactions: ReactionSummary[];
}

export interface ChatRoom {
  id: string;
  kind: 'workshop' | 'lounge' | 'direct';
  name: string;
  session_id: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;

  /**
   * The host's pinned announcement, if there is one. Read-only for a guest.
   *
   * The API has always sent this; it was missing here, so a banner the host
   * pinned was never rendered on the guest side at all.
   */
  banner: string | null;

  /** When the workshop runs. Null for the lounge and private threads. */
  starts_at?: string | null;
}

// ---------------------------------------------------------------------------
// Admin chat (host only)
// ---------------------------------------------------------------------------

export interface ChatBanner {
  body: string;
  updated_at: string;
}

export interface AdminRoom {
  id: string;
  kind: 'workshop' | 'lounge' | 'direct';
  name: string;
  session_id: string | null;
  message_count: number;
  last_message_at: string | null;
  banner: ChatBanner | null;
}

export interface AdminMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string;
  is_host: boolean;
  is_broadcast: boolean;
  /** Shown struck through rather than hidden — there has to be a record. */
  is_deleted: boolean;
}

export interface BroadcastPreview {
  body: string;
  room_count: number;
  room_names: string[];
  guest_count: number;
}

export interface BroadcastResult {
  id: string;
  body: string;
  room_count: number;
  sent_at: string | null;
}
