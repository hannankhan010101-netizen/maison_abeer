/**
 * Name tag themes and layout (PRD §2.3).
 *
 * The studio turns booking data into a print-ready set in under three
 * minutes, so everything here is deterministic: the same roster and theme
 * must always produce the same sheet.
 */

export type ThemeId = 'coquette' | 'clay' | 'pastel' | 'autumn';
export type LayoutId = 'a4-8' | 'a4-10' | 'sticker' | 'thermal';

export interface TagTheme {
  id: ThemeId;
  label: string;
  description: string;
  /** Best-matched craft, used to preselect for a session's class type. */
  suitsColorToken: string;
  /** Seasonal drops carry a "New" badge for their season (PRD §2.3). */
  seasonal?: boolean;
  swatch: string;
  tagClass: string;
  ornament?: string;
}

export const THEMES: readonly TagTheme[] = [
  {
    id: 'coquette',
    label: 'Coquette & ribbon',
    description: 'Bows, blush, cursive',
    suitsColorToken: 'pink',
    swatch: 'bg-gradient-to-br from-blush to-pink',
    tagClass: 'bg-blush text-rose-ink border-[#F2C9D4]',
    ornament: '🎀',
  },
  {
    id: 'clay',
    label: 'Clay & terracotta',
    description: 'Earthy, organic, rustic',
    suitsColorToken: 'terra',
    swatch: 'bg-gradient-to-br from-[#EBD9C7] to-terra',
    tagClass: 'bg-[#EBD9C7] text-[#5E3A24] border-[#D9BC9F] rounded-[18px_22px_16px_24px]',
  },
  {
    id: 'pastel',
    label: 'Pastel minimalist',
    description: 'Line-art florals, sage',
    suitsColorToken: 'sage',
    swatch: 'bg-gradient-to-br from-paper to-sage',
    tagClass: 'bg-paper text-sage-ink border-dashed border-sage',
    ornament: '❀',
  },
  {
    id: 'autumn',
    label: 'Autumn drop',
    description: 'Seasonal · limited',
    suitsColorToken: 'butter',
    seasonal: true,
    swatch: 'bg-gradient-to-br from-butter to-terra',
    tagClass: 'bg-butter-soft text-butter-ink border-butter',
    ornament: '🍂',
  },
] as const;

export interface TagLayout {
  id: LayoutId;
  label: string;
  /** Tags per printed page. Thermal prints one at a time. */
  perPage: number;
  description: string;
}

export const LAYOUTS: readonly TagLayout[] = [
  { id: 'a4-8', label: 'A4 grid · 8 per page', perPage: 8, description: 'With faint trim marks' },
  {
    id: 'a4-10',
    label: 'A4 grid · 10 per page',
    perPage: 10,
    description: 'Tighter, smaller tags',
  },
  { id: 'sticker', label: 'Sticker sheet', perPage: 10, description: 'Pre-cut label paper' },
  {
    id: 'thermal',
    label: 'Thermal · one at a time',
    perPage: 1,
    description: 'Desktop label printer',
  },
] as const;

export function themeById(id: ThemeId): TagTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

export function layoutById(id: LayoutId): TagLayout {
  return LAYOUTS.find((layout) => layout.id === id) ?? LAYOUTS[0]!;
}

/** Preselect the theme that matches the session's craft colour. */
export function themeForColorToken(colorToken: string): TagTheme {
  return (
    THEMES.find((theme) => !theme.seasonal && theme.suitsColorToken === colorToken) ?? THEMES[0]!
  );
}

export function pageCount(tagCount: number, layout: LayoutId): number {
  if (tagCount <= 0) return 0;
  return Math.ceil(tagCount / layoutById(layout).perPage);
}

// ---------------------------------------------------------------------------
// Name fitting
// ---------------------------------------------------------------------------

/**
 * Font size for a name on a tag.
 *
 * PRD §2.3: "Very long names scale their type down automatically rather than
 * wrapping awkwardly." A wrapped name on a printed tag cannot be fixed after
 * the sheet is cut, so this errs toward shrinking early.
 */
export const NAME_SIZES = { base: 21, medium: 18, small: 15, tiny: 12.5 } as const;

export function nameFontSize(name: string): number {
  const length = name.trim().length;

  if (length <= 9) return NAME_SIZES.base;
  if (length <= 14) return NAME_SIZES.medium;
  if (length <= 20) return NAME_SIZES.small;
  return NAME_SIZES.tiny;
}

/**
 * The subtext printed under a guest's name.
 *
 * Drawn from the fun answers collected at booking. Only the first is used —
 * a tag is a few square centimetres, not a profile.
 */
export function subtextFor(
  answers: Record<string, string> | null | undefined,
  maxLength = 32,
): string | null {
  if (!answers) return null;

  const first = Object.values(answers).find((value) => value.trim().length > 0);
  if (!first) return null;

  const trimmed = first.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export interface TagData {
  id: string;
  name: string;
  subtext: string | null;
  tableNumber: number | null;
}

export interface TagOptions {
  showTableNumber: boolean;
  showSubtext: boolean;
  showQrCode: boolean;
}

/**
 * Build the printable set from a roster.
 *
 * Cancelled bookings are excluded — printing a tag for someone who is not
 * coming is exactly the kind of small error the product exists to prevent.
 */
export function buildTags(
  bookings: {
    id: string;
    status: string;
    table_number: number | null;
    booking_answers: Record<string, string> | null;
    guest: { full_name: string };
  }[],
  options: TagOptions,
): TagData[] {
  return bookings
    .filter((booking) => booking.status !== 'cancelled')
    .map((booking) => ({
      id: booking.id,
      name: booking.guest.full_name,
      subtext: options.showSubtext ? subtextFor(booking.booking_answers) : null,
      tableNumber: options.showTableNumber ? booking.table_number : null,
    }));
}

/** Guests with no table yet — blocks a clean print run (PRD §2.3 edge case). */
export function unassignedNames(tags: TagData[], showTableNumber: boolean): string[] {
  if (!showTableNumber) return [];
  return tags.filter((tag) => tag.tableNumber === null).map((tag) => tag.name);
}
