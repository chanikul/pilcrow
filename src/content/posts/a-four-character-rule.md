---
title: "A Four-Character Rule"
description: "On the orphan guard: how a syllable-aware hyphenator and a grapheme-aware line-breaker produce bad breaks, and why four characters is the right threshold for fixing them."
pubDate: 2026-05-08
draft: false
tags: ['typography', 'engineering']
---

Hyphenation on the web is usually off. Browsers that support `hyphens: auto` hand the decision to the operating system, which hands it to a dictionary that may or may not have been trained on the language you are writing in. The result is inconsistent enough that most designers disable it entirely and live with ragged-right prose that occasionally produces a very short first line.

Pilcrow does not disable it. Pilcrow uses Hyphenopoly — a TeX-trained hyphenation library — to insert soft hyphens at syllable boundaries before the typesetting pass runs. The soft hyphen is a hint: a U+00AD character that says *here is a legal break point*. Hyphenopoly knows English syllable structure; it respects `rightmin: 3`, which means no post-hyphen fragment shorter than three characters will be suggested. That part works correctly.

The problem is that the thing reading those hints — pretext, the line-breaking primitive at Pilcrow's core — is grapheme-aware, not syllable-aware. pretext walks the line counting visible characters and stops when the next character would exceed the measure. When it encounters a soft hyphen that fits the current line, it takes the break. But it also packs as many graphemes from the post-hyphen segment onto that line as will still fit. The post-hyphen segment `ics` in *italics*, for instance, might yield `ital-i` on one line and `cs` on the next: a two-character fragment that Hyphenopoly would never have permitted but that pretext produces anyway, because it has no visibility into what the hyphenation library intended.

Two characters on a line are not a break. They are a typographic accident. The eye reads them as a misprint and stalls.

The orphan guard catches this. After pretext computes a paragraph's lines, the guard inspects every line-end that carries a visible hyphen. If the fragment that follows on the next line is fewer than four characters, the guard strips the soft hyphen that caused the break and re-runs pretext from the paragraph start. Four characters is the threshold. Below four, the fragment reads as error. At four and above, the eye accepts the break as intentional — the line held its shape.

Why four specifically? Three is Hyphenopoly's own `rightmin`: the minimum it would accept at the soft-hyphen position, before pretext's grapheme-packing shortens it further. Four gives one character of margin beyond that, which in practice catches the cases the eye actually objects to. The guard has been running across Pilcrow's example posts for nine days without a false positive.

The guard is a local mitigation. pretext is the engine; Pilcrow is the editorial layer above it; the gap between syllable-aware insertion and grapheme-aware breaking is a pretext-level behaviour, not something a wrapper can fully address. The right fix was always upstream. I filed it as pretext issue #162, with a minimal repro and the `ital-i|cs` case spelled out exactly. Cheng Lou, pretext's author, shipped commit `f06fef0` on 2026-05-08. The fix changes pretext's default behaviour: soft-hyphen breaks now stay at the insertion point, and the post-hyphen segment carries whole to the next line. Hyphenopoly's `rightmin` is honoured end-to-end.

Once that commit reaches an npm release of `@chenglou/pretext`, the orphan guard comes out. Nine days of earned keep, then a clean removal.

There is something worth noting about how this kind of bug gets fixed. The orphan guard exists because someone cared enough about `ital-i|cs` to find it objectionable rather than acceptable. The upstream fix exists because Cheng Lou received a report with a clear repro and fixed it at the root, rather than suggesting a workaround.
