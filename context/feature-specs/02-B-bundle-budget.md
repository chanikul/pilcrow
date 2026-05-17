# Spec 02-B — Bundle budget accounting

> Companion document to `02-B-grid-editor-component.md`. Records bundle-size measurements for the GridEditor component, sources of weight, headroom against the 10KB budget specified in the spec.
>
> Last measurement: 2026-05-17 after the inline-edit + floating-toolbar commit (third commit within 02-B).

---

## Budget target

`Spec 02-B Performance budget`:
> **Initial editor bundle: < 10 KB compressed** (per sprint plan §3 Deliverable B).

This is the bundled JavaScript chunk that hydrates the GridEditor component, NOT including the parser/serializer utilities (which Vite tree-shakes / bundles inline). The 10 KB target is compressed (gzip/brotli over the wire); raw size is allowed to be larger.

---

## Source files (uncompressed)

| File | Bytes | Lines | Purpose |
|------|-------|-------|---------|
| `src/lib/grid/grid-document.ts` | 3,657 | ~100 | Shared types + helpers (GridFields, EditorCell, GRID_MATRIX, nextCellId) |
| `src/lib/grid/parse-directive.ts` | 7,946 | ~190 | Markdown → GridDocument parser |
| `src/lib/grid/serialize-directive.ts` | 4,986 | ~120 | GridDocument → markdown serialiser |
| `src/components/grid/GridEditor.astro` | 48,148 | ~1,150 | Editor component (markup + CSS + hydration script) |
| **Source total** | **64,737** | **~1,560** | All editor-related source |

The `.astro` file's total is misleading — it includes Astro frontmatter, server-rendered HTML, scoped CSS, and the client script. Only the client script ships to the browser.

---

## Bundled output (Vite + Astro, after build)

Path: `dist/_astro/GridEditor.astro_astro_type_script_index_0_lang.<hash>.js`

| Commit | Bytes (raw) | Bundle hash | Bytes (compressed est.)* | Headroom vs 10 KB |
|--------|-------------|-------------|--------------------------|-------------------|
| Skeleton (render + select + nav) | 6,534 | `CMjI61ET` | ~2,800 | +7.2 KB |
| + setTimeout fix | 6,554 | `DeaDkHXr` | ~2,800 | +7.2 KB |
| + inline editing + floating toolbar | 12,165 | `BNS2dapA` | ~4,500 | +5.5 KB |
| + top toolbar + context menu (this commit) | TBD | TBD | TBD | TBD |

\* Compressed-bytes estimate uses gzip ratio of ~0.43 typical for minified JS. Actual CF Pages serves brotli which is ~10–15% smaller again. Real-world wire size measured post-deploy.

---

## Sources of weight (estimated, current bundle)

Breakdown of the ~12 KB raw bundle from the inline-edit + floating-toolbar commit:

| Component | Approx. bytes | Notes |
|-----------|---------------|-------|
| Parser (parse-directive) | ~2,500 | Hand-rolled regex/state machine; no remark dep |
| Serialiser (serialize-directive) | ~1,800 | Pure template + small escape pass |
| Types + helpers (grid-document) | ~1,200 | `GRID_MATRIX`, `nextCellId`, `emptyGridDocument` |
| Editor hydration (initEditor + render) | ~2,500 | DOM construction, ARIA, roving tabindex |
| State mutation + commit + rerender | ~1,500 | `commit()`, per-cell rerender, debounce |
| Inline editing (B2a) | ~1,000 | contenteditable lifecycle, input handler, focus mgmt |
| Floating toolbar (B5a-meta) | ~1,500 | Toolbar wiring + positioning (no Floating UI dep) |
| **Total bundled** | **~12,000** | Matches observed 12,165 byte raw |

---

## Headroom analysis

At ~4.5 KB compressed against the 10 KB target, the editor has **~5.5 KB of headroom** for the remaining slices:

| Pending slice | Estimated cost |
|---------------|----------------|
| B4a top toolbar + context menu (this commit) | +1,500–2,000 bytes raw, +600–800 bytes compressed |
| Drag-resize handles for span | +1,200 bytes raw, +500 bytes compressed |
| Mobile-tuned B6a fallback (if shipped) | +600 bytes raw, +250 bytes compressed |
| axe-core integration smoke test | 0 bytes shipped (test-only) |
| Per-cell pretext typesetting (Spec 02-A second commit) | 0 bytes in editor (build-time only) |

After all 02-B slices land, the editor should sit at **~5.5–6.5 KB compressed**, comfortably under the 10 KB target. Significant headroom remains for unanticipated additions.

---

## What's NOT in the bundle (by design)

These are excluded by the B1a / B3a taste-call decisions and contribute zero bytes:

- **Markdown parser** — B3a chose plain-text contenteditable; no `marked` / `markdown-it` / hand-rolled markdown processor in the editor. Saves ~15 KB compressed vs `marked`.
- **React / Svelte / Preact** — B1a chose Astro + vanilla TS. Saves ~5–40 KB compressed.
- **Floating UI / Popper** — toolbar positioning is hand-rolled `getBoundingClientRect()` math. Saves ~3 KB compressed.
- **remark-directive** — the editor's parser is hand-rolled. The full remark pipeline (`unified` + `remark-parse` + `remark-directive` + `mdast-util-to-string`) is ~50 KB compressed; we ship 0 bytes of it at runtime. The build-time renderer (`remark-grid.ts`) still uses remark-directive, but that's the Astro build pipeline, not the editor bundle.

---

## Measurement methodology

```bash
# After each commit:
cd ~/Sandbox/pilcrow
rm -rf node_modules/.astro node_modules/.vite dist
bun run build

# Raw size:
ls -la dist/_astro/GridEditor*.js

# Compressed size (approximate brotli):
brotli -c dist/_astro/GridEditor*.js | wc -c
# Or gzip (slightly conservative):
gzip -c dist/_astro/GridEditor*.js | wc -c
```

The bundle hash changes when source changes — verify the bundle reflects the latest source by checking `ls -la` timestamps + hash matches the script src in the served HTML.

---

## Open questions

1. **Should the parser/serialiser be code-split into a separate chunk?** Currently bundled inline with the editor. Splitting would let multiple grid-bearing pages share one parser chunk (cache hit on second visit). Worth ~1 KB per repeat-visit page. Defer to Deliverable D when there are actually two editor surfaces.
2. **Brotli vs gzip on Cloudflare Pages.** CF Pages serves brotli when the client supports it (all modern browsers). The 10 KB target was specified as "compressed" but didn't pin a codec. Brotli typically wins by 10–15% over gzip; the headroom analysis above uses the gzip estimate as the conservative bound.

---

## Sources

- `src/components/grid/GridEditor.astro` — editor component (source).
- `src/lib/grid/*.ts` — parser, serialiser, types.
- `dist/_astro/GridEditor*.js` — bundled output (after build).
- `context/feature-specs/02-B-grid-editor-component.md` — budget origin in the spec.
- `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md` §3 Deliverable B — sprint-level budget.
