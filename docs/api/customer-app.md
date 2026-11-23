# Customer app API (`/api/v1/app/*`)

The customer-facing API for the V3ST app. Every route lives under `src/app/api/v1/app/**/route.ts`, is wrapped in `withMiddleware(..., { audience: "customer" })`, and is guarded by `tests/app/routes-guard.test.ts`.

## Conventions

- **Auth:** cookie session (`sara-session`) via `authMiddleware`. Sign-in is `POST /api/v1/app/auth/privy` with Privy `access_token` + `identity_token` (see "Privy" below).
- **Envelopes:** success is `{ status, message, data }`; errors are `{ status, message, code, data: null }` where `message`/`code` are already customer-safe display copy (see "Errors" below).
- **Types:** every response type is declared in `src/types/app.ts`; import DTOs from there.
- **Wire format:**
  - naira as integer-string **kobo** in `*_kobo`;
  - shares as integer-string **millionths** in `shares_micro`;
  - US prices as integer-string **micro-dollars** in `*_usd_micro`;
  - signed integer **basis points** in `*_bps`;
  - ISO-8601 times in `*_at` (dates as `YYYY-MM-DD` in `*_on`);
  - support references formatted `V3-XXXX-XXXX` (Crockford base32).
  - BigInt never crosses JSON.
- **Rates:** display values (cash, holdings, prices, totals) use the payout (sell) rate; previews use the rate of the transaction itself (deposit rate for buys and add money, payout rate for sells and withdrawals).
- **Unknown is null:** a value the system doesn't know is `null`, never `"0"`. A price older than the 7-day display window, or a holding that has never been priced, has `value_kobo: null`; totals that skip such values report `total_status: "partial"`.
- **Field names:** snake_case everywhere.
- **Idempotency:** writes that move money or positions take an `Idempotency-Key` header. A replay with the same key and the same preview returns the stored result (HTTP 200, no PIN check, so a retry never counts as a wrong PIN); the same key with a different preview is refused with `TRY_AGAIN`.
- **Origin:** cookie-authenticated non-GET requests must come from `NEXT_PUBLIC_APP_URL` (a missing Origin is allowed for non-browser clients). The sign-in and test-token routes reject any other Origin.
- **Live updates:** `GET /api/v1/app/events?after=<seq>` is SSE; frames are `id: <seq>\nevent: changed\ndata: {"areas":[...]}\n\n` with areas `home`, `cash`, `orders`, `holdings`, `earn`, `earnings`, `activity`, `notifications`. Internal event names are never sent.

### Vocabulary rule

Every customer response, errors included, passes `findCustomerLeaks` (`src/backend/services/app/vocabulary.ts`); `tests/helpers/app.ts` runs every app-route response in the test suite through it.

- **Keys:** a key leaks when any `_`-separated segment, case-insensitively, is one of `wallet address chain network token gas tx hash onchain provider asset raw wei usdc swap pool liquidity contract integration deployment relayer sponsor nonce block calldata signature simulated`.
- **Values:** a string leaks when it matches a `0x` hex run of 8+ characters; any of the words crypto, cryptocurrency, blockchain, on-chain/onchain, wallet(s), token(s), USDC, stablecoin(s), web3, DeFi, swap(s), smart contract(s), liquidity, seed phrase, private key, wei, Ethereum, Sepolia, Anvil, testnet, mainnet, Hydrex, Hydropump, Bankr, O1 Exchange, Stonks, BaseStonk, Feel.cash, Privy, relayer, gas fee(s); "tokenized/tokenised/tokenization" (allowed only in legal documents); or an upper-case internal code such as `MIN_OUTPUT_BREACH` (allowed only as the value of a key named `code`).
- Experimental and permanently locked strategies never appear in a customer response.

## Routes

### Sign-in, onboarding, security

