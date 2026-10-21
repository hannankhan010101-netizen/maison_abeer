import { expect, test, type Page } from '@playwright/test';

import { threeCrafts } from './helpers/booking';
import { INVENTORY, STUDIO_HANDLE, type InventoryEntry, type Kind } from './helpers/inventory';

/**
 * Tap everything on the public storefront.
 *
 * The inventory (`e2e/helpers/inventory.ts`) is the list of what may be
 * tapped. This walks the page top to bottom, collects every visible control,
 * and fails on any the inventory does not name; then taps each entry and
 * checks it does what the entry says.
 */

const PAGE = '/book/maison-abeer';

interface Found {
  id: number;
  tag: string;
  name: string;
  href: string | null;
  width: number;
  height: number;
  within: string[];
}

async function stubApi(page: Page) {
  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        studio: { name: 'Maison Abeer', instagram_handle: STUDIO_HANDLE },
        classes: threeCrafts(),
      }),
    }),
  );
}

async function open(page: Page) {
  await stubApi(page);
  await page.goto(PAGE);
  await expect(page.getByRole('heading', { name: 'Maison Abeer', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bento cake decorating/ }).first()).toBeVisible();
}

/** Every control visible right now, each tagged with a stable id. */
async function visibleNow(page: Page, scopes: string[]): Promise<Found[]> {
  return page.evaluate((scopeList) => {
    const w = window as unknown as { __tapNext?: number };
    const nameOf = (el: HTMLElement): string => {
      const label = el.getAttribute('aria-label')?.trim();
      if (label) return label;
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        return by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) return text;
      const img = el.querySelector<HTMLImageElement>('img[alt]');
      if (img?.alt.trim()) return img.alt.trim();
      return (el.getAttribute('title') ?? '').trim();
    };
    const out: Found[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      'a, button, [role="button"], summary',
    )) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (!el.dataset['tapId']) {
        w.__tapNext = (w.__tapNext ?? 0) + 1;
        el.dataset['tapId'] = String(w.__tapNext);
      }
      const role = el.getAttribute('role');
      out.push({
        id: Number(el.dataset['tapId']),
        tag: el.tagName.toLowerCase() + (role ? `[role=${role}]` : ''),
        name: nameOf(el),
        href: el.getAttribute('href'),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        within: scopeList.filter((scope) => el.closest(scope) !== null),
      });
    }
    return out;
  }, scopes);
}

/**
 * Scrolls top to bottom, then through every entry's `reveal`, and returns
 * every control that was visible at some point.
 */
async function collect(page: Page, scopes: string[]): Promise<Found[]> {
  const found = new Map<number, Found>();
  const add = (batch: Found[]) => {
    for (const item of batch) if (!found.has(item.id)) found.set(item.id, item);
  };
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = page.viewportSize()!.height / 2;
  for (let y = 0; y <= height + step; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(150);
    add(await visibleNow(page, scopes));
  }
  const reveals = new Set(INVENTORY.flatMap((entry) => (entry.reveal ? [entry.reveal] : [])));
  for (const reveal of reveals) {
    await reveal(page);
    add(await visibleNow(page, scopes));
  }
  return [...found.values()];
}

function kindFits(kind: Kind, tag: string): boolean {
  return kind === 'anchor' || kind === 'external' ? tag === 'a' : tag !== 'a';
}

function entriesFor(project: string): InventoryEntry[] {
  return INVENTORY.filter(
    (entry) =>
      entry.page === PAGE &&
      (!entry.viewports || entry.viewports.some((viewport) => viewport === project)),
  );
}

function matches(entry: InventoryEntry, item: Found): boolean {
  return (
    kindFits(entry.kind, item.tag) &&
    entry.name.test(item.name) &&
    (!entry.within || item.within.includes(entry.within))
  );
}

function describe(item: Found): string {
  const href = item.href ? ` href="${item.href}"` : '';
  return `<${item.tag}> "${item.name}"${href} (${item.width}x${item.height})`;
}

