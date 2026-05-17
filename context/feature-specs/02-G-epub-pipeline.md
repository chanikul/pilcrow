# Spec 02-G — EPUB output pipeline

> Status: **SCAFFOLD.** Full spec authored when Deliverable G starts.
> Parent: `02-playground-grid-composition.md` (summary) → `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable G.

---

## Goal

`bun run build` produces a `dist/posts/<slug>.epub` companion file. Fixed-layout EPUB3 preserves grid geometry. Validates clean against epubcheck. Opens correctly in Apple Books, Calibre, Kindle Previewer.

## Status — open before authoring

- [ ] EPUB tool choice (sub-taste-call below).
- [ ] Fixed-layout vs reflowable fallback policy documented.
- [ ] epubcheck CI integration.
- [ ] Sample post validated in three readers.

## Sub-taste-calls (surface before authoring)

1. **EPUB tool** — `epub-gen` (npm, simple, fewer features) vs pandoc (system dep, more capable) vs custom (full control over the OPF / NCX / OPS structure). Surface options.
2. **Reflowable fallback** — when a reader doesn't support fixed-layout EPUB3 (Kindle older devices), should the post degrade to single-column reflowable, or warn?
3. **Cover image dimensions** — 1600×2400 standard, but verify against current EPUB reader expectations.
4. **Embedded fonts** — bundle Fraunces (and selected font picker family if Spec 01 ships) inside the EPUB, or rely on reader fallback?

## Dependencies

- Spec 02-A (HTML output).
- Spec 02-F (print stylesheet is the model for EPUB CSS).

## Cross-cutting constraints

See spec 02 index.

## Out of scope for this deliverable

- KF8 / MOBI Kindle-specific output (Kindle Previewer ingests EPUB and converts).
- Audio narration tracks.
- DRM.
