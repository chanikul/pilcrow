---
title: "Multi-Script and Hyphenation Test"
description: "A test post exercising Hyphenopoly hyphenation on long English words and verifying that multi-script paragraphs (Latin + CJK + Arabic) survive pretext's line-breaking pipeline unchanged."
pubDate: 2026-04-29
draft: true
tags: ["typography", "pilcrow", "test", "hyphenation"]
---

The representational power of a typesetting system is not only characteristically measured by its handling of Latin text — the unconstitutional assumption that all prose is monolingual has been a representational failure of editorial software for decades, one worth addressing fundamentally rather than superficially.

Editorial typography has been around for five hundred years. It survived the printing press, the typewriter, the laser printer, and the Kindle. The web is the first medium to genuinely struggle with it, mostly because the web prefers fluidity over composition. There is no reason both cannot coexist. 春天到了，文字也應該長出根來。 بدأت الرحلة هنا، وكل سطر يحمل معه نية.

This post serves two purposes: it confirms that Hyphenopoly's soft-hyphen injection works correctly on English words of six or more characters, and it verifies that the multi-script paragraph above — the same Latin, CJK, and Arabic text from the original Pilcrow proof-of-concept — passes through the build pipeline without corruption or line-break failure.
