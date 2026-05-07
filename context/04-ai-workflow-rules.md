# AI Workflow Rules — Pilcrow

> How an AI agent must behave while working on Pilcrow. Read this file every session, before doing anything.

## The single most important rule

**Work on one feature, plugin, or pipeline stage at a time.** Do not combine the markdown plugins (structural transformation) with the playwright pass (measurement) in a single diff. If a feature touches both, split it into two specs and do them sequentially.

This is doubly true for Pilcrow because the build pipeline has narrow, well-defined boundaries (see `02-architecture.md` "System boundaries"). A change that crosses them is almost always wrong.

## Before writing any code

1. **Read all six context files** in order: `01-project-overview.md`, `02-architecture.md`, `03-code-standards.md`, `04-ai-workflow-rules.md`, `05-ui-context.md`, `06-progress-tracker.md`.
2. **Skim `NOTES.md`** at the project root — deferred decisions and known gotchas live there. Many "obvious" features are deferred for documented reasons.
3. **Skim `.claude/learnings.md`** — append-only lessons from prior sessions. Don't repeat past mistakes.
4. **Read the spec** for the unit you're about to build (in `context/feature-specs/NN-<name>.md`).
5. **Read `~/Sandbox/PILCROW_MASTER_PLAN.md` on demand** when the task touches architecture, scope changes, the project's core thesis, or anything not fully covered by the 6 context files. It's canonical but not auto-loaded — explicit fetch keeps session context lean.
6. **Mark the spec as `in_progress`** in `06-progress-tracker.md`.
7. **State your plan** before doing it. Files to touch, plugin order changes, measurement-CSS additions, migrations.

## While writing code

- Stay inside the spec's stated scope. New issue surfaced? Write it to `current-issues.md` (gitignored), don't silently fix.
- Don't invent technologies. The architecture file lists what Pilcrow uses. New dep = ask.
- Reuse existing helpers. `findOrphanSHYPos`, `buildLineSpansHTML`, `readMeasurementCSS`, `splicePostBody` already exist — search before writing parallels.
- **Never** edit `public/styles/global.css` and `playwright.ts`'s `readMeasurementCSS` independently. They're paired. Touch one, audit the other.
- If a plugin appears not to execute, **delete `node_modules/.astro/data-store.json` first** (not just `.astro/` or `.vite/`). It's almost always a cache hit, not a pipeline bug.

## After writing code

1. **Clear the Astro cache** if you touched any plugin: `rm node_modules/.astro/data-store.json`.
2. **Full clean build:** `bun run build`. Fix all warnings — `[pilcrow]` warnings to stderr are real signals, not noise.
3. **Verify against the spec checklist.**
4. **Run `/review` against `bun run preview` output**, not source files. Source CSS intent and served CSS are different until `public/` is the source of truth (lesson learned 2026-04-29).
5. **Update `06-progress-tracker.md`:** move spec to `completed`, add what was actually built, append decisions to the architecture decision log if applicable.
6. **Append a one-liner to `.claude/learnings.md`** if the work surfaced a non-obvious lesson.

## When something needs a decision

- **Small, reversible** (a function name, a folder location): pick the most consistent option, keep moving.
- **Meaningful** (new dep, schema change, deviation from architecture invariants): stop and ask.
- **Conflicts with an architecture invariant or master plan**: cannot make on your own. Flag explicitly.

## When something is broken

1. Reproduce first. Don't fix bugs you can't reproduce.
2. **Write the bug into `current-issues.md`** with the error, the file/line, observed vs expected.
3. **Ask for analysis before fix.** Format: _"Here's what I think is wrong, here's why, here's how I'd fix it. Should I proceed?"_ This avoids cascading bad fixes.
4. After fix, reproduce the original failure to confirm it's gone.

## Pilcrow-specific gotchas (read every session)

- **Astro 6 cache:** `node_modules/.astro/data-store.json` is content-keyed. A rehype plugin that "doesn't run" is almost always a cache hit. Clear that file specifically.
- **Errors inside rehype plugins** in Astro's content-layer glob loader are **caught silently** and logged only as `[glob-loader] Error rendering X.md: ...`. Build succeeds, `entry.rendered = undefined`, post body empty. Always do a full clean build with the data-store deleted when debugging plugins.
- **`/review` runs against `bun run preview`**, not source. Source-vs-served drift bit us once (global.css moved from `src/styles/` to `public/styles/` after a `/review` discovered it wasn't being served).
- **Sharp → never write to `dist/` directly.** Astro cleans it at build start.
- **OG fonts:** static `Fraunces144pt-Bold.ttf` only. Variable TTF breaks Satori.
- **Plugin order in `astro.config.mjs`** is hard-constrained. Don't reorder.
- **The orphan guard wrapper is technical debt.** When upstream pretext ships `softHyphenMode: 'strict'` (issue #162), remove it entirely.

## Working with gstack

If gstack is installed (`~/.claude/skills/gstack`), reach for these at the right phase. Pilcrow is a typesetting engine, so the Designer agent matters more here than on most projects.

| Phase | Command | Notes for Pilcrow |
|-------|---------|-------------------|
| New feature idea | `/office-hours` | Especially valuable — Pilcrow's restraint is its product. Pressure-test "why does this need to exist?" |
| Plan the feature | `/autoplan` | Run before writing the spec. |
| Lock the engine architecture | `/plan-eng-review` | Mandatory if the feature touches the build pipeline. |
| UI / typography review | `/plan-design-review` | Mandatory if the feature touches typesetting output. The Designer is the editorial gatekeeper. |
| Variants for visible features | `/design-shotgun` → `/design-html` | Drop cap, sidenotes, OG cards all benefited from variant generation. |
| Code review | `/review` | Per spec, against `bun run preview` output. |
| Pre-deploy check | `/ship` | |
| Deploy | `/land-and-deploy` | CF Pages auto-deploys on push, so this mostly verifies the deploy actually landed. |
| QA in browser | `/qa <pilcrow.page or preview-url>` | Verify typesetting renders correctly. |
| Anything destructive | `/careful` | Especially before `rm node_modules/.astro/data-store.json` during debugging. |
| Performance check | `/benchmark` | When touching the build pipeline (Sharp, Playwright, OG generation). |
| Post-release docs | `/document-release` | Append to `.claude/learnings.md`. |
| Pre-release lockdown | `/freeze` | Before publishing a new `create-pilcrow` version. |

## Error budget

If a single spec fails its build three times in a row, stop. The plan is wrong, not the code. Open a new chat, re-read the context files, try again with a tighter spec.
