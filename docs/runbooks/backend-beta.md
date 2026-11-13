# Backend beta runbook

Everything here runs in beta only: `APP_STAGE=beta`, providers in `sandbox` (Yellow Card, with
credentials) or `simulated`. `NODE_ENV=production` never enables a real provider. No real money,
mainnet transactions, real BVN or real SMS ever happen in this environment.

## Processes

- App: `yarn dev` (or `yarn build && yarn start`).
- Worker: `yarn worker` — a separate Node process running `src/backend/workers/run.ts`. It claims
  jobs with a lease and runs the scheduled ticks. The app and the worker never share a process.
- Database: PostgreSQL. `yarn db:migrate` applies migrations (`prisma migrate deploy` in hosted
  environments), `yarn db:studio` opens Prisma Studio.

## Seed and operator grant

1. `yarn prisma migrate deploy`
2. `yarn seed:beta` — idempotent. Refuses to run outside `APP_STAGE=beta`. Ensures treasury wallets,
   posts opening balances (Base treasury 100,000 USDC; Yellow Card float 10,000 USDC; Solana
   treasury 0) and upserts the fictional simulated catalog `TSTA` ($2.00) and `TSTB` ($5.00) on Base.
3. Grant an operator by phone:
   `yarn tsx --env-file-if-exists=.env scripts/grant-operator.ts +2340000000001`

## Schedules (all times Africa/Lagos, UTC+1 year-round)

| Schedule | When (Lagos) | Job |
| --- | --- | --- |
| `poll.open_work` | every minute | re-arms progress jobs for open orders, pending transfers and trades |
| `treasury.rebalance` | hourly at :30 | moves USDC between per-chain treasury and the partner float |
| `reconcile.run` | daily 02:00 | ledger vs. external-balance reconciliation, alerts only, never rewrites |
| `earnings.harvest` | Thursday 22:00 | records the week's simulated stock earnings per holding |
| `earnings.float_precheck` | Thursday 23:00 | checks float can cover the week's payouts |
| `earnings.payout_batch` | Friday 08:00–23:00, hourly | pays out qualifying weekly earnings, oldest first, stopping at the first unfundable one |

## Ops endpoints (operator role required)

- `GET /api/v1/ops/status` — controls, open alerts, dead jobs, oldest pending job, transfers
  awaiting approval, last reconciliation.
- `POST /api/v1/ops/controls` — body `{ scope, paused, reason }`. Scopes: `deposits`, `payouts`,
  `trading`, `provider:yellowcard`, `provider:paycrest`.
  - Pause deposits: `{"scope":"deposits","paused":true,"reason":"incident 123"}`.
  - Pause a provider rail (new orders fail over to the next eligible provider; open orders stay
    pinned to theirs): `{"scope":"provider:yellowcard","paused":true,"reason":"..."}`.
  - Resume: same body with `"paused": false`.
- `POST /api/v1/ops/jobs/[id]/retry` — requeues a dead job.
- `POST /api/v1/ops/orders/[id]/refund` — refunds a held/awaiting deposit through the provider.
- `POST /api/v1/ops/transfers/[id]/approve` — one operator approval; a transfer at or above the
  quorum threshold needs two distinct operators before it is submitted on-chain.

## Procedures

- **Pause a rail:** `POST /api/v1/ops/controls` with `provider:<id>` paused. New orders go to the
  next eligible provider (Yellow Card, then Paycrest) unless its circuit is open (5 consecutive
  provider failures open it for 300 s). Existing orders always stay with their original provider.
- **Resume:** set `paused: false`. A provider whose circuit is open still refuses new orders until
  300 s after the last failure.
- **Dead-job retry:** find the job in `GET /api/v1/ops/status` (`dead_jobs`, oldest age), then
  `POST /api/v1/ops/jobs/<id>/retry`.
- **Held-deposit refund:** a deposit held with `needs_review` / `name_mismatch` /
  `amount_mismatch` is refunded with `POST /api/v1/ops/orders/<id>/refund` (operator approval
  recorded in the transition audit).
- **Quorum approval:** transfers at or above `policy.treasury.quorumThresholdMicroUsdc` (25,000
  USDC) sit in `awaiting_approval`; two operators call `POST /api/v1/ops/transfers/<id>/approve`.

## Recovery

Restart the worker (`yarn worker`). Every external effect is idempotent and keyed
(order id / transfer key / swap key), so a restart never double-sends. Then re-arm work with the
`poll.open_work` tick, which runs every minute and re-enqueues progress jobs for open orders,
pending chain transfers and pending trades.

## Open decisions

Placeholder values live in `src/backend/config/policy.ts` (the Decisions table). Until resolved,
treat each as an open decision with an owner:

| Decision | Placeholder value | Owner |
| --- | --- | --- |
| Compliance limits per tier (Lagos day/month, kobo) | tier 1: 30,000,000 / 100,000,000; tier 2: 500,000,000 / 2,000,000,000 | compliance |
| Deposit min/max (kobo) | 100,000 / 500,000,000 | product |
| Deposit amount tolerance | 100 bps | product + compliance |
| Late-payment watch window | 24 h | product |
| Withdrawal quote TTL / FX drift cap | 60 s / 100 bps | product + treasury |
| Trading slippage cap | 100 bps | treasury |
| Float sizing (floor / target / ceiling / top-up margin, micro-USD) | 5e9 / 1e10 / 2e10 / 1e9 | treasury |
| Treasury quorum threshold | 25,000 USDC | treasury + compliance |
| User / treasury transfer caps | 10,000 / 100,000 USDC | treasury |
| Reconciliation threshold | 1 USDC (1,000,000 micro) | treasury |
| Schedule times (harvest, precheck, payout window) | Thu 22:00 / Thu 23:00 / Fri 08:00–23:00 Lagos | product |
| Provider circuit breaker | 5 consecutive failures, open 300 s | partners + treasury |
| Minimum earnings payout | ₦2,000 (200,000 kobo) gross, user pays the fee | product |

Deferred design items (not built in beta): frontend pages and design system; Privy identity/wallet
adapters (simulated until a verified isolated test configuration exists); Solana-funded balances,
multi-chain withdrawals and native-USDC bridging; Yellow Card sandbox settlement behaviour (the
rebalancer alerts instead until the sandbox settlement contract is verified); a real KYC/BVN vendor
and wallet-screening vendor; hosted notifications. Owners: product (frontend, UX decisions),
compliance (KYC/BVN, limits, Travel Rule), treasury (float, quorum, bridging), partners (Yellow Card
sandbox settlement, Paycrest live rail).

## Yellow Card sandbox persona note

When `YELLOWCARD_MODE=sandbox` with real sandbox keys, the beta test persona must carry the account
name the sandbox returns for account number `1111111111`. That name is not captured yet (no sandbox
keys exist in beta): record it in `tests/contracts/fixtures/yellowcard/details-bank.json` under
`_source` with the capture date, and copy it here. Until then, Yellow Card runs `simulated` and its
webhook endpoint answers 404.
