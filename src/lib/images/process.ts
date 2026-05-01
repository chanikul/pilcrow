/**
 * Pilcrow image pipeline — build-time image processing via Sharp.
 *
 * For each source image this module:
 *   1. Reads original dimensions.
 *   2. Generates up to 9 output variants: 3 widths × 3 formats.
 *      Widths  : 640, 1280, 1920 — clamped to original width (never upscale).
 *      Formats : AVIF, WebP, original-format fallback.
 *   3. Generates a thumbhash placeholder from a 32px thumbnail.
 *   4. Returns srcset strings, original dimensions, aspect ratio, and the
 *      thumbhash bytes as a base64 string.
 *
 * Output path convention:
 *   dist/_images/<slug>-<width>w.<format>
 *   e.g. dist/_images/kalen-emsley-Bkci_8qcdvQ-unsplash-640w.avif
 *
 * Where <slug> is the source filename without extension, lowercased, with
 * non-alphanumeric characters replaced by hyphens.
 *
 * Caching: this is a v1.x candidate. For now, regeneration is unconditional
 * on each build. With typical image counts (< 20) the overhead is acceptable.
 * Add mtime-based caching when build times become noticeably long.
 *
 * Sharp is a transitive dependency via Astro's own image tooling (sharp@0.34.5).
 * Do NOT add it to package.json — it is already available in node_modules.
 * thumbhash is an explicit dependency: `bun add thumbhash`.
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { rgbaToThumbHash, thumbHashToDataURL } from 'thumbhash';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Output widths in pixels. Variants that exceed the source width are skipped. */
const WIDTHS = [640, 1280, 1920] as const;

/**
 * Output path for processed images, relative to project root.
 *
 * WHY public/ not dist/:
 *   Astro's rehype plugins run during the content sync phase, BEFORE the build
 *   phase creates dist/. Astro cleans dist/ at the start of each build, so any
 *   files written to dist/ during content sync are immediately destroyed.
 *   Writing to public/ is correct: Astro copies public/ verbatim to dist/
 *   during the build, so files persist across builds without regeneration.
 *
 * Served at /_images/<file> in production (public/ files get no path prefix).
 * Gitignore: add public/_images/ to .gitignore — these are build artifacts.
 */
const OUTPUT_DIR_RELATIVE = 'public/_images';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImageVariant {
  /** Public URL path for this variant, e.g. "/_images/slug-640w.avif" */
  url: string;
  width: number;
  format: 'avif' | 'webp' | 'jpeg' | 'png' | 'avif-original';
}

