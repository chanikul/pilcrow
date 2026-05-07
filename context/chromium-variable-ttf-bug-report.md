<!-- DRAFT — file at https://issues.chromium.org/ (Component: Blink>Fonts) or https://github.com/microsoft/playwright/issues -->
<!-- Title: [Headless Linux Chromium 147]: Variable TTF @font-face silently fails to render despite FontFace.status='loaded' -->

# [Headless Linux Chromium 147]: Variable TTF @font-face silently fails to render despite FontFace.status='loaded'

## Summary

In headless Chromium 147 on Linux x64 (Playwright 1.59.1, Chrome for Testing build 1217), a self-hosted variable-axis TTF declared via `@font-face` registers as `FontFace.status === 'loaded'` and fetches the bytes correctly, but text rendered with that font measures via system fallback rendering. macOS arm64 with the same Chromium build (1217, mac-arm64 variant) renders the same TTF correctly. Static (single-instance) TTFs work on both platforms.

The failure is silent: no console error, no network failure, no `FontFace.status === 'error'`. The only signal is that `Canvas2D.measureText` returns clean integer widths (synthetic-fallback metrics) instead of the sub-pixel-precise widths a real font produces.

## Steps to reproduce

1. Self-host a variable Fraunces TTF (e.g. `Fraunces[SOFT,WONK,opsz,wght].ttf` from `github.com/undercasetype/Fraunces`).
2. Declare via `@font-face`:
   ```css
   @font-face {
     font-family: "Fraunces";
     src: url("/fonts/Fraunces-VariableFont.ttf") format("truetype-variations");
     font-weight: 100 900;
     font-style: normal;
   }
   ```
3. Render a page using `font-family: "Fraunces"; font-size: 19px` for body text.
4. Run on headless Chromium 147 (Linux x64) via Playwright 1.59.1.
5. Inside `page.evaluate`, after `await document.fonts.ready`:
   ```js
   const ctx = document.createElement('canvas').getContext('2d');
   ctx.font = '400 19px Fraunces';
   ctx.measureText('e').width;                            // observe
   ctx.measureText('the cheapest signal').width;          // observe
   ctx.measureText('abcdefghijklmnopqrstuvwxyz').width;   // observe
   document.fonts.forEach(ff => ({ family: ff.family, status: ff.status }));
   ```

## Expected behaviour

`Canvas2D.measureText` returns sub-pixel-precise widths consistent with the variable TTF's resolved-instance glyph metrics. Matches macOS arm64 Chromium 147 behaviour (verified with the same TTF, same CSS, same Chromium version).

## Actual behaviour

`Canvas2D.measureText` returns **clean integer pixel widths**, indicating system-fallback rendering. `FontFace.status` simultaneously reports `'loaded'`, suggesting the font registered successfully but never bound to glyph rendering.

## Diagnostic data

Same TTF (SHA256 `0776a870a0856b296e11639505ac0cf9be5e7800bb1849dfa21a1bd182455fc0`), same CSS, same Chromium 147.0.7727.15 build 1217 (variant differs by platform).

| Measurement | macOS arm64 Chromium 147 | Linux x64 Chromium 147 |
|---|---|---|
| `glyph_e` width | 9.8377685546875 | **10** |
| `phrase_the_cheapest_signal` width | 168.0764923095703 | **170** |
| `glyph_lowercase_alphabet` width | 263.71331787109375 | **264** |
| `paragraphClientWidth` (body 65ch) | 799 px | **780 px** |
| `FontFace.status` (Fraunces normal/100-900) | `loaded` | `loaded` |
| `getComputedStyle(p).fontFamily` | `Fraunces, ui-serif, ...` | `Fraunces, ui-serif, ...` |

The integer-vs-fractional pattern is the diagnostic signature: real font rendering produces fractional advance widths from glyph metrics, while system-fallback rendering produces integer widths from a generic block measurer.

A parallel-family probe (separate `@font-face` declarations for both variable and static instances of the same font, measured side-by-side under different family names) confirmed the failure is specific to **variable** TTFs:

| Family declaration | macOS `glyph_e` | Linux `glyph_e` | Linux renders? |
|---|---|---|---|
| Variable TTF + `format("truetype-variations")` | 10.32 (fractional) | **10** (integer) | ❌ |
| Variable TTF + `format("truetype")` | 10.32 (fractional) | **10** (integer) | ❌ |
| Static TTF (Fraunces144pt-Bold) + `format("truetype")` | 11.40 (fractional) | **11.44** (fractional) | ✅ |

Format hint syntax (`truetype-variations` vs `truetype`) makes no difference on Linux. The variable-vs-static distinction is the failure axis.

## Workaround

Switch from a single variable TTF to multiple static TTFs covering the production weight/style surface, declared as separate `@font-face` rules under the same family name:

```css
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces144pt-Regular.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces144pt-SemiBold.ttf") format("truetype");
  font-weight: 600;
  font-style: normal;
}
/* + Bold 700, Italic 400 */
```

Trade-offs of the workaround:
- Asset surface roughly halves (variable file ~803 KB → four statics totalling ~389 KB) due to format dedup overhead in variable TTFs
- Loses true intermediate weights — the variable file synthesises every weight on its `wght` axis (e.g. 500), while static releases typically omit Medium

## Environment

- Playwright: 1.59.1
- Chromium: 147.0.7727.15 (Chrome for Testing build 1217)
  - Linux x64 variant (broken): `chromium-1217/chrome-linux64`
  - macOS arm64 variant (works): `chromium-1217/chrome-mac-arm64`
- Node: 22.16.0 (Linux build host) / 22.22.1 (macOS dev)
- OS: Linux (CF Pages build container `/opt/buildhome/`, Debian-based) / macOS arm64
- Variable TTF source: `github.com/undercasetype/Fraunces` (master branch)

## Why this matters

Static-site generators that use Playwright Linux Chromium for build-time text layout (line-breaking, drop-cap measurement, hyphenation decisions) silently produce different output than local development on macOS Chromium. There is no error surface to catch this — `FontFace.status` reports success, no console message fires, and the only diagnostic is comparing rendered glyph widths between platforms.

This pattern likely applies to any Linux Chromium variant in headless contexts that lacks the platform font infrastructure macOS provides via CoreText. The failure mode is invisible until cross-platform output is compared byte-for-byte.

## References

- Diagnostic write-up: BrowserRenderer arc, captured in repo `.claude/learnings.md` (2026-05-06, entry 1).
- Affected project: pilcrow.page (Astro 6 static blog typesetting via Playwright).
- Workaround commit: see commit log for "self-host static Fraunces (144pt opsz)" on 2026-05-07.
