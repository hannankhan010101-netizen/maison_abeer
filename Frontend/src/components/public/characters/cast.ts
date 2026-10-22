import type { ComponentType } from 'react';

import type { CraftKind } from '@/lib/public/studioPhotos';

import { BentoCake } from './BentoCake';
import { Dot } from './Dot';
import { Pip } from './Pip';

/**
 * The cast: one little character per craft the studio teaches.
 *
 * The names are working names, kept here and only here so the owner can
 * rename them in one edit: the buttons' accessible names are built from this
 * table, never typed out anywhere else.
 */

export const MOODS = ['happy', 'wink', 'wow', 'sleepy'] as const;

export type CharacterMood = (typeof MOODS)[number];

export interface CharacterProps {
  mood?: CharacterMood;
  /** The drawn size in CSS pixels, square. Fixed, so the hero never shifts. */
  size?: number;
}

export const CAST_NAMES: Record<CraftKind, { name: string; noun: string }> = {
  pottery: { name: 'Pip', noun: 'clay' },
  cake: { name: 'Bento', noun: 'cake' },
  painting: { name: 'Dot', noun: 'painting' },
};

export function castLabel(kind: CraftKind): string {
  const { name, noun } = CAST_NAMES[kind];
  return `${name}, tap for a ${noun} fact`;
}

export const CAST: Record<CraftKind, ComponentType<CharacterProps>> = {
  pottery: Pip,
  cake: BentoCake,
  painting: Dot,
};
