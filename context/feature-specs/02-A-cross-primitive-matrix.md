# Spec 02-A — Cross-primitive interaction matrix

> Companion document to `02-A-grid-directive-html.md`. Records the observed behaviour of the `:::grid` directive when combined with each other Pilcrow primitive. Each row: input syntax, observed output, warning emitted, known limitations.
>
> Generated from end-to-end build verification on `src/content/posts/grid-demo.md`, 2026-05-17.

---

## Cross-primitive policy (recap)

From `02-A-grid-directive-html.md`'s mechanical design decisions:

- `:::grid` inside `::::grid` → **ERROR** (inner grid neutralised + build warning + placeholder text)
- `:::pullquote` inside `:::cell` → **WARN-AND-RENDER** (pullquote emits normally; cell layout may look unexpected)
- `:::sidenote` inside `:::cell` → **WARN-AND-HOIST** (sidenote lifted to `.post-body` by existing `rehype-hoist-sidenotes`; may render visually disconnected from anchor cell — A2a)
- Footnote markers `[^N]` inside cell → **PASS-THROUGH** (no special handling; footnote list lives at post bottom outside any grid)
- `![alt](path)` markdown image inside cell → **PASS-THROUGH** (existing `rehype-images` plugin processes normally)
- `:::shape-around` inside cell → **WARN-AND-RENDER** (untested combo; surface listed as future-work)

---

## Observed behaviour matrix

### 1. grid + sidenote (recursive nesting — the canonical test case)

**Input (from grid-demo.md cross-primitive section):**

```markdown
:::::grid{fields=8}

::::cell{id=1 colspan=2}

The interior of a small room can be a stage.

:::sidenote
The metaphor of room-as-stage comes from Donald Norman, *The Design of Everyday Things*, third edition, page 142.
:::

Every chair, every table edge, every interval of empty wall participates in the composition the eye assembles.

::::

::::cell{id=2 colspan=2 fill=muted}

On wide viewports, the sidenote settles into the margin alongside this cell — the grid and the annotation are one composition, not two layers.

::::

:::::
```

**Note on colon counts:** the recursive rule (outer needs more colons than its immediate inner) requires `:::::grid` (5 colons) when containing a cell that itself contains a `:::sidenote` (3 colons). The cell uses `::::` (4 colons). This is the canonical example of the recursive colon-count rule from `02-architecture.md` invariant 5.

**Observed output:**
- `<div class="pilcrow-grid" data-grid-fields="8">` renders as the canonical grid container.
- Cell 1 contains the prose paragraphs with the sidenote marker `<sup class="sidenote-marker">` inlined at the anchor position.
- The `<aside class="sidenote">` is hoisted by `rehype-hoist-sidenotes` to `.post-body` level (NOT inside the cell).
- On viewports ≥1100px, the sidenote appears in the right margin column (`grid-column: 4` on `.post-body`).
- On viewports <1100px, the sidenote stacks below its anchor paragraph as inline content.

**Warning emitted to stderr:**
```
[pilcrow] <post-path>: sidenote inside cell #1 — sidenote will be hoisted to .post-body by rehype-hoist-sidenotes and may render visually disconnected from the cell. Known limitation (A2a).
```

**Known limitation (A2a, documented):** the sidenote's vertical alignment is relative to `.post-body`'s grid auto-rows, not the cell's contents. If the cell renders far down the post (e.g. a 32-field grid with the sidenote-bearing cell in row 6), the sidenote may not visually align with its anchor paragraph. Mitigation requires the per-cell line-anchored alignment from spec 02-A future-work (Gwern-level alignment, NOTES.md v1.x candidate).

**Verification:** ✓ — confirmed in `dist/posts/grid-demo/index.html` build, 2026-05-17. Build console emits the warning; HTML output places `<aside class="sidenote" data-sidenote-id="1">` as a direct child of `.post-body`, with `<sup class="sidenote-marker">` appended to the anchor `<p>` inside the cell.

---

### 2. grid + pullquote

**Input (synthetic — not currently in grid-demo.md):**

```markdown
::::grid{fields=8}

:::cell{id=1 colspan=2 fill=accent}

:::pullquote
The line between craft and invisibility is not a destination. It is the work itself, reconstituted sentence by sentence.

— Eleanor Marsh
:::

:::

::::
```

