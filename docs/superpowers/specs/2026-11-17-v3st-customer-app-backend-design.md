# V3ST customer app backend design

Date: 2026-11-17 · Status: proposed · Release: beta · Scope: backend and API

## Intent

V3ST is for Nigerians who want extra income from US stocks without learning crypto. The operator's words: "this product should not seem like a crypto product, seamless ux, no wallet signings, no gas payments. users should be able to onramp using fiat and get said stocks as easy as possible."

Today the backend works, but only as a set of operator-grade APIs. Every response exposes wallet addresses, chain names, USDC amounts, raw token units and provider names. Error messages say things like "Testnet unavailable" and "Reference price is missing or stale". Sign-in is a two-step beta token exchange. There is no customer-facing app at all, only the landing page.

This design adds the backend a customer app needs: a separate customer API that speaks in naira, shares and earnings, and the domain fixes that make the flows actually work end to end on Base Sepolia. The screens are a separate frontend plan built on this API.

## What the review of the current code found

Checked against `main` at `0afea32` (provider integration merged).

| # | Finding | Effect on a customer |
| --- | --- | --- |
| 1 | Every existing DTO carries crypto fields (`wallets[].address`, `chain`, `asset_key`, `price_usdc`, `raw_owned`, `multiplier_wad`, `tx_hash`, `provider_id`) | The app would have to hide data it was given, and could leak it |
| 2 | Error messages are internal text ("Testnet unavailable: …", "Stock has no onchain route in this beta") | Crypto words reach the screen on every failure |
| 3 | Deposits fund only the local test chain or the old simulated rail. Nothing moves naira-funded cash onto Base Sepolia, where the real Hydrex integration runs. The smoke journey minted test USDC directly | Naira cannot become a Base Sepolia stock at all |
| 4 | Trading requires a reference price under 60 s old. Base publishes NAV every 20–40 minutes (recorded fixture: 11:34Z and 11:52Z, fetched about 12:15Z). The decision record marks this as an open operator decision | No Base Sepolia buy can succeed |
| 5 | Portfolio valuation uses the same 60 s rule | Holdings show "unavailable" most of the day |
| 6 | Reference sync overwrites the latest price and keeps no history | No day change, no chart |
| 7 | Nothing keeps the Base Sepolia stand-in pool's price near the real stock price; only V3ST users trade it | Prices on screen and fills drift apart |
| 8 | Base Sepolia has one stock (a tAAPL stand-in) | A one-stock catalog |
| 9 | Deposit-with-stock (`POST /v1/deposits {stock_id}`) and the Friday reinvest both buy through the old simulated venue, even for onchain stocks | Shares would be credited in the ledger with no tokens on chain, which reconciliation then flags |
| 10 | Live stock descriptions from Base's API are crypto-heavy ("onchain certificate", "decentralized finance markets") | Raw provider text can't be shown |
| 11 | `verifyManifest` calls `rpcRequest` directly instead of `rpcOn` | Base Sepolia code paths can't be exercised in CI through the existing test transport |
| 12 | Experimental launch-token strategies sit in the same table as the Hydrex strategy | A customer list built naively would offer memecoins |

## Approaches

1. **A customer API layer at `/api/v1/app/*`** that composes the existing domain services and returns customer DTOs with translated errors. Existing `/api/v1/*` endpoints stay for operators, tests and scripts. **Chosen.**
2. **Reshape the existing `/api/v1/*` DTOs.** Rejected: it breaks the operator tools, the API journey tests and the documented contracts, and one DTO would serve two audiences that need different data.
3. **Translate in the frontend.** Rejected: the browser would still receive addresses and provider data; FX and share maths would move into client code; copy would drift between screens.

The operator asked for the plan directly and handed over the how, so the approach and the calls below are mine and are listed for review. The exception is sign-in: the operator chose Privy with email codes on 2026-11-17.

## Goals

- A customer can sign in with an email code through Privy, verify a test identity, set a PIN, accept the documents, add naira, buy a stock, see its value, join Earn, receive earnings and withdraw, using only `/api/v1/app/*`.
- No customer response contains a wallet, address, chain, token, gas, swap, USDC or provider term. A test enforces it on every response, including failures.
- Every flow works on Base Sepolia with real Hydrex execution, and on the local test chain in CI.
- Money is always shown in naira, prices track real stocks, and unknown values are shown as unknown, never as ₦0.

## Non-goals

- Screens, components and navigation. They are the companion frontend plan.
- SMS sign-in; V3ST-sent SMS, email or push messages; real BVN or KYC; permanent bank account numbers per user; recurring investments; price alerts; referrals; account closure and data export.
- Privy embedded wallets or Privy server signing. Custody stays with V3ST's per-customer test accounts.
- Mainnet. The Phase B gate is unchanged.
- Bankr, Stonks Exchange, BaseStonk and Feel.cash in customer flows.

## Anti-goals

