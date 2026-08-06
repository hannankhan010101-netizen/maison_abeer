'use client';

import { useMemo, useState } from 'react';

import { NewSessionModal, classTypesFrom } from '@/components/domain/NewSessionModal';
import { RescheduleModal, SeatModal } from '@/components/domain/SessionEditModals';
import { SessionChip } from '@/components/domain/SessionChip';
import { Button } from '@/components/ui/Button';
import { Card, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ApiError } from '@/lib/api/errors';
import { useSessions } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { useResolvedNow } from '@/lib/useNow';
import {
  addWeeks,
  dayKey,
  formatDayLabel,
  groupByDay,
  isToday,
  weekDays,
  weekWindow,
} from '@/lib/dates';
import type { Session } from '@/lib/api/types';

/**
 * The week (PRD §2.2).
 *
 * Two layouts from one dataset: an agenda list on a phone, a seven-column
 * grid from `lg` up. The PRD asks for exactly this split — a grid squeezed
 * onto a phone gives seven unreadable columns, and an agenda wastes a desktop.
 */

export interface CalendarViewProps {
  /** Injected so tests are not bound to the wall clock. */
  now?: Date;
}

export function CalendarView({ now: nowProp }: CalendarViewProps) {
  const now = useResolvedNow(nowProp);

  if (!now) return <TimeGateSkeleton />;

  return <CalendarViewInner now={now} />;
}

function CalendarViewInner({ now }: { now: Date }) {
  const [anchor, setAnchor] = useState(now);

  const window = useMemo(() => weekWindow(anchor), [anchor]);
  const query = useSessions(window.start, window.end);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const byDay = useMemo(() => groupByDay(query.data ?? []), [query.data]);
  const classTypes = useMemo(() => classTypesFrom(query.data ?? []), [query.data]);

  // One modal at a time: adding a class, or editing the one just tapped.
  const [addingOn, setAddingOn] = useState<Date | null>(null);
  const [editing, setEditing] = useState<{ session: Session; mode: 'seats' | 'move' } | null>(null);

  return (
    <section>
      <h1 className="font-display text-[clamp(26px,4vw,34px)]">this week</h1>
      <p className="text-latte mb-4">
        <HandNote>your rest day is protected 🌙</HandNote>
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-2" aria-label="Change week">
          <Button variant="secondary" size="sm" onClick={() => setAnchor(addWeeks(anchor, -1))}>
            ← previous
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(now)}>
            this week
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(addWeeks(anchor, 1))}>
            next →
          </Button>
        </nav>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="pink">● bento cake</Chip>
          <Chip tone="terra">● pottery</Chip>
          <Chip tone="sage">● ceramic painting</Chip>
          <Button size="sm" className="ml-1.5" onClick={() => setAddingOn(anchor)}>
            + new session
          </Button>
        </div>
      </div>

      {query.isPending ? <CalendarSkeleton /> : null}

      {query.isError ? (
        <Card>
          <div role="alert">
            <p className="font-bold">
              {query.error instanceof ApiError
                ? query.error.displayMessage
                : "We couldn't load your week just now."}
            </p>
            <Button variant="ghost" className="mt-3" onClick={() => void query.refetch()}>
              try again
            </Button>
          </div>
        </Card>
      ) : null}

      {query.isSuccess ? (
        <>
          {/* Phone: one readable column per day. */}
          <ol className="lg:hidden">
            {days.map((day) => (
              <AgendaDay
                key={dayKey(day)}
                day={day}
                sessions={byDay.get(dayKey(day)) ?? []}
                now={now}
                onAdd={() => setAddingOn(day)}
                onSelect={(session) => setEditing({ session, mode: 'seats' })}
              />
            ))}
          </ol>

          {/* Desktop: the prototype's seven-column grid. */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-7 gap-2">
              {days.map((day) => (
                <div
                  key={`head-${dayKey(day)}`}
                  className="text-latte pb-1 text-center text-[11px] font-extrabold tracking-[0.1em] uppercase"
                >
                  {formatDayLabel(day)}
                </div>
              ))}

              {days.map((day) => (
                <GridCell
                  key={dayKey(day)}
                  day={day}
                  sessions={byDay.get(dayKey(day)) ?? []}
                  now={now}
                  onAdd={() => setAddingOn(day)}
                  onSelect={(session) => setEditing({ session, mode: 'seats' })}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}

      <NewSessionModal
        open={addingOn !== null}
        onClose={() => setAddingOn(null)}
        defaultDate={addingOn ?? undefined}
        classTypes={classTypes}
      />

      {editing ? (
        <>
          <SeatModal
            session={editing.session}
            open={editing.mode === 'seats'}
            onClose={() => setEditing(null)}
            onRequestMove={() => setEditing({ session: editing.session, mode: 'move' })}
          />
          <RescheduleModal
            session={editing.session}
            open={editing.mode === 'move'}
            onClose={() => setEditing(null)}
          />
        </>
      ) : null}
    </section>
  );
}

function AgendaDay({
  day,
  sessions,
  now,
  onAdd,
  onSelect,
}: {
  day: Date;
  sessions: Session[];
  now: Date;
  onAdd: () => void;
  onSelect: (session: Session) => void;
}) {
  const today = isToday(day, now);

  return (
    <li className="mb-3">
      <h2
        className={cn(
          'mb-1.5 text-[11px] font-extrabold tracking-[0.1em] uppercase',
          today ? 'text-rose-ink' : 'text-latte',
        )}
      >
        {formatDayLabel(day)}
        {today ? ' · today' : null}
      </h2>

      {sessions.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="border-line text-latte hover:border-pink hover:text-rose-ink min-h-[44px] w-full rounded-[var(--radius-md)] border-[1.5px] border-dashed px-3 text-left text-sm"
        >
          nothing scheduled — add one?
        </button>
      ) : (
        <ul className="grid gap-1.5">
          {sessions.map((session) => (
            <li key={session.id}>
              <SessionChip session={session} variant="agenda" onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function GridCell({
  day,
  sessions,
  now,
  onAdd,
  onSelect,
}: {
  day: Date;
  sessions: Session[];
  now: Date;
  onAdd: () => void;
  onSelect: (session: Session) => void;
}) {
  const today = isToday(day, now);

  return (
    <div
      className={cn(
        'bg-paper min-h-[118px] rounded-[var(--radius-md)] border-[1.5px] p-2',
        today ? 'border-pink' : 'border-line',
      )}
    >
      <span className={cn('text-xs font-extrabold', today ? 'text-rose-ink' : 'text-latte')}>
        {day.getDate()}
      </span>

      <div className="mt-1.5 grid gap-1.5">
        {sessions.map((session) => (
          <SessionChip key={session.id} session={session} onSelect={onSelect} />
        ))}

        {sessions.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Add a class on ${day.getDate()}`}
            className="border-pink text-rose-ink min-h-[44px] w-full rounded-[10px] border-2 border-dashed text-xs font-extrabold"
          >
            + add
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading your week…</span>
      <div className="grid gap-2 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="border-line h-16 rounded-[var(--radius-md)] border-[1.5px] border-dashed lg:h-[118px]"
          />
        ))}
      </div>
    </div>
  );
}

/** Stable placeholder until the client's clock is known (lib/useNow.ts). */
function TimeGateSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div
        aria-hidden="true"
        className="border-line h-48 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
      />
    </div>
  );
}
