import type { MetadataRoute } from 'next';

import { THEME_COLOR } from '@/styles/themeColor';

/**
 * Installable to the home screen.
 *
 * Not a checkbox: for a tool opened every day in a studio, `standalone` is an
 * ergonomic feature. It removes the browser chrome — roughly 100px back on an
 * 812px screen, on an app whose whole problem is vertical room — and it ends
 * the collapsing-toolbar behaviour that `dvh` exists to work around, because
 * there is no toolbar left to collapse.
 *
 * `start_url` is `/`, not `/today`: this manifest is one document served to
 * both audiences — Next links it from every route, so a guest can install
 * from `/portal` just as easily as a host from their dashboard. `/` is the
 * only start URL that asks who opened the app (`page.tsx` -> `RoleRouter`),
 * and the same reasoning is why middleware sends a signed-in caller off
 * `/login` to `/` rather than straight to `/today`.
 *
 * Launching a guest into `/today` instead is the failure `HostOnly` exists to
 * prevent, arriving through the front door: its children render while the role
 * is still unknown, so the guest's first frame is the full host navigation —
 * Guests, Receipts, Settings — over a round of 403ing dashboard queries.
 *
 * A host-specific launch would need a second manifest scoped to the host
 * routes, not a global default that is wrong for one of the two audiences.
 *
 * No `orientation`. Pinning the installed window to portrait is a WCAG 2.1 AA
 * 1.3.4 failure — and not an abstract one: it keeps the viewport under 1024px,
 * so the sidebar nav, the seven-column week grid and the A4 tag-sheet print
 * flow that is the stated desktop job (PRD §1) are all unreachable from the
 * installed app, while a browser tab has them. Installing must not remove
 * capability.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Maison Abeer',
    short_name: 'Maison Abeer',
    description: 'Your studio bestie — workshop admin that feels like part of your brand.',
    start_url: '/',
    display: 'standalone',

    // The dark theme is a class the visitor chooses, not a media query, so the
    // installed splash keeps the light surface and `MochaToggle` retints the
    // browser bar at runtime.
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,

    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Cropped to a circle or a squircle depending on the launcher, so the
      // mark inside it is scaled to the middle 80%.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
