# Customer app API (`/api/v1/app/*`)

The customer-facing API for the V3ST app. Every route lives under `src/app/api/v1/app/**/route.ts`, is wrapped in `withMiddleware(..., { audience: "customer" })`, and is guarded by `tests/app/routes-guard.test.ts`.

## Conventions

- **Auth:** cookie session (`sara-session`) via `authMiddleware`. Sign-in is `POST /api/v1/app/auth/privy` with Privy `access_token` + `identity_token`; in the beta a simulated issuer at `POST /api/v1/app/beta/privy-tokens` mints tokens for `*@v3st.test` emails.
- **Envelopes:** success is `{ status, message, data }`; errors are `{ status, message, code, data: null }` where `message`/`code` are already customer-safe display copy (see "Errors" below).
- **Money:** naira amounts are integer **kobo strings** (`amount_kobo`); USD amounts inside the app are converted to kobo at the display rate; share quantities are micro-share strings (`shares_micro`). BigInt never crosses JSON.
- **Field names:** snake_case everywhere.
- **Vocabulary rule:** no internal vocabulary (contract addresses, tx hashes, provider names, "authorization", "quote_id" internals, Prisma table names) may appear in any response. `findCustomerLeaks` in `src/backend/services/app/vocabulary.ts` enforces this in tests; `tests/helpers/app.ts` runs every app-route response through it.
- **Idempotency:** writes that move money or positions take an `Idempotency-Key` header and replay the original result on retry.
- **Origin:** cookie-authenticated non-GET requests must come from `NEXT_PUBLIC_APP_URL` (missing Origin is allowed for non-browser clients).
- **Live updates:** `GET /api/v1/app/events?after=<seq>` is SSE; frames are `id: <seq>\nevent: changed\ndata: {"areas":[...]}\n\n` with areas like `home`, `cash`, `orders`, `holdings`, `earn`, `earnings`, `activity`, `notifications`. Internal event names are never sent.

## Routes

### Sign-in, onboarding, security

| Route | Body / query | Data |
| --- | --- | --- |
| `POST /api/v1/app/auth/privy` | `{ access_token, identity_token }` | session cookie set |
| `POST /api/v1/app/auth/logout` | — | `{ signed_out: true }` |
| `POST /api/v1/app/beta/privy-tokens` | `{ email }` (beta only, `*@v3st.test`) | `{ access_token, identity_token }` |
| `GET /api/v1/app/session` | — | `AppSessionDto` (signed_in, customer, onboarding, unread_notifications, beta) |
| `GET /api/v1/app/onboarding` | — | steps + next_step |
| `POST /api/v1/app/identity` | `{ test_identity_id }` (beta) | identity status |
| `GET /api/v1/app/identity/test-identities` | — | available test personas |
| `POST /api/v1/app/agreements` | `{ documents: [{ slug, version }] }` | accepted documents |
| `GET /api/v1/app/documents` / `GET /api/v1/app/documents/[slug]` | — | versioned customer documents |
| `PUT /api/v1/app/security/pin` | `{ pin, current_pin? }` | `{ pin_set: true }` |
| `POST /api/v1/app/security/pin/reset` | `{ access_token, identity_token, pin }` | `{ pin_set: true }` |
| `GET /api/v1/app/security/sessions` | — | active device sessions |
| `DELETE /api/v1/app/security/sessions/[id]` | — | revoked session |
| `POST /api/v1/app/security/sessions/sign-out-others` | — | other sessions revoked |

### Cash (naira in/out)

| Route | Body | Data |
| --- | --- | --- |
| `GET /api/v1/app/cash` | — | `available_kobo`, `on_hold_kobo`, `incoming_kobo`, `as_of` |
| `POST /api/v1/app/cash/deposits` | `{ amount_kobo }` + idempotency key | deposit with `pay_to` bank details |
| `GET /api/v1/app/cash/deposits/[id]` | — | deposit progress |
| `POST /api/v1/app/beta/deposits/[id]/complete` | — (beta) | marks the sim transfer paid |
| `GET /api/v1/app/banks` | — | bank list |
| `GET` / `PUT /api/v1/app/bank-account` | PUT: `{ bank_code, account_number, pin }` | saved payout account |
| `POST /api/v1/app/withdrawals/preview` | `{ amount_kobo }` | fee + you-receive preview |
| `POST /api/v1/app/withdrawals` | `{ preview_id, pin }` + idempotency key | withdrawal |
| `GET /api/v1/app/withdrawals/[id]` | — | withdrawal progress + bank reference |

### Catalog, holdings, home, orders

| Route | Body / query | Data |
| --- | --- | --- |
| `GET /api/v1/app/stocks?q=&watchlist=true` | query | catalog list with prices in kobo |
| `GET /api/v1/app/stocks/[id]` | — | detail incl. `earn_product_id`, `your_position`, documents |
| `GET /api/v1/app/stocks/[id]/chart?range=1D` | query | price series |
| `POST` / `DELETE /api/v1/app/watchlist/[id]` | path = stock id | watchlist toggle |
| `GET /api/v1/app/holdings` | — | positions valued in kobo |
| `GET /api/v1/app/home` | — | totals, 24h change, cash, earn, earnings, open orders, action items, greeting |
| `POST /api/v1/app/orders/preview` | `{ stock_id, side, amount_kobo }` or `{ stock_id, side: "sell", sell_all: true }`, buy may add `pay_with: "cash" \| "bank_transfer"` | preview with fees |
| `POST /api/v1/app/orders` | `{ preview_id, pin }` + idempotency key | placed order |
| `GET` / `DELETE /api/v1/app/orders/[id]` | — | order detail / cancel while waiting |

