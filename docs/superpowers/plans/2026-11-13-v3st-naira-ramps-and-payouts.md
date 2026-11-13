# V3ST Naira Ramps and Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the full-stack Nigerian deposit-to-shares, withdrawal, and Friday earnings experience described in `Design.md`, with recoverable money movement and an auditable ledger.

**Architecture:** Keep the Next.js App Router as the web/API boundary, singleton domain services as the only database access layer, and PostgreSQL as the ledger and workflow source of truth. Run external effects through a durable PostgreSQL job/outbox worker; distinguish Yellow Card float settlement from Paycrest direct settlement on each immutable order. Build the customer pages alongside their services and routes.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 4, Prisma 6/PostgreSQL, Zod 3, TanStack Query 5, Axios 1, React Hook Form 7, shadcn/ui with unified Radix, Phosphor icons, Privy, Yellow Card, Paycrest, Vitest, Playwright.

**Spec:** [Design.md](../../../Design.md), [BACKEND_PATTERNS.md](../../../BACKEND_PATTERNS.md); additional repository constraints: [CLAUDE.md](../../../CLAUDE.md), [FRONTEND_PATTERNS_GUIDE.md](../../../FRONTEND_PATTERNS_GUIDE.md).

## Global Constraints

- “V3ST never touches naira itself.” Every naira collection, conversion, refund, and bank payout goes through a partner.
- “A double-entry ledger in Postgres is the source of truth for money.” Reconciliation detects discrepancies; it never silently overwrites that ledger.
- “Amounts are integers: kobo for NGN, micro-units for USDC. No floating point.” Use six-decimal integer USD accounting too, while retaining USD and USDC as different assets.
- “User-facing naira values are computed at read time from USD amounts and the current rate. They are never stored as balances.” Historical order amounts, locked rates, and fee snapshots remain immutable records.
- “Every state change is one database transaction that writes the order row and its ledger entries together.” A nonfinancial transition has no monetary postings, but still writes its transition audit and work intent atomically.
- “`idempotency_key` is unique per order.” Duplicate requests return the existing resource; changing the payload under the same key returns 409.
- “`webhook_events.event_id` is unique per provider.” Also make economic effects unique independently of event delivery IDs.
- “Every webhook is treated as a hint.” Verify it, persist it, and re-fetch the authoritative provider transaction before advancing money.
- “Open orders stay with their original partner.” Never move an ambiguous external operation to the other partner.
- “Payout day: Friday, Lagos time.” Use `Africa/Lagos`, not host time or UTC weekday alone.
- Minimum earnings payout is “₦2,000 (proposed)”; make it configurable. The ₦100 payout fee and 1% deposit fee in the design are examples, not production constants.
- The web app shows naira and shares, holds no private keys, and never receives provider secrets or backend signer credentials.
- Every Route Handler uses `withMiddleware`; authenticated routes run auth before validators; request types come from strict Zod schemas.
- Services are class-based singletons. Explicitly type every Prisma operation object. Keep the hot-reload-safe Prisma singleton.
- Session tokens use `randomBytes(32).toString('base64url')`, database validation, and the canonical `sara-session` httpOnly cookie; no NextAuth runtime, session JWTs, or localStorage session tokens.
- “Never use optional/conditional object spread.” Build optional properties with `if` assignments.
- “Full stack.” New surfaces include pages, components, loading/error states, and navigation entries.
- “Do not run `yarn test`, `yarn lint`, `yarn typecheck` or `yarn build` between tasks.” Write the specified tests with each task, review each diff, and run the full gates once in Task 18. This repository rule overrides Superpowers' usual per-task red/green commands; failures discovered at the final gate must be fixed before handoff.
- Commit completed tasks using explicit paths; preserve unrelated staged work. Do not add AI attribution to commit messages.

## Review Focus

1. A worker dies after a provider or chain accepts a transfer: resumption finds the original operation and never sends twice. Owned by Tasks 5, 8, 9, 12, 17.
2. Concurrent withdrawals, harvest retries, or replayed webhooks contend for the same funds: one reservation and one economic effect survive. Owned by Tasks 3–5, 10, 12–14.
3. Money arrives after expiry, with an unexpected amount, sender, token, or chain: evidence is retained, no incorrect credit occurs, and refunds remain traceable. Owned by Tasks 7–10, 17.
4. Friday execution crosses a week boundary or has insufficient float: earnings retain their identity, partial batches resume oldest-first, and no user is silently skipped. Owned by Tasks 13–16.
5. A financial read fails or a live quote changes: the UI shows unavailable/stale data or requests reconfirmation, never a fabricated zero balance or unapproved charge. Owned by Tasks 2, 10–14, 18.

## Repository Findings and Explicit Adaptations

This is a T3 starter, not an existing ramps implementation. The nine source files contain a starter page, styling, Prisma singleton, Discord/NextAuth setup, environment schema, and auth route. The Prisma schema contains `User`, `Session`, `Account`, `Post`, and `VerificationToken`; no domain models, migration history, worker, or test suite exist.

`package.json` declares Yarn 1.22.22. Both `yarn.lock` and an untracked `package-lock.json` exist. Installed packages observed during planning are Next 15.5.29, React 19.3.1, Prisma CLI/client 6.19.3, TypeScript 5.9.3, and ESLint 9.39.5; this is a local observation, not a dependency upgrade request. The Prisma generator writes to `generated/prisma`, and `src/server/db.ts` imports that output. The Git branch is `main`, has no commits, and already contains the user's staged starter files.

| Conflict or missing input | Decision for implementation |
| --- | --- |
| Backend guide uses MongoDB ObjectIds; actual database is PostgreSQL with CUIDs | Keep PostgreSQL and CUIDs; use `z.string().cuid()` for internal IDs. Provider IDs are opaque strings with separate validators. Update copied examples in the guide. |
| Backend guide eagerly loads `user.business`; V3ST has no business entity | `AuthenticatedUser` contains the V3ST user, session, and KYC state. Do not invent a `Business` model. |
| Starter runs Discord/NextAuth; backend guide prohibits NextAuth runtime | Replace it with Privy identity verification followed by the canonical opaque V3ST database session. Generic Google/Facebook/Instagram examples are not additional product requirements. |
| Frontend guide names `parcours_session` | Backend's `sara-session` wins; define it once in `src/server/auth/constants.ts`. |
| Middleware example consumes JSON before signature checks | Extend `withMiddleware` with explicit `json`, `raw`, and `none` body modes. Webhooks verify the original bytes before parsing. |
| Exception examples expose `error.message` and swallow parse failures | Return safe typed errors; malformed JSON is 400. Unknown errors are generic 500s; details stay in central reporting. |
| Guide permits handler DB access and also says services are the only DB layer | Use the stricter boundary: routes and RSC wrappers call services; only services access Prisma. |
| Array transactions cannot safely implement conditional reservations | Use array transactions for independent writes and short interactive serializable transactions for read/compare/write invariants. Document bounded conflict retries. Never hold a DB transaction over network I/O. |
| Edge middleware example imports Prisma-backed auth | Edge middleware only redirects when the cookie is absent. Node layouts and API auth services validate the database session and ownership. |
| Frontend document includes education routes, dark-mode examples, and `framer-motion` | Use V3ST routes, the explicit light-only direction, and `motion`. Do not add Zustand, nuqs, or theme machinery without a feature requiring them. |
| `DESIGN_SYSTEM.md` is required by `CLAUDE.md` but absent | Create the V3ST light-theme design-system document and tokens before components. Treat visual direction as a proposal; do not copy another product's brand or routes. |
| `/v1/...` in the design versus App Router `/api/...` | Implement canonical handlers at `/api/v1/...`; add rewrites from `/v1/:path*` and `/webhooks/:provider`. Axios uses `/api/v1`. Both forms execute the same wrapped handler. |
| `next lint` scripts versus ESLint 9 configuration | Use `eslint .`/`eslint . --fix`; set `check` to the final lint/typecheck sequence. Exclude generated artifacts from lint. |

Keep `Design.md` as the product source; record these V3ST-specific adaptations in both architectural guides when Task 1 begins. No change to application code or canonical requirements is part of this planning task.

## Decision Register and Release Boundaries

The plan is executable in a deterministic simulated mode while external choices are resolved. Simulation is conspicuous, development/test-only, and cannot fabricate production verification or balances. Live features remain disabled until their dependencies have evidence in `docs/decisions/v3st-launch-decisions.md`.

