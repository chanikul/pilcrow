/**
 * gen-google-fonts-manifest.ts
 *
 * Manual-only script (NOT part of `bun run build`). Fetches the Google Fonts
 * Developer API, filters the result to editorially-appropriate families, and
 * writes the committed manifest at
 * `src/lib/playground/google-fonts-manifest.json`.
 *
 * Usage:
 *   GOOGLE_FONTS_API_KEY=<key> bun run scripts/gen-google-fonts-manifest.ts
 *   # or:
 *   bun run scripts/gen-google-fonts-manifest.ts --key <key>
 *
 * The API key is only required to run this script. It is never committed or
 * exposed at runtime. Obtain a key at https://console.developers.google.com/
 * under "APIs & Services > Credentials" after enabling the "Web Fonts Developer
 * API".
 *
 * Manifest selection rules (decision A1 / C1 from the spec):
 *   1. Only serif, sans-serif, and monospace categories — display, handwriting,
 *      and cursive families are excluded.
 *   2. Families must be available in at least weight 400 (regular).
 *   3. Variable-only families (no static-instance TTF in the `files` map) are
 *      excluded (decision C1 — variable-axis TTF forbidden in Playwright/
 *      Chromium build path).
 *   4. Drop-cap weight heuristic: 500 → 600 → null.
 *   5. Existing `dropCapWeightOverride` entries in the current manifest are
 *      preserved across regeneration (they map to hand-curated editorial taste
 *      decisions).
 *
 * The script merges with the existing manifest — if an entry exists for a
 * family, its `dropCapWeightOverride` is carried forward. New families are
 * appended. Families that disappear from the API response are NOT removed
 * (editorial curation may have added them; human removal is deliberate).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FontManifestEntry {
  family: string;
  category: 'serif' | 'sans-serif' | 'monospace';
  weights: number[];
  hasItalic: boolean;
  dropCapWeight: number | null;
  dropCapWeightOverride?: number | null;
  staticOnly: boolean;
}

// Google Fonts API v1 response shape (partial — only the fields we consume).
interface GoogleFontsAPIItem {
  family: string;
  category: string;          // 'serif' | 'sans-serif' | 'monospace' | 'display' | …
  variants: string[];         // e.g. ['100', '300', 'regular', '500', '700italic', …]
  files: Record<string, string>; // variant → download URL (woff2 on CDN / TTF when using files endpoint)
}

interface GoogleFontsAPIResponse {
  items: GoogleFontsAPIItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse the Google Fonts `variants` array into numeric weights. */
function extractWeights(variants: string[]): number[] {
  const weights = new Set<number>();
  for (const v of variants) {
    // Variants like 'regular', '100', '500', '700italic'.
    const numStr = v.replace('italic', '').trim();
    const num = numStr === 'regular' ? 400 : parseInt(numStr, 10);
    if (!isNaN(num) && num > 0) weights.add(num);
  }
  return Array.from(weights).sort((a, b) => a - b);
}

/** Check if a family has an italic face in its variants list. */
function hasItalicFace(variants: string[]): boolean {
  return variants.some((v) => v.includes('italic'));
}

/**
 * Check if a family has static-instance TTFs available.
 * The Google Fonts `files` map only includes static instances; variable fonts
 * are served separately via the CSS API and do not appear in `files`.
 * If the `files` object is populated with at least a regular/400 key, it has
 * statics.
 */
function hasStaticInstances(files: Record<string, string>): boolean {
  return Object.keys(files).length > 0 && (
    'regular' in files || '400' in files
  );
}

/** Derive drop-cap weight per the spec heuristic (500 → 600 → null). */
function deriveDropCapWeight(weights: number[]): number | null {
  if (weights.includes(500)) return 500;
  if (weights.includes(600)) return 600;
  return null;
}

