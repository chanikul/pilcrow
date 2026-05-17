# Spec 02-E — `bun run grid` dev-tool host

> Status: **SCAFFOLD.** Full spec authored when Deliverable E starts.
> Parent: `02-playground-grid-composition.md` (summary) → `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable E.

---

## Goal

Authors of Pilcrow posts compose a grid visually via a local dev server. `bun run grid src/content/posts/<slug>.md` opens the editor against the target file, watches for external edits, writes the directive markdown back on save.

## Status — open before authoring

- [ ] Bun script architecture (separate Astro instance vs reuse existing dev server?).
- [ ] File-watch strategy (chokidar / Bun.watch).
- [ ] Conflict handling when external edits race with editor edits.

## Sub-taste-calls (surface before authoring)

1. **Server port** — `4321` (Astro default — conflict risk with `bun run dev`) or dedicated port like `4322`?
2. **Save behaviour** — autosave on every edit, debounced batch save, or explicit Save button?
3. **Pre-existing-grid handling** — if target file already contains a `:::grid` block, load it; if multiple grids, which one (first, last, ID-selected)?

## Dependencies

- Spec 02-A (directive parser).
- Spec 02-B (editor component).

## Cross-cutting constraints

See spec 02 index.

## Out of scope for this deliverable

- Browser-based authoring (Deliverables C, D handle that).
- Multi-file batch editing.
- PDF / EPUB outputs (Deliverables F, G).
