#!/usr/bin/env bun
/**
 * FontPicker hydration smoke test.
 *
 * Asserts that FontPicker.astro's Level 2 combobox hydrates correctly:
 *   1. `.combobox-wrap` is un-hidden (JS ran, progressive enhancement worked)
 *   2. The native `<select>` fallback is visually hidden (display: none via JS)
 *   3. The combobox trigger can be clicked and opens the listbox
 *   4. `aria-expanded="true"` is set on the combobox input after open
 *   5. At least one `role="option"` is reachable inside `[role="listbox"]`
 *      (NOT the native <select> options — queried specifically inside the
 *       custom listbox container to avoid counting the fallback)
 *   6. Custom-family Load handler: typing into the custom input and clicking
 *      Load dispatches `pilcrow:font-picker-changed` on document (verifies
 *      the loadCustomFamily path runs when the family is already in manifest)
 *
 * Root cause of original bug (2026-05-17):
 *   Astro does NOT interpolate {expr} inside <script> tags. The JSON data
 *   blocks shipped with literal "{MANIFEST_JSON}" and "{PINNED_FAMILIES_JSON}"
 *   strings, causing JSON.parse to throw on the first character and aborting
 *   the hydration script before any listeners attached. Fix: set:html on the
 *   <script type="application/json"> elements.
 *
 * Run: bun run scripts/smoke-font-picker.ts
 *   Requires preview server on :4321 (bun run preview).
 */

import { chromium } from 'playwright';

const PREVIEW_URL = 'http://localhost:4321/playground/';
const TIMEOUT_MS = 15_000;

let passed = 0;
let failed = 0;

function pass(msg: string): void {
  console.log(`  PASS  ${msg}`);
  passed++;
}

function fail(msg: string): void {
  console.error(`  FAIL  ${msg}`);
  failed++;
}

function assert(condition: boolean, message: string): void {
  if (condition) pass(message);
  else fail(message);
}

