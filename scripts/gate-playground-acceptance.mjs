#!/usr/bin/env bun
/**
 * Inline-Markup — playground acceptance gate (sub-task 10).
 *
 * Permanent regression test. Asserts that the playground's `BrowserRenderer`
 * pipeline (live in the user's browser) reproduces the canonical Pilcrow
 * typesetting output for `src/content/posts/inline-markup.md`.
 *
 * ─── Why inline-markup.md (not the-cheapest-signal.md) ─────────────────────
 *   The first iteration of this gate targeted `the-cheapest-signal.md` and
 *   recorded an honest FAIL at commit 2bb11a9 — the cheapest-signal body
 *   uses build-time directives (`:::sidenote`, `:::pullquote`, `[^N]`) that
 *   the playground's BrowserRenderer cannot reproduce: directives are
 *   transformed by remark-pullquote / remark-sidenote / rehype-footnote-mark
 *   / rehype-hoist-sidenotes, all build-time only.
 *
 *   That gap was diagnosed as ARCHITECTURAL and filed as a Level 2 candidate
 *   in NOTES.md (browser-side directive pipeline). For the Level 1 closing
 *   gate we switched canonical to a directive-free post that nevertheless
 *   exercises the inline-markup matrix (em, strong, link, code, sub, sup,
 *   nested) and the rich-inline pretext path. `inline-markup.md` is that
 *   post: 220 words, drop-cap-eligible at the lede, no directives, no
 *   footnotes, real prose.
 *
 *   Even with directives out of the picture, the original Preview.astro's
 *   `markdownToPlainHTML()` only HTML-escaped + `<p>`-wrapped — no
 *   inline-markup transform at all. The follow-up commit wired remark-parse
 *   → remark-gfm → remark-smartypants → remark-rehype → rehype-stringify
 *   into Preview.astro (mirrors Astro's build-time stack minus directives)
 *   so prose-only Markdown round-trips correctly. This gate is the
 *   regression test for that fix.
 *
 * ─── How to run ────────────────────────────────────────────────────────────
 *   1. (One-shot) Build the canonical reference:
 *        bun run build
 *      The script does this for you if `dist/posts/inline-markup/`
 *      isn't current.
 *   2. Start a static server for the built playground (the script spawns
 *      `bun run preview` and tears it down on exit):
 *        bun run scripts/gate-playground-acceptance.mjs
 *
 * ─── Two-tier comparison ───────────────────────────────────────────────────
 *   PRIMARY gate (the regression):
 *     - Build local dist via `bun run build` (canonical Playwright reference)
 *     - Open `/playground/` in headless Chromium
 *     - Paste the inline-markup markdown body into the editor
 *     - Set canonical settings: Fraunces / 65ch / 1.55 / drop-cap on /
 *       hyphenation on
 *     - Wait for the typeset to settle
 *     - Extract `#playground-preview-host` innerHTML
 *     - Extract `<div class="post-body">…</div>` content from
 *       `dist/posts/inline-markup/index.html`
 *     - Compare byte-for-byte after normalising volatile attributes
 *       (data-astro-cid-*, hash suffixes, whitespace runs).
 *     - PASS iff identical.
 *
 *   SECONDARY gate (diagnostic, only on PRIMARY fail):
 *     - Fetch https://pilcrow.page/posts/inline-markup/
 *     - Extract its post-body section
 *     - Compare line counts (count of `<span class="pt-line">`)
 *     - PASS iff within ±3 of BrowserRenderer output (the
 *       FreeType/CoreText residual envelope from the Linux Playwright
 *       Chromium 147 carve-out — see learnings 2026-05-06).
 *
 * ─── Normalisation step ────────────────────────────────────────────────────
 *   The dist HTML is wrapped in `<div class="post-body">…</div>`; the
 *   playground's `#playground-preview-host` IS the `.post-body` div, so
 *   we compare innerHTML between the two. Astro 6 may inject volatile
 *   `data-astro-cid-*` attributes; we strip them. Whitespace between block
 *   elements that's purely formatting noise is also normalised.
 */

