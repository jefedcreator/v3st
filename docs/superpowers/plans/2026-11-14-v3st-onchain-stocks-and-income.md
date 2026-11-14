# V3ST Onchain Stocks and Income Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If unavailable, record that fact and execute this self-contained checklist natively; do not install unrelated plugins.

**Goal:** Extend V3ST's existing backend with testnet stock execution, source-specific income strategies, and seamless investment APIs covering Bankr, Hydrex/Hydropump, Stonks Exchange, BaseStonk, Feel.cash and o1 Exchange.

**Architecture:** Retain wrapped Next.js Route Handlers, singleton services, the PostgreSQL ledger and durable worker. Add immutable investment intents, capability-specific provider adapters, restricted test signing, contract-backed local testnet replicas and confirmed reward accounting. Fiat funding and payouts reuse existing beta ramps.

**Tech Stack:** Node 24.15.0 (`.nvmrc`), Yarn 1.22.22, Next.js 15, TypeScript, Prisma 6/PostgreSQL, Zod 3, Vitest, viem 2, Foundry/Anvil and Solidity test contracts. Pin exact compatible viem, Solidity and Foundry versions during Task 1; do not change existing major versions.

**Spec:** [Onchain stocks and income design](../specs/2026-11-14-v3st-onchain-stocks-and-income-design.md), [Design.md](../../../Design.md), [original beta plan](2026-11-13-v3st-naira-ramps-and-payouts.md), [backend guide](../../../BACKEND_PATTERNS.md), [repository rules](../../../CLAUDE.md).

**Latest user decisions:** Backend/API only. Use testnets for crypto. For providers without verified testnet deployments, use clearly labelled local testnet contract replicas and keep actual provider adapters disabled until verified. These decisions override the older full-stack instructions and any database-only crypto simulation proposal. No frontend components/pages/styles, design-system creation, production integration or application deployment is included.

## Global Constraints

- Require `APP_STAGE=beta` independently of `NODE_ENV`; optimized builds never enable real providers.
- Modes remain `sandbox | simulated`. Separately record `integrationKind: local_testnet_replica | verified_provider_testnet`, chain ID, genesis/deployment identity, provider version and wallet profile.
- Required execution target: isolated Anvil, chain `31337`, with test tokens and actual local transactions/receipts. No upstream fork. Actual provider clients are disabled until testnet evidence exists. Base Sepolia `84532` is a candidate, not a verified provider deployment. Vibenet is an optional engineering experiment only.
- No mainnet reads, broadcasts, wallets, provider quote/price endpoints, paid gas, live fallback, real funds, real KYC or real-recipient notifications. Existing Paycrest remains simulated-only. Do not confuse a provider's `simulateOnly` operation against mainnet services with an isolated testnet.
- Keep NGN/USDC/USD accounting and fiat workflows from the original plan. Idle cash earns zero. Income requires an identified source and confirmed proceeds; asset appreciation, multiplier adjustments, principal and unredeemed incentives are not payable earnings.
- No wallet signing or gas-payment steps in customer APIs. Customers confirm scoped investment/strategy instructions; a restricted test signer and application relayer handle onchain actions.
- Use chain + address + deployment namespace identity, never ticker alone. Raw quantities use exact integers; widen raw-quantity storage beyond PostgreSQL `BIGINT` where required.
- Bind operation, quote, custody profile, provider and beta context before execution; ambiguous acceptance never triggers another route or releases funds.
- Routes use `withMiddleware<Body, Path, Query>` with `null` for unused inputs. Auth precedes strict Zod validation; services alone access Prisma; explicitly type Prisma operation objects. Preserve `sara-session`, origin/CSRF checks, ownership 404s and snake_case DTOs with integer-string amounts.
- Never use optional/conditional object spread. Redact credentials and signing material; no private keys in API output, logs, fixtures, source control or public deployment manifests.
- Begin implementation with `bash scripts/setup-cloud.sh` using the pinned runtime. Keep `yarn.lock` as the only committed package lock. Ignore generated Prisma, contract build output, local chain state, dependencies and secrets.
- Write tests with each task, but **do not run application tests, contract tests, lint, typecheck or build between tasks**. Run the complete gate once at Task 15, fix failures and rerun affected checks. Diff/contract review and necessary generation are allowed meanwhile.
- Commit focused task changes and update the checklist. No deployment, partner account creation, outreach or programme submission is authorized by this planning request.

## Review Focus

1. Crash after signing/broadcast but before persistence must recover the same transaction/nonce and retain reservations; no duplicate buy, claim or payout. Tasks 4, 9, 11–12.
2. A split, dividend multiplier change, cancelled scheduled update or frozen reference must not double-count shares/value or invent cash income. Tasks 3, 10, 12.
3. An 18-decimal asset balance, partial fill or concurrent stock sale/strategy deposit must remain exact and cannot overspend inventory. Tasks 2, 9–11.
4. A provider plan with a changed recipient, approval spender, hook, chain, custody profile or hidden fee must be rejected even with HTTP 200. Tasks 4–8.
5. A reward entitlement, LP exit or Friday rollover with no liquidity, principal loss, unconfirmed conversion or revoked consent must not become an automatic cash payout. Tasks 11–13.

## Planning checklist and baseline

- [x] Read repository architecture, `Design.md`, both pattern guides and the entire original beta plan, including adaptations and task interfaces.
- [x] Inspect the current catalog, wallets, router, trades, ledger, earnings, jobs, API routes and tests.
- [x] Research official provider documentation and distinguish observed capabilities from unverified contracts/testnets.
- [x] Incorporate the user's backend-only and local-testnet-replica decisions.
- [ ] Complete consistency/coverage review and commit this documentation task.

Planning used installed Superpowers `writing-plans` 7.0.2. Application verification is not run for this documentation-only task. Source baseline inspected: `2459d65` (`fix: type path parameters and null API input slots`). Recheck changed interfaces at implementation start.

| Observed code | Required adaptation |
| --- | --- |
| Backend services, migrations, sessions, workers and tests exist; only the web page remains starter UI. Some README/old-plan statements still describe an empty starter. | Extend current backend. Do not recreate auth, ramps, ledger or workers from an obsolete plan snapshot. |
| `trades/venue.ts` exposes `quote`, `quoteExactOut`, `submitSwap`, `getSwap`; router contains only `simulatedVenue`, and `venueById` silently falls back. | Introduce the explicit contracts below; reject unknown IDs and incompatible profiles. Never silently switch an existing operation to a replica. |
| `trades/index.ts` calls venue methods inside `withTx` and invokes settlement handlers after commit. | Separate DB intent, external effect and atomic finalization; enqueue a durable settlement event in the finalization transaction. |
| `Stock.symbol` is unique; cash and stock units share `LedgerEntry.amount BigInt`; stock quantities in trades are BigInt columns. | Preserve internal stock IDs, remove symbol identity and widen raw-quantity columns/ledger entries to `Decimal @db.Decimal(78,0)` with exact bigint boundaries. |
| `simWeeklyEarningMicroPerShare` fabricates earnings from current stock balance; earnings identity is user/stock/week. | Retire scheduled per-stock yield. Introduce source receipt identity, eligibility snapshots and finalized conversion; preserve historical fixture rows as legacy test data. |
| Portfolio reads only enabled stocks and values raw quantities through a one-token sell quote. | Include all owned assets, independent valuation basis, multiplier-aware display, reservations and explicit missing basis/price. |
| Wallet provider handles transfers only; current chain addresses are `sim-*`. | Add a test execution-account/relayer boundary and deployed test-token manifests. Preserve legacy synthetic records; never reinterpret them as onchain balances. |
| `earnings/batch.ts`, `jobs/schedule.ts`, `operations/index.ts` and `scenarios/index.ts` already exist. | Extend those exact files. New transaction recovery belongs in `execution/`, avoiding confusion with operator `operations/`. |

