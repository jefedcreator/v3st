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
