import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * No dead controls in the source.
 *
 * A link to `#`, a click handler that does nothing, or an `<a>` with nowhere
 * to go all look tappable and do nothing when tapped. This reads every
 * non-test `.tsx` under `src` and fails on any of them. An in-page anchor
 * (`href="#booking-widget"`) is allowed only when some file in `src` gives an
 * element that `id`.
 *
 * The checks are textual on purpose: no parser dependency, and the self-tests
 * below prove each one catches what it is for.
 */

const SRC = join(__dirname, '..', '..');

interface Finding {
  rule: string;
  line: number;
  text: string;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** The opening `<a ...>` tags, walked by hand so `=>` inside `{...}` does not end them. */
function anchorTags(source: string): { index: number; tag: string }[] {
  const tags: { index: number; tag: string }[] = [];
  const start = /<a(?=[\s>/])/g;
  for (let match = start.exec(source); match; match = start.exec(source)) {
    let depth = 0;
    let quote: string | null = null;
    let i = match.index + 2;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
      } else if (ch === '>' && depth === 0) {
        break;
      }
    }
    tags.push({ index: match.index, tag: source.slice(match.index, i + 1) });
  }
  return tags;
}

export function findDeadControls(source: string, knownIds: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, index: number, text: string) =>
    findings.push({ rule, line: lineOf(source, index), text: text.trim() });

  const patterns: [string, RegExp][] = [
    ['href="#"', /href=(?:"#"|'#'|\{\s*["'`]#["'`]\s*\})/g],
    ['empty onClick', /onClick=\{\s*\(\s*[a-z_]*\s*\)\s*=>\s*\{\s*\}\s*\}/gi],
    ['onClick={undefined}', /onClick=\{\s*undefined\s*\}/g],
  ];
  for (const [rule, pattern] of patterns) {
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      add(rule, match.index, match[0]);
    }
  }

  for (const { index, tag } of anchorTags(source)) {
    // A spread may carry the href; a component wrapping `<a {...props}>` is checked at its call site.
    if (!/\shref=/.test(tag) && !/\{\s*\.\.\./.test(tag)) add('<a> with no href', index, tag);
  }

  const inPage = /href=["']#([\w-]+)["']/g;
  for (let match = inPage.exec(source); match; match = inPage.exec(source)) {
    if (!knownIds.has(match[1] ?? '')) add('in-page anchor to a missing id', match.index, match[0]);
  }

  return findings;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

function idsIn(sources: string[]): Set<string> {
  const ids = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/\bid=["']([\w-]+)["']/g)) ids.add(match[1] ?? '');
  }
  return ids;
}

describe('dead controls', () => {
  const ids = new Set(['main', 'booking-widget']);

  it('catches a link to "#"', () => {
    expect(findDeadControls('<a href="#">x</a>', ids).map((f) => f.rule)).toEqual(['href="#"']);
    expect(findDeadControls("<a href='#'>x</a>", ids).map((f) => f.rule)).toEqual(['href="#"']);
  });

  it('catches a click handler that does nothing', () => {
    const found = findDeadControls('<button onClick={() => {}}>x</button>', ids);
    expect(found.map((f) => f.rule)).toEqual(['empty onClick']);
  });

  it('catches onClick={undefined}', () => {
    const found = findDeadControls('<button onClick={undefined}>x</button>', ids);
    expect(found.map((f) => f.rule)).toEqual(['onClick={undefined}']);
  });

  it('catches an <a> with no href, even with an arrow function inside the tag', () => {
    const found = findDeadControls(
      'const x = (\n  <a className="link" onClick={() => go(1)}>\n    x\n  </a>\n);',
      ids,
    );
    expect(found).toEqual([
      { rule: '<a> with no href', line: 2, text: expect.stringContaining('<a className') },
    ]);
  });

  it('allows an in-page anchor whose id exists, and catches one whose id does not', () => {
    expect(findDeadControls('<a href="#booking-widget">Book</a>', ids)).toEqual([]);
    expect(findDeadControls('<a href="#nowhere">x</a>', ids).map((f) => f.rule)).toEqual([
      'in-page anchor to a missing id',
    ]);
  });

  it('leaves working controls and other tags alone', () => {
    const fine =
      '<a href="/book">x</a><a {...props} /><abbr title="t">t</abbr><aside />' +
      '<button onClick={() => setOpen(true)}>x</button><button onClick={onOpen}>y</button>';
    expect(findDeadControls(fine, ids)).toEqual([]);
  });

  it('finds none in the source', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(20);
    const sources = files.map((file) => readFileSync(file, 'utf8'));
    const known = idsIn(sources);
    const report = files.flatMap((file, i) =>
      findDeadControls(sources[i] ?? '', known).map(
        (f) => `${relative(SRC, file)}:${f.line} ${f.rule}: ${f.text}`,
      ),
    );
    expect(report).toEqual([]);
  });
});