import { chromium } from 'playwright';
import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const POST_SLUG = 'inline-markup';
const POST_MD_PATH = resolve(REPO_ROOT, `src/content/posts/${POST_SLUG}.md`);
const POST_DIST_PATH = resolve(REPO_ROOT, `dist/posts/${POST_SLUG}/index.html`);
const PREVIEW_PORT = 4321;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const DEPLOYED_URL = `https://pilcrow.page/posts/${POST_SLUG}/`;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip frontmatter from markdown. Frontmatter is between the leading `---`
 * and the next `---` on a line by itself. Returns the body verbatim.
 */
function stripFrontmatter(md) {
  const lines = md.split('\n');
  if (lines[0].trim() !== '---') return md;
  let i = 1;
  while (i < lines.length && lines[i].trim() !== '---') i++;
  if (i === lines.length) return md;
  return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
}

/**
 * Depth-counting balanced-div scanner. Extracts the innerHTML of the FIRST
 * `<div class="post-body">…</div>` block in the given HTML. Returns null
 * if not found. Uses depth counting per the project's never-do-non-greedy-
 * regex rule (see CLAUDE.md / learnings 2026-04-29 splicePostBody fix).
 */
function extractPostBodyInnerHTML(html) {
  const startMatch = html.match(/<div\s+class="post-body"[^>]*>/);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < html.length && depth > 0) {
    const openIdx = html.indexOf('<div', i);
    const closeIdx = html.indexOf('</div>', i);
    if (closeIdx === -1) return null;
    if (openIdx !== -1 && openIdx < closeIdx) {
      depth++;
      i = openIdx + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(startIdx, closeIdx);
      }
      i = closeIdx + 6;
    }
  }
  return null;
}

/**
 * Normalise typeset HTML for comparison. Strips:
 *   - data-astro-cid-* attributes (Astro 6 scoped style markers)
 *   - leading/trailing whitespace on lines
 *   - runs of >1 whitespace between elements
 *   - empty text between block elements
 */
function normaliseHTML(html) {
  return html
    .replace(/\s+data-astro-cid-[a-z0-9]+="[^"]*"/g, '')
    .replace(/\s+data-astro-cid-[a-z0-9]+/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/**
 * Find the byte offset of the first divergence between two strings, plus
 * a context window around it. Returns { offset, contextA, contextB }.
 */
function firstDivergence(a, b) {
  const len = Math.min(a.length, b.length);
  let offset = -1;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) { offset = i; break; }
  }
  if (offset === -1 && a.length !== b.length) offset = len;
  if (offset === -1) return null;
  const start = Math.max(0, offset - 80);
  const end = Math.min(Math.max(a.length, b.length), offset + 120);
  return {
    offset,
    contextA: a.slice(start, end),
    contextB: b.slice(start, end),
    aLen: a.length,
    bLen: b.length,
  };
}

/**
 * Spawn `bun run preview` and resolve once the server responds.
 */
async function startPreviewServer() {
  console.log('[gate] starting `bun run preview` on port', PREVIEW_PORT);
  const proc = spawn('bun', ['run', 'preview'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });

  // Poll until server responds, up to 20s.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${PREVIEW_URL}/playground/`);
      if (res.ok) {
        console.log('[gate] preview server is up');
        return proc;
      }
    } catch {
      // not ready yet
    }
    await sleep(250);
  }
  proc.kill('SIGTERM');
  throw new Error('preview server did not start within 20s; stderr: ' + stderr);
}

async function ensureDistFresh() {
  try {
    await access(POST_DIST_PATH);
    console.log('[gate] dist exists at', POST_DIST_PATH);
  } catch {
    console.log('[gate] dist missing; running `bun run build`');
    await runBuild();
  }
}

