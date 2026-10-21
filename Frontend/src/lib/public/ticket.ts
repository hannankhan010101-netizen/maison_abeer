import type { BookingResult } from '@/lib/public/api';
import { formatDay, formatTime } from '@/lib/public/bookingCopy';

/**
 * The ticket a guest can save after booking: what it says, what it is called,
 * and how a long class name folds onto it.
 *
 * Pure and DOM-free so every awkward case (a 60-character name, no location,
 * an emoji) is pinned by a unit test; `ticketCanvas.ts` only draws it.
 *
 * The model is built field by field from the booking result, never spread
 * from it: `portal_token` is a credential and must not reach the picture or
 * its file name.
 */
export interface TicketModel {
  studio: string;
  className: string;
  day: string;
  time: string;
  location: string | null;
}

export function ticketModel({
  result,
  studioName,
}: {
  result: BookingResult;
  studioName: string;
}): TicketModel {
  return {
    studio: studioName,
    className: result.class_name,
    day: formatDay(result.starts_at),
    time: formatTime(result.starts_at),
    location: result.location ?? null,
  };
}

const SLUG_MAX = 60;

/** `Bento cake decorating` -> `bento-cake-decorating-ticket.png`; nothing left -> `ticket.png`. */
export function ticketFilename(className: string): string {
  const slug = className
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug ? `${slug}-ticket.png` : 'ticket.png';
}

/** User-perceived characters, so an emoji (even a joined one) is never cut in half. */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

const ELLIPSIS = '…';

/** Split one word wider than the line into line-sized pieces. */
function hardCut(measure: (text: string) => number, word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const char of graphemes(word)) {
    if (current && measure(current + char) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Shorten `line` until it fits with an ellipsis on the end. */
function withEllipsis(measure: (text: string) => number, line: string, maxWidth: number): string {
  const chars = graphemes(line);
  while (chars.length > 0 && measure(chars.join('').trimEnd() + ELLIPSIS) > maxWidth) chars.pop();
  return chars.join('').trimEnd() + ELLIPSIS;
}

/**
 * Greedy wrap on spaces. A word wider than the line is hard-cut; text past
 * `maxLines` ends the last line in an ellipsis. No line is wider than
 * `maxWidth` by the given `measure`.
 */
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (measure(word) <= maxWidth) {
      current = word;
    } else {
      const pieces = hardCut(measure, word, maxWidth);
      lines.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1] ?? '';
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = withEllipsis(measure, kept[maxLines - 1]!, maxWidth);
  return kept;
}
