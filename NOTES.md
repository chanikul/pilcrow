# Pilcrow v1 — Notes & Deferred Decisions

- [2026-05-10] **shape-around lead-in pattern: architectural deadend (attempted, reverted).** `margin-top: 1.7em` on `.shape-obstacle` plus a paired walker offset (`SA_TOP_OFFSET = resolvedLineHeight`) was committed in `82236e5` to produce an editorial lead-in line above the figure. Forensic verification of the deployed page the same day caught a real overflow: glyph variant line 0 extended ~147px past the prose column's right edge into the page gutter. Root cause: `shape-outside: url()` is locked to `margin-box` reference per CSS Shapes 1 (the spec accepts `<shape-box>` only with `<basic-shape>`, not with `<image>`). So the silhouette image's contour extends upward into any margin-top region. For silhouettes opaque at row 0 (e.g. a glyph 'a' whose top fills its bounding box), this means line 0 — supposedly above the float — still gets constrained by the silhouette's top contour through the margin-box, while pretext was given the full column width to break against. The mismatch produces overflow. The image variant masked the bug because its silhouette is transparent at row 0 (sky above the head) so shape-outside reported no contour at the lead-in row. The lead-in was reverted in the next commit. A real lead-in implementation would need either: (a) padding the silhouette image with transparent rows at the top so shape-outside naturally honours the offset, plus a matching `padding-top` on the obstacle to position the visible figure correctly inside the now-taller box; or (b) emitting line 0 as a separate `<p>` outside the `.shape-around` block at build time, restructuring the DOM. Both are architecturally sized work; neither is a one-line CSS fix. Lesson for future shape-around polish: `shape-outside: url()` cannot be retargeted to a different reference box at the CSS level. Architectural decisions that assume otherwise will silently produce overflow on silhouettes that are opaque near their top edge.

- [2026-05-09] **shape-around shipped** — glyph and image silhouette variants. Left-float only for v1. Right-float (`align="right"`) is a follow-up: the CSS `float: right` change is one line; the geometry model in playwright.ts needs a `maxXFromRightAtY` variant. Shape-around-image v1 requires a PNG with alpha channel; auto-background-removal for opaque JPEGs is out of scope (requires ML model). Mobile fallback at ≤639px: obstacle stacks above prose (no float, no variable-width narrowing). Test post at `src/content/posts/shape-around-test.md` with `draft: true`.

- [2026-05-09] **shape-around grapheme-pack artifacts at narrow measures** — the image variant produces narrow lines (~233px for a 480px circular obstacle in a 65ch column). At these measures, Hyphenopoly soft-hyphen positions trigger pretext's grapheme-pack behavior ("manu-s|cripts"). The orphan guard's Case 2 doesn't fire because the post-SHY residual ("cripts", 6 chars) is ≥ RIGHTMIN(3). These are aesthetic-quality artifacts, not orphan-guard-scope bugs. The upstream pretext #162 fix (`f06fef0`, awaiting npm release) will address them structurally.

- [2026-05-01] **template/example.md sync — v1.x candidate.** `template/src/content/posts/example.md` and `src/content/posts/example.md` are conceptually the same content and should not drift; manual sync is fragile. v1.x candidate: build-time symlink, pre-commit check, or generate one from the other. Not blocking launch.

- [2026-05-01] **Adjacent superscripts visually dense — v1.x candidate.** Line 27 of
  `create-pilcrow/template/src/content/posts/example.md` places a sidenote marker and a
  footnote reference adjacently, producing `¹²` with no separation. Not a rendering
  error — both superscripts resolve correctly — but the pair reads as a single glyph at
  small sizes. Likely fix: CSS rule `sup + sup { margin-left: 0.15em }` (or equivalent
  `letter-spacing` on `<sup>` when consecutive), scoped to `.post-body`. Not blocking
  launch; the current output is editorially acceptable. Fix in a single-line CSS edit
  when the time is right.

- [2026-04-29] Impeccable [single-font] false positive: `npx impeccable detect dist/` fires
  `[single-font]` claiming only Fraunces is in use, because Impeccable can't follow external
  CSS `<link>` hrefs to see that Inter is declared for `<time>` elements. The detection is
  a tool limitation, not a design violation. Suppress or ignore; do not treat as blocking.
  The fix (when needed) is to either inline the critical font-family rules in a `<style>` tag
  or to add the `global.css` to `public/` so Impeccable can read it locally.

