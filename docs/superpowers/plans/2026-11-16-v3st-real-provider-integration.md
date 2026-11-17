# V3ST Real Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run V3ST's stock trades and income strategy on Hydrex's real Base Sepolia contracts with live stock reference data, and add a mainnet pilot path (o1 spot, Hydrex liquidity) that stays closed until the operator signs a recorded approval.

**Architecture:** Chain access becomes multi-network, resolved from each operation's `context.chainId`, so the local replica path is untouched and a second target (Base Sepolia, 84532) runs beside it. A real Hydrex adapter builds router and position-manager calls with viem against the ABIs in the pinned Hydrex SDK; the existing quote → consent → policy check → sign → finality → ledger pipeline is reused. Mainnet (8453) is a third target behind a gate that requires a committed approval file whose hash matches the environment.

**Tech Stack:** Node 24.15.0, Yarn 1.22.22, Next.js 15, TypeScript, Prisma 6/PostgreSQL, Zod 3, Vitest 5, viem 2.57.19, Foundry 1.9.0. New dependency: `@hydrexfi/hydrex-sdk@1.2.8` (exact).

**Spec:** [Real provider integration design](../specs/2026-11-16-v3st-real-provider-integration-design.md). Also read [Design.md](../../../Design.md), the [2026-11-14 onchain spec](../specs/2026-11-14-v3st-onchain-stocks-and-income-design.md), [BACKEND_PATTERNS.md](../../../BACKEND_PATTERNS.md) and [CLAUDE.md](../../../CLAUDE.md).

## Global Constraints

- `APP_STAGE=beta` stays mandatory, independent of `NODE_ENV`.
- Allowed chains: `31337` (loopback only), `84532` (only `verified_provider_testnet`, only provider `hydrex`), `8453` (only when the Phase B gate is open). Chain `1` and every other ID are rejected.
- The only non-loopback RPC hosts allowed are the exact hosts of `BASE_SEPOLIA_RPC_URL` and, with the gate open, `BASE_MAINNET_RPC_URL`. HTTPS only. The node's reported chain ID must match.
- The only mainnet read allowed in Phase A is `GET https://api.coinbase.com/v1/tokenized-stocks` and its documented sub-paths.
- Hydrex Base Sepolia addresses, from `@hydrexfi/hydrex-sdk@1.2.8`: pool deployer `0x9cb57c3E31D50fa5c273eC0a5A51cF9cb3B127A7`, position manager `0xb7875b8Dc8f49c2D6BBb658905dBF88843B54Da8`, swap router `0x10Dcb20d06fbC1461D21D6b31E54042D656C67FC`.
- Base Sepolia asset keys use `basesepolia:84532:<lowercase address>`. Stand-in stock names end with `(test token)`.
- Confirmations: 2 on 31337, 3 on 84532, 5 on 8453.
- An operation never changes network, provider or custody profile after creation.
- No private key in source control, fixtures, logs or API output. The Base Sepolia relayer key is never the local test key.
- Never use conditional or optional object spread; assign with `if`.
- Routes use `withMiddleware`; only services touch Prisma; DTOs are snake_case with integer-string amounts.
- CI runs with no network and no Base Sepolia credentials. Tests that need the live chain are skipped unless `SEPOLIA_LIVE=1`.
- **Do not run `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build` or `forge test` between tasks.** Write each task's tests with the task; run the whole gate once in Task 10 (Phase A) and Task 14 (Phase B).
- Commit after each task. No `Co-Authored-By` or "Generated with" lines in commit messages.
- **Phase B (Tasks 11–14) must not be started until the operator has said so in writing.** Phase B code never sends a mainnet transaction during implementation or testing.

## Review Focus

1. A Base Sepolia operation whose relayer nonce or confirmations are read from the local node (or the reverse) must fail closed, not broadcast. Test in Task 2.
2. A Hydrex plan whose `recipient`, token pair, `tokenId` or minimum differs from the accepted quote, or that uses `multicall`, must be rejected even though the target contract is approved. Test in Task 8.
3. A `collect` on exit must not count returned principal as income, and a `collect` that pays zero must create no receipt. Test in Task 9.
4. A stale, missing or malformed stocks API response must leave the catalog unchanged and block new trades, never write a zero or guessed price. Test in Task 5.
5. With the approval file edited, missing, or its hash mismatched, chain 8453 must be rejected in every code path, including with `MAINNET_PILOT=enabled`. Test in Task 11.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/backend/integrations/onchain-policy.ts` (modify) | Chain, RPC-host and context rules for three targets |
| `src/backend/integrations/provider-evidence.ts` (modify) | Hydrex verified on 84532; o1 evidence refreshed |
| `src/backend/integrations/mainnet-gate.ts` (create, Phase B) | Approval-file gate and pilot caps |
| `src/backend/services/onchain/chains.ts` (create) | Per-network client, relayer, manifest, confirmations |
| `src/backend/services/onchain/manifests.ts` (create) | Read and verify a network's deployment manifest |
| `src/backend/services/wallets/execution-accounts.ts` (create) | One execution account per user per network |
| `src/backend/services/onchain/providers/hydrex/actual.ts` (create) | Real Hydrex spot and strategy adapters |
| `src/backend/services/onchain/providers/hydrex/pool.ts` (create) | Pool reads and constant-product quote math |
| `src/backend/services/onchain/providers/hydrex/events.ts` (create) | Parse `Collect`, `IncreaseLiquidity`, `DecreaseLiquidity` |
| `src/backend/services/execution/hydrex-policy.ts` (create) | Call-level rules for Hydrex contracts |
| `src/backend/services/stocks/base-stocks-client.ts` (create) | HTTP client for Base's Tokenized Stocks API |
| `src/backend/services/stocks/reference.ts` (modify) | Parse the real response shape; stand-in mapping |
| `src/backend/services/onchain/providers/o1/actual.ts` (create, Phase B) | o1 Trading API adapter |
| `scripts/sepolia-deploy.ts`, `scripts/sepolia-smoke.ts` (create) | Deploy stand-ins and pool; run the live journey |
| `prisma/schema.prisma` + one migration per phase | `ExecutionAccount`, `PilotSpend` |

---

# Phase A — Hydrex on Base Sepolia

### Task 1: Policy and evidence for Base Sepolia

**Files:**
- Modify: `src/backend/integrations/onchain-policy.ts`, `src/backend/integrations/provider-evidence.ts`, `src/env.js`, `.env.example`
- Modify: `docs/decisions/onchain-providers.md`
- Test: `tests/unit/onchain-policy.test.ts`

**Interfaces:**
- Produces:
  - `parseRpcEndpoint(url: string, chainId: number): RpcEndpoint` where `RpcEndpoint = { url: string; loopback: boolean; chainId: number }`
  - `assertChainIdAllowed(chainId: number): void` (unchanged name; new rules)
  - `ALLOWED_REFERENCE_HOST = "api.coinbase.com"`
  - Env: `BASE_SEPOLIA_RPC_URL` (optional URL), `BASE_SEPOLIA_RELAYER_PRIVATE_KEY` (optional `0x` + 64 hex)

- [ ] **Step 1: Add tests to `tests/unit/onchain-policy.test.ts`**

```ts
it("allows Base Sepolia only for hydrex as a verified provider testnet", () => {
  const sepolia = replicaContext({ integrationKind: "verified_provider_testnet", mode: "sandbox", chainId: 84532, providerId: "hydrex", networkId: "basesepolia:84532" });
  expect(() => assertOnchainContext(sepolia)).not.toThrow();
  expect(() => assertOnchainContext({ ...sepolia, providerId: "o1" })).toThrow(/verified testnet evidence/i);
  expect(() => assertOnchainContext({ ...sepolia, integrationKind: "local_testnet_replica", mode: "simulated" })).toThrow();
  expect(() => assertOnchainContext({ ...sepolia, chainId: 8453 })).toThrow();
});

