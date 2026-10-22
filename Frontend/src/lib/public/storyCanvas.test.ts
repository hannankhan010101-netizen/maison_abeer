import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveTicket } = vi.hoisted(() => ({
  saveTicket: vi.fn(async (_blob: Blob, _name: string) => 'downloaded' as const),
}));
vi.mock('./ticketCanvas', () => ({ saveTicket }));

import { RESULT_COPY } from './quiz';
import { STORY_SIZE, renderStoryCard, saveStory } from './storyCanvas';
import { storyModel } from './storyCard';

const model = storyModel({ kind: 'cake', ...RESULT_COPY.cake, handle: 'maisonabeer' });

/** jsdom has no canvas: a recording stand-in, enough to prove what is drawn. */
function fakeContext() {
  const texts: string[] = [];
  const ctx = new Proxy(
    {
      measureText: (text: string) => ({ width: text.length * 20 }),
      fillText: (text: string) => texts.push(text),
    } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key: string, value) {
        target[key] = value;
        return true;
      },
    },
  );
  return { ctx, texts };
}

describe('storyCanvas', () => {
  let canvasWidth = 0;
  let canvasHeight = 0;

  beforeEach(() => {
    saveTicket.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is Story size', () => {
    expect(STORY_SIZE).toEqual({ width: 1080, height: 1920 });
  });

  it('returns null where there is no 2d context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(renderStoryCard(model)).resolves.toBeNull();
  });

  it('draws the model at 1080 by 1920 and saves it named for the craft', async () => {
    const { ctx, texts } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      canvasWidth = this.width;
      canvasHeight = this.height;
      return ctx as unknown as CanvasRenderingContext2D;
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['png'], { type: 'image/png' })),
    );

    await expect(saveStory(model)).resolves.toBe('downloaded');
    expect([canvasWidth, canvasHeight]).toEqual([1080, 1920]);
    expect(texts).toContain('@maisonabeer');
    expect(texts).toContain('BENTO CAKES');
    expect(texts.join(' ')).not.toMatch(/https?:|undefined|null/);
    expect(saveTicket).toHaveBeenCalledWith(expect.any(Blob), 'maison-cake-vibe.png');
  });

  it('reports a failure when nothing could be drawn', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(saveStory(model)).resolves.toBe('failed');
    expect(saveTicket).not.toHaveBeenCalled();
  });
});
