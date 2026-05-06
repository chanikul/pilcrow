# pilcrow-typeset ¶

*The typesetting engine behind [Pilcrow](https://pilcrow.page), as a library — for build pipelines that aren't Astro.*

The line breaking is done by [pretext](https://github.com/chenglou/pretext), [@chenglou](https://github.com/chenglou)'s multilingual text-measurement library. `pilcrow-typeset` is the editorial layer on top: en-gb hyphenation, drop caps, sidenote-aware spans, an orphan guard, and a contract that lets you swap in a non-Playwright renderer when pretext ships server-side rendering upstream.

## What it does

Given a block of HTML, `pilcrow-typeset` opens a headless Chromium, lays the HTML out at the column width and font shorthand you tell it (or reads them from your own CSS), and replaces every `<p>` with per-line `<span class="pt-line">` wrappers. The output is static HTML you serve as-is. No runtime JavaScript ships to the reader.

Hyphenation runs Node-side via Hyphenopoly's en-gb pattern set, which is bundled with the package. Soft hyphens are inserted before pretext sees the markup, so line breaks land at syllable boundaries rather than wherever the browser would have guessed.

## Install

```sh
npm install pilcrow-typeset
```

Playwright is a peer dependency. On first install you'll also want `npx playwright install chromium` (~170 MB).

## Single-shot

For one-off documents — opens Chromium, typesets, tears down.

```ts
import { typeset } from 'pilcrow-typeset';

const { html, lineCount, paragraphCount } = await typeset(bodyHTML);
```

The lifecycle (`open` → `typeset` → `close`) is dominated by Chromium spin-up. Fine for a one-off; wasteful for a build job that processes many documents.

## Batch

For build integrations — keep one browser alive across many documents.

```ts
import { PlaywrightRenderer } from 'pilcrow-typeset';

const renderer = new PlaywrightRenderer();
await renderer.open();
try {
  for (const doc of documents) {
    const { html } = await renderer.typeset(doc.html, { dropCap: doc.dropCap });
    writeFile(doc.outPath, splice(doc.outerHTML, html));
  }
} finally {
  await renderer.close();
}
```

The `try/finally` matters: if `typeset()` throws, `close()` still runs. A leaked Chromium hangs the build.

## Options

`TypesetOptions` is a small struct. The empty-string and zero defaults are deliberate: they tell the renderer to read font, width, and line height from the CSS already loaded on your page, so your stylesheet stays the source of truth for measurement.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `fontShorthand` | `string` | `''` | CSS font shorthand (e.g. `"18px ui-serif"`). Empty = read computed value from the page's CSS. |
| `maxWidth` | `number` | `0` | Column width in CSS pixels. Zero = fall back to `clientWidth`. |
| `lineHeight` | `number` | `0` | Line height in CSS pixels. Zero = read from computed style. |
| `postPath` | `string?` | — | Identifier used in build warnings (`"posts/foo"`). |
| `dropCap` | `boolean?` | `true` | Drop cap on the lede paragraph. Pass `false` to opt out. |

## What's exported

- `typeset(html, options?)` — single-shot convenience.
- `PlaywrightRenderer` — the renderer implementation; managed lifecycle.
- `TypesetRenderer` — the interface every renderer satisfies. Today there's one. When pretext ships server-side rendering upstream, the next implementation drops in here.
- `TypesetOptions` — the options struct above.
- `hyphenateHTML(html)` — the Node-side soft-hyphen injector, exposed for callers that want hyphenation without the Chromium pass.

## Build environment requirements

This package runs Playwright Chromium during your build. The build environment must allow installing and launching Chromium. Confirmed working on Vercel, Netlify, Cloudflare Pages, GitHub Actions, and GitLab CI. Locked-down CI environments without sandboxing or with no browser binaries are not supported.

Node ≥18.17.1. Playwright ≥1.40 is a peer dependency.

## Documentation

Full Pilcrow documentation at [pilcrow.page](https://pilcrow.page).

## Credit

[Cheng Lou](https://github.com/chenglou) built pretext. `pilcrow-typeset` is the easy part: drop caps, sidenote spans, hyphenation, taste.

## Licence

MIT.

---

*Built on [pretext](https://github.com/chenglou/pretext) by [@chenglou](https://github.com/chenglou).*