export interface ProcessedImage {
  /** srcset string for <source type="image/avif"> */
  avifSrcset: string;
  /** srcset string for <source type="image/webp"> */
  webpSrcset: string;
  /** src string for <img> fallback (largest original-format variant ≤ source width) */
  fallbackSrc: string;
  /** MIME type for fallback (image/jpeg or image/avif) */
  fallbackType: string;
  /** Original source width in pixels */
  width: number;
  /** Original source height in pixels */
  height: number;
  /**
   * Base64-encoded thumbhash bytes (Uint8Array → base64).
   * Stored as data-thumbhash on the <img> for reference.
   */
  thumbhash: string;
  /**
   * PNG data URL of the decoded thumbhash placeholder, generated at build time.
   * Stored as data-placeholder on the <figure> so the browser script only
   * needs a trivial read-and-apply (no decoder needed in the browser).
   * This keeps the inline blur-up script well under the 1KB budget.
   */
  placeholderDataURL: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a URL-safe slug from a filename (without extension).
 * Lowercases, replaces any run of non-alphanumeric characters with a hyphen,
 * trims leading/trailing hyphens.
 */
function fileSlug(filename: string): string {
  return basename(filename, extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Detect the output format for the "original format fallback" variant.
 * Sharp detects the source format from the file header, not the extension.
 *
 * IMPORTANT: Sharp reports AVIF files as format 'heif' (AVIF is a profile of
 * HEIF/HEIC). Map 'heif' → 'avif' so the fallback variant is AVIF, not JPEG.
 * This is harmless redundancy with the AVIF srcset but correct: the <img src>
 * must be a format every browser supports (modern browsers support AVIF).
 */
function fallbackFormat(sourceFormat: string): 'jpeg' | 'png' | 'avif' | 'webp' {
  switch (sourceFormat) {
    case 'jpeg':
    case 'jpg':  return 'jpeg';
    case 'png':  return 'png';
    case 'avif':
    case 'heif': return 'avif'; // Sharp reports AVIF sources as 'heif'
    case 'webp': return 'webp';
    default:     return 'jpeg'; // safe fallback for unknown formats
  }
}

function mimeType(format: string): string {
  switch (format) {
    case 'avif': return 'image/avif';
    case 'webp': return 'image/webp';
    case 'png':  return 'image/png';
    default:     return 'image/jpeg';
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Process a single source image and write output variants to dist/_images/.
 *
 * @param sourcePath  Absolute path to the source image file.
 * @param projectRoot Absolute path to the Astro project root (process.cwd()).
 * @returns           ProcessedImage metadata for the rehype plugin to use.
 */
export async function processImage(
  sourcePath: string,
  projectRoot: string,
): Promise<ProcessedImage> {
  const outputDir = join(projectRoot, OUTPUT_DIR_RELATIVE);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const slug = fileSlug(sourcePath);

  // ─── Read source metadata ───────────────────────────────────────────────
  const src = sharp(sourcePath);
  const meta = await src.metadata();
  const sourceWidth  = meta.width  ?? 0;
  const sourceHeight = meta.height ?? 0;
  const sourceFormat = meta.format ?? 'jpeg';

  const origFallback = fallbackFormat(sourceFormat);

  // ─── Generate AVIF variants ─────────────────────────────────────────────
  const avifEntries: string[] = [];
  for (const w of WIDTHS) {
    if (w > sourceWidth) continue; // never upscale
    const filename = `${slug}-${w}w.avif`;
    const outPath  = join(outputDir, filename);
    await sharp(sourcePath)
      .resize({ width: w, withoutEnlargement: true })
      .avif({ quality: 80 })
      .toFile(outPath);
    avifEntries.push(`/_images/${filename} ${w}w`);
  }
  // If no width fit (tiny source image), use source width as the sole entry.
  if (avifEntries.length === 0) {
    const filename = `${slug}-${sourceWidth}w.avif`;
    const outPath  = join(outputDir, filename);
    await sharp(sourcePath).avif({ quality: 80 }).toFile(outPath);
    avifEntries.push(`/_images/${filename} ${sourceWidth}w`);
  }

  // ─── Generate WebP variants ─────────────────────────────────────────────
  const webpEntries: string[] = [];
  for (const w of WIDTHS) {
    if (w > sourceWidth) continue;
    const filename = `${slug}-${w}w.webp`;
    const outPath  = join(outputDir, filename);
    await sharp(sourcePath)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(outPath);
    webpEntries.push(`/_images/${filename} ${w}w`);
  }
  if (webpEntries.length === 0) {
    const filename = `${slug}-${sourceWidth}w.webp`;
    const outPath  = join(outputDir, filename);
    await sharp(sourcePath).webp({ quality: 82 }).toFile(outPath);
    webpEntries.push(`/_images/${filename} ${sourceWidth}w`);
  }

  // ─── Generate original-format fallback variants ─────────────────────────
  const origEntries: string[] = [];
  for (const w of WIDTHS) {
    if (w > sourceWidth) continue;
    const filename = `${slug}-${w}w.${origFallback === 'jpeg' ? 'jpg' : origFallback}`;
    const outPath  = join(outputDir, filename);
    let pipeline = sharp(sourcePath).resize({ width: w, withoutEnlargement: true });
    if (origFallback === 'jpeg')       pipeline = pipeline.jpeg({ quality: 85 });
    else if (origFallback === 'png')   pipeline = pipeline.png();
    else if (origFallback === 'avif')  pipeline = pipeline.avif({ quality: 80 });
    else                               pipeline = pipeline.webp({ quality: 82 });
    await pipeline.toFile(outPath);
    origEntries.push(`/_images/${filename} ${w}w`);
  }
  if (origEntries.length === 0) {
    const ext = origFallback === 'jpeg' ? 'jpg' : origFallback;
    const filename = `${slug}-${sourceWidth}w.${ext}`;
    const outPath  = join(outputDir, filename);
    let pipeline = sharp(sourcePath);
    if (origFallback === 'jpeg')      pipeline = pipeline.jpeg({ quality: 85 });
    else if (origFallback === 'png')  pipeline = pipeline.png();
    else if (origFallback === 'avif') pipeline = pipeline.avif({ quality: 80 });
    else                              pipeline = pipeline.webp({ quality: 82 });
    await pipeline.toFile(outPath);
    origEntries.push(`/_images/${filename} ${sourceWidth}w`);
  }

  // ─── Thumbhash ──────────────────────────────────────────────────────────
  // Resize to a tiny thumbnail (≤100px both axes — thumbhash's max input size),
  // extract as raw RGBA, then feed to rgbaToThumbHash.
  const thumbSize = 32; // well under the 100px limit
  const { data: thumbData, info: thumbInfo } = await sharp(sourcePath)
    .resize({ width: thumbSize, height: thumbSize, fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const hashBytes = rgbaToThumbHash(thumbInfo.width, thumbInfo.height, thumbData);
  const thumbhashB64 = Buffer.from(hashBytes).toString('base64');

  // Generate the placeholder data URL at build time so the browser script
  // only needs to read and apply it (no decoder needed in the browser).
  const placeholderDataURL = thumbHashToDataURL(hashBytes);

  // ─── Assemble return value ───────────────────────────────────────────────
  // Fallback src: the largest original-format variant written (last in origEntries).
  const fallbackSrc = origEntries[origEntries.length - 1].split(' ')[0];

  return {
    avifSrcset:        avifEntries.join(', '),
    webpSrcset:        webpEntries.join(', '),
    fallbackSrc,
    fallbackType:      mimeType(origFallback),
    width:             sourceWidth,
    height:            sourceHeight,
    thumbhash:         thumbhashB64,
    placeholderDataURL,
  };
}
