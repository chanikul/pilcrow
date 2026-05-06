# pilcrow-eleventy fixture

A minimal Eleventy 3.x project that wires the plugin and runs it against a
single Markdown post. Used as the manual smoke test for the adapter.

## Run it

The plugin must be built first; the fixture imports the compiled `dist/`
output rather than the TypeScript sources.

```sh
# from packages/pilcrow-eleventy
bun install
bunx tsc -p tsconfig.json

# from packages/pilcrow-eleventy/test/fixture
npx @11ty/eleventy
```

Output lands in `_site/hello/index.html`.

## What to look for

The post body should contain `<span class="pt-line">` wrappers around the
content of every `<p>`, the lede paragraph should carry a `drop-cap` span,
and Hyphenopoly should announce itself on stderr at build start
(`[pilcrow] hyphenopoly en-gb ready in Nms`).

If the output still has bare `<p>` tags around the original paragraph text,
either the plugin never registered, the renderer could not reach Chromium,
or the layout is missing the `<div class="post-body">` wrapper that the
plugin keys on.

## What it deliberately does not test

This fixture is a sanity check for the Eleventy lifecycle wiring and the
per-paragraph splice. It does not exercise pull quotes, sidenotes,
footnotes, drop-cap opt-out, or hyphenation orphans — those live in the
typeset engine's own test corpus on pilcrow.page.