it("accepts a non-loopback RPC only for the configured Base Sepolia host over https", () => {
  process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
  expect(parseRpcEndpoint("https://sepolia.base.org", 84532).loopback).toBe(false);
  expect(() => parseRpcEndpoint("http://sepolia.base.org", 84532)).toThrow();
  expect(() => parseRpcEndpoint("https://mainnet.base.org", 84532)).toThrow();
  expect(() => parseRpcEndpoint("https://sepolia.base.org", 31337)).toThrow();
  expect(parseRpcEndpoint("http://127.0.0.1:8545", 31337).loopback).toBe(true);
});
```

Update the existing `rejectsUnverifiedProviderTestnet` and `rejectsMainnetEvenInProduction` cases to pass the new `chainId` argument; keep their assertions for `bankr` and chains `8453` and `1`.

- [ ] **Step 2: Implement the policy changes**

`assertChainIdAllowed` accepts `31337` and `84532`, rejects everything else with the existing mainnet message for `8453` and `1`. `parseRpcEndpoint(url, chainId)`: chain `31337` requires a loopback host; chain `84532` requires `https:` and a host equal to `new URL(env.BASE_SEPOLIA_RPC_URL).host`. In `assertOnchainContext`, the `verified_provider_testnet` branch is unchanged (it already checks evidence status and chain ID).

- [ ] **Step 3: Update evidence**

In `provider-evidence.ts` set `hydrex.testnetEvidence` to `{ status: "verified", chainId: 84532, detail: "@hydrexfi/hydrex-sdk@1.2.8 lists Base Sepolia pool deployer, position manager and swap router; all three return code from sepolia.base.org (checked 2026-11-16). Stock pool is V3ST-deployed with a stand-in token." }`. Add `{ label: "Hydrex SDK", url: "https://github.com/hydrexfi/hydrex-sdk", checkedAt: "2026-11-16" }`. Widen `betaAdapter` to `"local_testnet_replica" | "verified_provider_testnet" | "disabled"` and leave Hydrex's value as `local_testnet_replica` (the registry change comes in Task 9). Replace o1's first documentation entry with `{ label: "Trading API (unsigned transactions)", url: "https://docs.o1.exchange/api/trading.md", checkedAt: "2026-11-16" }`.

- [ ] **Step 4: Add env vars** to `src/env.js` (`server` and `runtimeEnv`) and `.env.example`, both optional, with a comment that the relayer key must be a fresh testnet-only key.

- [ ] **Step 5: Update `docs/decisions/onchain-providers.md`** — add a dated "2026-11-16 amendment" section stating the Phase A policy changes from the spec, and update the Hydrex and o1 rows of the evidence matrix.

- [ ] **Step 6: Commit**

```bash
git add src/backend/integrations src/env.js .env.example docs/decisions/onchain-providers.md tests/unit/onchain-policy.test.ts
git commit -m "feat: allow Hydrex on Base Sepolia as a verified provider testnet"
```

### Task 2: Multi-network chain access

**Files:**
- Create: `src/backend/services/onchain/chains.ts`, `src/backend/services/onchain/manifests.ts`
- Modify: `src/backend/services/onchain/testnet.ts`, `src/backend/services/execution/index.ts`, `src/backend/services/execution/nonce.ts`, `src/backend/services/execution/receipts.ts`, `src/backend/services/execution/policy.ts`, `src/backend/services/reconciliation/onchain.ts`, `src/backend/config/policy.ts`
- Test: `tests/unit/chains.test.ts`

**Interfaces:**
- Consumes: `parseRpcEndpoint(url, chainId)` from Task 1.
- Produces:

```ts
// manifests.ts
export type NetworkManifest = Omit<TestnetManifest, "integrationKind" | "mode"> & {
  integrationKind: IntegrationKind;
  mode: "sandbox" | "simulated";
  external: Record<string, { address: Address; codeHash: string }>; // provider-owned contracts
};
export function manifestFor(chainId: number): NetworkManifest; // .testnet/manifest.json or .testnet/base-sepolia/manifest.json
export function verifyManifest(chainId: number): Promise<{ ok: true } | { ok: false; reason: string }>;

// chains.ts
export type ChainTarget = { chainId: number; rpcUrl: string; confirmations: number; canMine: boolean };
export function chainTarget(chainId: number): ChainTarget;
export function publicClientOn(chainId: number): PublicClient;
export function walletClientOn(chainId: number): WalletClient; // signs with relayerOn(chainId)
export function relayerOn(chainId: number): PrivateKeyAccount;
export function contextOn(chainId: number, providerId: StockProviderId, providerVersion: string, custodyProfileId: string): Promise<BetaContext>;
```

- `policy.onchain.confirmations = { 31337: 2, 84532: 3, 8453: 5 }` replaces the single `requiredConfirmations` for chain-aware callers.

- [ ] **Step 1: Write `tests/unit/chains.test.ts`**

```ts
it("resolves each network to its own RPC, relayer and confirmations", () => {
  process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
  process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY = `0x${"11".repeat(32)}`;
  expect(chainTarget(31337)).toMatchObject({ confirmations: 2, canMine: true });
  expect(chainTarget(84532)).toMatchObject({ rpcUrl: "https://sepolia.base.org", confirmations: 3, canMine: false });
  expect(relayerOn(84532).address).not.toBe(relayerOn(31337).address);
});

it("fails closed when Base Sepolia is not configured or the chain is unknown", () => {
  delete process.env.BASE_SEPOLIA_RPC_URL;
  expect(() => chainTarget(84532)).toThrow(/not configured/i);
  expect(() => chainTarget(8453)).toThrow();
  expect(() => chainTarget(10)).toThrow();
});
```

- [ ] **Step 2: Implement `manifests.ts` and `chains.ts`.** `rpcRequest` in `testnet.ts` gains a required `chainId` parameter and uses `https` when the endpoint is not loopback. `publicClientOn(84532)` must verify `eth_chainId === 84532` on first use and cache the client per chain. `relayerOn(31337)` returns the existing keystore relayer; `relayerOn(84532)` reads `BASE_SEPOLIA_RELAYER_PRIVATE_KEY`. Keep `publicClientFor()`, `readManifest()`, `relayerAccount()` and `walletClientFor()` as thin local-only wrappers so replica files need no edits.

- [ ] **Step 3: Thread `chainId` through the shared execution path.** In `execution/index.ts`, `nonce.ts`, `receipts.ts`, `policy.ts` and `reconciliation/onchain.ts`, replace every `publicClientFor()`, `readManifest()`, `relayerAccount()` and `walletClientFor()` call with the `*On(chainId)` form, taking `chainId` from the operation's stored context (`plan.context.chainId` / the operation's network row). New signatures:

```ts
allocateRelayerNonce(tx: Tx, chainId: number): Promise<number>
accountOperationNonce(accountAddress: Address, chainId: number): Promise<bigint>
currentBlockNumber(chainId: number): Promise<bigint>
readTokenBalance(asset: string, account: Address): Promise<bigint> // chainId from parseAssetKey(asset)
fetchReceipt(txHash: Hex, chainId: number): Promise<ReceiptView | null>
requiredConfirmations(chainId: number): number
```

`allocateRelayerNonce` takes its advisory lock on `72_011n + BigInt(chainId)` and filters prior operations by that network's `deploymentId`. Anywhere the code mines blocks (`anvil_mine`), guard with `chainTarget(chainId).canMine`; on Base Sepolia it waits for confirmations instead.

- [ ] **Step 4: Add the Review Focus 1 test** to `tests/unit/chains.test.ts`:

```ts
it("never uses the local node for a Base Sepolia operation", async () => {
  process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
  const seen: string[] = [];
  __setRpcTransportForTests((url) => { seen.push(url); throw new Error("offline"); });
  await expect(currentBlockNumber(84532)).rejects.toThrow("offline");
  expect(seen).toEqual(["https://sepolia.base.org"]);
});
```

Export `__setRpcTransportForTests(fn)` from `chains.ts` to replace the HTTP transport in tests.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/onchain src/backend/services/execution src/backend/services/reconciliation src/backend/config/policy.ts tests/unit/chains.test.ts
git commit -m "refactor: resolve chain access per network from operation context"
```

