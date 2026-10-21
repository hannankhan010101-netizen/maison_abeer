import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { stubClass, threeCrafts, type StubClass } from './helpers/booking';

/**
 * The memory wall, in a real browser.
 *
 * The real payload has no `memories` or `words` today, so this spec supplies
 * its own — the shape of `helpers/booking.ts`, plus the two optional lists.
 * What it guards is mostly honesty (the wall says "memories" only when the
 * studio sent some), and that a keyboard can open and leave a photo.
 */

test.describe.configure({ timeout: 120_000 });

interface Memory {
  id: string;
  photo_url: string;
  caption: string;
  craft: 'pottery' | 'cake' | 'painting' | null;
}

const PIXEL = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');

function memories(n: number, caption = (i: number) => `memory number ${i}`): Memory[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    photo_url: `https://photos.test/m${i}.gif`,
    caption: caption(i),
    craft: i % 2 === 0 ? 'pottery' : 'cake',
  }));
}

async function stub(
  page: Page,
  extra: { memories?: Memory[]; words?: { id: string; word: string }[] } = {},
  classes: StubClass[] = threeCrafts(),
) {
  await page.route('https://photos.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL }),
  );
  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes,
        ...extra,
      }),
    }),
  );
}

async function openWall(page: Page) {
  await page.goto('/book/maison-abeer');
  const wall = page.locator('.memory-wall');
  await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeVisible();
  await wall.scrollIntoViewIfNeeded();
  return wall;
}

test.describe('what the wall says it is', () => {
  test('with no studio memories it shows craft photography as what you will make', async ({
    page,
  }) => {
    await stub(page);
    const wall = await openWall(page);

    await expect(wall.getByRole('heading', { name: "What you'll make here" })).toBeVisible();
    await expect(page.getByText('Memories from the studio')).toHaveCount(0);
    expect(await wall.locator('.memory-tile').count()).toBeGreaterThan(0);
  });

  for (const count of [1, 2, 12]) {
    test(`with ${count} studio memories it shows only those`, async ({ page }) => {
      await stub(page, { memories: memories(count) });
      const wall = await openWall(page);

      await expect(wall.getByRole('heading', { name: 'Memories from the studio' })).toBeVisible();
      await expect(wall.locator('.memory-tile')).toHaveCount(Math.min(count, 8));
      await expect(wall.locator('img[src*="/studio/"]')).toHaveCount(0);
      // Two memories of two crafts: chips; one memory: none.
      await expect(wall.getByRole('button', { name: 'Pottery' })).toHaveCount(count > 1 ? 1 : 0);
    });
  }

  test('a studio of one craft gets no filter chips', async ({ page }) => {
    await stub(page, {}, [stubClass()]);
    const wall = await openWall(page);
    await expect(wall.locator('.memory-tile').first()).toBeVisible();
    await expect(wall.getByRole('group', { name: /Filter/ })).toHaveCount(0);
  });

  test('there is no word wall without approved words, and one with them', async ({ page }) => {
    await stub(page, { memories: memories(2) });
    const wall = await openWall(page);
    await expect(wall.getByRole('list', { name: 'Words from guests' })).toHaveCount(0);

    await stub(page, { memories: memories(2), words: [{ id: 'w1', word: 'joyful' }] });
    await page.reload();
    await expect(page.getByRole('list', { name: 'Words from guests' })).toBeAttached();
  });
});

test.describe('filtering', () => {
  test('a chip hides the other crafts', async ({ page }) => {
    await stub(page, { memories: memories(6) });
    const wall = await openWall(page);

    await wall.getByRole('button', { name: 'Cake' }).click();

    await expect(wall.getByRole('button', { name: 'Cake' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(wall.locator('.memory-tile[data-craft="pottery"]').first()).toBeHidden();
    await expect(wall.locator('.memory-tile[data-craft="cake"]').first()).toBeVisible();
  });
});

test.describe('hearts', () => {
  test('a heart is kept across a reload and carries no number', async ({ page }) => {
    await stub(page, { memories: memories(2) });
    const wall = await openWall(page);

    const heart = wall.getByRole('button', { name: /^Keep/ }).first();
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(await heart.innerText()).not.toMatch(/\d/);

    await page.reload();
    await expect(page.getByRole('button', { name: /^Keep/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('the lightbox, from the keyboard alone', () => {
  test('opens, pages, closes, and returns focus to the tile', async ({ page }) => {
    await stub(page, { memories: memories(3) });
    const wall = await openWall(page);

    const tile = wall.getByRole('button', { name: 'memory number 1', exact: true });
    await tile.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('memory number 1')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText('memory number 2')).toBeVisible();

    // Tab stays inside the dialog.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    );

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(wall.getByRole('button', { name: 'memory number 2', exact: true })).toBeFocused();
  });

  // The browser's view-transition overlay swallows a real pointer for the length
  // of the animation, so a hurried second tap is simulated with a dispatched
  // click (what a quick tap or a switch device delivers once it gets through).
  // These are a smoke test of focus, not a proof of the race: removing the fix does not turn
  // them red (MemoryWall.test.tsx holds that proof, with a controllable transition). Nothing
  // shorter than 150ms: on a busy machine the first dialog is still up and the tap is
  // rightly ignored, which fails the test for a reason that is not a bug.
  for (const delay of [150, 300, 500]) {
    test(`opening another photo ${delay}ms after closing keeps focus in the dialog`, async ({
      page,
    }) => {
      await stub(page, { memories: memories(3) });
      const wall = await openWall(page);

      await wall.getByRole('button', { name: 'memory number 0', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(delay);
      await wall
        .getByRole('button', { name: 'memory number 1', exact: true })
        .dispatchEvent('click');
      await expect(page.getByRole('dialog')).toBeVisible();

      // Let the first close's animation finish; it must not pull focus out, and
      // the second photo is still open.
      await page.waitForTimeout(1200);
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
        true,
      );
    });
  }

  test('one photo has no navigation', async ({ page }) => {
    await stub(page, { memories: memories(1) });
    const wall = await openWall(page);
    await wall.getByRole('button', { name: 'memory number 0', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Next photo' })).toHaveCount(0);
  });
});

test.describe('layout', () => {
  test('a very long caption and a crowded wall never scroll sideways', async ({ page }) => {
    await stub(page, {
      memories: memories(12, (i) =>
        i === 0 ? 'w'.repeat(300) : `a long-ish caption ${i} `.repeat(4),
      ),
      words: [{ id: 'w1', word: 'x'.repeat(80) }],
    });
    const wall = await openWall(page);
    await expect(wall.locator('.memory-tile').first()).toBeVisible();

    await wall.getByRole('button', { name: 'w'.repeat(300), exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`axe passes on the wall, with and without a lightbox (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await stub(page, { memories: memories(4), words: [{ id: 'w1', word: 'joyful' }] });
    const wall = await openWall(page);
    // The wall reveals as it scrolls in, and zero-opacity text fails contrast.
    await expect(wall.locator('.memory-tile').first()).toBeVisible();
    await page.waitForTimeout(1000);

    const check = async () =>
      (
        await new AxeBuilder({ page })
          .include('.memory-wall')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations;

    expect(await check()).toEqual([]);

    await wall.getByRole('button', { name: 'memory number 0', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const lightbox = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(lightbox.violations).toEqual([]);
  });
}
