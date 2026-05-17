# Spec 02 — Pilcrow Grid Composition [SUMMARY / INDEX]

> Status: **SUMMARY DOCUMENT.** This spec began as a single feature spec for a playground grid mode, then scope-escalated after Chanikul's taste-call answers on 2026-05-17. The work is now sprint-shaped, not spec-shaped.
>
> **Canonical reference:** `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` — read that for the full plan, sequencing, and deliverable breakdown.
>
> **Per-deliverable specs:** `context/feature-specs/02-A-*.md` through `02-G-*.md` — scaffolded ahead of time; each fleshed out at the start of its deliverable.

---

## What this spec is for

This file exists as the index entry in `context/feature-specs/` so future agents looking for "Spec 02" land here and get routed to the sprint plan and sub-specs. It is **not** the implementation reference. Implementation reference is the sprint plan.

---

## Resolved decisions (taste calls answered 2026-05-17)

These are the locked taste-call answers that scoped the sprint. Recorded here as the canonical decision record for Spec 02.

| Taste call | Answer | Scope impact |
|------------|--------|--------------|
| A — Where does grid mode live? | **A3+** — authoring directive for posts, print, ebooks | Master-plan amendment; touches plugin-order invariant 5; adds two new output pipelines (PDF, EPUB) |
| B — Grid model | **B1** — three discrete Mila grids (8/16/32, fixed matrices) | Canonical matrices: 8 = 2×4, 16 = 4×4, 32 = 4×8 (pending visual review in Deliverable A) |
| C — Cell authoring | **C1** — click-to-edit cells in preview (Figma-like) | New `<GridEditor />` component; ~5–10 KB compressed; ARIA grid + keyboard nav |
| D — Field treatments | **D3** — color fields + placeholder image fields + monochromatic tint | Closest to Mila reference; placeholder-only images (real upload still Level 3); tint via CSS `filter` |
| E — Default field count | **E1** — 8 (Simple/calm) | Restrained launch first paint |
| Output formats v1 | **All three** — HTML + PDF + EPUB simultaneously | Mega-sprint scope. PDF (Playwright print or paged.js); EPUB (fixed-layout EPUB3) |
| Editor surface | **All three** — visitor playground + author dev tool + sibling route | One shared editor component, three host surfaces |
| Meta-call R | **R1** — sprint plan + sub-specs | Mirrors v3 precedent. Each deliverable independently shippable + revertible |

Decisions are locked. Re-opening any of these requires a new conversation with the typography-architect persona and a sprint-plan amendment.

---

## Deliverable index (per sprint plan §3)

| ID | Deliverable | Spec file | Phase |
|----|-------------|-----------|-------|
| A | `:::grid` directive + HTML output (foundation) | `02-A-grid-directive-html.md` | 1 |
| B | `<GridEditor />` shared visual editor component | `02-B-grid-editor-component.md` | 1 (parallel with A) |
| C | Playground host integration (`/playground/` mode switch) | `02-C-playground-host.md` | 2 |
| D | `/grid/` sibling route (dedicated grid composer) | `02-D-grid-sibling-route.md` | 2 (parallel with C) |
| E | `bun run grid` dev-tool host for post authors | `02-E-grid-dev-tool.md` | 2 |
| F | PDF output pipeline | `02-F-pdf-pipeline.md` | 3 |
| G | EPUB output pipeline | `02-G-epub-pipeline.md` | 3 (parallel with F) |

Each sub-spec carries its own per-deliverable sub-taste-calls (e.g. framework choice for the editor, PDF tool choice, EPUB tool choice). Those are surfaced and answered at the start of each deliverable, not now.

---

## Hard cross-cutting constraints (apply to every deliverable)

Pulled from the sprint plan §5 for one-glance reference. Every deliverable's spec must reiterate these:

- Five-token palette only (`--paper`, `--ink`, `--muted`, `--rule`, `--accent`).
- Build-time only — zero JS reaches shipped post output (HTML/PDF/EPUB).
- Plugin order in `astro.config.mjs` is sacred; updates require `02-architecture.md` invariant 5 amendment in the same commit.
- Pretext per cell, drop caps gated on cell width ≥ 20ch.
- Variable-axis TTFs still forbidden.
- Credit pretext + Cheng Lou in every new README.

---

## Out of scope (for the whole sprint, not just this index)

Pulled from sprint plan §7:

- Real image upload (Level 3 of playground plan)
- Drag-and-drop cell reordering (span resize only)
- 12-column responsive grid (three fixed Mila grids only)
- Multi-page grids / spreads
- Grid templates / presets
- Reflowable EPUB with grid equivalence (fixed-layout EPUB3 or documented fallback)
- Print-on-demand integration
- AI grid generation

---

## Dependencies

- Requires Pilcrow v1 baseline (shipped).
- Requires v3 library extraction (shipped Wed 6 May).
- Requires playground Level 1 (shipped Fri 8 May).
- Does **not** depend on Spec 01 (font picker). Specs 01 and 02 can ship in either order.
- Requires `PILCROW_MASTER_PLAN.md` amendment as Deliverable A first sub-task.

---

## Rollback

Per sprint plan §10 — each deliverable is independently revertible. If the sprint is aborted at any point, the highest-numbered shipped deliverable can stay; everything above it rolls back without unrolling the lower-numbered deliverables.

---

## Historical note

The original spec 02 draft (before taste-call answers landed) sat at ~390 lines describing the playground-only framing. That draft is preserved in git history at the commit that immediately preceded this rewrite (commit message: *"spec 02: scope-escalate to sprint shape after taste-call answers"*). The original framing of "grid mode for the playground" is now Deliverable C only — one of seven sub-deliverables in the realised sprint.
