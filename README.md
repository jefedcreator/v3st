# V3ST

V3ST is a beta application for exploring Nigerian bank-transfer deposits, tokenized stock holdings on a local testnet, withdrawals, and Friday earnings payouts. This repository contains the implemented backend (auth, ramps, ledger, trades, earnings, workers, tests) plus the implementation specifications. The onchain stocks and income layer runs against an isolated local Anvil testnet with clearly labelled provider replicas; actual provider adapters stay disabled until verified testnet evidence exists.

The entire application must remain in beta. Every provider must use a verified sandbox/test environment or a local simulation. Paycrest is simulated-only during beta. No real bank transfers, mainnet transactions, real KYC submissions, or live-provider fallback are allowed.

## Cloud agent entry point

Read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [Design.md](Design.md), [BACKEND_PATTERNS.md](BACKEND_PATTERNS.md), [FRONTEND_PATTERNS_GUIDE.md](FRONTEND_PATTERNS_GUIDE.md), the [ramps and payouts plan](docs/superpowers/plans/2026-11-13-v3st-naira-ramps-and-payouts.md), and the [onchain stocks and income plan](docs/superpowers/plans/2026-11-14-v3st-onchain-stocks-and-income.md).

The onchain plan is backend/API only: it extends the existing backend with testnet stock execution and receipt-backed income and does not require frontend packages or `DESIGN_SYSTEM.md`. Do not interpret copied starter authentication, documentation examples, or missing provider access as permission to use real services.

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

The environment schema enforces `APP_STAGE=beta` and keeps every integration sandbox or simulated, including optimized hosted builds with `NODE_ENV=production`. Onchain execution additionally requires a loopback-only Anvil RPC (chain 31337); see [docs/decisions/onchain-providers.md](docs/decisions/onchain-providers.md).

```bash
yarn dev
```

`/` is now the V3ST marketing page: an anonymous, static Server Component landing page with a local illustrative demo (no API, database, wallet, session or RPC access from `/`), the approved forest-green/light identity, locally served provider marks (`public/brands/`, provenance in `public/brands/sources.json`), and Katana-matched motion that can be paused with the **Pause animations** control and always respects `prefers-reduced-motion`. The page is beta and not indexed (`robots: index:false, follow:false`); the demo's **Reset demo** returns to the Add naira chapter and nothing is persisted. The financial APIs are unchanged. Do not use `db:push` or migration commands against a live or shared database.

## Backend commands

- `yarn dev` / `yarn start` — Next.js app serving `/api/v1/*` (rewrites also expose `/v1/*` and `/webhooks/*`).
- `yarn worker` — background job worker (required for order progress, scheduled batches, reconciliation).
- `yarn db:migrate` — apply migrations; `yarn db:generate` — create a dev migration; `yarn db:studio` — Prisma Studio.
- `yarn seed:beta` — idempotent beta seed (treasury wallets, opening balances, TSTA/TSTB catalog); refuses to run outside `APP_STAGE=beta`.
- `yarn test` / `yarn test:api` / `yarn test:contracts` / `yarn typecheck` / `yarn lint` / `yarn build` — the verification gate.
- `yarn testnet:start` / `yarn testnet:deploy` — launch the isolated loopback Anvil testnet and deploy the labelled test contracts (manifest written to the gitignored `.testnet/`).
- Runbooks: [docs/runbooks/backend-beta.md](docs/runbooks/backend-beta.md) (schedules, ops endpoints) and [docs/runbooks/onchain-beta.md](docs/runbooks/onchain-beta.md) (testnet operations).

## Verification and handoff

Follow `CLAUDE.md`: write the relevant tests with each task, review and commit focused changes, then run the complete gate once after the whole implementation: `bash scripts/setup-cloud.sh`, `yarn prisma validate`, `yarn prisma generate`, `yarn test:contracts`, `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test:e2e`. The final plan gate lists the complete acceptance commands and beta-containment cases.

### Landing page preview and E2E

The landing page is this repository's frontend assignment (the earlier onchain release was backend/API only). Preview it with `yarn dev` (or `yarn build && yarn start`) and open `/` — it works without the database. The production-browser suite runs against the built app on loopback only:

```bash
yarn build
yarn test:e2e   # playwright test; starts yarn start on 127.0.0.1:3107 itself
```

`playwright.config.ts` supplies the beta/test-only environment (including a disposable `DATABASE_URL` pointing at an unused loopback port), so the landing E2E needs neither PostgreSQL nor Anvil, and the specs reject any `/api/*`, `/v1/*`, `/webhooks/*`, RPC, WebSocket or external request from the page.

The portable handoff includes source, configuration, Prisma schema, `yarn.lock`, the requirements, repository instructions, and the plan. Prisma output, `node_modules`, build caches, local credentials and `.env` files are excluded. `package-lock.json` is local-only because this project uses Yarn.

Implementation review and verification evidence: [docs/implementation-review.md](docs/implementation-review.md).
Use a separate disposable local `_test` database for verification; the review never uses the configured remote application database.
