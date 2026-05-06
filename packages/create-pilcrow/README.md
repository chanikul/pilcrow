# create-pilcrow

*The scaffolder for [Pilcrow](https://pilcrow.page) — a static blog generator that typesets your posts at build time. Markdown in, typeset HTML out. Zero JavaScript at the reader.*

> Already have a blog? Drop Pilcrow into it instead: [pilcrow.page/library](https://pilcrow.page/library/)

## Quick start

```sh
npx create-pilcrow my-blog
cd my-blog
bun install
bun run dev
```

Open `http://localhost:4321`. Edit `src/content/posts/example.md` to write your first post. Run `bun run build` to produce typeset HTML in `dist/`. Push to GitHub and Cloudflare Pages auto-deploys on every commit.

## What you get

A complete Astro project, pre-configured with the Pilcrow engine. Every post is set in Fraunces on a 65-character measure, with a drop cap on the opening paragraph, Tufte-style margin notes via `:::sidenote` directives, footnotes in GFM syntax, pull quotes via `:::pullquote`, and en-gb hyphenation with an orphan guard. The image pipeline converts your photographs to AVIF and WebP at three breakpoints, with thumbhash placeholders baked in at build time. Per-post OG cards are generated in Fraunces during the build. An RSS feed and sitemap come included. None of this requires a line of JavaScript running at the reader.

## Requirements

- **Bun** (>=1.0) for the build. [Install](https://bun.sh).
- **Node.js** (>=18.17.1) — the CLI itself runs on Node and is zero-dep.

The build runs Playwright headless Chromium to measure each paragraph at its actual rendered column width before committing the line breaks. On first install, Playwright downloads Chromium (~170 MB). Subsequent builds reuse the cached browser.

## Documentation

Full documentation at [pilcrow.page](https://pilcrow.page).

## Licence

MIT.

---

*Pilcrow is built on [pretext](https://github.com/chenglou/pretext) by [@chenglou](https://github.com/chenglou).*
