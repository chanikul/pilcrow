# Spec 02-D — `/grid/` sibling route (dedicated grid composer)

> Status: **SCAFFOLD.** Full spec authored when Deliverable D starts.
> Parent: `02-playground-grid-composition.md` (summary) → `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable D.

---

## Goal

Standalone `/grid/` page with chrome optimised for grid composition (more screen real estate, no settings-panel-for-prose). Embeds the same `<GridEditor />` (Spec 02-B). Cross-links with `/playground/`.

## Status — open before authoring

- [ ] Chrome design (does `/grid/` share Base.astro chrome with `chrome="minimal"` or warrant new layout?).
- [ ] Cross-link wording and placement.
- [ ] SEO meta tags (own OG card?).

## Sub-taste-calls (surface before authoring)

1. **Layout topology** — editor-only single pane, or editor + side rail with cell list / metadata?
2. **Field-count picker placement** — toolbar at top, or inline within the editor frame?
3. **Initial canvas state** — empty 8-field grid, or pre-populated demo (Mila reference)?

## Dependencies

- Spec 02-B (editor component).

## Cross-cutting constraints

See spec 02 index.

## Out of scope for this deliverable

- Playground integration (Deliverable C).
- Dev-tool host (Deliverable E).
- PDF / EPUB outputs (Deliverables F, G).
