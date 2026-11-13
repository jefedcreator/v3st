# V3ST Backend and API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete V3ST server side for the beta: the `/api/v1` HTTP API, double-entry ledger, deposit/withdrawal/earnings workflows, background worker, partner adapters and operational controls. Every provider runs as a sandbox or a simulation.

**Architecture:** Next.js 15 Route Handlers under `/api/v1` are thin `withMiddleware` wrappers over class-singleton services, and services are the only code that touches Prisma. Money lives in an append-only, asset-keyed double-entry ledger in PostgreSQL. Every external effect (partner call, chain transfer, swap, settlement) is driven by an idempotent, state-driven *progress* job that a separate Node worker runs. Webhooks, the one-minute poller and beta scenarios only (re)arm those jobs. Providers sit behind interfaces backed by a database simulator. Yellow Card also gets a sandbox HTTP adapter.

**Tech Stack:** Node 24.15.0, Yarn 1.22.22, Next.js 15.5, TypeScript 5.9, Prisma 6.19.3 + PostgreSQL, Zod 3.25, @t3-oss/env-nextjs 0.12, @sentry/nextjs 11.10.0, Vitest 5.0.5 + Vite 7.3.8, tsx 4.23.15.

**Spec:** [Design.md](../../../Design.md) (product and technical design) and [BACKEND_PATTERNS.md](../../../BACKEND_PATTERNS.md) (server architecture). Binding constraints also come from [CLAUDE.md](../../../CLAUDE.md), [AGENTS.md](../../../AGENTS.md) (beta-only provider policy) and the user's 2026-11-13 instruction: *"skip frontend tasks, for now. focus only on backend/api tasks"*.

**Scope:** This plan covers Route Handlers, services, validators, Prisma schema and migrations, the worker, scripts and their tests. Pages, components, hooks, `src/server/<domain>.ts` RSC wrappers, `src/middleware.ts` page guards, `DESIGN_SYSTEM.md` and styling are deferred to a later frontend plan. Under CLAUDE.md a feature counts as *delivered* only once that frontend exists. This plan delivers the API those pages will consume.

**Relationship to the umbrella plan:** [2026-11-13-v3st-naira-ramps-and-payouts.md](2026-11-13-v3st-naira-ramps-and-payouts.md) mixes backend and frontend in each task. This plan replaces its server-side parts with executable tasks and keeps its beta provider policy. Deliberate differences from the umbrella plan:
- Privy is simulated throughout, because no verified isolated test configuration exists.
- User funds live on Base only.
- The workflows are state-driven progress jobs rather than a generic `FinancialOperation` table.
- Stock holdings are ledger assets rather than a `Position` table.

The umbrella plan's frontend bullets remain the input for the frontend plan.

## Global Constraints

- **Beta only.** `APP_STAGE` must equal `beta` in the app, worker, scripts and tests. This is independent of `NODE_ENV`, so `NODE_ENV=production` never enables a real provider. Provider modes are exactly `sandbox | simulated`.
- **Allowed modes:** Yellow Card may be `sandbox` or `simulated`. Paycrest, identity, KYC, screening, wallets, venues, earnings and settlement are `simulated` only. The Yellow Card host is hard-coded to `https://sandbox.api.yellowcard.io/business`. No environment variable can change it, and no code path may reach `https://api.yellowcard.io`.
- No real money, mainnet transaction, real BVN, real phone verification or real notification. User-facing instructions and DTOs carry `test_funds_only: true` / `test_details_only: true`.
- "V3ST never touches naira itself." Naira collection, conversion, refund and payout all go through a partner.
- "A double-entry ledger in Postgres is the source of truth for money." Reconciliation reports differences. It never rewrites the ledger.
- "Amounts are integers: kobo for NGN, micro-units for USDC. No floating point." USD is micro-USD. Stock quantities use each stock's `decimals`. Wire money is a decimal **integer string** in minor units, so `ngn_amount` is kobo.
- "User-facing naira values are computed at read time from USD amounts and the current rate. They are never stored as balances." Order snapshots (locked rate, fee, amounts) are immutable records, not balances.
- "Every state change is one database transaction that writes the order row and its ledger entries together." The same transaction also writes the transition audit, the user event and any follow-up job.
- "`idempotency_key` is unique per order. Retried API calls and replayed webhooks return the existing order." Reusing a key with a different body returns 409 `IDEMPOTENCY_KEY_REUSED`.
- "`webhook_events.event_id` is unique per provider." Yellow Card's payload `id` is the *transaction* id, so the event key is `${id}:${event}:${executedAt}`.
- "Every webhook is treated as a hint. The handler always re-fetches the transaction from the partner before changing state."
- "Open orders stay with their original partner." An order's `provider` and `providerMode` never change after creation.
- "Payout day: Friday, Lagos time." All calendar logic uses `Africa/Lagos` through `Intl`, never host time or a hard-coded offset.
- Minimum earnings payout is "₦2,000 (proposed)", which is `200_000n` kobo gross. The user pays the payout fee. The Travel Rule threshold "$1,000 or more" is `1_000_000_000n` micro-USD.
- BACKEND_PATTERNS rules hold except where *Adaptations* below say otherwise. Every handler uses `withMiddleware`, with auth before validators. Zod schemas are `.strict()`. Services are class singletons exporting an instance. Every Prisma argument object is explicitly typed. The Prisma `globalThis` singleton stays. Session tokens come from `randomBytes(32).toString('base64url')`. The session cookie is `sara-session`, httpOnly, `SameSite=Lax`, and `Secure` in production. Sentry is called only from `withMiddleware`. Handlers never log.
- CLAUDE.md: never use conditional or optional object spread; assign with `if`. Commit each task with explicit paths and no AI attribution lines.
- **CLAUDE.md overrides the skill's per-step red/green runs: do not run `yarn test`, `yarn lint`, `yarn typecheck` or `yarn build` (or `vitest` directly) before Task 21.** Each task writes its tests next to the code. Its review step traces every assertion through the diff by reading. Task 21 runs every gate once and fixes what it finds. `yarn prisma generate` and `yarn prisma migrate diff` are code generation, not gates, and are allowed.
- Never import `server-only` in `src/backend/**`. The worker (tsx) and Vitest run without the `react-server` condition, so the import would throw.
- All business time comes from `now()` in `src/backend/clock.ts` and is passed into SQL as a parameter. Never use SQL `now()`. Tests fake time with `vi.useFakeTimers({ toFake: ['Date'] })`.

## Review Focus

1. **Crash after a partner or chain accepted an operation.** On resume the system must find the original operation by its deterministic key (Yellow Card `sequenceId` = order id, transfer key, swap key) and never send twice. Pinned by tests in Tasks 8, 11, 13 and 15.
2. **Concurrent claims on the same funds.** Parallel withdrawals, a retry racing a withdrawal, and two Friday batch runs must leave exactly one reservation or payout. Pinned in Tasks 5, 15 and 17.
3. **Money arriving late, short, long or from a third party.** There must be no wrong credit, the refund must be traceable, and a payment after local expiry is still credited. Pinned in Task 14.
4. **Lagos calendar edges and Friday float shortage.** A Sunday-UTC/Monday-Lagos instant must belong to the right week. Earnings keep their original week. Payouts go oldest-first and stop at the first unfundable one, and a crashed batch resumes without duplicates. Pinned in Tasks 6 and 17.
5. **Unavailable rates or a moved locked rate.** The API answers 503, `valuation: 'unavailable'` or a `rate_moved` hold. It must never return ₦0 or charge beyond the confirmed quote. Pinned in Tasks 8, 13 and 15.

Beta containment is a standing gate on top of these five, pinned in Tasks 1, 9, 19 and 21.

## Adaptations of BACKEND_PATTERNS.md

The guide was copied from another product. Task 3 rewrites the affected sections so that the guide and the code agree.

| Guide says | V3ST does | Why |
| --- | --- | --- |
| MongoDB ObjectIds, `mongoIdValidator` | CUIDs, `cuidSchema = z.string().cuid()` | PostgreSQL and the existing Prisma `@default(cuid())` |
| `request.user` carries `business` | `AuthenticatedUser = User & { session: Session }` | V3ST has no business entity |
| `import type { Prisma } from '@prisma/client'` | `import { Prisma } from '@/server/prisma'` | The client generates into `generated/prisma` |
| JSON body always parsed | `withMiddleware(..., { bodyMode: 'json' \| 'raw' \| 'none' })`, 64 KiB cap, malformed JSON gives 400 | Webhook signatures cover raw bytes |
| Errors `{ message }`; 500s echo `error.message` | `{ status, message, code, data: null }`; every 500 says `Internal server error` and the detail goes only to Sentry | Rule 4: never return raw error details |
| Routes may use `db` directly | Routes call services only | Rule 8's stricter reading |
| `db.$transaction([...])` arrays | Interactive `withTx` plus `SELECT … FOR UPDATE` row locks for read-compare-write | Reservations need conditional writes |
| Logout redirects with 303 | `POST /api/v1/auth/logout` returns JSON 200 | API client, not a form post |
| camelCase Prisma rows returned | snake_case DTOs from explicit serializers; money as integer strings | Design's wire names (`ngn_amount`, `quote_id`); BigInt is not JSON |
| `next lint` | `eslint .` | `next lint` is deprecated in Next 15.5 |
| Paths `/v1/...` in Design.md | Canonical `/api/v1/...`, with rewrites from `/v1/:path*` and `/webhooks/:provider` | App Router API lives under `/api` |

## Decisions and Placeholders (`src/backend/config/policy.ts`)

Values marked *placeholder* are beta values the spec leaves open. They live in one typed `policy` object so that changing one is a reviewed one-line diff.

| Key | Value | Source |
| --- | --- | --- |
| `earnings.minPayoutKobo` | `200_000n` | Design: ₦2,000 (proposed) |
| `compliance.travelRuleMicroUsd` | `1_000_000_000n` | Design: $1,000 |
| `compliance.limits` (kobo, per direction, Lagos day/month) | tier 1: day `30_000_000n`, month `100_000_000n`; tier 2: day `500_000_000n`, month `2_000_000_000n` | placeholder |
| `deposits.minKobo` / `maxKobo` | `100_000n` / `500_000_000n` | placeholder |
| `deposits.toleranceBps` | `100` | placeholder (Design names a tolerance, not a value) |
| `deposits.latePaymentWatchHours` | `24` | placeholder |
| `withdrawals.quoteTtlSeconds` | `60` | placeholder ("short window") |
| `withdrawals.fxDriftBps` | `100` | placeholder: max locked-cost excess V3ST absorbs before holding |
| `trading.maxSlippageBps` | `100` | placeholder ("enforces a slippage limit") |
| `rates.displayCacheSeconds` | `5` | Design: "cached for a few seconds" |
| `treasury.float` (micro-USD) | floor `5_000_000_000n`, target `10_000_000_000n`, ceiling `20_000_000_000n`, top-up margin `1_000_000_000n` | placeholder (open question "Float sizing") |
| `treasury.quorumThresholdMicroUsdc` | `25_000_000_000n` | placeholder |
| `treasury.userTransferCapMicroUsdc` / `treasuryTransferCapMicroUsdc` | `10_000_000_000n` / `100_000_000_000n` | placeholder |
| `recon.thresholdMicro` | `1_000_000n` | placeholder ("small threshold") |
| `defaultChain` | `'base'` | decision: user funds on Base only in beta |
| `schedule` (Lagos) | poll every minute; rebalance hourly at :30; reconcile 02:00 daily; harvest Thu 22:00; float precheck Thu 23:00; payouts Fri 08:00–23:00 hourly | Design order (harvest → check → Friday); times placeholder |
| `providers.circuit` | open after 5 consecutive failures, for 300 s | placeholder |
| `worker` | concurrency 4, idle poll 1000 ms, lease 120 s, max attempts 10 | decision |
| `auth` | identity-token TTL 300 s; session 2_592_000 s (30 days); test phones `^\+2340000000\d{3}$` | decision; 30 days from the guide |
| `sim.yellowcard` | buy `'1600'`, sell `'1550'` NGN per USD; settle 5 s; collection TTL 240 min | sandbox-like values (YC docs example; YC "4 hours to pay") |
| `sim.paycrest` | buy `'1610'`, sell `'1540'`; fee 0; min `500_000n` micro-USD | Design: orders from $0.50 |
| `sim.chain` | confirm after base 4 s, solana 2 s | simulation |
| Simulated Yellow Card fees | pay-in `< ₦100,000`: 1% (min ₦55); `≥ ₦100,000`: 0.5% (min ₦1,350); payout flat ₦100 | Design's published fee schedule |

## Architecture Contracts

### Rates and conversions

`Rate = { kobo: bigint; microUsd: bigint }` means *`kobo` kobo buys `microUsd` micro-USD*, reduced by their gcd. ₦1,600/$1 is `{ kobo: 4n, microUsd: 25n }` and ₦1,550/$1 is `{ kobo: 31n, microUsd: 200n }`. Deposits use the partner's **buy** rate and payouts its **sell** rate. Deposits convert the naira net of the fee with floor rounding. Payout debits convert the gross with ceil rounding. Valuations use the payout rate with floor rounding. Treasury funding sends USDC 1:1 with the USD credited (Design step 7: "the same USDC amount").

### Ledger: flow convention and chart of accounts

Each entry moves `amount` of one `asset` **from `debitAccount` to `creditAccount`**. An account's balance is credits minus debits. Every journal therefore conserves each asset, which gives the testable invariant *Σ balances per asset = 0*. Accounts flagged `allowNegative: false` are checked under row locks before posting.

| Builder (`acct.*`) | Code | Asset | Negative allowed |
| --- | --- | --- | --- |
| `userCash(userId, chain)` | `user:<id>:cash:<chain>` | USDC | no |
| `userReserved(userId, chain)` | `user:<id>:reserved:<chain>` | USDC | no |
| `userEarnings(userId, chain)` | `user:<id>:earnings:<chain>` | USDC | no |
| `userPending(userId)` | `user:<id>:pending` | USDC | no |
| `userStock(userId, stockId)` / `userStockReserved(…)` | `user:<id>:stock:<stockId>[:reserved]` | `STOCK:<stockId>` | no |
| `float(provider)` | `float:<provider>` | USD | **yes** (mirrors an external balance; reconciliation flags negatives) |
| `payoutsInFlight(provider)` | `inflight:<provider>` | USD | no |
| `external(provider, asset)` | `ext:<provider>:<asset>` | any | yes |
| `treasury(chain)` / `treasuryOutbound(chain)` | `treasury:<chain>[:outbound]` | USDC | no |
| `claimsClearing()` | `clearing:claims` | USDC | yes |
| `venue(venueId, asset)` | `venue:<venueId>:<asset>` | any | yes |
| `earningsSource(source)` | `ext:earnings:<source>` | USDC | yes |
| `equityOpening(asset)` | `equity:opening:<asset>` | any | yes |

Posting templates in `src/backend/services/ledger/postings.ts` are pure functions that return `JournalInput`. Each journal key is deterministic:

| Template | Entries (debit → credit) | Key |
| --- | --- | --- |
| `depositReceived` | `ext:p:USD → float:p` (usd); `clearing:claims → user:pending` (usd as USDC) | `deposit:<orderId>:received` |
| `depositReceivedDirect` | `ext:p:USDC → user:cash:chain` | `deposit:<orderId>:received` |
| `transferReserved` / `transferReleased` | `treasury:chain ⇄ treasury:chain:outbound` | `transfer:<id>:reserved` / `:released` |
| `userFunded(to: 'cash' \| 'earnings')` | `treasury:chain:outbound → user:cash\|earnings:chain`; `user:pending → clearing:claims` | `transfer:<id>:settled` |
| `cashReserved` / `cashReleased(from\|to: 'cash' \| 'earnings')` | `user:cash\|earnings:chain ⇄ user:reserved:chain` | caller key + `:reserve` / `:release` |
| `stockReserved` / `stockReleased` | `user:stock ⇄ user:stock:reserved` | caller key + `:reserve` / `:release` |
| `payoutCollected` | `user:reserved:chain → treasury:chain` | `transfer:<id>:settled` |
| `payoutSubmitted` / `payoutPaid` | `float:p → inflight:p`; then `inflight:p → ext:p:USD` | `payout:<orderId>:submitted` / `:paid` |
| `payoutRejected` | `inflight:p → float:p` (usd); `clearing:claims → user:pending` (debitUsdc) | `payout:<orderId>:rejected` |
| `directPayoutCollected` / `directPayoutRefunded` | `user:reserved:chain → ext:p:USDC`; refund `ext:p:USDC → user:cash\|earnings:chain` | `transfer:<id>:settled` / `payout:<orderId>:refunded` |
| `tradeFilled` | buy: `user:reserved → venue:v:USDC` (in), `venue:v:STOCK → user:stock` (out); sell: `user:stock:reserved → venue:v:STOCK`, `venue:v:USDC → user:cash` | `trade:<id>:filled` |
| `earningHarvested` | `ext:earnings:<source> → user:earnings:chain` | `earning:<userId>:<stockId>:<week>` |
| `floatToppedUp` | `treasury:chain:outbound → ext:p:USDC`; `ext:p:USD → float:p` | `treasury-op:<id>:complete` |
| `floatWithdrawalRequested` / `floatWithdrawalReceived` | `float:p → ext:p:USD`; then `ext:p:USDC → treasury:chain` | `treasury-op:<id>:requested` / `:complete` |
| `openingBalance` | `equity:opening:<asset> → account` | `opening:<account code>` |

### Order state machines (`src/backend/services/orders/transitions.ts`)

- Deposit: `created → awaiting_transfer | failed`; `awaiting_transfer → received | expired | refunded | failed`; `expired → received | refunded` (late payment); `received → funded`; `funded → settled`.
- Payout (`withdrawal`, `earnings_payout`): `created → funds_collected | failed`; `funds_collected → submitted | reversed`; `submitted → paid | reversed`.
- A same-status "transition" is allowed for hold and patch updates. It bumps `version` and writes an audit row, but no status change.
- Holds (`holdReason`): `name_mismatch`, `amount_mismatch`, `missing_sender`, `treasury_short`, `float_short`, `rate_moved`, `screening`, `paused`, `needs_review`.

### Jobs and the worker

There is one `jobs` row per `(kind, subjectId)` with key `${kind}:${subjectId}`. `enqueue` inserts or *re-arms*:
- `done` becomes `pending` with attempts reset.
- `pending` keeps the earlier `runAt`.
- `running` records `rearmAt` so the job runs again after it completes.
- `dead` is left alone; only an operator revives it.

Handlers are idempotent progress functions with three outcomes:
- Return normally, optionally after self-enqueueing a follow-up with a future `runAt`.
- Throw `RetryableError`: backoff `min(5 s × 2^(attempts−1), 1 h)` plus jitter.
- Throw `PermanentJobError`: the job goes `dead` and an alert is raised. Exhausting 10 attempts also kills the job.

A minute poller re-arms every open order, transfer, trade and treasury operation (Design: "Poller checks open orders every minute"). Schedules fire once per slot through a unique `schedule_runs(name, slot)` row, so several workers need no leader election.

### Provider interfaces (signatures fixed here, implemented in the named tasks)

```ts
// src/backend/services/ramp/types.ts — Task 8
type ProviderId = 'yellowcard' | 'paycrest'; type Direction = 'in' | 'out';
type SettlementModel = 'partner_float' | 'direct_chain';
type Quote = { provider: ProviderId; direction: Direction; ngnAmount: bigint; feeNgn: bigint;
  usdAmount: bigint; rate: Rate; expiresAt: Date; channelRef: string | null };
type Customer = { userId: string; name: string; phone: string; country: 'NG'; dateOfBirth: string | null;
  idType: 'BVN'; idNumber: string | null; address: string | null };
type BankDestination = { bankCode: string; accountNumber: string; accountName: string };
type Collection = { ref: string; bankName: string; accountNumber: string; accountName: string;
  reference: string | null; expiresAt: Date; locked: Quote };
type PayoutResult = { ref: string; locked: Quote; funding: { kind: 'float' } |
  { kind: 'chain'; chain: Chain; token: 'USDC'; address: string; amount: bigint } };
type ProviderTxState = 'pending' | 'complete' | 'failed' | 'expired' | 'refunding' | 'refunded' | 'hold';
type ProviderTx = { ref: string; key: string | null; direction: Direction; state: ProviderTxState;
  ngnAmount: bigint | null; usdAmount: bigint | null; feeNgn: bigint | null; senderName: string | null;
  bankReference: string | null; failureCode: string | null;
  chainSettlement: { chain: Chain; txHash: string; amount: bigint; recipient: string } | null };
type WebhookHint = { eventKey: string; ref: string; key: string | null; direction: Direction | null; event: string };
interface RampProvider {
  readonly id: ProviderId; readonly mode: ProviderMode; readonly settlementModel: SettlementModel;
  rates(): Promise<{ buy: Rate; sell: Rate; asOf: Date }>;
  quote(direction: Direction, ngnAmount: bigint): Promise<Quote>;
  createCollection(input: { quote: Quote; customer: Customer; source: BankDestination; key: string;
    recipient: { chain: Chain; address: string } | null }): Promise<Collection>;
  refundCollection(ref: string): Promise<void>;
  resolveBankAccount(bankCode: string, accountNumber: string): Promise<string>;
  listBanks(): Promise<{ code: string; name: string }[]>;
  createPayout(input: { quote: Quote; destination: BankDestination; customer: Customer; key: string;
    maxUsd: bigint }): Promise<PayoutResult>; // never accepts a locked cost above maxUsd
  getTransaction(direction: Direction, ref: string): Promise<ProviderTx>;
  findByKey(direction: Direction, key: string): Promise<ProviderTx | null>;
  floatBalance(): Promise<bigint | null>; // micro-USD; null for direct_chain
  verifyWebhook(headers: Headers, rawBody: Uint8Array): boolean;
  parseWebhook(rawBody: Uint8Array): WebhookHint;
}
class ProviderError extends Error { kind: 'transient' | 'rejected' | 'duplicate' | 'rate_moved' | 'not_found'; code: string }
```

`WalletProvider` (Task 11), `Venue` (Task 13), `SettlementProvider` (Task 16), `EarningsSource` (Task 17) and `IdentityVerifier` (Task 10) are fixed in their tasks' Interfaces blocks.

### API surface (canonical paths; `/v1/*` and `/webhooks/*` rewrite here)

| Method and path | Auth | Task |
| --- | --- | --- |
| `POST /api/v1/beta/identity-token` `{ phone }` | none (simulated identity only) | 10 |
| `POST /api/v1/auth/session` `{ identity_token }`, `POST /api/v1/auth/logout`, `GET /api/v1/me` | none / session / session | 10 |
| `GET /api/v1/identity/personas`, `POST /api/v1/identity/verification` `{ persona }` | session | 12 |
| `GET /api/v1/banks`, `GET /api/v1/bank-accounts`, `POST /api/v1/bank-accounts` `{ bank_code, account_number }` | session | 12 |
| `GET /api/v1/rates/ngn` | none | 8 |
| `GET /api/v1/stocks`, `GET /api/v1/portfolio`, `POST /api/v1/trades/:id/retry` (Idempotency-Key) | session | 13 |
| `POST /api/v1/deposits` `{ ngn_amount, stock_id? }` (Idempotency-Key), `GET /api/v1/deposits/:id` | session | 14 |
| `POST /api/v1/withdrawals/quote` `{ ngn_amount, stock_id? }`, `POST /api/v1/withdrawals` `{ quote_id }` (Idempotency-Key), `GET /api/v1/withdrawals/:id` | session | 15 |
| `GET /api/v1/earnings?page&size`, `PUT /api/v1/earnings/preference` `{ mode, stock_id? }` | session | 17 |
| `GET /api/v1/ops/status`, `PUT /api/v1/ops/controls`, `POST /api/v1/ops/jobs/:id/retry`, `POST /api/v1/ops/orders/:id/refund`, `POST /api/v1/ops/transfers/:id/approve` | operator | 18 |
| `POST /api/v1/webhooks/yellowcard` | provider signature | 9 |
| `POST /api/v1/webhooks/paycrest` | provider signature | 19 |
| `GET /api/v1/events` (SSE), `POST /api/v1/beta/scenarios` | session | 20 |

