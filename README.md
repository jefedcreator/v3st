# V3ST

V3ST is a beta application for exploring Nigerian bank-transfer deposits, tokenized stock holdings on a local testnet, withdrawals, and Friday earnings payouts. This repository contains the implemented backend (auth, ramps, ledger, trades, earnings, workers, tests) plus the implementation specifications. The onchain stocks and income layer runs against an isolated local Anvil testnet with clearly labelled provider replicas; Hydrex is additionally wired to its verified contracts on Base Sepolia (chain 84532) behind recorded evidence, and every other actual provider adapter stays disabled.

The entire application must remain in beta. Every provider must use a verified sandbox/test environment or a local simulation. Paycrest is simulated-only during beta. No real bank transfers, mainnet transactions, real KYC submissions, or live-provider fallback are allowed.

## Cloud agent entry point

Start with [AGENTS.md](AGENTS.md). The current assignment is the landing page redesign: implement the [redesign plan](docs/superpowers/plans/2026-11-18-v3st-landing-redesign.md) against the [approved design](docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md), the [direction contract](.impeccable/surfaces/src-app-marketing-page-tsx.md) and the [approved mock](docs/superpowers/specs/assets/2026-11-17-v3st-landing-approved-mock.png). Also read [CLAUDE.md](CLAUDE.md), [Design.md](Design.md), [BACKEND_PATTERNS.md](BACKEND_PATTERNS.md) and [FRONTEND_PATTERNS_GUIDE.md](FRONTEND_PATTERNS_GUIDE.md).

The earlier plans (ramps and payouts, onchain stocks and income, real provider integration, customer app backend) are implemented and remain the backend's record. Do not interpret copied starter authentication, documentation examples, or missing provider access as permission to use real services.

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

The anonymous `/` route is the redesigned dark landing page: a pinned hero that hands over to the beta price ticker, built-with row, Earn cards, how-it-works, safeguards, FAQ and a closing join panel, plus `/legal/*` reading pages and the `/waitlist` result page. The page is statically regenerated every 300 s; its only server read is the failure-tolerant beta ticker, so a build with an unreachable database renders the no-price fallback. No client-side API call is made except the waitlist `POST /api/v1/waitlist`. The page remains beta and `noindex, nofollow`.

Brand assets, artwork and fonts are locally served. The original WebGL fluid field loads lazily and falls back to original static artwork when WebGL is unavailable or motion is reduced; reduced motion and short viewports use ordinary flow. `Pause motion` (header, 44px) stops every self-running loop and resumes from the paused frame. Native anchors, the FAQ and the waitlist form work without JavaScript. Do not use `db:push` or migration commands against a live or shared database.

## Base Sepolia verified testnet (Phase A)

Phase A of the real-provider work wires Hydrex's real contracts on Base Sepolia (chain 84532) as a verified provider testnet. It stays inert unless configured: `BASE_SEPOLIA_RPC_URL` and `BASE_SEPOLIA_RELAYER_PRIVATE_KEY` in `.env`, a funded Sepolia relayer (test ETH and test USDC from the Base Sepolia faucets), and the deployed manifest. Never put a mainnet key in these variables.

```bash
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export BASE_SEPOLIA_RELAYER_PRIVATE_KEY=0x... # funded Sepolia relayer key only
yarn sepolia:deploy                            # deploys the stock stand-in and Hydrex pool; writes .testnet/base-sepolia/manifest.json
yarn seed:beta                                 # seeds the tAAPL stand-in tracking the live AAPL tokenized stock
SEPOLIA_LIVE=1 yarn sepolia:smoke              # operator-only end-to-end journey; prints tx hashes and fees
```

Customer beta environment (`APP_STAGE=beta`):

- `APP_CUSTOMER_CHAIN` — `testnet` for the local loopback chain, `basesepolia` for the live beta.
- `PRIVY_MODE` — `simulated` in the beta (local token issuer); real Privy verification needs `PRIVY_APP_ID` and `PRIVY_VERIFICATION_KEY`.
- `PRIVY_BETA_ALLOWLIST` — comma-separated tester emails allowed to sign in during the beta; keep Privy's own allowlist in step with it (allowlisted testers receive real sign-in emails from Privy).
- `BASE_SEPOLIA_KEEPER_PRIVATE_KEY` — funds and runs the 300 s test-pool keeper that keeps Base Sepolia stand-in pools aligned (and supplies most testnet Earn fees).
- `yarn sepolia:treasury --micro <amount>` — operator-only Base Sepolia treasury top-up.
- `SEPOLIA_LIVE=1 APP_CUSTOMER_CHAIN=basesepolia yarn sepolia:customer-smoke` — operator-only live customer smoke (sign-in → fund → buy); exits non-zero unless the order completes and the DTO passes the customer-vocabulary leak check.

