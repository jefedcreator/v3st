# Onchain implementation review — 2026-11-15

Baseline: `b5eeed0`. Reviewed against the November 14 onchain plan and specification;
their explicit backend/API scope supersedes the older frontend requirements.
All effects remain beta-only, on isolated local test contracts or simulations.

Superpowers execution skills are unavailable in this environment. This review uses
the plan's native checklist, with independent reasoning reviews and final-only gates.

- [x] Read repository guidance, both pattern guides, both plans and the onchain specification.
- [x] Compare delivered schema, services, contracts, routes and tests with the plan.
- [x] Repair execution plan validation, transaction-local observations and recovery.
- [x] Repair exact FIFO performance and reference-basis valuation.
- [x] Repair source receipt accounting and conversion recovery.
- [x] Add onchain reconciliation and deployment-reset containment.
- [x] Complete API/documentation/CI handoff and regression coverage.
- [x] Run setup, Prisma validation/generation, Solidity tests, Vitest, lint, typecheck and build.
- [x] Record actual results, remaining limitations and focused commits.

## Confirmed shortfalls

- Execution plan validation accepts unknown selectors on allowed contracts and does
  not independently bind the prepared plan to its persisted quote.
- Fill observation uses current wallet balance changes, allowing unrelated transfers
  or later operations to contaminate settlement. Reverted operations skip callbacks.
- Relayer nonce allocation ignores previously signed, not yet broadcast operations.
- FIFO realization rejects negative gains, omits partial-sale gains and repeats
  proceeds across lots. Position valuation ignores token-NAV basis and decimals.
- A two-asset fee log loses one receipt to its uniqueness key; receipt recognition
  assumes unknown assets are settlement, and conversion retries create new quotes.
- Naira quotes do not retain their rational FX basis, new lots omit acquisition FX,
  and position reads can present stale reference prices as current values.
- Reconciliation checks only legacy simulated fiat/treasury balances; onchain
  balances, receipt ownership and deployment-reset holds are absent.
- The onchain runbook, final containment suite and CI workflow are missing.

Verification results will be appended only after commands have actually run.

## Delivered repairs

Execution plans now reject unknown/admin calls, bind limits and identity to accepted
quotes, and validate source claims/approval spenders. Signed retries retain their
bytes and separate relayer/account nonces. Expiry, revocation, bytecode/deployment
changes stop new broadcasts. Both successful and reverted receipts wait for finality;
transaction-local transfer logs determine fills. Revert callbacks and partial-fill
settlement run once, and standing total limits include completed spending.

Bank receipts now fund the local execution account through a persisted signed
transfer before cash becomes usable. Local transfer replay is also bounded by a
contract operation identity. The HTTP journey no longer injects an unrelated
customer cash/token balance. Legacy simulations remain separate; ordinary app
orders cannot choose a Bankr managed custody profile implicitly.

FIFO accounting preserves residual basis and signed realized gains across partial
sales and multiple lots. Positions respect decimals, token-NAV versus share-price
basis, reserved inventory and unknown external basis. Paused/delisted assets stay
visible; stale references produce unavailable values. Naira inputs are sized inside
the quote service and retain their rational rate and expiry. Standing caps use that
accepted FX basis, and lots retain the acquisition kobo-per-dollar rate rather than
a later feed value. Strategy exposure applies the multiplier once, rejects stale
inputs for new allocations, serializes each user's allocation checks and retains
the valuation evidence used at confirmation. Later references cannot rewrite its
entry estimate; actual cash/stock movements remain receipt-based. Corporate-action
ingestion requires finality and deployment evidence;
orphaned actions retain source records and recompute the materialized multiplier.

Reward event identity includes the asset, preserving both assets of a fee claim.
Source/beneficiary identity is checked, exit principal excludes separately credited
fees, and receipt lots retain receipt identity. Conversions persist their quote and
recover the original operation after crashes. Unknown assets and unconverted
receipts cannot become USDC earnings. Recognition is queued durably when confirmed
receipts are recorded; confirmed settlement rewards do not require manual service
calls. Sponsor accounting reconciles execution/approval gas after finalization.

