'use client';

import { useState } from 'react';

import { ReminderQueue } from '@/components/domain/ReminderQueue';

import { Button } from '@/components/ui/Button';
import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/cn';
import {
  SEND_SCHEDULE,
  VOICES,
  renderMessage,
  type EmojiDensity,
  type VoiceId,
} from '@/lib/messages/voices';

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
  const [voice, setVoice] = useState<VoiceId>('soft_sweet');
  const [density, setDensity] = useState<EmojiDensity>('full');
  const [rating, setRating] = useState<number | null>(null);

  return (
    <section>
      <h1 className="font-display text-[clamp(26px,4vw,34px)]">Messages</h1>
      <p className="text-latte mb-4">
        <HandNote>Every reminder re-writes itself to match ✍️</HandNote>
      </p>

      <Eyebrow>Voice</Eyebrow>
      <div role="radiogroup" aria-label="Message voice" className="mb-5 flex flex-wrap gap-2">
        {VOICES.map((option) => {
          const active = option.id === voice;

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
        {VOICES.find((option) => option.id === voice)?.description}
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
              text={renderMessage('reminder_24h', voice, density, PREVIEW_VARS)}
            />
            <Bubble
              kind="T+24h · thank you"
              text={renderMessage('thank_you', voice, density, PREVIEW_VARS)}
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

          <ReminderQueue voice={voice} />

          <Card>
            <Eyebrow>Emoji density</Eyebrow>
            <div role="radiogroup" aria-label="Emoji density" className="flex flex-wrap gap-2">
              {DENSITIES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={density === option.id}
                  onClick={() => setDensity(option.id)}
                  className={cn(
                    'min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-4 text-xs font-extrabold',
                    density === option.id
                      ? 'border-pink bg-pink text-on-pink'
                      : 'border-line bg-paper text-latte',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <CardTitle className="mt-4">Before it goes out</CardTitle>
            <p className="text-latte mt-1 text-[13.5px]">
              Nothing sends unseen — send yourself a test first.
            </p>
            <Button variant="secondary" className="mt-3">
              Send a test to me
            </Button>
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
