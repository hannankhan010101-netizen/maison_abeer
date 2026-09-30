'use client';

import { useState } from 'react';

import { ReminderQueue } from '@/components/domain/ReminderQueue';

import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useSettings } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  SEND_SCHEDULE,
  VOICES,
  renderMessage,
  type EmojiDensity,
  type VoiceId,
} from '@/lib/messages/voices';
import type { VoicePreset } from '@/lib/api/types';

/**
 * Messages (PRD §2.6).
 *
 * Picking a voice rewrites every template live. That immediacy is the point —
 * the host is choosing how their studio sounds, and they should hear it
 * change rather than read a description of it.
 */

const DENSITIES: { id: EmojiDensity; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'light', label: 'Light' },
  { id: 'full', label: 'Full ✨' },
];

const PREVIEW_VARS = {
  guest_name: 'Sana',
  class_name: 'Bento cake',
  time: '2 pm',
  date: 'Saturday',
};

export function MessagesStudio() {
  const settings = useSettings();

  /**
   * Null until the host picks one on this screen.
   *
   * Derived at render rather than seeded from the query, so a settings
   * response that lands after the first paint cannot overwrite a pick the
   * host has already made — and so an unpicked voice stays null all the way
   * to the API, where it means "use my saved default".
   */
  const [voice, setVoice] = useState<VoicePreset | null>(null);
  const [density, setDensity] = useState<EmojiDensity | null>(null);
  const [rating, setRating] = useState<number | null>(null);

  const effectiveVoice: VoiceId = voice ?? settings.data?.default_voice ?? 'soft_sweet';
  const effectiveDensity: EmojiDensity = density ?? settings.data?.emoji_density ?? 'full';

  return (
    <section>
      <h1 className="font-display text-[clamp(21px,4vw,34px)]">Messages</h1>
      <p className="text-latte mb-4">
        <HandNote>Every reminder re-writes itself to match ✍️</HandNote>
      </p>

      <Eyebrow>Voice</Eyebrow>
      <div role="radiogroup" aria-label="Message voice" className="mb-5 flex flex-wrap gap-2">
        {VOICES.map((option) => {
          const active = option.id === effectiveVoice;

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setVoice(option.id)}
              className={cn(
                'min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-4 text-[13px] font-extrabold',
                active ? 'border-rose bg-rose text-on-rose' : 'border-line bg-paper text-latte',
              )}
            >
              <span aria-hidden="true">{option.icon}</span> {option.label}
            </button>
          );
        })}
      </div>

      <p className="text-latte mb-4 text-sm">
        {VOICES.find((option) => option.id === effectiveVoice)?.description}
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <Eyebrow>Preview</Eyebrow>

          {/* aria-live: switching voice replaces this text, and a screen
              reader user should hear that it changed. */}
          <div
            className="border-line bg-paper max-w-[380px] rounded-3xl border-[1.5px] p-4"
            aria-live="polite"
          >
            <Bubble
              kind="T-24h · reminder"
              text={renderMessage('reminder_24h', effectiveVoice, effectiveDensity, PREVIEW_VARS)}
            />
            <Bubble
              kind="T+24h · thank you"
              text={renderMessage('thank_you', effectiveVoice, effectiveDensity, PREVIEW_VARS)}
            />

            <Eyebrow className="mt-4">How was it?</Eyebrow>
            <div className="flex gap-2.5">
              {['😍', '🙂', '😕'].map((emoji, index) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={['Loved it', 'It was fine', 'Not great'][index]}
                  aria-pressed={rating === index}
                  onClick={() => setRating(index)}
                  className={cn(
                    'min-h-[44px] w-14 rounded-2xl border-[1.5px] text-2xl',
                    rating === index ? 'border-rose bg-blush' : 'border-line bg-paper',
                  )}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
            <HandNote className="mt-2 block">
              One tap + one word. that&rsquo;s the whole survey.
            </HandNote>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <Eyebrow>Send schedule</Eyebrow>
            <ol className="border-pink relative border-l-2 border-dashed pl-5">
              {SEND_SCHEDULE.map((step) => (
                <li key={step.id} className="mb-4 last:mb-0">
                  <b className="block text-sm">{step.label}</b>
                  <small className="text-latte">{step.detail}</small>
                  {step.audience === 'host' ? (
                    <Chip tone="neutral" className="mt-1">
                      Just for you
                    </Chip>
                  ) : null}
                </li>
              ))}
            </ol>

            <p className="text-latte mt-3 flex items-center gap-2 text-[13.5px]">
              <Chip tone="sage">💤 quiet hours on</Chip> Sends 9 am – 9 pm only
            </p>
          </Card>

          <ReminderQueue voice={voice ?? undefined} />

          <Card>
            <Eyebrow>Emoji density</Eyebrow>
            <div role="radiogroup" aria-label="Emoji density" className="flex flex-wrap gap-2">
              {DENSITIES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={effectiveDensity === option.id}
                  onClick={() => setDensity(option.id)}
                  className={cn(
                    'min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-4 text-xs font-extrabold',
                    effectiveDensity === option.id
                      ? 'border-pink bg-pink text-on-pink'
                      : 'border-line bg-paper text-latte',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Preview-only: `render` on the server takes a voice but no
                density (app/domain/messages.py), so this picker changes what
                the host sees here and not yet what a guest receives. */}
            <p className="text-latte mt-3 text-[13.5px]">
              Changes the preview above. Queue reminders below to see the real copy.
            </p>

            <CardTitle className="mt-4">Before it goes out</CardTitle>
            <p className="text-latte mt-1 text-[13.5px]">
              Nothing sends unseen — Preview under “Queue reminders” shows the exact copy, send time
              and who will be skipped.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Bubble({ kind, text }: { kind: string; text: string }) {
  return (
    <div className="bg-blush mb-2.5 rounded-[18px] rounded-bl-[5px] px-4 py-3">
      <div className="text-rose-ink mb-1 text-[11px] font-extrabold tracking-[0.06em] uppercase">
        {kind}
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
