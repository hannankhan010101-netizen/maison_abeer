'use client';

import { useMemo } from 'react';

import { ManifestBoard } from '@/components/domain/ManifestBoard';
import { StudioWrapped } from '@/components/domain/StudioWrapped';
import { VibeCloud } from '@/components/domain/VibeCloud';
import { Button } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/errors';
import { useSessions, useStudioFeedback } from '@/lib/api/hooks';
import { addWeeks } from '@/lib/dates';
import { useResolvedNow } from '@/lib/useNow';
import { deriveWrapped } from '@/lib/wrapped/stats';

/**
 * The "receipts" screen.
 *
 * Studio Wrapped, what guests actually said, and what the host is working
 * toward — the three things that turn admin data into something worth
 * looking at on a quiet afternoon.
 */

export function WrappedPage({ now: nowProp }: { now?: Date }) {
  const now = useResolvedNow(nowProp);

  if (!now) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <div
          aria-hidden="true"
          className="border-line h-96 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
        />
      </div>
    );
  }

  return <WrappedPageInner now={now} />;
}

function WrappedPageInner({ now }: { now: Date }) {
  // A season back, so the story has something to look back on.
  const range = useMemo(
    () => ({ start: addWeeks(now, -26).toISOString(), end: addWeeks(now, 4).toISOString() }),
    [now],
  );

  const sessions = useSessions(range.start, range.end);
  const list = useMemo(() => sessions.data ?? [], [sessions.data]);

  const feedback = useStudioFeedback(range.start, range.end);

  /**
   * What guests actually wrote.
   *
   * This used to be sixteen invented words rendered as testimonials — a
   * brand-new studio saw a rich cloud of praise nobody had given it, and a
   * studio with fifty real answers never saw one of them.
   */
  const words = useMemo(
    () =>
      (feedback.data ?? [])
        .map((answer) => answer.one_word)
        .filter((word): word is string => Boolean(word && word.trim())),
    [feedback.data],
  );

  const stats = useMemo(() => deriveWrapped({ sessions: list, words, now }), [list, words, now]);

  return (
    <section>
      <h1 className="font-display text-[clamp(21px,4vw,34px)]">Your receipts</h1>
      <p className="text-latte mb-5">
        <HandNote>Proof that people keep showing up 💗</HandNote>
      </p>

      {sessions.isError ? (
        <Card>
          <div role="alert">
            <p className="font-bold">
              {sessions.error instanceof ApiError
                ? sessions.error.displayMessage
                : "We couldn't load your season."}
            </p>
            <Button variant="ghost" className="mt-3" onClick={() => void sessions.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : null}

      {sessions.isSuccess && !feedback.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div>
            <Eyebrow>Studio wrapped</Eyebrow>
            <StudioWrapped sessions={list} words={words} now={now} />
          </div>

          <div className="grid content-start gap-6">
            <VibeCloud words={words} />

            <ManifestBoard
              totals={{
                guests: stats.guestsTaught,
                classes: stats.classesTaught,
                sellouts: stats.soldOutCount,
              }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