| Decision/evidence | Owner | Work affected and interim behavior |
| --- | --- | --- |
| Yellow Card agreement, API access, exact fees/limits, permitted securities-linked activity, bank-name resolution and sender metadata | Business/partner team | Tasks 7–10, 12; build fixtures and sandbox integration first. Fail closed on missing identity evidence. |
| Retail idle-cash treatment, custody interpretation, securities permissions, current applicable rules | Product and Nigerian counsel | Deposits without a stock, swap-failure cash, unpaid earnings, and live launch. Build recoverable cash accounting in simulation; do not assume hiding USDC behind a naira label resolves the question. |
| KYC/BVN and wallet-screening vendors, name-match rules, tier limits and retention policy | Compliance/product | Task 7; define injectable interfaces and production configuration with no permissive default. |
| Stock issuer, token/program addresses, chain, decimals, venue, liquidity and settlement permissions | Product/trading | Task 11; one proven asset/chain first, then Solana/other approved routes. The claim about Base stock tokens being native/nonstandard must be verified, not encoded as fact. |
| Actual stock-position earnings source, entitlement rules, harvest mechanics and reinvestment target | Product/trading | Tasks 13–14; no invented yield or interest on idle stablecoins. Keep live harvest disabled until demonstrated. |
| Chain support for Yellow Card treasury funding, Privy delegation, sponsorship, key export, quorum policy and costs | Engineering/partners | Tasks 8–9, 15; record test evidence per chain and wallet type. EVM embedded wallet and EVM smart account are not interchangeable. |
| Float floor/ceiling, reserve margin, transfer caps, slippage, discrepancy thresholds and minimum payout | Treasury/product | Tasks 11–16; typed configuration and explicit simulated values; production requires recorded values. |
| Weekly cutoffs and standing consent to fees/FX for automatic payouts | Product | Task 14; proposed schedule below, store a policy version and consent snapshot. Hold a payout for reconfirmation if its fee exceeds that consent. |
| Paycrest on/off-ramp corridor access, refund handling, funding addresses and provider-node terms | Business/engineering | Task 17; contract tests use fixtures. Mainnet execution is a later, explicitly authorized operational step. |
| Permanent virtual-account terms/costs and handling of unprompted deposits | Business/product | Follow-on enhancement after Task 18; per-order bank details are the first release. |
| Second country, Busha, Blockradar, Privy NGN comparison | Product | Research backlog; not additional integrations in this implementation. |

**Delivery phases:** A = Tasks 1–9, reproducible foundations and sandbox rails; B = Tasks 10–12, customer deposit/trading/withdrawal flows; C = Tasks 13–16, weekly earnings and treasury controls; D = Tasks 17–18, second-rail resilience and integrated validation. These phases share one ledger and order lifecycle, so this is one coordinated plan rather than independent subsystem releases. Production rollout follows reconciliation and launch decisions, even if earlier slices work in a sandbox.

## File and Contract Map

Use the existing `@/*` alias. Services have one public singleton in `src/backend/services/<domain>/index.ts`; keep provider parsers, state tables, and posting templates in focused sibling files. The paths below are the intended modules, not existing implementation claims.

| Area | Paths and responsibility |
| --- | --- |
| Foundation/UI | `DESIGN_SYSTEM.md`, `components.json`, `src/styles/globals.css`, `src/primitives/`, `src/provider/`, `src/components/app-chrome.tsx`, `src/components/app-nav.ts`, `src/components/app-error.tsx`, `src/components/app-skeleton.tsx` |
| Contracts/HTTP | `src/types/index.ts`, `src/types/money.ts`, `src/types/ramp.ts`, `src/types/contract.ts`, `src/backend/middleware/`, `src/backend/validators/`, `src/utils/exceptions.ts`, `src/utils/money.ts`, `src/utils/axios.ts`, `src/utils/api.ts`, `src/utils/metadata.ts` |
| Persistence/accounting | `prisma/schema.prisma`, `prisma/migrations/`, `src/server/db.ts`, `src/backend/services/ledger/`, `src/backend/services/orders/` |
| Identity/control | `src/backend/services/auth/`, `src/backend/services/identity/`, `src/backend/services/compliance/`, `src/backend/services/bank-accounts/`, `src/server/auth/`, `src/middleware.ts` |
| External effects | `src/backend/services/jobs/`, `src/backend/workers/run.ts`, `src/backend/services/ramp/`, `src/backend/services/wallets/`, `src/backend/services/trades/` |
| Product domains | `src/backend/services/deposits/`, `src/backend/services/withdrawals/`, `src/backend/services/earnings/`, `src/backend/services/portfolio/`, `src/backend/services/rates/` |
| Operations | `src/backend/services/treasury/`, `src/backend/services/reconciliation/`, `src/backend/services/operations/`, `src/backend/cron/`, `docs/runbooks/`, `scripts/` |
| Customer routes | `/login`, `/onboarding`, `/portfolio`, `/deposits/new`, `/deposits/[id]`, `/withdrawals/new`, `/withdrawals/[id]`, `/earnings`, `/settings/bank-account`, `/settings/wallets`; persistent chrome in `src/app/(app)/layout.tsx` |
| Data/UI modules | Per-domain `src/server/<domain>.ts`, `src/hooks/queries/use-<domain>.ts`, `src/hooks/mutations/use-<domain>-mutations.ts`, and `src/components/<domain>/<domain>-page-client.tsx` |
| Verification | `vitest.config.ts`, `playwright.config.ts`, `tests/unit/`, `tests/integration/`, `tests/contracts/`, `tests/e2e/`, `tests/fixtures/`, `tests/helpers/database.ts` |

### Shared money and provider contracts

Task 2 defines these public money types and functions. JSON money is a decimal **integer string**, never a JavaScript number. Rate numerators/denominators are integers too; stock quantities use each asset's recorded decimals.

```ts
type MinorAmount = string;
type Currency = 'NGN' | 'USD' | 'USDC';
type RationalRate = { numerator: string; denominator: string }; // kobo per micro-USD
parseMinor(value: string): bigint;
formatNgn(kobo: bigint): string;
convertFloor(amount: bigint, rate: RationalRate): bigint;
convertCeil(amount: bigint, rate: RationalRate): bigint;
```

Task 8 defines the provider types in `src/types/ramp.ts` and implementation interface in `src/backend/services/ramp/provider.ts`. Provider numeric payloads pass exact decimal parsers; never round through `Number`. These enrich the design's minimal interface with immutable settlement capabilities and retry context.

```ts
type ProviderId = 'yellowcard' | 'paycrest';
type Direction = 'in' | 'out';
type SettlementModel = 'partner_float' | 'direct_chain';
type OperationContext = { operationId: string; idempotencyKey: string };
type Customer = { userId: string; verifiedName: string; phone: string; kycReference: string };
type BankAccount = { id: string; bankCode: string; accountNumber: string; resolvedName: string };
type CollectionInstructions = {
  recipient: { chain: string; token: string; address: string } | null;
  refundAccount: BankAccount | null;
};
type Quote = {
  id: string; provider: ProviderId; direction: Direction;
  ngnAmount: bigint; usdAmount: bigint; feeNgn: bigint;
  rate: RationalRate; expiresAt: Date; locked: boolean;
};
type Collection = {
  ref: string; bankName: string; accountNumber: string; accountName: string;
  expiresAt: Date; acceptedQuote: Quote;
};
type Payout = {
  ref: string;
  funding: { kind: 'float' } | {
    kind: 'chain'; chain: string; token: string; address: string; amount: bigint;
  };
  acceptedQuote: Quote;
};
type ProviderTx = {
  ref: string; direction: Direction;
  state: 'pending' | 'complete' | 'failed' | 'refunded' | 'expired' | 'hold';
  ngnAmount: bigint; usdAmount: bigint; feeNgn: bigint;
  senderName: string | null; customerReference: string | null;
  bankReference: string | null;
  chainSettlement: {
    chain: string; token: string; amount: bigint;
    recipientAddress: string; txHash: string;
  } | null;
  failureIsFinal: boolean;
};
interface RampProvider {
  readonly id: ProviderId;
  readonly settlementModel: SettlementModel;
  quote(dir: Direction, ngnAmount: bigint): Promise<Quote>;
  createCollection(q: Quote, customer: Customer, context: OperationContext,
    instructions: CollectionInstructions): Promise<Collection>;
  refundCollection(ref: string, context: OperationContext): Promise<void>;
  resolveBankAccount(bankCode: string, account: string): Promise<string>;
  createPayout(q: Quote, dest: BankAccount, context: OperationContext): Promise<Payout>;
  getTransaction(ref: string): Promise<ProviderTx>;
  findByOperation(context: OperationContext): Promise<ProviderTx | null>;
  floatBalance(): Promise<bigint>; // unsupported on direct_chain; callers check capabilities
  verifyWebhook(headers: Headers, rawBody: Uint8Array): boolean;
}
```

`findByOperation` must use a documented reference lookup or a persisted known provider ref. If a provider cannot disambiguate a timed-out create, retain `needs_review`; do not pretend exactly-once network effects are available. Collection/payout creation also carries provider-specific verified identity, travel information, chain and destination snapshots internally; add those fields to strict provider DTOs, not client-controlled arbitrary metadata.

### State, accounting, and recovery contracts

- Deposit: `created → awaiting_transfer → received → funded → settled`; `expired`, `refunded`, `failed` are side exits. Refund-in-progress, identity hold, and funding delay are operation/substatus fields until the economic result is confirmed.
- Payout: `created → funds_collected → submitted → paid`; `reversed` requires confirmed compensating return; `failed` is appropriate before funds are collected. A timeout remains unresolved, not failed.
- A `TradeOrder` has its own state, so a failed buy can leave the deposit settled as available cash and expose a retry; it cannot erase a successfully received deposit.
- Each `RampOrder` stores provider, settlement model, direction, quote, ownership, original/actual amounts, request fingerprint, state version, and provider ref. They cannot change after external acceptance.
- Each transition compares the expected state/version, writes its audit, any balanced journal, and next job in the same serializable transaction. A webhook and minute poller invoke the same transition service.
- Persist a `FinancialOperation` before each external request. It stores a unique order/leg identity, stable provider key, payload fingerprint, reference/hash, attempts, and `pending/submitted/confirmed/unknown/needs_review` outcome. A retry resumes that operation.
- Ledger entries are immutable positive debit/credit pairs of the same currency; use database constraints/triggers for account currency agreement and prohibit edits/deletes. Reverse with new linked journals. FX uses linked, individually balanced currency legs and a recorded rational rate; never balance USD directly against USDC.
- Separate user available/reserved/pending claims, provider float, per-chain treasury assets, fees, gas expense, FX/settlement clearing, and reconciliation suspense accounts. NGN transit is a memorandum/clearing book, not V3ST-owned naira. User-wallet positions form an ownership/quantity subledger; do not add both a settled USD claim and its backing USDC to customer spendable funds.
- In `ledger/postings.ts`, define explicit templates for receipt, funding conversion, reservation/release, buy/sell settlement, payout collection/send/reversal, harvest, fee, gas, treasury top-up/withdrawal, and native-USDC bridge transit. Record the debit/credit chart and account classifications in `docs/decisions/ledger-postings.md`; settle the custody/ownership decision before applying these templates to live funds.
- Enforce sufficient available funds with reservations under account locks/serializable isolation. Reserve KYC usage and treasury/float capacity alongside the order. Never implement “read balance, call provider, then debit.”

