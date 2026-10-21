#!/usr/bin/env node
/**
 * The exact First Load JS of one App Router page, against a budget.
 *
 *   node scripts/check-first-load.mjs <distDir> <pageKey> <baselineKb> <toleranceKb>
 *
 * The number is the gzip (level 6) size of every distinct `.js` file listed
 * for `<pageKey>` in `<distDir>/app-build-manifest.json`, summed, in KiB
 * (bytes / 1024, as the baseline was measured). Next's own build table rounds
 * to whole kB ("139 kB"), too coarse to catch a 0.5 KiB creep; this is not
 * rounded.
 *
 * Exit 0 within baseline + tolerance, 1 over it, 2 when the manifest or the
 * page is missing. The number is printed either way.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

const [distDir, pageKey, baselineArg, toleranceArg] = process.argv.slice(2);
if (!distDir || !pageKey || baselineArg === undefined || toleranceArg === undefined) {
  fail(2, 'usage: check-first-load.mjs <distDir> <pageKey> <baselineKb> <toleranceKb>');
}
const baseline = Number(baselineArg);
const tolerance = Number(toleranceArg);
if (!Number.isFinite(baseline) || !Number.isFinite(tolerance)) {
  fail(2, `baseline and tolerance must be numbers, got "${baselineArg}" and "${toleranceArg}"`);
}

const manifestPath = join(distDir, 'app-build-manifest.json');
if (!existsSync(manifestPath)) fail(2, `no ${manifestPath}: build first (next build)`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const files = manifest.pages?.[pageKey];
if (!Array.isArray(files)) {
  const known = Object.keys(manifest.pages ?? {}).join(', ');
  fail(2, `page "${pageKey}" is not in ${manifestPath}. Pages: ${known}`);
}

const scripts = [...new Set(files.filter((file) => file.endsWith('.js')))];
let bytes = 0;
for (const file of scripts) {
  bytes += gzipSync(readFileSync(join(distDir, file)), { level: 6 }).length;
}

const kb = bytes / 1024;
const limit = baseline + tolerance;
const line = `${pageKey}: First Load JS ${kb.toFixed(2)} KiB (${bytes} bytes gzip, ${scripts.length} files); budget ${baseline.toFixed(2)} + ${tolerance.toFixed(2)} = ${limit.toFixed(2)} KiB`;

if (kb > limit) {
  fail(1, `${line}\nOVER the budget by ${(kb - limit).toFixed(2)} KiB`);
}
console.log(`${line}\nwithin the budget (${(limit - kb).toFixed(2)} KiB to spare)`);
