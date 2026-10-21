/**
 * A Google Maps search for a class's location line.
 *
 * There is no venue record yet, only the text the owner typed ("Studio A",
 * "Café Lumière, Clifton"), so the link searches for that text rather than
 * pointing at coordinates. Trimmed and cut to 120 characters so a pasted
 * paragraph cannot make an absurd URL; `null` when there is nothing to search,
 * so a card never links to a search for "null".
 */

const BASE = 'https://www.google.com/maps/search/?api=1&query=';
const MAX = 120;

export function mapsUrl(location: string | null | undefined): string | null {
  if (typeof location !== 'string') return null;
  const query = location.trim().slice(0, MAX).trim();
  return query ? `${BASE}${encodeURIComponent(query)}` : null;
}
