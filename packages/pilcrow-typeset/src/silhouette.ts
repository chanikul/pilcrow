/**
 * silhouette.ts — build-time silhouette extraction for the shape-around primitive.
 *
 * Two paths, both returning the same data structure:
 *
 *   getGlyphSilhouette(fontPath, glyphChar, size) → SilhouetteData
 *   getImageSilhouette(imagePath, size)           → SilhouetteData
 *
 * Both return:
 *   {
 *     width:    number,           // silhouette bounding box width in px
 *     height:   number,           // silhouette bounding box height in px
 *     maxXAtY:  (y: number) => number  // rightmost opaque pixel x at row y; -1 if empty
 *   }
 *
 * Path A — glyph silhouette
 * --------------------------
 * Uses @shuding/opentype.js to read glyph path commands, converts them to an SVG
 * path string, and rasterises via Sharp. Sharp is the correct tool here — it runs
 * at build time on Node/Bun, handles SVG→PNG natively, and is already a project
 * dependency. The canvas npm package is explicitly avoided (extra native dependency).
 *
 * Coordinate system:
 *   opentype.js uses y-up (positive y towards ascender).
 *   SVG uses y-down (positive y towards baseline).
 *   Transform: svgY = (glyphYMax - fontY) * scale + padding
 *
 * Path B — image silhouette
 * -------------------------
 * For v1, requires a PNG with an alpha channel. Sharp reads the raw RGBA pixels and
 * samples the rightmost opaque pixel (alpha > 10) in each row. The image is resized
 * to the specified height (preserving aspect ratio) before sampling so the returned
 * width/height match the rendered size of the obstacle.
 *
 * Auto-background-removal (for opaque JPEGs / PNGs) is explicitly out of scope for v1.
 * The build emits a clear warning if a non-alpha image is passed.
 *
 * In-memory cache
 * ---------------
 * Both paths cache results in module-level Maps keyed on (source, size).
 * The key is `${source}|${size}` — adequate for a build process that never
 * passes the same path with different sizes in the same run.
 *
 * Pilcrow architecture note:
 *   This module is Node-side only — imported by playwright.ts at build time,
 *   never bundled into the browser or Playwright page.evaluate() context.
 */

import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import opentype from '@shuding/opentype.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SilhouetteData {
  /** Width of the silhouette bounding box in pixels. */
  width: number;
  /** Height of the silhouette bounding box in pixels. */
  height: number;
  /**
   * Returns the x-coordinate of the rightmost opaque pixel at row y.
   * Returns -1 if the row is entirely transparent (before / after the glyph).
   * y is 0-indexed from the TOP of the bounding box (SVG / CSS convention).
   */
  maxXAtY: (y: number) => number;
  /**
   * Pre-sampled maxXAtY array for all rows 0..height-1.
   * Serialised and passed into page.evaluate() so the browser context never
   * needs to call the function (functions cannot be transferred via the CDP).
   */
  maxXArray: number[];
  /**
   * For glyph silhouettes: the SVG path "d" attribute string in canvas-space
   * coordinates (matches `width` × `height`). Used by playwright.ts to inject
   * an inline <svg><path/></svg> into the obstacle element so the glyph is
   * visible — without this the obstacle reserves space but renders blank.
   * Undefined for image silhouettes.
   */
  svgPath?: string;
  /**
   * For glyph silhouettes: a base64-encoded `data:image/svg+xml` URL of the
   * full SVG document (path + viewBox). Used by playwright.ts as
   * `shape-outside: url(<svgDataUrl>)` on the obstacle so prose wraps the
   * actual letterform contour, not just the bounding box. The browser samples
   * the SVG's alpha channel — the path is filled black on transparent
   * background; the visible inline SVG uses currentColor for fill, but the
   * shape-outside data URL uses fill="black" because only alpha matters.
   * Undefined for image silhouettes.
   */
  svgDataUrl?: string;
  /**
   * For image silhouettes: a base64-encoded `data:image/png` URL of the resized
   * PNG buffer. Used by playwright.ts to inject an <img src="…" alt=""> into
   * the obstacle element so the photograph is visible, AND as
   * `shape-outside: url(<imageDataUrl>)` so prose wraps the alpha contour.
   * Undefined for glyph silhouettes.
   */
  imageDataUrl?: string;
}

// ─── In-memory caches ─────────────────────────────────────────────────────────

const glyphCache = new Map<string, SilhouetteData>();
const imageCache = new Map<string, SilhouetteData>();

// ─── Path A: glyph silhouette ─────────────────────────────────────────────────

