/**
 * pilcrow-nextjs — build-time rehype plugin for the Next.js MDX pipeline.
 *
 * Runs during `next build` (or `next dev` compile passes). Takes the rehype
 * HAST tree produced from an .mdx source, serialises the post body to HTML,
 * runs `pilcrow-typeset`'s `typeset()` over it, and parses the typeset HTML
 * back into HAST nodes that replace the original tree's children.
 *
 * Build-time only by design: Next.js bundles MDX, so a runtime Playwright
 * pass is not viable inside a serverless or edge runtime. The pt-line spans
 * are baked into the compiled MDX output at build time.
 *
 * Renderer reuse:
 *   The plugin lazily opens a single `PlaywrightRenderer` on first invocation
 *   per process and reuses it across .mdx files. Next.js's compiler tears
 *   the worker down at build end, which closes the browser. For most projects
 *   this is fine — drift on long-running watch sessions is the only edge case
 *   and is accepted in 0.1.x.
 *
 * MDX-JSX limitation:
 *   `<MyComponent />` and `{expression}` nodes inside .mdx files are MDX-AST
 *   nodes that do not survive an HTML round-trip. When the plugin sees one
 *   in a file it warns to stderr and returns the tree unchanged for that
 *   file. Plain Markdown-only .mdx files typeset normally.
 */

import { toHtml } from 'hast-util-to-html';
import { fromHtml } from 'hast-util-from-html';
import { visit } from 'unist-util-visit';
import { PlaywrightRenderer, type TypesetOptions } from 'pilcrow-typeset';
import type { Root, RootContent } from 'hast';

/**
 * Options accepted by the Pilcrow Next.js rehype plugin.
 *
 * Each field maps to a `TypesetOptions` field in `pilcrow-typeset`. Empty
 * string and zero defaults are deliberate — they tell the renderer to read
 * the values from your CSS at typeset time.
 */
export interface PilcrowNextOptions {
  /** CSS font shorthand (e.g. `"18px ui-serif"`). Empty = read from page CSS. */
  fontShorthand?: string;
  /** Column width in CSS pixels. Zero = fall back to the page's `clientWidth`. */
  maxWidth?: number;
  /** Line height in CSS pixels. Zero = read from computed style. */
  lineHeight?: number;
  /** Whether to render a drop cap on the lede paragraph. Default: true. */
  dropCap?: boolean;
}

/**
 * Detect MDX-specific AST node types that cannot survive an `hast-util-to-html`
 * round-trip. If any are present in the tree we skip typesetting for that file.
 */
const MDX_NODE_TYPES = new Set([
  'mdxFlowExpression',
  'mdxTextExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxjsEsm',
]);

function containsMdxNode(tree: Root): boolean {
  let found = false;
  visit(tree, (node) => {
    if (MDX_NODE_TYPES.has(node.type)) {
      found = true;
      return false;
    }
    return undefined;
  });
  return found;
}

/**
 * Module-scoped renderer reused across files within a single build process.
 * Lazily opened on first call; closed when the Node process exits.
 */
let sharedRenderer: PlaywrightRenderer | null = null;
let openPromise: Promise<void> | null = null;

async function getRenderer(): Promise<PlaywrightRenderer> {
  if (sharedRenderer && openPromise) {
    await openPromise;
    return sharedRenderer;
  }
  sharedRenderer = new PlaywrightRenderer();
  openPromise = sharedRenderer.open();
  await openPromise;

  // Best-effort cleanup — Next.js's compiler workers are short-lived during
  // a build, but leaking a Chromium across watch reloads is worth guarding.
  const cleanup = (): void => {
    const r = sharedRenderer;
    sharedRenderer = null;
    openPromise = null;
    if (r) void r.close();
  };
  process.once('exit', cleanup);
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);

  return sharedRenderer;
}

/**
 * Rehype plugin factory. Drop into `next.config.mjs` under
 * `withMDX({ options: { rehypePlugins: [pilcrowNext()] } })`.
 *
 * Returns an async transformer; unified awaits it before continuing the
 * pipeline, so the typeset HTML is what later plugins (and the MDX
 * code-generator) see.
 */
export default function pilcrowNext(options: PilcrowNextOptions = {}) {
  const typesetOptions: TypesetOptions = {
    fontShorthand: options.fontShorthand ?? '',
    maxWidth: options.maxWidth ?? 0,
    lineHeight: options.lineHeight ?? 0,
    dropCap: options.dropCap,
  };

  return async function transformer(tree: Root, file: { path?: string }): Promise<void> {
    if (containsMdxNode(tree)) {
      const where = file.path ?? '<unknown>';
      process.stderr.write(
        `[pilcrow-nextjs] Skipping ${where}: contains MDX JSX or expression nodes that cannot round-trip through HTML. Typeset the file as plain Markdown to enable pt-line wrapping.\n`,
      );
      return;
    }

    const html = toHtml(tree);
    if (html.trim().length === 0) return;

    const renderer = await getRenderer();
    const result = await renderer.typeset(html, {
      ...typesetOptions,
      postPath: file.path,
    });

    const parsed = fromHtml(result.html, { fragment: true });
    tree.children = parsed.children as RootContent[];
  };
}

export { pilcrowNext };