### API contracts and customer visibility

All JSON responses use `{ status, message, data }`; errors add a stable `code` and `data: null`. Lists add `{ total, page, size, totalPages }`. Ownership failures are 404, bad syntax 400/422, missing auth 401, failed eligibility 403, conflicting key/expired quote/insufficient available funds 409, and paused/unavailable rails 503. Never return a raw provider body or Prisma row.

| Canonical route under `/api/v1` | Contract/consumer |
| --- | --- |
| `POST /auth/session`, `POST /auth/logout`, `GET /me` | Exchange server-verified Privy identity for V3ST cookie, revoke session, load current account. |
| `POST /identity/verification`, `GET /identity/verification` | Initiate and inspect the selected KYC flow. No client-submitted verification flags. |
| `GET /banks`, `GET/POST /bank-accounts` | Partner-supported bank list and the user's verified payout account. |
| `POST /deposits`, `GET /deposits/:id` | `{ ngn_amount: MinorAmount, stock_id?: string }`, `Idempotency-Key`; quote, bank details, expiry, state and funding/trade substatus. |
| `POST /withdrawals/quote` | `{ ngn_amount: MinorAmount, bank_account_id: string, position_id?: string }`; persisted user-bound quote with debit, fee, net received and expiry. |
| `POST /withdrawals`, `GET /withdrawals/:id` | `{ quote_id: string }`, `Idempotency-Key`; status and bank reference. |
| `GET /earnings`, `PUT /earnings/preference` | Weekly earned/pending/reserved/paid totals; `{ mode: 'payout' | 'reinvest', stock_id?: string }` plus stored consent/policy version. |
| `GET /rates/ngn` | Display-only rate, source and as-of/expiry timestamps; five-second cache proposal. Never execute against the display cache. |
| `GET /stocks`, `GET /portfolio`, `POST /trades/:id/retry` | Approved catalog, quantities and naira valuations; retry only a failed/unsubmitted buy with a fresh quote and user confirmation. |
| `GET /events` | Authenticated, replayable user-scoped SSE state notifications; polling remains the fallback. |
| `POST /webhooks/yellowcard`, `POST /webhooks/paycrest` | Provider-authenticated raw bodies; durable inbox acknowledgement, then asynchronous authoritative fetch. |

Provider-specific KYC callbacks and any Yellow Card travel-information callback are added only according to the verified partner contract, with their own authentication. They still use `withMiddleware`; a travel callback is not an asynchronous payment notification.

## Task 1: Establish the Reproducible Runtime and V3ST UI Foundation

