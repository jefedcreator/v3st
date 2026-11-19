# V3ST customer app pages design

Date: 2026-11-19 · Status: approved by the operator 2026-11-19 · Release: beta · Scope: every signed-in customer page, a sign-in link on the landing, and one beta backend route

## Intent

V3ST's customer API (`/api/v1/app/*`) is built and tested, and the public landing page is live. Nothing lets a customer actually use the product: there are no signed-in screens. The [customer app backend design](2026-11-17-v3st-customer-app-backend-design.md) left them to "a separate frontend plan built on this API". This is that design.

Its users are **allowlisted beta testers**: Nigerian first-time investors, on their phones, over several weeks, with test money. They sign in with an email code, set up, add naira, buy and sell US stocks, join and leave Earn, get Friday earnings, withdraw, and read what happened. They should be able to do every job the API supports without help. Every state the API can return should look as honest on screen as it is in the data: waiting looks like waiting, and an unknown value looks unknown.

## Operator decisions (2026-11-19)

| # | Decision |
| --- | --- |
| 1 | **Beta testers first.** Phone-first, with every page in all of its states, not a demo of the happy path. |
| 2 | **Every page does one job.** A job's steps stay on the page or modal that does it; tracking the result is a separate page. |
| 3 | **Sign-in lives at `/signin`.** The landing gets a quiet *Sign in* text link to it, in the header (and its mobile sheet) and in the footer. *Join the waitlist* stays the main action. Confirmed at approval. |
| 4 | **Use modals where necessary to reduce the number of pages.** |
| 5 | **Structure: "Money line"**, locked in Impeccable's surface round (`seed:bc21f5b0c062fffb`). Home is one live line of your money: what is coming sits above *Now*, and what is done sits below it. |
| 6 | **Built by an AI agent** with Impeccable applied. The plan carries every rule the build needs. |

## Goals

- A tester can sign in, finish setup and then do every money job the API supports from a 390px-wide phone. Those jobs are adding money, buying and selling, joining and leaving Earn, choosing what happens to earnings, and withdrawing.
- Every page has one job and every short job is a modal: 13 pages in all.
- Every app path the backend links to (action items, notifications) opens the right page or modal.
- Unknown values show as unknown, never as ₦0. Waiting, delayed, paused and failed states each look distinct.
- No screen shows a crypto word. The API's own error `message` is rendered as it comes.
- The landing's dark world carries over unchanged: same colour tokens, same face. It is held to Operate-mode restraint.

## Non-goals

- Changes to the landing page, `/legal/*` or `/waitlist`, beyond the *Sign in* link (§Landing sign-in link).
- New financial behaviour, provider modes or beta policy. The only backend addition is a beta-labelled helper (§Backend additions).
- Light theme, hide-amounts toggle, toasts, push or email notifications, price alerts, recurring investments, referrals, account closure, data export, and languages other than English.
- A chart or form library. TanStack Query is the one new state library (§Approaches).
- Deployment, live providers, mainnet.

## Anti-goals

These would make the result wrong even if it looked polished:

- A screen asks for a wallet, a signature or gas, or says any word on the vocabulary list.
- A null value renders as ₦0, 0% or an empty chart that looks like a flat price.
- Money moves without the PIN step, or a retry places a second order. Idempotency keys are reused on retry.
- A modal opens on top of another modal.
- The home page reads as a crypto dashboard: glowing tiles, charts everywhere, a wall of numbers.
- The landing's spectacle in the app: no fluid background, no cursor follower, no pinned scroll.

## Constraints

- `AGENTS.md`, `CLAUDE.md`, `BACKEND_PATTERNS.md`, `FRONTEND_PATTERNS_GUIDE.md`, `DESIGN_SYSTEM.md` and `docs/api/customer-app.md` apply.
  - The middleware contract applies to the one new route.
  - No conditional object spreads.
  - A commit per task.
  - Gates run once, at the end.
- Customer screens read through `src/backend/services/app/*` via server wrappers. They mutate only through `/api/v1/app/*`, and their types come from `src/types/app.ts`.
- Browser code never imports `src/backend/**`, `@/env`, `policy.ts`, Prisma or the `@/utils` barrel. Server Components pass plain strings and numbers.
- Money crosses into the browser as integer strings. It is formatted with exact `BigInt` arithmetic and never as floats.
- WCAG 2.2 AA:
  - 44px targets and visible focus;
  - modals that trap and restore focus;
  - live regions for results;
  - text that holds up at 200% zoom;
  - no horizontal scroll at 320–390px.
