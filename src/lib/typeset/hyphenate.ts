/**
 * hyphenate.ts — Node-side Hyphenopoly integration for Pilcrow.
 *
 * Runs at build time (inside the Astro integration, before Playwright).
 * Injects U+00AD soft hyphens into paragraph HTML so pretext can break
 * long words at syllable boundaries. Zero runtime cost to the reader.
 *
 * Language:    en-gb only (v1)
 * Config:      leftmin 3, rightmin 3, minWordLength 6
 * Policy:      skip <code> entirely; apply normally in <em>, <strong>, <a>;
 *              apply in <sub>/<sup> only if textContent is NOT digits-only
 *              (footnote markers "1", "12" etc. never hyphenated; ordinals
 *              "th", "n", math "²" still evaluate normally)
 *
 * PILCROW_SKIP_TYPESET=1 naturally bypasses this module because typeset()
 * is never called, so hyphenateHTML() is never invoked. No bypass code needed.
 */

import { readFile } from 'node:fs/promises';
import hyphenopoly from 'hyphenopoly';

/** Soft hyphen character inserted at candidate break points. */
const SOFT_HYPHEN = '­';

// ─── Singleton init ──────────────────────────────────────────────────────────

let hyphenateText: ((text: string) => string) | null = null;
let initPromise: Promise<void> | null = null;

async function initHyphenopoly(): Promise<void> {
  const t0 = Date.now();

  const hyphenators = hyphenopoly.config({
    require: ['en-gb'],
    hyphen: SOFT_HYPHEN,
    minWordLength: 6,
    leftmin: 3, // raised from 2 — eliminates 2-char-left stubs like re-|ceives
    rightmin: 3,
    // "auto" tells Hyphenopoly not to append U+200B after the hyphen in
    // compound words like "proof-of-concept". Without this, Hyphenopoly's
    // default "hyphen" mode inserts ZWS which corrupts copy-paste in
    // .pt-line spans. Pretext reads U+00AD (our SOFT_HYPHEN) for breaks —
    // U+200B is never consumed and permanently contaminates the output.
    compound: 'auto',
    loader: async (file: string, patDir: URL) => {
      return readFile(new URL(file, patDir));
    },
  });

  // hyphenators is a Map<lang, Promise<hyphenateTextFn>>
  const fn = await (hyphenators as Map<string, Promise<(text: string) => string>>).get('en-gb');
  if (!fn) {
    throw new Error('[pilcrow] hyphenopoly: en-gb hyphenator did not resolve');
  }
  hyphenateText = fn;

  const elapsed = Date.now() - t0;
  process.stderr.write(`[pilcrow] hyphenopoly en-gb ready in ${elapsed}ms\n`);
  if (elapsed > 500) {
    process.stderr.write(
      `[pilcrow] WARNING: hyphenopoly init took ${elapsed}ms (>500ms) — flag for future investigation\n`,
    );
  }
}

/** Ensure Hyphenopoly is initialised exactly once (lazy singleton). */
async function ensureReady(): Promise<void> {
  if (hyphenateText !== null) return;
  if (initPromise === null) {
    initPromise = initHyphenopoly();
  }
  await initPromise;
}

// ─── HTML walker ─────────────────────────────────────────────────────────────

/**
 * Inject soft hyphens into the text content of an HTML string.
 *
 * Approach: single-pass regex-based tokeniser that splits the HTML into
 * tag tokens and text tokens. Tags are passed through verbatim; text tokens
 * outside a <code> context are hyphenated. <sub>/<sup> text is only
 * hyphenated if its total textContent length > 1 (single-char footnote
 * markers stay untouched — verified by tracking the innerText we've seen
 * since entering the element).
 *
 * This is intentionally simple. The HTML fed to this function is the inner
 * content of a single <p> paragraph — no <head>, no <script>. Deeply
 * nested structures and malformed HTML are not expected in Pilcrow content.
 */
