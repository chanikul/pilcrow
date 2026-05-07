# Project Overview — Pilcrow

> The "why" of Pilcrow. Read this first.

## One-paragraph summary

**Pilcrow** is a static blog generator that sets posts at build time. Markdown in, typeset HTML out, zero JavaScript at the reader. Most blog posts on the web today are typeset by accident — column as wide as the screen, line breaks wherever the browser feels like, fonts whatever the OS shipped. Pilcrow makes those decisions, at build time, before the page reaches anyone. The reader receives a page that's already set; the browser has nothing left to decide.

**Brand:** Pilcrow Press · **Domain:** [pilcrow.page](https://pilcrow.page) · **Distribution:** `npx create-pilcrow my-blog`

## The artifact

Every post is set in **Fraunces** on a 65-character measure, with:

- A drop cap on the opening paragraph (per-post opt-out)
- Tufte-style margin notes via `:::sidenote` directives (4-column CSS Grid; mobile fallback)
- Footnotes in GFM `[^N]` syntax (canonical GFM HTML output)
- Pull quotes via `:::pullquote` (single-paragraph, attribution sets a hanging em-dash)
- en-gb hyphenation with a Pilcrow-local orphan guard (4-char threshold)
- Image pipeline: AVIF + WebP + original at 640/1280/1920px, with thumbhash placeholders
- Per-post OG cards generated in Fraunces during the build (1200×630, title-dominant minimalist)
- RSS feed, sitemap, OG meta tags, all built-in

None of this requires a line of JavaScript running at the reader.

## Goals

1. Editorial typesetting that matches print quality, on a static site, with zero reader JS.
2. A single-command starter (`create-pilcrow`) that gets a writer from zero to deployed in ~10 minutes.
3. A growth loop via the `Typeset with Pilcrow ¶` footer link (opt-out via `siteConfig.showPilcrowFooter`).
4. Maintain compatibility with the upstream `pretext` line-breaking library (chenglou/pretext); contribute issues and PRs upstream rather than forking.

## Core flow

**For the writer:**
1. `npx create-pilcrow my-blog` — scaffolds a complete project from `packages/create-pilcrow/template/`
2. `cd my-blog && bun install`
3. Author posts in `src/content/posts/` as Markdown
4. `bun run dev` for content preview (no typesetting — fast iteration)
5. `bun run build` runs the typeset pass (Playwright + pretext + Hyphenopoly)
6. Push to GitHub; Cloudflare Pages auto-deploys

**For the reader:** open the page. Nothing else.

## Tech stack (one-line)

Astro 6 + Bun + TypeScript · pretext + Hyphenopoly (en-gb) · Playwright (Chromium, build-time) · Sharp + thumbhash · Satori + @resvg/resvg-js (OG cards) · Cloudflare Pages.

(Full details in `02-architecture.md`.)

## Scope

### In scope (v1, shipped)

- Build-time typesetting pipeline (flat + rich-inline paths)
- Drop cap, hyphenation, orphan guard, sidenotes, footnotes, pull quotes
- Image pipeline (AVIF/WebP/fallback, thumbhash blur-up)
- OG image generation (per-post + index)
- RSS + sitemap
- Pilcrow footer growth loop
- `create-pilcrow` npm starter (published as 0.1.1)
- Cloudflare Pages deploy

### Out of scope (deliberately deferred to v1.x or v2)

These are documented in `NOTES.md` with full reasoning. Don't invent them; they're known and tracked.

- Multi-script support (CJK, Arabic, Hebrew)
- Variable-axis Fraunces in OG cards (Satori's parser can't handle multi-axis fvar)
- Gwern-level sidenote alignment (line-anchored, not paragraph-anchored)
- Per-line `<a>` reconstruction across pt-line splits (screen-reader concern)
- Template ↔ source drift detection
- camelCase-as-atomic-pill detection in Hyphenopoly
- Chromium install caching on Cloudflare Pages

## Success criteria

- A writer can go from `npx create-pilcrow` to deployed, typeset blog in under 10 minutes.
- Every shipped post passes Impeccable typography lint (excluding the documented `[single-font]` false positive).
- Build time on the reference content set stays under 60s on Cloudflare Pages free tier.
- Zero reader JavaScript except the optional 416-byte image blur-up (only when `hasImages: true`).
- Custom domain resolves with valid SSL; OG cards render correctly when shared.

## Non-goals

- Not a CMS. No admin UI, no database, no draft preview pipeline beyond `bun run dev`.
- Not a typography research tool. Pilcrow uses pretext as a black box and contributes upstream rather than forking.
- Not multi-language at the engine level (en-gb hyphenation only). Authors can write any language; the typesetting pipeline targets English.
- Not a comment system, analytics layer, or signup flow.