async function main(): Promise<void> {
  console.log('\nFontPicker hydration smoke test');
  console.log(`  Target: ${PREVIEW_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);

  try {
    // ── Navigate and wait for hydration ──────────────────────────────────────
    console.log('1. Navigate to /playground/');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });

    // The hydration script un-hides .combobox-wrap immediately on script
    // load — no user interaction needed. Wait for it.
    await page.waitForSelector('.combobox-wrap:not([hidden])', { timeout: TIMEOUT_MS });
    pass('Hydration ran — .combobox-wrap is no longer [hidden]');

    // ── Assert .visually-hidden applied to native <select> ────────────────────
    console.log('\n2. Native <select> fallback state');
    const selectDisplay = await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('[data-font-picker-select]');
      if (!sel) return 'NOT_FOUND';
      return sel.style.display;
    });
    assert(
      selectDisplay === 'none',
      `Native <select> display is "none" (was: "${selectDisplay}")`,
    );

    // ── Focus combobox trigger and assert aria-expanded ───────────────────────
    console.log('\n3. Combobox open / aria-expanded');
    const comboboxInput = page.locator('[data-font-picker-input]');
    await comboboxInput.focus();

    // After focus, the hydration script calls openListbox() which sets
    // aria-expanded="true".
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-font-picker-input]')
          ?.getAttribute('aria-expanded') === 'true',
      { timeout: TIMEOUT_MS },
    );
    pass('aria-expanded="true" after combobox focus');

    // ── Assert listbox is visible and contains role="option" ─────────────────
    console.log('\n4. Listbox options');
    const listboxHidden = await page.evaluate(() => {
      const lb = document.querySelector('[data-font-picker-listbox]');
      return lb?.hasAttribute('hidden') ?? true;
    });
    assert(!listboxHidden, 'Listbox [data-font-picker-listbox] is not hidden');

    // Count role="option" elements INSIDE the custom listbox — not the native
    // <select>'s <option> elements (the previous broken gate counted those).
    const optionCount = await page.evaluate(() => {
      const listbox = document.querySelector('[role="listbox"][data-font-picker-listbox]');
      if (!listbox) return 0;
      return listbox.querySelectorAll('[role="option"]').length;
    });
    assert(
      optionCount > 0,
      `At least one role="option" inside [role="listbox"] (found ${optionCount})`,
    );

    // ── Custom-family Load handler (success path — non-manifest family) ───────
    // The spec (B2) requires the Load button to dispatch
    // `pilcrow:font-picker-changed` on document after a successful load.
    //
    // We MUST use a family NOT in the manifest here. If we use a manifest
    // family (e.g. Lora), loadCustomFamily() hits MANIFEST_BY_FAMILY.has()
    // and early-returns via the fast path — never exercising loadFont(),
    // injectGoogleFontsLink(), or detectFontFaceDescriptors(). That path
    // is structurally incapable of catching the loadFont race bug
    // (learnings 2026-05-17: smoke tests must exercise the branch the bug
    // lives in; MANIFEST_BY_FAMILY.has(rawFamily) === false is the branch
    // condition for the custom-family font-loading path).
    //
    // "Caveat" is the family that exposed the race — real Google Font, not
    // in the manifest — and is the correct fixture for this assertion.
    console.log('\n5. Custom-family Load handler (Caveat — non-manifest slow path)');

    // First close the listbox by pressing Escape.
    await comboboxInput.press('Escape');

    // Register event listener via page.evaluate, then fire Load.
    const customInput = page.locator('[data-font-picker-custom]');
    const loadBtn = page.locator('[data-font-picker-custom-load]');

    // Wire the listener before typing, to avoid a race.
    await page.evaluate(() => {
      (window as typeof window & { __smokeEventFired?: boolean }).__smokeEventFired = false;
      document.addEventListener(
        'pilcrow:font-picker-changed',
        () => {
          (window as typeof window & { __smokeEventFired?: boolean }).__smokeEventFired = true;
        },
        { once: true },
      );
    });

    await customInput.fill('Caveat');
    await loadBtn.click();

    // Wait up to TIMEOUT_MS for the event to fire (font load is async —
    // requires the <link> load event + document.fonts.ready + explicit
    // document.fonts.load() calls to all resolve).
    await page.waitForFunction(
      () =>
        (window as typeof window & { __smokeEventFired?: boolean }).__smokeEventFired === true,
      { timeout: TIMEOUT_MS },
    );
    pass('pilcrow:font-picker-changed dispatched after Caveat Load click (non-manifest path)');

    // Verify the event detail has isCustom: true.
    const isCustom = await page.evaluate(() => {
      // We capture the last-fired detail by re-wiring after the first fire.
      const fp = document.querySelector('[data-font-picker]');
      if (!fp) return null;
      // data-current-font is written synchronously by selectFont() before
      // the event dispatches, so it's readable immediately after the event.
      return (fp as HTMLElement).dataset['currentFont'] === 'Caveat';
    });
    assert(isCustom === true, 'data-current-font is "Caveat" after custom load');

    // The advisory (variable-font compatibility warning) is shown for all
    // non-manifest custom entries by design — this is correct behaviour.
    // What must NOT appear is the error element ("Family not found").
    const errorHiddenSuccess = await page.evaluate(() => {
      const e = document.querySelector<HTMLElement>('[data-font-picker-custom-error]');
      return e?.hidden ?? true;
    });
    assert(errorHiddenSuccess, '"Family not found" error is hidden after successful Caveat load');

    // Verify document.fonts contains at least one FontFace for "Caveat".
    const caveatFaceCount = await page.evaluate(() => {
      let count = 0;
      document.fonts.forEach((face) => {
        const name = face.family.replace(/^["']|["']$/g, '').toLowerCase().trim();
        if (name === 'caveat') count++;
      });
      return count;
    });
    assert(
      caveatFaceCount > 0,
      `document.fonts contains at least one FontFace for "Caveat" (found ${caveatFaceCount})`,
    );

    // ── Custom-family Load handler (error path — bogus family name) ───────────
    // Assert that a deliberately invalid family name surfaces the advisory
    // (i.e. "Family not found on Google Fonts") and does NOT dispatch
    // pilcrow:font-picker-changed. This catches future regressions where the
    // timeout/error path silently succeeds.
    console.log('\n6. Custom-family Load handler (error path — bogus family name)');

    // Wire a listener that would fire if the event (incorrectly) dispatches.
    await page.evaluate(() => {
      (
        window as typeof window & { __smokeBogusEventFired?: boolean }
      ).__smokeBogusEventFired = false;
      document.addEventListener(
        'pilcrow:font-picker-changed',
        () => {
          (
            window as typeof window & { __smokeBogusEventFired?: boolean }
          ).__smokeBogusEventFired = true;
        },
        { once: true },
      );
    });

    await customInput.fill('ThisIsNotAFontFamily12345');
    await loadBtn.click();

    // The error path should surface the advisory quickly (the Google Fonts API
    // returns near-instantly for unknown families, and the 5-second link-load
    // timeout is the worst case). Wait up to 10 seconds for the advisory.
    await page.waitForFunction(
      () => {
        const a = document.querySelector<HTMLElement>('[data-font-picker-custom-advisory]');
        return a !== null && !a.hidden;
      },
      { timeout: 10_000 },
    );
    pass('Advisory is visible after bogus family name Load click');

    // Confirm the event did NOT fire.
    const bogusEventFired = await page.evaluate(
      () =>
        (window as typeof window & { __smokeBogusEventFired?: boolean }).__smokeBogusEventFired ===
        true,
    );
    assert(!bogusEventFired, 'pilcrow:font-picker-changed did NOT dispatch for bogus family');
  } finally {
    await browser.close();
  }

  console.log(`\n─── Result: ${passed} passed, ${failed} failed ───\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nSmoke test threw:', err);
  process.exit(1);
});
