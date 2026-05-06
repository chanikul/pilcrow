# Progress Tracker — Pilcrow

> The only context file that changes constantly. Read this at the start of every session.

> **How to use:** Mark a spec `in_progress` before starting it. Move to `completed` when done, with a one-line summary of what was actually built. Add architectural decisions to `02-architecture.md`'s decision log. Add session notes here.

---

## Current phase

**Phase:** v1 shipped → v3 sprint (engine extraction to packages/pilcrow-typeset/) in progress
**Current goal:** Complete v3 sprint Deliverable A (engine extraction). Then return to first post-shipped feature spec.
**Owner:** Chanikul
**Updated:** 2026-05-06

---

## In progress

### v3 sprint — engine extraction to `packages/pilcrow-typeset/`

Per sprint plan §3 Deliverable A. Astro project at repo root continues to import the engine via direct relative paths (no workspaces — deferred to v4 per §5).

| Date | Sub-task | Files |
|------|----------|-------|
| 2026-05-06 | 1–2: file moves to `packages/pilcrow-typeset/`; `./renderer.js` import fix in `playwright.ts` | `packages/pilcrow-typeset/src/{playwright,hyphenate,renderer,index,plugins/*}.ts` |
| 2026-05-06 | 2.5: package type infrastructure (`@types/node`, `hyphenopoly` ambient declaration, `unist-util-visit` v5 hast signature, ~20 mechanical strict-null assertions across 4 files) | `packages/pilcrow-typeset/{package.json,tsconfig.json,src/types/hyphenopoly.d.ts,src/{hyphenate,playwright}.ts,src/plugins/{remark-pullquote,rehype-hoist-sidenotes}.ts}` |
| 2026-05-06 | 5: integration imports `PlaywrightRenderer` from `../../packages/pilcrow-typeset/src/index.js` | `src/integrations/pilcrow-typeset.ts` |
| 2026-05-06 | 6: four directive plugins imported from `packages/pilcrow-typeset/src/plugins/`; `rehype-images` stays at `src/plugins/` (image pipeline not part of extraction) | `astro.config.mjs` |
| 2026-05-06 | 3: public `typeset()` convenience function + 4 re-exports — surface verified already in place from extraction (sub-tasks 1–2); both gates re-verified clean; locked for v0.1.0 publish | `packages/pilcrow-typeset/src/index.ts` (no changes) |

Remaining: sub-task 4 (Hyphenopoly patterns directory + `import.meta.url`-relative resolution); sub-task 8 (README); sub-task 9 (commit). Sub-task 7 (full `bun run build` verification) was already proven across sub-tasks 5 + 6 + 3.

---

## Completed (pre-workflow shipped features)

These all shipped before the spec workflow was adopted. Listed for continuity; their decisions are captured in `02-architecture.md`'s decision log and in `.claude/learnings.md`.

| Date | Feature | Files |
|------|---------|-------|
| 2026-04-29 | Editorial theme (Fraunces, palette, 65ch measure) | `public/styles/global.css`, `playwright.ts` |
| 2026-04-29 | Drop cap with float-aware measurement | `playwright.ts`, `Post.astro` |
| 2026-04-29 | Hyphenation pipeline (Hyphenopoly en-gb) | `src/lib/typeset/hyphenate.ts` |
| 2026-04-29 | Orphan guard wrapper (4-char threshold) | `playwright.ts` |
| 2026-04-29 | Pull quote directive `:::pullquote :::` | `src/plugins/remark-pullquote.ts`, CSS |
| 2026-04-29 | GFM footnotes + section break (`<div class="footnotes-mark">`) | `src/plugins/rehype-footnote-mark.ts`, `playwright.ts` |
| 2026-04-30 | Sidenotes (4-col grid, two-plugin pipeline) | `src/plugins/remark-sidenote.ts`, `src/plugins/rehype-hoist-sidenotes.ts` |
| 2026-04-30 | Image pipeline (Sharp + thumbhash) | `src/plugins/rehype-images.ts`, `src/lib/images/process.ts` |
| 2026-04-30 | OG card generation (Satori + resvg) | `src/lib/og/card.ts`, `src/pages/og/[slug].png.ts`, `src/pages/og/index.png.ts` |
| 2026-04-30 | RSS + sitemap | `src/pages/rss.xml.ts`, `astro.config.mjs` |
| 2026-04-30 | Orphan guard widening to {1,7} + literal-hyphen blind spot fix | `playwright.ts` |
| 2026-05-01 | Cloudflare Pages deploy + custom domain (pilcrow.page) | `wrangler.toml` |
| 2026-05-01 | Pilcrow footer growth loop link | `Base.astro`, `src/config/site.ts`, CSS |
| 2026-05-01 | `create-pilcrow` published to npm (0.1.0 → 0.1.1) | `packages/create-pilcrow/` |

