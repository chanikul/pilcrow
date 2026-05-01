/**
 * remark-pullquote — Pilcrow pull quote directive.
 *
 * Transforms :::pullquote ... ::: container directives into the canonical
 * pull quote HTML structure:
 *
 *   Attributed:
 *     <aside class="pullquote">
 *       <blockquote>
 *         <p>…quote text…</p>
 *         <footer><cite>Author Name</cite></footer>
 *       </blockquote>
 *     </aside>
 *
 *   Unattributed:
 *     <aside class="pullquote">
 *       <blockquote>
 *         <p>…quote text…</p>
 *       </blockquote>
 *     </aside>
 *
 * Authoring syntax:
 *   :::pullquote
 *   The quote text, which may contain *emphasis*, **strong**, [links](url),
 *   `code`, etc.
 *
 *   — Author Name
 *   :::
 *
 * Attribution detection: a paragraph child whose plain text content starts
 * with "— " (em-dash + space). The text after "— " becomes the <cite> content.
 * Attribution is optional; if absent, <footer> and <cite> are omitted.
 *
 * Single-paragraph constraint (v1): only the first non-attribution paragraph
 * is used as the quote body. If additional non-attribution paragraphs are
 * present, a build-time warning is emitted to stderr and the extra paragraphs
 * are dropped. Multi-paragraph pull quotes are deferred to v2.
 *
 * Rich inline markup (em, strong, a, code) inside the quote paragraph flows
 * through normally — this plugin only restructures the block-level tree;
 * inline content is untouched and handled by the downstream pretext
 * rich-inline pipeline.
 *
 * This plugin depends on remark-directive running before it (remark-directive
 * parses :::name blocks into containerDirective AST nodes). Wire order in
 * astro.config.mjs: [remarkDirective, remarkPullquote].
 *
 * CSS values for this primitive: public/styles/global.css .pullquote selectors.
 * Measurement-critical rules are read by src/lib/typeset/playwright.ts via
 * readMeasurementCSS() — single source of truth contract.
 *
 * Architecture decision (master plan §7 / §14): pull quote primitive ships
 * as a remark plugin (AST transform) rather than a rehype plugin so that
 * inline content is still processed by remark's inline pipeline before being
 * handed to hast. The HTML output is build-time only; zero runtime JS.
 */

import type { Root, Paragraph, BlockContent, DefinitionContent, PhrasingContent } from 'mdast';
import { visit } from 'unist-util-visit';

// ─── EM-DASH PREFIX ────────────────────────────────────────────────────────────
// Attribution lines begin with one of these forms:
//   — Author  (em-dash U+2014, space)
//   — Author  (same, escaped)
// We match U+2014 + optional whitespace.
const ATTRIBUTION_PREFIX_RE = /^—\s*/;

/**
 * Extract the plain text string from a paragraph's inline children.
 * Used only to test whether a paragraph is an attribution line.
 */
function paragraphToPlainText(para: Paragraph): string {
  let text = '';
  for (const child of para.children) {
    if (child.type === 'text') {
      text += child.value;
    } else if ('children' in child) {
      // Recurse into inline elements (em, strong, etc.) for the text check.
      for (const inner of (child as any).children ?? []) {
        if (inner.type === 'text') text += inner.value;
      }
    }
  }
  return text;
}

/**
 * Return true if this paragraph is an attribution line (starts with — ).
 */
function isAttributionParagraph(para: Paragraph): boolean {
  const plain = paragraphToPlainText(para);
  return ATTRIBUTION_PREFIX_RE.test(plain);
}

/**
 * Strip the "— " prefix from a paragraph's first text node and return the
 * remaining phrasing content as-is (preserves any inline markup after the prefix).
 *
 * For a paragraph that is purely `— Author Name`, this returns a simple
 * text node. For `— *Author* Name` it returns the inline children with the
 * leading "— " stripped from the first text node.
 */
function extractAttributionChildren(para: Paragraph): PhrasingContent[] {
  const children = [...para.children];
  if (children.length === 0) return [];

  // Strip "— " from the leading text content.
  // The first child should be a text node starting with "— ".
  const first = children[0];
  if (first.type === 'text') {
    const stripped = first.value.replace(ATTRIBUTION_PREFIX_RE, '');
    if (stripped.length === 0) {
      // The entire first node was "— " — drop it.
      children.shift();
    } else {
      children[0] = { ...first, value: stripped };
    }
  }
  return children;
}

