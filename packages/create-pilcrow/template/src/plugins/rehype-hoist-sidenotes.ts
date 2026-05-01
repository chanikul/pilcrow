/**
 * rehype-hoist-sidenotes — Pilcrow sidenote DOM restructuring.
 *
 * remark-sidenote emits <span class="sidenote-ref"> elements as DIRECT SIBLINGS
 * of <p> elements at the .post-body level. This structure prevents CSS Grid's
 * grid-column: 4 from working on the <aside> because grid-column only works on
 * DIRECT children of the grid container, and the aside is nested two levels deep.
 *
 * This plugin restructures the hast tree so that:
 *   BEFORE:
 *     <p>…anchor prose…</p>
 *     <span class="sidenote-ref">
 *       <sup class="sidenote-marker"></sup>
 *       <aside class="sidenote"><p>…note…</p></aside>
 *     </span>
 *     <p>…next paragraph…</p>
 *
 *   AFTER:
 *     <p>…anchor prose…<sup class="sidenote-marker" data-sidenote-id="N"></sup></p>
 *     <aside class="sidenote" data-sidenote-id="N"><p>…note…</p></aside>
 *     <p>…next paragraph…</p>
 *
 * The <aside> is now a direct child of .post-body (the Grid container), so
 * grid-column: 4 works. The <sup> is appended to the anchor <p> for CSS counter
 * ordering — counter(sidenote) fires in DOM source order.
 *
 * Marker ordering for multiple sidenotes after one paragraph:
 *   Sidenote refs may appear as sequential siblings after the same anchor <p>.
 *   The plugin assigns data-sidenote-id in ascending document order and appends
 *   markers to the anchor <p> in that same ascending order, so the CSS counter
 *   fires correctly.
 *
 * Note on pretext compatibility:
 *   playwright.ts reads <sup class="sidenote-marker"> outerHTML BEFORE the
 *   p.innerHTML = ... assignment, and re-appends them AFTER. This preserves
 *   the markers through the pretext typesetting pass. See playwright.ts §sidenote
 *   marker preservation comments.
 *
 * Architecture decision (master plan §11 / entry 17, confirmed by human):
 *   Strategy α — Grid auto-row: aside top edge aligns with bottom of anchor <p>.
 *   gwern-level pixel-precise line alignment is deferred to v1.x.
 */

import { visit } from 'unist-util-visit';
import type { Root, Element, Node, Parent } from 'hast';

/** Check if a hast element has a given class name. */
function hasClass(el: Element, cls: string): boolean {
  const classes = el.properties?.className;
  if (!Array.isArray(classes)) return false;
  return classes.includes(cls);
}

