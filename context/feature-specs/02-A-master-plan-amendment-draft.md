# Master-plan amendment draft (Deliverable A sub-task 1)

> **Status:** DRAFT — awaiting Chanikul sign-off before merging into `~/Sandbox/PILCROW_MASTER_PLAN.md`.
> **Voice:** matched to master-plan §5 (restrained, opinionated, printerly; UK English; max one em-dash per paragraph; no banned words from §5).
> **Scope acknowledgement:** PDF export is already named in master plan §7 as a v2 feature ("Print-quality PDF export via Paged.js — the standout feature no other blog platform has"). This amendment moves PDF from "v2 someday" to "v2 active sprint", adds EPUB as a new output, and establishes `:::grid` as a canonical editorial primitive.

---

## Proposed insertion: new §12 (after §11 Open Decisions, before any §-numbered tail)

```markdown
## 12. Grid Composition — v2 sprint

A second editorial primitive lands in v2 alongside the v1 prose product: a `:::grid` directive that divides a post into a Mila-style field grid (8, 16, or 32 cells) and lets the author place text and image fields into them. Pretext continues to typeset the text inside each cell at its own derived measure; the post stays editorial because the typography is still set per line, not flowed by the browser.

The directive ships as a canonical Pilcrow primitive, the same way pull quotes, sidenotes, and footnotes shipped. Three new outputs accompany it: HTML (as before), PDF (already in roadmap §7), and EPUB (new). PDF moves from "v2 someday" to "v2 active sprint" — paged.js or Playwright print is the implementation question, surfaced in the per-deliverable spec.

The sprint plan lives at `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md`. Seven deliverables (A through G), three phases, four to six weeks end-to-end. Each deliverable is independently revertible — Pilcrow's rule against big-bang feature drops applies even at v2 scope.

### What this amendment changes

- §7 Roadmap: PDF moves from v2 ("someday") to v2 active sprint. EPUB is added as a v2 output format, paired with PDF.
- §9 Out of Scope: no removals. EPUB-specific exclusions added — no reflowable-EPUB grid equivalence (fixed-layout EPUB3 only); no DRM; no MOBI/KF8 conversion (Kindle Previewer ingests EPUB).
- §11 Open Decisions: a new entry (numbering continues from the existing log) records the seven taste calls resolved on 2026-05-17 that scoped the sprint.

### What this amendment does NOT change

- The v1 prose product is unchanged. Posts without a `:::grid` directive continue to render as today — single column, 65ch measure, drop cap on lede, sidenotes in the right margin.
- The five-token palette is unchanged. Grid color fields compose from `--paper`, `--ink`, `--muted`, `--rule`, `--accent`.
- Build-time-only stays sacred. The interactive editor introduced by Deliverable B is an authoring surface (playground, dev tool, `/grid/` route). No grid JS reaches a post reader.
- Pretext stays the load-bearing wall. Per-cell pretext invocation is the extension; the engine itself is unchanged.
- The brand is unchanged. Pilcrow remains an editorial typesetting tool. Composition is a primitive within that brand, not a replacement of it.

### Sprint-level taste calls already resolved (2026-05-17)

| Call | Answer |
|------|--------|
| Where does grid live? | Authoring directive for posts, print, ebooks |
| Grid model | Three discrete Mila grids: 8 / 16 / 32 fields, fixed matrices |
| Cell authoring | Click-to-edit cells in preview (Figma-like editor) |
| Field treatments | Color fields + placeholder image fields + monochromatic tint |
| Default field count | 8 (Simple/calm) |
| Output formats | HTML + PDF + EPUB simultaneously |
| Editor surface | Three hosts (playground + sibling route + dev tool), one shared component |

Per-deliverable sub-taste-calls are surfaced as each deliverable starts.

### Why this is right for Pilcrow

Three things matter:

1. **The brief stays editorial.** Grid is a Swiss-typography lineage move, not a CSS-framework move. The Mila reference is brand-book typography. Müller-Brockmann's *Grid Systems* is the precedent. This is the next vocabulary item in the same conversation as the drop cap and the sidenote.
2. **Print and ebook are the moats.** §7 already named PDF as the standout feature. A grid system that produces typeset HTML *and* a print-faithful PDF *and* a valid EPUB3 has no near-competition. Static blog generators don't do this. Substack doesn't. Medium doesn't. The build-time pipeline that exists for HTML extends naturally — same Chromium, same per-cell pretext, different render target.
3. **Reversibility is the discipline.** Each deliverable ships behind a clean boundary. If the editor (Deliverable B) doesn't land, the `:::grid` directive (Deliverable A) is still useful to hand-authoring writers. If PDF (Deliverable F) blocks on Cloudflare Pages build budget, EPUB (Deliverable G) can ship without it. The sprint is structured so any one deliverable failing doesn't unroll the others.

### What success looks like

A writer pastes a `:::grid fields=16` block into a post, fills four cells with text and two with placeholder images, runs `bun run build`, and gets three artifacts in `dist/posts/<slug>/`: an HTML file the browser renders as a typeset grid with no reader JS, a PDF that opens in Preview/Acrobat with the grid intact, and an EPUB that opens in Apple Books with the grid intact.

A different writer who never touches grids continues to write prose posts exactly as today.

A pilcrow.page visitor opens `/grid/`, drags some cells, picks a color field, copies the resulting directive markdown, and pastes it into their own post.

Three audiences, one set of primitives, no scope-creep into a CMS.
```

