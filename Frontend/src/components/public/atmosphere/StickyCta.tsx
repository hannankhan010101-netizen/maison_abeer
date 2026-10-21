'use client';

import type { JSX } from 'react';

import { FloatingPill } from '@/components/public/nav/FloatingPill';

/**
 * @deprecated The phone-only "Save a seat" bar became the floating pill
 * (`nav/FloatingPill`), which shows on every width. This name stays only so
 * the page's existing import keeps working; render `FloatingPill` with the
 * studio's name and classes instead.
 */
export function StickyCta(): JSX.Element | null {
  return <FloatingPill />;
}
