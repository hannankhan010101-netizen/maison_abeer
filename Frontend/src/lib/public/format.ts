/**
 * Copy the booking page derives from a class's own dates.
 *
 * Pure and locale-aware, so the components stay about layout and these
 * sentences can be asserted exactly. Every value here comes from the real
 * payload — a date leaf is the class's date, a duration is its own
 * `ends_at - starts_at` — never a number invented to persuade.
 */

export interface DateLeafParts {
  /** "23" */
  day: string;
  /** "Fri" */
  weekday: string;
  /** "Oct" */
  month: string;
}

/** The three pieces a calendar-leaf tile shows: day large, weekday and month small. */
export function dateLeaf(iso: string, locale?: string): DateLeafParts {
  const date = new Date(iso);

  return {
    day: String(date.getDate()),
    weekday: date.toLocaleDateString(locale, { weekday: 'short' }),
    month: date.toLocaleDateString(locale, { month: 'short' }),
  };
}

/**
 * "2 hrs 30 min" — how long the class actually runs.
 *
 * Null when the payload cannot say (a missing or inverted end), so the card
 * drops the line rather than printing "0 min".
 */
export function durationCopy(startsAt: string, endsAt: string): string | null {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);

  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hr' : 'hrs'}`);
  if (rest > 0) parts.push(`${rest} min`);

  return parts.join(' ');
}

/**
 * "7:54 pm" — a clock time the way a guest says it: no leading zero, a
 * lowercase am/pm after one space, and 12 (never 0) at midnight and noon.
 */
export function timeCopy(iso: string, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`;
}

/**
 * "2½ h" — the short length for a one-line class row: "45 min", "1 h",
 * "1½ h", "2 h 10 min". Null when the payload cannot say, as `durationCopy`.
 */
export function durationShort(startsAt: string, endsAt: string): string | null {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);

  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  if (rest === 30) return `${hours}½ h`;
  return `${hours} h ${rest} min`;
}

/** "Fri 23 Oct · 7:54 pm · 2½ h" — one class, read at a glance. */
export function whenLine(item: { starts_at: string; ends_at: string }, locale?: string): string {
  const day = new Date(item.starts_at).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return [day, timeCopy(item.starts_at, locale), durationShort(item.starts_at, item.ends_at)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The soonest class on offer — what the hero's ticket chip points at.
 *
 * A full class still counts: the waitlist is a real way in, and "next class
 * is Friday" stays true whether or not there is a seat left in it.
 */
export function nextClass<T extends { starts_at: string }>(classes: readonly T[]): T | null {
  let soonest: T | null = null;

  for (const item of classes) {
    if (!soonest || new Date(item.starts_at).getTime() < new Date(soonest.starts_at).getTime()) {
      soonest = item;
    }
  }

  return soonest;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * When a class is, the way a friend would say it: "today", "tomorrow",
 * "this Friday", and only past that the date itself ("Fri 31 Oct").
 *
 * Calendar days, not 24-hour windows — a class at 9am tomorrow is
 * "tomorrow" at 11pm tonight, which a `now + 24h` check would miss.
 */
export function whenCopy(iso: string, now: Date, locale?: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 7) return `this ${date.toLocaleDateString(locale, { weekday: 'long' })}`;

  return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}
