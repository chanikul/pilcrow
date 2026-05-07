# Pilcrow — agent entry point

**Canonical reference:** `~/Sandbox/PILCROW_MASTER_PLAN.md` (~52 KB). Read on demand for architectural decisions, scope changes, or anything touching the project's core thesis. **Not auto-loaded** — the 6 context files below are the working summary; the master plan is the law you consult when the working summary isn't enough.

This file routes you to the working context.

## Read these in order before doing anything

1. [`context/01-project-overview.md`](./context/01-project-overview.md) — what Pilcrow is, what it produces, scope
2. [`context/02-architecture.md`](./context/02-architecture.md) — Astro 6 + Bun + pretext + Playwright stack, build pipeline, system boundaries, invariants
3. [`context/03-code-standards.md`](./context/03-code-standards.md) — plugin policies, hyphenation rules, orphan-guard wrapper, A11y, the never-do list
4. [`context/04-ai-workflow-rules.md`](./context/04-ai-workflow-rules.md) — how to behave while building (cache-bust, /review against preview, gstack mapping)
5. [`context/05-ui-context.md`](./context/05-ui-context.md) — editorial typography, palette, measure, layout primitives, OG cards
6. [`context/06-progress-tracker.md`](./context/06-progress-tracker.md) — current phase, completed features, candidate next-specs

Then read the spec for the unit you're about to build:

- `context/feature-specs/NN-<name>.md`

## Other knowledge stores

- [`NOTES.md`](./NOTES.md) — deferred decisions, upstream issues (esp. pretext #162 / softHyphenMode), and v1.x candidates. Skim every session.
- [`.claude/learnings.md`](./.claude/learnings.md) — append-only lessons from prior sessions. Skim every session; append after each one.
- [`context/current-issues.md`](./context/current-issues.md) — gitignored bug scratchpad. Use the analyze-before-fix pattern (see workflow rules).

## Workflow per unit

1. Mark spec `in_progress` in `context/06-progress-tracker.md`.
2. State plan: files, plugin order changes, measurement-CSS additions, migrations.
3. **Clear the Astro cache if touching plugins:** `rm node_modules/.astro/data-store.json`.
4. Implement exactly what the spec asks for. Stay in scope.
5. `bun run build` — clean. All `[pilcrow]` warnings to stderr are real signals.
6. `/review` against `bun run preview` output, NOT source files.
7. Walk the spec checklist. Each must pass before marking complete.
8. Update progress tracker; append architectural decisions; append a learning to `.claude/learnings.md` if non-obvious.

## Pilcrow gotchas (do not skip)

- `node_modules/.astro/data-store.json` is content-keyed. A "broken" rehype plugin is almost always a cache hit. Clear that exact file.
- Errors in rehype plugins inside Astro's content-layer glob loader are caught silently (logged as `[glob-loader] Error rendering X.md`). Build succeeds, post body empty. Run a clean build with the data-store deleted when debugging.
- Sharp output → `public/_images/`, NEVER `dist/` (Astro cleans dist at build start).
- Plugin order in `astro.config.mjs` is hard-constrained. Don't reorder.
- Drop-cap gates: `!p.closest('aside.pullquote')` + `!p.closest('.footnotes')` + `!p.closest('aside.sidenote')`. New aside-class container = new gate.
- The orphan-guard wrapper is technical debt; remove when pretext #162 (`softHyphenMode: 'strict'`) ships upstream.

## Forbidden

- `any` in TypeScript
- Hex literals in component CSS (use the 5 `:root` tokens: `--paper`, `--ink`, `--muted`, `--rule`, `--accent`)
- Two copies of measurement-critical CSS rules (lives in `public/styles/global.css`; read by `playwright.ts` `readMeasurementCSS()`)
- Adding `remark-gfm` explicitly (Astro default at 4.0.1; would run twice)
- Variable Fraunces TTF in OG cards (use static `Fraunces144pt-Bold.ttf`)
- `import.meta.url`-relative font paths in OG endpoints (use `process.cwd() + ...`)
- Document-order SHY-stripping in orphan recovery (use targeted stem-search)
- Non-greedy regex on `.post-body` content (use depth-counting div-balanced scanners)
- `::before { content: 'U+glyph' }` for decorative Unicode (a11y; use real DOM + `aria-hidden="true"`)
- Sidenote markers appended after `.pt-line` spans (CSS anonymous block wrapping)
- Marking a spec `completed` if `bun run build` fails or emits unexplained `[pilcrow]` warnings

## Historical context

Before 2026-05-06, this file contained a single 17 KB dense braindump of every shipped feature. That's been split into the six files above (which are easier for an agent to navigate by purpose). The original is preserved at `CLAUDE.md.bak` for reference.
