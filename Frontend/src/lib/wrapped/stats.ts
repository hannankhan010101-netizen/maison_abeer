import type { Session } from '@/lib/api/types';

/**
 * Studio Wrapped.
 *
 * The host's own data, turned into something they'd actually post. This is not
 * decoration: the PRD tracks recap shares as a success metric (§4), and a
 * studio's best marketing asset is proof that people keep showing up.
 *
 * Everything here is derived from real sessions. Nothing is invented — a
 * fabricated stat is the fastest way to make a host distrust the whole app.
 */

export type Season = 'all time' | 'this year' | 'this season';

export interface WrappedInput {
  sessions: Session[];
  /** One-word answers from the post-class feedback loop (PRD §2.6). */
  words: string[];
  now: Date;
}

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

export interface StudioPersonality {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
}

const PERSONALITIES: Record<string, Omit<StudioPersonality, 'id'>> = {
  sunrise: {
    title: 'Sunrise baker',
    emoji: '☀️',
    blurb: 'You start before the world does. Morning classes, quiet studio, best light.',
  },
  goldenHour: {
    title: 'Golden hour host',
    emoji: '🌇',
    blurb: 'Late afternoon is your hour. Everything looks better in that light and you know it.',
  },
  moonlit: {
    title: 'After dark studio',
    emoji: '🌙',
    blurb: 'Evening classes, fairy lights, people unwinding. Your studio is where the day lands.',
  },
  weekender: {
    title: 'Weekend main character',
    emoji: '🎀',
    blurb: 'Saturdays belong to you. Weekday you rests, weekend you runs the show.',
  },
  soldOut: {
    title: 'Sold out era',
    emoji: '🔥',
    blurb: 'People book before you finish posting. That is not luck, that is a reputation.',
  },
};

/**
 * Which studio they are, from when they actually teach.
 *
 * Sell-out rate wins when it is genuinely high, because that is the fact a
 * host most wants to be told about themselves.
 */
export function personalityFor(sessions: Session[]): StudioPersonality {
  const taught = sessions.filter((session) => session.capacity.booked > 0);

  if (taught.length === 0) {
    return {
      id: 'newStudio',
      title: 'Brand new',
      emoji: '🌱',
      blurb: 'The first class is the hardest. Everything after is momentum.',
    };
  }

  const soldOut = taught.filter((s) => s.capacity.state === 'sold_out').length;
  if (soldOut / taught.length >= 0.5 && taught.length >= 3) {
    return { id: 'soldOut', ...PERSONALITIES.soldOut! };
  }

  const weekend = taught.filter((s) => {
    const day = new Date(s.starts_at).getDay();
    return day === 0 || day === 6;
  }).length;

  if (weekend / taught.length >= 0.6) {
    return { id: 'weekender', ...PERSONALITIES.weekender! };
  }

  const averageHour =
    taught.reduce((total, s) => total + new Date(s.starts_at).getHours(), 0) / taught.length;

  if (averageHour < 12) return { id: 'sunrise', ...PERSONALITIES.sunrise! };
  if (averageHour < 17) return { id: 'goldenHour', ...PERSONALITIES.goldenHour! };

  return { id: 'moonlit', ...PERSONALITIES.moonlit! };
}

// ---------------------------------------------------------------------------
// Derived facts
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WrappedStats {
  classesTaught: number;
  guestsTaught: number;
  soldOutCount: number;
  /** The craft they ran most, by class count. */
  signatureCraft: string | null;
  signatureCraftShare: number;
  busiestDay: string | null;
  /** Longest run of consecutive weeks with at least one class. */
  longestStreakWeeks: number;
  hoursTaught: number;
  personality: StudioPersonality;
  topWords: { word: string; count: number }[];
}

/** ISO week key, so a streak survives a year boundary. */
function weekKey(date: Date): string {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  // Thursday of this week decides the ISO year.
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));

  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));

  return `${target.getFullYear()}-${String(week).padStart(2, '0')}`;
}

export function longestWeeklyStreak(sessions: Session[]): number {
  if (sessions.length === 0) return 0;

  const weeks = [...new Set(sessions.map((s) => weekKey(new Date(s.starts_at))))].sort();

  let longest = 1;
  let current = 1;

  for (let index = 1; index < weeks.length; index++) {
    const previous = weeks[index - 1]!;
    const week = weeks[index]!;

    // Consecutive if the week number advances by one, or the year rolls over.
    const [prevYear, prevWeek] = previous.split('-').map(Number) as [number, number];
    const [year, number] = week.split('-').map(Number) as [number, number];

    const isNext =
      (year === prevYear && number === prevWeek + 1) || (year === prevYear + 1 && number === 1);

    current = isNext ? current + 1 : 1;
    longest = Math.max(longest, current);
  }

  return longest;
}

