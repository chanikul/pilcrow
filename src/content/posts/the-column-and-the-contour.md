---
title: The column and the contour
description: "Two examples of the typeset column setting around its obstacles: a letterform, then a photograph."
pubDate: 2026-05-10
dropCap: false
---

For most of the history of the printed page, type has set around obstacles. The illuminated initial — the giant 'C' that opened a chapter, painted in lapis or burnished in gold — required the compositor to think about more than where the line broke. He thought about which line broke where. He thought about how the column narrowed for the first three rows and widened again for the fourth. He thought about how the descender of the letter on the right caught the rising counter on the left. The page was a layout problem. The wrap was the answer.

The web has never had quite this. CSS shape-outside ships in browsers, but it shapes the wrap without telling the line-breaker what shape to wrap to. The two systems sit beside each other and disagree. The result, when you see it on a webpage, is text wrapped to a rectangle that pretends to be a curve, or a curve that the lines do not quite follow.

What follows on this page is what happens when both systems get the same data.

The example below sets prose around a large lowercase letter. The silhouette is extracted from the font file at build time. The per-row width of that silhouette is fed both to chenglou's pretext line-breaker and to the CSS shape-outside. They agree on the contour, row by row.

:::shape-around-glyph{glyph="g" font="Fraunces" size="480px" padding="1rem"}
Typography begins with the letter. Not the word, not the sentence — the single glyph, drawn from ink and intention, that starts the chain of meaning. Every typeface is an argument about what a letter should feel like: how the bowl curves, where the stress falls, whether the serif tapers or bites. Fraunces makes one argument with particular conviction. Its optical-size axis trades the crisper construction of a display face for warmth at reading sizes, and its double-storey lowercase g is a fine demonstration of that warmth: two enclosed counters connected by a slender link, a small ear lifting off the right, a descender that turns the eye downward without abandoning the line. When prose wraps around such a letter, the reader notices the shape before understanding why. That is the geometry of type speaking before language does.
:::

The other obstacle the column has always set around is the picture. Magazine spreads worked this way for most of the twentieth century: a portrait floated in the column, the text wrapping its shoulder, the negative space holding the reader's eye on the figure rather than against the rectangle of the image. The web inherited the column and the picture but lost the wrap.

The example below uses a photograph silhouette. The image's alpha channel describes the contour. The build extracts a per-row width array. Pretext and shape-outside again receive the same data.

:::shape-around-image{src="./images/editorial-portrait.png" size="500px" padding="1rem"}
The photograph is the oldest counterargument to the typeset column. Text has been flowing around images since illustrated manuscripts; the medieval scribe left a gutter of vellum beside the miniature and let the copy fill it. What changed with digital layout is the precision: where the scribe estimated, the software samples. Every row of the image yields a rightmost pixel, a horizontal limit that the line of text must respect. The prose wraps not around a rectangle but around the actual silhouette of the subject — a shoulder, a curve, a hand held just so. The negative space is no longer coincidental; it is the shape of the content itself, made legible by typography that follows it.
:::

Both examples come from the same engine. The line-breaker that sets these paragraphs around their silhouettes is the same one that hyphenates "anthropomorphically" cleanly. It holds *emphasis* and **strong weight** in the rich-inline path. It wraps an [anchor link](https://pilcrow.page/) across a break without losing the href. There is no special path for the special features.

Print figured this out long before the web took an interest. What changes is whose job the wrap is. In the metal-type era it was the compositor's. In the digital print era it was the layout artist's. On the web, until recently, it was nobody's. Build-time changes that — the page receives a static file in which every line already knows where it ends.
