# Spec 02-B — `<GridEditor />` shared visual editor component

> Status: **FULLY SPECIFIED — all sub-taste-calls answered 2026-05-17. Ready for implementation.**
> Parent: `02-playground-grid-composition.md` (summary) → `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable B.
> Authored by: typography-architect persona (Pilcrow Feature Mode).
>
> **Locked sub-taste-calls (2026-05-17):**
> - **B1 → B1a** — Astro + vanilla TypeScript. Zero new deps. Matches every existing playground component (Settings, Editor, Preview, FontPicker).
> - **B2 → B2a** — Inline contenteditable on the cell itself. Use `contenteditable="plaintext-only"` to sidestep rich-paste / formatting-button risks. Cell visually IS the editor.
> - **B3 → B3a (clarified 2026-05-17)** — **Editor uses plain-text contenteditable.** No markdown rendering in the editor itself. Cell content preserved verbatim — if the user types `# Hello`, the editor stores the literal string `"# Hello"`. **At build time, the directive's normal markdown pipeline renders that string as `<h1>Hello</h1>` in the post HTML.** This creates a WYSIWYG mismatch by design: editor shows source, post shows rendered output. The editor's first-paint help text must document this. Same trade-off as raw-textarea Markdown editors. Saves ~1–15KB vs B3b. No markdown parser ships in the editor bundle. Cell content is preserved as a raw string; the directive serialiser does NOT escape `#`, `*`, `_` (those are valid Markdown source the user wants preserved).
> - **B4 → B4a** — Toolbar + right-click context menu for add/remove/duplicate/move.
> - **B5 → B5a-meta** — Floating toolbar appears on cell select, carries kind / fill / span controls. Position above the cell when there's room above; below otherwise. Disappears on deselect.
> - **B6 → B6c** — Same desktop UI on mobile, grid collapses to single column (drag handles hidden). **Risk flagged:** at 375px wide a 4-col grid renders cells ~93px wide; below 6-col grids may not be readable. Test against canonical fixtures; defer per-cell-form fallback (B6a) to a follow-up if real users hit the wall.

---

## Goal (one sentence)

A reusable interactive component that renders a Figma-like editor over a `:::grid` directive — click-to-edit cell content, drag handles for span resize, palette-fill picker, cell-kind switcher — bidirectional with directive markdown, mounting cleanly into three host surfaces (Deliverables C, D, E) with shared codebase.

---

## Approach (one paragraph)

A single component file ships under `src/components/grid/GridEditor.astro` and is consumed by three downstream hosts via a uniform prop signature (initial markdown + change callback). The editor's source of truth is a parsed in-memory representation of the cells (mirrors `GridCellSpec` from `remark-grid.ts`); edits mutate the in-memory state and re-render the grid DOM, then debounce-serialise back to directive markdown for the host. The editor never round-trips through `remark-grid` itself at edit time — that would be too slow — but does call a shared parser on initial mount and on explicit "reload from source" actions. Keyboard nav, ARIA grid semantics, and screen-reader announcements are first-class concerns: this is the first interactive surface in the Pilcrow product that's complex enough to warrant axe-core in the verify step.

---

## Files affected

### New files

| Path | Purpose |
|------|---------|
| `src/components/grid/GridEditor.astro` | The editor component itself (markup + hydration script) |
| `src/lib/grid/parse-directive.ts` | Pure parser: directive markdown → `GridDocument` (array of `GridCellSpec` + grid metadata) |
| `src/lib/grid/serialize-directive.ts` | Pure serialiser: `GridDocument` → directive markdown |
| `src/lib/grid/grid-document.ts` | Shared types: `GridDocument`, `EditorCommand` union, helpers |
| `src/lib/grid/keyboard-nav.ts` | Arrow-key / Tab / Enter / Esc handlers for ARIA grid semantics |
| `src/pages/dev/grid-editor.astro` | Standalone test fixture for isolated editor development |
| `scripts/smoke-grid-editor.ts` | Headless Playwright smoke test: round-trip + keyboard nav + ARIA |
| `context/feature-specs/02-B-bundle-budget.md` | Per-decision bundle-size accounting (filled in during implementation) |

