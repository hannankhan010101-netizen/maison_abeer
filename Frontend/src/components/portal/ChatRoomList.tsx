'use client';

import Link from 'next/link';

import { Card, HandNote } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/errors';
import { useChatRooms } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDateLong } from '@/lib/dates';
import type { ChatRoom } from '@/lib/api/types';

/**
 * "2m", "4h", "Tue" — the scannable form every chat list uses.
 *
 * A full date on every row is noise; what you actually want to know is
 * whether something happened just now or last week.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));

  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  if (mins < 60 * 24 * 7) return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });

  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Every room this guest can open.
 *
 * The lounge sits first and stays first — it is the one room that is always
 * there, and a guest between classes should not find an empty screen.
 */

export function ChatRoomList() {
  const rooms = useChatRooms();

  if (rooms.isError) {
    return (
      <Card>
        <p role="alert" className="font-bold">
          {rooms.error instanceof ApiError
            ? rooms.error.displayMessage
            : "We couldn't load your chats."}
        </p>
      </Card>
    );
  }

  const list = rooms.data ?? [];
  // The private thread goes first when there is one. It is the only room
  // where a message is meant for this guest personally, so it is the one
  // thing they should not have to scroll for.
  const direct = list.filter((room) => room.kind === 'direct');
  const lounge = list.filter((room) => room.kind === 'lounge');
  const workshops = list.filter((room) => room.kind === 'workshop');

  return (
    <section>
      {/* A list of conversations is a working surface, not a landing page.
          The title and tagline together used to take a third of a phone
          screen before the first row; two lines is plenty. */}
      <header className="mb-3">
        <h1 className="font-display text-[clamp(22px,5vw,26px)]">Chats 💬</h1>
        <p className="text-latte text-sm">
          <HandNote>Your classes, and everyone else</HandNote>
        </p>
      </header>

      {rooms.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your chats</span>
          <ul className="grid gap-1.5">
            {[0, 1, 2].map((key) => (
              <li
                key={key}
                aria-hidden="true"
                className="border-line bg-blush/40 h-[72px] animate-pulse rounded-[var(--radius-md)] border-[1.5px] motion-reduce:animate-none"
              />
            ))}
          </ul>
        </div>
      ) : null}

      {list.length > 0 ? (
        <ul aria-label="Chats" className="grid gap-1.5">
          {[...direct, ...lounge, ...workshops].map((room) => (
            <li key={room.id}>
              <RoomRow room={room} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RoomRow({ room }: { room: ChatRoom }) {
  const unread = room.unread_count;

  return (
    <Link
      href={`/portal/chat/${room.id}`}
      className={cn(
        'border-line bg-paper flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)]',
        'border-[1.5px] px-3 py-2.5 transition-transform',
        'hover:border-rose hover:-translate-y-0.5 motion-reduce:transform-none',
        'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-full text-xl',
          room.kind === 'lounge'
            ? 'bg-butter-soft'
            : room.kind === 'direct'
              ? // The gradient marks the one room that is only theirs.
                'bg-[image:var(--chat-bubble-you)] shadow-[var(--chat-bubble-shadow)]'
              : 'bg-blush',
        )}
      >
        {room.kind === 'lounge' ? '🛋️' : room.kind === 'direct' ? '✿' : '🎨'}
      </span>

      <span className="min-w-0 flex-1">
        {/* Name and time share a line, as they do in every messaging app —
            two stacked lines per row is what made this list four rooms tall
            on a phone. */}
        <span className="flex items-baseline justify-between gap-2">
          <b className={cn('truncate text-[15px]', unread > 0 && 'font-extrabold')}>
            {room.name}
            {room.kind === 'direct' ? (
              <span className="text-rose-ink ml-1.5 text-[11px] font-extrabold tracking-[0.08em] uppercase">
                Just you
              </span>
            ) : null}
          </b>

          {room.last_message_at ? (
            <small
              className={cn(
                'shrink-0 text-[11px] font-bold',
                unread > 0 ? 'text-rose-ink' : 'text-latte',
              )}
              suppressHydrationWarning
            >
              {relativeTime(room.last_message_at)}
            </small>
          ) : null}
        </span>

        {/* Which class, when. A studio running the same workshop weekly gets
            several identically-named rooms; without the date you cannot tell
            which one you are opening. */}
        {room.kind === 'workshop' && room.starts_at ? (
          <small
            className="text-latte block truncate text-[11px] font-bold"
            suppressHydrationWarning
          >
            {formatDateLong(room.starts_at)}
          </small>
        ) : null}

        {/* A pinned banner outranks the last message: it is the thing the host
            wants seen, and it stays put while chatter scrolls past. */}
        {room.banner ? (
          <small className="text-rose-ink block truncate font-bold">📌 {room.banner}</small>
        ) : (
          <small
            className={cn('block truncate', unread > 0 ? 'text-cocoa font-bold' : 'text-latte')}
          >
            {room.last_message_preview ?? 'No messages yet — say hi 👋'}
          </small>
        )}
      </span>

      {unread > 0 ? (
        <span
          className={cn(
            'text-on-rose grid min-w-[24px] shrink-0 place-items-center rounded-full px-2 py-0.5 text-xs font-extrabold',
            'bg-[image:var(--chat-bubble-you)] shadow-[var(--chat-bubble-shadow)]',
          )}
        >
          <span className="sr-only">{unread} unread messages in </span>
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