**Files:** Modify `package.json`, `yarn.lock`, `.gitignore`, `eslint.config.js`, `src/env.js`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/styles/globals.css`, `README.md`, both architectural guides. Create `DESIGN_SYSTEM.md`, `components.json`, `src/provider/index.tsx`, `src/provider/query-provider.tsx`, `src/components/app-chrome.tsx`, `src/components/app-nav.ts`, `src/components/app-error.tsx`, `src/components/app-skeleton.tsx`, `src/primitives/index.ts`, `src/utils/index.ts`, `src/utils/axios.ts`, `src/utils/api.ts`, `src/utils/metadata.ts`, `vitest.config.ts`, `playwright.config.ts`, `tests/helpers/database.ts`, `tests/unit/runtime-policy.test.ts`, `docs/decisions/v3st-launch-decisions.md`.

**Interfaces:** Produces `Provider({ children })`, `AppChrome({ children })`, `AppError({ message, retry? })`, `AppSkeleton()`, `cn(...values: ClassValue[]): string`, and `createTestDatabase(): Promise<{ db: PrismaClient; dispose(): Promise<void> }>`. Test databases use disposable schemas on `TEST_DATABASE_URL`, never the production URL.

- [ ] Record the adaptation table and launch decision register. Define a proposed light-only system with semantic colors, typography, spacing, focus states, reduced motion, currency presentation, and primitives; no financial UI may display technical signing/provider configuration.
- [ ] Keep Next/React on their existing major versions. Align Prisma CLI/client to the same exact 6.19.3 version, preserve the custom generated client, and ignore generated output after a reproducible `prisma generate`. Retain Yarn; inspect and reconcile the competing npm lockfile without deleting unrelated user work. Add only the documented frontend dependencies, Sentry, `server-only`, Privy SDKs compatible with React 19, Vitest, Testing Library, Playwright, and a TypeScript worker runner. Verify current SDK peer/version requirements from official docs before editing the lockfile; do not use unbounded `latest` in committed dependencies.
- [ ] Configure `lint: eslint .`, `lint:fix: eslint . --fix`, `test: vitest run`, `test:e2e: playwright test`, `worker: tsx src/backend/workers/run.ts`, and a typechecked `check` script. Set up isolated test DB helpers and provider HTTP interception that rejects accidental live network calls. Add assertions `expect(testDatabaseUrl).not.toBe(productionDatabaseUrl)` and `expect(simulationAllowedInProduction).toBe(false)` to the runtime-policy test with explicit test/production fixtures.
- [ ] Install shadcn primitives through its CLI into `src/primitives` as needed: button, input, label/field, card, dialog, select, badge, table, skeleton, alert, radio-group, switch. Restyle in place with V3ST tokens, unified `radix-ui` and Phosphor SSR imports; export via the barrel. Implement an SSR-safe per-user QueryClient, centralized Axios error handling, semantic page skeleton/error components, and persistent navigation for Portfolio, Deposit, Withdraw, Earnings, Settings. Financial pages use private metadata, `noindex`, static social cards, and request-scoped reads; never publish balances in OG URLs.
- [ ] Add typed environment groups for database/test database, app URL, integration mode, partner credentials, Privy IDs/secrets, RPCs, screening/KYC configuration, worker configuration, and treasury policy. Only expose public app/Privy IDs. Review the diff and commit `chore: establish V3ST runtime and UI foundation`; defer executable gates to Task 18.

## Task 2: Implement Money Boundaries and the Wrapped HTTP Pipeline

**Files:** Create `src/types/index.ts`, `src/types/money.ts`, `src/types/contract.ts`, `src/utils/money.ts`, `src/utils/exceptions.ts`, `src/backend/middleware/index.ts`, `src/backend/middleware/types.ts`, `src/backend/validators/index.validator.ts`, `tests/unit/money.test.ts`, `tests/unit/middleware.test.ts`. Modify `src/utils/index.ts`.

**Interfaces:** Produces the money functions above; `ApiResponse<T>`, `PaginatedApiResponse<T>`, `AuthRequest<B,Q>`, `withMiddleware(handler, middlewares, { bodyMode?: 'json' | 'raw' | 'none' })`; strict body/query/path validators; `originMiddleware`, `logRequest`, and typed exceptions including 409/503. `rawBody` is a `Uint8Array`.

- [ ] Add exact integer parsing/formatting and rational conversion tests. Inputs `'9007199254740993'` and `'2000000'` remain exact; reject `'-1'`, `'1.2'`, `'1e6'`, numeric JSON values, and values beyond the database range. Use the concrete assertions:

  ```ts
  expect(parseMinor('9007199254740993')).toBe(9007199254740993n);
  expect(convertFloor(1_000_000n, { numerator: '3', denominator: '2' })).toBe(1_500_000n);
  expect(convertCeil(1n, { numerator: '3', denominator: '2' })).toBe(2n);
  ```

- [ ] Implement `parseMinor`, `formatNgn`, `convertFloor`, and `convertCeil`. Floor customer credits/display values and ceil required debits where the approved fee contract requires it; never silently alter provider-accepted amounts. Use explicitly named serialization functions on DTOs, not a global BigInt JSON monkey patch.
- [ ] Implement the wrapper with awaited Next 15 params, strict JSON errors, bounded body size, raw body preservation, uniform error envelopes, request IDs, and one centralized log/Sentry path. Browser-cookie mutations require an allowed Origin/CSRF check; bearer/service/provider routes use their explicit authentication policy. Redact tokens, account numbers, BVN/KYC payloads, signed bodies, and nested credentials before logs or Sentry. Never place Sentry calls in services.
- [ ] Add middleware assertions: malformed JSON is 400; unknown input is 422; a thrown DB error is 500 without its message; raw webhook bytes compare byte-for-byte; cross-origin cookie mutations are 403; a valid cron/provider authentication path does not require a browser cookie. Review and commit `feat: add typed money and request middleware`.

## Task 3: Model Financial State and Database Invariants

**Files:** Modify `prisma/schema.prisma`, `src/server/db.ts`. Create `prisma/migrations/<generated_timestamp>_v3st_financial_core/migration.sql`, `tests/integration/schema-invariants.test.ts`, `docs/decisions/ledger-postings.md`.

**Interfaces:** Produces generated Prisma models `User`, `Session`, `Wallet`, `BankAccount`, `RampQuote`, `RampOrder`, `OrderTransition`, `LedgerAccount`, `LedgerJournal`, `LedgerEntry`, `BalanceReservation`, `ChainTransfer`, `FinancialOperation`, `Stock`, `Position`, `TradeOrder`, `Earning`, `EarningAllocation`, `EarningsPreference`, `WebhookEvent`, `Job`, `UserEvent`, `LimitUsage`, `TreasuryPolicy`, `TreasuryOperation`, `ReconciliationRun`, `ReconciliationDifference`, `OperationalControl`, `AuditEvent`. Use Prisma's generated enums/types in services and transport DTOs at boundaries.

- [ ] Retain `User`/`Session` CUID IDs; add unique Privy subject and normalized phone, KYC status/tier/reference/verified name, onboarding and operator role fields. Remove obsolete `Post`/NextAuth account/token models only after confirming the database has no records requiring a migration path; preserve data otherwise. Add user/family uniqueness for wallets, opaque Privy wallet IDs, and network-specific address metadata. A family wallet can be used on multiple configured EVM chains.
- [ ] Add all financial models with `BigInt` minor amounts, rational locked rates, currency/chain/token metadata, ownership FKs, immutable quote snapshots, provider references, state version, timestamps and audit relationships. An order's globally unique idempotency key is namespaced server-side by user/operation and stores a canonical request hash; never leak another user's order on a key collision. Earnings identity is unique per user/source position/Lagos week; `Earning.week` retains the original week and `Earning.amountUsdc` stores confirmed proceeds; allocations identify which earlier earnings a payout consumes. Give `UserEvent` a separate database-generated monotonic `BigInt` sequence for SSE replay, while retaining CUID entity IDs.
- [ ] Enforce unique provider/event IDs, order/leg operation IDs, journal economic keys, user/quote consumption, and chain operation/hash identities. If a provider's webhook `id` is actually a transaction ID, derive a stable event key from its documented delivery/state/sequence fields rather than discarding later states. Add SQL checks for positive journal amounts, nonnegative reservations, valid account currency pairing, and immutable journals; use compound FKs or triggers where Prisma cannot express them.
- [ ] Specify tests that insert duplicates and expect unique violations, reject cross-currency debit/credit accounts, and reject journal edits/deletes. Test the real PostgreSQL migration rather than a SQLite substitute. Review migration SQL, generate the client, and commit `feat: model V3ST financial state and invariants`; migration deployment to a live database is outside this planning task.

## Task 4: Build the Ledger, Reservations, and Order Transitions

**Files:** Create `src/backend/services/ledger/index.ts`, `src/backend/services/ledger/postings.ts`, `src/backend/services/orders/index.ts`, `src/backend/services/orders/transitions.ts`, `src/backend/services/jobs/types.ts`, `tests/integration/ledger.test.ts`, `tests/integration/order-transitions.test.ts`. Modify `docs/decisions/ledger-postings.md`.

**Interfaces:** `ledgerService.postJournal(tx: Prisma.TransactionClient, input: JournalInput): Promise<string>`; `reserve(tx, { userId, orderId, currency, amount }): Promise<string>`; `release(tx, reservationId): Promise<void>`; `available(userId, currency): Promise<bigint>`; `orderService.transition({ orderId, expectedVersion, nextState, economicKey, postings, nextJob }): Promise<RampOrder>`. Define `JournalInput` as an economic key, order/operation reference, and typed same-currency debit/credit pairs. Declare the shared `JobInput`/`JobKind` types from Task 5 now, so transitions can insert typed outbox records without a dependency on the worker implementation.

- [ ] Define the debit/credit templates listed in the recovery contract, account normal balances, custody/memorandum books, and sample receipt/funding/payout/reversal journals. Keep actual token quantities separate from display valuation. Have production accounting/custody assumptions recorded before live activation; the simulator exercises the same posting rules.
- [ ] Implement append-only posting and reservation methods with explicitly typed Prisma arguments, short serializable transactions, version comparisons, and at most three serialization-conflict retries. Repeating an economic key returns the existing journal only if its payload hash matches; otherwise throw 409. Use no external calls inside those transactions.
- [ ] Implement the transition matrix and audit writes. Nonfinancial transitions produce zero postings rather than fabricated zero-value entries. Scope every query by the authenticated owner or explicit worker/operator context. Preserve confirmed outcomes against stale events; link every compensating journal to its original.
- [ ] Add real concurrency tests: from a 10,000,000-micro balance, two parallel 7,000,000 reservations produce one success and one 409; available balance is 3,000,000. Repeating a 10,000,000 receipt economic key produces one journal. Inject failure before order update and assert zero partial postings/jobs. Test `paid → submitted` rejection and no spendable credit from a reversal still awaiting chain return. Review and commit `feat: enforce atomic ledger and order transitions`.

## Task 5: Add Durable Jobs and External Operation Recovery

**Files:** Create `src/backend/services/jobs/index.ts`, `src/backend/services/jobs/operations.ts`, `src/backend/workers/run.ts`, `src/backend/cron/schedule.ts`, `tests/integration/jobs.test.ts`, `docs/runbooks/worker.md`. Modify `src/backend/services/jobs/types.ts`, `package.json`, `README.md`.

**Interfaces:** `JobInput = { kind: JobKind; key: string; payload: Record<string, string>; runAt: Date }`; `jobService.enqueue(tx, input): Promise<string>`; `claim(limit: number): Promise<Job[]>`; `complete(id: string): Promise<void>`; `retry(id: string, failureCode: string): Promise<void>`. `JobKind` includes provider refresh, collection creation/refund, wallet provisioning/funding, trade execution, withdrawal progression, harvest, payout batch, treasury, reconciliation, and notification. `operationService.begin({ orderId, leg, requestHash }): Promise<FinancialOperation>` and `resolve(operationId): Promise<FinancialOperation>` live in `src/backend/services/jobs/operations.ts`.

- [ ] Claim due rows with transactional `FOR UPDATE SKIP LOCKED`, leases, bounded batch size, and attempt tracking. Reclaim expired leases after restart; retry transient failures with jittered exponential backoff capped at one hour and route exhausted/ambiguous work to `needs_review`. Financial operations stay durable after job exhaustion.
- [ ] Implement stable scheduling keys and outbox insertion in the original business transaction. Resolve existing provider/chain refs before reissuing a call. If no safe lookup exists after a timeout, stop automatic submission and alert; a new job is not a new economic operation. Persist user events for later SSE delivery in the same commit as state changes.
- [ ] Add tests with two worker instances claiming one job: `expect(claimedIds).toHaveLength(1)`. Simulate lease expiry and restart, assert the same operation ID/key is reused. Crash after external acceptance but before result persistence and assert the mock provider's accepted-transfer count remains one after recovery. Give each test a fake clock and persisted operation fixtures.
- [ ] Document a separate long-running Node worker process beside Next.js, required environment, graceful shutdown, heartbeat, scheduler leader lease and recovery procedures. Never rely on `setInterval` inside a Route Handler or unawaited promises after a response. Review and commit `feat: add durable financial workflow worker`.

## Task 6: Replace NextAuth with Privy Identity and Database Sessions

**Files:** Replace `src/server/auth/config.ts`, `src/server/auth/index.ts`; delete `src/app/api/auth/[...nextauth]/route.ts` after replacement. Create `src/server/auth/constants.ts`, `src/backend/services/auth/index.ts`, `src/backend/validators/auth.validator.ts`, `src/app/api/v1/auth/session/route.ts`, `src/app/api/v1/auth/logout/route.ts`, `src/app/api/v1/me/route.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/components/auth/login-page-client.tsx`, `src/app/(app)/layout.tsx`, `tests/integration/auth.test.ts`. Modify `src/provider/index.tsx`, `src/utils/api.ts`, `package.json`, `src/env.js`, `.env.example`.

**Interfaces:** `authService.exchangePrivyToken(token: string): Promise<{ user: User; sessionToken: string; expires: Date }>`; `authenticate(token: string): Promise<AuthenticatedUser>`; `logout(token: string): Promise<void>`; `requireCurrentUser(): Promise<AuthenticatedUser>`. Server-side Privy token verification is identity validation, not the V3ST session format.

- [ ] Verify the Privy token server-side for the configured app, obtain its verified phone/subject, and upsert by immutable Privy subject. Never accept a client phone/user ID as identity proof or merge accounts by an unverified field. Atomically enqueue EVM and Solana provisioning, allowing the login page to show provisioning status.
- [ ] Issue a fresh 32-byte token and 30-day DB session. Set `sara-session`, `HttpOnly`, `SameSite=Lax`, `/`, production `Secure`; revoke on logout and clear QueryClient state. Expired sessions are rejected and lazily removed, per the guide. Cookie takes precedence over bearer; an invalid cookie cannot fall back to a different bearer principal.
- [ ] Implement `authMiddleware`/`optionalAuthMiddleware` using the service, Node layout session checks and redirect to `/login`; Edge middleware performs only the optional cookie-presence redirect. Replace starter Discord/NextAuth imports, dependencies, environment variables and UI references completely. Phone login UI uses Privy's supported flow; the app's finance requests still use V3ST's cookie/API.
- [ ] Add assertions for forged/wrong-app/expired Privy tokens, session expiry, logout invalidation, cookie attributes, bearer precedence, cross-user 404s, and missing auth. Confirm no session token reaches localStorage. Review and commit `feat: add phone identity and database sessions`.

## Task 7: Implement KYC, Limits, Screening, and Verified Bank Setup

**Files:** Create `src/backend/services/identity/index.ts`, `src/backend/services/identity/provider.ts`, `src/backend/services/compliance/index.ts`, `src/backend/services/compliance/name-match.ts`, `src/backend/services/bank-accounts/index.ts`, `src/backend/validators/identity.validator.ts`, `src/backend/validators/bank-account.validator.ts`, `src/app/api/v1/identity/verification/route.ts`, `src/app/api/v1/banks/route.ts`, `src/app/api/v1/bank-accounts/route.ts`, `src/server/bank-accounts.ts`, `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/onboarding/loading.tsx`, `src/app/(app)/settings/bank-account/page.tsx`, `src/app/(app)/settings/bank-account/loading.tsx`, `src/components/bank-accounts/bank-accounts-page-client.tsx`, `src/hooks/queries/use-bank-accounts.ts`, `src/hooks/mutations/use-bank-account-mutations.ts`, `tests/integration/compliance.test.ts`.

**Interfaces:** `identityService.verify(userId, input): Promise<VerificationDto>`; `complianceService.assertEligible(userId, direction, usdAmount): Promise<void>`; `reserveLimits(tx, { userId, orderId, usdAmount }): Promise<void>`; `screenAddress({ userId, chain, address }): Promise<'allow' | 'hold' | 'deny'>`; `bankAccountService.add(userId, input): Promise<BankAccountDto>`. Define `IdentityProvider.startVerification`/`getVerification` and `ScreeningProvider.screen` interfaces plus explicit simulated implementations; the live adapters depend on the decision register.

- [ ] Collect only the chosen KYC flow's required identity data, persist its reference and verified name/tier, and protect callback updates with vendor authentication. Encrypt retained sensitive fields; keep raw BVN out of logs and API responses. Simulated verification is impossible in production.
- [ ] Implement name normalization for case, spacing and punctuation, but do not allow fuzzy mismatches by default. Uncertain/missing matches create a review hold. Resolve bank details through a verified provider capability, compare against verified identity, and enforce one active verified destination. Preserve leading zeroes in ten-digit account strings; mask returned account numbers. Bank changes do not alter already-confirmed payout snapshots.
- [ ] Enforce the lower of partner and KYC daily/monthly limits with transactionally reserved usage across both providers. Compute Lagos day/month buckets and record the execution FX basis. At the design's $1,000 threshold, require complete sender/recipient data before submission; include the partner's actual travel-information contract. Screen addresses before every externally directed chain leg, with documented result expiry.
- [ ] Add tests for matching names, a third-party mismatch, unavailable name lookup, missing KYC, concurrent limit consumption, and threshold boundaries `999_999_999n` versus `1_000_000_000n` micro-USD. Assert unknown screening results produce a hold and zero chain submissions. Wire onboarding/bank forms with strict shared Zod schemas, field errors and explicit retry. Review and commit `feat: verify identities and payout destinations`.

## Task 8: Implement the Yellow Card Adapter and Signed Webhook Inbox

**Files:** Create `src/types/ramp.ts`, `src/backend/services/ramp/provider.ts`, `src/backend/services/ramp/index.ts`, `src/backend/services/ramp/yellowcard/index.ts`, `src/backend/services/ramp/yellowcard/schemas.ts`, `src/backend/services/ramp/simulated.ts`, `src/backend/services/webhooks/index.ts`, `src/app/api/v1/webhooks/yellowcard/route.ts`, `src/backend/services/rates/index.ts`, `src/app/api/v1/rates/ngn/route.ts`, `tests/contracts/yellowcard.test.ts`, `tests/integration/webhook-inbox.test.ts`. Modify `next.config.js`, `src/env.js`, `.env.example`.

**Interfaces:** Produces the `RampProvider` contract above; `rampService.forProvider(id): RampProvider`; `selectForNewOrder(direction): Promise<ProviderId>`; `webhookService.accept(provider, headers, rawBody): Promise<{ duplicate: boolean }>`; `process(eventId): Promise<void>`; `ratesService.displayNgn(): Promise<RateDto>`. Selection initially returns only enabled Yellow Card/simulated providers.

- [ ] Verify the current official receive/accept, send, refund, lookup, balance, settlement and request-signing contracts; freeze representative request/response fixtures and document unresolved capabilities. Configure sandbox first. Store accepted/locked rates separately from indicative quotes; reconcile a changed send amount against customer consent before submission.
- [ ] Implement bounded HTTP timeouts, typed provider errors, rate-limit handling and stable operation references. Retry reads safely; money-creating writes require operation lookup/idempotency recovery. Quote with the current channel/partner fees, not hardcoded public fee examples. Reject malformed amounts and unrecognized transaction/customer/direction correlations.
- [ ] Use `withMiddleware(..., ..., { bodyMode: 'raw' })` for webhooks. Verify the provider's exact `X-YC-Signature` algorithm/encoding with sandbox fixtures and constant-time comparison, reject invalid signatures, then atomically store inbox event and refresh job. Current docs use `RECEIVE.*`/`SEND.*` and distinct crypto settlement event names; map documented legacy aliases only as compatibility. Acknowledge durable acceptance quickly, re-fetch in the worker, and keep event processing pending until its authoritative transition commits.
- [ ] Add contract tests for signing byte changes, accepted quote amount/rate, duplicate event, later event for the same transaction, mismatched provider/customer, and provider lookup outage. Assert invalid signatures cause zero ledger postings. Add rate timestamps/short cache and `/v1`/`/webhooks` rewrites, review and commit `feat: integrate Yellow Card sandbox and webhook inbox`.

## Task 9: Provision Wallets and Recoverable Sponsored Chain Transfers

**Files:** Create `src/backend/services/wallets/index.ts`, `src/backend/services/wallets/privy.ts`, `src/backend/services/wallets/chains.ts`, `src/backend/services/wallets/policies.ts`, `src/backend/services/wallets/transfers.ts`, `src/app/(app)/settings/wallets/page.tsx`, `src/components/wallets/wallet-settings-page-client.tsx`, `tests/contracts/privy.test.ts`, `tests/integration/chain-transfers.test.ts`.

**Interfaces:** `walletService.ensureUserWallets(userId): Promise<Wallet[]>`; `transfer({ operationId, fromWalletId, toAddress, chain, token, amount }): Promise<ChainTransfer>`; `confirm(transferId): Promise<ChainTransfer>`; `balances(walletId, chain): Promise<TokenBalance[]>`. `TokenBalance = { token: string; amount: bigint; decimals: number }`. Treasury wallets are organization-owned resources, not extra customer wallets.

- [ ] Provision one EVM and one Solana user wallet idempotently by Privy subject/family. Support pre-generated wallets and attach them only to a verified identity. Record whether an EVM wallet is an embedded EOA or smart account; validate sponsorship/delegation on each enabled network before routing to it.
- [ ] Configure backend signer allowlists for approved USDC/stock contracts or programs, approved treasury/venue recipients, chain IDs, per-operation/cumulative caps and revocation. Treasury moves above the configured threshold require quorum approval; gas sponsorship covers EVM/Solana and records actual gas as an operating cost. Add wallet export/recovery through the supported user-authorized Privy interface; never return private keys through V3ST API.
- [ ] Persist transfer intent before signing; manage sender nonces/operation identity and reconcile broadcast hashes after crashes. Model broadcast versus chain-finalized status, replacement and reorg outcomes. Check native USDC address/mint, decimals, balance, screening and configured finality per chain. Do not fund against an unconfirmed transaction or infer finality from a webhook alone.
- [ ] Add assertions: two provisioning jobs yield exactly two family wallets; unauthorized recipient/token/cap violates policy; insufficient treasury funds leaves the deposit in `received`; restarting after broadcast yields one transfer; a reorg before finality cannot expose spendable credit. Use mocked RPC/Privy contracts until sandbox/testnet evidence is available. Review and commit `feat: add policy-limited sponsored wallet operations`.

## Task 10: Deliver Deposits from Bank Instructions to Settled Cash

**Files:** Create `src/backend/validators/deposit.validator.ts`, `src/backend/services/deposits/index.ts`, `src/backend/services/deposits/worker.ts`, `src/app/api/v1/deposits/route.ts`, `src/app/api/v1/deposits/[id]/route.ts`, `src/backend/cron/poll-open-orders.ts`, `src/server/deposits.ts`, `src/app/(app)/deposits/new/page.tsx`, `src/app/(app)/deposits/[id]/page.tsx`, their `loading.tsx`, `src/components/deposits/deposit-page-client.tsx`, `src/hooks/queries/use-deposits.ts`, `src/hooks/mutations/use-deposit-mutations.ts`, `tests/integration/deposits.test.ts`, `tests/e2e/deposits.spec.ts`.

**Interfaces:** `depositService.create(userId, input: DepositInput, key: string): Promise<DepositDto>`; `get(userId, id): Promise<DepositDto | undefined>`; `refresh(orderId): Promise<void>`. `DepositInput` is inferred from the exact API body in the route table. `DepositDto` contains integer-string original/received amounts, locked quote/fees, bank instructions/expiry, order state, and explicit pending/refund/trade substatus.

- [ ] Atomically create the user-scoped idempotent order and collection intent, reserve applicable limits, and bind the original provider/settlement model. Return 202 while bank details are provisioning if the provider is slow; subsequent reads expose the same order and then accepted quote/instructions. Creation retries with a new amount under an existing key are 409.
- [ ] On authoritative completion, verify own-name evidence, currency, net/gross amounts and order correlation. Missing/mismatched sender evidence blocks credit and starts the documented review/refund workflow. Amount tolerance defaults to zero until approved: an unaccepted partial/overpayment is held for refund, never silently consumed. Handle late success after local expiry through an audited late-receipt/refund operation rather than dropping it. Record original, actual, provider fee and locked FX separately.
- [ ] For `partner_float`, post receipt and enqueue treasury funding once. After final funding confirmation, settle to available cash or queue the selected buy. For `direct_chain` in Task 17, verify the actual incoming chain leg and skip treasury fronting. Refund state becomes `refunded` only after partner confirmation. Poll every minute with the same refresh path as webhooks; alert after configurable funding delay.
- [ ] Build the amount/optional-stock form, exact bank details/copy control, expiry timer, and status page. Show fee and locked rate, actual amount exceptions, funding delay, refund progress and a deposits-paused notice. Preserve the idempotency key across browser retries. Test `₦20,000 → 2,000,000 kobo` with a fixture fee of `20,000 kobo`; duplicate webhook+poll produces one receipt/funding operation; failed treasury funding is recoverable. Review and commit `feat: deliver idempotent bank-transfer deposits`.

## Task 11: Add Approved Stock Trading and Portfolio Visibility

**Files:** Create `src/backend/services/trades/index.ts`, `src/backend/services/trades/router.ts`, `src/backend/services/trades/venues.ts`, `src/backend/services/portfolio/index.ts`, `src/backend/validators/trade.validator.ts`, `src/app/api/v1/stocks/route.ts`, `src/app/api/v1/portfolio/route.ts`, `src/app/api/v1/trades/[id]/retry/route.ts`, `src/server/portfolio.ts`, `src/app/(app)/portfolio/page.tsx`, `src/app/(app)/portfolio/loading.tsx`, `src/components/portfolio/portfolio-page-client.tsx`, portfolio/trade hooks, `tests/integration/trades.test.ts`, `tests/e2e/portfolio.spec.ts`.

**Interfaces:** `tradeService.quote({ userId, stockId, side, amount }): Promise<TradeQuote>`; `execute(tradeId): Promise<TradeOrder>`; `retry(userId, tradeId, key): Promise<TradeDto>`; `portfolioService.get(userId): Promise<PortfolioDto>`. `TradeQuote` records stock/venue/chain, input/output asset units, expiry, minimum output, exact fees and slippage basis points; catalog entries have issuer, address/program, decimals and enabled state.

- [ ] Populate only the approved asset/venue/network configuration; do not assume arbitrary token support or liquid markets. Define a venue adapter with `quote`/`buildTransaction`/`lookupExecution`, validate every route against policy, and select by executable net output within liquidity and slippage caps. Disabled/unproven assets are not offered for purchase.
- [ ] Atomically reserve the specific cash or position quantity; execute through the wallet operation contract and use finalized fills to update immutable trade records and position quantities. Release unused inputs/dust after confirmed settlement, record actual gas/fees, and preserve external wallet export/outbound movements as explicit subledger changes rather than continuing to display stale holdings.
- [ ] Implement failed-buy fallback: received funds remain cash, deposit status is settled, trade status explains failure, and an explicit user retry obtains a fresh executable quote. A partial fill cannot be rerun for the original full amount. Selling pauses independently from deposits; a ramp outage must leave portfolio reads and otherwise-valid sells usable.
- [ ] Add tests with a recorded 10,000,000-micro input and minimum-output units: output below minimum sends no swap; a reverted buy retains the cash; repeating a finalized trade never buys twice. Test wrong token decimals, paused asset, partial fill, and stale prices. Build holdings quantities, naira estimates with rate timestamp, pending cash and actionable failures; unavailable valuation renders unavailable rather than ₦0. Review and commit `feat: trade approved stocks and show holdings`.

## Task 12: Deliver Quoted Withdrawals and Confirmed Reversals

**Files:** Create `src/backend/validators/withdrawal.validator.ts`, `src/backend/services/withdrawals/index.ts`, `src/backend/services/withdrawals/worker.ts`, `src/app/api/v1/withdrawals/quote/route.ts`, `src/app/api/v1/withdrawals/route.ts`, `src/app/api/v1/withdrawals/[id]/route.ts`, `src/server/withdrawals.ts`, `src/app/(app)/withdrawals/new/page.tsx`, `src/app/(app)/withdrawals/new/loading.tsx`, `src/app/(app)/withdrawals/[id]/page.tsx`, `src/app/(app)/withdrawals/[id]/loading.tsx`, `src/components/withdrawals/withdrawal-page-client.tsx`, `src/hooks/queries/use-withdrawals.ts`, `src/hooks/mutations/use-withdrawal-mutations.ts`, `tests/integration/withdrawals.test.ts`, `tests/e2e/withdrawals.spec.ts`.

**Interfaces:** `withdrawalService.quote(userId, input: WithdrawalQuoteInput): Promise<WithdrawalQuoteDto>`; `confirm(userId, quoteId, key): Promise<WithdrawalDto>`; `get(userId, id): Promise<WithdrawalDto | undefined>`; `progress(orderId): Promise<void>`. The quote persists the owner, bank snapshot, source cash/position, full debit, fee, net NGN, rate, expiry and single-use consumption state. `WithdrawalQuoteDto` exposes `id`, `ngnAmount`, `feeNgn`, `netNgn`, `debitUsdc` as integer strings, plus `rate`, masked `bankAccount`, and ISO `expiresAt`.

- [ ] Produce user-bound executable quotes and reject stale/foreign/consumed quotes. Reserve cash/position, KYC usage and usable float atomically. If the partner's eventual accepted terms exceed the displayed debit or reduce the promised net, hold before submission and request a new confirmation. Define the cash amount as gross bank payout before the disclosed NGN fee; show both gross and net.
- [ ] If selling shares, execute one trade and retain its resulting cash if later progression pauses. Collect the exact USDC from the user wallet to treasury; only final confirmation permits `funds_collected`. For Yellow Card, submit one send against the reserved float and persist reference; state `submitted` remains until authoritative final bank outcome.
- [ ] Handle unknown sends by lookup/poll, never immediate refund or failover. On final bank rejection with verified restored/released provider funds, enqueue a compensating treasury-to-user chain transfer. Mark `reversed` and restore available claims only after the return finalizes. Preserve `paid` and bank receipt once proven; record exceptional later reversals separately for reconciliation.
- [ ] Build quote/review/confirm/status pages showing “You receive ₦X”, fee, exact destination, quote timer and bank reference. Add concrete assertions for a fixture gross `500_000n` kobo, fee `10_000n`, net `490_000n`; expired quote returns 409; two withdrawals cannot spend the same reservation; timeout-after-send produces one provider payout; pending reversal cannot be spent. Review and commit `feat: deliver quoted withdrawals and safe reversals`.

## Task 13: Record Real Earnings, Rollover, and Reinvestment Preferences

**Files:** Create `src/backend/services/earnings/index.ts`, `src/backend/services/earnings/source.ts`, `src/backend/validators/earnings.validator.ts`, `src/app/api/v1/earnings/route.ts`, `src/app/api/v1/earnings/preference/route.ts`, `src/server/earnings.ts`, `src/app/(app)/earnings/page.tsx`, `src/app/(app)/earnings/loading.tsx`, `src/components/earnings/earnings-page-client.tsx`, earnings query/mutation hooks, `tests/integration/earnings.test.ts`.

**Interfaces:** `EarningsSource.harvest(positionId: string, week: string, context: OperationContext): Promise<{ amountUsdc: bigint; transferRef: string }>`; `earningsService.harvest(week): Promise<void>`; `list(userId, query): Promise<PaginatedApiResponse<EarningsWeekDto[]>>`; `setPreference(userId, input: EarningsPreferenceInput): Promise<EarningsPreferenceDto>`. `week` is the Lagos Monday date `YYYY-MM-DD`; source-position entitlements are distinct from payout attempts.

- [ ] Implement the selected real earnings source only after its mechanics are demonstrated. The simulated source supplies deterministic fixtures, with `harvest` disabled in live mode until configured. Recognize confirmed proceeds, record source and allocated ownership, and never turn stock price appreciation or idle USDC into fabricated harvested income.
- [ ] Make harvest unique by position/user/week and track actual receipt separately from pending estimate. Allocate unpaid prior weeks into later payouts with `EarningAllocation`; a retried Friday batch cannot claim the same earnings twice. Preserve original earning weeks on rollover. Paginate week views with parallel typed count/list queries.
- [ ] Persist the user's explicit payout/reinvest choice and selected approved stock, with consent/policy version and cutoff behavior. Default unset preferences to `needs_choice`, not an assumed irreversible action. Reinvestment uses the trade service; a failed reinvest remains pending cash/earnings with no payout fee and no second entitlement.
- [ ] Add assertions: two harvest retries produce one 1,000,000-micro entitlement; idle cash earns zero; two source positions retain distinct rows; a failed harvest is not payable; preference changes after the batch snapshot affect the next batch. Build earned/pending/paid week rows, rollover explanation and preference form. Review and commit `feat: record position earnings and payout preferences`.

## Task 14: Schedule Thursday Harvest and Friday Payout Batches

**Files:** Create `src/backend/cron/harvest-earnings.ts`, `src/backend/cron/friday-preflight.ts`, `src/backend/cron/friday-payouts.ts`, `src/backend/services/earnings/batches.ts`, `tests/integration/friday-batches.test.ts`. Modify `src/backend/cron/schedule.ts`, earnings UI, and `src/backend/services/withdrawals/index.ts`.

**Interfaces:** `earningsBatchService.preflight(week): Promise<BatchPlan>`; `run(week): Promise<BatchResult>`; `resume(week): Promise<BatchResult>`. `BatchPlan` contains immutable eligible allocations, fee/FX/consent snapshots, estimated float requirement and deterministic priority; `BatchResult` records created/paid/pending/held counts. Automatic payout uses the same withdrawal progression service through a worker-only `createEarningsPayout(userId, week, allocationIds): Promise<RampOrder>` method.

- [ ] Proposed schedule: Thursday 20:00 Lagos float forecast, Thursday 23:00 harvest, Friday 07:00 refresh/preflight, Friday 08:00 payout start, hourly retry thereafter. In UTC these are Thu 19:00/22:00 and Fri 06:00/07:00. Make clock times configurable and record product agreement. Persist run identity and high-water marks so a stopped scheduler catches up once per missed week.
- [ ] Use a locked quote snapshot to test the proposed gross `200_000n`-kobo minimum before the fee. Under-minimum earnings roll over; unset preferences, missing bank/KYC, stale fees or compliance holds remain visible with reason codes. Reinvest preferences enqueue trade work instead of payout work. Never deduct a fee the user has not accepted under the standing consent policy.
- [ ] Create one namespaced `earnings:<userId>:<week>` payout key, reserve eligible allocations, and process oldest earning timestamp then user ID. With insufficient float, preserve strict oldest-first ordering, pause at the first unfundable payout, alert and retry hourly; do not silently spend available capacity on newer users. Preflight requests treasury top-up through Task 15's durable operation.
- [ ] Test Lagos `2026-11-13T07:00:00Z` as Friday 08:00; `199_999n` kobo rolls over and `200_000n` qualifies under the proposed policy; two batch workers create one payout/user/week. A crash after three of five users resumes only the other two; low float preserves unpaid allocations and queue order. Review and commit `feat: schedule recoverable Friday earnings payouts`.

## Task 15: Implement Treasury Capacity, Rebalancing, and Native USDC Transit

**Files:** Create `src/backend/services/treasury/index.ts`, `src/backend/services/treasury/bridge.ts`, `src/backend/cron/rebalance-treasury.ts`, `tests/integration/treasury.test.ts`, `docs/runbooks/treasury.md`. Modify worker registration and schedule.

**Interfaces:** `treasuryService.capacity(provider, chain): Promise<TreasuryCapacity>`; `planRebalance(): Promise<TreasuryOperation[]>`; `execute(operationId): Promise<void>`; `ensureFridayCapacity(week): Promise<void>`. `TreasuryCapacity` distinguishes confirmed, reserved, pending and available balances per provider/currency/chain. `NativeUsdcBridge.burn`/`getAttestation`/`mint`/`lookup` return persisted operation refs and exact native token amounts.

- [ ] Calculate capacity from confirmed ledger balances less reservations, then compare with fresh external observations. Deposits increase partner float and consume chain treasury; withdrawals do the inverse. Run hourly floor/ceiling checks with one active rebalance per provider/chain/direction. Do not top up a direct-chain provider that has no float.
- [ ] Implement Yellow Card stablecoin top-up and float withdrawal from verified API contracts/whitelisted addresses, using exact native-USDC route/network configuration. Preserve any USD/USDC conversion basis and external fees; do not assume USD and USDC always settle 1:1. Large transfers wait for the configured treasury quorum.
- [ ] Where supported, cross-chain native USDC uses a verified burn/attest/mint route, with assets in transit until destination finality. Unsupported chain pairs remain disabled; never substitute wrapped tokens or claim all chains support the same bridge. On timeout, poll/recover the original burn/mint; do not burn again.
- [ ] Add assertions for reservation-aware capacity, one rebalance under parallel jobs, Thursday forecast top-up, chain-specific shortages, native mint-address validation, stuck attestation and crash-after-mint recovery. Gas/bridge fees post to operating costs. Document float targets, transfer approvals and shortage response. Review and commit `feat: manage treasury float and native USDC rebalancing`.

## Task 16: Reconcile External Balances and Expose Audited Operations

**Files:** Create `src/backend/services/reconciliation/index.ts`, `src/backend/services/operations/index.ts`, `src/backend/cron/reconcile-balances.ts`, `src/backend/validators/operations.validator.ts`, `src/app/api/v1/ops/status/route.ts`, `src/app/api/v1/ops/controls/route.ts`, `src/app/api/v1/ops/jobs/[id]/retry/route.ts`, `src/app/(ops)/ops/page.tsx`, `src/components/operations/operations-page-client.tsx`, `tests/integration/reconciliation.test.ts`, `docs/runbooks/reconciliation.md`, `docs/runbooks/incidents.md`.

**Interfaces:** `reconciliationService.run(asOf: Date): Promise<ReconciliationRun>`; `operationsService.setControl(actorId, { scope, paused, reason }): Promise<void>`; `retryJob(actorId, id): Promise<void>`. Controls are separate for deposits, payouts, provider, trading and chain; operator role is server-assigned and audited.

- [ ] Run nightly at a configured Lagos time with a consistent cutoff/high-water mark. Compare provider float, chain treasury, pending transfers and user/position custody quantities in their native units. Record liabilities and assets by book; do not sum duplicated USD/USDC backing. Distinguish in-flight timing differences from unexplained discrepancies.
- [ ] Persist expected/observed/delta/threshold/source/cutoff for each difference. Above the approved threshold, atomically pause new payout submissions, create an incident record and queue the configured alert integration. If external reads are unavailable, report reconciliation incomplete and hold affected new payouts according to the approved stale-data policy, rather than reporting a zero difference.
- [ ] Build an authenticated operator page for controls, stuck jobs, unresolved operations, reconciliation differences and audited replay. Replays reuse operation/economic keys. Neither operators nor retries can edit journal rows. Resumption requires resolving the difference and an explicit audited reason; paused new submissions do not stop callbacks, finalization, reversal recovery, portfolio reads or permitted sells.
- [ ] Add assertions: a threshold breach pauses payouts exactly once; transaction-in-flight is not double counted; replay cannot create a second send; unauthorized users get 403; reopening requires an audit reason. Track worker heartbeat, queue age, received-to-funded latency, webhook lag, provider errors, float capacity and Friday batch progress. Review and commit `feat: reconcile funds and add audited operational controls`.

## Task 17: Add Paycrest Direct Settlement and Safe Provider Failover

**Files:** Create `src/backend/services/ramp/paycrest/index.ts`, `src/backend/services/ramp/paycrest/schemas.ts`, `src/backend/services/ramp/health.ts`, `src/app/api/v1/webhooks/paycrest/route.ts`, `tests/contracts/paycrest.test.ts`, `tests/integration/provider-failover.test.ts`. Modify ramp selection, deposit/withdrawal workers, wallet policies, rates, reconciliation and runbooks.

**Interfaces:** Implements `RampProvider` with `settlementModel: 'direct_chain'`; `providerHealth.record(provider, outcome): Promise<void>` and `eligible(provider, direction): Promise<boolean>`. Contract tests share the same normalized economic behavior while pinning distinct settlement obligations.

- [ ] Implement the current v2 sender order contract, exact string amounts, signature verification, lookup, account-name resolution and refund behavior. Freeze on-ramp/off-ramp fixtures, including `hold`, fiat-delivered versus on-chain settlement finality, expired and refunded outcomes. Paycrest's mainnet-only environment is not a sandbox: routine tests use fixtures, with no automatic real orders.
- [ ] On-ramp: bind the recipient wallet/chain/token and verify finalized incoming USDC plus verified payer identity; post one economic credit and **zero** treasury-fronting transfers. Off-ramp: persist the provider's exact receive-address/funding amount, bind it to the order, and permit only that destination under a dedicated bounded signer policy. Skip the Yellow Card user-to-treasury leg and fund the provider once from reserved user funds; separately account for any required treasury routing if the verified partner contract demands it. A direct-chain refund does not fabricate a float reversal.
- [ ] Add health/circuit-breaker selection for new orders only, requiring approved capability, jurisdiction, liquidity and enabled policy. Existing orders and already-shown executable quotes remain provider-pinned. A failed new-order selection may choose the alternative before external acceptance; an ambiguous accepted create stays on its original provider. If neither provider is eligible, return a clear paused state.
- [ ] Add assertions: Paycrest deposit completion makes zero treasury funding calls; withdrawal funds one recorded receive address; signature rejects altered bytes; health failover sends a new order to Paycrest but leaves an existing Yellow Card order unchanged; unresolved/refunded/held events cannot prematurely mark paid. Document that an approved small-value live smoke test is a separate launch action. Review and commit `feat: add Paycrest direct settlement and pinned failover`.

### Concrete Regression Assertions for Tasks 3–17

Place each case in its owning test file listed above; construct its isolated DB/provider fixtures within that file using `createTestDatabase` and Vitest mocks. The names below identify the test, and each assertion pins the required observable result. The variables name that case's arranged result or mock; they are not additional production APIs. Write these tests with the task and execute them only at the final gate.

```ts
// Task 3: "rejects mutation of an existing posted journal"
await expect(attemptJournalMutation).rejects.toThrow();

