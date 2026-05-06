/**
 * hyphenate-browser.ts — browser-side Hyphenopoly SHY pre-pass.
 *
 * Mirrors `packages/pilcrow-typeset/src/hyphenate.ts` (Node-side) feature for
 * feature so BrowserRenderer output is byte-identical to the deployed pretext
 * pipeline at hyphen-break positions.
 *
 * Path A (full browser Hyphenopoly with lazy-loaded wasm) — chosen over the
 * sidecar alternative because the playground's core bet is "paste your own
 * prose and watch it typeset". Sidecar would silently narrow the product to
 * "preview existing posts" and would hollow out the orphan-guard acceptance
 * gate by bypassing the SHY → grapheme/syllable axis.
 *
 * Implementation notes:
 *   1. `hyphenopoly@6.1.0` ships `hyphenopoly.module.js` as the programmatic
 *      entrypoint. It uses `WebAssembly` + `TextDecoder` and a configurable
 *      async `loader(file, baseURL)` — no Node-specific imports — so it runs
 *      in the browser when paired with a fetch-based loader.
 *   2. Pattern data is shipped at `public/_hyphenopoly/en-gb.wasm` (33 KB raw,
 *      ~22 KB gzipped). Served as `/_hyphenopoly/en-gb.wasm`.
 *   3. Engine is initialised exactly once per page lifetime, lazy on the first
 *      `hyphenateInBrowser()` call — NOT on import or page load — so the
 *      playground's initial paint stays under the 2-second budget.
 *   4. Same hyphenation parameters as Node: en-gb, leftmin 3, rightmin 3,
 *      minWordLength 6, compound 'auto'. Same skip policy: <code>, <cite>,
 *      <h1>–<h6>, <figcaption>, and digit-only <sub>/<sup>.
 *
 * Until pretext #162 (`softHyphenMode: 'strict'`) lands and removes the orphan
 * guard, any future fix to the skip policy must be made in BOTH this file and
 * `packages/pilcrow-typeset/src/hyphenate.ts`.
 */

// hyphenopoly's programmatic entry. Imported as a bare specifier so Vite
// bundles it into the client chunk (the package was moved into
// `dependencies` for exactly this reason — see file header).
import hyphenopoly from 'hyphenopoly/hyphenopoly.module.js';

/** Soft hyphen character inserted at candidate break points. Matches Node side. */
const SOFT_HYPHEN = '­';

interface HyphenopolyConfig {
  require: string[];
  hyphen: string;
  minWordLength: number;
  leftmin: number;
  rightmin: number;
  compound: 'auto' | 'hyphen' | 'all';
  loader: (file: string, baseURL: URL) => Promise<ArrayBuffer>;
}

interface HyphenopolyModule {
  config(opts: HyphenopolyConfig): Map<string, Promise<(text: string) => string>>;
}

const hp = hyphenopoly as unknown as HyphenopolyModule;

// ─── Singleton init (lazy on first call) ─────────────────────────────────────

let hyphenateText: ((text: string) => string) | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Timing instrumentation. Exported for the BrowserRenderer step-1(f) verify
 * step to surface the lazy-load latency in the final report.
 */
let lastInitElapsedMs: number | null = null;
export function getLastInitElapsedMs(): number | null {
  return lastInitElapsedMs;
}

async function initHyphenopoly(): Promise<void> {
  const t0 = performance.now();

  const hyphenators = hp.config({
    require: ['en-gb'],
    hyphen: SOFT_HYPHEN,
    minWordLength: 6,
    leftmin: 3,  // matches Node: eliminates 2-char-left stubs like re-|ceives
    rightmin: 3,
    // 'auto' keeps Hyphenopoly from inserting U+200B after the hyphen in
    // compound words. Without this, ZWS contaminates copy-paste in .pt-line
    // spans. Pretext consumes U+00AD only.
    compound: 'auto',
    loader: async (file: string): Promise<ArrayBuffer> => {
      // The second arg (baseURL) is ignored — we serve from a fixed public
      // path, not relative to the bundled module URL.
      const res = await fetch(`/_hyphenopoly/${file}`);
      if (!res.ok) {
        throw new Error(`[pilcrow] hyphenopoly: failed to load /_hyphenopoly/${file} (status ${res.status})`);
      }
      return res.arrayBuffer();
    },
  });

  const fn = await hyphenators.get('en-gb');
  if (!fn) {
    throw new Error('[pilcrow] hyphenopoly: en-gb hyphenator did not resolve');
  }
  hyphenateText = fn;

  lastInitElapsedMs = performance.now() - t0;
}