/** Narrow API category string to our allowed union, or return null. */
function narrowCategory(
  category: string,
): 'serif' | 'sans-serif' | 'monospace' | null {
  if (category === 'serif') return 'serif';
  if (category === 'sans-serif') return 'sans-serif';
  if (category === 'monospace') return 'monospace';
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Resolve API key from --key flag or env var.
  const args = process.argv.slice(2);
  let apiKey: string | undefined = process.env['GOOGLE_FONTS_API_KEY'];
  const keyIdx = args.indexOf('--key');
  if (keyIdx !== -1 && args[keyIdx + 1]) {
    apiKey = args[keyIdx + 1];
  }
  if (!apiKey) {
    process.stderr.write(
      'Error: API key required. Set GOOGLE_FONTS_API_KEY or pass --key <key>.\n',
    );
    process.exit(1);
  }

  const manifestPath = path.join(
    process.cwd(),
    'src/lib/playground/google-fonts-manifest.json',
  );

  // Load existing manifest to preserve dropCapWeightOverride entries.
  let existingEntries: FontManifestEntry[] = [];
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    existingEntries = JSON.parse(raw) as FontManifestEntry[];
    process.stdout.write(
      `Loaded existing manifest: ${existingEntries.length} entries.\n`,
    );
  } catch {
    process.stdout.write('No existing manifest — generating from scratch.\n');
  }

  // Build a lookup from family name → existing entry (for override preservation).
  const existingByFamily = new Map<string, FontManifestEntry>();
  for (const entry of existingEntries) {
    existingByFamily.set(entry.family, entry);
  }

  // Fetch from Google Fonts API (sort=popularity so pinned families bubble up).
  const apiURL = `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`;
  process.stdout.write('Fetching Google Fonts API…\n');
  const res = await fetch(apiURL);
  if (!res.ok) {
    process.stderr.write(
      `Error: API returned ${res.status} ${res.statusText}.\n`,
    );
    process.exit(1);
  }
  const data = (await res.json()) as GoogleFontsAPIResponse;
  process.stdout.write(`API returned ${data.items.length} families.\n`);

  const newEntries: FontManifestEntry[] = [];
  let skippedCategory = 0;
  let skippedVariableOnly = 0;
  let skippedNoRegular = 0;

  for (const item of data.items) {
    // Rule 1: category filter.
    const category = narrowCategory(item.category);
    if (category === null) {
      skippedCategory++;
      continue;
    }

    // Rule 3: exclude variable-only families (no static TTF in files).
    if (!hasStaticInstances(item.files)) {
      skippedVariableOnly++;
      continue;
    }

    // Rule 2: must have weight 400.
    const weights = extractWeights(item.variants);
    if (!weights.includes(400)) {
      skippedNoRegular++;
      continue;
    }

    const hasItalic = hasItalicFace(item.variants);

    // Rule 4: drop-cap weight heuristic.
    const derivedDropCap = deriveDropCapWeight(weights);

    // Rule 5: preserve existing override if present.
    const existing = existingByFamily.get(item.family);
    const entry: FontManifestEntry = {
      family: item.family,
      category,
      weights,
      hasItalic,
      dropCapWeight: derivedDropCap,
      ...(existing?.dropCapWeightOverride !== undefined && {
        dropCapWeightOverride: existing.dropCapWeightOverride,
      }),
      staticOnly: !item.variants.some(
        (v) => !v.includes('italic') && isNaN(parseInt(v, 10)) === false
          ? false
          : v === 'regular' ? false : true
      ),
    };

    newEntries.push(entry);
  }

  // Sort: serif first, then sans-serif, then monospace; alphabetical within each.
  const ORDER: Record<string, number> = { serif: 0, 'sans-serif': 1, monospace: 2 };
  newEntries.sort((a, b) => {
    const catDiff = (ORDER[a.category] ?? 99) - (ORDER[b.category] ?? 99);
    if (catDiff !== 0) return catDiff;
    return a.family.localeCompare(b.family);
  });

  const json = JSON.stringify(newEntries, null, 2) + '\n';
  await fs.writeFile(manifestPath, json, 'utf-8');

  process.stdout.write(`\nManifest written: ${newEntries.length} entries.\n`);
  process.stdout.write(`  Skipped (category): ${skippedCategory}\n`);
  process.stdout.write(`  Skipped (variable-only): ${skippedVariableOnly}\n`);
  process.stdout.write(`  Skipped (no weight 400): ${skippedNoRegular}\n`);
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
  process.exit(1);
});