- A customer is asked for a wallet, a signature, a seed phrase or gas.
- A background action runs without stored, revocable consent.
- A waiting order buys above the price protection the customer saw.
- A value the system doesn't know is shown as ₦0.
- A launch token or other experimental strategy appears in a customer response.

## Design

### Customer API and vocabulary

All customer routes live under `/api/v1/app/` and use `withMiddleware(handler, middlewares, { audience: "customer" })`. With that option:

- errors carry a customer code and customer copy from one exhaustive table, never the internal message;
- validation errors name the field in plain words.

Customer DTOs live in `src/types/app.ts`. Wire conventions: naira as integer-string kobo (`*_kobo`), shares as integer-string millionths (`shares_micro`), US prices as integer-string micro-dollars (`*_usd_micro`), changes in signed integer basis points (`*_bps`), and a support reference `V3-XXXX-XXXX` instead of any hash.

A vocabulary checker flags forbidden keys and values anywhere in a payload. Every customer route test passes its response through it. Legal documents may use "tokenized"; nothing else may.

### Sign-in, PIN and sessions

- **Sign-in with Privy, by email code.** This was the operator's decision on 2026-11-17.
  - **Frontend:** Privy's headless email login sends and checks the code, then the app posts Privy's access and identity tokens to the backend.
  - **Backend:** verifies both tokens offline with Privy's verification key (`@privy-io/node`), requires that they name the same Privy user, reads the email from the identity token's linked accounts, and issues the usual `sara-session` cookie. A customer is keyed by their Privy user ID, and their email is stored. No phone number is stored, at the operator's instruction. Any phone on the Privy account is ignored, and ramp requests to Yellow Card leave the phone out.
  - **Why email:** Privy texts only US and Canadian numbers on its standard plans. Nigerian numbers need its Scale or Enterprise plan plus V3ST's own Twilio account. Email codes work for every customer on every plan.
  - **Wallets:** Privy embedded wallets stay off, which is already the default for headless login. Custody remains V3ST's per-customer test accounts. Privy only proves who the customer is.
- **Transaction PIN:** a 4-digit PIN confirms every money movement and every automation. This replaces "sign this transaction" with the pattern Nigerian banking apps already use. Five wrong PINs lock it for 30 minutes. Resetting it requires signing in again by email: the tokens must come from a Privy session V3ST has not seen before, issued within the last 5 minutes.
- **Sessions:** each sign-in records a device label and its Privy session ID, so customers can list their sessions and sign out other devices.

### Onboarding and documents

Steps run in this order: test identity, PIN, documents (terms, risks, how shares are held), then a bank account. All four are required: a bank transfer comes from the customer's own, name-matched account, so money can't be added before it is saved (operator decision, 2026-11-17; the bank account was optional in the first draft). Each action checks readiness on the server:

- **Add the bank account:** needs identity, the PIN and the documents.
- **Add money, invest, withdraw:** need all four steps.
- **Earn:** also needs the Earn risk document.

Documents are versioned content in the repository, and acceptances are stored per version.

### One customer network per deployment

`APP_CUSTOMER_CHAIN` is `testnet` (local, CI default) or `basesepolia`. Customers see only that network's stocks and Earn products, and all their cash rails run there. The cash rails are deposit funding, withdrawal collection and Friday payouts. This fixes finding 3: managed test-USDC transfers work on Base Sepolia exactly as on the local chain, from a seeded Base Sepolia treasury.

### Prices

| Use | Rule |
| --- | --- |
| Trading | Reference no older than the per-network window: 60 s on `testnet`, **2 hours on `basesepolia`** |
| Display | Last known price up to 7 days old, labelled `delayed` with its time |
| Fill check | On Base Sepolia, a quote whose execution price is more than **3%** from the reference is refused as "prices updating" |
| History | Each new reference time is stored with that moment's naira rate, which drives the 24-hour change and the charts |

On Base Sepolia, a keeper with its own key trades test inventory every 5 minutes to keep each stand-in pool within 0.5% of the real price. The catalog grows to the stand-ins whose live price exists among AAPL, NVDA, TSLA, MSFT, AMZN, GOOGL, META and SPCX.

### Orders

The customer sees a preview, then confirms with their PIN. A preview runs in one of three modes:

- **Now:** cash is available and the price is fresh. A one-time consent is bound to a live quote, and the buy runs immediately.
- **When prices update:** cash is available but the price is stale or out of band. The order waits for the next good price.
- **After your transfer:** the customer pays by bank transfer, and the buy runs once the money arrives.

Waiting orders hold the customer's cash (or shares, for sells). They carry a single-use standing consent with a price limit of 3% from the price shown, and expire after 72 hours. A worker executes them through the existing quote, consent and execution pipeline. If the price moved past the limit, the order does not execute; at expiry the cash is released. Customers can cancel until execution starts.

### Cash, holdings and home

