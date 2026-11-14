# V3ST naira ramps and payouts: technical design

Nov 10, 2026 · @Someone

## Backend onchain extension · November 14, 2026

This document covers the fiat rails. The [onchain stocks and income specification](docs/superpowers/specs/2026-11-14-v3st-onchain-stocks-and-income-design.md) and [backend implementation plan](docs/superpowers/plans/2026-11-14-v3st-onchain-stocks-and-income.md) add stock execution, sponsored signing, positions, optional income strategies and confirmed proceeds using Bankr, Hydrex/Hydropump, Stonks Exchange, BaseStonk, Feel.cash and o1 Exchange.

The current scope is backend/API only and beta throughout. Crypto execution uses clearly labelled local testnet contract replicas; actual provider adapters stay disabled until their test environments are verified. No mainnet, real funds or live fallback is authorized. The new specification takes precedence for onchain behavior and income accounting; the earlier beta plan continues to govern fiat rails. Provider and regulatory statements below are historical design inputs, not live-release approvals.

## Recommended solution

Use a licensed ramp partner's API for every naira movement, and keep a pre-funded USD float with that partner so deposits and payouts settle in seconds instead of waiting on chain. Yellow Card is the primary partner, with a sandbox for testing, and Paycrest is the secondary. V3ST never touches naira itself.

Users fund by bank transfer to an account number shown in the app. They are paid out by bank transfer to their own verified account. Stablecoins move only between our treasury and the partner, which keeps the user experience in naira and shares.