function title(entry: InventoryEntry): string {
  return `${entry.kind} ${String(entry.name)}${entry.within ? ` in ${entry.within}` : ''}`;
}

const SCOPES = [...new Set(INVENTORY.flatMap((entry) => (entry.within ? [entry.within] : [])))];

test.describe('tap everything on the storefront', () => {
  test('every visible control is in the inventory, and every entry is on the page', async ({
    page,
  }, info) => {
    await open(page);
    const found = await collect(page, SCOPES);
    const entries = entriesFor(info.project.name);

    const nameless = found.filter((item) => item.name === '');
    expect(nameless.map(describe), 'Controls with no accessible name').toEqual([]);

    const unlisted = found.filter((item) => !entries.some((entry) => matches(entry, item)));
    expect(
      unlisted.map(describe),
      'Not in the inventory. Add each to INVENTORY in e2e/helpers/inventory.ts ' +
        'with its kind and what tapping it must do',
    ).toEqual([]);

    const missing = entries.filter((entry) => !found.some((item) => matches(entry, item)));
    expect(
      missing.map(title),
      'Inventory entries with no element on the page (stale, or the control went missing)',
    ).toEqual([]);
  });

  for (const entry of INVENTORY) {
    test(`${title(entry)} does what the inventory says`, async ({ page }, info) => {
      test.skip(!entriesFor(info.project.name).includes(entry), 'not on this page or viewport');
      await open(page);
      if (entry.reveal) await entry.reveal(page);

      const scope = entry.within ? page.locator(entry.within) : page;
      const role = entry.kind === 'anchor' || entry.kind === 'external' ? 'link' : 'button';
      const all = scope.getByRole(role, { name: entry.name });
      await expect(all.first()).toBeAttached();
      const count = await all.count();

      // Every match: a 44 px hit area, measured focused so the skip link is on screen.
      const small: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const el = all.nth(i);
        if (!(await el.isVisible())) continue;
        await el.focus();
        const box = await el.boundingBox();
        if (!box || box.width < 43.5 || box.height < 43.5) {
          small.push(`"${(await el.textContent())?.trim() ?? ''}" ${box?.width}x${box?.height}`);
        }
      }
      if (entry.knownIssue && small.length > 0) {
        info.annotations.push({
          type: 'known issue',
          description: `${entry.knownIssue}: ${small.join(', ')}`,
        });
      } else {
        expect(small, 'Controls with a hit area under 44 x 44 px').toEqual([]);
      }

      if (entry.kind === 'external') {
        const want = entry.href?.(STUDIO_HANDLE) ?? null;
        expect(want, 'the inventory builds a URL for this link').not.toBeNull();
        for (let i = 0; i < count; i += 1) {
          await expect(all.nth(i)).toHaveAttribute('href', want ?? '');
          await expect(all.nth(i)).toHaveAttribute('target', '_blank');
          await expect(all.nth(i)).toHaveAttribute('rel', /noopener/);
        }
        return;
      }

      if (entry.kind === 'anchor') {
        const id = entry.target ?? '';
        const target = page.locator(`#${id}`);
        await expect(target, `#${id} exists once`).toHaveCount(1);
        for (let i = 0; i < count; i += 1) {
          await expect(all.nth(i)).toHaveAttribute('href', `#${id}`);
        }
        await all.first().focus();
        await page.keyboard.press('Enter');
        await expect(target).toBeInViewport();
        return;
      }

      if (entry.kind === 'toggle') {
        // Pinned by a marker: a locator on aria-pressed="false" would move on after the tap.
        await all
          .and(page.locator('[aria-pressed="false"]'))
          .first()
          .evaluate((el) => el.setAttribute('data-tap-probe', ''));
        const off = page.locator('[data-tap-probe]');
        await off.scrollIntoViewIfNeeded();
        await off.click();
        await expect(off).toHaveAttribute('aria-pressed', 'true');
        return;
      }

      expect(entry.outcome, 'a button entry says what a tap must do').toBeDefined();
      const first = all.first();
      await first.scrollIntoViewIfNeeded();
      await first.click();
      await entry.outcome?.(page);
    });
  }
});
