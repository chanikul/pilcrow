---
title: "No Drop Cap Test"
description: "A test post verifying that dropCap: false in front-matter suppresses the drop cap and lede class."
pubDate: 2026-04-29
draft: true
tags: ["typography", "pilcrow", "test"]
dropCap: false
---

This paragraph has no drop cap. The opt-out front-matter field `dropCap: false` should prevent the `.drop-cap` span and `.lede` class from appearing on this paragraph. No capital letter should be floated to the left.

A second paragraph follows to confirm normal layout continues correctly after the opt-out lede. The line breaks here should be pretext-computed at the full column width with no float narrowing.
