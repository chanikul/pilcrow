---
title: Hello, Pilcrow
layout: post.njk
---

The library is the load-bearing wall, and the editorial layer is the visible building. This fixture exists to prove that a fresh Eleventy site, given the right plugin and a simple post-body wrapper, ends up serving HTML with per-line span wrappers around every paragraph. No runtime JavaScript; the work happens once at build time and is then static.

What you should see in the output: every paragraph in this file replaced by a sequence of `pt-line` spans. Hyphenation soft-hyphens injected upstream by the engine, then potentially consumed back out wherever the line break landed naturally. The first paragraph will also gain a drop cap unless the meta tag opts out.

If the output instead contains the original paragraph tags untouched, the plugin did not run, the renderer did not find the wrapper, or the build failed silently. The fixture README documents how to verify each of those.
