'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AlertCard } from '@/components/ui/AlertCard';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/errors';
import { usePreviewBroadcast, useSendBroadcast } from '@/lib/api/hooks';
import { useToast } from '@/components/ui/Toast';

/**
 * Compose one message for every guest.
 *
 * Three steps rather than one, deliberately. A broadcast reaches everyone at
 * once and cannot be recalled — only deleted room by room — so it is worth
 * making the host see exactly what it will do before it happens. Write, then
 * preview the reach, then confirm.
 */

type Stage = 'write' | 'preview' | 'sent';

export function BroadcastComposer() {
  const preview = usePreviewBroadcast();
  const send = useSendBroadcast();
  const { celebrate } = useToast();

  const [body, setBody] = useState('');
  const [stage, setStage] = useState<Stage>('write');

  const error = preview.error ?? send.error;

  return (
    <section className="mx-auto max-w-[640px]">
      <Link
        href="/chat"
        className="text-rose-ink mb-3 inline-flex min-h-[44px] items-center text-sm font-extrabold"
      >
        ← Chat oversight
      </Link>

      <h1 className="font-display text-[clamp(26px,4vw,34px)]">Broadcast 📣</h1>
      <p className="text-latte mb-4">
        <HandNote>One message, every chat, all at once</HandNote>
      </p>

      {error ? (
        <AlertCard
          className="mb-4"
          tone="critical"
          icon="⚠️"
          title="That didn't send"
          description={
            error instanceof ApiError ? error.displayMessage : 'Please try again in a moment.'
          }
        />
      ) : null}

      {stage === 'sent' ? (
        <Card className="text-center">
          <p className="text-5xl" aria-hidden="true">
            🎀
          </p>
          <p className="font-display mt-2 text-xl">Sent to everyone</p>
          <p className="text-latte mt-1 text-sm">
            It&rsquo;s in every chat now, marked as coming from you.
          </p>
          <Link href="/chat" className={`${buttonClasses('secondary')} mt-4`}>
            Back to oversight
          </Link>
        </Card>
      ) : null}

      {stage === 'write' ? (
        <Card>
          <Eyebrow>Your message</Eyebrow>

          <label htmlFor="broadcast-body" className="sr-only">
            Broadcast message
          </label>
          <textarea
            id="broadcast-body"
            value={body}
            maxLength={2000}
            rows={5}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Studio's closed Monday — see you Wednesday 💗"
            className="border-line bg-paper text-cocoa w-full rounded-[var(--radius-sm)] border-[1.5px] p-3"
          />

          <p className="text-latte mt-1 text-xs">{body.length}/2000</p>

          <Button
            className="mt-3"
            disabled={!body.trim() || preview.isPending}
            onClick={() => preview.mutate(body.trim(), { onSuccess: () => setStage('preview') })}
          >
            Preview it
          </Button>
        </Card>
      ) : null}

      {stage === 'preview' && preview.data ? (
        <Card>
          <Eyebrow>This is what everyone will see</Eyebrow>

          {/* Rendered exactly as it appears in a guest's chat, so the preview
              is a preview rather than a description of one. */}
          <div className="border-rose bg-blush rounded-[var(--radius-md)] border-[1.5px] p-3">
            <span className="text-rose-ink mb-1 block text-[10px] font-extrabold tracking-[0.14em] uppercase">
              📣 From your host
            </span>
            <p className="text-[15px] whitespace-pre-wrap">{preview.data.body}</p>
          </div>

          <p className="mt-3 text-sm font-bold">
            Going to {preview.data.room_count} chat
            {preview.data.room_count === 1 ? '' : 's'} · {preview.data.guest_count} guest
            {preview.data.guest_count === 1 ? '' : 's'}
          </p>

          {preview.data.room_names.length > 0 ? (
            <p className="text-latte mt-1 text-sm">{preview.data.room_names.join(' · ')}</p>
          ) : null}

          <p className="text-latte mt-3 text-sm">
            <HandNote>You can&rsquo;t unsend it — only remove it chat by chat</HandNote>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={send.isPending}
              onClick={() =>
                send.mutate(preview.data!.body, {
                  onSuccess: () => {
                    setStage('sent');
                    celebrate('Broadcast sent 📣');
                  },
                })
              }
            >
              {send.isPending ? 'Sending…' : 'Yes, send it'}
            </Button>
            <Button variant="ghost" onClick={() => setStage('write')}>
              Back to editing
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
