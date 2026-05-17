# Spec 02-A — `:::grid` directive + HTML output (foundation)

> Status: **FULLY SPECIFIED — all sub-taste-calls answered 2026-05-17. Ready for implementation pending master-plan amendment.**
>
> **Locked sub-taste-calls (2026-05-17):**
> - **A1 → A1b** (REVISED 2026-05-17 after first build) — curly-brace attribute syntax. `:::cell{id=1 colspan=2 fill=accent}`. **Original A1a (bare key=value) is not achievable** — remark-directive parses only curly-brace attributes; bare attributes cause the whole line to fall back to a paragraph. Confirmed by isolated AST test. Outer container uses 4 colons (`::::grid{fields=8}`), inner cells use 3 colons (`:::cell{…}`). remark-directive's nesting rule requires the outer to have MORE colons than the inner; otherwise a `:::` close closes the OUTERMOST open container, not the innermost.
> - **A2 → A2a** — `:::sidenote` inside `:::cell` hoists to `.post-body` (current behaviour) with a `[pilcrow] grid: sidenote inside grid cell` warning.
> - **A3 → A3a-i** — drop-cap-in-cell threshold is 20ch minimum cell measure. Semantics preserved: **one drop cap per post**, on the post's lede paragraph, only if its containing cell has measure ≥ 20ch (otherwise no drop cap for the post). Front-matter `dropCap: false` continues to globally suppress.
> - **A4 → A4a** — implicit cell positioning by DOM flow; optional explicit `colstart`/`rowstart` overrides; collision warns.
> - **A5 → A5a** — portrait orientation matrices: **8 fields = 2 cols × 4 rows**, **16 fields = 4 cols × 4 rows**, **32 fields = 4 cols × 8 rows**. Matches Mila brand-book screenshots. Orientation flexibility (A5c) deferred to Deliverable D (dedicated composer).
> Parent: `02-playground-grid-composition.md` (summary) → `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable A.
> Authored by: typography-architect persona (Pilcrow Feature Mode).

---

## Goal (one sentence)

Hand-authored `:::grid` Markdown renders correctly as HTML with build-time per-cell pretext typesetting, behind a single new editorial primitive that follows the established Pilcrow directive pattern (precedent: `remark-pullquote` + `remark-sidenote` + `rehype-hoist-sidenotes`).

---

## Approach (one paragraph)

A new `remarkGrid` plugin transforms `containerDirective` nodes named `grid` into a mdast tree carrying cell topology. A new `rehypeGrid` plugin restructures the resulting hast into `<div class="pilcrow-grid">` + `<div class="pilcrow-grid-cell">` children, assigning `data-*` attributes for CSS Grid placement. The playwright pass extends to find `.pilcrow-grid-cell[data-cell-kind="text"]` elements, derive each cell's measure from its computed pixel width, and run pretext per cell with the existing rich-inline pipeline. Sample post + acceptance gate extension prove byte-stable output. Master-plan amendment lands as sub-task 1.

---

## Authoring syntax (concrete)

**Two rules discovered 2026-05-17 via isolated AST testing of remark-directive:**

1. **Colon counts:** the outer grid container uses 4 colons (`::::grid`); inner cells use 3 colons (`:::cell`). remark-directive's nesting parser reads equal-count inner openers as the *closing* of the outer container, not as nested directives.
2. **Attribute syntax:** remark-directive only parses curly-brace attributes (`:::name{key=value}`). Bare `:::name key=value` causes the parser to fall back to a paragraph text node — the directive isn't recognised at all. The A1a sub-taste-call (bare attributes) is therefore not achievable; A1b (curly-brace) is the only working form.

Inner cells use `:::cell{attrs}` to open and a bare `:::` (no trailing `:::` on the opener line) to close. Outer grid uses `::::grid{attrs}` to open and `::::` to close.

```markdown
::::grid{fields=16}

:::cell{id=1 colspan=2}
The Art of Living with Less
:::

:::cell{id=3 colspan=2 rowspan=2 kind=image alt="modern dining room with thin black chairs"}
:::

:::cell{id=5 colspan=4 fill=accent}
In a world filled with noise and constant stimulation, the spaces we live in have become more important than ever. A well-designed interior does not need to feel crowded or complicated to make an impression.
:::