Status codes: 400 malformed input or missing `Idempotency-Key`; 401 no or invalid session; 403 failed eligibility (`KYC_REQUIRED`, `BANK_ACCOUNT_REQUIRED`, `TRAVEL_RULE_DATA_MISSING`) or non-operator; 404 missing or not owned; 409 conflicts (`IDEMPOTENCY_KEY_REUSED`, `QUOTE_EXPIRED`, `QUOTE_CONSUMED`, `INSUFFICIENT_FUNDS`, `LIMIT_EXCEEDED`, `STALE_STATE`, `INVALID_TRANSITION`); 413 body over 64 KiB; 422 validation (`VALIDATION_FAILED`, `NAME_MISMATCH`, `BELOW_MINIMUM`); 503 paused or unavailable (`DEPOSITS_PAUSED`, `PAYOUTS_PAUSED`, `RAIL_UNAVAILABLE`, `RATES_UNAVAILABLE`, `FLOAT_UNAVAILABLE`).

## File Map

| Area | Paths |
| --- | --- |
| Runtime and policy | `src/env.js`, `src/backend/clock.ts`, `src/backend/config/policy.ts`, `src/backend/integrations/beta-policy.ts`, `src/backend/observability.ts`, `src/instrumentation.ts`, `next.config.js` |
| HTTP contracts | `src/types/index.ts`, `src/types/dto.ts`, `src/utils/{exceptions,money,index,response}.ts`, `src/backend/middleware/{index,types}.ts`, `src/backend/validators/*.validator.ts` |
| Persistence | `prisma/schema.prisma`, `prisma/migrations/*`, `src/server/{db,prisma}.ts` |
| Core services | `src/backend/services/{ledger,orders,jobs,alerts,controls}/`, `src/backend/workers/{run,handlers}.ts` |
| Rails | `src/backend/services/{ramp,rates,webhooks,simulator,wallets,screening}/` |
| Identity and compliance | `src/backend/services/{auth,users,kyc,compliance,bank-accounts}/`, `src/server/auth/constants.ts` |
| Product flows | `src/backend/services/{stocks,trades,portfolio,deposits,withdrawals,earnings,treasury}/` |
| Operations | `src/backend/services/{reconciliation,operations,events,scenarios}/`, `scripts/{seed-beta,grant-operator}.ts`, `docs/runbooks/backend-beta.md` |
| Routes | `src/app/api/v1/**/route.ts` (table above) |
| Tests | `vitest.config.ts`, `tests/{setup,global-setup}.ts`, `tests/helpers/{db,time,factories,http,worker}.ts`, `tests/unit/`, `tests/integration/`, `tests/contracts/` (+ `fixtures/yellowcard/`) |

Shared test helpers, created in the task named and reused afterwards:
- `useTestDatabase()` (Task 1): truncates every table except `_prisma_migrations` before each test.
- `setNow(iso)` (Task 1).
- `makeUser(overrides?)`, `fundCash(userId, microUsdc)`, `seedTreasury(chain, microUsdc)`, `seedFloat(provider, microUsd)` (Task 5; later tasks add `makeVerifiedUser`, `makeStock`, `makeBankAccount`).
- `callRoute(handler, { method, url, body?, headers?, cookie?, params? })` (Task 3).
- `drainJobs({ maxSteps = 200 })` (Task 6). It runs due jobs through the handler registry. When nothing is due, it advances the fake clock to the next `runAt`, ticks the scheduler, and stops when idle.

---

## Phase A — Foundations

### Task 1: Tooling, runtime configuration and beta containment

**Files:**
- Modify: `package.json`, `yarn.lock`, `eslint.config.js`, `src/env.js`, `.env.example`
- Delete: `src/app/api/auth/[...nextauth]/route.ts`, `src/server/auth/config.ts`, `src/server/auth/index.ts`
- Create: `src/backend/clock.ts`, `src/backend/config/policy.ts`, `src/backend/integrations/beta-policy.ts`, `vitest.config.ts`, `tests/setup.ts`, `tests/global-setup.ts`, `tests/helpers/db.ts`, `tests/helpers/time.ts`, `tests/unit/beta-policy.test.ts`

**Interfaces:**
- Produces:
  - `now(): Date`
  - `policy` (every value in *Decisions and Placeholders*)
  - `type ProviderMode = 'sandbox' | 'simulated'`
  - `type IntegrationId = 'yellowcard' | 'paycrest' | 'identity' | 'kyc' | 'screening' | 'wallets' | 'venues' | 'earnings' | 'settlement'`
  - `type IntegrationModes = Record<IntegrationId, ProviderMode>`
  - `BETA_ALLOWED_MODES`
  - `YELLOWCARD_SANDBOX_URL = 'https://sandbox.api.yellowcard.io/business'`
  - `class BetaPolicyError extends Error`
  - `assertBetaRuntime(source: BetaEnvSource): IntegrationModes`, where `BetaEnvSource = { APP_STAGE?: string; NODE_ENV?: string; YELLOWCARD_MODE?: string; YELLOWCARD_API_KEY?: string; YELLOWCARD_API_SECRET?: string }`
  - `integrationModes(): IntegrationModes` (memoised over `env`)
  - `assertAllowedUrl(integration: 'yellowcard', url: string): void`
  - Test helpers `useTestDatabase()` and `setNow(iso: string): Date`

- [ ] **Step 1: Swap dependencies and scripts**

```bash
yarn remove next-auth @auth/prisma-adapter
yarn add -E @sentry/nextjs@11.10.0
yarn add -D -E vitest@5.0.5 vite@7.3.8 tsx@4.23.15
yarn add -D @types/node@^24
```

Set these scripts:
- `"lint": "eslint ."`
- `"lint:fix": "eslint . --fix"`
- `"check": "yarn lint && yarn typecheck"`
- `"test": "vitest run"`
- `"worker": "tsx --env-file-if-exists=.env src/backend/workers/run.ts"`
- `"seed:beta": "tsx --env-file-if-exists=.env scripts/seed-beta.ts"`

Leave `postinstall`, `db:*`, `dev`, `build` and `typecheck` unchanged. In `eslint.config.js`, set `ignores: ['.next', 'generated', 'coverage']`. Delete the three NextAuth starter files.

- [ ] **Step 2: Write the failing beta-policy tests**

```ts
// tests/unit/beta-policy.test.ts
const valid = { APP_STAGE: 'beta', NODE_ENV: 'development', YELLOWCARD_MODE: 'simulated' };
it('rejects any stage other than beta', () => {
  expect(() => assertBetaRuntime({ ...valid, APP_STAGE: 'production' })).toThrow(BetaPolicyError);
  expect(() => assertBetaRuntime({ ...valid, APP_STAGE: undefined })).toThrow(BetaPolicyError);
});
it('keeps simulated providers under NODE_ENV=production', () => {
  expect(assertBetaRuntime({ ...valid, NODE_ENV: 'production' }).yellowcard).toBe('simulated');
});
it('requires credentials for the Yellow Card sandbox and rejects unknown modes', () => {
  expect(() => assertBetaRuntime({ ...valid, YELLOWCARD_MODE: 'sandbox' })).toThrow(BetaPolicyError);
  expect(assertBetaRuntime({ ...valid, YELLOWCARD_MODE: 'sandbox', YELLOWCARD_API_KEY: 'k', YELLOWCARD_API_SECRET: 's' }).yellowcard).toBe('sandbox');
  expect(() => assertBetaRuntime({ ...valid, YELLOWCARD_MODE: 'live' })).toThrow(BetaPolicyError);
});
it('pins every other integration to simulated', () => {
  const modes = assertBetaRuntime(valid);
  for (const id of ['paycrest', 'identity', 'kyc', 'screening', 'wallets', 'venues', 'earnings', 'settlement'] as const) {
    expect(modes[id]).toBe('simulated');
    expect(BETA_ALLOWED_MODES[id]).toEqual(['simulated']);
  }
});
it('allows only the Yellow Card sandbox host', () => {
  expect(() => assertAllowedUrl('yellowcard', 'https://sandbox.api.yellowcard.io/business/rates')).not.toThrow();
  expect(() => assertAllowedUrl('yellowcard', 'https://api.yellowcard.io/business/rates')).toThrow(BetaPolicyError);
  expect(() => assertAllowedUrl('yellowcard', 'https://sandbox.api.yellowcard.io.evil.test/business/rates')).toThrow(BetaPolicyError);
  expect(() => assertAllowedUrl('yellowcard', 'http://sandbox.api.yellowcard.io/business/rates')).toThrow(BetaPolicyError);
});
it('blocks live network access from tests', async () => {
  await expect(fetch('https://example.com')).rejects.toThrow('Live network access is disabled in tests');
});
```

- [ ] **Step 3: Implement `beta-policy.ts`, `clock.ts` and `policy.ts`**

`assertAllowedUrl` parses the URL. The parsed URL must have protocol `https:`, host `sandbox.api.yellowcard.io`, and a pathname starting with `/business/`. Compare parsed parts, never string prefixes. `assertBetaRuntime` returns a fresh object; `integrationModes()` caches the result for `env`. `policy` is a single `as const` object holding every row of the Decisions table, with BigInt literals for money.

- [ ] **Step 4: Rewrite `src/env.js` and `.env.example`**

**Server variables:**
- `APP_STAGE: z.literal('beta')`
- `DATABASE_URL: z.string().url()`
- `NODE_ENV`
- `YELLOWCARD_MODE: z.enum(['sandbox', 'simulated']).default('simulated')`
- `YELLOWCARD_API_KEY: z.string().optional()`
- `YELLOWCARD_API_SECRET: z.string().optional()`
- `SIMULATED_IDENTITY_SECRET: z.string().min(32)`
- `PAYCREST_SIM_WEBHOOK_SECRET: z.string().min(16).optional()`
- `SENTRY_DSN: z.string().url().optional()`

**Client variable:** `NEXT_PUBLIC_APP_URL: z.string().url()`.

Remove every `AUTH_*` variable. In `.env.example`:
- Keep `APP_STAGE="beta"`.
- Set `YELLOWCARD_MODE="simulated"`, leave the keys empty, and add `SIMULATED_IDENTITY_SECRET="local-beta-identity-secret-not-for-hosting-0001"`.
- Keep `TEST_DATABASE_URL`.

Copy the new keys into your own uncommitted `.env`.

- [ ] **Step 5: Build the test harness**

**`vitest.config.ts`:**
- `environment: 'node'`, `fileParallelism: false`, `include: ['tests/**/*.test.ts']`.
- `setupFiles: ['tests/setup.ts']`, `globalSetup: ['tests/global-setup.ts']`.
- `resolve.alias: { '@': <abs path to src> }`.
- `test.env` is built from `loadEnv('test', cwd, '')`:
  - `DATABASE_URL` = the loaded `TEST_DATABASE_URL`.
  - `APP_STAGE: 'beta'`, `YELLOWCARD_MODE: 'simulated'`.
  - A 32+ character `SIMULATED_IDENTITY_SECRET`.
  - `PAYCREST_SIM_WEBHOOK_SECRET: 'paycrest-test-secret'`.
  - `NEXT_PUBLIC_APP_URL: 'http://localhost:3000'`.

**`tests/global-setup.ts`:**
- Throw unless `TEST_DATABASE_URL` is set and differs from `.env`'s `DATABASE_URL`.
- Throw unless the database name ends in `_test`.
- Then run `yarn prisma migrate reset --force --skip-seed --skip-generate` with `DATABASE_URL=TEST_DATABASE_URL`.

**`tests/setup.ts`:**
- `vi.stubGlobal('fetch', …)` with a function that rejects with `Error('Live network access is disabled in tests')`.
- `vi.mock('@/backend/observability', …)` with no-op functions; the module arrives in Task 3.

**`tests/helpers/db.ts`:** `resetDatabase()` truncates every table in `current_schema()` except `_prisma_migrations`, using `RESTART IDENTITY CASCADE`. `useTestDatabase()` registers it in `beforeEach`.

**`tests/helpers/time.ts`:** `setNow(iso)` calls `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(new Date(iso))`.

- [ ] **Step 6: Review the diff against Step 2**

This replaces the skill's red/green run, per CLAUDE.md. Trace each assertion through `beta-policy.ts`. Confirm that `fetch` in tests can only reach the stub. Confirm no file still imports `next-auth` or `@/server/auth` (`git grep -n "next-auth\|@/server/auth"` prints nothing).

- [ ] **Step 7: Commit**

```bash
git add package.json yarn.lock eslint.config.js src/env.js .env.example src/backend/clock.ts src/backend/config/policy.ts src/backend/integrations/beta-policy.ts vitest.config.ts tests/setup.ts tests/global-setup.ts tests/helpers/db.ts tests/helpers/time.ts tests/unit/beta-policy.test.ts
git rm src/app/api/auth/\[...nextauth\]/route.ts src/server/auth/config.ts src/server/auth/index.ts
git commit -m "chore: add beta runtime policy, test harness and backend tooling"
```

### Task 2: Money primitives

**Files:**
- Create: `src/utils/money.ts`, `tests/unit/money.test.ts`

**Interfaces:**
- Produces:
  - `class MoneyFormatError extends Error`
  - `MAX_MINOR = 9_223_372_036_854_775_807n`
  - `type Rate = { kobo: bigint; microUsd: bigint }`
  - `parseMinor(value: string): bigint`
  - `formatMinor(value: bigint): string`
  - `decimalToMinor(value: string, decimals: number, rounding: 'floor' | 'exact'): bigint`
  - `minorToProviderNumber(value: bigint, decimals: number): number`
  - `rateFromNgnPerUsd(value: string): Rate`
  - `ngnToUsd(kobo: bigint, rate: Rate, rounding: 'floor' | 'ceil'): bigint`
  - `usdToNgn(microUsd: bigint, rate: Rate, rounding: 'floor' | 'ceil'): bigint`
  - `rateToDto(rate: Rate): { kobo: string; micro_usd: string; ngn_per_usd: string }`
  - `parseProviderJson(text: string): unknown`

- [ ] **Step 1: Write the failing tests**

```ts
it('parses canonical integer strings exactly', () => {
  expect(parseMinor('9007199254740993')).toBe(9007199254740993n);
  expect(parseMinor('0')).toBe(0n);
  for (const bad of ['', '-1', '+1', '1.2', '1e6', ' 1', '01', '9223372036854775808'])
    expect(() => parseMinor(bad)).toThrow(MoneyFormatError);
});
it('builds reduced rates from decimal naira-per-dollar strings', () => {
  expect(rateFromNgnPerUsd('1600')).toEqual({ kobo: 4n, microUsd: 25n });
  expect(rateFromNgnPerUsd('1550')).toEqual({ kobo: 31n, microUsd: 200n });
  expect(rateFromNgnPerUsd('1580.5')).toEqual({ kobo: 3161n, microUsd: 20_000n });
  expect(() => rateFromNgnPerUsd('0')).toThrow(MoneyFormatError);
});
it('converts with explicit rounding', () => {
  const buy = rateFromNgnPerUsd('1600'), sell = rateFromNgnPerUsd('1550');
  expect(ngnToUsd(1_980_000n, buy, 'floor')).toBe(12_375_000n);   // ₦19,800 → $12.375
  expect(ngnToUsd(500_000n, sell, 'ceil')).toBe(3_225_807n);
  expect(ngnToUsd(500_000n, sell, 'floor')).toBe(3_225_806n);
  expect(usdToNgn(1_290_322n, sell, 'floor')).toBe(199_999n);
  expect(usdToNgn(1_290_323n, sell, 'floor')).toBe(200_000n);
});
it('reads provider decimals without floating point', () => {
  expect(decimalToMinor('20000', 2, 'exact')).toBe(2_000_000n);
  expect(decimalToMinor('12.3456789', 6, 'floor')).toBe(12_345_678n);
  expect(() => decimalToMinor('12.3456789', 6, 'exact')).toThrow(MoneyFormatError);
  for (const bad of ['1e-7', '-5', '', '1.2.3']) expect(() => decimalToMinor(bad, 6, 'floor')).toThrow(MoneyFormatError);
  expect(parseProviderJson('{"amount": 12.3456789, "n": 9007199254740993, "s": "x"}'))
    .toEqual({ amount: '12.3456789', n: '9007199254740993', s: 'x' });
});
it('serialises minor units for provider bodies and DTOs', () => {
  expect(JSON.stringify({ localAmount: minorToProviderNumber(1_999_999n, 2) })).toBe('{"localAmount":19999.99}');
  expect(() => minorToProviderNumber(2n ** 53n, 2)).toThrow(MoneyFormatError);
  expect(formatMinor(2_000_000n)).toBe('2000000');
  expect(rateToDto({ kobo: 4n, microUsd: 25n })).toEqual({ kobo: '4', micro_usd: '25', ngn_per_usd: '1600.00' });
  expect(rateToDto({ kobo: 3161n, microUsd: 20_000n }).ngn_per_usd).toBe('1580.50');
});
```

- [ ] **Step 2: Implement `src/utils/money.ts`**

- `parseMinor` accepts only `/^(0|[1-9]\d*)$/` values up to `MAX_MINOR`.
- `rateFromNgnPerUsd` converts the decimal to kobo per 1,000,000 micro-USD, then divides both sides by their gcd.
- Ceil division is `(a + b - 1n) / b` on non-negative values.
- `parseProviderJson` uses the `JSON.parse` reviver's third argument (`context.source`, available in Node 24) to return number literals as their source text. Declare a local reviver type, because TypeScript's lib types omit the third argument.
- `ngn_per_usd` is `floor(kobo × 1_000_000 / microUsd)` kobo, formatted with two decimals.

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/utils/money.ts tests/unit/money.test.ts
git commit -m "feat: add exact integer money and rate primitives"
```

### Task 3: HTTP contracts and the wrapped request pipeline

**Files:**
- Create: `src/types/index.ts`, `src/types/dto.ts`, `src/utils/exceptions.ts`, `src/utils/index.ts`, `src/utils/response.ts`, `src/backend/middleware/index.ts`, `src/backend/middleware/types.ts`, `src/backend/validators/index.validator.ts`, `src/backend/observability.ts`, `src/instrumentation.ts`, `tests/helpers/http.ts`, `tests/unit/middleware.test.ts`
- Modify: `next.config.js`, `BACKEND_PATTERNS.md` (§§1–9, 11–15, per *Adaptations*)

**Interfaces:**
- Consumes: `parseMinor` (Task 2).
- Produces, response types:
  - `ApiResponse<T> = { status: number; message: string; data: T }`
  - `PaginatedApiResponse<T>`, which adds `total`, `page`, `size`, `totalPages`
  - `ApiErrorResponse = { status: number; message: string; code: ErrorCode; data: null }`
  - `ErrorCode`: the union of every code in *API surface*, plus `MALFORMED_JSON`, `PAYLOAD_TOO_LARGE`, `IDEMPOTENCY_KEY_REQUIRED`, `CROSS_ORIGIN`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL`
  - `BetaDto = { stage: 'beta'; mode: ProviderMode; test_funds_only: true }`
- Produces, exceptions:
  - `HttpException(message, statusCode, code)`
  - Subclasses: `BadRequestException(message, code = 'BAD_REQUEST')`, `UnauthorizedException`, `ForbiddenException(message, code = 'FORBIDDEN')`, `NotFoundException`, `ConflictException(message, code)`, `PayloadTooLargeException`, `UnprocessableEntityException(message, code = 'VALIDATION_FAILED')`, `ServiceUnavailableException(message, code)`
  - `InternalServerErrorException(detail?: string)`: its public message is always `Internal server error`, and `detail` is kept in `cause`
- Produces, response and utility helpers:
  - `ok<T>(data: T, message: string, status = 200)`, `created`, `accepted`, `paginated`
  - `logRequest`, `redact(value: unknown): unknown`, `sha256Hex(value: string | Uint8Array): string`, `canonicalJson(value: unknown): string` (sorted keys; bigint as string)
  - `reportError(error: unknown, context: Record<string, unknown>): void`, the only importer of `@sentry/nextjs`
- Produces, request types:
  - `AuthenticatedUser = User & { session: Session }`
  - `AuthRequest<B, Q>` adds `rawBody?: Uint8Array`, `idempotencyKey?: string`, `authTransport?: 'cookie' | 'bearer'`, `requestId: string` to the guide's fields
- Produces, middleware:
  - `withMiddleware<B, Q>(handler, middlewares, options?: { bodyMode?: 'json' | 'raw' | 'none'; maxBodyBytes?: number })`
  - `bodyValidatorMiddleware(schema)`, `queryValidatorMiddleware(schema)`, `pathParamValidatorMiddleware(schema)`
  - `idempotencyKeyMiddleware`, which requires `Idempotency-Key` matching `^[A-Za-z0-9_-]{8,128}$`
  - `originMiddleware`: when `authTransport === 'cookie'` and the method is neither GET nor HEAD, the `Origin` must equal `new URL(env.NEXT_PUBLIC_APP_URL).origin`
- Produces, validators: `cuidSchema`, `minorAmountSchema` (string → bigint through `parseMinor`, with Zod issues instead of throws), `paginationQuerySchema` (`page` ≥ 1 default 1, `size` 1–100 default 20), `idParamSchema = z.object({ id: cuidSchema }).strict()`
- Produces, test helper: `callRoute(handler, { method, url, body?, headers?, cookie?, params? }): Promise<{ status: number; json: unknown; headers: Headers }>`

- [ ] **Step 1: Write the failing middleware tests**

```ts
it('returns 400 MALFORMED_JSON for an unparseable body', async () => {
  const res = await callRoute(withMiddleware(async () => ok({}, 'ok'), []), { method: 'POST', url: '/api/v1/x', body: '{"a":' });
  expect(res.status).toBe(400);
  expect(res.json).toEqual({ status: 400, message: 'Malformed JSON body', code: 'MALFORMED_JSON', data: null });
});
it('returns 422 VALIDATION_FAILED for unknown keys', async () => {
  const route = withMiddleware(async () => ok({}, 'ok'), [bodyValidatorMiddleware(z.object({ a: z.string() }).strict())]);
  const res = await callRoute(route, { method: 'POST', url: '/api/v1/x', body: '{"a":"x","extra":1}' });
  expect(res.status).toBe(422);
  expect(res.json).toMatchObject({ code: 'VALIDATION_FAILED', data: null });
});
it('hides the detail of unexpected errors', async () => {
  const res = await callRoute(withMiddleware(async () => { throw new Error('relation "secret_table" does not exist'); }, []), { method: 'GET', url: '/api/v1/x' });
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.json)).not.toContain('secret_table');
  expect(res.json).toMatchObject({ message: 'Internal server error', code: 'INTERNAL' });
});
it('preserves raw webhook bytes', async () => {
  const body = '{ "a":1,  "b" : [1,2] }';
  let seen: Uint8Array | undefined;
  const route = withMiddleware(async (req) => { seen = req.rawBody; return ok({}, 'ok'); }, [], { bodyMode: 'raw' });
  await callRoute(route, { method: 'POST', url: '/api/v1/webhooks/x', body });
  expect(Buffer.from(seen!).toString('utf8')).toBe(body);
});
it('rejects bodies over 64 KiB with 413', async () => {
  const res = await callRoute(withMiddleware(async () => ok({}, 'ok'), []), { method: 'POST', url: '/api/v1/x', body: JSON.stringify({ a: 'x'.repeat(70_000) }) });
  expect(res.status).toBe(413);
});
it('awaits Next 15 params', async () => {
  const route = withMiddleware(async (req) => ok(req.params, 'ok'), [pathParamValidatorMiddleware(idParamSchema)]);
  const res = await callRoute(route, { method: 'GET', url: '/api/v1/x/ckv9q3t1b0000qz8x0abcd123', params: { id: 'ckv9q3t1b0000qz8x0abcd123' } });
  expect(res.json).toMatchObject({ data: { id: 'ckv9q3t1b0000qz8x0abcd123' } });
});
it('requires a well-formed Idempotency-Key', async () => {
  const route = withMiddleware(async () => ok({}, 'ok'), [idempotencyKeyMiddleware]);
  expect((await callRoute(route, { method: 'POST', url: '/x', body: '{}' })).json).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  expect((await callRoute(route, { method: 'POST', url: '/x', body: '{}', headers: { 'Idempotency-Key': 'bad key!' } })).status).toBe(400);
});
it('rejects cross-origin cookie mutations', async () => {
  const asCookie = async (req: AuthRequest) => { req.authTransport = 'cookie'; return { message: '', statusCode: 200, next: true }; };
  const route = withMiddleware(async () => ok({}, 'ok'), [asCookie, originMiddleware]);
  const res = await callRoute(route, { method: 'POST', url: '/x', body: '{}', headers: { Origin: 'https://evil.test' } });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'CROSS_ORIGIN' });
});
it('redacts secrets and identifiers in logs', () => {
  expect(redact({ identity_token: 't', nested: { account_number: '0123456789', phone: '+2340000000001' }, amount: '5' }))
    .toEqual({ identity_token: '[redacted]', nested: { account_number: '[redacted]', phone: '[redacted]' }, amount: '5' });
});
```

