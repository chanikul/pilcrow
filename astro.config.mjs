import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pilcrowTypeset from './src/integrations/pilcrow-typeset.js';
import remarkDirective from 'remark-directive';
import remarkPullquote from './src/plugins/remark-pullquote.js';
import remarkSidenote from './src/plugins/remark-sidenote.js';
import rehypeFootnoteMark from './src/plugins/rehype-footnote-mark.js';
import rehypeHoistSidenotes from './src/plugins/rehype-hoist-sidenotes.js';
import rehypeImages from './src/plugins/rehype-images.js';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// Build a Set of slugs whose front-matter has `draft: true`.
// `astro:content` is a Vite virtual module — not importable at config-load
// time — so we parse the markdown files directly using fs + js-yaml.
// @astrojs/sitemap passes full absolute URLs to its `filter` callback
// (e.g. https://pilcrow.page/posts/hello/); we match by extracting the
// slug from the path segment after /posts/.
const postsDir = new URL('./src/content/posts/', import.meta.url).pathname;
const draftSlugs = new Set(
  fs.readdirSync(postsDir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
    .flatMap((f) => {
      const raw = fs.readFileSync(path.join(postsDir, f), 'utf-8');
      // Extract YAML front-matter between the first pair of --- delimiters.
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!match) return [];
      const fm = yaml.load(match[1]);
      if (fm && fm.draft === true) {
        // Slug is filename without extension.
        return [f.replace(/\.(md|mdx)$/, '')];
      }
      return [];
    })
);

export default defineConfig({
  site: 'https://pilcrow.page',
  integrations: [
    mdx(),
    sitemap({
      // Mirror the draft-filter pattern from index.astro and rss.xml.ts:
      // exclude draft post URLs from the sitemap in production.
      // In dev, @astrojs/sitemap never generates output so this is academic,
      // but we return true for consistency with the rest of the codebase.
      filter: (url) => {
        // Match URLs of the form https://pilcrow.page/posts/<slug>/
        const match = url.match(/\/posts\/([^/]+)\/?$/);
        if (!match) return true; // non-post URL (e.g. index) — always include
        return !draftSlugs.has(match[1]);
      },
    }),
    pilcrowTypeset(),
  ],
  markdown: {
    // Order matters: remarkDirective must parse :::name blocks into
    // containerDirective AST nodes before the transform plugins run.
    // remarkSidenote runs after remarkPullquote so pull-quote detection
    // (parent.name === 'pullquote') is accurate.
    remarkPlugins: [remarkDirective, remarkPullquote, remarkSidenote],
    // rehypeFootnoteMark runs after remark-gfm (Astro default) has emitted the
    // <section data-footnotes class="footnotes"> element, and prepends the
    // pilcrow glyph section-break marker with aria-hidden="true".
    // rehypeHoistSidenotes runs after rehypeFootnoteMark: it restructures each
    // <span class="sidenote-ref"> so the <sup> marker moves into the preceding
    // <p> and the <aside> becomes a direct child of .post-body (Grid container),
    // enabling grid-column: 4 to work without float hackery.
    rehypePlugins: [
      rehypeFootnoteMark,
      rehypeHoistSidenotes,
      // rehype-images must run after rehypeHoistSidenotes so the DOM is fully
      // structured before we replace <img> nodes with <figure><picture> blocks.
      // process.cwd() at config-load time is the Astro project root.
      [rehypeImages, { projectRoot: process.cwd() }],
    ],
  },
});
