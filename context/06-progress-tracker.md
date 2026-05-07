# Progress Tracker — Pilcrow

> The only context file that changes constantly. Read this at the start of every session.

> **How to use:** Mark a spec `in_progress` before starting it. Move to `completed` when done, with a one-line summary of what was actually built. Add architectural decisions to `02-architecture.md`'s decision log. Add session notes here.

---

## Current phase

**Phase:** v3 shipped → playground sprint (Levels 1–3 of `~/Sandbox/PILCROW_PLAYGROUND_PLAN.md`) in progress
**Current goal:** Ship Level 1 of the playground sprint. Page shell at `/playground/` is now live; sub-tasks 5–7 (editor, settings, preview wiring) follow.
**Owner:** Chanikul
**Updated:** 2026-05-07

---

## In progress

### Playground sprint — Level 1 (page shell + components)

Per `~/Sandbox/PILCROW_PLAYGROUND_PLAN.md` §3.

| Date | Sub-task | Files |
|------|----------|-------|
| 2026-05-06 | 1: pretext browser-compat spike (PASS — `@chenglou/pretext@0.0.6` works in browser without Playwright) | `src/scripts/spike-pretext-browser.ts` |
| 2026-05-06 | 2: `BrowserRenderer` class implementing `TypesetRenderer` — mirrors `playwright.ts` feature-for-feature (column-width derivation, drop-cap float-aware narrowing, SHY pre-pass, orphan guard) | `src/lib/playground/{browser-renderer,hyphenate-browser}.ts` |
| 2026-05-07 | 4: page shell at `/playground/` — two-column desktop (editor LEFT, preview RIGHT) with top settings bar; mobile fallback below 768px swaps to CSS-only radio-tab toggle (editor/preview); minimal chrome (Pilcrow ¶ wordmark only — added optional `chrome` prop to `Base.astro`); Inter for tool register, Fraunces in preview pane; three labelled placeholders with `data-placeholder` attrs for sub-tasks 5/6/7; pre-loaded stand-in prose in editor (final invitation copy is a follow-up editorial-writer task) | `src/pages/playground/index.astro`, `src/layouts/Base.astro` |

Remaining (Level 1): sub-task 5 (editor pane — paste handling, textarea, basic markdown), sub-task 6 (settings panel — font/dropCap/hyphenation/measure/lineHeight controls), sub-task 7 (wire `BrowserRenderer` to preview pane), sub-tasks 8–10 (copy-HTML, share-URL, end-to-end test against `the-cheapest-signal`).

---

### v3 sprint — engine extraction to `packages/pilcrow-typeset/`

Per sprint plan §3 Deliverable A. Astro project at repo root continues to import the engine via direct relative paths (no workspaces — deferred to v4 per §5).