- [2026-04-29] global.css is referenced via `href="/styles/global.css"` but `src/styles/`
  is not automatically copied to `dist/` by Astro — only `public/` is. FIXED: global.css
  moved to `public/styles/global.css`; `GLOBAL_CSS_PATH` in playwright.ts updated to match.
  Lesson: `/review` passes must run against `bun run preview` output (actual HTTP), not source
  files — source CSS intent and served CSS are not the same until public/ is the source of truth.

- [2026-04-29] Per-line wrapping splits a single <a> across multiple sibling
  <a> elements with the same href when the wrap falls inside a link. Screen
  readers announce these as separate links. Acceptable for v1; structural
  tradeoff of pretext's per-line approach. Possible v2 fix: wrap the
  containing pt-line spans in a single outer <a> with role/aria adjustments,
  but that complicates the line-span primitive. Defer.

- [2026-04-29] **camelCase-as-atomic-pill — v1.x candidate.** Surfaced during
  the inline-markup ¶3 link-wrap investigation. When prose contains identifier-
  style tokens (camelCase / PascalCase, no spaces, length ≥ 12 — e.g.
  `walkRichInlineLineRanges`), Hyphenopoly hyphenates them as English compounds
  and pretext takes the SHY break, fragmenting the identifier mid-hump. The
  right architectural fix is to flag such items with pretext's `break: 'never'`
  in `walkNode` (rich-inline.ts treats `break: 'never'` items as atomic inline
  pills — break before or after, never inside). This same model fits future
  primitives: URLs in prose, hashtags, foreign-word pull-ins. Not implementing
  in v1 — current mitigation is `<code>` markup for technical identifiers in
  authored content. Detection heuristic for the future implementation:
  `text.length >= 12 && /[a-z][A-Z]/.test(text) && !/\s/.test(text)`.

- [2026-04-30] **gwern-level sidenote alignment — v1.x candidate.** The current
  sidenote layout uses Grid auto-row (strategy α): the aside's top edge aligns
  with the bottom of the anchor `<p>`. This is Tufte-CSS-level alignment —
  correct, readable, and clean. gwern-level alignment means the sidenote's
  first line aligns with the anchor word's text baseline inside the paragraph.
  Achieving this requires knowing which pt-line span contains the anchor word,
  computing its y-offset within the `<p>`, and using either `grid-row` pinning
  or a `margin-top` offset on the `<aside>`. This is doable at build time
  (pretext knows which line each word falls on) but requires extending
  `rehype-hoist-sidenotes.ts` to accept line-position metadata from the
  playwright typesetting pass — a meaningful pipeline change. Defer to v1.x;
  the current paragraph-end alignment is correct typography and sufficient for v1.

- [2026-04-29] **Test post realism note for the README pass.** The current
  `inline-markup.md` ¶3 wraps three identifiers (`prepareRichInline`,
  `walkRichInlineLineRanges`, `materializeRichInlineLineRange`) inside a single
  `<a href>` separated by `and`. This is unusual for editorial prose — real
  technical writing wraps each identifier in `<code>` (often inside the link).
  Acceptable as a stress-test for v1's typeset pipeline, but when v1 example
  posts are rewritten for the README / landing page, identifier-style content
  should follow the technical-prose convention: `<a><code>name</code></a>` per
  identifier. Content-authoring guidance, not engine work.

---

## Upstream pretext: softHyphenMode strict (RESOLVED — awaiting npm release)

Filed 2026-04-30 as https://github.com/chenglou/pretext/issues/162. **Fix landed upstream 2026-05-08 as commit `f06fef0` — shipped as a default-behaviour change, not the opt-in `softHyphenMode: 'strict'` flag the issue proposed (post-SHY grapheme packing removed unconditionally). Awaiting an npm release of `@chenglou/pretext` containing it.** Future commentary belongs on the GitHub thread, not in this file.

[Original draft body, preserved as filed:]

### Title

Add `softHyphenMode: 'strict'` option to prevent grapheme-packing after soft-hyphen breaks

### Body

**Problem**

When a soft hyphen (`­`) wins a line break, pretext's `continueSoftHyphenBreakableSegment` packs as many graphemes from the post-hyphen segment onto the current line as will fit within `maxWidth`. The result is that the materialized line text can end with a visible hyphen *plus* one or more extra characters — e.g. `"ital-i"` — while the next line opens with only the remaining fragment `"cs"` (2 chars). This produces a short right orphan fragment that is editorially unacceptable.

