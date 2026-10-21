import { describe, expect, it, vi } from 'vitest';

import { computeTier, createFrameMonitor, type TierSignals } from './tier';

const desktop: TierSignals = {
  reducedMotion: false,
  saveData: false,
  slowConnection: false,
  deviceMemory: 8,
  cores: 8,
};

describe('computeTier', () => {
  it.each<[string, Partial<TierSignals>, 0 | 1 | 2]>([
    ['a capable desktop', {}, 2],
    ['unknown memory and cores', { deviceMemory: undefined, cores: undefined }, 2],
    ['reduced motion', { reducedMotion: true }, 0],
    ['save-data', { saveData: true }, 0],
    ['a slow connection', { slowConnection: true }, 0],
    ['reduced motion on a weak phone', { reducedMotion: true, deviceMemory: 1 }, 0],
    ['2 GB of memory', { deviceMemory: 2 }, 1],
    ['4 GB of memory', { deviceMemory: 4 }, 2],
    ['4 cores', { cores: 4 }, 1],
    ['6 cores', { cores: 6 }, 2],
    ['low frame rate', { lowFps: true }, 1],
    ['low frame rate and save-data', { lowFps: true, saveData: true }, 0],
  ])('%s gives tier %i', (_label, overrides, tier) => {
    expect(computeTier({ ...desktop, ...overrides })).toBe(tier);
  });
});

/** A requestAnimationFrame stand-in driven by hand at a fixed frame rate. */
function fakeRaf() {
  let next = 1;
  const pending = new Map<number, (t: number) => void>();
  let now = 0;
  const raf = vi.fn((cb: (t: number) => void) => {
    const id = next++;
    pending.set(id, cb);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    pending.delete(id);
  });
  function run(ms: number, fps: number) {
    const step = 1000 / fps;
    const end = now + ms;
    while (now < end - 1e-9) {
      now += step;
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb(now);
    }
  }
  return { raf, cancel, run, pending };
}

describe('createFrameMonitor', () => {
  it('never reports a steady 60 fps', () => {
    const clock = fakeRaf();
    const onLow = vi.fn();
    createFrameMonitor({ raf: clock.raf, cancel: clock.cancel, onLow }).start();
    clock.run(5000, 60);
    expect(onLow).not.toHaveBeenCalled();
  });

  it('reports 30 fps once, after one window', () => {
    const clock = fakeRaf();
    const onLow = vi.fn();
    createFrameMonitor({ raf: clock.raf, cancel: clock.cancel, onLow }).start();
    clock.run(900, 30);
    expect(onLow).not.toHaveBeenCalled();
    clock.run(300, 30);
    expect(onLow).toHaveBeenCalledTimes(1);
    clock.run(5000, 30);
    expect(onLow).toHaveBeenCalledTimes(1);
    expect(clock.pending.size).toBe(0);
  });

  it('honours a custom window and threshold', () => {
    const clock = fakeRaf();
    const onLow = vi.fn();
    createFrameMonitor({
      raf: clock.raf,
      cancel: clock.cancel,
      onLow,
      windowMs: 500,
      lowFps: 65,
    }).start();
    clock.run(600, 60);
    expect(onLow).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels the pending frame', () => {
    const clock = fakeRaf();
    const onLow = vi.fn();
    const monitor = createFrameMonitor({ raf: clock.raf, cancel: clock.cancel, onLow });
    monitor.start();
    clock.run(200, 30);
    monitor.stop();
    expect(clock.cancel).toHaveBeenCalled();
    expect(clock.pending.size).toBe(0);
    clock.run(5000, 30);
    expect(onLow).not.toHaveBeenCalled();
  });
});
