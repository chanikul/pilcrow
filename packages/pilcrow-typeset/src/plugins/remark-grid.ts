/**
 * remark-grid — Pilcrow grid composition directive.
 *
 * Part of the Grid Composition sprint (master plan §11 entry 24).
 * Spec: pilcrow/context/feature-specs/02-A-grid-directive-html.md
 * Sprint plan: ~/Sandbox/PILCROW_GRID_SPRINT_PLAN.md §3 Deliverable A.
 *
 * Transforms ::::grid container directives into the canonical grid HTML shell,
 * with nested :::cell directives becoming individual cell elements:
 *
 *   <div class="pilcrow-grid" data-grid-fields="16" style="--grid-cols: 4; --grid-rows: 4;">
 *     <div class="pilcrow-grid-cell" data-cell-id="1" data-cell-kind="text" data-cell-fill="accent">
 *       <p>…cell text…</p>
 *     </div>
 *     …
 *   </div>
 *
 * Cell positioning (grid-column / grid-row inline style) is computed in this
 * plugin too, inside the same visit callback — there's no need for a separate
 * rehype-grid plugin because the layout work is per-container (occupancy
 * scanner inside one grid) and doesn't require hast-level cross-element
 * coordination. Contrast with rehype-hoist-sidenotes, which has to lift asides
 * across the .post-body tree and therefore needs hast.
 *
 * ─── Authoring syntax (curly-brace attrs; A1 resolved to A1b — see below) ────
 *
 * IMPORTANT — colon counts: outer container uses 4 colons (::::grid), inner
 * cells use 3 colons (:::cell). remark-directive's nesting rule requires the
 * outer to have MORE colons than the inner — a `:::` close otherwise closes
 * the OUTERMOST open container, not the innermost. The rule applies
 * recursively: a grid that contains a cell that contains a :::sidenote needs
 * 5 outer colons (`:::::grid`) + 4 cell colons (`::::cell`) + 3 sidenote
 * colons (`:::sidenote`). See src/content/posts/grid-demo.md's cross-primitive
 * section for the canonical example.
 *
 * ─── any-usage exemption (per claude-code review 2026-05-17) ─────────────────
 *
 * This file uses `any` in several places (file, node, inner, cellNodes,
 * directive). CLAUDE.md forbids any in TypeScript as a general rule, but
 * remark plugin code is exempted by precedent: every existing Pilcrow remark
 * plugin (remark-pullquote, remark-sidenote, remark-shape-around) uses the
 * same pattern because:
 *   1. unist-util-visit's Visitor signature does not generic-narrow on the
 *      directive name parameter — the callback's node arg is typed as the
 *      union of all matched node types, with no compile-time link to the
 *      filter string passed to visit().
 *   2. mdast-util-directive's ContainerDirective type doesn't include the
 *      data.hName / data.hProperties / data.gridCellSpec / data.gridSpec
 *      fields this plugin sets (those are mdast-util-to-hast extension
 *      conventions, not core mdast).
 *   3. The directiveLabel filter for paragraph children requires reading a
 *      data field that isn't in the public Paragraph type.
 * Narrowing all of this would require either local declaration merges (which
 * leak into every consumer) or a custom .d.ts shim (which duplicates
 * upstream types). The pragmatic call: keep `any` here, document the reason
 * explicitly, and confine the type-loose surface to remark plugins. The
 * surrounding code (renderer.ts, playwright.ts, etc.) remains strict.
 *
 * IMPORTANT — attribute syntax: remark-directive ONLY parses curly-brace
 * attributes (`:::name{key=value}`). Bare key=value (`:::name key=value`) is
 * not recognised by the parser — the entire line falls back to a paragraph
 * text node. The A1 sub-taste-call originally resolved to A1a (bare syntax),
 * which was reopened on 2026-05-17 after this constraint was discovered.
 * A1b (curly-brace) is the only working syntax.
 *
 *   ::::grid{fields=16}
 *
 *   :::cell{id=1 colspan=2}
 *   The Art of Living with Less
 *   :::
 *
 *   :::cell{id=3 colspan=2 rowspan=2 kind=image alt="modern dining room"}
 *   :::
 *
 *   :::cell{id=5 colspan=4 fill=accent}
 *   In a world filled with noise and constant stimulation…
 *   :::
 *
 *   ::::
 *
 * Grid attributes:
 *   fields=N         REQUIRED. One of 8, 16, 32. Canonical matrices: 8 = 2×4,
 *                    16 = 4×4, 32 = 4×8 (portrait orientation, A5a).
 *
 * Cell attributes:
 *   id=N             RECOMMENDED. 1-based positive integer; used for warnings
 *                    and the data-cell-id attribute. If absent, an auto-id
 *                    is assigned in DOM order.
 *   colspan=N        OPTIONAL. Defaults to 1. Must be ≤ grid columns.
 *   rowspan=N        OPTIONAL. Defaults to 1. Must be ≤ grid rows.
 *   colstart=N       OPTIONAL. 1-based explicit column start. If omitted,
 *                    the occupancy scanner assigns implicitly (A4a).
 *   rowstart=N       OPTIONAL. 1-based explicit row start. Same rule.
 *   kind=K           OPTIONAL. text | image | empty. Defaults to text.
 *   fill=F           OPTIONAL. paper | muted | accent | rule. Defaults to no
 *                    fill (paper-coloured by default cascade).
 *   alt="…"          REQUIRED when kind=image. Accessibility text for the
 *                    placeholder silhouette. Quoted values supported natively
 *                    by remark-directive's attribute parser.
 *
 * ─── Cross-primitive policy ────────────────────────────────────────────────────
 *
 *   :::grid inside ::::grid       — ERROR. Inner grid is neutralised with a
 *                                    build warning text node. Outer grid renders.
 *   :::pullquote inside :::cell   — Warn-and-render. Pullquote emits normally;
 *                                    cell layout may look unexpected.
 *   :::sidenote inside :::cell    — Warn. The existing rehype-hoist-sidenotes
 *                                    plugin lifts the aside to .post-body level
 *                                    where Grid placement works. The sidenote
 *                                    may appear visually disconnected from its
 *                                    anchor cell — documented limitation, in
 *                                    02-A-cross-primitive-matrix.md.
 *   Footnote markers inside cell  — No special handling. Footnote list lives at
 *                                    post bottom outside any grid.
 *
 * ─── Plugin order ──────────────────────────────────────────────────────────────
 *
 * Register AFTER remarkSidenote (so sidenote directives inside cells are
 * already transformed by the time grid processes its children).
 *
 *   remark: [remarkDirective, remarkPullquote, remarkSidenote, remarkShapeAround, remarkGrid]
 *
 * No paired rehype plugin: layout work consolidated here (per-container, not
 * cross-tree). Contrast with rehype-hoist-sidenotes (cross-tree hoisting).
 *
 * ─── Test fixtures ─────────────────────────────────────────────────────────────
 *
 * Sample post:           src/content/posts/grid-demo.md
 * Cross-primitive matrix: context/feature-specs/02-A-cross-primitive-matrix.md
 * Acceptance gate:       scripts/gate-playground-acceptance.mjs (canonical
 *                        8-field demo)
 */

