# V3ST Customer App Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give V3ST a customer API under `/api/v1/app/*`. With it, a Nigerian customer can sign in, add naira, buy and sell US stocks, earn and withdraw without meeting a crypto term, and those flows work end to end on Base Sepolia.

**Architecture:** A customer layer in `src/backend/services/app/` composes the existing domain services and returns customer DTOs from `src/types/app.ts`. Route handlers under `src/app/api/v1/app/` use `withMiddleware(..., { audience: "customer" })`, so every error the customer sees is customer copy.

New domain pieces sit beside the existing services:

- Privy email sign-in;
- a transaction PIN;
- agreements;
- price history;
- customer orders;
- notifications;
- Base Sepolia cash rails;
- a test-pool keeper.

Existing `/api/v1/*` contracts stay as they are, apart from the fixes named in Tasks 4, 6 and 13.

**Tech Stack:** As in the repository: Node 24.15.0, Yarn 1.22.22, Next.js 15, TypeScript, Prisma 6/PostgreSQL, Zod 3, Vitest 5, viem 2.57.19, Foundry 1.9.0 and `@hydrexfi/hydrex-sdk` 1.2.8. One new dependency, pinned exactly: `@privy-io/node` 0.37.0, published 2026-10-26. Its optional peers (`@x402/*`, `@solana/kit`) are not installed. The frontend's `@privy-io/react-auth` belongs to the frontend plan.

**Spec:** [Customer app backend design](../specs/2026-11-17-v3st-customer-app-backend-design.md). Also read [Design.md](../../../Design.md), [BACKEND_PATTERNS.md](../../../BACKEND_PATTERNS.md), [FRONTEND_PATTERNS_GUIDE.md](../../../FRONTEND_PATTERNS_GUIDE.md) §8 and §11, [CLAUDE.md](../../../CLAUDE.md) and [the provider decision record](../../decisions/onchain-providers.md).

**Delivery:** This plan delivers the API. Per `CLAUDE.md`, the customer app is delivered when the companion frontend plan ships the screens and navigation that use it.

## Global Constraints

- `APP_STAGE=beta` stays mandatory. Mainnet stays behind the Phase B gate; no task touches it.
- Customer routes live under `/api/v1/app/**`. Every handler there passes `{ audience: "customer" }` to `withMiddleware`.
- `APP_CUSTOMER_CHAIN` is `testnet` or `basesepolia`, default `testnet`. Customers see stocks, Earn products and cash on that network only.
- Sign-in is Privy email login only; SMS is off.
  - The backend verifies the Privy access token and identity token offline with `verifyAccessToken` and `verifyIdentityToken` from `@privy-io/node`, using `PRIVY_VERIFICATION_KEY` (SPKI PEM) and `PRIVY_APP_ID`.
  - It never calls Privy's API and holds no Privy app secret.
  - Privy embedded wallets stay off; custody is unchanged.
- `PRIVY_MODE` is `sandbox` (a Privy development app) or `simulated` (a local issuer), default `simulated`. Simulated tokens use app ID `v3st-simulated` and an in-memory P-256 key.
- Beta sign-in rule: the token's email must be one of:
  - Privy's test account, `^test-[a-z0-9]{4}@privy\.io$` or `test@privy.io`;
  - an exact, lower-cased entry in `PRIVY_BETA_ALLOWLIST` (comma-separated);
  - `^[a-z0-9][a-z0-9._+-]{0,63}@v3st\.test$`, only when `PRIVY_MODE=simulated`.
- PIN reset needs a sign-in from a Privy session ID that none of the customer's V3ST sessions has used, with an access token issued at most 300 s earlier.
- Never request a real BVN. V3ST sends no SMS, email or push. Privy sends sign-in codes only to its test account and to allowlisted testers.
- PIN: exactly 4 digits. Reject same-digit PINs and straight ascending or descending runs. Hash with scrypt `N=16384, r=8, p=1`, key length 32, 16-byte random salt. Five failures lock it for 1,800 s.
- Reference freshness for trading: 60 s on `testnet` (unchanged), 7,200 s on `basesepolia`. Display window: 604,800 s, labelled `delayed` beyond the trading window.
- Fill-versus-reference band: 300 bps on `basesepolia`; none on `testnet`.
- Waiting orders:
  - lifetime 259,200 s (72 h);
  - price protection 300 bps from the previewed reference price;
  - consent caps `max_fee_bps: 100`, `max_slippage_bps: 100`;
  - minimum buy 100,000 kobo (₦1,000); a bank-transfer buy is capped at `policy.deposits.maxKobo`.
- Earn:
  - minimum 500,000 kobo (₦5,000);
  - the automation consent has actions `claim` and `reward_conversion`, a per-action cap of 50,000,000 kobo, a total cap of 2,000,000,000 kobo, and a 30-day expiry;
  - customers are prompted to renew it 5 days before expiry.
- Earnings preference defaults: `max_conversion_fee_bps: 100`, `max_fx_bps: 200`, `allow_background_conversion: true`, `consent_version: "app-2026-11-17"`.
- Keeper (Base Sepolia only):
  - runs in 300 s slots;
  - aligns a pool when it is more than 50 bps from the reference;
  - spends at most 5,000,000,000 micro-USD equivalent per run;
  - signs with `BASE_SEPOLIA_KEEPER_PRIVATE_KEY`, which must differ from the relayer, local and Anvil keys.
- Customer wire format:
  - naira as integer-string kobo in `*_kobo`;
  - shares as integer-string millionths in `shares_micro`;
  - US prices as integer-string micro-dollars in `*_usd_micro`;
  - signed integer basis points in `*_bps`;
  - ISO times in `*_at`;
  - support references `V3-XXXX-XXXX`.
- Display values use the payout (sell) rate. Previews use the rates of the transaction itself. A value the system doesn't know is `null`, never `"0"`.
- The vocabulary rule in Task 1 applies to every customer response, including errors.
- Experimental and permanently locked strategies never appear in a customer response.
- `BACKEND_PATTERNS.md` rules apply: `withMiddleware`, auth first, strict Zod, only services touch Prisma, explicitly typed Prisma objects, no conditional or optional object spread, and errors as `{ status, message, code, data: null }`.
- **Do not run `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build` or `forge test` between tasks.** Write each task's tests with the task, then run the full gate once in Task 17.
- Commit after each task. No `Co-Authored-By` or "Generated with" lines.

## Review Focus

1. **Price moved past the limit.** A waiting buy whose price moves more than 3% before it can execute must never buy. It expires at 72 h with the cash released and the consent revoked. Tested in Task 11.
2. **Double tap or network retry.** A repeated confirm with the same `Idempotency-Key` creates one order, one investment and one reservation. A replay never adds a PIN failure. Tested in Task 10.
3. **Crypto words leaking through failure paths.** A reverted buy, a sponsor shortage or an expired order must not leak internal codes, provider names or chain words through titles, details or errors. Tested in Tasks 10 and 14.
4. **Stale versus missing prices.** A three-day-old price shows a value marked `delayed` with its time. A stock that has never had a price shows `null` and makes the total `partial`, never ₦0. Tested in Task 12.
5. **Cash promised twice.** Cash held for a waiting order can't fund a second buy or a withdrawal, and cancelling releases it exactly once. Tested in Task 11.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/types/app.ts` | Every customer DTO; the frontend plan depends on these names |
| `src/backend/services/app/vocabulary.ts`, `copy.ts`, `format.ts` | Leak checker, customer error copy, naira/share formatting and references |
| `src/backend/services/app/network.ts` | The customer network for this deployment |
| `src/backend/services/app/{session,onboarding,identity,catalog,valuation,cash,orders,holdings,home,earn,earnings,activity,inbox,events,automations,profile,devices}.ts` | Customer composition, one file per area, each exporting one singleton or pure helpers |
| `src/backend/services/privy/`, `security/`, `agreements/`, `customer-orders/`, `notifications/` | New domain services (`privy/` verifies Privy tokens and hosts the simulated issuer) |
| `src/backend/services/stocks/history.ts`, `test-pools.ts` | Price snapshots; Base Sepolia pool alignment |
| `src/backend/services/wallets/managed-transfers.ts` | Renamed and generalized `local-transfers.ts` (31337 and 84532) |
| `src/backend/services/events/stream.ts` | Shared SSE loop |
| `src/backend/content/{documents,stock-profiles,earn-products}.ts` | Versioned customer content |
| `src/backend/validators/app/*.validator.ts` | Strict customer request schemas |
| `src/app/api/v1/app/**/route.ts` | Customer route handlers |
| `tests/helpers/app.ts`, `tests/helpers/privy.ts`, `tests/helpers/sepolia-local.ts` | `callAppRoute` with the leak check; Privy-shaped test tokens; a local node with chain ID 84532 |
| `tests/app/*.test.ts` | Customer API tests |

---

### Task 1: Customer API foundation

**Files:**
- Create: `src/types/app.ts`, `src/backend/services/app/vocabulary.ts`, `src/backend/services/app/copy.ts`, `src/backend/services/app/format.ts`, `tests/helpers/app.ts`
- Modify: `src/types/index.ts`, `src/utils/exceptions.ts`, `src/utils/index.ts`, `src/backend/middleware/index.ts`, `src/backend/middleware/types.ts`, `src/backend/config/policy.ts`
- Test: `tests/unit/app-vocabulary.test.ts`, `tests/unit/app-copy.test.ts`, `tests/unit/app-format.test.ts`

**Interfaces:**
- Produces:

```ts
// src/types/index.ts — ErrorCode gains
| "LOGIN_EXPIRED" | "LOGIN_NOT_ALLOWED" | "IDENTITY_CONFLICT" | "REAUTH_REQUIRED"
| "PIN_REQUIRED" | "PIN_INCORRECT" | "PIN_LOCKED" | "PIN_WEAK"
| "ONBOARDING_INCOMPLETE" | "AGREEMENT_OUTDATED" | "PREVIEW_EXPIRED" | "ORDER_NOT_CANCELLABLE"
| "REFERENCE_STALE" | "PRICE_OUT_OF_RANGE" | "INSUFFICIENT_SHARES"

// src/utils/exceptions.ts
export class LockedException extends HttpException {}          // 423, default code PIN_LOCKED

// middleware: WithMiddlewareOptions gains audience?: "internal" | "customer" (default "internal");
// MiddlewareResponse gains field?: string, set by the body/query/path validators to the first issue path.

// copy.ts
export type CustomerErrorCode = "SIGN_IN_REQUIRED" | "SIGN_IN_AGAIN" | "NOT_ALLOWED" | "NOT_FOUND" | "CHECK_DETAILS" | "TRY_AGAIN"
  | "PRICE_CHANGED" | "NOT_ENOUGH_CASH" | "NOT_ENOUGH_SHARES" | "LIMIT_REACHED" | "SETUP_REQUIRED" | "DOCUMENT_UPDATED"
  | "NAME_MISMATCH" | "ALREADY_DONE" | "ACCOUNT_EXISTS" | "PIN_NEEDED" | "PIN_INCORRECT" | "PIN_LOCKED"
  | "PIN_TOO_SIMPLE" | "BETA_TEST_ACCOUNT" | "PROCESSING" | "PRICES_UPDATING" | "UNAVAILABLE"
  | "ALREADY_STARTED" | "ADD_MONEY_PAUSED" | "WITHDRAWALS_PAUSED" | "TRADING_PAUSED" | "TEMPORARILY_UNAVAILABLE"
  | "CONSENT_ENDED" | "ACCOUNT_REVIEW" | "SOMETHING_WENT_WRONG";
export const CUSTOMER_ERROR_COPY: { [K in ErrorCode]: { code: CustomerErrorCode; message: string } };
export function customerErrorFor(code: ErrorCode): { code: CustomerErrorCode; message: string };
export function customerFieldMessage(field: string | undefined): string;

// vocabulary.ts
export function findCustomerLeaks(value: unknown, opts?: { documents?: boolean }): string[]; // "path: reason" entries

// format.ts
export function formatNaira(kobo: bigint): string;
export function formatShares(sharesMicro: bigint): string;
export function customerReference(id: string): string;
export function firstNameOf(verifiedName: string | null): string | null;
export function toKobo(microUsd: bigint, rate: Rate): bigint;          // floor(microUsd × rate.kobo / rate.microUsd)
export function sharesMicroOf(raw: bigint, decimals: number): bigint;  // floor(raw × 10^6 / 10^decimals)

// src/types/app.ts (base; later tasks add their DTOs here)
export const APP_BETA_NOTICE = "Beta: test money only. No real naira moves and shares have no value.";
export type AppBetaDto = { test_money: true; notice: string };
export type AppProgress = "waiting" | "processing" | "completed" | "failed" | "cancelled" | "action_needed";

// tests/helpers/app.ts
export async function callAppRoute(handler: RouteHandler, opts: Parameters<typeof callRoute>[1] & { documents?: boolean }): ReturnType<typeof callRoute>;
// expects findCustomerLeaks(json, { documents }) to equal [] before returning
```

- `policy.app` is created here with every value from Global Constraints: `policyVersion: "app-2026-11-17"` plus the `privy` (`reauthMaxAgeSeconds: 300`, `simulatedAppId: "v3st-simulated"`), `pin`, `orders`, `earn`, `earnings`, `keeper`, `sweepSeconds: 60` and `notificationsSlotSeconds: 15` blocks. Later tasks read from it and never add literals.

**Vocabulary rule (exact):**
- **Keys:** a key is a leak when any `_`-separated segment, matched case-insensitively, is one of `wallet address chain network token gas tx hash onchain provider asset raw wei usdc swap pool liquidity contract integration deployment relayer sponsor nonce block calldata signature simulated`.
- **Values:** a string value is a leak when it matches any of these:
  - `/0x[0-9a-f]{8,}/i`;
  - `/\b(crypto|cryptocurrency|blockchain|on-?chain|wallets?|tokens?|usdc|stablecoins?|web3|defi|swaps?|smart contracts?|liquidity|seed phrase|private key|wei|ethereum|sepolia|anvil|testnet|mainnet|hydrex|hydropump|bankr|o1 exchange|stonks|basestonk|feel\.cash|privy|relayer|gas fees?)\b/i`;
  - `/\btokeni[sz](ed|ation)\b/i` (skipped when `documents: true`);
  - `/\b[A-Z]+(?:_[A-Z]+)+\b/`, an internal code, except when the value sits under a key named `code`.

**Copy table (exact):**

| Customer code | Message | Internal codes |
| --- | --- | --- |
| SIGN_IN_REQUIRED | Please sign in to continue. | UNAUTHENTICATED |
| SIGN_IN_AGAIN | Please sign in again to continue. | LOGIN_EXPIRED, REAUTH_REQUIRED |
| NOT_ALLOWED | You can't do that from this account. | FORBIDDEN, CROSS_ORIGIN |
| NOT_FOUND | We couldn't find that. | NOT_FOUND, ACCOUNT_NOT_FOUND |
| CHECK_DETAILS | Check your details and try again. | BAD_REQUEST, MALFORMED_JSON, VALIDATION_FAILED, PAYLOAD_TOO_LARGE, AMOUNT_OUT_OF_RANGE, BELOW_MINIMUM, BELOW_PROVIDER_MINIMUM |
| TRY_AGAIN | That didn't go through. Please try again. | CONFLICT, IDEMPOTENCY_KEY_REQUIRED, IDEMPOTENCY_KEY_REUSED, STALE_STATE, INVALID_TRANSITION, LEDGER_KEY_REUSED, MODE_MISMATCH, NOT_DEAD, ALREADY_APPROVED, QUOTE_CONSUMED |
| PRICE_CHANGED | The price changed. Review the new price to continue. | QUOTE_EXPIRED, QUOTE_CHANGED, SLIPPAGE, PRICE_IMPACT_EXCEEDED, NEEDS_CONFIRMATION, PREVIEW_EXPIRED |
| NOT_ENOUGH_CASH | You don't have enough cash for this. | INSUFFICIENT_FUNDS |
| NOT_ENOUGH_SHARES | You don't have that many shares. | INSUFFICIENT_SHARES |
| LIMIT_REACHED | This is above your current limit. | LIMIT_EXCEEDED, AUTHORIZATION_EXCEEDED |
| SETUP_REQUIRED | Finish setting up your account to continue. | KYC_REQUIRED, BANK_ACCOUNT_REQUIRED, ONBOARDING_INCOMPLETE |
| DOCUMENT_UPDATED | This document was updated. Please review the latest version. | AGREEMENT_OUTDATED |
| NAME_MISMATCH | The name on this bank account doesn't match your verified name. | NAME_MISMATCH |
| ALREADY_DONE | That's already done. | ALREADY_VERIFIED |
| ACCOUNT_EXISTS | This email is already linked to another account. | IDENTITY_CONFLICT |
| PIN_NEEDED | Enter your PIN to continue. | PIN_REQUIRED |
| PIN_INCORRECT | That PIN isn't right. | PIN_INCORRECT |
| PIN_LOCKED | Too many wrong PINs. Try again in 30 minutes or reset your PIN. | PIN_LOCKED |
| PIN_TOO_SIMPLE | Choose a PIN that's harder to guess. | PIN_WEAK |
| BETA_TEST_ACCOUNT | During the beta, sign in with a beta test email. | LOGIN_NOT_ALLOWED, TEST_PHONE_REQUIRED |
| PROCESSING | We're still finishing your last request. | OPERATION_UNRESOLVED, CONVERSION_PENDING, REWARD_NOT_CONFIRMED |
| PRICES_UPDATING | Prices are updating. You can still place your order and it will go through when they do. | REFERENCE_STALE, PRICE_OUT_OF_RANGE |
| UNAVAILABLE | This isn't available right now. | STOCK_UNAVAILABLE, CAPABILITY_UNAVAILABLE, NO_ROUTE, STRATEGY_UNAVAILABLE, SCENARIO_UNAVAILABLE, INVALID_SCENARIO_STATE |
| ALREADY_STARTED | This order has already started and can't be cancelled. | ORDER_NOT_CANCELLABLE |
| ADD_MONEY_PAUSED | Adding money is paused for a short time. You can still view and sell your investments. | DEPOSITS_PAUSED |
| WITHDRAWALS_PAUSED | Withdrawals are paused for a short time. Your money is safe. | PAYOUTS_PAUSED |
| TRADING_PAUSED | Trading is paused for a short time. Your money is safe. | TRADING_PAUSED |
| TEMPORARILY_UNAVAILABLE | This is taking longer than usual. Your money is safe. Please try again later. | RAIL_UNAVAILABLE, RATES_UNAVAILABLE, FLOAT_UNAVAILABLE, WALLET_NOT_READY, SELL_FAILED, PROVIDER_UNVERIFIED, SPONSOR_UNAVAILABLE, NETWORK_UNHEALTHY, CHAIN_RESET_DETECTED, RECONCILIATION_BREACH |
| CONSENT_ENDED | This automatic action was turned off. Set it up again to continue. | AUTHORIZATION_REVOKED, AUTHORIZATION_EXPIRED |
| ACCOUNT_REVIEW | We need to check this. Please contact support. | SCREENING_DENIED, TRAVEL_RULE_DATA_MISSING |
| SOMETHING_WENT_WRONG | Something went wrong. Please try again. | INTERNAL |

