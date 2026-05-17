/**
 * parse-directive — directive markdown → GridDocument.
 *
 * Part of Deliverable B (Spec 02-B). Pure function; no DOM, no I/O.
 *
 * Why a hand-rolled parser instead of reusing remark-directive at runtime:
 *   - remark-directive + unified + mdast tooling totals ~50KB compressed.
 *     The editor's bundle target is <10KB total. Importing the full markdown
 *     pipeline at editor runtime would blow the budget.
 *   - The directive grammar we need to support is small and well-defined:
 *     one outer container per grid, N inner cell containers, key=value attrs
 *     in curly braces. Hand-rolling a parser for this surface is ~150 lines
 *     and tractable.
 *   - The build-time renderer (remark-grid.ts) continues to use the full
 *     remark-directive pipeline for the canonical post HTML output. This
 *     editor parser is a runtime-only convenience that produces the editor's
 *     in-memory model.
 *
 * Grammar (informal):
 *   GRID         := OPEN_GRID NEWLINE+ (CELL | EMPTY_LINE)* CLOSE_GRID
 *   OPEN_GRID    := /^:{4,}grid\{[^}]*\}\s*$/
 *   CLOSE_GRID   := /^:{4,}\s*$/  (same colon-count as the opening)
 *   CELL         := OPEN_CELL NEWLINE+ CONTENT_LINE* CLOSE_CELL
 *   OPEN_CELL    := /^:{3,}cell\{[^}]*\}\s*$/  (colon-count one less than grid)
 *   CLOSE_CELL   := /^:{3,}\s*$/  (same colon-count as the cell opener)
 *   CONTENT_LINE := any line not matching a CELL boundary
 *   EMPTY_LINE   := /^\s*$/
 *
 * Round-trip guarantee: parse(serialize(doc)) === doc (deep equality) for all
 * documents the editor produces. The reverse — serialize(parse(md)) === md —
 * is NOT guaranteed (the parser normalises whitespace and attribute order);
 * but parse(serialize(parse(md))) === parse(md), which is what round-trip
 * actually means.
 *
 * Error handling: malformed input returns null. The editor falls back to an
 * empty GridDocument when null is returned, with a UI warning.
 */

import type { GridDocument, EditorCell, GridFields, CellKind, CellFill } from './grid-document.js';

// ─── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Parse a directive markdown string into a GridDocument.
 * Returns null if no valid grid is found or the input is malformed.
 *
 * Only the FIRST grid in the markdown is parsed — multi-grid posts are out
 * of scope for the editor (each grid edits as its own document).
 */
export function parseDirective(markdown: string): GridDocument | null {
  const lines = markdown.split('\n');
  const gridOpenMatch = findGridOpener(lines);
  if (gridOpenMatch === null) return null;

  const { lineIndex: openIndex, fields, colonCount } = gridOpenMatch;

  // Find the matching close: same colon count, at column 0, "::::" alone.
  let closeIndex = -1;
  const closeRe = new RegExp(`^:{${colonCount}}\\s*$`);
  for (let i = openIndex + 1; i < lines.length; i++) {
    if (closeRe.test(lines[i]!)) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) return null;

  const cells = parseCells(lines, openIndex + 1, closeIndex, colonCount);

  return { fields, cells };
}

// ─── INTERNAL ──────────────────────────────────────────────────────────────────

interface GridOpenMatch {
  lineIndex: number;
  fields: GridFields;
  colonCount: number;
}

/**
 * Find the first ::::grid{fields=N} opener in the lines array. Returns null
 * if none is found, or if the opener is malformed (missing fields, invalid
 * field count).
 */
function findGridOpener(lines: string[]): GridOpenMatch | null {
  // Opener: 4 or more colons, then "grid", then "{...}".
  const re = /^(:{4,})grid\{([^}]*)\}\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (!m) continue;
    const colonCount = m[1]!.length;
    const attrs = parseAttributes(m[2]!);
    const fieldsRaw = attrs['fields'];
    if (fieldsRaw === undefined) continue;
    const fields = parseFields(fieldsRaw);
    if (fields === null) continue;
    return { lineIndex: i, fields, colonCount };
  }
  return null;
}

/**
 * Parse cells from `lines[startIndex..endIndex)`. Cells must use one less
 * colon than the grid (per the recursive colon-count rule).
 */
function parseCells(
  lines: string[],
  startIndex: number,
  endIndex: number,
  gridColonCount: number,
): EditorCell[] {
  const cellColonCount = gridColonCount - 1;
  const openRe = new RegExp(`^:{${cellColonCount}}cell\\{([^}]*)\\}\\s*$`);
  const closeRe = new RegExp(`^:{${cellColonCount}}\\s*$`);

  const cells: EditorCell[] = [];
  let autoIdCounter = 0;
  let i = startIndex;

  while (i < endIndex) {
    const line = lines[i]!;
    const openM = openRe.exec(line);
    if (!openM) {
      i++;
      continue;
    }

    // Found a cell opener. Find its matching close.
    const cellOpenIndex = i;
    let cellCloseIndex = -1;
    for (let j = cellOpenIndex + 1; j < endIndex; j++) {
      if (closeRe.test(lines[j]!)) {
        cellCloseIndex = j;
        break;
      }
    }
    if (cellCloseIndex === -1) {
      // Malformed: opener without close. Skip this cell.
      i++;
      continue;
    }

    autoIdCounter++;
    const attrs = parseAttributes(openM[1]!);
    // Build the cell with only-defined fields. Avoids `colstart: undefined` /
    // `fill: undefined` keys, which (a) leak undefined into Object.keys() and
    // (b) bloat JSON output. Required fields always set; optional fields
    // conditional via Object.assign.
    const cell: EditorCell = {
      id: parsePositiveInt(attrs['id'], autoIdCounter)!,
      colspan: parsePositiveInt(attrs['colspan'], 1)!,
      rowspan: parsePositiveInt(attrs['rowspan'], 1)!,
      kind: parseKind(attrs['kind']),
      text: lines.slice(cellOpenIndex + 1, cellCloseIndex).join('\n').trim(),
    };
    const colstart = parsePositiveInt(attrs['colstart']);
    if (colstart !== undefined) cell.colstart = colstart;
    const rowstart = parsePositiveInt(attrs['rowstart']);
    if (rowstart !== undefined) cell.rowstart = rowstart;
    const fill = parseFill(attrs['fill']);
    if (fill !== undefined) cell.fill = fill;
    if (attrs['alt'] !== undefined) cell.alt = attrs['alt'];

    cells.push(cell);
    i = cellCloseIndex + 1;
  }

  return cells;
}

/**
 * Parse a key=value attribute string from inside `{...}`.
 * Supports unquoted values (no spaces), double-quoted values, and
 * single-quoted values (matching remark-directive's attribute parser).
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Same regex as remark-grid.ts's bare-attribute tokeniser (now retired in
  // remark-grid but still relevant here for parsing curly-brace content).
  const re = /([a-z][a-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString)) !== null) {
    const key = m[1]!;
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

function parsePositiveInt(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function parseFields(value: string): GridFields | null {
  const n = parseInt(value, 10);
  if (n === 8 || n === 16 || n === 32) return n;
  return null;
}

function parseKind(value: string | undefined): CellKind {
  if (value === 'image' || value === 'empty') return value;
  return 'text';
}

function parseFill(value: string | undefined): CellFill {
  if (value === 'paper' || value === 'muted' || value === 'accent' || value === 'rule') return value;
  return undefined;
}