### Task 3: Execution accounts and sponsor budgets per network

**Files:**
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/20261116000000_execution_accounts/migration.sql`
- Create: `src/backend/services/wallets/execution-accounts.ts`
- Modify: `src/backend/services/wallets/testnet.ts`, `src/backend/services/execution/index.ts` (sponsor budget scope)
- Test: `tests/integration/execution-accounts.test.ts`

**Interfaces:**
- Consumes: `publicClientOn`, `walletClientOn`, `relayerOn`, `manifestFor` from Task 2.
- Produces:

```prisma
model ExecutionAccount {
    id               String   @id @default(cuid())
    walletId         String
    chainId          Int
    deploymentId     String
    address          String
    custodyProfileId String
    createdAt        DateTime @default(now())

    @@unique([walletId, deploymentId])
    @@map("execution_accounts")
}
```

```ts
export const executionAccounts: {
  ensure(userId: string, chainId: number): Promise<ExecutionAccountRef>; // deploys TestExecutionAccount on first use
  find(userId: string, chainId: number): Promise<ExecutionAccountRef | null>;
};
```

- `StrategyPosition` gains `externalTokenId Decimal? @db.Decimal(78, 0)` (the Hydrex position NFT id; null for replica positions). `receiptRaw` holds the position's liquidity.
- Sponsor budget scope string becomes `relayer:<chainId>:<YYYY-MM-DD>`. Caps: `policy.onchain.sponsor` gains `byChain: { 84532: { dailyCapWei: 2n * 10n ** 16n, perOperationCapWei: 2n * 10n ** 15n } }`; chain 31337 keeps the existing values.

- [ ] **Step 1: Write the test** — against the local chain only:

```ts
it("gives a user one execution account per network and reuses it", async () => {
  const user = await factories.user();
  const a = await executionAccounts.ensure(user.id, 31337);
  const b = await executionAccounts.ensure(user.id, 31337);
  expect(b.accountAddress).toBe(a.accountAddress);
  expect(await db.executionAccount.count({ where: { walletId: a.wallet.id } })).toBe(1);
  expect(await executionAccounts.find(user.id, 84532)).toBeNull();
});
```

- [ ] **Step 2: Add the model and migration.** The migration also backfills one `execution_accounts` row for every wallet with a non-null `executionAddress`, using its `deploymentId` and `custodyProfileId` and `chainId = 31337`.
- [ ] **Step 3: Implement `executionAccounts`** by moving the deploy logic out of `TestnetWalletService.ensureExecutionAccount`, which becomes `executionAccounts.ensure(userId, 31337)`. Keep writing `Wallet.executionAddress` for chain 31337 so existing readers work. `CustodyProfile` uniqueness is `(kind, walletId)`, so on Base Sepolia reuse the wallet's `application_account` profile.
- [ ] **Step 4: Scope sponsor budgets by chain** where `SponsorBudget` rows are read and written.
- [ ] **Step 5: Commit**

```bash
git add prisma src/backend/services/wallets src/backend/services/execution tests/integration/execution-accounts.test.ts
git commit -m "feat: track execution accounts and gas budgets per network"
```

### Task 4: Base Sepolia deployment and Hydrex pool

**Files:**
- Create: `scripts/sepolia-deploy.ts`, `src/backend/services/onchain/providers/hydrex/pool.ts`
- Modify: `package.json` (add `"sepolia:deploy"` script and `"@hydrexfi/hydrex-sdk": "1.2.8"`), `.gitignore` (confirm `.testnet/` covers `.testnet/base-sepolia/`)
- Test: `tests/unit/hydrex-pool.test.ts`

**Interfaces:**
- Consumes: `walletClientOn(84532)`, `publicClientOn(84532)`, `loadArtifact` (existing).
- Produces:

```ts
// pool.ts
export const algebraPoolAbi: Abi; // globalState(), liquidity(), tickSpacing(), token0(), token1()
export type PoolState = { address: Address; token0: Address; token1: Address; sqrtPriceX96: bigint; tick: number; feePips: number; liquidity: bigint; tickSpacing: number };
export function readPool(chainId: number, pool: Address): Promise<PoolState>;
export function quoteExactIn(state: PoolState, tokenIn: Address, amountIn: bigint): { amountOut: bigint; priceImpactBps: number };
export function fullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number };
export function sqrtPriceX96For(token0PerToken1Num: bigint, token0PerToken1Den: bigint): bigint;
```

- Manifest written to `.testnet/base-sepolia/manifest.json` with `contracts: { TestSettlementToken, StockTokenAAPL }`, `external: { HydrexPoolDeployer, HydrexPositionManager, HydrexSwapRouter, HydrexPoolAAPL }`, `networkId: "basesepolia:84532"`, `integrationKind: "verified_provider_testnet"`, `mode: "sandbox"`.

- [ ] **Step 1: Write `tests/unit/hydrex-pool.test.ts`**

```ts
const state: PoolState = { address: "0x00000000000000000000000000000000000000aa", token0: "0x0000000000000000000000000000000000000001", token1: "0x0000000000000000000000000000000000000002", sqrtPriceX96: 2n ** 96n, tick: 0, feePips: 3000, liquidity: 1_000_000_000n, tickSpacing: 60 };

it("quotes constant-product output net of the pool fee", () => {
  const { amountOut } = quoteExactIn(state, state.token0, 1_000_000n);
  expect(amountOut).toBe(996_006n); // x=y=1e9; in*(1-0.3%)=997000; out = 1e9*997000/(1e9+997000)
});

it("returns ticks aligned to spacing and symmetric around zero", () => {
  const { tickLower, tickUpper } = fullRangeTicks(60);
  expect(tickLower % 60).toBe(0);
  expect(tickUpper).toBe(-tickLower);
  expect(tickUpper).toBe(887_220);
});

