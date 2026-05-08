/**
 * Pilcrow Playground — share-URL encode/decode helpers.
 * Sub-task 9 of PILCROW_PLAYGROUND_PLAN.md.
 *
 * Encoding scheme: `#v1.<lz-string compressed + URI-component-safe base64>`
 *
 * The 'v1' prefix is a version byte. If the schema changes in future,
 * the decoder can recognise 'v2' (or unknown versions) and either apply
 * a shim or fail gracefully — instead of silently decoding garbage.
 *
 * Payload: JSON({ settings: PlaygroundSettings, markdown: string })
 * Compression: lz-string.compressToEncodedURIComponent (MIT, ~5 KB,
 *   designed exactly for URL-hash storage — output is URI-safe base64).
 *
 * URL-length threshold: 2000 chars. Realistic 500-word posts (~3 KB raw
 * markdown) compress to ~750–1000 bytes, well under this. If the encoded
 * hash DOES exceed 2000 chars, the Share button reports "Copied — long URL"
 * rather than "Copied!" — silent degradation, no blocking error.
 *
 * JS-disabled: Share button is a visible no-op. Page with hash present
 * and JS disabled renders with default state — not a regression since the
 * playground's interactivity already requires JS.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

export interface PlaygroundSettings {
  font: string;
  dropCap: boolean;
  hyphenation: boolean;
  measure: number;
  lineHeight: number;
}

export interface SharePayload {
  settings: PlaygroundSettings;
  markdown: string;
}

/** The hash prefix that identifies this encoding version. */
const VERSION_PREFIX = 'v1.';

/** URL hash length beyond which we warn the user (some sharing surfaces truncate). */
export const SHARE_URL_LONG_THRESHOLD = 2000;

/**
 * Encode `settings + markdown` into a URL hash string.
 *
 * Returns a string of the form `#v1.<lz-compressed-base64-uri-safe>`.
 * The caller should assign this to `window.location.hash`.
 */
export function encodeShareURL(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const compressed = compressToEncodedURIComponent(json);
  return `#${VERSION_PREFIX}${compressed}`;
}

/**
 * Decode a URL hash string previously produced by `encodeShareURL`.
 *
 * Returns the decoded `SharePayload`, or `null` if:
 *   - The hash is missing or doesn't start with the version prefix.
 *   - The decompressed string is not valid JSON.
 *   - The version prefix is unrecognised (future-proofing — a `#v2.…`
 *     hash from a future client will return null here, so the page falls
 *     back to defaults rather than crashing).
 *   - Any other decode error.
 *
 * Callers should `console.warn` the null result so developers can debug
 * malformed / stale share URLs without exposing an error to end users.
 */
export function decodeShareURL(hash: string): SharePayload | null {
  if (!hash || !hash.startsWith('#')) return null;

  const body = hash.slice(1); // strip '#'
  if (!body.startsWith(VERSION_PREFIX)) {
    // Unknown version or empty — not our format. Fail gracefully.
    return null;
  }

  const encoded = body.slice(VERSION_PREFIX.length);
  if (!encoded) return null;

  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(encoded);
  } catch {
    return null;
  }

  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isSharePayload(parsed)) return null;
  return parsed;
}

/**
 * Runtime type-guard for SharePayload. Validates both presence and types
 * of required fields — prevents a corrupted/stale hash from causing
 * TypeErrors later in the restore path.
 */
function isSharePayload(value: unknown): value is SharePayload {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;

  // Validate settings object.
  const s = obj['settings'];
  if (typeof s !== 'object' || s === null) return false;
  const settings = s as Record<string, unknown>;
  if (typeof settings['font'] !== 'string') return false;
  if (typeof settings['dropCap'] !== 'boolean') return false;
  if (typeof settings['hyphenation'] !== 'boolean') return false;
  if (typeof settings['measure'] !== 'number') return false;
  if (typeof settings['lineHeight'] !== 'number') return false;

  // Validate markdown.
  if (typeof obj['markdown'] !== 'string') return false;

  return true;
}
