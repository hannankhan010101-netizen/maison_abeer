'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { type TicketModel, ticketFilename } from '@/lib/public/ticket';

type State = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * "Save my ticket": the stub as a picture the guest keeps.
 *
 * Secondary on purpose, so "Open my portal" stays the one primary action. The
 * drawing module loads only when pressed (it is the only canvas code on the
 * page). A dismissed share sheet is the guest's choice and says nothing; a
 * picture that could not be made says so and offers the button again.
 */
export function SaveTicket({ model }: { model: TicketModel }) {
  const [state, setState] = useState<State>('idle');

  async function save() {
    setState('saving');
    const { renderTicket, saveTicket } = await import('@/lib/public/ticketCanvas');

    const blob = await renderTicket(model).catch(() => null);
    if (!blob) {
      setState('failed');
      return;
    }

    const outcome = await saveTicket(blob, ticketFilename(model.className));
    setState(outcome === 'downloaded' ? 'saved' : 'idle');
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void save()}
        disabled={state === 'saving'}
        className={cn(
          'border-cocoa/25 bg-paper text-cocoa inline-flex min-h-[44px] items-center justify-center gap-2',
          'rounded-[var(--radius-pill)] border-[1.5px] px-5 text-[15px] font-extrabold',
          'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
          'disabled:opacity-70',
        )}
      >
        {state === 'saving' ? 'Saving…' : state === 'failed' ? 'Try again' : 'Save my ticket'}
      </button>

      <p aria-live="polite" className="text-latte mt-2 min-h-[1.25rem] text-sm">
        {state === 'saved' ? 'Saved to your photos or downloads' : ''}
      </p>
      {state === 'failed' ? (
        <p role="alert" className="text-latte text-sm">
          We couldn&rsquo;t make your ticket just now — your seat is still saved.
        </p>
      ) : null}
    </div>
  );
}
