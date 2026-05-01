/**
 * rehype-images — Pilcrow image pipeline rehype plugin.
 *
 * Visits every <img> element in the hast AST that was emitted by the Markdown
 * processor and replaces it with:
 *
 *   <figure class="pilcrow-figure" style="aspect-ratio: W/H">
 *     <picture>
 *       <source type="image/avif" srcset="…640w, …1280w, …1920w"
 *               sizes="(max-width: 640px) 640px, (max-width: 1280px) 1280px, 1920px" />
 *       <source type="image/webp" srcset="…" sizes="…" />
 *       <img src="…fallback…" alt="…" width="W" height="H"
 *            loading="lazy" decoding="async" data-thumbhash="…" />
 *     </picture>
 *     [<figcaption>alt text</figcaption>]   ← only when alt is non-empty
 *   </figure>
 *
 * Alt-text policy (D4=A):
 *   - If alt is absent or empty, emits `[pilcrow] WARNING: image without alt`
 *     to stderr, sets alt="" on the <img> (WCAG-correct for decorative), and
 *     omits the <figcaption>.
 *   - If alt is present, uses it for both the <img alt> and the <figcaption>.
 *
 * Image source resolution:
 *   Source images are located relative to `src/content/posts/` (the Astro
 *   content directory for posts). The `src` attribute value from Markdown
 *   (e.g. `./images/photo.jpg` or `images/photo.jpg`) is resolved against
 *   that directory. If the VFile history path is available, paths are also
 *   resolved relative to the directory containing the source .md file.
 *
 * Processing:
 *   Calls `processImage()` from `src/lib/images/process.ts`, which uses Sharp
 *   to generate AVIF + WebP + original-format variants at 640/1280/1920px
 *   and a thumbhash placeholder. The output files are written to
 *   `dist/_images/` during the rehype transform phase.
 *
 * Architecture (D6=A): custom rehype plugin using Sharp directly.
 * Rationale: Astro's `getImage()` is a Vite virtual module unavailable at
 * config / rehype plugin scope. Sharp is already a transitive dep (0.34.5).
 * Using Sharp directly gives us full control over format, quality, and the
 * thumbhash generation step.
 *
 * Async transform:
 *   Unified (v11+) supports async transformers natively. Astro 6's markdown
 *   pipeline awaits async rehype transformers. We collect all <img> nodes in
 *   a single synchronous walk, then process them in parallel with Promise.all,
 *   then replace nodes in descending index order to keep splice indices valid.
 */

import { visit } from 'unist-util-visit';
import { resolve, join, dirname, isAbsolute, basename } from 'node:path';
import type { Root, Element, Properties } from 'hast';
import type { VFile } from 'vfile';
import { processImage } from '../lib/images/process.js';

// ─── Plugin options ───────────────────────────────────────────────────────────

export interface RehypeImagesOptions {
  /**
   * Absolute path to the Astro project root (process.cwd()).
   * Used as the output base for dist/_images/ and for resolving relative paths.
   */
  projectRoot: string;
}

// ─── Responsive sizes attribute ───────────────────────────────────────────────

/**
 * Responsive sizes attribute matching our breakpoints (D2: 640/1280/1920).
 * Tells the browser which source to pick at each viewport width.
 */
