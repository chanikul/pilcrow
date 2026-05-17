# Spec 01 — Playground Level 2: Full Google Font Picker

> Status: COMPLETED (2026-05-17)

## Goal

Replace the six-font swatch row in `Settings.astro` with a searchable font picker backed by a curated manifest of editorially-appropriate Google Fonts, so any visitor can try Pilcrow on a typographically suitable family beyond the six defaults.

---

## Constraints

These are non-negotiable before any implementation decision is made.

**Variable-axis TTF forbidden.** Linux Playwright Chromium 147 silently fails to render variable-axis TTF fonts despite `FontFace.status === 'loaded'` (learnings 2026-05-06). The Level 1 six-font shortlist worked around this by self-hosting static-instance TTFs (`public/fonts/`). Any Level 2 catalogue must either ship static instances for every family or handle the fallback explicitly. The Google Fonts API serves both variable and static instances; the spec must describe how to filter at the point the font is fetched — not after.

**100ms paste-to-typeset budget (PILCROW_PLAYGROUND_PLAN.md §6).** The preview roundtrip on paste must stay under 100ms. Font loading adds latency; the gate is `document.fonts.load(...)` before dispatching `pilcrow:settings-changed`. This budget applies to the typeset step only — font-fetch network latency is excluded (show "Loading font..." during load, as §6 specifies), but `FontFace.load()` parse time counts.

**`pilcrow:settings-changed` contract is frozen.** The Level 1 contract is: `CustomEvent` on `document` with `detail: { settings: { font, dropCap, hyphenation, measure, lineHeight }, changed: string|null, source: 'user'|'init'|'restore' }`. Level 2 may add a new field to `settings` (e.g. `fontFamily`) but must not break the existing shape — `Preview.astro`, `Editor.astro`, and the copy-HTML handler all read from `window.__pilcrowSettings`.

**No `any` in TypeScript.** Manifest types must be explicit. Infer from schema; don't cast.

**No hex literals in component CSS.** Use `var(--paper)`, `var(--ink)`, `var(--muted)`, `var(--rule)`, `var(--accent)` only.

**Build-time only for manifest generation.** If the catalogue is generated from a remote API, that fetch happens at build time and the result is committed or generated into the repo. No runtime API calls to googleapis.com from the user's browser.

---

## Decisions

### A — Catalogue source: A1

Build-time Google Fonts API fetch → committed JSON manifest. Run `scripts/gen-google-fonts-manifest.ts --key <API_KEY>` manually (not as part of `bun run build`). The manifest is committed to the repo as `src/lib/playground/google-fonts-manifest.json` and regenerated on demand (e.g. seasonally). The API key lives in `.env` and is never required at runtime or on Cloudflare Pages.

Rationale: version-controlled, auditable, no runtime or build-time network risk on CF Pages, regeneration is a one-command operation.

---

### B — Arbitrary family name input: B2

Curated picker PLUS a "Custom family" text input that accepts any Google Fonts family name not in the manifest. The loader constructs a Google Fonts CSS URL dynamically for custom entries; the variable-TTF constraint cannot be enforced for names we don't control. A muted advisory is shown for all custom entries: "Some families ship only variable fonts — line breaks may be approximate on some platforms."

See the B2 + C1 interaction section below for the full runtime-detection path.

---

### C — Variable-TTF-only families: C1

Filter out at manifest generation time. The generation script checks each family's `files` array from the Google Fonts API response for static-instance availability. Families with no static instances are excluded from the manifest. The picker never shows them.

The C1 filter applies only to manifest entries. Custom entries typed via B2 bypass the filter; the muted advisory covers this gap.

---

### D — Search UX: D1

Replace the swatch strip with a search combobox. A native `<input type="text">` with a custom listbox (or `<datalist>` where it suffices) lives in row 1 in place of the swatch strip. The current font is shown as a single highlighted result. Typing filters the listbox. Clicking a result (or pressing Enter) selects the font and triggers lazy load + re-typeset. The six Level-1 defaults appear at the top of the listbox as a pinned group.

List overflow: CSS-bounded scrollable list (`max-height: 12rem; overflow-y: auto`). Appropriate for a 150–250-item curated catalogue; virtualise only if the catalogue expands to 500+.

---

### F — Font serving: F3 (hybrid)

The six Level-1 fonts remain self-hosted under `public/fonts/` and load instantly from cache (no change to Level 1 behaviour). All additional fonts from the extended catalogue use the Google Fonts CSS API at runtime with a "Loading font…" state during the CDN fetch. The Google Fonts CSS URL is constructed with explicit weight values (e.g. `family=Source+Serif+4:ital,wght@0,400;0,700;1,400`) to request static-instance TTFs rather than variable fonts, even though the user's browser can handle variable fonts fine — this is better practice and limits the download size.