- `DESIGN.md` means `DESIGN_SYSTEM.md` in this repository. Never create a file named `DESIGN.md`.

## Approaches

### Structure: three dealt in Impeccable's surface round

The visual system was fixed. Seven ways to organise the app were ranked, and the seed dealt three:

- **Money line** (chosen): home is a timeline split by a *Now* marker.
- **In motion**: home leads with in-progress cards on step rails. Rejected: on quiet days its signature disappears.
- **Harvest weeks**: home leads with eight weeks of Friday earnings. Rejected: testers who never join Earn see an empty band.

The chosen sketch is committed at [`assets/2026-11-19-v3st-app-money-line-sketch.html`](assets/2026-11-19-v3st-app-money-line-sketch.html), with a [rendered PNG](assets/2026-11-19-v3st-app-money-line-sketch.png). Where the sketch differs from this design, the design wins: the sketch shows a 24-hour percentage and a payout bank that the API doesn't return. Its direction contract is in `.impeccable/surfaces/src-app-app-layout-tsx.md`.

### Page or modal

1. **A page per job and a modal per step.** Rejected: about 45 routes. Expiring previews and PIN retries would spread across pages.
2. **A page per job, steps inside it.** This was the operator's first answer: about 34 routes.
3. **Pages for places, modals for short jobs** (chosen, after decision 4): 13 pages. The rule below decides each case.

### Client data

1. **TanStack Query over a typed `fetch` client** (chosen).
   - Server Components hand the first read to a query as initial data.
   - The live event stream invalidates queries by area.
   - Mutations get pending and error state.
   - The frontend guide already describes this as V3ST's pattern for authenticated features.