- [ ] **Step 2: Implement exceptions, the response types and the helpers in `src/utils/`**

`redact` walks objects recursively. It replaces any value whose key matches `/(token|secret|password|account_?number|bvn|id_?number|phone|signature|authorization|cookie)/i`.

- [ ] **Step 3: Implement `withMiddleware` and the validator middlewares**

Follow the guide's structure, with these differences:
- Read the body once as bytes and enforce `maxBodyBytes` (default 65_536) on both the declared and actual length.
- `json` mode: parse, returning 400 on failure. `raw` mode: set `rawBody`. `none` mode: skip the body.
- Every error becomes an `ApiErrorResponse`.
- `request.requestId = randomUUID()`, also echoed in the `X-Request-Id` header.
- Call `reportError` only for status ≥ 500 and for middleware crashes.
- Run `logRequest(method, path, status, ms, redact(parsedBody))` exactly once.

`bodyValidatorMiddleware` reports the first issue as `<path>: <message>` with code `VALIDATION_FAILED`.

- [ ] **Step 4: Add observability, rewrites and the guide sync**

- `src/instrumentation.ts`: `register()` calls `Sentry.init({ dsn: env.SENTRY_DSN, environment: 'beta' })` only when the DSN is set.
- `next.config.js`: `rewrites()` returns `[{ source: '/v1/:path*', destination: '/api/v1/:path*' }, { source: '/webhooks/:provider', destination: '/api/v1/webhooks/:provider' }]`.
- `BACKEND_PATTERNS.md`: rewrite §§1–9 and 11–15 so every *Adaptations* row is the documented pattern. Keep the guide's structure and remaining rules.

- [ ] **Step 5: Review the diff against Step 1, then commit**

```bash
git add src/types src/utils src/backend/middleware src/backend/validators/index.validator.ts src/backend/observability.ts src/instrumentation.ts next.config.js BACKEND_PATTERNS.md tests/helpers/http.ts tests/unit/middleware.test.ts
git commit -m "feat: add typed API envelope, exceptions and request middleware"
```

### Task 4: Database schema and invariants

**Files:**
- Modify: `prisma/schema.prisma`, `src/server/db.ts`
- Create: `src/server/prisma.ts`, `prisma/migrations/20261113000000_v3st_core/migration.sql`, `tests/integration/schema.test.ts`

**Interfaces:**
- Produces:
  - The models and enums below. Every table is `@@map`ped to the snake_case name shown, and columns keep Prisma camelCase, so raw SQL quotes them as `"userId"`.
  - `src/server/prisma.ts`: `export * from '../../generated/prisma'`.
  - `src/server/db.ts`:
    - `db`
    - `type Tx = Prisma.TransactionClient`
    - `type DbClient = typeof db | Tx`
    - `withTx<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T>` (ReadCommitted, `maxWait` 5_000, `timeout` 10_000)
    - `lockRows(tx: Tx, table: 'users' | 'ramp_orders' | 'ledger_accounts' | 'trade_orders' | 'chain_transfers', ids: string[]): Promise<void>` (`SELECT id … WHERE id = ANY($1) ORDER BY id FOR UPDATE`)

**Enums** (lower-case values, so Design's state names are stored verbatim):
- `UserRole{user operator}`
- `KycStatus{none verified rejected}`
- `EarningsMode{unset payout reinvest}`
- `WalletFamily{evm solana}`
- `ProviderMode{sandbox simulated}`
- `ProviderId{yellowcard paycrest}`
- `SettlementModel{partner_float direct_chain}`
- `OrderKind{deposit withdrawal earnings_payout}`
- `OrderDirection{in out}`
- `OrderStatus{created awaiting_transfer received funded settled expired refunded failed funds_collected submitted paid reversed}`
- `HoldReason{name_mismatch amount_mismatch missing_sender treasury_short float_short rate_moved screening paused needs_review}`
- `BankAccountStatus{active replaced rejected}`
- `LedgerOwner{user treasury float external clearing venue equity}`
- `TransferPurpose{deposit_funding payout_collection payout_return direct_payout_funding float_topup}`
- `TransferStatus{awaiting_approval pending submitted confirmed failed}`
- `TradeSide{buy sell}`
- `TradePurpose{deposit_buy retry_buy reinvest withdrawal_sell}`
- `TradeSource{cash earnings stock}`
- `TradeStatus{pending submitted filled failed}`
- `JobStatus{pending running done dead}`
- `AlertSeverity{info warning critical}`
- `TreasuryOpKind{float_topup float_withdrawal}`
- `TreasuryOpStatus{planned transferring awaiting_provider complete failed}`
- `ReconStatus{balanced breached incomplete}`

| Model (table) | Fields (`?` nullable; money `BigInt`; every model has `id String @id @default(cuid())` unless noted; `createdAt`/`updatedAt` where shown) | Constraints |
| --- | --- | --- |
| `User` (`users`) | phone, identitySubject, identityMode ProviderMode, role=user, kycStatus=none, kycTier Int=0, verifiedName?, kycPersona?, kycProfile Json?, kycMode ProviderMode?, earningsMode=unset, reinvestStockId?, createdAt, updatedAt | unique phone; unique identitySubject |
| `Session` (`sessions`) | sessionToken, userId, expires, createdAt | unique sessionToken; index userId; cascade on user delete |
| `Wallet` (`wallets`) | userId, family, address, providerWalletId, providerMode, createdAt | unique (userId, family); unique (family, address) |
| `TreasuryWallet` (`treasury_wallets`) | chain, address, providerWalletId, providerMode, createdAt | unique chain |
| `BankAccount` (`bank_accounts`) | userId, bankCode, bankName, accountNumber, resolvedName, nameMatch Boolean, status, provider, providerMode, createdAt | index userId; SQL partial unique (userId) WHERE status = 'active' |
| `WithdrawalQuote` (`withdrawal_quotes`) | userId, provider, providerMode, ngnAmount, feeNgn, netNgn, usdAmount, debitUsdc, rateKobo, rateMicroUsd, chain, stockId?, sellQuantity?, bankAccountId, expiresAt, consumedAt?, createdAt | index userId |
| `RampOrder` (`ramp_orders`) | userId, kind, direction, provider, providerMode, settlementModel, status=created, holdReason?, version Int=0, idempotencyKey, requestHash, providerRef?, ngnAmount, feeNgn?, usdAmount?, lockedUsd?, rateKobo?, rateMicroUsd?, receivedNgn?, netNgn?, debitUsdc?, chain?, stockId?, quoteId?, sourceBankAccountId?, payToBankName?, payToAccountNumber?, payToAccountName?, payToReference?, destBankCode?, destBankName?, destAccountNumber?, destAccountName?, bankReference?, fundingAddress?, fundingAmount?, expiresAt?, failureReason?, createdAt, updatedAt | unique idempotencyKey; unique quoteId; unique (provider, providerRef); index (userId, createdAt); index status; CHECK ngnAmount > 0 |
| `OrderTransition` (`order_transitions`) | orderId, fromStatus OrderStatus?, toStatus, holdReason?, actor, reason?, createdAt | index orderId |
| `LedgerAccount` (`ledger_accounts`) | code, asset, ownerType, userId?, allowNegative Boolean, createdAt | unique code; index userId |
| `LedgerJournal` (`ledger_journals`) | key, kind, orderId?, requestHash, createdAt | unique key |
| `LedgerEntry` (`ledger_entries`) | journalId, debitAccountId, creditAccountId, asset, amount, createdAt | index debitAccountId; index creditAccountId; CHECK amount > 0; CHECK debit ≠ credit |
| `ChainTransfer` (`chain_transfers`) | key, purpose, status, chain, token, fromAddress, toAddress, amount, orderId?, treasuryOperationId?, txHash?, approvals String[], failureReason?, gasAsset?, gasAmount?, providerMode, createdAt, updatedAt | unique key; unique (chain, txHash); index status |
| `Stock` (`stocks`) | symbol, name, chain, tokenAddress, decimals Int, enabled Boolean, simPriceMicroUsdc, simWeeklyEarningMicroPerShare, createdAt | unique symbol |
| `TradeOrder` (`trade_orders`) | key, userId, side, purpose, fundsSource TradeSource, stockId, orderId?, chain, venueId?, amountIn, minAmountOut?, amountOut?, status=pending, failureReason?, venueRef?, version Int=0, providerMode, createdAt, updatedAt | unique key; index userId; index status |
| `Earning` (`earnings`) | userId, stockId, week String, chain, amountUsdc, harvestedAt, payoutOrderId?, reinvestTradeId?, createdAt | unique (userId, stockId, week); index (userId, payoutOrderId) |
| `WebhookEvent` (`webhook_events`) | provider, eventKey, payload Json, signatureValid Boolean, providerMode, receivedAt, processedAt? | unique (provider, eventKey) |
| `Job` (`jobs`) | kind, subjectId, key, payload Json, status=pending, runAt, attempts Int=0, maxAttempts Int=10, lockedUntil?, lockedBy?, rearmAt?, lastError?, createdAt, updatedAt | unique key; index (status, runAt) |
| `ScheduleRun` (`schedule_runs`) | name, slot, createdAt (no `id`) | `@@id([name, slot])` |
| `UserEvent` (`user_events`) | `seq BigInt @id @default(autoincrement())`, userId, type, subjectId, status?, createdAt | index (userId, seq) |
| `OperationalControl` (`operational_controls`) | `scope String @id`, paused Boolean, reason?, updatedById?, updatedAt | — |
| `OperationalAlert` (`operational_alerts`) | kind, severity, dedupeKey, message, context Json, createdAt, resolvedAt?, resolvedById? | SQL partial unique (dedupeKey) WHERE resolvedAt IS NULL |
| `TreasuryOperation` (`treasury_operations`) | key, kind, provider, chain, amountUsd, amountUsdc?, status=planned, externalRef?, failureReason?, providerMode, createdAt, updatedAt | unique key; SQL partial unique (provider) WHERE status NOT IN ('complete','failed') |
| `ReconciliationRun` (`reconciliation_runs`) | asOf, status, results Json, createdAt | — |
| `ProviderHealth` (`provider_health`) | `provider ProviderId @id`, consecutiveFailures Int=0, lastFailureAt?, lastSuccessAt?, openUntil? | — |
| `SimRampTx` (`sim_ramp_txs`) | provider, key, kind String (`collection`/`payout`/`settlement_in`/`settlement_out`/`seed`), direction?, state String, ngnAmount?, usdAmount, feeNgn?, rateKobo?, rateMicroUsd?, sourceAccountNumber?, sourceAccountName?, senderName?, destinationAccountNumber?, bankReference?, chain?, recipientAddress?, fundingAddress?, settleAt?, expiresAt?, outcome?, createdAt, updatedAt | unique (provider, key) |
| `SimChainTx` (`sim_chain_txs`) | key, chain, hash, fromAddress, toAddress, token, amount, status String, confirmAt, failureReason?, createdAt | unique key; unique hash |
| `SimSwap` (`sim_swaps`) | key, venueId, stockId, side, amountIn, minAmountOut, amountOut?, status String, settleAt, failureReason?, createdAt | unique key |
| `SimFault` (`sim_faults`) | scope String (`payout`/`swap`/`swap_impact`/`chain`), key, consumedAt?, createdAt | unique (scope, key) |

Drop the starter `Post`, `Account` and `VerificationToken` models, and the NextAuth-only `User` fields (`name`, `email`, `emailVerified`, `image`).

- [ ] **Step 1: Write the failing invariant tests**

```ts
useTestDatabase();
it('rejects an entry between accounts holding different assets', async () => {
  const [usd, usdc] = await Promise.all([makeAccount('a', 'USD'), makeAccount('b', 'USDC')]);
  await expect(insertEntry({ debit: usd, credit: usdc, asset: 'USD', amount: 1n })).rejects.toThrow(/asset mismatch/);
});
it('rejects non-positive amounts and self-transfers', async () => {
  const [a, b] = await Promise.all([makeAccount('a', 'USDC'), makeAccount('b', 'USDC')]);
  await expect(insertEntry({ debit: a, credit: b, asset: 'USDC', amount: 0n })).rejects.toThrow();
  await expect(insertEntry({ debit: a, credit: a, asset: 'USDC', amount: 1n })).rejects.toThrow();
});
it('keeps journals and entries append-only', async () => {
  const entry = await insertValidEntry();
  await expect(db.ledgerEntry.update({ where: { id: entry.id }, data: { amount: 2n } })).rejects.toThrow(/append-only/);
  await expect(db.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
  await expect(db.ledgerJournal.delete({ where: { id: entry.journalId } })).rejects.toThrow(/append-only/);
});
it('allows one active bank account per user', async () => {
  const user = await makeUserRow();
  await insertBankAccount(user.id, 'active');
  await expect(insertBankAccount(user.id, 'active')).rejects.toThrow();
  await expect(insertBankAccount(user.id, 'replaced')).resolves.toBeDefined();
});
it('dedupes webhook events per provider only', async () => {
  await insertWebhookEvent('yellowcard', 'e1');
  await expect(insertWebhookEvent('yellowcard', 'e1')).rejects.toThrow();
  await expect(insertWebhookEvent('paycrest', 'e1')).resolves.toBeDefined();
});
it('allows a repeated alert dedupe key only after resolution', async () => {
  const first = await insertAlert('recon.breach:float:yellowcard');
  await expect(insertAlert('recon.breach:float:yellowcard')).rejects.toThrow();
  await db.operationalAlert.update({ where: { id: first.id }, data: { resolvedAt: new Date() } });
  await expect(insertAlert('recon.breach:float:yellowcard')).resolves.toBeDefined();
});
it('allows one active treasury operation per provider', async () => {
  await insertTreasuryOp('yellowcard', 'planned');
  await expect(insertTreasuryOp('yellowcard', 'awaiting_provider')).rejects.toThrow();
});
```

`makeAccount`, `insertEntry`, `insertValidEntry`, `makeUserRow`, `insertBankAccount`, `insertWebhookEvent`, `insertAlert` and `insertTreasuryOp` are local helpers in the test file. Each is one typed Prisma call.

- [ ] **Step 2: Write `prisma/schema.prisma`**

Keep `generator client { output = "../generated/prisma" }`. Write the table above.

- [ ] **Step 3: Generate the migration without a database, then append the SQL Prisma cannot express**

```bash
mkdir -p prisma/migrations/20261113000000_v3st_core
yarn prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261113000000_v3st_core/migration.sql
yarn prisma generate
```

Append to `migration.sql`:
- The `ramp_orders` and `ledger_entries` CHECKs.
- The three partial unique indexes.
- A `BEFORE INSERT` trigger on `ledger_entries` that raises `asset mismatch` unless both referenced accounts' `asset` equals `NEW.asset`.
- `BEFORE UPDATE OR DELETE` triggers on `ledger_entries` and `ledger_journals` that raise `ledger rows are append-only`. There is no TRUNCATE trigger, because the test reset truncates.

Later schema changes, if any, use `yarn prisma migrate dev --create-only --name <name>` against the local beta database.

- [ ] **Step 4: Implement `src/server/prisma.ts`, `withTx` and `lockRows`**

Export them from `src/server/db.ts`. Keep the existing singleton.

- [ ] **Step 5: Review the migration SQL and the diff against Step 1, then commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/db.ts src/server/prisma.ts tests/integration/schema.test.ts
git commit -m "feat: model V3ST financial state with ledger invariants"
```

### Task 5: Ledger service

**Files:**
- Create: `src/backend/services/ledger/accounts.ts`, `src/backend/services/ledger/postings.ts`, `src/backend/services/ledger/index.ts`, `tests/helpers/factories.ts`, `tests/integration/ledger.test.ts`

**Interfaces:**
- Consumes: `withTx`, `lockRows`, `Tx`, `DbClient` (Task 4); `canonicalJson`, `sha256Hex` (Task 3); `ConflictException` (Task 3).
- Produces:
  - `type Asset = 'USD' | 'USDC' | \`STOCK:${string}\``
  - `type AccountSpec = { code: string; asset: Asset; ownerType: LedgerOwner; userId: string | null; allowNegative: boolean }`
  - `acct`: the builders in the chart of accounts
  - `type EntryInput = { debit: AccountSpec; credit: AccountSpec; amount: bigint }`
  - `type JournalInput = { key: string; kind: string; orderId: string | null; entries: EntryInput[] }`
  - One function per row of the posting-template table, each returning `JournalInput`
  - `ledgerService.post(tx: Tx, journal: JournalInput): Promise<{ journalId: string; created: boolean }>`
  - `ledgerService.balance(account: AccountSpec, client?: DbClient): Promise<bigint>`
  - `ledgerService.balancesForUser(userId: string): Promise<Map<string, bigint>>`
- Test factories:
  - `makeUser(overrides?): Promise<User>`
  - `fundCash(userId, microUsdc, chain = 'base')`
  - `seedTreasury(chain, microUsdc)`
  - `seedFloat(provider, microUsd)`

The funding factories post `openingBalance` journals. Later tasks extend the factories file.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('moves value and conserves every asset', async () => {
  const u = await makeUser(); await fundCash(u.id, 10_000_000n);
  await withTx((tx) => ledgerService.post(tx, cashReserved({ key: 'order:o1', userId: u.id, chain: 'base', amount: 4_000_000n, from: 'cash' })));
  expect(await ledgerService.balance(acct.userCash(u.id, 'base'))).toBe(6_000_000n);
  expect(await ledgerService.balance(acct.userReserved(u.id, 'base'))).toBe(4_000_000n);
  expect(await sumOfAllBalances('USDC')).toBe(0n);
});
it('permits one of two concurrent seven-USDC reservations from ten USDC', async () => {
  const u = await makeUser(); await fundCash(u.id, 10_000_000n);
  const reserve = (key: string) => withTx((tx) => ledgerService.post(tx, cashReserved({ key, userId: u.id, chain: 'base', amount: 7_000_000n, from: 'cash' })));
  const results = await Promise.allSettled([reserve('order:a'), reserve('order:b')]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { statusCode: 409, code: 'INSUFFICIENT_FUNDS' } });
  expect(await ledgerService.balance(acct.userCash(u.id, 'base'))).toBe(3_000_000n);
});
it('returns the existing journal for a replayed key with the same entries', async () => {
  const u = await makeUser(); await fundCash(u.id, 10_000_000n);
  const j = cashReserved({ key: 'order:r', userId: u.id, chain: 'base', amount: 1n, from: 'cash' });
  const first = await withTx((tx) => ledgerService.post(tx, j));
  const second = await withTx((tx) => ledgerService.post(tx, j));
  expect(second).toEqual({ journalId: first.journalId, created: false });
});
it('rejects a replayed key with different entries', async () => {
  const u = await makeUser(); await fundCash(u.id, 10_000_000n);
  await withTx((tx) => ledgerService.post(tx, cashReserved({ key: 'order:k', userId: u.id, chain: 'base', amount: 1n, from: 'cash' })));
  await expect(withTx((tx) => ledgerService.post(tx, cashReserved({ key: 'order:k', userId: u.id, chain: 'base', amount: 2n, from: 'cash' }))))
    .rejects.toMatchObject({ code: 'LEDGER_KEY_REUSED' });
});
it('lets external, clearing and float accounts go negative but never user or treasury accounts', async () => {
  const u = await makeUser();
  await expect(withTx((tx) => ledgerService.post(tx, cashReserved({ key: 'order:z', userId: u.id, chain: 'base', amount: 1n, from: 'cash' }))))
    .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  await withTx((tx) => ledgerService.post(tx, payoutSubmitted({ orderId: 'o9', provider: 'yellowcard', usd: 5n })));
  expect(await ledgerService.balance(acct.float('yellowcard'))).toBe(-5n);
});
```

`sumOfAllBalances(asset)` is a local helper: one raw SQL sum over `ledger_entries`.

- [ ] **Step 2: Implement `accounts.ts` and `postings.ts`**

Write them exactly as the chart of accounts and the posting-template table specify. Templates are pure, and none of them reads the database.

- [ ] **Step 3: Implement `ledgerService.post`**

1. Compute `requestHash = sha256Hex(canonicalJson({ kind, orderId, entries: [debit.code, credit.code, amount] }))`.
2. If a journal with the key exists, return `{ created: false }` when the hash matches, and throw 409 `LEDGER_KEY_REUSED` otherwise.
3. Upsert every account by `code`. Throw if an existing account differs in asset, owner or `allowNegative`.
4. Validate `debit.asset === credit.asset`, and that every amount is greater than zero.
5. Lock the debited non-negative accounts with `lockRows(tx, 'ledger_accounts', ids)`.
6. For each locked account, `balance + net effect of this journal ≥ 0`, or throw 409 `INSUFFICIENT_FUNDS`.
7. Insert the journal and its entries with typed `Prisma.LedgerJournalCreateInput`.

`balance` is `SUM(credit) − SUM(debit)` in raw SQL, over parameterised account ids.

- [ ] **Step 4: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/ledger tests/helpers/factories.ts tests/integration/ledger.test.ts
git commit -m "feat: add append-only double-entry ledger with locked reservations"
```

### Task 6: Jobs, worker and the Lagos scheduler

**Files:**
- Create: `src/backend/services/jobs/types.ts`, `src/backend/services/jobs/index.ts`, `src/backend/services/jobs/schedule.ts`, `src/backend/workers/handlers.ts`, `src/backend/workers/run.ts`, `tests/helpers/worker.ts`, `tests/unit/schedule.test.ts`, `tests/integration/jobs.test.ts`

**Interfaces:**
- Consumes: `now()`, `policy.schedule`, `policy.worker`, `assertBetaRuntime` (Task 1); `withTx`, `DbClient` (Task 4).
- Produces, job types:
  - `JobKind`: `'wallets.provision' | 'chain.progress' | 'webhook.process' | 'deposit.progress' | 'payout.progress' | 'trade.progress' | 'treasury.progress' | 'treasury.rebalance' | 'earnings.harvest' | 'earnings.float_precheck' | 'earnings.payout_batch' | 'reconcile.run' | 'poll.open_work'`
  - `JobInput = { kind: JobKind; subjectId: string; runAt?: Date; payload?: Record<string, string> }`
  - `class RetryableError extends Error { constructor(code: string, delayMs?: number) }`
  - `class PermanentJobError extends Error { constructor(code: string) }`
  - `backoffMs(attempts: number): number`
- Produces, `jobService`:
  - `enqueue(client: DbClient, input: JobInput): Promise<void>`
  - `claim(workerId: string, limit: number, at: Date): Promise<Job[]>`
  - `complete(job: Job, at: Date): Promise<void>`
  - `fail(job: Job, error: unknown, at: Date): Promise<void>`
  - `retryDead(jobId: string): Promise<void>`
- Produces, Lagos calendar (`schedule.ts`):
  - `lagosParts(d: Date): { isoDate: string; weekday: 1|2|3|4|5|6|7; hour: number; minute: number }` (Monday = 1)
  - `lagosWeek(d: Date): string` (the Lagos Monday, `YYYY-MM-DD`)
  - `lagosDayStart(d: Date): Date`, `lagosMonthStart(d: Date): Date`
  - `dueSchedules(at: Date): { name: string; slot: string; job: JobInput }[]`
  - `scheduler.tick(at: Date): Promise<number>`
- Produces, worker:
  - `handlers: Partial<Record<JobKind, (job: Job) => Promise<void>>>`, filled in by later tasks
  - `transferSettledHandlers: Partial<Record<TransferPurpose, (t: ChainTransfer) => Promise<void>>>`
  - `tradeSettledHandlers: Partial<Record<TradePurpose, (t: TradeOrder) => Promise<void>>>`
  - `runJob(job: Job): Promise<void>`
  - `startWorker(opts: { workerId: string }): { stop(): Promise<void> }`
