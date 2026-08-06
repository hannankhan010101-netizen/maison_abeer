'use client';

import { useMemo, useState } from 'react';

import { AddGuestModal } from '@/components/domain/AddGuestModal';
import { GuestRow } from '@/components/domain/GuestRow';
import { SessionPicker } from '@/components/domain/SessionPicker';
import { SessionRoster } from '@/components/domain/SessionRoster';
import { Button } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icing } from '@/components/ui/Icing';
import { useGuests, useSessions } from '@/lib/api/hooks';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { useResolvedNow } from '@/lib/useNow';
import { addWeeks } from '@/lib/dates';

/**
 * The guest roster (PRD §2.4).
 *
 * Every state is designed, not defaulted: loading, empty, error and
 * "no search results" each say something useful in the product voice. A bare
 * spinner or a blank list is exactly the back-office feel the PRD rules out.
 */

type Filter = 'all' | 'regulars';

export interface GuestListProps {
  now?: Date;
}

export function GuestList({ now: nowProp }: GuestListProps) {
  const now = useResolvedNow(nowProp);

  if (!now) return <TimeGateSkeleton />;

  return <GuestListInner now={now} />;
}

function GuestListInner({ now }: { now: Date }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);

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

  const query = useGuests({
    search: search.trim() || undefined,
    regularsOnly: filter === 'regulars',
  });

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(26px,4vw,34px)]">guests</h1>
          <p className="text-latte">
            <HandNote>your regulars are highlighted 💗</HandNote>
          </p>
        </div>

        <Button onClick={() => setAdding(true)}>+ add a guest</Button>
      </div>

      {/* Seating, cancellations and the waitlist for one class. */}
      {sessions.isSuccess && (sessions.data?.length ?? 0) > 0 ? (
        <div className="mb-6">
          <Eyebrow>this class</Eyebrow>
          <SessionPicker
            sessions={sessions.data ?? []}
            value={selected?.id ?? null}
            onChange={setSessionId}
          />
          {selected ? <SessionRoster session={selected} /> : null}
        </div>
      ) : null}

      <Eyebrow>everyone</Eyebrow>

      <label htmlFor="guest-search" className="sr-only">
        Search guests
      </label>
      <input
        id="guest-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="🔍 search guests…"
        className="border-line bg-paper text-cocoa mb-3.5 min-h-[44px] w-full rounded-[var(--radius-pill)] border-[1.5px] px-4 text-sm"
      />

      {/* Filters are buttons, not links: they change state, not location. */}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter guests">
        {(['all', 'regulars'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={cn(
              'min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-3.5 text-xs font-extrabold',
              filter === value
                ? 'border-pink bg-pink text-on-pink'
                : 'border-line bg-paper text-latte hover:border-pink',
            )}
          >
            {value === 'all' ? 'everyone' : 'regulars 💗'}
          </button>
        ))}
      </div>

      <Card>
        <GuestListBody
          query={query}
          searching={Boolean(search.trim())}
          regularsOnly={filter === 'regulars'}
        />
      </Card>

      <AddGuestModal open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}

function GuestListBody({
  query,
  searching,
  regularsOnly,
}: {
  query: ReturnType<typeof useGuests>;
  searching: boolean;
  regularsOnly: boolean;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading guests…</span>
        <Icing value={0} max={1} label="Loading guests" aria-hidden="true" />
        <p className="text-latte mt-3 text-sm">just a sec…</p>
      </div>
    );
  }

  if (query.isError) {
    const message =
      query.error instanceof ApiError
        ? query.error.displayMessage
        : "We couldn't load your guests just now.";

    return (
      <div role="alert" className="text-sm">
        <p className="font-bold">{message}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="bg-blush text-rose-ink mt-3 min-h-[44px] rounded-[var(--radius-pill)] px-4 font-extrabold"
        >
          try again
        </button>
      </div>
    );
  }

  const guests = query.data ?? [];

  if (guests.length === 0) {
    // Three different empties, because they mean three different things.
    if (searching) {
      return <Empty title="no one by that name" note="try a shorter search?" />;
    }

    if (regularsOnly) {
      return (
        <Empty
          title="no regulars just yet"
          note="they earn the badge on their third visit — it&rsquo;ll happen 💗"
        />
      );
    }

    return (
      <Empty
        title="no guests yet"
        note="add someone from a DM or a phone call — a name is enough to start"
      />
    );
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {guests.length} guest{guests.length === 1 ? '' : 's'}
      </p>

      <div className="mb-1 flex items-center gap-2">
        <Chip tone="neutral">
          {guests.length} guest{guests.length === 1 ? '' : 's'}
        </Chip>
      </div>

      <ul>
        {guests.map((guest) => (
          <li key={guest.id}>
            <GuestRow guest={guest} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Empty({ title, note }: { title: string; note: string }) {
  return (
    <div className="py-6 text-center">
      <p className="font-display text-lg">{title}</p>
      <p className="text-latte mt-1 text-sm">{note}</p>
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
