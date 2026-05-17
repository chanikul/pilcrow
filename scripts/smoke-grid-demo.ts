#!/usr/bin/env bun
/**
 * smoke-grid-demo.ts — Playwright smoke test for /posts/grid-demo/
 *
 * Verifies that the three concrete bugs fixed in 2026-05-17 do not regress:
 *
 *   Bug 1 — No raw ::sidenote delimiters in body text.
 *            The sidenote in the cross-primitive cell must be hoisted cleanly
 *            so no literal ":::sidenote" or "::sidenote" text is visible outside
 *            inline <code> elements.
 *
 *   Bug 2 — No clipped captions in grid cells.
 *            Checks that no .pilcrow-grid-cell with overflow: hidden has
 *            scrollWidth > clientWidth (caption-clip detector).
 *            Root cause was `contain: layout` on .pilcrow-grid-cell preventing
 *            CSS Grid's auto-row track from seeing cell content height.
 *
 *   Bug 3 — 32-field section heading matches rendered cell count.
 *            The heading now reads "editorial, sparse"; the lede explains
 *            deliberate sparseness. Smoke asserts the grid has exactly 10 cells.
 *
 * Also asserts:
 *   - At least one <aside class="sidenote"> is present in the page body
 *     (confirms hoist ran for the cross-primitive case).
 *
 * Run: bun run scripts/smoke-grid-demo.ts
 *   Requires preview server on :4321 (bun run preview) serving a fresh build.
 */

import { chromium } from 'playwright';

const PREVIEW_URL = 'http://localhost:4321/posts/grid-demo/';
const TIMEOUT_MS = 20_000;

let passed = 0;
let failed = 0;

function pass(msg: string): void {
  console.log(`  PASS  ${msg}`);
  passed++;
}

function fail(msg: string): void {
  console.error(`  FAIL  ${msg}`);
  failed++;
}

function assert(condition: boolean, message: string): void {
  if (condition) pass(message);
  else fail(message);
}

