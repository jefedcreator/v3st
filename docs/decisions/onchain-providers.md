# Decision: onchain provider integration policy (beta)

Date: 2026-11-14. Scope: backend/API only. This record is the source of truth for
`src/backend/integrations/provider-evidence.ts`; keep both in sync.

## Rules

1. `APP_STAGE=beta` is required independently of `NODE_ENV`. Optimized builds
   (`NODE_ENV=production`) never enable real providers, mainnet chains or remote RPCs.
2. Integration modes are exactly `sandbox | simulated`, recorded separately from network
   identity. A local replica executes on a real local testnet but reports
   `mode: simulated` and `integration_kind: local_testnet_replica`; only a verified
   provider testnet may report `sandbox`.
3. The only execution target in this beta is an isolated loopback Anvil node, chain
   `31337`, with no `--fork-url`. Base Sepolia (`84532`) is a candidate for future
   verified deployments, not evidence. Vibenet (`84538453`) is excluded from the hosted
   beta. Mainnet chain IDs (including Base `8453`) are rejected in every environment.
4. All six providers (o1, Bankr, Hydrex/Hydropump, Stonks Exchange, BaseStonk, Feel.cash)
   have **no verified testnet evidence** as of 2026-11-14. Their actual provider adapters
   are therefore disabled factories that throw; each provider ships a clearly labelled
   local testnet contract replica instead. A replica proves V3ST orchestration only —
   never a commercial integration or compatibility claim.
5. Documentation URLs live in evidence records, never in runtime endpoint allowlists.
   Provider-returned URLs are untrusted; redirects outside the approved transport are
   rejected. No mainnet reads, broadcasts, wallets, quote/price endpoints, paid gas or
   live fallback. Paycrest stays simulated-only.
6. No private keys in source control, fixtures, logs or API output. Test signer material
   is ephemeral, generated outside Git and funded via local-node facilities.

## Evidence matrix

| Provider | Verified public surface (checked 2026-11-14) | Beta adapter |
| --- | --- | --- |
| o1 Exchange | Trading API (unsigned transactions, checked 2026-11-16); launchpad API separate; documented deployment is Base mainnet | Local router replica; actual adapter disabled |
| Bankr | Deterministic wallet swap API; partner provisioning; location clearance separate from quotes | Local managed-wallet profile replica; disabled |
| Hydrex/Hydropump | `@hydrexfi/hydrex-sdk@1.2.8` lists Base Sepolia pool deployer, position manager and swap router (verified 2026-11-16); manual LP fees; Hydropump permanent lock + fee destinations | Local pool + locker replicas (verified 84532 evidence recorded; real adapter stays disabled until Phase A routing) |
| Stonks Exchange | Stock-paired launches; versioned routers/lockers; holder stock distributions | Local versioned distribution replica; disabled |
| BaseStonk | Uniswap v4 hook launches; public API/user-signed txs described; no verified ABI | Local hook/fee replica; disabled |
| Feel.cash | Stock-paired launchpad; one published holder stock-reward example | Local distribution replica; disabled |

Enabling a verified provider testnet later requires affirmative endpoint/account/network/
asset/sponsorship evidence plus a reviewed configuration change — never an operator toggle
or a caller-supplied mode flag.

## 2026-11-16 amendment (Phase A: Hydrex on Base Sepolia)

This amendment replaces rules 3 to 5 above for Phase A only (see
`docs/superpowers/specs/2026-11-16-v3st-real-provider-integration-design.md`):

1. Chain `84532` (Base Sepolia) is allowed, only with `integrationKind:
   verified_provider_testnet`, only for provider `hydrex`. Chain `31337` (loopback only)
   stays the local replica target. Chain `1`, Base mainnet `8453` and every other ID stay
   rejected in Phase A.
2. Hydrex's evidence record is `verified` for chain `84532`, citing
   `@hydrexfi/hydrex-sdk@1.2.8` and its Base Sepolia pool deployer, position manager and
   swap router addresses (all returning code from `sepolia.base.org`, checked 2026-11-16).
   The other five providers stay `unverified`.
3. A non-loopback RPC is allowed only over HTTPS and only when its host equals the host of
   the configured `BASE_SEPOLIA_RPC_URL`; the node's reported chain ID must be `84532`.
   Chain `31337` still requires a loopback host.
4. One read-only mainnet HTTP source is allowed: `GET https://api.coinbase.com/v1/tokenized-stocks`
   and its documented sub-paths. No other mainnet read, and no mainnet RPC.
5. `BASE_SEPOLIA_RELAYER_PRIVATE_KEY` must be a fresh testnet-only key — never the local
   test key and never a key that has held mainnet funds.

### Implementation notes (verification pass, 2026-11-16)

- Hydrex V3ST pools are **base** Algebra pools. The `deployer` argument of
  `createAndInitializePoolIfNecessary`, `mint` and `exactInputSingle` is the custom-pool
  deployer slot and is `address(0)`; the pool address follows the SDK's
  `computePoolAddress` with the main pool deployer. Execution policy rejects any other value.