## Delivery order and provider coverage

Tasks 1–4 establish containment, quantities, catalog and execution. Tasks 5–8 implement distinct provider replicas. Tasks 9–10 deliver stock investment APIs and holdings; Tasks 11–12 deliver income and Friday integration. Tasks 13–15 finish API evidence, reconciliation and verification. No provider acquisition blocks this order.

| Provider | Task | Concrete beta deliverable | Actual adapter status |
| --- | --- | --- | --- |
| o1 Exchange | 5 | Documented-schema quote/prepare parser plus local test router; distinct launchpad capabilities | Disabled: documented aggregator is mainnet-only |
| Bankr | 6 | Managed-wallet local gateway, deterministic swap parsing and separate custody profile | Disabled: no verified testnet/account isolation |
| Hydrex/Hydropump | 7 | Local liquidity pool/receipt/fee flow; separate permanent-lock fixture | Disabled: no verified stock pool/test deployment |
| Stonks Exchange | 8 | Versioned pool and entitled stock-distribution replica | Disabled: no verified test deployment |
| BaseStonk | 8 | Hook/fee capability replica with unsupported external actions explicit | Disabled: detailed API/ABI and testnet unverified |
| Feel.cash | 8 | Source-specific holder distribution replica | Disabled: developer/claim contract and testnet unverified |

Use the spec's linked evidence matrix as the authoritative research index. For unknown contracts, implement V3ST's internal interfaces against clearly named replica contracts; never invent a provider URL, ABI, entitlement or testnet address. Each provider gets independent fixture tests and an evidence entry even when contracts share test harness code.

## File and contract map

| Paths | Responsibility |
| --- | --- |
| `src/backend/integrations/beta-policy.ts`, `onchain-policy.ts`, `provider-evidence.ts` | Stage/network checks, endpoint boundaries, test deployment evidence |
| `src/backend/services/onchain/types.ts`, `registry.ts` | Provider capabilities and shared exact-unit contracts |
| `src/backend/services/onchain/providers/{o1,bankr,hydrex,stonks,basestonk,feel}/` | Provider-specific parsers, replicas and disabled actual-provider factories |
| `src/backend/services/execution/{index,policy,receipts,nonce}.ts` | Persisted execution, decoded-call checks, signer/relayer, finality/recovery |
| `src/backend/services/stocks/{index,corporate-actions,reference}.ts` | Approved catalog, B20 fixture ingestion, reference semantics |
| `src/backend/services/investments/index.ts`, `trades/{index,router,venue}.ts` | Quote/confirm orchestration and existing ramp/reinvest trade compatibility |
| `src/backend/services/positions/{index,lots}.ts`, `portfolio/index.ts` | Raw ownership, FIFO cost basis, share equivalents and performance |
| `src/backend/services/strategies/index.ts`, `rewards/index.ts`, `earnings/{index,source,batch}.ts` | Opt-in allocation, claims/exit realization, proceeds and payouts |
| `contracts/testnet/`, `contracts/test/`, `foundry.toml`, `scripts/testnet-*.ts` | Local contract replicas, deployment and ephemeral isolated test fixtures |
| `src/backend/validators/`, `src/types/onchain.ts`, `src/types/dto.ts`, `src/app/api/v1/` | Strict API input, explicit DTOs and wrapped handlers |
| `tests/contracts/onchain/`, `tests/integration/`, `tests/api/`, `tests/helpers/testnet.ts` | Provider parsing, actual local-chain recovery and HTTP journeys |

### Shared interfaces

Define these in Task 1's `onchain/types.ts`; DTOs stringify bigint and dates explicitly. CUID IDs refer to database entities. `Address`/`Hex` come from viem. Database persistence is defined in Task 2. No types below denote verified provider deployments.

```ts
type StockProviderId = 'bankr' | 'hydrex' | 'stonks' | 'basestonk' | 'feel' | 'o1';
type AssetKey = string; // namespace:chainId:lowercase-address
type IntegrationKind = 'local_testnet_replica' | 'verified_provider_testnet';
type BetaContext = {
  stage: 'beta'; mode: 'sandbox' | 'simulated'; integrationKind: IntegrationKind;
  networkId: string; chainId: number; deploymentId: string;
  providerId: StockProviderId; providerVersion: string; custodyProfileId: string;
};
type AssetAmount = { asset: AssetKey; raw: bigint };
type EvidenceId = string;
type ProviderCapabilities = {
  id: StockProviderId; kind: IntegrationKind; evidenceId: EvidenceId;
  custody: 'application_account' | 'provider_managed';
  spot: boolean; liquidity: boolean; distributions: boolean;
  separateClaim: boolean; exactOutput: boolean;
};
type QuoteRequest = {
  userId: string; walletId: string; stockId: string; side: 'buy' | 'sell';
  input: AssetAmount; outputAsset: AssetKey; slippageBps: number;
  context: BetaContext;
};
type ExecutionQuote = {
  id: string; userId: string; walletId: string; stockId: string;
  context: BetaContext; input: AssetAmount; expectedOutput: AssetAmount;
  minOutput: AssetAmount; userFeeUsdc: bigint; sponsorCostWei: bigint;
  priceImpactBps: number; expiresAt: Date; sourceBlock: bigint;
  routeFingerprint: string;
};
type PreparedCall = { to: Address; data: Hex; value: bigint };
type ExecutionPlan = {
  operationId: string; quoteId: string; walletId: string; context: BetaContext;
  calls: PreparedCall[]; expectedInput: AssetAmount; minimumOutput: AssetAmount;
  recipient: Address; deadline: Date; fingerprint: string;
};
type ExecutionObservation = {
  operationId: string;
  state: 'pending' | 'confirmed' | 'reverted' | 'unknown' | 'reorged';
  txHash: Hex | null; blockHash: Hex | null; blockNumber: bigint | null;
  actualInput: AssetAmount | null; actualOutput: AssetAmount | null;
  gasCostWei: bigint | null;
};
interface SpotAdapter {
  readonly capabilities: ProviderCapabilities;
  quote(input: QuoteRequest): Promise<ExecutionQuote>;
  prepare(quote: ExecutionQuote, operationId: string): Promise<ExecutionPlan>;
}
type StrategyAction = 'enter' | 'claim' | 'exit';
type StrategyRequest = {
  userId: string; strategyId: string; positionId: string | null;
  action: StrategyAction; inputs: AssetAmount[]; context: BetaContext;
};
type StrategyQuote = {
  id: string; request: StrategyRequest; minimumOutputs: AssetAmount[];
  maximumInputs: AssetAmount[]; userFeeUsdc: bigint; expiresAt: Date;
  strategyVersion: string; disclosureVersion: string; planFingerprint: string;
};
type StrategyPlan = {
  operationId: string; quoteId: string; walletId: string; context: BetaContext;
  calls: PreparedCall[]; maximumInputs: AssetAmount[];
  minimumOutputs: AssetAmount[]; recipient: Address; deadline: Date;
  fingerprint: string;
};
interface StrategyAdapter {
  readonly capabilities: ProviderCapabilities;
  quote(input: StrategyRequest): Promise<StrategyQuote>;
  prepare(quote: StrategyQuote, operationId: string): Promise<StrategyPlan>;
}
```