// Task 4: "permits one of two concurrent seven-USDC reservations from ten USDC"
expect(reservationResults.filter(result => result.status === 'fulfilled')).toHaveLength(1);
expect(await ledgerService.available(userId, 'USDC')).toBe(3_000_000n);

// Task 5: "resolves a crash after acceptance without a second external effect"
expect(acceptedTransfers).toHaveLength(1);
expect(resumedOperation.id).toBe(originalOperation.id);

// Task 6: "rejects a revoked database session"
await expect(authService.authenticate(loggedOutToken)).rejects.toMatchObject({ statusCode: 401 });

// Task 7: "requires travel information at exactly one thousand USD"
await expect(complianceService.assertEligible(userIdWithoutTravelData, 'out', 1_000_000_000n))
  .rejects.toMatchObject({ statusCode: 403 });
expect(chainSubmit).not.toHaveBeenCalled();

// Task 8: "rejects a signed body changed after signing"
expect(yellowcard.verifyWebhook(originalHeaders, changedRawBody)).toBe(false);
expect(postedReceiptJournals).toHaveLength(0);

// Task 9: "leaves received deposits waiting when treasury funds are insufficient"
expect(waitingDeposit.status).toBe('received');
expect(chainSubmit).not.toHaveBeenCalled();

// Task 10: "coalesces concurrent authoritative refreshes into one funding leg"
expect(receiptJournals).toHaveLength(1);
expect(fundingOperations).toHaveLength(1);

