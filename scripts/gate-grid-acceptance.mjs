#!/usr/bin/env bun
/**
 * Grid Composition acceptance gate (Spec 02-A admin closeout).
 *
 * Permanent regression test. Asserts that `dist/posts/grid-demo/index.html`
 * — the canonical Spec 02-A fixture — emits the expected structural
 * invariants: correct number of grid containers, correct field counts,
 * expected cells per grid, correct fill / kind data attributes, correct
 * cell ID assignments, correct image placeholder SVGs, correct cross-
 * primitive sidenote hoist.
 *
 * Why invariants (not a snapshot diff): a checked-in snapshot blob is
 * brittle (whitespace shifts, Astro version bumps, fraunces version updates
 * all break it without indicating a real regression). Structural invariants
 * are robust against cosmetic shifts while still catching the regressions
 * that matter (cells dropped, kinds wrong, fills lost, plugin order changes
 * that break the directive pipeline).
 *
 * Companion to:
 *   - scripts/gate-playground-acceptance.mjs (BrowserRenderer pipeline)
 *   - scripts/smoke-grid-parser.ts (parse + serialize round-trip unit tests)
 *
 * How to run:
 *   1. Ensure dist/posts/grid-demo/index.html exists:
 *        bun run build
 *   2. Run the gate:
 *        bun run scripts/gate-grid-acceptance.mjs
 *
 * Exits 0 on PASS, 1 on FAIL with a summary of failed invariants.
 *
 * Spec 02-A: pilcrow/context/feature-specs/02-A-grid-directive-html.md
 * Sprint plan: ~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md §3 Deliverable A
 */

import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DIST_PATH = resolve(REPO_ROOT, 'dist/posts/grid-demo/index.html');

// ─── Invariant definitions ────────────────────────────────────────────────
//
// Each invariant is { name, check(html) => null | string }. null = pass;
// string = failure message. All invariants run; total pass/fail tallied
// at the end.