it("rejects a token that is not in the pool", () => {
  expect(() => quoteExactIn(state, "0x0000000000000000000000000000000000000003", 1n)).toThrow();
});
```

- [ ] **Step 2: Implement `pool.ts`.** Virtual reserves: `x = liquidity * 2^96 / sqrtPriceX96`, `y = liquidity * sqrtPriceX96 / 2^96`; `amountInAfterFee = amountIn * (1_000_000 - feePips) / 1_000_000`; `amountOut = reserveOut * amountInAfterFee / (reserveIn + amountInAfterFee)`, all floor division on bigint. `priceImpactBps = amountInAfterFee * 10_000 / (reserveIn + amountInAfterFee)`. `algebraPoolAbi` declares `globalState() returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)`, `liquidity() returns (uint128)`, `tickSpacing() returns (int24)`, `token0()`, `token1()`.

- [ ] **Step 3: Write `scripts/sepolia-deploy.ts`.** It must, in order: call `assertBetaRuntime(process.env)`; require `BASE_SEPOLIA_RPC_URL` and `BASE_SEPOLIA_RELAYER_PRIVATE_KEY`; refuse to run if `eth_chainId !== 84532`; read `eth_getCode` for the three Hydrex addresses and abort if any is `0x`; deploy `TestSettlementToken` and `TestStockToken` (name `Apple Inc. (test token)`, symbol `tAAPL`, 6 decimals); mint 1,000,000 test USDC and the equal-value stock amount at the price passed as `--price-micro-usd`; approve the position manager; call `createAndInitializePoolIfNecessary` then `mint` (full range, recipient = relayer) using `hydrexPositionManagerABI` from the SDK, simulating each with `publicClient.simulateContract` before sending; read the pool address with the SDK's `computePoolAddress`; write the manifest with `sha256` code hashes for every address.

- [ ] **Step 4: Verify the pool read ABI against the deployed pool** (live, operator runs once):

Run: `yarn sepolia:deploy --price-micro-usd 250000000` then `cast call <HydrexPoolAAPL> "globalState()(uint160,int24,uint16,uint8,uint16,bool)" --rpc-url $BASE_SEPOLIA_RPC_URL`
Expected: six values, first non-zero. **If the call reverts or returns a different shape, stop and report; do not guess another signature.**

- [ ] **Step 5: Commit**

```bash
git add scripts/sepolia-deploy.ts src/backend/services/onchain/providers/hydrex/pool.ts package.json yarn.lock tests/unit/hydrex-pool.test.ts
git commit -m "feat: deploy stock stand-in and Hydrex pool on Base Sepolia"
```

### Task 5: Live stock reference data

**Files:**
- Create: `src/backend/services/stocks/base-stocks-client.ts`, `tests/contracts/fixtures/onchain/base-stocks-live.json`
- Modify: `src/backend/services/stocks/reference.ts`, `src/backend/services/stocks/index.ts`, `src/backend/workers/handlers.ts`, `src/backend/services/jobs/schedule.ts`, `src/backend/config/policy.ts`
- Test: `tests/contracts/onchain/base-reference.test.ts`

**Interfaces:**
- Produces:

```ts
// base-stocks-client.ts
export const BASE_STOCKS_URL = "https://api.coinbase.com/v1/tokenized-stocks";
export function fetchStocksPage(pageToken: string | null): Promise<unknown>; // GET only, 10s timeout, no redirects

// reference.ts
stockReference.parseLive(input: unknown): { stocks: ReferenceStock[]; next: string | null };
export function standInFor(stock: Stock): string | null; // provenance.standInFor assetKey, e.g. "base:8453:0xb2…fb"

// stocks/index.ts
stockService.syncReference(): Promise<{ updated: number; skipped: number }>;
```

- Job `stocks.reference_sync` every `policy.schedule.referenceSyncSeconds = 30`.

- [ ] **Step 1: Record a real fixture**

Run: `curl -sS "https://api.coinbase.com/v1/tokenized-stocks?page_size=5" > tests/contracts/fixtures/onchain/base-stocks-live.json`
Expected: JSON with a top-level `tokens` array whose items have `contract_address`, `symbol`, `name`, `decimals`, `multiplier`, `nav_price`, `nav_price_updated_at`. **If the shape differs, stop and report the actual shape before writing the parser.**

- [ ] **Step 2: Write tests in `base-reference.test.ts`**

```ts
it("parses the live response shape into reference stocks", () => {
  const { stocks } = stockReference.parseLive(liveFixture);
  expect(stocks.length).toBe(5);
  for (const s of stocks) {
    expect(s.assetKey).toBe(`base:8453:${s.address}`);
    expect(s.multiplierWad > 0n).toBe(true);
    expect(s.referenceBasis).toBe("token_nav");
  }
});

it("converts decimal multiplier and price exactly", () => {
  const { stocks } = stockReference.parseLive({ tokens: [{ ...liveFixture.tokens[0], multiplier: "1.5", nav_price: "250.123456" }] });
  expect(stocks[0]!.multiplierWad).toBe(1_500_000_000_000_000_000n);
  expect(stocks[0]!.referencePriceMicroUsd).toBe(250_123_456n);
});

it("rejects malformed payloads without partial results", () => {
  expect(() => stockReference.parseLive({ tokens: [{ symbol: "AAPL" }] })).toThrow(ReferenceParseError);
  expect(() => stockReference.parseLive({ data: [] })).toThrow(ReferenceParseError);
});

it("leaves the catalog untouched when the API fails", async () => {
  const before = await db.stock.findMany({ orderBy: { id: "asc" } });
  __setStocksFetchForTests(async () => { throw new Error("503"); });
  await expect(stockService.syncReference()).rejects.toThrow();
  expect(await db.stock.findMany({ orderBy: { id: "asc" } })).toEqual(before);
});
```

- [ ] **Step 3: Implement.** `parseLive` uses a strict Zod schema for the documented fields and converts decimals with string arithmetic (no `Number`): multiplier to 18 decimals, `nav_price` to 6, truncating extra digits. Accept `multiplier` and `nav_price` as string or number in the schema, but convert via `String(value)`. `syncReference` pages until `next_page_token` is absent, then in one transaction updates `referencePriceMicroUsd`, `referenceBasis`, `referenceAsOf`, `multiplierWad` on (a) rows whose `assetKey` matches and (b) rows whose `provenance.standInFor` matches. It never creates or enables rows. `evaluateReference` is unchanged.

- [ ] **Step 4: Register the job** in `jobs/schedule.ts` and `workers/handlers.ts`, skipped unless `BASE_SEPOLIA_RPC_URL` is set.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/stocks src/backend/services/jobs src/backend/workers src/backend/config/policy.ts tests/contracts
git commit -m "feat: sync stock reference prices from Base's tokenized stocks API"
```

### Task 6: Hydrex spot adapter

**Files:**
- Create: `src/backend/services/onchain/providers/hydrex/actual.ts`
- Test: `tests/contracts/onchain/hydrex-actual.test.ts`

**Interfaces:**
- Consumes: `readPool`, `quoteExactIn` (Task 4); `manifestFor(84532)` (Task 2); `executionAccounts.find` (Task 3); `planFingerprint`, `chainDeadlineBounded` (existing; pass `chainId`).
- Produces:

```ts
export const hydrexActualCapabilities: ProviderCapabilities; // kind: "verified_provider_testnet", spot: true, liquidity: true, separateClaim: true, exactOutput: false, custody: "application_account", evidenceId: "evidence:hydrex"
export const hydrexActualSpot: SpotAdapter;
export const HYDREX_ACTUAL_VERSION = "hydrex-sdk-1.2.8";
export function __setPoolReaderForTests(fn: typeof readPool): void;
```

- [ ] **Step 1: Write tests** with a stubbed pool reader and a stubbed manifest (no network):

```ts
it("prepares an exact approve plus exactInputSingle to the Hydrex router", async () => {
  const quote = await hydrexActualSpot.quote(buyRequest({ inputRaw: 1_000_000n, slippageBps: 50 }));
  expect(quote.minOutput.raw).toBe((quote.expectedOutput.raw * 9_950n) / 10_000n);
  const plan = await hydrexActualSpot.prepare(quote, "op-1");
  expect(plan.calls).toHaveLength(2);
  expect(plan.calls[0]!.to.toLowerCase()).toBe(USDC);
  const approve = decodeFunctionData({ abi: erc20Abi, data: plan.calls[0]!.data });
  expect(approve.args).toEqual([ROUTER, 1_000_000n]);
  const swap = decodeFunctionData({ abi: hydrexSwapRouterABI, data: plan.calls[1]!.data });
  expect(swap.functionName).toBe("exactInputSingle");
  expect(swap.args![0]).toMatchObject({ tokenIn: USDC, tokenOut: STOCK, recipient: ACCOUNT, amountIn: 1_000_000n, amountOutMinimum: quote.minOutput.raw, limitSqrtPrice: 0n });
  expect(plan.calls.every((c) => c.value === 0n)).toBe(true);
});

it("refuses a context that is not Base Sepolia verified testnet", async () => {
  await expect(hydrexActualSpot.quote(buyRequest({ chainId: 31337 }))).rejects.toThrow();
});

it("refuses when price impact exceeds policy", async () => {
  await expect(hydrexActualSpot.quote(buyRequest({ inputRaw: 10n ** 12n }))).rejects.toThrow(/price impact/i);
});
```

