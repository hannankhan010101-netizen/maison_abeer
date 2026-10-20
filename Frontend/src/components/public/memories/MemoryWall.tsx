'use client';

import type { JSX } from 'react';
import type { PublicClass, PublicMemory, PublicWord } from '@/lib/public/api';

/**
 * The memory wall — a placeholder until Unit 1B builds it.
 *
 * Renders nothing. It exists so `StorefrontPage` can wire the section in once,
 * and no unit has to edit that file.
 */
export interface MemoryWallProps {
  classes: PublicClass[];
  memories?: PublicMemory[];
  words?: PublicWord[];
}

export function MemoryWall(props: MemoryWallProps): JSX.Element | null {
  void props;
  return null;
}
