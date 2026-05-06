# pilcrow-eleventy ¶

*An Eleventy plugin for setting your posts the way a competent print designer would, without leaving Markdown.*

The line-breaking primitive underneath is [pretext](https://github.com/chenglou/pretext) by [@chenglou](https://github.com/chenglou). `pilcrow-eleventy` is the adapter on top: it hooks into Eleventy's transform pipeline, hands each rendered HTML page to the same engine that powers [pilcrow.page](https://pilcrow.page), and writes the typeset HTML back to disk. The editorial behaviour (drop caps, sidenote-aware spans, en-gb hyphenation, an orphan guard) is whatever the engine has shipped at the version you install.

## What it does

Once registered, the plugin opens a single headless Chromium for your build, then hooks an `addTransform` step that fires per output page. Every page that contains a `<div class="post-body">` wrapper has the inner paragraphs replaced by per-line `<span class="pt-line">` elements. Pages without the wrapper pass through untouched, which means you can opt content in one layout at a time. Chromium closes when the build finishes.

No runtime JavaScript ships to the reader. The work happens once, at build time.

## Install

```sh
npm install --save-dev pilcrow-eleventy
npx playwright install chromium
```

Playwright is a peer dependency; the Chromium download is roughly 170 MB on first install.

## Minimal config

`eleventy.config.mjs`:

```js
import pilcrowEleventy from 'pilcrow-eleventy';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(pilcrowEleventy);

  return {
    dir: { input: 'src', output: '_site' },
  };
}
```

Then in your post layout, wrap the content in the class the plugin keys on:

```njk
<article>
  <h1>{{ title }}</h1>
  <div class="post-body">
    {{ content | safe }}
  </div>
</article>
```

That wrapper is the contract. Pages without it are passed through untouched.

## Options

The plugin forwards options straight through to the engine. The interesting one is `dropCap`; the others control measurement geometry and almost never need to be set. Leave them at their defaults and the renderer will pick up font, column width, and leading from the page's own CSS.

```js
eleventyConfig.addPlugin(pilcrowEleventy, {
  dropCap: true, // false to disable the lede drop cap globally
});
```

For per-post opt-out without changing the global default, drop a `<meta name="pilcrow:drop-cap" content="false">` tag in the page head. Useful when the lede is a quotation or a list-introduction rather than running prose.

## Build environment requirements

The engine measures text by laying it out inside headless Chromium. Your build host therefore needs to be able to install and launch Playwright Chromium. The following hosts are confirmed working:

- Vercel
- Netlify
- Cloudflare Pages
- GitHub Actions
- GitLab CI

Locked-down CI environments without sandboxing or browser binaries are not supported. Build times scale with post count plus a fixed Chromium spin-up cost.

Node 18.17.1 or newer. Playwright 1.40 or newer (peer dependency). Eleventy 3.0 or newer (peer dependency); the plugin uses the `eleventy.before` and `eleventy.after` events for renderer lifecycle.

## Documentation

The Pilcrow project lives at [pilcrow.page](https://pilcrow.page). Engine-level options, the full `TypesetOptions` reference, and the Astro starter are documented there.

## Credit

[Cheng Lou](https://github.com/chenglou) wrote pretext. `pilcrow-eleventy` is a thin adapter that runs the engine inside an Eleventy build; the typography itself is mostly someone else's work, exposed through a more convenient seam.

## Licence

MIT.

---

*Built on [pretext](https://github.com/chenglou/pretext) by [@chenglou](https://github.com/chenglou).*
