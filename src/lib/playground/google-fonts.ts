/**
 * google-fonts.ts — runtime font-loading utilities for the Pilcrow playground.
 *
 * This module runs in the browser only (imported by playground components).
 * It handles:
 *
 *   1. `loadFont(family, weights, hasItalic)` — constructs a Google Fonts
 *      CSS2 URL, injects a `<link rel="stylesheet">` into `<head>`, awaits
 *      the link's own `load` event (so the browser has fetched and parsed the
 *      stylesheet CSS and registered FontFace objects), then awaits
 *      `document.fonts.ready`, then issues explicit `document.fonts.load(…)`
 *      calls for each requested face.
 *
 *      The three-step sequence is CRITICAL (learnings 2026-05-17):
 *        (a) await link.onload  — confirms the CSS has been fetched + parsed
 *            and @font-face rules have been registered in document.fonts.
 *        (b) await document.fonts.ready  — confirms any pending font
 *            operations triggered by the newly registered rules have settled.
 *        (c) await document.fonts.load(…)  — triggers the actual font-file
 *            fetch for each weight/style so canvas measurement is correct.
 *
 *      Skipping step (a) means document.fonts.ready resolves against the
 *      PREVIOUS FontFace set (the @font-face rules from the just-injected
 *      link are not yet parsed), so document.fonts.load() returns empty
 *      arrays and detectFontFaceDescriptors() returns weights: [].
 *
 *   2. `detectFontFaceDescriptors(family)` — after `loadFont` resolves,
 *      queries `document.fonts` for all FontFace entries whose `.family`
 *      matches `family`. Returns derived `{ weights, hasItalic }` from the
 *      loaded descriptors. Used by the B2 custom-family path to derive
 *      `dropCapWeight` without a manifest entry.
 *
 * The six Level-1 families (Fraunces, Newsreader, etc.) are handled by the
 * existing `@font-face` declarations in `public/styles/global.css` and the
 * swatch `document.fonts.load(…)` calls in `Settings.astro`. This module
 * handles additional manifest families and custom B2 entries only.
 *
 * Variable-axis TTF note: the Google Fonts CSS API serves woff2 (with
 * variable axis ranges or static instances depending on the request) to
 * supporting browsers. This is fine for the playground — we only forbid
 * variable-axis TTF in the build-time Playwright/Chromium measurement path
 * (`playwright.ts`). The playground typesets in the user's real browser.
 */

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2';

/**
 * Build a Google Fonts CSS2 URL for the given family and weights.
 *
 * For custom entries (B2 path), we request [400, 700] + italic 400 as a
 * permissive default — the API omits faces that don't exist, so no error
 * is thrown for families without italic.
 *
 * For manifest entries, the caller passes the actual weight list from the
 * manifest, reduced to the body-relevant subset: [400, dropCapWeight, 700].
 * Italic is requested if `hasItalic` is true.
 *
 * Static-instance request: we explicitly request weight values (e.g.
 * `wght@0,400;0,600;0,700;1,400`) rather than a range (e.g. `wght@400..700`)
 * to prefer static TTF slices over variable-axis ranges. This limits the
 * download to only the faces we actually use and is better practice regardless
 * of whether the client browser can handle variable fonts.
 */
function buildGoogleFontsURL(
  family: string,
  weights: number[],
  hasItalic: boolean,
): string {
  // Deduplicate and sort weights.
  const sortedWeights = Array.from(new Set(weights)).sort((a, b) => a - b);

  // Build axis-tagged tuples: `0,<weight>` for upright, `1,<weight>` for italic.
  const uprightTuples = sortedWeights.map((w) => `0,${w}`);
  const italicTuples = hasItalic ? ['1,400'] : [];
  const allTuples = [...uprightTuples, ...italicTuples].join(';');

  // Encode the family name: spaces → '+'.
  const encodedFamily = family.replace(/ /g, '+');

  // e.g. family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400
  return `${GOOGLE_FONTS_BASE}?family=${encodedFamily}:ital,wght@${allTuples}&display=swap`;
}

// Timeout in ms before we give up waiting for a Google Fonts <link> to load.
// 5 seconds is generous for a network request; a misspelled family name causes
// the API to serve a near-empty stylesheet almost instantly — so in the error
// path the rejection comes from detectFontFaceDescriptors returning weights:[]
// before this timeout triggers. The timeout guards against genuine network
// hangs or DNS failures.
const LINK_LOAD_TIMEOUT_MS = 5_000;