- Test helper: `drainJobs(opts?: { maxSteps?: number }): Promise<{ ran: number }>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/schedule.test.ts
expect(lagosParts(new Date('2026-11-13T07:00:00Z'))).toMatchObject({ isoDate: '2026-11-13', weekday: 5, hour: 8 });
expect(lagosWeek(new Date('2026-11-13T07:00:00Z'))).toBe('2026-11-09');
expect(lagosWeek(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16'); // Sunday UTC, Monday Lagos
expect(lagosDayStart(new Date('2026-11-12T23:30:00Z')).toISOString()).toBe('2026-11-12T23:00:00.000Z');
expect(dueSchedules(new Date('2026-11-12T21:00:00Z')).map((s) => s.name)).toContain('earnings.harvest');      // Thu 22:00
expect(dueSchedules(new Date('2026-11-13T07:00:00Z')).find((s) => s.name === 'earnings.payout_batch')?.job.subjectId).toBe('2026-11-09');
expect(backoffMs(1)).toBe(5_000); expect(backoffMs(20)).toBe(3_600_000);
// tests/integration/jobs.test.ts
useTestDatabase();
it('lets only one of two workers claim a due job', async () => {
  setNow('2026-11-13T07:00:00Z'); await jobService.enqueue(db, { kind: 'reconcile.run', subjectId: '2026-11-13' });
  const [a, b] = await Promise.all([jobService.claim('w1', 5, now()), jobService.claim('w2', 5, now())]);
  expect(a.length + b.length).toBe(1);
});
it('reclaims a job whose lease expired', async () => {
  setNow('2026-11-13T07:00:00Z'); await jobService.enqueue(db, { kind: 'reconcile.run', subjectId: 'x' });
  const [first] = await jobService.claim('w1', 1, now());
  setNow('2026-11-13T07:02:01Z');
  const [again] = await jobService.claim('w2', 1, now());
  expect(again?.id).toBe(first?.id); expect(again?.attempts).toBe(2);
});
it('re-arms a finished job instead of inserting another row', async () => { /* enqueue, claim, complete, enqueue → 1 row, status pending, attempts 0 */ });
it('reruns a job re-armed while it was running', async () => { /* claim, enqueue, complete → status pending */ });
it('dead-letters after ten attempts and raises one alert', async () => { /* fail ×10 → status dead; operational_alerts kind 'job.dead' count 1 */ });
it('fires each schedule slot once across concurrent ticks', async () => {
  setNow('2026-11-12T21:00:00Z');
  await Promise.all([scheduler.tick(now()), scheduler.tick(now())]);
  expect(await db.scheduleRun.count({ where: { name: 'earnings.harvest' } })).toBe(1);
  expect(await db.job.count({ where: { kind: 'earnings.harvest' } })).toBe(1);
});
```

Write the three commented cases as full tests with the assertions given in their comments.

- [ ] **Step 2: Implement the calendar helpers in `schedule.ts`**

Implement them with `Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', … })`. `dueSchedules` emits these schedules:

| Schedule | When (Lagos) | Subject |
| --- | --- | --- |
| `poll.open_work` | every minute | `global` |
| `treasury.rebalance` | hourly at :30 | `global` |
| `reconcile.run` | 02:00 daily | the Lagos date |
| `earnings.harvest` | Thu 22:00 | the week |
| `earnings.float_precheck` | Thu 23:00 | the week |
| `earnings.payout_batch` | each hour 08:00–23:00 on Friday | the week |

Weekly schedules also emit the most recent missed slot of the current week, so a stopped worker catches up once. `scheduler.tick` inserts `schedule_runs` rows with `ON CONFLICT DO NOTHING` and enqueues only the rows it inserted.

- [ ] **Step 3: Implement `jobService`**

**`enqueue`** is a single `INSERT … ON CONFLICT (key) DO UPDATE` with the re-arm rules from *Jobs and the worker*.

**`claim`** runs `UPDATE jobs SET status='running', "lockedBy"=$w, "lockedUntil"=$at+120s, attempts=attempts+1 WHERE id IN (SELECT id FROM jobs WHERE status IN ('pending','running') AND "runAt" <= $at AND ("lockedUntil" IS NULL OR "lockedUntil" < $at) ORDER BY "runAt" LIMIT $n FOR UPDATE SKIP LOCKED) RETURNING *`.

**`complete`** sets `done` with attempts 0. If `rearmAt` is set, it sets `pending` with `runAt = rearmAt` instead.

**`fail`** stores `lastError` (the code only, never provider bodies), then:

| Error | Result |
| --- | --- |
| `PermanentJobError` | `dead`, and `alertService.raise` |
| Attempts ≥ `maxAttempts` | `dead`, and `alertService.raise` |
| Anything else | `pending`, with `runAt = at + (delayMs ?? backoffMs(attempts)) + jitter(0–1000 ms)` |

`alertService` arrives in Task 7. Until then, `fail` writes the alert row through a local typed `db.operationalAlert.create` that Task 7 replaces.

- [ ] **Step 4: Implement the worker**

**`run.ts`:**
1. Call `assertBetaRuntime(process.env)` at startup.
2. Loop: `scheduler.tick(now())`, `claim(workerId, concurrency)`, then `runJob` with at most 4 jobs in parallel.
3. Sleep 1000 ms when idle.
4. On SIGTERM or SIGINT, stop claiming, await in-flight jobs and exit 0.

**`runJob`** looks up `handlers[job.kind]` and treats a missing handler as a `PermanentJobError('NO_HANDLER')`.

**`drainJobs`** loops:
1. Run every due job.
2. When none is due, `setNow` to the earliest pending `runAt`, then `scheduler.tick` at that time.
3. Stop when no pending job exists, or after `maxSteps`.

- [ ] **Step 5: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/jobs src/backend/workers tests/helpers/worker.ts tests/unit/schedule.test.ts tests/integration/jobs.test.ts
git commit -m "feat: add durable job queue, worker and Lagos scheduler"
```

### Task 7: Order transitions, alerts and operational controls

**Files:**
- Create: `src/backend/services/orders/transitions.ts`, `src/backend/services/orders/index.ts`, `src/backend/services/alerts/index.ts`, `src/backend/services/controls/index.ts`, `tests/integration/order-transitions.test.ts`
- Modify: `src/backend/services/jobs/index.ts` (use `alertService`)

**Interfaces:**
- Consumes: `ledgerService.post`, `JournalInput` (Task 5); `jobService.enqueue`, `JobInput` (Task 6).
- Produces, transitions:
  - `DEPOSIT_TRANSITIONS`, `PAYOUT_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>>`, per *Order state machines*
- Produces, `orderService`:
  - `transition(tx: Tx, input: TransitionInput): Promise<RampOrder>`, where `TransitionInput = { order: Pick<RampOrder, 'id' | 'userId' | 'kind' | 'status' | 'version'>; to: OrderStatus; patch?: Prisma.RampOrderUpdateInput; journals?: JournalInput[]; jobs?: JobInput[]; actor: string; reason?: string }`
  - `loadForUpdate(tx: Tx, orderId: string): Promise<RampOrder>` (locks the row)
  - `getOwned(userId: string, orderId: string, kind: OrderKind[]): Promise<RampOrder>` (404 when the user does not own it)
- Produces, alerts and controls:
  - `alertService.raise(client: DbClient, input: { kind: string; severity: AlertSeverity; dedupeKey: string; message: string; context?: Record<string, string> }): Promise<void>` (a no-op while the same dedupe key is open)
  - `alertService.resolve(id: string, actorId: string): Promise<void>`
  - `type ControlScope = 'deposits' | 'payouts' | 'trading' | 'provider:yellowcard' | 'provider:paycrest'`
  - `controlsService.isPaused(scope: ControlScope, client?: DbClient): Promise<boolean>`
  - `controlsService.assertOpen(scope: ControlScope, code: ErrorCode): Promise<void>` (503)
  - `controlsService.set(client: DbClient, input: { scope: ControlScope; paused: boolean; reason: string; actorId: string | null }): Promise<OperationalControl>`

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('writes order, audit, user event, journal and job in one transaction', async () => {
  const order = await makeOrder({ kind: 'deposit', status: 'awaiting_transfer' });
  await withTx((tx) => orderService.transition(tx, { order, to: 'received', actor: 'test',
    journals: [depositReceived({ orderId: order.id, userId: order.userId, provider: 'yellowcard', usd: 12_375_000n })],
    jobs: [{ kind: 'deposit.progress', subjectId: order.id }] }));
  expect(await db.rampOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'received', version: 1 });
  expect(await db.orderTransition.count({ where: { orderId: order.id, toStatus: 'received' } })).toBe(1);
  expect(await db.userEvent.count({ where: { subjectId: order.id, status: 'received' } })).toBe(1);
  expect(await db.ledgerJournal.count({ where: { key: `deposit:${order.id}:received` } })).toBe(1);
  expect(await db.job.count({ where: { key: `deposit.progress:${order.id}` } })).toBe(1);
});
it('rejects a transition outside the matrix', async () => {
  const order = await makeOrder({ kind: 'withdrawal', status: 'paid' });
  await expect(withTx((tx) => orderService.transition(tx, { order, to: 'submitted', actor: 'test' })))
    .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });
});
it('rejects a stale version', async () => {
  const order = await makeOrder({ kind: 'deposit', status: 'created' });
  await withTx((tx) => orderService.transition(tx, { order, to: 'awaiting_transfer', actor: 'a' }));
  await expect(withTx((tx) => orderService.transition(tx, { order, to: 'failed', actor: 'b' }))).rejects.toMatchObject({ code: 'STALE_STATE' });
});
it('leaves no partial writes when a journal fails', async () => {
  const order = await makeOrder({ kind: 'withdrawal', status: 'created' });
  await expect(withTx((tx) => orderService.transition(tx, { order, to: 'funds_collected', actor: 't',
    journals: [cashReserved({ key: `order:${order.id}`, userId: order.userId, chain: 'base', amount: 1n, from: 'cash' })],
    jobs: [{ kind: 'payout.progress', subjectId: order.id }] }))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  expect(await db.rampOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'created', version: 0 });
  expect(await db.orderTransition.count()).toBe(0);
  expect(await db.userEvent.count()).toBe(0);
  expect(await db.job.count()).toBe(0);
});
it('records a hold without changing status', async () => { /* to = current status, patch { holdReason: 'treasury_short' } → version 1, status unchanged, one audit row */ });
it('raises an alert once per open dedupe key', async () => { /* raise twice → 1 row; resolve; raise → 2 rows */ });
it('reports paused scopes and rejects with 503', async () => { /* set deposits paused → assertOpen('deposits','DEPOSITS_PAUSED') rejects statusCode 503 */ });
```

`makeOrder` is a factory added to `tests/helpers/factories.ts`. It inserts a `RampOrder` with sensible defaults for `kind`.

- [ ] **Step 2: Implement the transition matrices and `orderService`**

`transition` steps:
1. Unless `to === order.status`, require `to` to appear in the matrix for `order.kind`.
2. Run `tx.rampOrder.updateMany({ where: { id, version }, data: { ...patch-built-by-if, status: to, version: { increment: 1 } } })`. A count of 0 throws 409 `STALE_STATE`.
3. Insert the `OrderTransition`.
4. Post each journal.
5. Enqueue each job.
6. Insert `UserEvent { type: 'order.updated', subjectId: order.id, status: to }`.

Build the update data with explicit `if` assignments, never spreads.

- [ ] **Step 3: Implement `alertService` and `controlsService`**

`alertService.raise` swallows only the open-dedupe unique violation (`P2002` on `dedupeKey`). In `jobService.fail`, replace the inline alert with `alertService.raise`.

- [ ] **Step 4: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/orders src/backend/services/alerts src/backend/services/controls src/backend/services/jobs/index.ts tests/helpers/factories.ts tests/integration/order-transitions.test.ts
git commit -m "feat: add atomic order transitions, alerts and pause controls"
```

## Phase B — Rails and identity

### Task 8: Ramp provider contract, Yellow Card simulator and display rates

**Files:**
- Create: `src/backend/services/ramp/types.ts`, `src/backend/services/ramp/errors.ts`, `src/backend/services/ramp/fees.ts`, `src/backend/services/ramp/simulated.ts`, `src/backend/services/ramp/index.ts`, `src/backend/services/simulator/ramp.ts`, `src/backend/services/rates/index.ts`, `src/app/api/v1/rates/ngn/route.ts`, `tests/unit/fees.test.ts`, `tests/integration/simulated-ramp.test.ts`, `tests/integration/rates.test.ts`

**Interfaces:**
- Consumes: the money functions (Task 2); `now()`, `policy.sim`, `integrationModes()` (Task 1).
- Produces, provider contract and fees:
  - Everything in *Provider interfaces* for `ramp/types.ts` and `ProviderError`
  - `payInFeeKobo(kobo: bigint): bigint`, `PAYOUT_FEE_KOBO = 10_000n`
- Produces, simulator:
  - `createSimulatedRampProvider(id: ProviderId): RampProvider`, which is `partner_float` for `yellowcard`; Task 19 adds `paycrest`
  - `SIM_BANKS = [{ code: 'sim-bank-a', name: 'Beta Test Bank A (simulated)' }, { code: 'sim-bank-b', name: 'Beta Test Bank B (simulated)' }]`
  - `SIM_BANK_ACCOUNTS`:

    | Account | Holder | Notes |
    | --- | --- | --- |
    | `'0123456789'` | `'ADAEZE OBI'` | persona ada |
    | `'0234567891'` | `'BABATUNDE ADEYEMI'` | persona tunde |
    | `'0345678912'` | `'CHINEDU EZE'` | third party |
    | `'0000000000'` | `'ADAEZE OBI'` | payouts here fail |

  - `simRamp.markCollectionPaid(provider, key, { ngnAmount, senderName })`, `markCollectionFailed(provider, key)`, `addFault(scope, key)`, `seedFloat(provider, usd)`, `floatBalance(provider)`, `rateOverride`, where `rateOverride: { buy?: string; sell?: string }` is a test seam read by the simulator
- Produces, registry:
  - `rampRegistry.get(id: ProviderId): RampProvider`
  - `register(p: RampProvider): void` (test seam)
  - `reset(): void`
  - `forOrder(order: Pick<RampOrder, 'provider' | 'providerMode'>): RampProvider`, which throws `PermanentJobError('MODE_MISMATCH')` when the configured mode differs
  - `selectForNewOrder(direction: Direction): Promise<RampProvider>`, which returns Yellow Card here; failover arrives in Task 19
- Produces, rates:
  - `ratesService.display(): Promise<{ provider: ProviderId; depositRate: Rate; payoutRate: Rate; asOf: Date; expiresAt: Date }>`
  - `GET /api/v1/rates/ngn` returns `{ provider, deposit_rate: RateDto, payout_rate: RateDto, as_of, expires_at }`, or 503 `RATES_UNAVAILABLE`

**Simulator behaviour** (persisted in `sim_ramp_txs`; outcomes apply lazily when read at or after `settleAt` or `expiresAt`):

| Operation | Behaviour |
| --- | --- |
| `quote('in', k)` | buy rate; fee `payInFeeKobo(k)`; `usd = ngnToUsd(k − fee, buy, 'floor')`; `k` outside `policy.deposits` limits → `rejected 'AMOUNT_OUT_OF_RANGE'` |
| `quote('out', gross)` | sell rate; fee `PAYOUT_FEE_KOBO`; `usd = ngnToUsd(gross, sell, 'ceil')` |
| `createCollection` | duplicate key → `ProviderError('duplicate')`; otherwise state `pending`, expires in 240 min. Bank details: `Beta Test Bank (simulated)`, a deterministic 10-digit number starting `99` (from the key hash), account name `V3ST BETA TEST`. Completes only through `markCollectionPaid` |
| `refundCollection` | `refunding`, then `refunded` after `settleSeconds` |
| `createPayout` | locks at the current sell rate. Locked usd > `maxUsd` → `rate_moved` with no row written. Otherwise `pending` → `complete` after `settleSeconds`; becomes `failed` instead when the destination is `0000000000` or a `payout` fault exists for the key |
| `resolveBankAccount` | reads `SIM_BANK_ACCOUNTS`; unknown → `rejected 'ACCOUNT_NOT_FOUND'` |
| `floatBalance` | `seed + Σ complete collections + settlement_in − Σ non-failed payouts − settlement_out` |
| Webhooks | `verifyWebhook` returns `false`; `parseWebhook` throws, because the simulator has no webhooks |

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/fees.test.ts — Design's published schedule
expect(payInFeeKobo(2_000_000n)).toBe(20_000n);        // ₦20,000 → ₦200
expect(payInFeeKobo(100_000n)).toBe(5_500n);           // ₦1,000 → ₦55 minimum
expect(payInFeeKobo(9_999_900n)).toBe(99_999n);        // 1% under ₦100,000
expect(payInFeeKobo(10_000_000n)).toBe(135_000n);      // 0.5% with ₦1,350 minimum
expect(payInFeeKobo(300_000_000n)).toBe(1_500_000n);   // 0.5% above minimum
// tests/integration/simulated-ramp.test.ts
useTestDatabase(); const yc = () => createSimulatedRampProvider('yellowcard');
it('quotes a ₦20,000 deposit with the published fee and buy rate', async () => {
  expect(await yc().quote('in', 2_000_000n)).toMatchObject({ feeNgn: 20_000n, usdAmount: 12_375_000n, rate: { kobo: 4n, microUsd: 25n } });
});
it('quotes a ₦5,000 payout with the flat ₦100 fee', async () => {
  expect(await yc().quote('out', 500_000n)).toMatchObject({ feeNgn: 10_000n, usdAmount: 3_225_807n });
});
it('rejects a duplicate collection key and finds the original by key', async () => { /* second createCollection same key → ProviderError kind 'duplicate'; findByKey('in', key).ref === first.ref */ });
it('expires an unpaid collection after 240 minutes', async () => { /* setNow(+241 min) → getTransaction state 'expired' */ });
it('reports a paid collection with its sender and amount', async () => { /* markCollectionPaid(…, { ngnAmount: 2_000_000n, senderName: 'ADAEZE OBI' }) → state 'complete', senderName 'ADAEZE OBI', ngnAmount 2_000_000n */ });
it('fails payouts to 0000000000 after the settlement delay', async () => { /* state 'pending' before 5 s, 'failed' after */ });
it('refuses to lock a payout above maxUsd and writes nothing', async () => {
  simRamp.rateOverride.sell = '1500';
  await expect(yc().createPayout({ ...payoutInput, maxUsd: 3_225_807n })).rejects.toMatchObject({ kind: 'rate_moved' });
  expect(await db.simRampTx.count({ where: { kind: 'payout' } })).toBe(0);
});
// tests/integration/rates.test.ts
it('serves display rates for five seconds, then refreshes', async () => { /* spy rates(): two GETs within 5 s → 1 call; setNow(+6 s) → 2 calls; body.deposit_rate.ngn_per_usd '1600.00' */ });
it('answers 503 RATES_UNAVAILABLE when the provider fails', async () => { /* register provider whose rates() throws → 503, code RATES_UNAVAILABLE */ });
```

Write the commented cases as full tests with the assertions given in their comments. `payoutInput` is a local fixture: quote from `quote('out', 500_000n)`, destination `0123456789`, key `'w1'`.

- [ ] **Step 2: Implement the contract, fees and simulator**

Implement `types.ts`, `errors.ts`, `fees.ts`, `simulator/ramp.ts` and `simulated.ts` as specified. Every simulator row stores the provider and key. `getTransaction` and `findByKey` map rows to `ProviderTx`.

- [ ] **Step 3: Implement `rampRegistry`, `ratesService` and the rates route**

`rampRegistry` builds providers lazily from `integrationModes()`: the Yellow Card sandbox adapter (Task 9) when `yellowcard === 'sandbox'`, and the simulator otherwise. The rates cache is an in-process `Map` keyed by provider, with a 5 s TTL. The route is `withMiddleware(handler, [])`.

