/**
 * Message voices (PRD §2.6).
 *
 * Every template exists in three tones the host picks between. This is the
 * "does the app feel like part of your brand?" question made concrete — the
 * same reminder has to sound like three different people wrote it.
 *
 * Templates are hand-written, not generated: v1 explicitly excludes
 * AI-generated copy (PRD §5).
 */

export type VoiceId = 'soft_sweet' | 'chaotic_bestie' | 'clean_minimal';
export type EmojiDensity = 'none' | 'light' | 'full';
export type MessageKind = 'reminder_24h' | 'thank_you' | 'schedule_change' | 'waitlist_invite';

export interface Voice {
  id: VoiceId;
  label: string;
  icon: string;
  /** Shown in the picker so the host knows what they are choosing. */
  description: string;
}

export const VOICES: readonly Voice[] = [
  {
    id: 'soft_sweet',
    label: 'soft & sweet',
    icon: '🌷',
    description: 'warm, gentle, lots of heart',
  },
  {
    id: 'chaotic_bestie',
    label: 'chaotic bestie',
    icon: '🔥',
    description: 'caps lock and affection',
  },
  {
    id: 'clean_minimal',
    label: 'clean & minimal',
    icon: '🤍',
    description: 'just the facts, kindly',
  },
] as const;

/**
 * Placeholders a host can insert. Anything not in this list is left alone
 * rather than replaced with "undefined" — an unknown token is a typo, and
 * showing it is more honest than silently blanking it.
 */
export interface TemplateVars {
  guest_name?: string;
  class_name?: string;
  time?: string;
  date?: string;
  address?: string;
  table_number?: string | number;
  studio_name?: string;
}

interface Template {
  /** Emoji are separated so density can strip them without mangling words. */
  body: string;
  emoji: Partial<Record<EmojiDensity, string>>;
}

const TEMPLATES: Record<MessageKind, Record<VoiceId, Template>> = {
  reminder_24h: {
    soft_sweet: {
      body: "we can't wait to see you tomorrow at {time}!{e} wear something comfy — aprons are on us. parking is right out front, lovely.",
      emoji: { light: ' 🎀', full: ' 🎀💗' },
    },
    chaotic_bestie: {
      body: 'BESTIE. tomorrow. {time}. {class_name}. be there.{e} (wear clothes you can get frosting on, this is a warning)',
      emoji: { light: ' 🧁', full: ' 🧁🔥💅' },
    },
    clean_minimal: {
      body: 'Reminder: {class_name}, tomorrow {time}. Aprons provided. Parking at the front. Address below.',
      emoji: {},
    },
  },
  thank_you: {
    soft_sweet: {
      body: 'thank you for making with us, {guest_name}{e} tap an emoji + one word to tell us how it felt?',
      emoji: { light: ' 💗', full: ' 💗✨' },
    },
    chaotic_bestie: {
      body: '{guest_name}!! you ATE that (literally){e} one emoji + one word — how was it??',
      emoji: { light: ' 💅', full: ' 💅🔥' },
    },
    clean_minimal: {
      body: "Thanks for joining, {guest_name}. One tap + one word — how was today's class?",
      emoji: {},
    },
  },
  schedule_change: {
    soft_sweet: {
      body: 'heads up lovely — {class_name} has moved to {date} at {time}.{e} same spot, same fun. reply if that no longer works!',
      emoji: { light: ' 💗', full: ' 💗🌷' },
    },
    chaotic_bestie: {
      body: 'PLOT TWIST. {class_name} is now {date} at {time}.{e} same vibes, new day. shout if you can’t make it!',
      emoji: { light: ' 🌀', full: ' 🌀🔥' },
    },
    clean_minimal: {
      body: '{class_name} has moved to {date} at {time}. Location unchanged. Reply if you can no longer attend.',
      emoji: {},
    },
  },
  waitlist_invite: {
    soft_sweet: {
      body: 'a seat just opened up for {class_name} on {date}!{e} it’s yours if you’d like it — just reply and it’s saved.',
      emoji: { light: ' 🎀', full: ' 🎀💗' },
    },
    chaotic_bestie: {
      body: 'SEAT. OPENED. {class_name}, {date}.{e} say the word and it’s yours before someone else grabs it',
      emoji: { light: ' 👀', full: ' 👀🔥' },
    },
    clean_minimal: {
      body: 'A seat is available for {class_name} on {date}. Reply to confirm and it will be held for you.',
      emoji: {},
    },
  },
};

export const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * Substitute variables, leaving unknown placeholders visible.
 *
 * A template referencing `{nickname}` is a mistake the host should see, not
 * something to quietly render as an empty gap in a message to a guest.
 */
export function fillTemplate(body: string, vars: TemplateVars): string {
  return body.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const value = vars[key as keyof TemplateVars];
    return value === undefined || value === '' ? match : String(value);
  });
}

/** Render one message in a given voice and emoji density. */
export function renderMessage(
  kind: MessageKind,
  voice: VoiceId,
  density: EmojiDensity,
  vars: TemplateVars = {},
): string {
  const template = TEMPLATES[kind][voice];
  const emoji = density === 'none' ? '' : (template.emoji[density] ?? '');

  // `{e}` is the emoji slot; removing it must not leave a double space.
  const withEmoji = template.body.replace('{e}', emoji);

  return fillTemplate(withEmoji, vars).replace(/ {2,}/g, ' ').trim();
}

/** Placeholders a template still expects, for the editor's insert menu. */
export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]!))];
}

export function voiceById(id: VoiceId): Voice {
  return VOICES.find((voice) => voice.id === id) ?? VOICES[0]!;
}

// ---------------------------------------------------------------------------
// Send schedule
// ---------------------------------------------------------------------------

export interface ScheduledStep {
  id: string;
  label: string;
  detail: string;
  /** Negative is before the class, positive after. */
  hoursFromStart: number;
  audience: 'guest' | 'host';
}

/** The default timeline (PRD §2.6), shown on the messages screen. */
export const SEND_SCHEDULE: readonly ScheduledStep[] = [
  {
    id: 'reminder',
    label: 'T-24h · guest reminder',
    detail: 'details, parking, what to wear, dietary check',
    hoursFromStart: -24,
    audience: 'guest',
  },
  {
    id: 'host-nudge',
    label: 'T-3h · host nudge',
    detail: 'tags printed? aprons out? you’ve got this',
    hoursFromStart: -3,
    audience: 'host',
  },
  {
    id: 'thank-you',
    label: 'T+24h · thank you + feedback',
    detail: 'emoji + one word · photo tag invite',
    hoursFromStart: 24,
    audience: 'guest',
  },
] as const;

/**
 * Whether a moment falls inside the studio's sending window.
 *
 * Mirrors the backend rule so the UI can warn before a host schedules
 * something that will silently queue until morning.
 */
export function withinQuietHours(hour: number, startHour = 9, endHour = 21): boolean {
  if (startHour <= endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}