**Note on colon counts:** would require `:::::grid` (5 colons) for the pullquote's 3 colons to nest cleanly inside `::::cell` (4 colons). Or restructure the pullquote outside the grid.

**Observed output:** untested in shipped grid-demo.md as of 2026-05-17. Spec policy says "warn and render normally" — pullquote emits as `<aside class="pullquote">` inside the cell's `<div class="pilcrow-grid-cell">`.

**Warning emitted:**
```
[pilcrow] <post-path>: pullquote inside cell #1 — pullquote will render normally; cell layout may look unexpected.
```

**Known limitation:** pullquote's CSS (`.pullquote { max-width: 50ch; margin: 2.5rem auto }`) assumes it sits inside `.post-body`'s 65ch column. Inside a narrow grid cell, the pullquote may overflow horizontally OR collapse to nothing if the cell is narrower than 50ch. Visual review needed before recommending this combination.

**Verification:** ⚠ NOT VERIFIED — synthetic case only. To verify: add a pullquote-in-cell fixture to grid-demo.md and run build.

---

### 3. grid + footnote markers

**Input (synthetic):**

```markdown
::::grid{fields=8}

:::cell{id=1 colspan=2}

This is a sentence with a footnote.[^1]

:::

::::

[^1]: The footnote definition lives at the post bottom, outside any grid.
```

**Observed output:** footnote markers `<sup><a href="#user-content-fn-1">1</a></sup>` are emitted inline inside the cell paragraph by `remark-gfm`. The footnote list `<section data-footnotes>` lives at the post bottom outside any grid, unchanged.

**Warning emitted:** none — footnote markers pass through cleanly.

**Known limitation:** the `[^N]` marker styling inherits accent colour via the cascade. If a cell has `fill=accent` (which itself uses `--accent` as background, `--paper` as text colour), the marker would render as `--accent` on `--accent` → invisible. Mitigation: cells with `data-cell-fill="accent"` could override `sup[data-footnote-ref]` colour to `var(--paper)`. Not implemented in 02-A first commit; tracked as a follow-up CSS pass.

**Verification:** ⚠ NOT VERIFIED — synthetic case only. The invisible-marker hazard is a real concern for posts that combine accent fills + footnotes.

---

### 4. grid + markdown image

**Input (synthetic — image cells use `kind=image` placeholder; this is the DIFFERENT case of a markdown image inside a `kind=text` cell):**

```markdown
::::grid{fields=8}

:::cell{id=1 colspan=2}

A paragraph above the image.

![A wooden bench in soft afternoon light](./images/bench.jpg)

A paragraph below.

:::

::::
```

**Observed output:** the existing `rehype-images` plugin processes the markdown image into `<figure class="pilcrow-figure"><picture>...</picture></figure>` inside the cell. Sharp processes the source image into AVIF/WebP/fallback variants at 640/1280/1920px.

**Warning emitted:** the standard "missing alt" warning if alt is omitted (unchanged from existing behaviour).

**Known limitation:** the `<figure>` element's CSS assumes the prose column width (full-width within the 65ch column, 3.5rem vertical margins). Inside a narrow grid cell, the figure may overflow horizontally. Mitigation: the figure inherits `max-width: 100%` so it WILL clamp; but the resulting image at e.g. 120px wide in a narrow cell may be illegibly small. Visual review needed.

**Verification:** ⚠ NOT VERIFIED — no fixture currently exercises this combination. Image cells (`kind=image`) cover the placeholder-silhouette case; markdown-image-inside-text-cell is a different path.

---

### 5. grid + image cell (kind=image)

**Input (from grid-demo.md):**

```markdown
:::cell{id=2 colspan=2 kind=image alt="warm wooden bench in soft afternoon light"}
:::
```

**Observed output:** the cell's body is replaced by `remark-grid`'s placeholder SVG silhouette (a crossed rectangle in `--rule` colour with `--muted` X strokes, `role="img"` + `aria-label` from alt). Cell has `data-cell-kind="image"` for CSS targeting. The placeholder honours the cell's span.

**Warning emitted:** if `alt` is empty/missing on an image cell:
```
[pilcrow] <post-path>: cell #N is kind=image but has no alt="…" — accessibility warning. Empty alt will be used.
```