**Field messages:**

| Field | Message |
| --- | --- |
| `amount_kobo` | Check the amount and try again. |
| `email` | Enter a valid email address. |
| `pin`, `current_pin` | Your PIN must be 4 digits. |
| `account_number` | Enter your 10-digit account number. |
| `preferred_name` | Use letters only, up to 40 characters. |
| anything else | Check your details and try again. |

- [ ] **Step 1: Write the tests**

```ts
// tests/unit/app-vocabulary.test.ts
it("flags crypto keys and values at any depth", () => {
  const leaks = findCustomerLeaks({ a: [{ tx_hash: "x" }], b: { note: "Paid in USDC" }, c: "0x52908400098527886E0F7030069857D2E4169EE7", d: { why: "MIN_OUTPUT_BREACH" } });
  for (const path of ["a[0].tx_hash", "b.note", "c", "d.why"]) expect(leaks.some((l) => l.startsWith(path))).toBe(true);
});
it("passes clean customer data, including supply-chain wording and lower-case enums", () => {
  expect(findCustomerLeaks({ status: 200, message: "Bought Apple", code: "NOT_ENOUGH_CASH", data: { amount_kobo: "2000000", summary: "A supply chain leader", choice: "payout" } })).toEqual([]);
});
it("allows tokenized only in documents", () => {
  expect(findCustomerLeaks({ body: "tokenized stock exposure" })).not.toEqual([]);
  expect(findCustomerLeaks({ body: "tokenized stock exposure" }, { documents: true })).toEqual([]);
  expect(findCustomerLeaks({ body: "your wallet" }, { documents: true })).not.toEqual([]);
});

// tests/unit/app-copy.test.ts
it("gives every internal code clean customer copy", () => {
  for (const [code, copy] of Object.entries(CUSTOMER_ERROR_COPY)) expect(findCustomerLeaks({ message: copy.message }), code).toEqual([]);
});
it("hides internal messages from the customer audience", async () => {
  const route = withMiddleware<null, null, null>(async () => { throw new ServiceUnavailableException("Testnet unavailable: rpc down", "NETWORK_UNHEALTHY"); }, [], { audience: "customer" });
  const res = await callRoute(route, { method: "GET", url: "/api/v1/app/probe" });
  expect(res.status).toBe(503);
  expect(res.json).toEqual({ status: 503, code: "TEMPORARILY_UNAVAILABLE", message: CUSTOMER_ERROR_COPY.NETWORK_UNHEALTHY.message, data: null });
});
it("names the field on customer validation errors and leaves the internal audience unchanged", async () => {
  // strict schema { amount_kobo: minorAmountSchema }, body { amount_kobo: "abc" }
  // customer audience → 422, code "CHECK_DETAILS", message "Check the amount and try again."
  // internal audience → code "VALIDATION_FAILED", message containing "amount_kobo"
});

// tests/unit/app-format.test.ts
expect(formatNaira(2_000_000n)).toBe("₦20,000"); expect(formatNaira(2_000_050n)).toBe("₦20,000.50"); expect(formatNaira(-150n)).toBe("-₦1.50");
expect(formatShares(42_100n)).toBe("0.0421 shares"); expect(formatShares(1_000_000n)).toBe("1 share"); expect(formatShares(2_500_000n)).toBe("2.5 shares");
expect(customerReference("ck123")).toMatch(/^V3-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/); expect(customerReference("ck123")).toBe(customerReference("ck123"));
expect(firstNameOf("ADAEZE OBI")).toBe("Adaeze"); expect(firstNameOf(null)).toBeNull();
expect(redact({ pin: "1357", current_pin: "2468", access_token: "a", identity_token: "b" })).toEqual({ pin: "[redacted]", current_pin: "[redacted]", access_token: "[redacted]", identity_token: "[redacted]" });
```

- [ ] **Step 2: Implement.**
  - **`copy.ts`:** declare the table with `satisfies { [K in ErrorCode]: … }`, so a missing code fails typecheck.
  - **`errorJson`:** takes the audience. For the customer audience, the message comes from `customerErrorFor`, or from `customerFieldMessage(result.field)` for validator failures. The status stays the same, and `reportError` still receives the original error.
  - **`customerReference`:** Crockford base32 of the first 5 bytes of `sha256(id)`, formatted `V3-XXXX-XXXX`.
  - **`formatShares`:** at most 4 decimal places, trailing zeros trimmed, "share" when the amount is exactly 1.
  - **`REDACT_KEY`:** add `pin`. Token fields are already redacted by the existing `token` match.

- [ ] **Step 3: Commit** — `git commit -m "feat: add customer API vocabulary, error copy and formatting"`

### Task 2: Sign-in with Privy email codes

**Files:**
- Modify: `package.json` and `yarn.lock` (add `@privy-io/node` `0.37.0`), `src/env.js`, `.env.example`, `src/backend/integrations/beta-policy.ts`, `prisma/schema.prisma` (+ migration `20261117000000_customer_sign_in`), `src/backend/services/auth/index.ts`, `src/backend/services/users/index.ts`, `src/types/dto.ts`, `src/backend/services/compliance/index.ts`, `src/backend/services/ramp/types.ts`, `src/backend/services/ramp/yellowcard/index.ts`, `src/backend/middleware/index.ts`
- Create: `src/backend/services/privy/index.ts`, `src/backend/services/privy/simulated.ts`, `src/backend/services/app/devices.ts`, `src/backend/services/app/session.ts`, `src/backend/validators/app/auth.validator.ts`, `src/app/api/v1/app/auth/privy/route.ts`, `src/app/api/v1/app/auth/logout/route.ts`, `src/app/api/v1/app/session/route.ts`, `src/app/api/v1/app/beta/privy-tokens/route.ts`, `tests/helpers/privy.ts`
- Test: `tests/app/auth.test.ts`; add `signInCustomer(email?: string): Promise<{ cookie: string; userId: string; sessionId: string }>` to `tests/helpers/app.ts` (default `ada@v3st.test`, signing in through simulated Privy tokens)

**Interfaces:**
- Consumes: `callAppRoute` and `policy.app.privy` (Task 1).
- Produces:

```prisma
// User: phone becomes optional and is never written for Privy customers; email is new
phone String? @unique
email String? @unique
// Session gains
deviceLabel    String?
privySessionId String?
```

```ts
// env: PRIVY_MODE z.enum(["sandbox", "simulated"]).default("simulated"); PRIVY_APP_ID and PRIVY_VERIFICATION_KEY
// (both required when PRIVY_MODE=sandbox); PRIVY_BETA_ALLOWLIST (optional). No Privy app secret is used.
// beta-policy: IntegrationId gains "privy" with allowed modes ["sandbox", "simulated"]; assertBetaRuntime enforces the sandbox requirements.
export type PrivyLogin = { userId: string; sessionId: string; issuedAt: Date; email: string };
privyAuth.verifyLogin(tokens: { accessToken: string; identityToken: string }): Promise<PrivyLogin>;
privyAuth.assertBetaEmail(email: string): void;             // LOGIN_NOT_ALLOWED (403)
simulatedPrivy.mint(email: string, opts?: { sessionId?: string; issuedAt?: Date }): { access_token: string; identity_token: string };
authService.signInWithPrivy(login: PrivyLogin, deviceLabel: string): Promise<{ user: User; sessionToken: string; expires: Date; created: boolean }>;
deviceLabel(userAgent: string | null): string;              // "Chrome on Android", "Safari on iOS", …; "Unknown device"
appSessionService.get(user: AuthenticatedUser | null): Promise<AppSessionDto>;
export const sameOriginMiddleware: MiddlewareFunction;      // 403 CROSS_ORIGIN when an Origin header is present and differs from NEXT_PUBLIC_APP_URL's origin
// MeDto.phone becomes string | null and MeDto gains email: string | null; the ramp Customer.phone becomes string | null.

// src/types/app.ts
export type AppSessionDto =
  | { signed_in: false; beta: AppBetaDto }
  | { signed_in: true; customer: { first_name: string | null; email: string | null }; beta: AppBetaDto };

// tests/helpers/privy.ts
export function privyTestKeys(): { privateKey: KeyObject; publicKeyPem: string };
export function mintPrivyTokens(i: { privateKey: KeyObject; appId: string; userId: string; email: string; sessionId: string; issuedAt?: Date; expiresInSeconds?: number; extraLinkedAccounts?: unknown[] }): { access_token: string; identity_token: string };
```

**Verification (exact):**
1. Decode each token's payload without trusting it. If `exp` is in the past, throw `UnauthorizedException(…, "LOGIN_EXPIRED")`.
2. Call `verifyAccessToken({ access_token, app_id, verification_key })` and `verifyIdentityToken({ identity_token, app_id, verification_key })` from `@privy-io/node`. Any failure throws `UNAUTHENTICATED`.
   - App ID and key in `sandbox`: `PRIVY_APP_ID` and `PRIVY_VERIFICATION_KEY`.
   - In `simulated`: `policy.app.privy.simulatedAppId` and the simulated issuer's public key.
3. The access token's `user_id` must equal the identity user's `id`; otherwise throw `UNAUTHENTICATED`.
4. The email is the `address` of the identity user's linked account whose `type` is `"email"`, lower-cased. With no such account, throw `LOGIN_NOT_ALLOWED`. Phone linked accounts are ignored and never stored.
5. Run `assertBetaEmail(email)` using the rule in Global Constraints.
6. Return `{ userId, sessionId: session_id, issuedAt: new Date(issued_at × 1000), email }`.

**Simulated issuer (`privy/simulated.ts`):**
- **Key:** one ES256 key pair per process, from `generateKeyPairSync("ec", { namedCurve: "P-256" })`.
- **Signing:** compact JWS with header `{ alg: "ES256", typ: "JWT" }`, signed with `sign("sha256", data, { key, dsaEncoding: "ieee-p1363" })` from `node:crypto`.
- **Access token claims:** `{ sid, sub, iss: "privy.io", aud, iat, exp: iat + 3600 }`.
- **Identity token claims:** `{ sub, iss: "privy.io", aud, iat, exp: iat + 3600, cr: String(iat), linked_accounts: JSON.stringify([{ type: "email", address: email, lv: iat }]) }`. These are the claim names `@privy-io/node`'s identity-token parser reads.
- **IDs:** `sub = "did:privy:sim" + sha256(email).slice(0, 24)`; `sid` is a new UUID unless given.
- **Mode:** `mint` throws `NotFoundException` unless `PRIVY_MODE=simulated`.

`tests/helpers/privy.ts` builds the same shapes with a test key, so tests can run the `sandbox` verification path offline by setting `PRIVY_VERIFICATION_KEY` to the test public key.

`POST /api/v1/app/beta/privy-tokens` is the one customer route exempt from the leak check. Its response carries tokens for the app to send back, never text for the customer, so `signInCustomer` calls it with plain `callRoute` and calls `/app/auth/privy` with `callAppRoute`. It still uses `audience: "customer"` for errors.

**Sign-in:**
- **Account lookup:** `signInWithPrivy` finds the user by `identitySubject = login.userId`. Otherwise it creates one with `email`, `identitySubject` set to the Privy user ID, `identityMode` from `PRIVY_MODE` and no phone, and enqueues `wallets.provision`. If another user already has that email, it throws `ConflictException(…, "IDENTITY_CONFLICT")`.
- **Session:** the session row stores `deviceLabel` and `privySessionId = login.sessionId`.
- **Existing flow:** the operator test sign-in (`/api/v1/beta/identity-token`, `/api/v1/auth/session`) is unchanged and still uses fake test numbers.
- **Phone-free ramp data:** `customerFor` passes `phone: user.phone`, which is now nullable. The Yellow Card receive and send builders set `recipient.phone` or `sender.phone` only when the phone is not null, with an `if` assignment, not a spread. If Yellow Card's sandbox rejects a request without a phone, stop and report.

| Route | Middlewares | Body | Data |
| --- | --- | --- | --- |
| `POST /api/v1/app/auth/privy` | sameOrigin, body | `{ access_token, identity_token }` | `{ is_new_customer: boolean }` and sets `sara-session` |
| `POST /api/v1/app/beta/privy-tokens` | sameOrigin, body | `{ email }` | `{ access_token, identity_token }` (simulated mode only; `NOT_FOUND` otherwise) |
| `POST /api/v1/app/auth/logout` | auth, origin | — | `{ signed_out: true }` and clears the cookie |
| `GET /api/v1/app/session` | optionalAuth | — | `AppSessionDto` |

**Frontend contract** (Task 17 writes it into `docs/api/customer-app.md`):
- **Privy dashboard:** the development app enables email login only and turns on "Return user data in an identity token". Embedded wallets stay off (`createOnLogin: "off"`, the default).
- **Sign-in:** Privy's headless email login (`useLoginWithEmail`, then `sendCode({ email })` and `loginWithCode({ code })`), then `getAccessToken()` and `getIdentityToken()`, then `POST /api/v1/app/auth/privy`.
- **Sign-out:** Privy's `logout()` and `POST /api/v1/app/auth/logout`.
- **Simulated mode:** the app posts `{ email }` to `/api/v1/app/beta/privy-tokens` instead of opening Privy.

- [ ] **Step 1: Write `tests/app/auth.test.ts`**

```ts
it("signs a new customer in from Privy tokens and reuses the account", async () => {
  const first = await signInCustomer("ada@v3st.test");
  const second = await signInCustomer("ada@v3st.test");
  expect(second.userId).toBe(first.userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: first.userId } });
  expect(user.email).toBe("ada@v3st.test");
  expect(user.phone).toBeNull();
});
it("accepts only beta test emails", async () => {
  // simulated: "someone@gmail.com" → 403 BETA_TEST_ACCOUNT; the same address in PRIVY_BETA_ALLOWLIST → 200
  // sandbox (PRIVY_MODE=sandbox, PRIVY_APP_ID "test-app", PRIVY_VERIFICATION_KEY = privyTestKeys().publicKeyPem,
  // tokens from mintPrivyTokens): "test-ab12@privy.io" → 200; "ada@v3st.test" → 403 BETA_TEST_ACCOUNT
});
it("rejects forged, expired and mismatched tokens", async () => {
  // signed by another key → 401 SIGN_IN_REQUIRED; wrong audience → 401 SIGN_IN_REQUIRED; exp in the past → 401 SIGN_IN_AGAIN
  // access token for one Privy user with an identity token for another → 401 SIGN_IN_REQUIRED
});
it("never stores a phone number from Privy", async () => {
  // extraLinkedAccounts [{ type: "phone", phone_number: "+15555550000", lv: … }] → user.phone stays null
});
it("refuses simulated tokens outside simulated mode", async () => { /* PRIVY_MODE=sandbox → POST beta/privy-tokens → 404 NOT_FOUND */ });
it("refuses a cross-origin sign-in", async () => { /* Origin "https://evil.example" → 403 NOT_ALLOWED */ });
it("records the device and Privy session, reports the session and signs out", async () => {
  // session row: deviceLabel "Chrome on Android" from the UA, privySessionId equal to the token's sid
  // GET session → signed_in true, customer.email "ada@v3st.test"; after logout → signed_in false
});
it("sends ramp customer data without a phone", async () => {
  // customerFor(userWithoutPhone).phone is null; the Yellow Card receive body built for it has no recipient.phone key
});
```

- [ ] **Step 2: Implement** as specified. Pin `"@privy-io/node": "0.37.0"` exactly. Import `verifyAccessToken`, `verifyIdentityToken` and `InvalidAuthTokenError` from the package root, only inside `src/backend/services/privy/`.