async function main(): Promise<void> {
  console.log('\nGrid demo smoke test');
  console.log(`  Target: ${PREVIEW_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);

  // Set a 1200px viewport so the sidenote layout (requires ≥1100px) is active.
  await page.setViewportSize({ width: 1200, height: 900 });

  try {
    // ── Navigate ──────────────────────────────────────────────────────────────
    console.log('1. Navigate to /posts/grid-demo/');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });

    // ── Bug 1: No raw sidenote delimiters outside <code> ─────────────────────
    console.log('\n2. Bug 1 — No raw ::sidenote delimiters in rendered body');

    // Evaluate in the browser to find text nodes containing "::sidenote" that
    // are NOT inside a <code> element. The prose explanation uses inline <code>
    // to document the syntax — those are acceptable. Bare text nodes with the
    // delimiter are the bug signal.
    const rawSidenoteCount = await page.evaluate((): number => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node): number {
            // Skip nodes inside <code> elements.
            if (node.parentElement?.closest('code')) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );
      let count = 0;
      let textNode: Node | null;
      while ((textNode = walker.nextNode()) !== null) {
        const text = (textNode as Text).textContent ?? '';
        if (text.includes('::sidenote')) count++;
      }
      return count;
    });

    assert(
      rawSidenoteCount === 0,
      `No raw ::sidenote text nodes in body (found ${rawSidenoteCount})`,
    );

    // ── Bug 1b: Hoisted sidenote aside is present ─────────────────────────────
    const sidenoteAsideCount = await page.evaluate((): number => {
      return document.querySelectorAll('aside.sidenote, [class~="sidenote"]').length;
    });

    assert(
      sidenoteAsideCount >= 1,
      `At least one hoisted aside.sidenote present (found ${sidenoteAsideCount})`,
    );

    // ── Bug 2: No clipped captions in grid cells ──────────────────────────────
    console.log('\n3. Bug 2 — No caption clipping in .pilcrow-grid-cell');

    // Detect clipping: for each .pilcrow-grid-cell, check if scrollWidth
    // exceeds clientWidth when the cell has overflow:hidden or overflow:clip.
    // The bug was caused by `contain: layout` preventing auto-row sizing, which
    // caused cell content to overflow vertically (not horizontally). We check
    // both axes: scrollWidth > clientWidth (horizontal) and
    // scrollHeight > clientHeight (vertical).
    //
    // Exception: image cells intentionally use overflow:hidden to clip the
    // placeholder SVG — only TEXT cells are checked for vertical overflow.
    const clippedCells = await page.evaluate((): Array<{ id: string; kind: string; sw: number; cw: number; sh: number; ch: number }> => {
      const cells = document.querySelectorAll<HTMLElement>('.pilcrow-grid-cell');
      const clipped: Array<{ id: string; kind: string; sw: number; cw: number; sh: number; ch: number }> = [];
      cells.forEach((cell) => {
        const kind = cell.dataset['cellKind'] ?? 'text';
        const id = cell.dataset['cellId'] ?? '?';
        // Only check text cells for vertical overflow (image cells clip by design).
        if (kind !== 'text') return;
        const sw = cell.scrollWidth;
        const cw = cell.clientWidth;
        const sh = cell.scrollHeight;
        const ch = cell.clientHeight;
        if (sw > cw + 2 || sh > ch + 2) {
          // +2px tolerance for sub-pixel rounding.
          clipped.push({ id, kind, sw, cw, sh, ch });
        }
      });
      return clipped;
    });

    assert(
      clippedCells.length === 0,
      `No text .pilcrow-grid-cell has clipped content (checked scrollWidth vs clientWidth + scrollHeight vs clientHeight)`,
    );

    if (clippedCells.length > 0) {
      console.error('    Clipped cells:');
      for (const c of clippedCells) {
        console.error(`      cell #${c.id} (${c.kind}): scrollWidth=${c.sw} clientWidth=${c.cw}, scrollHeight=${c.sh} clientHeight=${c.ch}`);
      }
    }

    // ── Bug 3: 32-field section has exactly 10 cells ──────────────────────────
    console.log('\n4. Bug 3 — 32-field section heading matches cell count');

    // Confirm the heading text is the updated "editorial, sparse" version.
    const headingText = await page.evaluate((): string => {
      const headings = Array.from(document.querySelectorAll('h2'));
      const thirtyTwo = headings.find((h) => h.textContent?.toLowerCase().includes('thirty-two'));
      return thirtyTwo?.textContent?.trim() ?? '';
    });

    assert(
      headingText.includes('editorial, sparse'),
      `32-field heading reads "editorial, sparse" (got: "${headingText}")`,
    );

    // Count cells in the 32-field grid specifically.
    const thirtyTwoCellCount = await page.evaluate((): number => {
      const grid = document.querySelector('[data-grid-fields="32"]');
      if (!grid) return -1;
      return grid.querySelectorAll('.pilcrow-grid-cell').length;
    });

    // The demo content has 10 cells in the 32-field grid.
    // The lede prose says "ten cells" — this assertion locks that contract.
    assert(
      thirtyTwoCellCount === 10,
      `32-field grid has exactly 10 cells (found ${thirtyTwoCellCount})`,
    );

    // ── Regression: other sidenote posts unaffected ───────────────────────────
    // A quick sanity-check that the hoist changes didn't break the standard
    // (non-grid) sidenote hoist. Navigate to the sidenotes test post.
    console.log('\n5. Regression — sidenotes post (non-grid) still hoists correctly');
    await page.goto('http://localhost:4321/posts/sidenotes/', { waitUntil: 'networkidle' });

    const standardSidenoteCount = await page.evaluate((): number => {
      return document.querySelectorAll('aside.sidenote').length;
    });

    assert(
      standardSidenoteCount >= 7,
      `sidenotes post has at least 7 hoisted aside.sidenote elements (found ${standardSidenoteCount})`,
    );

    // Confirm no raw sidenote delimiters in the sidenotes post either.
    const rawInSidenotesPost = await page.evaluate((): number => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node): number {
            if (node.parentElement?.closest('code')) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );
      let count = 0;
      let textNode: Node | null;
      while ((textNode = walker.nextNode()) !== null) {
        if (((textNode as Text).textContent ?? '').includes('::sidenote')) count++;
      }
      return count;
    });

    assert(
      rawInSidenotesPost === 0,
      `No raw ::sidenote delimiters in sidenotes post (found ${rawInSidenotesPost})`,
    );

  } finally {
    await browser.close();
  }

  console.log(`\n─── Result: ${passed} passed, ${failed} failed ───\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nSmoke test threw:', err);
  process.exit(1);
});
