/**
 * Pilcrow site configuration.
 *
 * This is the single place to configure site-level options. Import it in any
 * layout or component that needs them.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ showPilcrowFooter                                                       │
 * │   When true (the default), every page shows a small footer:            │
 * │     "Typeset with Pilcrow ¶" → https://pilcrow.press                   │
 * │   This is the growth loop (master plan §12). Toggle off if you want a  │
 * │   completely attribution-free site.                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export const siteConfig = {
  /**
   * Show the "Typeset with Pilcrow ¶" footer link on every page.
   * Default: true. Set to false to remove it entirely.
   */
  showPilcrowFooter: true,
} as const;
