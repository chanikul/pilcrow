/**
 * remark-shape-around — Pilcrow shape-around editorial primitive.
 *
 * Two directive variants handled by one plugin:
 *
 *   :::shape-around-glyph{glyph="a" font="Fraunces" size="480px" padding="1rem"}
 *   Prose that wraps around the glyph silhouette...
 *   :::
 *
 *   :::shape-around-image{src="./images/portrait.png" size="480px" padding="1rem"}
 *   Prose that wraps around the image silhouette...
 *   :::
 *
 * Both directives emit a wrapper div:
 *
 *   <div class="shape-around" data-type="glyph"
 *        data-glyph="a" data-font="Fraunces" data-size="480"
 *        data-padding="16" data-align="left">
 *     <p>…body prose…</p>
 *   </div>
 *
 *   <div class="shape-around" data-type="image"
 *        data-src="/path/to/image.png" data-size="480"
 *        data-padding="16" data-align="left">
 *     <p>…body prose…</p>
 *   </div>
 *
 * Attribute notes:
 *   - `size`    : numeric px value (the "px" suffix is stripped; stored as integer).
 *   - `padding` : numeric px value or CSS length. Stored as integer px (1rem = 16px approx).
 *                 Default: 16 (≈ 1rem at 16px root). The Playwright pass adds this
 *                 as extra clearance to the right of the silhouette.
 *   - `align`   : "left" only for v1. Right-float is out of scope per the brief.
 *   - `font`    : font family name string for the glyph path. Used by playwright.ts
 *                 to locate the TTF file in public/fonts/.
 *   - `src`     : relative path from the post file to the image. playwright.ts
 *                 resolves it relative to the post's file path.
 *
 * Drop-cap gate: shape-around containers do NOT consume the `isLede` flag.
 * Added to playwright.ts's gate list: `!p.closest('.shape-around')`.
 *
 * Single-paragraph constraint (v1):
 *   The body may contain multiple paragraphs — all are typeset using the
 *   variable-width walker for the rows that overlap the obstacle's vertical extent.
 *   Paragraphs that start below the obstacle get the full column width.
 *
 * Multi-obstacle constraint (v1):
 *   Only one obstacle per .shape-around block. Multiple blocks may appear in
 *   a post as separate directives.
 *
 * This plugin depends on remark-directive running before it. Wire order:
 *   [remarkDirective, remarkPullquote, remarkSidenote, remarkShapeAround]
 */

import type { Root, Paragraph, BlockContent, DefinitionContent } from 'mdast';
import { visit } from 'unist-util-visit';
import { resolve, dirname } from 'node:path';

/**
 * Parse a size string like "480px" or "480" to a number.
 * Returns NaN if unparseable.
 */
function parsePx(value: string): number {
  return parseInt(value.replace(/px$/i, '').trim(), 10);
}

/**
 * Convert a CSS length to an approximate pixel integer.
 * Supports: Npx, Nrem (1rem ≈ 16px), N (bare number treated as px).
 * Default for any other unit: 16.
 */
function toPxInt(value: string): number {
  const trimmed = value.trim();
  const remMatch = trimmed.match(/^([\d.]+)rem$/i);
  if (remMatch) return Math.round(parseFloat(remMatch[1]!) * 16);
  const pxMatch = trimmed.match(/^([\d.]+)px$/i);
  if (pxMatch) return Math.round(parseFloat(pxMatch[1]!));
  const bareMatch = trimmed.match(/^([\d.]+)$/);
  if (bareMatch) return Math.round(parseFloat(bareMatch[1]!));
  return 16; // fallback: 1rem
}

/**
 * remarkShapeAround — the plugin factory.
 * Must be registered AFTER remarkDirective, remarkPullquote, remarkSidenote.
 */
export default function remarkShapeAround() {
  return (tree: Root, file: any) => {
    const postPath: string = (file.history?.[0] as string | undefined) ?? 'unknown';
    const postDir = dirname(postPath);

    visit(tree, 'containerDirective', (node: any) => {
      const name: string = node.name;
      if (name !== 'shape-around-glyph' && name !== 'shape-around-image') return;

      const attrs: Record<string, string> = node.attributes ?? {};
      const type = name === 'shape-around-glyph' ? 'glyph' : 'image';

      // ── Collect body paragraphs ──────────────────────────────────────────────
      const paragraphChildren: Paragraph[] = (node.children as Array<BlockContent | DefinitionContent>)
        .filter((child): child is Paragraph =>
          child.type === 'paragraph' && !(child as any).data?.directiveLabel,
        );

      if (paragraphChildren.length === 0) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::${name} directive is empty — skipping\n`,
        );
        return;
      }

      // ── Parse size and padding ───────────────────────────────────────────────
      const sizeStr = (attrs['size'] ?? '480px').trim();
      const size = parsePx(sizeStr);
      if (isNaN(size) || size <= 0) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::${name} — invalid size="${sizeStr}" (expected Npx or N). Using 480.\n`,
        );
      }
      const resolvedSize = isNaN(size) || size <= 0 ? 480 : size;

      const paddingStr = (attrs['padding'] ?? '1rem').trim();
      const padding = toPxInt(paddingStr);

      const align = (attrs['align'] ?? 'left').trim();
      if (align !== 'left') {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::${name} — align="${align}" is not supported in v1 (only "left"). Using "left".\n`,
        );
      }

      // ── Build data attributes ────────────────────────────────────────────────
      const dataProps: Record<string, string | number> = {
        'data-type': type,
        'data-size': resolvedSize,
        'data-padding': padding,
        'data-align': 'left',
      };

      if (type === 'glyph') {
        const glyph = (attrs['glyph'] ?? '').trim();
        const font = (attrs['font'] ?? 'Fraunces').trim();
        if (!glyph) {
          process.stderr.write(
            `[pilcrow] ${postPath}: :::shape-around-glyph — missing required attribute "glyph" — skipping\n`,
          );
          return;
        }
        dataProps['data-glyph'] = glyph;
        dataProps['data-font'] = font;
      } else {
        const src = (attrs['src'] ?? '').trim();
        if (!src) {
          process.stderr.write(
            `[pilcrow] ${postPath}: :::shape-around-image — missing required attribute "src" — skipping\n`,
          );
          return;
        }
        // Resolve to absolute path for the playwright pass. The rendered HTML
        // attribute carries the resolved path so playwright.ts can read the file
        // without needing to know the post's location.
        const absoluteSrc = resolve(postDir, src);
        dataProps['data-src'] = absoluteSrc;
      }

      // ── Emit wrapper div ─────────────────────────────────────────────────────
      // Set hName/hProperties on the containerDirective in-place.
      // Children are the mdast paragraph nodes — mdast-util-to-hast converts them.
      node.data = node.data ?? {};
      node.data.hName = 'div';
      node.data.hProperties = {
        className: ['shape-around'],
        ...dataProps,
      };
      // Keep all body paragraphs (variable-width wrapping handles all of them).
      node.children = paragraphChildren;
    });
  };
}
