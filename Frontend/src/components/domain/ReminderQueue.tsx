'use client';

import { useMemo, useState } from 'react';

import { SessionPicker } from '@/components/domain/SessionPicker';
import { Button } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import {
  usePreviewMessages,
  useScheduleMessages,
  useSessionMessages,
  useSessions,
} from '@/lib/api/hooks';
import { addWeeks, formatDateLong } from '@/lib/dates';
import type { VoicePreset } from '@/lib/api/types';

/**
 * Queue the automatic reminders for one class (PRD §2.6).
 *
 * Preview before queueing is the whole interaction: the host sees the copy,
 * the send time, and — most importantly — who will *not* be messaged and why.
 * The PRD is explicit that a message must never fail silently, and "nobody
 * was contactable" is exactly the kind of silence that erodes trust in the
 * automation.
 */

const SKIP_COPY: Record<string, string> = {
  opted_out: 'opted out of messages',
  no_contact: 'no phone or email on file',
  in_the_past: 'that send time has already passed',
};

export interface ReminderQueueProps {
  now?: Date;
  voice: VoicePreset;
}

export function ReminderQueue({ now = new Date(), voice }: ReminderQueueProps) {
  const range = useMemo(
    () => ({ start: now.toISOString(), end: addWeeks(now, 4).toISOString() }),
    [now],
  );

  const sessions = useSessions(range.start, range.end);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const selected = useMemo(
    () => sessions.data?.find((session) => session.id === sessionId) ?? sessions.data?.[0],
    [sessions.data, sessionId],
  );

  const preview = usePreviewMessages(selected?.id ?? '');
  const schedule = useScheduleMessages(selected?.id ?? '');
  const queued = useSessionMessages(selected?.id ?? '', Boolean(selected));

  if (sessions.isSuccess && (sessions.data?.length ?? 0) === 0) {
    return (
      <Card>
        <Eyebrow>Queue reminders</Eyebrow>
        <p className="text-latte text-sm">Schedule a class and its reminders will live here.</p>
      </Card>
    );
  }

  const alreadyQueued = queued.data?.length ?? 0;

  return (
    <Card>
      <Eyebrow>Queue reminders</Eyebrow>

      <SessionPicker
        sessions={sessions.data ?? []}
        value={selected?.id ?? null}
        onChange={setSessionId}
      />

      {selected ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={preview.isPending}
              onClick={() => preview.mutate(voice)}
            >
              Preview
            </Button>
            <Button disabled={schedule.isPending} onClick={() => schedule.mutate(voice)}>
              Queue reminders
            </Button>
            {alreadyQueued > 0 ? <Chip tone="sage">{alreadyQueued} already queued</Chip> : null}
          </div>

          {preview.data ? (
            <ul className="mt-3 grid gap-2">
              {preview.data.map((item) => (
                <li
                  key={item.kind}
                  className="border-line bg-buttercream rounded-[var(--radius-sm)] border-[1.5px] p-3"
                >
                  <b className="block text-[13.5px]">{item.kind.replace(/_/g, ' ')}</b>
                  <p className="text-latte text-sm">{item.body}</p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {item.send_at ? (
                      <Chip tone="neutral">{formatDateLong(item.send_at)}</Chip>
                    ) : null}
                    {/* Quiet hours moved it: say so rather than silently shifting. */}
                    {item.was_shifted ? <Chip tone="sage">💤 held for quiet hours</Chip> : null}
                    {!item.will_send && item.skip_reason ? (
                      <Chip tone="terra">
                        Skipped · {SKIP_COPY[item.skip_reason] ?? item.skip_reason}
                      </Chip>
                    ) : null}
                    {/* A literal {placeholder} reaching a guest is a defect. */}
                    {item.unresolved_placeholders.length > 0 ? (
                      <Chip tone="terra">Missing: {item.unresolved_placeholders.join(', ')}</Chip>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {schedule.data ? (
            <p className="mt-3 text-sm">
              <HandNote>
                Queued {schedule.data.queued}
                {schedule.data.skipped > 0
                  ? ` · skipped ${schedule.data.skipped} (${Object.entries(schedule.data.skips)
                      .map(([reason, count]) => `${count} ${SKIP_COPY[reason] ?? reason}`)
                      .join(', ')})`
                  : ''}{' '}
                ♡
              </HandNote>
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
