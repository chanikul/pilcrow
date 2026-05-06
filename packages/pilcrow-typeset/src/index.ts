/**
 * pilcrow-typeset — public API.
 *
 * Two ways in:
 *
 *   1. Single-shot — `typeset(html, options?)`
 *      Wraps the full PlaywrightRenderer lifecycle (open → typeset → close)
 *      for callers that just want one document typeset and don't care about
 *      reusing the browser. Spins up Chromium, processes one document,
 *      tears down. Slow per-call; fine for one-offs.
 *
 *   2. Batch — `new PlaywrightRenderer()` + manual lifecycle.
 *      Advanced callers (build integrations, batch jobs) should manage
 *      `open()` / `close()` themselves so the browser stays alive across
 *      many documents. Pretext's cross-paragraph context (font caches,
 *      measurement state) is preserved within a single page session.
 *
 * The TypesetRenderer interface is the seam between Pilcrow and pretext:
 * today it's backed by Playwright; when pretext ships server-side rendering
 * upstream, a ServerRenderer can drop in without changing this surface.
 */

export type { TypesetRenderer, TypesetOptions } from './renderer.js';
export { PlaywrightRenderer } from './playwright.js';
export { hyphenateHTML } from './hyphenate.js';

import { PlaywrightRenderer } from './playwright.js';
import type { TypesetOptions } from './renderer.js';

/**
 * Typeset a single block of HTML and tear down. For one-shot callers.
 *
 * If `options` is omitted (or its measurement fields are zero / empty),
 * the renderer reads font, width, and line-height from the page's loaded
 * global.css — keeping a single source of truth for measurement geometry.
 *
 * For batch jobs that typeset many documents, instantiate `PlaywrightRenderer`
 * directly and reuse it across calls — opening Chromium per document is the
 * dominant cost.
 */
export async function typeset(
  html: string,
  options?: TypesetOptions,
): Promise<{ html: string; lineCount: number; paragraphCount: number }> {
  const opts: TypesetOptions = {
    fontShorthand: options?.fontShorthand ?? '',
    maxWidth: options?.maxWidth ?? 0,
    lineHeight: options?.lineHeight ?? 0,
    postPath: options?.postPath,
    dropCap: options?.dropCap,
  };

  const renderer = new PlaywrightRenderer();
  await renderer.open();
  try {
    return await renderer.typeset(html, opts);
  } finally {
    await renderer.close();
  }
}