Customer confirmation replays validate the payload inside services and use user
namespaces. Expired HTTP confirmations return 409. Strategy quotes accept naira
budgets, and sell quotes accept raw quantities. Added reconciliation checks local
cash/stock/LP ownership at a fixed block, distinguishes in-flight work, holds unknown
work, and pauses rails on discrepancies or failed identity/reads. Operator evidence
uses the active manifest's registered deployment. SSE supports bearer sessions and
cancellation. CI and the [operations runbook](runbooks/onchain-beta.md) are included.

## Plan coverage

The original plan remains a planning record. This audit covers its fifteen tasks
against the delivered backend and the corrective changes in this review:

| Tasks | Reviewed boundary and evidence |
| --- | --- |
| 1–2 | Beta provider policy, six capability/evidence records, exact raw units, immutable journals, schema migrations and operation/receipt identities. Policy, schema and ledger suites remain in the full gate. |
| 3–4 | Local deployment/keystore identity, multiplier events, bounded signing, shared nonces, finality, replay, revocation and sponsor budgets. Solidity and testnet execution suites exercise actual local receipts. |
| 5–8 | Distinct o1, Bankr, Hydrex/Hydropump, Stonks, BaseStonk and Feel replicas. Parser fixtures and provider integration tests cover their separate custody, liquidity and entitlement mechanics. Actual integrations stay disabled. |
| 9–10 | Bank receipt → confirmed local funding → investment, cash reservations, partial fills, FIFO, valuation and performance. HTTP, funding, investment, position and lot regressions cover these repairs. |
| 11–12 | Explicit strategy consent and source receipts, fee/principal separation, conversion recovery, automatic recognition and Friday allocation. Strategy, receipt, earnings, conversion and payout suites cover these boundaries. |
| 13–14 | Wrapped/owned APIs, idempotency, SSE, fixture controls, fixed-block reconciliation, deployment holds and operator evidence. API journeys and reconciliation regressions cover these repairs. |
| 15 | Reproducible setup, CI, containment under optimized runtime settings, complete final gate and operator runbook. Actual command results are recorded below. |

## Verification protocol

Use Node 24.15.0, Yarn 1.22.22, Prisma 6.19.3, viem 2.57.19, Foundry 1.9.0
(commit `6056c5845d34205a83cf7108042adb137325c9df`), solc 0.8.30 and a disposable
PostgreSQL 14.11 instance. The application database configured in the existing local
`.env` was not used. Both the beta and `_test` verification databases were created
on a separate temporary loopback PostgreSQL instance. Tests start a fresh Anvil
31337 without a fork and discard its temporary deployment manifest afterward.

The first gate exposed invalid numeric-underscore SQL on PostgreSQL 14, unread
Anvil pipes, shared chain state, stale Decimal assertions and fixtures that violated
the tightened policy. Its test run was interrupted (exit 130); no passing full-suite
claim is based on that run. These causes were fixed, and failed/affected checks
were rerun. An intermediate full run passed 311/312 tests; its remaining action
fixture had not mined confirmation blocks and was corrected. Final results follow
only after completion of the acceptance commands.

A subsequent full suite passed 313/313. Additional FX/valuation regressions then
exposed an incorrectly shortened deadline tied to the display-rate cache, an
incorrect new-test status assertion and a legacy worker timing failure. Those
results were not treated as the final gate; the implementation and affected
fixtures were corrected, the timing case passed on rerun, and verification continued. The API journey's Thursday
and Friday clocks now follow the isolated chain's week instead of a past date.

## Final verification results

| Command | Final outcome |
| --- | --- |
| `bash scripts/setup-cloud.sh` | Exit 0, pinned Node/Yarn and frozen lockfile installation |
| `yarn prisma validate` | Exit 0 |
| `yarn prisma generate` | Exit 0, platform-generated client remains ignored |
| `yarn test:contracts` | Exit 0, 17 passed across 4 Solidity suites |
| `yarn test` | Exit 0, 318 passed across 60 files; 319.94 seconds including setup |
| `yarn lint` | Exit 0 |
| `yarn typecheck` | Exit 0 after adding wallet rows to the typed lock-table allowlist |
| `yarn build` | Exit 0, optimized Next.js build with beta-only environment |
| `git diff --check` | Exit 0 |

