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
 * Cross-primitive: sidenote inside a grid cell (Spec 02-A A2a):
 *   When a <span class="sidenote-ref"> is nested inside a .pilcrow-grid-cell,
 *   the immediate parent is the grid cell, not .post-body. The hoist must walk
 *   the parent chain to find the .pilcrow-grid ancestor (a direct child of
 *   .post-body), then splice the <aside> into .post-body after the grid element.
 *
 *   The anchor <p> is still the last <p> sibling BEFORE the span in the cell's
 *   children — the marker is appended there. The aside lands after the whole
 *   grid (visually disconnected from the cell — documented A2a limitation).
 *
 *   Implementation: a pre-pass builds a WeakMap<Element, Element|Root> parent
 *   map over the full hast tree. Used in the collection pass to walk ancestors
 *   without adding a dependency on unist-util-visit-parents.
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
import type { Root, Element, Node, ElementContent, RootContent } from 'hast';

/** Check if a hast element has a given class name. */
function hasClass(el: Element, cls: string): boolean {
  const classes = el.properties?.className;
  if (!Array.isArray(classes)) return false;
  return classes.includes(cls);
}

export default function rehypeHoistSidenotes() {
  return (tree: Root) => {
    // ─── Pre-pass: build a full parent map over the hast tree ──────────────────
    // We need ancestor chains for the grid-cell hoist path. The visit() API gives
    // only the immediate parent; a WeakMap avoids adding unist-util-visit-parents.
    const parentMap = new WeakMap<Element, Element | Root>();

    visit(tree, 'element', (node: Element, _index, parent: Root | Element | undefined) => {
      if (parent !== undefined) {
        parentMap.set(node, parent);
      }
    });

    // ─── Pass 1: Collect all sidenote-ref spans with their parent and index ───
    // We collect first, then mutate, to avoid invalidating indices during the walk.
    //
    // Each entry records:
    //   span       — the <span class="sidenote-ref"> element
    //   parent     — the IMMEDIATE parent of the span (may be a grid cell)
    //   index      — the span's index in parent.children at collection time
    //   anchorP    — the last <p> sibling BEFORE this span in parent.children
    //   anchorIdx  — the anchorP's index in parent.children
    //   hoistParent — the element where the <aside> should land as a child.
    //                 For normal prose: same as parent (a .post-body-level container).
    //                 For grid-cell case: the .post-body container (or root).
    //   hoistIndex  — the index in hoistParent.children where the aside will be
    //                 spliced (replaces the span's position for normal, or after
    //                 the grid element for the grid-cell case).
    type SidenoteEntry = {
      span: Element;
      parent: Root | Element;
      index: number;
      anchorP: Element | null;
      anchorIdx: number;
      hoistParent: Root | Element;
      hoistIndex: number;
    };

    const entries: SidenoteEntry[] = [];

    visit(tree, 'element', (node: Element, index: number | undefined, parent: Root | Element | undefined) => {
      if (node.tagName !== 'span') return;
      if (!hasClass(node, 'sidenote-ref')) return;
      if (parent === undefined || index === undefined) return;

      // Find the last <p> sibling BEFORE this span in the immediate parent's children.
      let anchorP: Element | null = null;
      let anchorIdx = -1;
      for (let i = index - 1; i >= 0; i--) {
        const sibling = parent.children[i]!;
        if (sibling.type === 'element' && (sibling as Element).tagName === 'p') {
          anchorP = sibling as Element;
          anchorIdx = i;
          break;
        }
      }

      // ── Grid-cell hoist path (Spec 02-A A2a) ──────────────────────────────
      // If the immediate parent is (or is inside) a .pilcrow-grid-cell, walk up
      // the ancestor chain to find the .pilcrow-grid element and its parent.
      // The aside lands as a sibling of the grid in the post-body container.
      //
      // Ancestor walk: parent → grid-cell → grid → post-body (or root).
      // We stop when we find an ancestor that is NOT a .pilcrow-grid-cell or
      // .pilcrow-grid, i.e., when we've exited the grid structure.
      let hoistParent: Root | Element = parent;
      let hoistIndex: number = index;

      const parentEl = parent.type === 'element' ? (parent as Element) : null;
      const isInsideGridCell =
        parentEl !== null &&
        hasClass(parentEl, 'pilcrow-grid-cell');

      if (isInsideGridCell) {
        // Walk up: grid-cell → grid → whatever contains the grid.
        // parentMap gives us the chain without a separate visitParents call.
        let cursor: Element | Root | undefined = parent as Element;
        let gridEl: Element | undefined;

        while (cursor && cursor.type === 'element') {
          const el = cursor as Element;
          if (hasClass(el, 'pilcrow-grid')) {
            gridEl = el;
            break;
          }
          cursor = parentMap.get(el) ?? undefined;
        }

        if (gridEl !== undefined) {
          const gridParent = parentMap.get(gridEl) ?? tree;
          // Find the grid element's index in its parent's children.
          const gridParentChildren = (gridParent as Root | Element).children;
          // gridEl is an Element; children may be ElementContent[] or RootContent[].
          // Element satisfies both ElementContent and RootContent, so indexOf works
          // with a type assertion to the common supertype.
          const gridIdx = gridParentChildren.indexOf(gridEl as ElementContent & RootContent);
          if (gridIdx !== -1) {
            hoistParent = gridParent;
            // Splice the aside AFTER the grid element (gridIdx + 1).
            // Using gridIdx + 1 so the aside immediately follows the grid.
            hoistIndex = gridIdx + 1;
          }
        }
      }

      entries.push({ span: node, parent, index, anchorP, anchorIdx, hoistParent, hoistIndex });
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
    // For the grid-cell hoist path:
    //   - The span is REMOVED from the cell's children (splice out, nothing replaces it).
    //   - The aside is INSERTED after the grid element in the hoistParent.
    //   - The marker is appended to the anchorP inside the cell.
    //
    // For the normal hoist path:
    //   - The span is REPLACED by the aside in parent.children (same as before).
    //   - The marker is appended to the anchorP.

    // Group by anchorP for correct marker ordering.
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
    // For grid-cell entries, the hoistParent/hoistIndex may differ from
    // parent/index. We sort by descending hoistIndex within the same hoistParent
    // to keep splice offsets valid.
    const sortedDesc = [...entries].sort((a, b) => b.hoistIndex - a.hoistIndex);

    for (const entry of sortedDesc) {
      const spanChildren = entry.span.children.filter(
        (c): c is Element => c.type === 'element',
      );
      const asideEl = spanChildren.find(
        (c) => c.tagName === 'aside' && hasClass(c, 'sidenote'),
      );
      if (!asideEl) continue;

      const isGridCellHoist = entry.hoistParent !== entry.parent;

      if (isGridCellHoist) {
        // Grid-cell path: remove the span from the cell's children, then
        // insert the aside after the grid element in hoistParent.
        entry.parent.children.splice(entry.index, 1);
        // Insert aside at hoistIndex in hoistParent.children.
        // asideEl is an Element which satisfies both ElementContent and RootContent.
        (entry.hoistParent.children as Array<ElementContent>).splice(entry.hoistIndex, 0, asideEl);
      } else {
        // Normal path: replace the span with the aside in parent.children.
        (entry.parent.children as Array<ElementContent>).splice(entry.index, 1, asideEl);
      }
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