| Route | Body / query | Data |
| --- | --- | --- |
| `POST /api/v1/app/auth/privy` | `{ access_token, identity_token }` | `{ is_new_customer, next_step }` and sets the session cookie |
| `POST /api/v1/app/auth/logout` | — | `{ signed_out: true }` |
| `POST /api/v1/app/beta/privy-tokens` | `{ email }` (simulated mode only; `NOT_FOUND` otherwise) | `{ access_token, identity_token }` |
| `GET /api/v1/app/session` | — | `AppSessionDto` (signed_in, customer, onboarding, unread_notifications, beta) |
| `GET /api/v1/app/onboarding` | — | steps (`identity`, `pin`, `agreements`, `bank_account`, all required, in that order), `next_step`, `complete`; every money action answers `SETUP_REQUIRED` until all four are done |
| `POST /api/v1/app/identity` | `{ test_identity_id }` (beta) | identity status |
| `GET /api/v1/app/identity/test-identities` | — | available test personas |
| `POST /api/v1/app/agreements` | `{ documents: [{ slug, version }] }` | accepted documents |
| `GET /api/v1/app/documents` / `GET /api/v1/app/documents/[slug]` | — | versioned customer documents |
| `PUT /api/v1/app/security/pin` | `{ pin, current_pin? }` | `{ pin_set: true }` |
| `POST /api/v1/app/security/pin/reset` | `{ access_token, identity_token, pin }` from a **new** Privy email sign-in (a session not used before, issued in the last 300 s) | `{ pin_set: true, other_sessions_signed_out }` |
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
| `GET` / `PUT /api/v1/app/bank-account` | PUT: `{ bank_code, account_number, pin }` (needs a verified identity, the PIN and the documents; the name must match the verified name) | saved account; transfers in come from it and withdrawals go to it |
| `POST /api/v1/app/withdrawals/preview` | `{ amount_kobo }` | fee + you-receive preview |
| `POST /api/v1/app/withdrawals` | `{ preview_id, pin }` + idempotency key | withdrawal |
| `GET /api/v1/app/withdrawals/[id]` | — | withdrawal progress + bank reference |

### Catalog, holdings, home, orders

| Route | Body / query | Data |
| --- | --- | --- |
| `GET /api/v1/app/stocks?q=&watchlist=true` | query | catalog list with prices in kobo |
| `GET /api/v1/app/stocks/[id]` | — | detail incl. `earn_product_id`, `your_position`, documents |
| `GET /api/v1/app/stocks/[id]/chart?range=1D` | query | price series |
| `PUT` / `DELETE /api/v1/app/watchlist/[id]` | path = stock id | `{ on_watchlist }` (idempotent) |
| `GET /api/v1/app/holdings` | — | positions valued in kobo |
| `GET /api/v1/app/home` | — | totals, 24h change, cash, earn, earnings, open orders, action items, greeting |
| `POST /api/v1/app/orders/preview` | `{ stock_id, side, amount_kobo }` (≥ 100000) or `{ stock_id, side: "sell", sell_all: true }`; a buy may add `pay_with: "cash" \| "bank_transfer"` (default: cash when it covers the amount) | preview with fees; `executes` is `now`, `when_prices_update` or `after_your_transfer` |
| `POST /api/v1/app/orders` | `{ preview_id, pin }` + idempotency key | placed order |
| `GET` / `DELETE /api/v1/app/orders/[id]` | — | order detail / cancel while waiting |
| `POST /api/v1/app/beta/orders/[id]/complete-transfer` | — (beta) | marks a pay-by-transfer order's test transfer paid |

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

Internal `ErrorCode`s are mapped to customer codes and copy in `src/backend/services/app/copy.ts`; the HTTP status is kept. The frontend renders `message` directly and uses `code` only for analytics and branching.

