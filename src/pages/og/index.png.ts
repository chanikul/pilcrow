/**
 * Static OG image endpoint for the index / channel card.
 *
 * Route: /og/index.png  →  1200×630 PNG
 *
 * The index card uses the RSS channel description as its title text (D6=Yes).
 * This string is the same as in src/pages/rss.xml.ts line 16.
 * If the channel description ever changes, update both files.
 *
 * Sub-decision (reported): the channel description is 49 chars at opsz 72px.
 * It wraps to two lines on the 1200px card, which reads cleanly — no font-size
 * drop needed. Title size stays at 72px (opsz within variable range).
 */

import type { APIRoute } from 'astro';
import { renderCard } from '../../lib/og/card.js';

// Keep in sync with src/pages/rss.xml.ts channel description.
const INDEX_TITLE = 'A blog whose lines are set before the page loads.';

export const GET: APIRoute = async () => {
  const png = await renderCard(INDEX_TITLE, 'index');

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
};