- [ ] **Step 4: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/ramp src/backend/services/simulator/ramp.ts src/backend/services/rates src/app/api/v1/rates tests/unit/fees.test.ts tests/integration/simulated-ramp.test.ts tests/integration/rates.test.ts
git commit -m "feat: add ramp provider contract, Yellow Card simulator and display rates"
```

### Task 9: Yellow Card sandbox adapter and the webhook inbox

**Files:**
- Create: `src/backend/services/ramp/yellowcard/client.ts`, `src/backend/services/ramp/yellowcard/schemas.ts`, `src/backend/services/ramp/yellowcard/mapping.ts`, `src/backend/services/ramp/yellowcard/index.ts`, `src/backend/services/webhooks/index.ts`, `src/app/api/v1/webhooks/yellowcard/route.ts`, `tests/contracts/fixtures/yellowcard/*.json`, `tests/contracts/yellowcard.test.ts`, `tests/integration/webhooks.test.ts`
- Modify: `src/backend/services/ramp/index.ts`, `src/backend/workers/handlers.ts`

**Interfaces:**
- Consumes: `assertAllowedUrl`, `YELLOWCARD_SANDBOX_URL` (Task 1); `parseProviderJson`, `decimalToMinor`, `minorToProviderNumber` (Task 2); `RampProvider`, `rampRegistry` (Task 8); `jobService.enqueue` (Task 6).
- Produces:
  - `createYellowCardClient(opts: { apiKey: string; secret: string; fetch?: typeof fetch; clock?: () => Date; timeoutMs?: number }): { request(method: 'GET' | 'POST', path: string, body?: object): Promise<unknown> }`
  - `class YellowCardProvider implements RampProvider`, built as `new YellowCardProvider({ apiKey, secret, fetch? })`
  - `mapYellowCardStatus(status: string): ProviderTxState`
  - `webhookService.accept(provider: ProviderId, headers: Headers, rawBody: Uint8Array): Promise<{ duplicate: boolean }>`
  - `webhookService.process(eventId: string): Promise<void>`
  - handler `webhook.process`

**Contract** (checked against docs.yellowcard.engineering on 2026-11-13):

Request signing:
- Headers: `X-YC-Timestamp: <ISO-8601>` and `Authorization: YcHmacV1 <apiKey>:<base64 HMAC-SHA256(secret, timestamp + path + METHOD + (POST/PUT with body ? base64(sha256(bodyText)) : ''))>`.
- `path` includes `/business` and excludes the query string.
- Bodies are sent byte-identical to the hashed `bodyText`.

| Adapter method | Yellow Card endpoint and mapping |
| --- | --- |
| `rates` | `GET /business/rates?currency=NGN` (`buy`, `sell` NGN per USD) |
| `quote` | `GET /business/channels?country=NG` for the active `bank` channel and its limits. The fee comes from the channel's documented fee fields when the fixture has them; otherwise the `fees.ts` schedule, as an estimate. Rate is `buy` for in, `sell` for out |
| `createCollection` | `POST /business/receive` `{ sequenceId: key, localAmount, currency: 'NGN', country: 'NG', channelId, forceAccept: true, customerType: 'retail', customerUID: userId, source: { accountName, accountNumber, accountType: 'bank', networkId: bankCode }, recipient: { name, country, phone, dob: 'MM/DD/YYYY', idType, idNumber, address } }` → `bankInfo`, `expiresAt`, `rate`, `amount` and fees |
| `refundCollection` | `POST /business/receive/{id}/refund` |
| `createPayout` | `POST /business/send` `{ sequenceId: key, localAmount: net, currency, country, channelId, reason: 'other', customerType: 'retail', sender: {…}, destination: { accountNumber, accountType: 'bank', accountName, networkId: bankCode } }`. If the locked USD cost is ≤ `maxUsd`, call `POST /business/send/{id}/accept`; otherwise throw `rate_moved` without accepting |
| `getTransaction` | `GET /business/{receive\|send}/{id}` |
| `findByKey` | `GET /business/{receive\|send}/sequence-id/{key}` (404 → `null`) |
| `resolveBankAccount` | `POST /business/details/bank` `{ accountNumber, networkId }` → `accountName` |
| `listBanks` | `GET /business/networks?country=NG` |
| `floatBalance` | `GET /business/account` → `accounts[currency=USD, currencyType=fiat].available`, floored to micro-USD |
| Webhooks | `X-YC-Signature` = base64 HMAC-SHA256(secret, raw body). Payload `{ id, sequenceId, status, apiKey, event, errorCode?, executedAt }`. `eventKey = ${id}:${event}:${executedAt ?? status}`. `RECEIVE.*` and legacy `COLLECTION.*` map to `in`; `SEND.*` and `PAYMENT.*` map to `out` |

Status mapping:

| Yellow Card status | `ProviderTxState` |
| --- | --- |
| `complete` | `complete` |
| `failed`, `denied`, `rejected`, `cancelled` | `failed` |
| `expired` | `expired` |
| `pending_refund`, `refund_processing` | `refunding` |
| `refunded` | `refunded` |
| `refund_failed` | `hold` |
| Any other documented status | `pending` |
| Undocumented status | `hold` |

Errors:

| Condition | `ProviderError` kind |
| --- | --- |
| Timeout (`AbortSignal.timeout(10_000)`), network error, 429 or 5xx | `transient` |
| Duplicate-sequence 4xx (code from the fixture) | `duplicate` |
| Any other 4xx | `rejected` |

Amount and fee field semantics (USD credited net of fees, locked cost) are pinned by fixture arithmetic. Sandbox completion follows the documented magic source and destination accounts: `1111111111` completes, `0000000000` fails.

- [ ] **Step 1: Build fixtures**

Create one JSON file per endpoint from the documented response examples: `receive-submit-201`, `receive-get-complete`, `send-submit-201`, `send-accept-200`, `send-get-failed`, `rates`, `channels`, `networks`, `details-bank`, `account`, `webhook-receive-complete`. Add a `_source` field naming the docs page. Replace each with a captured sandbox response as soon as sandbox keys exist, and record the capture date in `_source`. When `details-bank` is captured, record in its `_source` the account name the sandbox returns for `1111111111`. Task 21 copies it into the runbook as the name a sandbox test persona must carry.

- [ ] **Step 2: Write the failing contract tests**

```ts
const signing = { apiKey: 'test-key', secret: 'test-secret', clock: () => new Date('2026-11-13T07:00:00.000Z') };
it('signs a POST exactly as documented', async () => {
  const calls: Request[] = []; const client = createYellowCardClient({ ...signing, fetch: recordingFetch(calls, fixture('receive-submit-201')) });
  await client.request('POST', '/receive', { sequenceId: 'dep_test_0001', localAmount: 20000 });
  expect(calls[0]!.url).toBe('https://sandbox.api.yellowcard.io/business/receive');
  expect(calls[0]!.headers.get('X-YC-Timestamp')).toBe('2026-11-13T07:00:00.000Z');
  expect(calls[0]!.headers.get('Authorization')).toBe('YcHmacV1 test-key:Elz/7FW0xziKmO3Q3hrcinRA2TFEKsqCpgjj9Keg6M0=');
  expect(await calls[0]!.text()).toBe('{"sequenceId":"dep_test_0001","localAmount":20000}');
});
it('signs a GET without query string or body hash', async () => {
  const calls: Request[] = []; await createYellowCardClient({ ...signing, fetch: recordingFetch(calls, fixture('rates')) }).request('GET', '/rates?currency=NGN');
  expect(calls[0]!.headers.get('Authorization')).toBe('YcHmacV1 test-key:hh9FaxXNpTS26Q/kvT0fgV5IYZK5A3XC4lq0TRM52Yk=');
});
it('verifies webhook signatures over the exact raw bytes', () => {
  const raw = '{"id":"8f0c4d2e","sequenceId":"dep_test_0001","status":"complete","apiKey":"test-key","event":"RECEIVE.COMPLETE","executedAt":1763017200000}';
  const yc = new YellowCardProvider({ apiKey: 'test-key', secret: 'test-secret' });
  const sig = (s: string) => new Headers({ 'X-YC-Signature': s });
  expect(yc.verifyWebhook(sig('N0//PxixFw11aQwDdLsR6/U9/VLrH4f+OikGr34rYJw='), Buffer.from(raw))).toBe(true);
  expect(yc.verifyWebhook(sig('N0//PxixFw11aQwDdLsR6/U9/VLrH4f+OikGr34rYJw='), Buffer.from(raw.replace('complete', 'completE')))).toBe(false);
  expect(yc.verifyWebhook(sig('N0__PxixFw11aQwDdLsR6_U9_VLrH4f-OikGr34rYJw'), Buffer.from(raw))).toBe(false); // base64url is rejected
});
it('maps a completed receive to exact integer amounts', async () => { /* fixture receive-get-complete → state 'complete'; ngnAmount, usdAmount, feeNgn equal the fixture's decimal strings converted with decimalToMinor */ });
it('maps documented and unknown statuses', () => {
  expect(mapYellowCardStatus('refund_failed')).toBe('hold'); expect(mapYellowCardStatus('pending_approval')).toBe('pending');
  expect(mapYellowCardStatus('denied')).toBe('failed'); expect(mapYellowCardStatus('brand_new_status')).toBe('hold');
});
it('does not accept a send whose locked cost exceeds maxUsd', async () => { /* submit fixture amount above maxUsd → rejects kind 'rate_moved'; no recorded call path ends in '/accept' */ });
it('classifies a timeout as transient and a validation 400 as rejected', async () => { /* fetch never resolves + timeoutMs 10 → kind 'transient'; 400 ValidationError body → kind 'rejected' */ });
```

`recordingFetch(calls, fixture)` is a local fake that clones each `Request` into `calls` and responds with the fixture.

- [ ] **Step 3: Implement the client, schemas, mapping and provider**

Response schemas validate the parsed provider JSON, in which numbers arrive as strings. Never round through `Number`.

- [ ] **Step 4: Write the failing webhook inbox tests**

```ts
useTestDatabase();
beforeEach(() => rampRegistry.register(new YellowCardProvider({ apiKey: 'test-key', secret: 'test-secret' })));
it('stores a signed event once and enqueues one processing job', async () => {
  const first = await webhookService.accept('yellowcard', signedHeaders, rawBody);
  const second = await webhookService.accept('yellowcard', signedHeaders, rawBody);
  expect([first.duplicate, second.duplicate]).toEqual([false, true]);
  expect(await db.webhookEvent.count()).toBe(1);
  expect(await db.job.count({ where: { kind: 'webhook.process' } })).toBe(1);
});
it('records an invalid signature without queueing work or touching money', async () => {
  await expect(webhookService.accept('yellowcard', new Headers({ 'X-YC-Signature': 'AAAA' }), rawBody)).rejects.toMatchObject({ statusCode: 401 });
  expect(await db.webhookEvent.findFirst()).toMatchObject({ signatureValid: false });
  expect(await db.job.count()).toBe(0); expect(await db.ledgerJournal.count()).toBe(0);
});
it('keeps later states of the same transaction as separate events', async () => { /* RECEIVE.PENDING then RECEIVE.COMPLETE for id 8f0c4d2e → 2 rows */ });
it('routes a processed event to the owning order by provider ref or sequenceId', async () => { /* order with id = sequenceId and providerRef null → process → job deposit.progress:<orderId>; processedAt set */ });
it('answers 404 when Yellow Card runs simulated', async () => { /* rampRegistry.reset(); POST route → 404 */ });
```

- [ ] **Step 5: Implement the inbox, the route and the handler**

**`webhookService.accept`:**
1. The configured provider must be in `sandbox` mode; otherwise throw `NotFoundException`.
2. On an invalid signature, store `{ eventKey: 'invalid:' + sha256Hex(raw), signatureValid: false }` and throw 401.
3. On a valid signature, parse the hint. In one transaction, insert the event and enqueue `webhook.process`. A `P2002` on the insert means a duplicate.

**`process`:**
1. Find the order by `(provider, providerRef)`, or by `id = hint.key`.
2. Enqueue `deposit.progress` or `payout.progress` for it.
3. If no order matches, raise alert `webhook.unmatched`.
4. Set `processedAt`.

The route is `withMiddleware(handler, [], { bodyMode: 'raw' })` and returns `ok({ duplicate }, 'Accepted')`.

- [ ] **Step 6: Review the diff against Steps 2 and 4, then commit**

```bash
git add src/backend/services/ramp src/backend/services/webhooks src/app/api/v1/webhooks/yellowcard src/backend/workers/handlers.ts tests/contracts tests/integration/webhooks.test.ts
git commit -m "feat: integrate Yellow Card sandbox and signed webhook inbox"
```

### Task 10: Identity and database sessions

**Files:**
- Create: `src/server/auth/constants.ts`, `src/backend/services/auth/identity.ts`, `src/backend/services/auth/index.ts`, `src/backend/services/users/index.ts`, `src/backend/validators/auth.validator.ts`, `src/app/api/v1/beta/identity-token/route.ts`, `src/app/api/v1/auth/session/route.ts`, `src/app/api/v1/auth/logout/route.ts`, `src/app/api/v1/me/route.ts`, `tests/integration/auth.test.ts`
- Modify: `src/backend/middleware/index.ts`, `src/types/dto.ts`

**Interfaces:**
- Consumes: `withTx` (Task 4); `jobService.enqueue` (Task 6); `policy.auth`, `env.SIMULATED_IDENTITY_SECRET` (Task 1).
- Produces, constants: `SESSION_COOKIE_NAME = 'sara-session'`, `SESSION_MAX_AGE_SECONDS = 2_592_000`
- Produces, identity:
  - `IdentityVerifier { readonly mode: ProviderMode; verify(token: string): Promise<{ subject: string; phone: string }> }`
  - `simulatedIdentityVerifier`
- Produces, `authService`:
  - `issueBetaIdentityToken(phone: string): { token: string; expiresAt: Date }`
  - `signIn(identityToken: string): Promise<{ user: User; sessionToken: string; expires: Date; created: boolean }>`
  - `authenticate(sessionToken: string): Promise<AuthenticatedUser>`
  - `logout(sessionToken: string): Promise<void>`
  - `setSessionCookie(res: NextResponse, token: string, expires: Date): void`, `clearSessionCookie(res: NextResponse): void`
- Produces, middleware: `authMiddleware`, `optionalAuthMiddleware`, `operatorMiddleware` (403 `FORBIDDEN` unless `role === 'operator'`)
- Produces, `userService.me(userId): Promise<MeDto>`, where:
  - `MeDto = { id; phone; role: 'user' | 'operator'; kyc: KycDto; wallets: { family: 'evm' | 'solana'; address: string }[]; bank_account: BankAccountDto | null; earnings_preference: { mode: 'unset' | 'payout' | 'reinvest'; stock_id: string | null }; beta: { stage: 'beta'; test_funds_only: true } }`
  - `KycDto = { status: 'none' | 'verified' | 'rejected'; tier: number; verified_name: string | null; simulated: boolean }`
  - Until Tasks 11 and 12 land, `wallets` is `[]` and `bank_account` is `null`

Simulated identity token: `base64url(JSON { sub: 'sim:' + phone, phone, exp, nonce }) + '.' + base64url(HMAC-SHA256(SIMULATED_IDENTITY_SECRET, payloadPart))`. Phones must match `^\+2340000000\d{3}$`; any other value is 422 `TEST_PHONE_REQUIRED`. A token lives 300 s. No SMS is ever sent; the token endpoint *is* the simulated OTP sink.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('signs up a test phone, opens a session and queues wallet provisioning', async () => {
  const { token } = authService.issueBetaIdentityToken('+2340000000001');
  const res = await callRoute(sessionPOST, { method: 'POST', url: '/api/v1/auth/session', body: JSON.stringify({ identity_token: token }), headers: { Origin: 'http://localhost:3000' } });
  expect(res.status).toBe(200);
  expect(res.headers.get('set-cookie')).toMatch(/^sara-session=[A-Za-z0-9_-]{43}; .*HttpOnly.*SameSite=lax/i);
  expect(await db.user.count()).toBe(1);
  expect(await db.job.count({ where: { kind: 'wallets.provision' } })).toBe(1);
});
it('signs an existing identity in without a second user', async () => { /* signIn twice → users 1, sessions 2, created [true,false] */ });
it('rejects phones outside the beta test range', async () => {
  expect(() => authService.issueBetaIdentityToken('+2348031234567')).toThrow(expect.objectContaining({ code: 'TEST_PHONE_REQUIRED' }));
});
it('rejects forged and expired identity tokens', async () => { /* flip last char → 401; setNow(+301 s) → 401 */ });
it('marks the cookie Secure in production', async () => { /* vi.stubEnv('NODE_ENV','production') → set-cookie contains 'Secure' */ });
it('never falls back to a bearer token when the cookie is invalid', async () => {
  const good = (await authService.signIn(authService.issueBetaIdentityToken('+2340000000002').token)).sessionToken;
  const res = await callRoute(meGET, { method: 'GET', url: '/api/v1/me', cookie: 'sara-session=bogus', headers: { Authorization: `Bearer ${good}` } });
  expect(res.status).toBe(401);
});
it('rejects and deletes an expired session', async () => { /* setNow(+31 days) → authenticate rejects 401; sessions count 0 */ });
it('revokes the session on logout', async () => { /* logout → authenticate(token) rejects statusCode 401 */ });
it('returns 403 to non-operators', async () => { /* route with [authMiddleware, operatorMiddleware] → 403 */ });
```

- [ ] **Step 2: Implement the identity verifier and `authService`**

`signIn` creates the user when `identitySubject` is new, with `identityMode: 'simulated'`. In the same transaction it enqueues `wallets.provision` for the user. It then inserts the session. `authenticate` deletes expired sessions before throwing 401. Cookie options: `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `maxAge` = 30 days, and `secure: process.env.NODE_ENV === 'production'`, read at call time.

- [ ] **Step 3: Implement the middleware**

`authMiddleware` order:
1. If the `sara-session` cookie is present, it decides: valid sets `authTransport: 'cookie'`; invalid is 401.
2. Otherwise `Authorization: Bearer …` sets `authTransport: 'bearer'`.
3. Otherwise 401.

`optionalAuthMiddleware` follows the guide.

- [ ] **Step 4: Implement `userService.me` and the routes**

| Route | Middleware |
| --- | --- |
| identity-token | `[bodyValidatorMiddleware({ phone })]` |
| session | `[bodyValidatorMiddleware({ identity_token })]` |
| logout | `[authMiddleware, originMiddleware]` |
| me | `[authMiddleware]` |

- [ ] **Step 5: Review the diff against Step 1, then commit**

```bash
git add src/server/auth src/backend/services/auth src/backend/services/users src/backend/validators/auth.validator.ts src/backend/middleware src/types/dto.ts src/app/api/v1/beta/identity-token src/app/api/v1/auth src/app/api/v1/me tests/integration/auth.test.ts
git commit -m "feat: add simulated phone identity and database sessions"
```

### Task 11: Wallets, simulated chain and policy-checked transfers

**Files:**
- Create: `src/backend/services/wallets/chains.ts`, `src/backend/services/wallets/provider.ts`, `src/backend/services/wallets/simulated.ts`, `src/backend/services/wallets/policy.ts`, `src/backend/services/wallets/index.ts`, `src/backend/services/simulator/chain.ts`, `src/backend/services/screening/index.ts`, `tests/integration/wallets.test.ts`, `tests/integration/chain-transfers.test.ts`
- Modify: `src/backend/workers/handlers.ts`, `src/backend/services/users/index.ts`

**Interfaces:**
- Consumes: `ledgerService.post`, `transferReserved`, `transferReleased` (Task 5); `jobService` and the handler registries (Task 6); `alertService` (Task 7).
- Produces, chains: `type Chain = 'base' | 'solana'`, `CHAINS: Record<Chain, { family: WalletFamily; usdc: string; confirmSeconds: number }>`, with simulated token identifiers `'sim-usdc-base'` and `'sim-usdc-solana'`.
- Produces, provider interface:

  ```ts
  interface WalletProvider {
    readonly mode: ProviderMode;
    createWallet(i: { ownerKey: string; family: WalletFamily }): Promise<{ providerWalletId: string; address: string }>;
    submitTransfer(i: { key: string; chain: Chain; from: { providerWalletId: string; address: string };
      to: string; token: string; amount: bigint }): Promise<{ txHash: string }>;
    getTransfer(key: string): Promise<{ status: 'pending' | 'confirmed' | 'failed'; txHash: string; failureReason: string | null } | null>;
    getByHash(chain: Chain, txHash: string): Promise<{ status: 'pending' | 'confirmed' | 'failed'; from: string; to: string; token: string; amount: bigint } | null>;
    balance(chain: Chain, address: string, token: string): Promise<bigint>;
  }
  ```

- Produces, `walletService`:
  - `ensureUserWallets(userId): Promise<Wallet[]>`, `ensureTreasuryWallets(): Promise<TreasuryWallet[]>`
  - `createTransfer(tx: Tx, spec: TransferSpec): Promise<ChainTransfer>`, where `TransferSpec = { key: string; purpose: TransferPurpose; chain: Chain; amount: bigint; from: { kind: 'user'; userId: string } | { kind: 'treasury' }; to: { kind: 'user'; userId: string } | { kind: 'treasury' } | { kind: 'external'; address: string }; orderId?: string; treasuryOperationId?: string }`
  - `progressTransfer(transferId): Promise<ChainTransfer>`
  - `approveTransfer(transferId, operatorId): Promise<ChainTransfer>`
  - `observeIncoming(chain, txHash, expect: { to: string; amount: bigint }): Promise<'confirmed' | 'pending' | 'mismatch'>`
  - `treasuryAddress(chain): Promise<string>`
- Produces, checks:
  - `assertTransferPolicy(spec, resolved: { fromAddress: string; toAddress: string; boundAddress: string | null }): void`, which throws `PolicyViolation(code)`
  - `screeningService.screen(chain, address): Promise<'allow' | 'deny'>`, against a simulated deny list of `SIMULATED_DENYLIST = ['0x000000000000000000000000000000000000dEaD']`
  - `simChain.mint(chain, address, amount, key)`
  - `simulatedWalletProvider: WalletProvider`
  - handlers `wallets.provision` and `chain.progress`

Simulated addresses:
- EVM: `0x` plus the first 40 hex characters of `sha256('sim-evm:' + ownerKey)`.
- Solana: base58 of `sha256('sim-sol:' + ownerKey)`, using a local base58 encoder.

Transfer policy:
- The token must be the chain's USDC.
- A user wallet may send only to the chain treasury. For `direct_payout_funding` it may send to the order's `fundingAddress`, and only for exactly `fundingAmount`.
- The treasury may send only to V3ST user wallets, or to the settlement top-up address for `float_topup`.
- Amounts must stay within the user and treasury caps.
- Treasury-sourced amounts ≥ `policy.treasury.quorumThresholdMicroUsdc` start in `awaiting_approval` and need two distinct operators.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('provisions exactly one EVM and one Solana wallet under concurrent jobs', async () => {
  const u = await makeUser(); await Promise.all([walletService.ensureUserWallets(u.id), walletService.ensureUserWallets(u.id)]);
  const wallets = await db.wallet.findMany({ where: { userId: u.id } });
  expect(wallets.map((w) => w.family).sort()).toEqual(['evm', 'solana']);
  expect(wallets.find((w) => w.family === 'evm')!.address).toMatch(/^0x[0-9a-f]{40}$/);
});
it('reserves treasury funds when a treasury transfer is created', async () => {
  await seedTreasury('base', 10_000_000n); const u = await makeUserWithWallets();
  await withTx((tx) => walletService.createTransfer(tx, { key: 'fund:o1', purpose: 'deposit_funding', chain: 'base', amount: 4_000_000n, from: { kind: 'treasury' }, to: { kind: 'user', userId: u.id } }));
  expect(await ledgerService.balance(acct.treasury('base'))).toBe(6_000_000n);
  expect(await ledgerService.balance(acct.treasuryOutbound('base'))).toBe(4_000_000n);
});
it('refuses a treasury transfer above the treasury balance and writes nothing', async () => { /* seedTreasury 1 USDC, transfer 2 → INSUFFICIENT_FUNDS; chain_transfers count 0 */ });
it('submits once when progress resumes after a crash after acceptance', async () => {
  const t = await createFundingTransfer();                       // pending row for key 'fund:o2'
  await simulatedWalletProvider.submitTransfer({ key: t.key, chain: 'base', from: treasuryRef, to: t.toAddress, token: 'sim-usdc-base', amount: t.amount });
  await walletService.progressTransfer(t.id);
  expect(await db.simChainTx.count({ where: { key: t.key } })).toBe(1);
  expect((await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('submitted');
});
it('blocks unlisted recipients and screened addresses before any submission', async () => { /* user → random external address → failed 'POLICY'; to SIMULATED_DENYLIST[0] → failed 'SCREENING_DENIED'; sim_chain_txs 0 */ });
it('holds large treasury transfers for two distinct operators', async () => { /* amount ≥ threshold → awaiting_approval; approve(op1) twice → 409 ALREADY_APPROVED; approve(op2) → pending */ });
it('confirms only after the simulated confirmation delay', async () => { /* setNow(+3 s) → submitted; setNow(+4 s) → confirmed */ });
```

`makeUserWithWallets`, `createFundingTransfer` and `treasuryRef` are factories. Add the first two to `tests/helpers/factories.ts`.

- [ ] **Step 2: Implement the chains, the provider and the simulated chain**

Implement `chains.ts`, `provider.ts`, `simulator/chain.ts` and `simulated.ts`. In the simulated chain:
- A submit for an existing key returns the stored hash.
- A `chain` fault for the key makes the transfer `failed`.
- Status becomes `confirmed` at `confirmAt`.
- Balances are the sum of confirmed rows.

- [ ] **Step 3: Implement `walletService`**

**`createTransfer`:**
1. Resolve both addresses.
2. Insert the row as `pending` (or `awaiting_approval` above the quorum threshold).
3. Post `transferReserved` when the source is the treasury.
4. Enqueue `chain.progress`.

**`progressTransfer` by status:**

| Status | Action |
| --- | --- |
| `pending` | Run the policy and screening checks. On failure, mark `failed` with the code and post `transferReleased` for a treasury source. Otherwise `getTransfer(key)`, and `submitTransfer` only if that returns `null`. Then mark `submitted` with the hash, and self-enqueue at `confirmSeconds`. |
| `submitted` | `getTransfer(key)`. If it is confirmed or failed, record that status. |

The `chain.progress` handler calls `transferSettledHandlers[purpose]` whenever the transfer is terminal, so domain callbacks run at least once and must be idempotent. `wallets.provision` calls `ensureUserWallets`. `userService.me` now lists wallets.

