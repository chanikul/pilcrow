# pilcrow-nextjs ¶

*A build-time rehype plugin that drops [Pilcrow](https://pilcrow.page) typesetting into a Next.js MDX pipeline.*

The hard part, measuring each line at the page's actual font and column width, is done by [pretext](https://github.com/chenglou/pretext), [@chenglou](https://github.com/chenglou)'s text-layout library. `pilcrow-nextjs` is a thin shim: it reads the rehype HAST tree your MDX file compiles to, hands the rendered HTML to `pilcrow-typeset`, and splices the typeset output back into the tree before Next.js's MDX bundler turns the result into JavaScript.

## What it does

When `next build` compiles an `.mdx` page, this plugin intercepts the rehype pass, serialises the post body to HTML, runs `typeset()`, and replaces every `<p>` with per-line `<span class="pt-line">` spans. Drop caps, hyphenation, and sidenote-aware lines are handled by `pilcrow-typeset`. The output is static HTML baked into your Next.js build artefacts; nothing runs at request time and no JavaScript is shipped to the reader on its account.

A single Chromium instance is opened on first invocation per build and reused across `.mdx` files, so you pay the browser-launch cost once.

## Build environment requirements

Next.js bundles MDX at compile time. Doing this work at request time inside a serverless or edge runtime is not viable, so **`pilcrow-nextjs` runs at build time only**. That means `next build` (and any `next dev` compile pass) needs an environment that can install and launch headless Chromium.

Confirmed working on Vercel, Netlify, Cloudflare Pages, GitHub Actions, and GitLab CI. Locked-down build images that block browser sandboxing or omit the Chromium binary will not work.

Node ≥18.17.1. Next.js ≥14 and Playwright ≥1.40 are peer dependencies.

## Install

```sh
npm install pilcrow-nextjs pilcrow-typeset @next/mdx @mdx-js/loader @mdx-js/react
npx playwright install chromium
```

## next.config.mjs

```js
import createMDX from '@next/mdx';
import pilcrowNext from 'pilcrow-nextjs';

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [[pilcrowNext, {}]],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
};

export default withMDX(nextConfig);
```

The plugin is the last rehype step you want before the MDX code generator runs, because pretext needs the final rendered HTML structure to measure against.

## Options

```ts
rehypePlugins: [[pilcrowNext, {
  fontShorthand: '18px ui-serif',
  maxWidth: 720,
  lineHeight: 30,
  dropCap: true,
}]]
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `fontShorthand` | `string` | `''` | CSS font shorthand. Empty = read computed value from your CSS at typeset time. |
| `maxWidth` | `number` | `0` | Column width in CSS pixels. Zero = fall back to the page's `clientWidth`. |
| `lineHeight` | `number` | `0` | Line height in CSS pixels. Zero = read from computed style. |
| `dropCap` | `boolean` | `true` | Drop cap on the lede paragraph. Set `false` to opt out. |

The empty-string and zero defaults are deliberate. They tell the renderer to read the values from your stylesheet, so your CSS stays the single source of truth for measurement geometry.

## MDX with JSX

Pure-Markdown `.mdx` files typeset normally. If a file contains JSX components or `{expression}` nodes, those are MDX-AST shapes that cannot survive the HTML round-trip the plugin performs. When the plugin sees one, it logs a warning to stderr naming the file and returns the tree unchanged. Move the JSX out into a layout or surrounding page if you want the body content typeset.

## Documentation

Full Pilcrow documentation at [pilcrow.page](https://pilcrow.page).

## Credit

Most of the work behind any line you read on a Pilcrow site happens inside pretext. [Cheng Lou](https://github.com/chenglou) wrote it. `pilcrow-nextjs` is the bit that knits pretext into Next.js's MDX pipeline; the editorial primitives (drop caps, sidenote spans, hyphenation, the orphan guard) live in [`pilcrow-typeset`](https://www.npmjs.com/package/pilcrow-typeset).

## Licence

MIT.

---

*Built on [pretext](https://github.com/chenglou/pretext) by [@chenglou](https://github.com/chenglou).*
