# V3ST

V3ST is a beta application for exploring Nigerian bank-transfer deposits, tokenized stock holdings, withdrawals, and Friday earnings payouts. This repository contains the Next.js starter and the full implementation specification. The financial workflows and provider safeguards are planned work, not completed features.

The entire application must remain in beta. Every provider must use a verified sandbox/test environment or a local simulation. Paycrest is simulated-only during beta. No real bank transfers, mainnet transactions, real KYC submissions, or live-provider fallback are allowed.

## Cloud agent entry point

Read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [Design.md](Design.md), [BACKEND_PATTERNS.md](BACKEND_PATTERNS.md), [FRONTEND_PATTERNS_GUIDE.md](FRONTEND_PATTERNS_GUIDE.md), and the [implementation plan](docs/superpowers/plans/2026-11-13-v3st-naira-ramps-and-payouts.md).

The plan has 18 tasks and incorporates the beta-only override, file boundaries, interfaces, financial invariants, recovery behavior, and final verification. Start with Task 1 and follow dependency order. `DESIGN_SYSTEM.md` does not exist yet; creating it before UI implementation is part of Task 1. Do not interpret copied starter authentication, documentation examples, or missing provider access as permission to use real services.

## Setup

Use Node.js 24.15.0 from [.nvmrc](.nvmrc) and Yarn Classic 1.22.22 from `package.json`. In an environment with nvm:

```bash
nvm install
nvm use
npm install --global yarn@1.22.22
bash scripts/setup-cloud.sh
```

If the environment already provides the required Node and Yarn versions, run only the setup script. It copies `.env.example` to `.env` if no `.env` exists and installs the locked dependencies. The package's `postinstall` generates the Prisma client for the current platform. It does not overwrite existing environment files, start services, apply migrations, or run application checks.

The example contains nonfunctional starter-auth placeholders and local-only PostgreSQL credentials. Configure an isolated beta PostgreSQL service through the cloud environment and update `DATABASE_URL`; use a different disposable database/schema for `TEST_DATABASE_URL`. Keep hosted credentials in the cloud environment's secret settings. Never copy the local developer's `.env` or use real provider credentials. Generate an application-specific secret before any hosted use.

After Task 1 wires and enforces the environment schema, keep `APP_STAGE=beta` and configure every integration as sandbox or simulated, including optimized hosted builds with `NODE_ENV=production`. The example's beta variables express the required configuration; the current starter does not yet enforce them.

```bash
yarn dev
```

The current page is the T3 starter. NextAuth/Discord must be replaced by the planned beta identity/session flow; no real OAuth application is needed to begin implementation. Do not use `db:push` or migration commands against a live or shared database.

## Backend commands

- `yarn dev` / `yarn start` — Next.js app serving `/api/v1/*` (rewrites also expose `/v1/*` and `/webhooks/*`).
- `yarn worker` — background job worker (required for order progress, scheduled batches, reconciliation).
- `yarn db:migrate` — apply migrations; `yarn db:generate` — create a dev migration; `yarn db:studio` — Prisma Studio.
- `yarn seed:beta` — idempotent beta seed (treasury wallets, opening balances, TSTA/TSTB catalog); refuses to run outside `APP_STAGE=beta`.
- `yarn test` / `yarn typecheck` / `yarn lint` / `yarn build` — the verification gate.
- Runbook for schedules, ops endpoints and procedures: [docs/runbooks/backend-beta.md](docs/runbooks/backend-beta.md).

## Verification and handoff

Follow `CLAUDE.md`: write the relevant tests with each task, review and commit focused changes, then run `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build`, and the planned end-to-end gate once after the complete implementation. The starter currently has no test runner and uses obsolete `next lint` scripts; Task 1 fixes that setup. The final plan gate lists the complete acceptance commands and beta-containment cases.

The portable handoff includes source, configuration, Prisma schema, `yarn.lock`, the requirements, repository instructions, and the plan. Prisma output, `node_modules`, build caches, local credentials and `.env` files are excluded. `package-lock.json` is local-only because this project uses Yarn.