---

## Drop-cap weight detection

Level 1 used a hand-authored `dropCapWeight` per font. With 150+ manifest families this can't be hand-mapped. The manifest JSON encodes `dropCapWeight` per entry, derived at generation time using the following heuristic applied to the family's available `variants` from the Google Fonts API:

1. If weight 500 is available → `dropCapWeight: 500`
2. Else if weight 600 is available → `dropCapWeight: 600`
3. Else if weight 700 is available but not 500/600 → `dropCapWeight: null` (drop-cap toggle disabled; tooltip as per Level 1)
4. No weights above 400 → `dropCapWeight: null`

The generation script also supports a `dropCapWeightOverride` field per family in the manifest JSON. The script skips any entry where this field is set, preserving the override across regeneration runs. The Level 1 six families are the seed override list (Fraunces: 600, Newsreader: 500, Source Serif 4: 600, EB Garamond: 500, Inter: 500, Spectral: 500).

Trade-off: the heuristic correctly assigns 500 even when the editorial intent would be to use 700 (e.g. a display family where 500 is too light for a drop cap). The override map covers the most common ~30 families where the heuristic diverges from editorial taste; a sensible default is better than no drop-cap support for the long tail.

This is not a taste call — it is a mechanical derivation of the Level 1 policy.

---

## B2 + C1 interaction: custom family runtime-detection path

When the user types a custom family name via the B2 text input, no manifest entry exists. The following runtime path applies:

