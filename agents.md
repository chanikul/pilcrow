# agents.md — Pilcrow

> Entry point for AI coding agents working on Pilcrow. Claude Code reads `CLAUDE.md` and uses `.claude/agents/` for typed dispatch. Non-Claude agents (Codex, Cursor, Aider, etc.) read this file first. Both share the routing and constraints below.

**Canonical reference:** `~/Sandbox/PILCROW_MASTER_PLAN.md` (~52 KB). Read on demand for architectural decisions or scope changes. Not auto-loaded — the 6 context files below are the working summary.

## Read these in order before doing anything

1. `context/01-project-overview.md` — what Pilcrow is, what it produces, scope
2. `context/02-architecture.md` — Astro 6 + Bun + pretext + Playwright stack, build pipeline, system boundaries, invariants
3. `context/03-code-standards.md` — plugin policies, hyphenation rules, orphan-guard wrapper, A11y, the never-do list
4. `context/04-ai-workflow-rules.md` — how to behave while building (cache-bust, /review against preview, gstack mapping)
5. `context/05-ui-context.md` — editorial typography, palette, measure, layout primitives, OG cards
6. `context/06-progress-tracker.md` — current phase, completed features, candidate next-specs

Then read the spec for the unit you're about to build:

- `context/feature-specs/NN-<name>.md`

## Other knowledge stores

- `NOTES.md` — deferred decisions, upstream issues (esp. pretext #162 / softHyphenMode), v1.x candidates
- `.claude/learnings.md` — append-only lessons from prior sessions
- `context/current-issues.md` — gitignored bug scratchpad

## Workflow per unit

1. Mark spec `in_progress` in `context/06-progress-tracker.md`
2. State plan: files, plugin order changes, measurement-CSS additions, migrations
3. **Clear the Astro cache if touching plugins:** `rm node_modules/.astro/data-store.json`
4. Implement exactly what the spec asks for; stay in scope
5. `bun run build` — clean. All `[pilcrow]` warnings to stderr are real signals
6. Verify against preview output (`bun run preview`), NOT source files
7. Walk the spec checklist
8. Update progress tracker; append architectural decisions; append a learning to `.claude/learnings.md` if non-obvious

## Pilcrow gotchas (do not skip)

- `node_modules/.astro/data-store.json` is content-keyed. A "broken" rehype plugin is almost always a cache hit. Clear that exact file.
- Errors in rehype plugins inside Astro's content-layer glob loader are caught silently — build succeeds, post body empty. Run a clean build with the data-store deleted when debugging.
- Sharp output → `public/_images/`, NEVER `dist/`.
- Plugin order in `astro.config.mjs` is hard-constrained.
- Drop-cap gates: `!p.closest('aside.pullquote')` + `!p.closest('.footnotes')` + `!p.closest('aside.sidenote')`.
- Orphan guard wrapper is technical debt; remove when pretext #162 ships.

## Forbidden

- `any` in TypeScript
- Hex literals in component CSS (use the 5 `:root` tokens)
- Two copies of measurement-critical CSS rules
- Adding `remark-gfm` explicitly (Astro default)
- Variable Fraunces TTF in OG cards
- `import.meta.url`-relative font paths in OG endpoints
- Document-order SHY-stripping in orphan recovery
- Non-greedy regex on `.post-body` content
- `::before { content: 'U+glyph' }` for decorative Unicode
- Sidenote markers appended after `.pt-line` spans
- Marking a spec `completed` if `bun run build` fails or emits unexplained warnings

---

## Claude Code subagent system

Four typed personas at `.claude/agents/` (registered 2026-05-07). Claude Code dispatches to them by name.

### When to use which agent

| Signal | Agent | Persona file |
|---|---|---|
| One CSS rule needs to change | typesetter | `.claude/agents/typesetter.md` |
| One build script bug to fix | typesetter | `.claude/agents/typesetter.md` |
| Markdown sample needs editing | typesetter | `.claude/agents/typesetter.md` |
| Add a new editorial primitive (pull quote, sidenote, footnote) | typography-architect | `.claude/agents/typography-architect.md` |
| Wire pretext's `rich-inline` for inline markup | typography-architect | `.claude/agents/typography-architect.md` |
| Add hyphenation (Hyphenopoly) | typography-architect | `.claude/agents/typography-architect.md` |
| Pipeline architecture change (rehype plugin, multi-page support) | typography-architect | `.claude/agents/typography-architect.md` |
| Want feedback on how a rendered post looks | design-critic | `.claude/agents/design-critic.md` |
| Choosing between font pairings | design-critic | `.claude/agents/design-critic.md` |
| Writing a sample post | editorial-writer | `.claude/agents/editorial-writer.md` |
| Drafting README, launch tweet, Show HN post | editorial-writer | `.claude/agents/editorial-writer.md` |

### Working principles (apply to every agent)

These trace back to `PILCROW_MASTER_PLAN.md` §14 (Working Agreements).

1. **The pitch and the product must match.** Pilcrow is anti-AI-slop. Engineering with AI is fine; *visual design taste must be human*. Agents propose, you decide.
2. **Restraint is a feature.** One serif, one sans, one accent, one column width. Reject knob-adding feature requests by default.
3. **Pretext is a primitive, not a typesetter.** Anything visible (drop caps, justification, sidenotes) is Pilcrow's job — see `PILCROW_MASTER_PLAN.md` §3.
4. **Build-time always.** No runtime JS for typography. If a feature requires runtime JS, the design is wrong.
5. **Don't fork pretext.** Use as a dependency. Contribute upstream if needed.
6. **Document architecture decisions.** Architectural notes go in `context/02-architecture.md`'s decision log; the master plan is the law of last resort.

### Auto-escalation

If `typesetter` notices the task crosses any of these lines, it stops and recommends `typography-architect`:

- Touches the build pipeline architecture
- Adds a new editorial primitive (drop cap variant, sidenote, footnote, pull quote)
- Affects more than 3 files
- Requires a new dependency
- Introduces a runtime JS dependency

If `typography-architect` notices the work needs taste calls (font choice, color palette, layout proportion), it stops and surfaces options for **you** to decide rather than picking. It does not generate visual design.

### Slash commands — NOT YET WIRED

The persona files reference `/typeset`, `/build-feature`, `/review`, `/draft` as forward-looking spec. Slash command wiring at `.claude/commands/<name>.md` is deferred. **Currently dispatch via plain-language phrasing**: "Use the typesetter subagent to ...", "Use the editorial-writer subagent to ...", etc.