Final full-suite fixture: chain `31337`, network
`testnet:31337:7a766fd7e20b7fd11f91eacd`, deployment
`7a766fd7e20b7fd11f91eacd`, loopback RPC `http://127.0.0.1:31191`.
The affected valuation/API/strategy run independently passed 30/30 tests before
the final full suite. Test teardown removed its ephemeral manifest/keys and node.
The disposable PostgreSQL instance is stopped after verification. Existing
non-blocking Foundry lint warnings and one unused-variable build warning remain;
they do not represent passing external-provider evidence.

Repairs and regression tests are committed in `f197c5d` (`fix: harden beta onchain
execution and source accounting`). The accompanying documentation/CI commit adds
this audit record, the task coverage matrix, API changes and the operator runbook.

All six actual provider integrations remain disabled/unverified, as required by the
plan. Local replica results establish neither commercial provider testnet support
nor partner latency. The backend-only scope and beta/test-funds boundary remain;
no real funds, identity submissions, mainnet work or application deployment is
part of this review.

## Customer app backend (2026-11)

Plan: `docs/superpowers/plans/2026-11-17-v3st-customer-app-backend.md` (tasks 1–17), executed on
`feat/customer-app-backend`. Customer API docs: [docs/api/customer-app.md](api/customer-app.md).

Final gate results (2026-11-17, no Base Sepolia variables set):

- `bash scripts/setup-cloud.sh` — environment note: the sandbox ships Node v22.23.4 while `.nvmrc`
  pins 24.15.0, so the script's version check stops before its remaining steps; `.env` was created
  from `.env.example` and dependencies were already installed.
- `yarn prisma validate` — schema valid. `yarn prisma generate` — done.
  Migrations added: `20261117080000_onchain_reinvest`, `20261117090000_notifications`,
  `20261117100000_customer_profile`.
- `yarn test:contracts` — 17 passed, 0 failed (4 suites).
- `yarn test` — 94 files, 502 tests passed, 0 failed (includes `tests/app/*`: auth, onboarding,
  cash, catalog, home, orders-now, orders-waiting, security, earn, activity, notifications, settings,
  customer-journey, routes-guard).
- `yarn lint` — 0 errors. `yarn typecheck` — 0 errors (the 9 pre-existing errors in scripts/privy/
  wallets/test files were fixed along the way). `yarn build` — done in ~64 s.
- Live check (operator, needs keys): `yarn sepolia:deploy && yarn seed:beta && SEPOLIA_LIVE=1
  APP_CUSTOMER_CHAIN=basesepolia yarn sepolia:customer-smoke` — NOT run in this environment; the smoke
  script `scripts/sepolia-customer-smoke.ts` is in place and guarded by `SEPOLIA_LIVE=1`.

Pending operator live checks (need keys or a browser; not runnable in CI):

- **Privy live sign-in (plan Task 2, step 3) — pending.** Sign in to the Privy development app with
  the test account, pass both tokens to `privyAuth.verifyLogin`, and record that the email is
  `test-XXXX@privy.io`, that `session_id` is non-empty, that it stays the same after
  `getAccessToken()` refreshes and changes after signing out and in again (PIN reset relies on both).
  Runs once the frontend sign-in screen exists.
- **Base Sepolia keeper (plan Task 7, step 3) — pending.** `yarn sepolia:deploy && yarn seed:beta &&
  SEPOLIA_LIVE=1 yarn sepolia:smoke`: one line per stand-in, all `aligned` or `within_band`, exit 0.
- **Customer smoke (plan Task 17, step 6) — pending.** As above; run with `yarn worker` against the
  same database.

### Verification against the plan (2026-11-17, follow-up)

A second pass compared the branch with the plan task by task and fixed these gaps:

- **Customer DTOs** now live in `src/types/app.ts` as the plan's file map requires (services import
  and re-export them), so the frontend can import them without server code.
  `AppSessionDto.onboarding.next_step` is typed as an onboarding step.
