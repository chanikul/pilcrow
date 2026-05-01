/**
 * Pilcrow OG card renderer.
 *
 * `renderCard(title, cardType)` handles both per-post and index cards via
 * the `cardType: 'post' | 'index'` parameter.
 *
 * Typography scale:
 *   post  — 96pt title, 48pt wordmark (WORDMARK_RATIO 0.5×)
 *   index — 72pt title, 36pt wordmark (WORDMARK_RATIO 0.5×)
 *
 * Layout (masthead-companion flex row): title left, wordmark right,
 * `align-items: center`, `justify-content: space-between`.
 * Row container `paddingTop: 138px` anchors first baseline at ~y=210
 * (top-third of the 630px card — smaller negative space above, larger below).
 * Title `lineHeight: 1.1`.
 *
 * Wordmark: "Pilcrow ¶" in MUTED (`#6c6a63`), `flexShrink: 0`.
 * Brand mark D5=B (wordmark, not glyph alone — see master plan §11 entry 19).
 *
 * Font: `Fraunces144pt-Bold.ttf` static instance only.
 * Satori's bundled opentype.js cannot parse multi-axis variable fvar tables;
 * the variable TTF has been removed. Re-download from
 * https://github.com/undercasetype/Fraunces if a future need arises.
 *
 * Output: 1200×630 PNG via Satori (SVG) → @resvg/resvg-js (PNG).
 * Build-time only — no reader JS.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Palette constants — keep in sync with public/styles/global.css :root
const PAPER = '#fafaf7';
const INK = '#1a1a1a';
const MUTED = '#6c6a63';
// ACCENT = '#b13a2e' — defined for completeness; not used in this layout

// Card dimensions (D2=A standard OG)
const WIDTH = 1200;
const HEIGHT = 630;

// Typography — two scale tiers:
//   'post'  cards:  96px title,  48px wordmark
//   'index' cards:  72px title,  36px wordmark
// WORDMARK_RATIO encodes the "wordmark is half the title size" relationship.
const WORDMARK_RATIO = 0.5;

const POST_TITLE_SIZE = 96;
const INDEX_TITLE_SIZE = 72;

// Wordmark sizes derived from title × ratio
const POST_WORDMARK_SIZE = Math.round(POST_TITLE_SIZE * WORDMARK_RATIO);   // 48px
const INDEX_WORDMARK_SIZE = Math.round(INDEX_TITLE_SIZE * WORDMARK_RATIO); // 36px

// Horizontal padding (generous negative space)
const PAD_H = 80;
const PAD_V = 72;

// Title vertical offset — positions first baseline at ~y=210 (top-third of 630px card).
// PAD_V (72px) + TITLE_TOP_OFFSET (138px) = 210px, which lands in the desired 200–230px window.
// This distributes negative space: smaller above the title, larger below — "anchored" not "floating".
const TITLE_TOP_OFFSET = 138; // px of additional top-padding on the title div

// Wordmark inset — breathing room from the right edge.
// Index card: ~24px; post card: ~32px (proportional to wordmark size).
// These match the previous glyph inset values — breathing room from the card edge,
// not balancing volume (the wordmark text provides its own visual mass).
const POST_WORDMARK_INSET = Math.round(POST_WORDMARK_SIZE * 0.675);    // ~32px at post scale
const INDEX_WORDMARK_INSET = Math.round(INDEX_WORDMARK_SIZE * 0.675);  // ~24px at index scale

// Estimated rendered width of "Pilcrow ¶" text at each wordmark size.
// At Fraunces Bold 36px: ~8 chars × ~18px avg ≈ 160px; at 48px: ~215px.
// These reserve space in TITLE_MAX_WIDTH so the title cannot collide with the wordmark.
// Adjust if visual review shows collision or excessive gap.
const POST_WORDMARK_ESTIMATED_WIDTH = 215;   // px — "Pilcrow ¶" at 48px Bold
const INDEX_WORDMARK_ESTIMATED_WIDTH = 160;  // px — "Pilcrow ¶" at 36px Bold

// Load font once at module initialisation — readFileSync is synchronous and
// this module is imported only at build time, never at the reader's browser.
//
// Path strategy: `process.cwd()` is the Astro project root (the directory
// containing package.json), which is stable across source and prerender contexts.
// `import.meta.url` resolves to the prerender chunk directory during Astro's
// static generation step, so dirname(fileURLToPath(import.meta.url)) would
// point at dist/.prerender/chunks/ — not useful. We use process.cwd() instead.
const fontData = readFileSync(
  join(process.cwd(), 'src/assets/fonts/Fraunces144pt-Bold.ttf')
);

const fontConfig = [
  {
    name: 'Fraunces',
    data: fontData,
    weight: 700 as const,
    style: 'normal' as const,
  },
];

/**
 * Render an OG card to PNG.
 *
 * @param title     The dominant text block. For post cards: post.data.title.
 *                  For the index card: the channel description string.
 * @param cardType  'post' (default) →  96px title, 48px wordmark.
 *                  'index'          →  72px title, 36px wordmark.
 * @returns         A Buffer containing the PNG image data (1200×630).
 */
