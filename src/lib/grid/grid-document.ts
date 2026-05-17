/**
 * GridDocument — the editor's in-memory model.
 *
 * Part of Deliverable B (Spec 02-B). The editor parses directive markdown
 * into a GridDocument, mutates it as the user edits, and serialises back to
 * markdown on a debounced change handler.
 *
 * Type relationship to the renderer's mdast plugin:
 *   packages/pilcrow-typeset/src/plugins/remark-grid.ts exports GridCellSpec
 *   and GridSpec — the renderer's view of the same primitives. EditorCell
 *   here is intentionally a superset (adds `text: string` for the cell's
 *   raw content, which the mdast plugin doesn't track because mdast holds
 *   child nodes instead).
 *
 * Type relationship to the directive markdown:
 *   ::::grid{fields=16}
 *
 *   :::cell{id=1 colspan=2 fill=accent}
 *   The cell text, preserved verbatim
 *   :::
 *
 *   ::::
 *
 *   ──→ GridDocument { fields: 16, cells: [{ id: 1, colspan: 2, fill: 'accent', kind: 'text', text: 'The cell text, preserved verbatim', ... }] }
 */

/** Grid container's field count. Three discrete values per A5a (portrait matrices). */
export type GridFields = 8 | 16 | 32;

/** Cell content kind. */
export type CellKind = 'text' | 'image' | 'empty';

/** Cell colour fill — composes from the five :root tokens. Undefined = no fill (paper cascade). */
export type CellFill = 'paper' | 'muted' | 'accent' | 'rule' | undefined;

/**
 * A single cell in the editor's in-memory model.
 *
 * Differs from remark-grid.ts's GridCellSpec by carrying `text` — the raw
 * cell content as a string. (The renderer side holds children as mdast
 * nodes; the editor side holds them as a flat string per B3a.)
 */
export interface EditorCell {
  /** 1-based positive integer. Stable across edits. */
  id: number;
  /** Default 1. Bounded by grid columns. */
  colspan: number;
  /** Default 1. Bounded by grid rows. */
  rowspan: number;
  /** 1-based explicit start column. Undefined → implicit flow placement. */
  colstart?: number;
  /** 1-based explicit start row. */
  rowstart?: number;
  /** Default 'text'. */
  kind: CellKind;
  /** Undefined means use the default paper colour cascade. */
  fill?: CellFill;
  /** Required when kind === 'image'. Accessibility text for placeholder. */
  alt?: string;
  /**
   * Raw cell content as a single string (B3a — plain-text contenteditable).
   * Preserved verbatim from the directive markdown, including any Markdown
   * syntax characters (#, *, _, etc.) which the build-time renderer will
   * process. The editor displays the raw string; the published post shows
   * the rendered output. WYSIWYG mismatch by design.
   */
  text: string;
}

/**
 * The complete in-memory model of one grid the editor is currently editing.
 */
export interface GridDocument {
  fields: GridFields;
  cells: EditorCell[];
}

/** Canonical matrices per Spec 02-A A5a (portrait orientation). */
export const GRID_MATRIX: Record<GridFields, { cols: number; rows: number }> = {
  8: { cols: 2, rows: 4 },
  16: { cols: 4, rows: 4 },
  32: { cols: 4, rows: 8 },
};

/**
 * Create an empty GridDocument for a fresh editor session.
 * Used when no initial directive markdown is supplied.
 */
export function emptyGridDocument(fields: GridFields = 8): GridDocument {
  return { fields, cells: [] };
}

/**
 * Allocate a fresh cell id by finding the max existing id + 1.
 * 1-based; stable; not reused even when cells are deleted (so undo/redo,
 * shouldn't they ship, would still work).
 */
export function nextCellId(doc: GridDocument): number {
  if (doc.cells.length === 0) return 1;
  let max = 0;
  for (const cell of doc.cells) {
    if (cell.id > max) max = cell.id;
  }
  return max + 1;
}
