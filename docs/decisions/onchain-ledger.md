# Decision: exact raw quantities and onchain evidence in the ledger

Date: 2026-11-14.

## Rules

1. Cash stays in minor units (`BIGINT`: kobo NGN, micro-units USDC). Raw token
   quantities, allowances, multipliers and gas use exact unsigned 256-bit integers:
   `numeric(78,0)` in PostgreSQL, `bigint` in TypeScript, converted only at Prisma
   boundaries via `src/utils/asset-units.ts` (`parseRaw`, `toDbRaw`, `fromDbRaw`).
   `2^256-1` is the hard ceiling; fractional, negative and non-canonical strings are
   rejected. No floating-point Decimal arithmetic and no global JSON bigint serializer.
2. `LedgerEntry.amount` is widened to `numeric(78,0)` because cash and stock units share
   the table; `ledgerService.post` keeps its bigint `JournalInput` and bigint balance
   returns, converting only when writing rows. Same-asset positive journal constraints
   and the append-only trigger are unchanged.
3. Stock identity is `assetKey = namespace:chainId:lowercase-address`, never a ticker
   alone. `Stock.symbol` is no longer unique; legacy `sim:*` rows keep their synthetic
   namespace and are never reinterpreted as onchain balances. New testnet rows are seeded
   under the `testnet:31337:*` namespace without rewriting old holdings.
4. Quotes, consents, provider/custody/network snapshots and operations are immutable
   once persisted. Each operation has a unique key plus request hash, a serialized
   signed-payload reference/hash, nonce, tx hash, step status, block identity and
   finality. Signed payload storage is private and redacted — only hashes are exposed.
5. Reward receipts have the unique identity `(network, source, txHash, logIndex,
   beneficiary)`; the original accrual period is stored separately from the payout week.
   Pre-existing `Earning` rows keep `provenance = legacy_fixture` and are never
   reinterpreted; new accrual never uses `simWeeklyEarningMicroPerShare`.
6. `EarningAllocation` gives each receipt exactly one payout/reinvest allocation identity
   per week so duplicate Friday workers cannot double-pay.
