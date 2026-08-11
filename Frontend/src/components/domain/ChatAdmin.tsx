'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button, buttonClasses } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ApiError } from '@/lib/api/errors';
import {
  useAdminRoomMessages,
  useAdminRooms,
  useDeleteMessage,
  usePinBanner,
  useRemoveBanner,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDateLong, formatTime } from '@/lib/dates';
import type { AdminMessage } from '@/lib/api/types';

/**
 * Chat oversight for the host.
 *
 * Labelled as an admin view throughout, because reading a room you are not a
 * member of is a power worth being visible about. The host is responsible for
 * what is said in their studio's name, so they can read every room, pin an
 * announcement to any of them, and remove anything.
 *
 * Nothing here is hidden-only: every action 403s server-side for a guest. The
 * UI omitting a button is a convenience, not the control.
 */

export function ChatAdmin() {
  const rooms = useAdminRooms();
  const [openRoom, setOpenRoom] = useState<string | null>(null);

  if (rooms.isError) {
    return (
      <Card>
        <p role="alert" className="font-bold">
          {rooms.error instanceof ApiError
            ? rooms.error.displayMessage
            : "We couldn't load the chats."}
        </p>
      </Card>
    );
  }

  const list = rooms.data ?? [];
  const selected = list.find((room) => room.id === openRoom);

  return (
    <section>
      <header className="mb-5">
        <h1 className="font-display text-[clamp(26px,4vw,34px)]">Chat oversight</h1>
        <p className="text-latte">
          <HandNote>Every room in your studio — yours to read and to tidy</HandNote>
        </p>
        <Link href="/chat/broadcast" className={`${buttonClasses()} mt-3`}>
          📣 Send a broadcast
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="grid content-start gap-2.5">
          <Eyebrow>Rooms</Eyebrow>

          {rooms.isPending ? (
            <p role="status" className="text-latte text-sm">
              Loading rooms…
            </p>
          ) : null}

          {list.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setOpenRoom(room.id)}
              aria-pressed={room.id === openRoom}
              className={cn(
                'border-line bg-paper min-h-[44px] rounded-[var(--radius-md)] border-[1.5px] p-3 text-left',
                room.id === openRoom && 'border-rose shadow-[0_0_0_3px_var(--color-blush)]',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <b className="truncate text-[14.5px]">{room.name}</b>
                <span className="text-latte shrink-0 text-xs font-bold">{room.message_count}</span>
              </span>

              <span className="mt-1 flex flex-wrap gap-1.5">
                <Chip tone={room.kind === 'lounge' ? 'butter' : 'neutral'}>{room.kind}</Chip>
                {room.banner ? <Chip tone="pink">📌 Pinned</Chip> : null}
              </span>
            </button>
          ))}
        </div>

        <div className="grid content-start gap-4">
          {selected ? (
            <>
              <BannerEditor
                roomId={selected.id}
                current={selected.banner?.body ?? null}
                roomName={selected.name}
              />
              <RoomTranscript roomId={selected.id} />
            </>
          ) : (
            <Card>
              <p className="text-latte text-sm">Pick a room to read it.</p>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}

function BannerEditor({
  roomId,
  current,
  roomName,
}: {
  roomId: string;
  current: string | null;
  roomName: string;
}) {
  const pin = usePinBanner(roomId);
  const remove = useRemoveBanner(roomId);
  const [draft, setDraft] = useState(current ?? '');
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <Eyebrow>Pinned banner · {roomName}</Eyebrow>

      {current && !editing ? (
        <>
          {/* The gradient strip is what makes a banner read as official
              rather than as another message. */}
          <div className="border-rose rounded-[var(--radius-md)] border-[1.5px] bg-gradient-to-r from-[var(--color-blush)] to-[var(--color-butter-soft)] p-3">
            <p className="text-[15px] font-bold">📌 {current}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDraft(current);
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove
            </Button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor={`banner-${roomId}`} className="sr-only">
            Banner text
          </label>
          <input
            id={`banner-${roomId}`}
            value={draft}
            maxLength={280}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Doors open 15 minutes early 🌷"
            className="border-line bg-paper text-cocoa min-h-[48px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!draft.trim() || pin.isPending}
              onClick={() => pin.mutate(draft.trim(), { onSuccess: () => setEditing(false) })}
            >
              {current ? 'Save' : 'Pin it'}
            </Button>
            {editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

function RoomTranscript({ roomId }: { roomId: string }) {
  const messages = useAdminRoomMessages(roomId);
  const remove = useDeleteMessage(roomId);

  return (
    <Card>
      <Eyebrow>Transcript</Eyebrow>

      {messages.isPending ? (
        <p role="status" className="text-latte text-sm">
          Loading…
        </p>
      ) : null}

      {messages.isSuccess && messages.data.length === 0 ? (
        <p className="text-latte text-sm">Nothing said here yet.</p>
      ) : null}

      {messages.data && messages.data.length > 0 ? (
        <ul aria-label="Transcript" className="grid gap-2">
          {messages.data.map((message) => (
            <TranscriptRow
              key={message.id}
              message={message}
              onDelete={() => remove.mutate(message.id)}
              deleting={remove.isPending}
            />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function TranscriptRow({
  message,
  onDelete,
  deleting,
}: {
  message: AdminMessage;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li
      className={cn(
        'border-line rounded-[var(--radius-sm)] border-[1.5px] p-2.5',
        message.is_deleted && 'opacity-60',
      )}
    >
      <p className="text-latte mb-0.5 flex flex-wrap items-center gap-1.5 text-xs font-bold">
        {message.author_name}
        <span className="font-normal" suppressHydrationWarning>
          {formatDateLong(message.created_at)} · {formatTime(message.created_at)}
        </span>
        {message.is_broadcast ? <Chip tone="pink">📣 Broadcast</Chip> : null}
        {message.is_deleted ? <Chip tone="terra">Removed</Chip> : null}
      </p>

      <p className={cn('text-sm', message.is_deleted && 'line-through')}>{message.body}</p>

      {!message.is_deleted ? (
        <Button variant="ghost" size="sm" className="mt-1" disabled={deleting} onClick={onDelete}>
          Remove
        </Button>
      ) : null}
    </li>
  );
}
