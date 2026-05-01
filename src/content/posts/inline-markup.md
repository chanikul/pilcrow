---
title: "Rich Inline Markup Test"
description: "A test post exercising em, strong, a, code, sub, sup, and nested inline markup through the rich-inline pretext path."
pubDate: 2026-04-29
draft: true
tags: ["typography", "pilcrow", "test"]
---

There is something quietly remarkable about a sentence that carries emphasis for half its length: a *quick brown fox jumps over a sleeping editor* who never noticed the italics were there.

She insisted *firmly* and **without flinching** that the line break should land exactly where the prose demanded it, not where the browser felt like stopping.

The most useful pair of functions in the entire library is <a href="https://example.com/typeset-api">prepareRichInline and walkRichInlineLineRanges and materializeRichInlineLineRange</a> and together they handled every inline element.

Inline code like <code>prepareRichInline(items)</code> requires a monospace font shorthand so the canvas measurement reflects the actual rendered width of the code span.

Water is written H<sub>2</sub>O in chemistry; footnote markers look like this<sup>1</sup> in traditional editorial typography.

The most emphatic phrase in the document was <em><strong>bold italic text spanning enough words to cross a line boundary</strong></em> and the reader barely noticed the seam.

This paragraph contains a hard break<br>and is deliberately designed to trigger the rich-inline fallback path, exercising the per-paragraph flat-pretext warning. The remaining text here is long enough to produce at least one line wrap so the fallback output is clearly not empty.
