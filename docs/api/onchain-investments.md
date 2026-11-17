# Onchain investments API (beta, local testnet only)

All paths are under `/api/v1`. Money is integer-string kobo/micro-units; onchain quantities are
integer-string raw units with explicit decimals per asset. Every financial write requires an
`Idempotency-Key` header and a same-origin `Origin` for cookie sessions; authentication precedes
validation. Clients submit a quote/authorization ID — never a provider, chain, recipient,
calldata or eligibility flag. No response contains wallet-signing payloads, private keys or
provider signing instructions; the relayer pays all testnet gas, so users never top up.

Error contract: `409` for expired/changed quotes, consumed quotes and inadequate balances
(`INSUFFICIENT_FUNDS`, `AUTHORIZATION_EXCEEDED`, `QUOTE_EXPIRED` for an expired confirmation; cash remains with the user), `422 CAPABILITY_UNAVAILABLE` for unsupported capabilities, `503` with a typed
reason for unverified providers, sponsor shortage or unhealthy networks, `404` for cross-user
resources, `403` for non-operators on `/ops/*`.

## Catalog

| Endpoint | Notes |
| --- | --- |
| `GET /stocks` | Catalog; `tradable`, `asset_key`, reference price basis and test provenance per row. On Base Sepolia, `stand_in_for` names the live tokenized-stock asset key the test stand-in tracks (e.g. `tAAPL` → the AAPLc contract); reference prices sync from Base's tokenized stocks API |
| `GET /stocks/:id` | Detail; unknown IDs are `404`, paused/delisted rows stay visible with flags |
| `GET /strategies`, `GET /strategies/:id` | Enabled versioned mechanisms: input/receipt/reward assets, `separate_claim`, lock and caps, provenance |

## Investments

| Endpoint | Request → result |
| --- | --- |
| `POST /investments/quote` | `{ stock_id, side: "buy", input_raw? , budget_ngn? , slippage_bps? , allow_partial_fill? }` or `{ stock_id, side: "sell", input_raw }` (raw stock units) → persisted quote with expiry, fee breakdown, expected/minimum raw outputs, `allow_partial_fill`, provider id. If `allow_partial_fill` is false, a smaller input fill cannot finalize (reverted `MIN_OUTPUT_BREACH`); if true, the filled portion must satisfy `0 < actualInput <= quotedInput` and `actualOutput >= ceil(minOutput * actualInput / quotedInput)`, and only the unused input remainder is released |
| `POST /investments` | `{ quote_id, authorization_id }` + `Idempotency-Key` → `202` investment (status `executing` with `operation_id`); an identical replay returns `200` with the one created resource |
| `GET /investments`, `GET /investments/:id` | Owner-scoped list/detail: status, accepted terms, confirmed fill, friendly `failure_reason`; `Cache-Control: private, no-store` |

## Authorizations

| Endpoint | Request → result |
| --- | --- |
| `GET /investment-authorizations`, `POST /investment-authorizations` | List; create a strict union + `Idempotency-Key` → `201` (`200` on replay). One-time: `{ kind: "one_time", quote_kind: "investment"\|"strategy", quote_id, policy_version, disclosure_version }` — bound to one owned persisted quote, all limits resolve from it (strategy entry always requires this). Standing: `{ kind: "standing", stock_ids, strategy_ids, actions, max_action_ngn, max_total_ngn, max_fee_bps, max_slippage_bps (≤100), expires_at (≤30 days out), policy_version, disclosure_version }` — `actions` only `claim`/`reward_conversion`/`reinvest`/`withdrawal_sale`, naira caps in positive integer-string kobo, empty/wildcard asset scopes rejected; cumulative value reserves atomically against the caps |
| `DELETE /investment-authorizations/:id` | Revokes new activity (epoch bump); accepted/broadcast work is preserved for reconciliation; idempotent |

## Strategies