`executionService.prepare(operationId)` obtains the appropriate plan from the persisted quote; `submit(operationId)` signs/relays it; `observe(operationId)` returns `ExecutionObservation`; `finalize(operationId)` atomically posts verified effects and durable follow-up work. A strategy operation can have multiple assets; persist its observed delta vector separately rather than squeezing it into a spot input/output pair.

`onchainRegistry.spot(id, context): SpotAdapter` and `.strategy(id, context): StrategyAdapter` throw a typed unsupported/unverified error when the capability is absent. A Bankr managed-wallet adapter supplies a local gateway transport with the same operation identity; it does not borrow another custody profile's signer.

### API contract additions

All paths below are under `/api/v1`; preserve existing aliases. Money is integer-string kobo/micro-units; quantities are integer-string raw units with explicit decimals. The client submits a quote/authorization ID, never arbitrary provider ID, chain, recipient, calldata or a trusted eligibility flag.

| Endpoint | Request and result |
| --- | --- |
| `GET /stocks`, `GET /stocks/:id` | Catalog/details; instrument kind, rights, share-equivalent basis, quote availability, test provenance |
| `POST /investments/quote` | Strict union: buy `{ stock_id, side:'buy', budget_ngn }`; sell `{ stock_id, side:'sell', quantity_raw }`. Return persisted quote, expiry, fee breakdown, share estimate and minimum. |
| `POST /investments` | `{ quote_id, authorization_id }` + Idempotency-Key → 202 investment/status resource; repeated identical request returns it |
| `GET /investments/:id` | Owner-scoped status, accepted terms, confirmed fill and friendly hold reason |
| `GET/POST /investment-authorizations` | Read/create scoped approval: maximum spend, stock/strategy scope, duration and policy version; expiry ≤30 days for standing actions |
| `DELETE /investment-authorizations/:id` | Revoke new activity; preserve accepted/broadcast work for reconciliation |
| `GET /strategies`, `GET /strategies/:id` | Versioned mechanism, input/receipt/reward assets, liquidity/lock/claim restrictions and test provenance |
| `POST /strategy-quotes` | `{ strategy_id, action:'enter', budget_ngn }` or `{ position_id, action:'exit'|'claim' }`; returns multi-asset limits and disclosures |
| `POST /strategy-operations` | `{ quote_id, authorization_id }` + Idempotency-Key → 202 operation; explicit separate consent for strategy entry |
| `GET /strategy-positions`, `GET /strategy-operations/:id` | Own receipt quantities, principal/value, pending rewards and status |
| `GET /portfolio`, `GET /earnings` | Extend existing DTOs with cost basis, realized/unrealized performance and source/receipt/payout state; preserve compatible fields |
| `PUT /earnings/preference` | Extend existing payout/reinvest preference with versioned consent limits for fees, FX and background conversion |
| `GET /ops/integrations`, `GET /ops/onchain-operations` | Operator evidence, replica/verified status, budgets and unresolved effects; never secrets |
| `POST /beta/onchain-scenarios` | User-owned local-testnet operation plus named scenario only; no arbitrary mint/call/recipient inputs |

Expired/changed quotes or inadequate available balances: 409. Unsupported capability: 422 `CAPABILITY_UNAVAILABLE`. Unverified provider, sponsor shortage or unhealthy network: 503 with typed reason. Unauthorized ownership: 404. Never return raw provider/Prisma objects. Ordinary investment DTOs do not require client wallet actions.

## Implementation checklist

- [ ] Task 1: Runtime, scope, provider evidence and type contracts
- [ ] Task 2: Exact quantities and persisted onchain operations
- [ ] Task 3: Testnet infrastructure, catalog and corporate actions
- [ ] Task 4: Restricted signing, sponsorship and recovery
- [ ] Task 5: o1 quote/prepare replica
- [ ] Task 6: Bankr managed-wallet replica
- [ ] Task 7: Hydrex liquidity and Hydropump lock replicas
- [ ] Task 8: Stonks, BaseStonk and Feel distribution replicas
- [ ] Task 9: Investment routing and funding integration
- [ ] Task 10: Positions, valuation and performance
- [ ] Task 11: Opt-in strategy lifecycle
- [ ] Task 12: Confirmed income and Friday payouts
- [ ] Task 13: Wrapped API contracts, scenarios and HTTP journeys
- [ ] Task 14: Reconciliation and operator APIs
- [ ] Task 15: Final verification and backend handoff

### Task 1: Establish backend scope, runtime and provider contracts

**Files:** Modify `README.md`, `BACKEND_PATTERNS.md`, `src/env.js`, `.env.example`, `.gitignore`, `package.json`, `yarn.lock`, `src/backend/integrations/beta-policy.ts`. Create `src/backend/integrations/onchain-policy.ts`, `src/backend/integrations/provider-evidence.ts`, `src/backend/services/onchain/types.ts`, `src/backend/services/onchain/registry.ts`, `docs/decisions/onchain-providers.md`, `foundry.toml`, `.foundry-version`, `tests/unit/onchain-policy.test.ts`.

**Interfaces:** Produce shared types above and `assertOnchainContext(context: BetaContext): Promise<void>`; `providerEvidence.get(id: StockProviderId): ProviderEvidence`, whose fields include URLs, checked date, transport/API/ABI version, supported capabilities and testnet evidence status. Evidence metadata does not authorize execution.

