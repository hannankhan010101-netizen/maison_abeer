import { expect, test } from '@playwright/test';

// The plain module, not `MochaToggle`: the pair is written once in
// `styles/themeColor.ts`, and importing it from there keeps React and TSX out
// of Playwright's transform entirely.
import { THEME_COLOR } from '../src/styles/themeColor';

/**
 * Installing to the home screen is an ergonomic feature here, not a checkbox.
 *
 * Standalone display returns roughly 100px of browser chrome on an 812px
 * screen — on an app whose central problem is vertical room — and removes the
 * collapsing toolbar that `dvh` exists to work around, because there is no
 * toolbar left to collapse. Android will not offer the install prompt without
 * a 192 and a 512 icon, so the icons are part of the behaviour, not decoration.
 */

test('the manifest is served and asks for a standalone window', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);

  const manifest = await response.json();

  expect(manifest.display).toBe('standalone');

  // `/`, not `/today`: one manifest is linked from every route, so whichever
  // audience installs it, the launch has to start at the role router. A
  // host-shaped start URL launches guests into the host shell, which is the
  // thing `HostOnly` is there to stop.
  expect(manifest.start_url).toBe('/');

  // Nothing may pin the window to one orientation (WCAG 2.1 AA, SC 1.3.4):
  // portrait keeps the installed app under 1024px and so out of its own
  // desktop layout and print flow.
  expect(manifest.orientation).toBeUndefined();

  expect(manifest.background_color).toBe(THEME_COLOR.light);
});

test('every icon it names actually exists', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();

  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  // Chrome requires both before it will offer to install.
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');

  // And one the launcher may crop to a circle without losing the mark.
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );

  for (const icon of manifest.icons as { src: string }[]) {
    const file = await request.get(icon.src);
    expect(file.status(), `${icon.src} is referenced but not served`).toBe(200);
    expect(file.headers()['content-type']).toContain('image/png');
  }
});

test('the browser chrome follows the chosen theme, not the OS', async ({ page }) => {
  await page.goto('/today');

  const themeColor = () =>
    page.locator('meta[name="theme-color"]').first().getAttribute('content');

  // Written before paint by the init script, so there is no flash of the
  // wrong colour and no window where the tag is missing.
  expect(await page.locator('meta[name="theme-color"]').count()).toBe(1);

  const before = await themeColor();
  await page.getByRole('button', { name: /mocha|light mode/i }).click();
  const after = await themeColor();

  expect(after, 'the status bar colour did not follow the theme').not.toBe(before);
  expect([before, after].sort()).toEqual([THEME_COLOR.mocha, THEME_COLOR.light].sort());
});
