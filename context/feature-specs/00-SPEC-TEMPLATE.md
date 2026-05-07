# Spec NN — {{Feature Name}}

> One spec per unit of work. A unit is small enough to ship in a focused session and big enough to deliver a coherent slice. If a spec touches both backend and frontend, split it into two.

## Goal

One or two sentences. What does this unit produce when done?

> e.g. "Build the editor `/<roomId>` workspace route. Authenticated users with project access see the workspace shell; everyone else is redirected."

## Design decisions

The choices that aren't obvious. Cite UI tokens from `05-ui-context.md`, architecture invariants from `02-architecture.md`. Don't make the agent re-derive them.

- Layout / responsiveness rules
- Visual hierarchy
- Behavior on narrow screens, empty states, loading states
- State boundaries (server vs client, real-time vs local)
- Where the data lives (DB row, blob, real-time storage)

## Implementation

Step-by-step. Group by surface (e.g. "Backend", "Frontend", "Shared types"). Be specific about file paths.

### Backend
- Create `app/api/<endpoint>/route.ts` with handlers `GET`, `POST`, `PATCH`, `DELETE` as needed.
- Validate inputs with `zod`. Reject 400 on schema mismatch.
- Auth: require an authenticated user; return 401 otherwise.
- Ownership: check the user owns/can-access the resource; return 403 otherwise.
- DB: use `lib/<resource>.ts` helpers. Don't write inline Prisma queries.

### Frontend
- Create `components/<domain>/<component>.tsx`.
- Server component by default. Add `'use client'` only if needed.
- Use existing UI primitives (`components/ui/*`). Don't reinvent.
- Style via tokens from `05-ui-context.md`. No hard-coded colors.

### Shared
- Add types to `types/<domain>.ts` if shared between client and server.
- Add helpers to `lib/<resource>.ts` if reused.

## Out of scope (explicit)

What this spec deliberately does NOT do. Prevents scope creep.

- {{OUT_OF_SCOPE_1}}
- {{OUT_OF_SCOPE_2}}

## Dependencies

Other specs that must be completed first.

- Requires spec NN — {{name}}
- Optional: spec MM — {{name}} (if present, integrate; otherwise skip)

## Checks

A verification checklist. After implementation, walk through these. Each must pass before marking the spec complete.

- [ ] Build passes (`npm run build`).
- [ ] No new TypeScript errors.
- [ ] No new lint errors.
- [ ] Auth required on all mutation routes; verified by hitting them unauthenticated.
- [ ] Ownership enforced; verified by hitting from a non-owner account.
- [ ] UI matches the design decisions above (spot-check on desktop and on a narrow viewport).
- [ ] Empty / loading / error states render correctly.
- [ ] Tracker (`context/06-progress-tracker.md`) updated: this spec moved to `completed`, decision log appended if applicable.

## Notes for the agent

- Stay in scope. If you spot a related improvement, write it to `current-issues.md` and keep moving.
- Reuse existing helpers — search before writing. `grep -r "function useProject" lib/ hooks/` first.
- If the spec is ambiguous, stop and ask. Don't guess.