- [ ] **Step 2: Implement `hydrexActualSpot`.** `quote`: read the pool from `manifestFor(84532).external.HydrexPoolAAPL`, compute with `quoteExactIn`, set `venueFee` from `feePips`, `userFeeUsdc: 0n`, `sourceBlock` from the client, `expiresAt` = now + `policy.onchain.quoteTtlSeconds`, `allowPartialFill: false`. `prepare`: `exactInputSingle` params are `{ tokenIn, tokenOut, deployer: zeroAddress, recipient: <user's execution account>, deadline, amountIn, amountOutMinimum, limitSqrtPrice: 0n }`, encoded with `hydrexSwapRouterABI` from `@hydrexfi/hydrex-sdk`.

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/onchain/providers/hydrex/actual.ts tests/contracts/onchain/hydrex-actual.test.ts
git commit -m "feat: add real Hydrex spot adapter for Base Sepolia"
```

### Task 7: Hydrex strategy adapter

**Files:**
- Modify: `src/backend/services/onchain/providers/hydrex/actual.ts`
- Test: `tests/contracts/onchain/hydrex-actual.test.ts`

**Interfaces:**
- Consumes: `fullRangeTicks`, `readPool` (Task 4); SDK `Position`, `Pool`, `Token`.
- Produces: `export const hydrexActualStrategy: StrategyAdapter;` Strategy `provenance` for a real position: `{ kind: "hydrex_nft", chainId: 84532, pool: Address, positionManager: Address, stockId: string }`. A real position stores the NFT id in `StrategyPosition.externalTokenId` (Task 3) and its liquidity in `receiptRaw`.

- [ ] **Step 1: Write tests**

```ts
it("enter mints a full-range position owned by the execution account", async () => {
  const quote = await hydrexActualStrategy.quote(enterRequest({ usdc: 1_000_000n, stock: 4_000n }));
  const plan = await hydrexActualStrategy.prepare(quote, "op-2");
  expect(plan.calls.map((c) => c.to.toLowerCase())).toEqual([USDC, STOCK, POSITION_MANAGER]);
  const mint = decodeFunctionData({ abi: hydrexPositionManagerABI, data: plan.calls[2]!.data });
  expect(mint.functionName).toBe("mint");
  expect(mint.args![0]).toMatchObject({ recipient: ACCOUNT, tickLower: -887_220, tickUpper: 887_220 });
});

it("claim collects to the execution account for the stored token id", async () => {
  const plan = await hydrexActualStrategy.prepare(await hydrexActualStrategy.quote(claimRequest({ tokenId: "42" })), "op-3");
  expect(plan.calls).toHaveLength(1);
  const collect = decodeFunctionData({ abi: hydrexPositionManagerABI, data: plan.calls[0]!.data });
  expect(collect.args![0]).toMatchObject({ tokenId: 42n, recipient: ACCOUNT });
});

it("exit decreases all liquidity then collects, with minimums from the quote", async () => {
  const quote = await hydrexActualStrategy.quote(exitRequest({ tokenId: "42" }));
  const plan = await hydrexActualStrategy.prepare(quote, "op-4");
  const names = plan.calls.map((c) => decodeFunctionData({ abi: hydrexPositionManagerABI, data: c.data }).functionName);
  expect(names).toEqual(["decreaseLiquidity", "collect"]);
});
```

- [ ] **Step 2: Implement.** Enter: compute desired amounts with SDK `Position.fromAmounts({ pool, tickLower, tickUpper, amount0, amount1, useFullPrecision: true })`; `amount0Min`/`amount1Min` = desired × (10_000 − slippageBps) / 10_000; `maximumInputs` are the desired amounts ordered to match `request.inputs`. Claim: `collect({ tokenId, recipient, amount0Max: 2n**128n-1n, amount1Max: 2n**128n-1n })`. Exit: read `positions(tokenId).liquidity` on chain, `decreaseLiquidity({ tokenId, liquidity, amount0Min, amount1Min, deadline })` then the same `collect`. The position is not burned.

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/onchain/providers/hydrex/actual.ts tests/contracts/onchain/hydrex-actual.test.ts
git commit -m "feat: add real Hydrex liquidity strategy adapter"
```

### Task 8: Execution policy rules for Hydrex

**Files:**
- Create: `src/backend/services/execution/hydrex-policy.ts`
- Modify: `src/backend/services/execution/policy.ts`
- Test: `tests/unit/hydrex-policy.test.ts`

**Interfaces:**
- Consumes: `manifestFor(chainId)` (Task 2); `ExecutionPlanRejected` (existing).
- Produces: `export function assertHydrexCall(call: PreparedCall, plan: ExecutionPlan | StrategyPlan, external: NetworkManifest["external"], ownedTokenId: bigint | null): boolean` — returns `false` if the target is not a Hydrex contract, `true` if it validated, throws `ExecutionPlanRejected` otherwise.

- [ ] **Step 1: Write tests** (build plans with the Task 6/7 adapters, then mutate one field per case):

```ts
it.each([
  ["recipient", (a: any) => ({ ...a, recipient: ATTACKER })],
  ["tokenOut", (a: any) => ({ ...a, tokenOut: OTHER_TOKEN })],
  ["amountIn", (a: any) => ({ ...a, amountIn: a.amountIn + 1n })],
  ["amountOutMinimum", (a: any) => ({ ...a, amountOutMinimum: a.amountOutMinimum - 1n })],
  ["deployer", (a: any) => ({ ...a, deployer: ATTACKER })],
])("rejects a swap whose %s differs from the accepted quote", async (_n, mutate) => {
  await expect(assertExecutionPlan(await swapPlanWith(mutate))).rejects.toThrow(ExecutionPlanRejected);
});

it("rejects multicall, permits and farming calls on Hydrex contracts", async () => {
  for (const fn of ["multicall", "selfPermit", "approveForFarming", "burn", "safeTransferFrom"]) {
    await expect(assertExecutionPlan(await planWithRawCall(POSITION_MANAGER, fn))).rejects.toThrow(ExecutionPlanRejected);
  }
});

it("rejects collect or decreaseLiquidity for a token id the position does not own", async () => {
  await expect(assertExecutionPlan(await claimPlan({ planTokenId: 43n, ownedTokenId: 42n }))).rejects.toThrow(/token id/i);
});

it("rejects mint ticks that are not full range and recipients other than the account", async () => {
  await expect(assertExecutionPlan(await mintPlanWith((a: any) => ({ ...a, tickLower: -60 })))).rejects.toThrow();
  await expect(assertExecutionPlan(await mintPlanWith((a: any) => ({ ...a, recipient: ATTACKER })))).rejects.toThrow();
});

it("accepts the unmodified swap, mint, collect and exit plans", async () => {
  for (const plan of [await swapPlanWith((a) => a), await mintPlanWith((a) => a), await claimPlan({ planTokenId: 42n, ownedTokenId: 42n }), await exitPlan()]) {
    await expect(assertExecutionPlan(plan)).resolves.toBeUndefined();
  }
});
```

- [ ] **Step 2: Implement `assertHydrexCall`.** Allowed selectors only: router `exactInputSingle`; position manager `mint`, `collect`, `decreaseLiquidity`. Checks — swap: `tokenIn`/`tokenOut` equal the plan's input/minimum-output assets, `amountIn === expectedInput.raw`, `amountOutMinimum === minimumOutput.raw`, `recipient === plan.recipient`, `deployer === zeroAddress`, `limitSqrtPrice === 0n`, `deadline` equals the plan deadline in seconds. Mint: token pair equals the plan's two input assets, desired amounts ≤ `maximumInputs`, ticks equal `fullRangeTicks(spacing)`, recipient equals `plan.recipient`. Collect and decreaseLiquidity: `tokenId === ownedTokenId`, collect recipient equals `plan.recipient`, decrease minimums equal `minimumOutputs`.

