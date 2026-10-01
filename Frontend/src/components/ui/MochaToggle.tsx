'use client';

import { useEffect, useState } from 'react';

import { THEME_COLOR } from '@/styles/themeColor';

/**
 * Late-night mocha mode.
 *
 * The prototype's dark theme, toggled by adding `.mocha` to <html>. The
 * choice persists, and the initial value is applied by an inline script in
 * the layout so the page never flashes light before switching.
 */

export const MOCHA_STORAGE_KEY = 'maison-abeer-mocha';

/*
 * The pair lives in `styles/themeColor.ts`, not here: the manifest and the
 * tests that hold it against tokens.css need it without pulling in a client
 * component. Re-exported so this file stays the obvious place to find it.
 */
export { THEME_COLOR };

export function isMochaEnabled(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('mocha');
}

export function setMocha(enabled: boolean): void {
  document.documentElement.classList.toggle('mocha', enabled);
  setThemeColorMeta(enabled);

  try {
    localStorage.setItem(MOCHA_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private browsing can refuse storage; the toggle should still work for
    // this session rather than throwing.
  }
}

/**
 * Retint the browser's own chrome to match the chosen theme.
 *
 * `app/layout.tsx` declares `themeColor` against `prefers-color-scheme`, which
 * is the wrong signal here: dark mode in this app is the `.mocha` class a host
 * picks, not an OS setting. A host on mocha with a light phone got a cream
 * status bar above a dark brown app — most visible of all once installed to
 * the home screen, where the chrome is the only thing framing it.
 */
function setThemeColorMeta(enabled: boolean): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');

  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }

  meta.content = enabled ? THEME_COLOR.mocha : THEME_COLOR.light;
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
  var m = document.createElement('meta');
  m.name = 'theme-color';
  m.content = dark ? '${THEME_COLOR.mocha}' : '${THEME_COLOR.light}';
  document.head.appendChild(m);
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
      title={enabled ? 'Good morning mode' : 'Late night mocha mode'}
      className="border-line bg-paper grid size-11 place-items-center rounded-full border-[1.5px] text-base transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
    >
      <span aria-hidden="true">{enabled ? '☀️' : '🌙'}</span>
    </button>
  );
}
