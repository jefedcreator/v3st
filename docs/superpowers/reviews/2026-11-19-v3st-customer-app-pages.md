# Customer app pages — verification and finish review

Build: `feat/customer-app-pages`, 2026-11-19 plan, executed natively (see below).

## How this was executed

The plan's header allows `superpowers:subagent-driven-development` or `superpowers:executing-plans`; neither skill is installed in this environment, so the checklist was executed natively, task by task, with a todo list per task and one focused commit per task (21 commits plus gate fixes), as `CLAUDE.md` requires. This substitution is recorded here per the plan's own instruction.

## Versions installed

- `@tanstack/react-query` 5.108.1 (`yarn add --exact`)
- `@privy-io/react-auth` 3.52.0 (`yarn add --exact`)
- `input-otp` 1.5.0 (added by the shadcn CLI, pinned exact)
- shadcn CLI 4.23.0 (source generator only)
- Deviation: Node 22.23.5 ran instead of the `.nvmrc` 24.15.0; Node 24 is not installed here and the sandbox cannot download binaries. `package.json` has no `engines` pin, so `yarn install` and the toolchain ran unchanged.

## Gates and their real outcomes

Run once, at the end, in this order. The environment (an ephemeral agent sandbox) has no PostgreSQL, no Forge/Anvil, no Chromium browser binaries, and a hard memory ceiling (~2 GB per process and overall); several gates were blocked by that, not by the code.

1. `yarn test:contracts` — **blocked**: `forge` is not installed in this sandbox (no Foundry toolchain, no local chain).
2. `yarn test` — **blocked**: the Vitest global setup requires a `TEST_DATABASE_URL` PostgreSQL database and a loopback Anvil; neither can exist here. Substitution actually run: every pure-logic test this plan wrote (all 25 files in `tests/app-ui/`, 60 tests) was executed through a minimal local Vitest config (`.local-app-ui.vitest.config.ts`, untracked, in `.git/info/exclude`) that bypasses the DB global setup with the same env values the repo's config sets — **25 files / 60 tests passed**. The DB-backed suites (`tests/app/**`, including the two new orders-waiting cases for Task 3's route) are authored but unexecuted here.
3. `yarn lint` — **partially run**: full-repo `eslint .` exceeds the sandbox memory ceiling (heap OOM at 2 GB; SIGKILL with 8 GB requested). Substitution: targeted `npx eslint` over every new or changed path (`src/components/app/**`, `src/app/(app|auth|setup)`, `src/primitives`, `src/server/app`, `src/utils/app-*`, `tests/app-ui`, `e2e/app`, `scripts`) — **0 errors**; 2 warnings remain by choice (the `img` element in `StockMark`, which serves locally-hashed logos, and an intentional `Page` type import kept for spec helpers).
4. `yarn typecheck` — **pass** (0 errors, full project).
5. `yarn build` — **blocked in this environment**: the Next build worker is SIGKILLed by the sandbox memory ceiling during the production compile (reproduced at 4 GB and 8 GB heap caps). No code error surfaced.
6. `yarn test:e2e` — **blocked**: Chromium browser binaries are not installed and cannot be downloaded here.
7. `yarn app-e2e prepare && yarn test:e2e:app` — **blocked**: needs the `_test` PostgreSQL database, the loopback Anvil chain, a deploy, Chromium and a full `next build`; none exist in this sandbox. The suite (`playwright.app.config.ts`, `scripts/app-e2e.mjs`, `scripts/app-e2e-seed.ts`, `e2e/app/*`) is authored, typechecks, and refuses unsafe environments by design.

Deviation from `CLAUDE.md`: `npx tsc --noEmit` was run incrementally during Tasks 16–21 (not only at the end) to keep type errors from accumulating invisibly; this surfaced and fixed 20+ real errors before the final gate. The final full run is the one recorded above.

## Finish review (Impeccable substitution)

Impeccable is not installed. Per the plan's fallback, a fresh review was run against the spec, the surface contract and the committed sketch PNG (`2026-11-19-v3st-app-money-line-sketch.png`):

- **Structure matches the sketch's first viewport**: "Total value" at `type-app-figure`, the two pills, the dashed-over-solid spine with the *Now · HH:MM* gain pill, *Coming up* above and *Earlier* below, holdings under the fold. Spec wins where they differ: no 24-hour percentage and no payout bank (the API's `change_24h_kobo` and the choice line carry those instead).
- **Total states**: `totalLines` renders "—" plus "Your total isn't available right now." for `unavailable`, and the note for `partial`; a null change drops the change line (pinned by `tests/app-ui/total.test.ts`).
- **The money line** is built by the pure, tested `line-model.ts` (Friday payout first only with Earn value or weekly earnings; in-progress items by deadline, soonest nearest *Now*; *Needs you* last; merged `finish_transfer` rows; five earlier items with failures marked).
- **Modals** are one responsive `Dialog` each (bottom sheet below 640px, 28px corners, 92dvh max, safe-area padding; centred ≤480px from `sm:`), opening in 260ms, closing in 170ms, fading under reduced motion — with the tests pinned in `primitives-guard.test.ts`.
- **Craft floor**: no kicker above headings, no gradient text, no offset shadows, no nested cards, no emoji icons, Phosphor SSR icons only.
- **Vocabulary**: `tests/app-ui/vocabulary-guard.test.ts` parses every app source file and reports no leaks; the browser crawl is authored in `e2e/app/vocabulary.spec.ts` but could not run (see gates).

Disposition at the real scope: no mechanical detector findings were run (tool absent); the review's verdict for the code-led build is **fix-applied then ship** — the review found and fixed three real vocabulary leaks and the wrong-initial-state defaults above before recording. The "Customer app" section was added to `DESIGN_SYSTEM.md` by hand, merging with the landing sections.

## Deviations from the spec and why

- **Full gates unexecuted** (noted above): the sandbox lacks PostgreSQL, Foundry/Anvil and Chromium. The tests and suites are authored and typecheck; the DB-backed assertions have not executed, so per the plan they have not passed.
- **`.env` local fixture**: `setup-cloud.sh` also refuses Node 22; `.env` was copied from `.env.example` (non-secret template) to satisfy `env.js` at load. It is untracked.
- **Desktop step list in setup** shows "Done" as text rather than a tick glyph, honouring the no-Unicode-glyph rule while keeping finished steps legible.
- The landing `img`→`Image` warning in `StockMark` was left as a warning: the marks are local, hashed assets served from `public/stocks/` and `next/image` would add an image-optimization dependency path the landing guide does not use for them either.

## Remaining risks

- The spec's §Open risks stand: Privy's SDK names were checked against the installed 3.52.0 types (`usePrivy`, `useLoginWithEmail`, `getAccessToken`, `getIdentityToken`) and wired accordingly, but only the simulated issuer path can be exercised without a sandbox app id.
- The browser suite is unexecuted in this environment; its first real run may surface timing (block mining waits, the 60s order completion) or selector drift that only a live run can show.
- `yarn build`'s memory ceiling means the first real CI run is the definitive compile check.