### Earn and earnings

| Route | Body | Data |
| --- | --- | --- |
| `GET /api/v1/app/earn` | — | `AppEarnProductDto[]` (copy, risks, minimum, position) |
| `GET /api/v1/app/earn/[id]` | — | one product |
| `POST /api/v1/app/earn/[id]/preview` | `{ amount_kobo }` (≥ 500000) | split, fees, automation note, risk document version |
| `POST /api/v1/app/earn/[id]/join` | `{ preview_id, pin, accepted_risk_version }` + idempotency key | position |
| `POST /api/v1/app/earn/positions/[id]/withdraw/preview` | — | what you get back |
| `POST /api/v1/app/earn/positions/[id]/withdraw` | `{ preview_id, pin }` + idempotency key | position |
| `GET /api/v1/app/earnings` | — | totals, choice, reinvest stock, next payout, limits, weekly outcomes |
| `PUT /api/v1/app/earnings/preference` | `{ choice: "payout" \| "reinvest", stock_id?, pin }` | updated summary |

### Activity, notifications, settings

| Route | Body / query | Data |
| --- | --- | --- |
| `GET /api/v1/app/activity?cursor=&limit=` | query (limit ≤ 50, default 20) | `{ items, next_cursor }`; kinds: `add_money`, `withdrawal`, `buy`, `sell`, `earn_join`, `earn_withdraw`, `earnings`, `earnings_payout`, `reinvest` |
| `GET /api/v1/app/activity/[id]` | — | item + lines + timeline + bank |
| `GET /api/v1/app/notifications?cursor=` | query (20/page) | `{ items, next_cursor }` |
| `POST /api/v1/app/notifications/read` | `{ ids: [...] }` or `{ all: true }` (exactly one) | `{ unread }` |
| `GET /api/v1/app/events?after=` | query | SSE `changed` frames with areas |
| `GET /api/v1/app/automations` | — | standing consents (order consents excluded) |
| `DELETE /api/v1/app/automations/[id]` | — | turned off (no PIN needed) |
| `POST /api/v1/app/automations/[id]/renew` | `{ pin }` | renewed 30-day consent |
| `GET` / `PATCH /api/v1/app/profile` | PATCH: `{ preferred_name: string \| null }` | profile incl. email, identity level, bank account |

## App paths used in links

`/setup`, `/cash`, `/orders/{id}`, `/earnings`, `/earn/{productId}`, `/settings/bank`, `/settings/automations`, `/activity/{id}` (activity item ids are `dep_…`, `wd_…`, `pay_…`, `ord_…`, `inv_…`, `eop_…`, `wk_…`).

## Errors

Internal `ErrorCode`s are mapped to customer codes + copy in `src/backend/services/app/copy.ts`. The customer-facing codes:

`SIGN_IN_REQUIRED`, `SIGN_IN_AGAIN`, `NOT_ALLOWED`, `NOT_FOUND`, `CHECK_DETAILS`, `TRY_AGAIN`, `PRICE_CHANGED`, `NOT_ENOUGH_CASH`, `NOT_ENOUGH_SHARES`, `LIMIT_REACHED`, `SETUP_REQUIRED`, `DOCUMENT_UPDATED`, `NAME_MISMATCH`, `ALREADY_DONE`, `ACCOUNT_EXISTS`, `PIN_NEEDED`, `PIN_INCORRECT`, `PIN_LOCKED`, `PIN_TOO_SIMPLE`, `BETA_TEST_ACCOUNT`, `PROCESSING`, `PRICES_UPDATING`, `UNAVAILABLE`, `ALREADY_STARTED`, `ADD_MONEY_PAUSED`, `WITHDRAWALS_PAUSED`, `TRADING_PAUSED`, `TEMPORARILY_UNAVAILABLE`, `CONSENT_ENDED`, `ACCOUNT_REVIEW`, `SOMETHING_WENT_WRONG`.

The frontend renders `message` directly; `code` is for analytics and branching only.

## Beta affordances

- Simulated Privy issuer (`/app/beta/privy-tokens`) and test identities (`ada_tier2`, `tunde_tier1`, `rejected`).
- `POST /app/beta/deposits/[id]/complete` marks a sim bank transfer paid.
- Session DTO carries `beta: { test_money: true, notice }` on every response.
- Earn risks copy states that beta fees come mostly from test trading and have no real value.

## Privy (frontend contract)

- Email login only; no phone/SMS.
- Identity tokens **on** (the backend verifies `access_token` + `identity_token` offline against `PRIVY_VERIFICATION_KEY`).
- Test accounts **on** during the beta; allowlisted testers receive real sign-in emails from Privy, so Privy's own allowlist must stay in step with `PRIVY_BETA_ALLOWLIST`.
- Embedded wallets **off**; custody stays with V3ST test accounts — the app never asks the customer to sign.
- Allowed domains configured to the app origin(s).
- The app calls `POST /api/v1/app/auth/privy` with the two tokens; the session cookie is HttpOnly and set by the backend.
