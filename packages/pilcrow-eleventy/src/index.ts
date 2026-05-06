/**
 * pilcrow-eleventy — Eleventy 3.x plugin that runs Pilcrow's typeset engine
 * over every built HTML page that contains a `<div class="post-body">` wrapper.
 *
 * Lifecycle:
 *   eleventy.before  → open one PlaywrightRenderer for the whole build.
 *   addTransform     → per-page, splice typeset HTML into .post-body.
 *   eleventy.after   → close the renderer.
 *
 * The .post-body wrapper is the contract between the user's layout and this
 * plugin (same contract used by the Astro integration shipped on pilcrow.page).
 * Pages that don't expose one are passed through untouched — the plugin is
 * a no-op rather than an error so users can opt content in page-by-page.
 *
 * Build environment requirements: Playwright with Chromium installable.
 * See README for confirmed CI environments.
 */

import { PlaywrightRenderer, type TypesetOptions } from 'pilcrow-typeset';

const POST_BODY_OPEN = '<div class="post-body">';

/**
 * Splice new body HTML into the .post-body div of a full HTML string.
 *
 * Depth-counting scan rather than a non-greedy regex: any nested <div>
 * inside .post-body (footnotes-mark, drop caps, custom primitives) would
 * trip a regex on the first inner </div>.
 */
function splicePostBody(fullHTML: string, newBodyHTML: string): { html: string; spliced: boolean } {
  const startIdx = fullHTML.indexOf(POST_BODY_OPEN);
  if (startIdx === -1) return { html: fullHTML, spliced: false };

  const innerStart = startIdx + POST_BODY_OPEN.length;

  let depth = 1;
  let pos = innerStart;
  while (pos < fullHTML.length && depth > 0) {
    const nextOpen = fullHTML.indexOf('<div', pos);
    const nextClose = fullHTML.indexOf('</div>', pos);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        return {
          html: fullHTML.slice(0, innerStart) + newBodyHTML + fullHTML.slice(nextClose),
          spliced: true,
        };
      }
      pos = nextClose + 6;
    }
  }

  return { html: fullHTML, spliced: false };
}

/**
 * Extract the inner HTML of the first .post-body div using the same
 * depth-counting scan as splicePostBody. Returns null when no wrapper
 * is present so the transform can pass the page through.
 */
function extractPostBody(fullHTML: string): string | null {
  const startIdx = fullHTML.indexOf(POST_BODY_OPEN);
  if (startIdx === -1) return null;

  const innerStart = startIdx + POST_BODY_OPEN.length;

  let depth = 1;
  let pos = innerStart;
  while (pos < fullHTML.length && depth > 0) {
    const nextOpen = fullHTML.indexOf('<div', pos);
    const nextClose = fullHTML.indexOf('</div>', pos);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) return fullHTML.slice(innerStart, nextClose);
      pos = nextClose + 6;
    }
  }

  return null;
}

/**
 * Read a `pilcrow:drop-cap` meta tag from the built HTML.
 * Absent or `content="true"` → drop cap on. `content="false"` → opt-out.
 */
function readDropCapMeta(html: string): boolean {
  const match = html.match(/<meta\s+name="pilcrow:drop-cap"\s+content="([^"]+)"/);
  if (!match) return true;
  return match[1] !== 'false';
}

/**
 * Eleventy plugin. Pass through `eleventyConfig.addPlugin(pilcrow, options)`.
 *
 * Options forwarded to the typeset renderer; defaults read from the page's
 * loaded CSS so the user's stylesheet stays the source of truth for
 * measurement geometry.
 */
export default function pilcrowEleventy(
  eleventyConfig: {
    addTransform: (
      name: string,
      callback: (this: { outputPath?: string; inputPath?: string }, content: string, outputPath?: string) => Promise<string> | string,
    ) => void;
    on: (event: string, callback: () => Promise<void> | void) => void;
  },
  options: Partial<TypesetOptions> = {},
): void {
  let renderer: PlaywrightRenderer | null = null;

  eleventyConfig.on('eleventy.before', async () => {
    renderer = new PlaywrightRenderer();
    await renderer.open();
  });

  eleventyConfig.on('eleventy.after', async () => {
    if (renderer) {
      await renderer.close();
      renderer = null;
    }
  });

  eleventyConfig.addTransform('pilcrow', async function pilcrowTransform(content, outputPath) {
    if (!outputPath || !outputPath.endsWith('.html')) return content;
    if (!renderer) return content;

    const bodyHTML = extractPostBody(content);
    if (bodyHTML === null) return content;

    const dropCap = options.dropCap !== undefined ? options.dropCap : readDropCapMeta(content);

    const opts: TypesetOptions = {
      fontShorthand: options.fontShorthand ?? '',
      maxWidth: options.maxWidth ?? 0,
      lineHeight: options.lineHeight ?? 0,
      postPath: options.postPath ?? outputPath,
      dropCap,
    };

    const { html: typesetBody } = await renderer.typeset(bodyHTML, opts);

    const spliced = splicePostBody(content, typesetBody);
    return spliced.html;
  });
}
