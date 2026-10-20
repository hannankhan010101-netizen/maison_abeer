/**
 * The one door through which GSAP enters the page.
 *
 * GSAP is decoration here, so it is never imported at the top of a module: a
 * guest on mobile data arrived to book a class, and the booking form must not
 * wait on an animation library. `loadGsap` is called from an effect, after
 * mount, as its own chunk, and only for the plugins the caller names — Flip and
 * MorphSVG are not paid for by a page that only scrubs a scroll.
 *
 * It **resolves `null`, never rejects**. A chunk can fail to load (offline,
 * blocked, a flaky network) and the right response is a page that is simply
 * not animated — every caller does `if (!kit) return` and leaves the static
 * version standing. The failure is warned about once, not thrown into React.
 *
 * Plugins come back already registered: one that is loaded but not registered
 * does nothing and says nothing.
 */

export type GsapPluginName =
  'ScrollTrigger' | 'Flip' | 'Draggable' | 'InertiaPlugin' | 'MorphSVGPlugin' | 'DrawSVGPlugin';

/** Each plugin name mapped to the value its module exports. */
interface PluginExports {
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
  Flip: typeof import('gsap/Flip').Flip;
  Draggable: typeof import('gsap/Draggable').Draggable;
  InertiaPlugin: typeof import('gsap/InertiaPlugin').InertiaPlugin;
  MorphSVGPlugin: typeof import('gsap/MorphSVGPlugin').MorphSVGPlugin;
  DrawSVGPlugin: typeof import('gsap/DrawSVGPlugin').DrawSVGPlugin;
}

export type GsapKit<N extends GsapPluginName> = { gsap: typeof import('gsap').gsap } & {
  [K in N]: PluginExports[K];
};

const LOADERS: { [K in GsapPluginName]: () => Promise<PluginExports[K]> } = {
  ScrollTrigger: () => import('gsap/ScrollTrigger').then((m) => m.ScrollTrigger),
  Flip: () => import('gsap/Flip').then((m) => m.Flip),
  Draggable: () => import('gsap/Draggable').then((m) => m.Draggable),
  InertiaPlugin: () => import('gsap/InertiaPlugin').then((m) => m.InertiaPlugin),
  MorphSVGPlugin: () => import('gsap/MorphSVGPlugin').then((m) => m.MorphSVGPlugin),
  DrawSVGPlugin: () => import('gsap/DrawSVGPlugin').then((m) => m.DrawSVGPlugin),
};

/** Keyed by the sorted, de-duplicated plugin set, so every caller shares one load. */
const loads = new Map<string, Promise<unknown>>();

export function loadGsap<N extends GsapPluginName>(...plugins: N[]): Promise<GsapKit<N> | null> {
  const names = [...new Set(plugins)].sort();
  const key = names.join('|');

  const existing = loads.get(key);
  if (existing) return existing as Promise<GsapKit<N> | null>;

  const pending = (async (): Promise<GsapKit<N> | null> => {
    try {
      const [{ gsap }, ...modules] = await Promise.all([
        import('gsap'),
        ...names.map((name) => LOADERS[name]()),
      ]);

      gsap.registerPlugin(...modules);

      const exports = Object.fromEntries(names.map((name, index) => [name, modules[index]]));
      return { gsap, ...exports } as GsapKit<N>;
    } catch (error) {
      console.warn('[motion] gsap could not be loaded; the page stays static.', error);
      return null;
    }
  })();

  loads.set(key, pending);
  return pending;
}
