# My Pilcrow Blog

A statically typeset blog built with [Pilcrow](https://pilcrow.page).

## Getting started

```sh
bun install
bun run dev      # start the dev server at localhost:4321
bun run build    # build the static site to dist/
bun run preview  # serve dist/ locally
```

## Writing a post

Create a file in `src/content/posts/`:

```md
---
title: "My first post"
description: "A short description."
pubDate: 2026-01-15
draft: false
tags: ["writing"]
---

Your prose here. The first paragraph gets a drop cap by default.
```

Set `draft: true` to hide a post from the index and RSS feed (it still builds, so you can preview it at `/posts/your-slug/`).

## Editorial primitives

| Feature     | Syntax                              |
|-------------|-------------------------------------|
| Drop cap    | Automatic. Opt out: `dropCap: false` in front-matter. |
| Pull quote  | `:::pullquote … :::` |
| Sidenote    | `:::sidenote … :::` |
| Footnote    | `[^1]` inline / `[^1]: text` at end |
| Figure      | `![alt text](./images/photo.jpg)` |

See `src/content/posts/example.md` for a working demonstration of all primitives.

## Configuration

Edit `src/config/site.ts` to toggle the "Typeset with Pilcrow ¶" footer link.

Edit `astro.config.mjs` to change the site URL (used by RSS, sitemap, and OG images).

## Deploying

Build output is in `dist/`. Deploy to any static host. Cloudflare Pages is recommended — the `wrangler.toml` at the project root is pre-configured.

Cloudflare Pages quick start:
1. Connect the repository in the Cloudflare Pages dashboard.
2. Build command: `bun run build`
3. Output directory: `dist`
4. Node.js version: 20
