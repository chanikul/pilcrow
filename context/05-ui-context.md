# UI Context — Pilcrow

> Editorial typography rules, design tokens, layout primitives. The Designer agent's source of truth. Read before any change to typesetting output, OG cards, or `public/styles/global.css`.

## Aesthetic

**Editorial. Restrained. Magazine-typeset, not web-styled.**

The product is set type. Every visual decision is in service of legibility and the editorial register. No gradients. No oversized hero sections. No shadows on dark surfaces. The brand mark is the text, not the colour.

Reference: Tufte CSS for sidenote primitives; gwern.net for footnote register; The New Yorker for restraint; Fraunces specimens for type colour.

## Theme

- **Mode:** Light only. Paper-like.
- No dark mode in v1 (would require re-tuning Fraunces axes for inverted contrast; deferred).

## Color tokens

Defined in `public/styles/global.css` `:root`. **The only colours in the system.** Never inline a hex literal in component CSS.

```css
:root {
  --paper:  #fafaf7;  /* page background */
  --ink:    #1a1a1a;  /* body text, headings */
  --muted:  #6c6a63;  /* metadata, time, sidenote text, footnote markers */
  --rule:   #d4d0c4;  /* dividers, borders */
  --accent: #b13a2e;  /* link colour (cascades to footnote markers) */
}
```

These five tokens cover the entire surface area. Adding a sixth token requires editorial justification (and a master plan amendment).

## Typography

- **Body + h1:** Fraunces 700, opsz 144, letter-spacing -0.015em
- **`<time>` only:** Inter (everything else is Fraunces)
- **Body size:** browser default (16px), measured at 65ch
- **Footnotes:** 0.875em / line-height 1.5
- **Pull quotes:** 1.5× body, Fraunces italic 400, line-height 1.4, 50ch measure
- **Sidenote captions:** small-caps for cite, 0.85×, MUTED

### Playground typographic universe

The playground at `/playground/` ships a curated six-font shortlist that
defines the universe of body-type options Pilcrow officially supports as
"editorial-appropriate." Adding a font here is a taste call — surface to
the human, don't decide.

| Family          | Voice                              | Drop-cap weight | Source repo |
|-----------------|------------------------------------|-----------------|-------------|
| Fraunces        | display-as-body                    | 600             | self-hosted (canonical site face) |
| Newsreader      | body-tuned-modern                  | 500             | productiontype/Newsreader (16pt opsz) |
| Source Serif 4  | transitional                       | 600             | adobe-fonts/source-serif (no Medium 500 in static release) |
| EB Garamond     | old-style                          | 500             | octaviopardo/EBGaramond12 (NOT google/fonts — variable only there) |
| Inter           | neutral-sans                       | 500             | rsms/inter v4.1 release zip (extras/ttf/) |
| Spectral        | contemporary-with-character        | 500             | google/fonts |

Constraints: open-licensed, ships static instances (variable TTFs forbidden
after the Linux Playwright Chromium 147 silent-fail — see learnings
2026-05-06), real italics, ships either weight 500 or 600 (drop-cap requires
one of those). All six self-hosted under `public/fonts/`.

## Measure

- **Prose:** `--prose-measure: 65ch`. The single source of truth — referenced from `playwright.ts`'s `readMeasurementCSS()` (hard error if absent).
- **Pull quote:** 50ch (narrower than prose, sits inside the column)
- **Sidenote:** 25ch in the right margin column
- **Post wrapper:** `max-width: 65ch` by default, expands to `calc(65ch + 2rem + 25ch)` on `@media (min-width: 1100px)` to fit the sidenote column

## Layout primitives

### Prose body
4-column CSS Grid on `.post-body`:
```
0  |  65ch  |  2rem (gap)  |  25ch
```
Direct children of the grid container can use `grid-column`. The sidenote `<aside>` MUST be a direct child (the rehype hoist plugin moves it out of its emitting `<span>` for exactly this reason).

