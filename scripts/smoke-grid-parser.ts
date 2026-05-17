/**
 * smoke-grid-parser — unit tests for parse-directive + serialize-directive.
 *
 * Run via:
 *   bun run scripts/smoke-grid-parser.ts
 *
 * Tests cover Spec 02-B utilities only — no DOM, no editor component yet.
 * The cases below exercise every shape the editor + future hand-authored
 * directive markdown should round-trip.
 *
 * Exit code 0 on all pass; 1 on any failure.
 */

import { parseDirective } from '../src/lib/grid/parse-directive.js';
import { serializeDirective } from '../src/lib/grid/serialize-directive.js';
import type { GridDocument } from '../src/lib/grid/grid-document.js';

interface TestCase {
  name: string;
  /** Input markdown (parse target). */
  markdown: string;
  /** Expected parsed shape. */
  expected: GridDocument | null;
}

const cases: TestCase[] = [
  {
    name: 'empty grid (no cells)',
    markdown: `::::grid{fields=8}

::::`,
    expected: { fields: 8, cells: [] },
  },
  {
    name: 'single text cell with content',
    markdown: `::::grid{fields=8}

:::cell{id=1 colspan=2}
The Art of Living
:::

::::`,
    expected: {
      fields: 8,
      cells: [
        { id: 1, colspan: 2, rowspan: 1, kind: 'text', text: 'The Art of Living' },
      ],
    },
  },
  {
    name: 'multi-cell 16-field with all four fills',
    markdown: `::::grid{fields=16}

:::cell{id=1 fill=paper}
paper fill
:::

:::cell{id=2 fill=muted}
muted fill
:::

:::cell{id=3 fill=accent}
accent fill
:::

:::cell{id=4 fill=rule}
rule fill
:::

::::`,
    expected: {
      fields: 16,
      cells: [
        { id: 1, colspan: 1, rowspan: 1, kind: 'text', fill: 'paper', text: 'paper fill' },
        { id: 2, colspan: 1, rowspan: 1, kind: 'text', fill: 'muted', text: 'muted fill' },
        { id: 3, colspan: 1, rowspan: 1, kind: 'text', fill: 'accent', text: 'accent fill' },
        { id: 4, colspan: 1, rowspan: 1, kind: 'text', fill: 'rule', text: 'rule fill' },
      ],
    },
  },
  {
    name: 'image cell with alt',
    markdown: `::::grid{fields=8}

:::cell{id=1 colspan=2 kind=image alt="modern dining room"}
:::

::::`,
    expected: {
      fields: 8,
      cells: [
        { id: 1, colspan: 2, rowspan: 1, kind: 'image', alt: 'modern dining room', text: '' },
      ],
    },
  },
  {
    name: 'empty cell with fill',
    markdown: `::::grid{fields=8}

:::cell{id=1 colspan=2 kind=empty fill=rule}
:::

::::`,
    expected: {
      fields: 8,
      cells: [
        { id: 1, colspan: 2, rowspan: 1, kind: 'empty', fill: 'rule', text: '' },
      ],
    },
  },
  {
    name: 'cell with explicit positioning',
    markdown: `::::grid{fields=16}

:::cell{id=1 colstart=3 rowstart=2 colspan=2 rowspan=2}
positioned cell
:::

::::`,
    expected: {
      fields: 16,
      cells: [
        { id: 1, colspan: 2, rowspan: 2, colstart: 3, rowstart: 2, kind: 'text', text: 'positioned cell' },
      ],
    },
  },
  {
    name: 'cell content with markdown syntax preserved verbatim',
    markdown: `::::grid{fields=8}

:::cell{id=1 colspan=2}
# Heading

This is *italic* and **bold**.
:::

::::`,
    expected: {
      fields: 8,
      cells: [
        {
          id: 1,
          colspan: 2,
          rowspan: 1,
          kind: 'text',
          text: '# Heading\n\nThis is *italic* and **bold**.',
        },
      ],
    },
  },
  {
    name: '32-field grid (densest case)',
    markdown: `::::grid{fields=32}

:::cell{id=1 colspan=4}
header
:::

:::cell{id=2 colspan=1 fill=accent}
1
:::

::::`,
    expected: {
      fields: 32,
      cells: [
        { id: 1, colspan: 4, rowspan: 1, kind: 'text', text: 'header' },
        { id: 2, colspan: 1, rowspan: 1, kind: 'text', fill: 'accent', text: '1' },
      ],
    },
  },
  {
    name: 'malformed: missing fields attribute returns null',
    markdown: `::::grid{}

:::cell{id=1}
text
:::

::::`,
    expected: null,
  },
  {
    name: 'malformed: no grid at all returns null',
    markdown: `Just some prose with no grid.`,
    expected: null,
  },
  {
    name: 'malformed: invalid fields value returns null',
    markdown: `::::grid{fields=12}

::::`,
    expected: null,
  },
  {
    name: 'malformed: unclosed grid returns null',
    markdown: `::::grid{fields=8}

:::cell{id=1}
text
:::`,
    expected: null,
  },
];

// ─── Test runner ──────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a as object).sort();
  const bKeys = Object.keys(b as object).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!deepEqual((a as Record<string, unknown>)[aKeys[i]!], (b as Record<string, unknown>)[bKeys[i]!])) {
      return false;
    }
  }
  return true;
}

let pass = 0;
let fail = 0;
const failures: string[] = [];

console.log('─── parse-directive unit tests ─────────────────────────────────');
for (const tc of cases) {
  const got = parseDirective(tc.markdown);
  if (deepEqual(got, tc.expected)) {
    console.log(`  ✓ ${tc.name}`);
    pass++;
  } else {
    console.log(`  ✗ ${tc.name}`);
    console.log(`    expected: ${JSON.stringify(tc.expected)}`);
    console.log(`    got:      ${JSON.stringify(got)}`);
    failures.push(`parse: ${tc.name}`);
    fail++;
  }
}

console.log('');
console.log('─── round-trip: parse(serialize(parse(md))) === parse(md) ────');
for (const tc of cases) {
  if (tc.expected === null) continue; // skip malformed cases (won't round-trip)
  const parsed1 = parseDirective(tc.markdown);
  if (parsed1 === null) {
    console.log(`  ✗ ${tc.name} — initial parse returned null (test bug)`);
    failures.push(`roundtrip: ${tc.name} (initial parse null)`);
    fail++;
    continue;
  }
  const serialized = serializeDirective(parsed1);
  const parsed2 = parseDirective(serialized);
  if (deepEqual(parsed2, parsed1)) {
    console.log(`  ✓ ${tc.name}`);
    pass++;
  } else {
    console.log(`  ✗ ${tc.name}`);
    console.log(`    after roundtrip: ${JSON.stringify(parsed2)}`);
    console.log(`    expected:        ${JSON.stringify(parsed1)}`);
    console.log(`    intermediate serialised:\n${serialized}`);
    failures.push(`roundtrip: ${tc.name}`);
    fail++;
  }
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