- **Bank-transfer buys:** the funding transaction locks the order and records the held budget with
  the hold, so a cancel between the transfer landing and the next executor run releases exactly
  the held cash (before, that window stranded it on hold). The preview refuses what the deposit would
  refuse (deposits paused, over `policy.deposits.maxKobo`, no bank account); a deposit that still
  can't be opened fails the order at once; a waiting-for-payment order with no deposit expires
  at 72 h.
- **Order recovery:** a confirm that is refused (4xx) fails the order instead of leaving it
  "processing" and retrying an expired quote forever; an investment that committed before an error
  surfaced is linked by its key; a waiting order interrupted between "executing" and its investment
  goes back to waiting with its hold (after 5 minutes) or links the investment; linking an investment
  marks the waiting order's hold released (confirm released it in the same transaction).
- **Advisory locks:** the notification projector and the test-pool keeper used session-level
  `pg_try_advisory_lock` through Prisma's pool (the keeper also unlocked on a possibly different
  connection), so after one run they could stop running. Both now take transaction-scoped locks.
- **Keeper:** the 5,000 USD spend cap applies per run across all stand-ins; a swap pool must be a
  manifest `HydrexPool*` entry.
- **Consent keys:** re-joining Earn after turning collection off, or re-choosing reinvest, reused a
  fixed consent key and failed with `TRY_AGAIN` after the money had moved. Keys are now per join /
  per choice; choosing reinvest or payout revokes every earlier reinvest consent; the reinvest stock
  must be in the catalog. Earn join/withdraw replays use `app-earn:*` keys and refuse a different
  preview under the same key.
- **Friday batch:** an onchain reinvest that can't run (stale price, paused stock, consent cap) is
  skipped for that customer instead of aborting everyone's payouts.
- **Catalog and home:** a price older than the 7-day display window shows no number; chart change is
  measured on the naira points; `earn_product_id` comes from `appEarnService.productIdForStock`
  (no Prisma in `src/backend/content/`); home's `invested_kobo` is null when nothing could be valued
  and `this_week_kobo` is `"0"` (not null) when nothing was earned.
- **Copy and rules:** test identity names in display case (Adaeze Obi, Babatunde Adeyemi); `earn`
  readiness needs the PIN; PIN reset reports any token failure as "sign in again" and checks the
  Privy session under the user row lock; activity detail shows the price actually paid, not the 3%
  limit, and accepts `wk_YYYY-MM-DD` ids; completed buys report the filled shares; consent caps and
  windows read `policy.app`.
- **Seed:** the local `testnet` fixture rows get `displayTicker` (the seeded customer catalog was
  empty); v2 strategies are keyed `hydrex-<ticker>-usdc-basesepolia-v2`.
- **Smoke script** adds a name-matched bank account before adding money.
- **Docs:** `docs/api/customer-app.md` now has the exact vocabulary rule, the wire format, the error
  copy table and field messages, the beta sign-in rule and the full Privy frontend contract.

Open question for the operator: deposits need a verified bank account (the transfer comes from the
customer's own account), but the plan's onboarding marks the bank account optional and `add_money`
readiness doesn't require it. Today adding money without one answers `SETUP_REQUIRED` while
onboarding reports `complete`; `tests/helpers/app.ts` `readyCustomer()` adds a bank account to cover
this. Decide whether the bank account becomes a required step, or deposits stop requiring it.

Gate in the follow-up environment: `yarn prisma validate` passed; `yarn typecheck` 0 errors;
`yarn lint` 0 errors (9 pre-existing warnings); DB-free unit tests 19/20 files passed (the 20th,
`tests/unit/hydrex-policy.test.ts`, needs a database). `yarn test`, `yarn test:contracts` and
`yarn build` could not run there: its network blocks Prisma's engine download
(`binaries.prisma.sh`), the Solidity compiler download (`binaries.soliditylang.org`) and Google
Fonts. The follow-up's new and changed tests (orders-now, orders-waiting, earn, catalog, onboarding,
onchain-reinvest) are written but **not yet run**; run the full gate before merging.