// Task 11: "retains cash after a reverted optional buy"
expect(settledDeposit.status).toBe('settled');
expect(failedTrade.status).toBe('failed');
expect(await ledgerService.available(userId, 'USDC')).toBe(10_000_000n);

// Task 12: "discloses the net payout and does not resubmit an unknown send"
expect(quoteDto.ngnAmount).toBe('500000');
expect(quoteDto.feeNgn).toBe('10000');
expect(quoteDto.netNgn).toBe('490000');
expect(providerCreatePayout).toHaveBeenCalledTimes(1);

// Task 13: "recognizes a position-week harvest once"
expect(confirmedEarnings).toHaveLength(1);
expect(confirmedEarnings[0]?.amountUsdc).toBe(1_000_000n);

// Task 14: "preserves an under-minimum entitlement across the Friday batch"
expect(rolloverEarning.payoutOrderId).toBeNull();
expect(rolloverEarning.week).toBe('2026-11-09');
expect(weeklyPayoutsForSameUser).toHaveLength(1);

// Task 15: "counts a native-USDC burn as in transit until mint finality"
expect(destinationAvailableBeforeMint).toBe(0n);
expect(bridgeBurn).toHaveBeenCalledTimes(1);

// Task 16: "pauses new payouts on an unexplained threshold breach"
expect(operationalControl.payoutsPaused).toBe(true);
expect(discrepancyIncidents).toHaveLength(1);