- [ ] **Step 4: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/wallets src/backend/services/simulator/chain.ts src/backend/services/screening src/backend/services/users src/backend/workers/handlers.ts tests/helpers/factories.ts tests/integration/wallets.test.ts tests/integration/chain-transfers.test.ts
git commit -m "feat: add simulated wallets and policy-checked chain transfers"
```

### Task 12: KYC personas, compliance limits and verified bank accounts

**Files:**
- Create: `src/backend/services/kyc/personas.ts`, `src/backend/services/kyc/index.ts`, `src/backend/services/compliance/name-match.ts`, `src/backend/services/compliance/index.ts`, `src/backend/services/bank-accounts/index.ts`, `src/backend/validators/identity.validator.ts`, `src/backend/validators/bank-account.validator.ts`, `src/app/api/v1/identity/personas/route.ts`, `src/app/api/v1/identity/verification/route.ts`, `src/app/api/v1/banks/route.ts`, `src/app/api/v1/bank-accounts/route.ts`, `tests/unit/name-match.test.ts`, `tests/integration/compliance.test.ts`, `tests/integration/bank-accounts.test.ts`
- Modify: `src/backend/services/users/index.ts`, `src/types/dto.ts`, `tests/helpers/factories.ts`

**Interfaces:**
- Consumes: `rampRegistry.get('yellowcard')` (Task 8); `lockRows`, `lagosDayStart`, `lagosMonthStart` (Tasks 4 and 6); `policy.compliance` (Task 1).
- Produces, KYC:
  - `BETA_PERSONAS`, where `Persona = { id: 'ada_tier2' | 'tunde_tier1' | 'rejected'; label: string; tier: 0 | 1 | 2; outcome: 'verified' | 'rejected'; name: string | null; profile: { dateOfBirth: string | null; idType: 'BVN'; idNumber: string | null; address: string | null } }`. The values:

    | Persona | Name | Tier | Date of birth | Synthetic id | Address |
    | --- | --- | --- | --- | --- | --- |
    | `ada_tier2` | `'ADAEZE OBI'` | 2 | `'1990-04-12'` | `'22200000001'` | `'1 Test Close, Lagos (simulated)'` |
    | `tunde_tier1` | `'BABATUNDE ADEYEMI'` | 1 | `'1988-09-30'` | `'22200000002'` | `null` |
    | `rejected` | — | 0 | — | — | — (outcome `rejected`) |

  - `kycService.personas(): PersonaDto[]`
  - `kycService.verify(userId, { persona }): Promise<KycDto>`. It records `kycMode: 'simulated'`. Re-verifying a verified user with a different persona is 409 `ALREADY_VERIFIED`.
- Produces, compliance:
  - `nameMatches(verified: string, candidate: string): boolean`
  - `complianceService.assertCanTransact(tx: Tx, input: { userId: string; direction: Direction; ngnAmount: bigint; usdAmount: bigint; at: Date }): Promise<Customer>`
  - `customerFor(user: User): Customer`
- Produces, bank accounts:
  - `bankAccountService.add(userId, { bank_code, account_number }): Promise<BankAccountDto>`
  - `bankAccountService.getActive(userId): Promise<BankAccountDto | null>`
  - `bankAccountService.getActiveRow(userId): Promise<BankAccount | null>`
  - `bankAccountService.listBanks(): Promise<BankDto[]>`
  - `BankAccountDto = { id; bank_code; bank_name; account_number_masked; resolved_name; created_at }`
- Produces, test factories: `makeVerifiedUser(persona = 'ada_tier2')`, `makeBankAccount(userId, accountNumber = '0123456789')`

Rules:
- **Name match.** Uppercase both names, turn every character outside `A–Z` and space into a space, collapse runs of spaces, trim, and split into tokens. The names match iff both have at least 2 tokens and every token of the shorter name occurs in the longer name, as a multiset.
- **Limits.** Per direction, sum the `ngnAmount` of the user's orders whose status is not `failed`, `expired` or `refunded`, from `lagosDayStart` and from `lagosMonthStart`, while the user row is locked with `lockRows`. Over the limit → 409 `LIMIT_EXCEEDED`.
- **Travel Rule.** When `usdAmount ≥ 1_000_000_000n`, all of `name`, `dateOfBirth`, `idNumber` and `address` are required; otherwise 403 `TRAVEL_RULE_DATA_MISSING`.
- **KYC.** Status must be `verified`, or 403 `KYC_REQUIRED`.
- **Bank accounts.** An account number is 10 digits as a string. The DTO masks all but the last four digits (`******6789`). On a name match, mark the previous active account `replaced` and insert the new one `active`. On a mismatch, insert the account as `rejected` and throw 422 `NAME_MISMATCH`. A transient resolution failure is 503 `RAIL_UNAVAILABLE`, and nothing is stored.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/name-match.test.ts
expect(nameMatches('ADAEZE OBI', 'OBI ADAEZE CHIOMA')).toBe(true);
expect(nameMatches('Adaeze  Obi.', 'ADAEZE OBI')).toBe(true);
expect(nameMatches('ADAEZE OBI', 'ADA OBI')).toBe(false);
expect(nameMatches('ADAEZE OBI', 'CHINEDU EZE')).toBe(false);
expect(nameMatches('ADAEZE', 'ADAEZE')).toBe(false);
expect(nameMatches('OBI OBI', 'OBI ADAEZE')).toBe(false);
// tests/integration/compliance.test.ts
useTestDatabase();
it('requires verified KYC', async () => { /* unverified user → assertCanTransact rejects 403 KYC_REQUIRED */ });
it('enforces the tier-1 daily limit across concurrent orders', async () => {
  setNow('2026-11-13T09:00:00Z'); const u = await makeVerifiedUser('tunde_tier1');
  const attempt = (k: string) => withTx(async (tx) => {
    await complianceService.assertCanTransact(tx, { userId: u.id, direction: 'in', ngnAmount: 20_000_000n, usdAmount: 1n, at: now() });
    await insertOrderRow(tx, { userId: u.id, ngnAmount: 20_000_000n, idempotencyKey: k });
  });
  const r = await Promise.allSettled([attempt('a'), attempt('b')]);
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: { code: 'LIMIT_EXCEEDED' } });
});
it('resets the daily limit at Lagos midnight', async () => { /* order at 2026-11-12T22:30:00Z fills the day; a new order at 2026-11-12T23:30:00Z (00:30 Lagos) passes */ });
it('requires travel-rule data at exactly one thousand dollars', async () => {
  const u = await makeVerifiedUser('tunde_tier1');
  await expect(withTx((tx) => complianceService.assertCanTransact(tx, { userId: u.id, direction: 'out', ngnAmount: 1_000n, usdAmount: 999_999_999n, at: now() }))).resolves.toBeDefined();
  await expect(withTx((tx) => complianceService.assertCanTransact(tx, { userId: u.id, direction: 'out', ngnAmount: 1_000n, usdAmount: 1_000_000_000n, at: now() })))
    .rejects.toMatchObject({ statusCode: 403, code: 'TRAVEL_RULE_DATA_MISSING' });
});
// tests/integration/bank-accounts.test.ts
it('stores a name-matched account as the single active destination', async () => { /* ada + '0123456789' → active; masked '******6789'; adding another matching account → previous 'replaced'; one active */ });
it('rejects a third-party account and keeps the previous destination', async () => { /* '0345678912' (CHINEDU EZE) → 422 NAME_MISMATCH; active unchanged; a 'rejected' row exists */ });
it('stores nothing when name resolution is unavailable', async () => { /* register provider whose resolveBankAccount throws transient → 503 RAIL_UNAVAILABLE; bank_accounts 0 */ });
```

`insertOrderRow` is a local helper: one typed `tx.rampOrder.create`.

- [ ] **Step 2: Implement personas, KYC, name matching and compliance**

Implement `personas.ts`, `kyc/index.ts`, `name-match.ts` and `compliance/index.ts`.

- [ ] **Step 3: Implement bank accounts, the routes, `me` and the factories**

All routes run `[authMiddleware, …validators]`, and mutating routes also run `originMiddleware`. The bank list is cached in process for 10 minutes. `userService.me` now includes `bank_account`. Add the factories.

- [ ] **Step 4: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/kyc src/backend/services/compliance src/backend/services/bank-accounts src/backend/services/users src/backend/validators/identity.validator.ts src/backend/validators/bank-account.validator.ts src/app/api/v1/identity src/app/api/v1/banks src/app/api/v1/bank-accounts src/types/dto.ts tests/helpers/factories.ts tests/unit/name-match.test.ts tests/integration/compliance.test.ts tests/integration/bank-accounts.test.ts
git commit -m "feat: add simulated KYC, compliance limits and verified payout accounts"
```

## Phase C — Money flows

### Task 13: Stock catalog, trade router and portfolio

**Files:**
- Create: `src/backend/services/stocks/index.ts`, `src/backend/services/trades/venue.ts`, `src/backend/services/trades/router.ts`, `src/backend/services/trades/index.ts`, `src/backend/services/simulator/venue.ts`, `src/backend/services/portfolio/index.ts`, `src/backend/validators/trade.validator.ts`, `src/app/api/v1/stocks/route.ts`, `src/app/api/v1/portfolio/route.ts`, `src/app/api/v1/trades/[id]/retry/route.ts`, `tests/integration/trades.test.ts`, `tests/integration/portfolio.test.ts`
- Modify: `src/backend/workers/handlers.ts`, `src/types/dto.ts`, `tests/helpers/factories.ts`

**Interfaces:**
- Consumes: `ledgerService`, `cashReserved`, `cashReleased`, `stockReserved`, `stockReleased`, `tradeFilled` (Task 5); `tradeSettledHandlers` (Task 6); `controlsService` (Task 7); `ratesService.display` (Task 8); `walletService` (Task 11).
- Produces, venue interface:

  ```ts
  interface Venue {
    readonly id: string; readonly chain: Chain;
    quote(i: { stock: Stock; side: TradeSide; amountIn: bigint }): Promise<{ amountOut: bigint; priceImpactBps: number; expiresAt: Date }>;
    quoteExactOut(i: { stock: Stock; side: TradeSide; amountOut: bigint }): Promise<{ amountIn: bigint }>;
    submitSwap(i: { key: string; wallet: Wallet; stock: Stock; side: TradeSide; amountIn: bigint; minAmountOut: bigint }): Promise<{ ref: string }>;
    getSwap(key: string): Promise<{ status: 'pending' | 'filled' | 'failed'; amountOut: bigint | null; failureReason: string | null } | null>;
  }
  ```

- Produces, catalog, venues and router:
  - `stockService.list(): Promise<StockDto[]>`, `get(id): Promise<Stock>` (422 `STOCK_UNAVAILABLE` when missing or disabled), `upsertCatalog(stocks): Promise<void>`
  - `simulatedVenue` (id `sim-base`, chain `base`) and `simVenue.addFault(scope: 'swap' | 'swap_impact', key)`
  - `tradeRouter.route(i: { stock; side; amountIn }): Promise<{ venue: Venue; amountOut: bigint }>` (409 `NO_ROUTE`)
- Produces, `tradeService`:
  - `createBuy(tx: Tx, i: { key: string; userId: string; stockId: string; amountIn: bigint; purpose: 'deposit_buy' | 'retry_buy' | 'reinvest'; fundsSource: 'cash' | 'earnings'; orderId?: string }): Promise<TradeOrder>`
  - `createSell(tx: Tx, i: { key; userId; stockId; quantity: bigint; minAmountOut: bigint; orderId: string }): Promise<TradeOrder>`
  - `progress(tradeId): Promise<void>`
  - `retry(userId, tradeId, idempotencyKey): Promise<TradeDto>`
- Produces, `portfolioService.get(userId): Promise<PortfolioDto>`
- Produces, factory `makeStock({ symbol = 'TSTA', simPriceMicroUsdc = 2_000_000n, decimals = 6, simWeeklyEarningMicroPerShare = 200_000n })`
- Produces, DTOs:
  - `StockDto = { id; symbol; name; chain; decimals; price_usdc: string | null; simulated: true }`
  - `TradeDto = { id; side; stock_id; status; amount_in; amount_out: string | null; min_amount_out: string | null; failure_reason: string | null; retryable: boolean; created_at }`
  - `PortfolioDto = { cash_usdc; reserved_usdc; pending_usdc; earnings_usdc; cash_ngn: string | null; pending_ngn: string | null; earnings_ngn: string | null; holdings: { stock_id; symbol; name; quantity; decimals; price_usdc: string | null; value_usdc: string | null; value_ngn: string | null }[]; rate: RateDto | null; valuation: 'ok' | 'partial' | 'unavailable'; as_of; beta: BetaDto }`

Simulated venue:
- The price is `stock.simPriceMicroUsdc` per whole share (`10^decimals` units).
- Buy: `out = floor(in × 10^decimals / price)`. Sell: `out = floor(in × price / 10^decimals)`.
- `priceImpactBps` is 0, or 150 when a `swap_impact` fault exists for the key.
- A swap settles after `policy.sim.yellowcard.settleSeconds`. It fails with `REVERTED` when a `swap` fault exists or when `out < minAmountOut`.

`tradeService.progress` by status:

| Status | Action |
| --- | --- |
| `pending` | `trading` paused → `RetryableError('TRADING_PAUSED', 600_000)`. Route; `priceImpactBps > policy.trading.maxSlippageBps` → `failed 'SLIPPAGE'` without submitting. Buys use `minAmountOut = floor(amountOut × (10_000 − maxSlippageBps) / 10_000)`. Check `getSwap(key)` first, `submitSwap` only on `null`, then mark `submitted` and self-enqueue at settle time. |
| `submitted` | `filled` → post `tradeFilled` with the actual `amountOut` and mark `filled`. `failed` → post the matching `cashReleased`/`stockReleased` back to `fundsSource` and mark `failed`. |
| terminal | Call `tradeSettledHandlers[purpose]` when one is registered (`retry_buy` has none). |

`retry`:
- Only a `failed` buy owned by the user qualifies, otherwise 404.
- The key is `trade-retry:<userId>:<idempotencyKey>`, and an existing trade for that key is returned unchanged.
- It creates a new buy from `cash` for the original `amountIn` with purpose `retry_buy`. Insufficient cash is 409 `INSUFFICIENT_FUNDS`.

`portfolioService.get`:
- Balances come from the ledger and prices from the router's sell quote for one whole share.
- Naira values use `ratesService.display().payoutRate` with floor rounding.
- A rate failure gives `valuation: 'unavailable'` and `null` for every naira field. A price failure nulls that holding's value and gives `'partial'`. Never fabricate zeros.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('buys through the best route and settles holdings', async () => {
  const u = await makeUserWithWallets(); const s = await makeStock(); await fundCash(u.id, 10_000_000n);
  const t = await withTx((tx) => tradeService.createBuy(tx, { key: 'buy:1', userId: u.id, stockId: s.id, amountIn: 10_000_000n, purpose: 'retry_buy', fundsSource: 'cash' }));
  await drainJobs();
  expect(await db.tradeOrder.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ status: 'filled', amountOut: 5_000_000n });
  expect(await ledgerService.balance(acct.userStock(u.id, s.id))).toBe(5_000_000n);
  expect(await ledgerService.balance(acct.userCash(u.id, 'base'))).toBe(0n);
});
it('does not submit a swap that breaches the slippage cap and restores the cash', async () => { /* simVenue.addFault('swap_impact','buy:2') → failed 'SLIPPAGE'; sim_swaps 0; cash 10_000_000n */ });
it('retains cash after a reverted buy and retries once per key', async () => {
  /* simVenue.addFault('swap','buy:3') → failed; cash 10_000_000n; retry(u,'buy:3' trade,'k1') twice → same trade id; after drain → filled */
});
it('never buys twice when progress repeats after a fill', async () => { /* progress ×3 after fill → ledger_journals with key trade:<id>:filled = 1; sim_swaps 1 */ });
it('rejects a retry without enough cash', async () => { /* cash spent → retry → 409 INSUFFICIENT_FUNDS */ });
it('keeps selling available while deposits are paused', async () => { /* controlsService.set deposits paused; createSell + drain → filled */ });
// tests/integration/portfolio.test.ts
it('values holdings in naira at read time', async () => { /* 5 shares at $2 = 10_000_000 micro; payout rate 1550 → value_ngn '1550000'; valuation 'ok' */ });
it('reports unavailable valuation instead of zero naira when rates fail', async () => {
  rampRegistry.register(providerWithFailingRates());
  const p = await portfolioService.get(userWithCash.id);
  expect(p).toMatchObject({ cash_usdc: '10000000', cash_ngn: null, valuation: 'unavailable', rate: null });
});
```

Write the commented cases as full tests with the assertions given in their comments. `providerWithFailingRates()` is a local helper: a `RampProvider` whose `rates()` throws `ProviderError('transient')`.

- [ ] **Step 2: Implement the services, the simulated venue, the routes and the handler**

Implement `stocks`, `venue.ts` with `simulator/venue.ts`, `router.ts`, `trades/index.ts` and `portfolio/index.ts`.

| Route | Middleware |
| --- | --- |
| stocks | `[authMiddleware]` |
| portfolio | `[authMiddleware]`, private and `no-store` |
| retry | `[authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema), idempotencyKeyMiddleware]` |

Register the `trade.progress` handler.

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/stocks src/backend/services/trades src/backend/services/simulator/venue.ts src/backend/services/portfolio src/backend/validators/trade.validator.ts src/app/api/v1/stocks src/app/api/v1/portfolio src/app/api/v1/trades src/backend/workers/handlers.ts src/types/dto.ts tests/helpers/factories.ts tests/integration/trades.test.ts tests/integration/portfolio.test.ts
git commit -m "feat: route simulated stock trades and value portfolios at read time"
```

### Task 14: Deposits from bank instructions to settled cash or shares

**Files:**
- Create: `src/backend/validators/deposit.validator.ts`, `src/backend/services/deposits/dto.ts`, `src/backend/services/deposits/index.ts`, `src/backend/services/orders/poller.ts`, `src/app/api/v1/deposits/route.ts`, `src/app/api/v1/deposits/[id]/route.ts`, `tests/integration/deposits.test.ts`
- Modify: `src/backend/workers/handlers.ts`, `src/types/dto.ts`

**Interfaces:**
- Consumes: `orderService.transition`, `loadForUpdate`, `getOwned` (Task 7); `rampRegistry` (Task 8); `walletService.createTransfer` (Task 11); `complianceService`, `nameMatches`, `bankAccountService.getActiveRow` (Task 12); `tradeService.createBuy`, `stockService.get` (Task 13); `ratesService` (Task 8).
- Produces:
  - `depositBodySchema = z.object({ ngn_amount: minorAmountSchema, stock_id: cuidSchema.optional() }).strict()`
  - `depositService.create(userId, body: DepositBody, idempotencyKey: string): Promise<{ deposit: DepositDto; created: boolean }>`
  - `depositService.get(userId, id): Promise<DepositDto>`
  - `depositService.progress(orderId): Promise<void>`
  - `depositService.onFundingSettled(t: ChainTransfer): Promise<void>`
  - `depositService.onBuySettled(t: TradeOrder): Promise<void>`
  - `depositService.requestRefund(orderId, actor: string): Promise<void>`
  - `pollOpenWork(at: Date): Promise<number>`
  - handlers `deposit.progress` and `poll.open_work`; `transferSettledHandlers.deposit_funding`; `tradeSettledHandlers.deposit_buy`
  - `DepositDto = { id; status; hold_reason: string | null; ngn_amount; received_ngn_amount: string | null; fee_ngn: string | null; usd_amount: string | null; rate: RateDto | null; expires_at: string | null; bank_details: { bank_name; account_number; account_name; reference: string | null; test_details_only: true } | null; stock_id: string | null; trade: TradeDto | null; provider; beta: BetaDto; created_at; updated_at }`

**`create`:**
1. `assertOpen('deposits', 'DEPOSITS_PAUSED')`.
2. Load the stock if one was given.
3. Require an active bank account, or 403 `BANK_ACCOUNT_REQUIRED`. It becomes the Yellow Card `source`.
4. `provider = selectForNewOrder('in')`.
5. Estimate USD at the display deposit rate with floor rounding; this is for the Travel Rule check only.
6. In one `withTx`:
   - Look up the key `deposit:<userId>:<key>`. When the order exists, return it if `requestHash` matches, or 409 `IDEMPOTENCY_KEY_REUSED` if not.
   - Otherwise run `assertCanTransact`, insert the order (`created`, `settlementModel` from the provider, `chain = stock?.chain ?? policy.defaultChain`), and enqueue `deposit.progress` at `now + 15 s`.
7. After commit, run `progress(order.id)` inline under `Promise.race` with an 8 s timer, catching every error. The job is the backstop.
8. Reply 201 when `awaiting_transfer`, 202 when still `created`, and 200 for an idempotent replay.

**`progress` by status** (the provider key is `order.id`):

| Status | Action |
| --- | --- |
| `created` | `findByKey('in', id)`; when it returns `null`, `quote` + `createCollection`. On success, move to `awaiting_transfer` with the provider ref, the `payTo*` fields, `feeNgn`, `usdAmount`, the rate and `expiresAt`. `duplicate` → adopt through `findByKey`. `rejected` → `failed` with the reason. `transient` → `RetryableError`. |
| `awaiting_transfer` / `expired` | `getTransaction`. `failed` → `failed`. `expired` → `expired`. `refunded` → `refunded`. `hold` → hold `needs_review` plus an alert. `pending` and `refunding` do nothing. For `complete`, see below. |
| `received` | Unless a `fund:<orderId>` transfer exists, require the user's wallet for the chain (missing → `RetryableError('WALLET_NOT_READY')`) and call `createTransfer({ key: 'fund:<id>', purpose: 'deposit_funding', from: treasury, to: user, amount: usdAmount })`. `INSUFFICIENT_FUNDS` → hold `treasury_short`, raise alert `treasury.short:<chain>`, then `RetryableError(…, 300_000)`. Clear the hold once the transfer exists. |

When `getTransaction` reports `complete` and no refund is in progress:
- No sender name → hold `missing_sender` plus an alert. There is no automatic refund; an operator decides.
- `!nameMatches(user.verifiedName, senderName)` → hold `name_mismatch`, `refundCollection` and an alert.
- `|received − ngnAmount| × 10_000 > ngnAmount × toleranceBps` → hold `amount_mismatch` and `refundCollection`.
- Otherwise move to `received` (from `awaiting_transfer` or `expired`) with `receivedNgn` and the provider-reported `usdAmount`. Post `depositReceived` and enqueue progress.

Callbacks:
- **`onFundingSettled`.** A confirmed transfer posts `userFunded(to: 'cash')` and moves the order to `funded`. With a stock, the same transaction calls `createBuy({ key: 'deposit-buy:<id>', purpose: 'deposit_buy', fundsSource: 'cash', amountIn: usdAmount })`; without one it also moves `funded → settled`. A failed transfer posts `transferReleased` and holds the order as `needs_review` plus an alert.
- **`onBuySettled`.** Moves `funded → settled`, whether the trade filled or failed. A failed buy leaves the funds as cash.

**`pollOpenWork`** re-arms progress jobs, skipping any whose job is `dead`, for:
- deposits in `created`, `awaiting_transfer` or `received`;
- deposits `expired` within `latePaymentWatchHours`;
- payouts in `created`, `funds_collected`, `submitted` or `reversed` while a return is outstanding;
- transfers in `pending` or `submitted`;
- trades in `pending` or `submitted`;
- treasury operations that are not terminal.

The routes run:
- `POST /deposits`: `[authMiddleware, originMiddleware, idempotencyKeyMiddleware, bodyValidatorMiddleware(depositBodySchema)]`
- `GET /deposits/:id`: `[authMiddleware, pathParamValidatorMiddleware(idParamSchema)]`

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
beforeEach(async () => { setNow('2026-11-13T09:00:00Z'); await seedTreasury('base', 1_000_000_000n); ada = await makeVerifiedUser('ada_tier2'); await makeBankAccount(ada.id); await walletService.ensureUserWallets(ada.id); });
it('returns locked bank instructions for a ₦20,000 deposit', async () => {
  const res = await postDeposit(ada, { ngn_amount: '2000000' }, 'key-0001');
  expect(res.status).toBe(201);
  expect(res.json).toMatchObject({ data: { status: 'awaiting_transfer', fee_ngn: '20000', usd_amount: '12375000',
    rate: { kobo: '4', micro_usd: '25', ngn_per_usd: '1600.00' }, bank_details: { test_details_only: true } } });
});
it('returns the same order for a replayed key and 409 for a changed body', async () => { /* same key+body → same id, status 200; same key, ngn_amount '3000000' → 409 IDEMPOTENCY_KEY_REUSED */ });
it('answers 202 and finishes the collection in the worker when the partner is slow', async () => { /* provider createCollection throws transient once → 202 'created'; drainJobs → 'awaiting_transfer' */ });
it('credits a matching payment once across webhook, poll and retries', async () => {
  const d = await createDeposit(ada, '2000000');
  await simRamp.markCollectionPaid('yellowcard', d.id, { ngnAmount: 2_000_000n, senderName: 'ADAEZE OBI' });
  await Promise.all([depositService.progress(d.id), depositService.progress(d.id), depositService.progress(d.id)].map((p) => p.catch(() => undefined)));
  await drainJobs();
  expect(await db.ledgerJournal.count({ where: { key: `deposit:${d.id}:received` } })).toBe(1);
  expect(await db.chainTransfer.count({ where: { key: `fund:${d.id}` } })).toBe(1);
  expect((await depositService.get(ada.id, d.id)).status).toBe('settled');
  expect(await ledgerService.balance(acct.userCash(ada.id, 'base'))).toBe(12_375_000n);
});
it('buys the chosen stock after funding, or settles as cash when the buy reverts', async () => { /* stock_id → settled with trade 'filled'; with simVenue.addFault('swap','deposit-buy:<id>') → settled, trade 'failed', cash 12_375_000n */ });
it('refunds a third-party payment without crediting', async () => { /* senderName 'CHINEDU EZE' → hold 'name_mismatch'; journals for order 0; drain past refund delay → status 'refunded' */ });
it('credits an underpayment inside tolerance at the partner-reported value', async () => { /* paid 1_990_000n (−0.5%) → 'received', received_ngn_amount '1990000' */ });
it('refunds a payment outside tolerance', async () => { /* paid 1_900_000n (−5%) → hold 'amount_mismatch' → 'refunded' */ });
it('expires an unpaid deposit yet still credits a late payment', async () => { /* setNow(+241 min) → drain → 'expired'; markCollectionPaid → drain → 'settled' */ });
it('waits in received while the treasury is short, then funds after top-up', async () => { /* treasury 0 → hold 'treasury_short' + one open alert; seedTreasury → drain → 'settled' */ });
it('refuses new deposits while paused but keeps progressing open ones', async () => { /* paused → POST 503 DEPOSITS_PAUSED; an existing awaiting order still settles */ });
it('hides other users\' deposits', async () => { /* GET by another user → 404 */ });
```