| Endpoint | Request → result |
| --- | --- |
| `POST /strategy-quotes` | `{ strategy_id, action: "enter", budget_ngn }` (compatibility forms: `budget_raw` or explicit `inputs`, exactly one) or `{ strategy_id, action: "claim" }` or `{ position_id, action: "exit"\|"claim" }` → multi-asset maximum inputs / minimum outputs, user fee, expiry, `preparatory_swap` flag |
| `POST /strategy-operations` | `{ quote_id, authorization_id }` + `Idempotency-Key` → `202` operation (explicit separate consent for entry); replay returns `200` with the same operation |
| `GET /strategy-positions`, `GET /strategy-operations/:id` | Own receipt quantities, principal/value, pending rewards and status |

## Rewards, portfolio and earnings

| Endpoint | Notes |
| --- | --- |
| `GET /portfolio` | Existing DTO plus `receipts`: owner-scoped reward receipts with source, tx hash, state (`received_asset`, `conversion_pending`, `available`, `reserved_for_payout`, `paid`) |
| `POST /reward-receipts/:id/convert` | `{ authorization_id }` + `Idempotency-Key` → `202 { operation_id }`; the authorization must be a standing `reward_conversion` consent covering the receipt's stock; replay returns the same operation. Finalized proceeds are recognized automatically and become payable Friday |
| `GET /earnings` | Weeks with earned/paid/reinvested/pending and payout state |
| `PUT /earnings/preference` | `{ mode, stock_id? }` plus versioned consent limits: `consent_version`, `allow_background_conversion`, `max_conversion_fee_bps`, `max_fx_bps` (required together) |

## Events

`GET /events` (SSE, with `Last-Event-ID`/`after` resume) reports committed domain changes
(`order.updated`, `investment.updated`, `strategy.operation.updated`, `strategy.position.updated`,
…). Polling remains available; reads are private and `no-store`.

## Beta scenarios and operator evidence

| Endpoint | Notes |
| --- | --- |
| `POST /beta/onchain-scenarios` | User-owned local-testnet operation plus a named scenario (`delayed_confirmation`, `revert`, `partial_fill`, `sponsor_shortage`, `zero_rewards`) + `Idempotency-Key`. Scenarios alter only local fixture state through signed testnet contract calls and the normal worker; no arbitrary RPC, mint recipient or calldata inputs |
| `GET /ops/integrations` | Operator-only: one row per provider with `integration_kind` (`local_testnet_replica` for the five replicas; `verified_provider_testnet` for Hydrex while Base Sepolia is configured and the manifest verifies), `beta_adapter`, `actual_integration: "disabled_unverified" \| "verified_provider_testnet"`, `verified_chain_id` (`84532`, or `null` when unverified), capabilities, evidence id, `testnet_evidence` status, `real_provider_calls` (live count of actual provider factory calls in this process; `0` while unverified) and the replica limitation |
| `GET /ops/onchain-operations` | Operator-only: network identity + verification, unresolved operation count, operation holds, sponsor spend vs daily cap, stale observations. Never secrets |

Journeys are covered by `tests/api/onchain-journey.test.ts` (login → bank receipt → testnet
funding → quote/confirm → holdings → strategy entry → reward claim → conversion → Friday payout,
plus a failed-buy cash fallback) and `tests/api/onchain-errors.test.ts` (auth, origin, idempotency,
strict bodies, cross-user 404s, scenario scoping, operator role).

Customer confirmation keys are namespaced by user. Every replay revalidates the original payload; a changed quote or authorization under the same key returns 409. Sell requests accept `quantity_raw`; `input_raw` remains a compatibility alias. Quote fees disclose their source asset and raw amount separately from settlement estimates.

Naira-sized investment quotes retain and return `fx_rate` with integer-string
`kobo`/`micro_usd`, `as_of` and display-cache `expires_at` evidence. Input sizing and
standing-cap reservations use the accepted rational rate. The quote's own
`expires_at` governs acceptance/broadcast; refreshing the display cache cannot
change accepted inputs. Acquired lots retain the kobo-per-dollar acquisition rate.
Position values become unavailable when reference prices are stale. Strategy
allocation checks use the price basis and multiplier once and retain that evidence
for settlement; their reference-based entry value is an estimate, separate from
actual asset movements and FIFO investment cost.