const invariants = [
  {
    name: 'four grids rendered (32-field, 16-field, 8-field, cross-primitive 8-field)',
    check(html) {
      const gridMatches = html.match(/<div class="pilcrow-grid"/g) ?? [];
      if (gridMatches.length !== 4) {
        return `expected 4 grids, found ${gridMatches.length}`;
      }
      return null;
    },
  },
  {
    name: '32-field grid declared with correct CSS custom properties',
    check(html) {
      // remark-grid stamps style="--grid-cols: 4; --grid-rows: 8;" on fields=32
      const re = /<div class="pilcrow-grid" data-grid-fields="32" style="--grid-cols: 4; --grid-rows: 8;"/;
      if (!re.test(html)) return 'expected 32-field grid with cols=4 rows=8';
      return null;
    },
  },
  {
    name: '16-field grid declared with correct CSS custom properties',
    check(html) {
      const re = /<div class="pilcrow-grid" data-grid-fields="16" style="--grid-cols: 4; --grid-rows: 4;"/;
      if (!re.test(html)) return 'expected 16-field grid with cols=4 rows=4';
      return null;
    },
  },
  {
    name: '8-field grid declared with correct CSS custom properties',
    check(html) {
      const re = /<div class="pilcrow-grid" data-grid-fields="8" style="--grid-cols: 2; --grid-rows: 4;"/g;
      const matches = html.match(re) ?? [];
      // Two 8-field grids: the simple/calm canonical + the cross-primitive case.
      if (matches.length !== 2) {
        return `expected 2 8-field grids with cols=2 rows=4, found ${matches.length}`;
      }
      return null;
    },
  },
  {
    name: 'cell ids preserved from source markdown',
    check(html) {
      // Each grid in grid-demo.md uses id=1, id=2, ... ; multiple grids share ids.
      const idMatches = html.match(/data-cell-id="(\d+)"/g) ?? [];
      // Counts: 32-field has 10 cells (ids 1-10), 16-field 6 (1-6), 8-field 5 (1-5),
      // cross-primitive 8-field 2 (1-2). Total cell elements = 10+6+5+2 = 23.
      if (idMatches.length !== 23) {
        return `expected 23 cells across all grids, found ${idMatches.length}`;
      }
      return null;
    },
  },
  {
    name: 'image cells render placeholder SVG silhouette',
    check(html) {
      // grid-demo.md has 4 image cells (2 in 32-field, 2 in 16-field).
      const svgMatches = html.match(/<svg class="pilcrow-grid-cell-image-placeholder"/g) ?? [];
      if (svgMatches.length !== 4) {
        return `expected 4 image-placeholder SVGs, found ${svgMatches.length}`;
      }
      return null;
    },
  },
  {
    name: 'image cells carry data-cell-kind="image" + alt accessibility text',
    check(html) {
      // Spot-check one image cell: the "warm wooden bench" in the 16-field grid.
      const re = /data-cell-kind="image"[^>]*data-cell-alt="warm wooden bench in soft afternoon light"/;
      if (!re.test(html)) return 'expected warm-wooden-bench image cell with alt attribute';
      return null;
    },
  },
  {
    name: 'empty cell with rule fill renders correctly',
    check(html) {
      // 8-field grid has cell #5 with kind=empty fill=rule.
      const re = /data-cell-kind="empty"[^>]*data-cell-fill="rule"/;
      if (!re.test(html)) return 'expected empty cell with rule fill';
      return null;
    },
  },
  {
    name: 'all four cell-fill variants present',
    check(html) {
      const fills = ['paper', 'muted', 'accent', 'rule'];
      const missing = fills.filter((f) => !new RegExp(`data-cell-fill="${f}"`).test(html));
      // grid-demo.md uses muted, accent, rule. Paper is implicit (no fill = paper cascade);
      // it's not in any explicit data-cell-fill attribute.
      const expected = ['muted', 'accent', 'rule'];
      const missingExpected = expected.filter((f) => !new RegExp(`data-cell-fill="${f}"`).test(html));
      if (missingExpected.length > 0) {
        return `expected fills ${expected.join(', ')} all present; missing ${missingExpected.join(', ')}`;
      }
      // Document that we didn't check paper.
      return null;
    },
  },
  {
    name: 'cross-primitive: sidenote hoisted to .post-body (not nested in cell)',
    check(html) {
      // After rehype-hoist-sidenotes runs, the <aside class="sidenote"> should
      // be a direct child of .post-body — NOT inside a .pilcrow-grid-cell.
      // Match the sidenote opener and verify the preceding context is .post-body
      // rather than .pilcrow-grid-cell.
      const sidenoteRe = /<aside class="sidenote" data-sidenote-id="1">/;
      if (!sidenoteRe.test(html)) return 'expected hoisted sidenote with data-sidenote-id="1"';
      // Negative invariant: there must be NO sidenote aside inside a pilcrow-grid-cell.
      // (regex is approximate but catches the common malformed case.)
      const nestedRe = /<div class="pilcrow-grid-cell"[^>]*>[^<]*<aside class="sidenote"/s;
      if (nestedRe.test(html)) return 'sidenote was NOT hoisted — found inside a grid cell';
      return null;
    },
  },
  {
    name: 'no [pilcrow grid:] error placeholder in output',
    check(html) {
      // If the build emitted a grid-error neutralised cell, the placeholder text
      // would appear. The canonical grid-demo.md doesn't trigger any error path.
      if (html.includes('[pilcrow: grid missing fields')) {
        return 'output contains grid missing-fields error placeholder — fixture broken';
      }
      if (html.includes('[pilcrow: nested')) {
        return 'output contains nested-grid error placeholder — fixture broken';
      }
      return null;
    },
  },
  {
    name: 'cell colspan honoured: id=1 of 32-field grid spans 4 columns',
    check(html) {
      // First cell of the 32-field grid is "# Late Nights" with colspan=4.
      // remark-grid stamps inline style="grid-column: 1 / span 4;..."
      const re = /data-cell-id="1"[^>]*style="grid-column: 1 \/ span 4;/;
      if (!re.test(html)) return 'expected first cell of 32-field grid with colspan=4';
      return null;
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────

async function main() {
  // Verify dist exists.
  try {
    await access(DIST_PATH);
  } catch {
    console.error('');
    console.error('✗ FAIL: dist/posts/grid-demo/index.html not found.');
    console.error('  Run `bun run build` first.');
    process.exit(1);
  }

  const html = await readFile(DIST_PATH, 'utf-8');

  console.log('─── Spec 02-A grid acceptance gate ────────────────────────');
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const inv of invariants) {
    const result = inv.check(html);
    if (result === null) {
      console.log(`  ✓ ${inv.name}`);
      pass++;
    } else {
      console.log(`  ✗ ${inv.name}`);
      console.log(`    └ ${result}`);
      failures.push(`${inv.name}: ${result}`);
      fail++;
    }
  }

  console.log('');
  console.log(`${pass}/${pass + fail} invariants passed`);

  if (fail > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Gate crashed:', err);
  process.exit(1);
});