The root cause: pretext is grapheme-aware, not syllable-aware, and has no visibility into the `rightmin` setting that the caller's hyphenation library (e.g. Hyphenopoly) used when inserting the soft hyphen. Hyphenopoly's `rightmin: 3` means the post-hyphen fragment is at least 3 chars *at the soft-hyphen position*, but after pretext packs graphemes, the fragment that wraps to the next line can be shorter.

**Minimal repro**

Paragraph text: `"There is something quietly remarkable about a sentence that carries emphasis for half its length: a quick brown fox jumps over a sleeping editor who never noticed the ital­ics were there."` (where `­` = U+00AD between `ital` and `ics`).

At a column width where `ital-` just fits on line N but `ital-ics` does not: pretext emits `"...ital-i"` on line N (packing `i` from `ics` because it fits) and `"cs were there."` on line N+1. The right fragment is `i` + `cs` = `ics` (3 chars) split across two lines in a visually broken way.

**Proposed API**

Add a `softHyphenMode` option to `prepareWithSegments` (and `prepareRichInline`):

```ts
prepareWithSegments(text, font, {
  softHyphenMode: 'strict' | 'pack-graphemes'  // default: 'pack-graphemes'
})
```

- `'pack-graphemes'` (default, current behaviour): after a soft-hyphen break, pack as many graphemes from the post-hyphen segment as fit onto the current line. Backwards compatible.
- `'strict'`: treat the post-hyphen segment as atomic. Either the *entire* post-hyphen segment fits on the current line (and no break is needed), or the line breaks *before* the soft hyphen (emitting the left stem + `-` + nothing else on line N). This respects the caller's intended `rightmin` semantics.

**Rationale**