// Task 17: "does not front treasury funds for a Paycrest on-ramp"
expect(treasuryFundingSubmit).not.toHaveBeenCalled();
expect(paycrestReceiptJournals).toHaveLength(1);
```

## Task 18: Complete Live Updates and Run the Integrated Acceptance Gate

**Files:** Create `src/backend/services/events/index.ts`, `src/app/api/v1/events/route.ts`, `src/hooks/queries/use-order-events.ts`, `tests/integration/events.test.ts`, `tests/e2e/friday-payouts.spec.ts`, `tests/e2e/operations.spec.ts`, `.github/workflows/ci.yml`, `docs/runbooks/launch.md`. Complete `src/types/contract.ts`, domain RSC wrappers, hooks, root redirect/metadata, loading/error pages, `README.md` and runtime scripts.

**Interfaces:** `eventService.list(userId, afterId): Promise<UserEventDto[]>`; `useOrderEvents(): void` invalidates user-scoped query keys on state events. SSE uses durable monotonically ordered IDs and `Last-Event-ID`; one missed connection never replaces the minute provider poller or customer status polling.

- [ ] Implement wrapped, authenticated SSE without running financial work in the stream. Scope every event to its user, revalidate session on reconnect/heartbeat, bound connection duration, and support durable replay. Retain polling fallback for hosting environments that limit streams. Clear cached user data and close streams on logout/account change.
- [ ] Finish request-scoped RSC wrappers using services, `cache()`, private/no-store financial reads and explicit `null`/not-found distinctions. Seed TanStack Query with timestamps, invalidate related balances/orders/earnings on transitions, and use `ApiResponse`/DTO compile-time contract assertions. Navigation, mobile forms, quote expiry, accessible status announcements and skeletons must be reachable on every planned customer surface.
- [ ] Run the full verification once after Tasks 1–17 and this integration work:

  ```bash
  yarn install --frozen-lockfile
  yarn prisma validate
  yarn prisma generate
  yarn test
  yarn lint
  yarn typecheck
  yarn build
  yarn test:e2e
  ```

  Use a disposable PostgreSQL database with migrations applied by the test setup, simulated partner/wallet/earnings adapters and local web/worker processes. Expected: all commands exit 0; no live partner/RPC calls; all money, concurrency, recovery, ownership and UI tests pass. If a gate fails, fix its cause and rerun that failed check plus checks affected by the fix; do not claim deferred tests were previously green.

- [ ] Exercise the integrated cases: successful deposit-to-shares; cash fallback after failed buy; own-account withdrawal and confirmed reversal; concurrent spending rejection; missed/duplicate/out-of-order webhook; worker death after external acceptance; third-party/late/wrong-amount deposit; unavailable balances; Lagos Friday rollover and partial-batch recovery; float shortage; reconciliation payout pause; provider-pinned failover. Test SSE cross-user isolation and replay with `expect(otherUserEvents).toEqual([])` and one delivered event after reconnection. Browser tests at mobile/desktop widths verify keyboard focus, readable naira values, explicit uncertainty and no hidden fees.
- [ ] Produce a launch runbook covering restore drill, worker restart/replay, signer revocation/export, paused rails, ledger discrepancy ownership, treasury approvals, production configuration, launch decision evidence and staged rollout/rollback. Schema changes use expand/contract rollback where balances exist; rolling back a deploy never deletes journal history. Record the measured sandbox latency against the under-two-minute design target, separating simulated time from actual sandbox evidence. No mainnet execution, deployment or activation is implied by this planning request. Review, commit `test: validate V3ST financial flows and launch readiness`, and hand over evidence and remaining external launch dependencies.

## Plan Review and Acceptance

Before marking implementation complete, the implementer must check every row below against the delivered behavior. These are coverage criteria, not additional between-task gate runs.

| Design requirement | Owning tasks |
| --- | --- |
| Licensed-partner naira movement, Yellow Card sandbox/float, Paycrest alternate settlement | 7–8, 10, 12, 17 |
| One EVM/Solana wallet, pre-generation, sponsored gas, limited server signer, treasury quorum and export | 6, 9, 15 |
| Deposit quote/bank details/expiry, identity/actual-amount checks, authoritative webhooks, treasury funding, optional stock | 7–11 |
| Verified bank destination, all-in withdrawal quote, sell/cash collection, paid reference and safe reversal | 7, 11–12 |
| Double-entry PostgreSQL ledger, integer units, current-rate display, uniqueness and atomic state transitions | 2–5, 10–16 |
| Thursday harvest/preflight, Friday Lagos batch, fee consent, minimum/rollover, reinvest and oldest-first retries | 13–15 |
| Minute polling, hourly treasury rebalance, native USDC transit, provider health and pinned failover | 5, 10, 15, 17 |
| Nightly reconciliation, threshold alert/payout pause and audited recovery | 15–16 |
| KYC limits, own-name rules, screening, travel-information threshold, deposits pause without losing portfolio/sells | 7–12, 16–17 |
| Canonical middleware/services/Prisma/session conventions and full-stack reachable pages | 1–18 |
| API surface, push and polling, user-safe failures and no false zero financial state | 2, 6–14, 18 |
| Permanent virtual accounts, alternate vendors/countries, unsettled legal/commercial questions | Decision register; explicit follow-on work rather than silent assumptions |

Planning self-review: the source requirements have owning tasks; method names and units are shared through the contract map; the five review-focus conditions have explicit assertions; copied guide conflicts have recorded resolutions; verification is deferred exactly as `CLAUDE.md` requires. External decisions remain named launch dependencies, not assertions that they have already been settled.

## Official Integration References Checked During Planning

Checked on 2026-11-13. These checks establish integration direction, not production account access, current negotiated fees, or legal approval. Recheck detailed endpoint schemas before implementing each adapter.

- Yellow Card documents fiat receives crediting a USD float, fiat sends spending that float, and a sandbox environment. [Getting Started](https://docs.yellowcard.engineering/docs/getting-started-1)
- Yellow Card's current webhook documentation distinguishes newer receive/send/crypto event names and describes signature verification. It also distinguishes payment notifications from the separate travel-information callback. [Webhooks](https://docs.yellowcard.engineering/docs/webhooks-api)
- Paycrest v2 uses one order endpoint for both directions, with fiat-to-crypto and crypto-to-fiat settlement. Its integration guide states mainnet-only testing and documents signature verification and compliance holds. [Sender API Integration](https://docs.paycrest.io/implementation-guides/sender-api-integration)
- Privy documents embedded user wallets and policy-controlled server access; exact signer/sponsorship/asset compatibility remains a per-chain integration proof. [User wallets](https://docs.privy.io/wallets/overview/solutions/user-wallets), [Server-side access](https://docs.privy.io/wallets/wallets/server-side-access)

The licence, regulation, fee and securities statements in `Design.md` are supplied design inputs. This plan does not independently validate them; the decision register requires current partner/counsel confirmation before live activation.
