---
title: "The Cheapest Signal"
description: "AI-generated content is compressing the web toward a visual median. A deliberate column width and a set line are the cheapest, sharpest counter."
pubDate: 2026-05-01
draft: false
tags: ['typography', 'web', 'craft']
---

Open any blog in your browser today. The column stretches to whatever the screen happens to be. The body face is system-ui, or Inter, or a web-safe stack that terminates in sans-serif. The line spacing was left at the browser's default. The lines break wherever the text runs out of room. None of these outcomes were chosen. They were arrived at through neglect — or, increasingly, through a template that ten thousand other sites are also using right now, assembled from the same defaults in the same thirty seconds, producing pages that are indistinguishable not because they are bad but because they were never decided.

This was always true, to some degree. The web has never been a hospitable medium for typography. It was designed for documents, not pages, and it has always favoured the fluid over the composed. A stylesheet can name a typeface and set a size. It cannot choose where a line ends, or hold the column to the 65-character measure that five centuries of print practice established as the range where prose becomes easy to read and hard to put down. Those decisions have always been declined by default. What is different in 2026 is not the negligence. It is the cause.

AI-generated content tends toward a visual median. This is not a flaw in the models: it is a direct expression of how they work. A language model trained on the web reproduces the statistical centre of the web. The statistical centre of the web is Inter at 16px, a line-height of 1.5, a column that runs to the edges of a 1280-pixel container, a palette drawn from a Tailwind preset, and an em-dash appearing in every third sentence because em-dashes signal a kind of breezy authority in the prose the models were trained on, and the models reproduce the signal without the authority.[^1] The result is not ugliness, exactly. A page assembled from these defaults is not offensive. It is merely indistinguishable from every other page assembled from the same defaults this afternoon.

:::sidenote
Beatrice Warde made the case for invisible typography in her 1932 essay "The Crystal Goblet." Typography, she argued, is a vessel: its job is to disappear, carrying the text without announcing itself. She could not have anticipated a condition in which all vessels are identical — at which point the vessel announces itself anyway, through sheer uniformity.
:::

Ten years ago, indistinguishability was the floor: the minimum viable web presence. In 2026 it is becoming the ceiling, because the default is free and the floor keeps rising. If a credible-looking page can be generated in thirty seconds, then a credible-looking page communicates thirty seconds of effort. The reader does not calculate this consciously. But they feel it at the level of surface, before a single sentence has landed. What the surface communicates is that the words were produced and not placed.

Against this, the signal that matters is not beauty. Beauty is downstream of taste, and taste is hard to fake but also hard to read at a glance. The signal that is immediately legible — that survives even a two-second encounter — is care. And the cheapest, most legible evidence of care in written work is the way the type is set.

:::pullquote
The signal is unfakeable not because it is difficult but because it requires decisions, and decisions require a person.
:::

A reader may not know what a 65-character measure is, or why a page set in Fraunces at 19 pixels reads differently from the same text in Inter at 16, or what it means that the line breaks were computed before the page loaded rather than delegated to the browser at render time. None of that knowledge is required. What they notice — what they register within a few seconds of landing on the page — is that this text was arranged for them. That the column was held at a deliberate width. That the face was chosen for this size and this purpose. That the lines end where they should rather than where they happened to. The page communicates, at the level of surface before content: a person made these decisions. That noticing is the signal.

It is not decorative. A drop cap and a pull quote and a warm accent colour can be decorative. Setting the measure at 65 characters is not decorative: it is a decision taken in the reader's interest, because decades of reading research and five centuries of print practice agree on where prose becomes readable and where it becomes a strain.[^2] It is the kind of decision the typographic tradition has been accumulating since Aldus Manutius cut his first roman types in Venice at the close of the fifteenth century — quiet calls, made over generations, refined against the evidence of how human beings actually read. The web, remarkably, is the first medium that found it difficult to apply any of them.

Print survived the introduction of movable type without losing the decision point: someone still had to compose the forme. It survived the typewriter, which handed every typist Courier and nothing else, and still managed to carry Tschichold's arguments about proportion from one generation to the next. It survived the laser printer, which gave every office a copy of Times New Roman and Helvetica — serious typefaces, both of them, however mistreated. It survived desktop publishing, which briefly introduced Caslon and Garamond alongside Comic Sans, and eventually sorted itself. In each case, a person still had to decide. A decision point existed. The web, by making its defaults close enough to adequate, removed that point almost entirely: there was no embarrassment of badness to force a reconsideration, and so the reconsideration never came.

:::sidenote
Jan Tschichold spent his career arguing for the classical proportions of the printed page. In *The Form of the Book* (1975) he wrote that "the laws of typography have evolved from centuries of practice, and are as valid today as when Gutenberg set his first type." He was describing print. The observation has not become less true.
:::

What is new is not the problem. What is new is the contrast. When every automatically generated page looks the same, the page that was set stands out — not by shouting, but by being quiet in a different register. The reader may not be able to name what is different. They will feel it. The column holds. The lines end where they should. The typeface earns its place at this scale. The page belongs to its writer the way a printed book belongs to its printer: not through ornament, but through the evidence of particular choices, made deliberately, for the reader's sake.

You can generate an em-dash at scale. You can instantiate a template in thirty seconds. What you cannot generate is the accumulation of care that shows in a typeset page, because that accumulation is the evidence of someone having thought, paragraph by paragraph, about whether this is right. The template cannot do that. The thirty-second page cannot do that. Thinking takes time, and time spent is exactly what the reader reads in the surface of the page.

This essay was set with a static site generator I built for this purpose — one that computes line breaks at build time and locks them before the page reaches the reader. ¶

The question worth asking is not how to make your writing look better. It is whether you want your writing to visibly belong to you. A well-set page is the evidence of a person having thought about a reader. That thinking accumulates in the leading and the measure, in the typeface chosen and held, in the column that does not drift with the viewport. It is quiet. It persists. And in a year when every other page was assembled from defaults, that evidence — for the reader who arrives and pauses and stays — is enough.

[^1]: The em-dash observation is testable: a corpus comparison of AI-generated blog prose against human-written magazine prose will show a consistently higher ratio of em-dashes to total punctuation in the AI output. The models reproduce the surface feature of authoritative prose without the underlying reasoning that earns it.

[^2]: Robert Bringhurst places the readable range at 45–75 characters per line, with 66 as the ideal, in *The Elements of Typographic Style* §2.1.2. Studies in digital reading (Dyson, 2004; Ling & van Schaik, 2006) support moderate line lengths for both reading speed and comprehension. Pilcrow's default of 65ch sits at the centre of that range.
