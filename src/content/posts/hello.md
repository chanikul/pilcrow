---
title: "On Setting Type for the Web"
description: "A short note on why line breaking matters and what Pilcrow does about it."
pubDate: 2026-04-29
draft: true
tags: ["typography", "pilcrow"]
---

The web has always been an uncomfortable place for text. Browsers reflow prose to fill whatever container the viewport offers, and the result is line breaks that nobody chose — they just happened. For a medium that has carried nearly every significant piece of writing since 2000, this seems like a strange oversight.

Pilcrow does something different. At build time, it measures each paragraph at its actual rendered width, computes where the lines should break using pretext's line-breaking primitive, and bakes those breaks into the HTML output as individual spans. What the reader receives is already typeset. The browser has nothing left to decide.

This is a scaffold post. Replace it when you have something worth saying.