| Provider | Role | Naira in | Naira out | Chains | Published NGN fees | Licence position |
| --- | --- | --- | --- | --- | --- | --- |
| [Yellow Card Payments API](https://docs.yellowcard.engineering/docs/getting-started-1) | Primary | Receive request returns a bank account number for the customer to pay into | Send request pays a bank account from our USD float | Stablecoin sends across 30+ blockchains, including Ethereum and Solana | Pay-in 1% under ₦100,000 (min ₦55), 0.5% above (min ₦1,350). Payout flat ₦100 ([fee schedule](https://help.yellowcard.io/article/1008-supported-payment-methods-and-associated-fees-for-yellowcards-paymentapi)) | Conditional SEC approval in principle, September 2026. CBN authorisation still needed |
| [Busha Business API](https://busha.io/business) | Alternative | Quote with a temporary bank account as pay-in | Quote with bank transfer as pay-out | Not stated on the page opened | Not published | SEC approval since August 2024. Needs CBN authorisation and ₦1bn extra capital |
| [Blockradar](https://docs.blockradar.co/en/introduction/faq.md) | Optional single-vendor route | Reusable NGN virtual accounts that convert deposits to stablecoins | Withdraw Fiat pays NGN bank accounts | Base, Solana, Ethereum and 13 others | Set per plan | Not confirmed |

**Secondary: [Paycrest Sender API](https://docs.paycrest.io/implementation-guides/sender-api-integration).** One endpoint creates both on-ramp and off-ramp orders. An on-ramp order returns a virtual bank account and releases stablecoins on-chain to the user's wallet on Base or Solana. An off-ramp order returns a receive address and pays the bank account once stablecoins arrive. It needs no float, takes orders from $0.50, and runs on mainnet only. Because it delivers USDC to the user's wallet, it carries the retail-stablecoin risk described under Compliance, which is why it is secondary.

**Sandbox.** Yellow Card's sandbox is at `https://sandbox.api.yellowcard.io/business`. No real money moves, and test account numbers simulate success or failure. Build and test against it first.

Why this choice:

- **The float model fits a weekly payout.** A completed deposit credits our USD float, and a payout debits it. Deposits therefore fund payouts, and only the net difference moves on chain.
- **The flat ₦100 payout fee suits small earnings.** A ₦5,000 payout costs 2%. It also sets a floor: paying out ₦500 would lose 20% to the fee.
- **Two partners remove a single point of failure.** Paycrest needs no float and delivers stablecoins straight to a wallet, so the adapter interface hides two different settlement models.
- **Blockradar is the fallback if we want one vendor** for wallets, virtual accounts, payouts and a unified USDC balance across chains. Its licence position needs checking first.

Partner licence positions come from [a summary of the CBN rules](https://afroconomist.substack.com/p/usdt-in-nigeria-will-never-be-the) issued on 5 November 2026.

## Architecture

&#91;embedded content: ramp architecture · 4 components and the web app\]

Read it left to right: naira moves only between the user's bank and the ramp partner, the backend drives the partner by API and listens for webhooks, and USDC moves only between our treasury, user wallets and trading venues on each chain.

| Component | Responsibility |
| --- | --- |
| Web app | Shows naira and shares only. Holds no keys and calls only our API |
| Ramp adapter | One interface over Yellow Card and Paycrest: quote, collect, pay out, verify webhooks |
| Ledger | Double-entry record of every naira, USD and USDC movement |
| Order orchestrator | State machine that moves each deposit and payout through its steps and retries safely |
| Trade router | Picks the chain and venue for each stock order and enforces a slippage limit |
| Wallet service | Privy embedded wallets: one EVM and one Solana wallet per user, sponsored gas, and a policy-limited server signer for swaps and payouts |
| Treasury | USDC wallet per chain plus the USD float at the partner, kept in balance by the rebalancer |

**Wallet service: Privy.** Privy provides the user wallets and the treasury wallets. It was chosen because one login covers EVM chains and Solana, gas can be sponsored on both, and a server signer can act for the user inside limits we set.

| Privy feature | Use in V3ST |
| --- | --- |
| Login by phone, email or passkey | Sign-up by phone number. No seed phrase shown |
| Embedded wallets on Ethereum, Solana and 50+ chains | One EVM wallet and one Solana wallet per user, created at sign-up |
| Pregenerated wallets | A wallet exists before first login, so an early deposit can be credited |
| Server signers | Backend submits swaps and payout transfers. The user signs nothing |
| Policies | Server signer may only swap USDC with listed stock tokens and send USDC to the treasury address, each under a value cap |
| Gas management on EVM and Solana | All user transactions are sponsored |
| Wallet fleets with signer quorums | Treasury wallet per chain, with more than one approver for large moves |
| Key export | Users can leave with their assets |

Privy is not the naira ramp. Its fiat endpoints are not confirmed for NGN, so Yellow Card and Paycrest remain the ramp partners.

## On-ramp flow: naira to shares

A deposit becomes shares in one background sequence. The user makes one bank transfer and signs nothing.

1. **User enters an amount.** The app calls `POST /v1/deposits` with the naira amount and, optionally, the stock to buy.
2. **Backend requests a quote.** The ramp adapter fetches the partner's channel and rate, then submits a receive request. Submitting locks the exchange rate.
3. **App shows bank details.** The partner returns a bank account number. The app displays it with the exact amount and an expiry timer.
4. **User pays from their own bank app.** The sending account name must match the verified user. Mismatches are refunded through the partner's refund call.
5. **Partner confirms.** A signed webhook moves the collection through created, process, pending and complete. On complete, the partner credits our USD float.
6. **Ledger credits the user.** The backend verifies the webhook signature, re-fetches the transaction by id, and posts a ledger entry for the USD value.
7. **Treasury funds the wallet.** The treasury wallet on the target chain sends the same USDC amount to the user's smart wallet. Gas is sponsored.
8. **Router buys the stock.** If the user chose a stock, the trade router swaps USDC to the stock token inside the user's wallet, through the Privy server signer added at sign-up.
9. **App updates.** The user sees shares and a naira value. With no stock chosen, the cash shows as a naira-denominated balance.

Steps 6 to 8 do not wait for our float to be withdrawn to chain. The treasury wallet fronts the USDC, and a scheduled job rebalances float and treasury (see FX, fees, limits and failure handling).

**Target time:** under 2 minutes from bank transfer to shares, dominated by the bank transfer itself.

**Returning users.** Yellow Card also offers virtual accounts. They cover NGN, and extra accounts can be created per custom wallet. Each user could therefore get one permanent account number, so steps 1 to 3 collapse into "transfer any amount to your V3ST account number".

## Off-ramp and Friday payout flow

Payouts land in the user's own Nigerian bank account by bank transfer, paid from our USD float at the partner. There are two triggers: a withdrawal the user asks for, and the scheduled Friday payout of earnings.

**One-time setup.** The user adds a bank account. The backend resolves the account name through the partner and accepts it only if it matches the verified user. One verified account is stored as the payout destination.

**Withdrawal on request**

1. User taps Withdraw and enters a naira amount, or chooses to sell shares.
2. Backend quotes the naira amount and fee, and the app shows "You receive ₦X".
3. If shares are being sold, the trade router swaps the stock token to USDC in the user's wallet.
4. The backend moves the USDC from the user's wallet to the treasury wallet through the same server signer. Gas is sponsored.
5. The ledger records the debit, then the ramp adapter submits a send request with the bank details.
6. The partner debits our USD float and pays the bank account.
7. A complete webhook marks the payout paid. The app shows the bank reference.

**Friday payout of earnings**

1. Thursday night, a job harvests each earning position and records the USDC earned per user.
2. Friday morning, the payout job lists users whose unpaid earnings clear the minimum.
3. For each, it runs steps 4 to 7 above as one batch, with one idempotency key per user per week.
4. Earnings under the minimum roll over to the next Friday and stay visible as "pending earnings".

| Rule | Value | Reason |
| --- | --- | --- |
| Minimum payout | ₦2,000 (proposed) | The flat ₦100 fee is 5% at this size and grows quickly below it |
| Who pays the payout fee | User, shown before confirming | Keeps small payouts honest about cost |
| Default for earnings | User picks once: pay out or reinvest | Reinvesting avoids the fee entirely |
| Destination | Only the user's own verified account | Name match is a compliance control |
| Payout day | Friday, Lagos time | Matches the product promise |

The float must hold enough USD before the Friday batch runs. A Thursday check compares the batch total with the float and tops it up from the treasury wallet if short.

## Ledger and data model

A double-entry ledger in Postgres is the source of truth for money. Partner dashboards and chain balances are reconciled against it, never the other way round.

| Table | Holds | Key fields |
| --- | --- | --- |
| `users` | Identity and verification state | `id`, `phone`, `kyc_tier`, `bvn_verified_name` |
| `wallets` | One row per user per chain family | `user_id`, `family` (evm or solana), `address` |
| `bank_accounts` | Verified payout destination | `user_id`, `bank_code`, `account_number`, `resolved_name`, `name_match` |
| `ramp_orders` | Every deposit and payout | `id`, `user_id`, `direction` (in or out), `provider`, `provider_ref`, `ngn_amount`, `usd_amount`, `rate`, `fee_ngn`, `status`, `idempotency_key` |
| `ledger_accounts` | Accounts money sits in | `id`, `owner` (user, treasury, float, fees), `currency` |
| `ledger_entries` | Balanced debit and credit pairs | `id`, `order_id`, `debit_account`, `credit_account`, `amount`, `currency` |
| `chain_transfers` | On-chain legs | `id`, `order_id`, `chain`, `tx_hash`, `token`, `amount`, `status` |
| `earnings` | Harvested income per user per week | `user_id`, `week`, `usd_amount`, `source_position`, `payout_order_id` |
| `webhook_events` | Raw partner events | `provider`, `event_id`, `payload`, `signature_valid`, `processed_at` |

**Order states**

- Deposit: `created` → `awaiting_transfer` → `received` → `funded` → `settled`. Side exits: `expired`, `refunded`, `failed`.
- Payout: `created` → `funds_collected` → `submitted` → `paid`. Side exits: `reversed`, `failed`.

**Rules**

- Every state change is one database transaction that writes the order row and its ledger entries together.
- `idempotency_key` is unique per order. Retried API calls and replayed webhooks return the existing order.
- `webhook_events.event_id` is unique per provider, so a duplicate webhook is stored once and processed once.
- Amounts are integers: kobo for NGN, micro-units for USDC. No floating point.
- User-facing naira values are computed at read time from USD amounts and the current rate. They are never stored as balances.

## API surface

The web app talks only to our API. Partner calls sit behind one adapter interface, so swapping or adding a provider changes no app code.

**Our endpoints (app to backend)**

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `POST /v1/deposits` | Start a deposit | Body: `ngn_amount`, optional `stock_id`. Returns bank details, expiry, quoted rate |
| `GET /v1/deposits/{id}` | Poll deposit status | App also receives push updates |
| `POST /v1/bank-accounts` | Add a payout account | Resolves the name and checks it against the user |
| `POST /v1/withdrawals/quote` | Quote a withdrawal | Returns naira received, fee and rate, valid for a short window |
| `POST /v1/withdrawals` | Confirm a withdrawal | Requires `quote_id` and `Idempotency-Key` header |
| `GET /v1/earnings` | Pending and paid earnings | Grouped by week |
| `PUT /v1/earnings/preference` | Pay out or reinvest | One setting per user |
| `GET /v1/rates/ngn` | Display rate | Cached for a few seconds |

**Adapter interface (backend to partner)**

```ts
interface RampProvider {
  quote(dir: 'in' | 'out', ngnAmount: bigint): Promise<Quote>;
  createCollection(q: Quote, customer: Customer): Promise<Collection>; // returns bank details
  refundCollection(ref: string): Promise<void>;
  resolveBankAccount(bankCode: string, account: string): Promise<string>; // account name
  createPayout(q: Quote, dest: BankAccount, key: string): Promise<Payout>;
  getTransaction(ref: string): Promise<ProviderTx>;
  floatBalance(): Promise<bigint>; // micro-USD
  verifyWebhook(headers: Headers, body: string): boolean;
}
```

**Mapping to Yellow Card** (from its [getting started guide](https://docs.yellowcard.engineering/docs/getting-started-1))

| Adapter call | Yellow Card step |
| --- | --- |
| `quote` | Get Channels, then Get Rates |
| `createCollection` | Submit a receive request, then accept it |
| `refundCollection` | Receive refund |
| `createPayout` | Submit a send request |
| `floatBalance` | Account balance (confirm the endpoint in the API reference) |
| Top-up and withdrawal of float | Settlement: stablecoin sent to our top-up address, or paid out to our whitelisted wallet |

**Webhooks we consume**

| Endpoint | Events | Action |
| --- | --- | --- |
| `POST /webhooks/yellowcard` | Collections, Payments and Settlements, each moving through created, process, pending, complete | Verify signature, store, re-fetch by id, advance the order |
| `POST /webhooks/paycrest` | Payment order events: pending, validated, settled, refunded, expired | Same handler, different parser |

Every webhook is treated as a hint. The handler always re-fetches the transaction from the partner before changing state.

## FX, fees, limits and failure handling

The user always sees one naira figure that already includes the rate and every fee. Nothing is charged that was not shown on the confirmation screen.

**Rate and fees**

- The rate is locked when the partner accepts a receive or send request. The app shows that locked rate, not a cached one.
- A ₦20,000 deposit pays ₦200 to the partner at the published 1% rate. A ₦5,000 payout pays ₦100.
- V3ST's own margin, if any, is a separate ledger line posted to the fees account. It is not hidden in the rate.
- Network gas on every chain is paid by the treasury and booked as an operating cost.

**Float and treasury rebalancing**

- Two pools hold working capital: the USD float at the partner and the USDC treasury wallet on each chain.
- Deposits grow the float and shrink the treasury. Payouts do the reverse.
- A job runs hourly. If the float exceeds its ceiling, it requests a balance payout to the treasury wallet. If the float is under its floor, it tops up from the treasury.
- Cross-chain treasury moves use native USDC burn-and-mint transfers, so no wrapped tokens are held.

**Failure handling**

| Failure | Detection | Response |
| --- | --- | --- |
| User never transfers | Quote expiry timer | Order moves to `expired`. Nothing to undo |
| User sends the wrong amount | Webhook amount differs from the order | Credit the amount actually received at the locked rate, or refund if outside tolerance |
| Transfer from a third-party account | Sender name does not match | Refund through the partner. No credit |
| Webhook never arrives | Poller checks open orders every minute | Advance state from the fetched transaction |
| Duplicate webhook | Unique `event_id` | Ignored |
| Treasury wallet short of USDC | Balance check before funding | Order waits in `received`, alert fires, rebalancer tops up |
| Stock swap fails or slips past the limit | Router returns a revert or a bad quote | User keeps the cash balance. App offers a retry |
| Payout rejected by the bank | Partner webhook with a failure state | Order moves to `reversed`. USDC returns to the user's wallet |
| Partner outage | Health check and error rate | Adapter switches new orders to the failover partner. Open orders stay with their original partner |
| Float short on Friday | Thursday pre-check | Top up before the batch. If still short, pay in order of oldest earnings and retry hourly |

**Reconciliation**

- Nightly, the ledger float account is compared with the partner's reported balance, and each treasury ledger account with its on-chain balance.
- Any difference above a small threshold pages the on-call engineer and pauses new payouts.

**Limits**

- Per-user daily and monthly limits follow KYC tier and the partner's own transaction limits, whichever is lower.
- Transfers worth $1,000 or more carry full sender and recipient details to meet the Travel Rule.

## Compliance

V3ST should operate as an agent or distributor of a licensed partner, because holding, swapping or moving stablecoins in Nigeria now needs a CBN licence and ₦1bn of locked capital. This section is a design input, not legal advice. Nigerian counsel must confirm it before launch.

The points below come from [a summary of the CBN's Regulations for the Operations of Non-Security Virtual Assets](https://afroconomist.substack.com/p/usdt-in-nigeria-will-never-be-the), issued on 5 November 2026. The regulation's start date is not yet fixed, and existing operators get 180 days from that date to apply.

| Rule | Effect on this design |
| --- | --- |
| Converting naira to stablecoins as a payment service needs CBN authorisation | The partner performs every conversion. V3ST never quotes or executes naira FX itself |
| USDC and USDT are recognised only for wholesale settlement, not for retail users, until an issuer holds a Nigerian licence | Users should hold shares, not dollar balances. Deposits should buy a stock in the same sequence. USDC stays between our treasury and the partner where possible |
| No interest or yield for holding a stablecoin | Earnings must come from stock positions only. Idle cash never earns |
| Name and BVN on the naira payment must match the verified customer (stated for P2P platforms) | Applied to all deposits and payouts as a baseline control |
| Travel Rule at $1,000 and above | Sender and recipient details attached to qualifying transfers |
| The CBN can cap or switch off naira-to-dollar stablecoin conversion in FX stress | Ramps can stop without notice. The app needs a clear "deposits paused" state and must never block selling or viewing holdings |
| Rules reach offshore firms serving people in Nigeria | Incorporating abroad does not avoid them |

**Split of responsibilities**

| Area | Partner | V3ST |
| --- | --- | --- |
| Naira collection and payout | Yes | No |
| Naira and stablecoin conversion | Yes | No |
| User identity checks | Receives KYC data with each request | Collects and verifies BVN-linked identity |
| Sanctions and fraud screening | Built into the API | Screens wallet addresses before on-chain transfers |
| Records and reporting | Its own transactions | Full order and ledger history per user |

**Securities side.** The stock tokens themselves fall under the SEC, which treats digital assets as securities and requires registration or recognition for anyone offering such services in Nigeria. Whether distributing foreign-issued tokenized stocks needs its own SEC registration is the largest open legal question.

## Open questions

- [ ] **Idle cash.** Where does money sit between a deposit and a purchase, and where do unpaid earnings sit? Options: force every deposit to buy a stock, hold idle cash as cNGN (a naira stablecoin live on Base and Solana, with only about US$160,000 in DEX pools), or hold USDC in the user's wallet and accept the retail-stablecoin risk.
- [ ] **Partner terms.** Will Yellow Card sign an agent or distributor agreement that covers a securities-linked app, and at what fees and limits? What licence cover do Paycrest's provider nodes have in Nigeria?
- [ ] **Base support.** Yellow Card's docs name Ethereum, Tron and Solana among 30+ chains. Confirm Base is included for float top-ups and withdrawals.
- [ ] **Virtual accounts for NGN.** Yellow Card's virtual accounts cover NGN and can be created per custom wallet. Confirm the cost and limits of one account per user, and which account name the user's bank app will show.
- [ ] **Privy and stock tokens.** Test that Privy's policies and swap actions work with Base stock tokens, which are built into the chain rather than deployed as ordinary token contracts.
- [ ] **Float sizing.** Set the floor and ceiling once we know expected weekly deposit and payout volumes.
- [ ] **Custody view.** Confirm with counsel that neither the treasury wallet fronting USDC nor a server signer on user wallets makes V3ST a custodian.
- [ ] **Securities registration.** Confirm what the SEC requires to distribute foreign-issued tokenized stocks to Nigerian users.
- [ ] **Other African markets.** Yellow Card's fee schedule covers bank or mobile money rails in about 20 countries. Decide the second country after Nigeria.

* [ ] **Privy cost.** Price the plan, per-user fees and per-signature fees against at least one signed transaction per user per week.
* [ ] **Privy and naira.** Ask Privy whether its fiat on-ramp and off-ramp cover NGN. If so, compare it with Yellow Card.

## Sources

- [Yellow Card Payments API: Getting Started](https://docs.yellowcard.engineering/docs/getting-started-1)
- [Yellow Card: Virtual Accounts](https://docs.yellowcard.engineering/docs/virtual-accounts)
- [Yellow Card: supported payment methods and fees for the Payments API](https://help.yellowcard.io/article/1008-supported-payment-methods-and-associated-fees-for-yellowcards-paymentapi)
- [Busha Business](https://busha.io/business)
- [Blockradar FAQ](https://docs.blockradar.co/en/introduction/faq.md)
- [The Afroconomist: the CBN's new stablecoin and crypto rules explained](https://afroconomist.substack.com/p/usdt-in-nigeria-will-never-be-the)
- [DIA Data: cNGN profile](https://www.diadata.org/map/global-stablecoins/stablecoin/cngn/)

* [Privy docs: user wallets](https://docs.privy.io/wallets/overview/solutions/user-wallets.md)
* [Privy docs: embedded wallets](https://docs.privy.io/wallets/overview/embedded)
* [Privy pricing](https://privy.io/pricing)

- [Paycrest: Sender API integration](https://docs.paycrest.io/implementation-guides/sender-api-integration)
- [Yellow Card: API glossary](https://docs.yellowcard.engineering/docs/api-glossary)
