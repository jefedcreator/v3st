# Local onchain beta operations

This backend uses isolated Anvil 31337 and labelled replicas. Bankr, o1,
Hydropump, Stonks, BaseStonk and Feel actual-provider factories remain
unverified and disabled. Hydrex is verified on Base Sepolia (84532) only while
`BASE_SEPOLIA_RPC_URL` is set and the deployed manifest's code hashes still
match; `GET /api/v1/ops/integrations` then reports it as
`verified_provider_testnet` with `verified_chain_id: 84532`, otherwise
`disabled_unverified`. See [provider evidence](../decisions/onchain-providers.md).
No setting or operator endpoint activates live providers or mainnet chains.

## Setup and evidence

Keeper and treasury (Base Sepolia beta): fund the keeper with test ETH and test USDC from the Base Sepolia faucets and set `BASE_SEPOLIA_KEEPER_PRIVATE_KEY` (testnet-only key). The keeper runs every 300 s (`policy.app.keeper.slotSeconds`) and trades the labelled test pools to keep stand-in prices aligned with their reference — on testnet, those keeper trades are also what generate most of the Earn fees customers see. Top up the USDC treasury with `yarn sepolia:treasury --micro <amount>` (operator-only, mints into the basesepolia treasury with the relayer's `managedMint`).

Freshness: on Base Sepolia a reference price must be younger than **2 hours** to trade (`referenceUsable`); the trading and display windows are tracked separately, so a stale reference pauses new orders (customers see "Prices are updating") without hiding the last known price.

Use Node from `.nvmrc`, Yarn 1.22.22, Foundry from `.foundry-version` and solc
0.8.30 from `foundry.toml`. Run `bash scripts/setup-cloud.sh`, configure a local
beta PostgreSQL database, apply migrations with `yarn db:migrate`, then start
`yarn testnet:start` in one process and run `yarn testnet:deploy` and
`yarn seed:beta` in another. Run Next and `yarn worker` separately. Neither
`NODE_ENV=production` nor a build changes `APP_STAGE=beta` or provider modes.

Keep `.testnet/` private. Its manifest records deployment checkpoint, genesis,
contract addresses/code hashes and ABI hashes; the restricted keystore must be
backed up with matching chain state and database. Set `TESTNET_STATE_DIR` to
isolate a development/test deployment. Never copy keys to a remote RPC. The
settlement token's managed transfer methods are explicit local beta scaffolding,
not issuer features or production custody technology.

The verification suite provisions its own loopback node and ephemeral manifest
in temporary storage. `TEST_DATABASE_URL` must identify a disposable `_test`
database distinct from `DATABASE_URL`. Test helpers migrate and truncate only
that database. The API journey funds the customer through a bank receipt and a
confirmed local transfer, without a separate customer balance injection.

## Holds and recovery

- **Stalled nonce or worker crash:** inspect `/api/v1/ops/onchain-operations` and
  jobs. Restart the worker or retry a dead job with an audited reason. Retain the
  original operation, signed payload and nonce. Never create a second order or
  change routes to resolve an unknown broadcast.
- **Reorg:** continue receipt observation. Unconfirmed outputs remain reserved.
  A discrepancy after finalization pauses trading/payouts; investigate and use an
  explicitly reviewed compensating posting, never update/delete journal history.
- **Chain reset, changed bytecode or lost keystore:** hold the deployment. Restore
  the matching chain/DB/keystore snapshot together or provision a separate database
  and user namespace. Do not replay old payloads into redeployed addresses.
- **Sponsor outage:** restore the fixture relayer and its budget. Gas is an
  application cost; users never acquire ETH or sign gas top-ups.
- **Base Sepolia manifest code-hash mismatch:** `verifyManifest(84532)` fails,
  so Hydrex drops back to `disabled_unverified` and Base Sepolia operations
  hold. Do not force the flag or edit the manifest by hand. Redeploy with
  `yarn sepolia:deploy` into a fresh `TESTNET_STATE_DIR` (or restore the matching
  manifest and chain state together), then confirm the ops row flips back to
  verified before resuming.
- **Exhausted Base Sepolia relayer:** the relayer key is out of test ETH or has
  hit the per-chain sponsor cap. New operations fail closed with a sponsor
  shortage and stay queued; top the relayer up from the Base Sepolia faucet.
  Never bridge or move funds from another chain, and never ask users for gas.
- **Revocation:** blocks new signing/broadcast; already accepted effects reconcile.
  An exit requires its own valid instruction. Do not release an uncertain reserve.
- **Underfunded claim or conversion:** retain reward assets and original accrual
  period. Reconcile the source entitlement and liquidity; only finalized settlement
  proceeds can fund Friday payouts. A failed/repeated claim cannot create income.
- **Reconciliation difference/unavailable reads:** keep payouts and new trading
  paused; inspect fixed-block cash, raw stock and pool receipt comparisons.
  Reads, observation and recovery remain available. Resume controls only after
  resolution, with an operator reason; never mark an unavailable read balanced.

Friday payouts start at 08:00 Africa/Lagos; Thursday harvest is 22:00 and float
precheck 23:00, as configured in `policy.ts`. Fees, minimums and conversion
permissions require stored consent. Receipt references alone do not mean paid.

## Restore and release checks

Back up database journals, operations, signed payloads and matching private chain
state together; rehearse restore in an isolated copy. Apply additive migrations
before deploying code; rollback application code without deleting ledger history.
Validate manifest/checkpoint, wallet ownership, unresolved nonces and reconciliation
before resuming new work. Restrict operator access and keep signed payloads out of
responses/logs. The app exposes APIs only; frontend delivery is a separate scope.

No actual-provider sandbox latency or under-two-minute partner claim is established
by local replica tests. Commercial access, geography/identity/custody permissions,
real issuer rights, provider contracts, gas sponsorship and live regulatory review
remain separate future work. No application deployment is part of this review.