### Drop cap
- `<span class="drop-cap">` injected into the lede paragraph by the typeset integration.
- Float-aware line widths via `layoutNextLineRange` (flat path) and `layoutNextRichInlineLineRange` (rich-inline path).
- Changing cap CSS (font-size, padding, margin) requires `bun run build` to re-measure the float box.

### Sidenotes
- Container directive: `:::sidenote ... :::`
- Desktop: `grid-column: 4`, top edge aligned with bottom of anchor `<p>` (Tufte-CSS-level alignment for v1; gwern-level line-anchoring deferred to v1.x — see NOTES.md)
- Mobile (≤1099px): `display: block` fallback, sidenote drops below the anchor paragraph
- Marker: `<sup class="sidenote-marker" data-sidenote-id="N">` — colour inherits from `a { color: var(--accent) }`

### Footnotes
- Standard GFM `[^N]` / `[^label]:` syntax
- HTML output is GFM canonical (`<sup><a data-footnote-ref>`, `<section data-footnotes>`)
- Section break above the footnotes list: `<div class="footnotes-mark" aria-hidden="true">¶</div>` (real DOM, not pseudo-element — a11y rule)
- Markers inherit accent colour from the cascade

### Pull quotes
- Single-token `:::pullquote ... :::`
- Attribution: a paragraph starting with `— Name` — em-dash + space stripped; content moved to `<footer><cite>Name</cite></footer>`
- `cite::before { content: "— "; }` auto-inserts the em-dash so source text doesn't repeat it
- Single-paragraph body for v1; extras dropped with build warning

### Pilcrow footer link
- Centred colophon, Inter 0.85em, MUTED
- 4rem top margin, 2rem bottom margin
- Same-tab navigation (no `target="_blank"` — editorial register)
- Link colour overrides accent → MUTED (understated; brand mark is the text)
- Toggleable via `siteConfig.showPilcrowFooter`; default `true` (growth loop)

### Images
- Markdown: `![alt](./images/photo.jpg)`
- Output: `<figure class="pilcrow-figure"><picture><source avif><source webp><img></picture>[<figcaption>]</figure>`
- Aspect ratio set inline on `<figure>` to prevent CLS
- Blur-up via thumbhash `data-placeholder` attribute (decoded to PNG data URL at build time, not in the browser)

## OG cards

- **Dimensions:** 1200×630
- **Layout:** title-dominant minimalist
  - Large Fraunces title, left-set
  - Muted ¶ glyph, bottom-right corner, 0.45× title size
- **Palette:** PAPER background, INK title, MUTED glyph (NOT accent — identity, not emphasis)
- **No** pubdate, description, byline, or chrome on post cards
- **Index card:** uses RSS channel description as title text
- **Font:** Static Fraunces144pt-Bold.ttf (variable TTF breaks Satori — see `03-code-standards.md`)

## Border radius

- Pilcrow uses essentially no rounding. Set type doesn't have rounded corners.
- Exception: `<figcaption>` and `<aside>` use no border — `--rule` is reserved for explicit dividers.

## Motion

- No motion in v1. Reader receives static HTML.
- Image blur-up uses CSS opacity transition (~150ms ease-out) on `<img>` `loaded` class. That's the only animation in the rendered page.

## A11y

- All decorative Unicode glyphs (`¶`, etc.) live in real DOM elements with `aria-hidden="true"`. **Never** in `::before { content: ... }` — read aloud by NVDA, JAWS, VoiceOver.
- Image `alt` policy: warn-not-fail; missing alt → `alt=""` (WCAG correct for decorative).
- Footnotes use semantic `<section data-footnotes>` and `<ol>`.
- Pull quotes use semantic `<aside>` with `<footer><cite>`.

## Avoid

- Adding a sixth colour token without editorial justification
- Inline hex literals in component CSS (use the tokens)
- Decorative Unicode in `::before` (a11y)
- Variable Fraunces in OG cards (Satori limitation)
- Sans-serif anywhere except `<time>` (the rule)
- Drop shadows on PAPER (would muddy the editorial register)
- Per-page custom typography (the engine sets the type; the post is the variable)