export async function renderCard(
  title: string,
  cardType: 'post' | 'index' = 'post'
): Promise<Buffer> {
  const isIndex = cardType === 'index';

  const titleSize    = isIndex ? INDEX_TITLE_SIZE    : POST_TITLE_SIZE;
  const wordmarkSize = isIndex ? INDEX_WORDMARK_SIZE : POST_WORDMARK_SIZE;
  const wordmarkInset = isIndex ? INDEX_WORDMARK_INSET : POST_WORDMARK_INSET;
  const wordmarkEstWidth = isIndex ? INDEX_WORDMARK_ESTIMATED_WIDTH : POST_WORDMARK_ESTIMATED_WIDTH;

  // Satori element tree — plain objects, no JSX transform.
  //
  // Layout (Approach α — masthead pattern):
  //   Outer div: flex column, paper background, outer padding.
  //   Inner div (masthead row): flex row, justify-content: space-between,
  //     align-items: center. paddingTop TITLE_TOP_OFFSET pushes the row
  //     down to ~y=210 (top-third of the 630px card). The row contains:
  //     - Title (left): left-set Fraunces, fills available width minus wordmark slot.
  //     - Wordmark (right): "Pilcrow ¶" in MUTED, paddingRight for breathing room.
  //   align-items: center aligns the wordmark's vertical centre to the row's
  //   natural centre line — which equals the title block's vertical centre
  //   since they are the only children.
  //
  // Title maxWidth: full inner width minus wordmark slot (estimated width + inset)
  // so a long title cannot collide with the wordmark.
  const titleMaxWidth = WIDTH - PAD_H * 2 - wordmarkEstWidth - wordmarkInset;

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column' as const,
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        backgroundColor: PAPER,
        padding: `${PAD_V}px ${PAD_H}px`,
        boxSizing: 'border-box' as const,
      },
      children: [
        // Masthead row — title (left) + wordmark (right) on the same horizontal axis.
        // paddingTop shifts the row baseline to ~y=210 (top-third anchor).
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row' as const,
              justifyContent: 'space-between' as const,
              alignItems: 'center' as const,
              width: '100%',
              paddingTop: `${TITLE_TOP_OFFSET}px`,
            },
            children: [
              // Title — dominant element, left-set.
              // maxWidth reserves space for the wordmark so long titles don't collide.
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Fraunces',
                    fontWeight: 700,
                    fontSize: `${titleSize}px`,
                    lineHeight: 1.1,
                    color: INK,
                    maxWidth: `${titleMaxWidth}px`,
                    // Let the title fill naturally; wrap is acceptable for longer index text
                    wordBreak: 'break-word' as const,
                  },
                  children: title,
                },
              },
              // Wordmark — "Pilcrow ¶" — right-aligned, vertically centred against
              // title by flex align. Identity, not emphasis (D5=B, --muted).
              // paddingRight provides breathing room from the right edge.
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Fraunces',
                    fontWeight: 700,
                    fontSize: `${wordmarkSize}px`,
                    lineHeight: 1,
                    color: MUTED,
                    paddingRight: `${wordmarkInset}px`,
                    flexShrink: 0,
                    whiteSpace: 'nowrap' as const,
                  },
                  children: 'Pilcrow ¶', // "Pilcrow ¶" — brand wordmark (D5=B)
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: fontConfig,
  });

  const resvg = new Resvg(svg, {
    font: {
      // resvg has its own font subsystem; we pre-embedded glyphs via Satori,
      // so disabling system font loading is correct and faster.
      loadSystemFonts: false,
    },
  });

  return resvg.render().asPng();
}
