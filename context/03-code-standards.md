# Code Standards — Pilcrow

> Engine conventions, plugin policies, and the never-do list. Read before touching `src/lib/`, `src/plugins/`, or `src/integrations/`.

## TypeScript

- Strict mode is on. No `any`. Use `unknown` and narrow.
- All engine code (`src/lib/`, `src/plugins/`, `src/integrations/`) is `.ts`. No `.js` in engine.
- Astro components stay `.astro`. Server-side logic lives in their frontmatter; component bodies stay declarative.

## Plugin / integration architecture

- **Markdown plugins** (`src/plugins/`) own structural HTML transformation only. They never measure typography. They never call Playwright.
- **The Playwright pass** (`src/lib/typeset/playwright.ts`) owns measurement and per-line wrapping. It never restructures HTML beyond `<p>` → `<span class="pt-line">…</span>`.
- **Plugin order** in `astro.config.mjs` is a hard constraint:
  - remark: `[remarkDirective, remarkPullquote, remarkSidenote]`
  - rehype: `[rehypeFootnoteMark, rehypeHoistSidenotes, rehypeImages]`
  - Reordering breaks the sidenote hoist (rehype hoist depends on remark emission shape).

## CSS source-of-truth rule

`public/styles/global.css` is the single source of truth for measurement-critical rules:

- `.post-body` width / `--prose-measure`
- `.post` max-width (and the `@media (min-width: 1100px)` expansion for sidenotes)
- `.post-body` font-family, font-size, line-height
- `.footnotes p` font-size and line-height
- `aside.sidenote` width and grid-column

`playwright.ts` reads these via `loaderHTML` at build time. **If you add a measurement-critical rule, extend `readMeasurementCSS()` to extract it.** Two copies of these rules anywhere = silent miscalculation.

## Hyphenation policy

Hyphenopoly (en-gb, leftmin 3, rightmin 3, minWordLength 6) runs Node-side before pretext.

**Skip list** (in `src/lib/typeset/hyphenate.ts`):
- `<code>` — content not hyphenated
- `<cite>` — author names never hyphenated
- `<sub>` / `<sup>` — only hyphenated if `!/^\d+$/.test(innerText)` (digits never hyphenated, regardless of length — keeps footnote markers clean)

**When adding a new inline element to the rich-inline whitelist** (currently `em`, `strong`, `a`, `code`, `sub`, `sup`), evaluate the hyphenation policy: should its content be skipped (`<cite>`-style), conditionally skipped (`<sup>`-style), or hyphenated (`<em>`-style)?

## Orphan-guard wrapper

`guardFlat` and `guardRich` (inside `page.evaluate()` in `playwright.ts`):

- Threshold: **4 chars** for right fragment.
- Detect: clean breaks (`fail-|ure`) and packed-grapheme breaks (`ital-i|cs`).
- Recovery: targeted SHY strip via `findOrphanSHYPos(stem)`, NOT document-order strip (that causes collateral grapheme-break regressions on unrelated words).
- Sentinel: `LITERAL_HYPHEN_BREAK` returned for `stem + '-'` (literal hyphen in compound words like `drop-cap`, `well-being`); accept layout, no warning.
- Helpers must live inside `page.evaluate()`'s callback — they run in browser context, cannot be Node imports.