---

## Up next (candidate specs from NOTES.md and lessons)

These are deferred items from `NOTES.md` and observations from `.claude/learnings.md`. Not yet written as specs — pick when ready.

### Maintenance / quality (low risk)
1. **Adjacent-sup spacing** — CSS rule `sup + sup { margin-left: 0.15em }` scoped to `.post-body`. Single-line CSS edit. From NOTES.md, observed in `template/src/content/posts/example.md` line 27.
2. **Template ↔ source drift detection** — Bun script that diffs `packages/create-pilcrow/template/` against the engine and warns when they diverge. From NOTES.md, v1.x candidate.
3. **camelCase-as-atomic-pill** — flag identifiers (length ≥ 12, mixed case, no spaces) with pretext's `break: 'never'` so Hyphenopoly doesn't fragment them. From NOTES.md, v1.x candidate. Detection: `text.length >= 12 && /[a-z][A-Z]/.test(text) && !/\s/.test(text)`.

### Engine improvements (medium risk)
4. **Gwern-level sidenote alignment** — extend `rehype-hoist-sidenotes.ts` to accept line-position metadata from the playwright pass; align sidenote first line to anchor word's text baseline. From NOTES.md.
5. **Per-line `<a>` reconstruction** — wrap pt-line spans inside a single outer `<a>` for cross-line links so screen readers don't announce them as separate links. From NOTES.md, v2 candidate.

### Distribution / ops
6. **Chromium install caching on CF Pages** — investigate `PLAYWRIGHT_BROWSERS_PATH` cache path or custom build image. From NOTES.md, monitor build time.
7. **`create-pilcrow` package size reduction** — remove or compress the 1.6MB bundled JPEG. From NOTES.md.

### Upstream
8. **Track pretext issue #162** (`softHyphenMode: 'strict'`). When it lands, remove `guardFlat`, `guardRich`, `findOrphanSHYPos`, and the orphan recovery loop entirely. Audit the packed-grapheme catalogue in NOTES.md to verify those cases improve.

---

## Architectural decisions

(Living log lives in `02-architecture.md`. Append new decisions there as they happen.)

---

## Session notes

### 2026-05-06 — Spec workflow adopted
- Migrated from single-file 17 KB `CLAUDE.md` to the 6-file context system.
- Original `CLAUDE.md` backed up to `CLAUDE.md.bak`.
- Slim entry point at `CLAUDE.md` continues to `@-import` `~/Sandbox/PILCROW_MASTER_PLAN.md` and now points at `context/` for everything else.
- `NOTES.md` and `.claude/learnings.md` left in place — referenced from the new context files.
- `agents.md` and `context/feature-specs/` added; `context/current-issues.md` added (gitignored).
- Next: write spec 01 for the first post-shipped feature.

### Older session notes
For history before 2026-05-06, see `.claude/learnings.md` (append-only lessons) and the original `CLAUDE.md.bak` (the dense braindump).