- [ ] Run the repository setup script with Node/Yarn versions above. Record exact compatible viem/Foundry/Solidity versions and dependencies; installation/setup is not test evidence. Add `test:contracts`, `test:api`, `testnet:start` and `testnet:deploy` scripts for the final gate and development loop.
- [ ] Replace stale empty-starter claims with the inspected backend baseline and this backend-only extension. Preserve unrelated architecture examples; state that this work does not require frontend packages or `DESIGN_SYSTEM.md`.
- [ ] Define all six providers, capability/evidence records and explicit disabled actual-provider factories. Initial chain allowlist is loopback Anvil only. Verify `eth_chainId`, deployment manifest identity and no fork configuration before effects. Treat all URLs returned by providers/metadata as untrusted; reject redirects outside the approved transport.
- [ ] Write `rejectsMainnetEvenInProduction`, `rejectsUnverifiedProviderTestnet` and `doesNotAcceptCallerSelectedMode` tests with `expect(mainnetCalls).toEqual([])` and `expect(actualProviderFactory).not.toHaveBeenCalled()`. Assert a replica exposes `integration_kind === 'local_testnet_replica'` with `mode === 'simulated'` and `chain_id === 31337`.
- [ ] Review the diff, update checklist and commit `chore: define testnet-only onchain integration contracts`. Defer gates to Task 15.

### Task 2: Persist exact raw units, consent, operations and source receipts

**Depends on:** 1.

**Files:** Modify `prisma/schema.prisma`, `src/backend/services/ledger/index.ts`, `src/backend/services/ledger/postings.ts`, `src/backend/services/ledger/accounts.ts`. Create `prisma/migrations/<timestamp>_onchain_investments/migration.sql`, `src/utils/asset-units.ts`, `tests/integration/onchain-schema.test.ts`, `tests/unit/asset-units.test.ts`, `docs/decisions/onchain-ledger.md`.

**Interfaces:** `parseRaw(value: string): bigint` validates `0..2^256-1`; `toDbRaw(value: bigint): Prisma.Decimal`; `fromDbRaw(value: Prisma.Decimal): bigint`. Keep existing `ledgerService.post(tx, JournalInput)` and bigint balance return values. Models: `OnchainNetwork`, `CustodyProfile`, `InvestmentAuthorization`, `InvestmentQuote`, `Investment`, `OnchainOperation`, `OnchainStep`, `ChainObservation`, `StockAction`, `PositionLot`, `Strategy`, `StrategyPosition`, `StrategyQuote`, `RewardReceipt`, `EarningAllocation`.

- [ ] Widen `LedgerEntry.amount`, trade raw amount fields, transfer raw amounts/gas and simulator raw fields to numeric(78,0); preserve same-asset positive journal constraints and immutability. Cash-only amounts can remain BigInt. Explicitly convert at Prisma boundaries; never introduce floating-point Decimal arithmetic or a global JSON serializer.
- [ ] Add `Stock.assetKey` uniqueness and instrument/provenance fields; drop symbol uniqueness only after stable IDs are retained. Add multiplier and reference basis/time. Keep legacy `sim-*` assets in a separate deployment namespace; seed new testnet stock rows without rewriting old holdings.
- [ ] Persist immutable quote/consent/provider/custody/network snapshots; unique operation key + request hash; serialized signed-payload reference/hash, nonce, tx hash, step status, block identity and finality. Signed payload storage is private and redacted. Persist per-source reward identity and original accrual period separately from payout week. Add foreign keys/indexes and unique receipt `(network, source, txHash, logIndex, beneficiary)` plus provider entitlement identity where appropriate.
- [ ] Add historical migration handling: existing earnings remain `legacy_fixture`, and already-posted journals are not reinterpreted. New accrual never uses `simWeeklyEarningMicroPerShare`. Link new proceeds through receipts/allocations while retaining compatibility for old rows.
- [ ] Write `roundTrips18DecimalInventory` using `expect(fromDbRaw(toDbRaw(100n * 10n ** 18n))).toBe(100n * 10n ** 18n)`; reject `2^256`, fractional values and negative raw quantities. Add migration preservation, duplicate receipt, cross-currency posting, immutable journal and changed-payload key tests.
- [ ] Review migration and conversion call sites, generate Prisma as needed, commit `feat: persist exact onchain quantities and operation evidence`.

### Task 3: Build isolated testnet fixtures and stock reference handling

**Depends on:** 1–2.

**Files:** Create `contracts/testnet/TestSettlementToken.sol`, `contracts/testnet/TestStockToken.sol`, `contracts/testnet/TestStockRegistry.sol`, `contracts/test/StockActions.t.sol`, `scripts/testnet-start.ts`, `scripts/testnet-deploy.ts`, `tests/helpers/testnet.ts`, `tests/contracts/onchain/base-reference.test.ts`, `tests/contracts/fixtures/onchain/base-stocks.json`, `src/backend/services/stocks/reference.ts`, `src/backend/services/stocks/corporate-actions.ts`, `tests/integration/stock-actions.test.ts`. Modify `src/backend/services/stocks/index.ts`, `scripts/seed-beta.ts`, `tests/global-setup.ts`.

**Interfaces:** `testnetService.deploy(): Promise<TestnetManifest>` lives in new `src/backend/services/onchain/testnet.ts`; manifest contains chain/genesis/deployment IDs, ABI hashes and contract addresses, no keys. `stockReference.parse(input: unknown): ReferenceStock[]`; `stockActionService.ingest(networkId: string, throughBlock: bigint): Promise<void>`; `effectiveMultiplier(stockId: string, at: Date): Promise<bigint>`.

- [ ] Start Anvil on loopback without `--fork-url`; isolate process/DB/deployment per test run. Generate ephemeral test-only signer material outside Git, fund it using local-node facilities, deploy six-decimal settlement and 18-decimal stock fixtures. Reject remote/public RPC use of local fixture signers. Persist generated manifests outside source control.
- [ ] Implement a clearly labelled B20-behavior mock: raw ERC-20 quantities, WAD multiplier, scheduled effective times/cancellation, policy/pausing fixtures and action events. It is not the native B20 precompile. Do not require `getCode` to be nonempty for a future verified native precompile; verification for native assets needs registry evidence and semantic probes instead.
- [ ] Parse Base's documented reference schema from hand-authored fixtures with pagination, omitted fields, decimals and price basis. No runtime API call. Require approved issuer/rights/eligibility plus a usable route before buying. Unknown metadata is not proof of tradability.
- [ ] Write `splitPreservesRawQuantityAndValue`: two raw tokens, multiplier 1→2, underlying share price 100→50 gives four share equivalents and unchanged value 200. Assert `cashJournals.length === 0`. Test cancelled scheduled updates, duplicate logs, reorg rollback before finality and missing/stale NAV.
- [ ] Review mock-versus-native limitations and seed idempotency; commit `feat: add local stock testnet and corporate action fixtures`.

### Task 4: Execute with bounded authorization and application-paid test gas

**Depends on:** 2–3.

**Files:** Create `contracts/testnet/TestExecutionAccount.sol`, `contracts/test/ExecutionPolicy.t.sol`, `src/backend/services/execution/index.ts`, `src/backend/services/execution/policy.ts`, `src/backend/services/execution/nonce.ts`, `src/backend/services/execution/receipts.ts`, `src/backend/services/wallets/testnet.ts`, `src/backend/services/authorizations/index.ts`, `tests/integration/testnet-execution.test.ts`. Modify `wallets/provider.ts`, `wallets/index.ts`, `wallets/policy.ts`, `wallets/chains.ts`, `jobs/types.ts`, `workers/handlers.ts`.

