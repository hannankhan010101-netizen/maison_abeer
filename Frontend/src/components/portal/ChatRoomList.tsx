'use client';

import Link from 'next/link';

import { Card, HandNote } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/errors';
import { useChatRooms } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { ChatRoom } from '@/lib/api/types';

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
  const lounge = list.filter((room) => room.kind === 'lounge');
  const workshops = list.filter((room) => room.kind === 'workshop');

  return (
    <section>
      <header className="mb-5">
        <h1 className="font-display text-[clamp(26px,6vw,34px)]">Chats 💬</h1>
        <p className="text-latte">
          <HandNote>Your classes, and everyone else</HandNote>
        </p>
      </header>

      {rooms.isPending ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your chats</span>
          <ul className="grid gap-2.5">
            {[0, 1, 2].map((key) => (
              <li
                key={key}
                aria-hidden="true"
                className="border-line bg-blush/40 h-20 animate-pulse rounded-[var(--radius-md)] border-[1.5px] motion-reduce:animate-none"
              />
            ))}
          </ul>
        </div>
      ) : null}

      {list.length > 0 ? (
        <ul aria-label="Chats" className="grid gap-2.5">
          {[...lounge, ...workshops].map((room) => (
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
        'border-[1.5px] p-3.5 transition-transform',
        'hover:border-rose hover:-translate-y-0.5 motion-reduce:transform-none',
        'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full text-lg',
          room.kind === 'lounge' ? 'bg-butter-soft' : 'bg-blush',
        )}
      >
        {room.kind === 'lounge' ? '🛋️' : '🎨'}
      </span>

      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px]">{room.name}</b>
        <small className="text-latte block truncate">
          {room.last_message_preview ?? 'No messages yet'}
        </small>
      </span>

      {unread > 0 ? (
        <span className="bg-rose text-on-rose grid min-w-[24px] shrink-0 place-items-center rounded-full px-2 py-0.5 text-xs font-extrabold">
          <span className="sr-only">{unread} unread messages in </span>
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
