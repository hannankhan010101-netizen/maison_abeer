'use client';

import { useMemo, useState } from 'react';

import { SessionPicker } from '@/components/domain/SessionPicker';
import { AlertCard } from '@/components/ui/AlertCard';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FrostingCheckbox } from '@/components/ui/FrostingCheckbox';
import { Icing } from '@/components/ui/Icing';
import { ApiError } from '@/lib/api/errors';
import { useChecklist, useSessions, useToggleChecklistItem } from '@/lib/api/hooks';
import { addWeeks, formatTime } from '@/lib/dates';
import type { ChecklistItem } from '@/lib/api/types';

/**
 * Prep (PRD §2.5).
 *
 * "The system that guarantees nothing is forgotten." Steps are grouped by
 * their T-minus moment because that is how a host actually works — everything
 * due 24 hours out, then everything due an hour out — not as one flat list.
 */

export interface PrepListProps {
  now?: Date;
}

/** Group by T-minus label, ordered by how soon each group is due. */
export function groupByDeadline(items: ChecklistItem[]): [string, ChecklistItem[]][] {
  const groups = new Map<string, ChecklistItem[]>();

  for (const item of items) {
    const bucket = groups.get(item.t_minus_label);
    if (bucket) bucket.push(item);
    else groups.set(item.t_minus_label, [item]);
  }

  return [...groups.entries()].sort(
    ([, a], [, b]) => (b[0]?.hours_before ?? 0) - (a[0]?.hours_before ?? 0),
  );
}

export function PrepList({ now = new Date() }: PrepListProps) {
  const window = useMemo(
    () => ({ start: now.toISOString(), end: addWeeks(now, 4).toISOString() }),
    [now],
  );

  const sessions = useSessions(window.start, window.end);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const selected = useMemo(
    () => sessions.data?.find((session) => session.id === sessionId) ?? sessions.data?.[0],
    [sessions.data, sessionId],
  );

  const checklist = useChecklist(selected?.id ?? '', Boolean(selected));
  const toggle = useToggleChecklistItem(selected?.id ?? '');

  const items = checklist.data?.items ?? [];
  const prep = items.filter((item) => item.phase === 'prep');
  const reset = items.filter((item) => item.phase === 'post_class');

  const done = checklist.data?.completed_count ?? 0;
  const total = checklist.data?.total_count ?? 0;
  const remaining = total - done;

  return (
    <section>
      <h1 className="font-display text-[clamp(26px,4vw,34px)]">prep</h1>
      <p className="text-latte mb-4">
        <HandNote>quantities auto-scale with seats</HandNote>
      </p>

      <SessionPicker
        sessions={sessions.data ?? []}
        value={selected?.id ?? null}
        onChange={setSessionId}
      />

      {sessions.isSuccess && (sessions.data?.length ?? 0) === 0 ? (
        <Card>
          <p className="font-display py-4 text-center text-lg">nothing to prep yet</p>
          <p className="text-latte text-center text-sm">
            schedule a class and its checklist appears here
          </p>
        </Card>
      ) : null}

      {checklist.isError ? (
        <Card>
          <div role="alert">
            <p className="font-bold">
              {checklist.error instanceof ApiError
                ? checklist.error.displayMessage
                : "We couldn't load your prep just now."}
            </p>
            <Button variant="ghost" className="mt-3" onClick={() => void checklist.refetch()}>
              try again
            </Button>
          </div>
        </Card>
      ) : null}

      {checklist.isPending && selected ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your prep…</span>
          <div
            aria-hidden="true"
            className="border-line h-48 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
          />
        </div>
      ) : null}

      {checklist.isSuccess ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardTitle>
              {total === 0
                ? 'no steps yet'
                : remaining === 0
                  ? 'all set — nice work 🎀'
                  : `${remaining} of ${total} to go — you're so close`}
            </CardTitle>

            <Icing value={done} max={total} label="Prep progress" className="mt-3 mb-1" />

            {checklist.data.overdue_count > 0 ? (
              <p className="text-danger mt-3 text-sm font-extrabold">
                {checklist.data.overdue_count} step
                {checklist.data.overdue_count === 1 ? '' : 's'} past due
              </p>
            ) : null}

            {groupByDeadline(prep).map(([label, group]) => (
              <div key={label}>
                <Eyebrow className="mt-4">{label}</Eyebrow>
                {group.map((item) => (
                  <PrepItem
                    key={item.id}
                    item={item}
                    onToggle={(completed) => toggle.mutate({ itemId: item.id, completed })}
                  />
                ))}
              </div>
            ))}
          </Card>

          <div className="grid content-start gap-4">
            {reset.length > 0 ? (
              <Card>
                <Eyebrow>after class · reset</Eyebrow>
                {/* Operational memory covers the full cycle: prepare, host, reset. */}
                {reset.map((item) => (
                  <PrepItem
                    key={item.id}
                    item={item}
                    onToggle={(completed) => toggle.mutate({ itemId: item.id, completed })}
                  />
                ))}
              </Card>
            ) : null}

            <Card>
              <CardTitle>how streaks work</CardTitle>
              <p className="text-latte mt-1 text-[13.5px]">
                finish everything before class starts and your streak grows. miss one? it resets
                quietly — <b className="text-cocoa">no shame copy, ever.</b> 🫶
              </p>
            </Card>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PrepItem({
  item,
  onToggle,
}: {
  item: ChecklistItem;
  onToggle: (completed: boolean) => void;
}) {
  const overdue = item.status === 'overdue';

  return (
    <div>
      <FrostingCheckbox
        id={`prep-${item.id}`}
        checked={item.completed_at !== null}
        onChange={(event) => onToggle(event.target.checked)}
        overdue={overdue}
        label={
          <>
            {item.text}
            {item.quantity !== null ? (
              <span className="bg-butter-soft text-butter-ink ml-1.5 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-extrabold">
                {item.quantity}
              </span>
            ) : null}
            {item.is_one_off ? (
              <Chip tone="neutral" className="ml-1.5">
                just this date
              </Chip>
            ) : null}
          </>
        }
        meta={
          overdue
            ? `due ${formatTime(item.deadline_at)} — don't forget!`
            : `due ${formatTime(item.deadline_at)}`
        }
      />

      {/* PRD §2.5: prep and capacity can never silently drift apart. */}
      {item.needs_attention ? (
        <AlertCard
          className="mt-1 mb-2"
          tone="warning"
          icon="👀"
          title="seats changed after you ticked this"
          description="the quantity moved — worth a second look before class"
        />
      ) : null}
    </div>
  );
}