**Interfaces:** `authorizationService.create(userId, input: AuthorizationInput): Promise<AuthorizationDto>` and `.revoke(userId, id): Promise<void>`; `executionService.prepare/submit/finalize(operationId: string): Promise<void>`; `.observe(operationId: string): Promise<ExecutionObservation>`; `assertExecutionPlan(plan: ExecutionPlan | StrategyPlan): Promise<void>`.

- [ ] Add a local test account holding each user's assets and a relayer paying test gas. Separate owner/delegated signer/account addresses and Bankr-managed profiles. The account verifies operation nonce, deadline, authorization epoch and approved call hashes; it is test scaffolding, not a new production wallet protocol.
- [ ] Validate decoded nested call data against persisted quote and authorization: chain, allowed contract version/function, recipient, assets, exact bounded allowances, input caps, minimum output, deadline and native value. Reject unknown hooks and oversized approvals. Use execution simulation before broadcast, then independently validate receipt/balance deltas; simulation success is not finality.
- [ ] Persist operation and reservation before external work. Allocate signer nonce under lock; persist private signed payload/tx hash before broadcast. A crash retries the same signed bytes or looks up the same hash/nonce; do not create a replacement economic action. Start with two mined confirmations on local Anvil, configurable by verified network manifest. Reorged or unknown operations retain holds.
- [ ] Sponsor deployment, approvals, swap and claim/exit steps from the test relayer with per-operation/daily budgets. Revocation blocks new signing and increments the authorization epoch; already-broadcast actions reconcile. Sponsor failure returns `SPONSOR_UNAVAILABLE`, never a user-paid fallback.
- [ ] Write `broadcastCrashHasOneEffect`, `rejectsChangedRecipientAndUnlimitedApproval`, `revocationStopsUnsubmittedWork`, `sponsorShortageNeverDebitsUserGas` and `reorgBeforeFinalityCreditsNothing`. Assert one successful local operation event after replay, zero cash credit before two confirmations, and identical user native balance before/after execution.
- [ ] Commit `feat: add policy-limited testnet execution and recovery` after diff review.

### Task 5: Implement o1 unsigned-transaction integration through a replica

**Depends on:** 4.

**Files:** Create `src/backend/services/onchain/providers/o1/index.ts`, `schemas.ts`, `replica.ts`, `contracts/testnet/O1RouterReplica.sol`, `tests/contracts/onchain/o1.test.ts`, `tests/contracts/fixtures/onchain/o1-quote.json`, `tests/contracts/fixtures/onchain/o1-prepared.json`, `tests/integration/o1-testnet.test.ts`.

**Interfaces:** Export `o1Replica: SpotAdapter`; actual-provider constructor rejects unverified environments. Persist source schema versions in fixture metadata. Replica `prepare` returns an `ExecutionPlan`, never a claimed fill.

- [ ] Model the documented aggregator's two-step quote/transaction construction using local transport and local contract addresses. Parse raw input/output, minimum, expiry, route, fee and unsigned call fields exactly. A response to the provider's `/submit` is transaction construction, not broadcast confirmation.
- [ ] Deploy a test router with exact-input swap, minimum output, deadline and deterministic partial-fill/revert fixtures. Validate actual received deltas. Include a Hydrex-origin path fixture for route provenance; aggregating it does not justify charging Hydrex fees a second time.
- [ ] Keep o1 launchpad discovery/trading capability separate; its pool/hook/approval requirements do not apply to all stock swaps. Unsupported permit types/cross-chain paths are refused in this beta.
- [ ] Write `preparedIsNotFilled`, `rejectsExpiredAndForeignQuote`, `rejectsHiddenOutputFee` and `localReceiptSettlesExactlyOnce`. Assert a constructed quote leaves `confirmedFills === 0`, and a 10,000,000 input with 50-bps fixture fee reports 50,000 fee, with minimum calculated from net output once. These are test values, not o1 fee claims.
- [ ] Commit `feat: add o1 testnet quote and execution replica`.

### Task 6: Implement Bankr as an explicit managed-wallet profile

**Depends on:** 4–5.

**Files:** Create `src/backend/services/onchain/providers/bankr/index.ts`, `schemas.ts`, `replica.ts`, `gateway.ts`, `tests/contracts/onchain/bankr.test.ts`, `tests/contracts/fixtures/onchain/bankr-swap.json`, `tests/integration/bankr-testnet.test.ts`. Modify testnet deployment and wallet profile provisioning.

**Interfaces:** `bankrReplica: SpotAdapter`; `bankrReplicaGateway.provision(ownerKey: string): Promise<{ custodyProfileId: string; walletId: string }>`; `.submit(operationId: string): Promise<{ txHash: Hex }>`; `.lookup(operationId: string): Promise<ExecutionObservation>`. Gateway uses testnet execution, never Bankr's real hostname.

- [ ] Provision a separate local Bankr-style managed account and scoped server key reference per synthetic customer. Never place all customers in a single Bankr wallet or export/import Privy keys. Ordinary application-account orders cannot route here; test scenarios explicitly create this custody profile before funding.
- [ ] Model deterministic quote/swap behavior, exact decimal-string versus raw-unit conversion and stable UUID idempotency. Normalize successful HTTP responses carrying `success:false` as reverts. Treat timeout/ambiguous gateway response as unresolved and reconcile onchain evidence before any resend.
- [ ] Keep location/eligibility approval separate from quote success. No fabricated provider identity clearance. Bankr gas limits are not an unlimited sponsorship guarantee; local budgets model exhaustion. Natural-language Agent API execution is out of the financial path.
- [ ] Write `quoteDoesNotGrantStockEligibility`, `privyProfileCannotUseBankrWallet`, `http200RevertDoesNotSettle`, `uuidReplayReturnsOriginalOperation`, `timeoutKeepsOriginalHash`. Assert zero real Bankr calls and zero implicit custody transfers.
- [ ] Commit `feat: add isolated Bankr managed-wallet testnet profile`.

### Task 7: Implement Hydrex liquidity and Hydropump fee mechanics separately

**Depends on:** 4–5.

**Files:** Create `src/backend/services/onchain/providers/hydrex/index.ts`, `replica.ts`, `schemas.ts`, `contracts/testnet/HydrexPoolReplica.sol`, `contracts/testnet/HydropumpLockerReplica.sol`, `tests/contracts/onchain/hydrex.test.ts`, `tests/integration/hydrex-testnet.test.ts`.

**Interfaces:** `hydrexSpotReplica: SpotAdapter`, `hydrexStrategyReplica: StrategyAdapter`. Its strategy capabilities specify `separateClaim: true` for the manual-fee fixture; a distinct exit-realized variant specifies false. Hydropump replica declares permanently locked principal and beneficiary-only fee claims.

