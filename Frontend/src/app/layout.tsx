import type { Metadata, Viewport } from 'next';
import { Caveat, Nunito, Young_Serif } from 'next/font/google';
import type { ReactNode } from 'react';

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
  // Never block zoom: capping scale fails WCAG 1.4.4 and hurts exactly the
  // in-studio, one-handed use this product is designed for.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFF8F0' },
    { media: '(prefers-color-scheme: dark)', color: '#221A15' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable}`}>
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