/**
 * remarkPullquote — the plugin factory.
 * Must be registered AFTER remarkDirective in the unified pipeline.
 */
export default function remarkPullquote() {
  return (tree: Root, file: any) => {
    // Track the source file path for warnings.
    const postPath: string = (file.history?.[0] as string | undefined) ?? 'unknown';

    visit(tree, 'containerDirective', (node: any, index, parent: any) => {
      if (node.name !== 'pullquote') return;

      // Collect paragraph children (remark-directive may also include a
      // directiveLabel child if the directive has an inline label — skip it).
      const paragraphChildren: Paragraph[] = (node.children as Array<BlockContent | DefinitionContent>)
        .filter((child): child is Paragraph =>
          child.type === 'paragraph' && !(child as any).data?.directiveLabel,
        );

      if (paragraphChildren.length === 0) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::pullquote directive is empty — skipping\n`,
        );
        return;
      }

      // Split into attribution paragraph (if present) and body paragraphs.
      const attributionPara = paragraphChildren.find(isAttributionParagraph) ?? null;
      const bodyParas = paragraphChildren.filter(p => !isAttributionParagraph(p));

      if (bodyParas.length === 0) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::pullquote directive has only an attribution line and no quote body — skipping\n`,
        );
        return;
      }

      // Single-paragraph constraint (v1): warn and drop extra body paragraphs.
      if (bodyParas.length > 1) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::pullquote has ${bodyParas.length} body paragraphs — v1 supports one only. Using first paragraph; the remaining ${bodyParas.length - 1} paragraph(s) are dropped. Multi-paragraph pull quotes are deferred to v2.\n`,
        );
      }

      const quotePara = bodyParas[0];

      // ─── Build the blockquote children ──────────────────────────────────────
      // The quote paragraph becomes a <p> inside the <blockquote>.
      // If attribution is present, we add <footer><cite>…</cite></footer>.

      const blockquoteChildren: (BlockContent | DefinitionContent)[] = [quotePara];

      if (attributionPara !== null) {
        // Build a footer > cite structure using hast via data fields.
        // We create a paragraph node and override its hast rendering to footer > cite.
        const citeChildren = extractAttributionChildren(attributionPara);

        // cite node: a paragraph wrapping the attribution content,
        // rendered as <cite> via data.hName.
        const citeNode: Paragraph = {
          type: 'paragraph',
          children: citeChildren,
          data: {
            hName: 'cite',
          },
        };

        // footer node: a paragraph wrapping the cite, rendered as <footer>.
        // We use data.hName and data.hChildren to produce:
        //   <footer><cite>…</cite></footer>
        // using the hast representation of the cite node inline.
        //
        // Since hChildren requires hast nodes (not mdast), we build the
        // footer as a paragraph with hName='footer' whose single mdast child
        // is the cite paragraph (which will be converted to hast automatically).
        // However, mdast-util-to-hast only applies hChildren if set directly —
        // so instead we nest the structure as mdast blockquote children and
        // set hName at each level.
        const footerNode: Paragraph = {
          type: 'paragraph',
          children: [],
          data: {
            hName: 'footer',
            hChildren: [
              {
                type: 'element',
                tagName: 'cite',
                properties: {},
                // Convert citeChildren (mdast PhrasingContent[]) to hast text nodes.
                // For simplicity (and because cite content is typically plain or
                // lightly-marked text), we extract plain text here.
                // Rich inline in attribution is not a v1 requirement.
                children: citeChildren.map(c => ({
                  type: 'text' as const,
                  value: c.type === 'text' ? c.value : paragraphToPlainText({ type: 'paragraph', children: [c] } as Paragraph),
                })),
              },
            ],
          },
        };

        blockquoteChildren.push(footerNode);
      }

      // ─── Build the <blockquote> node ────────────────────────────────────────
      // We create a blockquote mdast node. The quote paragraph child retains
      // its inline content (em, strong, a, code) for downstream rich-inline
      // processing by pretext.
      const blockquoteNode: any = {
        type: 'blockquote',
        children: blockquoteChildren,
      };

      // ─── Replace the containerDirective with <aside class="pullquote"> ─────
      // Set hName/hProperties on the node in-place rather than replacing it,
      // so unist-util-visit handles the traversal safely.
      node.data = node.data ?? {};
      node.data.hName = 'aside';
      node.data.hProperties = { className: ['pullquote'] };
      // Replace children with the single blockquote node.
      node.children = [blockquoteNode];
    });
  };
}