async function runBuild() {
  return new Promise((resolveBuild, rejectBuild) => {
    const proc = spawn('bun', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    proc.on('exit', (code) => {
      if (code === 0) resolveBuild();
      else rejectBuild(new Error(`bun run build exited with code ${code}`));
    });
  });
}

// ─── Primary gate ───────────────────────────────────────────────────────────

async function runPrimaryGate(serverProc) {
  // Step 1 — read the cheapest-signal markdown body
  const mdRaw = await readFile(POST_MD_PATH, 'utf8');
  const mdBody = stripFrontmatter(mdRaw);
  console.log(`[gate] markdown body: ${mdBody.length} chars`);

  // Step 2 — read canonical reference from dist
  const distHTML = await readFile(POST_DIST_PATH, 'utf8');
  const distInner = extractPostBodyInnerHTML(distHTML);
  if (distInner === null) {
    throw new Error('could not extract <div class="post-body"> from dist HTML');
  }
  const distNorm = normaliseHTML(distInner);
  console.log(`[gate] dist post-body innerHTML: ${distNorm.length} chars (normalised)`);

  // Step 3 — launch headless Chromium
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[gate:browser:${msg.type()}]`, msg.text());
    }
  });

  try {
    // Step 4 — open playground
    await page.goto(`${PREVIEW_URL}/playground/`, { waitUntil: 'networkidle' });

    // Step 5 — confirm canonical defaults are already applied (Fraunces /
    // 65ch / 1.55 / drop-cap on / hyphenation on are the rendered defaults).
    // Read the live settings from the window mirror.
    const settings = await page.evaluate(() => window.__pilcrowSettings ?? null);
    console.log('[gate] live settings before paste:', settings);
    if (!settings) {
      throw new Error('window.__pilcrowSettings not set — settings panel did not init');
    }
    if (
      settings.font !== 'Fraunces' ||
      settings.measure !== 65 ||
      settings.lineHeight !== 1.55 ||
      settings.dropCap !== true ||
      settings.hyphenation !== true
    ) {
      throw new Error(
        `canonical settings mismatch — expected Fraunces/65/1.55/dropCap/hyphenation, got ${JSON.stringify(settings)}`,
      );
    }

    // Step 6 — paste the markdown body. Editor.astro's smart-paste replaces
    // the stand-in if data-stand-in is still set; first we focus the textarea
    // and use the page's clipboard simulation via .fill() to inject the body.
    // Then we dispatch `pilcrow:editor-changed` with source: 'paste' to mimic
    // a paste action, since `.fill()` triggers `input` events (debounced
    // keystroke path) — paste source is what the script wants.
    await page.evaluate((md) => {
      const textarea = document.getElementById('playground-editor-textarea');
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error('textarea not found');
      }
      textarea.value = md;
      delete textarea.dataset.standIn;
      // Dispatch as a paste-source event so Preview re-typesets immediately.
      const event = new CustomEvent('pilcrow:editor-changed', {
        detail: { markdown: md, source: 'paste' },
        bubbles: true,
      });
      document.dispatchEvent(event);
    }, mdBody);

    // Step 7 — wait for fonts and the typeset to settle. The `fonts.ready`
    // promise covers font loading; the requestAnimationFrame chain catches
    // the typeset completion (Preview.astro's runTypeset is async).
    await page.evaluate(() => document.fonts.ready);
    // Wait for data-preview-state to flip from 'pending' / 'initial-typeset'
    // to 'live'.
    await page.waitForFunction(() => {
      const host = document.getElementById('playground-preview-host');
      const state = host?.getAttribute('data-preview-state');
      return state === 'live' || state === 'fallback';
    }, { timeout: 15_000 });

    const finalState = await page.evaluate(() => {
      const host = document.getElementById('playground-preview-host');
      return host?.getAttribute('data-preview-state') ?? 'unknown';
    });
    console.log(`[gate] preview state after paste: ${finalState}`);

    // Settle a couple more frames for any late-frame updates.
    await sleep(200);

    // Step 8 — extract the playground's typeset HTML
    const playgroundInner = await page.evaluate(() => {
      const host = document.getElementById('playground-preview-host');
      return host?.innerHTML ?? null;
    });
    if (playgroundInner === null) {
      throw new Error('playground-preview-host not found in DOM');
    }
    const playgroundNorm = normaliseHTML(playgroundInner);
    console.log(`[gate] playground innerHTML: ${playgroundNorm.length} chars (normalised)`);

    // Count pt-line spans for the secondary gate diagnostic
    const playgroundLineCount =
      (playgroundNorm.match(/<span class="pt-line">/g) || []).length;
    const distLineCount =
      (distNorm.match(/<span class="pt-line">/g) || []).length;
    console.log(`[gate] pt-line counts — playground: ${playgroundLineCount}, dist: ${distLineCount}`);

    // Step 9 — compare
    if (playgroundNorm === distNorm) {
      console.log('[gate] PRIMARY GATE: PASS — byte-for-byte match against dist');
      return {
        verdict: 'PASS',
        playgroundNorm,
        distNorm,
        playgroundLineCount,
        distLineCount,
      };
    }

    // Diverged — find the first byte offset and print context
    const div = firstDivergence(playgroundNorm, distNorm);
    console.log('\n[gate] PRIMARY GATE: FAIL — divergence detected');
    console.log(`[gate]   playground length: ${playgroundNorm.length}`);
    console.log(`[gate]   dist length:       ${distNorm.length}`);
    if (div) {
      console.log(`[gate]   first diverging byte offset: ${div.offset}`);
      console.log('[gate]   playground context:');
      console.log('    ' + JSON.stringify(div.contextA));
      console.log('[gate]   dist context:');
      console.log('    ' + JSON.stringify(div.contextB));
    }

    return {
      verdict: 'FAIL',
      divergence: div,
      playgroundNorm,
      distNorm,
      playgroundLineCount,
      distLineCount,
    };
  } finally {
    await browser.close();
  }
}

// ─── Secondary gate (diagnostic, only on primary fail) ──────────────────────

async function runSecondaryGate(playgroundLineCount) {
  console.log('\n[gate] running SECONDARY (diagnostic) gate against deployed pilcrow.page');
  let deployedHTML;
  try {
    const res = await fetch(DEPLOYED_URL);
    if (!res.ok) {
      console.log(`[gate] secondary fetch failed: HTTP ${res.status}`);
      return { verdict: 'FAIL', reason: `HTTP ${res.status}` };
    }
    deployedHTML = await res.text();
  } catch (err) {
    console.log('[gate] secondary fetch errored:', err.message);
    return { verdict: 'FAIL', reason: err.message };
  }
  const deployedInner = extractPostBodyInnerHTML(deployedHTML);
  if (deployedInner === null) {
    return { verdict: 'FAIL', reason: 'could not extract post-body from deployed HTML' };
  }
  const deployedLineCount =
    (deployedInner.match(/<span class="pt-line">/g) || []).length;
  const drift = playgroundLineCount - deployedLineCount;
  console.log(`[gate]   deployed pt-line count: ${deployedLineCount}`);
  console.log(`[gate]   playground pt-line count: ${playgroundLineCount}`);
  console.log(`[gate]   drift: ${drift > 0 ? '+' : ''}${drift}`);
  // FreeType/CoreText envelope: ±3 lines on long posts.
  if (Math.abs(drift) <= 3) {
    console.log('[gate] SECONDARY GATE: PASS — drift within ±3 envelope');
    return { verdict: 'PASS', deployedLineCount, drift };
  }
  console.log('[gate] SECONDARY GATE: FAIL — drift exceeds ±3 envelope');
  return { verdict: 'FAIL', deployedLineCount, drift };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[gate] ${POST_SLUG} playground acceptance gate — 2026-05-08`);

  await ensureDistFresh();

  const serverProc = await startPreviewServer();

  try {
    const primary = await runPrimaryGate(serverProc);

    if (primary.verdict === 'PASS') {
      console.log('\n[gate] FINAL VERDICT: PASS');
      return 0;
    }

    // Primary failed — run secondary diagnostic
    const secondary = await runSecondaryGate(primary.playgroundLineCount);

    console.log('\n[gate] FINAL VERDICT: FAIL');
    console.log(`[gate]   primary:   FAIL (byte-for-byte mismatch with local dist)`);
    console.log(`[gate]   secondary: ${secondary.verdict}${secondary.drift !== undefined ? ` (drift ${secondary.drift > 0 ? '+' : ''}${secondary.drift} lines)` : ''}`);
    return 1;
  } finally {
    console.log('[gate] tearing down preview server');
    serverProc.kill('SIGTERM');
    // Give it a moment to release the port
    await sleep(500);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[gate] FATAL:', err);
    process.exit(2);
  });
