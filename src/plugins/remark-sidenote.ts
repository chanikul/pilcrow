/**
 * remark-sidenote — Pilcrow sidenote (Tufte-style margin note) directive.
 *
 * Transforms :::sidenote ... ::: container directives into the canonical
 * sidenote HTML structure placed inline in the paragraph flow:
 *
 *   <span class="sidenote-ref">
 *     <sup class="sidenote-marker"></sup>
 *     <aside class="sidenote">
 *       <p>…note text…</p>
 *     </aside>
 *   </span>
 *
 * The marker number is driven by a CSS counter ("sidenote") — no number is
 * baked into the HTML. This keeps the HTML clean and lets CSS manage ordering.
 * Counter name "sidenote" is distinct from any footnote counter.
 *
 * Authoring syntax:
 *   Anchor text:::sidenote
 *   The note text, which may contain *emphasis*, **strong**, [links](url),
 *   `code`, etc.
 *   ::: rest-of-paragraph.
 *
 * For placement within body prose the directive is used as a leaf inside a
 * paragraph. However remark-directive parses :::name blocks as
 * "containerDirective" nodes at the block level. Pilcrow's approach: the
 * remark plugin transforms block-level containerDirective nodes named
 * "sidenote" into a custom hast-compatible node that Astro's mdast-to-hast
 * step will emit as the correct HTML structure.
 *
 * The :::sidenote block must appear at the block level (between paragraphs).
 * It emits a <span class="sidenote-ref"> that is a block-level element in the
 * mdast but will be inlined via CSS (display:inline). The sidenote sits in the
 * right margin on wide viewports via CSS Grid on .post-body (D3=A).
 *
 * Sidenote-inside-pullquote detection: if the directive's ancestor chain
 * contains a containerDirective named "pullquote", a build-time warning is
 * emitted to stderr but processing continues normally. The sidenote is still
 * emitted — layout may look odd but it does not error.
 *
 * Rich inline markup (em, strong, a, code) inside the sidenote paragraph flows
 * through normally — this plugin only restructures the block-level tree; inline
 * content is untouched and handled by the downstream pretext rich-inline
 * pipeline.
 *
 * This plugin depends on remark-directive running before it (remark-directive
 * parses :::name blocks into containerDirective AST nodes). Wire order in
 * astro.config.mjs: [remarkDirective, remarkPullquote, remarkSidenote].
 *
 * CSS values for this primitive: public/styles/global.css .sidenote selectors.
 * Measurement-critical rules are read by src/lib/typeset/playwright.ts via
 * readMeasurementCSS() — single source of truth contract.
 *
 * Architecture decisions (all confirmed by human):
 *   D1 = A   directive name :::sidenote
 *   D2 = A   CSS counter, separate "sidenote" counter name from footnotes
 *   D3 = A   CSS Grid layout on .post-body (3-column: left-gutter, 65ch, 25ch)
 *   D4 = C   mobile breakpoint 1100px
 *   D5 = A   sidenote measure 25ch
 *   D6 = A   line-aligned via Grid + aside placed inline at marker position
 *   D7 = A   rich-inline (em/strong/a/code) supported inside sidenote content
 *   D8 = A   build warning when sidenote inside pull quote, do NOT error
 *   D9a = A  marker glyph: numeric CSS counter
 *   D9b = A  marker font-size 0.75em
 *   D9c = A  marker colour var(--accent)
 *   D9d = A  sidenote text font-size 0.85em
 *   D9e = A  sidenote text line-height 1.4
 *   D9f = B  sidenote text colour var(--muted)
 *   D9g = A  body↔margin gap 2rem
 */

import type { Root, Paragraph, BlockContent, DefinitionContent } from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * remarkSidenote — the plugin factory.
 * Must be registered AFTER remarkDirective (and after remarkPullquote) in the
 * unified pipeline.
 */
