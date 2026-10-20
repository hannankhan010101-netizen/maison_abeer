import { expect, test } from '@playwright/test';

/**
 * The typefaces really load.
 *
 * Unit tests can show the tokens point at the right variables; only a browser
 * can show the font files were fetched, parsed and used. They are self-hosted
 * (`src/fonts`), so a wrong path or a corrupt file shows up here as a face that
 * never reaches `loaded` — and the page quietly sets itself in a system font.
 *
 * Deliberately not `document.fonts.check()`: it returns true when *no* face
 * matches the family at all, so a font that was never registered would pass.
 * This looks for a face with that family whose status is `loaded`.
 *
 * `/login` needs no API and sets text in all three roles.
 */

const VARIABLES = ['--font-display-loaded', '--font-body-loaded', '--font-hand-loaded'] as const;

test('the display, body and handwriting faces are loaded and in use', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => document.fonts.ready);

  const report = await page.evaluate((variables) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const unquote = (value: string) => value.trim().replace(/^['"]|['"]$/g, '');

    return variables.map((variable) => {
      // next/font defines `'Real Family', 'Fallback Family'`; the real one leads.
      const family = unquote(rootStyle.getPropertyValue(variable).split(',')[0] ?? '');
      const loaded = [...document.fonts].some(
        (face) => unquote(face.family) === family && face.status === 'loaded',
      );

      return { variable, family, loaded };
    });
  }, VARIABLES);

  for (const entry of report) {
    expect(entry.family, `${entry.variable} is empty`).not.toBe('');
    // A fallback face is the sign the real file was never wired in.
    expect(entry.family, `${entry.variable} names a fallback`).not.toMatch(/fallback/i);
    expect(entry.loaded, `${entry.family} has no face that reached "loaded"`).toBe(true);
  }

  // And the page uses them: the body's computed family leads with the loaded one.
  const bodyFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(bodyFamily.split(',')[0]!.replace(/['"]/g, '').trim()).toBe(report[1]!.family);
});
