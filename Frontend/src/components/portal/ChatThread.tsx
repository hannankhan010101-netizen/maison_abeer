'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Card, HandNote } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/errors';
import {
  useChatMessages,
  useChatRooms,
  useMarkRoomRead,
  useSendMessage,
  useToggleReaction,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/dates';
import type { ChatMessage } from '@/lib/api/types';

/**
 * One conversation.
 *
 * Polls every three seconds while open, which reads as instant in a group of
 * a dozen and costs nothing architecturally — access control stays in the API
 * rather than moving onto row-level security, which is not yet enforced.
 */

const QUICK_REACTIONS = ['🔥', '💗', '😂', '🎨'] as const;

/** Colour derived from the id, so a person looks the same in every room. */
const TONES = [
  'bg-blush text-rose-ink',
  'bg-sage-soft text-sage-ink',
  'bg-butter-soft text-butter-ink',
  'bg-pink text-on-pink',
] as const;

function toneFor(id: string | null): string {
  if (!id) return 'bg-cocoa text-paper';
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return TONES[sum % TONES.length]!;
}

export interface ChatThreadProps {
  roomId: string;
}

export function ChatThread({ roomId }: ChatThreadProps) {
  const rooms = useChatRooms();
  const messages = useChatMessages(roomId);
  const send = useSendMessage(roomId);
  const markRead = useMarkRoomRead(roomId);
  const react = useToggleReaction(roomId);

  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = messages.data?.length ?? 0;

  const room = rooms.data?.find((item) => item.id === roomId);

  // Scroll on arrival and on every new message. Keyed on the count rather
  // than the array so a poll returning identical data does not yank the view
  // while someone is reading back.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count]);

  // Opening a room is reading it. Marked once per room rather than on every
  // poll, which would be a write every three seconds.
  useEffect(() => {
    if (roomId) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = draft.trim();
    if (!body || send.isPending) return;

    // Cleared immediately: a message that lingers in the box while the
    // request flies looks like it failed.
    setDraft('');
    send.mutate(body);
  }

  if (messages.isError) {
    return (
      <Card>
        <div role="alert">
          <p className="font-bold">
            {messages.error instanceof ApiError
              ? messages.error.displayMessage
              : "We couldn't open that chat."}
          </p>
          <Link href="/portal/chat" className="text-rose-ink mt-3 inline-block font-extrabold">
            ← Back to chats
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <section className="flex min-h-[70vh] flex-col">
      <header className="mb-3">
        <Link
          href="/portal/chat"
          className="text-rose-ink inline-flex min-h-[44px] items-center text-sm font-extrabold"
        >
          ← Chats
        </Link>
        <h1 className="font-display text-[clamp(22px,5vw,28px)]">{room?.name ?? 'Chat'}</h1>

        {room?.kind === 'workshop' && room.session_id ? (
          <Link
            href={`/portal/workshops/${room.session_id}`}
            className="text-latte text-sm font-bold underline"
          >
            See who&rsquo;s coming
          </Link>
        ) : null}
      </header>

      <div className="flex-1">
        {messages.isPending ? (
          <p role="status" aria-live="polite" className="text-latte text-sm">
            Loading messages…
          </p>
        ) : null}

        {messages.isSuccess && count === 0 ? <QuietInHere /> : null}

        {count > 0 ? (
          <ul aria-label="Messages" className="grid gap-3">
            {messages.data!.map((message) => (
              <li key={message.id}>
                <MessageRow
                  message={message}
                  onReact={(emoji) => react.mutate({ messageId: message.id, emoji })}
                />
              </li>
            ))}
          </ul>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="bg-buttercream sticky bottom-0 flex gap-2 py-3">
        <label htmlFor="chat-draft" className="sr-only">
          Write a message
        </label>
        <input
          id="chat-draft"
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something…"
          className="border-line bg-paper text-cocoa min-h-[48px] flex-1 rounded-[var(--radius-pill)] border-[1.5px] px-4"
        />
        <button
          type="submit"
          disabled={!draft.trim() || send.isPending}
          className={cn(
            'bg-rose text-on-rose min-h-[48px] rounded-[var(--radius-pill)] px-5 font-extrabold',
            'transition-transform active:scale-95 motion-reduce:transform-none',
            'focus-visible:outline-cocoa focus-visible:outline-[3px] focus-visible:outline-offset-2',
            'disabled:opacity-50',
          )}
        >
          Send
        </button>
      </form>
    </section>
  );
}

function QuietInHere() {
  return (
    <div className="py-10 text-center">
      <p className="text-5xl" aria-hidden="true">
        👀
      </p>
      <p className="font-display mt-2 text-lg">It&rsquo;s quiet in here… too quiet</p>
      <p className="text-latte mt-1 text-sm">
        <HandNote>Say hi first ♡</HandNote>
      </p>
    </div>
  );
}

function MessageRow({
  message,
  onReact,
}: {
  message: ChatMessage;
  onReact: (emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className={cn('flex gap-2.5', message.is_you && 'flex-row-reverse')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold',
          toneFor(message.author_id),
        )}
      >
        {message.is_host ? '✿' : message.author_name.charAt(0).toUpperCase()}
      </span>

      <div className={cn('max-w-[80%] min-w-0', message.is_you && 'text-right')}>
        <p className="text-latte mb-0.5 text-xs font-bold">
          {message.is_you ? 'You' : message.author_name}
          <span className="font-normal" suppressHydrationWarning>
            {' · '}
            {formatTime(message.created_at)}
          </span>
        </p>

        <div
          className={cn(
            'inline-block rounded-[var(--radius-md)] border-[1.5px] px-3 py-2 text-left text-[15px]',
            // A broadcast is styled apart so an announcement is never lost in
            // the scroll.
            message.is_broadcast
              ? 'border-rose bg-blush'
              : message.is_you
                ? 'border-pink bg-pink text-on-pink'
                : 'border-line bg-paper',
          )}
        >
          {message.is_broadcast ? (
            <span className="text-rose-ink mb-1 block text-[10px] font-extrabold tracking-[0.14em] uppercase">
              📣 From your host
            </span>
          ) : null}
          {message.body}
        </div>

        <div
          className={cn('mt-1 flex flex-wrap items-center gap-1', message.is_you && 'justify-end')}
        >
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              onClick={() => onReact(reaction.emoji)}
              aria-pressed={reaction.reacted}
              className={cn(
                'min-h-[32px] rounded-[var(--radius-pill)] border-[1.5px] px-2 text-xs font-bold',
                'transition-transform active:scale-90 motion-reduce:transform-none',
                reaction.reacted ? 'border-rose bg-blush' : 'border-line bg-paper',
              )}
            >
              {reaction.emoji} {reaction.count}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowPicker((open) => !open)}
            aria-expanded={showPicker}
            aria-label="Add a reaction"
            className="border-line bg-paper text-latte min-h-[32px] rounded-[var(--radius-pill)] border-[1.5px] px-2 text-xs"
          >
            ＋
          </button>

          {showPicker
            ? QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(emoji);
                    setShowPicker(false);
                  }}
                  aria-label={`React with ${emoji}`}
                  className="border-line bg-paper min-h-[32px] rounded-[var(--radius-pill)] border-[1.5px] px-2 text-sm transition-transform active:scale-90 motion-reduce:transform-none"
                >
                  {emoji}
                </button>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