export default function remarkSidenote() {
  return (tree: Root, file: any) => {
    // Track the source file path for warnings.
    const postPath: string = (file.history?.[0] as string | undefined) ?? 'unknown';

    visit(tree, 'containerDirective', (node: any, _index, parent: any) => {
      if (node.name !== 'sidenote') return;

      // ─── Sidenote-inside-pullquote detection (D8) ──────────────────────────
      // Walk the mdast parent chain to detect if this sidenote is nested inside
      // a pullquote containerDirective. Remark's visit gives us the direct
      // parent only, but containerDirective nodes named "pullquote" are siblings
      // at the block level — the nesting is an author error (writing :::sidenote
      // inside :::pullquote content). We check the direct parent's name; deeper
      // nesting would be unusual.
      const isInsidePullquote =
        parent?.type === 'containerDirective' && parent?.name === 'pullquote';
      if (isInsidePullquote) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::sidenote inside :::pullquote — layout may look unexpected, but the sidenote is still emitted.\n`,
        );
      }

      // Collect paragraph children (remark-directive may also include a
      // directiveLabel child if the directive has an inline label — skip it).
      const paragraphChildren: Paragraph[] = (node.children as Array<BlockContent | DefinitionContent>)
        .filter((child): child is Paragraph =>
          child.type === 'paragraph' && !(child as any).data?.directiveLabel,
        );

      if (paragraphChildren.length === 0) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::sidenote directive is empty — skipping\n`,
        );
        return;
      }

      // Use the first paragraph as the sidenote body. Multiple paragraphs:
      // emit warning and use only the first (v1 single-paragraph constraint).
      if (paragraphChildren.length > 1) {
        process.stderr.write(
          `[pilcrow] ${postPath}: :::sidenote has ${paragraphChildren.length} paragraphs — v1 supports one only. Using first; ${paragraphChildren.length - 1} dropped.\n`,
        );
      }

      const notePara = paragraphChildren[0];

      // ─── Build the HTML structure ──────────────────────────────────────────
      // The canonical structure is:
      //   <span class="sidenote-ref">
      //     <sup class="sidenote-marker"></sup>
      //     <aside class="sidenote">
      //       <p>…note text…</p>
      //     </aside>
      //   </span>
      //
      // We build this via hast property overrides on the containerDirective
      // node itself (sets it to <span class="sidenote-ref">) and reconstruct
      // children as hast raw nodes.

      // The <p> child of <aside class="sidenote"> — carries the note inline
      // content through to the pretext rich-inline pipeline.
      const noteParaHast: any = {
        type: 'element',
        tagName: 'p',
        properties: {},
        // Re-use the mdast paragraph's children; mdast-util-to-hast will
        // convert them to hast children automatically when this node is
        // itself a mdast node.  However, since we are writing a hast node
        // directly (because we set data.hChildren on the aside), we need
        // to convert inline mdast children to hast manually via data.
        //
        // Simpler approach: keep notePara as an mdast paragraph node that
        // the compiler converts, and nest it inside hast via the mdast path.
        // We do this by not using hChildren for the aside but instead using
        // mdast node nesting.
        children: [],
      };
      // The actual approach: set hName/hProperties on the containerDirective
      // to emit <span class="sidenote-ref">, then use an mdast blockquote-like
      // structure for the children so the mdast compiler handles inline content.

      // Build <aside class="sidenote"> as a containerDirective sub-node with
      // its own hName/hProperties, containing the note paragraph as an mdast node.
      const asideNode: any = {
        type: 'blockquote',
        children: [notePara],
        data: {
          hName: 'aside',
          hProperties: { className: ['sidenote'] },
        },
      };

      // Build <sup class="sidenote-marker"></sup> as a leaf paragraph with no
      // children (the CSS ::before counter fills the content).
      const markerNode: any = {
        type: 'paragraph',
        children: [],
        data: {
          hName: 'sup',
          hProperties: { className: ['sidenote-marker'] },
        },
      };

      // Set the containerDirective to emit <span class="sidenote-ref">.
      node.data = node.data ?? {};
      node.data.hName = 'span';
      node.data.hProperties = { className: ['sidenote-ref'] };
      node.children = [markerNode, asideNode];
    });
  };
}