Customer API docs: [docs/api/customer-app.md](docs/api/customer-app.md).

`GET /api/v1/ops/integrations` reports Hydrex as `verified_provider_testnet` with `verified_chain_id: 84532` only while the RPC URL is set and the on-disk manifest still matches the deployed code hashes; otherwise it reports `disabled_unverified`. Mainnet chain IDs stay rejected in every environment. See [docs/runbooks/onchain-beta.md](docs/runbooks/onchain-beta.md).

## Backend commands

- `yarn dev` / `yarn start` — Next.js app serving `/api/v1/*` (rewrites also expose `/v1/*` and `/webhooks/*`).
- `yarn worker` — background job worker (required for order progress, scheduled batches, reconciliation).
- `yarn db:migrate` — apply migrations; `yarn db:generate` — create a dev migration; `yarn db:studio` — Prisma Studio.
- `yarn seed:beta` — idempotent beta seed (treasury wallets, opening balances, TSTA/TSTB catalog); refuses to run outside `APP_STAGE=beta`.
- `yarn test` / `yarn test:api` / `yarn test:contracts` / `yarn typecheck` / `yarn lint` / `yarn build` — the verification gate.
- `yarn testnet:start` / `yarn testnet:deploy` — launch the isolated loopback Anvil testnet and deploy the labelled test contracts (manifest written to the gitignored `.testnet/`).
- `yarn sepolia:deploy` / `yarn sepolia:smoke` — deploy the verified Base Sepolia manifest and run the operator-only smoke journey (see above).
- `yarn sepolia:treasury` / `yarn sepolia:customer-smoke` — operator-only Base Sepolia treasury top-up and live customer smoke journey (see above).
- Runbooks: [docs/runbooks/backend-beta.md](docs/runbooks/backend-beta.md) (schedules, ops endpoints) and [docs/runbooks/onchain-beta.md](docs/runbooks/onchain-beta.md) (testnet operations).

## Verification and handoff

Follow `CLAUDE.md`: write the relevant tests with each task, review and commit focused changes, then run the complete gate once after the whole implementation: `bash scripts/setup-cloud.sh`, `yarn prisma validate`, `yarn prisma generate`, `yarn test:contracts`, `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build`. The final plan gate lists the complete acceptance commands and beta-containment cases.

The portable handoff includes source, configuration, Prisma schema, `yarn.lock`, the requirements, repository instructions, and the plan. Prisma output, `node_modules`, build caches, local credentials and `.env` files are excluded. `package-lock.json` is local-only because this project uses Yarn.

Implementation review and verification evidence: [docs/implementation-review.md](docs/implementation-review.md).
Use a separate disposable local `_test` database for verification; the review never uses the configured remote application database.

## Landing verification

The landing is the 2026-11-18 redesign. Read [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [PRODUCT.md](PRODUCT.md), the [redesign spec](docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md), its [plan](docs/superpowers/plans/2026-11-18-v3st-landing-redesign.md) and the [review record](docs/superpowers/reviews/2026-11-18-v3st-landing-redesign.md).

Preview locally with `yarn dev`; required beta environment values must be configured, but no worker or reachable database is needed to view `/` — with an unreachable database the ticker shows its no-price fallback. Never reuse real provider credentials.

For a self-contained production preview of the landing, use the pinned Node/Yarn toolchain and run these in order:

```bash
node scripts/landing-beta.mjs build
node scripts/landing-beta.mjs start
```

Open `http://127.0.0.1:3107`. This launcher clears the documented provider environment, uses test-only beta values and an unreachable database, and starts only Next. Stop it before running Playwright, which owns the same port.

Browser suite: `yarn test:e2e` (Chromium installed with `yarn playwright install chromium`, or set `LANDING_CHROMIUM_PATH`). Playwright owns a production server at `http://127.0.0.1:3107`, supplies simulated-only settings and an unreachable database URL, and refuses external/API/RPC/WebSocket requests. It does not start a financial worker. The full `yarn test` suite separately needs isolated local PostgreSQL beta and `_test` databases plus Forge/Anvil. Keep browser reports/screenshots/traces and generated output out of Git. No deployment is included.

Waitlist operations: the form posts to `POST /api/v1/waitlist`, rate-limited to 5 requests per 10 minutes per client address (PostgreSQL buckets keyed by an HMAC of the address, never the raw IP). `RATE_LIMIT_SECRET` is required (at least 32 characters): `.env.example` carries a local-only placeholder, and any shared environment needs its own unique value. Export invited testers with the operator-only `GET /api/v1/ops/waitlist?page=&size=`, then add each invited email to `PRIVY_BETA_ALLOWLIST`; see [docs/runbooks/backend-beta.md](docs/runbooks/backend-beta.md) and [docs/api/waitlist.md](docs/api/waitlist.md). Nothing is emailed automatically.
