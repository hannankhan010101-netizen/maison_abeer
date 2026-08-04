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