- [ ] **Step 3: Wire into `policy.ts`.** `allowedTargets` adds `manifestFor(plan.context.chainId).external` addresses when the context is not local. In `assertCall`, call `assertHydrexCall` before the replica ABI loop and return when it returns `true`. Approvals: the existing spender rule already requires the spender to be a call target in the same plan; keep it. In the strategy source check at the end of `assertExecutionPlan`, treat `provenance.kind === "hydrex_nft"` as target = `provenance.positionManager`, and load `ownedTokenId` from `StrategyPosition.externalTokenId` (null on enter).

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/execution tests/unit/hydrex-policy.test.ts
git commit -m "feat: validate Hydrex router and position manager calls against accepted quotes"
```

### Task 9: Fee recognition, routing and registry

**Files:**
- Create: `src/backend/services/onchain/providers/hydrex/events.ts`
- Modify: `src/backend/services/onchain/registry.ts`, `src/backend/services/onchain/providers/index.ts`, `src/backend/services/onchain/providers/hydrex/index.ts`, `src/backend/services/investments/index.ts`, `src/backend/services/strategies/index.ts`, `scripts/seed-beta.ts`
- Test: `tests/unit/hydrex-events.test.ts`, `tests/unit/onchain-registry.test.ts`

**Interfaces:**
- Consumes: `contextOn` (Task 2), `executionAccounts.ensure` (Task 3), `hydrexActualSpot`, `hydrexActualStrategy` (Tasks 6–7).
- Produces:

```ts
// events.ts
export type HydrexFill =
  | { kind: "enter"; tokenId: bigint; liquidity: bigint; amount0: bigint; amount1: bigint }
  | { kind: "claim"; tokenId: bigint; fee0: bigint; fee1: bigint }
  | { kind: "exit"; tokenId: bigint; principal0: bigint; principal1: bigint; fee0: bigint; fee1: bigint };
export function parseHydrexFill(action: StrategyAction, logs: Log[], positionManager: Address, account: Address): HydrexFill;

// registry.ts — AdapterFactory gains
verified?: { spot?: () => SpotAdapter; strategy?: () => StrategyAdapter };
```

- [ ] **Step 1: Write `tests/unit/hydrex-events.test.ts`** with hand-built logs encoded via `encodeEventTopics`/`encodeAbiParameters` against `hydrexPositionManagerABI`:

```ts
it("splits an exit into principal and fees", () => {
  const fill = parseHydrexFill("exit", [decreaseLog({ tokenId: 42n, amount0: 900n, amount1: 4n }), collectLog({ tokenId: 42n, recipient: ACCOUNT, amount0: 930n, amount1: 5n })], PM, ACCOUNT);
  expect(fill).toEqual({ kind: "exit", tokenId: 42n, principal0: 900n, principal1: 4n, fee0: 30n, fee1: 1n });
});

it("reports zero fees as zero, and rejects a collect paid to another recipient", () => {
  expect(parseHydrexFill("claim", [collectLog({ tokenId: 42n, recipient: ACCOUNT, amount0: 0n, amount1: 0n })], PM, ACCOUNT)).toMatchObject({ fee0: 0n, fee1: 0n });
  expect(() => parseHydrexFill("claim", [collectLog({ tokenId: 42n, recipient: ATTACKER, amount0: 5n, amount1: 0n })], PM, ACCOUNT)).toThrow();
});

it("ignores logs from other contracts and rejects a missing Collect", () => {
  expect(() => parseHydrexFill("claim", [collectLog({ tokenId: 42n, recipient: ACCOUNT, amount0: 5n, amount1: 0n, emitter: ATTACKER })], PM, ACCOUNT)).toThrow(/collect/i);
});
```

- [ ] **Step 2: Implement `parseHydrexFill`.** Only logs whose `address` equals `positionManager` count. Enter reads `IncreaseLiquidity` (and the ERC-721 `Transfer` to `account` for `tokenId`). Exit fees = `Collect` amounts − `DecreaseLiquidity` amounts, rejecting a negative result.

- [ ] **Step 3: Registry.** `resolve` stops throwing for `verified_provider_testnet` when `factory.verified` exists; `spot()`/`strategy()` return the `verified` adapter for that kind and the replica otherwise. `actualFactoryCalls` increments when a verified adapter is returned. Register `verified: { spot: () => hydrexActualSpot, strategy: () => hydrexActualStrategy }` for `hydrex` only. Test in `tests/unit/onchain-registry.test.ts`:

```ts
it("returns the real Hydrex adapter on Base Sepolia and replicas elsewhere", () => {
  expect(onchainRegistry.spot("hydrex", sepoliaCtx("hydrex")).capabilities.kind).toBe("verified_provider_testnet");
  expect(onchainRegistry.spot("hydrex", localCtx("hydrex")).capabilities.kind).toBe("local_testnet_replica");
  expect(() => onchainRegistry.spot("o1", sepoliaCtx("o1"))).toThrow();
});
```

- [ ] **Step 4: Route by the stock's network.** In `investments/index.ts` `quote`, derive `chainId` from `network.chainId` (the stock's `OnchainNetwork`). For chain 31337 keep the existing candidate loop. For chain 84532 the only candidate is `hydrex`, with `contextOn(84532, "hydrex", HYDREX_ACTUAL_VERSION, profile.id)`, the settlement asset key from `manifestFor(84532)`, and `executionAccounts.ensure(userId, 84532)`. In `strategies/index.ts`, do the same using the strategy's `provenance.chainId`; where it parses `hydrexPoolAbi` events (around line 1003), branch on `provenance.kind === "hydrex_nft"` to use `parseHydrexFill`, store `tokenId` in `externalTokenId` and `liquidity` in `receiptRaw` on enter, and pass only `fee0`/`fee1` to the existing reward-receipt creation. Create no receipt when both fees are zero.

- [ ] **Step 5: Seed.** In `scripts/seed-beta.ts`, when `.testnet/base-sepolia/manifest.json` exists: upsert the `OnchainNetwork` row (`kind: verified_provider_testnet`, `rpcLoopback: false`), the stock row `tAAPL` (`assetKey: basesepolia:84532:<addr>`, `name: "Apple Inc. (test token)"`, `provenance: { standInFor: "base:8453:<address of the token whose symbol is AAPL in the synced feed>", hydrexPool }`; abort the seed with a clear error if the feed has no AAPL row), and a strategy row (`providerId: "hydrex"`, `key: "hydrex-aapl-usdc-basesepolia"`, `separateClaim: true`, `provenance` as in Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/backend/services scripts/seed-beta.ts tests/unit
git commit -m "feat: route Base Sepolia stocks through real Hydrex and recognise collected fees"
```

### Task 10: Operator visibility, smoke journey, docs and the Phase A gate

**Files:**
- Modify: `src/backend/services/operations/index.ts`, `src/types/contract.ts`, `README.md`, `docs/runbooks/onchain-beta.md`, `docs/api/onchain-investments.md`, `Design.md`, `tests/integration/onchain-containment.test.ts`
- Create: `scripts/sepolia-smoke.ts`; add `"sepolia:smoke"` to `package.json`

**Interfaces:**
- `GET /ops/integrations` row gains `actual_integration: "disabled_unverified" | "verified_provider_testnet"` and `verified_chain_id: number | null`. Hydrex reports `verified_provider_testnet` and `84532` only when `BASE_SEPOLIA_RPC_URL` is set and `verifyManifest(84532)` passes; otherwise it reports `disabled_unverified`.