- [ ] **Step 3: Live check (operator; runs once the frontend sign-in screen exists).**
  1. In the Privy development app, sign in with the test account email.
  2. Pass the two tokens from the browser to `privyAuth.verifyLogin`. Expected: the email is `test-XXXX@privy.io` and `sessionId` is not empty.
  3. Record whether `session_id` stays the same after `getAccessToken()` refreshes it, and changes after signing out and in again. Task 3's PIN reset relies on both.
  4. Until this check is done, list it as pending under "Customer app backend (2026-11)" in `docs/implementation-review.md`.

- [ ] **Step 4: Commit** — `git commit -m "feat: sign customers in with Privy email codes"`

### Task 3: Transaction PIN and device sessions

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117010000_customer_pin`)
- Create: `src/backend/services/security/index.ts`, `src/backend/validators/app/security.validator.ts`, routes below
- Test: `tests/app/security.test.ts`

**Interfaces:**
- Consumes: `privyAuth.verifyLogin` and `Session.privySessionId` (Task 2); `policy.app.pin` and `policy.app.privy` (Task 1).
- Produces:

```prisma
// User gains
pinHash           String?
pinSalt           String?
pinSetAt          DateTime?
pinFailedAttempts Int       @default(0)
pinLockedUntil    DateTime?
```

```ts
securityService.isWeakPin(pin: string): boolean;
securityService.setPin(userId: string, pin: string, currentPin: string | null): Promise<void>;
securityService.verifyPin(userId: string, pin: string): Promise<void>;
securityService.resetPin(userId: string, tokens: { accessToken: string; identityToken: string }, pin: string, currentSessionId: string): Promise<{ revoked: number }>;
securityService.listSessions(userId: string, currentSessionId: string): Promise<AppDeviceSessionDto[]>;
securityService.revokeSession(userId: string, sessionId: string): Promise<void>;
securityService.revokeOtherSessions(userId: string, currentSessionId: string): Promise<{ revoked: number }>;

export type AppDeviceSessionDto = { id: string; device: string; signed_in_at: string; current: boolean };
```

| Route | Middlewares | Body | Data |
| --- | --- | --- | --- |
| `PUT /api/v1/app/security/pin` | auth, origin, body | `{ pin, current_pin? }` | `{ pin_set: true }` |
| `POST /api/v1/app/security/pin/reset` | auth, origin, body | `{ access_token, identity_token, pin }`, the tokens coming from a new Privy email sign-in | `{ pin_set: true, other_sessions_signed_out: number }` |
| `GET /api/v1/app/security/sessions` | auth | — | `AppDeviceSessionDto[]` |
| `DELETE /api/v1/app/security/sessions/[id]` | auth, origin, path | — | `{ signed_out: true }` |
| `POST /api/v1/app/security/sessions/sign-out-others` | auth, origin | — | `{ signed_out: number }` |

- [ ] **Step 1: Write `tests/app/security.test.ts`**

```ts
it("sets a PIN and refuses weak or malformed ones", async () => {
  // "1357" → 200; "1234", "0000", "9876" → PIN_TOO_SIMPLE; "12a4", "12345" → CHECK_DETAILS
});
it("requires the current PIN to change it", async () => {
  // missing current_pin → PIN_NEEDED; wrong current_pin → PIN_INCORRECT and pinFailedAttempts 1
});
it("locks after five wrong PINs and unlocks after 30 minutes", async () => {
  // four wrong → PIN_INCORRECT; fifth → PIN_LOCKED (status 423); correct while locked → PIN_LOCKED; setNow(+1,801 s) → correct passes and pinFailedAttempts is 0
});
it("never counts more than five failures under concurrency", async () => {
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => securityService.verifyPin(userId, "2468")));
  const codes = results.map((r) => (r as PromiseRejectedResult).reason.code);
  expect(codes.filter((c) => c === "PIN_INCORRECT").length).toBe(4);
  expect(codes.filter((c) => c === "PIN_LOCKED").length).toBe(2);
});
it("resets the PIN after a fresh email sign-in and signs out other devices", async () => {
  // sessions A and B; tokens with a new sid issued now → reset from A → B's cookie gets 401; lock cleared;
  // A's privySessionId becomes the new sid, so the same tokens cannot reset again
});
it("refuses a reset without a fresh sign-in", async () => {
  // tokens with A's own sid → 401 SIGN_IN_AGAIN; a new sid issued 301 s ago → SIGN_IN_AGAIN;
  // another customer's tokens → SIGN_IN_AGAIN; an operator test account without a Privy user → SIGN_IN_AGAIN
});
it("lists devices and refuses another customer's session", async () => {
  // UA "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" → "Chrome on Android", current true
  // DELETE another user's session id → NOT_FOUND
});
```

- [ ] **Step 2: Implement.**
  - **`verifyPin`:** runs in `withTx` with a `FOR UPDATE` lock on the user row.
    - No PIN set → `ConflictException("…", "PIN_REQUIRED")`.
    - Locked → `LockedException`.
    - Wrong PIN, failures below 5 → persist the failure count, then throw `PIN_INCORRECT` (422) after commit.
    - Wrong PIN, fifth failure → set `pinLockedUntil = now + lockSeconds`, reset the count, then throw `PIN_LOCKED`.
    - Correct PIN → clear the count and the lock.
  - **`setPin`:** validate `/^\d{4}$/` and reject weak PINs. When a PIN already exists, require `currentPin` and check it with `verifyPin`.
  - **`resetPin`:** call `privyAuth.verifyLogin(tokens)` and require all of:
    - `login.userId` equals the user's `identitySubject`;
    - `login.issuedAt` is no more than `policy.app.privy.reauthMaxAgeSeconds` old;
    - `login.sessionId` differs from the `privySessionId` of every session the user has.

    Any failure throws `UnauthorizedException(…, "REAUTH_REQUIRED")`. On success, in one transaction: set the new PIN, clear the lock and the count, and set the current session's `privySessionId` to `login.sessionId`. Then call `revokeOtherSessions`.
  - **`isWeakPin`:** true when all four digits are equal, or each digit is the previous plus 1 or minus 1.

- [ ] **Step 3: Commit** — `git commit -m "feat: add a transaction PIN and device session controls"`

### Task 4: Customer network and Base Sepolia cash rails

**Files:**
- Modify: `src/env.js`, `.env.example`, `src/backend/services/wallets/chains.ts`, `src/backend/services/wallets/index.ts`, `src/backend/services/deposits/index.ts`, `src/backend/services/withdrawals/index.ts`, `src/backend/services/treasury/index.ts`, `src/backend/services/onchain/manifests.ts`, `src/backend/services/execution/nonce.ts`, `src/backend/services/earnings/batch.ts`, `src/backend/services/ledger/postings.ts`, `scripts/seed-beta.ts`, `package.json`
- Rename: `src/backend/services/wallets/local-transfers.ts` → `managed-transfers.ts` (update imports)
- Create: `src/backend/services/app/network.ts`, `scripts/sepolia-treasury.ts`, `tests/helpers/sepolia-local.ts`
- Test: `tests/integration/basesepolia-cash-rails.test.ts`, `tests/unit/app-network.test.ts`

**Interfaces:**
- Consumes: `chainTarget`, `rpcOn`, `publicClientOn`, `walletClientOn`, `relayerOn`, `__setRpcTransportForTests` (`onchain/chains.ts`); `manifestFor`, `settlementAssetKeyOn`, `ledgerChainFor` (`onchain/manifests.ts`); `executionAccounts` (existing).
- Produces:

```ts
export type CustomerChain = "testnet" | "basesepolia";
export function customerChain(): CustomerChain;            // env APP_CUSTOMER_CHAIN, z.enum(["testnet","basesepolia"]).default("testnet")
export function customerChainId(): 31337 | 84532;
export function chainIdForLedgerChain(chain: string): number; // "testnet" → 31337, "basesepolia" → 84532, otherwise throws
// wallets/chains.ts: Chain = "base" | "solana" | "testnet" | "basesepolia"; CHAINS.basesepolia mirrors CHAINS.testnet (family "evm")
export async function progressManagedTransfer(t: ChainTransfer): Promise<ChainTransfer>;
export async function seedManagedTreasury(chainId: number, key: string, toAddress: string, amount: Prisma.Decimal): Promise<void>;
export function relayerLockKey(chainId: number): bigint;   // nonce.ts; the value allocateRelayerNonce already locks on
depositService.create(userId, body, idempotencyKey, opts?: { chain?: CustomerChain }): Promise<{ deposit: DepositDto; created: boolean }>;
withdrawalService.quote(userId, body, opts?: { chain?: CustomerChain }): Promise<WithdrawalQuoteDto>;
export function testTreasuryMinted(i: { key: string; chain: string; amount: bigint }): JournalInput; // equityOpening(usdc) → treasury(chain)
// tests/helpers/sepolia-local.ts
export type SepoliaShapedNode = { loopbackUrl: string; relayer: Address; settlement: Address; stop(): Promise<void> };
export async function startSepoliaShapedNode(): Promise<SepoliaShapedNode>;
```

- [ ] **Step 1: Write `tests/helpers/sepolia-local.ts`.**
  - **Node:** start Anvil with `--chain-id 84532 --block-time 1` on a free port, and set `BASE_SEPOLIA_RPC_URL=https://sepolia.v3st.test`.
  - **Relayer:** set `BASE_SEPOLIA_RELAYER_PRIVATE_KEY` to a `generatePrivateKey()` value and fund it with a raw `anvil_setBalance` call.
  - **Transport:** install `__setRpcTransportForTests`, forwarding chain-84532 calls as raw JSON-RPC to the loopback URL and every other chain to the existing `rpcRequest`.
  - **Contracts:** deploy `TestSettlementToken` through `walletClientOn(84532)`.
  - **Manifest:** write `<TESTNET_STATE_DIR>/base-sepolia/manifest.json` with `chainId: 84532`, `networkId: "basesepolia:84532"`, `integrationKind: "verified_provider_testnet"`, `mode: "sandbox"`, the token's code hash, and `external: {}`.
  - **Network row:** upsert the `OnchainNetwork` row.
  - **`stop()`:** removes the manifest, clears the transport and kills the node.

- [ ] **Step 2: Write `tests/integration/basesepolia-cash-rails.test.ts`** (one node for the file)

```ts
it("funds a Base Sepolia account from a naira deposit", async () => {
  const user = await makeVerifiedUser();
  const account = await executionAccounts.ensure(user.id, 84532);
  await treasuryService.seedOpeningBalances({ treasuryMicroUsdc: { basesepolia: 10_000_000_000n }, floatMicroUsd: 10_000_000_000n });
  const { deposit } = await depositService.create(user.id, { ngn_amount: 2_000_000n }, "dep-bs-1", { chain: "basesepolia" });
  await scenarioService.run(user.id, { order_id: deposit.id, scenario: "deposit_paid" });
  await drainJobs();
  const settled = await depositService.get(user.id, deposit.id);
  expect(settled.status).toBe("settled");
  const usd = BigInt(settled.usd_amount!);
  expect(await ledgerService.balance(acct.userCash(user.id, "basesepolia"))).toBe(usd);
  expect(await readTokenBalance(settlementAssetKeyOn(84532), account.accountAddress)).toBe(usd);
});
it("collects a withdrawal from the Base Sepolia account", async () => {
  // quote(..., { chain: "basesepolia" }) → confirm → drainJobs → status paid; the account's balance falls by debit_usdc
});
it("rejects stock_id on legacy deposits for onchain stocks", async () => {
  // makeTestnetStock(...) row with networkId → depositService.create(..., { stock_id }) rejects with code CAPABILITY_UNAVAILABLE
});
it("never sends a Base Sepolia call to the local node", async () => {
  // spy on the transport: every chainId 84532 call targets https://sepolia.v3st.test; none uses TESTNET_RPC_URL
});
```

`tests/unit/app-network.test.ts`: the default is `testnet` and maps to 31337; `basesepolia` maps to 84532; `chainIdForLedgerChain("base")` throws.

- [ ] **Step 3: Implement.**
  - **`managed-transfers.ts`:** keeps the 31337 behaviour and is parameterised by `chainId = chainIdForLedgerChain(t.chain)`:
    - deployment check: `manifestFor(chainId)` and `verifyManifest(chainId)`;
    - clients: `publicClientOn(chainId)`, and `walletClientOn(chainId)` for signing;
    - nonces: `allocateRelayerNonce(tx, chainId)` under `relayerLockKey(chainId)`, replacing the literal `72011`;
    - asset key: `settlementAssetKeyOn(chainId)`;
    - confirmations: `chainTarget(chainId).confirmations`, using `anvil_mine` only when `canMine`; otherwise poll `getBlockNumber` every 1 s for up to 120 s, then raise retryable `NETWORK_UNHEALTHY` and reuse the stored signed payload on retry.
  - **`wallets/index.ts`:** for user addresses on `basesepolia`, `resolveFrom` and `resolveTo` use `executionAccounts.find(userId, 84532)`, throwing `WALLET_NOT_READY` when there is none. `progressTransfer` sends both `testnet` and `basesepolia` to `progressManagedTransfer`, and screening receives the chain.
  - **Treasury seeding:** `seedOpeningBalances` calls `seedManagedTreasury(84532, …)` for `basesepolia`, mirroring `testnet`.
  - **Deposits:**
    - funding chain: `stock?.chain ?? opts?.chain ?? <existing heuristic>`;
    - a `basesepolia` funding chain calls `executionAccounts.ensure(userId, 84532)`;
    - `onchainFundedAt` is set for both managed chains;
    - a `stock_id` whose stock has `networkId !== null` is rejected with `UnprocessableEntityException("Onchain stocks are bought through investment orders", "CAPABILITY_UNAVAILABLE")`.
  - **Withdrawals:** `chain = opts?.chain ?? <existing expression>`.
  - **Earnings payouts:** the earnings batch passes the ledger chain of each candidate's receipts (`ledgerChainFor(network.chainId)`) to `createEarningsPayout`.
  - **`verifyManifest`:** uses `rpcOn(chainId, …)` for non-local chains, so the test transport and the shared chain-ID check apply.
  - **Seed:** when the Base Sepolia manifest exists, add `basesepolia: 1_000_000_000_000n` to the seeded treasury.
  - **`scripts/sepolia-treasury.ts --micro <n>`:** calls `assertBetaRuntime`, mints `n` test USDC to the `basesepolia` treasury address with `managedMint`, and posts `testTreasuryMinted` with key `topup:basesepolia:<ISO time>`. Add `"sepolia:treasury"` to `package.json`.

- [ ] **Step 4: Commit** — `git commit -m "feat: run naira deposits, withdrawals and payouts on Base Sepolia"`