/**
 * Inject a Google Fonts stylesheet `<link>` into `<head>` (idempotent) and
 * return a Promise that resolves once the browser has fetched and parsed the
 * CSS (i.e. the `load` event fires on the `<link>` element).
 *
 * Idempotency:
 *   - If a `<link>` for this exact href already exists AND has already loaded,
 *     resolves immediately.
 *   - If it exists but is still loading, attaches to its load/error events
 *     so the caller awaits the SAME in-flight request.
 *   - Only creates a new `<link>` when none exists.
 *
 * The returned Promise rejects if the `<link>` fires an `error` event or
 * if LINK_LOAD_TIMEOUT_MS elapses with no response. The caller (loadFont)
 * lets this propagate to loadCustomFamily's catch block, which surfaces the
 * "Family not found" copy — correct for both a real error and a timeout.
 *
 * IMPORTANT: `link.onload` fires BEFORE `document.fonts.ready` becomes
 * meaningful for any @font-face rules declared in the new stylesheet. Always
 * call this function and await its result BEFORE awaiting `document.fonts.ready`.
 * (learnings 2026-05-17: link-load sequencing for Google Fonts injection.)
 */
function injectGoogleFontsLink(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Check for an existing link with the same href.
    const existing = document.querySelector<HTMLLinkElement>(
      `link[rel="stylesheet"][href="${CSS.escape(url)}"]`,
    ) ?? document.querySelector<HTMLLinkElement>(
      // CSS.escape encodes the URL; also try a plain attribute match for the
      // common case where the href contains only safe characters.
      `link[rel="stylesheet"][href="${url}"]`,
    );

    if (existing) {
      // The link already exists. Check its load state via a data attribute we
      // set ourselves (the DOM has no direct readyState for <link> elements).
      if (existing.dataset['pilcrowLoaded'] === 'true') {
        resolve();
        return;
      }
      if (existing.dataset['pilcrowError'] === 'true') {
        reject(new Error(`Google Fonts stylesheet failed to load: ${url}`));
        return;
      }
      // Still in-flight: attach to its events.
      const timer = setTimeout(() => {
        reject(new Error(`Google Fonts stylesheet timed out: ${url}`));
      }, LINK_LOAD_TIMEOUT_MS);
      existing.addEventListener(
        'load',
        () => {
          clearTimeout(timer);
          existing.dataset['pilcrowLoaded'] = 'true';
          resolve();
        },
        { once: true },
      );
      existing.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          existing.dataset['pilcrowError'] = 'true';
          reject(new Error(`Google Fonts stylesheet failed to load: ${url}`));
        },
        { once: true },
      );
      return;
    }

    // New link — create, wire events, then append to <head>.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;

    const timer = setTimeout(() => {
      reject(new Error(`Google Fonts stylesheet timed out: ${url}`));
    }, LINK_LOAD_TIMEOUT_MS);

    link.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        link.dataset['pilcrowLoaded'] = 'true';
        resolve();
      },
      { once: true },
    );
    link.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        link.dataset['pilcrowError'] = 'true';
        reject(new Error(`Google Fonts stylesheet failed to load: ${url}`));
      },
      { once: true },
    );

    document.head.appendChild(link);
  });
}

/**
 * Load a Google Fonts family into the browser's font set.
 *
 * Steps:
 *   1. Build the CSS2 URL from the family name + weights + italic flag.
 *   2. Inject a `<link rel="stylesheet">` (idempotent — reuses an existing
 *      link if the same href is already in <head>) and AWAIT its `load` event.
 *      This ensures the browser has fetched and parsed the CSS and registered
 *      the @font-face rules into document.fonts before we proceed.
 *   3. Await `document.fonts.ready` (re-awaited after the link resolves so
 *      any font operations triggered by the new @font-face rules have settled).
 *   4. Explicitly call `document.fonts.load(…)` for each requested weight/style
 *      to trigger the actual font-file fetch (some browsers defer the fetch
 *      until a face is needed for rendering; explicit load() forces it now so
 *      canvas measurement in BrowserRenderer sees correct metrics immediately).
 *
 * The three-step sequence is NON-NEGOTIABLE (learnings 2026-05-17):
 *   - Skipping step 2 (await link.onload) means document.fonts.ready resolves
 *     against the PREVIOUS FontFace set. The new @font-face rules have not been
 *     parsed yet, so document.fonts.load() returns empty arrays and
 *     detectFontFaceDescriptors() returns weights: [].
 *   - Skipping step 3 (await document.fonts.ready) means step 4's load() calls
 *     may race with the parser still registering faces.
 *
 * If the `<link>` times out or fires an error event, this function throws,
 * and the caller's catch block surfaces "Family not found on Google Fonts."
 *
 * @param family - Family name as it should appear in `font-family` CSS (e.g.
 *   "Source Serif 4"). Multi-word names should not be pre-encoded.
 * @param weights - Numeric weight values to request (e.g. [400, 600, 700]).
 *   Pass [] to use the default [400, 700].
 * @param hasItalic - Whether to request italic 400.
 * @returns Promise that resolves once all requested faces are loaded and
 *   registered in `document.fonts`.
 */
