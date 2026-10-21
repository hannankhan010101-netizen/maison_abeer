import { act, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MotionTier } from './tier';

type Listener = () => void;

/** A controllable prefers-reduced-motion query. */
function installMatchMedia(reduced: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: reduced,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return {
    set(next: boolean) {
      query.matches = next;
      for (const cb of [...listeners]) cb();
    },
  };
}

function setNavigator(values: {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(navigator, key, { value, configurable: true });
  }
}

/** requestAnimationFrame driven by hand. */
function installRaf() {
  let next = 1;
  let now = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      pending.set(next, cb);
      return next++;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => pending.delete(id)),
  );
  return {
    run(ms: number, fps: number) {
      const end = now + ms;
      while (now < end - 1e-9) {
        now += 1000 / fps;
        const due = [...pending.values()];
        pending.clear();
        for (const cb of due) cb(now);
      }
    },
  };
}

async function load() {
  vi.resetModules();
  return (await import('./useMotionTier')).useMotionTier;
}

async function mount() {
  const useMotionTier = await load();
  const seen: MotionTier[] = [];
  function Probe() {
    const tier = useMotionTier();
    seen.push(tier);
    return <span data-tier={tier} />;
  }
  const view = render(<Probe />);
  const current = () => Number(view.container.querySelector('span')?.getAttribute('data-tier'));
  return { seen, current, view, useMotionTier };
}

beforeEach(() => {
  setNavigator({ deviceMemory: 8, hardwareConcurrency: 8, connection: { effectiveType: '4g' } });
  installRaf();
  delete document.documentElement.dataset.motionTier;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMotionTier', () => {
  it('renders 0 on the server', async () => {
    installMatchMedia(false);
    const useMotionTier = await load();
    function Probe() {
      return <span>{useMotionTier()}</span>;
    }
    expect(renderToString(<Probe />)).toBe('<span>0</span>');
  });

  it('starts at 0 and settles at 2 on a desktop-like device', async () => {
    installMatchMedia(false);
    const { seen, current } = await mount();
    expect(seen[0]).toBe(0);
    expect(current()).toBe(2);
    expect(document.documentElement.dataset.motionTier).toBe('2');
  });

  it('stays 0 with reduced motion, and drops to 0 when it is switched on live', async () => {
    const media = installMatchMedia(true);
    const first = await mount();
    expect(first.current()).toBe(0);
    expect(document.documentElement.dataset.motionTier).toBe('0');
    first.view.unmount();

    media.set(false);
    const second = await mount();
    expect(second.current()).toBe(2);
    act(() => media.set(true));
    expect(second.current()).toBe(0);
    expect(document.documentElement.dataset.motionTier).toBe('0');
  });

  it('settles at 1 on a weak device, and 0 on save-data', async () => {
    installMatchMedia(false);
    setNavigator({ deviceMemory: 2 });
    const weak = await mount();
    expect(weak.current()).toBe(1);
    weak.view.unmount();

    setNavigator({ deviceMemory: 8, connection: { saveData: true } });
    const saver = await mount();
    expect(saver.current()).toBe(0);
  });

  it('drops 2 to 1 on low fps and never steps back up', async () => {
    const media = installMatchMedia(false);
    const raf = installRaf();
    const { current } = await mount();
    expect(current()).toBe(2);

    act(() => raf.run(1200, 30));
    expect(current()).toBe(1);
    expect(document.documentElement.dataset.motionTier).toBe('1');

    act(() => raf.run(3000, 60));
    act(() => {
      media.set(true);
      media.set(false);
    });
    expect(current()).toBe(0);
    expect(document.documentElement.dataset.motionTier).toBe('0');
  });

  it('keeps a steady 60 fps at 2', async () => {
    installMatchMedia(false);
    const raf = installRaf();
    const { current } = await mount();
    act(() => raf.run(5000, 60));
    expect(current()).toBe(2);
  });
});
