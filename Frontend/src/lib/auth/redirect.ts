/**
 * Post-login redirect safety.
 *
 * `?next=` is attacker-controllable: anyone can send the host a link. An
 * unchecked value turns the login page into an open redirect, bouncing them
 * to a look-alike site immediately after they authenticate.
 *
 * Extracted from the page so the rule is testable on its own.
 */

/*
 * The role router, not the host dashboard.
 *
 * There are two audiences now. Defaulting to `/today` would drop every guest
 * onto a screen they cannot read, and the failure would be a wall of 401s
 * rather than anything that explains itself.
 */
export const DEFAULT_DESTINATION = '/';

const DEL = 127;
const FIRST_PRINTABLE = 32;

/**
 * Whether the value contains a C0 control character or DEL.
 *
 * Written as a code-point scan rather than a regex character class: a class
 * covering this range needs either raw control bytes in the source (invisible
 * and easy to corrupt) or escapes that tooling likes to rewrite. This says
 * exactly what it means and survives a copy-paste.
 */
export function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);

    if (code === undefined) continue;
    if (code < FIRST_PRINTABLE || code === DEL) return true;
  }

  return false;
}

export function safeDestination(next: string | null | undefined): string {
  if (!next) return DEFAULT_DESTINATION;

  // Must be a same-origin absolute path.
  if (!next.startsWith('/')) return DEFAULT_DESTINATION;

  // "//evil.example" and "/\evil.example" are protocol-relative URLs, not paths.
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_DESTINATION;

  // A control character can smuggle a scheme past a naive prefix check —
  // a tab or newline before "https://" is the classic form.
  if (hasControlCharacter(next)) return DEFAULT_DESTINATION;

  return next;
}