### Modified files

| Path | Change |
|------|--------|
| `public/styles/global.css` | Editor-specific CSS (cell focus rings, drag handles, palette picker, kind switcher); scoped under `.grid-editor` so it doesn't bleed into shipped post output |
| `context/02-architecture.md` | Decision-log entry on the framework choice + a new architectural invariant if the editor introduces one (e.g. "editor JS never reaches a post reader") |
| `packages/pilcrow-typeset/src/plugins/remark-grid.ts` | Possibly export the bare-attribute / canonical-matrix constants so the editor's parser/serialiser can share them. No behavioural change |

### New dependencies

**Surfaced as B1 sub-taste-call below.** The framework decision dictates whether any new dependency lands (vanilla TypeScript adds none; Svelte/Preact each add one). No new dependency lands until B1 is answered.

---

## Design decisions (mechanical — no sign-off needed)

These follow from the constraints + existing precedent and don't require taste-call answers.

**Component lives in `src/components/grid/`, not `src/components/playground/`.** The playground is one of three hosts; the editor is shared infrastructure. Grouping by feature (grid) rather than by host respects the multi-surface use.

**Editor reads directive markdown on mount; serialises back on debounce-200ms after each edit.** The parser + serialiser are pure functions (no DOM, no state) so they can be unit-tested in isolation. Mirrors the Level 1 share-URL `encodeShareURL` / `decodeShareURL` precedent.

**`GridDocument` is the in-memory editor state.** Shape: `{ fields: 8|16|32, cells: GridCellSpec[] }`. The `GridCellSpec` type is re-used from `remark-grid.ts` (exported for this purpose). No new schema invented; the directive markdown is the canonical wire format.

**Editor emits a `pilcrow:grid-editor-changed` CustomEvent on every settled edit** with `detail: { markdown: string, source: 'user' | 'init' | 'restore' }`. Mirrors the Level 1 `pilcrow:editor-changed` shape exactly. Hosts subscribe and react.

**ARIA grid semantics are mandatory, not aspirational.** `role="grid"` on the container, `role="row"` on logical row groupings, `role="gridcell"` on each cell, `aria-rowindex` / `aria-colindex`. Keyboard navigation uses arrow keys to move between cells, Enter to edit, Esc to deselect. This is the right thing AND it's the only path to passing the axe-core gate.

**No reader JS reaches a post.** The editor is an authoring surface. The `:::grid` directive renders to a static HTML grid at build time; the editor's JS lives only at `/playground/`, `/grid/`, or the `bun run grid` dev tool. Architectural invariant 1 stays satisfied.

**No undo/redo in v1.** Implementing CRDT-quality undo for a grid editor is a substantial separate effort. Browser-native Cmd-Z on contenteditable cells handles within-cell undo; cross-cell undo is deferred to a future spec. Document this in the editor's first-paint tooltip.

**No multi-user / real-time collaboration.** Out of scope forever; Pilcrow is a single-author tool.

**Plugin order in `astro.config.mjs` is untouched.** The editor doesn't add any remark / rehype plugins — it consumes directive markdown directly via the new `parse-directive.ts` utility.

**`/playground/`'s existing `pilcrow:editor-changed` / `pilcrow:settings-changed` contracts are preserved.** Grid-mode hosting (Deliverable C) extends Settings with a `mode: 'prose' | 'grid'` field but doesn't break the existing shape.

---

## Sub-taste-calls (surface to Chanikul before implementation)

Five questions. Each has 2–4 options with a surfaced recommendation.

### B1 — Framework choice [ANSWERED: B1a]

User answer: **B1a** — Astro + vanilla TypeScript. Matches FontPicker.astro precedent. No new dependencies. Implementation pattern: `<script>` block at end of `.astro` file, querySelector hydration on DOMContentLoaded, event-driven state updates.

---

### B1 (original options)

The editor is more stateful than any existing playground component. State management quality directly affects how the cell-selection, drag-resize, kind-switch, and palette-pick interactions feel. The choice has bundle-size and ergonomic consequences.