/** Words people used, most common first, with filler removed. */
export function tallyWords(words: string[], limit = 12): { word: string; count: number }[] {
  const ignored = new Set(['the', 'a', 'and', 'it', 'was', 'very', 'so', 'really', 'good']);
  const counts = new Map<string, number>();

  for (const raw of words) {
    const word = raw.trim().toLowerCase();
    if (!word || ignored.has(word)) continue;

    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export function deriveWrapped({ sessions, words, now }: WrappedInput): WrappedStats {
  // Only classes that have actually happened. Counting future bookings as
  // "taught" would be a lie the host could be caught in.
  const taught = sessions.filter((session) => new Date(session.ends_at) <= now);

  const craftCounts = new Map<string, number>();
  const dayCounts = new Map<number, number>();
  let hours = 0;

  for (const session of taught) {
    craftCounts.set(session.class_type_name, (craftCounts.get(session.class_type_name) ?? 0) + 1);

    const day = new Date(session.starts_at).getDay();
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);

    hours +=
      (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 3_600_000;
  }

  const topCraft = [...craftCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    classesTaught: taught.length,
    guestsTaught: taught.reduce((total, s) => total + s.capacity.booked, 0),
    soldOutCount: taught.filter((s) => s.capacity.state === 'sold_out').length,
    signatureCraft: topCraft?.[0] ?? null,
    signatureCraftShare: topCraft && taught.length ? topCraft[1] / taught.length : 0,
    busiestDay: topDay ? DAY_NAMES[topDay[0]]! : null,
    longestStreakWeeks: longestWeeklyStreak(taught),
    hoursTaught: Math.round(hours),
    personality: personalityFor(taught),
    topWords: tallyWords(words),
  };
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

export interface WrappedSlide {
  id: string;
  eyebrow: string;
  headline: string;
  detail: string;
  emoji: string;
  /** Gradient stops, so each slide feels like its own moment. */
  gradient: string;
}

/**
 * The story, as a deck.
 *
 * Copy is plain text, never markup: `signatureCraft` is the class type name,
 * which the host types, and rendering that as HTML would be an injection
 * vector on a screen designed to be shared.
 *
 * Slides are dropped when their number would be zero — a slide that says
 * "0 sellouts" is a worse experience than one fewer slide.
 */
export function buildSlides(stats: WrappedStats, season: Season): WrappedSlide[] {
  const slides: WrappedSlide[] = [];

  slides.push({
    id: 'intro',
    eyebrow: season,
    headline: 'Let’s look back',
    detail: 'A whole season of people making things in your studio.',
    emoji: '✨',
    gradient: 'from-pink via-butter to-sage',
  });

  if (stats.classesTaught > 0) {
    slides.push({
      id: 'classes',
      eyebrow: 'You showed up',
      headline: `${stats.classesTaught} classes`,
      detail: `that’s ${stats.hoursTaught} hours of your hands covered in something.`,
      emoji: '🎀',
      gradient: 'from-blush via-pink to-rose',
    });
  }

  if (stats.guestsTaught > 0) {
    slides.push({
      id: 'guests',
      eyebrow: 'You taught',
      headline: `${stats.guestsTaught} people`,
      detail: 'Every one of them left with something they made themselves.',
      emoji: '💗',
      gradient: 'from-butter via-pink to-blush',
    });
  }

  if (stats.signatureCraft) {
    slides.push({
      id: 'craft',
      eyebrow: 'Your signature',
      headline: stats.signatureCraft,
      detail: `${Math.round(stats.signatureCraftShare * 100)}% of everything you ran. that’s a whole identity.`,
      emoji: '🏺',
      gradient: 'from-terra-soft via-butter to-sage-soft',
    });
  }

  if (stats.busiestDay) {
    slides.push({
      id: 'day',
      eyebrow: 'Your day',
      headline: stats.busiestDay,
      detail: 'The one the studio is loudest. Everyone has one.',
      emoji: '📅',
      gradient: 'from-sage-soft via-butter to-blush',
    });
  }

  if (stats.soldOutCount > 0) {
    slides.push({
      id: 'soldout',
      eyebrow: 'No seats left',
      headline: `${stats.soldOutCount} sold out`,
      detail: 'People booked before you were ready. That never gets old.',
      emoji: '🔥',
      gradient: 'from-rose via-terra to-butter',
    });
  }

  if (stats.longestStreakWeeks >= 2) {
    slides.push({
      id: 'streak',
      eyebrow: 'Consistency',
      headline: `${stats.longestStreakWeeks} weeks straight`,
      detail: 'Showing up on the quiet weeks is the whole thing.',
      emoji: '📈',
      gradient: 'from-sage via-butter to-pink',
    });
  }

  if (stats.topWords.length > 0) {
    slides.push({
      id: 'word',
      eyebrow: 'They described it as',
      headline: stats.topWords[0]!.word,
      detail: `said ${stats.topWords[0]!.count} times. their word, not yours.`,
      emoji: '🗣️',
      gradient: 'from-blush via-sage-soft to-butter',
    });
  }

  slides.push({
    id: 'personality',
    eyebrow: 'This season you were',
    headline: stats.personality.title,
    detail: stats.personality.blurb,
    emoji: stats.personality.emoji,
    gradient: 'from-pink via-rose to-terra',
  });

  return slides;
}