| Customer code | Message | Internal codes |
| --- | --- | --- |
| `SIGN_IN_REQUIRED` | Please sign in to continue. | UNAUTHENTICATED |
| `SIGN_IN_AGAIN` | Please sign in again to continue. | LOGIN_EXPIRED, REAUTH_REQUIRED |
| `NOT_ALLOWED` | You can't do that from this account. | FORBIDDEN, CROSS_ORIGIN |
| `NOT_ALLOWED` | Sign in with an email address. | LOGIN_NOT_ALLOWED |
| `NOT_FOUND` | We couldn't find that. | NOT_FOUND, ACCOUNT_NOT_FOUND |
| `CHECK_DETAILS` | Check your details and try again. | BAD_REQUEST, MALFORMED_JSON, VALIDATION_FAILED, PAYLOAD_TOO_LARGE, AMOUNT_OUT_OF_RANGE, BELOW_MINIMUM, BELOW_PROVIDER_MINIMUM |
| `TRY_AGAIN` | That didn't go through. Please try again. | CONFLICT, IDEMPOTENCY_KEY_REQUIRED, IDEMPOTENCY_KEY_REUSED, STALE_STATE, INVALID_TRANSITION, LEDGER_KEY_REUSED, MODE_MISMATCH, NOT_DEAD, ALREADY_APPROVED, QUOTE_CONSUMED |
| `PRICE_CHANGED` | The price changed. Review the new price to continue. | QUOTE_EXPIRED, QUOTE_CHANGED, SLIPPAGE, PRICE_IMPACT_EXCEEDED, NEEDS_CONFIRMATION, PREVIEW_EXPIRED |
| `NOT_ENOUGH_CASH` | You don't have enough cash for this. | INSUFFICIENT_FUNDS |
| `NOT_ENOUGH_SHARES` | You don't have that many shares. | INSUFFICIENT_SHARES |
| `LIMIT_REACHED` | This is above your current limit. | LIMIT_EXCEEDED, AUTHORIZATION_EXCEEDED |
| `SETUP_REQUIRED` | Finish setting up your account to continue. | KYC_REQUIRED, BANK_ACCOUNT_REQUIRED, ONBOARDING_INCOMPLETE |
| `DOCUMENT_UPDATED` | This document was updated. Please review the latest version. | AGREEMENT_OUTDATED |
| `NAME_MISMATCH` | The name on this bank account doesn't match your verified name. | NAME_MISMATCH |
| `ALREADY_DONE` | That's already done. | ALREADY_VERIFIED |
| `ACCOUNT_EXISTS` | This email is already linked to another account. | IDENTITY_CONFLICT |
| `PIN_NEEDED` | Enter your PIN to continue. | PIN_REQUIRED |
| `PIN_INCORRECT` | That PIN isn't right. | PIN_INCORRECT |
| `PIN_LOCKED` | Too many wrong PINs. Try again in 30 minutes or reset your PIN. | PIN_LOCKED |
| `PIN_TOO_SIMPLE` | Choose a PIN that's harder to guess. | PIN_WEAK |
| `BETA_TEST_ACCOUNT` | During the beta, use a test phone number. | TEST_PHONE_REQUIRED |
| `PROCESSING` | We're still finishing your last request. | OPERATION_UNRESOLVED, CONVERSION_PENDING, REWARD_NOT_CONFIRMED |
| `PRICES_UPDATING` | Prices are updating. You can still place your order and it will go through when they do. | REFERENCE_STALE, PRICE_OUT_OF_RANGE |
| `UNAVAILABLE` | This isn't available right now. | STOCK_UNAVAILABLE, CAPABILITY_UNAVAILABLE, NO_ROUTE, STRATEGY_UNAVAILABLE, SCENARIO_UNAVAILABLE, INVALID_SCENARIO_STATE |
| `ALREADY_STARTED` | This order has already started and can't be cancelled. | ORDER_NOT_CANCELLABLE |
| `ADD_MONEY_PAUSED` | Adding money is paused for a short time. You can still view and sell your investments. | DEPOSITS_PAUSED |
| `WITHDRAWALS_PAUSED` | Withdrawals are paused for a short time. Your money is safe. | PAYOUTS_PAUSED |
| `TRADING_PAUSED` | Trading is paused for a short time. Your money is safe. | TRADING_PAUSED |
| `TEMPORARILY_UNAVAILABLE` | This is taking longer than usual. Your money is safe. Please try again later. | RAIL_UNAVAILABLE, RATES_UNAVAILABLE, FLOAT_UNAVAILABLE, WALLET_NOT_READY, SELL_FAILED, PROVIDER_UNVERIFIED, SPONSOR_UNAVAILABLE, NETWORK_UNHEALTHY, CHAIN_RESET_DETECTED, RECONCILIATION_BREACH |
| `CONSENT_ENDED` | This automatic action was turned off. Set it up again to continue. | AUTHORIZATION_REVOKED, AUTHORIZATION_EXPIRED |
| `ACCOUNT_REVIEW` | We need to check this. Please contact support. | SCREENING_DENIED, TRAVEL_RULE_DATA_MISSING |
| `TOO_MANY_TRIES` | Too many tries. Please wait a few minutes and try again. | RATE_LIMITED |
| `SOMETHING_WENT_WRONG` | Something went wrong. Please try again. | INTERNAL |

