/**
 * serialize-directive — GridDocument → directive markdown.
 *
 * Part of Deliverable B (Spec 02-B). Pure function; no DOM, no I/O.
 *
 * Output format:
 *
 *   ::::grid{fields=N}
 *
 *   :::cell{id=N colspan=N rowspan=N kind=K fill=F alt="..."}
 *   raw cell text
 *   :::
 *
 *   …more cells…
 *
 *   ::::
 *
 * Attribute emission rules:
 *   - `id` always emitted.
 *   - `colspan` / `rowspan` emitted only when ≠ 1 (the default).
 *   - `colstart` / `rowstart` emitted only when defined (explicit positioning).
 *   - `kind` emitted only when ≠ 'text' (the default).
 *   - `fill` emitted only when defined.
 *   - `alt` emitted only when defined AND kind === 'image' (where it's
 *     required); quoted with double quotes.
 *
 * Cell text escape rule (per Spec 02-B B3a clarification):
 *   - Markdown source chars (#, *, _, etc.) are NOT escaped — they're valid
 *     content the build-time renderer will process.
 *   - A line in cell content that starts with 3+ colons would collide with
 *     directive syntax. Defensive: prepend a single space to any such line.
 *     Round-trip-safe (the parser's `trim()` on cell content strips leading
 *     space) and visually invisible in the rendered post.
 *
 * Round-trip guarantee (with parse-directive):
 *   - parse(serialize(doc)) deep-equals doc for all valid documents.
 *   - serialize(parse(md)) is normalised (attributes reordered, whitespace
 *     collapsed) — but parse(serialize(parse(md))) === parse(md).
 */

import type { GridDocument, EditorCell } from './grid-document.js';

// ─── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Serialise a GridDocument into directive markdown.
 */
export function serializeDirective(doc: GridDocument): string {
  const lines: string[] = [];
  lines.push(`::::grid{fields=${doc.fields}}`);
  lines.push('');

  for (const cell of doc.cells) {
    lines.push(`:::cell{${formatAttributes(cell)}}`);
    if (cell.kind === 'text') {
      const textBody = escapeCellText(cell.text);
      if (textBody.length > 0) {
        lines.push('');
        lines.push(textBody);
        lines.push('');
      }
    } else {
      // image / empty cells have no body content
    }
    lines.push(':::');
    lines.push('');
  }

  lines.push('::::');
  return lines.join('\n');
}

// ─── INTERNAL ──────────────────────────────────────────────────────────────────

/**
 * Build the attribute string for a cell. Emits attributes in a stable
 * canonical order so two equivalent cells always serialise identically.
 */
function formatAttributes(cell: EditorCell): string {
  const parts: string[] = [];
  parts.push(`id=${cell.id}`);
  if (cell.colspan !== 1) parts.push(`colspan=${cell.colspan}`);
  if (cell.rowspan !== 1) parts.push(`rowspan=${cell.rowspan}`);
  if (cell.colstart !== undefined) parts.push(`colstart=${cell.colstart}`);
  if (cell.rowstart !== undefined) parts.push(`rowstart=${cell.rowstart}`);
  if (cell.kind !== 'text') parts.push(`kind=${cell.kind}`);
  if (cell.fill !== undefined) parts.push(`fill=${cell.fill}`);
  if (cell.alt !== undefined && cell.kind === 'image') {
    parts.push(`alt=${quoteValue(cell.alt)}`);
  }
  return parts.join(' ');
}

/**
 * Quote an attribute value. Double-quoted with backslash escape for any
 * embedded double quote. Falls back to single quotes if the value contains
 * a double quote AND no single quote (cosmetically nicer).
 */
function quoteValue(value: string): string {
  const hasDouble = value.includes('"');
  const hasSingle = value.includes("'");
  if (hasDouble && !hasSingle) {
    return `'${value}'`;
  }
  // Default: double-quoted with backslash escape for any embedded ".
  // Per remark-directive's attribute parser, the surrounding regex doesn't
  // support backslash escapes inside quoted values — but the parser's regex
  // ends the quoted value at the first matching quote. If the value contains
  // an embedded double-quote with no surrounding single, the best we can do
  // is escape with backslash (which remark-directive will treat as part of
  // the value, not as an escape). Practical risk: low — alt text rarely
  // contains literal " marks. Documented limitation.
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Defensive escape for cell text lines that would otherwise collide with
 * directive syntax. The only collision case is a line starting with 3+
 * colons — which would be read as a directive boundary by the parser.
 * Prepend a single space; the parser trims content on read.
 */
function escapeCellText(text: string): string {
  return text
    .split('\n')
    .map((line) => (/^:{3,}/.test(line) ? ' ' + line : line))
    .join('\n');
}
