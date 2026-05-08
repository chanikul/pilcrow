/**
 * PlaywrightRenderer — pretext typesetting via headless Chromium.
 *
 * Lifecycle:
 *   const r = new PlaywrightRenderer();
 *   await r.open();
 *   const html = await r.typeset(html, options);
 *   await r.close();
 *
 * Throws on any failure; never silently falls back.
 *
 * How pretext is loaded:
 *   Chromium blocks `file://` imports when the page was loaded via setContent()
 *   (null origin). Instead, page.route() intercepts requests for
 *   http://pilcrow-local/pretext/* and serves the files directly from
 *   node_modules/@chenglou/pretext/dist/ — no network, fully version-pinned.
 *   rich-inline.js is served from the same dist/ directory via the same route
 *   handler, since it also lives under @chenglou/pretext/dist/.
 *
 * Rich-inline dispatch:
 *   Each <p> is first checked for inline children. If all non-text child elements
 *   are in the whitelist [em, strong, a, code, sub, sup], Branch A (rich-inline)
 *   runs: builds a flat RichInlineItem[] + itemMeta[], calls prepareRichInline,
 *   walks lines, and reconstructs HTML with tag wrappers. If any child element is
 *   outside the whitelist (e.g. <br>), Branch B (flat pretext fallback) runs
 *   instead and a build-time warning is emitted naming the offending tag.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TypesetOptions, TypesetRenderer } from './renderer.js';
import { hyphenateHTML } from './hyphenate.js';

// ─── Read global.css once at module load ─────────────────────────────────────
// Strategy (i): single source of truth for measurement-affecting CSS values.
// We read global.css here and extract the rules that affect pretext's canvas
// measurements so loaderHTML stays in sync when global.css changes.
//
// Rules extracted:
//   html font-size, body font-family + line-height,
//   .post-body max-width, .post-body p margin-bottom,
//   code font-family + font-size, .lede .drop-cap block.
//
// Colour tokens (--paper etc.) are NOT used in loaderHTML — literal hex is fine
// for a measurement-only page and avoids :root scoping headaches.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Resolve from src/lib/typeset/ up to project root, then into public/styles/.
// public/ is Astro's static-file root — global.css lives here so Astro copies
// it verbatim to dist/styles/global.css and <link href="/styles/global.css">
// resolves correctly in the served output. src/styles/ is NOT auto-copied.
// Falls back to process.cwd() if import.meta.url resolution is unreliable
// inside Vite's Astro integration context.
const GLOBAL_CSS_PATH = resolve(__dirname, '../../../public/styles/global.css');

/**
 * Strip CSS block comments (`/* ... *\/`) from a source string.
 *
 * Comments in CSS can contain example rule fragments (e.g. `body { font-family:
 * "Fraunces" ... }` in a documentation comment) that look identical to real
 * rules to a regex-based extractor. Without stripping, `extractCSSProp` may
 * match those example blocks first, returning gibberish values and breaking
 * the loaderHTML's measurement context. (Discovered 2026-05-08 — the build-
 * time canvas was silently measuring against Times because a documentation
 * comment shadowed the real `body { font-family }` rule.)
 *
 * This is intentionally simple: regex strip of `/* ... *\/` non-greedy across
 * lines. Works for all comments in `public/styles/global.css` because the file
 * uses no nested comments and contains no string literals with the `/​*` /​ `*​/`
 * sequence (those would be inside `content: "…"` or `url("…")` and CSS doesn't
 * allow them in those contexts as comment markers anyway).
 */
function stripCSSComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract a single CSS property value from a CSS source string given a selector
 * and property name. Returns null when not found.
 * Handles both `selector { ... prop: value; ... }` forms.
 *
 * Comments in the source are stripped before matching to prevent example rule
 * fragments inside docstrings from shadowing real rules — see stripCSSComments
 * docblock.
 */