- [ ] Build a local two-asset stock/settlement pool with deposit/receipt, swap, claim and withdraw behavior. Seed finite liquidity; use deterministic reserves, fees and reward balances rather than fiat-priced mint-on-demand swaps. Record assumptions explicitly; this is not a full Algebra/Hydrex implementation.
- [ ] Keep LP ownership, protocol-account incentives and Hydropump creator fees distinct. Test fee receivers and any incentive conversion costs; rewards are not automatically USDC. Zero trading activity produces zero fees. Strategy entry can change stock exposure and exit can lose value.
- [ ] Implement a permanent-lock Hydropump fixture for provenance/eligibility tests; never register it as an ordinary redeemable income strategy. No HYDX acquisition, governance lock or public launch is required.
- [ ] Write `feesRequireLiquidityOwnership`, `idlePoolPaysZero`, `exitReturnsPrincipalSeparatelyFromFees` and `lockedLaunchCannotWithdrawPrincipal`. Assert claim transfers only funded reward balances and a loss fixture returns less value than entry while still reporting positive fees separately.
- [ ] Commit `feat: model Hydrex liquidity and Hydropump fee entitlements on testnet`.

### Task 8: Implement Stonks, BaseStonk and Feel source-specific replicas

**Depends on:** 4, 7.

**Files:** Create `src/backend/services/onchain/providers/stonks/{index,replica,schemas}.ts`, `src/backend/services/onchain/providers/basestonk/{index,replica,schemas}.ts`, `src/backend/services/onchain/providers/feel/{index,replica,schemas}.ts`, `contracts/testnet/StockDistributionReplica.sol`, `contracts/testnet/HookFeeReplica.sol`, `tests/contracts/onchain/stonks.test.ts`, `tests/contracts/onchain/basestonk.test.ts`, `tests/contracts/onchain/feel.test.ts`, `tests/integration/stock-distributions.test.ts`.

**Interfaces:** Each module exports a provider descriptor and its supported `StrategyAdapter`; none declares general direct-stock spot execution without evidence. Registry reports unsupported actual-provider capabilities explicitly.

- [ ] Stonks: bind launched token, quote stock, pool/router generation, fee owner and holder-distribution policy. Distinguish legacy and newer contract sets; do not send one generation's coin to another router. Fee rights and permanently locked liquidity are separate.
- [ ] BaseStonk: implement an internal hook/fee fixture with per-launch frozen rules and current recipient. Do not invent a public claim API or assume generic holder income. Unknown hook versions/entitlements are unavailable. Mark all synthetic schema/ABI names as V3ST replica definitions.
- [ ] Feel: implement a stock-reward distribution fixture tied to an eligible launch-token holding snapshot; ordinary ownership of the stock used in the pair does not qualify. Preserve reward asset and prior-holder entitlements where the fixture explicitly establishes them.
- [ ] Use chain-backed distribution epochs and claimed bitmaps/accounting; seed rewards from the local fixture treasury. Test duplicate claims, user changes after the snapshot, zero reward funds, changed fee recipient and no conversion route.
- [ ] Pin three independent assertions: Stonks version mismatch rejects; BaseStonk unknown hook rejects; Feel stock-only holder gets zero. Across all, `expect(confirmedClaimCount).toBe(1)` after duplicate requests and `expect(realProviderCalls).toEqual([])`.
- [ ] Commit `feat: add source-specific stock reward provider replicas`.

### Task 9: Route quoted investments and join them to bank funding

**Depends on:** 5–8.

**Files:** Create `src/backend/services/investments/index.ts`, `src/backend/validators/investment.validator.ts`, `tests/integration/investments.test.ts`. Modify `src/backend/services/trades/index.ts`, `router.ts`, `venue.ts`, `src/backend/services/deposits/index.ts`, `src/backend/services/withdrawals/index.ts`, `src/backend/services/orders/poller.ts`, `src/backend/workers/handlers.ts`.

**Interfaces:** `investmentService.quote(userId, input: InvestmentQuoteInput): Promise<InvestmentQuoteDto>`; `.confirm(userId, quoteId, authorizationId, key): Promise<InvestmentDto>`; `.get(userId, id): Promise<InvestmentDto | undefined>`; `.progress(id): Promise<void>`. Existing `createBuy`, `createSell` callers become compatibility facades over persisted investment/operation contracts; retain downstream purpose identities.

- [ ] Filter routes by correct asset/custody/network, evidence/capability, fresh quote, price impact and operational controls. Choose highest net output at the same input and disclosed fee basis; deterministic provider-ID tie break. Timeout an individual quote without hiding healthy alternatives. No unknown-ID fallback. Separate 100-bps maximum slippage from 100-bps maximum fixture price impact; unknown impact is unavailable.
- [ ] Bind naira budget to a fresh rational rate and exact settlement input; expose FX and venue fees independently. Set expiry to min(provider expiry, now +30 seconds). Confirm and reserve atomically with payload hash and quote single-use protection. Revalidate consent and terms before signing; a worsened quote needs reconfirmation.
- [ ] Replace external calls inside `withTx` with the execution worker. Persist trade settlement event and follow-up job alongside ledger/quantity finalization. Use actual input/output and remaining reservation for partial fills; never rerun full original size.
- [ ] Deposit completion funds the correct test account through a real local transfer once. Expired stock consent leaves cash and `needs_confirmation`. Legacy `stock_id` alone cannot authorize a fresh unbounded buy; add optional accepted investment intent reference and expose a quote/confirm path. Withdrawal sales/reinvest also reuse the same execution rules, with explicit background consent.
- [ ] Write `twoRequestsReserveOnce`, `noProviderFallbackAfterBroadcast`, `expiredDepositQuoteLeavesCash`, `partialFillReleasesOnlyUnusedInput` and `tradeCommitSurvivesCallbackCrash`. Use a 10,000,000 cash balance and two concurrent 7,000,000 buys: exactly one succeeds and available cash is 3,000,000 before fill.
- [ ] Commit `feat: route consent-bound investments through testnet execution`.

### Task 10: Expose accurate positions, cost basis and performance

**Depends on:** 3, 9.

**Files:** Create `src/backend/services/positions/index.ts`, `lots.ts`, `tests/integration/positions.test.ts`. Modify `src/backend/services/portfolio/index.ts`, `src/backend/services/stocks/index.ts`, `src/types/dto.ts`.

**Interfaces:** `positionService.applyFill(tx: Tx, operationId: string): Promise<void>`; `.list(userId: string): Promise<PositionView[]>`; `portfolioService.get(userId): Promise<PortfolioDto>` remains the public read boundary. `PositionView` contains raw owned/reserved/strategy quantities, multiplier/as-of, share equivalents, cost basis status and signed realized/unrealized values.

