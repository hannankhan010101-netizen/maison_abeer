'use client';

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { guideFor } from '@/lib/public/craftGuide';
import type { CraftKind } from '@/lib/public/studioPhotos';
import { haptic, useMotionTier } from '@/lib/motion';

import '@/styles/units/corner.css';

/**
 * The Craft Corner: a short, friendly lesson in each craft the studio teaches.
 *
 * One panel per taught craft. Two or more crafts get a WAI-ARIA tab row
 * (arrow keys, Home and End, automatic activation); a studio that teaches one
 * craft gets that corner on its own. A craft the studio does not teach is never
 * drawn. Every word comes from `craftGuide.ts`.
 */

const TINT: Record<CraftKind, string> = {
  cake: 'bento',
  pottery: 'pottery',
  painting: 'painting',
};

function tintStyle(kind: CraftKind): CSSProperties {
  const token = TINT[kind];
  return {
    '--corner-tint': `var(--craft-${token})`,
    '--corner-ink': `var(--craft-${token}-ink)`,
  } as CSSProperties;
}

export default function CraftCorner({ crafts }: { crafts: CraftKind[] }) {
  const kinds = [...new Set(crafts)];
  const [chosen, setChosen] = useState<CraftKind | null>(null);
  const tier = useMotionTier();
  const base = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (kinds.length === 0) return null;

  const selected = chosen && kinds.includes(chosen) ? chosen : kinds[0];
  const tabbed = kinds.length > 1;
  const tabId = (kind: CraftKind) => `${base}-tab-${kind}`;
  const panelId = (kind: CraftKind) => `${base}-panel-${kind}`;

  const select = (index: number) => {
    const kind = kinds[index];
    if (kind !== selected) haptic('tap');
    setChosen(kind);
    tabRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = kinds.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
  };

  return (
    <section className="corner" aria-labelledby={`${base}-title`} data-tier={tier}>
      <div className="corner-head">
        <p className="corner-eyebrow">The craft corner</p>
        <h2 id={`${base}-title`} className="corner-title font-display">
          A little lesson before you come
        </h2>
      </div>

      {tabbed && (
        <div role="tablist" aria-label="Crafts" className="corner-tabs">
          {kinds.map((kind, index) => {
            const isSelected = kind === selected;
            return (
              <button
                key={kind}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={tabId(kind)}
                aria-selected={isSelected}
                aria-controls={panelId(kind)}
                tabIndex={isSelected ? 0 : -1}
                className="corner-tab"
                style={tintStyle(kind)}
                onClick={() => select(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {guideFor(kind).title}
              </button>
            );
          })}
        </div>
      )}

      {kinds.map((kind) => {
        const guide = guideFor(kind);
        const isSelected = kind === selected;
        return (
          <div
            key={kind}
            id={panelId(kind)}
            role={tabbed ? 'tabpanel' : 'region'}
            aria-labelledby={tabbed ? tabId(kind) : `${panelId(kind)}-title`}
            tabIndex={tabbed ? 0 : undefined}
            hidden={!isSelected}
            className="corner-panel"
            data-craft={kind}
            style={tintStyle(kind)}
          >
            {isSelected && (
              <>
                <h3 id={`${panelId(kind)}-title`} className="corner-panel-title font-display">
                  {guide.title}
                </h3>
                <p className="corner-blurb">{guide.blurb}</p>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