### Task 5: Onboarding, test identity, documents and agreements

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117020000_customer_onboarding`), `src/backend/services/jobs/types.ts`, `src/backend/workers/handlers.ts`, `src/app/api/v1/app/auth/privy/route.ts`, `src/backend/services/app/session.ts`
- Create: `src/backend/content/documents.ts`, `src/backend/services/agreements/index.ts`, `src/backend/services/app/onboarding.ts`, `src/backend/services/app/identity.ts`, `src/backend/validators/app/onboarding.validator.ts`, routes below
- Test: `tests/app/onboarding.test.ts`

**Interfaces:**
- Consumes: `kycService.verify`, `executionAccounts.ensure`, `customerChainId()` (Task 4).
- Produces:

```prisma
model AgreementAcceptance {
    id         String   @id @default(cuid())
    userId     String
    document   String
    version    String
    acceptedAt DateTime @default(now())

    @@unique([userId, document, version])
    @@map("agreement_acceptances")
}
```

```ts
export type DocumentSlug = "terms" | "risks" | "how-shares-are-held" | "earn-risks" | "privacy";
export type CustomerDocument = { slug: DocumentSlug; title: string; version: string; body: string };
export const CUSTOMER_DOCUMENTS: Record<DocumentSlug, CustomerDocument>;           // every version "2026-11-17"
export const INVEST_DOCUMENTS: readonly DocumentSlug[];                             // ["terms", "risks", "how-shares-are-held"]
agreementService.accept(userId: string, items: { slug: DocumentSlug; version: string }[]): Promise<void>; // AGREEMENT_OUTDATED (409) on a stale version
agreementService.acceptedCurrent(userId: string): Promise<Set<DocumentSlug>>;
export type AppOnboardingStepKey = "identity" | "pin" | "agreements" | "bank_account";
export type AppOnboardingDto = { complete: boolean; next_step: AppOnboardingStepKey | null; steps: { key: AppOnboardingStepKey; title: string; done: boolean; required: boolean }[] };
appOnboardingService.status(userId: string): Promise<AppOnboardingDto>;
appOnboardingService.assertReady(userId: string, need: "add_money" | "invest" | "withdraw" | "earn"): Promise<void>;
export type AppTestIdentityDto = { id: "ada_tier2" | "tunde_tier1" | "rejected"; name: string; description: string };
appIdentityService.testIdentities(): AppTestIdentityDto[];
appIdentityService.verify(userId: string, id: AppTestIdentityDto["id"]): Promise<{ verified: boolean; onboarding: AppOnboardingDto }>;
// JobKind gains "wallets.prepare_execution" → executionAccounts.ensure(subjectId, customerChainId())
// the Privy sign-in response becomes { is_new_customer, next_step }; signed-in AppSessionDto gains onboarding: { complete: boolean; next_step: AppOnboardingStepKey | null }
```

**Onboarding rules:**
- **Steps:** in order, with titles `identity` "Verify your identity", `pin` "Create your PIN", `agreements` "Review and accept" and `bank_account` "Add your bank account".
- **Required:** the first three. `complete` means all three are done, and `next_step` is the first incomplete required step, or `null`.
- **Readiness:**
  - `add_money` needs a verified identity and all of `INVEST_DOCUMENTS` at their current versions;
  - `invest` also needs a PIN;
  - `withdraw` also needs an active bank account;
  - `earn` also needs `earn-risks`.
- **Failures:** a readiness failure throws `ConflictException(…, "ONBOARDING_INCOMPLETE")`.

**Test identities:**

| ID | Name | Description |
| --- | --- | --- |
| `ada_tier2` | Adaeze Obi | Verified, higher limits |
| `tunde_tier1` | Babatunde Adeyemi | Verified, standard limits |
| `rejected` | Not verified | Try a failed check |

**Documents:** bodies are plain-English Markdown. They must contain these phrases (case-insensitive):

| Slug | Required phrases |
| --- | --- |
| `terms` | "test money", "no real naira", "beta" |
| `risks` | "can lose money", "not guaranteed", "past performance" |
| `how-shares-are-held` | "test shares", "track the price", "no value", "not direct ownership", "no voting rights", "tokenized" |
| `earn-risks` | "less than you put in", "fees are not guaranteed", "every week" |
| `privacy` | "email address", "bank account", "we do not store your phone number", "we do not sell" |

| Route | Middlewares | Body | Data |
| --- | --- | --- | --- |
| `GET /api/v1/app/onboarding` | auth | — | `AppOnboardingDto` |
| `GET /api/v1/app/identity/test-identities` | auth | — | `AppTestIdentityDto[]` |
| `POST /api/v1/app/identity` | auth, origin, body | `{ test_identity_id }` | `{ verified, onboarding }` |
| `GET /api/v1/app/documents` | auth | — | `{ slug, title, version, accepted }[]` |
| `GET /api/v1/app/documents/[slug]` | path (public) | — | `{ slug, title, version, body }` |
| `POST /api/v1/app/agreements` | auth, origin, body | `{ documents: [{ slug, version }] }` (1–5 items) | `AppOnboardingDto` |

- [ ] **Step 1: Write `tests/app/onboarding.test.ts`**

```ts
it("walks the steps in order and reports readiness", async () => {
  // new customer → next_step "identity"; after identity → "pin"; after PIN → "agreements"; after agreements → complete true, next_step null
});
it("blocks money actions until setup is done", async () => {
  // appOnboardingService.assertReady(user, "add_money") before identity → code ONBOARDING_INCOMPLETE; via a route → SETUP_REQUIRED
});
it("rejects a stale document version", async () => {
  // { slug: "terms", version: "2026-01-01" } → 409 DOCUMENT_UPDATED
});
it("serves documents with their required statements", async () => {
  for (const doc of Object.values(CUSTOMER_DOCUMENTS)) {
    const res = await callAppRoute(documentGET, { method: "GET", url: `${ORIGIN}/api/v1/app/documents/${doc.slug}`, params: { slug: doc.slug }, documents: true });
    expect(res.status).toBe(200);
  }
  // each required phrase from the table is present
});
it("prepares the execution account in the background after a verified identity", async () => {
  // POST identity ada_tier2 → a job "wallets.prepare_execution" with subjectId userId exists; "rejected" → verified false and no job
});
```

- [ ] **Step 2: Implement** the content, services and routes as specified. The documents list and detail reuse `CUSTOMER_DOCUMENTS`; detail responses pass the leak check in documents mode.

- [ ] **Step 3: Commit** — `git commit -m "feat: add customer onboarding, test identities and versioned agreements"`

### Task 6: Prices: trading window, display window, history and fill guard

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117030000_stock_price_history`), `src/backend/config/policy.ts`, `src/backend/services/stocks/reference.ts`, `src/backend/services/stocks/index.ts`, `src/backend/services/investments/index.ts`
- Create: `src/backend/services/stocks/history.ts`, `src/backend/services/app/valuation.ts`
- Test: `tests/unit/reference-windows.test.ts`, `tests/unit/venue-band.test.ts`, `tests/integration/stock-history.test.ts`

**Interfaces:**
- Produces:

```ts
// policy.onchain.reference (new; referenceMaxAgeSeconds stays as the default for unlisted chains)
reference: { tradeMaxAgeSeconds: { testnet: 60, basesepolia: 7_200 }, displayMaxAgeSeconds: 604_800, venueBandBps: { basesepolia: 300 } }

// reference.ts
export type DisplayReference = { priceMicroUsd: bigint; basis: ReferencePriceBasis; asOf: Date; status: "live" | "delayed" };
export function referenceUsable(stock: Stock, at: Date): boolean;             // window = tradeMaxAgeSeconds[stock.chain] ?? referenceMaxAgeSeconds
export function referenceDisplay(stock: Stock, at: Date): DisplayReference | null;
export function tokenPriceMicroUsd(stock: Pick<Stock, "referencePriceMicroUsd" | "referenceBasis" | "multiplierWad">): bigint | null; // token_nav → price; share_price → floor(price × multiplier / WAD)
export function sharePriceMicroUsd(stock: Stock): bigint | null;              // floor(tokenPrice × WAD / multiplier)
export function assertVenueWithinBand(stock: Stock, side: "buy" | "sell", inputRaw: bigint, expectedOutputRaw: bigint): void; // PRICE_OUT_OF_RANGE (422)

// history.ts
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
stockHistory.record(client: Tx, stockId: string, ref: { priceMicroUsd: bigint; basis: string; asOf: Date; multiplierWad: bigint }, rate: Rate | null): Promise<void>;
stockHistory.series(stockId: string, range: ChartRange, at: Date): Promise<{ t: Date; priceMicroUsd: bigint; rate: Rate | null }[]>;
stockHistory.priceBefore(stockId: string, at: Date): Promise<{ priceMicroUsd: bigint; rate: Rate | null; asOf: Date } | null>;

// valuation.ts
export type DisplayValue = { valueMicroUsd: bigint | null; valueKobo: bigint | null; status: "live" | "delayed" | "unavailable"; asOf: Date | null };
export function displayValue(stock: Stock, raw: bigint, rate: Rate | null, at: Date): DisplayValue; // floor(raw × tokenPrice / 10^decimals); unavailable without a displayable reference or a rate
```

```prisma
model StockPriceSnapshot {
    id            String   @id @default(cuid())
    stockId       String
    asOf          DateTime
    priceMicroUsd BigInt
    basis         String
    multiplierWad Decimal  @db.Decimal(78, 0)
    rateKobo      BigInt?
    rateMicroUsd  BigInt?
    createdAt     DateTime @default(now())

    @@unique([stockId, asOf])
    @@map("stock_price_snapshots")
}
```

**Rules:**
- **`referenceDisplay`:** `live` when `referenceUsable`, `delayed` when the price is at most `displayMaxAgeSeconds` old, otherwise `null`.
- **`assertVenueWithinBand`:**
  - the band comes from `venueBandBps[stock.chain]`, and a missing band returns without checking;
  - with no token price, throw `REFERENCE_STALE`;
  - effective price per whole token, in micro-USD: `inputRaw × 10^decimals / expectedOutputRaw` for a buy, `expectedOutputRaw × 10^decimals / inputRaw` for a sell;
  - throw when `|effective − ref| × 10_000 / ref > band`.
- **`investmentService.quote`:** throws `REFERENCE_STALE` (422) instead of `STOCK_UNAVAILABLE` for a stale reference, and calls `assertVenueWithinBand` on the chosen quote.
- **Chart ranges:**

  | Range | Window | Bucket |
  | --- | --- | --- |
  | 1D | 24 h | 15 min |
  | 1W | 7 d | 2 h |
  | 1M | 30 d | 8 h |
  | 3M | 90 d | 1 d |
  | 1Y | 365 d | 1 d |
  | ALL | everything | 7 d |

  Keep the last snapshot per bucket, ascending, at most 400 points.
- **Snapshots:** after its update transaction, `syncReference` records a snapshot for every updated row that has a price and `asOf`, using `ratesService.display().payoutRate`, or `null` when rates are unavailable.

- [ ] **Step 1: Write the tests**

```ts
// tests/unit/reference-windows.test.ts
// basesepolia stock: asOf 7,199 s old → referenceUsable true; 7,201 s → false; testnet: 61 s → false
// referenceDisplay: 3 days old → status "delayed"; 8 days → null; 10 s on testnet → "live"
// tokenPriceMicroUsd: share_price 100_000_000 with multiplier 1.5e18 → 150_000_000; token_nav unchanged

// tests/unit/venue-band.test.ts — basesepolia stock, decimals 18, token_nav reference 250_000_000
expect(() => assertVenueWithinBand(stock, "buy", 1_000_000_000n, 3_900_000_000_000_000_000n)).not.toThrow(); // 256 bps
expect(() => assertVenueWithinBand(stock, "buy", 1_000_000_000n, 3_800_000_000_000_000_000n)).toThrow(expect.objectContaining({ code: "PRICE_OUT_OF_RANGE" })); // 526 bps
expect(() => assertVenueWithinBand({ ...stock, chain: "testnet" }, "buy", 1_000_000_000n, 1n)).not.toThrow();

// tests/integration/stock-history.test.ts
// record the same asOf twice → 1 row; 8 snapshots inside one 15-minute bucket → series("1D") returns 1 point with the last price
// priceBefore returns the newest snapshot at or before `at`
// syncReference with the recorded live fixture (stubbed fetch) writes one snapshot for the stand-in, with the payout rate
// investmentService.quote on a stale testnet stock rejects with code REFERENCE_STALE
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: split trading and display price windows and keep price history"`

### Task 7: Base Sepolia catalog and price alignment

**Files:**
- Modify: `scripts/sepolia-deploy.ts`, `scripts/seed-beta.ts`, `scripts/sepolia-smoke.ts`, `src/env.js`, `.env.example`, `src/backend/services/onchain/chains.ts`, `src/backend/services/jobs/types.ts`, `src/backend/services/jobs/schedule.ts`, `src/backend/workers/handlers.ts`, `prisma/schema.prisma` (+ migration `20261117040000_test_pool_alignment`)
- Create: `src/backend/services/stocks/test-pools.ts`
- Test: `tests/unit/test-pools.test.ts`, `tests/unit/chains.test.ts` (extend)

**Interfaces:**
- Consumes: `readPool`, `sqrtPriceX96For` (`hydrex/pool.ts`), `manifestFor(84532)`, `referenceUsable`, `tokenPriceMicroUsd` (Task 6).
- Produces:

```prisma
// Stock gains: displayTicker String?   (customer ticker, e.g. "AAPL"; used by Task 8)
model TestPoolAlignment {
    id               String   @id @default(cuid())
    stockId          String
    pool             String
    beforeMicroUsd   BigInt
    afterMicroUsd    BigInt
    referenceMicroUsd BigInt
    txHash           String
    createdAt        DateTime @default(now())

    @@index([stockId, createdAt])
    @@map("test_pool_alignments")
}
```

```ts
export function keeperOn(chainId: number): PrivateKeyAccount; // chains.ts; 84532 only; rejects the relayer key, TESTNET_SIGNER_PRIVATE_KEY and Anvil dev keys
export type PoolPrice = { midMicroUsd: bigint; sqrtPriceX96: bigint; stockIsToken0: boolean };
export function poolMidPriceMicroUsd(state: PoolState, stock: Address, decimals: number): PoolPrice;
export function targetSqrtPriceX96(refMicroUsd: bigint, stockIsToken0: boolean, decimals: number): bigint;
export type AlignmentPlan = { tokenIn: "usdc" | "stock"; amountIn: bigint; limitSqrtPriceX96: bigint } | null;
export function planAlignment(i: { midMicroUsd: bigint; refMicroUsd: bigint; stockIsToken0: boolean; decimals: number; keeperUsdc: bigint; keeperStock: bigint }): AlignmentPlan;
export function assertKeeperSwap(i: { chainId: number; router: Address; pool: Address; recipient: Address; tokenIn: Address; tokenOut: Address }, manifest: NetworkManifest, keeper: Address): void;
testPoolAligner.run(): Promise<{ stockId: string; action: "aligned" | "within_band" | "skipped"; reason?: string }[]>;
// JobKind gains "stocks.align_test_pools"; scheduled every policy.app.keeper.slotSeconds when BASE_SEPOLIA_RPC_URL and BASE_SEPOLIA_KEEPER_PRIVATE_KEY are set
```