/**
 * Extract a silhouette from a single glyph in a TrueType/OpenType font file.
 *
 * @param fontPath  Absolute path to the .ttf / .otf font file.
 * @param glyphChar The Unicode character to silhouette (e.g. 'a').
 * @param size      Desired height of the silhouette bounding box in px.
 *                  Width is computed from the glyph's advance width at this size.
 *
 * The glyph is rendered at `size / unitsPerEm` scale and rasterised via Sharp.
 * Alpha channel of the resulting PNG is sampled row-by-row to build maxXArray.
 *
 * Throws if the font file cannot be read or the glyph is not found (index === 0
 * is the .notdef glyph — treated as not-found).
 */
export async function getGlyphSilhouette(
  fontPath: string,
  glyphChar: string,
  size: number,
): Promise<SilhouetteData> {
  const cacheKey = `${fontPath}|${glyphChar}|${size}`;
  const cached = glyphCache.get(cacheKey);
  if (cached) return cached;

  // ── Load font ──────────────────────────────────────────────────────────────
  const fontBuffer = await readFile(fontPath);
  // @shuding/opentype.js parse() accepts an ArrayBuffer.
  const font = opentype.parse(fontBuffer.buffer as ArrayBuffer);
  const unitsPerEm = font.unitsPerEm;

  // ── Get glyph ──────────────────────────────────────────────────────────────
  const glyphIndex = font.charToGlyphIndex(glyphChar);
  if (glyphIndex === 0) {
    throw new Error(
      `[pilcrow] silhouette: glyph '${glyphChar}' not found in font ${fontPath} (resolved to .notdef index 0)`,
    );
  }
  const glyph = font.glyphs.get(glyphIndex);

  // ── Compute dimensions ─────────────────────────────────────────────────────
  // @shuding/opentype.js exposes xMin/xMax/yMin/yMax directly on the glyph.
  const glyphXMin = (glyph as any).xMin as number ?? 0;
  const glyphXMax = (glyph as any).xMax as number ?? ((glyph as any).advanceWidth as number);
  const glyphYMin = (glyph as any).yMin as number ?? 0;
  const glyphYMax = (glyph as any).yMax as number ?? unitsPerEm;

  const scale = size / unitsPerEm;
  // +4: 2px padding on each side so anti-aliased edges are captured
  const PAD = 2;
  const canvasWidth = Math.ceil((glyphXMax - glyphXMin) * scale) + PAD * 2;
  const canvasHeight = Math.ceil((glyphYMax - glyphYMin) * scale) + PAD * 2;

  // ── Build SVG path string ──────────────────────────────────────────────────
  // Transform: font-y-up → SVG-y-down.
  //   svgX = (fontX - glyphXMin) * scale + PAD
  //   svgY = (glyphYMax - fontY) * scale + PAD
  function toSvg(fx: number, fy: number): [number, number] {
    return [
      (fx - glyphXMin) * scale + PAD,
      (glyphYMax - fy) * scale + PAD,
    ];
  }

  let d = '';
  const commands = (glyph as any).path.commands as Array<Record<string, unknown>>;
  for (const cmd of commands) {
    switch (cmd['type']) {
      case 'M': {
        const [x, y] = toSvg(cmd['x'] as number, cmd['y'] as number);
        d += `M ${x} ${y} `;
        break;
      }
      case 'L': {
        const [x, y] = toSvg(cmd['x'] as number, cmd['y'] as number);
        d += `L ${x} ${y} `;
        break;
      }
      case 'Q': {
        const [x1, y1] = toSvg(cmd['x1'] as number, cmd['y1'] as number);
        const [x, y] = toSvg(cmd['x'] as number, cmd['y'] as number);
        d += `Q ${x1} ${y1} ${x} ${y} `;
        break;
      }
      case 'C': {
        const [x1, y1] = toSvg(cmd['x1'] as number, cmd['y1'] as number);
        const [x2, y2] = toSvg(cmd['x2'] as number, cmd['y2'] as number);
        const [x, y] = toSvg(cmd['x'] as number, cmd['y'] as number);
        d += `C ${x1} ${y1} ${x2} ${y2} ${x} ${y} `;
        break;
      }
      case 'Z':
        d += 'Z ';
        break;
      default:
        break;
    }
  }

  // Single SVG string serves two purposes: (1) Sharp rasterises it for alpha
  // sampling (maxXArray); (2) base64-encoded as data URL for CSS shape-outside.
  // viewBox is set so the SVG scales to whatever pixel dimensions the browser
  // renders the float box at — shape-outside samples at the rendered size, not
  // the intrinsic size, so a viewBox-bearing SVG is more robust if the box ever
  // gets sized differently in CSS.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="${canvasWidth}" height="${canvasHeight}"><path d="${d}" fill="black" /></svg>`;

  // ── Rasterise and sample ────────────────────────────────────────────────────
  const { data, info } = await sharp(Buffer.from(svg))
    .png()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const maxXArray = buildMaxXArray(data as unknown as Uint8Array, width, height, channels);

  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  const result: SilhouetteData = {
    width,
    height,
    maxXArray,
    maxXAtY: (y: number) => (y >= 0 && y < maxXArray.length ? (maxXArray[y] ?? -1) : -1),
    svgPath: d.trim(),
    svgDataUrl,
  };

  glyphCache.set(cacheKey, result);
  return result;
}

