/**
 * BrowserRenderer — pretext typesetting in the user's own browser.
 *
 * Promotes the Day-1 spike (`src/scripts/spike-pretext-browser.ts`) into a
 * production renderer that implements the `TypesetRenderer` interface. The
 * Playground lives entirely in the user's browser — no Playwright, no
 * server-side Chromium, no backend. The user's browser IS the runtime.
 *
 * Lifecycle:
 *   const r = new BrowserRenderer();
 *   await r.open();   // no-op: nothing to launch
 *   const out = await r.typeset(html, options);
 *   await r.close();  // no-op
 *
 * Implementation strategy: mirror the production Playwright pipeline
 * (`packages/pilcrow-typeset/src/playwright.ts`) feature-for-feature so the
 * output is byte-identical to the deployed post when inputs match. Three
 * structural concerns map across:
 *
 *   (a) Column width — read from `--prose-measure` on `.post-body` via
 *       `getComputedStyle()`. The CSS custom property is the single source of
 *       truth (set in `public/styles/global.css`). Hard-error if absent.
 *
 *   (b) Drop-cap float-aware narrowing — port the variable-width streaming
 *       loops (`layoutNextLineRange` / `layoutNextRichInlineLineRange`) so
 *       lines beside the floated cap (`y < capHeight`) are narrowed by the
 *       cap's measured float width. The drop-cap gate matches production:
 *       `!p.closest('aside.pullquote') && !p.closest('.footnotes') &&
 *       !p.closest('aside.sidenote')`.
 *
 *   (c) SHY pre-pass — Hyphenopoly soft-hyphen injection runs before pretext
 *       sees the text via `./hyphenate-browser.ts`. The browser uses the
 *       programmatic `hyphenopoly.module.js` entrypoint with a fetch-based
 *       loader; pattern wasm is shipped at `/_hyphenopoly/en-gb.wasm`. The
 *       engine initialises lazy on the first `typeset()` call (NOT on import
 *       or page load) so the playground's initial paint stays under the
 *       2-second budget. Same parameters as Node side: en-gb, leftmin 3,
 *       rightmin 3, minWordLength 6, compound 'auto'.
 *
 * The non-renderer pieces (rich-inline dispatch, sidenote-marker preservation,
 * orphan-guard wrapper) are ported from `playwright.ts` line-for-line. Any
 * future fix to those routines should be made in BOTH files until pretext
 * #162 (`softHyphenMode: 'strict'`) lands and the orphan guard is removed.
 */

import type { TypesetOptions, TypesetRenderer } from '../../../packages/pilcrow-typeset/src/renderer.js';

// Bare-specifier imports are allowed here because BrowserRenderer is loaded
// from a non-`is:inline` `<script>` tag — Astro/Vite resolves the specifier
// and emits a real client chunk. (See spike findings learning, 2026-05-06.)
import * as pretext from '@chenglou/pretext';
import * as richInline from '@chenglou/pretext/rich-inline';
import { hyphenateInBrowser } from './hyphenate-browser.js';

// ─── Types mirrored from the page.evaluate() block in playwright.ts ─────────

interface PretextLayoutModule {
  prepareWithSegments(text: string, fontShorthand: string): unknown;
  layoutWithLines(prepared: unknown, maxWidth: number, lineHeight: number): { lines: Array<{ text: string }> };
  layoutNextLineRange(prepared: unknown, cursor: unknown, width: number): unknown | null;
  materializeLineRange(prepared: unknown, range: unknown): { text: string };
}

interface RichInlineModule {
  prepareRichInline(items: Array<{ text: string; font: string }>): unknown;
  walkRichInlineLineRanges(prepared: unknown, width: number, cb: (range: unknown) => void): void;
  layoutNextRichInlineLineRange(prepared: unknown, width: number, cursor: unknown): unknown | null;
  materializeRichInlineLineRange(prepared: unknown, range: unknown): {
    fragments: Array<{ itemIndex: number; text: string; gapBefore: number }>;
  };
}

interface PretextLineRange {
  end: { segmentIndex: number; graphemeIndex: number };
}

interface RichInlineLineRange {
  end: unknown;
}

const pt = pretext as unknown as PretextLayoutModule;
const ri = richInline as unknown as RichInlineModule;

