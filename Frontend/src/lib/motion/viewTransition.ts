import { flushSync } from 'react-dom';

import { prefersReducedMotion } from '@/lib/public/motion';

/**
 * Run a state change as a view transition, where the browser can.
 *
 * The View Transitions API photographs the page, runs the update, photographs
 * it again, and animates between the two — and any element given the same
 * `view-transition-name` before and after is *carried* from one place to the
 * other. That is how a class card's date-leaf becomes the stub on the next step.
 *
 * Wherever it cannot, the update still happens, instantly: an older browser, or
 * a guest who asked for less motion. The page must never depend on the effect.
 *
 * `flushSync` makes React commit the update inside the browser's callback; with
 * a normal batched update the "after" photograph would be taken before React
 * had changed anything.
 *
 * The returned promise settles when the animation does. An `AbortError` — a
 * newer transition replacing this one, or a navigation — is swallowed: the
 * update ran, which is all the caller needs to know.
 */

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export async function withViewTransition(update: () => void): Promise<void> {
  const doc: TransitionDocument | undefined =
    typeof document === 'undefined' ? undefined : document;
  const start = doc?.startViewTransition;

  if (!doc || typeof start !== 'function' || prefersReducedMotion()) {
    update();
    return;
  }

  const transition = start.call(doc, () => {
    flushSync(update);
  });

  try {
    await transition.finished;
  } catch {
    // Skipped by a newer transition: the update has already happened.
  }
}
