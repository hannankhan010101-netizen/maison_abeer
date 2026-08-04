'use client';

import { useEffect, useState } from 'react';

/**
 * Late-night mocha mode.
 *
 * The prototype's dark theme, toggled by adding `.mocha` to <html>. The
 * choice persists, and the initial value is applied by an inline script in
 * the layout so the page never flashes light before switching.
 */

export const MOCHA_STORAGE_KEY = 'maison-abeer-mocha';

export function isMochaEnabled(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('mocha');
}

export function setMocha(enabled: boolean): void {
  document.documentElement.classList.toggle('mocha', enabled);

  try {
    localStorage.setItem(MOCHA_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private browsing can refuse storage; the toggle should still work for
    // this session rather than throwing.
  }
}

/**
 * Applied before paint via a blocking inline script, so a host who chose dark
 * mode never sees a flash of the light theme.
 */
export const MOCHA_INIT_SCRIPT = `
try {
  var v = localStorage.getItem('${MOCHA_STORAGE_KEY}');
  var dark = v === 'on' || (v === null && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('mocha');
} catch (e) {}
`.trim();

export function MochaToggle() {
  const [enabled, setEnabled] = useState(false);

  // Read after mount: the server cannot know the stored preference, and
  // rendering the wrong icon then correcting it is a hydration mismatch.
  useEffect(() => setEnabled(isMochaEnabled()), []);

  function toggle() {
    const next = !enabled;
    setMocha(next);
    setEnabled(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Switch to light mode' : 'Switch to late night mocha mode'}
      title={enabled ? 'good morning mode' : 'late night mocha mode'}
      className="border-line bg-paper grid size-11 place-items-center rounded-full border-[1.5px] text-base transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
    >
      <span aria-hidden="true">{enabled ? '☀️' : '🌙'}</span>
    </button>
  );
}
