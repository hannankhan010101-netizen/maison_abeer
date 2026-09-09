'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

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
 *
 * The layout does two things that matter more than any amount of colour:
 *
 * **Runs collapse.** Three messages from one person show one avatar and one
 * name, not three. A thread where every line repeats its author reads like a
 * log file; a thread where they collapse reads like people talking.
 *
 * **Your own messages are unmistakable** — a gradient fill on the right, with
 * a tail on the last bubble of each run. You should never have to read a name
 * to know which side of the conversation you are on.
 */

const QUICK_REACTIONS = ['🔥', '💗', '😂', '🎨'] as const;

/** How close two messages must be to count as one run. */
const RUN_GAP_MS = 5 * 60 * 1000;

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

function dayKeyOf(iso: string): string {
  return new Date(iso).toDateString();
}

/**
 * "Today", "Yesterday", then a date.
 *
 * Rendered only after mount — a divider computed on the server says "Today"
 * against the server's clock, which is a hydration mismatch waiting for the
 * first guest in a different timezone.
 */
function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000,
  );

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

interface Grouped {
  message: ChatMessage;
  /** First of a run — carries the avatar and the name. */
  startsRun: boolean;
  /** Last of a run — carries the tail and the timestamp. */
  endsRun: boolean;
  /** Non-null when a day divider belongs above this message. */
  dayBreak: string | null;
}

/**
 * Work out runs and day breaks in one pass.
 *
 * A run breaks on a new author, a broadcast (which is always its own thing),
 * a gap of more than a few minutes, or a new day.
 */