:::cell{id=9 colspan=4}
Mila Modern Furniture is rooted in this idea. The collection celebrates simplicity, not as an absence of character, but as a careful refinement of it.
:::

::::
```

Notes on the syntax (the four sub-taste-calls below decide some of this):

- `fields=8|16|32` on the outer grid is required.
- Each `cell` carries `id` (1-based, integer, contiguous-not-required), `colspan` (default 1), `rowspan` (default 1), `kind` (`text`|`image`|`empty`, default `text`), `fill` (one of the five token names or omitted), and for image cells `alt` (required for accessibility).
- Cells without a `colstart` / `rowstart` flow into the next free field in DOM order (implicit positioning — sub-taste-call A4 below).
- Empty cells are allowed (placeholder; renders as a blank cell honouring `fill`).

---

## Files affected

### New files

| Path | Purpose |
|------|---------|
| `packages/pilcrow-typeset/src/plugins/remark-grid.ts` | Parse `:::grid` containerDirective + nested `::: cell` children → emit mdast carrying cell topology |
| `packages/pilcrow-typeset/src/plugins/rehype-grid.ts` | Transform grid hast → `<div class="pilcrow-grid">` + `<div class="pilcrow-grid-cell">` with `data-*` attributes; cross-primitive interaction warnings |
| `src/content/posts/grid-demo.md` | Sample post exercising 8/16/32 grids + color fields + image cell |
| `context/feature-specs/02-A-cross-primitive-matrix.md` | Compatibility matrix output of the cross-primitive interaction tests (grid + sidenote, grid + footnote, grid + pullquote inside cells) |

### Modified files

| Path | Change |
|------|--------|
| `astro.config.mjs` | Add `remarkGrid` to remark plugins (after `remarkSidenote`); add `rehypeGrid` to rehype plugins (after `rehypeHoistSidenotes`, before `rehypeImages`) |
| `packages/pilcrow-typeset/src/playwright.ts` | Extend playwright pass to find `.pilcrow-grid-cell[data-cell-kind="text"]` cells, derive per-cell measure, invoke pretext per cell. Drop-cap suppression in cells with measure < 20ch |
| `public/styles/global.css` | Add `.pilcrow-grid` + `.pilcrow-grid-cell` rules; `[data-grid-fields="8|16|32"]` matrix presets; `[data-cell-fill="paper|muted|accent|rule"]` color rules; mobile fallback (≤768px: `grid-template-columns: 1fr`) |
| `packages/pilcrow-typeset/src/playwright.ts` `readMeasurementCSS()` | Extend to extract the new grid-related rules so `loaderHTML` carries them |
| `context/02-architecture.md` invariant 5 | Append `remarkGrid` and `rehypeGrid` to the plugin order documentation |
| `~/Sandbox/PILCROW_MASTER_PLAN.md` | Insert §12 amendment (separately authored — see "Master-plan amendment copy" below) |
| `context/06-progress-tracker.md` | Mark 02-A `in_progress`; append decision-log entry when complete |
| `scripts/gate-playground-acceptance.mjs` | Add canonical grid composition (8-field demo) to the byte-identical gate |

### New dependencies

**None.** `remark-directive` is already in the pipeline. `unist-util-visit` is already used. CSS Grid is browser-native. No new npm packages introduced by Deliverable A.

---

## Design decisions (mechanical — no sign-off needed)

These follow from constraints + precedent and do not require taste-call answers.

**Plugin design follows the established two-stage pattern.** `remarkGrid` only restructures the mdast tree (transforms `containerDirective` → custom mdast nodes with `data.hName` / `data.hProperties`). `rehypeGrid` does the cross-element work that needs hast (`data-sidenote-id`-style ID stamping, anchor reattachment, validation warnings). This mirrors `remark-sidenote` + `rehype-hoist-sidenotes` exactly.

**Plugin order.** New order in `astro.config.mjs`:
```
remark: [remarkDirective, remarkPullquote, remarkSidenote, remarkGrid]
rehype: [rehypeFootnoteMark, rehypeHoistSidenotes, rehypeGrid, rehypeImages]
```
Rationale: `remarkGrid` runs after `remarkSidenote` so that sidenote directives nested inside grid cells are already transformed by the time grid processes its children. `rehypeGrid` runs after `rehypeHoistSidenotes` so hoist's parent-restructuring has settled before grid claims direct children. `rehypeGrid` runs before `rehypeImages` so image cells can apply the Sharp pipeline normally.

**Cell topology serialisation.** The mdast carries a `data.gridCellSpec` object on each cell node: `{ id, colspan, rowspan, kind, fill, alt }`. `rehypeGrid` reads this and stamps `data-cell-id`, `data-cell-kind`, `data-cell-fill`, plus the `grid-column: A / span B` and `grid-row: C / span D` inline `style`.

**Implicit positioning algorithm.** Cells without `colstart`/`rowstart` flow into the next free field in DOM order using a single-pass occupancy scanner. `rehypeGrid` runs this in pass 2 and stamps the resulting `gridColumn` + `gridRow` inline styles. Explicit positioning (when `colstart` / `rowstart` *are* provided) overrides the scanner; collisions warn (`[pilcrow] grid: cell #X position collision with cell #Y at column Z, row W`).

