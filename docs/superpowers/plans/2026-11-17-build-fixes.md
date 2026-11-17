# Build error fixes

Scope: run the project's optimized build and resolve its errors while preserving
the existing working-tree changes and beta-only provider policy.

The Superpowers executing-plans and subagent-driven-development skills are not
installed in this environment; this checklist tracks the work natively.

- [x] Read repository requirements and run `bash scripts/setup-cloud.sh` using
  Node.js 24.15.0 and Yarn 1.22.22; regenerate the platform-specific Prisma client.
- [x] Run the build, diagnose all reported errors, and make focused fixes.
- [x] Run the final checks appropriate to the fixes, record actual results, and
  commit only this task's changes.

Builds use the existing `node scripts/landing-beta.mjs build` launcher so the
complete Next.js application compiles with isolated simulated configuration and
an unreachable database, without inheriting provider credentials.

The initial build exited successfully after Prisma regeneration. It reported two
unused-variable warnings: an unused policy import in managed transfers and a
discarded liquidity-share estimate in the Hydrex replica quote. Both were removed;
the share calculation used to prepare the executable transaction stays in place.

Verification on 2026-11-17:

- `bash scripts/setup-cloud.sh`: passed; locked dependencies were already current
  and Prisma Client 6.19.3 regenerated successfully.
- `yarn lint`: passed (zero errors). Seven existing warnings remain in
  `postcss.config.js`, `prettier.config.js`, `tests/helpers/testnet.ts`,
  `tests/integration/hydrex-testnet.test.ts`,
  `tests/integration/stock-distributions.test.ts`, and
  `tests/integration/testnet-execution.test.ts`.
- `node scripts/landing-beta.mjs build`: passed with no source lint warnings;
  compilation, TypeScript checks, and all 69 static-page generation steps passed.
- `git diff --check`: passed.

No runtime test suite was run for this unused-code cleanup. Existing unrelated
working-tree changes are excluded from the task commit; generated Prisma and
build artifacts remain ignored.
