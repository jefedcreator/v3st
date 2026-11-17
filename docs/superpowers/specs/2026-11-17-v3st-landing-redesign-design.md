# V3ST landing page redesign: design

Date: 2026-11-17 (logo decision recorded 2026-11-18). Status: reviewed by a fresh builder check, awaiting operator approval. A separate cloud agent implements it from the companion plan.

Supersedes, for the anonymous marketing page only: [the 2026-11-15 landing design](2026-11-15-v3st-landing-design.md), its plan and review. Those stay in the repository as history. `Design.md` (product architecture) is unchanged.

## Why

The landing page built on 2026-11-15 uses a light ivory and forest-green identity. The operator finds it unattractive and asked for a replacement. They want it inspired by [katana.network](https://katana.network/), behaving exactly like it in scrolling, animation and transitions, with a green primary colour that reads as growth, profit and harvest. The current implementation is not a constraint. Its look is the anti-reference, and none of its components carry over (see [Files](#files-replace-keep-delete)).

The page is V3ST's public face during the beta and for the [Base Stocks Maxxing programme](https://www.base.org/stocksmaxxing) submission on 5 December 2026. Programme judges will see it the way a customer would.

## Decisions made with the operator

These were settled in conversation on 2026-11-17 and are not open to the builder:

1. **Replace, don't refine.** Ignore the current landing implementation. Its ivory look is what to avoid.
2. **Katana as the reference.** The page is inspired by katana.network and behaves exactly like it in scroll behaviour, animation and transitions (the [behaviour contract](#katana-behaviour-contract) below pins the numbers).
3. **Dark.** Katana's near-black world, with green wherever Katana uses its blue. Approved from a rendered mock.
4. **Primary colour: Flag green `#00804D`.** Chosen from three rendered options (flag green, emerald, harvest lime). It sits close to Nigeria's flag green and plays exactly the role of Katana's deep blue: filled buttons with white text, the fluid glow, outlines of price rows.
5. **Typeface: Bricolage Grotesque.** Chosen from three rendered options. Katana's own face (Aspekta) and the project's previous face (Geist) both lack the naira sign (₦), which made every naira amount fall back to a mismatched glyph. Bricolage has ₦, tabular figures and a light weight that carries Katana's airy headlines.
6. **Audience: Nigerian first-time investors.** Copy speaks in naira, shares and earnings, and keeps crypto out of sight the way the customer app does. Base and the provider logos appear lower down as proof.
7. **Main action: join the beta waitlist.** An email sign-up saved by a new backend route with validation, a database table, spam protection, rate limits and a privacy note. It gives the operator a list for beta invites. There are no customer app screens yet, so no "Sign in" or "Open the app".
8. **Katana's "Trusted by" row shows all 12 providers V3ST's code uses:** Yellow Card, Paycrest, Privy, Coinbase, Base, Circle (USDC), Hydrex, o1 Exchange, Bankr, Stonks Exchange, BaseStonk and Feel.cash. The operator chose all 12 over a narrower set of eight.
9. **Real logos and icons** for assets, chains and providers. Nothing hand-drawn, approximated or fabricated.
10. **Plan only.** A cloud agent builds it.
11. **Real logos even where a brand's terms restrict third-party use** (decided 2026-11-18).
    - Apple's published terms say commercial use of its logo without written consent may infringe its trademark, and Microsoft's and NVIDIA's read the same way. The operator chose to show the official marks anyway, as identification, the way investing apps do, and accepted the trademark risk on record.
    - The footer carries a no-affiliation line.
    - Any badge switches to a ticker-letter badge when its logo file is deleted, so a brand that objects can be removed in one step.

## Goals

- A first-time visitor understands within one screen what V3ST offers (naira into US companies from ₦1,000, optional earnings, Friday payouts), sees that it is a beta with test money, and can join the waitlist without scrolling.
- At normal desktop and mobile sizes the page scrolls, animates and transitions like Katana, using the measured numbers below.
- Every figure on the page is true and traceable to code or policy. Every logo is an official file with recorded provenance.
- The page survives failure: no JavaScript, failed WebGL, reduced motion, an unreachable database, short viewports and 200% zoom all leave the content readable and the waitlist usable.

## Non-goals

- Customer app screens (sign-in, onboarding, portfolio). They have their own future frontend plan.
- Sending any email. The waitlist only stores addresses; the operator invites people manually.
- Public search indexing. The page stays `noindex, nofollow` until a separate public-release decision.
- Analytics, cookies or a consent banner. Katana has a cookie banner; V3ST sets no cookies on these pages and needs none.
- Client-side live price streaming. Prices refresh by incremental static regeneration (below).
- Any change to financial behaviour, provider modes or the beta policy. No deployment.

## Anti-goals

The page fails, even if it works, if it:

- reads as a generic dark crypto template, neon-on-black, or a reskin with Katana's text still in its bones;
- shows any invented number (users, volume, returns, APR) or claims a partnership, endorsement, audit or licence;
- implies direct ownership of company shares, guaranteed earnings, or income every Friday;
- uses crypto vocabulary in copy (wallet, token, tokenized, USDC, gas, onchain, blockchain, swap, liquidity, Sepolia). Brand names inside the "Built to work with" row and its alt text are the only exception, plus "Base" in the safeguards card;
- shows a ₦ glyph from a fallback font anywhere;
- scrolls or moves differently from Katana at normal sizes (smooth-scroll hijacking, scroll snapping, identical reveal effects on every section);
- hides content when JavaScript fails, or breaks when the database is down.

## Constraints

- Repository rules in `CLAUDE.md`. No optional or conditional object spreads. Break work into a todo list and commit per task. Never add Claude co-author or "generated with" lines to commits. Run `yarn test`, `yarn lint`, `yarn typecheck` and `yarn build` once, at the end, not between tasks.
- `FRONTEND_PATTERNS_GUIDE.md` and `DESIGN_SYSTEM.md` govern the frontend; `BACKEND_PATTERNS.md` governs routes, middleware, validators and services. Where this design changes a documented pattern, update those guides in the same work (listed under [Documentation](#documentation-to-update)).
- Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind 4 with tokens in `@theme static` in `src/styles/globals.css` (no Tailwind config file), `motion/react` for UI transitions, `@phosphor-icons/react/dist/ssr` for UI icons, `cn` from `@/utils/cn` in browser code (never the `@/utils` barrel, which imports `node:crypto`).
- Beta policy: `APP_STAGE=beta`, test money only, no live providers, no mainnet.
- Licences:
  - Bricolage Grotesque is OFL.
  - React Bits' LiquidEther is MIT with the Commons Clause, which allows use inside a website but not redistribution of the component on its own. Keep its notice beside the source.
  - three.js is MIT.
  - Company and provider logos are trademarks, used only to identify the companies and services. Follow each brand's published guidelines on form: no distortion, no recolouring beyond the treatments listed under [Logos and assets](#logos-and-assets). Where a brand's terms restrict third-party use outright, the operator has accepted the risk (decision 11).
- Accessibility: WCAG 2.2 AA.

## Approaches

Three ways to get Katana's behaviour were considered:

| Approach | Trade-off | Verdict |
| --- | --- | --- |
| **Mirror Katana's own engineering**: native document scrolling; one requestAnimationFrame loop per effect writing CSS custom properties and refs (no React state per frame); IntersectionObserver triggers; CSS keyframes for loops; the same formulas as Katana's bundle | Most code is hand-written, but it is the only way to feel identical, because Katana itself works this way | **Chosen** |
| GSAP ScrollTrigger with Lenis smooth scrolling | Fast to build, but Lenis interpolates scroll, so the page would *feel* different from Katana's native scroll; the frontend guide also rules both out | Rejected |
| CSS scroll-driven animations (`animation-timeline`) | No JavaScript, but cannot reproduce Katana's 0.18 smoothing or its time-based intro, and support is patchy in Safari and Firefox | Rejected |

For the hero's moving fluid glow:

| Approach | Trade-off | Verdict |
| --- | --- | --- |
| **The same component Katana runs**: React Bits LiquidEther, pinned to commit `1eeb6f105c68b964289d85dabbe84a1d551f3797` (27 Sep 2026), the last three.js revision. It has every parameter Katana sets except `dissipation`, which Katana added and we add too | Adds `three@0.180.0` as a lazily loaded chunk (roughly 150 KB compressed, loaded only after the text is on screen) and a licence notice to keep | **Chosen** |
| A hand-written WebGL fluid (what the 2026-11-15 page did) | No dependency, but an approximation that never moves quite like Katana | Rejected |
| A static image with a CSS glow | Cheapest, but loses the pointer-reactive, idle-drifting behaviour the operator asked for | Rejected (kept only as the fallback) |

The waitlist posts an ordinary HTML form to a new API route so it works without JavaScript. JavaScript enhances it into an inline submission. Rate limits live in PostgreSQL rather than in memory (unreliable across server instances) or a new third-party service.

## Direction contract

This is the Impeccable direction contract for the surface. The builder also writes it to the surface brief at `.impeccable/surfaces/src-app-marketing-page-tsx.md`, which is where Impeccable tooling reads it. Never copy it into source, comments, markup or any browser-delivered file.

- **THESIS:** A naira-first investing beta that looks and moves like Katana. One near-black field, one green signal, a pinned hero that hands over to living proof. It refuses the category default: a bright fintech page of phone mockups, invented user counts and stock-photo smiles.
- **OWN-WORLD:**
  - A green-tinted void ground (`#020604`) with layered surfaces (`#08100C`) and hairline strokes (`#15211B`).
  - White Bricolage Grotesque at weight 300 for display type.
  - One signal green (`#00804D`) for fills and the fluid glow, mint (`#3DDC97`) for gains and focus, coral (`#FF6B5A`) for losses.
  - Pill controls, price rows with glowing outlines, and small tracked uppercase labels used only inside data and logo rows, never above a heading.
- **STORY:** A first-time Nigerian investor understands they can put ₦1,000 into companies they already know. They see real beta prices in naira and learn that Earn is optional and can earn nothing. They see the safeguards, then join the waitlist.
- **FIRST VIEWPORT:**
  - A centred composition on the green fluid field. "Invest. Earn. Harvest." at 6rem, weight 300, white, then a one-sentence subline.
  - The waitlist form directly beneath: one pill holding the email field and a green "Join the waitlist" button. Under it, beta and privacy microcopy.
  - A three-counter rail along the bottom.
  - The header: V3ST wordmark and a Beta chip on the left, Katana's centred pill navigation. Its "Join the waitlist" button stays hidden until the hero hands over.
- **FORM:** Katana's landing grammar, pinned by the operator; position 1 of 1; seed: none (unavailable).
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

On this repository, "DESIGN.md" in the FINISH line means `DESIGN_SYSTEM.md`. A file named `DESIGN.md` collides with the product document `Design.md` on case-insensitive filesystems (macOS) and must never be created. The machine-readable sidecar is `.impeccable/design.json`.

Build path: **code-led.** The operator approved the direction from rendered mocks and the cloud run is unattended, so there is no comp round. The approved references are:

- the Katana captures, which the builder re-captures (see [Verification](#verification));
- the approved mock, option A (flag green in Bricolage Grotesque) from the 2026-11-17 brainstorm, committed as [`assets/2026-11-17-v3st-landing-approved-mock.png`](assets/2026-11-17-v3st-landing-approved-mock.png) with its source page [`assets/2026-11-17-v3st-landing-approved-mock.html`](assets/2026-11-17-v3st-landing-approved-mock.html).
  - It sets the look and finish bar, and is the finish review's critique reference.
  - Where it differs from this document, this document wins. The mock shows two hero buttons, a "Payouts" nav item, an earlier subline, and community-icon stand-ins for the company marks.

**Light or dark, from the use scene:** evening phone browsing in Lagos, Abuja and Port Harcourt, after work on a commute or at home, mostly on mid-range Android phones with OLED screens. There a near-black page is comfortable and the green glow carries. In daytime the white, high-contrast type keeps it readable.

## Visual system

`DESIGN_SYSTEM.md` is rewritten from this section. Keep the semantic token names the primitives already use, so `src/primitives/*` keep working, and change their values.

### Colour tokens

| Token | Value | Use | Contrast (measured on `void`) |
| --- | --- | --- | --- |
| `void` (canvas) | `#020604` | page ground | — |
| `inset` | `#050B08` | recessed wells | — |
| `surface` | `#08100C` | cards, ticker rows | — |
| `surface-raised` | `#0C1712` | hover/active surfaces | — |
| `stroke` | `#15211B` | hairlines, card borders | decorative |
| `control-border` | `#5A6F62` | input and outline-button borders | ≥3:1 non-text |
| `ink` | `#E3EBE6` | body text | ≈16:1 |
| `heading` | `#FFFFFF` | display and headings | 20:1 |
| `muted` | `#93A69B` | secondary text | 7.9:1 |
| `subtle` | `#7F9187` | captions, small labels | 6.1:1 |
| `signal` | `#00804D` | filled buttons (white text 5.0:1), fluid, row outlines | not for small text on `void` (4.1:1) |
| `signal-hover` | `#009459` | button hover | — |
| `gain` | `#3DDC97` | positive changes, links, focus ring, caret | 11.5:1 |
| `loss` | `#FF6B5A` | negative changes | 7.3:1 |

- Fluid palette (LiquidEther `colors`): `["#0D6A3D", "#0D6A3D", "#008A52"]`, the green analogue of Katana's `["#1b2fbf", "#1b2fbf", "#0059bf"]`. The builder may tune it in browser review. The hard rule is that hero copy stays at least 4.5:1 against the brightest fluid frame. Keep the subline in `ink`, not `muted`, and lay a soft `void` veil behind the text block if a capture shows a dip.
- Browser surfaces are themed, not left at defaults:
  - text selection: `signal` background with white text;
  - caret: `gain`;
  - focus ring: a 2px `gain` outline with a 3px offset on every interactive element;
  - scrollbar: a `#23342B` thumb on a `void` track;
  - underline offset: 0.2em;
  - `color-scheme: dark`;
  - every number set in tabular figures.
- One theme only. No light mode, no theme toggle, no `next-themes`.

### Type

Load Bricolage Grotesque with `next/font/google`: subsets `["latin", "latin-ext"]` (₦ U+20A6 is only in `latin-ext`), `axes: ["opsz"]`, variable weight, exposed as the sans variable. Remove Geist. Optical sizing stays automatic (`font-optical-sizing: auto`).

| Role | Size | Line height | Tracking | Weight |
| --- | --- | --- | --- | --- |
| Display (h1) | `clamp(2.5rem, 6.67vw, 6rem)` | 1.04 | −0.024em | 300 |
| Section heading (h2) | `clamp(2.25rem, 3.9vw, 3.5rem)` | 1.2 | −0.022em | 300 |
| Big figures (counters, Earn) | `clamp(2.5rem, 4.4vw, 4rem)` | 1 | −0.02em | 300 |
| Lead | 18px (17px under 640px) | 1.55 | 0 | 400 |
| Body | 16px | 1.6 | 0 | 400 |
| Small labels | 11px, uppercase | 1.4 | 0.18em | 500 |
| Buttons and nav | 15px | 1 | 0 | 500 (buttons 600) |
| Wordmark | outlined SVG from Bricolage at weight 800, optical size 96 | — | 0.01em | — |

Headings balance (`text-wrap: balance`); body copy pretty-wraps with a 65–75ch measure. The display face never exceeds 6rem, and tracking never goes tighter than −0.04em.

### Layout and shape

- Content max width 1200px; gutters 24px.
- Section padding 112px desktop and 72px mobile. The "Built with" row uses 96px desktop and 64px mobile. There is always more space above a heading than below it.
- Radii: pills 999px; cards 28px; ticker rows 16px; inputs live inside the pill.
- Depth: hairline strokes plus the signal glow on price rows (`0 0 24px` of `signal` at about 26%), which is part of the pinned world. No other shadows except the open mobile sheet.
- Icons: Phosphor, regular weight, from `@phosphor-icons/react/dist/ssr`, `aria-hidden` beside text.

## Page structure and copy

Copy is final unless marked. The builder does not invent claims. Anchors are native, and `scroll-margin-top` keeps headings clear of the fixed header.

### Header (fixed)

- Left: the V3ST wordmark (an SVG link to `#top`) and a small "Beta" chip.
- Centre: a pill navigation linking to Stocks `#stocks`, Earn `#earn`, How it works `#how-it-works`, Safeguards `#safeguards` and FAQ `#faq`.
- Right: a green "Join the waitlist" pill. It appears as the hero hands over (Katana's header CTA behaviour), links to `#join`, and when JavaScript is available moves focus into that form's email field. Never a modal.
- Mobile: the wordmark and Beta chip, with a "Menu" button beside them as on Katana. The button opens the left sheet holding the five links, the waitlist button and the line "Beta · test money only".
- **Pause control:** an icon button at the header's right edge on every screen size.
  - It uses Phosphor's Pause and Play icons, is 44px, and its accessible name is "Pause motion" or "Play motion".
  - It is visible from first paint, because it is not part of the navigation entrance.
  - It pauses every self-running motion on the page: the fluid, the ticker, the floating panels, the diagram autoplay and the parallax.
  - Resuming continues from the paused frame, without replaying or catching up. The state lives in memory only.
  - `FRONTEND_PATTERNS_GUIDE.md` §10 and WCAG 2.2.2 (Pause, Stop, Hide) both require it. It is the one visible addition to Katana's header.
- No social links; V3ST has none.

### 1. Hero (`#top`)

- **Heading (h1):** Invest. Earn. Harvest.
- **Subline:** Start with ₦1,000 in Apple, NVIDIA and other US companies. Put your money to work in Earn if you choose, and collect any earnings in your bank on Fridays.
- **Waitlist form:** an email field (visually hidden label "Email address", placeholder "you@example.com") and the button "Join the waitlist". States are listed in [Waitlist](#waitlist).
- **Microcopy under the form:** "Beta · test money only. We'll only use your email to invite you." followed by the link "Privacy" (`/legal/privacy`).
- **Counter rail:** three counters that count up as Katana's do. Each figure is derived in code from its source, never typed by hand.
  - ₦1,000, labelled MINIMUM TO START, from `policy.app.orders.minBuyKobo`.
  - 8, labelled US COMPANIES IN THE BETA: the count of `STOCK_PROFILES` entries with a `logoPath`.
  - ₦2,000, labelled SMALLEST FRIDAY PAYOUT, from `policy.earnings.minPayoutKobo`.

### 2. Stocks (`#stocks`)

Katana's "Trade the market" split: text on the left, a vertical ticker on the right.

- **Heading:** Invest in companies you already know.
- **Body:** Prices track the real companies and show in naira. Buy any amount from ₦1,000 and sell in the app at the price shown at the time.
- **Link:** "Join the waitlist" with an arrow, to `#join`.
- **Ticker rows:** eight rows in `STOCK_PROFILES` order (AAPL, NVDA, TSLA, MSFT, AMZN, GOOGL, META, SPCX). Each row has:
  - a logo badge;
  - the ticker and a sector chip (from the profile);
  - the company name;
  - a one-day price line;
  - the naira price;
  - the 24-hour change, in `gain` or `loss`.
- **Prices:** come from the beta catalog ([Live beta prices](#live-beta-prices)). With no price, a row shows logo, ticker, sector and name only. With no line, the price line slot stays empty. Never invent a value.
- **Freshness labels:**
  - A row whose `price_status` is `delayed` shows a small "Delayed" chip, as the customer app does.
  - SpaceX shows an "Estimate" chip. It isn't listed on a public exchange, and its own profile says its test price is an estimate. Add a new `estimatedPrice: true` flag to its `STOCK_PROFILES` entry and surface it as `price_is_estimate`.
- **Caption under the ticker:** "Beta prices in naira · updated 14:05 Lagos time", using the newest `price_as_of`.
  - When that time isn't today in Lagos, include the date: "updated Fri 4 Dec, 21:00 Lagos time".
  - With no prices: "Beta prices appear here when they're available."

### 3. Built to work with (`#built-with`)

Katana's "Trusted by" layout: one small centred uppercase label, then a centred, wrapped logo grid with wide gaps (Katana: 80px and 56px; 128px and 64px at 640px and wider). Katana renders every partner in one muted grey.

- **Label:** BUILT TO WORK WITH. It is the section's heading element, styled small, not an eyebrow above another heading.
- **Order:** Yellow Card, Paycrest, Privy, Coinbase, Base, Circle (USDC), Hydrex, o1 Exchange, Bankr, Stonks Exchange, BaseStonk, Feel.cash. The services in a customer's path come first.
- **Caption:** In the beta no real money moves, and most of these services are in test mode or simulated by V3ST. Names and logos identify the services V3ST is built to work with; they don't imply partnership or endorsement.
- **Truth check:** each provider's actual beta status (live read, test mode or simulated stand-in) comes from `src/backend/integrations/provider-evidence.ts` and `beta-policy.ts`. Record it in `public/brands/sources.json`.
  - As of 2026-11-17, Coinbase's price feed is read live, and Yellow Card, Privy, Base and Hydrex run in test mode.
  - Paycrest is simulated.
  - o1 Exchange, Bankr, Stonks Exchange, BaseStonk and Feel.cash are local stand-ins.
  - The beta's USDC is a test token V3ST creates.

  If the code changes so the caption is no longer true, the caption changes with it.
- **Rendering:** each mark is about 28px tall on mobile and 32px on desktop, respecting each brand's minimum size.
  - Use the brand's official single-colour light variant, at reduced opacity, to match Katana's muted row.
  - Where a brand provides no light variant and its guidelines don't forbid it, a uniform filter to white is acceptable.
  - Where the guidelines forbid alteration, use the official mark unaltered.
  - Record which treatment each brand got in `public/brands/sources.json`.
  - Symbol-only marks (Bankr, Stonks Exchange, BaseStonk, Feel.cash) pair the official symbol with the name set in Bricolage.

### 4. Earn (`#earn`)

Katana's vault grid: the heading and lead on the left, a 2×2 card grid (one column on mobile, with Katana's horizontal snap row allowed on small screens), and a large cursor-following link beneath.

- **Heading:** Put your money to work.
- **Lead:** Join an Earn pool for a stock you like and collect a share of the fees each time people trade it. It's optional and separate from buying shares.
- **Cards:** each leads with a big figure in `gain`, where Katana shows APR. No APR is ever shown.

| Big figure | Label | Title | Body | Source |
| --- | --- | --- | --- | --- |
| ₦5,000 | MINIMUM TO JOIN | Pick a pool | Each pool is tied to one stock. | `policy.app.earn.minKobo` |
| Weekly | FEES COLLECTED | Earn from trading | Every trade in the pool pays a small fee. Your share is collected every Thursday night. | `EARN_AUTOMATION_COPY` |
| 1% | MOST IT COSTS TO CONVERT | Turn fees into naira | Converting earnings to naira costs at most 1%, plus an exchange-rate spread of at most 2%. | `policy.app.earnings.maxConversionFeeBps`, `maxFxBps` |
| Any time | TO WITHDRAW | Leave when you like | You get back shares and cash in whatever mix the pool holds then. | Earn product copy |

The first card's header shows four overlapping stock logo badges (AAPL, NVDA, TSLA, AMZN), echoing Katana's token pairs.

- **Risk note under the grid:** Fees aren't guaranteed and quiet weeks can earn nothing. You can get back less than you put in if the price moves a lot. In the beta, fees come mostly from test trading and have no real value.
- **Large story link,** with Katana's cursor follower on fine pointers: "Join the waitlist to try Earn", linking to `#join`. The follower's label is "Join".

### 5. How it works (`#how-it-works`)

Katana's "Productivity at its finest" section: a centred heading and lead, an isometric diagram of translucent green panels, and below it a caption that auto-advances with pagination dots. A diagonal light beam behind the section moves with parallax.

- **Heading:** How V3ST works.
- **Lead:** Your naira goes in by bank transfer and comes back the same way. Everything in between is handled for you.
- **Stages:** five, in this order. One panel and one caption each; the dots match the stages.

| # | Title | Caption |
| --- | --- | --- |
| 1 | Add naira | Send a bank transfer from your own account to the account number we show you. |
| 2 | Buy shares | Pick a stock and an amount from ₦1,000. You see the price and every fee before you confirm. |
| 3 | Earn, if you choose | Put money into an Earn pool to collect a share of trading fees. It's optional, separate, and it can earn nothing. |
| 4 | Friday payouts | Earnings of ₦2,000 or more are sent on Fridays between 8am and 11pm Lagos time. Smaller amounts roll over to the next Friday, or you can reinvest. |
| 5 | Back to your bank | Withdraw cash or sell shares from the app. Money only goes to the bank account in your own verified name. |

- **Panel icons** (Phosphor, regular): Bank, ChartLineUp, Plant, CalendarCheck, ArrowUDownLeft.
- **The ordered list is the authoritative content.** It is server-rendered and readable without the diagram; the diagram is decoration with `aria-hidden`.
- **Numbering is allowed here** because the order carries meaning.

### 6. Safeguards (`#safeguards`)

Katana's "Proof" section: three stat cards with diagonal green light streaks, then three cards.

- **Heading:** Built to show its work.
- **Stat cards** (counting up as Katana's do):

| Figure | Label | Line | Source |
| --- | --- | --- | --- |
| ₦0 | NETWORK FEES YOU PAY | We cover the cost of every transaction. | `Design.md` (gas is a V3ST operating cost) |
| 1% | MOST A TRADE CAN SLIP | If the price moves further while your order fills, the trade stops and your cash stays put. | `policy.trading.maxSlippageBps` |
| 30 days | LONGEST AUTOMATIC PERMISSION | Anything done for you in the background needs your permission, and it ends after 30 days unless you renew it. | `policy.app.earn.automation.expiryDays` / `policy.onchain.authorizationMaxDays` |

- **Cards:**
  - **Every naira on one ledger:** Every deposit, trade and payout is recorded in a double-entry ledger and checked against our partners' records.
  - **Paid only once received:** Earnings count only after they've actually arrived. Anything not yet received is labelled as an estimate.
  - **Built on Base:** the Base mark, and "V3ST runs on Base, a network built by Coinbase."

### 7. FAQ (`#faq`)

Katana has no FAQ; first-time investors need one. Use native `<details>`/`<summary>`, server-rendered so it works without JavaScript, with a 200ms height and opacity transition when JavaScript is available.

| Question | Answer |
| --- | --- |
| Is this real money? | Not yet. V3ST is in beta and everything uses test money: no real naira moves and the shares have no cash value. We'll tell you before anything changes. |
| Do I own the shares? | You get shares that track the price of the real company. They aren't direct ownership: you have no voting rights and no right to dividends. |
| How much do I need to start? | ₦1,000 to buy a stock, ₦5,000 to join an Earn pool. |
| Where do earnings come from? | Only from Earn, which you choose separately. Holding shares or cash doesn't pay anything on its own. Earn pays a share of trading fees, which aren't guaranteed and can be zero. |
| Can I lose money? | Yes. Share prices go down as well as up, and an Earn pool can return less than you put in if the price moves a lot. Only invest what you'd be comfortable losing. |
| When do I get paid? | Earnings of ₦2,000 or more are sent on Fridays between 8am and 11pm Lagos time. Smaller amounts roll over to the next Friday, and you can choose to reinvest instead. When the money reaches you depends on your bank. |
| What does it cost? | Every fee is shown as one naira figure before you confirm. Converting earnings to naira costs at most 1%, plus an exchange-rate spread of at most 2%. We cover network costs. |
| Do I need to know about crypto? | No. There's nothing extra to set up, nothing to sign and no network fees to pay. You see naira, shares and earnings. |
| Who can join the beta? | We're inviting people from the waitlist in small groups. During the beta you sign in with the email you joined with. |
| What do you do with my email? | We use it only to invite you to the beta and, once you join, to sign you in. We don't sell it. See the privacy notice. (The last sentence links to `/legal/privacy`.) |

### 8. Join (`#join`)

Katana's closing panel: a rounded panel with converging light beams in the fluid palette. Katana uses a raster here; author an original one (see [Assets](#logos-and-assets)).

- **Heading:** Invest. Earn. Harvest.
- **Lead:** Join the waitlist and we'll invite you to the beta.
- **Form:** the same waitlist form and microcopy as the hero.

### Footer

- **Columns:**
  - **V3ST:** Stocks, Earn, How it works, Safeguards, FAQ.
  - **Learn:** Risks of investing (`/legal/risks`), How your shares are held (`/legal/how-shares-are-held`), Earn risks (`/legal/earn-risks`).
  - **Legal:** Terms of use (`/legal/terms`), Privacy (`/legal/privacy`).
- **Disclosure:** V3ST is in beta. Everything uses test money: no real naira moves and shares have no cash value. Shares track the price of the real company and are not direct ownership. Investing can lose money.
- **No-affiliation line:** Company names and logos identify the companies whose prices the beta shares track and the services V3ST is built to work with. V3ST isn't affiliated with or endorsed by them.
- **Wordmark:** a giant V3ST wordmark spanning the content width, with a green radial glow behind it (Katana's signature closing move). It is static.
- **Copyright:** "© 2026 V3ST".

### Other routes

- **`/legal/[slug]`:** one static page per `CUSTOMER_DOCUMENTS` entry (terms, risks, how-shares-are-held, earn-risks, privacy), generated with `generateStaticParams`.
  - Each shows the title, "Version 2026-11-17" (the document's own version) and the body.
  - Render the body with a small renderer for the subset these documents use: `#` headings, paragraphs, `-` lists, bold. No new dependency, and unit-tested.
  - These are reading pages: header and footer, a comfortable measure, no motion.
- **`/waitlist`:** the result page for submissions made without JavaScript.
  - It reads `?status=` and shows the matching message from the waitlist states, plus the form again for retries.
  - It is dynamic because it reads `searchParams`, and it is `noindex`.
- **Shared layout:** `/`, `/legal/*` and `/waitlist` share a `(marketing)` layout holding the header and footer. Only `/` runs the hero choreography; the other pages show the header in its settled state.

### Metadata

- **Title:** V3ST · Invest. Earn. Harvest.
- **Description:** Invest in Apple, NVIDIA and other US companies with naira, from ₦1,000. Join the V3ST beta waitlist. Test money only during the beta.
- **Robots:** `noindex, nofollow` on every marketing route.
- **Absolute URLs** use `NEXT_PUBLIC_APP_URL`; never invent a domain.
- **New original favicon:** a V3ST monogram in `signal` on `void`.
- **New static 1200×630 social image:**
  - `void` ground, the green glow, the headline in Bricolage 300, the wordmark, and "Beta · test money only";
  - no third-party marks and no figures;
  - generated at build time (for example Next's `ImageResponse` with a bundled Bricolage TTF), or committed as a PNG with its provenance recorded.

## Katana behaviour contract

These numbers come from Katana's live bundle (`main-C7AqIgiI.js`, `routes-CQk4yUTO.js`, CSS `routes-CE6bdBRK.css`) and a browser capture on 2026-11-17 at 1440×1000 and 390×844. They match the 2026-11-15 capture. Implement the behaviour; never copy Katana's source, images or copy. If Katana changes later, this contract stands. Record any difference you observe, but do not chase it.

Let `S(x) = c²(3 − 2c)` where `c = clamp(x, 0, 1)`.

| Behaviour | Contract |
| --- | --- |
| Scrolling | Native document scrolling only. No smooth-scroll library, wheel interception, scroll-jacking or page-wide snap. |
| Hero geometry | A 160vh track with a sticky, 100vh stage at `top: 0`. The next section overlaps the track by −45vh, so it starts at 115vh, whenever the measured hero content fits the viewport. |
| Hero intro | Per-group opacity is `S((elapsedMs − a)/(b − a))`. Intervals (ms): background 0–900, heading 200–900, copy 480–1180, actions (the form) 760–1460, rail 1040–1740. Opacity only, no slide. |
| Scroll progress | Target `p = clamp(−rect.top / (rect.height − innerHeight), 0, 1)`. Smoothed `q += (p − q) × (1 − (1 − 0.18)^(dt/16.67))`, with `dt` capped at 64ms. |
| Handover | `h = S((q − 0.30)/0.70)`. Each group's opacity is its intro value × `(1 − S((h − from)/(to − from)))`. Actions 0–0.40, rail 0–0.36, copy 0.18–0.66, heading 0.40–1, background 0.45–1. Reverses continuously when scrolling up. |
| Navigation entrance | Cue `S((elapsedMs − 2120)/900)`. The centre nav moves from `top: −120px` to 0 and the wordmark from `translateY(−160%)` to 0, both with cue opacity. The header CTA follows `h` with the same translate-and-opacity pattern. |
| Mobile sheet | Opens from the left, width `min(86vw, 340px)`, height `100dvh`. Opens in 260ms and closes in 170ms, ease-out; the overlay follows. Focus is trapped, Escape closes it, scroll is locked while open, and focus returns to the trigger. |
| Ticker | The vertical list is duplicated once and moves `translateY(0 → −50%)`, linear, over `rows × 4.5s` (eight rows: 36s). The viewport is 22rem tall, 26rem at 640px and wider. The mask is transparent at both edges, opaque from 12% to 88%. It pauses on hover, on keyboard focus within it, when offscreen or hidden, and under reduced motion. |
| Counters | Count from 0 over 800ms with easeOutCubic `1 − (1 − t)³`, once, when 35% visible (IntersectionObserver threshold 0.35), with an optional per-counter delay. While counting, decimals are `d` when the value is at least 100, `max(d, 1)` when at least 10, otherwise `max(d, 2)`. Tabular figures. Reduced motion shows the final value at once. Server HTML always holds the final value; the animation starts from 0 only after hydration, and only when the counter is not yet visible. |
| Diagram entrance | Once, at threshold 0.20: each panel and caption fades in and rises from `translateY(12px)`, 420ms ease-out, 60ms stagger. Reduced motion uses a 200ms opacity change only. |
| Diagram autoplay | Starts 1080ms after entrance and advances the active stage every 3600ms while visible and not engaged. Hover intent is 120ms and the pointer-leave grace is 140ms; highlight changes take 200ms. It stops when offscreen, when hidden and under reduced motion. |
| Floating panels | `translateY(0 → −3px → 0)`, 8s ease-in-out, infinite, delayed `index × −1.3s`. |
| Background parallax | `translateY(clamp((innerHeight/2 − sectionCenterY) / ((innerHeight + sectionHeight)/2), −1, 1) × 70px)` on the artwork only, never on text. The artwork overhangs by 70px at both ends. |
| Cursor follower | Only for `pointerType === "mouse"`, on elements carrying the follower data attribute. The position eases with factor 0.20, normalised by frame delta. Opacity takes 200ms ease-out. Scale is 0.7 hidden, 1 shown and 0.9 pressed, over 110ms. The link remains a normal, focusable link. |
| Fluid | LiquidEther with Katana's settings: `mouseForce: 15, cursorSize: 300, isViscous: false, viscous: 30, iterationsViscous: 14, dt: 0.011, iterationsPoisson: 38, resolution: 0.5, dissipation: 0.992, isBounce: true, autoDemo: true, autoSpeed: 0.28, autoIntensity: 6.4, takeoverDuration: 0.25, autoResumeDelay: 350, autoRampDuration: 1.4`, with colours from the fluid palette. `dissipation` is our addition to the pinned source: multiply the advected velocity by it each step. Note the modification in the file header. |
| Everything else | Normal flow with local hover and focus transitions (150–200ms). No other scroll-pinned sections, no carousels except Katana's small-screen snap row, and no identical reveal on every section. |

Motion lifecycle rules:

- Server HTML is fully visible. Animation starts only after hydration, and never replays a blank intro on deep links, restored scroll or delayed hydration (initialise from the current position instead).
- No React state changes per frame. Loops stop when the document is hidden or the element is offscreen, and all listeners, timers and GPU resources are released on unmount.
- The page-wide pause control (see [Header](#header-fixed)) stops the same loops that reduced motion stops, but keeps the pinned layout. One feature-scoped context shares `paused` and `reducedMotion` with the motion islands, and nothing else; there is no global provider.
- Reduced motion is observed live:
  - it removes the pinned track and its overlap (ordinary flow);
  - it removes the fluid (static green artwork instead), the loops, the parallax and the follower;
  - counters show final values;
  - meaningful state changes keep a short opacity change.
- **Fit fallback:** measure whether the hero content fits the viewport. On short viewports, with enlarged text or at 200% zoom, switch to ordinary flow instead of cropping.
- **Hidden controls:** a hero control receiving keyboard focus makes its group visible until focus leaves. Faded groups take no pointer events.
- **Fluid loading:** the fluid loads lazily, after the hero text has painted, only when WebGL is available, reduced motion is off and `navigator.connection?.saveData` is not true. Device pixel ratio is capped at 1.5. Context loss falls back to the static artwork.

## Live beta prices

The ticker shows the same naira prices the customer app shows, labelled as beta prices.

- **Service:** add a public read to the customer catalog service, `appCatalogService.publicTicker()`.
  - It reuses the existing catalog query and the `listItem` valuation, refactored so the watchlist is optional.
  - It returns one row per `STOCK_PROFILES` entry that has a `logoPath`, in that order, and never test fixtures.
  - Rows the catalog cannot price come back with `null` prices, not dropped. On the local `testnet` customer chain all eight rows have `null` prices.
  - Each row carries the one-day line from `chart(stockId, "1D")`.
- **DTO:** in `src/types/landing.ts`, with integer strings and snake_case, and keys that pass the existing vocabulary check (`findCustomerLeaks`):

```ts
type PublicTickerRow = {
  ticker: string;            // display ticker, e.g. "AAPL"
  name: string;              // profile name
  sector: string;            // profile sector
  logo_path: string;         // "/stocks/aapl.svg"
  price_kobo: string | null; // null when unavailable or older than the display window
  price_status: AppPriceStatus; // "live" | "delayed" | "unavailable"; "delayed" shows a chip
  price_is_estimate: boolean;   // from the profile's new estimatedPrice flag (SpaceX)
  price_as_of: string | null;
  change_24h_bps: number | null;
  line_kobo: string[];       // empty when the chart has not enough data
};
type PublicTickerDto = { rows: PublicTickerRow[]; as_of: string | null };
```

- **Server wrapper:** `src/server/landing.ts` exports `getLandingTicker(): Promise<PublicTickerDto | null>`, wrapped in React `cache()`.
  - It catches every failure and returns `null`, reports the error through the existing Sentry reporting, and never throws into the page.
  - Profile-only rows are built from `STOCK_PROFILES` when it returns `null`.
- **Rendering:** the route is static with incremental regeneration (`export const revalidate = 300`).
  - It uses no cookies, headers or search params.
  - A build with an unreachable database must succeed and render the no-price fallback.
  - Money crosses into client components as integer strings, and is formatted with exact `BigInt` arithmetic (no floats). The builder writes a browser-safe formatter in the landing feature, unit-tested.
- **No public HTTP endpoint.** The page reads through the server wrapper, so no new public API surface exists.

## Waitlist

### Frontend

`WaitlistForm` renders a native `<form method="post" action="/api/v1/waitlist">`. It carries an email field and a hidden `source` field (`hero`, `join` or `waitlist_page`). It also has a honeypot field named `website`, visually hidden, `tabindex="-1"` and `autocomplete="off"`.

With JavaScript, a client island intercepts the submission and posts JSON with `fetch`. It renders the states below inline without moving layout, and announces results through a polite live region. Error text is the API's `message`, rendered directly, as the frontend guide requires.

| State | Shows |
| --- | --- |
| Idle | Email field and "Join the waitlist" |
| Submitting | Button text "Joining…", button disabled, field read-only |
| Joined (also for an email already on the list) | "You're on the list. We'll email you when a beta place opens." Replaces the form |
| Invalid email | The API message ("Enter a valid email address."), field marked invalid and linked to the message |
| Too many tries | The API message for the new `TOO_MANY_TRIES` code |
| Any other failure | The API message; the form stays usable |

Native browser validation (`type="email" required`) stays on.

### Backend

- **Route:** `src/app/api/v1/waitlist/route.ts`: `POST`, wrapped as `withMiddleware<WaitlistBodySchema, null, null>(handler, [sameOriginMiddleware, rateLimitMiddleware(...), bodyValidatorMiddleware(waitlistBodySchema)], { audience: "customer", bodyMode: "form", formRedirect: "/waitlist" })`.
- **Middleware additions** (documented in `BACKEND_PATTERNS.md`):
  - `bodyMode: "form"` accepts `application/json` and `application/x-www-form-urlencoded`. It parses the latter into a string record, rejects repeated keys and any other content type, and the result reaches validators as usual.
  - `formRedirect` (a path): for url-encoded requests only, success and every error become a `303` to `<path>?status=<code>`. The code is `joined` on success, otherwise the lowercase customer code (for example `check_details`, `too_many_tries`). JSON requests get the normal envelopes.
- **Validator:** `src/backend/validators/waitlist.validator.ts`, a strict Zod schema.
  - `email` is trimmed, lowercased, at most 254 characters and a valid email.
  - `source` is one of the three values, default `hero`.
  - `website` is an optional string of at most 200 characters.
  - The existing field message for `email` ("Enter a valid email address.") applies.
- **Service:** `src/backend/services/waitlist/` (singleton).
  - If the honeypot is filled, it returns success and stores nothing.
  - Otherwise it inserts the email with "do nothing on conflict", recording `source` and the privacy document's version.
  - The response is identical whether the email is new or already present, so nobody can test whether an address is on the list.
- **Success envelope:** `{ status, message: "You're on the list.", data: { joined: true } }`.
- **Rate limit:** `rateLimitMiddleware({ scope: "waitlist", limit: 5, windowSeconds: 600 })`, PostgreSQL-backed.
  - The key is `HMAC-SHA256(RATE_LIMIT_SECRET, scope + clientIp)`; raw IPs are never stored.
  - The client IP is the first `x-forwarded-for` hop, else `x-real-ip`, else a shared `unknown` bucket. This assumes deployment behind a proxy that sets the header; document that.
  - Going over the limit answers 429 with the new internal code `RATE_LIMITED`, mapped to the customer code `TOO_MANY_TRIES`: "Too many tries. Please wait a few minutes and try again."
  - Old buckets are deleted opportunistically (rows older than a day) or by an existing scheduled job; the builder picks one and tests it.
- **Data:** new Prisma models and one migration, following the schema's conventions (`cuid` ids, `@@map` to snake_case table names):

```prisma
model WaitlistEntry {
  id             String   @id @default(cuid())
  email          String   @unique // lowercased
  source         String   // "hero" | "join" | "waitlist_page"
  privacyVersion String
  createdAt      DateTime @default(now())
  @@map("waitlist_entries")
}

model RateLimitBucket {
  key         String   // HMAC of scope + client IP
  windowStart DateTime
  count       Int      @default(0)
  @@id([key, windowStart])
  @@map("rate_limit_buckets")
}
```

- **Environment:** a new required `RATE_LIMIT_SECRET` (at least 32 characters) in `src/env.js` and `.env.example`, and in every launcher that builds or starts the app (`scripts/landing-beta.mjs`, the Playwright config, CI and the cloud setup notes). Use a test-only value there.
- **Operator export:** `GET /api/v1/ops/waitlist?page=&size=` with `authMiddleware` and `operatorMiddleware`.
  - It returns `{ email, source, privacy_version, created_at }`, paginated with the existing envelope.
  - Document it in `docs/api/` and the backend runbook, including the manual step of adding invited emails to `PRIVY_BETA_ALLOWLIST`.
- **Error copy:** add `RATE_LIMITED` to `ErrorCode`, and `TOO_MANY_TRIES` to the customer mapping in `src/backend/services/app/copy.ts` and the table in `docs/api/customer-app.md`.

## Legal pages and the privacy note

- Add one sentence to the privacy document in `src/backend/content/documents.ts`: "If you join the waitlist, we use your email address only to invite you to the beta."
- Give the privacy document its own version string (the date of the change) and leave the other four documents on `2026-11-17`. Only `INVEST_DOCUMENTS` (terms, risks, how-shares-are-held) are required at onboarding, so no existing tester has to re-accept anything. A test confirms that.
- The waitlist stores the privacy version the visitor saw.

## Logos and assets

Every logo is an official file, stored locally, never hotlinked and never redrawn. Record its provenance in a manifest with these fields:

- `id`, `name`, `src`;
- `sourcePage`, `assetUrl`, `variant`, `treatment` (`official-light`, `filtered-white` or `unaltered`);
- `termsNote` and `operatorAccepted`, where decision 11 applies;
- `width`, `height`, `contentType`, `sha256`, `retrievedOn`.

Inspect every SVG for scripts, event handlers and external references before committing it.

**Providers** go in `public/brands/` with `public/brands/sources.json`. Replace the old light-ground files and delete `solana.svg`.

| Provider | Official source to start from |
| --- | --- |
| Yellow Card | press kit, https://yellowcard.io/press/ (logo ZIP `https://images.yellowcard.io/press-kits/Logo-Formats.zip`) |
| Paycrest | https://www.paycrest.io/ (site header mark) |
| Privy | https://www.privy.io/brand-guidelines and its linked official asset folder |
| Coinbase | Coinbase press and brand pages, https://www.coinbase.com/press |
| Base | https://brand.base.org/ (`https://brand.base.org/base-brand.zip`) |
| Circle (USDC) | https://www.circle.com/pressroom#brandkit (USDC logo kit) |
| Hydrex | https://www.hydrex.fi/ (site marks) |
| o1 Exchange | https://o1.exchange/brand |
| Bankr | https://bankr.bot/ (official symbol) |
| Stonks Exchange | https://www.thestonks.exchange/ (site logo) |
| BaseStonk | https://basestonk.io/ (app icon) |
| Feel.cash | https://feel.cash/launchpad (official mark) |

**Stock logos** go in `public/stocks/<ticker>.svg`, matching the `logoPath` values the backend already returns, so the future customer app reuses them, with `public/stocks/sources.json`.

- They identify the companies whose prices the beta shares track (nominative use), with no endorsement implied.
- Prefer each company's own brand page:
  - NVIDIA: https://www.nvidia.com/en-us/about-nvidia/legal-info/logo-brand-usage/
  - Meta: https://about.meta.com/brand/resources/
  - Amazon: https://press.aboutamazon.com/
- Where a company publishes none (Apple, Tesla, Microsoft, Alphabet, SpaceX), use the corresponding Wikimedia Commons file of the official mark, with its page URL as provenance.
- Badges are 40px circles: either the brand's own colour with its light mark, or the official full-colour mark on white.
- Never use a community icon set.
- **Restricted brands:** where a brand's published terms restrict third-party use (Apple, Microsoft and NVIDIA as of 2026-11-17, and any provider found to say the same), use the official mark anyway under decision 11. Record a `termsNote` quoting the restriction and `operatorAccepted: "2026-11-18"` in the manifest entry.
- **Letter fallback:** the logo badge is a Server Component. At build time it checks whether its file exists in `public/stocks/` or `public/brands/`.
  - If the file is missing, a stock renders a ticker-letter badge (for example "AAPL" in Bricolage on `surface-raised`), and a provider renders its name set in type.
  - Deleting a logo file is the whole removal procedure.
  - A unit test asserts that every file present has a manifest entry, and that the fallback renders when a file is absent.

**Authored artwork** (original, no Katana material):

- the static hero fallback glow;
- the "How it works" panels and light beam;
- the safeguards light streaks;
- the join-panel light beams;
- the footer glow;
- the favicon, wordmark and social image.

Export rasters as AVIF with WebP fallback at explicit dimensions, and record each raster's origin (the generating script or SVG source) beside it. Decorative art is `aria-hidden` and carries no information.

**Licences in the repository:**

- `src/components/landing/fluid/LICENSE-react-bits.md`, holding the MIT + Commons Clause notice beside the vendored LiquidEther source and its pinned commit;
- the OFL text for Bricolage, if a font file is vendored for the social image.

## Accessibility and fallbacks

- One `main` landmark, a skip link to `#main-content`, logical heading order, labelled navigation and sheet (dialog title and close control), and visible focus everywhere.
- Every control is at least 44px.
- Logo `alt` text is "<Name> logo"; stock badges use the company name.
- The ticker exposes one readable, non-duplicated list to assistive technology. The moving duplicate is `aria-hidden`. The page-wide pause control stops it, along with every other self-running motion.
- Counters expose their final values. Animated digits are never announced.
- **Without JavaScript:**
  - all content, anchors and FAQ answers work;
  - the mobile sheet degrades to a `<noscript>` link list;
  - the waitlist posts natively and lands on `/waitlist`.
- The page works with WebGL unavailable, with the database unreachable, at 360, 390, 768, 1280 and 1440 wide, and at 200% browser zoom. No horizontal overflow and no clipped figures.
- Contrast is measured on rendered captures, including over the brightest fluid frame.

## Performance budget

| Measure | Budget |
| --- | --- |
| Largest Contentful Paint | ≤ 2.5s, mid-range Android over 4G (Lighthouse mobile profile) |
| Cumulative Layout Shift | < 0.1 |
| Initial JavaScript for `/` | ≤ 200 KB compressed, excluding the lazy fluid chunk |
| Fluid chunk | lazy, after first paint, skipped on Save-Data, reduced motion and no WebGL |
| Fonts | one self-hosted variable family, `display: swap`, `latin` + `latin-ext` only |
| Images | AVIF/WebP with explicit dimensions; logos as SVG |

## Files: replace, keep, delete

- **Delete:**
  - every file in `src/components/landing/`;
  - `tests/landing/*`;
  - `e2e/landing.spec.ts` and `e2e/motion.spec.ts` (rewritten for the new page);
  - `src/app/icon.svg` and `src/app/opengraph-image.png` (replaced);
  - the light-ground files in `public/brands/`.
- **Keep and adapt:**
  - `src/primitives/*` keep their files and APIs. Restyle `button`, `badge` and `sheet` through the token values; the others are left untouched for the future app.
  - `src/utils/cn.ts`;
  - `playwright.config.ts`, `e2e/test.ts` (network guard: allow same-origin assets and the waitlist `POST`, which tests intercept);
  - `scripts/landing-beta.mjs` (add the new environment values);
  - `src/app/layout.tsx` (new font and metadata).
- **New:**
  - the `(marketing)` layout, `/legal/[slug]` and `/waitlist` routes;
  - feature components in `src/components/landing/` (kebab-case files, PascalCase exports) with the vendored fluid source under `src/components/landing/fluid/`;
  - `src/server/landing.ts` and `src/types/landing.ts`;
  - the backend waitlist and rate-limit files listed above;
  - the Prisma migration;
  - `public/stocks/*`;
  - the surface brief at `.impeccable/surfaces/src-app-marketing-page-tsx.md`.
- **Ignore in Git:** `.superpowers/`, `.impeccable/review/`, `.impeccable/mocks/` and `.impeccable/build/`. Commit `.impeccable/surfaces/` and `.impeccable/design.json`.

## Documentation to update

- **`DESIGN_SYSTEM.md`:** rewritten for this world from the built result: tokens, type, shape, motion contract, fallbacks, layers. It is the file Impeccable's documenter writes instead of `DESIGN.md`.
- **`FRONTEND_PATTERNS_GUIDE.md`:**
  - replace the landing-specific rules: one dark theme, Bricolage with `latin-ext`, static generation with incremental regeneration and a service-backed read for the ticker, the waitlist form pattern with progressive enhancement, the `/legal` reading pages;
  - remove "the root route makes zero calls" in favour of "no client-side API calls except the waitlist POST";
  - point the authority links at this design and its plan.
- **`BACKEND_PATTERNS.md`:** the `form` body mode, `formRedirect` and `rateLimitMiddleware`.
- **`PRODUCT.md`:** the new audience, action and brand.
- **`README.md`:** the landing section (preview, environment, end-to-end commands).
- **`docs/api/`:** the waitlist route, the ops export and the new error code.
- **`docs/runbooks/backend-beta.md`:** exporting the waitlist and inviting testers.

## Verification

Repository rule: write tests with each task; run every gate once, at the end.

- **Unit (Vitest):**
  - hero frame and smoothing formulas against the contract values;
  - the counter decimals rule and easing;
  - the naira and percentage formatters (exact `BigInt`, ₦ and minus sign);
  - the document markdown renderer;
  - the waitlist validator and the rate limiter (fake clock);
  - `publicTicker` (only the eight profiled stocks, in order, `null` when stale, no vocabulary leaks);
  - the privacy-version change not touching required agreements.
- **API (Vitest with the isolated test database), for `POST /api/v1/waitlist`:**
  - JSON success;
  - a duplicate email answers identically;
  - the honeypot answers identically and stores nothing;
  - an invalid email answers 422;
  - another origin answers 403;
  - the sixth request in the window answers 429;
  - url-encoded success and error answer 303 to the right `/waitlist?status=`.
- **Also API:** the ops export rejects non-operators.
- **End to end (Playwright, production build, unreachable database), at 360×800, 390×844, 768×1024 and 1440×1000:**
  - the page renders the no-price ticker fallback;
  - every anchor and the skip link work;
  - the sheet's keyboard cycle and focus restoration;
  - hero geometry and opacity checkpoints at progress 0, 0.3, 0.6 and 1 after settling, plus reversal;
  - the header button appears after handover;
  - the ticker's direction, its 36s duration and its pausing;
  - counters reach their final values;
  - the diagram advances and pauses;
  - the pause control stops and resumes the fluid, ticker, panels and diagram without resetting them, and is reachable from the keyboard at every size;
  - ticker rows show "Delayed" and "Estimate" chips when the data says so, and the caption carries a date when prices aren't from today;
  - reduced motion gives static ordinary flow;
  - no JavaScript keeps content and a native form;
  - with WebGL disabled the static art shows;
  - the waitlist states, using an intercepted API;
  - `/legal/*` and `/waitlist?status=` render;
  - no horizontal overflow, no clipped figures, valid logo dimensions;
  - the network guard records no external request.
- **Rendered review:**
  - capture desktop (1440) and mobile (390) full pages and the hero checkpoints into `.impeccable/review/`;
  - re-capture katana.network at the same checkpoints in a separate browser context and compare behaviour and finish, recording deviations;
  - run Impeccable's detector once over the changed UI;
  - run the finish review (Impeccable's `impeccable-finish-reviewer` when installed, otherwise a fresh-context review against this contract);
  - act on its verdict.
- **Final gate, run once:** `bash scripts/setup-cloud.sh`, `yarn prisma validate`, `yarn prisma generate`, `yarn test:contracts`, `yarn test`, `yarn lint`, `yarn typecheck`, `node scripts/landing-beta.mjs build` (or `yarn build` with the same isolated environment) and `yarn test:e2e`. Record the actual results in a review record.

## Calls made by the planner

These were not discussed with the operator. They are proposals the operator can overturn while reading.

1. The logo row is labelled "Built to work with", instead of Katana's "Trusted by", because no provider has a partnership with V3ST yet. Its caption says most of the services are in test mode or simulated, which is what the code shows.
2. The hero holds the waitlist form in working form rather than a button that scrolls elsewhere (Impeccable's Persuade rule). The header button jumps to the closing form instead of opening a modal.
3. The second hero button is dropped. Katana has two because it sells two products; V3ST has one action.
4. Navigation is Stocks, Earn, How it works, Safeguards, FAQ. The mock's "Payouts" became "Safeguards" because payouts live inside How it works and the FAQ.
5. The ticker shows real beta prices with honest labels and a no-number fallback, which needs one new read-only service method and a static page that regenerates every 5 minutes.
6. The counters and Earn figures are real product rules derived from `policy.ts`, never usage statistics.
7. An FAQ is added (Katana has none), along with static `/legal` pages from the app's documents and a `/waitlist` result page.
8. The privacy document gains one waitlist sentence and its own version.
9. The waitlist stores email, source, privacy version and time only. No IP is stored (rate limiting uses a keyed hash), and no email is sent.
10. The fluid is skipped on Data Saver, and its pixel ratio is capped at 1.5.
11. The page stays `noindex` until a public-release decision.
12. Unused primitives are kept for the future customer app.
13. Ticker rows mark delayed prices and SpaceX's estimate, and the caption carries a date when prices aren't from today. This adds one profile flag and one field in the data passed to the page.

Settled after the design review, from the project's own rules: a page-wide pause control (see [Header](#header-fixed)). Both `FRONTEND_PATTERNS_GUIDE.md` and WCAG 2.2.2 require it, so it is not a planner's call.

## Left to the builder

- The exact authored artwork, within the palette, contract and licences.
- Per-brand logo variant and treatment, within each brand's guidelines.
- Component boundaries and names, within the frontend guide.
- How old rate-limit buckets are cleaned up.
- Fine-tuning the fluid palette for contrast.
- Migration names and the social-image mechanism.