---

## Proposed edit to §7 Roadmap

The existing line:

> - Print-quality PDF export via Paged.js — *the standout feature no other blog platform has*

Replaces with:

> - **v2 active sprint**: Print-quality PDF export and fixed-layout EPUB3 export, both gated on the new `:::grid` directive. PDF tool choice (paged.js vs Playwright print) surfaced in per-deliverable spec. See `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md`.

---

## Proposed addition to §9 Out of Scope

Append the following entries to the list:

> - Reflowable EPUB with grid-equivalent layout (fixed-layout EPUB3 only)
> - MOBI / KF8 / Kindle-native output (Kindle Previewer ingests EPUB and handles conversion)
> - EPUB DRM
> - Print-on-demand integration (Lulu, Blurb, Amazon KDP). PDF output only; user takes the PDF wherever they want.

---

## Proposed addition to §11 Open Decisions (new entry, next available number)

```markdown
15. **Grid Composition sprint scope (resolved 2026-05-17):** Seven taste calls + one meta-taste-call resolved at maximum scope. Sprint plan written to `~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md`. Seven deliverables (A through G) sequenced for reversibility across three phases. Estimated 4.5–6 weeks end-to-end. Critical path A → C → F (directive → playground host → PDF). Editor work (B) parallelises with directive work (A); EPUB (G) parallelises with PDF (F). Master-plan amendment (this §12 entry + edits to §7 and §9) is Deliverable A first sub-task. Until the amendment lands, no `:::grid` directive code touches the main repo.
```

---

## Implementation note

The amendment is one commit, landed at the start of Deliverable A implementation. Commit message:

```
master plan: add §12 grid composition; edit §7 PDF (active sprint); add §9 EPUB exclusions; §11 entry 15 grid sprint scope

Per ~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md (drafted 2026-05-17). Seven
deliverables A–G sequenced for reversibility. PDF export accelerated
from v2-someday to v2-active-sprint; EPUB added as paired output.
:::grid established as canonical editorial primitive alongside
pullquote / sidenote / footnote.

No code changes in this commit. Implementation of Deliverable A
(remark-grid + rehype-grid + per-cell pretext) follows in subsequent
commits.
```

After the commit lands, Spec 02-A implementation begins with sub-task 2 (the remark-grid plugin).
