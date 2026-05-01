import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    dropCap: z.boolean().optional(),
    /** Set true when the post contains images so the blur-up script is emitted. */
    hasImages: z.boolean().optional(),
  }),
});

export const collections = { posts };
