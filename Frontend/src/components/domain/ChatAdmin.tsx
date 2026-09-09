'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button, buttonClasses } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ApiError } from '@/lib/api/errors';
import {
  useAdminRoomMessages,
  useAdminRooms,
  useDeleteMessage,
  usePinBanner,
  useReplyInRoom,
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

  // `?room=` lets the Message button on a guest's profile land straight in
  // their thread, rather than dropping the host on the room list to hunt for
  // a name they just clicked.
  const params = useSearchParams();
  const [openRoom, setOpenRoom] = useState<string | null>(params.get('room'));

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
      {/* Compact on a phone: the title and the tagline together were 100px
          of a 664px screen, and every one of those pixels pushed the reply
          box further past the bottom. The subtitle is scene-setting and only
          earns its place where there is room for it. */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 lg:mb-5">
        <div>
          <h1 className="font-display text-[clamp(20px,4vw,34px)]">Chat oversight</h1>
          <p className="text-latte hidden lg:block">
            <HandNote>Every room in your studio — yours to read and to tidy</HandNote>
          </p>
        </div>

        <Link href="/chat/broadcast" className={buttonClasses('secondary')}>
          📣 Broadcast
        </Link>
      </header>

      {/*
        Master/detail, and on a phone only one of them at a time.
        
        Side by side works at desktop width. Stacked on a 390px screen it put
        the reply box roughly 700px down a scrolling page — below the fold,
        so answering a guest meant scrolling past every room first. Narrow
        screens now show the list *or* the conversation, which is what every
        chat client does at this width.
      */}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className={cn('grid content-start gap-2.5', selected && 'hidden lg:grid')}>
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
                <Chip
                  tone={
                    room.kind === 'lounge' ? 'butter' : room.kind === 'direct' ? 'pink' : 'neutral'
                  }
                >
                  {room.kind === 'direct' ? '✿ private' : room.kind}
                </Chip>
                {room.banner ? <Chip tone="pink">📌 Pinned</Chip> : null}
              </span>
            </button>
          ))}
        </div>

        <div className={cn('grid content-start gap-4', !selected && 'hidden lg:grid')}>
          {selected ? (
            <>
              {/* Back to the list — the only way out on a phone, where the
                  list is hidden while a room is open. */}
              <button
                type="button"
                onClick={() => setOpenRoom(null)}
                className="text-rose-ink inline-flex min-h-[44px] items-center self-start text-sm font-extrabold lg:hidden"
              >
                ← All rooms
              </button>

              {/* Conversation first on a phone, banner second.
                  Pinning a banner is occasional; replying is the job. With
                  the editor above it, the reply box sat off the bottom of the
                  screen and had to be scrolled to every single time. */}
              <div className="order-1 lg:order-2">
                <RoomTranscript roomId={selected.id} roomName={selected.name} />
              </div>

              <div className="order-2 lg:order-1">
                <BannerEditor
                  roomId={selected.id}
                  current={selected.banner?.body ?? null}
                  roomName={selected.name}
                />
              </div>
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

function RoomTranscript({ roomId, roomName }: { roomId: string; roomName: string }) {
  const messages = useAdminRoomMessages(roomId);
  const remove = useDeleteMessage(roomId);
  const reply = useReplyInRoom(roomId);

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const bottomRef = useRef<HTMLLIElement>(null);

  const count = messages.data?.length ?? 0;

  // Follow the conversation down as it grows, including your own optimistic
  // reply — sending should always bring the message you just wrote into view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [count, pending.length]);

  /**
   * Retire an optimistic bubble only once the real one has arrived.
   *
   * Clearing it when the mutation settles is a beat too early: the POST
   * resolves, then the invalidated query still has to round-trip, and in that
   * gap the message you just sent disappears and comes back. Handing over on
   * arrival makes the swap invisible.
   */
  useEffect(() => {
    if (!messages.data) return;

    const arrived = new Set(messages.data.map((message) => message.body));
    setPending((queue) => queue.filter((body) => !arrived.has(body)));
  }, [messages.data]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = draft.trim();
    if (!body || reply.isPending) return;

    setDraft('');
    setPending((queue) => [...queue, body]);

    // Only cleared on failure here — success hands over to the effect above,
    // once the real message is on screen.
    reply.mutate(body, {
      onError: () => setPending((queue) => queue.filter((item) => item !== body)),
    });
  }

  return (
    <Card>
      <Eyebrow>Conversation</Eyebrow>

      {reply.isError ? (
        <p role="alert" className="text-danger mb-2 text-sm font-bold">
          {reply.error instanceof ApiError
            ? reply.error.displayMessage
            : "That didn't send. Try again in a moment."}
        </p>
      ) : null}

      {messages.isPending ? (
        <p role="status" className="text-latte text-sm">
          Loading…
        </p>
      ) : null}

      {messages.isSuccess && count === 0 && pending.length === 0 ? (
        <p className="text-latte text-sm">Nothing said here yet — you could start it 👋</p>
      ) : null}

      {(messages.data && count > 0) || pending.length > 0 ? (
        <ul
          aria-label="Conversation"
          className="grid max-h-[42vh] gap-2 overflow-y-auto pr-1 lg:max-h-[420px]"
        >
          {messages.data?.map((message) => (
            <TranscriptRow
              key={message.id}
              message={message}
              onDelete={() => remove.mutate(message.id)}
              deleting={remove.isPending}
            />
          ))}

          {pending.map((body) => (
            <li key={`pending-${body}`} className="flex justify-end">
              <span
                className={cn(
                  'text-on-rose max-w-[85%] rounded-[var(--radius-lg)] rounded-br-[6px] px-3 py-2 text-sm',
                  'bg-[image:var(--chat-bubble-you)] opacity-60',
                )}
              >
                {body}
                <span className="mt-0.5 block text-[11px] font-bold">Sending…</span>
              </span>
            </li>
          ))}

          <li ref={bottomRef} aria-hidden="true" />
        </ul>
      ) : null}

      {/* The reply box. Until this existed the host could read every
          conversation and answer none of them — only pin a banner, or
          broadcast into every other class at once. */}
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <label htmlFor={`reply-${roomId}`} className="sr-only">
          Reply in {roomName}
        </label>
        <input
          id={`reply-${roomId}`}
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Reply as the studio…"
          className={cn(
            'border-line bg-paper text-cocoa min-h-[48px] flex-1 rounded-[var(--radius-pill)] border-[1.5px] px-4',
            'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
          )}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send reply"
          className={cn(
            'text-on-rose grid min-h-[48px] min-w-[48px] place-items-center rounded-full text-lg',
            'bg-[image:var(--chat-bubble-you)] shadow-[var(--chat-bubble-shadow)]',
            'transition-transform duration-150 [transition-timing-function:var(--ease-spring)]',
            'active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100',
            'focus-visible:outline-cocoa focus-visible:outline-[3px] focus-visible:outline-offset-2',
            'disabled:opacity-40 disabled:shadow-none',
          )}
        >
          <span aria-hidden="true">↑</span>
        </button>
      </form>

      <p className="text-latte mt-1.5 text-xs">
        Everyone in this chat sees it, as <b>Your host</b> — not the other classes.
      </p>
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
  // Your own messages sit right and carry the gradient, exactly as they do on
  // the guest side. Reading your studio's chat should feel like the chat it
  // is, not like a moderation log of it.
  const mine = message.is_host;

  return (
    <li className={cn('flex', mine && 'justify-end', message.is_deleted && 'opacity-60')}>
      <div className={cn('max-w-[85%] min-w-0', mine && 'text-right')}>
        <p className="text-latte mb-0.5 flex flex-wrap items-center gap-1.5 text-xs font-bold">
          {mine ? null : message.author_name}
          <span className="font-normal" suppressHydrationWarning>
            {formatDateLong(message.created_at)} · {formatTime(message.created_at)}
          </span>
          {message.is_broadcast ? <Chip tone="pink">📣 Broadcast</Chip> : null}
          {message.is_deleted ? <Chip tone="terra">Removed</Chip> : null}
        </p>

        <div
          className={cn(
            'inline-block px-3 py-2 text-left text-sm',
            'rounded-[var(--radius-lg)]',
            mine ? 'rounded-br-[6px]' : 'rounded-bl-[6px]',
            message.is_deleted && 'line-through',
            message.is_broadcast
              ? 'border-rose border-[1.5px] bg-gradient-to-r from-[var(--color-blush)] to-[var(--color-butter-soft)]'
              : mine
                ? 'text-on-rose bg-[image:var(--chat-bubble-you)] shadow-[var(--chat-bubble-shadow)]'
                : 'border-line bg-paper border-[1.5px]',
          )}
        >
          {message.body}
        </div>

        {!message.is_deleted ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 block"
            disabled={deleting}
            onClick={onDelete}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </li>
  );
}
