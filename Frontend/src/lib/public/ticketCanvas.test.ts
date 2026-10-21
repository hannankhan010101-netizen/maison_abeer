import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TICKET_SIZE, saveTicket } from './ticketCanvas';

const blob = new Blob(['png'], { type: 'image/png' });
const FILENAME = 'bento-cake-ticket.png';

let clicked: HTMLAnchorElement[] = [];
const createObjectURL = vi.fn(() => 'blob:ticket');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  clicked = [];
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

function stubShare(share: (data: ShareData) => Promise<void>, canShare = true) {
  Object.defineProperty(navigator, 'share', { value: vi.fn(share), configurable: true });
  Object.defineProperty(navigator, 'canShare', {
    value: vi.fn(() => canShare),
    configurable: true,
  });
}

describe('saveTicket', () => {
  it('is 1080 by 1350', () => {
    expect(TICKET_SIZE).toEqual({ width: 1080, height: 1350 });
  });

  it('shares the file when the browser can share files', async () => {
    stubShare(async () => {});
    await expect(saveTicket(blob, FILENAME)).resolves.toBe('shared');
    const data = vi.mocked(navigator.share).mock.calls[0]![0]!;
    expect(data.files).toHaveLength(1);
    expect(data.files![0]!.name).toBe(FILENAME);
    expect(data.files![0]!.type).toBe('image/png');
    expect(clicked).toHaveLength(0);
  });

  it('treats a dismissed share sheet as cancelled, without downloading', async () => {
    stubShare(async () => {
      throw new DOMException('dismissed', 'AbortError');
    });
    await expect(saveTicket(blob, FILENAME)).resolves.toBe('cancelled');
    expect(clicked).toHaveLength(0);
  });

  it('downloads when files cannot be shared', async () => {
    await expect(saveTicket(blob, FILENAME)).resolves.toBe('downloaded');
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe(FILENAME);
    expect(clicked[0]!.href).toBe('blob:ticket');
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:ticket'));
  });

  it('downloads when canShare says no', async () => {
    stubShare(async () => {}, false);
    await expect(saveTicket(blob, FILENAME)).resolves.toBe('downloaded');
    expect(navigator.share).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(1);
  });

  it('falls back to the download on any other share error', async () => {
    stubShare(async () => {
      throw new DOMException('nope', 'NotAllowedError');
    });
    await expect(saveTicket(blob, FILENAME)).resolves.toBe('downloaded');
    expect(clicked).toHaveLength(1);
  });

  it('never mentions the portal token', () => {
    const source = readFileSync(join(__dirname, 'ticketCanvas.ts'), 'utf8');
    expect(source).not.toMatch(/portal_token|portalToken/);
  });
});