| Date | Sub-task | Files |
|------|----------|-------|
| 2026-05-06 | 1–2: file moves to `packages/pilcrow-typeset/`; `./renderer.js` import fix in `playwright.ts` | `packages/pilcrow-typeset/src/{playwright,hyphenate,renderer,index,plugins/*}.ts` |
| 2026-05-06 | 2.5: package type infrastructure (`@types/node`, `hyphenopoly` ambient declaration, `unist-util-visit` v5 hast signature, ~20 mechanical strict-null assertions across 4 files) | `packages/pilcrow-typeset/{package.json,tsconfig.json,src/types/hyphenopoly.d.ts,src/{hyphenate,playwright}.ts,src/plugins/{remark-pullquote,rehype-hoist-sidenotes}.ts}` |
| 2026-05-06 | 5: integration imports `PlaywrightRenderer` from `../../packages/pilcrow-typeset/src/index.js` | `src/integrations/pilcrow-typeset.ts` |
| 2026-05-06 | 6: four directive plugins imported from `packages/pilcrow-typeset/src/plugins/`; `rehype-images` stays at `src/plugins/` (image pipeline not part of extraction) | `astro.config.mjs` |
| 2026-05-06 | 3: public `typeset()` convenience function + 4 re-exports — surface verified already in place from extraction (sub-tasks 1–2); both gates re-verified clean; locked for v0.1.0 publish | `packages/pilcrow-typeset/src/index.ts` (no changes) |
| 2026-05-06 | Deliverable B: `pilcrow-eleventy@0.1.0` adapter — Eleventy 3.x ESM plugin using `eleventy.before` / `eleventy.after` lifecycle events; addTransform on `.html` outputs containing `<div class="post-body">`; fixture builds 12 `pt-line` spans (commit `64a5ef4`) | `packages/pilcrow-eleventy/{src/index.ts,package.json,tsconfig.json,README.md,test/fixture/*}` |
| 2026-05-06 | Deliverable C: `pilcrow-nextjs@0.1.0` adapter — rehype plugin for `@next/mdx` pipeline; build-time only (Next.js bundles MDX, runtime typesetting non-viable); MDX-JSX nodes detected and skipped (HTML round-trip can't preserve them); fixture builds 20 `pt-line` spans (commit `f1b057e`) | `packages/pilcrow-nextjs/{src/index.ts,package.json,tsconfig.json,README.md,test/fixture/*}` |
| 2026-05-06 | A.1: prepare adapters for npm publish — switch both adapters from sibling-relative dist imports to named `from 'pilcrow-typeset'` imports; add `pilcrow-typeset` as a `file:..` dep for local fixture testing (Stream D mechanically swaps to `^0.1.0` at publish time, reverts after); fix `pilcrow-typeset` and `pilcrow-nextjs` `homepage` fields from `/library` to `pilcrow.page` (the routes don't exist until Deliverable D ships) (commit `f8a8993`) | `packages/pilcrow-{eleventy,nextjs}/{src/index.ts,package.json,bun.lock}`, `packages/pilcrow-typeset/package.json` |

Remaining: Deliverable D (`/library/*` docs site routes) + Deliverable E (publish + push). 0.1.1 metadata patch is queued for Day 3 to point `homepage` fields back at `/library/api` and `/library/nextjs` once those routes are live.

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

### 2026-05-07 — Playground page shell shipped (sub-task 4)
- **Sub-task 4 of `~/Sandbox/PILCROW_PLAYGROUND_PLAN.md` shipped.** `/playground/` now resolves to a static shell with three labelled placeholders for editor (sub-task 5), settings (sub-task 6), and preview (sub-task 7). No `BrowserRenderer` import in this page — wiring happens in sub-task 7.
- **Layout topology:** two-column on desktop (editor LEFT, preview RIGHT), settings as a top bar; below 768px the panes collapse to a CSS-only radio-tab toggle (no runtime JS — works with JS disabled). The radios are promoted to direct children of `<main>` so the `:checked ~ .playground-panes …` general-sibling selector resolves through the panes container.
- **Chrome treatment:** minimal — Pilcrow ¶ wordmark only, no Library link. Added an additive `chrome?: 'full' | 'minimal'` prop to `Base.astro`; default is `'full'` (existing pages unchanged). The Library link is conditionally rendered.
- **Visual register:** Fraunces in the preview pane (editorial register — the product the user is here to see); Inter for chrome/tool elements (settings labels, tab labels, placeholder labels). Per Question E default of contrast.
- **Empty-state:** generic ~80-word stand-in paragraph pre-loaded in the editor placeholder. Flagged as a follow-up: the final invitation prose (drop-cap + hyphenation + footnote demo) is an editorial-writer task before the playground ships.
- **Build:** clean. `bun run build` produced 16 pages including `/playground/index.html`. The pre-existing `[pilcrow] posts/inline-markup/: unsupported inline element <br> …` warning is unchanged (acknowledged in the task brief).
- **Verification (over `bun run preview`, HTTP 200, hand-checked HTML):** all three `data-placeholder` attrs present; Library link absent on the playground page (`grep -c` returns 0); Library link still present on `/`, `/posts/hello/`, `/library/` (regression-free); placeholder visible labels render correctly.
- Next: sub-task 5 (editor pane — paste handling, textarea, basic markdown awareness — likely typography-architect again).

### 2026-05-07 — BrowserRenderer chapter + agent registration
- **BrowserRenderer arc:** built the playground's client-side typesetting renderer that mirrors `playwright.ts` for the upcoming `/playground` page. Caught a Linux Playwright Chromium 147 bug where variable-axis TTF fonts silently fail to render despite `FontFace.status === 'loaded'`. Switched body type from variable Fraunces (803 KB) to four static 144pt instances (389 KB total): Regular 400, SemiBold 600, Bold 700, Italic 400. Drop-cap weight changed 500 → 600 (static release ships no Medium). Residual ~3% line-count drift on long posts vs CF Pages remains as a known FreeType-vs-CoreText rasterisation envelope. v1.x candidate filed: Linux build container for byte-identical typeset parity (see `NOTES.md`).
- **Four learnings appended** to `.claude/learnings.md` (all dated 2026-05-06): BrowserRenderer arc, harness anti-pattern (diagnostic infra must reach canonical-Y by reference, never by reproduction), font-loading race for injected content (`document.fonts.ready` doesn't wait for unrequested weights), surface-reading bias (when probe matrix shows "identical CSS, different rect," look at lifecycle before structure).
- **Four Claude Code subagents registered** at `.claude/agents/`: typesetter, typography-architect, design-critic, editorial-writer. Personas previously existed only in user's Claude project knowledge; now in repo as runtime registration surface for typed dispatch. Slash command wiring (`/typeset`, `/build-feature`, `/review`, `/draft`) deferred — currently dispatch via plain-language phrasing.
- **`agents.md` merged** with canonical four-agent orchestration content. Single doc serves both non-Claude AI agents (Codex/Cursor/Aider entry-point) and Claude Code dispatch.
- **Context migration committed.** The 6-file context system migration (started 6 May, files authored locally) finally landed in main alongside `CLAUDE.md.bak`, `agents.md`, `.gitignore` additions for `context/current-issues.md` + `context/screenshots/` + `packages/*/dist/`.
- Next: Level 1 of the playground sprint — the page shell at `/playground/` (sub-tasks 4–10 of `PILCROW_PLAYGROUND_PLAN.md`).

### Older session notes
For history before 2026-05-06, see `.claude/learnings.md` (append-only lessons) and the original `CLAUDE.md.bak` (the dense braindump).