// Whitelist of inline element tag names eligible for the rich-inline branch.
const WHITELIST = new Set(['EM', 'STRONG', 'A', 'CODE', 'SUB', 'SUP']);

// Monospace family — must match `code { font-family }` in global.css.
const MONO_FAMILY = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

// Soft hyphen character used for hyphenation candidates.
const SHY = '­';

// ─── Pure helpers (port of `escapeHTML`, `normaliseFontFamily`, etc.) ────────

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normaliseFontFamily(family: string): string {
  const first = family.split(',')[0]!.trim().replace(/^['"]|['"]$/g, '');
  return first.includes(' ') ? `"${first}"` : first;
}

function rawText(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function leadingWordLen(lineHTML: string): number {
  const plain = rawText(lineHTML).trimStart();
  const m = plain.match(/^(\S+)/);
  if (!m) return 0;
  return m[1]!.replace(/[.,!?;:]+$/, '').length;
}

function stripAt(text: string, pos: number): string {
  return text.slice(0, pos) + text.slice(pos + 1);
}

// ─── DOM walker (port of walkNode) ──────────────────────────────────────────

interface TagEntry {
  tag: string;
  attrs: Record<string, string>;
}
interface ItemMeta {
  tags: TagEntry[];
}

/**
 * Walk a DOM node tree depth-first and collect:
 *   items:    flat RichInlineItem[] for prepareRichInline
 *   itemMeta: parallel array of tag-stack info for each item
 *
 * Returns null on success, or the tag name of the first non-whitelisted
 * element encountered (signals fallback to flat-pretext for this paragraph).
 */
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

    let fontStyle = 'normal';
    let fontWeight = '400';
    let fontFamily = baseFont;
    let fontSize = baseFontSize;
    let isCode = false;

    for (const entry of tagStack) {
      if (entry.tag === 'EM') {
        fontStyle = 'italic';
      } else if (entry.tag === 'STRONG') {
        fontWeight = '700';
      } else if (entry.tag === 'CODE') {
        isCode = true;
      } else if (entry.tag === 'SUB' || entry.tag === 'SUP') {
        fontSize = Math.round(baseFontSize * 0.75);
      }
    }

    if (isCode) {
      const monoFirst = MONO_FAMILY.split(',')[0]!.trim().replace(/^['"]|['"]$/g, '');
      fontFamily = `"${monoFirst}"`;
      fontSize = Math.round(baseFontSize * 0.9);
    }

    const itemFont = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    items.push({ text, font: itemFont });
    itemMeta.push({ tags: [...tagStack] });
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName;

    if (!WHITELIST.has(tag)) return tag;

    const attrs: Record<string, string> = {};
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i]!;
      attrs[attr.name] = attr.value;
    }

    const newStack: TagEntry[] = [...tagStack, { tag, attrs }];
    for (const child of Array.from(el.childNodes)) {
      const err = walkNode(child, newStack, baseFont, baseFontSize, items, itemMeta);
      if (err !== null) return err;
    }
    return null;
  }

  return null;
}

/**
 * Build HTML for one rich-inline line from its fragments + itemMeta.
 * Each fragment is wrapped in the tag stack for that item, innermost first.
 * Restores collapsed boundary gaps as plain spaces (rich-inline tracks them
 * as `gapBefore` widths, not text).
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
    const fragText = fi === fragments.length - 1 ? frag.text.trimEnd() : frag.text;
    let inner = escapeHTML(fragText);

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

    if (fi > 0 && frag.gapBefore > 0) html += ' ';
    html += inner;
  }
  return html;
}

/**
 * Build the joined HTML of <span class="pt-line"> elements, injecting
 * sidenote marker HTML (if any) into the LAST span rather than appending
 * after all spans (avoids CSS anonymous-block wrapping).
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

// ─── Orphan guard (port of guardFlat / guardRich) ────────────────────────────

const ORPHAN_THRESHOLD = 4;
const RIGHTMIN = 3;

function firstOrphanIdx(lineInners: string[]): number {
  for (let i = 0; i < lineInners.length - 1; i++) {
    const t = rawText(lineInners[i]!).trimEnd();
    const nextLen = leadingWordLen(lineInners[i + 1]!);
    if (nextLen <= 0) continue;

    if (t.endsWith('-')) {
      if (nextLen < ORPHAN_THRESHOLD) return i;
      continue;
    }
    const packedMatch = t.match(/-([a-zA-ZÀ-ɏ]{1,7})$/);
    if (packedMatch) {
      if (nextLen < RIGHTMIN) return i;
    }
  }
  return -1;
}

const LITERAL_HYPHEN_BREAK = null;

function findOrphanSHYPos(sourceText: string, lineInners: string[], orphanLine: number): number | null {
  const lineN = rawText(lineInners[orphanLine]!).trimEnd();
  const hyphenIdx = lineN.lastIndexOf('-');
  if (hyphenIdx < 0) return -1;
  const beforeHyphen = lineN.slice(0, hyphenIdx);
  const lastSpaceIdx = beforeHyphen.lastIndexOf(' ');
  const stem = beforeHyphen.slice(lastSpaceIdx + 1);
  if (!stem) return -1;
  const shyPattern = stem + SHY;
  if (sourceText.indexOf(shyPattern) >= 0) {
    return sourceText.indexOf(shyPattern) + stem.length;
  }
  const literalPattern = stem + '-';
  if (sourceText.indexOf(literalPattern) >= 0) {
    return LITERAL_HYPHEN_BREAK;
  }
  return -1;
}

function guardFlat(
  sourceText: string,
  layoutFn: (t: string) => string[],
  paraIdx: number,
  warnings: string[],
  postPath: string,
): string[] {
  let lines = layoutFn(sourceText);
  let orphanLine = firstOrphanIdx(lines);
  if (orphanLine < 0) return lines;

  let workText = sourceText;
  const maxTries = (sourceText.match(/­/g) ?? []).length + 1;

  for (let attempt = 0; attempt < maxTries && orphanLine >= 0; attempt++) {
    const shyPosResult = findOrphanSHYPos(workText, lines, orphanLine);
    if (shyPosResult === LITERAL_HYPHEN_BREAK) return lines;
    let shyPos = shyPosResult;
    if (shyPos < 0) shyPos = workText.indexOf(SHY);
    if (shyPos < 0) break;

    workText = stripAt(workText, shyPos);
    lines = layoutFn(workText);
    orphanLine = firstOrphanIdx(lines);
    if (orphanLine < 0) return lines;
  }

  const plain = workText.replace(/­/g, '');
  warnings.push(`${postPath}: paragraph ${paraIdx} orphan guard: unrecoverable — stripped all soft hyphens (ragged fallback)`);
  return layoutFn(plain);
}

interface RichOrphanTarget {
  itemIdx: number;
  posInItem: number;
}
interface LiteralHyphenSentinel {
  literalHyphen: true;
}

function guardRich(
  sourceItems: Array<{ text: string; font: string }>,
  layoutFn: (it: Array<{ text: string; font: string }>) => string[],
  paraIdx: number,
  warnings: string[],
  postPath: string,
): string[] {
  let lines = layoutFn(sourceItems);
  let orphanLine = firstOrphanIdx(lines);
  if (orphanLine < 0) return lines;

  function flattenItems(items: Array<{ text: string; font: string }>): string {
    return items.map((it) => it.text).join('');
  }

  const LITERAL_HYPHEN_SENTINEL: LiteralHyphenSentinel = { literalHyphen: true };

  function findRichOrphanSHY(
    items: Array<{ text: string; font: string }>,
    orphanLines: string[],
    orphanLineIdx: number,
  ): RichOrphanTarget | LiteralHyphenSentinel | null {
    const combined = flattenItems(items);
    const shyPos = findOrphanSHYPos(combined, orphanLines, orphanLineIdx);
    if (shyPos === LITERAL_HYPHEN_BREAK) return LITERAL_HYPHEN_SENTINEL;
    if (shyPos < 0) return null;

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
      idx === itemIdx ? { text: stripAt(it.text, posInItem), font: it.font } : it,
    );
  }

  let workItems = sourceItems.map((it) => ({ ...it }));
  const totalSHYs = workItems.reduce((s, it) => s + (it.text.match(/­/g) ?? []).length, 0);
  const maxTries = totalSHYs + 1;

  for (let attempt = 0; attempt < maxTries && orphanLine >= 0; attempt++) {
    const target = findRichOrphanSHY(workItems, lines, orphanLine);
    if (target !== null && 'literalHyphen' in target) return lines;
    if (target !== null) {
      workItems = stripRichSHY(workItems, target.itemIdx, target.posInItem);
    } else {
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

    lines = layoutFn(workItems);
    orphanLine = firstOrphanIdx(lines);
    if (orphanLine < 0) return lines;
  }

  const noHyphItems = workItems.map((it) => ({ text: it.text.replace(/­/g, ''), font: it.font }));
  warnings.push(`${postPath}: paragraph ${paraIdx} orphan guard (rich-inline): unrecoverable — stripped all soft hyphens`);
  return layoutFn(noHyphItems);
}

// ─── Column-width derivation (3a) ────────────────────────────────────────────

/**
 * Read the body prose column width from `--prose-measure` on the live
 * `.post-body` element, then return its computed pixel value.
 *
 * The CSS custom property is the single source of truth (set in
 * `public/styles/global.css` — architecture invariant 2). In production,
 * `playwright.ts::readMeasurementCSS()` parses the CSS file at build time;
 * in the browser, we read the same property off the rendered DOM via
 * `getComputedStyle`. Same source, different reader.
 *
 * To convert `ch` → `px`, we attach a hidden probe element with
 * `width: var(--prose-measure)` to `.post-body` (so it inherits the body
 * font), measure its `clientWidth`, then remove it.
 *
 * Hard-errors when `--prose-measure` is absent — silent fallback is forbidden.
 */
function resolveProseMeasurePx(postBody: HTMLElement): number {
  const csBody = getComputedStyle(postBody);
  const proseMeasureRaw = csBody.getPropertyValue('--prose-measure').trim();
  if (!proseMeasureRaw) {
    throw new Error(
      '[pilcrow] BrowserRenderer: --prose-measure is missing from .post-body. ' +
      'Add `--prose-measure: 65ch;` (or the desired prose column width) to the .post-body rule in global.css.',
    );
  }
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:${proseMeasureRaw};`;
  postBody.appendChild(probe);
  // Force layout so clientWidth reflects the resolved px value of the unit.
  const width = probe.clientWidth;
  probe.remove();
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`[pilcrow] BrowserRenderer: --prose-measure resolved to non-positive px (${width}) — check global.css`);
  }
  return width;
}

// ─── BrowserRenderer ────────────────────────────────────────────────────────

export class BrowserRenderer implements TypesetRenderer {
  /** Detect Intl.Segmenter availability — Firefox 125+ gate. */
  static isSupported(): boolean {
    return typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function';
  }

  async open(): Promise<void> {
    if (!BrowserRenderer.isSupported()) {
      throw new Error(
        '[pilcrow] BrowserRenderer: Intl.Segmenter is not available. ' +
        'Pretext requires it for grapheme/word segmentation. ' +
        'Update to a browser version released April 2024 or later (Firefox 125+, all current Chrome/Safari/Edge).',
      );
    }
    // The user's browser is the runtime — nothing to launch. Wait for fonts
    // to settle so canvas measurement uses the configured typeface (same gate
    // playwright.ts uses; see spike findings).
    await document.fonts.ready;
  }

  async close(): Promise<void> {
    // No-op: nothing to tear down. Method exists to satisfy TypesetRenderer.
  }

  async typeset(
    html: string,
    options: TypesetOptions,
  ): Promise<{ html: string; lineCount: number; paragraphCount: number }> {
    if (!BrowserRenderer.isSupported()) {
      throw new Error('[pilcrow] BrowserRenderer.typeset(): Intl.Segmenter unavailable — call open() first to surface the diagnostic.');
    }

    // SHY pre-pass — Hyphenopoly soft-hyphen injection. Lazy-init on first
    // call (idempotent thereafter). Pipeline order mirrors playwright.ts:
    //   1. SHY-injection (here)
    //   2. pretext.prepareWithSegments (below)
    //   3. pretext.layoutWithLines (below)
    const bodyHTML = await hyphenateInBrowser(html);

    // Mount the body in a hidden, off-screen `.post-body` so we can run the
    // same getComputedStyle / getBoundingClientRect probes the production
    // pipeline uses inside Playwright. The host element is a direct child of
    // `<body>` so it inherits global.css unchanged.
    const host = document.createElement('div');
    host.className = 'post-body';
    host.setAttribute('aria-hidden', 'true');
    // visibility:hidden keeps layout intact (so widths/heights are real) but
    // removes the element from a11y / paint. position:absolute pulls it out
    // of flow so it doesn't shift the page during typesetting.
    host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
    host.innerHTML = bodyHTML;
    document.body.appendChild(host);

    try {
      // (3a) Column width — read from --prose-measure on the mounted .post-body
      // as a hard-error invariant check (single-source-of-truth contract). The
      // *actual* per-paragraph width comes from `p.clientWidth` inside the loop
      // below, mirroring playwright.ts:930 — this is required for correct
      // narrowing of paragraphs inside containers that override the prose width
      // (aside.sidenote 25ch, .pullquote 50ch, .footnotes p inherits, etc.).
      const proseMeasurePx = resolveProseMeasurePx(host);
      const resolvedWidthOverride = options.maxWidth || 0;

      // Resolve a probe paragraph for default font / lineHeight derivation.
      // Falls through to the first existing <p> if present, else creates one.
      const probeP = host.querySelector('p') ?? (() => {
        const p = document.createElement('p');
        p.textContent = 'probe';
        host.appendChild(p);
        return p;
      })();
      const probeCS = getComputedStyle(probeP);
      const baseFamilyForCanvas = normaliseFontFamily(probeCS.fontFamily);
      const baseFontSizePx = parseFloat(probeCS.fontSize);
      const lineHeightPx =
        options.lineHeight ||
        (parseFloat(probeCS.lineHeight) || baseFontSizePx * 1.7);
      const fontShorthandDefault =
        options.fontShorthand ||
        `${probeCS.fontStyle} ${probeCS.fontWeight} ${probeCS.fontSize} ${baseFamilyForCanvas}`;

      const postPath = options.postPath ?? '';
      const dropCap = options.dropCap;

      const paragraphs = Array.from(host.querySelectorAll<HTMLElement>('p'));
      let totalLines = 0;
      const warnings: string[] = [];

      let isLede = true;
      let paraIdx = 0;

      for (const p of paragraphs) {
        const text = p.textContent ?? '';
        if (!text.trim()) continue;
        const currentParaIdx = paraIdx++;

        // Sidenote marker preservation — extract <sup class="sidenote-marker">
        // outerHTML before mutating innerHTML, then re-inject inside the LAST
        // pt-line span via buildLineSpansHTML.
        const markerSups = Array.from(
          p.querySelectorAll<HTMLElement>('sup.sidenote-marker'),
        );
        const markerHTMLs: string[] = markerSups.map((sup) => sup.outerHTML);

        const cs = getComputedStyle(p);
        const baseFamily = normaliseFontFamily(cs.fontFamily);
        const baseFontSize = parseFloat(cs.fontSize);
        const resolvedFont = options.fontShorthand ||
          `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${baseFamily}` ||
          fontShorthandDefault;
        const resolvedLineHeight = options.lineHeight ||
          (parseFloat(cs.lineHeight) || baseFontSize * 1.7) ||
          lineHeightPx;

        // Per-paragraph column width — mirrors playwright.ts:930.
        // Uses `p.clientWidth` so paragraphs inside narrowed containers
        // (aside.sidenote 25ch, .pullquote 50ch, .footnotes 65ch) layout
        // at their actual rendered geometry. Falls back to the prose-measure-
        // derived px when a paragraph has no clientWidth (e.g. detached probe).
        const resolvedWidth = resolvedWidthOverride || p.clientWidth || proseMeasurePx;

        // Build flat / rich-inline item arrays via the DOM walker.
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

        // ─── Drop-cap branch (lede only) (3b) ─────────────────────────────
        // Drop-cap gates: paragraphs inside pull quotes, footnotes, or
        // sidenotes must NOT consume the lede slot — the cap should land on
        // the first real body <p>. Three explicit clauses (architecture
        // invariant — see CLAUDE.md):
        //   !p.closest('aside.pullquote') — pull quote block
        //   !p.closest('.footnotes')      — GFM footnote list
        //   !p.closest('aside.sidenote')  — sidenote margin note
        if (
          isLede &&
          dropCap !== false &&
          !p.closest('aside.pullquote') &&
          !p.closest('.footnotes') &&
          !p.closest('aside.sidenote')
        ) {
          isLede = false;

          const firstLetterMatch = text.match(/\p{L}/u);
          if (!firstLetterMatch) {
            warnings.push(`${postPath}: lede has no Unicode letter — drop cap skipped`);
          } else {
            const firstChar = text[0]!;
            const firstLetterChar = firstLetterMatch[0];
            const firstLetterIndex = text.indexOf(firstLetterChar);

            if (firstLetterIndex > 0) {
              warnings.push(
                `${postPath}: lede starts with punctuation '${firstChar}' — drop cap takes the first character regardless. Hanging punctuation is deferred to v2.`,
              );
            }

            const capCodePoint = firstChar.codePointAt(0) ?? 0;
            const isBasicLatinOrExtended = capCodePoint <= 0x024f;
            if (!isBasicLatinOrExtended) {
              warnings.push(
                `${postPath}: lede first character '${firstChar}' (U+${capCodePoint.toString(16).toUpperCase().padStart(4, '0')}) is outside Basic Latin / Latin Extended — drop cap skipped`,
              );
            } else {
              // Inject a temporary cap span, force layout, measure float width
              // + height, then rebuild innerHTML from scratch.
              const capChar = firstChar;
              const originalHTML = p.innerHTML;
              p.className = p.className ? `${p.className} lede` : 'lede';

              const capSpan = document.createElement('span');
              capSpan.className = 'drop-cap';
              capSpan.setAttribute('aria-hidden', 'true');
              capSpan.textContent = capChar;
              p.insertBefore(capSpan, p.firstChild);

              // Force synchronous layout.
              // eslint-disable-next-line @typescript-eslint/no-unused-expressions
              p.offsetHeight;

              const capRect = capSpan.getBoundingClientRect();
              const capWidth = capRect.width;
              const capHeight = capRect.height;

              p.removeChild(capSpan);
              p.innerHTML = originalHTML;

              const capFloatWidth = capWidth;

              let strippedText = text.slice(capChar.length);
              let strippedItems: Array<{ text: string; font: string }> = [];
              let strippedItemMeta: ItemMeta[] = [];

              if (offendingTag === null && items.length > 0) {
                const freshItems: Array<{ text: string; font: string }> = [];
                const freshItemMeta: ItemMeta[] = [];
                for (const child of Array.from(p.childNodes)) {
                  walkNode(child, [], baseFamily, baseFontSize, freshItems, freshItemMeta);
                }
                if (freshItems.length > 0) {
                  const first = freshItems[0]!;
                  const stripped = first.text.slice(capChar.length);
                  if (stripped.length > 0) {
                    strippedItems = [{ text: stripped, font: first.font }, ...freshItems.slice(1)];
                    strippedItemMeta = freshItemMeta;
                  } else {
                    strippedItems = freshItems.slice(1);
                    strippedItemMeta = freshItemMeta.slice(1);
                  }
                }
              }

              const hasInlineElementsCap = Array.from(p.childNodes).some(
                (n) => n.nodeType === Node.ELEMENT_NODE,
              );

              const MIN_WIDTH = 40;

              const layoutCapFlat = (src: string): string[] => {
                const prepared = pt.prepareWithSegments(src, resolvedFont);
                let cursor: PretextLineRange['end'] = { segmentIndex: 0, graphemeIndex: 0 };
                let y = 0;
                const lines: string[] = [];
                while (true) {
                  const w = y < capHeight
                    ? Math.max(MIN_WIDTH, resolvedWidth - capFloatWidth)
                    : resolvedWidth;
                  const range = pt.layoutNextLineRange(prepared, cursor, w) as PretextLineRange | null;
                  if (range === null) break;
                  const line = pt.materializeLineRange(prepared, range);
                  lines.push(escapeHTML(line.text.trimEnd()));
                  cursor = range.end;
                  y += resolvedLineHeight;
                }
                return lines;
              };

              const layoutCapRich = (srcItems: Array<{ text: string; font: string }>): string[] => {
                const prepared = ri.prepareRichInline(srcItems);
                let cursor: unknown = undefined;
                let y = 0;
                const lines: string[] = [];
                while (true) {
                  const w = y < capHeight
                    ? Math.max(MIN_WIDTH, resolvedWidth - capFloatWidth)
                    : resolvedWidth;
                  const range = ri.layoutNextRichInlineLineRange(prepared, w, cursor) as RichInlineLineRange | null;
                  if (range === null) break;
                  const line = ri.materializeRichInlineLineRange(prepared, range);
                  lines.push(buildLineHTML(line.fragments, strippedItemMeta));
                  cursor = range.end;
                  y += resolvedLineHeight;
                }
                return lines;
              };

              let guardedInners: string[];

              if (offendingTag !== null) {
                warnings.push(
                  `${postPath}: unsupported inline element <${offendingTag.toLowerCase()}> in lede — drop cap uses flat-pretext fallback for body lines`,
                );
                const brSafeText = p.innerHTML
                  .replace(/<br\s*\/?>/gi, ' ')
                  .replace(/<[^>]+>/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                strippedText = (brSafeText || text).slice(capChar.length);
                guardedInners = guardFlat(strippedText, layoutCapFlat, currentParaIdx, warnings, postPath);
              } else if (!hasInlineElementsCap || strippedItems.length === 0) {
                guardedInners = guardFlat(strippedText, layoutCapFlat, currentParaIdx, warnings, postPath);
              } else {
                guardedInners = guardRich(strippedItems, layoutCapRich, currentParaIdx, warnings, postPath);
              }

              const capHTML =
                `<span class="drop-cap" aria-hidden="true">${escapeHTML(capChar)}</span>` +
                `<span class="visually-hidden">${escapeHTML(capChar)}</span>`;
              const lineSpansHTML = buildLineSpansHTML(guardedInners, markerHTMLs);
              p.innerHTML = capHTML + lineSpansHTML;
              totalLines += guardedInners.length;
              continue;
            }
          }
        } else {
          if (
            isLede &&
            !p.closest('aside.pullquote') &&
            !p.closest('.footnotes') &&
            !p.closest('aside.sidenote')
          ) {
            isLede = false;
          }
        }

        // ─── Normal dispatch ──────────────────────────────────────────────

        if (offendingTag !== null) {
          warnings.push(
            `${postPath}: unsupported inline element <${offendingTag.toLowerCase()}> — falling back to plain pretext for this paragraph`,
          );
          const brSafeText = p.innerHTML
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          const brSafeSource = brSafeText || text;
          const guardedBrLines = guardFlat(
            brSafeSource,
            (src) => {
              const prepared = pt.prepareWithSegments(src, resolvedFont);
              const { lines: ll } = pt.layoutWithLines(prepared, resolvedWidth, resolvedLineHeight);
              return ll.map((l) => escapeHTML(l.text.trimEnd()));
            },
            currentParaIdx,
            warnings,
            postPath,
          );
          p.innerHTML = buildLineSpansHTML(guardedBrLines, markerHTMLs);
          totalLines += guardedBrLines.length;
          continue;
        }

        if (items.length === 0) continue;

        const hasInlineElements = Array.from(p.childNodes).some(
          (n) => n.nodeType === Node.ELEMENT_NODE,
        );

        if (!hasInlineElements) {
          const guardedFlatLines = guardFlat(
            text,
            (src) => {
              const prepared = pt.prepareWithSegments(src, resolvedFont);
              const { lines: ll } = pt.layoutWithLines(prepared, resolvedWidth, resolvedLineHeight);
              return ll.map((l) => escapeHTML(l.text.trimEnd()));
            },
            currentParaIdx,
            warnings,
            postPath,
          );
          p.innerHTML = buildLineSpansHTML(guardedFlatLines, markerHTMLs);
          totalLines += guardedFlatLines.length;
          continue;
        }

        const guardedRichLines = guardRich(
          items,
          (srcItems) => {
            const prepared = ri.prepareRichInline(srcItems);
            const ll: string[] = [];
            ri.walkRichInlineLineRanges(prepared, resolvedWidth, (range) => {
              const line = ri.materializeRichInlineLineRange(prepared, range);
              ll.push(buildLineHTML(line.fragments, itemMeta));
            });
            return ll;
          },
          currentParaIdx,
          warnings,
          postPath,
        );
        p.innerHTML = buildLineSpansHTML(guardedRichLines, markerHTMLs);
        totalLines += guardedRichLines.length;
      }

      // Surface warnings via console — there is no Node stderr in the browser.
      for (const w of warnings) {
        // eslint-disable-next-line no-console
        console.warn(`[pilcrow] ${w}`);
      }

      const outHTML = host.innerHTML;
      return { html: outHTML, lineCount: totalLines, paragraphCount: paragraphs.length };
    } finally {
      host.remove();
    }
  }
}