**Price maths (exact; bigint, integer square root by Newton's method):**
- **Mid price:** stock as token0 → `mid = sqrtP² × 10^decimals / 2^192`; stock as token1 → `mid = 2^192 × 10^decimals / sqrtP²`. The unit is micro-USD per whole stock token, since USDC raw units are micro-USD.
- **Target:** stock as token0 → `isqrt(ref × 2^192 / 10^decimals)`; stock as token1 → `isqrt(10^decimals × 2^192 / ref)`.
- **`planAlignment`:**
  - when `|mid − ref| × 10_000 / ref <= 50`, return `null`;
  - when `mid < ref`, spend USDC, `amountIn = min(keeperUsdc, 5_000_000_000)`;
  - otherwise spend stock, `amountIn = min(keeperStock, 5_000_000_000 × 10^decimals / ref)`;
  - when `amountIn = 0`, return `null`;
  - `limitSqrtPriceX96` is the target.
- **Run:** take `pg_try_advisory_lock(72_099)` and skip if it is held. For each enabled `basesepolia` stock with `provenance.hydrexPool` and a usable reference:
  1. Read the pool and build a plan.
  2. Run `assertKeeperSwap`.
  3. Approve the router for exactly `amountIn`.
  4. Call `exactInputSingle({ tokenIn, tokenOut, deployer: zeroAddress, recipient: keeper, deadline: chainNow + 120, amountIn, amountOutMinimum: 0n, limitSqrtPrice: target })`, signed by `keeperOn(84532)`.
  5. Wait for the receipt, re-read the pool and record a `TestPoolAlignment`.

  The pool's price limit stops the swap at the reference price.

**Deploy and seed:**
- **Flags:** `scripts/sepolia-deploy.ts` gains `--tickers` (default `AAPL,NVDA,TSLA,MSFT,AMZN,GOOGL,META,SPCX`), `--liquidity-micro-usd` (default `50000000000`) and `--keeper-multiple` (default `2`).
- **Per ticker `T`:**
  1. Find the live feed row `${T}c` with a non-null `nav_price`. Otherwise print `skipped ${T}: no live price` and continue.
  2. Skip `T` if the manifest already has `StockToken_${T}`.
  3. Deploy `TestStockToken("<feed name> (test token)", "t" + T, stockSeed × (1 + keeperMultiple))` as `StockToken_${T}`, with `stockSeed = liquidity × 10^18 / nav`.
  4. Create the pool at the NAV and mint full-range liquidity worth `liquidity` on each side, recording it as external `HydrexPool_${T}`.
  5. Send the keeper `stockSeed × keeperMultiple` stock and mint it `liquidity × keeperMultiple` test USDC.
- **Manifest:** keeps the existing `StockTokenAAPL` and `HydrexPoolAAPL` entries and sets `catalogVersion: 2`.
- **Seed:**
  - for each `StockToken_${T}`, upsert a stock row (symbol `t${T}`, `displayTicker: T`, `provenance.standInFor` set to the live asset key, and `hydrexPool`);
  - upsert strategy `hydrex-${t}-usdc-basesepolia-v2`, with the same shape as the v1 strategy;
  - set the v1 `tAAPL` row and `hydrex-aapl-usdc-basesepolia` to `enabled: false`; holders still see them;
  - set `displayTicker` to `TSTA` and `TSTB` on the local fixture rows.

- [ ] **Step 1: Write `tests/unit/test-pools.test.ts`**

```ts
it("round-trips mid price and target for both token orders", () => {
  for (const stockIsToken0 of [true, false]) {
    const sqrt = targetSqrtPriceX96(250_000_000n, stockIsToken0, 18);
    const mid = poolMidPriceMicroUsd(stateWith(sqrt, stockIsToken0), STOCK, 18).midMicroUsd;
    expect(mid > 249_999_998n && mid < 250_000_002n).toBe(true);
  }
});
it("plans nothing inside 50 bps and caps each side", () => {
  expect(planAlignment({ midMicroUsd: 250_100_000n, refMicroUsd: 250_000_000n, stockIsToken0: true, decimals: 18, keeperUsdc: 10n ** 13n, keeperStock: 10n ** 21n })).toBeNull();
  expect(planAlignment({ midMicroUsd: 237_500_000n, refMicroUsd: 250_000_000n, stockIsToken0: true, decimals: 18, keeperUsdc: 10n ** 13n, keeperStock: 10n ** 21n })).toMatchObject({ tokenIn: "usdc", amountIn: 5_000_000_000n });
  expect(planAlignment({ midMicroUsd: 262_500_000n, refMicroUsd: 250_000_000n, stockIsToken0: true, decimals: 18, keeperUsdc: 10n ** 13n, keeperStock: 10n ** 21n })).toMatchObject({ tokenIn: "stock", amountIn: 20n * 10n ** 18n });
  expect(planAlignment({ midMicroUsd: 237_500_000n, refMicroUsd: 250_000_000n, stockIsToken0: true, decimals: 18, keeperUsdc: 0n, keeperStock: 0n })).toBeNull();
});
it("refuses swaps outside the manifest or to anyone but the keeper", () => {
  // chainId 31337, an unknown router, a pool not in manifest.external, recipient ≠ keeper → each throws
});
// tests/unit/chains.test.ts: keeperOn(84532) throws when BASE_SEPOLIA_KEEPER_PRIVATE_KEY equals BASE_SEPOLIA_RELAYER_PRIVATE_KEY
```

- [ ] **Step 2: Implement** as specified. Extend `scripts/sepolia-smoke.ts` to run `testPoolAligner.run()` once, print each result, and exit non-zero if any enabled stand-in is still more than 50 bps from its reference.

- [ ] **Step 3: Live check (operator, needs keys)** — run `yarn sepolia:deploy`, then `yarn seed:beta`, then `SEPOLIA_LIVE=1 yarn sepolia:smoke`. Expected: one line per stand-in, all `aligned` or `within_band`, and exit code 0.

- [ ] **Step 4: Commit** — `git commit -m "feat: expand the Base Sepolia catalog and keep stand-in prices aligned"`

### Task 8: Customer catalog

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117050000_watchlist`)
- Create: `src/backend/content/stock-profiles.ts`, `src/backend/services/app/catalog.ts`, `src/backend/validators/app/catalog.validator.ts`, routes below
- Test: `tests/app/catalog.test.ts`

**Interfaces:**
- Consumes: `customerChain()` (Task 4); `referenceDisplay`, `referenceUsable`, `sharePriceMicroUsd`, `stockHistory`, `displayValue` (Task 6); `Stock.displayTicker` (Task 7); `positionService.list`.
- Produces:

```prisma
model WatchlistEntry {
    userId    String
    stockId   String
    createdAt DateTime @default(now())

    @@id([userId, stockId])
    @@map("watchlist_entries")
}
```

```ts
export type StockProfile = { name: string; sector: string; summary: string; logoPath: string | null };
export const STOCK_PROFILES: Record<string, StockProfile>; // AAPL NVDA TSLA MSFT AMZN GOOGL META SPCX TSTA TSTB

export type AppTrading = "available" | "prices_updating" | "paused";
export type AppPriceStatus = "live" | "delayed" | "unavailable";
export type AppStockRefDto = { id: string; ticker: string; name: string; logo_path: string | null };
export type AppStockListItemDto = AppStockRefDto & { sector: string; price_kobo: string | null; price_usd_micro: string | null; price_status: AppPriceStatus; price_as_of: string | null; change_24h_bps: number | null; trading: AppTrading; on_watchlist: boolean; is_test: boolean };
export type AppPositionSummaryDto = { shares_micro: string; value_kobo: string | null; price_status: AppPriceStatus };
export type AppStockDetailDto = AppStockListItemDto & { summary: string; your_position: AppPositionSummaryDto | null; earn_product_id: string | null; documents: ["how-shares-are-held"] };
export type AppChartDto = { range: ChartRange; status: "ok" | "not_enough_data"; points: { t: string; price_kobo: string }[]; change_bps: number | null };

appCatalogService.list(userId: string, q: { query?: string; watchlist?: boolean }): Promise<AppStockListItemDto[]>;
appCatalogService.get(userId: string, stockId: string): Promise<AppStockDetailDto>;
appCatalogService.chart(stockId: string, range: ChartRange): Promise<AppChartDto>;
appCatalogService.watch(userId: string, stockId: string): Promise<void>;
appCatalogService.unwatch(userId: string, stockId: string): Promise<void>;
appCatalogService.stockRef(stock: Stock): AppStockRefDto;        // reused by later tasks
appCatalogService.inCatalog(stock: Stock): boolean;              // chain = customerChain(), enabled, not delisted, displayTicker in STOCK_PROFILES
```

**Rules:**
- **Profiles:** names are "Apple", "NVIDIA", "Tesla", "Microsoft", "Amazon", "Alphabet (Google)", "Meta", "SpaceX", "Test Stock A" and "Test Stock B". Each summary is at most 280 characters of plain language. `logoPath` is `/stocks/<ticker lower-case>.svg` for real tickers and `null` for the test fixtures.
- **Prices:** `price_kobo` is the share price at the payout rate. `price_usd_micro` is the share price itself. `is_test` is `true` on `testnet` and `basesepolia`.
- **24-hour change:** compare the current naira price with `priceBefore(now − 24 h)`, converted at that snapshot's rate or the current one; `null` when there is no snapshot.
- **Trading status:** paused or delisted → `paused`; `referenceUsable` → `available`; otherwise `prices_updating`.
- **List:** sorted by name. The query matches a ticker prefix or a name substring, case-insensitively, up to 40 characters.
- **Detail:** `get` returns a stock outside the catalog only when the customer holds it, otherwise `NOT_FOUND`.
- **Earn link:** `earn_product_id` is the id of the stock's Earn product as defined in Task 13, or `null` until then.

| Route | Middlewares | Query / body | Data |
| --- | --- | --- | --- |
| `GET /api/v1/app/stocks` | auth, query | `{ q?, watchlist?: "true" }` | `AppStockListItemDto[]` |
| `GET /api/v1/app/stocks/[id]` | auth, path | — | `AppStockDetailDto` |
| `GET /api/v1/app/stocks/[id]/chart` | auth, path, query | `{ range }` | `AppChartDto` |
| `PUT /api/v1/app/watchlist/[id]` | auth, origin, path | — | `{ on_watchlist: true }` |
| `DELETE /api/v1/app/watchlist/[id]` | auth, origin, path | — | `{ on_watchlist: false }` |

- [ ] **Step 1: Write `tests/app/catalog.test.ts`**

```ts
it("lists only profiled stocks on the customer network", async () => {
  // testnet TSTA (profiled) listed; testnet ZZZZ (no profile) hidden; a basesepolia row hidden while APP_CUSTOMER_CHAIN=testnet
});
it("marks delayed and missing prices honestly", async () => {
  // reference 3 days old → price_status "delayed" with price_as_of; no reference → price_kobo null, price_status "unavailable", trading "prices_updating"
});
it("searches, toggles the watchlist idempotently and filters by it", async () => { /* "test" and "TST" both match; PUT twice → one row; watchlist=true lists one */ });
it("returns chart points from snapshots and not_enough_data without them", async () => { /* 3 snapshots → status ok, 3 points ascending */ });
it("shows a held delisted stock and hides an unheld one", async () => { /* GET detail */ });
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: add the customer stock catalog, charts and watchlist"`

### Task 9: Cash: balance, add money, withdraw and bank account

**Files:**
- Create: `src/backend/services/app/cash.ts`, `src/backend/validators/app/cash.validator.ts`, routes below
- Test: `tests/app/cash.test.ts`

**Interfaces:**
- Consumes: `appOnboardingService.assertReady` (Task 5); `customerChain()` (Task 4); `securityService.verifyPin` (Task 3); `depositService`, `withdrawalService`, `bankAccountService`, `scenarioService`, `ratesService`, `ledgerService`.
- Produces:

```ts
export type AppCashDto = { available_kobo: string | null; on_hold_kobo: string | null; incoming_kobo: string | null; as_of: string };
export type AppPayToDto = { bank_name: string; account_number: string; account_name: string; reference: string | null; amount_kobo: string; expires_at: string | null };
export type AppDepositDto = { id: string; reference: string; status: AppProgress; title: string; amount_kobo: string; fee_kobo: string | null; you_get_kobo: string | null; pay_to: AppPayToDto | null; created_at: string };
export type AppBankDto = { code: string; name: string };
export type AppBankAccountDto = { bank_name: string; account_ending: string; account_name: string };
export type AppWithdrawalPreviewDto = { preview_id: string; amount_kobo: string; fee_kobo: string; you_receive_kobo: string; to: AppBankAccountDto; expires_at: string };
export type AppWithdrawalDto = { id: string; reference: string; status: AppProgress; title: string; amount_kobo: string; fee_kobo: string; you_receive_kobo: string; to: AppBankAccountDto; bank_reference: string | null; created_at: string };

appCashService.balance(userId: string): Promise<AppCashDto>;
appCashService.addMoney(userId: string, amountKobo: bigint, clientKey: string): Promise<{ dto: AppDepositDto; created: boolean }>;
appCashService.getDeposit(userId: string, id: string): Promise<AppDepositDto>;
appCashService.completeBetaDeposit(userId: string, id: string): Promise<AppDepositDto>;
appCashService.banks(): Promise<AppBankDto[]>;
appCashService.bankAccount(userId: string): Promise<AppBankAccountDto | null>;
appCashService.setBankAccount(userId: string, i: { bankCode: string; accountNumber: string; pin: string }): Promise<AppBankAccountDto>;
appCashService.previewWithdrawal(userId: string, amountKobo: bigint): Promise<AppWithdrawalPreviewDto>;
appCashService.withdraw(userId: string, i: { previewId: string; pin: string }, clientKey: string): Promise<{ dto: AppWithdrawalDto; created: boolean }>;
appCashService.getWithdrawal(userId: string, id: string): Promise<AppWithdrawalDto>;
export function depositProgress(order: RampOrder): { status: AppProgress; title: string };     // reused by Tasks 14–15
export function withdrawalProgress(order: RampOrder, bank: AppBankAccountDto): { status: AppProgress; title: string };
```

**Rules:**
- **Balances:** at the payout rate, `available` is ledger `userCash(customerChain)`, `on_hold` is `userReserved(customerChain)` and `incoming` is `userPending(userId)`. Values are `null` when rates are unavailable.
- **Add money:** calls `depositService.create(userId, { ngn_amount }, "app-deposit:" + userId + ":" + clientKey, { chain: customerChain() })`.
- **Beta completion:** `completeBetaDeposit` calls `scenarioService.run(userId, { order_id: id, scenario: "deposit_paid" })`.
- **Withdraw:** look up the ramp order by idempotency key `app-withdrawal:${userId}:${clientKey}` first. A match with the same quote returns the stored withdrawal without a PIN check. A match with a different quote throws `IDEMPOTENCY_KEY_REUSED`. Otherwise check readiness, run `verifyPin`, then call `withdrawalService.confirm`.
- **Deposit progress:**

  | Internal state | Status | Title |
  | --- | --- | --- |
  | any hold reason | action_needed | We need to check this transfer |
  | `created`, `awaiting_transfer` | waiting | Waiting for your transfer |
  | `received`, `funded` | processing | Adding to your cash |
  | `settled` | completed | Money added |
  | `expired` | cancelled | Transfer window closed |
  | `refunded` | failed | Transfer returned |
  | `failed` | failed | Transfer didn't go through |

- **Withdrawal progress:**

  | Internal state | Status | Title |
  | --- | --- | --- |
  | `created`, `funds_collected`, `submitted` | processing | Sending to your bank |
  | `paid` | completed | Sent to {bank_name} ••{account_ending} |
  | `reversed` | failed | Returned to your cash |
  | `failed` | failed | Withdrawal didn't go through |

- **Account ending:** the last 4 digits of the account number.

| Route | Middlewares | Body | Data |
| --- | --- | --- | --- |
| `GET /api/v1/app/cash` | auth | — | `AppCashDto` |
| `POST /api/v1/app/cash/deposits` | auth, origin, body, idempotency | `{ amount_kobo }` | `AppDepositDto` (201 created / 200 replay) |
| `GET /api/v1/app/cash/deposits/[id]` | auth, path | — | `AppDepositDto` |
| `POST /api/v1/app/beta/deposits/[id]/complete` | auth, origin, path | — | `AppDepositDto` |
| `GET /api/v1/app/banks` | auth | — | `AppBankDto[]` |
| `GET /api/v1/app/bank-account` | auth | — | `AppBankAccountDto \| null` |
| `PUT /api/v1/app/bank-account` | auth, origin, body | `{ bank_code, account_number, pin }` | `AppBankAccountDto` |
| `POST /api/v1/app/withdrawals/preview` | auth, origin, body | `{ amount_kobo }` | `AppWithdrawalPreviewDto` |
| `POST /api/v1/app/withdrawals` | auth, origin, body, idempotency | `{ preview_id, pin }` | `AppWithdrawalDto` |
| `GET /api/v1/app/withdrawals/[id]` | auth, path | — | `AppWithdrawalDto` |

- [ ] **Step 1: Write `tests/app/cash.test.ts`** (uses `readyCustomer()`, added to `tests/helpers/app.ts`: signed in through `signInCustomer()`, `ada_tier2`, PIN `1357`, documents accepted)

```ts
it("needs a verified identity before adding money", async () => { /* fresh sign-in → POST deposits → 409 SETUP_REQUIRED */ });
it("adds money through bank transfer instructions", async () => {
  // POST deposits { amount_kobo: "2000000" } → status "waiting", pay_to.amount_kobo "2000000", reference set
  // POST beta complete, then drainJobs() → status "completed"; GET cash → available_kobo > 0
});
it("previews and confirms a withdrawal with the PIN", async () => {
  // preview 500000 → fee_kobo "10000", you_receive_kobo "490000"; wrong PIN → PIN_INCORRECT and no ramp order with that key
  // correct PIN → status "processing"; the same Idempotency-Key with a wrong PIN returns the same id and pinFailedAttempts is unchanged
});
it("refuses a bank account in someone else's name", async () => { /* simulated resolver returns a different name → NAME_MISMATCH */ });
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: add customer cash balance, add money and withdrawals"`

### Task 10: Orders: preview and immediate buy or sell

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117060000_customer_orders`)
- Create: `src/backend/services/customer-orders/index.ts`, `src/backend/services/app/orders.ts`, `src/backend/validators/app/orders.validator.ts`, routes below
- Test: `tests/app/orders-now.test.ts`

**Interfaces:**
- Consumes: `investmentService.quote/confirm`, `authorizationService.create`, `positionService.list`, `ledgerService`; `referenceUsable`, `referenceDisplay`, `sharePriceMicroUsd`, `tokenPriceMicroUsd` (Task 6); `appCatalogService.stockRef` (Task 8); `securityService.verifyPin` (Task 3); `CUSTOMER_DOCUMENTS` (Task 5).
- Produces:

```prisma
enum CustomerOrderSide { buy sell }
enum CustomerOrderFunding { cash bank_transfer }
enum CustomerOrderStatus { waiting_for_payment waiting_for_price executing completed failed cancelled expired }
enum CustomerPreviewMode { now waiting }

model CustomerOrderPreview {
    id                     String                @id @default(cuid())
    userId                 String
    stockId                String
    side                   CustomerOrderSide
    funding                CustomerOrderFunding?
    mode                   CustomerPreviewMode
    amountKobo             BigInt
    quantityRaw            Decimal?              @db.Decimal(78, 0)
    budgetMicroUsd         BigInt?
    investmentQuoteId      String?               @unique
    referencePriceMicroUsd BigInt
    limitPriceMicroUsd     BigInt
    rateKobo               BigInt
    rateMicroUsd           BigInt
    terms                  Json
    expiresAt              DateTime
    consumedAt             DateTime?
    createdAt              DateTime              @default(now())

    @@index([userId, createdAt])
    @@map("customer_order_previews")
}

model CustomerOrder {
    id                 String                @id @default(cuid())
    userId             String
    key                String                @unique
    requestHash        String
    previewId          String                @unique
    stockId            String
    side               CustomerOrderSide
    funding            CustomerOrderFunding?
    status             CustomerOrderStatus
    amountKobo         BigInt
    budgetMicroUsd     BigInt?
    quantityRaw        Decimal?              @db.Decimal(78, 0)
    limitPriceMicroUsd BigInt
    authorizationId    String?
    depositOrderId     String?               @unique
    investmentId       String?               @unique
    holdKey            String?
    holdReleasedAt     DateTime?
    settledKobo        BigInt?
    expiresAt          DateTime
    completedAt        DateTime?
    createdAt          DateTime              @default(now())
    updatedAt          DateTime              @updatedAt

    @@index([userId, createdAt])
    @@index([status])
    @@map("customer_orders")
}
```

```ts
export type AppOrderPreviewDto = {
  preview_id: string; stock: AppStockRefDto; side: "buy" | "sell"; pay_with: "cash" | "bank_transfer" | null;
  executes: "now" | "when_prices_update" | "after_your_transfer";
  amount_kobo: string; shares_micro: string; price_kobo: string; price_limit_kobo: string | null;
  fees: { label: string; kobo: string | null; note: string | null }[];
  you_receive_kobo: string | null; expires_at: string; order_valid_until: string | null; notes: string[];
};
export type AppOrderStatus = "waiting_for_payment" | "waiting_for_price" | "processing" | "completed" | "failed" | "cancelled" | "expired";
export type AppOrderDto = {
  id: string; reference: string; stock: AppStockRefDto; side: "buy" | "sell";
  status: AppOrderStatus; title: string; detail: string;
  amount_kobo: string | null; shares_micro: string | null; price_kobo: string | null;
  pay_to: AppPayToDto | null; can_cancel: boolean; valid_until: string | null;
  timeline: { label: string; done: boolean; at: string | null }[];
  created_at: string; completed_at: string | null;
};
customerOrderService.createPreview(i: CreatePreviewInput): Promise<CustomerOrderPreview>;
customerOrderService.placeNow(userId: string, previewId: string, key: string): Promise<CustomerOrder>;
customerOrderService.resumeNow(orderId: string): Promise<void>;
customerOrderService.load(userId: string, orderId: string): Promise<{ order: CustomerOrder; investment: Investment | null; deposit: RampOrder | null }>;
appOrdersService.preview(userId: string, input: OrderPreviewBody): Promise<AppOrderPreviewDto>;
appOrdersService.place(userId: string, i: { previewId: string; pin: string }, clientKey: string): Promise<{ dto: AppOrderDto; created: boolean }>;
appOrdersService.get(userId: string, orderId: string): Promise<AppOrderDto>;
export function orderView(order: CustomerOrder, investment: Investment | null, deposit: RampOrder | null, stock: Stock): Pick<AppOrderDto, "status" | "title" | "detail" | "can_cancel" | "timeline">; // reused by Tasks 14–15
```

**Preview rules:**
- **Body:** one of `{ stock_id, side: "buy", amount_kobo, pay_with?: "cash" | "bank_transfer" }`, `{ stock_id, side: "sell", amount_kobo }` or `{ stock_id, side: "sell", sell_all: true }`, with `amount_kobo ≥ 100000`.
- **Readiness:** `assertReady(userId, "invest")`, and the stock must be in the catalog or held.
- **Payment method:** `pay_with` defaults to `cash` when available cash covers the amount, otherwise `bank_transfer`.
- **Immediate mode** (cash buy or any sell, stock trading `available`):
  - call `investmentService.quote`: buy with `budgetNgn = amount_kobo`; sell with `inputRaw` set to the computed quantity;
  - the preview expires with the quote;
  - fees are "V3ST fee" (`fee_usdc_raw`), "Currency conversion" (`fx_fee_usdc_raw`) and "Trading fee" (`venue_fee_usdc_raw`), each in kobo at the quote's FX rate.
- **Sell quantity:**
  - by amount: `floor(ngnToUsd(amount, payoutRate, "floor") × 10^decimals / tokenPrice)`;
  - `sell_all`: the whole unreserved holding;
  - more than the holding throws `INSUFFICIENT_SHARES` (409).
- **Price limit:** stored on every preview (buy: ceiling of reference × 10,300 / 10,000; sell: floor of reference × 9,700 / 10,000), and used by Task 11.
- **Bank transfer and stale prices:** in this task, `bank_transfer` previews and quotes that throw `REFERENCE_STALE` or `PRICE_OUT_OF_RANGE` propagate their error (customer code `PRICES_UPDATING`). Task 11 replaces this with waiting previews.

**Place rules:**
- **Replay:** look up `CustomerOrder.key = "app-order:" + userId + ":" + clientKey` first. A match with `requestHash = sha256(previewId)` returns it without a PIN check. A match with another hash throws `IDEMPOTENCY_KEY_REUSED`.
- **Checks:** then readiness and `verifyPin`.
- **`placeNow`:**
  1. In one transaction: lock the preview; check it is owned, unconsumed and unexpired (`PREVIEW_EXPIRED`, 409); create the order with status `executing`; consume the preview.
  2. Call `authorizationService.create(userId, { kind: "one_time", quote_kind: "investment", quote_id, policy_version: policy.app.policyVersion, disclosure_version: CUSTOMER_DOCUMENTS.risks.version }, order.key + ":consent")`.
  3. Call `investmentService.confirm(userId, quoteId, consentId, order.key + ":investment")`.
  4. In a transaction, set `authorizationId` and `investmentId`.
- **`resumeNow`:** repeats steps 2–4 with the same keys for an `executing` order with no investment.

**Order view (exact copy):** `{name}` is the profile name. `{amount}` and `{shares}` use `formatNaira` and `formatShares`, and `{limit}` is the price limit in naira.

| Order state | Status | Title | Detail |
| --- | --- | --- | --- |
| executing, no investment or investment pending | processing | "Buying {name}" / "Selling {name}" | "This usually takes under a minute." When the investment has a hold reason: "This is taking longer than usual. Your money is safe." |
| investment `filled` / `partial` | completed | "Bought {name}" / "Sold {name}" | "{shares} for {amount}." |
| investment `failed` / `cancelled`, or order `failed` | failed | "Order didn't go through" | buy: "Your money is back in your cash." sell: "Your shares are still yours." |
| `waiting_for_payment` | waiting_for_payment | "Waiting for your transfer" | "Send {amount} to the account below. We'll buy {name} when it arrives." |
| `waiting_for_price` | waiting_for_price | "Waiting for prices to update" | "Your order goes through at the next price update, at no more than {limit} per share." (sell: "no less than") |
| `cancelled` | cancelled | "Order cancelled" | buy: "Your money is in your cash." sell: "Your shares are still yours." |
| `expired` | expired | "Order expired" | "The price didn't stay within your limit in time." plus the cancelled detail |

Timeline labels: immediate orders show "Order placed", "Buying shares" (or "Selling shares") and "Done". Bank-transfer orders add "Transfer received" after "Order placed".

| Route | Middlewares | Body | Data |
| --- | --- | --- | --- |
| `POST /api/v1/app/orders/preview` | auth, origin, body | preview body | `AppOrderPreviewDto` |
| `POST /api/v1/app/orders` | auth, origin, body, idempotency | `{ preview_id, pin }` | `AppOrderDto` (201 / 200 replay) |
| `GET /api/v1/app/orders/[id]` | auth, path | — | `AppOrderDto` |

- [ ] **Step 1: Write `tests/app/orders-now.test.ts`** (local testnet stock with a fresh reference, customer funded through Task 9's add-money flow)

```ts
it("buys now with cash", async () => {
  // preview { side: "buy", amount_kobo: "2000000" } → executes "now", fees labelled "V3ST fee" / "Currency conversion" / "Trading fee", shares_micro > 0
  // place with PIN → status "processing"; drainJobs() → GET order status "completed", shares_micro > 0
});
it("sells everything now", async () => { /* sell_all → shares_micro equals the holding; completed; cash available rises */ });
it("expires an unused preview", async () => { /* setNow(+31 s) → place → 409 PRICE_CHANGED */ });
it("keeps the preview after a wrong PIN", async () => { /* wrong → PIN_INCORRECT; right PIN on the same preview → processing */ });
it("creates one order for a repeated confirm", async () => {
  const key = "double-tap-0001";
  const [a, b] = await Promise.all([placeWith(key, "1357"), placeWith(key, "1357")]);
  expect(a.json.data.id).toBe(b.json.data.id);
  expect(await db.investment.count({ where: { key: { startsWith: `app-order:${userId}:${key}` } } })).toBe(1);
  const replay = await placeWith(key, "9999");
  expect(replay.json.data.id).toBe(a.json.data.id);
  expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).pinFailedAttempts).toBe(0);
});
it("finishes an order interrupted before its investment", async () => {
  // create the order row as placeNow step 1 would, call resumeNow twice → exactly one investment
});
it("explains a failed buy without internal words", async () => {
  // POST /api/v1/beta/onchain-scenarios { scenario: "revert" } for the order's operation → drainJobs → GET order via callAppRoute:
  // status "failed", title "Order didn't go through", detail "Your money is back in your cash."
});
it("reports a delayed buy calmly", async () => {
  // scenario "sponsor_shortage" → GET order: status "processing", detail "This is taking longer than usual. Your money is safe."
});
it("refuses a stale price in this task", async () => { /* stale reference → preview returns PRICES_UPDATING (Task 11 changes this) */ });
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: let customers preview and place immediate stock orders"`