Validation failures (`CHECK_DETAILS`, 422) carry a field-specific message for the first failing field:

| Field | Message |
| --- | --- |
| `amount_kobo` | Check the amount and try again. |
| `email` | Enter a valid email address. |
| `pin`, `current_pin` | Your PIN must be 4 digits. |
| `account_number` | Enter your 10-digit account number. |
| `preferred_name` | Use letters only, up to 40 characters. |
| anything else | Check your details and try again. |

## Beta affordances

- Simulated Privy issuer (`/app/beta/privy-tokens`) and test identities (`ada_tier2`, `tunde_tier1`, `rejected`).
- `POST /app/beta/deposits/[id]/complete` marks a sim bank transfer paid.
- `POST /app/beta/orders/[id]/complete-transfer` marks a pay-by-transfer order's test transfer paid.
- Session DTO carries `beta: { test_money: true, notice }` on every response.
- Earn risks copy states that beta fees come mostly from test trading and have no real value.

## Email sign-in

Customers can sign in during the beta with any email address linked to their verified Privy identity. Privy delivers sign-in codes in sandbox mode. The local simulated issuer accepts any valid email address and skips inbox verification. Sign-in stores the email from the identity token and ignores linked phone accounts.

## Privy (frontend contract)

**Privy development app setup**

- Email login only; SMS off.
- "Return user data in an identity token" **on** (the backend verifies `access_token` + `identity_token` offline against `PRIVY_VERIFICATION_KEY` and `PRIVY_APP_ID`; it holds no Privy app secret and never calls Privy's API).
- Test accounts **on** for the beta.
- Embedded wallets **off** (`createOnLogin: "off"`, the default); custody stays with V3ST test accounts and the app never asks the customer to sign.
- Allowed domains set to the app origin(s).
- Turn off the app's allowlist under **Users → Access Control** to allow new customers to sign in. [Privy allowlist settings](https://docs.privy.io/user-management/users/managing-users/allowlist)

**Sign-in:** Privy's headless email login — `useLoginWithEmail()`, then `sendCode({ email })` and `loginWithCode({ code })` — then `getAccessToken()` and `getIdentityToken()`, then `POST /api/v1/app/auth/privy` with both tokens. The session cookie is HttpOnly and set by the backend; the response says whether the customer is new and which onboarding step comes next.

**Sign-out:** Privy's `logout()` and `POST /api/v1/app/auth/logout`.

**PIN reset:** run the same email login again (a new Privy session) and send the fresh tokens with the new PIN to `POST /api/v1/app/security/pin/reset`. Other devices are signed out.

**Simulated mode** (`PRIVY_MODE=simulated`, CI and local): the app posts `{ email }` to `POST /api/v1/app/beta/privy-tokens` instead of opening Privy, then sends the returned tokens to `/app/auth/privy` as usual.
