import { expect, test } from '@playwright/test';

import { CHAT_ENABLED } from './helpers/features';

/**
 * Chat is hidden for now, so the app is only what she manages: Today, the
 * calendar, guests, prep, messages, tags, receipts and settings on the host
 * side, and her workshops on the guest side. Nothing leads to chat and nothing
 * that used to is left broken. (Run with `NEXT_PUBLIC_CHAT_ENABLED=1` and these
 * skip; the chat specs run instead.)
 */

test.skip(CHAT_ENABLED, 'chat is switched on for this run');

test.describe('with chat hidden', () => {
  test('the host navigation has no Chats entry, and Messages is still there', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(page.locator('nav a[href="/chat"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Chats/ })).toHaveCount(0);
    await expect(page.locator('nav a[href="/messages"]').first()).toBeAttached();
  });

  test('the host chat pages send her to Today', async ({ page }) => {
    for (const path of ['/chat', '/chat/broadcast']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/today$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('a guest profile has no private message button', async ({ page }) => {
    await page.goto('/guests');
    await page.locator('a[href^="/guests/"]').first().click({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(page.getByRole('button', { name: /privately/i })).toHaveCount(0);
  });

  test('the guest portal has no Chats tab and no bottom bar', async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('link', { name: /Chats/ })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('the guest chat pages send them to their workshops', async ({ page }) => {
    for (const path of ['/portal/chat', '/portal/chat/some-room']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal$/);
    }
  });
});
