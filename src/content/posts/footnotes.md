---
title: "Footnote Variants"
description: "A test post exercising all footnote primitive variants: single, multiple, inside pull quote, drop cap interaction, and long multi-line."
pubDate: 2026-04-29
draft: true
tags: ["typography", "pilcrow", "test", "footnotes"]
dropCap: true
---

Typography is a technology of reading.[^1] Every decision about a typeface, a measure, or a line-height is ultimately a decision about how much friction the reader should encounter on the way to the meaning — and the answer, in editorial practice, is always *less*.

The paragraph mark has a longer history than the paragraph itself.[^2] In manuscript culture, text ran continuously; the mark was an editorial insertion made in the margin after the scribe had finished, indicating a new thought or topic.[^3] The visual form — a reversed P with a doubled stem — likely derives from the Latin *capitulum*, meaning chapter.

:::pullquote
The line between craft and invisibility is not a destination.[^4] It is the work itself, reconstituted sentence by sentence.

— Eleanor Marsh
:::

What makes Pilcrow's typesetting approach distinctive is not the drop cap, nor the hyphenation, nor the orphan guard — it is that the page the reader receives has already been reasoned about, at build time, by a system that understands line geometry.[^5] The browser has nothing left to decide. This is a claim most static site generators cannot make.

Considered editorial typography asks that the eye travel from sentence to sentence without impediment — which is why the *best* typesetting is the kind **readers never remark upon**. A measure that is too wide forces the eye to traverse too much horizontal distance between saccades. A measure too narrow fractures the rhythm of the sentence itself. The classical range of forty-five to seventy-five characters per line was not arrived at arbitrarily; it corresponds to the distance the eye can comfortably travel at reading distance before needing to return to the left margin.[^6]

[^1]: The claim is not metaphorical. Typography is a set of techniques — spacing, measure, weight, rhythm — that have been refined over five centuries of print to optimise the transfer of meaning from page to mind. The optimisation is real and measurable; it is also, at its finest, invisible.

[^2]: The pilcrow (¶) predates the blank-line paragraph break that most digital text now uses. For much of manuscript history, text ran continuously without visual breaks; the mark was a rubricator's editorial insertion after the fact, made in a different ink.

[^3]: The rubricator was a specialist in the medieval scriptorium — the person responsible for red-ink marks, including paragraph marks, chapter headings, and decorated initials. The scribe wrote the body text; the rubricator completed the page's visual hierarchy afterwards. This division of labour between composition and editorial marking maps surprisingly cleanly onto Pilcrow's own architecture: remark and rehype handle composition; the typeset integration handles editorial structure.

[^4]: The footnote marker inside a pull quote exercises the rich-inline pipeline: the marker is a `<sup><a>` pair inside the pull quote's `<p>`, which the pretext rich-inline path must carry through the typeset loop without losing the link target or the sup wrapper. The pull quote is also gated from the drop-cap lede path (`!p.closest('aside')`), and the footnote section is similarly gated (`!p.closest('.footnotes')`).

[^5]: The phrase "at build time, by a system that understands line geometry" is precise: Pilcrow does not use `text-overflow`, `overflow-wrap`, or any browser-controlled line-breaking algorithm for the typeset output. Pretext computes break points independently of browser rendering via a Canvas 2D measurement context. The resulting `<span class="pt-line">` spans are display-block elements with no width constraint — the browser cannot re-wrap them.

[^6]: This is the longest footnote in the test post, included specifically to exercise the pretext typesetting of footnote-list paragraphs at their narrower rendered geometry (0.875em font-size, 1.5 line-height). A paragraph of this length should produce multiple lines when typeset at the column measure, and each line should be a `<span class="pt-line">`. The orphan guard should also apply here — if any hyphenated word in this footnote produces a short right fragment, the guard will strip the offending soft hyphen and re-run the layout. This sentence mentions extraordinarily long words like *characteristically* and *unconstitutionally* to give Hyphenopoly material to work with. The syllabification should break across lines cleanly here; any packed-grapheme orphan from pretext's soft-hyphen handling will be caught and corrected.