`postDeposit` and `createDeposit` are local helpers over `callRoute`, with the session cookie and `Origin`.

- [ ] **Step 2: Implement the validator, DTO, service, poller, routes and handlers**

Implement `deposit.validator.ts`, `dto.ts`, `deposits/index.ts`, `orders/poller.ts`, the routes and the handler registrations. `toDepositDto` serialises every BigInt with `formatMinor`.

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/validators/deposit.validator.ts src/backend/services/deposits src/backend/services/orders/poller.ts src/app/api/v1/deposits src/backend/workers/handlers.ts src/types/dto.ts tests/integration/deposits.test.ts
git commit -m "feat: deliver idempotent bank-transfer deposits through funding and purchase"
```

### Task 15: Quoted withdrawals, payout progression and confirmed reversals

**Files:**
- Create: `src/backend/validators/withdrawal.validator.ts`, `src/backend/services/withdrawals/dto.ts`, `src/backend/services/withdrawals/index.ts`, `src/backend/services/treasury/capacity.ts`, `src/app/api/v1/withdrawals/quote/route.ts`, `src/app/api/v1/withdrawals/route.ts`, `src/app/api/v1/withdrawals/[id]/route.ts`, `tests/integration/withdrawals.test.ts`
- Modify: `src/backend/workers/handlers.ts`, `src/types/dto.ts`

**Interfaces:**
- Consumes: everything Task 14 consumes; `tradeService.createSell` and `tradeRouter` (Task 13).
- Produces, schemas:
  - `withdrawalQuoteBodySchema = { ngn_amount: minorAmountSchema, stock_id?: cuid }`, `.strict()`
  - `withdrawalBodySchema = { quote_id: cuid }`, `.strict()`
- Produces, `withdrawalService`:
  - `quote(userId, body): Promise<WithdrawalQuoteDto>`
  - `confirm(userId, quoteId, key): Promise<{ withdrawal: WithdrawalDto; created: boolean }>`
  - `get(userId, id): Promise<WithdrawalDto>`
  - `progress(orderId): Promise<void>`, shared by `withdrawal` and `earnings_payout`
  - `onCollectionSettled(t)`, `onReturnSettled(t)`, `onSellSettled(t)`
- Produces, `capacityService.floatAvailable(provider): Promise<bigint>`: the ledger `float` balance minus Σ `usdAmount` of payout orders in `created` or `funds_collected` for that provider
- Produces, handler `payout.progress`; `transferSettledHandlers.payout_collection` and `payout_return`; `tradeSettledHandlers.withdrawal_sell`
- Produces, DTOs:
  - `WithdrawalQuoteDto = { id; ngn_amount; fee_ngn; net_ngn; debit_usdc; rate: RateDto; stock_id: string | null; sell_quantity: string | null; bank_account: BankAccountDto; expires_at }`
  - `WithdrawalDto = { id; kind: 'withdrawal' | 'earnings_payout'; status; hold_reason: string | null; ngn_amount; fee_ngn; net_ngn; debit_usdc; rate: RateDto; bank_account: { bank_name; account_number_masked; resolved_name }; bank_reference: string | null; return_status: 'none' | 'pending' | 'returned'; stock_id: string | null; trade: TradeDto | null; provider; beta: BetaDto; created_at; updated_at }`

Rules. `ngn_amount` is the **gross** naira withdrawn. The user receives `net = gross − fee` ("You receive ₦X"). A `net` of zero or less is 422 `BELOW_MINIMUM`. The USDC debit is `ngnToUsd(gross, sellRate, 'ceil')`.

**`quote`:**
1. `assertOpen('payouts', 'PAYOUTS_PAUSED')`, KYC, and an active bank account.
2. `provider = selectForNewOrder('out')`, then `provider.quote('out', gross)`.
3. Funds check, without reserving:
   - With a stock: `sellQuantity = venue.quoteExactOut(sell, ceil(debitUsdc × (10_000 + maxSlippageBps) / 10_000))`, and the holding must cover it.
   - Without: cash must cover `debitUsdc`.
   - Either shortfall is 409 `INSUFFICIENT_FUNDS`.
4. Persist the quote, expiring after 60 s.

**`confirm`:**
1. Resolve the key `withdrawal:<userId>:<key>`, with `requestHash = sha256Hex(quote_id)`, by the same idempotency rules as deposits.
2. The quote must be owned (404), unexpired (409 `QUOTE_EXPIRED`) and unconsumed (409 `QUOTE_CONSUMED`; also enforced by the unique `quoteId`).
3. `floatAvailable ≥ quote.usdAmount`, or 503 `FLOAT_UNAVAILABLE` plus alert `float.short:<provider>`.
4. In one `withTx`: `assertCanTransact('out')`; reserve, through `createSell` (key `withdrawal-sell:<orderId>`) with a stock or `cashReserved` (key `order:<id>`) without one; insert the order with the quote and destination snapshot; set `consumedAt`; enqueue progress.

**`progress` by status:**

| Status | Action |
| --- | --- |
| `created` | Sell still running → return. Sell `failed` → `failed` with reason `SELL_FAILED`. Sell filled but cash not reserved → `cashReserved` for `debitUsdc` from cash. Then create the `collect:<id>` transfer (`payout_collection`, user → treasury, `debitUsdc`). |
| `funds_collected` | `payouts` paused → hold `paused` plus `RetryableError(…, 600_000)`. Then `findByKey('out', id)`; on `null`, `createPayout({ key: id, maxUsd: usdAmount × (10_000 + fxDriftBps) / 10_000 })`. `rate_moved` → hold `rate_moved` plus `RetryableError(…, 900_000)`. Success → `submitted` with ref and `lockedUsd`, posting `payoutSubmitted(lockedUsd)`. |
| `submitted` | `getTransaction`. `complete` → `paid` with `bankReference`, posting `payoutPaid`. `failed` → `reversed`, posting `payoutRejected`, and create the `return:<id>` transfer (treasury → user, `debitUsdc`; treasury short → hold `treasury_short` and retry). `hold` → hold `needs_review` plus an alert. |
| `reversed` | Create the missing `return:<id>` transfer if it does not exist yet. |

Callbacks:
- **`onCollectionSettled`.** Confirmed → post `payoutCollected` and move to `funds_collected`. Failed → `cashReleased` back to the source (`cash` for withdrawals, `earnings` for earnings payouts) and move to `failed`.
- **`onReturnSettled`.** Confirmed → post `userFunded(to: kind === 'earnings_payout' ? 'earnings' : 'cash')`.

`return_status` is derived: `none` until a return exists, `pending` until it confirms, then `returned`. Unknown or timed-out sends are recovered only through `findByKey`. They are never resubmitted, and never failed over to another provider.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
beforeEach(async () => { setNow('2026-11-13T09:00:00Z'); ada = await makeVerifiedUser('ada_tier2'); await makeBankAccount(ada.id); await walletService.ensureUserWallets(ada.id); await seedFloat('yellowcard', 100_000_000_000n); });
it('quotes gross, fee, net and debit for a ₦5,000 withdrawal', async () => {
  await fundCash(ada.id, 10_000_000n);
  expect(await withdrawalService.quote(ada.id, { ngn_amount: 500_000n })).toMatchObject({ ngn_amount: '500000', fee_ngn: '10000', net_ngn: '490000', debit_usdc: '3225807', expires_at: '2026-11-13T09:01:00.000Z' });
});
it('lets only one of two concurrent withdrawals spend the same cash', async () => {
  await fundCash(ada.id, 10_000_000n);
  const [q1, q2] = await Promise.all([withdrawalService.quote(ada.id, { ngn_amount: 1_085_000n }), withdrawalService.quote(ada.id, { ngn_amount: 1_085_000n })]); // 7_000_000 micro each
  const r = await Promise.allSettled([withdrawalService.confirm(ada.id, q1.id, 'key-aaaa1'), withdrawalService.confirm(ada.id, q2.id, 'key-bbbb2')]);
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: { code: 'INSUFFICIENT_FUNDS' } });
  expect(await ledgerService.balance(acct.userCash(ada.id, 'base'))).toBe(3_000_000n);
});
it('rejects expired and reused quotes', async () => { /* setNow(+61 s) → 409 QUOTE_EXPIRED; consumed quote under a new key → 409 QUOTE_CONSUMED */ });
it('pays out end to end and records the bank reference', async () => { /* confirm + drainJobs → 'paid'; bank_reference set; treasury +3_225_807n; float −lockedUsd */ });
it('does not resubmit a send after a crash following acceptance', async () => {
  /* vi.spyOn(orderService,'transition') rejects once when to === 'submitted' → drainJobs → sim payouts for key = 1; status 'paid' */
});
it('holds instead of sending when the locked rate moved past the cap', async () => { /* simRamp.rateOverride.sell = '1500' at funds_collected → hold 'rate_moved'; sim payouts 0; cash debit unchanged at 3_225_807n */ });
it('reverses a bank rejection and restores cash only after the return confirms', async () => {
  /* bank account '0000000000' → 'reversed'; before return confirms: user pending 3_225_807n, cash 6_774_193n; after: cash 10_000_000n, return_status 'returned' */
});
it('sells the chosen stock first and keeps surplus proceeds as cash', async () => { /* holding 5 shares @ $2; withdraw ₦5,000 with stock_id → sell filled → 'paid'; cash = proceeds − 3_225_807n */ });
it('refuses new withdrawals while payouts are paused but finishes submitted ones', async () => { /* submitted order pays; new quote → 503 PAYOUTS_PAUSED */ });
```

Write the commented cases as full tests with the values given in their comments.

- [ ] **Step 2: Implement the validators, DTO, capacity, service, routes and handlers**

Implement `withdrawal.validator.ts`, `dto.ts`, `capacity.ts`, `withdrawals/index.ts`, the three routes and the handler registrations. The routes use the same middleware sets as deposits; the quote route needs no idempotency key.

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/validators/withdrawal.validator.ts src/backend/services/withdrawals src/backend/services/treasury/capacity.ts src/app/api/v1/withdrawals src/backend/workers/handlers.ts src/types/dto.ts tests/integration/withdrawals.test.ts
git commit -m "feat: deliver quoted withdrawals with safe submission and reversals"
```

### Task 16: Treasury capacity, float rebalancing and opening balances

**Files:**
- Create: `src/backend/services/treasury/settlement.ts`, `src/backend/services/treasury/index.ts`, `tests/integration/treasury.test.ts`
- Modify: `src/backend/services/treasury/capacity.ts`, `src/backend/services/simulator/ramp.ts`, `src/backend/workers/handlers.ts`

**Interfaces:**
- Consumes: `capacityService` (Task 15); `walletService.createTransfer` and `simChain.mint` (Task 11); `simRamp` (Task 8); `rampRegistry`, `alertService` and the posting templates.
- Produces, settlement interface:

  ```ts
  interface SettlementProvider {
    readonly mode: ProviderMode;
    topUpAddress(provider: ProviderId, chain: Chain): Promise<string>;
    confirmTopUp(i: { key: string; provider: ProviderId; chain: Chain; usdc: bigint; txHash: string }): Promise<{ state: 'pending' | 'complete' | 'failed'; usdCredited: bigint | null }>;
    requestWithdrawal(i: { key: string; provider: ProviderId; chain: Chain; usd: bigint; address: string }): Promise<{ ref: string }>;
    getWithdrawal(key: string): Promise<{ state: 'pending' | 'complete' | 'failed'; usdcSent: bigint | null; txHash: string | null }>;
  }
  ```

- Produces:
  - `simulatedSettlement`
  - `capacityService.treasuryAvailable(chain): Promise<bigint>`
  - `treasuryService.rebalance(at: Date): Promise<TreasuryOperation[]>`
  - `treasuryService.ensureFloat(provider: ProviderId, requiredUsd: bigint): Promise<TreasuryOperation | null>`
  - `treasuryService.progressOperation(opId: string): Promise<void>`
  - `treasuryService.seedOpeningBalances(i: { treasuryMicroUsdc: Record<Chain, bigint>; floatMicroUsd: bigint }): Promise<void>`
  - handlers `treasury.rebalance` and `treasury.progress`; `transferSettledHandlers.float_topup`

Simulated settlement:
- The top-up address is deterministic per provider and chain.
- `confirmTopUp` completes once the simulated chain transaction is confirmed. It records a `settlement_in` row 1:1.
- `requestWithdrawal` records `settlement_out`. After the settle delay it mints a simulated chain transaction to the treasury address.

**Rebalancing.** For every `partner_float` provider:
- In Yellow Card `sandbox` mode, raise alert `treasury.manual_rebalance_required:<provider>` with the amount and do nothing else, because sandbox settlement transport is out of scope.
- Above `ceiling`, withdraw `balance − target` to `treasury(defaultChain)`.
- Below `floor`, top up `target − balance`, capped by `treasuryAvailable`.

Insert the operation with key `rebalance:<provider>:<lagos hour slot>`. A partial-unique violation means an operation is already active, so skip.

**`ensureFloat`** tops up `required − floatAvailable + topUpMargin` when there is a shortfall. Direct-chain providers are never topped up.

**Top-up lifecycle:**
1. `planned` → `createTransfer({ key: 'topup:<op>', purpose: 'float_topup', from: treasury, to: external(topUpAddress) })`, then `transferring`.
2. Transfer settled → `awaiting_provider`.
3. `confirmTopUp` complete → post `floatToppedUp` and mark `complete`.

**Withdrawal lifecycle:**
1. `planned` → `requestWithdrawal` and post `floatWithdrawalRequested`, then `awaiting_provider`.
2. Complete with a confirmed chain transaction → post `floatWithdrawalReceived` and mark `complete`.

**`seedOpeningBalances`** is idempotent, through `opening:<code>` keys. In simulated mode it mints simulated chain USDC to each treasury address and seeds the simulated float. In sandbox mode it reads `floatBalance()` and posts an opening journal for it.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('counts open payouts against float capacity', async () => { /* seedFloat 100 USD; payout order usd 30 USD in 'created' → floatAvailable 70_000_000n */ });
it('tops up a float below its floor and posts on provider confirmation', async () => {
  setNow('2026-11-13T09:30:00Z'); await seedTreasury('base', 50_000_000_000n); await seedFloat('yellowcard', 1_000_000_000n);
  const [op] = await treasuryService.rebalance(now()); await drainJobs();
  expect(await db.treasuryOperation.findUniqueOrThrow({ where: { id: op!.id } })).toMatchObject({ kind: 'float_topup', status: 'complete', amountUsd: 9_000_000_000n });
  expect(await ledgerService.balance(acct.float('yellowcard'))).toBe(10_000_000_000n);
  expect(await ledgerService.balance(acct.treasury('base'))).toBe(41_000_000_000n);
});
it('withdraws excess float above the ceiling into the treasury', async () => { /* float 25,000 USD → withdrawal 15,000 USD; treasury +15_000_000_000n after drain */ });
it('keeps one active rebalance per provider under parallel runs', async () => { /* Promise.all([rebalance, rebalance]) → treasury_operations 1 */ });
it('alerts instead of acting while Yellow Card runs in sandbox', async () => { /* register sandbox-mode provider stub → rebalance → [] and one open 'treasury.manual_rebalance_required:yellowcard' alert */ });
it('tops up exactly the shortfall plus margin for a known requirement', async () => { /* ensureFloat(yellowcard, 12,000 USD) with available 10,000 → top-up 3,000 USD */ });
```

Write the commented cases as full tests with the values given in their comments.

- [ ] **Step 2: Implement settlement, the service, capacity and the handlers**

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/treasury src/backend/services/simulator/ramp.ts src/backend/workers/handlers.ts tests/integration/treasury.test.ts
git commit -m "feat: rebalance partner float against per-chain treasury"
```

### Task 17: Test earnings, preferences and the Friday payout batch

**Files:**
- Create: `src/backend/services/earnings/source.ts`, `src/backend/services/earnings/index.ts`, `src/backend/services/earnings/batch.ts`, `src/backend/validators/earnings.validator.ts`, `src/app/api/v1/earnings/route.ts`, `src/app/api/v1/earnings/preference/route.ts`, `tests/integration/earnings.test.ts`, `tests/integration/friday-batch.test.ts`
- Modify: `src/backend/services/withdrawals/index.ts` (worker-only `createEarningsPayout`), `src/backend/services/users/index.ts`, `src/backend/workers/handlers.ts`, `src/types/dto.ts`

**Interfaces:**
- Consumes: `tradeService.createBuy` (Task 13); `withdrawalService.progress` and `capacityService.floatAvailable` (Task 15); `treasuryService.ensureFloat` (Task 16); `lagosWeek` (Task 6).
- Produces, earnings source: `interface EarningsSource { readonly mode: ProviderMode; harvest(i: { userId: string; stock: Stock; quantity: bigint; week: string }): Promise<bigint> }`. The simulated source returns `floor(quantity × stock.simWeeklyEarningMicroPerShare / 10^decimals)`.
- Produces, `earningsService`:
  - `harvest(week: string): Promise<{ recorded: number }>`
  - `list(userId, query: { page: number; size: number }): Promise<PaginatedApiResponse<EarningsWeekDto[]>>`
  - `setPreference(userId, body: { mode: 'payout' | 'reinvest'; stock_id?: string }): Promise<EarningsPreferenceDto>`
- Produces, `earningsBatchService`:
  - `precheck(week: string): Promise<{ requiredUsd: bigint; floatAvailable: bigint }>`
  - `runBatch(week: string, at: Date): Promise<BatchResult>`, where `BatchResult = { paid: number; reinvested: number; rolledOver: number; skipped: Record<'needs_choice' | 'kyc' | 'bank_account' | 'limit' | 'paused', number>; stoppedForFloat: boolean }`
- Produces, `withdrawalService.createEarningsPayout(tx: Tx, i: { userId: string; week: string; earningIds: string[]; amountUsdc: bigint; quote: Quote }): Promise<RampOrder>`
- Produces, handlers `earnings.harvest`, `earnings.float_precheck` and `earnings.payout_batch`; `tradeSettledHandlers.reinvest`
- Produces, DTOs:
  - `EarningsWeekDto = { week; earned_usdc; paid_usdc; reinvested_usdc; pending_usdc; ngn_value: string | null; status: 'pending' | 'paid' | 'reinvested' | 'mixed' }`
  - `EarningsPreferenceDto = { mode: 'unset' | 'payout' | 'reinvest'; stock_id: string | null; minimum_payout_ngn: '200000'; payout_fee_ngn: string | null }`

**`harvest(week)`.** For each user stock account with a positive balance (reserved quantities excluded), insert an `Earning` for `(userId, stockId, week)` and post `earningHarvested`, in one transaction. A `P2002` on the insert means the earning already exists, so skip it. Idle cash never earns. Earnings are labelled test proceeds; they never claim to be real yield.

**`runBatch(week, at)`:**
1. `payouts` paused → count everyone as `paused` and return.
2. Candidates are users with earnings where `payoutOrderId` and `reinvestTradeId` are null and `week ≤ W`. Order them by `MIN(harvestedAt)`, then `userId`, and process them sequentially.
3. Per candidate:

| Preference or check | Action |
| --- | --- |
| `unset` | Skip with `needs_choice`. |
| `reinvest` | `createBuy({ key: 'reinvest:<userId>:<W>', fundsSource: 'earnings', purpose: 'reinvest', amountIn: total })` and link the earnings to the trade. A reinvest pays no payout fee. |
| `payout`, but KYC, bank account or limits fail | Skip with that reason. |
| `payout`, gross below minimum | Quote `gross = usdToNgn(total, sell, 'floor')`. Below `policy.earnings.minPayoutKobo`: roll over, leaving the rows unlinked. |
| `payout`, float too low | `floatAvailable < quote.usdAmount` → set `stoppedForFloat`, raise alert `float.short:friday:<W>` and **stop**. Strict oldest-first: newer users are never paid ahead. |
| `payout`, eligible | `createEarningsPayout` with key `earnings:<userId>:<W>`. It reserves `debitUsdc = ngnToUsd(gross, sell, 'ceil')` from earnings into reserved, links the rows' `payoutOrderId`, and enqueues `payout.progress`. A `P2002` on the key means this user is already done this week. |

Unwinding:
- A payout that fails before collection releases back to `earnings` and unlinks its rows.
- A reversed payout returns funds to `earnings` (Task 15's `onReturnSettled`) and unlinks its rows, so the next Friday picks them up.
- A failed reinvest releases to `earnings` and clears `reinvestTradeId`.

**`precheck(week)`** sums the projected `usdAmount` of eligible payout users and calls `treasuryService.ensureFloat`.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
// TSTA: decimals 6, simWeeklyEarningMicroPerShare 200_000n; 5 shares = 5_000_000 units → 1_000_000n micro-USDC per week
it('records one entitlement per position-week across concurrent harvests', async () => {
  await Promise.all([earningsService.harvest('2026-11-09'), earningsService.harvest('2026-11-09')]);
  expect(await db.earning.findMany({ where: { userId: holder.id } })).toEqual([expect.objectContaining({ amountUsdc: 1_000_000n, week: '2026-11-09' })]);
  expect(await ledgerService.balance(acct.userEarnings(holder.id, 'base'))).toBe(1_000_000n);
});
it('never earns on idle cash and keeps positions separate', async () => { /* cash-only user → 0 rows; holder of TSTA and TSTB → 2 rows */ });
it('rolls over below ₦2,000 and pays once the sum qualifies under one weekly key', async () => {
  // week 1: 1_290_322n → gross 199_999 kobo → rolled over; week 2: +1n → 1_290_323n → gross 200_000 → paid
  expect(r1.rolledOver).toBe(1); expect((await db.earning.findFirstOrThrow()).payoutOrderId).toBeNull();
  expect(r2.paid).toBe(1);
  expect(await db.rampOrder.findMany({ where: { kind: 'earnings_payout' } })).toEqual([expect.objectContaining({ idempotencyKey: `earnings:${user.id}:2026-11-16`, ngnAmount: 200_000n })]);
  expect(await db.earning.count({ where: { payoutOrderId: { not: null } } })).toBe(2);
});
it('creates one payout per user per week under two concurrent batch runs', async () => { /* Promise.all runBatch ×2 → earnings_payout orders 1 */ });
it('resumes a crashed batch without paying anyone twice', async () => { /* 5 eligible users; createEarningsPayout throws on the 4th call; rerun → 5 orders, one per user */ });
it('stops at the first unfundable payout and keeps oldest-first order', async () => { /* float covers 2 of 3 → oldest two orders, stoppedForFloat true, one open alert; seedFloat + rerun → third paid */ });
it('reinvests without a fee, and a reverted reinvest stays pending', async () => { /* reinvest pref → trade 'reinvest'; with swap fault → earnings balance restored, reinvestTradeId null */ });
it('skips users who have not chosen without touching their earnings', async () => { /* unset → skipped.needs_choice 1; rows unchanged */ });
it('pays from the Friday 08:00 Lagos schedule', async () => { /* setNow('2026-11-13T07:00:00Z'); scheduler.tick → job earnings.payout_batch:2026-11-09 */ });
it('tops up the float on Thursday when the batch would exceed it', async () => { /* precheck with float < required → one float_topup operation */ });
// earnings.test.ts also covers list(): weeks newest first with earned/paid/pending sums, page/size totals,
// and setPreference: 'reinvest' requires an enabled stock_id (422 otherwise); 'payout' with stock_id → 422.
```

Write each commented case as a full test with the values given. Arrange each test with `makeVerifiedUser`, `makeBankAccount`, `makeStock`, `fundCash` and a trade fill, or with `openingBalance` journals for stock.

