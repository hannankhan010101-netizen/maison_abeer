'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * One polite live region for a state change the host caused.
 *
 * The portal is full of controls that change what a region *displays* without
 * navigating — the calendar's week buttons and its swipe, the guest filters
 * and search, picking a chat room. A sighted host sees the view change. A
 * screen-reader user got nothing at all: no page change to announce, no focus
 * move, and the changed content sits outside the reading position.
 *
 * Three rules are baked in here rather than left to each call site, because
 * each of them was got wrong somewhere in this repo first:
 *
 * 1. **The region never unmounts.** `GuestList` already had an `sr-only`
 *    "12 guests" paragraph, inside the branch that renders the list — so a
 *    filter tap re-entered `isPending`, removed the whole subtree and inserted
 *    a *new* paragraph carrying the new count. Assistive technology announces
 *    changes to a live region it was already watching; a region that arrives
 *    with its content is not a change, it is a new node, and nothing is read.
 *    Mount this once, outside every `query.*` branch, and let `state` change
 *    underneath it.
 *
 * 2. **`role="status"`, not `role="alert"`.** A week change is not an
 *    emergency. `status` is polite and implies `aria-atomic="true"`, so the
 *    sentence is read whole rather than as a diff of the words that changed.
 *
 * 3. **One announcement per change, and none for a state the host did not
 *    cause.** A region re-read on every keystroke is worse than silence.
 */

export interface AnnouncerProps {
  /**
   * The new state, as the sentence to speak — or `null` while the view does
   * not know it yet (loading, or nothing selected). `null` is silence, not an
   * empty announcement: clearing the region on every refetch would make the
   * next identical value a *change* and read it again.
   */
  state: string | null;

  /**
   * Speak the first state this region ever sees.
   *
   * Off by default. `/guests` and `/calendar` reach their first count and week
   * by loading, and reading those out at a host who has just opened the page
   * is exactly the noise this component exists to avoid.
   *
   * On `/chat` the first state is the host's own doing: `state` is `null` only
   * because no room is open, so `null` → "Reading The lounge" *is* the tap —
   * and below `lg` it is the tap that hides the room list, drops focus to
   * `<body>` and replaces the pane, which makes it the switch that most needs
   * naming. "First" and "not the host's doing" coincide for a query-fed count;
   * for a selection they do not, so the call site says which it is.
   */
  announceFirst?: boolean;
}

export function Announcer({ state, announceFirst = false }: AnnouncerProps) {
  const [message, setMessage] = useState('');

  // What the region is currently saying, and whether it has seen any state at
  // all. Refs, not state: they steer the next announcement, they are not part
  // of the rendered output, and re-running this effect for them would be a
  // second pass over a decision already made.
  const last = useRef<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    // The view does not know yet. Leave the last sentence in place.
    if (state === null) return;

    const first = !settled.current;
    const previous = last.current;

    settled.current = true;
    last.current = state;

    // Deliberately two separate branches. Folded into one — "announce only
    // when something was said before" — the first state a selection reaches
    // is swallowed, which on /chat is the only announcement there is: one
    // room, one tap, and the e2e written against it would have to click twice
    // to see anything and would pass while the real first tap stayed silent.
    if (first && !announceFirst) return;
    if (!first && previous === state) return;

    setMessage(state);
  }, [state, announceFirst]);

  return (
    <p data-testid="announcer" role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}
