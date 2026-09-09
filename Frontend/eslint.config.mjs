import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // `.next-*` covers the build directories the e2e suite and production
    // builds write to (see `NEXT_DIST_DIR` in next.config.mjs). Without the
    // wildcard, linting the repo means linting generated bundles — over a
    // thousand errors in code nobody wrote.
    ignores: ['.next/**', '.next-*/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    rules: {
      // Unused args are allowed when prefixed with _, which the test tables use.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