const SIZES = '(max-width: 640px) 640px, (max-width: 1280px) 1280px, 1920px';

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default function rehypeImages(options: RehypeImagesOptions) {
  const { projectRoot } = options;

  return async (tree: Root, file: VFile) => {
    // Derive a post slug from the VFile history path for warning messages.
    const sourcePath = (file.history?.[0] as string | undefined) ?? '';
    const postSlug   = sourcePath ? basename(sourcePath, '.md').replace(/\.mdx$/, '') : 'unknown-post';
    // Content dir: prefer directory of the source file, fall back to posts dir.
    const contentDir = sourcePath ? dirname(sourcePath) : join(projectRoot, 'src/content/posts');

    // ── Pass 1: collect all <img> elements ───────────────────────────────
    type ImgEntry = {
      node:   Element;
      parent: Element;
      index:  number;
    };
    const entries: ImgEntry[] = [];

    visit(tree, 'element', (node: Element, index: number | undefined, parent) => {
      if (node.tagName !== 'img') return;
      if (index === undefined || parent === null) return;
      entries.push({ node, parent: parent as Element, index });
    });

    if (entries.length === 0) return;

    // ── Pass 2: process images in parallel ───────────────────────────────
    const results = await Promise.all(
      entries.map(async ({ node }) => {
        const srcAttr = String(node.properties?.src ?? '');
        if (!srcAttr) return null;

        // Resolve absolute path.
        const absPath = isAbsolute(srcAttr) ? srcAttr : resolve(contentDir, srcAttr);

        try {
          return await processImage(absPath, projectRoot);
        } catch (err) {
          process.stderr.write(
            `[pilcrow] ERROR: rehype-images could not process "${srcAttr}" in post "${postSlug}": ${err}\n`,
          );
          return null;
        }
      }),
    );

    // ── Pass 3: replace nodes in DESCENDING index order ──────────────────
    const sortedDesc = entries
      .map((e, i) => ({ ...e, result: results[i] }))
      .sort((a, b) => b.index - a.index);

    for (const { node, parent, index, result } of sortedDesc) {
      if (!result) continue; // leave errored images in place

      const alt      = String(node.properties?.alt ?? '').trim();
      const filename = String(node.properties?.src ?? '').split('/').pop() ?? 'image';

      // Alt-text policy (D4=A): warn on missing/empty alt.
      if (!alt) {
        process.stderr.write(
          `[pilcrow] WARNING: image without alt — ${postSlug} — ${filename}\n`,
        );
      }

      const { avifSrcset, webpSrcset, fallbackSrc, width, height, thumbhash, placeholderDataURL } = result;

      // ── <source type="image/avif"> ────────────────────────────────────
      const avifSource: Element = {
        type:       'element',
        tagName:    'source',
        properties: {
          type:   'image/avif',
          srcSet: avifSrcset,
          sizes:  SIZES,
        } as Properties,
        children: [],
      };

      // ── <source type="image/webp"> ────────────────────────────────────
      const webpSource: Element = {
        type:       'element',
        tagName:    'source',
        properties: {
          type:   'image/webp',
          srcSet: webpSrcset,
          sizes:  SIZES,
        } as Properties,
        children: [],
      };

      // ── <img> fallback ────────────────────────────────────────────────
      const imgEl: Element = {
        type:       'element',
        tagName:    'img',
        properties: {
          src:           fallbackSrc,
          alt:           alt,
          width:         width,
          height:        height,
          loading:       'lazy',
          decoding:      'async',
          dataThumbhash: thumbhash,
        } as Properties,
        children: [],
      };

      // ── <picture> ─────────────────────────────────────────────────────
      const pictureEl: Element = {
        type:       'element',
        tagName:    'picture',
        properties: {},
        children:   [avifSource, webpSource, imgEl],
      };

      // ── <figcaption> (omitted when alt is empty) ──────────────────────
      const figChildren: Element['children'] = [pictureEl];
      if (alt) {
        const figcaptionEl: Element = {
          type:       'element',
          tagName:    'figcaption',
          properties: {},
          children:   [{ type: 'text', value: alt }],
        };
        figChildren.push(figcaptionEl);
      }

      // ── <figure> ──────────────────────────────────────────────────────
      // Inline aspect-ratio prevents layout shift (CLS) before the image loads.
      // D3=A: original aspect ratio only — no standardised cropping.
      // data-placeholder: thumbhash decoded to a PNG data URL at build time.
      // The browser blur-up script reads this and sets it as background-image
      // on the figure, then removes it after the real image fades in.
      const figureEl: Element = {
        type:       'element',
        tagName:    'figure',
        properties: {
          className:       ['pilcrow-figure'],
          style:           `aspect-ratio: ${width} / ${height}`,
          dataPlaceholder: placeholderDataURL,
        } as Properties,
        children:   figChildren,
      };

      // ── Replace <img> with <figure> in parent.children ────────────────
      parent.children.splice(index, 1, figureEl);
    }
  };
}
