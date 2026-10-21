/**
 * The studio's Instagram handle, parsed once.
 *
 * The handle arrives as whatever the owner typed into settings: a bare name,
 * an `@name`, or a pasted profile URL. Every storefront link to Instagram is
 * built from `normaliseHandle`, so nothing can point at "@null", at a
 * mistyped account, or at a `javascript:` URL.
 */

const HANDLE = /^(?!.*\.\.)[a-z0-9._]{1,30}$/;
const PROFILE_URL = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]*)/;

export function normaliseHandle(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim().toLowerCase();
  const url = PROFILE_URL.exec(value);
  if (url) value = url[1] ?? '';
  if (value.startsWith('@')) value = value.slice(1);
  return HANDLE.test(value) ? value : null;
}

/** `https://instagram.com/<handle>`, or `null` when there is no valid handle. */
export function instagramUrl(raw: string | null | undefined): string | null {
  const handle = normaliseHandle(raw);
  return handle ? `https://instagram.com/${handle}` : null;
}

/** `https://ig.me/m/<handle>` (opens a DM), or `null`. */
export function instagramDmUrl(raw: string | null | undefined): string | null {
  const handle = normaliseHandle(raw);
  return handle ? `https://ig.me/m/${handle}` : null;
}

/** `@<handle>` for display, or `null`. */
export function displayHandle(raw: string | null | undefined): string | null {
  const handle = normaliseHandle(raw);
  return handle ? `@${handle}` : null;
}