### Task 11: Waiting orders: when prices update and after a transfer

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117070000_order_consent_limit`), `src/backend/services/authorizations/index.ts`, `src/backend/services/investments/index.ts`, `src/backend/services/deposits/index.ts`, `src/backend/services/customer-orders/index.ts`, `src/backend/services/app/orders.ts`, `src/backend/services/jobs/types.ts`, `src/backend/services/jobs/schedule.ts`, `src/backend/workers/handlers.ts`, `tests/app/orders-now.test.ts`
- Create: `src/backend/services/customer-orders/executor.ts`, `src/app/api/v1/app/orders/[id]/route.ts` (adds `DELETE`)
- Test: `tests/app/orders-waiting.test.ts`

**Interfaces:**
- Consumes: Task 10's models and `orderView`, and `depositService.create` (Task 4).
- Produces:

```prisma
// InvestmentAuthorization gains: limitPriceMicroUsd BigInt?
```

```ts
export type StandingAction = "claim" | "reward_conversion" | "reinvest" | "withdrawal_sale" | "order_buy" | "order_sell";
// The public validator's STANDING_ACTIONS stays unchanged; order actions are created only by createOrderConsent.
authorizationService.createOrderConsent(tx: Tx, userId: string, i: { orderId: string; side: "buy" | "sell"; stockId: string; maxNgnKobo: bigint; limitPriceMicroUsd: bigint; expiresAt: Date }): Promise<InvestmentAuthorization>;
// AuthorizationUsage.quote gains effectivePriceMicroUsd?: bigint. For order actions, check() throws AUTHORIZATION_EXCEEDED
// when it is missing, above the limit (buy) or below it (sell).
investmentService.confirm(userId, quoteId, authorizationId, key, opts?: { standingAction?: StandingAction; releaseHold?: { key: string; kind: "cash" | "stock"; amount: bigint }; purpose?: TradePurpose });
// releaseHold posts cashReleased / stockReleased with key `${hold.key}:release`, inside confirm's transaction, before the reservation
depositService.create(userId, body, key, opts?: { chain?: CustomerChain; holdFor?: { key: string; orderId: string } });
// holdFor: the funding-settled transaction posts cashReserved({ key, userId, chain, amount: credited, from: "cash" }) and enqueues orders.progress(orderId)
customerOrderService.placeWaiting(userId: string, previewId: string, key: string): Promise<CustomerOrder>;
customerOrderService.cancel(userId: string, orderId: string): Promise<CustomerOrder>;
customerOrderExecutor.progress(orderId: string): Promise<void>;
customerOrderExecutor.sweep(): Promise<{ enqueued: number }>;
export function withinLimit(side: "buy" | "sell", effectiveMicroUsd: bigint, limitMicroUsd: bigint): boolean;
// JobKind gains "orders.progress" (per order) and "orders.sweep" (every policy.app.sweepSeconds)
```

**Waiting preview** (replaces Task 10's stale-price error):
- **Mode:** waiting when the payment method is `bank_transfer` (`executes: "after_your_transfer"`), or when the immediate quote throws `REFERENCE_STALE` or `PRICE_OUT_OF_RANGE` (`executes: "when_prices_update"`).
- **Price:** a display reference is required; otherwise throw `STOCK_UNAVAILABLE`.
- **Lifetimes:** the preview lasts 300 s, and `order_valid_until` is 72 h after now.
- **Fees:** "Trading fee" with `kobo: null` and note "Up to 1%". Bank transfers add "Bank transfer fee", from the ramp provider's `quote("in", amount).feeNgn`.
- **Note:** "If the price moves more than 3% against you before your order goes through, it won't go through and your money stays safe."

**`placeWaiting`** (one transaction):
1. Lock the preview and check it.
2. Create the order with status `waiting_for_payment` for bank transfers, otherwise `waiting_for_price`, and `expiresAt = now + 259,200 s`.
3. Create the consent with `createOrderConsent`:
   - `maxNgnKobo` is the buy amount, or the sell estimate × 10,300 / 10,000 rounded up;
   - caps `max_fee_bps: 100` and `max_slippage_bps: 100`;
   - expiry equal to the order's;
   - policy version `policy.app.policyVersion`.
4. Place the hold:
   - cash buy: `cashReserved` with key `order-hold:${id}` for `budgetMicroUsd`, which throws `INSUFFICIENT_FUNDS` atomically;
   - sell: `stockReserved` with the same key for the quantity.
5. Consume the preview and emit `customer_order.updated`.

For a bank transfer, after the transaction: `depositService.create(userId, { ngn_amount }, order.key + ":deposit", { chain: customerChain(), holdFor: { key: "order-hold:" + id, orderId: id } })`, then link `depositOrderId`.

**Executor** (under `pg_advisory_xact_lock(hashtext('customer-order:' || id))`):

| State | Action |
| --- | --- |
| `waiting_for_payment` | No deposit: create it with the same key. Deposit settled: set `budgetMicroUsd` to the deposit's USD amount and `holdKey`, then move to `waiting_for_price`. Deposit expired: move to `expired`. Deposit refunded or failed: move to `failed`. Either way, revoke the consent. |
| `waiting_for_price` | Past `expiresAt`: release the hold, revoke the consent, move to `expired`. Stock paused: wait. Otherwise quote (buy `inputRaw = budgetMicroUsd`, sell `inputRaw = quantityRaw`). `REFERENCE_STALE`, `PRICE_OUT_OF_RANGE` or `!withinLimit`: wait. Otherwise move to `executing`, then `investmentService.confirm(…, order.key + ":investment", { standingAction: "order_buy" \| "order_sell", releaseHold: { key: holdKey, kind, amount } })` and link `investmentId`. If confirm fails, return to `waiting_for_price`. |
| `executing`, no investment | `resumeNow` |
| `executing`, investment final | `filled` or `partial`: move to `completed` and set `completedAt` and `settledKobo` (at the payout rate). `failed` or `cancelled`: move to `failed`. Revoke the consent either way. |
| final, with `holdKey` and no `holdReleasedAt` | Release the hold once (key `${holdKey}:release`) and set `holdReleasedAt`. This covers a transfer that lands after cancellation. |

Every status change emits `customer_order.updated` with the new status. The sweep enqueues `orders.progress` for every non-final order and every final order with an unreleased hold.

**Cancel:** allowed in `waiting_for_payment` and `waiting_for_price`. It releases the hold and revokes the consent in one transaction, then moves to `cancelled`. Any other state throws `ConflictException(…, "ORDER_NOT_CANCELLABLE")`.

| Route | Middlewares | Data |
| --- | --- | --- |
| `DELETE /api/v1/app/orders/[id]` | auth, origin, path | `AppOrderDto` |

- [ ] **Step 1: Change `orders-now.test.ts`.** The "stale price" case now expects `executes: "when_prices_update"`.

- [ ] **Step 2: Write `tests/app/orders-waiting.test.ts`**

```ts
it("buys when prices update", async () => {
  // stale reference → preview executes "when_prices_update" → place → status "waiting_for_price"; GET cash on_hold_kobo > 0
  // refresh the reference and drainJobs() (sweep) → status "completed"; on_hold back to its previous value; holding increased
});
it("never buys beyond the price limit, and expires with the cash released", async () => {
  // place a waiting order, then set its limitPriceMicroUsd below the venue's effective price
  for (let i = 0; i < 3; i++) { await customerOrderExecutor.sweep(); await drainJobs(); }
  expect(await db.investment.count({ where: { key: `${order.key}:investment` } })).toBe(0);
  setNow(addSeconds(order.expiresAt, 1).toISOString()); await customerOrderExecutor.sweep(); await drainJobs();
  // status "expired"; cash available restored exactly; consent revokedAt set
});
it("buys after a bank transfer, with the cash held as it lands", async () => {
  // pay_with "bank_transfer" → status "waiting_for_payment" with pay_to; complete the beta transfer
  // in the funding transaction: userReserved equals the deposit's USD amount and available cash is unchanged; sweep → "completed"
});
it("cancels a waiting order and releases its cash exactly once", async () => {
  // DELETE → "cancelled"; two sweeps → one journal with key `${holdKey}:release`
});
it("refuses to cancel an order that has started", async () => { /* executing → 409 ALREADY_STARTED */ });
it("never spends held cash twice", async () => {
  // waiting order holds all cash → a second cash buy preview → NOT_ENOUGH_CASH; withdrawal preview for the same cash → NOT_ENOUGH_CASH
});
it("holds shares for a waiting sell", async () => { /* stale → waiting sell; sell_all preview → NOT_ENOUGH_SHARES */ });
it("rejects an order consent used above its limit", async () => {
  // authorizationService.check(tx, user, consentId, { action: "order_buy", quote: { …, effectivePriceMicroUsd: limit + 1n } }) → AUTHORIZATION_EXCEEDED
});
```

- [ ] **Step 3: Implement** as specified.

- [ ] **Step 4: Commit** — `git commit -m "feat: hold waiting orders until prices update or the transfer lands"`

### Task 12: Holdings and home

**Files:**
- Modify: `src/backend/services/positions/index.ts`
- Create: `src/backend/services/app/holdings.ts`, `src/backend/services/app/home.ts`, `src/app/api/v1/app/holdings/route.ts`, `src/app/api/v1/app/home/route.ts`
- Test: `tests/app/home.test.ts`

**Interfaces:**
- Consumes: `displayValue`, `stockHistory.priceBefore` (Task 6); `appCatalogService.stockRef` (Task 8); `appCashService.balance` (Task 9); `orderView` (Task 10); `appOnboardingService.status` (Task 5); `earningsService.list`, `strategyService.positions`, `bankAccountService.getActive`.
- Produces:

```ts
positionService.costKobo(userId: string, stockId: string): Promise<bigint | null>; // Σ open lots floor(costUsdc × fxRateKobo / 1_000_000); null if any open lot has no fxRateKobo
export type AppHoldingDto = AppStockRefDto & { shares_micro: string; on_hold_shares_micro: string; value_kobo: string | null; price_status: AppPriceStatus; price_as_of: string | null; cost_kobo: string | null; return_kobo: string | null; return_bps: number | null; trading: AppTrading };
export type AppActionItemDto = { kind: "finish_setup" | "finish_transfer" | "choose_earnings" | "add_bank_account" | "renew_automation"; title: string; detail: string; link: string };
export type AppHomeDto = {
  greeting_name: string | null;
  total_kobo: string | null; total_status: "ok" | "partial" | "unavailable"; as_of: string;
  change_24h_kobo: string | null;
  cash: AppCashDto; invested_kobo: string | null; earn_kobo: string | null;
  earnings: { this_week_kobo: string | null; next_payout_on: string; choice: "payout" | "reinvest" | "unset" };
  holdings: AppHoldingDto[]; open_orders: AppOrderDto[]; action_items: AppActionItemDto[]; beta: AppBetaDto;
};
appHoldingsService.list(userId: string): Promise<AppHoldingDto[]>;
appHomeService.get(userId: string): Promise<AppHomeDto>;
```

**Rules:**
- **Holdings:** every customer-network stock with an owned or reserved quantity above 0, paused and delisted included, valued on the total quantity with `displayValue` at the payout rate. `return_kobo = value − cost` and `return_bps = return × 10,000 / cost`, both `null` when either side is null.
- **Home totals:**
  - `invested` is the sum of holding values;
  - `earn` is the sum of active strategy positions' `value_usdc` converted to kobo;
  - `total` is available + on hold + invested + earn, counting only non-null values;
  - `total_status` is `unavailable` without rates, `partial` when any holding or position value is null, otherwise `ok`.
- **24-hour change:** for each current holding, `value now − value at priceBefore(now − 24 h)`; `null` if any is missing.
- **Payouts:** `next_payout_on` is the next Friday's Lagos date (`YYYY-MM-DD`), using `jobs/schedule.ts` helpers.
- **Home lists:** `holdings` is the top 5 by value; `open_orders` are orders in `waiting_for_payment`, `waiting_for_price` or `executing`.
- **Action items (exact):**

  | Kind | When | Title | Detail | Link |
  | --- | --- | --- | --- | --- |
  | `finish_setup` | onboarding incomplete | Finish setting up | {n} steps left | `/setup` |
  | `finish_transfer` | per `waiting_for_payment` order | Finish your transfer | Send {amount} to buy {name}. | `/orders/{id}` |
  | `choose_earnings` | this week's earnings > 0 and choice `unset` | Choose what happens to your earnings | Get paid on Fridays or reinvest. | `/earnings` |
  | `add_bank_account` | available ≥ 200,000 kobo and no bank account | Add your bank account | So you can withdraw your money. | `/settings/bank` |

| Route | Middlewares | Data |
| --- | --- | --- |
| `GET /api/v1/app/holdings` | auth | `AppHoldingDto[]` |
| `GET /api/v1/app/home` | auth | `AppHomeDto` |

- [ ] **Step 1: Write `tests/app/home.test.ts`**

```ts
it("values a holding at its last known price, marked delayed", async () => {
  // holding with a 3-day-old reference → value_kobo not null, price_status "delayed", price_as_of set; total_status "ok"
});
it("never shows an unknown value as zero", async () => {
  const home = (await callAppRoute(homeGET, { method: "GET", url: `${ORIGIN}/api/v1/app/home`, cookie })).json.data as AppHomeDto;
  const unpriced = home.holdings.find((h) => h.stock_id === unpricedStock.id)!;
  expect(unpriced.value_kobo).toBeNull();
  expect(home.total_status).toBe("partial");
  expect(BigInt(home.total_kobo!)).toBe(BigInt(home.cash.available_kobo!) + BigInt(home.cash.on_hold_kobo!) + sumOfPricedHoldings);
});
it("computes naira cost and return from each lot's purchase rate", async () => {
  // lot costUsdc 12_500_000 at fxRateKobo 160_000 → cost_kobo "2000000"
});
it("shows and clears action items", async () => { /* finish_transfer appears with a waiting_for_payment order and disappears after cancel */ });
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: add customer holdings and the home summary"`

