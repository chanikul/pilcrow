---
title: "The Paragraph Mark"
description: "On the pilcrow, the oldest editorial glyph still in use, and what it means to set type with care."
pubDate: 2026-01-01
draft: false
tags: ["typography", "example"]
hasImages: true
---

The pilcrow — ¶ — is the oldest editorial mark still in common use. Scribes employed it in medieval manuscripts to signal the start of a new thought, long before the blank line became the paragraph separator we reach for without thinking. It marks a pause, a breath, a turn.

This post is a placeholder. When you're ready, replace it — start with a sentence that couldn't belong anywhere else.

:::sidenote
The pilcrow derives from the Latin *paragraphus*, a stroke drawn beside text to note a division. Chaucer's scribes used it in manuscript copies of *The Canterbury Tales*.
:::

## What Pilcrow does

At build time, Pilcrow measures each paragraph at its actual rendered column width and computes where lines should break — using [pretext](https://github.com/chenglou/pretext) as the line-breaking primitive. What the reader receives is already typeset. The browser has nothing left to decide.

:::pullquote
The web is the first medium to genuinely struggle with typesetting — because it prefers fluidity over composition.
— Pilcrow ¶
:::

This is different from ordinary CSS. A stylesheet can set a font, a measure, a line-height — but it cannot choose *where* a line ends. That decision has always been left to the browser's reflow engine, which knows nothing about editorial convention.[^1]

:::sidenote
Knuth and Plass described optimal line-breaking in 1981. The algorithm is still the gold standard for print. Pretext brings a practical variant of it to the web.
:::

## A figure with a caption

The image below was included to show Pilcrow's image pipeline: Sharp-generated AVIF and WebP variants, a thumbhash placeholder decoded at build time, and a blur-up reveal on load.

![A snow-capped mountain peak rising above a valley at dawn](./images/pexels-pixabay-417173.jpg)

Replace this image with your own. The alt text becomes the caption. An empty alt attribute (`![](./image.jpg)`) marks the image as decorative and omits the caption.

## Authoring notes

Pilcrow's editorial primitives are written in plain Markdown:

- **Drop cap** — automatic on the first paragraph of every post. Opt out with `dropCap: false` in front-matter.
- **Pull quotes** — `:::pullquote … :::` container directive.
- **Sidenotes** — `:::sidenote … :::` container directive.
- **Footnotes** — GFM syntax: `[^1]` inline marker, `[^1]: text` definition.[^2]
- **Images** — standard Markdown `![alt](./images/photo.jpg)`.

[^1]: The browser's reflow engine is not unintelligent — it handles bidirectional text, line wrapping, and hyphenation (via `hyphens: auto`) reasonably well. But it has no notion of the paragraph as a unit, or of the relationship between line length and reading rhythm. Pilcrow does.

[^2]: This is a footnote. Footnotes use GFM syntax and render as a numbered list at the end of the post, with a ¶ section break above them.
