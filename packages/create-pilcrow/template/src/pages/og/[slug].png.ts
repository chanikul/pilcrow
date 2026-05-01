/**
 * Static OG image endpoint for post cards.
 *
 * Route: /og/{slug}.png  →  1200×630 PNG
 *
 * getStaticPaths mirrors the same draft filter as index.astro and rss.xml.ts:
 * in production, only non-draft posts get an OG card; in dev, all posts do
 * so test posts remain testable.
 *
 * The rendered PNG uses the post title as the dominant text block (D3=A).
 */

import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { renderCard } from '../../lib/og/card.js';

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('posts', ({ data }) =>
    import.meta.env.PROD ? !data.draft : true
  );

  return posts.map((post) => ({
    params: { slug: post.id },
    props: { title: post.data.title },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard(props.title as string, 'post');

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      // Cache for 1 week — posts change only on rebuild
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
};
