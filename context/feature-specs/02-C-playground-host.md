# Spec 02-C — Playground host integration (`/playground/` mode switch)

> Status: **SCAFFOLD.** Full spec authored when Deliverable C starts.
> Parent: `02-playground-grid-composition.md` (summary) → `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable C.

---

## Goal

Embed `<GridEditor />` (Spec 02-B) in the existing `/playground/`. Add a Prose / Grid mode toggle to `Settings.astro`. Extend `pilcrow:settings-changed`, share-URL, and copy-HTML to support grid mode without breaking prose mode.

## Status — open before authoring

- [ ] Settings shape extension reviewed against Level 1 contract.
- [ ] Share-URL encoding tested round-trip with grid payloads (lz-string may need re-benchmarking for grid markdown).
- [ ] Mobile fallback follows Level 1 radio-tab pattern.

## Sub-taste-calls (surface before authoring)

1. **Mode toggle placement** — row 1 of settings, or row 0 (above font swatches)?
2. **Conditional control hiding** — in grid mode, hide drop-cap + hyphenation toggles? (They apply per-cell; arguably useful.)
3. **Default mode on first visit** — Prose (current), or remember last-used via localStorage?

## Dependencies

- Spec 02-A (directive must round-trip).
- Spec 02-B (editor component).
- Playground Level 1 (shipped).

## Cross-cutting constraints

See spec 02 index. Level 1 `pilcrow:settings-changed` contract is frozen — extend additively only.

## Out of scope for this deliverable

- `/grid/` sibling route (Deliverable D).
- Dev-tool host (Deliverable E).
- PDF / EPUB outputs (Deliverables F, G).
