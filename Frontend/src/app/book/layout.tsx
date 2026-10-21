import type { CSSProperties, ReactNode } from 'react';
import localFont from 'next/font/local';

/**
 * Fraunces, for the booking page only.
 *
 * It is loaded here and not in the root layout so that `/login` and the rest of
 * the app never request the file: a variable font is about 60 KB, and a studio
 * owner signing in has no use for the guest-facing headline face. Everything
 * under `/book` gets it by way of `--font-display`, which `tokens.css` points at
 * Young Serif for the rest of the app; setting it on the wrapper re-points every
 * `font-display` below it, and nothing outside.
 */

const storefrontDisplay = localFont({
  src: '../../fonts/fraunces-variable.woff2',
  weight: '100 900',
  variable: '--font-storefront-display-loaded',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

const DISPLAY_STYLE = {
  '--font-display': 'var(--font-storefront-display-loaded), Georgia, serif',
} as CSSProperties;

export default function BookLayout({ children }: { children: ReactNode }) {
  return (
    <div className={storefrontDisplay.variable} style={DISPLAY_STYLE}>
      {children}
    </div>
  );
}