async function ensureReady(): Promise<void> {
  if (hyphenateText !== null) return;
  if (initPromise === null) {
    initPromise = initHyphenopoly();
  }
  await initPromise;
}

// ─── HTML walker (port of Node-side hyphenateHTML) ───────────────────────────

/**
 * Inject U+00AD soft hyphens into the text content of an HTML string.
 *
 * Verbatim port of `hyphenateHTML` from `packages/pilcrow-typeset/src/hyphenate.ts`.
 * The skip policy is identical:
 *   - <code>: technical identifiers must not be hyphenated
 *   - <cite>: author names must not be hyphenated
 *   - <h1>–<h6>: display type wants word-shape integrity
 *   - <figcaption>: short descriptive text; SHYs latent and noisy
 *   - <sub>/<sup>: skip if textContent is digits-only (footnote markers)
 */
export async function hyphenateInBrowser(html: string): Promise<string> {
  await ensureReady();
  const hyph = hyphenateText!;

  // Tokenise into alternating text / tag segments.
  const TOKEN_RE = /(<[^>]+>|[^<]+)/g;

  let codeDepth = 0;
  let citeDepth = 0;
  let headingDepth = 0;
  let figcaptionDepth = 0;

  // Pre-scan for sub/sup elements: decide hyphenate-or-not based on
  // digit-only textContent. Map keyed by opening-tag start position.
  const subSupHyphenate = new Map<number, boolean>();
  const PRE_SCAN_RE = /<(sub|sup)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let preScanMatch: RegExpExecArray | null;
  while ((preScanMatch = PRE_SCAN_RE.exec(html)) !== null) {
    const innerText = preScanMatch[3]!.replace(/<[^>]+>/g, '');
    const shouldHyphenate = !/^\d+$/.test(innerText);
    subSupHyphenate.set(preScanMatch.index, shouldHyphenate);
  }

  const SUBSUP_OPEN_RE = /<(sub|sup)([^>]*)>/gi;
  let subSupOpenMatch: RegExpExecArray | null;
  const subSupOpenPositions = new Map<number, boolean>();
  while ((subSupOpenMatch = SUBSUP_OPEN_RE.exec(html)) !== null) {
    const pos = subSupOpenMatch.index;
    if (subSupHyphenate.has(pos)) {
      subSupOpenPositions.set(pos, subSupHyphenate.get(pos)!);
    }
  }

  type SubSupState = { tag: string; shouldHyphenate: boolean };
  const subSupState: SubSupState[] = [];

  let result = '';
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(html)) !== null) {
    const token = match[0];
    const tokenStart = match.index;

    if (token[0] === '<') {
      const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
      if (tagMatch) {
        const isClose = tagMatch[1] === '/';
        const tagName = tagMatch[2]!.toLowerCase();

        if (tagName === 'code') {
          if (!isClose) codeDepth++;
          else codeDepth = Math.max(0, codeDepth - 1);
        } else if (tagName === 'cite') {
          if (!isClose) citeDepth++;
          else citeDepth = Math.max(0, citeDepth - 1);
        } else if (/^h[1-6]$/.test(tagName)) {
          if (!isClose) headingDepth++;
          else headingDepth = Math.max(0, headingDepth - 1);
        } else if (tagName === 'figcaption') {
          if (!isClose) figcaptionDepth++;
          else figcaptionDepth = Math.max(0, figcaptionDepth - 1);
        } else if (tagName === 'sub' || tagName === 'sup') {
          if (!isClose) {
            const shouldHyphenate = subSupOpenPositions.get(tokenStart) ?? false;
            subSupState.push({ tag: tagName, shouldHyphenate });
          } else if (
            subSupState.length > 0 &&
            subSupState[subSupState.length - 1]!.tag === tagName
          ) {
            subSupState.pop();
          }
        }
      }
      result += token;
    } else {
      let shouldHyphenate = true;

      if (codeDepth > 0) shouldHyphenate = false;
      else if (citeDepth > 0) shouldHyphenate = false;
      else if (headingDepth > 0) shouldHyphenate = false;
      else if (figcaptionDepth > 0) shouldHyphenate = false;
      else if (subSupState.length > 0) {
        shouldHyphenate = subSupState[subSupState.length - 1]!.shouldHyphenate;
      }

      result += shouldHyphenate ? hyph(token) : token;
    }
  }

  return result;
}