- [ ] **Step 1: Update the ops DTO** and its type, and extend `onchain-containment.test.ts`:

```ts
it("reports Hydrex as verified only when Base Sepolia is configured, and never the other five", async () => {
  delete process.env.BASE_SEPOLIA_RPC_URL;
  const rows = await operationsService.integrations();
  expect(rows.every((r) => r.actual_integration === "disabled_unverified")).toBe(true);
  expect(() => assertChainIdAllowed(8453)).toThrow(/mainnet/i);
});
```

- [ ] **Step 2: Write `scripts/sepolia-smoke.ts`.** Requires `SEPOLIA_LIVE=1`. Drives the services directly for one synthetic user: mint test USDC to the execution account → investment quote and confirm for `tAAPL` → strategy enter → three round-trip swaps from the relayer to generate fees → strategy claim → reward conversion → print each transaction hash, the fee amounts and the resulting earnings DTO. Exit non-zero if claimed fees are zero or any ledger reconciliation check fails.

- [ ] **Step 3: Update docs.** README: setup for Base Sepolia (faucet, env vars, `yarn sepolia:deploy`, `yarn seed:beta`, `yarn sepolia:smoke`). Runbook: holds for a manifest code-hash mismatch and an exhausted relayer. API doc: `integration_kind` values and the `stand_in_for` field. `Design.md`: change the Status row "Real provider integration" and the Environments table to reflect Phase A as built.

- [ ] **Step 4: Run the full gate once**

Run: `bash scripts/setup-cloud.sh && yarn prisma validate && yarn prisma generate && yarn test:contracts && yarn test && yarn lint && yarn typecheck && yarn build`
Expected: all pass with `BASE_SEPOLIA_RPC_URL` unset. Fix failures and rerun the affected command.

- [ ] **Step 5: Run the live journey** (operator, with a funded relayer)

Run: `SEPOLIA_LIVE=1 yarn sepolia:smoke`
Expected: transaction hashes for buy, enter, claim and conversion on Base Sepolia; non-zero claimed fees; exit code 0. Record the hashes in `docs/implementation-review.md` under a 2026-11 "Phase A" heading.

- [ ] **Step 6: Commit**

```bash
git add src scripts package.json README.md Design.md docs tests
git commit -m "feat: expose verified Hydrex testnet status and add Base Sepolia smoke journey"
```

---

# Phase B — gated Base mainnet pilot

**Stop. Do not start Task 11 until the operator has approved Phase B in writing.** Tasks 11–13 add code that is inert while the gate is closed. Only Task 14, run by the operator, opens it.

### Task 11: The mainnet gate and pilot caps

**Files:**
- Create: `src/backend/integrations/mainnet-gate.ts`, `docs/decisions/mainnet-pilot-approval.template.md`
- Modify: `src/backend/integrations/onchain-policy.ts`, `src/backend/services/onchain/chains.ts`, `src/backend/services/onchain/types.ts`, `prisma/schema.prisma` (+ migration `20261117000000_pilot_spend`), `src/env.js`, `.env.example`
- Test: `tests/unit/mainnet-gate.test.ts`

**Interfaces:**
- Produces:

```ts
export type PilotCaps = { perTxMicroUsd: bigint; perUserMicroUsd: bigint; totalMicroUsd: bigint; allowedUserIds: string[] };
export const PILOT_DEFAULT_CAPS: PilotCaps; // 10_000_000n, 50_000_000n, 250_000_000n, []
export function mainnetGate(): { open: false; reason: string } | { open: true; caps: PilotCaps };
export function assertPilotSpend(tx: Tx, userId: string, microUsd: bigint): Promise<void>; // locks, checks all three caps, records
```

- `IntegrationKind` gains `"mainnet_pilot"`; `modeForIntegrationKind("mainnet_pilot")` returns `"sandbox"`. Env: `MAINNET_PILOT`, `MAINNET_PILOT_APPROVAL_SHA256`, `BASE_MAINNET_RPC_URL`, `BASE_MAINNET_RELAYER_PRIVATE_KEY`, `O1_API_TOKEN` (all optional).
- `PilotSpend { id, userId, operationId @unique, microUsd Decimal(78,0), createdAt }`.

- [ ] **Step 1: Write `tests/unit/mainnet-gate.test.ts`** (point the gate at a temp file via `MAINNET_PILOT_APPROVAL_PATH`, test-only):

```ts
it("is closed unless the flag, the file and its hash all agree", () => {
  expect(mainnetGate()).toMatchObject({ open: false });
  process.env.MAINNET_PILOT = "enabled";
  expect(mainnetGate()).toMatchObject({ open: false, reason: expect.stringMatching(/approval file/i) });
  writeApproval(VALID);
  expect(mainnetGate()).toMatchObject({ open: false, reason: expect.stringMatching(/hash/i) });
  process.env.MAINNET_PILOT_APPROVAL_SHA256 = sha256(VALID);
  expect(mainnetGate()).toMatchObject({ open: true });
  writeApproval(VALID + "\n");
  expect(mainnetGate()).toMatchObject({ open: false });
});

it("keeps chain 8453 rejected while the gate is closed, in every entry point", () => {
  expect(() => assertChainIdAllowed(8453)).toThrow();
  expect(() => chainTarget(8453)).toThrow();
  expect(() => assertOnchainContext(mainnetCtx())).toThrow();
});

it("approval caps can only lower the defaults", () => {
  openGateWith({ perTxMicroUsd: "999000000", allowedUserIds: ["u1"] });
  expect((mainnetGate() as any).caps.perTxMicroUsd).toBe(10_000_000n);
});

it("enforces per-transaction, per-user and total caps and the allowlist", async () => {
  openGateWith({ allowedUserIds: ["u1"] });
  await expect(withTx((tx) => assertPilotSpend(tx, "u2", 1n))).rejects.toThrow(/allowlist/i);
  await expect(withTx((tx) => assertPilotSpend(tx, "u1", 10_000_001n))).rejects.toThrow(/per transaction/i);
});
```

- [ ] **Step 2: Implement.** The approval file is Markdown with a fenced `json` block: `{ "approved_by", "approved_on", "caps": {...}, "allowed_user_ids": [...], "jurisdiction_confirmed": true }`. `mainnetGate()` requires all fields and `jurisdiction_confirmed === true`. `assertChainIdAllowed(8453)` and `chainTarget(8453)` call `mainnetGate()` and throw its reason when closed. Chain `1` stays rejected unconditionally. `assertOnchainContext` accepts `mainnet_pilot` only on 8453 with the gate open and provider `o1` or `hydrex`.

- [ ] **Step 3: Write the template** `mainnet-pilot-approval.template.md` explaining each field and how to compute the hash (`shasum -a 256`). The real `mainnet-pilot-approval.md` is created by the operator, not by this plan.

- [ ] **Step 4: Commit**

```bash
git add src/backend/integrations src/backend/services/onchain prisma src/env.js .env.example docs/decisions tests/unit/mainnet-gate.test.ts
git commit -m "feat: add approval-file gate and caps for the mainnet pilot"
```

### Task 12: o1 Trading API spot adapter

**Files:**
- Create: `src/backend/services/onchain/providers/o1/actual.ts`, `src/backend/services/execution/o1-policy.ts`, `tests/contracts/fixtures/onchain/o1-order-build.json`
- Modify: `src/backend/services/onchain/providers/index.ts`, `src/backend/integrations/provider-evidence.ts`
- Test: `tests/contracts/onchain/o1-actual.test.ts`