- [ ] **Step 2: Implement the source, services, routes, handlers and `me` preference**

- `GET /earnings` runs `[authMiddleware, queryValidatorMiddleware(paginationQuerySchema)]` and returns `paginated`, with typed `groupBy` + count in `Promise.all`.
- `PUT /earnings/preference` runs `[authMiddleware, originMiddleware, bodyValidatorMiddleware]`. Its `payout_fee_ngn` comes from a quote of the minimum payout; on provider failure it is `null`.
- `userService.me` now returns the preference.

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/earnings src/backend/validators/earnings.validator.ts src/app/api/v1/earnings src/backend/services/withdrawals/index.ts src/backend/services/users src/backend/workers/handlers.ts src/types/dto.ts tests/integration/earnings.test.ts tests/integration/friday-batch.test.ts
git commit -m "feat: harvest test earnings and run recoverable Friday payouts"
```

## Phase D — Operations and resilience

### Task 18: Reconciliation and the operations API

**Files:**
- Create: `src/backend/services/reconciliation/index.ts`, `src/backend/services/operations/index.ts`, `src/backend/validators/ops.validator.ts`, `src/app/api/v1/ops/status/route.ts`, `src/app/api/v1/ops/controls/route.ts`, `src/app/api/v1/ops/jobs/[id]/retry/route.ts`, `src/app/api/v1/ops/orders/[id]/refund/route.ts`, `src/app/api/v1/ops/transfers/[id]/approve/route.ts`, `scripts/grant-operator.ts`, `tests/integration/reconciliation.test.ts`, `tests/integration/operations.test.ts`
- Modify: `src/backend/workers/handlers.ts`, `src/types/dto.ts`

**Interfaces:**
- Consumes: `controlsService`, `alertService`, `jobService.retryDead`, `walletService.approveTransfer`, `depositService.requestRefund`, `pollOpenWork`, and the ledger and providers.
- Produces:
  - `reconciliationService.run(asOf: Date): Promise<ReconciliationRun>`; each `results[]` item is `{ check: string; expected: string; observed: string | null; delta: string | null; threshold: string; status: 'ok' | 'breach' | 'unavailable' }`
  - `operationsService.status(): Promise<OpsStatusDto>`
  - `operationsService.setControl(actorId, { scope, paused, reason }): Promise<ControlDto>`
  - `operationsService.retryJob(actorId, jobId): Promise<void>` (409 `NOT_DEAD` unless the job is `dead`)
  - `operationsService.refundHeldDeposit(actorId, orderId): Promise<void>` (only for holds `missing_sender` or `needs_review`, otherwise 409)
  - `operationsService.approveTransfer(actorId, transferId): Promise<TransferDto>`
  - handler `reconcile.run`
  - script `yarn tsx --env-file-if-exists=.env scripts/grant-operator.ts +2340000000001`
  - `OpsStatusDto = { controls: ControlDto[]; open_alerts: { id; kind; severity; message; created_at }[]; dead_jobs: number; oldest_pending_job_age_seconds: number | null; awaiting_approval_transfers: number; last_reconciliation: { id; as_of; status } | null }`

**Reconciliation checks:**
- Each `partner_float` provider: ledger `float` against `provider.floatBalance()`.
- Each chain: ledger `treasury + treasuryOutbound` against `walletProvider.balance(treasuryAddress, usdc)`.

**Breach handling:**
1. A check breaches when `|observed − expected| > policy.recon.thresholdMicro`.
2. On a breach, first run `pollOpenWork` and `drain` each affected order's progress inline once. Recompute once; a difference explained by in-flight work is timing, not a breach.
3. If it still breaches, set the run `breached`, pause `payouts` with reason `reconciliation:<runId>`, and raise a critical alert `recon.breach:<check>`.
4. A failed external read sets the run `incomplete` and pauses payouts. Never report a zero delta for a read that failed.

**Controls.** Resuming payouts requires `reason.length ≥ 10`. Pausing payouts never stops callbacks, `submitted` refreshes, reversal returns, portfolio reads or sells.

Every ops route runs `[authMiddleware, operatorMiddleware, originMiddleware for mutations, validators]`.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('passes when ledger and external balances agree', async () => { /* seedOpeningBalances → run → status 'balanced', every result 'ok' */ });
it('pauses payouts once on an unexplained breach', async () => {
  await simRamp.seedFloat('yellowcard', 5_000_000n); // external grows, ledger does not
  const r1 = await reconciliationService.run(now()); const r2 = await reconciliationService.run(now());
  expect([r1.status, r2.status]).toEqual(['breached', 'breached']);
  expect(await controlsService.isPaused('payouts')).toBe(true);
  expect(await db.operationalAlert.count({ where: { kind: 'recon.breach', resolvedAt: null } })).toBe(1);
});
it('treats an unprocessed completed deposit as timing, not a breach', async () => { /* collection paid at provider, order still awaiting → run → 'balanced' after inline refresh */ });
it('reports incomplete and holds payouts when a balance read fails', async () => { /* floatBalance throws → 'incomplete', result 'unavailable', observed null; payouts paused */ });
it('requires a reason to resume payouts and records the operator', async () => { /* reason 'ok' → 422; ≥ 10 chars → paused false, updatedById = operator */ });
it('denies non-operators', async () => { /* plain user GET /ops/status → 403 */ });
it('retries only dead jobs', async () => { /* pending job → 409 NOT_DEAD; dead → pending with attempts 0 */ });
```

Write the commented cases as full tests with the assertions given.

- [ ] **Step 2: Implement reconciliation, operations, the routes, the script and the handler**

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/reconciliation src/backend/services/operations src/backend/validators/ops.validator.ts src/app/api/v1/ops scripts/grant-operator.ts src/backend/workers/handlers.ts src/types/dto.ts tests/integration/reconciliation.test.ts tests/integration/operations.test.ts
git commit -m "feat: reconcile float and treasury and expose audited operator controls"
```

### Task 19: Simulated Paycrest direct settlement and pinned failover

**Files:**
- Create: `src/backend/services/ramp/paycrest/index.ts`, `src/backend/services/ramp/paycrest/webhook.ts`, `src/backend/services/ramp/health.ts`, `src/app/api/v1/webhooks/paycrest/route.ts`, `tests/integration/paycrest.test.ts`, `tests/integration/failover.test.ts`
- Modify: `src/backend/services/ramp/index.ts`, `src/backend/services/ramp/simulated.ts`, `src/backend/services/deposits/index.ts`, `src/backend/services/withdrawals/index.ts`, `src/backend/services/webhooks/index.ts`, `src/backend/workers/handlers.ts`

**Interfaces:**
- Consumes: `RampProvider` (Task 8); `walletService.observeIncoming` and `createTransfer` (Task 11); the deposit and withdrawal progress functions (Tasks 14–15).
- Produces:
  - `createSimulatedRampProvider('paycrest')`, with `settlementModel: 'direct_chain'` and `mode: 'simulated'`
  - `verifyPaycrestSignature(headers: Headers, raw: Uint8Array, secret: string): boolean`, an HMAC-SHA256 **hex** digest in `X-Paycrest-Signature`
  - `providerHealth.record(provider: ProviderId, ok: boolean, at: Date): Promise<void>`
  - `providerHealth.isOpen(provider, at): Promise<boolean>`
  - `selectForNewOrder` failover: the first of `['yellowcard', 'paycrest']` whose control `provider:<id>` is not paused and whose circuit is closed, otherwise 503 `RAIL_UNAVAILABLE`
  - `transferSettledHandlers.direct_payout_funding`

**Paycrest simulator** (no HTTP client exists anywhere for Paycrest):

| Operation | Behaviour |
| --- | --- |
| Quote | `policy.sim.paycrest` rates; fee 0; below `500_000n` micro-USD → `rejected 'BELOW_PROVIDER_MINIMUM'` |
| On-ramp | `createCollection` requires a `recipient`. Once paid, it mints a simulated chain transaction from the Paycrest simulated address to the recipient and reports `chainSettlement`. It is `complete` only after that transaction is confirmed. |
| Off-ramp | `createPayout` returns `funding: { kind: 'chain', address: <deterministic per key>, amount: usdc }` and stays pending until a confirmed transfer of at least that amount reaches the address. It then completes, or for destination `0000000000` becomes `refunded`, minting the USDC back to the user's wallet. |
| Webhook | Event key `${data.id}:${data.status}`. |

**Deposit branch (`direct_chain`).** On `complete`, check `observeIncoming(chain, txHash, { to: userWallet, amount })`:
- `confirmed` → post `depositReceivedDirect`, then move `awaiting_transfer → received → funded` in one transaction. Make **no** treasury transfer. Continue with a buy or settle.
- `mismatch` → hold `needs_review` plus an alert.
- `pending` → wait.

**Withdrawal branch (`direct_chain`).**
1. In `created`, call `createPayout` first. Store `providerRef`, `fundingAddress` and `fundingAmount`.
2. Create the `collect:<id>` transfer with purpose `direct_payout_funding` to that exact address and amount. On confirmation, post `directPayoutCollected` and move to `funds_collected`.
3. The provider reporting processing → `submitted`; `complete` → `paid`; `refunded` with an observed return → post `directPayoutRefunded` and move to `reversed`.

No float journal is ever posted for Paycrest.

**Health.** Wrap the provider methods `quote`, `createCollection` and `createPayout` in the registry so each outcome is recorded. The circuit opens after 5 consecutive failures, for 300 s. Existing orders always use `forOrder`.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('credits a Paycrest on-ramp from the verified chain transfer without treasury funding', async () => {
  /* deposit via paycrest → markCollectionPaid → drainJobs → status 'settled'; chain_transfers with purpose 'deposit_funding' = 0;
     journals deposit:<id>:received = 1; user cash = settled USDC */
});
it('does not credit an unconfirmed or misdirected settlement', async () => { /* sim chain tx to another address → hold 'needs_review'; journals 0 */ });
it('funds exactly the bound receive address once for an off-ramp', async () => { /* withdrawal via paycrest → 1 transfer to fundingAddress; a transfer spec to any other address throws PolicyViolation 'POLICY' */ });
it('returns a refunded off-ramp to the wallet without touching any float', async () => { /* destination 0000000000 → 'reversed'; cash restored; journals with key prefix 'payout:<id>:submitted' = 0 */ });
it('rejects an altered Paycrest webhook body', () => {
  const raw = '{"event":"payment_order.settled","data":{"id":"po_1","status":"settled"}}';
  const h = new Headers({ 'X-Paycrest-Signature': 'cb53f5c60ca188b8ff1e57f1ce5f67e0b4774e45213b676ceb4f115dd312d329' });
  expect(verifyPaycrestSignature(h, Buffer.from(raw), 'paycrest-test-secret')).toBe(true);
  expect(verifyPaycrestSignature(h, Buffer.from(raw.replace('po_1', 'po_2')), 'paycrest-test-secret')).toBe(false);
});
// tests/integration/failover.test.ts
it('sends new orders to Paycrest while the Yellow Card circuit is open and keeps open orders pinned', async () => {
  /* five failed YC createCollection calls → new deposit provider 'paycrest'; an existing YC awaiting order still calls the YC provider (spy) */
});
it('answers 503 when no provider is eligible', async () => { /* pause provider:yellowcard and provider:paycrest → POST /deposits 503 RAIL_UNAVAILABLE */ });
it('never makes a network request for Paycrest', async () => { /* run the full Paycrest suite; expect(vi.mocked(fetch)).not.toHaveBeenCalled() */ });
```

Write the commented cases as full tests with the assertions given.

- [ ] **Step 2: Implement the simulator branch, webhook verification, health, failover and the domain branches**

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/ramp src/backend/services/deposits src/backend/services/withdrawals src/backend/services/webhooks src/app/api/v1/webhooks/paycrest src/backend/workers/handlers.ts tests/integration/paycrest.test.ts tests/integration/failover.test.ts
git commit -m "feat: simulate Paycrest direct settlement with provider-pinned failover"
```

### Task 20: Live order events and beta scenario controls

**Files:**
- Create: `src/backend/services/events/index.ts`, `src/app/api/v1/events/route.ts`, `src/backend/services/scenarios/index.ts`, `src/backend/validators/scenario.validator.ts`, `src/app/api/v1/beta/scenarios/route.ts`, `tests/integration/events.test.ts`, `tests/integration/scenarios.test.ts`
- Modify: `src/types/dto.ts`

**Interfaces:**
- Produces, events:
  - `eventService.list(userId: string, afterSeq: bigint, limit = 100): Promise<UserEventDto[]>`, where `UserEventDto = { id: string; type: string; subject_id: string; status: string | null; created_at: string }`
  - `GET /api/v1/events`: a `text/event-stream` with `export const dynamic = 'force-dynamic'`, resuming from `Last-Event-ID` or `?after=`
- Produces, scenarios:
  - `scenarioBodySchema = z.object({ order_id: cuidSchema, scenario: z.enum(['deposit_paid', 'deposit_paid_third_party', 'deposit_paid_amount', 'deposit_failed', 'payout_rejected', 'buy_reverts']), ngn_amount: minorAmountSchema.optional() }).strict()`; `ngn_amount` is required iff the scenario is `deposit_paid_amount`
  - `scenarioService.run(userId, input): Promise<{ order_id: string; scenario: string }>`

**SSE stream:**
- Every 2 s, re-check the session and send any new events as `id:`/`event:`/`data:` frames.
- Send a `: heartbeat` comment every 15 s.
- Close after 300 s, or when the session disappears.
- No financial work ever runs in the stream.

**Scenarios.** The order must be owned (404) and `providerMode === 'simulated'`; a sandbox order is 409 `SCENARIO_UNAVAILABLE`. The order's state must fit the scenario, or 409 `INVALID_SCENARIO_STATE`.

| Scenario | Simulator action |
| --- | --- |
| `deposit_paid` | `markCollectionPaid` with the user's verified name |
| `deposit_paid_third_party` | `markCollectionPaid` with `'CHINEDU EZE'` |
| `deposit_paid_amount` | `markCollectionPaid` with the given amount |
| `deposit_failed` | `markCollectionFailed` |
| `payout_rejected` | `addFault('payout', orderId)` |
| `buy_reverts` | `simVenue.addFault('swap', 'deposit-buy:<orderId>')` |

After any scenario, enqueue the order's progress job. Scenarios never import the ledger and never touch an order row.

The route runs `[authMiddleware, originMiddleware, bodyValidatorMiddleware(scenarioBodySchema)]`.

- [ ] **Step 1: Write the failing tests**

```ts
useTestDatabase();
it('replays only the caller\'s events after Last-Event-ID', async () => {
  /* events seq 1,2 for A and 3 for B → eventService.list(A, 1n) → [seq 2]; expect(list(B, 0n).filter(e => e.subject_id === aOrder.id)).toEqual([]) */
});
it('streams events and closes when the session is revoked', async () => { /* read first frame 'id: 1'; authService.logout → stream ends within one poll */ });
it('completes a simulated deposit end to end through the scenario API', async () => { /* deposit → POST scenario deposit_paid → ledger journals 0 immediately → drainJobs → 'settled' */ });
it('refuses scenarios on other users\' orders and on sandbox orders', async () => { /* 404; sandbox order → 409 SCENARIO_UNAVAILABLE */ });
it('rejects deposit_paid_amount without an amount', async () => { /* 422 VALIDATION_FAILED */ });
```

Write the commented cases as full tests with the assertions given.

- [ ] **Step 2: Implement the event service, the SSE route, the scenario service and its route**

- [ ] **Step 3: Review the diff against Step 1, then commit**

```bash
git add src/backend/services/events src/backend/services/scenarios src/backend/validators/scenario.validator.ts src/app/api/v1/events src/app/api/v1/beta/scenarios src/types/dto.ts tests/integration/events.test.ts tests/integration/scenarios.test.ts
git commit -m "feat: stream order events and add user-scoped beta scenarios"
```

## Phase E — Verification

### Task 21: Seed, runbook, containment suite and the full gate

**Files:**
- Create: `scripts/seed-beta.ts`, `docs/runbooks/backend-beta.md`, `tests/integration/beta-containment.test.ts`, `tests/integration/journey.test.ts`
- Modify: `README.md` (backend commands), `.env.example` (final), `BACKEND_PATTERNS.md` (any drift found while implementing)

**Interfaces:**
- Consumes: everything above.

**Seed script** (idempotent; run with `yarn seed:beta`):
1. `assertBetaRuntime(process.env)`.
2. `walletService.ensureTreasuryWallets()`.
3. `treasuryService.seedOpeningBalances({ treasuryMicroUsdc: { base: 100_000_000_000n, solana: 0n }, floatMicroUsd: 10_000_000_000n })`.
4. `stockService.upsertCatalog`, with two fictional simulated stocks on Base:
   - `TSTA` "Test Stock A (simulated)": $2.00, 6 decimals, weekly `200_000n` micro per share.
   - `TSTB` "Test Stock B (simulated)": $5.00, 6 decimals, weekly `250_000n`.

**Runbook** (`docs/runbooks/backend-beta.md`):
- Processes: `yarn dev` or `yarn start`, plus `yarn worker`.
- Every schedule, in Lagos time.
- Seed and operator grant.
- Ops endpoints, and the procedures for pause, resume, dead-job retry, held-deposit refund and quorum approval.
- Recovery: restart the worker, then re-arm jobs with an `orders` poll.
- Every *placeholder* row of the Decisions table, plus the *Deferred Design Items* below, as open decisions with owners: product, compliance, treasury, partners.
- The `yc_sandbox` persona note from Task 9.

- [ ] **Step 1: Write the containment and journey tests**

```ts
// tests/integration/beta-containment.test.ts
it('runs every flow without a live network request or a non-beta mode', async () => {
  await runFullScenarioSuite(); // the journey below plus Paycrest failover, payout rejection and a Friday batch
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  for (const table of ['rampOrder', 'chainTransfer', 'tradeOrder', 'bankAccount', 'treasuryOperation', 'webhookEvent'] as const)
    expect(await (db[table] as any).count({ where: { providerMode: { notIn: ['sandbox', 'simulated'] } } })).toBe(0);
  expect(Object.values(integrationModes()).every((m) => m === 'simulated' || m === 'sandbox')).toBe(true);
});
it('refuses to start the worker outside beta', () => { expect(() => assertBetaRuntime({ APP_STAGE: 'prod' })).toThrow(BetaPolicyError); });
// tests/integration/journey.test.ts — through the route handlers only, then drainJobs between steps:
// identity-token → session → verification(ada_tier2) → bank-accounts(0123456789) → deposits(₦20,000, TSTA) → scenarios(deposit_paid)
// → portfolio shows TSTA holding and value_ngn → withdrawals/quote(₦5,000) → withdrawals → 'paid' with bank_reference
// → harvest(week) → preference(payout) → Friday batch → earnings week status 'paid' or 'pending' (rolled over), never both.
```

`runFullScenarioSuite` is a local helper that reuses the journey steps. `journey.test.ts` writes each arrow above as one awaited step, with a status assertion after it.

- [ ] **Step 2: Write the seed script, the runbook, README and `.env.example`**

- [ ] **Step 3: Run the full gate once, in this order**

Use a disposable PostgreSQL whose database name ends in `_test` as `TEST_DATABASE_URL`.

```bash
yarn install --frozen-lockfile
yarn prisma validate
yarn prisma generate
yarn typecheck
yarn test
yarn lint
yarn build
```

Expected: every command exits 0.

`yarn test` reports every test in `tests/unit`, `tests/contracts` and `tests/integration` as passed. It also proves zero live requests (fetch is stubbed globally) and the containment suite.

Then smoke-test the built app against a local beta database that has migrations applied and has been seeded:

```bash
yarn prisma migrate deploy && yarn seed:beta
yarn start & yarn worker &
curl -s localhost:3000/v1/rates/ngn
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/webhooks/yellowcard
```

Expected: the first `curl` prints `{"status":200,…,"deposit_rate":{"kobo":"4","micro_usd":"25","ngn_per_usd":"1600.00"}…}`, which shows the rewrite works. The second prints `404`, because webhooks are disabled while Yellow Card is simulated.

- [ ] **Step 4: Fix what the gate finds**

This is the first gate run (CLAUDE.md), so expect accumulated breakage:
- Fix each failure in its owning task's files.
- Re-run the failing command and every command after it in the Step 3 order.
- Commit each fix as `fix(<area>): <what>`.
- Do not mark this task done until Step 3 passes in full, and report the actual command output.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-beta.ts docs/runbooks/backend-beta.md tests/integration/beta-containment.test.ts tests/integration/journey.test.ts README.md .env.example BACKEND_PATTERNS.md
git commit -m "test: verify beta containment and the end-to-end backend journey"
```

## Deferred Design Items (not built by this plan)

| Design item | Why deferred | Unblocked by |
| --- | --- | --- |
| All pages, components, hooks, RSC wrappers, page guards, `DESIGN_SYSTEM.md` | User instruction 2026-11-13: backend/API only for now | Frontend plan consuming `src/types/dto.ts` |
| Privy identity, embedded wallets, server signers, policies, sponsorship, key export | AGENTS.md: Privy only with *verified* isolated test configuration; none exists, so `identity` and `wallets` are simulated with Privy-shaped interfaces | Recorded isolation evidence, then `IdentityVerifier`/`WalletProvider` Privy adapters |
| Solana-funded user balances, multi-chain withdrawals, native-USDC burn-and-mint bridging | Beta user funds live on Base; Solana wallets are provisioned and the treasury has a Solana account, but nothing needs cross-chain moves yet | A Solana-listed stock; then per-chain allocation in withdrawals plus a bridge `SettlementProvider` |
| Yellow Card sandbox settlement (float top-up and withdrawal transport) | Sandbox settlement behaviour is undocumented in the pages checked; the rebalancer alerts instead | Verified sandbox settlement contract |
| Real KYC/BVN vendor and wallet-screening vendor | No vendor named in Design.md; beta forbids real identity data | Vendor choice and sandbox |
| Permanent virtual account numbers ("Returning users") | Per-order bank details come first | Partner terms (Design open question) |
| Yellow Card travel-information callback | Documented for custody sends, which this design does not use | Partner confirmation |
| Gas expense postings | Gas is recorded on `chain_transfers` only | Accounting decision |
| V3ST margin posting to a fees account | Design says "if any"; no margin is set | Pricing decision |
| Live release, paging integrations, real notifications | Beta-only scope | A separate future release plan |

## Spec Coverage

| Design.md requirement | Tasks |
| --- | --- |
| Partner performs every naira movement; Yellow Card primary with sandbox; Paycrest secondary | 8, 9, 14, 15, 19 |
| Ramp adapter interface (quote, collect, refund, resolve, pay out, get, float, verify webhook) | 8, 9, 19 |
| Double-entry ledger; integer units; read-time naira; source of truth | 2, 4, 5, 13 |
| Order states and atomic transitions; idempotency keys; unique webhook events | 4, 7, 9, 14, 15 |
| On-ramp steps 1–9: quote, locked rate, bank details, own-name check, refund, webhook re-fetch, treasury fronting, optional buy | 14, 13, 11 |
| Off-ramp: verified destination, quote with fee, optional sell, collection, send, paid reference, reversal | 12, 15, 13 |
| Friday payout: Thursday harvest and check, Lagos Friday, minimum, rollover, reinvest, one key per user per week | 6, 16, 17 |
| FX, fees, slippage, margin rule, gas | 2, 8, 13, 15; margin and gas recorded as deferred |
| Float and treasury rebalancing hourly; Thursday precheck | 16, 17 |
| Failure handling table: expiry, wrong amount, third party, missed webhook, duplicates, treasury short, swap failure, bank rejection, partner outage, Friday float | 14, 15, 13, 9, 6, 19, 17 |
| Nightly reconciliation; threshold breach pages and pauses payouts | 18 |
| Limits by KYC tier and partner; Travel Rule at $1,000 | 12 |
| Compliance controls: name and BVN match, screening, deposits-paused state that never blocks selling or viewing | 12, 11, 14, 13, 18 |
| API surface (deposits, bank accounts, withdrawals quote and confirm, earnings, preference, rates) and webhooks | 8, 9, 12, 14, 15, 17, 19 |
| Push updates | 20 |
| Wallets: one EVM and one Solana per user at sign-up, server-signer policy limits, treasury quorum | 10, 11 (simulated; Privy deferred) |