### Task 13: Earn and earnings

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117080000_onchain_reinvest`), `src/backend/services/earnings/batch.ts`, `src/backend/services/earnings/index.ts`, `src/backend/services/app/catalog.ts` (`earn_product_id`)
- Create: `src/backend/content/earn-products.ts`, `src/backend/services/app/earn.ts`, `src/backend/services/app/earnings.ts`, `src/backend/validators/app/earn.validator.ts`, routes below
- Test: `tests/app/earn.test.ts`, `tests/integration/onchain-reinvest.test.ts`

**Interfaces:**
- Consumes: `strategyService.list/quote/confirm/positions`, `authorizationService.create/findStanding/revoke`, `earningsService.list/setPreference/harvest`, `investmentService` (Task 11's `purpose` option), `agreementService` (Task 5), `appCatalogService` (Task 8).
- Produces:

```prisma
// Earning and EarningAllocation each gain: reinvestInvestmentId String?
```

```ts
export function earnProductCopy(stockName: string): { title: string; summary: string; how_it_works: [string, string, string]; risks: [string, string, string] };
export type AppEarnPositionDto = { id: string; status: "processing" | "active" | "withdrawing" | "withdrawn" | "action_needed"; added_kobo: string | null; value_kobo: string | null; earned_kobo: string; joined_at: string };
export type AppEarnProductDto = { id: string; stock: AppStockRefDto; title: string; summary: string; how_it_works: string[]; risks: string[]; minimum_kobo: string; available: boolean; position: AppEarnPositionDto | null; documents: ["earn-risks"] };
export type AppEarnPreviewDto = { preview_id: string; product_id: string; you_add_kobo: string; split: { shares_micro: string; cash_kobo: string }; fees: { label: string; kobo: string | null; note: string | null }[]; expires_at: string; automation: string; risk_document: { slug: "earn-risks"; version: string } };
export type AppEarnWithdrawPreviewDto = { preview_id: string; position_id: string; you_get: { shares_micro: string; cash_kobo: string }; value_kobo: string | null; expires_at: string };
export type AppEarningsDto = { total_earned_kobo: string; this_week_kobo: string; choice: "payout" | "reinvest" | "unset"; reinvest_stock: AppStockRefDto | null; next_payout_on: string; minimum_payout_kobo: string; limits: string[]; weeks: { week_of: string; earned_kobo: string; outcome: "pending" | "paid" | "reinvested" | "rolled_over" | "mixed"; detail: string }[] };
appEarnService.products(userId: string): Promise<AppEarnProductDto[]>;
appEarnService.product(userId: string, id: string): Promise<AppEarnProductDto>;
appEarnService.productIdForStock(stockId: string): Promise<string | null>;
appEarnService.preview(userId: string, id: string, amountKobo: bigint): Promise<AppEarnPreviewDto>;
appEarnService.join(userId: string, id: string, i: { previewId: string; pin: string; acceptedRiskVersion: string }, clientKey: string): Promise<{ dto: AppEarnPositionDto; created: boolean }>;
appEarnService.withdrawPreview(userId: string, positionId: string): Promise<AppEarnWithdrawPreviewDto>;
appEarnService.withdraw(userId: string, positionId: string, i: { previewId: string; pin: string }, clientKey: string): Promise<{ dto: AppEarnPositionDto; created: boolean }>;
appEarningsService.summary(userId: string): Promise<AppEarningsDto>;
appEarningsService.setPreference(userId: string, i: { choice: "payout" | "reinvest"; stockId: string | null; pin: string }): Promise<AppEarningsDto>;
```

**Copy (exact; `{s}` is the stock's profile name):**
- **Title:** "Earn from {s} trading fees".
- **Summary:** "Add money to a trading pool for {s} shares and earn a share of the fees each time people trade."
- **How it works:**
  - "We split your money into {s} shares and cash and add both to a trading pool."
  - "Every trade in the pool pays a small fee. Your share of the fees is collected every week."
  - "Withdraw any time. You get back shares and cash in whatever mix the pool holds then."
- **Risks:**
  - "You can get back less than you put in if the price of {s} moves a lot."
  - "Fees are not guaranteed. Quiet weeks can earn nothing."
  - "During the beta, fees come mostly from test trading and have no real value."
- **Automation:** "We'll collect your fees every Thursday night and add them to your earnings. You can turn this off in Settings."
- **Limits:**
  - "Converting your earnings to naira costs at most 1%."
  - "The exchange rate spread is at most 2%."
  - "Payouts of ₦2,000 or more go out every Friday. Smaller amounts roll over."

**Rules:**
- **Products:** strategies that are `enabled && !experimental && !permanentLock`, on the customer network, whose `provenance.stockId` stock is in the catalog. The network is `provenance.chainId ?? parseAssetKey(inputAssets[0]).chainId`. `available` is whether that stock's trading is `available`, and `minimum_kobo` is `"500000"`.
- **Preview:** a strategy quote with `{ strategyId, action: "enter", budgetInputRaw: ngnToUsd(amount, depositRate, "floor") }`.
- **Join:**
  1. Replay by key `app-earn:${userId}:${clientKey}`, the same way as orders.
  2. Check `assertReady("earn")`. When `acceptedRiskVersion` equals the current `earn-risks` version, record the acceptance first; otherwise throw `AGREEMENT_OUTDATED`.
  3. Run `verifyPin`.
  4. Create a one-time consent with `quote_kind: "strategy"`.
  5. Call `strategyService.confirm`.
  6. Unless an active one exists for the strategy, create the standing automation consent `{ actions: ["claim", "reward_conversion"], stock_ids: [stockId], strategy_ids: [strategyId], max_action_ngn: 50_000_000n, max_total_ngn: 2_000_000_000n, max_fee_bps: 100, max_slippage_bps: 100, expires_at: now + 30 d, policy_version: policy.app.policyVersion, disclosure_version: earn-risks version }`.
- **Withdraw:** an exit quote, a one-time consent and the PIN.
- **Position status:** a pending operation is `processing`; `active` is `active`; a pending exit is `withdrawing`; `exited` is `withdrawn`; `needs_review` is `action_needed`. `earned_kobo` sums the position's recognized receipts.
- **Preference:** `setPreference` runs `verifyPin`, then calls `earningsService.setPreference` with the defaults in Global Constraints. Choosing `reinvest` revokes any earlier reinvest consent and creates a standing `reinvest` consent for the stock (same caps and expiry as the automation).
- **Week outcomes:**

  | Week status | Outcome | Detail |
  | --- | --- | --- |
  | `pending`, current week | pending | Pays out on Friday |
  | `pending`, earlier week | rolled_over | Below ₦2,000, so it rolls over |
  | `paid` | paid | Paid to your bank |
  | `reinvested` | reinvested | Reinvested in {s} |
  | `mixed` | mixed | Partly paid, partly reinvested |

- **Reinvest fix in `batch.ts`:** when the reinvest stock has `networkId !== null`:
  1. Find `authorizationService.findStanding(userId, "reinvest", { stockId })`. With none, count `skipped.needs_consent` and continue.
  2. Otherwise run `investmentService.quote({ stockId, side: "buy", inputRaw: candidate.total })` and `confirm(…, "reinvest:" + userId + ":" + week, { standingAction: "reinvest", purpose: "reinvest" })`.
  3. Set `reinvestInvestmentId` on the earnings and allocations.

  `earningsService.list` counts reinvested amounts for linked investments that are `filled` or `partial`. Sim-stock reinvest is unchanged.

| Route | Middlewares | Body | Data |
| --- | --- | --- | --- |
| `GET /api/v1/app/earn` | auth | — | `AppEarnProductDto[]` |
| `GET /api/v1/app/earn/[id]` | auth, path | — | `AppEarnProductDto` |
| `POST /api/v1/app/earn/[id]/preview` | auth, origin, path, body | `{ amount_kobo }` (≥ 500000) | `AppEarnPreviewDto` |
| `POST /api/v1/app/earn/[id]/join` | auth, origin, path, body, idempotency | `{ preview_id, pin, accepted_risk_version }` | `AppEarnPositionDto` |
| `POST /api/v1/app/earn/positions/[id]/withdraw/preview` | auth, origin, path | — | `AppEarnWithdrawPreviewDto` |
| `POST /api/v1/app/earn/positions/[id]/withdraw` | auth, origin, path, body, idempotency | `{ preview_id, pin }` | `AppEarnPositionDto` |
| `GET /api/v1/app/earnings` | auth | — | `AppEarningsDto` |
| `PUT /api/v1/app/earnings/preference` | auth, origin, body | `{ choice, stock_id?, pin }` | `AppEarningsDto` |

- [ ] **Step 1: Write the tests**

```ts
// tests/app/earn.test.ts
it("never offers experimental or locked strategies", async () => { /* create both as fixtures → absent from GET /app/earn */ });
it("needs the Earn risk document and the PIN", async () => { /* stale accepted_risk_version → DOCUMENT_UPDATED; wrong PIN → PIN_INCORRECT */ });
it("joins once and sets up weekly collection", async () => {
  // join → one strategy operation; one standing consent with actions ["claim","reward_conversion"]; a second join reuses that consent
  // earningsService.harvest(currentWeek) → recorded 1
});
it("withdraws a position", async () => { /* withdraw preview + PIN → status "withdrawing" → drainJobs → "withdrawn" */ });
it("sets the earnings choice with limits in words", async () => { /* PUT reinvest → choice "reinvest"; one standing reinvest consent; limits has 3 lines */ });
// tests/integration/onchain-reinvest.test.ts
it("reinvests onchain earnings through the investment pipeline", async () => { /* batch → Investment with purpose "reinvest"; allocation.reinvestInvestmentId set */ });
it("skips onchain reinvest without consent", async () => { /* no reinvest consent → skipped.needs_consent 1, no investment */ });
```

- [ ] **Step 2: Implement** as specified, and set `earn_product_id` in catalog detail through `appEarnService.productIdForStock`.

- [ ] **Step 3: Commit** — `git commit -m "feat: add customer Earn products, earnings and onchain reinvest"`

### Task 14: Activity

**Files:**
- Create: `src/backend/services/app/activity.ts`, `src/backend/validators/app/activity.validator.ts`, `src/app/api/v1/app/activity/route.ts`, `src/app/api/v1/app/activity/[id]/route.ts`
- Test: `tests/app/activity.test.ts`

**Interfaces:**
- Consumes: `depositProgress`, `withdrawalProgress` (Task 9); `orderView` (Task 10); Task 13's position status mapping and week outcomes; `customerReference` (Task 1).
- Produces:

```ts
export type AppActivityKind = "add_money" | "withdrawal" | "buy" | "sell" | "earn_join" | "earn_withdraw" | "earnings" | "earnings_payout" | "reinvest";
export type AppActivityItemDto = { id: string; kind: AppActivityKind; title: string; subtitle: string; amount_kobo: string | null; direction: "in" | "out" | "none"; status: AppProgress; occurred_at: string; reference: string };
export type AppActivityDetailDto = AppActivityItemDto & { lines: { label: string; value: string }[]; timeline: { label: string; done: boolean; at: string | null }[]; bank: AppBankAccountDto | null; bank_reference: string | null };
export type AppActivityPageDto = { items: AppActivityItemDto[]; next_cursor: string | null };
appActivityService.list(userId: string, i: { cursor?: string; limit?: number }): Promise<AppActivityPageDto>; // limit 20
appActivityService.get(userId: string, id: string): Promise<AppActivityDetailDto>;
```

**Sources:**

| Kind | Id | Source | Direction |
| --- | --- | --- | --- |
| `add_money` | `dep_<id>` | Deposit ramp orders not referenced by a `CustomerOrder.depositOrderId` | in |
| `withdrawal` | `wd_<id>` | Withdrawal ramp orders | out |
| `earnings_payout` | `pay_<id>` | Earnings payout ramp orders | out |
| `buy`, `sell` | `ord_<id>` | Customer orders | buy out, sell in |
| `reinvest` | `inv_<id>` | Investments with purpose `reinvest` | none |
| `earn_join`, `earn_withdraw` | `eop_<id>` | Strategy operations with action `enter` or `exit` | out / in |
| `earnings` | `wk_<YYYY-MM-DD>` | Weeks with earnings above 0; occurs at the week's Sunday 23:59:59 Lagos | in |

Claims and conversions are not listed.

**Cursor:** base64url of `JSON.stringify([occurredAtIso, id])`. Each source takes `limit + 1` rows older than the cursor (ties broken by id, descending). Results are merged, sorted and cut to `limit`.

**Amounts:** `add_money` and `withdrawal` use `ngnAmount`; buys use `amountKobo`; sells use `settledKobo`; other kinds use USD amounts at the payout rate.

**Detail line labels:**

| Kind | Lines |
| --- | --- |
| `add_money` | Amount; Bank transfer fee; Added to your cash |
| `withdrawal` | Amount; Fee; You receive; To |
| `buy` | Amount; Shares; Price per share; then each fee line |
| `sell` | Shares sold; Price per share; You received |
| `earn_join` | Added; Shares; Cash |
| `earnings` | Earned; What happened |

- [ ] **Step 1: Write `tests/app/activity.test.ts`**

```ts
it("lists a customer's money events newest first in plain words", async () => { /* add money, buy, withdraw → kinds ["withdrawal","buy","add_money"] */ });
it("shows a transfer made for an order only inside that order", async () => { /* bank-transfer order → one "buy" item, no "add_money" */ });
it("pages without duplicates", async () => {
  // 25 items → page 1 has 20 and next_cursor; a new item created before page 2 doesn't appear on it; page 2 has 5; no repeated ids
});
it("hides another customer's activity", async () => { /* GET detail for another user's id → NOT_FOUND */ });
it("describes a failed buy without internal words", async () => { /* failed order item: status "failed", title "Order didn't go through"; leak check passes */ });
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: add the customer activity feed"`

