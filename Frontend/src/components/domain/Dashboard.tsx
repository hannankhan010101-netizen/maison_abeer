'use client';

import { useMemo } from 'react';
import Link from 'next/link';

import { AlertCard } from '@/components/ui/AlertCard';
import { Button, buttonClasses } from '@/components/ui/Button';
import { CapacityRing } from '@/components/ui/CapacityRing';
import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { WeekWrapped, summariseWeek } from '@/components/domain/WeekWrapped';
import { ApiError } from '@/lib/api/errors';
import {
  useFailedMessages,
  useRetryMessage,
  useSessions,
  useUpcomingBirthdays,
} from '@/lib/api/hooks';
import { useResolvedNow } from '@/lib/useNow';
import { addWeeks, formatDateLong, formatRange, humanCountdown, timeOfDay } from '@/lib/dates';
import type { ScheduledMessage, Session, UpcomingBirthday } from '@/lib/api/types';

/**
 * The daily overview (PRD §2.1).
 *
 * Answers "what is happening, what needs me, how am I doing" in one screen,
 * and every element deep-links to where the host can act on it. An alert that
 * cannot be acted on is noise, so each one carries its destination.
 */

export interface DashboardProps {
  hostName?: string;
  now?: Date;
}

export function Dashboard({ hostName, now: nowProp }: DashboardProps) {
  const now = useResolvedNow(nowProp);

  // Gate before the inner component's hooks run, so the server and the first
  // client render agree by construction.
  if (!now) return <TimeGateSkeleton />;

  return <DashboardInner hostName={hostName} now={now} />;
}

