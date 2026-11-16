# V3ST real provider integration design

Date: 2026-11-16 · Status: proposed, awaiting operator approval · Release: beta

## Intent

V3ST exists to let Nigerians earn from tokenized stocks without seeing any crypto. The onchain layer is where that income is produced, and today all of it is produced by local replica contracts with fixture values. Nothing real is integrated, so nothing real can be earned.

This design replaces replicas with real provider integrations in two phases:

- **Phase A — Hydrex on Base Sepolia.** The income strategy and its spot trades run on Hydrex's actual testnet contracts. The stock catalog and reference prices come from Base's live Tokenized Stocks API. No money is involved.
- **Phase B — capped Base mainnet pilot.** Real stock tokens bought through o1 Exchange and real liquidity on Hydrex mainnet, under small operator-funded caps. Phase B is specified here but stays switched off until the operator signs a recorded approval.

It also records what a review of the existing implementation found against the project's objective, and fixes the findings that block either phase.

## Why two phases

The operator asked for actual testnet provider integration. Checked on 2026-11-16:

| Provider | Testnet | Evidence |
| --- | --- | --- |
| Hydrex | Base Sepolia (84532) | `@hydrexfi/hydrex-sdk@1.2.8` lists pool deployer `0x9cb57c3E31D50fa5c273eC0a5A51cF9cb3B127A7`, position manager `0xb7875b8Dc8f49c2D6BBb658905dBF88843B54Da8` and swap router `0x10Dcb20d06fbC1461D21D6b31E54042D656C67FC`. All three return contract code from `https://sepolia.base.org` |
| o1 Exchange | None documented | Trading API lists Base 8453, BSC 56 and Solana only |
| Bankr | None documented | Swap chains are all mainnets |
| Stonks Exchange | None documented | Published contracts are Base mainnet; no ABI or API |
| BaseStonk | None documented | No docs, API or contracts published |
| Feel.cash | None documented | No docs, API or launchpad contracts published |
| Base B20 stock tokens | None documented | Tokenized Stocks API has no network parameter; Vibenet has the B20 standard but no stock tokens |

So a testnet integration is possible for one provider. Real stocks and the other providers exist only on Base mainnet.

## Approaches

1. **Hydrex on Base Sepolia, live stock data, others stay replicas.** No money at risk; one real provider.
2. **Capped Base mainnet pilot.** The only route to real stock tokens and real income; uses real money and reverses the 2026-11-14 "no mainnet" rule.
3. **Local fork of Base mainnet.** Dropped: B20 stocks are native to the chain and may not execute on a standard fork, and o1 and Bankr execute only on the live chain.

**Chosen by the operator on 2026-11-16:** approach 1 now, with approach 2 in the same plan as a gated second phase.

## Goals

- A user-scoped journey on Base Sepolia: funded test cash → swap into a stock stand-in on Hydrex → enter a Hydrex liquidity position → real trading fees accrue → collect → convert → Friday payout path. Every step is a real Base Sepolia transaction through Hydrex's deployed contracts.
- The catalog shows real stocks with real reference prices and multipliers from Base's API.
- The local replica path keeps working unchanged and remains the default for CI.
- Phase B can be enabled only by a committed approval record, and is bounded by hard caps and an allowlist.

## Non-goals

- Customer-facing screens. No app exists beyond the landing page; that is a separate plan (see Review findings).
- Bankr, Stonks Exchange, BaseStonk and Feel.cash real integrations. Bankr needs an approved partner organisation; the other three publish nothing sufficient to integrate against. Their replicas stay.
- Hydrex gauges, oHYDX, veNFT and Hydropump. Phase A earns trading fees only.
- Privy. The existing test execution account and relayer are reused.
- Real naira. Fiat rails stay sandbox or simulated in both phases.

## Anti-goals

- Any path by which a replica reports itself as a verified provider, or a Base Sepolia stand-in token is presented as a real stock.
- Any way to reach mainnet through an environment variable alone, an operator toggle or a caller-supplied flag.
- A user being asked for a wallet, a signature or gas.

## Phase A design

### Networks

Execution becomes multi-network. Two targets exist in Phase A:

