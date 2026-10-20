'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { NewSessionModal } from '@/components/domain/NewSessionModal';
import { SessionChip } from '@/components/domain/SessionChip';
import { Button } from '@/components/ui/Button';
import { Card, HandNote } from '@/components/ui/Card';
import { Announcer } from '@/components/ui/Announcer';
import { Chip } from '@/components/ui/Chip';
import { Fab } from '@/components/ui/Fab';
import { ApiError } from '@/lib/api/errors';
import { useSessions } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { useResolvedNow } from '@/lib/useNow';
import {
  addWeeks,
  dayKey,
  formatDayLabel,
  formatWeekLabel,
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

  const router = useRouter();
  const range = useMemo(() => weekWindow(anchor), [anchor]);
  const query = useSessions(range.start, range.end);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const byDay = useMemo(() => groupByDay(query.data ?? []), [query.data]);

  /*
   * Swipe the agenda sideways to change week.
   *
   * An addition, never the only route: the prev/next buttons stay visible on
   * every width, because a gesture as the sole way to reach a view fails WCAG
   * 2.5.1 and strands anyone using a screen reader or a keyboard on a phone.
   *
   * Keyed to one pointer id, not to "the last pointerdown". A second contact
   * point is normal when a phone is held one-handed — the base of the thumb
   * rests on the left edge of the list while the index finger taps a chip on
   * the right — and a single start point would be overwritten by that second
   * contact, so the finger that lifts first gets diffed against the *other*
   * finger's origin: a 310px "swipe" out of a stationary tap, rewinding the
   * week while `onSelect` navigates. Pinch-zoom of the agenda, which this app
   * deliberately permits (`maximumScale: 5`), did the same.
   */
  const swipeFrom = useRef<{ id: number; x: number; y: number } | null>(null);

  function onSwipeStart(event: React.PointerEvent) {
    // A mouse has the buttons right there; this is for thumbs.
    if (event.pointerType === 'mouse') return;
    // Already following a finger: later contacts are the hand holding the phone.
    if (swipeFrom.current) return;

    swipeFrom.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  /*
   * Wired to `onPointerCancel` and `onLostPointerCapture` as well as
   * `onPointerUp`, because a cancelled pointer never reports an up.
   *
   * Chrome hands the touch to a scroller the moment one engages and ends the
   * gesture with `pointercancel` — which is also the first half of the defect
   * `touch-pan-y` on the list fixes: the week silently did not change on any
   * swipe with the ~30px of vertical drift a thumb arc produces. The other
   * half is here: without this the start point outlives the gesture, so the
   * "already tracking" guard above would latch on the first scroll and no
   * further swipe would ever start.
   *
   * Do not change the week from here. The browser cancelled us because it took
   * the touch for a scroll, and a scroll is not a week change.
   */
  function onSwipeCancel(event: React.PointerEvent) {
    if (swipeFrom.current?.id === event.pointerId) swipeFrom.current = null;
  }

  function onSwipeEnd(event: React.PointerEvent) {
    const from = swipeFrom.current;
    if (!from || from.id !== event.pointerId) return;
    swipeFrom.current = null;

    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;

    // Decisive and horizontal — not a vertical scroll that drifted off course.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;

    setAnchor(addWeeks(anchor, dx < 0 ? 1 : -1));
  }

  // One modal at a time: adding a class.
  const [addingOn, setAddingOn] = useState<Date | null>(null);

  return (
    <section>
      <h1 className="font-display text-[clamp(21px,4vw,34px)]">This week</h1>
      <p className="text-latte mb-4">
        <HandNote>Your rest day is protected 🌙</HandNote>
      </p>

      {/*
        The week changed, out loud.

        Both routes into a new week — the prev/next buttons and the swipe —
        funnel through `setAnchor`, so one region covers both; the swipe added
        a second silent way to change seven columns of content, and the
        buttons had always been the first. The heading above says "This week"
        whatever week is showing (its own defect, not fixed here), so without
        this nothing tells a screen-reader user where they landed.

        Mounted here, outside every `query.*` branch below: a refetch for the
        new week re-enters `isPending`, and a live region that unmounts with
        the old week's content announces nothing when it comes back with the
        new week's.
      */}
      <Announcer state={formatWeekLabel(anchor)} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-2" aria-label="Change week">
          <Button variant="secondary" size="sm" onClick={() => setAnchor(addWeeks(anchor, -1))}>
            ← previous
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(now)}>
            This week
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(addWeeks(anchor, 1))}>
            Next →
          </Button>
        </nav>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Reference material, not a control. Seven wrapping items put 265px
              of chrome above the week on a phone, and `SessionChip` already
              carries the same colour in place, on the thing it identifies. */}
          <Chip tone="pink" className="hidden sm:inline-flex">
            ● bento cake
          </Chip>
          <Chip tone="terra" className="hidden sm:inline-flex">
            ● pottery
          </Chip>
          <Chip tone="sage" className="hidden sm:inline-flex">
            ● ceramic painting
          </Chip>
          {/* The `Fab` below carries this on a phone. */}
          <Button
            size="sm"
            className="ml-1.5 hidden lg:inline-flex"
            onClick={() => setAddingOn(anchor)}
          >
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
              Try again
            </Button>
          </div>
        </Card>
      ) : null}

      {query.isSuccess ? (
        <>
          {/* Phone: one readable column per day. */}
          {/* `touch-pan-y` leaves vertical scrolling to the browser but takes the
              x axis out of its scroll candidates, so an x-dominant drag is never
              reinterpreted as a scroll mid-gesture. Without it Chrome claims the
              thumb arc, fires `pointercancel` instead of `pointerup`, and the
              week silently does not change — the swipe worked only when it was
              almost perfectly horizontal. */}
          <ol
            className="touch-pan-y lg:hidden"
            onPointerDown={onSwipeStart}
            onPointerUp={onSwipeEnd}
            onPointerCancel={onSwipeCancel}
            onLostPointerCapture={onSwipeCancel}
          >
            {days.map((day) => (
              <AgendaDay
                key={dayKey(day)}
                day={day}
                sessions={byDay.get(dayKey(day)) ?? []}
                now={now}
                onAdd={() => setAddingOn(day)}
                onSelect={(session) => router.push(`/sessions/${session.id}`)}
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
                  onSelect={(session) => router.push(`/sessions/${session.id}`)}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}

      <Fab label="New session" onClick={() => setAddingOn(anchor)} />

      <NewSessionModal
        open={addingOn !== null}
        onClose={() => setAddingOn(null)}
        defaultDate={addingOn ?? undefined}
      />
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
          Nothing scheduled — add one?
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