export default function rehypeHoistSidenotes() {
  return (tree: Root) => {
    // ─── Pass 1: Collect all sidenote-ref spans with their parent and index ───
    // We collect first, then mutate, to avoid invalidating indices during the walk.
    //
    // Each entry records:
    //   span       — the <span class="sidenote-ref"> element
    //   parent     — the parent element containing the span (body container)
    //   index      — the span's index in parent.children at collection time
    //   anchorP    — the last <p> sibling BEFORE this span in parent.children
    //   anchorIdx  — the anchorP's index in parent.children
    type SidenoteEntry = {
      span: Element;
      parent: Parent;
      index: number;
      anchorP: Element | null;
      anchorIdx: number;
    };

    const entries: SidenoteEntry[] = [];

    visit(tree, 'element', (node: Element, index: number | undefined, parent: Parent | null) => {
      if (node.tagName !== 'span') return;
      if (!hasClass(node, 'sidenote-ref')) return;
      if (parent === null || index === undefined) return;

      // Find the last <p> sibling BEFORE this span in document order.
      let anchorP: Element | null = null;
      let anchorIdx = -1;
      for (let i = index - 1; i >= 0; i--) {
        const sibling = parent.children[i];
        if (sibling.type === 'element' && (sibling as Element).tagName === 'p') {
          anchorP = sibling as Element;
          anchorIdx = i;
          break;
        }
      }

      entries.push({ span: node, parent, index, anchorP, anchorIdx });
    });

    if (entries.length === 0) return;

    // ─── Pass 2: Assign data-sidenote-id in document order (ascending) ─────────
    // IDs are 1-based to match the CSS counter (which starts at 1 by default).
    entries.forEach((entry, i) => {
      entry.span.properties = entry.span.properties ?? {};
      const sidenoteId = String(i + 1);

      // Extract the marker <sup> and <aside> from the span's children.
      // The span has two element children: sup.sidenote-marker and aside.sidenote.
      // (whitespace text nodes may also be present — filter to elements only.)
      const spanChildren = entry.span.children.filter(
        (c): c is Element => c.type === 'element',
      );

      const markerEl = spanChildren.find(
        (c) => c.tagName === 'sup' && hasClass(c, 'sidenote-marker'),
      );
      const asideEl = spanChildren.find(
        (c) => c.tagName === 'aside' && hasClass(c, 'sidenote'),
      );

      if (!markerEl || !asideEl) {
        // Malformed sidenote-ref — skip without mutating.
        process.stderr.write(
          `[pilcrow] rehype-hoist-sidenotes: sidenote-ref #${sidenoteId} is missing a marker or aside — skipping hoist for this entry.\n`,
        );
        return;
      }

      // Stamp both the marker and aside with the sidenote ID.
      markerEl.properties = { ...(markerEl.properties ?? {}), dataSidenoteId: sidenoteId };
      asideEl.properties = { ...(asideEl.properties ?? {}), dataSidenoteId: sidenoteId };
    });

    // ─── Pass 3: Mutate the tree ────────────────────────────────────────────────
    // Process in DESCENDING document order so that earlier splice indices remain
    // valid when later-in-document entries are processed first.
    // Marker appending (to anchorP) is also done here, but we collect all markers
    // that target the SAME anchorP and append them in ASCENDING order at the end.
    //
    // To handle multiple sidenotes with the same anchorP, we group entries by
    // anchorP object reference and sort within each group.
    //
    // The descending-order splice replaces the span in parent.children with the
    // aside. The marker is appended to anchorP.children.

    // Group by anchorP for correct marker ordering.
    // Key: anchorP Element (by reference via WeakMap).
    const markersByAnchor = new Map<Element | null, Array<{ markerEl: Element; id: number }>>();

    for (const entry of entries) {
      const spanChildren = entry.span.children.filter(
        (c): c is Element => c.type === 'element',
      );
      const markerEl = spanChildren.find(
        (c) => c.tagName === 'sup' && hasClass(c, 'sidenote-marker'),
      );
      if (!markerEl) continue;

      const id = parseInt(
        String((markerEl.properties?.dataSidenoteId as string | undefined) ?? '0'),
        10,
      );
      const group = markersByAnchor.get(entry.anchorP) ?? [];
      group.push({ markerEl, id });
      markersByAnchor.set(entry.anchorP, group);
    }

    // Process span replacements in descending index order.
    const sortedDesc = [...entries].sort((a, b) => b.index - a.index);

    for (const entry of sortedDesc) {
      const spanChildren = entry.span.children.filter(
        (c): c is Element => c.type === 'element',
      );
      const asideEl = spanChildren.find(
        (c) => c.tagName === 'aside' && hasClass(c, 'sidenote'),
      );
      if (!asideEl) continue;

      // Replace the <span class="sidenote-ref"> with the <aside> in parent.children.
      // parent.children[entry.index] is the span — replace it with the aside.
      entry.parent.children.splice(entry.index, 1, asideEl);
    }

    // Append markers to their anchor <p> in ascending ID order.
    for (const [anchorP, markers] of markersByAnchor) {
      if (!anchorP) continue;
      // Sort ascending by sidenote ID so markers appear in correct order.
      markers.sort((a, b) => a.id - b.id);
      for (const { markerEl } of markers) {
        anchorP.children.push(markerEl);
      }
    }
  };
}