2. **`router.refresh()` on every event and mutation.** Rejected: it re-renders the whole route for every live update and can't hold paginated lists.
3. **Axios with TanStack Query (fluid's stack).** Rejected: same-origin `fetch` already carries the session cookie, so Axios would be an extra dependency for nothing.

## The page and modal rule

- **A page** is a place.
  - It is reached from the tab bar or sidebar, or linked from an action item or a notification.
  - It may track something over time.
  - Every page has one job, stated in its route table row.
- **A modal** is a short job started from a page that goes back to it.
  - It has three steps or fewer.
  - It leaves nothing to track, except through the page it hands off to.
  - Money modals end on a PIN step, then close and go to the tracking page.
- **Never two modals at once.** The PIN is the last step inside the job's modal, never a second modal. A document opened from inside a job shows inline in that step.
- **Every modal is one `Dialog` primitive.**
  - Below 640px it is a bottom sheet: full width, top corners 28px, at most 92dvh tall, scrolling inside, with safe-area padding.
  - From 640px it is a centred dialog, at most 480px wide, with 28px corners.
  - Radix owns the title, description, focus trap, Escape, focus restoration and scroll lock.
  - It opens in 260ms and closes in 170ms ease-out, like the existing Sheet; reduced motion turns this into a fade.
  - Closing before the PIN is confirmed moves no money and asks nothing.
- **Linked modals.**
  - Settings modals open from `/settings?open=<name>`, with `<name>` one of `name`, `bank`, `pin`, `reset-pin`, `devices` or `automations`.
  - Closing one replaces the URL with `/settings`.
  - `/settings/bank` and `/settings/automations`, which the backend links to, redirect there.

## Pages

Three route groups share the root layout:

- `(auth)` holds sign-in, with no chrome.
- `(setup)` holds setup in a flow shell.
- `(app)` holds everything else, inside the app chrome.

| Route | Its one job | Server read | Opens |
| --- | --- | --- | --- |
| `/signin` | Sign in with an email code | none (`next`, `signed-out` params) | — |
| `/setup` | Finish setting up: identity, PIN, documents, bank account, in order | onboarding, test identities, documents, banks | Document |
| `/home` | See where your money stands and what is moving | home, activity (first 10) | Add money |
| `/stocks` | Find a stock | stocks (`q`, `watchlist`) | — |
| `/stocks/[id]` | Understand one stock | stock detail, chart (1D) | Trade (buy or sell), Document |
| `/orders/[id]` | Track one order | order | Cancel order |
| `/cash` | See your naira | cash, bank account | Add money, Withdraw |
| `/earn` | Choose an Earn product | Earn products | — |
| `/earn/[id]` | Understand one Earn product and your position | Earn product | Join Earn, Leave Earn, Document |
| `/earnings` | See what you've earned and what happens on Friday | earnings | Earnings choice |
| `/activity` | Browse your history | activity (first page) | — |
| `/activity/[id]` | Read one receipt; for an unpaid transfer, finish it | activity item; deposit when the item is an unpaid `dep_` | — |
| `/settings` | Manage your account | profile, automations, documents | Name, Bank account, Change PIN, Reset PIN, Devices, Automations, Document |

Redirect-only routes: `/settings/bank` goes to `/settings?open=bank`, and `/settings/automations` goes to `/settings?open=automations`. `/` stays the anonymous landing page and reads no session.

Every backend link resolves to a page:

- `/setup`, `/cash`, `/earnings` and `/earn/{id}`;
- `/orders/{id}`, including the "Finish your transfer" action item;
- `/activity/{id}` for the `dep_`, `wd_`, `pay_`, `ord_`, `inv_`, `eop_` and `wk_` ids;
- `/settings/bank` and `/settings/automations`.

A test asserts this against the services' `link` strings.

## Modals

| Modal | From | Steps | API | Afterwards |
| --- | --- | --- | --- | --- |
| Trade | `/stocks/[id]` (Buy, Sell) | amount (or *Sell all*; a buy chooses cash or bank transfer) → review → PIN | `POST orders/preview`, `POST orders` | go to `/orders/[id]` |
| Add money | `/home`, `/cash` | amount → continue | `POST cash/deposits` | go to `/activity/dep_[id]` (transfer details live there) |
| Withdraw | `/cash` | amount (or *All available*) → review → PIN | `POST withdrawals/preview`, `POST withdrawals` | go to `/activity/wd_[id]` |
| Join Earn | `/earn/[id]` | amount → review → risks and PIN | `POST earn/[id]/preview`, `POST earn/[id]/join` | close; the page shows the position |
| Leave Earn | `/earn/[id]` | review → PIN | `POST earn/positions/[id]/withdraw/preview`, `…/withdraw` | close; the page shows the position |
| Earnings choice | `/earnings` | payout, or reinvest plus a stock → PIN | `PUT earnings/preference` | close |
| Cancel order | `/orders/[id]` | confirm | `DELETE orders/[id]` | close; the order shows cancelled |
| Notifications | the bell, on every app page | list, *Show older*, *Mark all as read* | `GET notifications`, `POST notifications/read` | a row marks itself read, closes and goes to its link |
| Document | setup, stock, Earn, settings | read | `GET documents/[slug]` | close |
| Name | `/settings` | edit | `PATCH profile` | close |
| Bank account | `/settings` | bank, 10-digit number, PIN | `GET banks`, `PUT bank-account` | close |
| Change PIN | `/settings` | current → new → confirm | `PUT security/pin` | close |
| Reset PIN | `/settings`, and *Reset your PIN* on any PIN-locked step | email code (a new sign-in) → new PIN → confirm | Privy or beta tokens, `POST security/pin/reset` | close; other devices signed out |
| Devices | `/settings` | list, sign out one, sign out others | `GET`/`DELETE security/sessions`, `POST …/sign-out-others` | stays open |
| Automations | `/settings` | list, turn off, renew with PIN | `GET automations`, `DELETE automations/[id]`, `POST …/renew` | stays open |

All paths are relative to `/api/v1/app/`. Every money write sends an `Idempotency-Key`. The key is made when the review step opens, reused for every retry of that review, and replaced only when a new preview is fetched.

## Shell

The chrome is mounted by `(app)/layout.tsx`, never by a page (fluid's rule). Only the layout survives navigation, so chrome drawn by pages or `loading.tsx` would remount and drop its state. `loading.tsx` draws the page body only.

- **Phone (below 768px)**
  - A 56px top bar shows the V3ST wordmark and *Beta* chip, linking to `/home`.
  - On its right are the bell (44px, labelled with the unread count) and an initials avatar that goes to `/settings`.
  - A 64px bottom tab bar, plus safe-area inset, has **Home, Stocks, Cash, Earn**. The active tab has heading-colour text, a mint icon and `aria-current="page"`.
  - Content has a 16px gutter and clears the tab bar.
- **Desktop (from 768px)**
  - A 248px left sidebar lists the same four places, plus *Activity* and, at its foot, *Settings*.
  - The bell and avatar sit top right.
  - Content is one column, at most 720px wide.
- **Setup** uses a flow shell: wordmark, *Beta* and *Sign out*.
  - Phones get a "Step 2 of 4 · Set your PIN" line.
  - Desktop gets the step list down the left.
  - There is no tab bar.
- **Sign-in** is a centred 400px column with the wordmark and *Beta*, and no navigation.

On phones, Activity is reached from Home's *See all activity* and from Cash.

## Home: the money line

The first viewport follows the chosen sketch:

1. **Total.**
   - "Total value" sits above the total at 40px, weight 300.
   - Under it come today's change in mint or coral and "Cash ₦… available".
   - Then two pills: *Add money* (filled) and *Invest*, which goes to `/stocks`.
   - Last, one beta line: the API's `beta.notice`.
2. **The line.**
   - A 2px signal spine runs down the left gutter: dashed above the marker, solid below it.
   - The *Now · 14:20* marker is a pill on a hairline, showing Lagos time and refreshed each minute.
   - *Coming up* sits above the marker and *Earlier* below it, with *See all activity* at the end.
3. **Below the fold.**
   - *Your stocks*: holdings rows going to `/stocks/[id]`.
   - An Earn row when the customer has an Earn value.
   - The empty state: "You don't own any stocks yet", with *Find a stock*.

`line-model.ts`, a pure tested module, builds the line from `AppHomeDto`, the first activity page and the current time.

- **Coming up**, from top (furthest) to bottom (nearest *Now*):
  1. The **Friday payout** node. It appears only when the customer has an Earn value or this week's earnings are above zero. It shows `next_payout_on` and this week's amount, then one of three lines by choice:
     - payout: "paid to your bank";
     - reinvest: "reinvested";
     - unset: "Choose what happens to your earnings", going to `/earnings`.
  2. **In progress**:
     - open orders whose status is `waiting_for_payment`, `waiting_for_price` or `processing`;
     - activity items that are `waiting`, `processing` or `action_needed`, skipping `ord_<id>` when that order is already listed.

     They are sorted by deadline, latest first, so the soonest sits nearest *Now*. The deadline is the order's `valid_until` or its transfer's `expires_at`; items with no deadline go last. The "Finish your transfer" action item merges into its order's row.
  3. **Needs you**: the remaining action items in API order: `finish_setup`, `choose_earnings`, `add_bank_account`, `renew_automation`.
- **Earlier**: activity items that are `completed`, `failed` or `cancelled`, newest first, five at most.
- **Nodes.**

  | Status | Node and text |
  | --- | --- |
  | Waiting | Hollow, with a mint halo |
  | Processing | The same halo, slowly pulsing (motion-safe; stops in hidden tabs) |
  | Action needed | Hollow heading-colour ring, with a mint *Needs you* link |
  | Completed | Filled signal |
  | Failed | Coral ring and coral text |
  | Cancelled or expired | Subtle hollow ring |

  The row's text is the API's own `title` and `detail` or `subtitle`.
- **The signature move.** When a live update moves an item from *Coming up* to *Earlier*, it slides across the *Now* marker in 240ms. Under reduced motion it fades in 200ms instead. This is the app's one authored motion moment.
- **Empty states.**
  - With setup unfinished, the line holds only the *Finish setting up* node, and *Earlier* says "Your first transfer will show up here."
  - With setup done and no history, the line holds only *Now* and an *Add money* prompt.
- **The total's states.**
  - `partial`: show the figure plus "Some prices are unavailable, so this total leaves them out."
  - `unavailable`: show "—" plus "Your total isn't available right now."
  - A null `change_24h_kobo` drops the change line.

## Page details

- **`/signin`**
  - *Sandbox* (Privy development app):
    1. Email, then *Send code* (Privy `sendCode`).
    2. A six-digit code (`autocomplete="one-time-code"`), then *Sign in* (`loginWithCode`).
    3. The access and identity tokens go to `POST auth/privy`.
  - *Simulated*: the email goes to `POST beta/privy-tokens`, then on to `auth/privy`. A hint says "Beta: sign in with an @v3st.test email or one on the beta list."
  - Afterwards: when `next_step` isn't null, go to `/setup`. Otherwise go to the safe `next` path (same-site paths only) or `/home`.
  - `signed-out=1` shows "You're signed out." An already-valid session redirects.
  - A sandbox server with no app ID shows "Sign-in isn't set up on this server yet."
  - Errors render the API message. Privy failures say "That code didn't work. Check it and try again."
- **`/setup`**
  - The page shows the step `GET onboarding` names next; finished steps show ticked in the list.
  - Identity: radio cards of the test identities, and the note "In the beta you choose a test identity instead of giving your BVN."
  - PIN: enter it, then confirm it. `PIN_TOO_SIMPLE` shows its message.
  - Documents: the onboarding documents (`INVEST_DOCUMENTS`, passed from the server). Each has *Read*, which opens the Document modal, and there is one "I've read and accept these documents" checkbox.
  - Bank account: bank select, 10-digit account number and PIN. `NAME_MISMATCH` shows its message.
  - When all four are done, the page shows "You're all set" and *Go to home*.
- **`/stocks`**
  - Search, plus an *All* / *Watchlist* switch kept in the URL (`replaceState`, as fluid does).
  - A caption reads "Beta prices in naira".
  - Each row shows the mark (or its letter), name, ticker and price.
  - Price status shows as *Delayed · 13:40* or *Price unavailable*. Change is coloured, and *Prices updating* or *Trading paused* appear as chips.
  - Empty search: "No stocks match "…"". Empty watchlist: "Your watchlist is empty. Tap the star on a stock to add it."
- **`/stocks/[id]`**
  - Price and status line, with the watchlist star (`aria-pressed`).
  - An SVG line chart from 1D to ALL. It shows the range's change (`change_bps`) and has no touch scrubbing in this version. "Not enough price history yet" never draws a flat line.
  - Your position, with *Buy* and *Sell* (Sell only with a position).
  - *Prices updating*: buying stays allowed, with "Your order goes through when prices update." *Paused*: both buttons are disabled, with the API copy.
  - About, *How your shares are held* (Document), and a link to Earn for this stock when it has one.
  - With setup unfinished, *Buy* becomes *Finish setting up to invest*.
- **Trade amount.**
  - A buy shows cash available (the cash query) and *Pay with*: cash or bank transfer. It defaults to cash when cash covers the amount, otherwise to bank transfer, and the customer can switch.
  - A sell takes a naira amount or *Sell all*.
  - The minimum comes from `policy`.
- **Trade review.** Each `executes` mode gets one plain sentence:
  - `now`: "Goes through now."
  - `when_prices_update`: "Goes through when prices update, never above ‹price limit›. Valid until ‹order_valid_until›."
  - `after_your_transfer`: "Goes through after your transfer arrives. You'll see the bank details next."

  The review also shows the fee lines, the API's `notes`, a countdown to `expires_at` and the beta line. Both an expired preview and `PRICE_CHANGED` return to the review with *Get a new price*.
- **`/orders/[id]`**
  - The API's `title` and `detail`, with amount, shares and price, then the timeline.
  - When `waiting_for_payment`, a transfer card shows:
    - "Send exactly ₦…", the bank, the account number and reference (each with *Copy*), and the account name;
    - a countdown to `expires_at`;
    - beta *Complete this test transfer*, using the new route.
  - *Cancel order* (a confirm modal) appears while `can_cancel` is true.
  - The support reference has *Copy*.
- **`/cash`**
  - Available, on hold and incoming, each null-aware, plus `as_of` and the bank account summary.
  - *Withdraw* without a bank account becomes *Add your bank account*, going to `/settings?open=bank`.
  - A *See all activity* link.
- **`/activity/[id]`**
  - Title, signed amount (+ in, − out), status, lines (as key–value rows), timeline, bank and bank reference, and the support reference with *Copy*.
  - An unpaid `dep_` item also shows the deposit's transfer card, with beta *Complete this test transfer* using the existing route.
- **`/earn` and `/earn/[id]`**
  - Product title, summary, minimum, and position status.
  - The page shows *how it works* and the *risks* in full.
  - Your position: added, value, earned and joined date.
  - *Join*, or *Withdraw* while the position is active. While processing or withdrawing, the page shows only the status. `action_needed` shows "Needs a check before it can continue." with no actions.
  - `/earn` links to `/earnings` (*See your earnings*) once the customer has earnings or has made a choice.
  - Join's last step shows the Earn risks document inline. *Confirm* stays disabled until "I've read and accept the Earn risks" is ticked, and it sends `accepted_risk_version`.
- **`/earnings`**
  - Total earned, this week, the next payout date, and the choice (or *Choose what happens to your earnings*).
  - "Payouts start at ‹minimum_payout_kobo›. Smaller amounts roll over to the next week."
  - The API's `limits`, then the weekly outcomes.
  - It never promises income every Friday or a bank arrival time.
- **`/activity`**
  - Rows grouped by Lagos day (*Today*, *Yesterday*, then *Mon 16 Nov*), with *Show more* paging by cursor.
  - Empty: "Nothing yet. Money you add, invest or earn shows up here."
- **`/settings`**
  - Rows that open the settings modals.
  - A documents list, opened in the Document modal.
  - *Sign out*: Privy `logout()` in sandbox, then `POST auth/logout`, then go to `/signin?signed-out=1`.
- **Every page** has a skeleton `loading.tsx`, plus the group's `error.tsx` ("We couldn't load this page." with *Try again*) and `not-found.tsx` ("We couldn't find that." with *Home*). Metadata titles read "Home · V3ST" and so on, and never contain balances or names.
- **Setup gate.** With onboarding incomplete, every money action renders as *Finish setting up*, going to `/setup`, instead of triggering `SETUP_REQUIRED`.

## Visual system for the app

The landing's world stays unchanged. The app takes its Operate share: type, palette, density and one signature move.

- **Colour: existing tokens only.**
  - Signal is for fills, lines, the spine and filled nodes. It is never used for small text: it measures 4.06:1 on void.
  - Mint (gain) carries positive figures, the focus ring, text accents and waiting halos.
  - Coral (loss) carries negative figures and failures.
  - Subtle is for tertiary text: 5.5:1 even on surface-raised.
- **Type: a fixed rem scale, not clamped.** New utilities in `globals.css`:
  - `type-app-figure`: 2.5rem, weight 300, −0.02em, for headline money;
  - `type-app-amount`: 2rem, weight 300, for review and detail amounts;
  - `type-app-title`: 1.5rem, weight 500;
  - `type-app-heading`: 1.125rem, weight 600.

  Body text is 16px, secondary 14px and meta 13px. Nothing goes below 11px. Every figure uses tabular numerals.
- **Shape.**
  - Pill buttons, at least 44px tall.
  - Fields 48px tall with 16px corners and the `control-border` border.
  - List rows separated by hairlines rather than cards. Cards are kept for transfer details, Earn products and the settings groups, never nested.
  - Modal sheets have 28px corners.
- **Depth.** Hairlines only. The only glow is the waiting halo (mint at about 14%).
- **Motion.**
  - 150–250ms state changes.
  - The signature crossing and the modal timings.
  - A skeleton pulse that is motion-safe.
  - No page-load choreography.
- **Primitives.** Generated with the shadcn CLI into `src/primitives/` and restyled with the tokens: `input`, `label`, `dialog`, `select`, `radio-group`, `checkbox`, `input-otp` and `separator`.
  - Hand-built additions:
    - `Money`: kobo to naira; null renders "—" with "not available" for screen readers;
    - `KeyValue`;
    - `CopyButton`: "Copied" for 2s, announced politely.
  - Feature pieces live in `src/components/app/`: the line, the PIN step, the amount field and the transfer card.
- **Icons.** Phosphor regular from the SSR entry.

## Data and state

- **Server reads.**
  - `src/server/app/session.ts` provides `getCurrentCustomer()` (React `cache()`, cookie → `authService.authenticate`) and `requireCustomer()` (redirects to `/signin?next=…`).
  - `src/server/app/reads.ts` has one cached wrapper per read. Each returns the DTO, `undefined` for not found (the page calls `notFound()`), or `null` for a failed read (the page renders the error body).
  - Every page read calls `requireCustomer()`, so there is no edge middleware.
- **Client.**
  - `src/utils/app-api.ts`: a typed `fetch` client for `/api/v1/app`. It unwraps the envelope and throws `AppApiError { status, code, message }`.
  - A 401 sends the browser to `/signin?next=<current path>`.
  - Hooks in `src/hooks/app/`. Query keys map to the stream's areas: `home`, `cash`, `orders`, `holdings`, `earn`, `earnings`, `activity`, `notifications`, plus `session` for the unread count.
- **Live updates.** One `EventSource` on `GET events?after=<seq>`, opened by the app layout's client provider.
  - Each `changed` frame invalidates the mapped keys.
  - A `notifications` change also refreshes the session.
  - It reconnects with backoff from 1s to 30s, closes in hidden tabs, and resumes from the last `id`.
- **Errors.** Render the API's `message` exactly. Use `code` only to branch:
  - `PIN_INCORRECT` clears the PIN;
  - `PIN_LOCKED` adds *Reset your PIN*;
  - `PRICE_CHANGED` asks for a new price;
  - `SIGN_IN_REQUIRED` goes to sign-in.
- **Formatting.** A new browser-safe `src/utils/format.ts`, which `src/components/landing/format.ts` re-exports so landing imports and tests keep working:
  - `formatNaira` and `formatChangeBps` (moved from the landing);
  - shares from millionths ("0.412 shares");
  - Lagos date, time and day labels;
  - `countdown`.
- **Amount input.** "₦12,500.50" parses to the exact kobo string `"1250050"`, tested. Limits come from `policy` through the page as strings:
  - deposits `policy.deposits.minKobo` and `maxKobo`;
  - buys `policy.app.orders.minBuyKobo`;
  - Earn `policy.app.earn.minKobo`.

## Sign-in and Privy

- `PRIVY_MODE` and `PRIVY_APP_ID` are read on the server and passed to the sign-in component. No new public environment variable is needed.
- `@privy-io/react-auth` is added at an exact version. It loads only in sandbox mode, only on `/signin` and in the Reset PIN modal, through a dynamic import.
  - The config is email login only, with embedded wallets off (`createOnLogin: "off"`).
  - The agent checks the hook and method names (`useLoginWithEmail`, `getAccessToken`, the identity-token accessor) against the installed version's types.
- PIN reset needs a new Privy session: call Privy `logout()`, run the email login again, then send the new tokens with the new PIN. In simulated mode, mint fresh beta tokens instead.

## Backend additions

1. **`POST /api/v1/app/beta/orders/[id]/complete-transfer`.**
   - For the customer's own pay-by-transfer order, it marks the linked test transfer paid by calling `appCashService.completeBetaDeposit` with the order's `depositOrderId`, then returns the order.
   - It is built like `beta/deposits/[id]/complete`: `withMiddleware<null, IdParamSchema, null>`, `authMiddleware`, `originMiddleware`, `pathParamValidatorMiddleware(idParamSchema)` and `{ audience: "customer" }`.
   - It returns `NOT_FOUND` for another customer's order or one with no transfer. It is idempotent once paid.
   - Why it's needed: the order DTO doesn't expose its transfer's id, so without this route a tester who chose bank transfer could never finish a test buy.
2. **Document types.** Add `AppDocumentSummaryDto` (`slug, title, version, accepted`) and `AppDocumentDto` (`slug, title, version, body`) to `src/types/app.ts`, and annotate the two document routes with them.

## Landing sign-in link

These are the only edits to the approved landing.

- **Header.** A *Sign in* text link to `/signin` sits in `header-right`, before the header's *Join the waitlist* pill.
  - It uses `muted-foreground`, turns `heading` on hover, has a 44px target and the visible focus ring.
  - It is always shown; the hero handover still controls only the pill.
  - In the mobile sheet it is the last item, wrapped in `SheetClose asChild`.
- **Footer.** It goes in the footer's link column.
- **No prefetch.** Render it as `<a href="/signin">`, or `<Link prefetch={false}>`. The landing's browser suite refuses any fetch to a path outside `/`, `/legal/*` and `/waitlist`, and the landing stays static.
- **Unchanged.** `NAV_LINKS` keeps its five sections.
- **Tests.**
  - A landing e2e assertion: the link is present and focusable, and points at `/signin`.
  - A unit test: `NAV_LINKS` doesn't contain it.

## Copy and vocabulary

- The app's own copy follows the customer vocabulary rule. "Invest in", never "own".
- No invented numbers: every figure comes from the API or `policy`.
- A source guard test parses the app's `.tsx` files with the TypeScript compiler, collects JSX text and string literals, and runs them through `findCustomerLeaks`.
- A browser crawl runs every page's rendered text through the same check.

## Verification

- **Unit tests** (Vitest, node): `tests/app-ui/` covers:
  - formatting and amount parsing;
  - the line model;
  - countdown;
  - safe `next`;
  - the `open` parameter;
  - event-area-to-key mapping;
  - the API client's envelope handling;
  - the vocabulary source guard;
  - the backend-link-resolves guard;
  - the page inventory.
- **Route test** for the new beta route, in the style of `tests/app/orders-waiting.test.ts`.
- **Browser suite.** It runs in `e2e/app/` with its own Playwright config, on port 3108, against the isolated `_test` database, the local test chain and the worker, with simulated Privy. It covers:
  - sign-in, setup, the home states, add money and test completion;
  - buy now, a pay-by-transfer buy and its test completion;
  - Earn join and leave, the earnings choice;
  - the settings modals and the notifications sheet;
  - modal focus and Escape;
  - no horizontal scroll at 390px;
  - the vocabulary crawl.
- **Impeccable finish.**
  - Capture each page at 390 and 1440px into `.impeccable/review/`.
  - Run `impeccable detect --json` once.
  - Run the finish reviewer against the direction contract, with the chosen sketch as the critique reference.
  - Act on its disposition, then document the app section in `DESIGN_SYSTEM.md` and `.impeccable/design.json`.

## Decisions made in this design (for operator review)

| Decision | Value | Why |
| --- | --- | --- |
| Sign-in link | A plain anchor to `/signin`, never prefetched; muted text, at least 44px tall | The landing's browser suite refuses any request to a non-landing path, and the waitlist stays the main action |
| Tabs | Home, Stocks, Cash, Earn; Activity and Settings in the desktop sidebar | Matches the chosen sketch; Home's line already covers recent activity |
| Holdings | On Home; no portfolio page | Home's job is where your money stands; fewer pages |
| Notifications | A modal from the bell; no page | Nothing links to a notifications page; fewer pages |
| Documents | A modal reusing `markdown-lite.ts` and `DocumentBody` | Stays inside the app; `DocumentBody` gains a heading-level prop (default `h1`, so the landing is unchanged) |
| Settings | One page, a modal per setting, linkable by `?open=` | Decision 4; backend links still resolve |
| Unpaid transfers | Shown on the activity receipt, not a deposit page | The deposit read already has the details; fewer pages |
| Client data | TanStack Query and typed `fetch`; no Axios and no form library | Live invalidation by area; the forms are small |
| Route guard | Server reads redirect; no edge middleware | The session constants import `policy`, which isn't edge-safe |
| Formatting | `src/utils/format.ts`, re-exported by the landing | One source of exact money formatting |
| Desktop | Sidebar from 768px, one 720px column | Phone-first; desktop is never broken |
| Backend | One beta route plus two document types | Pay-by-transfer orders can't finish in the beta without it |
| Pay with | Cash when it covers the amount, else bank transfer; switchable | Mirrors the API's own default |
| Chart | No scrubbing in this version | The range change and status line carry the meaning; scrubbing adds a gesture to get wrong |

## Left to the builder

- Copy wording beyond the strings pinned here, within the vocabulary rule.
- Icon choice within Phosphor regular.
- Skeleton shapes.
- Chart axis labelling: straight segments, no smoothing.
- Internal helper names the plan doesn't fix.

## Open risks

- Privy's React SDK names differ between versions. The plan pins a version and has the agent check the types before wiring.
- The browser suite needs PostgreSQL, Anvil, a deploy, a seed and the worker. It runs once, at the end, and may be the slowest part of the final gate.
- After a `rejected` test identity, the identity step shows whatever the API returns. Whether a tester can choose again is the backend's existing behaviour, and the plan doesn't change it.
- The event stream holds one open connection per tab. A hosted deployment is out of scope.
