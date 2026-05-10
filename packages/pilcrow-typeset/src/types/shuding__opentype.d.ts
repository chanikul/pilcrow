/**
 * Minimal ambient declaration for @shuding/opentype.js (fork of opentype.js).
 *
 * We only declare the API surface used by silhouette.ts. The full opentype.js
 * type definitions are not published for the @shuding fork; this declaration
 * is scoped to the Pilcrow codebase's usage.
 *
 * Used in: packages/pilcrow-typeset/src/silhouette.ts
 */

declare module '@shuding/opentype.js' {
  interface PathCommand {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  interface GlyphPath {
    commands: PathCommand[];
    fill: string | null;
    stroke: string | null;
    strokeWidth: number;
    unitsPerEm: number;
  }

  interface Glyph {
    index: number;
    name: string | null;
    unicode: number | undefined;
    unicodes: number[];
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    advanceWidth: number;
    leftSideBearing: number;
    path: GlyphPath;
  }

  interface GlyphSet {
    get(index: number): Glyph;
  }

  interface OS2Table {
    sTypoAscender: number;
    sTypoDescender: number;
    sxHeight: number;
  }

  interface Tables {
    os2: OS2Table;
  }

  interface Font {
    numGlyphs: number;
    unitsPerEm: number;
    glyphs: GlyphSet;
    tables: Tables;
    charToGlyphIndex(char: string): number;
  }

  function parse(buffer: ArrayBuffer): Font;

  export default { parse };
}