- Editorial typography (Pilcrow's use case) requires strict: the hyphenation library's `rightmin` setting must be honoured end-to-end, or soft hyphens are not a reliable signal.
- Browser `overflow-wrap: break-word` semantics (the original use case) can tolerate pack-graphemes: the goal there is fitting the most text possible, not preserving syllable integrity.
- The default remains `pack-graphemes` for full backwards compatibility.

**Current mitigation**

Pilcrow v1 ships a local wrapper (`orphan-guard` in `src/lib/typeset/playwright.ts`) that detects orphan-producing breaks after the fact and re-runs pretext with the offending soft hyphen stripped. This is functional but adds latency for affected paragraphs and doesn't eliminate the root cause. The wrapper is explicitly documented as "remove when upstream ships `softHyphenMode: 'strict'`".

Happy to contribute the upstream PR if helpful.

---

*Orphan guard added to Pilcrow v1 on 2026-04-29. Wrapper location: `src/lib/typeset/playwright.ts`, functions `guardFlat` and `guardRich`. Threshold: 4 chars right fragment. Recovery: targeted SHY strip (stem-search), re-run from paragraph start.*

- [2026-04-30] **Case 2 regex widened from `{1,3}` to `{1,7}`.** The original cap missed packed-grapheme suffixes of 4+ chars (e.g. `con-strai` from `constraint`, surfaced in the sidenotes post critic review). Future widenings beyond `{1,7}` should be treated as a heuristic running out of road — at that suffix length the right move is `/review` to characterise root cause, not another bump; the upstream `softHyphenMode: 'strict'` fix (issue #162) remains the correct structural resolution.

- [2026-04-30] **Literal-hyphen blind spot in Case 1 detection — mitigated locally.** Case 1 fires on any line ending with a visible `-`, but cannot distinguish a U+00AD soft-hyphen break (recoverable) from a literal U+002D in a compound word such as `drop-cap`, `well-being`, or `multi-script` (structural, editorially acceptable). When the recovery loop encountered a compound-word line-end it would strip all SHYs in the paragraph and emit a spurious "unrecoverable" warning. Fixed: `findOrphanSHYPos` now checks the source text for both `stem + U+00AD` (SHY-induced, strip it) and `stem + '-'` (literal hyphen, return `LITERAL_HYPHEN_BREAK`). Both `guardFlat` and `guardRich` accept the layout as-is on that sentinel without warning. This is one of several local mitigations for pretext's grapheme-aware (not syllable-aware) line-breaking semantics; the upstream fix (issue #162, fix landed 2026-05-08 as commit `f06fef0` — default-behaviour change keeping soft-hyphen breaks at the insertion point, not the opt-in `softHyphenMode: 'strict'` flag the issue proposed) will subsume this and the rest of the orphan-guard wrapper once the npm release ships. Pilcrow's wrapper is acknowledged technical debt; removal is tracked as candidate spec 9 in `context/06-progress-tracker.md`.

---

## Packed-grapheme aesthetic findings — catalogue for issue #162 (fix landed 2026-05-08)

The orphan-guard wrapper enforces `rightmin: 3` on the post-SHY residual and now catches packed-grapheme suffixes of 1–7 chars (regex `{1,7}` after the 2026-04-30 widening). It does not enforce *aesthetic* quality on the suffix itself. When pretext's `continueSoftHyphenBreakableSegment` packs 1–2 graphemes onto the SHY line and the next-line residual is ≥ 3, the guard correctly stays silent — but the visible line-end can still read awkwardly because the suffix is not a syllable boundary the eye expects.

These are not orphan-class bugs. They are aesthetic-quality bugs of the same root cause as #162: pretext is grapheme-aware, not syllable-aware, and has no visibility into Hyphenopoly's intended break geometry. Logged here so the catalogue is discoverable when the npm release of `@chenglou/pretext` containing commit `f06fef0` ships, and so regression-testing can verify these specific cases improve.

Surfaced by the sidenote-post critic review on 2026-04-30:

- `sidenotes.md` V1 aside — `typo-gr` / `aphy` (word: *typography*; suffix `gr` packed; next residual `aphy`, 4 chars)
- `sidenotes.md` V2 aside3 — `dif-f` / `erent` (word: *different*; suffix `f` packed; next residual `erent`, 5 chars) — most visually disruptive; the lone `f` between two doubled-letter contexts reads as a misprint
- `sidenotes.md` V4 aside — `characterist-i` / `cally` (word: *characteristically*; suffix `i` packed)
- `sidenotes.md` V4 aside — `character-i` / `stically` (same word, second instance, different SHY position)
- `sidenotes.md` V5 aside — `com-fo` / `rtably` (word: *comfortably*; suffix `fo` packed)

All five render at the 25ch sidenote margin measure where the column is narrow enough that the SHY-line packing is visible; body-prose at 65ch tends to absorb the same mechanism more gracefully because the line has more room to break naturally before the SHY position is forced.

Mitigation: option A — accept and wait for upstream. Each instance is editorial-acceptable in isolation; the catalogue exists so when #162 lands, regression-testing can verify these specific cases improve.

---

## Deploy & distribution notes (added 2026-05-01)

- **Cloudflare Pages Playwright note (v1.x candidate):** The `postinstall` script (`playwright install chromium`) installs ~120MB of Chromium into the build container. Cloudflare Pages free tier has a 25MB/s bandwidth and 20-minute build timeout — Chromium install is the most expensive build step. If build times become problematic, options: (a) cache `~/.cache/ms-playwright` via `PLAYWRIGHT_BROWSERS_PATH` env var pointing to a persistent path, or (b) investigate whether CF Pages supports custom build images with Chromium pre-installed. Document when it becomes a real constraint.

- **create-pilcrow template drift (v1.x maintenance note):** The `packages/create-pilcrow/template/` directory is a copy of the engine files at a point in time. When engine files change (playwright.ts, plugins, global.css, layouts), the template must be updated in sync. There is currently no automated check for drift. v1.x candidate: a Bun script that diffs the template against the source and warns when they diverge.

- **Starter package size (v1.x):** The `create-pilcrow` package is ~1.9MB unpacked, dominated by the Fraunces TTF (94KB) and the example JPEG image (1.6MB). If package size becomes a concern for `npx` UX, options: (a) remove the bundled JPEG and instruct users to add their own first image, (b) compress the JPEG further. For v1, having a working example image on first run is worth the size overhead.

- **Linux build container for typeset parity (v1.x candidate):** Eliminates the residual ~3% line-count drift on long posts (>100 pt-lines) caused by macOS CoreText vs Linux FreeType character metrics in headless Chromium — same Fraunces TTF, same Chromium build, sub-pixel rasterisation differs between the two platforms. Approach: Dockerfile based on `node:22-bookworm` with Playwright Linux Chromium pre-installed, mount repo, `bun run build` executes inside container. CF Pages and local would then produce byte-identical typeset output. Cost: 1-2 days build infra, ongoing DX maintenance (file watching, network for Hyphenopoly wasm, font asset paths). Reasonable when Pilcrow has multi-platform contributors or users reporting drift; over-investment for current single-developer state. Until then, the BrowserRenderer gate's secondary axis (BrowserRenderer ≡ deployed pilcrow.page) tolerates +1 to +3 lines drift on long posts as a documented envelope. Reference: BrowserRenderer arc in `.claude/learnings.md` (2026-05-06).