| Target | Chain | RPC | Integration kind | Confirmations |
| --- | --- | --- | --- | --- |
| Local | 31337 | Loopback only | `local_testnet_replica` | 2 |
| Base Sepolia | 84532 | Exactly the host of `BASE_SEPOLIA_RPC_URL`, HTTPS only | `verified_provider_testnet` | 3 |

Every operation already carries `context.chainId`. Chain access is resolved from that value instead of from a single global local client. An operation never changes network after it is created.

### Policy changes

These replace rules 3 to 5 of the [2026-11-14 provider decision](../../decisions/onchain-providers.md) for Phase A only:

- Chain 84532 is allowed, only with `integrationKind: verified_provider_testnet`, only for provider `hydrex`.
- Hydrex's evidence record becomes `verified` for chain 84532, citing the SDK version and the three addresses above. The other five stay `unverified`.
- A non-loopback RPC is allowed only when its host equals the configured Base Sepolia host and the node reports chain ID 84532.
- One read-only mainnet HTTP source is allowed: `GET https://api.coinbase.com/v1/tokenized-stocks`. No other mainnet read, and no mainnet RPC.
- Mainnet chain IDs stay rejected everywhere in Phase A.

### Assets on Base Sepolia

Real stock tokens do not exist on Base Sepolia. V3ST deploys its own labelled stand-ins using the existing test contracts:

- `TestSettlementToken` as test USDC (6 decimals).
- One `TestStockToken` per supported stand-in, each mapped to a real stock's reference record. Phase A ships one: a stand-in for AAPL.
- Asset keys use the namespace `basesepolia:84532:<address>`. Names carry "(test token)". DTOs report `integration_kind: verified_provider_testnet` and a `stand_in_for` reference, never a real-stock claim.

A V3ST operator account creates the Hydrex stock/USDC pool through the position manager and seeds full-range liquidity. A deployment manifest for Base Sepolia records every V3ST contract, the three Hydrex addresses, their code hashes and the pool address.

### Hydrex adapter

A real adapter replaces the disabled factory for chain 84532. Calldata is built with viem against `hydrexSwapRouterABI` and `hydrexPositionManagerABI` from the pinned SDK; the SDK's `Position` class supplies liquidity math.

| Action | Calls in the plan |
| --- | --- |
| Buy or sell | `approve(router, exact)` then `router.exactInputSingle` |
| Enter strategy | `approve(positionManager, exact)` for each asset, then `positionManager.mint` (full range) |
| Claim fees | `positionManager.collect` |
| Exit | `positionManager.decreaseLiquidity` then `positionManager.collect` |

Positions are full range only. The receipt for a strategy position is the position NFT's token ID, held by the user's execution account.

Quotes read the pool's price, liquidity and fee from chain and estimate output with constant-product math. The estimate is advisory; `amountOutMinimum` on chain is what protects the user.

### Execution policy check

The existing check decodes every call and rejects anything unknown. It gains explicit rules for the five Hydrex functions above: token pair, recipient, amounts, minimums, deadline and position ownership must match the accepted quote. `multicall`, permits, native-value calls, farming functions and any other selector on the Hydrex contracts are rejected.

### Income accounting

Fees are recognised from the position manager's `Collect` event in the collecting transaction, attributed to the position's token ID. On exit, `DecreaseLiquidity` amounts are principal and the remainder of `Collect` is fees. This uses the existing reward-receipt path, so conversion and the Friday batch need no change.

### Gas and signing

A dedicated Base Sepolia relayer key, supplied by environment variable and funded from a faucet, pays gas. It is never the local test key and never a key that has held mainnet funds. Sponsor budgets are tracked per network. Relayer nonces are allocated per network.

### What stays the same

Quotes, authorizations, operations, finality, reconciliation, the ledger and the API routes. The API still accepts a quote ID and never a network or provider.

## Phase B design

### The gate

Phase B code is merged but inert. Mainnet becomes reachable only when all of these hold:

1. `docs/decisions/mainnet-pilot-approval.md` exists in the repository with the operator's name, date, the caps, and the allowlisted user IDs.
2. The SHA-256 of that file equals `MAINNET_PILOT_APPROVAL_SHA256` in the environment.
3. `MAINNET_PILOT=enabled` is set, and the configured mainnet RPC reports chain 8453.

If any is missing, chain 8453 is rejected exactly as today. Editing the approval file changes its hash and closes the gate until the environment is updated. Operator endpoints can pause the pilot; none can open it.

### Scope

- **Spot:** o1 Trading API. `POST /api/v2/order` builds unsigned transactions; V3ST's policy check validates them; the relayer signs; `POST /api/v2/order/complete` submits.
- **Income:** the Phase A Hydrex adapter pointed at mainnet addresses, if a stock/USDC pool exists.
- **Assets:** real B20 stock tokens from Base's API.

### Limits

Defaults, overridable only downward by the approval file:

| Limit | Default |
| --- | --- |
| Per transaction | $10 |
| Per user, lifetime | $50 |
| Pilot total, lifetime | $250 |
| Users | Allowlisted operator-owned accounts only |
| Gas per operation | 0.0005 ETH |
| Gas per day | 0.01 ETH |

### Preconditions the plan verifies before any mainnet transaction

Each is a read-only check with a recorded result. A failure stops Phase B.

- The o1 Trading API can build a USDC to B20 stock swap on Base.
- A B20 stock token can be held and transferred by the execution account contract.
- A Hydrex stock/USDC pool exists on mainnet. If not, Phase B ships spot only.
- The operator confirms in the approval file that the allowlisted accounts are in a jurisdiction eligible for the stock tokens.

## Review findings

Reviewed against the objective: naira in, stock exposure, real income, no visible crypto.

| # | Finding | Effect | Handled |
| --- | --- | --- | --- |
| 1 | No real provider is integrated; all income is fixture-driven | The product cannot earn | Phases A and B |
| 2 | All chain access is hardwired to one loopback node (`publicClientFor()`, `readManifest()`, a single `Wallet.executionAddress`) | No second network is possible | Phase A |
| 3 | `stocks/reference.ts` parses `data[]`, `chain_id`, `price.micro_usd`; the real API returns `tokens[]`, `contract_address`, `nav_price`, `next_page_token` | The catalog cannot read real stock data | Phase A |
| 4 | `evaluateReference` marks only chain 8453 tradable, while execution is on other chains | Reference identity and execution asset are conflated | Phase A, via an explicit stand-in mapping |
| 5 | Policy and evidence hard-code "no provider is verified" in code and tests | Blocks any real adapter | Phase A |
| 6 | The o1 evidence record cites an aggregator page that now returns 404 | Stale evidence | Phase A |
| 7 | There is no customer app; only the landing page exists | No user can reach the product, so "seamless, no crypto" is unproven | **Not in this plan.** Needs its own design and plan |
| 8 | Privy is the design's wallet layer but is not integrated | Sign-up and custody are test scaffolding | Not in this plan |
| 9 | Fiat rails have never run against a real partner | Real naira is unproven | Not in this plan |

Finding 7 is the largest gap against the stated objective and the Dec 5 submission. This design makes the income real; it does not make the product usable by a customer.

## Constraints

- `APP_STAGE=beta` stays mandatory.
- No private key in source control, fixtures, logs or API output.
- Follow `BACKEND_PATTERNS.md` and `CLAUDE.md`: no conditional object spread; verification gates run once at the end.
- CI must pass with no network access and no Base Sepolia credentials.

## Left to the builder

- Internal names of helpers not fixed by the plan's interface blocks.
- Whether the Base Sepolia smoke journey is one script or several.
- Retry and timeout tuning for the remote RPC and the stocks API.

## Open risks

- Hydrex's testnet contracts could be redeployed or abandoned. The manifest pins code hashes; a mismatch holds the network.
- The Algebra pool read ABI is taken from the upstream Algebra Integral interface, not from Hydrex's SDK. The plan verifies it against the deployed pool before relying on it.
- The stocks API response types are documented but were not fetched from this environment. The plan records a real fixture first and stops if it differs.
- Public testnet pools can be traded by anyone, so quotes can move. Minimum-output checks cover this.