function DashboardInner({ hostName, now }: { hostName?: string; now: Date }) {
  const range = useMemo(
    () => ({ start: now.toISOString(), end: addWeeks(now, 2).toISOString() }),
    [now],
  );

  const sessions = useSessions(range.start, range.end);
  const birthdays = useUpcomingBirthdays();
  const failedMessages = useFailedMessages();

  const upcoming = useMemo(() => {
    const list = [...(sessions.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return list[0];
  }, [sessions.data]);

  return (
    <section>
      <Greeting hostName={hostName} now={now} next={upcoming} />

      {sessions.isError ? (
        <Card>
          <div role="alert">
            <p className="font-bold">
              {sessions.error instanceof ApiError
                ? sessions.error.displayMessage
                : "We couldn't load your day just now."}
            </p>
            <Button variant="ghost" className="mt-3" onClick={() => void sessions.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : null}

      {sessions.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your day…</span>
          <div
            aria-hidden="true"
            className="border-line h-44 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
          />
        </div>
      ) : null}

      {sessions.isSuccess ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid content-start gap-4">
            {upcoming ? <NextUpCard session={upcoming} now={now} /> : <NothingScheduled />}
          </div>

          <div className="grid content-start gap-3">
            <Eyebrow>Alerts &amp; nudges</Eyebrow>
            <AlertFeed
              sessions={sessions.data}
              birthdays={birthdays.data ?? []}
              failedMessages={failedMessages.data ?? []}
            />

            {/* Celebratory, and deliberately screenshot-shaped (PRD §2.1). */}
            <WeekWrapped stats={summariseWeek(sessions.data, now)} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Greeting({
  hostName,
  now,
  next,
}: {
  hostName?: string;
  now: Date;
  next: Session | undefined;
}) {
  const part = timeOfDay(now);
  const name = hostName ? `, ${hostName}` : '';

  // Adapts to workload, as the PRD asks: a quiet day should not be dressed up
  // as a busy one.
  const note = next
    ? `${next.title ?? next.class_type_name} ${humanCountdown(next.starts_at, now)}`
    : 'Quiet day today — perfect time to plan something lovely';

  return (
    /* Smaller on a phone. The greeting is warmth, not information, and at
       34px it and its note pushed the first real card 317px down a 664px
       screen — so the thing you opened the app to see started below the
       fold. It keeps its full size where there is room for it. */
    <header className="mb-3 lg:mb-5">
      <h1 className="font-display text-[clamp(21px,4vw,34px)]">
        Good {part}
        {name} ✨
      </h1>
      <p className="text-latte text-sm lg:text-base">
        <HandNote>{note}</HandNote>
      </p>
    </header>
  );
}

function NextUpCard({ session, now }: { session: Session; now: Date }) {
  const { capacity } = session;

  return (
    <Card>
      <Eyebrow>
        next up · {formatDateLong(session.starts_at)} · {humanCountdown(session.starts_at, now)}
      </Eyebrow>

      {/* Stacks on a phone, side by side from `sm` up. */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <CapacityRing booked={capacity.booked} seats={capacity.seats} state={capacity.state} />

        <div className="min-w-0">
          <CardTitle>{session.title ?? session.class_type_name}</CardTitle>
          <p className="text-latte text-[13.5px]">
            {formatRange(session.starts_at, session.ends_at)}
            {session.location ? ` · ${session.location}` : null}
          </p>

          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {capacity.state === 'sold_out' ? <Chip tone="pink">Sold out 🎀</Chip> : null}
            {capacity.state === 'nearly_full' ? <Chip tone="pink">Filling fast 🔥</Chip> : null}
            {capacity.waitlist_is_open ? <Chip tone="butter">Waitlist open</Chip> : null}
            {session.status === 'locked' ? <Chip tone="neutral">🔒 closed</Chip> : null}
          </p>
        </div>
      </div>

      {/* The PRD's three quick actions, each jumping straight to the module. */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Link href="/tags" className={buttonClasses()}>
          Print name tags
        </Link>
        <Link href="/guests" className={buttonClasses('secondary')}>
          View guest list
        </Link>
        <Link href="/calendar" className={buttonClasses('secondary')}>
          Adjust seats
        </Link>
      </div>
    </Card>
  );
}

function NothingScheduled() {
  return (
    <Card>
      <div className="py-4 text-center">
        <p className="font-display text-lg">Nothing scheduled yet</p>
        <p className="text-latte mt-1 text-sm">Plan something lovely?</p>
        <Link href="/calendar" className={`${buttonClasses('ghost')} mt-4`}>
          Open the calendar
        </Link>
      </div>
    </Card>
  );
}

/**
 * Alerts, derived from data the host already has.
 *
 * Every one is actionable and links to where it can be resolved. Critical
 * items sort to the top, matching the PRD's two tiers.
 */
export function buildAlerts(
  sessions: Session[],
  birthdays: UpcomingBirthday[],
  failedMessages: ScheduledMessage[] = [],
) {
  const alerts: {
    id: string;
    tone: 'critical' | 'warning' | 'gentle';
    title: string;
    description: string;
    icon: string;
    /** Where to go to resolve it. Omitted when the fix happens in place. */
    href?: string;
    /** A message to retry, for the one alert resolved without navigating. */
    retryMessageId?: string;
  }[] = [];

  // First, and always critical. The PRD is explicit that a failed send must
  // reach the host (§3.2) — a guest who was never told the class moved is a
  // person standing outside a locked studio.
  if (failedMessages.length > 0) {
    const count = failedMessages.length;
    const first = failedMessages[0];

    alerts.push({
      id: 'messages-failed',
      tone: 'critical',
      icon: '📵',
      title: `${count} message${count === 1 ? '' : 's'} didn't send`,
      description:
        count === 1 && first?.last_error
          ? first.last_error
          : 'Tap retry, or reach them another way',
      retryMessageId: count === 1 ? first?.id : undefined,
      href: count === 1 ? undefined : '/messages',
    });
  }

  for (const session of sessions) {
    if (session.unassigned_guest_count > 0) {
      const count = session.unassigned_guest_count;
      alerts.push({
        id: `tables-${session.id}`,
        tone: 'warning',
        icon: '🪑',
        title: `${count} guest${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} a table`,
        description: 'Assign before printing tags',
        href: '/guests',
      });
    }

    if (session.roster_changed_since_export) {
      alerts.push({
        id: `export-${session.id}`,
        tone: 'critical',
        icon: '🏷️',
        title: 'Roster changed since your last export',
        description: 'Re-export tags so the printed set matches',
        href: '/tags',
      });
    }

    if (session.capacity.waitlist_is_open && session.capacity.available > 0) {
      alerts.push({
        id: `waitlist-${session.id}`,
        tone: 'gentle',
        icon: '💌',
        title: 'A seat opened up',
        description: 'Invite the next person from the waitlist',
        href: '/guests',
      });
    }
  }

  for (const birthday of birthdays) {
    if (birthday.days_away <= 7 && birthday.has_upcoming_booking) {
      alerts.push({
        id: `birthday-${birthday.guest_id}`,
        tone: 'gentle',
        icon: '🎂',
        title: `${birthday.full_name}'s birthday is coming up`,
        description: "they're already booked in — add a little treat?",
        href: '/guests',
      });
    }
  }

  const order = { critical: 0, warning: 1, gentle: 2 } as const;
  return alerts.sort((a, b) => order[a.tone] - order[b.tone]);
}

function AlertFeed({
  sessions,
  birthdays,
  failedMessages,
}: {
  sessions: Session[];
  birthdays: UpcomingBirthday[];
  failedMessages: ScheduledMessage[];
}) {
  const retry = useRetryMessage();
  const alerts = buildAlerts(sessions, birthdays, failedMessages);

  if (alerts.length === 0) {
    return (
      <Card>
        <p className="text-sm">
          <HandNote>All quiet — nothing needs you right now ♡</HandNote>
        </p>
      </Card>
    );
  }

  return (
    <ul className="grid gap-2.5">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <AlertCard
            tone={alert.tone}
            icon={alert.icon}
            title={alert.title}
            description={alert.description}
            action={
              alert.retryMessageId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(alert.retryMessageId!)}
                >
                  {retry.isPending ? 'Retrying…' : 'Retry'}
                </Button>
              ) : alert.href ? (
                <Link href={alert.href} className={buttonClasses('secondary', 'sm')}>
                  Open
                </Link>
              ) : null
            }
          />
        </li>
      ))}
    </ul>
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