export async function hyphenateHTML(html: string): Promise<string> {
  await ensureReady();
  const hyph = hyphenateText!;

  // Tokenise into alternating text / tag segments.
  // Regex: match a complete HTML tag (opening, closing, self-closing) OR
  // a run of non-tag characters.
  const TOKEN_RE = /(<[^>]+>|[^<]+)/g;

  // Stack of tag names that suppress hyphenation.
  // <code>: technical identifiers must not be hyphenated.
  // <cite>: author names and attribution text must not be hyphenated.
  // <h1>–<h6>: display type wants word-shape integrity (Butterick / Bringhurst).
  //   Headings at 65ch rarely wrap, so no false positives at normal viewport.
  //   At narrow viewports, words break at spaces rather than mid-syllable.
  //   Covers the GFM footnote <h2 class="sr-only"> artefact as a side effect.
  let codeDepth = 0;
  let citeDepth = 0;
  let headingDepth = 0;
  // <figcaption>: captions are short descriptive text; SHYs injected here are
  // latent (breaks don't fire at current widths) but add noise to the DOM.
  // Skip Hyphenopoly inside figcaption entirely, matching the code/cite/heading policy.
  let figcaptionDepth = 0;

  // We will rebuild the output in two passes:
  // Pass 1: collect tokens with decisions.
  // This is simpler than one-pass because sub/sup logic needs to know
  // the total text length after we have seen all the text inside.
  //
  // However, for v1 simplicity we make the sub/sup decision eagerly using
  // a pre-scan: scan the sub/sup innerHTML to count its text length before
  // the main pass. This avoids a two-pass architecture.
  //
  // Strategy: for each <sub> or <sup> opening tag encountered, look ahead
  // to find the matching close tag and measure the text content inside.
  // Cache the result keyed by position in the string.

  /** Map from tag-start position → whether to hyphenate (sub/sup only). */
  const subSupHyphenate = new Map<number, boolean>();

  // Pre-scan for sub/sup elements.
  const PRE_SCAN_RE = /<(sub|sup)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let preScanMatch: RegExpExecArray | null;
  while ((preScanMatch = PRE_SCAN_RE.exec(html)) !== null) {
    const innerText = preScanMatch[3].replace(/<[^>]+>/g, '');
    // D7: skip sub/sup entirely if its text content is digits-only (footnote
    // markers like "1", "12" must never be hyphenated regardless of length).
    // Non-digit superscripts (ordinals "th", "n", math "²") still evaluate
    // normally — they will be hyphenated if the text content is long enough
    // for Hyphenopoly's minWordLength to apply.
    const shouldHyphenate = !/^\d+$/.test(innerText);
    subSupHyphenate.set(preScanMatch.index, shouldHyphenate);
  }

  // We need a second index to map opening-tag positions to decisions.
  // Re-scan just for opening sub/sup tags to find their positions.
  const SUBSUP_OPEN_RE = /<(sub|sup)([^>]*)>/gi;
  let subSupOpenMatch: RegExpExecArray | null;
  const subSupOpenPositions = new Map<number, boolean>();
  while ((subSupOpenMatch = SUBSUP_OPEN_RE.exec(html)) !== null) {
    // Find the nearest pre-scanned entry at or after this position.
    // Since the PRE_SCAN_RE matched from the start of <sub>/<sup> too,
    // we look for the matching entry.
    const pos = subSupOpenMatch.index;
    if (subSupHyphenate.has(pos)) {
      subSupOpenPositions.set(pos, subSupHyphenate.get(pos)!);
    }
  }

  // Track sub/sup suppression: stack of { shouldHyphenate }
  type SubSupState = { tag: string; shouldHyphenate: boolean };
  const subSupState: SubSupState[] = [];

  let result = '';
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(html)) !== null) {
    const token = match[0];
    const tokenStart = match.index;

    if (token[0] === '<') {
      // It's a tag — determine what to do.
      const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
      if (tagMatch) {
        const isClose = tagMatch[1] === '/';
        const tagName = tagMatch[2].toLowerCase();

        if (tagName === 'code') {
          if (!isClose) {
            codeDepth++;
          } else {
            codeDepth = Math.max(0, codeDepth - 1);
          }
        } else if (tagName === 'cite') {
          // Author names and attribution text inside <cite> must not be
          // hyphenated — a syllabic break mid-name is typographically wrong.
          if (!isClose) {
            citeDepth++;
          } else {
            citeDepth = Math.max(0, citeDepth - 1);
          }
        } else if (/^h[1-6]$/.test(tagName)) {
          // All heading levels — display type must not be broken mid-word.
          // Covers h1 (post title), h3–h6 (sub-headings), and the GFM
          // footnote <h2 class="sr-only"> where SHYs would be audible artefacts.
          if (!isClose) {
            headingDepth++;
          } else {
            headingDepth = Math.max(0, headingDepth - 1);
          }
        } else if (tagName === 'figcaption') {
          // Caption text is short and descriptive; SHYs are latent (breaks don't
          // fire at current widths) but add noise to the DOM. Skip entirely.
          if (!isClose) {
            figcaptionDepth++;
          } else {
            figcaptionDepth = Math.max(0, figcaptionDepth - 1);
          }
        } else if (tagName === 'sub' || tagName === 'sup') {
          if (!isClose) {
            const shouldHyphenate = subSupOpenPositions.get(tokenStart) ?? false;
            subSupState.push({ tag: tagName, shouldHyphenate });
          } else {
            if (subSupState.length > 0 && subSupState[subSupState.length - 1].tag === tagName) {
              subSupState.pop();
            }
          }
        }
      }
      result += token;
    } else {
      // It's a text node — decide whether to hyphenate.
      let shouldHyphenate = true;

      if (codeDepth > 0) {
        // Inside <code> — skip entirely
        shouldHyphenate = false;
      } else if (citeDepth > 0) {
        // Inside <cite> — skip entirely (author names must not be hyphenated)
        shouldHyphenate = false;
      } else if (headingDepth > 0) {
        // Inside <h1>–<h6> — skip entirely (display type must not be mid-word broken)
        shouldHyphenate = false;
      } else if (figcaptionDepth > 0) {
        // Inside <figcaption> — skip entirely (captions are short; latent SHYs add noise)
        shouldHyphenate = false;
      } else if (subSupState.length > 0) {
        // Inside sub/sup — only hyphenate if the pre-scan said to
        shouldHyphenate = subSupState[subSupState.length - 1].shouldHyphenate;
      }

      result += shouldHyphenate ? hyph(token) : token;
    }
  }

  return result;
}