**Interfaces:**
- Produces: `export const o1ActualSpot: SpotAdapter;` (`kind: "mainnet_pilot"`), `export function __setO1FetchForTests(fn): void`, `export function assertO1Transactions(txs: O1UnsignedTx[], plan: ExecutionPlan): void`.
- o1 request: `POST https://api.o1.exchange/api/v2/order`, header `Authorization: Bearer ${O1_API_TOKEN}`, body `{ networkId: 8453, signerAddress, tokenAddress, uiAmount, direction, slippageBps, mevProtection: true, quoteTokenAddress: <USDC> }`. Response: `{ id, transactions: [{ id, unsigned: { to, data, value, gasLimit, chainId }, permit2? }] }`.

- [ ] **Step 1: Read-only precondition (operator, needs `O1_API_TOKEN`)**

Run a build request for a $1 buy of a real B20 stock token with `signerAddress` set to an address holding no funds; save the response as `o1-order-build.json`.
Expected: `transactions[]` with `unsigned.chainId === 8453`. **If o1 rejects B20 stock tokens, or returns `permit2` typed data, stop Phase B spot and report.** Building an order sends no transaction.

- [ ] **Step 2: Write tests**

```ts
it("turns the o1 build response into a plan and rejects unexpected targets", async () => {
  __setO1FetchForTests(async () => fixture);
  const plan = await o1ActualSpot.prepare(await o1ActualSpot.quote(buyRequest({ microUsd: 1_000_000n })), "op-9");
  expect(plan.calls.length).toBe(fixture.transactions.length);
  expect(() => assertO1Transactions(fixture.transactions.map((t) => t.unsigned), plan)).not.toThrow();
  const tampered = structuredClone(fixture); tampered.transactions[0].unsigned.to = ATTACKER;
  expect(() => assertO1Transactions(tampered.transactions.map((t) => t.unsigned), plan)).toThrow(ExecutionPlanRejected);
});

it("rejects a wrong chain, a native value, a permit2 request and a non-200", async () => {
  for (const mutate of [wrongChain, nativeValue, withPermit2]) {
    __setO1FetchForTests(async () => mutate(fixture));
    await expect(o1ActualSpot.quote(buyRequest({ microUsd: 1_000_000n }))).rejects.toThrow();
  }
});

it("refuses to quote while the gate is closed or above the per-transaction cap", async () => {
  closeGate();
  await expect(o1ActualSpot.quote(buyRequest({ microUsd: 1_000_000n }))).rejects.toThrow();
});
```

- [ ] **Step 3: Implement.** `assertO1Transactions`: every `to` must be the USDC token, the stock token, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3` or Uniswap Universal Router `0x6fF5693b99212Da76ad316178A184AB56D299b43`; `value === 0`; `chainId === 8453`; any ERC-20 `approve` amount ≤ the plan input. Because router calldata is opaque, the adapter sets `minOutput` itself from the reference price and slippage, and the existing finality step (`assertMinimumOutput`) enforces it from the transaction's transfer logs. Submission through `/api/v2/order/complete` is **not** used: the relayer broadcasts the validated calls through the user's execution account like every other operation, so o1 never receives a signature.

- [ ] **Step 4: Register** `verified.spot` for `o1` under `mainnet_pilot` only, and update o1 evidence with the fixture date.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services tests/contracts
git commit -m "feat: add gated o1 trading adapter for the mainnet pilot"
```

### Task 13: Mainnet wiring for stocks, Hydrex and caps

**Files:**
- Modify: `src/backend/services/investments/index.ts`, `src/backend/services/strategies/index.ts`, `src/backend/services/onchain/providers/hydrex/actual.ts`, `src/backend/services/execution/index.ts`, `scripts/seed-beta.ts`
- Create: `scripts/mainnet-preflight.ts`; add `"mainnet:preflight"` to `package.json`
- Test: `tests/integration/pilot-caps.test.ts`

**Interfaces:**
- Consumes: `mainnetGate`, `assertPilotSpend` (Task 11); `o1ActualSpot` (Task 12).
- Hydrex mainnet addresses from the SDK: position manager `0xC63E9672f8e93234C73cE954a1d1292e4103Ab86`, swap router `0x6f4bE24d7dC93b6ffcBAb3Fd0747c5817Cea3F9e`, pool deployer `0x1595A5D101d69D2a2bAB2976839cC8eeEb13Ab94`.

- [ ] **Step 1: Write `tests/integration/pilot-caps.test.ts`** — with the gate opened against a temp approval file and all chain access stubbed:

```ts
it("blocks a quote for a mainnet stock when the user is not allowlisted or the cap is exceeded", async () => {
  await expect(investmentService.quote(other.id, { stockId: mainnetStock.id, side: "buy", inputRaw: 1_000_000n })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  await expect(investmentService.quote(allowed.id, { stockId: mainnetStock.id, side: "buy", inputRaw: 10_000_001n })).rejects.toMatchObject({ code: "AUTHORIZATION_EXCEEDED" });
});

it("hides mainnet stocks from the catalog while the gate is closed", async () => {
  closeGate();
  expect((await stockService.list()).some((s) => s.asset_key.startsWith("base:8453:"))).toBe(false);
});
```

- [ ] **Step 2: Implement.** Route chain 8453 stocks to `o1` with `contextOn(8453, …)`; call `assertPilotSpend` inside the transaction that creates the operation; make the Hydrex actual adapters read addresses from `manifestFor(context.chainId)` so one adapter serves 84532 and 8453; `stockService.list()` filters mainnet rows by `mainnetGate().open`. The seed creates mainnet stock rows only from the live reference feed and only when the gate is open, `enabled: false` by default.

- [ ] **Step 3: Write `scripts/mainnet-preflight.ts`** — read-only. It prints: gate state and caps; relayer ETH and USDC balances; `eth_getCode` for the three Hydrex mainnet addresses; whether a Hydrex pool exists for each enabled stock and USDC (via `computePoolAddress` + `eth_getCode`); the result of an `eth_call` simulating a 1-unit `transfer` of the stock token from the execution account. It sends no transaction and exits non-zero if any check fails.

- [ ] **Step 4: Commit**

```bash
git add src scripts package.json tests/integration/pilot-caps.test.ts
git commit -m "feat: wire mainnet stocks, Hydrex addresses and pilot caps behind the gate"
```

### Task 14: Phase B gate run and operator hand-off

**Files:**
- Modify: `docs/runbooks/onchain-beta.md`, `docs/decisions/onchain-providers.md`, `Design.md`, `README.md`

- [ ] **Step 1: Run the full gate once**

Run: `yarn prisma validate && yarn prisma generate && yarn test:contracts && yarn test && yarn lint && yarn typecheck && yarn build`
Expected: all pass with every mainnet variable unset.

- [ ] **Step 2: Document the pilot** — runbook section "Mainnet pilot": how to fill the approval file, compute and set the hash, fund the relayer, run `yarn mainnet:preflight`, enable one stock, place the first $1 buy, and pause (`ops/controls`). State that removing `MAINNET_PILOT` closes the gate immediately and that open positions must be exited before closing.

- [ ] **Step 3: Commit**

```bash
git add docs Design.md README.md
git commit -m "docs: add mainnet pilot runbook and decision record"
```

- [ ] **Step 4: Hand to the operator.** The implementer does not create the approval file, set mainnet environment variables, fund a mainnet wallet or send a mainnet transaction. Report that the code is ready and what the operator must do.

---

## Out of scope, with the reason

| Item | Reason |
| --- | --- |
| Customer app (sign-up, fund, buy, portfolio, earnings) | Separate subsystem; needs its own design and plan. It is the largest gap against the product objective |
| Bankr | Needs an approved partner organisation; no testnet |
| Stonks Exchange | Contract addresses are published but no ABI or claim interface |
| BaseStonk, Feel.cash | Nothing published to integrate against |
| Hydrex gauges, oHYDX, Hydropump | Phase A earns trading fees only |
| Privy | Not required for either phase |
