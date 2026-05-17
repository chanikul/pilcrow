# Spec 02-F — PDF output pipeline

> Status: **SCAFFOLD.** Full spec authored when Deliverable F starts.
> Parent: `02-playground-grid-composition.md` (summary) → `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable F.

---

## Goal

`bun run build` produces a `dist/posts/<slug>.pdf` companion file for every post that contains a `:::grid` directive. Print layout preserves grid geometry, applies page-break rules per cell, generates running headers / page numbers consistent with Pilcrow's editorial register.

## Status — open before authoring

- [ ] PDF tool choice (sub-taste-call below).
- [ ] CF Pages build-time budget impact measured.
- [ ] Print stylesheet authored and visually reviewed.
- [ ] Color flattening policy on greyscale printers documented.

## Sub-taste-calls (surface before authoring)

1. **PDF tool** — Playwright print-to-PDF (reuses existing Chromium; simplest) vs paged.js (more print-faithful, page-break support, but adds runtime + npm dep). Surface options with rationale.
2. **Page size + margins** — A4, US Letter, both? Editorial-default margins?
3. **Per-post PDF or aggregate book PDF?** — one per post, one combined "all posts," both?
4. **Cover treatment** — reuse OG card as cover, or dedicated grid-aware cover?

## Dependencies

- Spec 02-A (HTML output must render correctly first).

## Cross-cutting constraints

See spec 02 index. Per-cell pretext typesetting applies in print just as in HTML.

## Out of scope for this deliverable

- EPUB output (Deliverable G).
- Print-on-demand integration (Lulu / Blurb / KDP).
- Interactive PDF features (forms, annotations).