export function groupMessages(messages: readonly ChatMessage[]): Grouped[] {
  return messages.map((message, index) => {
    const previous = index > 0 ? messages[index - 1] : undefined;
    const next = index < messages.length - 1 ? messages[index + 1] : undefined;

    const newDay = !previous || dayKeyOf(previous.created_at) !== dayKeyOf(message.created_at);

    /** Do `a` then `b` belong to the same run? */
    const continues = (a: ChatMessage | undefined, b: ChatMessage | undefined) =>
      !!a &&
      !!b &&
      a.author_id === b.author_id &&
      !a.is_broadcast &&
      !b.is_broadcast &&
      Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < RUN_GAP_MS &&
      dayKeyOf(a.created_at) === dayKeyOf(b.created_at);

    return {
      message,
      startsRun: newDay || !continues(previous, message),
      endsRun: !continues(message, next),
      dayBreak: newDay ? message.created_at : null,
    };
  });
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
  const [pending, setPending] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const count = messages.data?.length ?? 0;
  const room = rooms.data?.find((item) => item.id === roomId);

  useEffect(() => setNow(new Date()), []);

  const grouped = useMemo(() => groupMessages(messages.data ?? []), [messages.data]);

  // Scroll on arrival and on every new message — including an optimistic one,
  // so sending always brings your own message into view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

  // Opening a room is reading it. Marked once per room rather than on every
  // poll, which would be a write every three seconds.
  useEffect(() => {
    if (roomId) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  /**
   * Grow the composer to fit, up to the cap the CSS sets.
   *
   * Reset to `auto` first: `scrollHeight` only shrinks back if the element is
   * allowed to, so without it the box can grow and never return.
   */
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  /**
   * Enter sends — but only where Enter is a key.
   *
   * On a touch keyboard Enter is how people start a new line, and hijacking
   * it means a two-line message is impossible to type. `pointer: coarse`
   * separates the two cases; the send button is always there either way.
   */
  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    event.preventDefault();
    submit();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function submit() {
    const body = draft.trim();
    if (!body || send.isPending) return;

    // Shown immediately in a muted state rather than waiting on the round
    // trip. Polling is on a three-second timer, so without this a message can
    // sit invisible long enough to be retyped.
    setDraft('');
    setPending((queue) => [...queue, body]);

    // Only cleared on failure here — success hands over to the effect above,
    // once the real message is on screen.
    send.mutate(body, {
      onError: () => setPending((queue) => queue.filter((item) => item !== body)),
    });
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
    /*
     * Three fixed rows: header, scrolling messages, composer.
     *
     * `dvh` rather than `vh` because mobile browsers report `vh` against the
     * viewport *without* their collapsing toolbar, so a `100vh` chat is always
     * a little taller than the screen — enough to push the composer under the
     * fold and out of reach. `dvh` tracks the real height as the toolbar and
     * the keyboard come and go.
     *
     * `min-h-0` on the middle row is what actually lets it scroll: a grid item
     * defaults to `min-height: auto`, so without it the list grows to fit its
     * contents and pushes the composer off-screen instead of scrolling — which
     * is exactly what was happening.
     */
    <section className="grid h-dvh grid-rows-[auto_1fr_auto] overflow-hidden">
      <header className="border-line bg-buttercream/95 z-20 border-b-[1.5px] backdrop-blur">
        <div className="mx-auto flex max-w-[720px] items-center gap-1 px-2 py-1.5">
          <Link
            href="/portal/chat"
            aria-label="Back to chats"
            className="text-rose-ink grid size-11 shrink-0 place-items-center text-xl"
          >
            ←
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] leading-tight font-extrabold">
              {room?.name ?? 'Chat'}
            </h1>
            {room?.kind === 'workshop' && room.session_id ? (
              <Link
                href={`/portal/workshops/${room.session_id}`}
                className="text-latte text-xs font-bold"
              >
                See who&rsquo;s coming ›
              </Link>
            ) : room?.kind === 'direct' ? (
              <p className="text-latte text-xs font-bold">Just you and the studio</p>
            ) : null}
          </div>
        </div>

        {/* The host's pinned note. Part of the header so it stays put while
            the conversation scrolls under it. */}
        {room?.banner ? (
          <div className="border-rose/60 border-t bg-gradient-to-r from-[var(--color-blush)] to-[var(--color-butter-soft)] px-3 py-1.5">
            <p className="mx-auto max-w-[720px] truncate text-[13px] font-bold">📌 {room.banner}</p>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 py-2">
        <div className="mx-auto max-w-[720px]">
          {messages.isPending ? (
            <p role="status" aria-live="polite" className="text-latte text-sm">
              Loading messages…
            </p>
          ) : null}

          {messages.isSuccess && count === 0 && pending.length === 0 ? <QuietInHere /> : null}

          {count > 0 || pending.length > 0 ? (
            <ul aria-label="Messages" className="grid gap-px">
              {grouped.map(({ message, startsRun, endsRun, dayBreak }) => (
                <li key={message.id} className={cn(startsRun && 'mt-2 first:mt-0')}>
                  {dayBreak && now ? <DayDivider label={dayLabel(dayBreak, now)} /> : null}
                  <MessageRow
                    message={message}
                    startsRun={startsRun}
                    endsRun={endsRun}
                    onReact={(emoji) => react.mutate({ messageId: message.id, emoji })}
                  />
                </li>
              ))}

              {pending.map((body) => (
                <li key={`pending-${body}`} className="mt-3">
                  <PendingRow body={body} />
                </li>
              ))}
            </ul>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="border-line bg-buttercream flex items-end gap-2 border-t-[1.5px] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <label htmlFor="chat-draft" className="sr-only">
          Write a message
        </label>
        {/*
          A textarea, not an input, and it grows with the message.
          
          A single-line field for something that allows two thousand
          characters means composing anything longer than a greeting inside a
          sliding one-line window. Every messaging app grows the composer to
          about five lines and then scrolls inside it — enough to see a whole
          thought, capped so the keyboard and the composer together never eat
          the conversation.
        */}
        <textarea
          id="chat-draft"
          ref={composerRef}
          rows={1}
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          enterKeyHint="send"
          placeholder="Say something…"
          className={cn(
            'border-line bg-paper text-cocoa max-h-[7.5rem] min-h-[48px] flex-1 resize-none',
            'rounded-[var(--radius-lg)] border-[1.5px] px-4 py-3 leading-snug',
            'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
          )}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
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
    </section>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3 first:mt-0">
      <span className="bg-line h-px flex-1" aria-hidden="true" />
      <span className="text-latte text-[11px] font-extrabold tracking-[0.12em] uppercase">
        {label}
      </span>
      <span className="bg-line h-px flex-1" aria-hidden="true" />
    </div>
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

/** A message that has left the box but not yet come back from the server. */
function PendingRow({ body }: { body: string }) {
  return (
    <div className="flex flex-row-reverse gap-2.5">
      <div className="max-w-[80%] min-w-0">
        <div
          className={cn(
            'text-on-rose inline-block rounded-[var(--radius-lg)] rounded-br-[6px] px-3.5 py-2 text-left text-[15px]',
            'bg-[image:var(--chat-bubble-you)] opacity-60',
          )}
        >
          {body}
        </div>
        <p className="text-latte mt-0.5 text-right text-[11px] font-bold">Sending…</p>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  startsRun,
  endsRun,
  onReact,
}: {
  message: ChatMessage;
  startsRun: boolean;
  endsRun: boolean;
  onReact: (emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const mine = message.is_you;

  return (
    <div className={cn('flex gap-2', mine && 'flex-row-reverse')}>
      {/* No avatar on your own messages — you know who you are, and the
          gradient already says it. Others keep the slot open down a run so
          the bubbles stay aligned, with only the first one labelled. */}
      {mine ? null : startsRun ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-extrabold',
            toneFor(message.author_id),
          )}
        >
          {message.is_host ? '✿' : message.author_name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <span className="size-7 shrink-0" aria-hidden="true" />
      )}

      <div className={cn('max-w-[78%] min-w-0', mine && 'text-right')}>
        {/* The bubble is the reaction target.
            A permanent "＋" under every message cost a full row each and broke
            the runs apart visually — three stacked plus-signs between three
            lines of one person talking. Tapping the message itself is both
            quieter and the gesture people already expect from every other
            chat app they use. */}
        <button
          type="button"
          onClick={() => setShowPicker((open) => !open)}
          aria-expanded={showPicker}
          aria-label={`React to ${mine ? 'your message' : `${message.author_name}'s message`}`}
          className={cn(
            'block px-3 py-1.5 text-left text-[15px] leading-snug',
            'rounded-[var(--radius-lg)]',
            // The tail: the corner nearest the sender squares off on the last
            // bubble of a run, which is what makes a stack read as one turn.
            endsRun && (mine ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'),
            'transition-transform duration-150 [transition-timing-function:var(--ease-spring)]',
            'active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
            'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
            message.is_broadcast
              ? 'border-rose border-[1.5px] bg-gradient-to-r from-[var(--color-blush)] to-[var(--color-butter-soft)]'
              : mine
                ? 'text-on-rose bg-[image:var(--chat-bubble-you)] shadow-[var(--chat-bubble-shadow)]'
                : // The studio talking, but talking — not announcing. A soft
                  // blush fill makes the host's voice recognisable at a glance
                  // without borrowing the broadcast's gradient, which has to
                  // keep meaning "this went to everyone".
                  message.is_host
                  ? 'border-rose bg-blush border-[1.5px]'
                  : 'border-line bg-paper border-[1.5px]',
          )}
        >
          {message.is_broadcast ? (
            <span className="text-rose-ink mb-0.5 block text-[10px] font-extrabold tracking-[0.14em] uppercase">
              📣 From your host
            </span>
          ) : null}

          {/* The sender's name sits inside the bubble, as it does in every
              group chat people already use. Above the bubble it cost a whole
              line per turn; inside, it costs nothing and still says who is
              talking. */}
          {startsRun && !mine ? (
            <span className="text-rose-ink mb-0.5 block text-[11.5px] leading-none font-extrabold">
              {message.author_name}
            </span>
          ) : null}

          {message.body}

          {/* And the time rides along on the last bubble of a run, tucked
              after the text rather than on a line of its own. Two lines saved
              per turn is the difference between three messages on a phone
              screen and eight. */}
          {endsRun ? (
            <span
              className={cn(
                'ml-2 align-baseline text-[10.5px] font-bold whitespace-nowrap',
                mine ? 'text-on-rose/70' : 'text-latte',
              )}
              suppressHydrationWarning
            >
              {formatTime(message.created_at)}
            </span>
          ) : null}
        </button>

        {/* Reactions only take space once they exist. */}
        {message.reactions.length > 0 ? (
          <div className={cn('-mt-1 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(reaction.emoji)}
                aria-pressed={reaction.reacted}
                className={cn(
                  'min-h-[26px] rounded-[var(--radius-pill)] border-[1.5px] px-1.5 text-[11px] font-bold',
                  'transition-transform duration-150 [transition-timing-function:var(--ease-spring)]',
                  'hover:scale-110 active:scale-95',
                  'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
                  reaction.reacted ? 'border-rose bg-blush' : 'border-line bg-paper',
                )}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        ) : null}

        {showPicker ? (
          <div className={cn('mt-1 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(emoji);
                  setShowPicker(false);
                }}
                aria-label={`React with ${emoji}`}
                className={cn(
                  'border-line bg-paper grid min-h-[40px] min-w-[40px] place-items-center',
                  'rounded-full border-[1.5px] text-base',
                  'transition-transform duration-150 [transition-timing-function:var(--ease-spring)]',
                  'hover:scale-125 active:scale-95',
                  'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