import type { Root, BlockContent, DefinitionContent } from 'mdast';
import { visit } from 'unist-util-visit';

// ─── TYPE DEFINITIONS ──────────────────────────────────────────────────────────

/**
 * Cell topology stamped on each cell mdast node via data.gridCellSpec.
 * Internal to this plugin; not consumed by downstream rehype because hast
 * doesn't carry mdast data fields. The plugin uses this for its own layout
 * pass before stamping data-* attributes + style on the cell's hProperties.
 */
export interface GridCellSpec {
  /** 1-based positive integer. Optional in authoring; auto-assigned if absent. */
  id?: number;
  /** Default 1. */
  colspan: number;
  /** Default 1. */
  rowspan: number;
  /** 1-based explicit start column. If undefined, implicit flow places the cell. */
  colstart?: number;
  /** 1-based explicit start row. */
  rowstart?: number;
  /** Default 'text'. */
  kind: 'text' | 'image' | 'empty';
  /** No default fill — undefined means use the default paper colour cascade. */
  fill?: 'paper' | 'muted' | 'accent' | 'rule';
  /** Required when kind === 'image'. */
  alt?: string;
}

/**
 * Grid-container topology stamped via data.gridSpec.
 */
export interface GridSpec {
  fields: 8 | 16 | 32;
  cols: number;
  rows: number;
}

