'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';

import type { GuideTool } from '@/lib/public/craftGuide';
import { haptic } from '@/lib/motion';

/**
 * The tools of a craft as a grid of buttons. Tapping one opens a small card
 * saying what it is for; tapping it again, tapping another or pressing Escape
 * closes it. One card is open at a time.
 */
export function ToolGrid({ tools }: { tools: readonly GuideTool[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || open === null) return;
    event.preventDefault();
    const id = open;
    setOpen(null);
    buttons.current[id]?.focus();
  };

  return (
    <div className="corner-block" onKeyDown={onKeyDown}>
      <h4 className="corner-block-title">The tools</h4>
      <p className="corner-hint">Tap a tool to see what it does.</p>
      <ul className="corner-tools">
        {tools.map((tool) => {
          const isOpen = open === tool.id;
          const cardId = `${base}-${tool.id}`;
          return (
            <li key={tool.id} className="corner-tool">
              <button
                ref={(node) => {
                  buttons.current[tool.id] = node;
                }}
                type="button"
                className="corner-tool-button"
                aria-expanded={isOpen}
                aria-controls={cardId}
                onClick={() => {
                  haptic('tap');
                  setOpen(isOpen ? null : tool.id);
                }}
              >
                {tool.name}
              </button>
              <div id={cardId} className="corner-tool-card" hidden={!isOpen}>
                {isOpen && <p>{tool.does}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