- [ ] Build FIFO lots from finalized fills with actual fees, acquisition FX and source identity. For unknown external transfer basis, report `basis_unavailable` instead of zero cost. Local transfer ingestion is scoped by asset/network/account and finality; it never fabricates a trade.
- [ ] Compute value using either raw tokens × token-NAV or share-equivalent × underlying-share price, never both multipliers. Separate unrealized price/FX movement from cash proceeds and source distributions. Round display credits down; preserve remaining lot cost exactly, assigning residual on final disposal.
- [ ] Include paused/delisted owned assets and reserved stock balances in totals. Keep strategy underlying exposure separate from its receipt's accounting value so principal is not counted twice. Unavailable feed produces null valuation and status, not zero holdings.
- [ ] Write `stockSplitDoesNotChangeCostBasis`, `navIsNotMultipliedTwice`, `delistedHoldingRemainsVisible` and `saleProceedsAreNotAllProfit`. For cost 10,000,000, sale proceeds 12,000,000 and fee 100,000, realized gain is 1,900,000 and returned principal is 10,000,000.
- [ ] Commit `feat: add multiplier-aware stock positions and performance`.

### Task 11: Orchestrate opt-in strategy entry, claims and exits

**Depends on:** 7–10.

**Files:** Create `src/backend/services/strategies/index.ts`, `src/backend/services/rewards/index.ts`, `src/backend/validators/strategy.validator.ts`, `tests/integration/strategy-lifecycle.test.ts`, `tests/integration/reward-receipts.test.ts`. Modify execution policy, ledger posting templates, jobs and worker registration.

**Interfaces:** `strategyService.list(userId): Promise<StrategyDto[]>`; `.quote(userId, input: StrategyQuoteInput): Promise<StrategyQuoteDto>`; `.confirm(userId, quoteId, authorizationId, key): Promise<StrategyOperationDto>`; `.progress(operationId): Promise<void>`; `rewardService.recordFinalized(operationId: string): Promise<void>`.

- [ ] Persist immutable strategy/disclosure version and explicit consent. Enforce the spec's 20% exposure/$100-equivalent fixture ceiling across active and pending allocations under locks. Direct stock purchases do not select a strategy. Experimental launch-provider profiles require explicit demo scope.
- [ ] Entry reserves all required assets and executes preparatory swaps plus pool deposit with operation-per-step recovery; prefer a validated atomic batch where possible. On failed later steps retain actual received assets as visible inventory, not fictional reversal. Exit burns/redeems only owned receipts and separates principal, fees and reward tokens.
- [ ] Capture eligibility at the source's event/epoch boundary, not harvest-time holdings. Recognize only actual transfers or fee realization proved by logs/deltas. For embedded fees, realization happens on exit; `claim` is unsupported. For distributions, preserve asset/receipt until conversion finalizes.
- [ ] Persist states `quoted → reserved → executing → active` for entry and `exit_pending → exited` for exit; unresolved steps use `unknown/needs_review`. Revocation pauses new actions; exit can proceed with a new explicit authorization. Principal is never used to manufacture a weekly reward.
- [ ] Write `concurrentSaleAndEntryCannotSpendSameStock`, `claimWithoutEntitlementIsZero`, `embeddedFeesRequireExit`, `entryFailureRetainsIntermediateAssets` and `negativeReturnDoesNotEraseFeesOrInventIncome`. Two 1,000,000 fee claims for the same event yield one receipt and one credit.
- [ ] Commit `feat: add explicit strategy allocation and confirmed reward receipts`.

### Task 12: Replace fixed weekly yield with receipt-backed proceeds

**Depends on:** 11.

**Files:** Modify `src/backend/services/earnings/index.ts`, `source.ts`, `batch.ts`, `src/backend/services/jobs/schedule.ts`, `src/backend/services/withdrawals/index.ts`, `src/backend/validators/earnings.validator.ts`, `src/backend/config/policy.ts`, `tests/integration/earnings.test.ts`, `tests/integration/friday-batch.test.ts`. Create `tests/integration/income-conversion.test.ts`.

**Interfaces:** Preserve `earningsService.harvest(week)`, `list(userId, query)` and `setPreference(userId, body)` for callers, but harvest now schedules verified source actions. `rewardService.convert(receiptId: string, authorizationId: string): Promise<string>` returns an investment operation ID; `earningsService.recognize(receiptId: string): Promise<void>` records finalized settlement proceeds once.

- [ ] Remove new income derived from `quantity × simWeeklyEarningMicroPerShare`. Static stock holding and idle cash yield zero cash. A multiplier event affects valuation only. Preserve old fixture history under its explicit legacy provenance.
- [ ] Track `estimated`, `received_asset`, `conversion_pending`, `available`, `reserved_for_payout`, `paid` and `reinvested` amounts independently. A reward-token/stock receipt needs a consent-bound sell and finalized settlement before it is payable; realized distribution and sale gains remain separate classifications.
- [ ] Retain Lagos Friday 08:00 start and configurable existing Thursday timings (current code: harvest 22:00, float precheck 23:00 Lagos). Document actual configured schedule rather than silently adopting the older proposal. Use gross 200,000-kobo minimum, versioned fee/FX consent, original earning periods and oldest-first rollover; allocation identity prevents duplicate payout/reinvestment.
- [ ] Attach payout/reinvest IDs when reserved but report paid/reinvested only after final state. Failed conversions hold reward assets; failed reinvestment releases earnings once. Fix duplicated release paths between trade failure and earnings callback. Sponsor gas stays operating expense.
- [ ] Write `holdingStockAlonePaysZero`, `dividendMultiplierPaysNoCash`, `unconvertedRewardCannotPayout`, `payoutReferenceIsNotPaidStatus`, `failedReinvestReleasesOnce` and `lateReceiptRollsForwardWithoutChangingAccrualWeek`. Assert 199,999 kobo rolls over, 200,000 qualifies, and duplicate Friday workers allocate each receipt once.
- [ ] Commit `feat: pay Friday income only from finalized source proceeds`.

### Task 13: Deliver wrapped APIs and reproducible backend journeys

**Depends on:** 9–12.

**Files:** Create the route files corresponding to every new path in the API table; create `src/backend/validators/authorization.validator.ts`, `onchain-scenario.validator.ts`, `src/types/onchain.ts`, `src/types/contract.ts`, `tests/api/onchain-journey.test.ts`, `tests/api/onchain-errors.test.ts`, `docs/api/onchain-investments.md`. Modify existing stock, portfolio, earnings, deposit and trade-retry handlers/DTOs; extend `middleware/types.ts`, `src/types/index.ts`, `scenarios/index.ts`, `events/index.ts`, `src/app/api/v1/events/route.ts`.

**Interfaces:** Wire the service methods above. `scenarioService.runOnchain(userId, input: OnchainScenarioInput, key): Promise<{ operationId: string }>` accepts local-owned operation ID and an enum; scenarios include delayed confirmation, revert, partial fill, sponsor shortage and zero rewards. Operator-owned fixtures cover global chain reorg/split/reset.