/** Canonical matrices for the three discrete field counts (A5a, portrait). */
const MATRIX: Record<8 | 16 | 32, { cols: number; rows: number }> = {
  8: { cols: 2, rows: 4 },
  16: { cols: 4, rows: 4 },
  32: { cols: 4, rows: 8 },
};

// ─── ATTRIBUTE VALIDATION HELPERS ──────────────────────────────────────────────

function parsePositiveInt(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function parseFields(value: string | undefined): 8 | 16 | 32 | undefined {
  const n = parsePositiveInt(value);
  if (n === 8 || n === 16 || n === 32) return n;
  return undefined;
}

function parseKind(value: string | undefined): 'text' | 'image' | 'empty' {
  if (value === 'image' || value === 'empty') return value;
  return 'text';
}

function parseFill(value: string | undefined): 'paper' | 'muted' | 'accent' | 'rule' | undefined {
  if (value === 'paper' || value === 'muted' || value === 'accent' || value === 'rule') return value;
  return undefined;
}

// ─── MAIN PLUGIN ───────────────────────────────────────────────────────────────

/**
 * remarkGrid — the plugin factory.
 * Must be registered AFTER remarkDirective and AFTER remarkSidenote.
 */
export default function remarkGrid() {
  return (tree: Root, file: any) => {
    const postPath: string = (file.history?.[0] as string | undefined) ?? 'unknown';

    // ─── First pass: detect nested grids (inner grid inside outer grid) ────────
    // Done up-front so we can warn + neutralise before the main transform.
    visit(tree, 'containerDirective', (node: any) => {
      if (node.name !== 'grid') return;
      visit(node, 'containerDirective', (inner: any) => {
        if (inner === node) return;
        if (inner.name === 'grid') {
          process.stderr.write(
            `[pilcrow] ${postPath}: nested grid inside grid is not supported — inner grid neutralised.\n`,
          );
          inner.children = [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value: '[pilcrow: nested grid is not supported — see build warning]',
                },
              ],
            },
          ];
          inner.name = 'grid-error';
          return 'skip' as any;
        }
        return;
      });
    });

    // ─── Main pass: transform grid + nested cells ──────────────────────────────
    visit(tree, 'containerDirective', (node: any) => {
      if (node.name !== 'grid') return;

      // remark-directive populates node.attributes natively when the directive
      // uses the curly-brace form. No custom tokenisation needed.
      const gridAttrs = (node.attributes ?? {}) as Record<string, string>;
      const fields = parseFields(gridAttrs.fields);

      if (fields === undefined) {
        process.stderr.write(
          `[pilcrow] ${postPath}: ::::grid is missing required \`fields=N\` attribute (must be 8, 16, or 32). Use ::::grid{fields=8|16|32}. Skipping grid.\n`,
        );
        node.data = node.data ?? {};
        node.data.hName = 'div';
        node.data.hProperties = { className: ['pilcrow-grid-error'] };
        node.children = [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: '[pilcrow: grid missing fields attribute — see build warning]' },
            ],
          },
        ];
        return;
      }

      const { cols, rows } = MATRIX[fields];

      // ─── Walk the grid's direct children to find cell directives ─────────────
      const cellNodes: any[] = [];
      let autoIdCounter = 0;

      for (const child of node.children as Array<BlockContent | DefinitionContent>) {
        if ((child as any).type !== 'containerDirective') {
          // Stray content inside the grid container. Warn unless whitespace-only.
          const isWhitespaceOnly =
            (child as any).type === 'text' && /^\s*$/.test((child as any).value);
          if (!isWhitespaceOnly) {
            process.stderr.write(
              `[pilcrow] ${postPath}: ::::grid contains non-cell content (${(child as any).type}) — dropped. Wrap content in :::cell{…} blocks.\n`,
            );
          }
          continue;
        }

        const directive = child as any;
        if (directive.name === 'grid-error') {
          directive.data = directive.data ?? {};
          directive.data.hName = 'div';
          directive.data.hProperties = { className: ['pilcrow-grid-error'] };
          cellNodes.push(directive);
          continue;
        }

        if (directive.name !== 'cell') {
          process.stderr.write(
            `[pilcrow] ${postPath}: ::::grid contains unsupported directive :::${directive.name}::: — dropped. Only :::cell{…} is allowed as a direct child.\n`,
          );
          continue;
        }

        // remark-directive populates node.attributes natively.
        const cellAttrs = (directive.attributes ?? {}) as Record<string, string>;
        autoIdCounter++;

        const spec: GridCellSpec = {
          id: parsePositiveInt(cellAttrs.id, autoIdCounter),
          colspan: parsePositiveInt(cellAttrs.colspan, 1) ?? 1,
          rowspan: parsePositiveInt(cellAttrs.rowspan, 1) ?? 1,
          colstart: parsePositiveInt(cellAttrs.colstart),
          rowstart: parsePositiveInt(cellAttrs.rowstart),
          kind: parseKind(cellAttrs.kind),
          fill: parseFill(cellAttrs.fill),
          alt: cellAttrs.alt,
        };

        // Bounds checks.
        if (spec.colspan > cols) {
          process.stderr.write(
            `[pilcrow] ${postPath}: cell #${spec.id} colspan=${spec.colspan} exceeds grid columns (${cols}). Clamping to ${cols}.\n`,
          );
          spec.colspan = cols;
        }
        if (spec.rowspan > rows) {
          process.stderr.write(
            `[pilcrow] ${postPath}: cell #${spec.id} rowspan=${spec.rowspan} exceeds grid rows (${rows}). Clamping to ${rows}.\n`,
          );
          spec.rowspan = rows;
        }

        // Image cell alt requirement.
        if (spec.kind === 'image' && (!spec.alt || spec.alt.length === 0)) {
          process.stderr.write(
            `[pilcrow] ${postPath}: cell #${spec.id} is kind=image but has no alt="…" — accessibility warning. Empty alt will be used.\n`,
          );
          spec.alt = '';
        }

        // Cross-primitive detection: sidenote or pullquote nested in this cell.
        visit(directive, 'containerDirective', (inner: any) => {
          if (inner === directive) return;
          if (inner.name === 'sidenote') {
            process.stderr.write(
              `[pilcrow] ${postPath}: sidenote inside cell #${spec.id} — sidenote will be hoisted to .post-body by rehype-hoist-sidenotes and may render visually disconnected from the cell. Known limitation (A2a).\n`,
            );
          } else if (inner.name === 'pullquote') {
            process.stderr.write(
              `[pilcrow] ${postPath}: pullquote inside cell #${spec.id} — pullquote will render normally; cell layout may look unexpected.\n`,
            );
          }
          return;
        });

        // Stamp hast metadata on the cell node. Inline style for grid-column /
        // grid-row is added below by the layout pass.
        directive.data = directive.data ?? {};
        directive.data.hName = 'div';
        directive.data.hProperties = {
          className: ['pilcrow-grid-cell'],
          dataCellId: String(spec.id),
          dataCellKind: spec.kind,
          ...(spec.fill ? { dataCellFill: spec.fill } : {}),
          ...(spec.kind === 'image' ? { dataCellAlt: spec.alt ?? '' } : {}),
        };
        directive.data.gridCellSpec = spec;

        // For image cells, replace the body with a placeholder SVG silhouette.
        if (spec.kind === 'image') {
          directive.children = [
            {
              type: 'paragraph',
              children: [],
              data: {
                hName: 'svg',
                hProperties: {
                  className: ['pilcrow-grid-cell-image-placeholder'],
                  viewBox: '0 0 100 100',
                  preserveAspectRatio: 'xMidYMid slice',
                  role: 'img',
                  ariaLabel: spec.alt ?? '',
                },
                hChildren: [
                  {
                    type: 'element',
                    tagName: 'rect',
                    properties: { x: '0', y: '0', width: '100', height: '100', fill: 'var(--rule)' },
                    children: [],
                  },
                  {
                    type: 'element',
                    tagName: 'line',
                    properties: { x1: '0', y1: '0', x2: '100', y2: '100', stroke: 'var(--muted)', strokeWidth: '0.5' },
                    children: [],
                  },
                  {
                    type: 'element',
                    tagName: 'line',
                    properties: { x1: '100', y1: '0', x2: '0', y2: '100', stroke: 'var(--muted)', strokeWidth: '0.5' },
                    children: [],
                  },
                ],
              },
            },
          ];
        } else if (spec.kind === 'empty') {
          directive.children = [];
        }

        cellNodes.push(directive);
      }

      // ─── Layout pass: compute grid-column / grid-row per cell ───────────────
      // Occupancy scanner. A boolean matrix [row][col] tracks which fields are
      // taken. Implicit flow places each cell in the next free block in row-
      // major order; explicit colstart/rowstart override the flow (collision
      // warns + falls back to flow).
      const occupied: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));

      function canPlace(rowStart: number, colStart: number, rowSpan: number, colSpan: number): boolean {
        if (rowStart + rowSpan > rows || colStart + colSpan > cols) return false;
        for (let r = rowStart; r < rowStart + rowSpan; r++) {
          for (let c = colStart; c < colStart + colSpan; c++) {
            if (occupied[r]![c]) return false;
          }
        }
        return true;
      }

      function markPlaced(rowStart: number, colStart: number, rowSpan: number, colSpan: number): void {
        for (let r = rowStart; r < rowStart + rowSpan; r++) {
          for (let c = colStart; c < colStart + colSpan; c++) {
            occupied[r]![c] = true;
          }
        }
      }

      function findNextFree(rowSpan: number, colSpan: number): { row: number; col: number } | null {
        for (let r = 0; r <= rows - rowSpan; r++) {
          for (let c = 0; c <= cols - colSpan; c++) {
            if (canPlace(r, c, rowSpan, colSpan)) return { row: r, col: c };
          }
        }
        return null;
      }

      for (const cell of cellNodes) {
        const spec = cell.data?.gridCellSpec as GridCellSpec | undefined;
        if (!spec) continue;

        let rowStart0: number;
        let colStart0: number;

        if (spec.colstart !== undefined && spec.rowstart !== undefined) {
          rowStart0 = spec.rowstart - 1;
          colStart0 = spec.colstart - 1;
          if (!canPlace(rowStart0, colStart0, spec.rowspan, spec.colspan)) {
            process.stderr.write(
              `[pilcrow] ${postPath}: cell #${spec.id} position collision at column ${spec.colstart}, row ${spec.rowstart} (size ${spec.colspan}×${spec.rowspan}) — overlaps another cell or exceeds grid. Falling back to implicit flow.\n`,
            );
            const free = findNextFree(spec.rowspan, spec.colspan);
            if (free === null) {
              process.stderr.write(
                `[pilcrow] ${postPath}: cell #${spec.id} (${spec.colspan}×${spec.rowspan}) does not fit anywhere in the ${cols}×${rows} grid — cell dropped.\n`,
              );
              continue;
            }
            rowStart0 = free.row;
            colStart0 = free.col;
          }
        } else {
          const free = findNextFree(spec.rowspan, spec.colspan);
          if (free === null) {
            process.stderr.write(
              `[pilcrow] ${postPath}: cell #${spec.id} (${spec.colspan}×${spec.rowspan}) does not fit anywhere in the ${cols}×${rows} grid — cell dropped.\n`,
            );
            continue;
          }
          rowStart0 = free.row;
          colStart0 = free.col;
        }

        markPlaced(rowStart0, colStart0, spec.rowspan, spec.colspan);

        const gridColumn = `${colStart0 + 1} / span ${spec.colspan}`;
        const gridRow = `${rowStart0 + 1} / span ${spec.rowspan}`;

        const existingStyle = (cell.data?.hProperties?.style as string | undefined) ?? '';
        const newStyle = `${existingStyle}${existingStyle && !existingStyle.endsWith(';') ? ';' : ''}grid-column: ${gridColumn}; grid-row: ${gridRow};`;
        cell.data = cell.data ?? {};
        cell.data.hProperties = { ...(cell.data.hProperties ?? {}), style: newStyle };
      }

      // ─── Stamp the outer grid container ─────────────────────────────────────
      const gridSpec: GridSpec = { fields, cols, rows };

      node.data = node.data ?? {};
      node.data.hName = 'div';
      node.data.hProperties = {
        className: ['pilcrow-grid'],
        dataGridFields: String(fields),
        style: `--grid-cols: ${cols}; --grid-rows: ${rows};`,
      };
      node.data.gridSpec = gridSpec;
      node.children = cellNodes;
    });
  };
}
