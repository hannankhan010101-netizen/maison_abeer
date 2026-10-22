import { type CraftKind } from './studioPhotos';

/**
 * "The guest wants this craft": a small signal from one part of the storefront
 * to another.
 *
 * The quiz ends with "Book this one", and the class list owns its own craft
 * filter. Neither should import the other, and the page that holds them does
 * not own the filter either, so this is a window event: the quiz asks, the
 * list listens, and a listener that is not there simply means nothing happens.
 */

export const PICK_CRAFT_EVENT = 'storefront:pick-craft';

const KINDS: readonly CraftKind[] = ['pottery', 'cake', 'painting'];

function isKind(value: unknown): value is CraftKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

export function requestCraftFilter(kind: CraftKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CraftKind>(PICK_CRAFT_EVENT, { detail: kind }));
}

/** Listen for requests; returns the function that stops listening. */
export function onCraftFilterRequest(listener: (kind: CraftKind) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (isKind(detail)) listener(detail);
  };

  window.addEventListener(PICK_CRAFT_EVENT, handler);
  return () => window.removeEventListener(PICK_CRAFT_EVENT, handler);
}
