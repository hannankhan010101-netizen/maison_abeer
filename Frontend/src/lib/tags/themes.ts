/**
 * Name tag themes and layout (PRD §2.3).
 *
 * The studio turns booking data into a print-ready set in under three
 * minutes, so everything here is deterministic: the same roster and theme
 * must always produce the same sheet.
 *
 * The paper layouts are *standing* cards: the face prints above a fold-back
 * flap, so one crease along the scored line and the card stands on the table
 * in front of its guest. The flap is real paper and costs real sheet space,
 * which is why these hold fewer per page than the flat tags they replaced.
 */

export type ThemeId = 'coquette' | 'clay' | 'pastel' | 'autumn';
export type LayoutId = 'stand-a4-6' | 'stand-a4-4' | 'sticker' | 'thermal';

export interface TagTheme {
  id: ThemeId;
  label: string;
  description: string;
  /** Best-matched craft, used to preselect for a session's class type. */
  suitsColorToken: string;
  /** Seasonal drops carry a "New" badge for their season (PRD §2.3). */
  seasonal?: boolean;
  swatch: string;
  /**
   * The card face: fill, ink and edge.
   *
   * Literal hex rather than the palette tokens, deliberately. `bg-blush` and
   * friends are re-pointed by `.mocha`, so a host working in the dark theme
   * used to get a preview — and a print — of near-black cards. A printed
   * object has no colour scheme; it is always ink on pale paper.
   */
  tagClass: string;
  /** Fill for the short rule under the name. */
  ruleClass: string;
  /** Edge for the table pill. Separate from `ruleClass` because Tailwind
   * needs both as literal classes, and splitting one string at runtime to
   * get them is a habit that breaks the moment a value contains a slash. */
  pillBorderClass: string;
  /** The fold-back flap, a shade deeper so the crease reads as a crease. */
  flapClass: string;
  ornament?: string;
}

export const THEMES: readonly TagTheme[] = [
  {
    id: 'coquette',
    label: 'Coquette & ribbon',
    description: 'Bows, blush, cursive',
    suitsColorToken: 'pink',
    swatch: 'bg-gradient-to-br from-blush to-pink',
    tagClass: 'bg-gradient-to-b from-[#FFF4F6] to-[#FADFE6] text-[#A93C5C] border-[#F0C3D0]',
    ruleClass: 'bg-[#E2849E]/55',
    pillBorderClass: 'border-[#E6A3B6]',
    flapClass: 'bg-[#F6D6DF]',
    ornament: '🎀',
  },
  {
    id: 'clay',
    label: 'Clay & terracotta',
    description: 'Earthy, organic, rustic',
    suitsColorToken: 'terra',
    swatch: 'bg-gradient-to-br from-[#EBD9C7] to-terra',
    tagClass: 'bg-gradient-to-b from-[#F7EBDD] to-[#E7D3BE] text-[#5E3A24] border-[#D7B99B]',
    ruleClass: 'bg-[#C96F4A]/50',
    pillBorderClass: 'border-[#CE9A77]',
    flapClass: 'bg-[#E1CAB2]',
  },
  {
    id: 'pastel',
    label: 'Pastel minimalist',
    description: 'Line-art florals, sage',
    suitsColorToken: 'sage',
    swatch: 'bg-gradient-to-br from-paper to-sage',
    tagClass: 'bg-gradient-to-b from-[#FFFDFA] to-[#EBF1E0] text-[#55663F] border-[#B9C8A1]',
    ruleClass: 'bg-[#ADBE93]/60',
    pillBorderClass: 'border-[#BDCBA6]',
    flapClass: 'bg-[#E2EAD3]',
    ornament: '❀',
  },
  {
    id: 'autumn',
    label: 'Autumn drop',
    description: 'Seasonal · limited',
    suitsColorToken: 'butter',
    seasonal: true,
    swatch: 'bg-gradient-to-br from-butter to-terra',
    tagClass: 'bg-gradient-to-b from-[#FEF9E8] to-[#F8EACB] text-[#7E601C] border-[#EFD48B]',
    ruleClass: 'bg-[#C96F4A]/45',
    pillBorderClass: 'border-[#E0B573]',
    flapClass: 'bg-[#F4E3B7]',
    ornament: '🍂',
  },
] as const;

export interface TagLayout {
  id: LayoutId;
  label: string;
  /** Tags per printed page. Thermal prints one at a time. */
  perPage: number;
  description: string;
  /** Cards on a sheet sit in this many columns. */
  columns: number;
  /**
   * Whether the card carries a fold-back base flap so it stands on a table.
   *
   * Paper does; adhesive does not. A sticker is worn, and a thermal label is
   * peeled off its backing, so neither has anything to fold — offering them a
   * crease would print a line nobody can use.
   */
  foldable: boolean;
  /** The readable face, in millimetres. Excludes the flap. */
  faceMm: { width: number; height: number };
  /** Depth of the fold-back flap, in millimetres. Zero when not foldable. */
  flapMm: number;
}

/**
 * Sheet geometry.
 *
 * A4 is 210×297mm and `@page` takes a 10mm margin, leaving 190×277mm. Each
 * standing card costs `faceMm.height + flapMm` of that, which is why the
 * paper layouts hold fewer than the flat tags they replaced: the flap is real
 * paper, not a drawn line.
 */
export const LAYOUTS: readonly TagLayout[] = [
  {
    id: 'stand-a4-6',
    label: 'A4 · 6 standing cards',
    perPage: 6,
    description: 'Folds to stand · 90×62mm',
    columns: 2,
    foldable: true,
    faceMm: { width: 90, height: 62 },
    flapMm: 20,
  },
  {
    id: 'stand-a4-4',
    label: 'A4 · 4 standing cards',
    perPage: 4,
    description: 'Larger, bolder type',
    columns: 2,
    foldable: true,
    faceMm: { width: 92, height: 95 },
    flapMm: 24,
  },
  {
    id: 'sticker',
    label: 'Sticker sheet',
    perPage: 10,
    description: 'Pre-cut label paper · worn, not folded',
    columns: 2,
    foldable: false,
    faceMm: { width: 90, height: 50 },
    flapMm: 0,
  },
  {
    id: 'thermal',
    label: 'Thermal · one at a time',
    perPage: 1,
    description: 'Desktop label printer',
    columns: 1,
    foldable: false,
    faceMm: { width: 62, height: 44 },
    flapMm: 0,
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