- [ ] Create strict schemas, inferred request types, wrappers and response serializers for the API table. Extend error-code union and maintain `withMiddleware<B,P,Q>` order. Authentication precedes validation; cookie mutations retain origin checks and all financial writes use idempotency keys.
- [ ] Return beta provenance, plain status/reason codes, naira estimates, raw/decimal quantities and accepted fee/consent snapshots without secrets or provider signing instructions. Normal clients do not choose custody/provider/network. Operator test setup can select isolated profiles through controlled fixtures.
- [ ] Scope list/detail/events to owner, paginate bounded results and keep financial reads private/no-store. SSE reports committed domain changes and polling remains available. Clear stale successful states on unavailable observations; don't return zeros as error fallbacks.
- [ ] Make scenario triggers alter only local fixture state through signed testnet contract calls and the normal worker. They cannot directly post ledger earnings or operate actual provider resources. Never expose arbitrary RPC, mint recipient or calldata inputs. Keep global node-reset controls outside customer routes.
- [ ] Write HTTP journeys for synthetic login/verification → test bank receipt → finalized testnet funding → investment quote/confirmation → holdings → strategy entry → reward/conversion → Friday payout, plus failed buy cash fallback. Assert no wallet-signing payload, no gas top-up requirement, cross-user 404s and one resource on replay. Verify every enabled replica appears with its actual local receipt evidence.
- [ ] Commit `feat: expose stock and income backend APIs with testnet journeys`.

### Task 14: Reconcile onchain positions and expose operator evidence

**Depends on:** 12–13.

**Files:** Modify `src/backend/services/reconciliation/index.ts`, `src/backend/services/operations/index.ts`, `src/backend/services/controls/index.ts`, `src/backend/validators/ops.validator.ts`, `src/backend/workers/handlers.ts`. Create `src/app/api/v1/ops/integrations/route.ts`, `src/app/api/v1/ops/onchain-operations/route.ts`, `tests/integration/onchain-reconciliation.test.ts`, `docs/runbooks/onchain-beta.md`.

**Interfaces:** Extend `reconciliationService.run(asOf)` with network/deployment cutoff. `operationsService.onchainStatus(): Promise<OnchainOpsDto>` returns evidence status, network identity, stale cursors, operation holds and sponsor budget; existing audited controls/retry paths reuse original operation identities.

- [ ] Reconcile account raw token/receipt balances, reserved claims, in-flight operations, pool/claim evidence and relayer gas spend at consistent finalized blocks. Keep customer liabilities separate from backing treasury assets and aggregate settlement balances only once.
- [ ] Pause affected new execution/payouts on unexplained differences or unavailable chain data. Keep observation/recovery, reads and authorized safe exits running where possible. An empty response never proves a zero discrepancy.
- [ ] Persist deployment identity and detect local chain reset despite unchanged chain ID. Hold old operations; operator starts a fresh isolated fixture namespace or restores matched chain/DB state. Never retry old signed payloads against a redeployed address. No journal deletion/reset in a persistent beta instance.
- [ ] Add audited evidence/status APIs without a “go live” or arbitrary provider-enable toggle. Runbook covers stalled nonce, reorg, sponsor outage, revoked signer, underfunded claim, receipt mismatch, restore and replica limitations. Builder attribution can be represented in local calldata tests only if supported; it must not alter quote/call validation or imply programme eligibility.
- [ ] Write `chainResetCannotReplayOldOperation`, `unavailableReadIsNotBalanced`, `operatorRetryRetainsOperationIdentity` and `unexplainedPositionDeltaPausesAffectedRail`. Assert no ledger edits and zero public-network broadcasts.
- [ ] Commit `feat: reconcile testnet investments and expose provider evidence`.

### Task 15: Run the complete backend verification gate and hand off

**Depends on:** 1–14.

**Files:** Complete `tests/integration/onchain-containment.test.ts`, `contracts/test/`, API journey tests, `README.md`, `docs/api/onchain-investments.md`, `docs/runbooks/onchain-beta.md`; modify existing CI or create `.github/workflows/backend.yml` if none exists. Preserve earlier ramp/auth/ledger suites.

**Interfaces:** No new production interfaces. Test setup owns disposable PostgreSQL `_test` database, loopback Anvil, ephemeral keys and teardown. `yarn test` includes all Vitest unit/contract-parser/integration/API suites; `test:contracts` executes Solidity behavioral tests. Do not run the API suite twice unless a fix requires it.

- [ ] At this point only, run the full gate using the pinned runtime:

  ```bash
  bash scripts/setup-cloud.sh
  yarn prisma validate
  yarn prisma generate
  yarn test:contracts
  yarn test
  yarn lint
  yarn typecheck
  yarn build
  ```

  Expected: every command exits 0; DB/testnet helpers create and tear down isolated state. Contract tests cover transfer, policy, swap, fee, claim and exit effects. Vitest exercises actual local RPC and receipts as well as HTTP adapters. No browser/E2E page tests are required because this plan is backend-only. Do not claim passing evidence until these commands have run.
- [ ] Exercise crashes at intent/sign/broadcast/confirmation/finalization boundaries, concurrent reservations, partial fills, reorgs, reset, 18-decimal quantities, multiplier timing/cancellation, stale prices, missing liquidity, zero earnings, principal loss, repeated claims, failed conversion, duplicate payout and revoked consent. Assert local transaction hashes resolve to receipts; database-only fake chain success cannot pass.
- [ ] Repeat containment scenarios under `NODE_ENV=production`, `APP_STAGE=beta`: reject mainnet chain ID `8453`, remote RPC with local fixture credentials, unknown provider endpoints, forged mode flags, unexpected redirects and foreign deployment events. Assert `realProviderRequests`, `mainnetBroadcasts` and `realRecipientNotifications` are empty. The allowed RPC traffic is explicitly measured against the local node.
- [ ] Fix failures, then rerun failed/affected checks. Record commands, results, network/deployment fixture IDs and remaining actual-provider blockers. Never mark a replica as a completed external provider integration. Optional public testnet compatibility evidence is recorded separately and is not needed for replica completion.
- [ ] Review full branch, update implementation checklist and commit `test: validate V3ST onchain backend and testnet containment`. Hand off API examples, evidence matrix and runbook. No production credential, private key, generated artifact or deployment is included.

## Coverage and completion criteria

| Requirement | Owning tasks |
| --- | --- |
| Backend/API only, testnet execution, every provider labelled accurately | 1, 3–8, 13–15 |
| Existing fiat rails joined to onchain stocks without client signing/gas | 4, 9, 13 |
| All six requested providers with distinct capabilities and limitations | 5–8, 14 |
| Base stock identity, native-B20 caveat, corporate actions and correct valuation | 2–3, 10 |
| Extra income source, eligibility, losses, receipt-backed conversion and Friday settlement | 7–8, 11–12 |
| Exact amounts, reservations, immutable ledger and crash recovery | 2, 4, 9–12 |
| No silent custody/provider/mode switch; sponsor failure is resumable | 1, 4, 6, 9 |
| API ownership, consent/revocation, operator access, SSE and error contracts | 4, 13–14 |
| No mainnet dependency or unsupported real provider activation | 1, 3–8, 15 |
| Review Focus conditions and final-only verification | Tests in owning tasks; 15 |

The backend is complete when the local-testnet API journey and all failure/containment cases pass and each provider's status is truthful. Verified external-provider testnet support remains separately disabled unless evidence is added. The user approved replicas as the fallback, so these commercial/access gaps must not leave the backend unfinished.