The wrapper is **acknowledged technical debt** that pretext upstream **RESOLVED on 2026-05-08** via commit `f06fef0` (issue #162). The fix shipped as a default-behaviour change, not the opt-in `softHyphenMode: 'strict'` flag the issue proposed: `src/line-break.ts` had post-SHY grapheme packing removed unconditionally (100 deletions, 2 additions). The wrapper becomes dead code once Pilcrow upgrades to a pretext release containing `f06fef0`. Tracked as a candidate spec in `context/06-progress-tracker.md`. When upgrading: remove `guardFlat`, `guardRich`, `findOrphanSHYPos`, `LITERAL_HYPHEN_BREAK` sentinel handling, and the recovery loop entirely; re-run the acceptance gate to verify.

## Drop-cap policy

The lede paragraph (first non-empty `<p>` in `.post-body`) gets `<span class="drop-cap">` by default. Per-post opt-out via `dropCap: false` front-matter, read as a `<meta name="pilcrow:drop-cap">` tag emitted in `Post.astro` / `Base.astro`.

**Drop-cap gates** (paragraphs that must NOT consume the `isLede` flag):
- `!p.closest('aside.pullquote')`
- `!p.closest('.footnotes')`
- `!p.closest('aside.sidenote')`
- `!p.closest('.shape-around')` (added 2026-05-09 with shape-around primitive)

If a future primitive adds a new aside-class container, add a gate.

## Sidenote marker preservation

`<sup class="sidenote-marker">` markers must survive `p.innerHTML = ...` reassignment in `playwright.ts`. Use the `buildLineSpansHTML(inners, markers)` helper; it injects markers inside the **last** `.pt-line` span. Appending markers AFTER `display:block` `.pt-line` spans triggers CSS anonymous block wrapping → marker renders as a standalone visual line ("stray 1 in accent colour"). All four code paths in `playwright.ts` must preserve markers.

## Body extraction (regex pitfall)

`splicePostBody` and the body-extraction logic in `pilcrow-typeset.ts` use **depth-counting div-balanced scanners**, NOT regex. The original non-greedy `[\s\S]*?` regex stopped at the FIRST `</div>` inside `.post-body` — fine until the `.footnotes-mark` glyph element introduced a nested `<div>`. Any future primitive that adds nested `<div>` inside `.post-body` would break a regex approach. Keep the depth-counter.

## A11y rules (these are real)

- **Never** use `::before { content: 'U+glyph' }` for decorative Unicode — read aloud by NVDA, JAWS, VoiceOver. Use a real DOM element with `aria-hidden="true"` (e.g. `.footnotes-mark`).
- Per-line `<a>` reconstruction across `pt-line` splits: announces as separate links. Acceptable for v1; documented in `NOTES.md` as v2 candidate.
- Image alt-text policy is **warn-not-fail**: missing `alt` emits `[pilcrow] WARNING: image without alt — <slug> — <filename>` to stderr, sets `alt=""` (WCAG correct for decorative), omits figcaption. Don't change to fail — breaks rapid drafting.

## Astro 6 conventions

- Collection config lives at `src/content.config.ts` (not the legacy `src/content/config.ts`).
- Collection requires a `loader` (use `glob` from `astro/loaders`).
- Render with `render(post)` imported from `astro:content`, NOT `post.render()`.
- Collection entries use `post.id` (not `post.slug`) as URL slug param.
- `remark-gfm@4.0.1` is a default with `gfm: true` — do NOT add it explicitly to `astro.config.mjs` (will run twice).

## Image pipeline rules

- Sharp output goes to `public/_images/<slug>-<width>w.<format>`. **Never to `dist/`** (Astro cleans dist at start of build → silent destruction).
- Slug = source filename lowercased, non-alphanumeric → `-`.
- Sharp reports AVIF source files as format `'heif'` (not `'avif'`); the `fallbackFormat` function in `process.ts` maps `'heif' → 'avif'`.
- Aspect ratio set as inline `style="aspect-ratio: W / H"` on `<figure>` to prevent CLS.
- Blur-up script: inline in `Post.astro`, emitted only when `hasImages: true` in front-matter. Budget: **1 KB** (current: 416 bytes). No-op if JS disabled.

## OG card rules

- Card dimensions: 1200×630.
- Layout: title-dominant minimalist. ¶ glyph bottom-right at 0.45× title size, in MUTED (identity, not emphasis).
- Font: `src/assets/fonts/Fraunces144pt-Bold.ttf` (static instance). NEVER the variable TTF — Satori's opentype.js parser cannot handle 4-axis fvar.
- Font path: `process.cwd() + 'src/assets/fonts/...'`. NEVER `import.meta.url`-relative (resolves to `dist/.prerender/chunks/` during prerender, breaks).
- No pubdate on cards. No description text on post cards (D3=A click-through to typeset page).
- Index card uses RSS channel description as title text.
- `PILCROW_SKIP_TYPESET=1` does NOT skip OG generation (separate static route).

## Forbidden patterns

These have caused real bugs. Don't reach for them.

- `any` in TypeScript
- Hex literals in component CSS instead of `var(--paper)` etc.
- Two copies of measurement-critical CSS rules (creates silent drift)
- Adding `remark-gfm` explicitly to `astro.config.mjs` (it's already a default → runs twice)
- Sharp output written to `dist/` directly (cleaned at build start)
- Variable Fraunces TTF in Satori (opentype.js can't parse multi-axis fvar)
- `import.meta.url`-relative font paths in OG endpoints (breaks during prerender)
- Document-order SHY-stripping in orphan recovery (causes collateral regressions)
- Non-greedy regex on `.post-body` content (breaks on nested `<div>`)
- `::before { content: 'U+glyph' }` for decorative Unicode (screen-reader noise)
- Sidenote marker appended AFTER `.pt-line` spans (CSS anonymous block wrapping)
- Adding `bun` or `pnpm` workspaces for `packages/` (Astro ignores it correctly without)

## Comments

- Code explains *what*. Comments explain *why*.
- Non-obvious decisions (especially around the typeset pipeline's grapheme/syllable mismatch) get a block comment naming the constraint and the upstream-fix reference if any.
- TODOs include owner + date + ticket: `// TODO(chanikul, 2026-05-15): remove orphan guard once pretext #162 ships`.