function extractCSSProp(css: string, selector: string, prop: string): string | null {
  const cssNoComments = stripCSSComments(css);
  // Escape special regex characters in the selector.
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the rule block for that selector (greedy-safe via non-greedy inner match).
  // Use the 's' (dotAll) flag so block contents match across newlines.
  const blockRe = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]+?)\\}`, 'g');
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(cssNoComments)) !== null) {
    const block = match[1]!;
    // Match the property inside the block.
    const propRe = new RegExp(`(?:^|;)\\s*${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+)`, 'm');
    const propMatch = propRe.exec(block);
    if (propMatch) {
      return propMatch[1]!.trim();
    }
  }
  return null;
}

/** Read global.css and return only the measurement-critical extracted values. */
async function readMeasurementCSS(): Promise<{
  htmlFontSize: string;
  bodyFontFamily: string;
  bodyLineHeight: string;
  postBodyMaxWidth: string;
  postBodyPMarginBottom: string;
  codeFontFamily: string;
  codeFontSize: string;
  dropCapBlock: string;
  // Pull quote measurement rules (added for pull quote primitive).
  pullquoteMaxWidth: string;
  pullquoteMargin: string;
  pullquoteFontSize: string;
  pullquoteLineHeight: string;
  pullquoteFontFamily: string;
  pullquoteFontStyle: string;
  pullquoteCiteFontSize: string;
  pullquoteCiteFontVariantCaps: string;
  pullquoteCiteFontFamily: string;
  // Footnote measurement rules (added for footnote primitive).
  footnotesFontSize: string;
  footnotesLineHeight: string;
  // Sidenote measurement rules (added for sidenote primitive).
  sidenoteFontSize: string;
  sidenoteLineHeight: string;
}> {
  let css: string;
  try {
    css = await readFile(GLOBAL_CSS_PATH, 'utf8');
  } catch (err) {
    throw new Error(`[pilcrow] playwright.ts: could not read global.css at ${GLOBAL_CSS_PATH}: ${String(err)}`);
  }

  const htmlFontSize         = extractCSSProp(css, 'html', 'font-size')                   ?? '18px';
  const bodyFontFamily       = extractCSSProp(css, 'body', 'font-family')                 ?? '"Fraunces", ui-serif, Georgia, serif';
  const bodyLineHeight       = extractCSSProp(css, 'body', 'line-height')                 ?? '1.7';
  // --prose-measure is a CSS custom property on .post-body — the single source
  // of truth for the body prose column width (introduced with rehype-hoist-sidenotes
  // corrective rebuild). extractCSSProp reads the raw value token from the
  // .post-body rule block. Throw hard if absent — no silent fallback.
  const proseMeasureRaw = extractCSSProp(css, '.post-body', '--prose-measure');
  if (!proseMeasureRaw) {
    throw new Error(
      '[pilcrow] playwright.ts: --prose-measure custom property missing from .post-body in global.css. ' +
      'Add `--prose-measure: 65ch;` (or your desired prose column width) to the .post-body rule block.',
    );
  }
  const postBodyMaxWidth = proseMeasureRaw;
  const postBodyPMarginBottom= extractCSSProp(css, '.post-body p', 'margin-bottom')       ?? '1.8rem';
  const codeFontFamily       = extractCSSProp(css, 'code', 'font-family')                 ?? 'ui-monospace, monospace';
  const codeFontSize         = extractCSSProp(css, 'code', 'font-size')                   ?? '0.9em';

  // Extract the full .lede .drop-cap rule block (properties only, not braces).
  const dropCapMatch = /\.lede\s+\.drop-cap\s*\{([^}]+)\}/s.exec(css);
  const dropCapProps = dropCapMatch ? dropCapMatch[1]!.trim() : `
    float: left;
    font-size: 4.6em;
    line-height: 0.85;
    font-weight: 500;
    padding: 0.05em 0.08em 0 0;
    margin-top: 0.05em;
  `;
  const dropCapBlock = `.lede .drop-cap {\n    ${dropCapProps.replace(/\n/g, '\n    ')}\n  }`;

  // ─── Pull quote measurement rules ─────────────────────────────────────────
  // These are read from global.css so the loader page CSS stays in sync when
  // global.css changes (single-source-of-truth contract).
  const pullquoteMaxWidth          = extractCSSProp(css, '.pullquote', 'max-width')                     ?? '50ch';
  const pullquoteMargin            = extractCSSProp(css, '.pullquote', 'margin')                         ?? '2.5rem auto';
  const pullquoteFontSize          = extractCSSProp(css, '.pullquote blockquote p', 'font-size')         ?? '1.5em';
  const pullquoteLineHeight        = extractCSSProp(css, '.pullquote blockquote p', 'line-height')       ?? '1.4';
  const pullquoteFontFamily        = extractCSSProp(css, '.pullquote blockquote p', 'font-family')       ?? bodyFontFamily;
  const pullquoteFontStyle         = extractCSSProp(css, '.pullquote blockquote p', 'font-style')        ?? 'italic';
  const pullquoteCiteFontSize      = extractCSSProp(css, '.pullquote cite', 'font-size')                 ?? '0.85em';
  const pullquoteCiteFontVariantCaps = extractCSSProp(css, '.pullquote cite', 'font-variant-caps')       ?? 'small-caps';
  const pullquoteCiteFontFamily    = extractCSSProp(css, '.pullquote cite', 'font-family')               ?? bodyFontFamily;

  // ─── Footnote measurement rules ────────────────────────────────────────────
  // These are read from global.css so the loader page CSS stays in sync when
  // global.css changes (single-source-of-truth contract). The footnote-list
  // paragraphs are set at a smaller size/tighter leading so pretext measures
  // them at their actual rendered geometry.
  const footnotesFontSize   = extractCSSProp(css, '.footnotes p', 'font-size')   ?? '0.875em';
  const footnotesLineHeight = extractCSSProp(css, '.footnotes p', 'line-height') ?? '1.5';

  // ─── Sidenote measurement rules ────────────────────────────────────────────
  // These are read from global.css so the loader page CSS stays in sync when
  // global.css changes (single-source-of-truth contract). The sidenote
  // paragraphs are set at a smaller size/tighter leading so pretext measures
  // them at their actual rendered geometry (25ch column width, 0.85em, 1.4lh).
  const sidenoteFontSize   = extractCSSProp(css, 'aside.sidenote', 'font-size')   ?? '0.85em';
  const sidenoteLineHeight = extractCSSProp(css, 'aside.sidenote', 'line-height') ?? '1.4';

  return {
    htmlFontSize,
    bodyFontFamily,
    bodyLineHeight,
    postBodyMaxWidth,
    postBodyPMarginBottom,
    codeFontFamily,
    codeFontSize,
    dropCapBlock,
    pullquoteMaxWidth,
    pullquoteMargin,
    pullquoteFontSize,
    pullquoteLineHeight,
    pullquoteFontFamily,
    pullquoteFontStyle,
    pullquoteCiteFontSize,
    pullquoteCiteFontVariantCaps,
    pullquoteCiteFontFamily,
    footnotesFontSize,
    footnotesLineHeight,
    sidenoteFontSize,
    sidenoteLineHeight,
  };
}

const require = createRequire(import.meta.url);

/** Absolute path to the @chenglou/pretext dist/ directory in node_modules. */
function pretextDistDir(): string {
  // require.resolve honours the package "exports" map and returns the absolute
  // filesystem path for the main entry. We only need the directory.
  const entry = require.resolve('@chenglou/pretext');
  return dirname(entry);
}

/** Virtual origin used for routing pretext files. */
const PRETEXT_ORIGIN = 'http://pilcrow-local';
const PRETEXT_PREFIX = `${PRETEXT_ORIGIN}/pretext/`;
/** Virtual route for self-hosted Fraunces TTFs. Served from public/fonts/ on
 * disk so the typeset pipeline never depends on a third-party font CDN. */
const FONTS_PREFIX = `${PRETEXT_ORIGIN}/fonts/`;

export class PlaywrightRenderer implements TypesetRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  /** Measurement-critical CSS extracted from global.css at open() time. */
  private measureCSS: Awaited<ReturnType<typeof readMeasurementCSS>> | null = null;

  async open(): Promise<void> {
    this.browser = await chromium.launch();
    // 1200px matches the PoC's viewport — wide enough that column widths computed
    // inside the page reflect real desktop reading widths.
    this.page = await this.browser.newPage({ viewport: { width: 1200, height: 900 } });

    // Read measurement CSS from global.css once per session.
    this.measureCSS = await readMeasurementCSS();

    const distDir = pretextDistDir();

    // Route all requests for the virtual pretext origin to the local dist/ dir.
    // The relative imports inside layout.js (./bidi.js, ./analysis.js, etc.)
    // resolve relative to the same origin, so they all get served this way too.
    // rich-inline.js lives in the same dist/ directory and is served here too.
    await this.page.route(`${PRETEXT_PREFIX}**`, async (route) => {
      const url = new URL(route.request().url());
      const filename = url.pathname.replace('/pretext/', '');
      const filePath = join(distDir, filename);
      try {
        const body = await readFile(filePath, 'utf8');
        await route.fulfill({ contentType: 'application/javascript', body });
      } catch (err) {
        // Surface routing errors loudly so build fails with a clear message.
        await route.abort('failed');
        throw new Error(`[pilcrow] failed to serve pretext file ${filename}: ${String(err)}`);
      }
    });

    // Self-hosted Fraunces TTFs (static instances at 144pt opsz). The previous
    // Google Fonts CDN dependency failed silently on the CF Pages build
    // container; the variable-TTF interim fix exposed a separate failure mode
    // in Linux Playwright Chromium 147 (loaded variable TTFs but never bound
    // them to glyph rendering). Static TTFs work everywhere. Serving them off
    // disk through this route eliminates any network dependency at typeset.
    const publicFontsDir = join(process.cwd(), 'public', 'fonts');
    await this.page.route(`${FONTS_PREFIX}**`, async (route) => {
      const url = new URL(route.request().url());
      const filename = url.pathname.replace('/fonts/', '');
      const filePath = join(publicFontsDir, filename);
      try {
        const body = await readFile(filePath);
        await route.fulfill({
          contentType: 'font/ttf',
          headers: { 'access-control-allow-origin': '*' },
          body,
        });
      } catch (err) {
        await route.abort('failed');
        throw new Error(`[pilcrow] failed to serve font file ${filename}: ${String(err)}`);
      }
    });

  }

  async typeset(html: string, options: TypesetOptions): Promise<{ html: string; lineCount: number; paragraphCount: number }> {
    if (!this.page) throw new Error('PlaywrightRenderer: call open() before typeset()');
    if (!this.measureCSS) throw new Error('PlaywrightRenderer: measureCSS not loaded — open() must have failed');

    const m = this.measureCSS;

    // Node-side Hyphenopoly pre-pass: inject soft hyphens into the body HTML
    // before pretext sees it. Soft hyphens are candidate break points that
    // pretext will use when computing line widths. This runs entirely in the
    // Bun/Node process — Playwright is not involved.
    // If PILCROW_SKIP_TYPESET=1, this method is never called, so hyphenation
    // is also naturally bypassed with no special handling needed here.
    const bodyHTML = await hyphenateHTML(html);

    // Build a minimal page that:
    //   1. Renders the post body HTML (with soft hyphens from Hyphenopoly) so
    //      CSS is present and computable.
    //   2. Loads pretext layout.js and rich-inline.js as ES modules via the
    //      routed virtual origin.
    //   3. Declares self-hosted Fraunces @font-face served via FONTS_PREFIX
    //      route so Fraunces metrics are deterministically available inside
    //      Playwright. (Was Google Fonts CDN — failed silently on CF Pages.)
    //   4. Signals readiness via window.__pretextReady — gated on document.fonts.ready
    //      so Fraunces metrics are loaded before any pretext measurement.
    //
    // The <style> block is derived from global.css (read at open() time via
    // readMeasurementCSS()) — single source of truth. Colour tokens are not
    // needed here; literal hex is used where colour matters for layout context.
    const loaderHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @font-face {
      font-family: "Fraunces";
      src: url("${FONTS_PREFIX}Fraunces144pt-Regular.ttf") format("truetype");
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: "Fraunces";
      src: url("${FONTS_PREFIX}Fraunces144pt-SemiBold.ttf") format("truetype");
      font-weight: 600;
      font-style: normal;
    }
    @font-face {
      font-family: "Fraunces";
      src: url("${FONTS_PREFIX}Fraunces144pt-Bold.ttf") format("truetype");
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: "Fraunces";
      src: url("${FONTS_PREFIX}Fraunces144pt-Italic.ttf") format("truetype");
      font-weight: 400;
      font-style: italic;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { font-size: ${m.htmlFontSize}; }
    body {
      font-family: ${m.bodyFontFamily};
      line-height: ${m.bodyLineHeight};
      margin: 0;
      padding: 0;
    }
    .post-body { max-width: ${m.postBodyMaxWidth}; }
    .post-body p { margin: 0 0 ${m.postBodyPMarginBottom}; }
    code {
      font-family: ${m.codeFontFamily};
      font-size: ${m.codeFontSize};
    }
    ${m.dropCapBlock}
    .lede + p { clear: left; }
    /* Pull quote — measurement-critical rules extracted from global.css.
     * These must be present so getComputedStyle() inside page.evaluate()
     * returns the correct rendered geometry for pull quote paragraphs. */
    .pullquote {
      max-width: ${m.pullquoteMaxWidth};
      margin: ${m.pullquoteMargin};
    }
    .pullquote blockquote {
      margin: 0;
      padding: 0;
    }
    .pullquote blockquote p {
      font-size: ${m.pullquoteFontSize};
      line-height: ${m.pullquoteLineHeight};
      font-family: ${m.pullquoteFontFamily};
      font-style: ${m.pullquoteFontStyle};
    }
    .pullquote cite {
      font-size: ${m.pullquoteCiteFontSize};
      font-variant-caps: ${m.pullquoteCiteFontVariantCaps};
      font-family: ${m.pullquoteCiteFontFamily};
    }
    /* Footnote-list — measurement-critical rules extracted from global.css.
     * These must be present so getComputedStyle() inside page.evaluate()
     * returns the correct rendered geometry for footnote-list paragraphs. */
    .footnotes p {
      font-size: ${m.footnotesFontSize};
      line-height: ${m.footnotesLineHeight};
    }
    /* Sidenote — measurement-critical rules extracted from global.css.
     * These must be present so getComputedStyle() inside page.evaluate()
     * returns the correct rendered geometry for sidenote paragraphs.
     * Width is set to 25ch so pretext measures at the actual column width. */
    aside.sidenote {
      width: 25ch;
      font-size: ${m.sidenoteFontSize};
      line-height: ${m.sidenoteLineHeight};
    }
    aside.sidenote p {
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="post-body">${bodyHTML}</div>
  <script type="module">
    import * as pretext from '${PRETEXT_PREFIX}layout.js';
    import * as richInline from '${PRETEXT_PREFIX}rich-inline.js';
    // Gate __pretextReady on document.fonts.ready so Fraunces metrics are
    // available before any pretext canvas measurement runs.
    document.fonts.ready.then(() => {
      window.pretext = pretext;
      window.richInline = richInline;
      window.__pretextReady = true;
    });
  </script>
</body>
</html>`;

    await this.page.setContent(loaderHTML, { waitUntil: 'domcontentloaded' });

    // Wait for the ES modules to finish loading and fonts.ready to fire.
    // __pretextReady is now set inside document.fonts.ready.then(), so this
    // single waitForFunction covers both module load and font availability.
    await this.page.waitForFunction('window.__pretextReady === true', { timeout: 30000 });

    // Run pretext over every <p> inside .post-body.
    // Two-branch dispatch per paragraph:
    //   Branch A (rich-inline): all element children are in the whitelist.
    //   Branch B (flat fallback): any element child outside the whitelist.
    // Drop-cap branch: first non-empty paragraph (the lede) gets a floated cap
    // when options.dropCap !== false. Uses layoutNextLineRange / layoutNextRichInlineLineRange
    // for variable-width layout so lines beside the cap float are correctly narrowed.
    const result = await this.page.evaluate(
      ({ fontShorthand, maxWidth, lineHeight, postPath, dropCap }) => {
        const pt = (window as any).pretext;
        const ri = (window as any).richInline;
        if (!pt?.prepareWithSegments || !pt?.layoutWithLines) {
          throw new Error('[pilcrow] pretext API missing on window.pretext');
        }
        if (!ri?.prepareRichInline || !ri?.walkRichInlineLineRanges || !ri?.materializeRichInlineLineRange) {
          throw new Error('[pilcrow] rich-inline API missing on window.richInline');
        }

        // --- Whitelist of inline element tag names ---
        const WHITELIST = new Set(['EM', 'STRONG', 'A', 'CODE', 'SUB', 'SUP']);

        // Monospace family used for code items — must match global.css code rule.
        const MONO_FAMILY = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

        const escapeHTML = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        /**
         * Walk a DOM node tree depth-first and collect:
         *   items:    flat RichInlineItem[] for prepareRichInline
         *   itemMeta: parallel array of tag-stack info for each item
         *
         * tagStack: array of { tag, attrs } — innermost last.
         * Returns null if any non-whitelisted element is encountered.
         */
        type TagEntry = { tag: string; attrs: Record<string, string> };
        type ItemMeta = { tags: TagEntry[] };

        function walkNode(
          node: Node,
          tagStack: TagEntry[],
          baseFont: string,
          baseFontSize: number,
          items: Array<{ text: string; font: string }>,
          itemMeta: ItemMeta[],
        ): string | null {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            if (text === '') return null;

            // Compute font shorthand for this text node based on the tag stack.
            let fontStyle = 'normal';
            let fontWeight = '400';
            let fontFamily = baseFont;
            let fontSize = baseFontSize;
            let isCode = false;
            let isSubSup = false;

            for (const entry of tagStack) {
              if (entry.tag === 'EM') {
                fontStyle = 'italic';
              } else if (entry.tag === 'STRONG') {
                fontWeight = '700';
              } else if (entry.tag === 'CODE') {
                isCode = true;
              } else if (entry.tag === 'SUB' || entry.tag === 'SUP') {
                isSubSup = true;
                fontSize = Math.round(baseFontSize * 0.75);
              }
            }

            if (isCode) {
              // Use monospace family; strip quotes and use first family name for canvas
              const monoFirst = MONO_FAMILY.split(',')[0]!.trim().replace(/^['"]|['"]$/g, '');
              fontFamily = `"${monoFirst}"`;
              // code font-size is 0.9em
              fontSize = Math.round(baseFontSize * 0.9);
            }

            const itemFont = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
            items.push({ text, font: itemFont });
            itemMeta.push({ tags: [...tagStack] });
            return null; // no error
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const tag = el.tagName;

            if (!WHITELIST.has(tag)) {
              return tag; // signal unsupported tag
            }

            // Build attrs record for this element
            const attrs: Record<string, string> = {};
            for (let i = 0; i < el.attributes.length; i++) {
              const attr = el.attributes[i]!;
              attrs[attr.name] = attr.value;
            }

            const newStack = [...tagStack, { tag, attrs }];
            for (const child of Array.from(el.childNodes)) {
              const err = walkNode(child, newStack, baseFont, baseFontSize, items, itemMeta);
              if (err !== null) return err;
            }
            return null;
          }

          // Ignore other node types (comments, etc.)
          return null;
        }

        /**
         * Build HTML for one rich-inline line from its fragments + itemMeta.
         * Each fragment is wrapped in the tag stack for that item, innermost first
         * (i.e., the last tag in the stack is the innermost wrapper).
         *
         * rich-inline's prepareRichInline trims boundary whitespace and tracks it
         * as gapBefore (a layout width). When gapBefore > 0 and this is not the
         * first fragment on the line, we emit a plain space character to restore
         * the visible gap between adjacent inline items.
         */
        function buildLineHTML(
          fragments: Array<{ itemIndex: number; text: string; gapBefore: number }>,
          itemMeta: ItemMeta[],
        ): string {
          let html = '';
          for (let fi = 0; fi < fragments.length; fi++) {
            const frag = fragments[fi]!;
            const meta = itemMeta[frag.itemIndex]!;
            const tags = meta.tags;
            // Trim trailing whitespace from the last fragment of each line.
            // Pretext attaches a soft-break space to non-terminal fragments; strip it
            // so screen readers / text extractors don't see spurious trailing spaces.
            // Only trimEnd() on the last fragment — never on internal ones, which would
            // corrupt legitimate mid-line whitespace inside <em>, <strong>, etc.
            const fragText = fi === fragments.length - 1 ? frag.text.trimEnd() : frag.text;
            let inner = escapeHTML(fragText);

            // Wrap from innermost (last) to outermost (first)
            for (let i = tags.length - 1; i >= 0; i--) {
              const { tag, attrs } = tags[i]!;
              const tagLower = tag.toLowerCase();
              let openTag = `<${tagLower}`;
              for (const [name, value] of Object.entries(attrs)) {
                openTag += ` ${name}="${escapeHTML(value)}"`;
              }
              openTag += '>';
              inner = `${openTag}${inner}</${tagLower}>`;
            }

            // Restore the collapsed boundary gap as a plain space. The gap is a
            // layout width (not text), so we emit ' ' whenever gapBefore > 0 and
            // this is not the very first fragment on the line.
            if (fi > 0 && frag.gapBefore > 0) {
              html += ' ';
            }
            html += inner;
          }
          return html;
        }

        /**
         * Normalise a font-family value for canvas:
         * strip outer quotes and return only the first family name, quoted if needed.
         */
        function normaliseFontFamily(family: string): string {
          const first = family.split(',')[0]!.trim().replace(/^['"]|['"]$/g, '');
          return first.includes(' ') ? `"${first}"` : first;
        }

        /**
         * Build the joined HTML of <span class="pt-line"> elements, injecting
         * sidenote marker HTML (if any) into the LAST span rather than appending
         * them after all spans.
         *
         * Why: pt-line spans are `display: block`. Appending an inline <sup>
         * AFTER block siblings causes CSS anonymous block wrapping, which renders
         * the marker as a standalone element on its own visual line below the
         * paragraph — the "stray 1 in accent colour" bug. Placing the marker
         * inside the last span keeps it inline at the end of the final line.
         */
        function buildLineSpansHTML(inners: string[], markers: string[]): string {
          const markerHTML = markers.join('');
          return inners
            .map((inner, i) =>
              i === inners.length - 1
                ? `<span class="pt-line">${inner}${markerHTML}</span>`
                : `<span class="pt-line">${inner}</span>`,
            )
            .join('');
        }

        // ─── Hyphenation orphan guard ─────────────────────────────────────────────
        /**
         * Hyphenation orphan guard — Pilcrow-local mitigation.
         *
         * Pretext's continueSoftHyphenBreakableSegment greedily packs graphemes from
         * post-soft-hyphen segments onto the prior line, producing orphans like
         * "ital-i" + "cs were there" because pretext is grapheme-aware, not
         * syllable-aware, and has no visibility into Hyphenopoly's `rightmin`.
         *
         * Detection: a line ends with a visible hyphen (e.g. "fail-") and the next
         * line's leading fragment is shorter than ORPHAN_THRESHOLD characters. This
         * catches both the "clean" SHY break (fail-|ure) and the grapheme-packed case
         * (ital-i|cs) — the packed case also has a visible hyphen in the materialized text
         * because pretext inserts '-' at the SHY break position.
         *
         * Recovery strategy: targeted — extract the left stem before the '-' on line N,
         * search for '{stem}­' in the source, and strip that specific SHY. This avoids
         * touching SHYs for unrelated words, preventing collateral grapheme-break regressions.
         * Falls back to stripping all SHYs per paragraph if targeted search fails.
         *
         * Per master plan §3 and §16: the architectural fix is an upstream pretext
         * `softHyphenMode: 'strict'` contribution. This wrapper is mitigation pending
         * that landing. When upstream ships, replace this with the flag and remove
         * this guard block.
         *
         * Autonomous decisions (overridable — flagged in morning review):
         *   THRESHOLD = 4: catches fail-|ure (right=3), ital-|ics (right=2); lets inely (5) pass.
         *   Recovery: targeted SHY strip (stem-search), not document-order strip.
         *   Paragraph fallback: strip all SHYs → ragged-right for this paragraph only.
         */
        const ORPHAN_THRESHOLD = 4;
        // RIGHTMIN mirrors Hyphenopoly's `rightmin: 3` in hyphenate.ts.
        // Used by Case 2 only — any post-SHY residual shorter than 3 chars is an orphan.
        const RIGHTMIN = 3;
        const SHY = '­';

        /** Strip HTML tags from a line string (for detection purposes only). */
        function rawText(s: string): string {
          return s.replace(/<[^>]+>/g, '');
        }

        /**
         * Leading word length: number of non-space chars before the first space
         * or end-of-string, after stripping HTML tags and trailing punctuation.
         * "ure." → 3, "cs" → 2, "inely" → 5.
         */
        function leadingWordLen(lineHTML: string): number {
          const plain = rawText(lineHTML).trimStart();
          const m = plain.match(/^(\S+)/);
          if (!m) return 0;
          return m[1]!.replace(/[.,!?;:]+$/, '').length;
        }

        /**
         * Walk line pairs. Return index of the first line N that has a
         * pretext-materialized soft-hyphen break producing a short right fragment.
         * Returns -1 if no orphan found.
         *
         * Two patterns detected:
         *   Case 1 — clean break: line ends '-' (e.g. "fail-"), next starts "ure."
         *     → right fragment = "ure" (3 chars) — triggers if < ORPHAN_THRESHOLD
         *   Case 2 — packed-grapheme break: line ends '-<suffix>' where suffix is
         *     1–3 chars (e.g. "ital-i", "cul-tur", "dis-tan") — pretext's
         *     continueSoftHyphenBreakableSegment packed graphemes onto the SHY line,
         *     fragmenting the rightmost segment. The post-SHY residual on the NEXT
         *     line (e.g. "cs", "e", "ce") is the only fragment that matters here.
         *     Fires when nextLen < RIGHTMIN (= Hyphenopoly's `rightmin: 3`).
         *     NOTE: the combined-length proxy (suffix + nextLen < THRESHOLD) was
         *     removed — it failed when suffix ≥ 3 (e.g. "cul-tur/e": suffix=3,
         *     nextLen=1, combined=4; "dis-tan/ce": suffix=3, nextLen=2, combined=5).
         *
         * `lineInners`: inner HTML content of each pt-line (no wrapper tag).
         */
        function firstOrphanIdx(lineInners: string[]): number {
          for (let i = 0; i < lineInners.length - 1; i++) {
            const t = rawText(lineInners[i]!).trimEnd();
            const nextLen = leadingWordLen(lineInners[i + 1]!);
            if (nextLen <= 0) continue;

            // Case 1: clean break — line ends '-'
            if (t.endsWith('-')) {
              if (nextLen < ORPHAN_THRESHOLD) return i;
              continue;
            }

            // Case 2: packed-grapheme break — line ends '-<suffix>' (1–7 letters).
            // The suffix is already on line N (packed by pretext); what matters is
            // whether the post-SHY residual on line N+1 is below Hyphenopoly's rightmin.
            const packedMatch = t.match(/-([a-zA-ZÀ-ɏ]{1,7})$/);
            if (packedMatch) {
              if (nextLen < RIGHTMIN) return i;
            }
          }
          return -1;
        }

        /** Strip the character at position `pos` from `text`. */
        function stripAt(text: string, pos: number): string {
          return text.slice(0, pos) + text.slice(pos + 1);
        }

        /**
         * Sentinel returned by findOrphanSHYPos when the line-end hyphen is a
         * literal U+002D in a compound word (e.g. drop-cap, well-being, multi-script).
         *
         * Case 1 detection fires on any line-end hyphen, but a literal U+002D in a
         * compound word is editorially acceptable — printers have broken at compound
         * hyphens since Gutenberg. Return LITERAL_HYPHEN_BREAK so the recovery loop
         * is skipped without a spurious "unrecoverable" warning.
         * (Diagnosis per critic's investigation, 2026-04-30.)
         */
        const LITERAL_HYPHEN_BREAK = null;

        /**
         * Given the lines array and orphan line index, return the source position
         * of the SHY that caused the orphan break.
         *
         * Strategy: extract the left stem — the last non-hyphen token on line N,
         * up to but not including the materialized '-'. Search for '{stem}­'
         * in the source text to find the exact SHY to remove.
         *
         * Example: line N ends "...fail-" → stem = "fail" → search "fail­".
         * Example: line N ends "...ital-i" → hyphen is at index 4 → stem = "ital"
         *   → search "ital­".
         *
         * Returns:
         *   ≥ 0                  — exact position of the SHY in sourceText; strip it.
         *   -1                   — SHY not found, not a literal-hyphen word either;
         *                          caller falls back to document-order SHY stripping.
         *   LITERAL_HYPHEN_BREAK — the line-end hyphen is a literal U+002D in the
         *                          source (e.g. "drop-cap", "well-being"); no SHY
         *                          is responsible. Accept the layout as-is and skip
         *                          recovery without emitting an "unrecoverable" warning.
         *
         * Literal-hyphen blind spot: Case 1 detection fires on any line ending with '-',
         * regardless of whether that hyphen came from a U+00AD SHY break or from a
         * literal U+002D in a compound word. To distinguish:
         *   1. Search for `stem + U+00AD` in source → SHY-induced break (recoverable).
         *   2. If absent, search for `stem + '-'` in source → literal hyphen (structural,
         *      editorially acceptable, skip recovery).
         *   3. If neither found → source-text scan inconclusive, return -1 (doc-order fallback).
         */
        function findOrphanSHYPos(sourceText: string, lineInners: string[], orphanLine: number): number | null {
          const lineN = rawText(lineInners[orphanLine]!).trimEnd();
          // Find the position of the last '-' in the line (the hyphen from the SHY break)
          const hyphenIdx = lineN.lastIndexOf('-');
          if (hyphenIdx < 0) return -1;
          // Left stem: the word fragment before the hyphen, searching backward for a space
          const beforeHyphen = lineN.slice(0, hyphenIdx);
          const lastSpaceIdx = beforeHyphen.lastIndexOf(' ');
          const stem = beforeHyphen.slice(lastSpaceIdx + 1);
          if (!stem) return -1;
          // Search for 'stem­' (SHY) in source — the normal recoverable path.
          const shyPattern = stem + SHY;
          if (sourceText.indexOf(shyPattern) >= 0) {
            return sourceText.indexOf(shyPattern) + stem.length;
          }
          // SHY not found. Check whether the stem is part of a literal compound word
          // (stem + '-' present in source). If so, this is a structural line-end break
          // on a literal hyphen — editorially acceptable, skip recovery silently.
          const literalPattern = stem + '-';
          if (sourceText.indexOf(literalPattern) >= 0) {
            return LITERAL_HYPHEN_BREAK;
          }
          // Neither SHY nor literal hyphen found in source — inconclusive.
          // Return -1 so the caller may fall back to document-order SHY stripping.
          return -1;
        }

        /**
         * Apply orphan guard to a flat paragraph.
         * `sourceText`: paragraph text with U+00AD soft hyphens (from Hyphenopoly).
         * `layoutFn`: re-runs pretext on a given text, returns inner line strings (no pt-line wrapper).
         * Returns the corrected inner line strings.
         */
        function guardFlat(
          sourceText: string,
          layoutFn: (t: string) => string[],
          paraIdx: number,
        ): string[] {
          let lines = layoutFn(sourceText);
          let orphanLine = firstOrphanIdx(lines);
          if (orphanLine < 0) return lines;

          let workText = sourceText;
          const maxTries = (sourceText.match(/­/g) ?? []).length + 1;

          for (let attempt = 0; attempt < maxTries && orphanLine >= 0; attempt++) {
            // Targeted: find the SHY that corresponds to the orphan break.
            const shyPosResult = findOrphanSHYPos(workText, lines, orphanLine);
            // LITERAL_HYPHEN_BREAK (null): line-end hyphen is a literal U+002D in a compound
            // word (e.g. drop-cap, well-being). Editorially acceptable — accept layout as-is.
            if (shyPosResult === LITERAL_HYPHEN_BREAK) return lines;
            let shyPos = shyPosResult;
            if (shyPos < 0) {
              // Targeted search failed — fall back to first SHY in document order.
              shyPos = workText.indexOf(SHY);
            }
            if (shyPos < 0) break; // no SHYs left

            workText = stripAt(workText, shyPos);
            const candidate = layoutFn(workText);
            lines = candidate;
            orphanLine = firstOrphanIdx(lines);
            if (orphanLine < 0) return lines;
          }

          // Exhausted targeted retries — strip all remaining SHYs (ragged fallback).
          const plain = workText.replace(/­/g, '');
          warnings.push(
            `${postPath}: paragraph ${paraIdx} orphan guard: unrecoverable — stripped all soft hyphens (ragged fallback)`,
          );
          return layoutFn(plain);
        }

        /**
         * Apply orphan guard to a rich-inline paragraph.
         * `sourceItems`: RichInlineItem array (with U+00AD in .text fields from Hyphenopoly).
         * `layoutFn`: re-runs prepareRichInline + walk on given items, returns inner line HTML strings.
         * Returns the corrected inner line HTML strings.
         */
        function guardRich(
          sourceItems: Array<{ text: string; font: string }>,
          layoutFn: (it: Array<{ text: string; font: string }>) => string[],
          paraIdx: number,
        ): string[] {
          let lines = layoutFn(sourceItems);
          let orphanLine = firstOrphanIdx(lines);
          if (orphanLine < 0) return lines;

          // Flatten items to a single text for SHY position search.
          // We track offsets so we can map a flat-text SHY position back to
          // the correct item index + intra-item position.
          function flattenItems(items: Array<{ text: string; font: string }>): string {
            return items.map(it => it.text).join('');
          }

          // LITERAL_HYPHEN_SENTINEL: used as the return value of findRichOrphanSHY when
          // findOrphanSHYPos signals LITERAL_HYPHEN_BREAK — propagates the "skip recovery"
          // signal up to the guardRich loop without conflating it with "SHY not found".
          const LITERAL_HYPHEN_SENTINEL = { literalHyphen: true as const };

          function findRichOrphanSHY(
            items: Array<{ text: string; font: string }>,
            orphanLines: string[],
            orphanLineIdx: number,
          ): { itemIdx: number; posInItem: number } | { literalHyphen: true } | null {
            const combined = flattenItems(items);
            const shyPos = findOrphanSHYPos(combined, orphanLines, orphanLineIdx);
            // Propagate literal-hyphen break signal — caller must skip recovery.
            if (shyPos === LITERAL_HYPHEN_BREAK) return LITERAL_HYPHEN_SENTINEL;
            if (shyPos < 0) return null;

            // Map flat position back to item + intra-item position
            let offset = 0;
            for (let ii = 0; ii < items.length; ii++) {
              const len = items[ii]!.text.length;
              if (shyPos < offset + len) {
                return { itemIdx: ii, posInItem: shyPos - offset };
              }
              offset += len;
            }
            return null;
          }

          function stripRichSHY(
            items: Array<{ text: string; font: string }>,
            itemIdx: number,
            posInItem: number,
          ): Array<{ text: string; font: string }> {
            return items.map((it, idx) =>
              idx === itemIdx
                ? { text: stripAt(it.text, posInItem), font: it.font }
                : it,
            );
          }

          let workItems = sourceItems.map(it => ({ ...it }));
          const totalSHYs = workItems.reduce((s, it) => s + (it.text.match(/­/g) ?? []).length, 0);
          const maxTries = totalSHYs + 1;

          for (let attempt = 0; attempt < maxTries && orphanLine >= 0; attempt++) {
            // Targeted: find the SHY corresponding to the orphan.
            const target = findRichOrphanSHY(workItems, lines, orphanLine);
            // LITERAL_HYPHEN_SENTINEL: line-end hyphen is a literal U+002D in a compound
            // word (e.g. drop-cap, well-being). Editorially acceptable — accept layout as-is.
            if (target !== null && 'literalHyphen' in target) return lines;
            if (target !== null) {
              workItems = stripRichSHY(workItems, target.itemIdx, target.posInItem);
            } else {
              // Targeted search failed — strip first SHY in document order.
              let stripped = false;
              for (let ii = 0; ii < workItems.length; ii++) {
                const pos = workItems[ii]!.text.indexOf(SHY);
                if (pos >= 0) {
                  workItems = workItems.map((it, idx) =>
                    idx === ii ? { text: stripAt(it.text, pos), font: it.font } : it,
                  );
                  stripped = true;
                  break;
                }
              }
              if (!stripped) break;
            }

            const candidate = layoutFn(workItems);
            lines = candidate;
            orphanLine = firstOrphanIdx(lines);
            if (orphanLine < 0) return lines;
          }

          // Exhausted — strip all SHYs from all items (ragged fallback).
          const noHyphItems = workItems.map(it => ({ text: it.text.replace(/­/g, ''), font: it.font }));
          warnings.push(
            `${postPath}: paragraph ${paraIdx} orphan guard (rich-inline): unrecoverable — stripped all soft hyphens`,
          );
          return layoutFn(noHyphItems);
        }
        // ─── End orphan guard ─────────────────────────────────────────────────────

        const container = document.querySelector<HTMLElement>('.post-body');
        if (!container) throw new Error('[pilcrow] .post-body not found in loader page');

        const paragraphs = Array.from(container.querySelectorAll<HTMLElement>('p'));
        let totalLines = 0;
        // Warnings are collected here and returned to the Node side for logging,
        // because page.on('console') events from page.evaluate() are async and
        // may not flush before the process exits.
        const warnings: string[] = [];

        // Track whether we've processed the first non-empty paragraph (the lede).
        // Only the lede gets a drop cap; this flips to false after the first one.
        let isLede = true;
        // paraIdx counts non-empty paragraphs processed (for orphan-guard warnings).
        let paraIdx = 0;

        for (const p of paragraphs) {
          const text = p.textContent ?? '';
          if (!text.trim()) continue;
          const currentParaIdx = paraIdx++;

          // ── Sidenote marker preservation ──────────────────────────────────────
          // rehype-hoist-sidenotes appends <sup class="sidenote-marker"> to the
          // end of the paragraph that precedes each sidenote aside. These markers
          // have no text content (the number comes from a CSS counter ::before
          // pseudo-element) so walkNode silently ignores them, and the later
          // p.innerHTML = ... assignment wipes them out.
          //
          // Strategy: extract all sidenote marker <sup> elements from the paragraph
          // BEFORE processing, remember their outer HTML, and re-append them AFTER
          // rebuilding innerHTML. This keeps markers in the correct DOM position
          // without affecting the pretext line-breaking pass.
          //
          // We preserve the outerHTML as a string rather than live elements because
          // any DOM mutation during innerHTML replacement would detach them.
          const markerSups = Array.from(
            p.querySelectorAll<HTMLElement>('sup.sidenote-marker'),
          );
          const markerHTMLs: string[] = markerSups.map(sup => sup.outerHTML);

          // Resolve base font and dimensions from computed style
          const cs = getComputedStyle(p);
          const baseFamily = normaliseFontFamily(cs.fontFamily);
          const baseFontSize = parseFloat(cs.fontSize);
          const resolvedFont = fontShorthand ||
            `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${baseFamily}`;
          const resolvedWidth = maxWidth || p.clientWidth;
          const resolvedLineHeight = lineHeight ||
            (parseFloat(cs.lineHeight) || baseFontSize * 1.7);

          // --- Check for inline elements and build item arrays ---
          const items: Array<{ text: string; font: string }> = [];
          const itemMeta: ItemMeta[] = [];
          let offendingTag: string | null = null;

          for (const child of Array.from(p.childNodes)) {
            const err = walkNode(child, [], baseFamily, baseFontSize, items, itemMeta);
            if (err !== null) {
              offendingTag = err;
              break;
            }
          }

          // ---- Drop-cap branch (lede only) ----
          // Guard: paragraphs inside pull quotes, footnotes, or sidenotes must
          // not consume the isLede flag — the cap should land on the first real
          // body <p>, not be suppressed by a sidebar-as-first-element.
          // Three explicit clauses replace the broad !p.closest('aside') that
          // was used previously:
          //   !p.closest('aside.pullquote') — pull quote block
          //   !p.closest('.footnotes')      — GFM footnote list
          //   !p.closest('aside.sidenote')  — sidenote margin note
          // (Drop-cap gate narrowing per user spec — all three confirmed.)
          if (isLede && dropCap !== false && !p.closest('aside.pullquote') && !p.closest('.footnotes') && !p.closest('aside.sidenote')) {
            isLede = false; // consume the lede slot regardless of outcome

            // Find the first Unicode letter in the paragraph text.
            const firstLetterMatch = text.match(/\p{L}/u);
            if (!firstLetterMatch) {
              // No letter at all — skip the cap, warn, proceed to normal layout.
              warnings.push(`${postPath}: lede has no Unicode letter — drop cap skipped`);
            } else {
              const firstChar = text[0]!; // always take text[0] per Decision 2
              const firstLetterChar = firstLetterMatch[0];
              const firstLetterIndex = text.indexOf(firstLetterChar);

              // Warn if lede starts with punctuation/quote/dash (first char is not a letter).
              if (firstLetterIndex > 0) {
                warnings.push(
                  `${postPath}: lede starts with punctuation '${firstChar}' — drop cap takes the first character regardless. Hanging punctuation is deferred to v2.`,
                );
              }

              // Check that the cap character is within Basic Latin / Latin Extended.
              // Skip the cap (with warning) for CJK, Arabic, etc.
              const capCodePoint = firstChar.codePointAt(0) ?? 0;
              const isBasicLatinOrExtended = capCodePoint <= 0x024F; // Latin Extended-B upper bound
              if (!isBasicLatinOrExtended) {
                warnings.push(
                  `${postPath}: lede first character '${firstChar}' (U+${capCodePoint.toString(16).toUpperCase().padStart(4, '0')}) is outside Basic Latin / Latin Extended — drop cap skipped`,
                );
                // Fall through to normal layout below (after the if block).
              } else {
                // --- Inject the cap span so Chromium can measure its float box. ---
                // We temporarily mutate the paragraph, force layout, then rebuild innerHTML.
                const capChar = firstChar;

                // Inject cap span as first child; the rest of paragraph text follows.
                // We need to strip the cap char from the paragraph's text content.
                // Build a temporary structure: capSpan + rest of original content.
                const originalHTML = p.innerHTML;

                // Strip the leading cap character from the paragraph's text.
                // Strategy: walk child nodes and remove the first character from the
                // first text node encountered. This handles both plain-text paragraphs
                // and rich-inline paragraphs whose first child is a text node.
                p.className = p.className ? `${p.className} lede` : 'lede';

                // Inject the cap span as a temporary placeholder to measure it.
                const capSpan = document.createElement('span');
                capSpan.className = 'drop-cap';
                capSpan.setAttribute('aria-hidden', 'true');
                capSpan.textContent = capChar;
                p.insertBefore(capSpan, p.firstChild);

                // Force synchronous layout so getBoundingClientRect reflects the float.
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                p.offsetHeight;

                const capRect = capSpan.getBoundingClientRect();
                const capWidth = capRect.width;
                const capHeight = capRect.height;

                // Remove the temporary cap span — we'll rebuild innerHTML from scratch.
                p.removeChild(capSpan);
                // Restore original HTML for the item-extraction phase.
                p.innerHTML = originalHTML;

                // capRect.width is the border-box width from getBoundingClientRect(),
                // which already includes the CSS padding-right: 0.08em on .drop-cap.
                // Do NOT add padding again — that double-counted ~6.6px and over-shrunk
                // every cap-adjacent line.
                const capFloatWidth = capWidth;

                // Strip the leading cap character from items (rich-inline) or text (flat).
                // For rich-inline: remove the first character from the first item's text.
                // For flat: slice the first character from the plain text string.

                let strippedText = text.slice(capChar.length);
                let strippedItems: Array<{ text: string; font: string }> = [];
                let strippedItemMeta: ItemMeta[] = [];

                if (offendingTag === null && items.length > 0) {
                  // Re-derive items from the original HTML (without any cap span).
                  const freshItems: Array<{ text: string; font: string }> = [];
                  const freshItemMeta: ItemMeta[] = [];
                  for (const child of Array.from(p.childNodes)) {
                    walkNode(child, [], baseFamily, baseFontSize, freshItems, freshItemMeta);
                  }

                  if (freshItems.length > 0) {
                    // Strip the cap character from the front of the first item.
                    const first = freshItems[0]!;
                    const stripped = first.text.slice(capChar.length);
                    if (stripped.length > 0) {
                      strippedItems = [{ text: stripped, font: first.font }, ...freshItems.slice(1)];
                      strippedItemMeta = freshItemMeta; // indices unchanged (first item still index 0)
                    } else {
                      // First item was exactly the cap char — drop it entirely.
                      strippedItems = freshItems.slice(1);
                      strippedItemMeta = freshItemMeta.slice(1);
                    }
                  }
                }

                // ---- Variable-width streaming layout ----
                // Lines beside the cap (y < capHeight) are narrowed by capFloatWidth.
                // Lines below the cap get the full resolvedWidth.

                const hasInlineElementsCap = Array.from(p.childNodes).some(
                  (n) => n.nodeType === Node.ELEMENT_NODE,
                );

                // Minimum narrowed width: never less than 40px (prevents degenerate layout).
                const MIN_WIDTH = 40;

                /**
                 * Run the variable-width flat layout loop and return inner line strings.
                 * Used by both the drop-cap flat normal path and the fallback path.
                 * The orphan guard calls this with SHY-stripped variants of `src`.
                 */
                function layoutCapFlat(src: string): string[] {
                  const _prepared = pt.prepareWithSegments(src, resolvedFont);
                  let _cursor = { segmentIndex: 0, graphemeIndex: 0 };
                  let _y = 0;
                  const _lines: string[] = [];
                  while (true) {
                    const _w = _y < capHeight
                      ? Math.max(MIN_WIDTH, resolvedWidth - capFloatWidth)
                      : resolvedWidth;
                    const _range = pt.layoutNextLineRange(_prepared, _cursor, _w);
                    if (_range === null) break;
                    const _line = pt.materializeLineRange(_prepared, _range);
                    _lines.push(escapeHTML(_line.text.trimEnd()));
                    _cursor = _range.end;
                    _y += resolvedLineHeight;
                  }
                  return _lines;
                }

                /**
                 * Run the variable-width rich-inline layout loop and return inner line HTML.
                 */
                function layoutCapRich(srcItems: Array<{ text: string; font: string }>): string[] {
                  const _prepared = ri.prepareRichInline(srcItems);
                  let _cursor: any = undefined;
                  let _y = 0;
                  const _lines: string[] = [];
                  while (true) {
                    const _w = _y < capHeight
                      ? Math.max(MIN_WIDTH, resolvedWidth - capFloatWidth)
                      : resolvedWidth;
                    const _range = ri.layoutNextRichInlineLineRange(_prepared, _w, _cursor);
                    if (_range === null) break;
                    const _line = ri.materializeRichInlineLineRange(_prepared, _range);
                    _lines.push(buildLineHTML(_line.fragments, strippedItemMeta));
                    _cursor = _range.end;
                    _y += resolvedLineHeight;
                  }
                  return _lines;
                }

                let guardedInners: string[];

                if (offendingTag !== null) {
                  // Drop cap on a fallback-path paragraph (has unsupported inline element).
                  // This is unusual but possible. Use flat-pretext for the body.
                  warnings.push(
                    `${postPath}: unsupported inline element <${offendingTag.toLowerCase()}> in lede — drop cap uses flat-pretext fallback for body lines`,
                  );
                  const brSafeText = p.innerHTML
                    .replace(/<br\s*\/?>/gi, ' ')
                    .replace(/<[^>]+>/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  strippedText = (brSafeText || text).slice(capChar.length);
                  // Orphan guard wraps the variable-width flat layout.
                  guardedInners = guardFlat(strippedText, layoutCapFlat, currentParaIdx);
                } else if (!hasInlineElementsCap || strippedItems.length === 0) {
                  // Flat path — plain paragraph or items collapsed to empty.
                  // Orphan guard wraps the variable-width flat layout.
                  guardedInners = guardFlat(strippedText, layoutCapFlat, currentParaIdx);
                } else {
                  // Rich-inline path — use layoutNextRichInlineLineRange.
                  // Orphan guard wraps the variable-width rich-inline layout.
                  guardedInners = guardRich(strippedItems, layoutCapRich, currentParaIdx);
                }

                // Reconstruct final paragraph HTML.
                // Use buildLineSpansHTML so sidenote markers land inside the last
                // span (inline) rather than after all block spans (anonymous block).
                const capHTML =
                  `<span class="drop-cap" aria-hidden="true">${escapeHTML(capChar)}</span>` +
                  `<span class="visually-hidden">${escapeHTML(capChar)}</span>`;
                const lineSpansHTML = buildLineSpansHTML(guardedInners, markerHTMLs);
                const lineHTMLs = guardedInners; // length still needed for totalLines
                p.innerHTML = capHTML + lineSpansHTML;
                totalLines += lineHTMLs.length;
                continue; // done with this paragraph — skip normal dispatch below
              }
            }
          } else {
            // Not lede (or dropCap===false) — mark isLede consumed for first real para,
            // but only if this paragraph is NOT inside a pull quote, footnote list,
            // or sidenote. All three must not consume the isLede flag.
            if (isLede && !p.closest('aside.pullquote') && !p.closest('.footnotes') && !p.closest('aside.sidenote')) isLede = false;
          }

          // ---- Normal dispatch (non-lede paragraphs, or lede with skipped cap) ----

          if (offendingTag !== null) {
            // Branch B: flat-pretext fallback — collect warning for Node-side logging.
            warnings.push(
              `${postPath}: unsupported inline element <${offendingTag.toLowerCase()}> — falling back to plain pretext for this paragraph`,
            );
            // Replace <br> variants with a space before stripping tags, so adjacent
            // words around a <br> don't fuse (e.g. "hard break" not "hardbreak").
            // textContent strips all tags without inserting any separator, so we
            // derive a plain-text string from innerHTML instead.
            const brSafeText = p.innerHTML
              .replace(/<br\s*\/?>/gi, ' ')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            const brSafeSource = brSafeText || text;
            // Orphan guard wraps the flat fixed-width layout.
            const guardedBrLines = guardFlat(
              brSafeSource,
              (src) => {
                const _p = pt.prepareWithSegments(src, resolvedFont);
                const { lines: _l } = pt.layoutWithLines(_p, resolvedWidth, resolvedLineHeight);
                return (_l as Array<{ text: string }>).map(l => escapeHTML(l.text.trimEnd()));
              },
              currentParaIdx,
            );
            p.innerHTML = buildLineSpansHTML(guardedBrLines, markerHTMLs);
            totalLines += guardedBrLines.length;
            continue;
          }

          if (items.length === 0) continue;

          // Check whether we actually have any inline element children (not just text)
          const hasInlineElements = Array.from(p.childNodes).some(
            (n) => n.nodeType === Node.ELEMENT_NODE,
          );

          if (!hasInlineElements) {
            // Plain paragraph — use the fast flat path with orphan guard.
            const guardedFlatLines = guardFlat(
              text,
              (src) => {
                const _p = pt.prepareWithSegments(src, resolvedFont);
                const { lines: _l } = pt.layoutWithLines(_p, resolvedWidth, resolvedLineHeight);
                return (_l as Array<{ text: string }>).map(l => escapeHTML(l.text.trimEnd()));
              },
              currentParaIdx,
            );
            p.innerHTML = buildLineSpansHTML(guardedFlatLines, markerHTMLs);
            totalLines += guardedFlatLines.length;
            continue;
          }

          // Branch A: rich-inline path with orphan guard.
          const guardedRichLines = guardRich(
            items,
            (srcItems) => {
              const _p = ri.prepareRichInline(srcItems);
              const _lines: string[] = [];
              ri.walkRichInlineLineRanges(_p, resolvedWidth, (range: any) => {
                const line = ri.materializeRichInlineLineRange(_p, range);
                _lines.push(buildLineHTML(line.fragments, itemMeta));
              });
              return _lines;
            },
            currentParaIdx,
          );
          p.innerHTML = buildLineSpansHTML(guardedRichLines, markerHTMLs);
          totalLines += guardedRichLines.length;
        }

        // Return only the inner HTML of the container — the caller splices this
        // back into the real post HTML. Warnings are returned synchronously to
        // avoid the async page.on('console') timing problem.
        return {
          html: container.innerHTML,
          lineCount: totalLines,
          paragraphCount: paragraphs.length,
          warnings,
        };
      },
      { fontShorthand: options.fontShorthand, maxWidth: options.maxWidth, lineHeight: options.lineHeight, postPath: options.postPath ?? '', dropCap: options.dropCap },
    );

    // Emit any fallback warnings collected inside the browser context.
    // Done here (Node side) so they're synchronous and guaranteed to flush.
    for (const w of result.warnings) {
      process.stderr.write(`[pilcrow] ${w}\n`);
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
