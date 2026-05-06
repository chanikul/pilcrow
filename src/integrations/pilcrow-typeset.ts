/**
 * pilcrowTypeset — Astro integration that runs pretext over every post at build time.
 *
 * Hooks into `astro:build:done`. Walks only pages under `posts/`, reads each
 * built HTML file, runs pretext on every <p> inside `.post-body`, splices the
 * result back, and writes the file in place.
 *
 * Bypass:
 *   PILCROW_SKIP_TYPESET=1 bun run build
 *
 * The selector `.post-body` is the contract between this integration and
 * src/layouts/Post.astro — that layout must wrap the slot in an element with
 * that class. See Post.astro for the comment marking the contract.
 */

import type { AstroIntegration } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PlaywrightRenderer } from '../../packages/pilcrow-typeset/src/index.js';

// Post body selector — must match the wrapper class in src/layouts/Post.astro.
const POST_BODY_SELECTOR = '.post-body';

/**
 * Splice new body HTML into the .post-body div of a full HTML string.
 *
 * Uses a depth-counting scan rather than a non-greedy regex so that any
 * nested <div> elements inside .post-body (e.g. .footnotes-mark) don't
 * cause the regex to stop at the wrong closing </div>.
 *
 * Contract: Post.astro must emit exactly one <div class="post-body"> element.
 */
function splicePostBody(fullHTML: string, newBodyHTML: string): string {
  const OPEN_TAG = '<div class="post-body">';
  const startIdx = fullHTML.indexOf(OPEN_TAG);
  if (startIdx === -1) return fullHTML; // no .post-body found — leave untouched

  const innerStart = startIdx + OPEN_TAG.length;

  // Walk forward from innerStart, counting <div> opens (+1) and closes (-1).
  // When depth returns to 0, we've found the closing </div> for .post-body.
  let depth = 1;
  let pos = innerStart;
  while (pos < fullHTML.length && depth > 0) {
    const nextOpen = fullHTML.indexOf('<div', pos);
    const nextClose = fullHTML.indexOf('</div>', pos);

    if (nextClose === -1) break; // malformed HTML — bail

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4; // skip past '<div'
    } else {
      depth--;
      if (depth === 0) {
        // nextClose is the position of the matching </div>
        return (
          fullHTML.slice(0, innerStart) +
          newBodyHTML +
          fullHTML.slice(nextClose)
        );
      }
      pos = nextClose + 6; // skip past '</div>'
    }
  }

  // Fallback: could not find balanced closing tag — leave untouched.
  return fullHTML;
}

/**
 * Read the pilcrow:drop-cap meta tag from the built HTML.
 * Returns true (on) when absent or content="true"; false only when content="false".
 */
function readDropCapMeta(html: string): boolean {
  const match = html.match(/<meta\s+name="pilcrow:drop-cap"\s+content="([^"]+)"/);
  if (!match) return true; // absent → default on
  return match[1] !== 'false';
}

export default function pilcrowTypeset(): AstroIntegration {
  return {
    name: 'pilcrow-typeset',

    hooks: {
      'astro:build:done': async ({ pages, dir, logger }) => {
        if (process.env.PILCROW_SKIP_TYPESET === '1') {
          logger.info('PILCROW_SKIP_TYPESET=1 — skipping pretext');
          return;
        }

        // Only typeset pages under posts/ — skip index and any other top-level pages.
        const postPages = pages.filter((p) => p.pathname.startsWith('posts/'));

        if (postPages.length === 0) {
          logger.info('no post pages found — nothing to typeset');
          return;
        }

        const distPath = fileURLToPath(dir);
        const renderer = new PlaywrightRenderer();

        try {
          await renderer.open();

          for (const page of postPages) {
            const htmlPath = join(distPath, page.pathname, 'index.html');
            const rawHTML = await readFile(htmlPath, 'utf8');

            // Extract the post body so we only pass the relevant fragment to
            // the renderer — keeps the loader page small and measurement fast.
            // Uses depth-counting (same as splicePostBody) to correctly find
            // the closing </div> even when nested <div> elements are present
            // (e.g. .footnotes-mark div inside the footnote section).
            const OPEN_TAG_BODY = '<div class="post-body">';
            const bodyStartIdx = rawHTML.indexOf(OPEN_TAG_BODY);
            if (bodyStartIdx === -1) {
              logger.warn(`[pilcrow] ${page.pathname}: .post-body not found — skipping`);
              continue;
            }
            const bodyInnerStart = bodyStartIdx + OPEN_TAG_BODY.length;
            let bodyDepth = 1;
            let bodyPos = bodyInnerStart;
            let bodyInnerEnd = -1;
            while (bodyPos < rawHTML.length && bodyDepth > 0) {
              const nextOpen = rawHTML.indexOf('<div', bodyPos);
              const nextClose = rawHTML.indexOf('</div>', bodyPos);
              if (nextClose === -1) break;
              if (nextOpen !== -1 && nextOpen < nextClose) {
                bodyDepth++;
                bodyPos = nextOpen + 4;
              } else {
                bodyDepth--;
                if (bodyDepth === 0) { bodyInnerEnd = nextClose; break; }
                bodyPos = nextClose + 6;
              }
            }
            if (bodyInnerEnd === -1) {
              logger.warn(`[pilcrow] ${page.pathname}: .post-body closing tag not found — skipping`);
              continue;
            }

            const bodyHTML = rawHTML.slice(bodyInnerStart, bodyInnerEnd);

            // Read the drop-cap meta tag to honour per-post opt-out.
            const dropCap = readDropCapMeta(rawHTML);

            // Measure the column width by counting characters in a representative
            // run: 70ch at 18px ui-serif ≈ 560px. Rather than a live DOM query
            // (which would need another Playwright page), we pass 0 for all numeric
            // options and let PlaywrightRenderer fall back to computed CSS values
            // from the live rendered element inside the loader page.
            //
            // fontShorthand is empty string → falls back to computed style inside
            // the page. maxWidth 0 → falls back to p.clientWidth. lineHeight 0 →
            // falls back to computed lineHeight.
            const { html: typesetBody, lineCount: ptLineCount, paragraphCount: pCount } =
              await renderer.typeset(bodyHTML, {
                fontShorthand: '',
                maxWidth: 0,
                lineHeight: 0,
                postPath: page.pathname,
                dropCap,
              });

            const finalHTML = splicePostBody(rawHTML, typesetBody);
            await writeFile(htmlPath, finalHTML, 'utf8');

            logger.info(
              `[pilcrow] typeset ${page.pathname}: ${pCount} paragraph(s), ${ptLineCount} lines`,
            );
          }
        } finally {
          // Always close the browser, even on error, so the build process exits
          // cleanly rather than hanging on an open Chromium instance.
          await renderer.close();
        }
      },
    },
  };
}
