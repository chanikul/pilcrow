---
title: Shape-Around Test
description: Testing the shape-around primitive — glyph and image silhouette wrapping.
pubDate: 2026-05-09
draft: true
dropCap: false
---

This post verifies the two shape-around variants. Both use the same underlying mechanism: a per-row max-x function feeds pretext's variable-width line walker so prose flows around the right contour of the obstacle.

## Test case 1: Glyph silhouette

The paragraph below wraps around a large lowercase *a* rendered from Fraunces. Lines whose vertical position falls within the glyph's bounding box are narrowed by the silhouette's rightmost pixel at that row. Below the glyph, prose returns to the full 65ch measure.

:::shape-around-glyph{glyph="a" font="Fraunces" size="480px" padding="1rem"}
Typography begins with the letter. Not the word, not the sentence — the single glyph, drawn from ink and intention, that starts the chain of meaning. Every typeface is an argument about what a letter should feel like: how the bowl curves, where the stress falls, whether the serif tapers or bites. Fraunces makes one argument with particular conviction. Its optical-size axis trades the crisper construction of a display face for warmth at reading sizes, and its lowercase a is a fine demonstration of that warmth: an enclosed counter that breathes, a slightly forward stress that moves the eye along. When prose wraps around such a letter, the reader notices the shape before understanding why. That is the geometry of type speaking before language does.
:::

The paragraph above should resume its full measure here, without any narrowing. The drop cap is suppressed for this test post so the lede cap does not interfere with the shape-around measurements.

## Test case 2: Image silhouette

The paragraph below wraps around a circular photograph silhouette (the placeholder is a brown circle with an alpha channel — replace with a real portrait to see the full effect). The same variable-width mechanism applies; only the silhouette extraction path differs.

:::shape-around-image{src="./images/test-silhouette.png" size="480px" padding="1rem"}
The photograph is the oldest counterargument to the typeset column. Text has been flowing around images since illustrated manuscripts; the medieval scribe left a gutter of vellum beside the miniature and let the copy fill it. What changed with digital layout is the precision: where the scribe estimated, the software samples. Every row of the image yields a rightmost pixel, a horizontal limit that the line of text must respect. The prose wraps not around a rectangle but around the actual silhouette of the subject — a shoulder, a curve, a hand held just so. The negative space is no longer coincidental; it is the shape of the content itself, made legible by typography that follows it.
:::

Below this point, prose returns to full measure and all existing primitives should continue to work.

## Existing primitives (regression check)

This section verifies that drop cap, hyphenation, emphasis, strong, code, and inline links all render correctly alongside the shape-around primitive.

*Emphasis* and **strong weight** should be typeset via the rich-inline path. Inline `code` spans use the monospace stack. [Anchor links](https://pilcrow.page/) wrap across line breaks without losing the href.

The word "anthropomorphically" exercises the hyphenation pipeline. The word "characteristically" does the same, as does "phenomenological" — all long enough to trigger Hyphenopoly's soft-hyphen insertion and pretext's break logic at narrow measures.