1. **Load attempt.** Call `loadFont(family, [], false)` (see `google-fonts.ts` below). Without a manifest entry, the weight list and italic flag are unknown. Use `[400, 700]` as the default weight request and `true` as the default italic request (permissive — the API simply omits faces that don't exist, so no error is thrown if the family has no italic).

2. **FontFace descriptor parse.** After the Google Fonts CSS link loads, query `document.fonts` for entries matching the family name. Extract the available weights and whether an italic face loaded. Derive `dropCapWeight` from the loaded weights using the same heuristic as the generation script (500 → 600 → null).

3. **Fall back to defaults.** If `document.fonts.load(...)` resolves but no matching FontFace is found (the family name was misspelled or doesn't exist on Google Fonts), show an inline error: "Family not found on Google Fonts. Check the spelling." Revert to the previously selected font.

4. **Muted advisory.** Regardless of load success, show a muted advisory line below the custom input: "Custom entries aren't pre-filtered for variable-font compatibility. Line breaks may differ on some platforms." This covers the C1 bypass and the Playwright build-time risk.

5. **`hasItalic` and `dropCapWeight` for the `pilcrow:settings-changed` event.** Derive from the loaded FontFace descriptors (step 2). Pass these into the event's `settings` object as `dropCapWeight` (number | null) for the drop-cap gate in `Settings.astro`. The existing disable-with-tooltip logic is unchanged.

6. **Share URL.** The full custom family name is stored in `settings.font` in the encoded payload. No schema change — `v1.` version byte remains valid. On restore, the custom input field is populated and the load path re-runs.

---

## Italic-availability check

The manifest includes `hasItalic: boolean` per family, derived from the Google Fonts API `variants` array at generation time. Level 2 does not ship an italic toggle; this field is forward-compatibility only. Include it in the manifest now; wire it to UI in a future spec.

---

## Implementation notes

- **Manifest location:** `src/lib/playground/google-fonts-manifest.json`. Imported at build time into `FontPicker.astro`; included in the Astro page bundle.
- **Generation script:** `scripts/gen-google-fonts-manifest.ts`. Accepts `--key <API_KEY>` flag. Writes to `src/lib/playground/google-fonts-manifest.json`. Run manually; not part of `bun run build`. Must filter out: (a) variable-TTF-only families (C1), (b) families not in `serif | sans-serif | monospace` categories (no display/handwriting/cursive), (c) families not available in at least weight 400.
- **Manifest schema (TypeScript):**
  ```ts
  interface FontManifestEntry {
    family: string;                // e.g. "Source Serif 4"
    category: 'serif' | 'sans-serif' | 'monospace';
    weights: number[];             // static weights available, e.g. [400, 600, 700]
    hasItalic: boolean;
    dropCapWeight: number | null;  // 500, 600, or null (toggle disabled)
    dropCapWeightOverride?: number | null;  // set by hand; generation script skips
    staticOnly: boolean;           // true if no variable TTF in the release
  }
  ```
- **FontPicker component:** `src/components/playground/FontPicker.astro`. Study the Level 1 swatch row in `Settings.astro` and extend or replace it — not a parallel duplicate. The D1 combobox replaces the swatch row in the same row-1 slot.
- **`google-fonts.ts` at `src/lib/playground/google-fonts.ts`:** the font-loading module referenced in PILCROW_PLAYGROUND_PLAN.md §2. Exports `loadFont(family: string, weights: number[], hasItalic: boolean): Promise<void>` — injects the Google Fonts `<link>`, awaits `document.fonts.load(...)`, resolves. Called by the picker before dispatching `pilcrow:settings-changed`. For custom entries (B2), a second export: `detectFontFaceDescriptors(family: string): { weights: number[], hasItalic: boolean }` — queries `document.fonts` after load and returns derived metadata.
- **`window.__pilcrowSettings` mirror:** after Level 2 ships, `font` in the mirror must carry the full family name. The copy-HTML logic in `Settings.astro` that writes `@font-face` blocks needs updating: for the six self-hosted defaults, use existing `pilcrow.page/fonts/<file>.ttf` URLs; for Google Fonts API families, use the `fonts.gstatic.com` URL from the loaded `FontFace.family`.
- **URL state (`share-url.ts`):** `settings.font` is already a string in the encoded payload. The Level 2 picker stores the full family name in `settings.font`. No schema change required; the `v1.` version byte remains valid.
- **Drop-cap gate in `Settings.astro`:** the per-swatch `data-drop-cap-weight` attribute pattern from Level 1 extends naturally to the picker — the manifest's `dropCapWeight` field (or the runtime-detected value for custom entries) becomes the active value. The existing disable-with-tooltip logic is unchanged.
- **Loading state:** while a Google Fonts CDN fetch is in flight, the preview host must show a "Loading font…" indicator (not a blank pane, not an error). Dispatch `pilcrow:settings-changed` only after `document.fonts.load(...)` resolves — the paste-to-typeset budget applies to the typeset step, not the font-fetch step.

---

## Out of scope (explicit)

- Image upload, shape-outside text wrap (Level 3 — not this spec).
- Display/heading font picker (Level 2 targets body font only; display font is a future extension).
- Font pairing suggestions (Level 5 per PILCROW_PLAYGROUND_PLAN.md §9 anti-goals).
- Font preview thumbnails / specimen renders in the picker (PILCROW_PLAYGROUND_PLAN.md §4 anti-goals: "plain text dropdown is fine for v0").
- Arbitrary font file upload.
- OG card font changes (OG cards use static `Fraunces144pt-Bold.ttf` unconditionally; playground font choice does not affect them).
- Extending the manifest to non-Google sources (Adobe Fonts, Fontshare, etc.).

---

## Dependencies

- Requires Level 1 (Playground baseline) — COMPLETE as of 2026-05-08.
- Google Fonts API key required in `.env` for manifest regeneration. Not required for building or deploying.

---

## Checks

- [ ] `bun run build` passes cleanly. No new `[pilcrow]` warnings.
- [ ] No new TypeScript errors. No `any` types.
- [ ] Font picker shows the full manifest catalogue, searchable via D1 combobox. Six Level-1 defaults pinned at the top of the list.
- [ ] Selecting a new font triggers lazy load + re-typeset. Preview updates with correct line breaks.
- [ ] Paste-to-typeset roundtrip after a font is already loaded stays under 100ms (Playwright headless measurement against `bun run preview`).
- [ ] First font selection shows "Loading font..." in the preview during the Google Fonts CDN fetch (for non-self-hosted families).
- [ ] Drop-cap toggle disables correctly for families where `dropCapWeight` is null (manifest entry or runtime-detected).
- [ ] Share URL round-trip: encode + decode preserves the full family name, not an index.
- [ ] Copy HTML button output uses the correct font URL for both self-hosted and CDN-loaded families.
- [ ] JS-disabled fallback: picker renders as a `<select>` or equivalent native element; layout does not break.
- [ ] Level 1 six-font defaults remain available and load instantly from `public/fonts/` (no regression).
- [ ] Custom family B2 input: valid name loads font, derives dropCapWeight, shows muted advisory. Invalid name shows inline error and reverts to previous font.
- [ ] Custom family B2 input: share-URL round-trip correctly restores the custom family name and re-runs the load path.
- [ ] Progress tracker updated: this spec moved to `completed`, decision log appended.
