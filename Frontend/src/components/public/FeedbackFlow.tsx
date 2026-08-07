'use client';

import { useEffect, useId, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * The whole survey: one tap and one word (PRD §2.6).
 *
 * A guest reaches this from the thank-you message, a day after a class they
 * enjoyed. Anything longer than one screen goes unanswered, so there is no
 * scale, no comment box, and no "how likely are you to recommend".
 *
 * The word is optional and asked for after the tap, not before — a text field
 * shown up front reads as work and suppresses the tap that was already free.
 */

const RATINGS = [
  { value: 3, emoji: '😍', label: 'Loved it' },
  { value: 2, emoji: '🙂', label: 'It was lovely' },
  { value: 1, emoji: '😕', label: 'Not for me' },
] as const;

interface Prompt {
  class_name: string;
  starts_at: string;
  already_answered: boolean;
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
}

export interface FeedbackFlowProps {
  bookingId: string;
}

export function FeedbackFlow({ bookingId }: FeedbackFlowProps) {
  const ids = useId();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [word, setWord] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${baseUrl()}/api/v1/public/feedback/${bookingId}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('not found');
        setPrompt((await response.json()) as Prompt);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError('That link has expired or is no longer valid.');
        }
      });

    return () => controller.abort();
  }, [bookingId]);

  async function submit(value: number, oneWord: string) {
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`${baseUrl()}/api/v1/public/feedback/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: value, one_word: oneWord.trim() || null }),
        cache: 'no-store',
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'We could not save that.');
      }

      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'We could not save that.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <p role="alert" className="text-danger text-center font-bold">
          {loadError}
        </p>
      </Shell>
    );
  }

  if (!prompt) {
    return (
      <Shell>
        <div role="status" aria-live="polite" className="text-latte text-center">
          <span className="sr-only">Loading</span>
          <span aria-hidden="true">…</span>
        </div>
      </Shell>
    );
  }

  if (saved) {
    return (
      <Shell>
        <div className="text-center" aria-live="polite">
          <p className="text-5xl" aria-hidden="true">
            🎀
          </p>
          <h1 className="font-display mt-2 text-[clamp(24px,6vw,30px)]">Thank you</h1>
          <p className="font-hand text-latte mt-2 text-lg">
            That genuinely helps. See you at the next one ♡
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center">
        <h1 className="font-display text-[clamp(24px,6vw,30px)]">How was {prompt.class_name}?</h1>
        <p className="text-latte mt-1 text-sm">One tap. That&rsquo;s the whole survey.</p>
      </div>

      {/* An already-answered link still works — this is a correction, not an
          error, so it is said gently rather than blocking the form. */}
      {prompt.already_answered ? (
        <p className="text-latte mt-3 text-center text-sm">
          You&rsquo;ve answered this already — tap again to change it.
        </p>
      ) : null}

      <div
        role="radiogroup"
        aria-label="How was the class?"
        className="mt-5 flex justify-center gap-3"
      >
        {RATINGS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={rating === option.value}
            aria-label={option.label}
            disabled={saving}
            onClick={() => {
              setRating(option.value);
              // Submitted on tap. Requiring a second "send" press loses the
              // answers of everyone who thought they were done.
              void submit(option.value, word);
            }}
            className={cn(
              'min-h-[64px] w-20 rounded-2xl border-[1.5px] text-3xl transition-transform',
              'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
              'motion-reduce:transform-none',
              rating === option.value ? 'border-rose bg-blush' : 'border-line bg-paper',
            )}
          >
            <span aria-hidden="true">{option.emoji}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        <label htmlFor={`${ids}-word`} className="mb-1 block text-center text-sm font-extrabold">
          One word for it?
          <span className="text-latte font-normal"> · optional</span>
        </label>
        <input
          id={`${ids}-word`}
          value={word}
          maxLength={60}
          onChange={(event) => setWord(event.target.value)}
          onBlur={() => {
            // Only after a rating exists, so a stray word never posts alone.
            if (rating !== null && word.trim()) void submit(rating, word);
          }}
          className="border-line bg-paper text-cocoa min-h-[48px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3 text-center"
          placeholder="calm, messy, therapeutic…"
        />
      </div>

      <p role="alert" className="text-danger mt-3 text-center text-sm font-bold empty:hidden">
        {saveError}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-[420px] px-4 py-10 sm:py-16">
      {children}
    </main>
  );
}
