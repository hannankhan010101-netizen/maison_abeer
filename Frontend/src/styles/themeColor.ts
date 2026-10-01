/**
 * The browser chrome's colour, per theme.
 *
 * `--color-buttercream` in each theme's own value. It is duplicated out of
 * tokens.css because the pre-paint script in `MochaToggle` has to set it
 * before any stylesheet has been parsed, and because `app/manifest.ts` is
 * serialised to JSON where a `var()` means nothing.
 *
 * It sits here rather than in the toggle so that the manifest, and the tests
 * that hold this against tokens.css, can read it without importing a client
 * component. `tokens.test.ts` asserts both values still match the stylesheet.
 */
export const THEME_COLOR = { light: '#FFF8F0', mocha: '#221A15' } as const;
