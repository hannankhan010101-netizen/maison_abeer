/**
 * Date helpers for the calendar and dashboard.
 *
 * All functions take an explicit reference date rather than reading the clock,
 * so they are testable and so a render spanning midnight cannot disagree with
 * itself. The API returns ISO strings with offsets; these work in the
 * browser's local zone, which is the studio's zone in practice.
 */

export const MS_PER_DAY = 86_400_000;

/** Monday-first, matching the prototype's calendar header. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  // getDay() is Sunday-first; shift so Monday is 0.
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);

  return result;
}

export function endOfWeek(date: Date): Date {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/** The seven days of the week containing `date`, Monday first. */
export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date, now: Date): boolean {
  return isSameDay(date, now);
}

export function isPast(date: Date, now: Date): boolean {
  return date.getTime() < now.getTime();
}

/** ISO 8601 weekday, Monday=1 … Sunday=7 — matches the backend's rest_days. */
export function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatTime(iso: string, locale?: string): string {
  return new Date(iso)
    .toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
}

/**
 * "tue 4" — the calendar's day heading.
 *
 * Composed explicitly rather than via a two-field `toLocaleDateString`,
 * because Intl decides field order per locale: en-US renders
 * `{weekday, day}` as "4 Tue", which reads wrong in a column header. The
 * weekday name is still localised; only the order is fixed.
 */
export function formatDayLabel(date: Date, locale?: string): string {
  const weekday = date.toLocaleDateString(locale, { weekday: 'short' });
  return `${weekday} ${date.getDate()}`;
}

export function formatDateLong(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRange(startIso: string, endIso: string, locale?: string): string {
  return `${formatTime(startIso, locale)}–${formatTime(endIso, locale)}`;
}

/**
 * "in 4 hours", "tomorrow", "in 3 days" — the dashboard's sense of urgency.
 *
 * Deliberately coarse: the host needs to know roughly how much runway they
 * have, not a countdown to the minute.
 */
export function humanCountdown(iso: string, now: Date): string {
  const target = new Date(iso).getTime();
  const diff = target - now.getTime();

  if (diff < 0) return 'in progress';

  const hours = Math.floor(diff / 3_600_000);

  if (hours < 1) return 'starting soon';
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'tomorrow';

  return `in ${days} days`;
}

/**
 * The greeting's time-of-day word (PRD §2.1).
 *
 * The rotating copy library lives server-side eventually; this is the part
 * that must match the host's actual clock.
 */
export function timeOfDay(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours();

  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Query window for a calendar week, as the API expects. */
export function weekWindow(date: Date): { start: string; end: string } {
  return {
    start: startOfWeek(date).toISOString(),
    end: endOfWeek(date).toISOString(),
  };
}

/** Group sessions by the day they start on. */
export function groupByDay<T extends { starts_at: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = dayKey(new Date(item.starts_at));
    const bucket = grouped.get(key);

    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  // Within a day, earliest first — the host reads the day in order.
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  return grouped;
}

/** Local-date key. Not ISO: toISOString() shifts to UTC and can change the day. */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