### Task 15: Notifications and live updates

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117090000_notifications`), `src/backend/services/earnings/index.ts` (emit `earning.recognized` in `recognize`), `src/app/api/v1/events/route.ts`, `src/backend/services/app/session.ts`, `src/backend/services/jobs/types.ts`, `src/backend/services/jobs/schedule.ts`, `src/backend/workers/handlers.ts`
- Create: `src/backend/services/notifications/index.ts`, `src/backend/services/app/inbox.ts`, `src/backend/services/app/events.ts`, `src/backend/services/events/stream.ts`, routes below
- Test: `tests/app/notifications.test.ts`

**Interfaces:**
- Produces:

```prisma
model Notification {
    id        String    @id @default(cuid())
    userId    String
    kind      String
    title     String
    body      String
    link      String
    dedupeKey String    @unique
    readAt    DateTime?
    createdAt DateTime  @default(now())

    @@index([userId, createdAt])
    @@map("notifications")
}
model ProjectionCursor {
    name     String @id
    position BigInt
    @@map("projection_cursors")
}
```

```ts
notificationProjector.run(): Promise<{ processed: number; created: number }>;
export function notificationFor(event: UserEvent, subject: NotificationSubject): { kind: string; title: string; body: string; link: string } | null;
export type AppNotificationDto = { id: string; kind: string; title: string; body: string; link: string; read: boolean; created_at: string };
appInboxService.list(userId: string, cursor?: string): Promise<{ items: AppNotificationDto[]; next_cursor: string | null }>; // 20 per page
appInboxService.markRead(userId: string, i: { ids?: string[]; all?: boolean }): Promise<{ unread: number }>;
appInboxService.unreadCount(userId: string): Promise<number>;
export function customerAreasFor(type: string): string[];
export function eventStream(o: { userId: string; cursor: bigint; sessionToken: string; signal: AbortSignal; map: (e: UserEventDto) => { event: string; data: unknown } | null }): ReadableStream<Uint8Array>;
// signed-in AppSessionDto gains unread_notifications: number
// JobKind gains "notifications.project" (every policy.app.notificationsSlotSeconds)
```

**Mapping (exact):** `{amount}`, `{net}` and `{shares}` are formatted; `{name}` is the profile name.

| Event | Condition | Kind | Title | Body | Link |
| --- | --- | --- | --- | --- | --- |
| `order.updated` | deposit `settled`, not order-linked | money_added | Money added | {amount} is in your cash. | `/cash` |
| `order.updated` | deposit `expired`, not order-linked | transfer_closed | Transfer window closed | We didn't receive {amount}. Nothing was charged. | `/cash` |
| `order.updated` | deposit `refunded` | transfer_returned | Transfer returned | We sent {amount} back to the account it came from. | `/cash` |
| `order.updated` | withdrawal `paid` | money_sent | Money sent | {net} is on its way to {bank} ••{last4}. | `/activity/wd_{id}` |
| `order.updated` | earnings payout `paid` | earnings_paid | Your earnings were paid | {net} is on its way to {bank} ••{last4}. | `/earnings` |
| `order.updated` | withdrawal or payout `reversed` | withdrawal_returned | Withdrawal returned | Your bank couldn't accept {amount}. It's back in your cash. | `/cash` |
| `customer_order.updated` | `completed` | order_completed | Bought {name} / Sold {name} | {shares} for {amount}. | `/orders/{id}` |
| `customer_order.updated` | `failed` | order_failed | Order didn't go through | buy: Your money is back in your cash. sell: Your shares are still yours. | `/orders/{id}` |
| `customer_order.updated` | `waiting_for_price` | order_waiting | We'll buy when prices update / We'll sell when prices update | Your {name} order goes through at the next price update. | `/orders/{id}` |
| `customer_order.updated` | `expired` | order_expired | Order expired | buy: Your money is in your cash. sell: Your shares are still yours. | `/orders/{id}` |
| `investment.updated` | purpose `reinvest`, `filled` | reinvested | Earnings reinvested | {amount} went into {name}. | `/earnings` |
| `strategy.position.updated` | `active` | earn_joined | You're earning from {name} | We'll collect your fees every week. | `/earn/{productId}` |
| `strategy.position.updated` | `exited` | earn_withdrawn | Earn withdrawal complete | Your {name} shares and cash are back in your account. | `/earn/{productId}` |
| `earning.recognized` | amount > 0 | earned | You earned {amount} | From {name} trading fees. | `/earnings` |

Every other event, including `investment.updated` for customer orders and conversions, produces nothing.

**Projector:**
- takes `pg_try_advisory_lock(72_101)`;
- reads up to 500 events after cursor `"notifications"`, ordered by `seq`;
- inserts with `createMany({ skipDuplicates: true })` using `dedupeKey = type + ":" + subjectId + ":" + status`;
- emits a `notification.created` user event per new row and advances the cursor, all in one transaction;
- ignores `notification.created` events.

**Areas:**

| Event type | Areas |
| --- | --- |
| `order.updated` | home, cash, activity |
| `customer_order.updated` | home, orders, activity |
| `investment.updated` | home, holdings, activity |
| `strategy.*` | home, earn, activity |
| `earning.recognized` | home, earnings |
| `notification.created` | notifications |
| anything else | none (not sent) |

**Stream:** the frame is `id: <seq>\nevent: changed\ndata: {"areas":[…]}\n\n`. `eventStream` keeps the existing loop: 2 s polling, 15 s heartbeat, 300 s maximum, and it stops when the session ends. `GET /api/v1/events` keeps its current frames through an identity `map`.

| Route | Middlewares | Body / query | Data |
| --- | --- | --- | --- |
| `GET /api/v1/app/notifications` | auth, query | `{ cursor? }` | `{ items, next_cursor }` |
| `POST /api/v1/app/notifications/read` | auth, origin, body | exactly one of `{ ids: string[] (1–100) }` or `{ all: true }` | `{ unread: number }` |
| `GET /api/v1/app/events` | auth, query | `{ after? }` | SSE |

- [ ] **Step 1: Write `tests/app/notifications.test.ts`**

```ts
it("turns a customer's events into notifications once", async () => {
  // add money → buy → run the projector twice → kinds include "money_added" and "order_completed"; the second run creates 0
});
it("never notifies another customer", async () => { /* two users, events for A → B's inbox is empty */ });
it("marks notifications read and counts unread in the session", async () => { /* read all → unread 0; GET session unread_notifications 0 */ });
it("streams changed areas without internal names", async () => {
  // open GET /api/v1/app/events with an AbortController, emit order.updated, read the first frame:
  // contains "event: changed" and "areas", does not contain "order.updated"
});
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: add customer notifications and live update stream"`

### Task 16: Automations, profile and settings

**Files:**
- Modify: `prisma/schema.prisma` (+ migration `20261117100000_customer_profile`), `src/backend/services/app/home.ts`, `src/backend/services/app/session.ts`
- Create: `src/backend/services/app/automations.ts`, `src/backend/services/app/profile.ts`, `src/backend/validators/app/settings.validator.ts`, routes below
- Test: `tests/app/settings.test.ts`

**Interfaces:**
- Produces:

```prisma
// User gains: preferredName String?
```

```ts
export type AppAutomationDto = { id: string; title: string; detail: string; active: boolean; expires_at: string; needs_renewal: boolean };
appAutomationsService.list(userId: string): Promise<AppAutomationDto[]>;          // standing consents, excluding order_buy / order_sell
appAutomationsService.revoke(userId: string, id: string): Promise<AppAutomationDto>; // no PIN: turning off is always allowed
appAutomationsService.renew(userId: string, id: string, pin: string): Promise<AppAutomationDto>;
export type AppProfileDto = { first_name: string | null; preferred_name: string | null; email: string | null; identity: { verified: boolean; level: "standard" | "higher" | null }; bank_account: AppBankAccountDto | null };
appProfileService.get(userId: string): Promise<AppProfileDto>;
appProfileService.update(userId: string, i: { preferredName: string | null }): Promise<AppProfileDto>;
// signed-in AppSessionDto.customer gains display_name: string | null (preferred_name ?? first_name); AppHomeDto.greeting_name uses it
```

**Rules:**
- **Automation titles:**

  | Consent | Title | Detail |
  | --- | --- | --- |
  | claim + reward_conversion | Collect your {s} Earn fees | Every Thursday night. Fees are added to your earnings. |
  | reinvest | Reinvest your earnings in {s} | Every Friday. |
  | anything else | Automatic action | (empty) |

- **Activity and renewal:** `active` means not revoked and not expired. `needs_renewal` means active and expiring within 5 days.
- **Renew:** `verifyPin`, then a new standing consent with the same scope and caps, expiring in 30 days, and the old one revoked.
- **Home:** gains the action item `renew_automation` with title "Keep your automatic actions on", detail "Renew before {date}." and link `/settings/automations`, shown when any automation needs renewal.
- **Profile:** `email` is the customer's sign-in email; no phone is shown or stored. `level` is `higher` for tier 2, `standard` for tier 1, otherwise `null`. `preferred_name` must match `/^[A-Za-z][A-Za-z' -]{0,39}$/` or be `null`.

| Route | Middlewares | Body | Data |
| --- | --- | --- | --- |
| `GET /api/v1/app/automations` | auth | — | `AppAutomationDto[]` |
| `DELETE /api/v1/app/automations/[id]` | auth, origin, path | — | `AppAutomationDto` |
| `POST /api/v1/app/automations/[id]/renew` | auth, origin, path, body | `{ pin }` | `AppAutomationDto` |
| `GET /api/v1/app/profile` | auth | — | `AppProfileDto` |
| `PATCH /api/v1/app/profile` | auth, origin, body | `{ preferred_name: string \| null }` | `AppProfileDto` |

- [ ] **Step 1: Write `tests/app/settings.test.ts`**

```ts
it("lists automations without order consents", async () => { /* after an Earn join and a waiting order → one automation */ });
it("stops weekly collection when turned off", async () => { /* revoke → earningsService.harvest(week) → recorded 0 */ });
it("renews with the PIN and flags renewal five days ahead", async () => {
  // setNow(+26 d) → needs_renewal true and the home action "renew_automation"; renew → new id, later expiry; old revoked
});
it("shows the sign-in email and validates the preferred name", async () => { /* email "ada@v3st.test"; "Ada" ok; "Ada2" → CHECK_DETAILS */ });
```

- [ ] **Step 2: Implement** as specified.

- [ ] **Step 3: Commit** — `git commit -m "feat: add customer automations, profile and settings"`

### Task 17: Customer journey, guards, documentation and the final gate

**Files:**
- Create: `tests/app/customer-journey.test.ts`, `tests/app/routes-guard.test.ts`, `docs/api/customer-app.md`, `scripts/sepolia-customer-smoke.ts`
- Modify: `package.json`, `Design.md`, `README.md`, `BACKEND_PATTERNS.md`, `FRONTEND_PATTERNS_GUIDE.md`, `docs/runbooks/onchain-beta.md`, `docs/decisions/onchain-providers.md`, `docs/implementation-review.md`

- [ ] **Step 1: Write the journey test.** It runs on the local test chain through `/api/v1/app/*` routes only, plus `drainJobs` and `setNow`. Every response goes through `callAppRoute`.
  1. Sign in with simulated Privy tokens for `ada@v3st.test`, choose test identity `ada_tier2`, set PIN `1357`, accept the documents, then add a bank account.
  2. Add ₦50,000 and complete the beta transfer.
  3. Buy ₦20,000 now; the order completes. Sell ₦5,000; that order completes too.
  4. Make the price stale, place a ₦5,000 buy (it waits), refresh the price, and the buy completes.
  5. Join Earn with ₦10,000.
  6. Move to Thursday 22:00 Lagos and drain the jobs.
  7. Set the earnings choice to payout.
  8. Move to Friday 08:00 Lagos and drain the jobs. The week is `paid` if it reached ₦2,000, otherwise `rolled_over`; assert whichever the fixture produces.
  9. Withdraw ₦5,000; it reaches `paid`.
  10. Check that activity includes `add_money`, `buy`, `sell`, `earn_join` and `withdrawal`, and that notifications include `money_added`, `order_completed`, `earn_joined` and `money_sent`.

- [ ] **Step 2: Write `tests/app/routes-guard.test.ts`.** Read every `src/app/api/v1/app/**/route.ts` and assert that each file calls `withMiddleware` with `audience: "customer"`. Assert that every route whose validator has a `pin` field calls a service method that runs `securityService.verifyPin`, by reading the service source for `verifyPin(` inside the method the route calls.

- [ ] **Step 3: Write `scripts/sepolia-customer-smoke.ts`** (add `"sepolia:customer-smoke"`). It requires `SEPOLIA_LIVE=1` and `APP_CUSTOMER_CHAIN=basesepolia`, and calls the customer services directly:
  1. Create the customer with `authService.signInWithPrivy` from a `PrivyLogin` built in the script (`smoke@v3st.test`, a fresh session ID), then verify identity, set the PIN and accept the documents.
  2. Add ₦20,000 and complete the beta transfer.
  3. Wait for funding, preview a ₦10,000 buy of the first available stock and place it.
  4. Poll until the order is final.
  5. Print the order DTO and run `findCustomerLeaks` on it.

  It exits non-zero unless the order completes and the leak check is empty.

- [ ] **Step 4: Update the documentation.**
  - **`docs/api/customer-app.md`:** every customer route, the DTO conventions, the customer error codes and copy, the vocabulary rule, the beta affordances, and the app paths used in links (`/setup`, `/cash`, `/orders/{id}`, `/earnings`, `/earn/{id}`, `/settings/bank`, `/settings/automations`, `/activity/{id}`).
  - **`Design.md`:** a status row for the customer API, the customer network, Base Sepolia cash rails, and the new freshness and keeper rules.
  - **`README.md`:** `APP_CUSTOMER_CHAIN`, `PRIVY_MODE`, `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, `PRIVY_BETA_ALLOWLIST`, `BASE_SEPOLIA_KEEPER_PRIVATE_KEY`, `yarn sepolia:treasury` and `yarn sepolia:customer-smoke`.
  - **`docs/api/customer-app.md` Privy section:** the frontend contract from Task 2. It also covers Privy development app setup:
    - email login only;
    - identity tokens on;
    - test accounts on;
    - embedded wallets off;
    - allowed domains;
    - Privy's own allowlist kept in step with `PRIVY_BETA_ALLOWLIST`;
    - the note that allowlisted testers receive real sign-in emails from Privy.
  - **`BACKEND_PATTERNS.md`:** the `audience: "customer"` option (§5), the customer layer location, and a rule that customer DTOs pass the vocabulary rule (§15).
  - **`FRONTEND_PATTERNS_GUIDE.md` (§8, §11):** customer screens read through `src/backend/services/app/*` via service-backed server wrappers and mutate through `/api/v1/app/*`; customer errors are already display copy.
  - **`docs/runbooks/onchain-beta.md`:** keeper setup and funding, treasury top-ups, the 2-hour Base Sepolia freshness window, and a note that testnet Earn fees come mostly from keeper trades.
  - **`docs/decisions/onchain-providers.md`:** record the `basesepolia` trading window of 7,200 s and the 300 bps band, set on 2026-11-17 by this plan and pending operator confirmation.

- [ ] **Step 5: Run the full gate once.**

  Run: `bash scripts/setup-cloud.sh && yarn prisma validate && yarn prisma generate && yarn test:contracts && yarn test && yarn lint && yarn typecheck && yarn build`

  Expected: everything passes with no Base Sepolia variables set. Fix failures and rerun only the affected command. Record the actual results under "Customer app backend (2026-11)" in `docs/implementation-review.md`.

- [ ] **Step 6: Live check (operator, needs keys).**

  Run: `yarn sepolia:deploy && yarn seed:beta && SEPOLIA_LIVE=1 APP_CUSTOMER_CHAIN=basesepolia yarn sepolia:customer-smoke`

  Expected: a completed order DTO, an empty leak list and exit code 0. Record the output in the same review section.

- [ ] **Step 7: Commit** — `git commit -m "test: verify the customer journey and document the customer API"`

## Out of scope, with the reason

| Item | Reason |
| --- | --- |
| Customer screens, navigation and the logos under `public/stocks/` | The companion frontend plan, built on this API |
| SMS sign-in; V3ST-sent SMS, email or push; real BVN or KYC | Operator chose email codes; beta forbids V3ST-sent messages and real identity data |
| Storing customer phone numbers | Operator instruction: sign-in is by email and no phone is kept |
| Privy embedded wallets or server signing | Privy proves identity only; custody stays with V3ST's test accounts |
| A permanent bank account number per customer | Needs Yellow Card virtual accounts, which are unverified in sandbox |
| Recurring investments, price alerts, referrals, account closure, data export | Not needed for the first customer journey |
| Mainnet | Phase B gate unchanged |
| Bankr, Stonks Exchange, BaseStonk, Feel.cash in customer flows | Replicas or experimental only; never shown to customers |
