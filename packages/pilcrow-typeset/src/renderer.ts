/**
 * Pilcrow typeset interface.
 *
 * Abstracts the render strategy (Playwright today, server-side pretext later)
 * so callers never import Playwright directly. Swap PlaywrightRenderer for a
 * future ServerRenderer without touching the integration or any downstream code.
 */

/** Options controlling how a block of HTML is typeset. */
export interface TypesetOptions {
  /** Canvas font shorthand, e.g. `"18px ui-serif"`. Passed directly to pretext. */
  fontShorthand: string;
  /** Column width in CSS pixels at which lines are broken. */
  maxWidth: number;
  /** Line height in CSS pixels; must match the page's rendered line-height. */
  lineHeight: number;
  /**
   * Post path for warning messages (e.g. `"posts/inline-markup"`).
   * Used in console.warn output when an unsupported inline element triggers fallback.
   */
  postPath?: string;
  /**
   * Whether to render a drop cap on the lede paragraph.
   * Absent or true = on (default); false = opt-out (front-matter `dropCap: false`).
   */
  dropCap?: boolean;
  /**
   * Whether to run the Hyphenopoly soft-hyphen pre-pass before pretext.
   * Absent or true = on (default — matches build-time semantics for
   * `pilcrow.page` and shipped adapter packages); false = skip the pre-pass
   * entirely so line breaks fall on word boundaries only. Wired for the
   * playground's hyphenation toggle (sub-task 6 of PILCROW_PLAYGROUND_PLAN.md);
   * adapter packages (PlaywrightRenderer / pilcrow-eleventy / pilcrow-nextjs)
   * leave this absent and continue to hyphenate by default.
   */
  hyphenation?: boolean;
}

/**
 * Contract every render strategy must fulfil.
 *
 * Lifecycle: `open()` once → `typeset()` per document → `close()` once.
 * Cross-paragraph context is preserved because the browser page stays alive
 * between `typeset()` calls on the same document.
 */
export interface TypesetRenderer {
  /** Launch the underlying engine (browser, process, etc.). */
  open(): Promise<void>;

  /**
   * Typeset the HTML of a post body.
   *
   * Replaces every `<p>` inside `html` with per-line `<span class="pt-line">`
   * elements. Returns the mutated body HTML and counts for logging.
   */
  typeset(html: string, options: TypesetOptions): Promise<{ html: string; lineCount: number; paragraphCount: number }>;

  /** Tear down the underlying engine. */
  close(): Promise<void>;
}