- `sqrtPriceX96For(num, den)` takes Algebra's price, raw token1 per raw token0. The plan
  named the parameters `token0PerToken1`, which is the inverse.
- The stock stand-in reuses the existing `TestStockToken` fixture, whose decimals are fixed
  at 18 (the plan said 6). The deploy script, seed and quotes all use 18.
- Every network has its own execution account (`execution_accounts`); operation signing,
  receipts, rewards ownership and reconciliation resolve the account of the operation's
  own network. Ledger cash is namespaced per network: `testnet` for 31337, `basesepolia`
  for 84532, matching asset keys and `Stock.chain`.
- The relayer key for 84532 is refused if it equals `TESTNET_SIGNER_PRIVATE_KEY` or a
  public Anvil development key.
- **Open decision:** `policy.onchain.referenceMaxAgeSeconds` (60 s) is applied to the
  live API's `nav_price_updated_at`. Base publishes NAV far less often than every minute,
  so live stand-in trades are blocked as stale until the operator sets a freshness window
  for the live feed. The code fails closed until then.

## Bankr managed-wallet profile (beta)

Bankr is modeled as `custody: provider_managed`, not as an application-account route.
`bankrReplicaGateway.provision(ownerKey)` deploys one local managed execution account per
synthetic customer and persists only a scoped server-key *reference*
(`bankr-server-key:<address>`) on a `provider_managed` custody profile — the key itself is
ephemeral and never stored, exported or imported, and Privy keys are never touched. Customers
are never pooled into one wallet. Ordinary application-account orders cannot route through
the gateway: the adapter and the gateway both require the operation's custody profile to be
`provider_managed`. The gateway always uses the loopback testnet execution path and never
Bankr's real hostname; HTTP 200 with `success:false` is normalized as a revert, and a
timeout/ambiguous response stays unresolved with the original operation hash until onchain
evidence is reconciled (no resend). A successful quote never grants stock eligibility or
location clearance, and Bankr gas limits are not an unlimited sponsorship guarantee — the
shared local sponsor budgets model exhaustion.

## Hydrex liquidity and Hydropump fee mechanics (beta)

The Hydrex replica is a local two-asset pool (`HydrexPoolReplica`) with deterministic
constant-product reserves and a fixture fee in bps. Trading fees accrue to a per-share
accumulator and are claimed manually (`separateClaim: true`); the distinct exit-realized
variant (`separateClaim: false`) pays fees together with principal on `withdrawAndClaim`.
LP ownership (pro-rata shares with deposit/withdraw), protocol-account incentives (a funded
stock reward reserve that is NOT automatically USDC; settlement conversion pays only from a
funded sink minus a conversion fee) and Hydropump creator fees are kept distinct. Zero
trading activity produces zero fees; a deterministic loss fixture lets exits return less
value than entry while fees stay separately claimable. This is not a full Algebra/Hydrex
implementation. The Hydropump locker replica (`HydropumpLockerReplica`) declares permanently
locked principal (any `withdraw` reverts) and beneficiary-only fee claims; it is registered
only as provenance/eligibility evidence, never as a redeemable income strategy.

## Source-specific stock reward replicas (beta)

Stonks, BaseStonk and Feel.cash ship distribution-only replicas: none declares general
direct-stock spot execution (the registry rejects `spot()` for them explicitly) and all
actual factories stay disabled. `StockDistributionReplica` provides chain-backed
distribution epochs with a claimed bitmap and snapshot entitlements (set by the fixture
owner; later balance changes do not alter them), a preserved reward asset, and funding
only from the local fixture treasury — claims transfer only funded balances, duplicate
claims revert, and zero-funds epochs revert. Stonks binds a router/locker generation per
launch and rejects generation mismatches (one generation's coin is never sent to another
generation's contracts). BaseStonk's `HookFeeReplica` freezes per-launch hook rules at
registration, leaves the fee recipient changeable, pays only funded pending fees to the
current recipient, and treats unknown hook versions/entitlements as unavailable; no public
holder claim API is invented. Feel ties eligibility to an eligible launch-token holding
snapshot — ordinary ownership of the paired stock does not qualify. All schema/ABI names
are V3ST replica definitions.

## 2026-11-17 amendment (customer app beta: basesepolia trading window)

Set on 2026-11-17 by the customer app backend plan; **pending operator confirmation**.

1. On chain `84532` (Base Sepolia) in the customer beta (`APP_CUSTOMER_CHAIN=basesepolia`), the trading window for reference prices is **7,200 s (2 hours)**: a reference older than that is stale for trading, while display may still use the last known price.
2. The venue band on Base Sepolia is **300 bps** around the reference price for customer executions.
3. The test-pool keeper trades the labelled test pools every **300 s** to keep stand-in prices aligned; on testnet these keeper trades supply most Earn fee volume.
