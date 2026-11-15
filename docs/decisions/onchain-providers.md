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
| o1 Exchange | Aggregator quote + unsigned tx; launchpad API separate; documented deployment is Base mainnet | Local router replica; actual adapter disabled |
| Bankr | Deterministic wallet swap API; partner provisioning; location clearance separate from quotes | Local managed-wallet profile replica; disabled |
| Hydrex/Hydropump | Manual LP fees; account-locking incentives; Hydropump permanent lock + fee destinations | Local pool + locker replicas; disabled |
| Stonks Exchange | Stock-paired launches; versioned routers/lockers; holder stock distributions | Local versioned distribution replica; disabled |
| BaseStonk | Uniswap v4 hook launches; public API/user-signed txs described; no verified ABI | Local hook/fee replica; disabled |
| Feel.cash | Stock-paired launchpad; one published holder stock-reward example | Local distribution replica; disabled |

Enabling a verified provider testnet later requires affirmative endpoint/account/network/
asset/sponsorship evidence plus a reviewed configuration change — never an operator toggle
or a caller-supplied mode flag.

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
