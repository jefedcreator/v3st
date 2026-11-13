# CLAUDE.md

Instructions for Claude Code (and other AI assistants) working in this repository.

## Architectural blueprint

`BACKEND_PATTERNS.md` and `FRONTEND_PATTERNS_GUIDE.md` at the repository root are the canonical architectural guides for this project — stack, directory structure, layer boundaries, and the conventions (Route Handlers/middleware/services/validation on the backend; App Router structure, data fetching, forms, and state on the frontend) that must stay consistent. Consult them before making structural decisions, and keep them in sync when a documented pattern changes.

`DESIGN_SYSTEM.md` at the repository root is the reference for the UI layer — design tokens, the primitives in `src/primitives/`, composition patterns, and the silent-failure traps in theming and animation. Read it before writing any component, page, or style. It complements `FRONTEND_PATTERNS_GUIDE.md` rather than replacing it: where the two overlap they must agree, so update both when a pattern changes.

## Code style

- Never use optional/conditional object spread (e.g. `...(cond ? { key: val } : {})`, `...(cond && { key: val })`, `...(value ?? {})`) to conditionally or optionally include properties in an object literal. Use an `if` statement to assign the property (or build the object) instead.

## Commit messages

- Never add "Co-Authored-By: Claude" or any variation of it (e.g. "Co-authored-by: Claude Code", "Generated with Claude Code", etc.) to commit messages.

## Task planning

- Break down every task into a todo list before starting work.
- If a task's todo list has more than one item, commit the work to git with an appropriate commit message upon completion of the task.

## Working scope (standing operator instructions)

These hold until the operator says otherwise. They are not per-task decisions and should not be re-asked.

- **Full stack.** Implement both server-side code (Route Handlers, services, validators, scripts, Prisma schema and migrations) and frontend (React components, pages, client-side state, styling). The frontend follows `FRONTEND_PATTERNS_GUIDE.md` and `DESIGN_SYSTEM.md`, which are canonical for it.

  This replaces a standing **backend-only** rule, retired 2026-09-09 at the operator's instruction. Do not reinstate it, and do not ask whether frontend work is in scope — it is. A feature is delivered when it is reachable by a reader, which for a new surface means the page, its components and its navigation entry, not only the route that feeds them.
- **Do not run `yarn test`, `yarn lint`, `yarn typecheck` or `yarn build` between tasks.** Run them once, at the end, when the whole implementation is complete. Do not treat a green gate as a per-task exit criterion in the meantime.

Consequence worth knowing when planning: with gates deferred, a task's own report can no longer carry test evidence, so reviewers must judge code by reading it. Write plans accordingly — prefer tasks whose correctness is legible from the diff, and expect the first full gate run to surface accumulated breakage all at once.