export async function loadFont(
  family: string,
  weights: number[],
  hasItalic: boolean,
): Promise<void> {
  const effectiveWeights = weights.length > 0 ? weights : [400, 700];
  const url = buildGoogleFontsURL(family, effectiveWeights, hasItalic);

  // Step 1: inject the <link> and wait for the browser to fetch + parse the
  // stylesheet. This resolves only after the <link>'s own load event fires,
  // guaranteeing @font-face rules are registered in document.fonts.
  await injectGoogleFontsLink(url);

  // Step 2: re-await document.fonts.ready so any font operations triggered by
  // the newly registered @font-face rules have settled.
  await document.fonts.ready;

  // Step 3: explicitly load each weight/style so BrowserRenderer's canvas has
  // the correct metrics immediately (not relying on lazy fetch at render time).
  const familyToken = family.includes(' ') ? `"${family}"` : family;
  const loadPromises: Promise<FontFace[]>[] = [];
  for (const w of effectiveWeights) {
    loadPromises.push(document.fonts.load(`${w} 19px ${familyToken}`));
  }
  if (hasItalic) {
    loadPromises.push(document.fonts.load(`italic 400 19px ${familyToken}`));
  }
  await Promise.all(loadPromises);
}

/**
 * Detect the weights and italic availability of a family that was loaded via
 * `loadFont` (or any other mechanism). Used in the B2 custom-family path to
 * derive `dropCapWeight` without a manifest entry.
 *
 * Queries `document.fonts` for FontFace entries whose `.family` matches the
 * given family name (both quoted and unquoted forms, case-insensitive).
 *
 * Returns `{ weights: number[], hasItalic: boolean }`. If no FontFace entries
 * are found (the family name is invalid / was never loaded), returns
 * `{ weights: [], hasItalic: false }`.
 */
export function detectFontFaceDescriptors(family: string): {
  weights: number[];
  hasItalic: boolean;
} {
  const normalised = family.toLowerCase().trim();
  // document.fonts is a FontFaceSet; iterate to collect matching faces.
  const weights = new Set<number>();
  let hasItalic = false;

  document.fonts.forEach((face) => {
    // FontFace.family may include surrounding quotes depending on the browser.
    const faceName = face.family.replace(/^["']|["']$/g, '').toLowerCase().trim();
    if (faceName !== normalised) return;

    // FontFace.weight: may be a keyword ('normal', 'bold') or a numeric string.
    const weightStr = face.weight.trim();
    let weight: number;
    if (weightStr === 'normal') {
      weight = 400;
    } else if (weightStr === 'bold') {
      weight = 700;
    } else {
      // May be a range like "300 500" — take the first value.
      weight = parseInt(weightStr.split(' ')[0] ?? '400', 10);
    }
    if (!isNaN(weight) && weight > 0) weights.add(weight);

    // FontFace.style: 'normal', 'italic', or 'oblique'.
    if (face.style === 'italic' || face.style === 'oblique') {
      hasItalic = true;
    }
  });

  return {
    weights: Array.from(weights).sort((a, b) => a - b),
    hasItalic,
  };
}

/**
 * Derive drop-cap weight from a set of loaded weights.
 * Mirrors the generation-script heuristic: 500 → 600 → null.
 */
export function deriveDropCapWeight(weights: number[]): number | null {
  if (weights.includes(500)) return 500;
  if (weights.includes(600)) return 600;
  return null;
}

/**
 * Build the Google Fonts CSS2 URL for use in the Copy HTML output.
 * For known families, requests only the body-relevant weights to keep the
 * exported document's dependency minimal.
 */
export function buildCopyHTMLFontsURL(
  family: string,
  weights: number[],
  hasItalic: boolean,
): string {
  return buildGoogleFontsURL(family, weights, hasItalic);
}