**Per-cell pretext invocation.** In `playwright.ts`, after the existing `.post-body` per-paragraph pass, a new loop finds every `.pilcrow-grid-cell[data-cell-kind="text"]` element, reads its `getBoundingClientRect().width`, converts to a ch measure via the cached `pixelsPerCh` value, and invokes `prepareWithSegments` + `layoutWithLines` per cell. Drop-cap suppression: if cell measure < 20ch, the lede paragraph in that cell does NOT get a drop cap (the `dropCap: true` front-matter is still honoured for the post's top-level lede paragraph outside any grid).

**Cross-primitive policy.** Pilcrow's precedent (`remark-sidenote` warning on sidenote-inside-pullquote) is "warn-and-render, don't error." 02-A follows the same policy:
- `:::pullquote` inside a `:::cell` → warn (`[pilcrow] grid: pullquote inside grid cell — layout may look unexpected, but the pullquote is still emitted.`); render.
- `:::sidenote` inside a `:::cell` → warn (`[pilcrow] grid: sidenote inside grid cell — sidenote will be hoisted out of the grid and may render below the post.`); the existing `rehype-hoist-sidenotes` plugin will hoist it out of the cell (since asides need to be direct children of `.post-body` for the 4-column Grid). The sidenote's CSS Grid positioning will look wrong relative to the grid; this is an explicit known-limitation, documented in the cross-primitive matrix.
- Footnote markers inside a `:::cell` → no special handling; footnote-list lives at the bottom of the post outside any grid, unchanged.
- `:::grid` inside a `:::grid` → error (`[pilcrow] grid: nested :::grid is not supported`); skip the inner grid.

**Mobile fallback.** Below 768px, grids collapse: `grid-template-columns: 1fr`, all cells stack vertically in DOM order. Cells with `colspan > 1` lose their span (they become full-width in the mobile single column anyway). Image cells preserve their `data-cell-kind="image"` styling. Color fills preserve. Tested precedent: Level 1 playground radio-tab mobile fallback.

**Performance budget.** Aggregate paste-to-typeset for 32-field grid with text in 16 cells under 100ms is the gate. Each per-cell pretext call is ~5–15ms for a 4ch–20ch measure cell (a sub-linear cost — narrower measure = less text per cell = faster layout). Budget headroom assumed available based on Level 1's <25ms paste roundtrip baseline.

**Acceptance gate extension.** `scripts/gate-playground-acceptance.mjs` gets a new canonical: an 8-field grid composition with two text cells, one image cell, two color-fill cells, three empty cells. Byte-identical innerHTML build-to-build is the gate.

**Master-plan amendment scope (smaller than originally framed).** Master plan §7 already lists "Print-quality PDF export via Paged.js — the standout feature no other blog platform has" as a v2 feature. The amendment **accelerates** PDF from "v2 someday" to "v2 active sprint" rather than adding net-new scope, and **adds** EPUB + the `:::grid` directive itself. See the draft amendment copy below.

---

## Sub-taste-calls (surface to Chanikul before implementation)

These four (plus one bonus) need answers before the remark plugin is written.

### Sub-taste-call A1 — Cell directive syntax [ANSWERED: A1a]

User answer: **A1a** — bare key=value attribute syntax. `::: cell id=1 colspan=2 fill=accent :::`

**Implementation note:** remark-directive's default attribute parser expects the curly-brace form. Implementing A1a requires either (a) custom attribute tokenisation in `remarkGrid` after the directive lands (post-process the raw text after the directive name), or (b) a thin pre-processor that converts the bare form to the curly form before remark-directive sees it. Path (a) is more localised. Documented as an implementation note for the implementing agent.

### Sub-taste-call A2 — Cross-primitive policy detail [ANSWERED: A2a]

User answer: **A2a** — hoist to `.post-body` (current behaviour) + warn.

**Implementation note:** the existing `rehype-hoist-sidenotes` plugin already does the hoist work. The new requirement is just the warning emission. Add a check in `rehype-grid` (or `rehype-hoist-sidenotes`): if a `<aside class="sidenote">` lands inside a `.pilcrow-grid-cell`, emit `[pilcrow] grid: sidenote inside grid cell — sidenote will be hoisted out of the grid and may render below the post.` Continue normal hoist.

### Sub-taste-call A3 — Drop-cap-in-cell threshold [ANSWERED: A3a-i]

User answer: **A3a-i** — threshold 20ch + preserve "one drop cap per post" semantics.

**Implementation:** in `playwright.ts`, after locating the post's lede paragraph (the existing logic finds the first non-empty `<p>` and applies the drop cap), add a check: if that paragraph is inside a `.pilcrow-grid-cell`, read the cell's `getBoundingClientRect().width`, convert to ch via `pixelsPerCh`, suppress the drop cap if measure < 20ch. Emit `[pilcrow] grid: lede paragraph in cell #X has measure <Y>ch (< 20ch threshold) — drop cap suppressed.` Front-matter `dropCap: false` continues to suppress globally as today.

### Sub-taste-call A4 — Implicit vs explicit cell positioning [ANSWERED: A4a]

User answer: **A4a** — implicit flow + optional explicit colstart/rowstart override.

**Implementation note:** the occupancy scanner in `rehype-grid` does pass 2 (after ID stamping in pass 1). For each cell in DOM order: if `colstart` and `rowstart` are both set explicitly, validate (warn on collision); otherwise scan the occupancy matrix for the next free `colspan × rowspan` block and assign. Stamp inline `style="grid-column: A / span B; grid-row: C / span D;"`. CSS Grid's `auto-flow` does not give us deterministic placement at build time — we must compute placement in the plugin.

### Sub-taste-call A5 — Grid matrix canonicalisation [ANSWERED: A5a]

User answer: **A5a** — portrait orientation. **8 = 2×4, 16 = 4×4, 32 = 4×8.**

**Implementation:** in `rehype-grid.ts`, the `fieldsToMatrix` lookup table is:
```ts
const MATRIX: Record<8 | 16 | 32, { cols: number; rows: number }> = {
  8:  { cols: 2, rows: 4 },
  16: { cols: 4, rows: 4 },
  32: { cols: 4, rows: 8 },
};
```
Stamped on the `.pilcrow-grid` container as `style="--grid-cols: <cols>; --grid-rows: <rows>;"`. CSS reads these custom properties to set `grid-template-columns: repeat(var(--grid-cols), 1fr)` and `grid-template-rows: repeat(var(--grid-rows), minmax(0, 1fr))`. Orientation flexibility (A5c) deferred to Deliverable D.

---

## Acceptance criteria (each must pass before 02-A is marked complete)

- [ ] `bun run build` clean. No new `[pilcrow]` warnings on the existing post corpus.
- [ ] `src/content/posts/grid-demo.md` (sample post) renders three sections: 8-field grid, 16-field grid, 32-field grid. Each cell visually correct.
- [ ] Color-field cells (`fill=accent`, `fill=muted`, `fill=paper`, `fill=rule`) render correctly. Text inside coloured cells re-colours per the Mila brand-book sequence (extend / inner space / change text color) — implementation TBD as a follow-up CSS pass during 02-A.
- [ ] Placeholder image cells (`kind=image`) render as inline SVG silhouettes at the correct aspect ratio with `data-cell-kind="image"` and the `alt` attribute applied.
- [ ] Per-cell pretext output: `<span class="pt-line">` wrappers visible in text cells. Cell-local line breaks correct.
- [ ] Drop cap appears only in the post's lede paragraph (whichever cell holds it).
- [ ] Implicit cell positioning: cells without `colstart`/`rowstart` flow into next-free fields. Multiple-cell grid renders without overlap.
- [ ] Explicit cell positioning: cells with explicit `colstart`/`rowstart` override the flow. Collision warning fires on overlap.
- [ ] Cross-primitive matrix (`context/feature-specs/02-A-cross-primitive-matrix.md`) authored with one fixture per combination: grid+sidenote, grid+pullquote, grid+footnote, grid+image, grid+grid (error case). Documented behaviour matches the spec's policy.
- [ ] Mobile fallback at ≤768px: all cells stack vertically; image cells preserve aspect ratio; color fills preserve.
- [ ] Acceptance gate (`scripts/gate-playground-acceptance.mjs`): canonical 8-field grid passes byte-identical innerHTML check build-to-build.
- [ ] No TypeScript errors. No `any`. No hex literals in CSS. No new dependencies.
- [ ] Master-plan amendment landed at `~/Sandbox/PILCROW_MASTER_PLAN.md` §12.
- [ ] Architecture decision-log entry appended at `context/02-architecture.md` (plugin order update + new primitive).
- [ ] Progress tracker (`context/06-progress-tracker.md`) updated: 02-A `completed` with one-line summary.

---

## Out of scope (explicit)

- Editor UI (Deliverable B).
- PDF / EPUB outputs (Deliverables F, G).
- Real image upload (placeholder SVG silhouettes only).
- Host surface integration (Deliverables C, D, E).
- The full visual-treatment matrix from the Mila brand book (cramped/accidental/intentional digital margin presets). Single `--digital-margin` value applied for 02-A; presets are a Deliverable B/C concern.
- Nested grids (warn-and-skip; not supported in v1).
- Grid + sidenote with cell-anchored repositioning (A2c is out of 02-A scope).

---

## Rollback

If 02-A turns out to be the wrong primitive, the rollback is mechanical:

1. Revert the master-plan §12 amendment commit.
2. Remove `remarkGrid` from `astro.config.mjs` remark plugins array; remove `rehypeGrid` from rehype plugins array.
3. Delete `packages/pilcrow-typeset/src/plugins/remark-grid.ts` and `rehype-grid.ts`.
4. Revert the `playwright.ts` per-cell extension.
5. Remove `.pilcrow-grid` + `.pilcrow-grid-cell` CSS from `global.css`.
6. Delete `src/content/posts/grid-demo.md`.
7. Revert the acceptance gate extension.

All seven steps are independent. No existing post is affected (the `:::grid` directive simply wasn't used in any pre-02-A post).

---

## Notes for the implementing agent

- Read the existing `remark-sidenote.ts` and `rehype-hoist-sidenotes.ts` first. Copy the pattern; don't re-derive it.
- The collect-then-mutate phase split in `rehype-hoist-sidenotes` is the right model for `rehype-grid`'s ID-stamping + collision detection + cell-position assignment.
- The `data.hName` / `data.hProperties` pattern in `remark-sidenote` is exactly how the cell node should emit `<div class="pilcrow-grid-cell">`.
- `process.stderr.write` with the `[pilcrow]` prefix is the warning convention. Match it.
- The cross-primitive matrix is itself a documentation deliverable. Write the matrix doc as you discover each interaction; commit it alongside the plugins.
- Drop-cap suppression policy A3c is the simplest and matches existing semantics — implement it that way unless Chanikul picks A3a/A3b.
- Per-cell pretext invocation in `playwright.ts` should reuse the existing `prepareWithSegments` + `layoutWithLines` path, NOT the variable-width `layoutNextLineRange` path (cells don't have floats — that's reserved for drop-cap interaction with the post's top-level lede).

---

## Sources (referenced by this spec)

- `packages/pilcrow-typeset/src/plugins/remark-sidenote.ts` — directive parsing precedent.
- `packages/pilcrow-typeset/src/plugins/rehype-hoist-sidenotes.ts` — hast restructuring precedent.
- `~/Sandbox/PILCROW_MASTER_PLAN.md` §7 (PDF export already in roadmap) + §11 (open decisions log).
- `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable A (parent sprint plan).
- `context/02-architecture.md` invariant 5 (plugin order — to be amended).
- `context/05-ui-context.md` (five-token palette).
- Mila Modern Furniture brand-guideline screenshots (user-provided, 2026-05-17) — visual reference for grid + treatments.
