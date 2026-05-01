/**
 * rehype-footnote-mark — Pilcrow footnote section break.
 *
 * Finds the GFM-generated <section data-footnotes class="footnotes"> element
 * and prepends a <div class="footnotes-mark" aria-hidden="true">¶</div>
 * before its first child (the visually-hidden <h2> heading).
 *
 * The ¶ pilcrow glyph marks the footnote section break because Pilcrow's
 * identity is the paragraph mark (master plan §5). The footnote separator
 * is the first place the brand's namesake earns a quiet rendered presence
 * on every footnoted post. See master plan §11 for full rationale.
 *
 * Why a real DOM element (approach b) rather than a CSS ::before pseudo-element:
 *   CSS generated content (::before { content: '¶' }) is read aloud by NVDA,
 *   JAWS, and VoiceOver when the content is a Unicode glyph character — "pilcrow"
 *   or "paragraph sign" depending on the screen reader and its verbosity setting.
 *   Injecting an aria-hidden="true" real element avoids the issue entirely without
 *   any user-agent heuristics.
 *
 * Approach (a) vs (b) decision: (b) chosen. Pseudo-element content with Unicode
 * glyphs is documented to be read aloud in major screen readers (NVDA, JAWS,
 * VoiceOver). A real element with aria-hidden="true" is the safer accessibility
 * posture. See master plan §11 for the record.
 *
 * CSS for .footnotes-mark: public/styles/global.css.
 * Build-time only. Zero runtime JS.
 */

import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';

export default function rehypeFootnoteMark() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      // Match <section data-footnotes class="footnotes">
      if (
        node.tagName !== 'section' ||
        !node.properties?.dataFootnotes ||
        !Array.isArray(node.properties?.className) ||
        !node.properties.className.includes('footnotes')
      ) {
        return;
      }

      // Build the pilcrow mark element: <div class="footnotes-mark" aria-hidden="true">¶</div>
      const markElement: Element = {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['footnotes-mark'],
          ariaHidden: 'true',
        },
        children: [
          {
            type: 'text',
            value: '¶',
          },
        ],
      };

      // Prepend before all existing children (the visually-hidden <h2> is first).
      node.children.unshift(markElement);
    });
  };
}
