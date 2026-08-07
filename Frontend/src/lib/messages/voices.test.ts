import { describe, expect, it } from 'vitest';

import {
  SEND_SCHEDULE,
  VOICES,
  fillTemplate,
  placeholdersIn,
  renderMessage,
  voiceById,
  withinQuietHours,
  type MessageKind,
  type VoiceId,
} from './voices';

const KINDS: MessageKind[] = ['reminder_24h', 'thank_you', 'schedule_change', 'waitlist_invite'];
const VOICE_IDS: VoiceId[] = ['soft_sweet', 'chaotic_bestie', 'clean_minimal'];

describe('fillTemplate', () => {
  it('substitutes known placeholders', () => {
    expect(
      fillTemplate('hi {guest_name}, see you at {time}', { guest_name: 'Sana', time: '2 pm' }),
    ).toBe('hi Sana, see you at 2 pm');
  });

  it('leaves an unknown placeholder visible', () => {
    // A typo the host should see, not a silent gap in a guest's message.
    expect(fillTemplate('hi {nickname}', { guest_name: 'Sana' })).toBe('hi {nickname}');
  });

  it('leaves a placeholder whose value is missing', () => {
    expect(fillTemplate('table {table_number}', {})).toBe('table {table_number}');
  });

  it('treats an empty string as missing', () => {
    expect(fillTemplate('hi {guest_name}', { guest_name: '' })).toBe('hi {guest_name}');
  });

  it('accepts a numeric value', () => {
    expect(fillTemplate('table {table_number}', { table_number: 2 })).toBe('table 2');
  });

  it('lists the placeholders a template uses', () => {
    expect(
      placeholdersIn('hi {guest_name}, {class_name} at {time}. see you {guest_name}!'),
    ).toEqual(['guest_name', 'class_name', 'time']);
  });
});

describe('renderMessage', () => {
  it('renders every kind in every voice without leaking a template slot', () => {
    for (const kind of KINDS) {
      for (const voice of VOICE_IDS) {
        const message = renderMessage(kind, voice, 'full', {
          guest_name: 'Sana',
          class_name: 'bento cake',
          time: '2 pm',
          date: 'saturday',
        });

        expect(message).not.toContain('{e}');
        expect(message.length).toBeGreaterThan(10);
      }
    }
  });

  it('sounds different in each voice', () => {
    const rendered = VOICE_IDS.map((voice) =>
      renderMessage('reminder_24h', voice, 'none', { time: '2 pm', class_name: 'bento cake' }),
    );

    // The whole point of the feature: three genuinely distinct tones.
    expect(new Set(rendered).size).toBe(3);
  });

  it('matches the prototype copy for soft & sweet', () => {
    expect(renderMessage('reminder_24h', 'soft_sweet', 'none', { time: '2 pm' })).toContain(
      "We can't wait to see you tomorrow at 2 pm!",
    );
  });

  it('shouts in chaotic bestie', () => {
    expect(renderMessage('reminder_24h', 'chaotic_bestie', 'none', {})).toContain('BESTIE');
  });

  it('stays plain in clean & minimal', () => {
    const message = renderMessage('reminder_24h', 'clean_minimal', 'full', { time: '2:00 pm' });

    // This voice carries no emoji at any density.
    expect(message).toMatch(/^Reminder:/);
    expect(/\p{Extended_Pictographic}/u.test(message)).toBe(false);
  });
});

describe('emoji density', () => {
  it('strips emoji entirely at none', () => {
    const message = renderMessage('thank_you', 'soft_sweet', 'none', { guest_name: 'Sana' });
    expect(/\p{Extended_Pictographic}/u.test(message)).toBe(false);
  });

  it('adds more at full than at light', () => {
    const light = renderMessage('thank_you', 'soft_sweet', 'light', { guest_name: 'Sana' });
    const full = renderMessage('thank_you', 'soft_sweet', 'full', { guest_name: 'Sana' });

    expect(full.length).toBeGreaterThan(light.length);
  });

  it('leaves no double space when emoji are removed', () => {
    for (const kind of KINDS) {
      for (const voice of VOICE_IDS) {
        const message = renderMessage(kind, voice, 'none', { guest_name: 'Sana', time: '2 pm' });
        expect(message).not.toMatch(/ {2}/);
      }
    }
  });

  it('does not leave a trailing space', () => {
    const message = renderMessage('reminder_24h', 'soft_sweet', 'none', {});
    expect(message).toBe(message.trim());
  });
});

describe('voices', () => {
  it('offers exactly the three the PRD names', () => {
    expect(VOICES).toHaveLength(3);
  });

  it('describes each one so the host knows what they are picking', () => {
    for (const voice of VOICES) {
      expect(voice.description.length).toBeGreaterThan(5);
    }
  });

  it('falls back rather than returning undefined', () => {
    expect(voiceById('nonsense' as VoiceId)).toBe(VOICES[0]);
  });
});

describe('send schedule', () => {
  it('runs from before the class to after it', () => {
    const hours = SEND_SCHEDULE.map((step) => step.hoursFromStart);

    expect(Math.min(...hours)).toBe(-24);
    expect(Math.max(...hours)).toBe(24);
  });

  it('separates guest messages from host nudges', () => {
    const audiences = new Set(SEND_SCHEDULE.map((step) => step.audience));
    expect(audiences).toEqual(new Set(['guest', 'host']));
  });
});

describe('quiet hours', () => {
  it('allows sending inside the window', () => {
    expect(withinQuietHours(12)).toBe(true);
    expect(withinQuietHours(9)).toBe(true);
  });

  it('blocks the small hours', () => {
    expect(withinQuietHours(3)).toBe(false);
    expect(withinQuietHours(22)).toBe(false);
  });

  it('treats the closing hour as closed', () => {
    expect(withinQuietHours(21)).toBe(false);
  });

  it('supports a window that wraps midnight', () => {
    expect(withinQuietHours(23, 21, 9)).toBe(true);
    expect(withinQuietHours(12, 21, 9)).toBe(false);
  });
});