- **Cash:** shows available, on hold for orders, and incoming deposits.
- **Add money:** returns bank transfer instructions. In beta, a labelled endpoint completes the transfer.
- **Withdraw:** previews the fee and the amount received, then confirms with the PIN.
- **Holdings:** shows shares, value, and naira return against each lot's own purchase rate.
- **Home:** combines totals, a 24-hour change, earnings and action items such as "Finish your transfer" or "Choose what happens to your earnings".

Display values use the payout (sell) rate, which is what the customer would get back. Previews use the rates of the actual transaction.

### Earn

Customers see only strategies that are enabled, not experimental and not permanently locked, on their network, for a stock with a profile. The copy is plain: "Earn from Apple trading fees", what happens to your money, and how you can get back less than you put in.

Joining needs the PIN and an accepted Earn risk document. Joining also creates the weekly-collection automation (claim and reward conversion), shown and revocable in settings, and renewable every 30 days.

The earnings preference (pay out or reinvest) fills in default consent limits that are shown in words. Reinvest for onchain stocks now runs through the investment pipeline (fixes finding 9).

### Activity and notifications

- **Activity:** one paginated feed with plain titles and statuses ("Bought Apple", "Sent to GTBank ••1234"), plus a detail view with a timeline, fees and references. It never shows transaction hashes.
- **Notifications:** an inbox projected from the existing event log by a worker, with read state and an unread count. In beta, nothing is sent outside the app.
- **Live updates:** a customer event stream tells the app which areas changed, without internal event names.

### Beta affordances

These are labelled and exist only because `APP_STAGE=beta`:

- **Who can sign in:** Privy's test account email, emails the operator lists in `PRIVY_BETA_ALLOWLIST` (Privy sends those testers real codes), and, with Privy simulated, any `@v3st.test` address;
- **Simulated Privy:** in CI and local development, a backend route mints Privy-shaped tokens with a local key, so the same sign-in path runs without a Privy account;
- a choice of test identity instead of a BVN;
- "complete my transfer" for deposits;
- a `beta` notice on the session and home: "Beta: test money only. No real naira moves and shares have no value."

## Decisions made in this design (for operator review)

| Decision | Value | Why |
| --- | --- | --- |
| Base Sepolia trade freshness | 7,200 s | NAV arrives every 20–40 min; test money only. Resolves the open decision recorded on 2026-11-16 for `basesepolia` only |
| Fill-versus-reference guard | 300 bps on `basesepolia` | Covers pool fee and impact; anything wider is a stale or drifted pool |
| Waiting-order price protection | 300 bps from the previewed price | Familiar limit-order behaviour; prevents surprise fills |
| Waiting-order lifetime | 72 h | Survives a weekend |
| Sign-in | Privy email codes; SMS off | Operator's choice. Email works in Nigeria on every Privy plan; SMS to +234 needs Privy Scale or Enterprise plus Twilio |
| Privy wallets | Off; custody unchanged | Privy is used to prove identity only |
| Beta testers | Privy test account plus an operator allowlist, empty by default | Privy offers one test login per app; allowlisted testers receive real codes from Privy |
| PIN | 4 digits, 5 tries, 30-minute lock | Matches Nigerian banking apps |
| Display rate | Payout rate | Conservative "what you'd get" value |
| Customer network | One per deployment | Avoids split balances across networks |
| Experimental strategies | Never shown to customers | Retail newcomers; open question in Design.md resolved conservatively |
| Notifications | In-app only | Beta forbids real-recipient messages |

## Constraints

- `APP_STAGE=beta` stays mandatory; mainnet stays behind the Phase B gate.
- Privy runs as `sandbox` (a Privy development app) or `simulated` (local issuer). It never runs as a production app in this release. No real BVN is requested.
- One new dependency: `@privy-io/node@0.37.0`, published 2026-10-26. Only its offline token-verification functions are used.
- `BACKEND_PATTERNS.md` and `CLAUDE.md` apply: `withMiddleware`, services own Prisma, typed Prisma objects, strict Zod, no conditional object spread, gates run once at the end.
- CI runs with no network. Base Sepolia paths are tested against a local node started with chain ID 84532 through the existing RPC test transport.

## Left to the builder

- Copy wording beyond the strings this design and the plan pin, within the vocabulary rule.
- Internal helper names not fixed by the plan's interface blocks.
- Chart bucket edge handling, within the plan's ranges.

## Open risks

- The NAV cadence comes from one recorded fixture. If Base publishes less often, waiting orders will wait longer; the window is one policy value.
- Keeper trades create most testnet trading volume, so most Earn fees on testnet come from V3ST's own trades. This is stated in the runbook.
- The 30-day consent limit means Earn automations need renewal; the home screen prompts five days before expiry.
- PIN reset relies on Privy keeping the same session ID when it refreshes an access token and issuing a new one at each sign-in. This is not stated in Privy's docs; the plan checks it in the Privy development app.
- By default every beta tester shares Privy's single test account. Separate accounts need allowlisted real emails.
