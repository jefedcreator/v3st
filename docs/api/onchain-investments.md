# Onchain investments API (beta, local testnet only)

All paths are under `/api/v1`. Money is integer-string kobo/micro-units; onchain quantities are
integer-string raw units with explicit decimals per asset. Every financial write requires an
`Idempotency-Key` header and a same-origin `Origin` for cookie sessions; authentication precedes
validation. Clients submit a quote/authorization ID — never a provider, chain, recipient,
calldata or eligibility flag. No response contains wallet-signing payloads, private keys or
provider signing instructions; the relayer pays all testnet gas, so users never top up.

Error contract: `409` for expired/changed quotes, consumed quotes and inadequate balances
(`INSUFFICIENT_FUNDS`, `AUTHORIZATION_EXCEEDED`, `QUOTE_EXPIRED` on strategy quotes; an expired
investment quote instead returns `202` with `status: "needs_confirmation"` and the cash stays
with the user), `422 CAPABILITY_UNAVAILABLE` for unsupported capabilities, `503` with a typed
reason for unverified providers, sponsor shortage or unhealthy networks, `404` for cross-user
resources, `403` for non-operators on `/ops/*`.

## Catalog

| Endpoint | Notes |
| --- | --- |
| `GET /stocks` | Catalog; `tradable`, `asset_key`, reference price basis and test provenance per row |
| `GET /stocks/:id` | Detail; unknown IDs are `404`, paused/delisted rows stay visible with flags |
| `GET /strategies`, `GET /strategies/:id` | Enabled versioned mechanisms: input/receipt/reward assets, `separate_claim`, lock and caps, provenance |

## Investments

| Endpoint | Request → result |
| --- | --- |
| `POST /investments/quote` | `{ stock_id, side: "buy", input_raw? , budget_ngn? , slippage_bps? }` or `{ stock_id, side: "sell", input_raw }` (raw stock units) → persisted quote with expiry, fee breakdown, expected/minimum raw outputs, provider id |
| `POST /investments` | `{ quote_id, authorization_id }` + `Idempotency-Key` → `202` investment (status `executing` with `operation_id`); an identical replay returns `200` with the one created resource |
| `GET /investments`, `GET /investments/:id` | Owner-scoped list/detail: status, accepted terms, confirmed fill, friendly `failure_reason`; `Cache-Control: private, no-store` |

## Authorizations

| Endpoint | Request → result |
| --- | --- |
| `GET /investment-authorizations`, `POST /investment-authorizations` | List; create `{ scope: "investments"\|"strategies"\|"all", stock_id?, strategy_id?, max_spend_usdc, duration_days (1..30), policy_version }` + `Idempotency-Key` → `201` (`200` on replay) |
| `DELETE /investment-authorizations/:id` | Revokes new activity (epoch bump); accepted/broadcast work is preserved for reconciliation; idempotent |

## Strategies

| Endpoint | Request → result |
| --- | --- |
| `POST /strategy-quotes` | `{ strategy_id, action: "enter", inputs?: [{asset, raw}], budget_raw? }` or `{ strategy_id, action: "claim" }` or `{ position_id, action: "exit"\|"claim" }` → multi-asset maximum inputs / minimum outputs, user fee, expiry, `preparatory_swap` flag |
| `POST /strategy-operations` | `{ quote_id, authorization_id }` + `Idempotency-Key` → `202` operation (explicit separate consent for entry); replay returns `200` with the same operation |
| `GET /strategy-positions`, `GET /strategy-operations/:id` | Own receipt quantities, principal/value, pending rewards and status |

## Rewards, portfolio and earnings

| Endpoint | Notes |
| --- | --- |
| `GET /portfolio` | Existing DTO plus `receipts`: owner-scoped reward receipts with source, tx hash, state (`received_asset`, `conversion_pending`, `available`, `reserved_for_payout`, `paid`) |
| `POST /reward-receipts/:id/convert` | `{ authorization_id }` + `Idempotency-Key` → `202 { operation_id }`; consent-bound sell of a stock-asset receipt; replay returns the same operation. Finalized proceeds are recognized automatically and become payable Friday |
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
| `GET /ops/integrations` | Operator-only: one row per provider with `beta_adapter: "local_testnet_replica"`, `actual_integration: "disabled_unverified"`, capabilities, evidence id, `testnet_evidence` status, `real_provider_calls` (always `0`) and the replica limitation |
| `GET /ops/onchain-operations` | Operator-only: network identity + verification, unresolved operation count, operation holds, sponsor spend vs daily cap, stale observations. Never secrets |

Journeys are covered by `tests/api/onchain-journey.test.ts` (login → bank receipt → testnet
funding → quote/confirm → holdings → strategy entry → reward claim → conversion → Friday payout,
plus a failed-buy cash fallback) and `tests/api/onchain-errors.test.ts` (auth, origin, idempotency,
strict bodies, cross-user 404s, scenario scoping, operator role).