**Known limitation:** image cells are placeholder-only in Spec 02-A. Real image upload is gated on the playground plan's Level 3 (image upload + shape-outside wrap). Until that lands, image cells are visual stand-ins.

**Verification:** ✓ — confirmed in grid-demo.md build. Two image cells in the 16-field grid render correctly with the X-marked SVG silhouette honouring the cell's `colspan=2` aspect.

---

### 6. grid + nested grid (ERROR case)

**Input (synthetic — would be authored by mistake):**

```markdown
::::grid{fields=8}

:::cell{id=1 colspan=4}

Some prose.

::::grid{fields=8}

:::cell{id=99}
Inner grid cell
:::

::::

:::

::::
```

**Note on colon counts:** even if the inner grid uses MORE colons than the outer, nested grids are explicitly forbidden by the policy.

**Observed output:** outer grid renders normally. Inner grid is **neutralised** — replaced with a text node `[pilcrow: nested :::grid is not supported — see build warning]` so the build doesn't silently lose content. The inner grid's `:::cell` children are dropped.

**Warning emitted:**
```
[pilcrow] <post-path>: nested grid inside grid is not supported — inner grid neutralised.
```

**Known limitation:** the neutralisation strategy is intentional. Nested grids would require recursive position computation, recursive measurement, and would risk authoring posts that are layout puzzles instead of documents. Explicitly out of scope.

**Verification:** ⚠ NOT EXERCISED in grid-demo.md (would be a deliberately broken fixture). Behaviour confirmed by reading the plugin source: `remark-grid.ts` first pass detects nested `containerDirective` with `name='grid'`, replaces inner children with the warning text, renames `inner.name` to `'grid-error'` so the second pass skips it.

---

### 7. grid + shape-around (untested)

**Input:** `:::shape-around` inside `:::cell` — not exercised in any fixture.

**Observed output:** unknown.

**Known limitation:** shape-around requires obstacle silhouettes computed at build time + variable-width line widths passed to pretext per row. Combining with grid would require the cell-local pretext path to also handle shape-around obstacles. Likely doesn't work correctly in 02-A first commit. Surface listed as future-work — a fixture would need to be authored and the behaviour observed before drawing conclusions.

**Verification:** ⚠ NOT TESTED.

---

## Summary table

| Combination | Status | Warning | Verified |
|-------------|--------|---------|----------|
| grid + sidenote (recursive) | Warn-and-hoist | A2a known limitation | ✓ grid-demo.md |
| grid + pullquote | Warn-and-render | Visual review needed | ⚠ synthetic only |
| grid + footnote marker | Pass-through | none | ⚠ synthetic only |
| grid + markdown image (in text cell) | Pass-through | none | ⚠ no fixture |
| grid + kind=image cell | Renders placeholder | alt-missing warning | ✓ grid-demo.md |
| grid + nested grid | ERROR + neutralise | "nested grid is not supported" | ✓ source code |
| grid + shape-around | Unknown | Unknown | ⚠ untested |

---

## Follow-ups (tracked as future work)

1. **Pullquote-in-cell visual review.** Author a fixture; observe overflow / collapse behaviour at various cell widths. Decide whether to recommend, warn-and-render-anyway, or restrict.
2. **Footnote-marker-on-accent-fill contrast fix.** CSS override: `[data-cell-fill="accent"] sup a[data-footnote-ref] { color: var(--paper); }`. Small follow-up.
3. **Markdown-image-in-text-cell fixture.** Verify that `<figure class="pilcrow-figure">` reasonable inside a narrow cell. Document scaling behaviour.
4. **Shape-around-in-cell** — likely out of scope until both primitives are stable independently. Track as v1.x candidate.

---

## Sources

- `src/content/posts/grid-demo.md` — end-to-end build fixture.
- `packages/pilcrow-typeset/src/plugins/remark-grid.ts` — cross-primitive detection logic.
- `packages/pilcrow-typeset/src/plugins/rehype-hoist-sidenotes.ts` — sidenote hoist behaviour.
- `context/feature-specs/02-A-grid-directive-html.md` — cross-primitive policy origin.
- `context/02-architecture.md` invariant 5 — recursive colon-count rule.