- **B1a: Astro + vanilla TypeScript** (matches all existing playground components — Settings, Editor, Preview, FontPicker). Manual DOM mutation; no reactivity primitives. 0KB framework overhead. Roughly 800–1200 lines of editor code expected. Familiar to anyone who has read the existing playground code.
- **B1b: Svelte** (compiled output is small per-component, ~5KB runtime). Reactive bindings make cell-state much terser. Adds `svelte` + `@astrojs/svelte` deps; introduces a new file extension (`.svelte`) to the codebase; teaches Pilcrow's brand voice to a second framework's conventions.
- **B1c: Preact** (React-compatible API, ~3KB total runtime). Industry-standard JSX patterns; component composition is natural. Adds `preact` + `@astrojs/preact` deps; introduces JSX to the codebase.

**Surfaced recommendation:** **B1a (Astro + vanilla TS)** — matches every existing playground component, zero new dependencies, fits the 10KB bundle budget with significant headroom. Trade-off: more code than B1b/B1c, manual state management. The Pilcrow codebase already has the pattern (FontPicker's 964-line vanilla-TS hydration script is the precedent), so the cost is bounded.

**This is a taste call. Do not implement until Chanikul decides.**

### B2 — Cell content editor mode [ANSWERED: B2a]

User answer: **B2a** — inline contenteditable on the cell itself. Use the `contenteditable="plaintext-only"` attribute (Chromium/Safari/Firefox-supported) to block rich HTML paste, formatting key shortcuts (Cmd-B, Cmd-I), and to keep the editor's serialiser sane (cell content = `textContent`, no nested HTML to parse).

---

### B2 (original options)

When a user clicks a cell with `kind=text`, what happens?

- **B2a: Inline contenteditable** (the cell becomes editable in place; user types directly into the grid). Most Figma-like. Risks: contenteditable's quirks (paste of rich HTML, span normalisation, browser-specific cursor handling). The cell visually IS the editor.
- **B2b: Modal dialog** (clicking opens a centred modal with a textarea + Save/Cancel). Clear separation; no contenteditable headaches. Janky for many small cells; loses the direct-manipulation feel.
- **B2c: Sidebar panel** (clicking a cell focuses it; the right sidebar shows a textarea + kind/fill controls bound to the selected cell). Always-visible context; works well alongside a 32-field grid where modals would be repetitive.

**Surfaced recommendation:** **B2c (sidebar panel)** — handles the bulk of editing without contenteditable risk, leaves the grid surface uncluttered, and the sidebar can carry cell metadata (kind, fill, span) alongside content in one place. B2a is the right answer if the brief is "Figma-quality direct manipulation"; B2b is the wrong answer for a 32-field grid.

**This is a taste call. Do not implement until Chanikul decides.**

### B3 — Cell content type [ANSWERED: B3a + clarified 2026-05-17]

User answer: **B3a (confirmed after re-framing)** — plain-text contenteditable in the editor; cell content preserved verbatim; build-time renders any markdown the user types.

**Corrected implication for output (my earlier framing was wrong):** the build-time renderer (`remark-grid.ts`) DOES process markdown inside cells (cell children pass through the normal markdown pipeline). If a user types `# Hello` into a cell, the post HTML renders `<h1>Hello</h1>`. The editor doesn't show that formatting — the editor is a raw-text input surface. WYSIWYG mismatch by design. Same trade-off as vim/Sublime/raw-textarea Markdown editors.

**No markdown parser ships in the editor bundle.** Saves ~15KB vs `marked`; saves ~1KB vs hand-rolled subset.

**Serialiser escaping (revised):** cell text does NOT escape `#`, `*`, `_` — those are valid Markdown source the user wants preserved verbatim. The serialiser must, however, escape `:` sequences that could collide with `:::` directive closers — specifically, a cell body line that consists of three-or-more colons followed by a closing-context character. The simplest defensive escape: if a cell text line starts with `:::` or `::::` or `:::::`, prepend a single space. Round-trip-safe; visually invisible. Document this edge case in the parser's tests.

**Editor first-paint help text:** "Cell content is plain text. Markdown formatting (# headings, *italic*, etc.) will render in the published post but not in this editor."

---

### B3 (original options)

Directive markdown allows arbitrary Markdown inside cells (`# Heading`, `*italic*`, links, etc.). How does the editor handle this?

- **B3a: Plain text only** (cells hold plain text; no markdown rendering in the editor; rendered HTML at build time shows the formatting). Simplest. Cell content reads as source code while editing.
- **B3b: Markdown source with live preview** (the cell's editor input is markdown source; the cell's visual rendering shows the rendered HTML). Closest to the final output. Requires a markdown→HTML pipeline in the editor (small library or hand-rolled subset).
- **B3c: Rendered markdown only** (no source view; the cell shows rendered output and the editor's controls limit users to plain text + a few formatting buttons). Hides the markdown layer. Restricts what users can author to the buttons exposed.

**Surfaced recommendation:** **B3b (markdown source with live preview)** — the directive's whole identity is "markdown in grid cells", so showing the source while editing keeps the user honest about what they're producing. Live preview makes the cell read as designed. Trade-off: needs a tiny markdown parser in the editor bundle (could use `marked` at ~15KB minified, or hand-roll a subset for headings/bold/italic at ~1KB). Bundle budget needs verification.

**This is a taste call. Do not implement until Chanikul decides.**

### B4 — Add/remove cell affordance [ANSWERED: B4a]

User answer: **B4a** — toolbar at top of editor for "Add cell" + global controls (field count, save state); right-click on a cell for cell-scoped operations (Delete, Duplicate, Move to next free slot). Right-click is standard browser-context-menu suppression + custom menu render. Keyboard equivalent: Cmd-Backspace deletes the selected cell; Cmd-D duplicates.

---

### B4 (original options)

Authors will want to add new cells and delete existing ones. The directive markdown supports any number of cells up to the field count; the editor needs corresponding controls.

- **B4a: Toolbar + cell-context menu** (top-of-editor "Add cell" button; right-click on a cell for Delete/Duplicate/Move). Discoverable; mirrors Figma.
- **B4b: Inline + buttons** (a `+` button appears between cells on hover; cells have a `×` corner on hover). Direct manipulation; clutters the grid surface.
- **B4c: Defer to v2** (this spec ships with a fixed cell count loaded from initial markdown; add/remove arrives in a later spec). Minimum viable editor.

**Surfaced recommendation:** **B4a (toolbar + context menu)** — fits the sidebar pattern (B2c) cleanly; the toolbar lives above the grid, the context menu doesn't require constant hover discovery, and right-click is muscle memory. B4c is the right answer if the goal is to get _something_ shippable fast.

**This is a taste call. Do not implement until Chanikul decides.**

### B5-meta — Cell metadata UI (kind / fill / span) [ANSWERED: B5a-meta]

User answer: **B5a-meta** — floating toolbar on cell select. The toolbar surfaces three controls (kind switcher: text/image/empty; fill picker: paper/muted/accent/rule/none; span steppers: cols +/-, rows +/-). Positioned above the selected cell when there's room above; otherwise below. Disappears on deselect (click outside or Esc).

Implementation note: floating-positioning needs collision detection (don't overflow the editor container). Reference Floating UI library? **No** — keep zero new deps per B1a. Hand-roll a simple `position: fixed` with `getBoundingClientRect()` calculations; the toolbar's positioning is rectilinear (cell rect + offset), not arbitrary.

---

### B6 — Mobile behaviour (below 768px) [ANSWERED: B6c — with risk flag]

User answer: **B6c** — same desktop UI on mobile, grid collapses to single column, drag handles hidden, everything else works.

**Risk flag (recorded for verification):** at 375px viewport width, a 4-column grid renders cells at ~93px wide; a single line of "Hoge Bank." at 19px Fraunces is about ~80px — fits, but barely. Cells with longer text wrap awkwardly. The floating toolbar (B5a-meta) needs careful positioning on a narrow viewport — likely needs to dock to the editor footer rather than float above the cell. The Add/Remove context menu (B4a) needs touch-equivalent (long-press) for mobile users without a right-click.

If real-world testing on mobile shows the editor unusable, the fallback is B6a (stacked per-cell forms). Don't pre-build B6a; ship B6c and instrument.

---

### B6-original — Mobile behaviour (original options)

The grid editor on mobile is a different product than the desktop editor. Three options:

- **B5a: Stacked list of per-cell forms** (drag handles disabled, sidebar collapsed; each cell becomes a form group with content + kind/fill controls). Touch-friendly. No drag interactions.
- **B5b: Read-only preview on mobile** (mobile users see the grid; editing requires desktop). Clear constraint; loses authoring on the go.
- **B5c: Same UI, just collapsed grid** (mobile sees the editor stacked, with all controls still available; drag handles hidden but everything else works). Compromise.

**Surfaced recommendation:** **B5a (stacked per-cell forms)** — matches the Level 1 playground's mobile pattern (radio-tab editor/preview) and respects that mobile authoring is a different surface, not a worse desktop. B5b loses too much; B5c tries to do everything and probably does nothing well at 375px wide.

**This is a taste call. Do not implement until Chanikul decides.**

---

## Performance budget

- **Initial editor bundle: < 10 KB compressed** (per sprint plan §3 Deliverable B).
- **First paint (parse + render initial grid): < 100 ms** at a 16-field grid with 8 cells populated.
- **Edit-to-serialise roundtrip: < 50 ms** (debounced, so latency feels instant to user).
- **Keyboard nav between cells: < 16 ms** per arrow key (one animation frame).
- **Mobile editor at 375 × 667: scrollable, no horizontal overflow.**

Bundle budget is the binding constraint and the reason B1 (framework choice) and B3 (markdown rendering) need explicit accounting in their implementation. A side-by-side bundle measurement after the editor lands goes into `context/feature-specs/02-B-bundle-budget.md`.

---

## Accessibility requirements (mandatory, axe-core gates implementation completion)

- `role="grid"`, `role="row"`, `role="gridcell"` semantics on the container hierarchy.
- `aria-rowindex` and `aria-colindex` on each cell, computed from its grid-row / grid-column position.
- `aria-label` on each cell summarising kind + fill + content snippet (for screen reader navigation).
- Arrow keys move focus between adjacent cells; respects span boundaries.
- Enter on a focused cell activates the editor (sidebar focuses the cell-content input).
- Esc closes the active editor (focus returns to the cell).
- Tab order: toolbar → grid → sidebar → grid → footer. Clearly defined and predictable.
- Focus visible (CSS `:focus-visible` outlines using `var(--accent)`).
- No `::before { content }` for any decorative glyph (Pilcrow's existing rule).
- Drag handles, if shown, are keyboard-operable via arrow keys when the cell is focused + Shift held.
- Colour-fill picker is a `<select>` or radio group, not a click-target-only swatch (keyboard-accessible).
- Run axe-core in the smoke test (`scripts/smoke-grid-editor.ts`); zero violations gates completion.

---

## Integration contract (for Deliverables C, D, E)

Hosts mount the editor with a uniform prop signature:

```ts
interface GridEditorProps {
  /** Initial directive markdown. Empty string for a fresh editor. */
  initialMarkdown: string;
  /** Optional starting field count if initialMarkdown is empty. Default 8. */
  defaultFields?: 8 | 16 | 32;
  /** Stable DOM ID for the editor container (a11y label/region anchor). */
  id: string;
  /** Optional callback bypassing the CustomEvent if the host wants direct hook. */
  onChange?: (markdown: string, source: 'user' | 'init' | 'restore') => void;
}
```

The editor emits `pilcrow:grid-editor-changed` on `document` regardless of `onChange` (consistent with Pilcrow's existing event-driven pattern). Hosts can choose either subscription model.

---

## Out of scope (explicit — do NOT extend this spec into these areas)

- Host integrations (Deliverables C, D, E — each is its own spec).
- Cross-cell undo/redo (within-cell undo via native contenteditable is acceptable).
- Multi-user collaboration.
- Real image upload (placeholder image cells only — Level 3 territory).
- Per-cell pretext typesetting (that's the rendered output; the editor shows browser-native line wrapping inside cells).
- Authoring directive markdown directly (the source view is read-only; users edit through the UI).
- Validating cross-primitive nesting (`:::sidenote` inside `:::cell` works at the renderer level — the editor just preserves the cell content verbatim).
- Field count > 32 or < 8 (only the three Mila grids per A5a).
- Cell rearrangement via drag-and-drop. Span resize only.

---

## Dependencies

- Spec 02-A (`:::grid` directive + HTML output) — COMPLETE as of 2026-05-17. The editor's parser/serialiser shares the `GridCellSpec` / `GridSpec` types exported from `remark-grid.ts`.
- B1 taste-call resolution drives the npm dep landscape: B1a adds no deps; B1b adds `svelte` + `@astrojs/svelte`; B1c adds `preact` + `@astrojs/preact`.

---

## Checks (gates for implementation completion)

- [ ] `bun run build` clean. No new `[pilcrow]` warnings.
- [ ] No new TypeScript errors. No `any` outside remark-plugin code.
- [ ] Editor renders correctly in `/dev/grid-editor` fixture for empty / 8-field / 16-field / 32-field initial states.
- [ ] Round-trip test: load markdown → render → edit → serialise → reload from new markdown → identical state.
- [ ] Bundle size measured + recorded; under 10 KB compressed.
- [ ] axe-core smoke test: zero violations on the editor.
- [ ] Keyboard-only nav: open editor → tab into grid → arrow-key through cells → Enter to edit → Esc → tab to sidebar → all without mouse.
- [ ] Mobile (375 × 667) per chosen B5 option.
- [ ] Cell content edits round-trip through the chosen B3 path (markdown source → preview).
- [ ] Add/remove cell flows work per chosen B4 affordance.
- [ ] Cell-fill picker, cell-kind switcher, span resize all functional.
- [ ] Editor cleanup on unmount (no leaked listeners, intervals, observers).
- [ ] `pilcrow:grid-editor-changed` events fire as documented; payload matches schema.
- [ ] Progress tracker updated: 02-B moved to `completed`.

---

## Rollback

The editor is a self-contained component. If 02-B turns out to be the wrong primitive:

1. Delete `src/components/grid/` and `src/lib/grid/`.
2. Delete `src/pages/dev/grid-editor.astro` and `scripts/smoke-grid-editor.ts`.
3. Revert the `global.css` editor-scoped additions.
4. Revert any framework-related additions to `astro.config.mjs` (only if B1b or B1c chosen).
5. Revert any `mode: 'grid'` extensions in playground Settings if Deliverable C also rolled back.

Hosts C/D/E would naturally roll back too since they depend on `<GridEditor />`.

---

## Notes for the implementing agent

- Read `src/components/playground/FontPicker.astro` first — it's the closest precedent for a complex vanilla-TS hydration script. The `data-*` attribute pattern + event-driven communication is the standard.
- Read `02-A-grid-directive-html.md` second — the `GridCellSpec` shape is the editor's in-memory model.
- The B3 markdown-rendering choice will likely require a tiny subset of markdown (headings, emphasis, links) rather than a full parser. Don't pull in `marked` unless the bundle budget genuinely allows it.
- Per-cell focus management is the hardest UX detail. Reference WAI-ARIA Authoring Practices for grid patterns: <https://www.w3.org/WAI/ARIA/apg/patterns/grid/>.
- Cell-span drag handles need clear visual affordance during drag (snap-to-field-boundary feedback). Use the existing `--accent` token; don't introduce a "drag colour".
- Pull all editor-only CSS into a `.grid-editor` scope so it can't leak into the shipped post output.
- Mobile B5a's per-cell forms are not optional even if desktop chooses B2c — mobile and desktop are different surfaces and should be designed as such.

---

## Sources (referenced by this spec)

- `src/components/playground/FontPicker.astro` — vanilla-TS hydration precedent (964 lines).
- `src/components/playground/Settings.astro` — event-driven Settings panel precedent.
- `packages/pilcrow-typeset/src/plugins/remark-grid.ts` — `GridCellSpec` source of truth.
- `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable B.
- `context/feature-specs/02-A-grid-directive-html.md` — locked taste calls A1b/A2a/A3a-i/A4a/A5a.
- WAI-ARIA Authoring Practices, Grid Pattern — accessibility reference.
