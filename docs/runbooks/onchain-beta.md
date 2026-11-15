# Local onchain beta operations

This backend uses isolated Anvil 31337 and labelled replicas. Bankr, o1,
Hydrex/Hydropump, Stonks, BaseStonk and Feel actual-provider factories remain
unverified and disabled. See [provider evidence](../decisions/onchain-providers.md).
No setting or operator endpoint activates live providers.

## Setup and evidence

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
