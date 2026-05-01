---
title: "Sidenote Variants"
description: "A test post exercising all sidenote primitive variants: single, multiple, rich-inline, long, pull-quote interaction, drop-cap interaction, and footnote coexistence."
pubDate: 2026-04-30
draft: true
tags: ["typography", "pilcrow", "test", "sidenotes"]
dropCap: true
---

<!-- Variant 1: single sidenote in body prose -->
Typography is a technology of reading — every decision about a typeface, a measure, or a line-height is ultimately a decision about how much friction the reader encounters on the way to meaning.

:::sidenote
Robert Bringhurst defines typography as "the craft of endowing human language with a durable visual form." The Tufte sidenote places this commentary in the margin rather than interrupting the reading rhythm with a footnote.
:::

<!-- Variant 2: multiple sidenotes in one paragraph -->
The paragraph mark has a longer history than the paragraph itself.

:::sidenote
The pilcrow (¶) predates the blank-line paragraph break that most digital text now uses.
:::

:::sidenote
In manuscript culture, the rubricator inserted the mark after the scribe had finished, often in a different ink — red or blue.
:::

<!-- Variant 3: sidenote with rich-inline markup inside (em/strong/a/code) -->
Considered editorial typography asks that the eye travel from sentence to sentence without impediment.

:::sidenote
Matthew Butterick's *Practical Typography* argues that the *best* typesetting is **invisible** — the reader notices the ideas, not the [medium](https://practicaltypography.com). The `<em>` and `<strong>` elements exist to serve emphasis, not to perform it.
:::

<!-- Variant 4: long sidenote that wraps to multiple lines in margin -->
What makes Pilcrow distinctive is not the drop cap, nor the hyphenation, nor the orphan guard — it is that the page the reader receives has already been reasoned about at build time by a system that understands line geometry.

:::sidenote
This is intentionally a long sidenote to exercise multi-line wrapping in the 25ch margin column. Pilcrow uses pretext's rich-inline pipeline to typeset this text at the correct geometry — 0.85em font-size on a 25ch column — producing characteristically tighter line breaks than the body prose. The word "characteristically" is included to give Hyphenopoly material to hyphenate at the right syllable boundary.
:::

<!-- Variant 5: sidenote near a pull quote (should emit [pilcrow] build warning) -->
The classical range of forty-five to seventy-five characters per line was not arrived at arbitrarily.

:::pullquote
There is no neutral typography. Every choice is an argument about what the reader deserves.
:::

A measure that is too wide forces the eye to traverse too much horizontal distance between saccades. A measure too narrow fractures the rhythm of the sentence itself.

:::sidenote
The 45–75 char range corresponds to the distance the eye can comfortably travel at reading distance before needing to return to the left margin — a physiological constraint, not an aesthetic preference.
:::

<!-- Variant 6: sidenote at the very start of a paragraph (drop cap interaction) -->
<!-- The drop cap should fire on the body's first word letter, not on the marker. -->
<!-- Note: the drop cap lede is the FIRST paragraph above; this is a later one. -->
The opening paragraph of any piece of writing bears the full weight of the reader's first impression.

:::sidenote
A drop cap signals that this is the beginning — the transition from outside the text to inside it. It is a hospitality gesture, typographically speaking.
:::

<!-- Variant 7: sidenote on a paragraph that's also footnoted -->
<!-- Sidenote and footnote coexistence — markers must be visually distinguishable. -->
The footnote and the sidenote serve different editorial purposes.[^1] The footnote defers the reader to the bottom of the page; the sidenote keeps the commentary visible at the moment of reading.

:::sidenote
Sidenote markers use CSS counter "sidenote" (auto-incrementing, shown as superscript). Footnote markers use GFM's own numbering. The two counters are independent — they cannot share a value or collide.
:::

[^1]: The decision to use a footnote here rather than a sidenote is intentional: long discursive footnotes work best at the bottom of the page, where the reader can return easily. Short clarifications work best as sidenotes, where they stay visible at the moment of reading.