// ─── Path B: image silhouette ─────────────────────────────────────────────────

/**
 * Extract a silhouette from a PNG image with an alpha channel.
 *
 * @param imagePath  Absolute path to the PNG image (must have transparency).
 * @param size       Desired height in px. Width is derived from image aspect ratio.
 *
 * For v1, requires a PNG with an alpha channel. If the image does not have an
 * alpha channel, a build warning is emitted and the function returns a silhouette
 * that uses the full rectangle (equivalent to no wrap-around effect).
 *
 * The image is resized to `size` height (preserving aspect ratio) before sampling.
 */
export async function getImageSilhouette(
  imagePath: string,
  size: number,
): Promise<SilhouetteData> {
  const cacheKey = `${imagePath}|${size}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  // ── Load and resize image ──────────────────────────────────────────────────
  const imageBuffer = await readFile(imagePath);

  // Probe metadata to check for alpha channel.
  const metadata = await sharp(imageBuffer).metadata();
  const hasAlpha = metadata.hasAlpha ?? false;

  if (!hasAlpha) {
    process.stderr.write(
      `[pilcrow] silhouette: image ${imagePath} has no alpha channel — shape-around will use a rectangular obstacle (no silhouette wrap). ` +
      `For v1, provide a PNG with transparency. Auto-background-removal is out of scope.\n`,
    );
  }

  // Resize to target height, preserve aspect ratio. We need the resized image
  // in TWO forms: a raw RGBA buffer for alpha sampling, and a PNG buffer for
  // the data URL that playwright.ts injects into the obstacle <img>. Reuse the
  // same resize pipeline twice to keep the geometry identical.
  const resizeOpts = { height: size, withoutEnlargement: false };

  const { data, info } = await sharp(imageBuffer)
    .resize(resizeOpts)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pngBuffer = await sharp(imageBuffer)
    .resize(resizeOpts)
    .ensureAlpha()
    .png()
    .toBuffer();

  const { width, height, channels } = info;

  let maxXArray: number[];
  if (!hasAlpha) {
    // Rectangular fallback: every row maxX = width - 1.
    maxXArray = Array.from({ length: height }, () => width - 1);
  } else {
    maxXArray = buildMaxXArray(data as unknown as Uint8Array, width, height, channels);
  }

  const imageDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

  const result: SilhouetteData = {
    width,
    height,
    maxXArray,
    maxXAtY: (y: number) => (y >= 0 && y < maxXArray.length ? (maxXArray[y] ?? -1) : -1),
    imageDataUrl,
  };

  imageCache.set(cacheKey, result);
  return result;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Given a raw RGBA (or grayscale-alpha) pixel buffer, build an array of length
 * `height` where each entry is the x-coordinate of the rightmost pixel with
 * alpha > ALPHA_THRESHOLD. Returns -1 for entirely transparent rows.
 */
function buildMaxXArray(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
): number[] {
  const ALPHA_THRESHOLD = 10;
  const maxXArray: number[] = new Array(height).fill(-1);

  for (let y = 0; y < height; y++) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = (y * width + x) * channels;
      // For RGBA (channels=4): alpha at idx+3
      // For grayscale-alpha (channels=2): alpha at idx+1
      // For RGB (channels=3): treat as fully opaque (edge case — should not happen
      //   after ensureAlpha, but guard anyway)
      const alpha =
        channels === 4 ? (data[idx + 3] ?? 0) :
        channels === 2 ? (data[idx + 1] ?? 0) :
        channels === 3 ? 255 :
        (data[idx] ?? 0);

      if (alpha > ALPHA_THRESHOLD) {
        maxXArray[y] = x;
        break;
      }
    }
  }

  return maxXArray;
}
