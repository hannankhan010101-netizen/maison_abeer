import type { Metadata, Viewport } from 'next';
import { Caveat, Nunito, Young_Serif } from 'next/font/google';
import type { ReactNode } from 'react';

import { MOCHA_INIT_SCRIPT } from '@/components/ui/MochaToggle';

import './globals.css';

/**
 * Fonts are self-hosted by next/font rather than fetched from Google at
 * runtime: it removes a render-blocking third-party request on the critical
 * path, which matters for the PRD's sub-2s dashboard budget on 4G (§3.1).
 */

const display = Young_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const body = Nunito({
  subsets: ['latin'],
  variable: '--font-body-loaded',
  display: 'swap',
});

const hand = Caveat({
  weight: ['500', '600'],
  subsets: ['latin'],
  variable: '--font-hand-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Maison Abeer',
  description: 'Your studio bestie — workshop admin that feels like part of your brand.',
  applicationName: 'Maison Abeer',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /*
   * Let the virtual keyboard shrink the layout viewport.
   *
   * Android Chrome's default is `resizes-visual`: the keyboard is painted
   * over the page and `dvh` does not change, so a `h-dvh` layout keeps
   * reporting the full screen height while a third of it is covered. The
   * chat is built as three fixed rows inside exactly that (see
   * `portal/ChatThread.tsx`) — without this line its composer ends up
   * underneath the keyboard on Android, which is the one place in the app
   * where typing is the entire point.
   */
  interactiveWidget: 'resizes-content',
  // Never block zoom: capping scale fails WCAG 1.4.4 and hurts exactly the
  // in-studio, one-handed use this product is designed for.
  maximumScale: 5,
  /*
   * No `themeColor` here.
   *
   * It used to be declared against `prefers-color-scheme`, which is the wrong
   * signal: dark mode in this app is the `.mocha` class a host chooses, not an
   * OS setting, so a host on mocha with a light phone got a cream browser bar
   * above a dark brown app. Leaving a media-keyed tag in place alongside the
   * class-driven one would be worse than either — the browser picks whichever
   * media query matches, and that is exactly the tag that is wrong.
   *
   * `MOCHA_INIT_SCRIPT` writes the tag before paint and `setMocha` keeps it in
   * step, so it is always the chosen theme rather than the guessed one.
   */
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script below deliberately adds
    // `mocha` to this element before React hydrates, so the client's class
    // list legitimately differs from the server's. It applies to this element
    // only, not its children, so real mismatches deeper in the tree still
    // report.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${hand.variable}`}
    >
      <head>
        {/* Applied before paint so a dark-mode host never sees a light flash. */}
        <script dangerouslySetInnerHTML={{ __html: MOCHA_INIT_SCRIPT }} />
      </head>
      <body>
        {/* First stop for keyboard users on every page. */}
        <a
          href="#main"
          className="focus:bg-paper sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-[var(--radius-pill)] focus:px-4 focus:py-3 focus:font-extrabold focus:shadow-[var(--shadow-soft)]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
