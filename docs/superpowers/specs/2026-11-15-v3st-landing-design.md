> **Superseded (2026-11-18):** replaced by the [2026-11-17 landing redesign spec](../specs/2026-11-17-v3st-landing-redesign-design.md), its [plan](../plans/2026-11-18-v3st-landing-redesign.md) and its [review](../reviews/2026-11-18-v3st-landing-redesign.md).

# V3ST landing page design specification

Status: planning handoff only. Date: 2026-11-15. No application implementation is part of this document change.

The user approved an illustrative landing-page demo, light surfaces, forest green, and the original six-task plan. The subsequent direction applies Impeccable and requires Katana's scrolling, animation and transition behavior, with authentic provider, asset and chain marks. This specification incorporates those changes. A separate cloud agent will implement it.

## Product and outcome

The visitor is a Nigerian-first retail investing newcomer who wants to understand funding, fractional exposure, costs, risks and access to proceeds before creating an account. The page is a **Persuade** surface; its embedded demo is an **Operate** surface. The primary action is **Explore a demo**. No signup, waitlist, identity submission or real transaction belongs here.

The narrative is: naira funding → fractional tokenized stock exposure → separately chosen income strategies → eligible confirmed proceeds paid out or reinvested. Holding stock or idle cash does not generate automatic income. Tokenized exposure must not be presented as direct legal ownership of underlying company shares or guaranteed dividends.

All of V3ST remains beta. The landing demo is independent local fixture data, not even an execution of the backend's local testnet. Actual onchain provider adapters remain disabled/unverified. Brand marks identify the documented ecosystem and do not prove integration, sponsorship or endorsement.

## Authority and adaptations

Read `AGENTS.md`, `CLAUDE.md`, `Design.md`, both architecture guides, all documentation under `docs/`, and especially:

- `docs/superpowers/plans/2026-11-13-v3st-naira-ramps-and-payouts.md` in full, including adaptation table, beta policy and task interfaces.
- `docs/superpowers/specs/2026-11-14-v3st-onchain-stocks-and-income-design.md` and its companion implementation plan.
- `docs/api/onchain-investments.md`, `docs/decisions/friday-income-schedule.md`, `docs/decisions/onchain-providers.md`, `docs/decisions/onchain-ledger.md` and both runbooks.
- `docs/implementation-review.md` and current source for what is actually implemented.

The newer onchain and Friday decisions override old automatic-earnings assumptions. Current source and README show an implemented backend and a starter frontend; older claims that the entire repository is unimplemented are stale.

| Earlier choice | Final instruction |
| --- | --- |
| Only restrained transitions; no autoplay ticker | Reproduce the measured Katana choreography below, including a pausable ticker, fluid background and diagram animation. |
| Katana as general inspiration | Match the captured behavior, sequencing and timing, with V3ST copy, original artwork and the approved green/light palette. |
| Katana's “Trusted by” section | Preserve its centered, generously spaced logo layout. Heading: **Provider ecosystem**. Caption: **Integrations are simulated in this beta. Provider names identify the documented ecosystem; they do not imply endorsement.** |
| Lightweight SVG artwork only | Keep original SVG growth forms and diagrams; add a lazily loaded interactive fluid background for behavioral fidelity. Static SVG remains the fallback. |
| Generic guide examples | Use V3ST routes/content, a single light theme, `motion/react`, and no query/form/theme/global-state providers for this page. |
| Utils barrel everywhere | `src/utils/index.ts` imports `node:crypto`. Frontend imports `cn` from `@/utils/cn` and exact-money helpers directly from their browser-safe module. |
| Superpowers per-task test runs | Write tests with tasks; run all gates only at the end under `CLAUDE.md`. Do not claim red/green evidence before execution. |
| Impeccable concept workshop | The user has already pinned direction, audience, CTA, palette and reference. Apply the brief, motion, craft, responsive and review guidance without reopening those decisions. |

Do not overwrite `Design.md` with Impeccable's generic `DESIGN.md`: those names collide on case-insensitive filesystems. Use `DESIGN_SYSTEM.md` for visual decisions, `PRODUCT.md` for concise product truth, and this specification as the surface brief.

## Visual direction

| Token or rule | Value |
| --- | --- |
| Primary | Forest green `#166534`; white text on primary buttons |
| Canvas | Warm ivory `#F7F8F2` |
| Surface / secondary | White / pale sage `#E6EEDD` |
| Text / muted text | Deep green `#153528` / `#506455`; verify contrast on every actual surface |
| Decorative accent | Fresh green `#B9D987`, never small body text on ivory |
| Rules | Sage-gray `#CED9CC`; interactive boundaries must still meet applicable contrast |
| Typography | Retain Geist. Hero `clamp(2.75rem, 6.67vw, 6rem)`, line height 1.05, tracking no tighter than `-0.04em`. Headings balance; financial figures use tabular numerals. |
| Width and spacing | 1,200px content width, 24px mobile gutters, 80–112px desktop section spacing and 56–72px mobile spacing |
| Shape | Pill CTAs/navigation; restrained rounded panels; flat lists and rules for explanations |
| Artwork | Original growth arcs, leaf contours and a four-stage investing diagram; no Katana illustrations, text, statistics or logo assets |

The hero is spacious and centered. V3ST's longer headline wraps intentionally into two or three lines; do not inherit Katana's `white-space: nowrap`. Keep sufficient ivory coverage behind text throughout the fluid animation. The page remains light, including system dark mode. Real brand marks preserve their approved colors and geometry.

Apply Impeccable's craft guidance: strong type hierarchy, deliberate whitespace, one focal scroll sequence, content visible before enhancement, accessible focus and selection colors, no generic identical-card page, no unsupported growth charts, no decorative eyebrow above headings. Do not replace the requested reference with a new aesthetic.

## Page content and navigation

| Section / anchor | Required content |
| --- | --- |
| Header / `#top` | V3ST wordmark, How it works → `#how-it-works`, Explore → `#demo`, FAQs → `#faq`, Explore a demo CTA, persistent **Beta · Test funds only** indicator. No invented social, legal or app links. |
| Hero | **Start with naira. See investing clearly.** Supporting copy: **Explore fractional tokenized stock exposure, understand the fees, and follow eligible earnings through to a bank payout.** Primary **Explore a demo** → `#demo`; secondary **How it works** → `#how-it-works`; label **An illustrative preview. No account required.** |
| Hero lower rail | Four factual journey labels: Add naira / Explore stocks / Choose a strategy / Review proceeds. No invented usage metrics or count-up returns. |
| First product story / `#explore` | Explain fractional exposure. Katana-style split text/ticker composition; ticker uses fictional TSTA/TSTB and clearly labelled settlement/network context, not a live market feed. CTA goes to `#demo`. |
| Provider ecosystem / `#ecosystem` | All nine documented provider groups below, using authentic marks; static wrapped logo arrangement, not a logo carousel. Separate chain/settlement row for Base, Solana and USDC. Include beta caption. |
| How it works / `#how-it-works` | An ordered, server-rendered four-step walkthrough: fund with naira, inspect fractional exposure and costs, separately choose a strategy, review eligible proceeds. Text remains readable without the animated diagram. |
| Product stories | Alternating text and interface illustrations: fractional quantities and valuation; fees before confirmation; no wallet-connect, seed-phrase or gas-top-up step in the intended experience. Clarify simulated beta and risks. |
| Interactive demo / `#demo` | Four chapters with local controls, independent figures and reset; contract below. |
| Friday proceeds / `#friday` | Receipt-backed confirmed income, payout vs reinvestment, gross minimum and rollover; **Friday processing: 08:00–23:00 Africa/Lagos**. Timing is a processing window, not arrival or income promised every Friday. |
| FAQ / `#faq` | Beta availability, tokenized exposure vs underlying shares, income sources, possible losses, example fees, withdrawals, and rollover. Server-rendered native `details`/`summary` or an equally usable no-JS structure. |
| Closing CTA and footer | Repeat **Explore a demo**, original growth artwork, oversized V3ST wordmark; beta disclosure and working section links. |

FAQ answers must explain that strategy returns can be zero, principal can fall, rewards may require conversion, valuation is not cash, and sale proceeds can include returned principal. Do not promise safety, regulatory approval, custody protection, audits, guaranteed yields, commercial fees or instant settlement.

## Katana behavior contract

Reference inspected on 2026-11-15: [katana.network](https://katana.network/), current **Trade. Earn. Own.** version. Browser observations at 1440×1000 and 390×844 were cross-checked against its publicly served CSS/JavaScript. These measurements specify behavior; do not copy Katana's application source or assets. If the reference later changes, use this captured contract and record differences rather than silently redesigning.

Use native document scrolling. No Lenis/GSAP dependency, wheel interception, scroll-jacking or page-wide scroll snapping is needed. Motion values/ref updates handle continuous motion; React state must not rerender the full page every frame.

Let `S(x) = clamp(x, 0, 1)^2 × (3 − 2 × clamp(x, 0, 1))`. Intro opacity for interval `[a,b]` is `S((elapsedMs-a)/(b-a))`. Let target progress `p = clamp(-heroRect.top / (heroRect.height - viewportHeight), 0, 1)`. Smooth progress using `q += (p-q) × (1 − (1−0.18)^(dt/16.67))`, with `dt` capped at 64ms. Handover is `h = S((q−0.30)/0.70)`. Each element's opacity is its intro opacity multiplied by `1 − S((h−fadeStart)/(fadeEnd−fadeStart))`.

| Behavior | Captured measurement and V3ST mapping |
| --- | --- |
| Hero geometry | 160vh outer track, sticky `top: 0` 100vh stage. Following content overlaps the track by 45vh, so content begins at 115vh. Match this on normal desktop/mobile viewports where content fits. |
| Hero entrance | Background 0–900ms; heading 200–900ms; copy 480–1180ms; buttons 760–1460ms; lower rail 1040–1740ms. Smoothstep opacity, no arbitrary slide-up. |
| Scroll fade | In handover `h`: buttons fade 0–0.40; lower rail 0–0.36; copy 0.18–0.66; heading 0.40–1; background 0.45–1. Reverses continuously when scrolling upward. |
| Fixed navigation entrance | Intro cue is `S((elapsedMs−2120)/900)`. Center navigation moves from `top:-120px` to 0 within its fixed shell; logo from `translateY(-160%)` to 0, both with cue opacity. Desktop header CTA follows `h` with the same translate/opacity pattern. |
| Mobile navigation | Left sheet, width `min(86vw,340px)`, full dynamic viewport height. Opening 260ms, closing 170ms, `ease-out`; overlay fades with the same durations. Trap focus, Escape closes, scroll locks while open, focus returns to trigger. |
| Market ticker | Vertical list duplicated once; translateY 0→−50%, linear, duration `uniqueRowCount × 4.5s` (reference seven rows: 31.5s). Viewport height 22rem mobile / 26rem at ≥640px; mask transparent edges, opaque from 12% to 88%. Pause on hover; also provide keyboard-focus pause and visible pause/resume. |
| Diagram entrance | Start once at intersection threshold 0.20; each node opacity 0→1 and translateY 12px→0 over 420ms ease-out, stagger 60ms. Static text is never gated on this. |
| Floating tiles | TranslateY 0→−3px→0 over 8s ease-in-out; each tile delayed by `index × −1.3s`. Original V3ST diagram, not Katana's six product offerings. |
| Diagram highlight | Decorative active path advances every 3,600ms while visible and unengaged. Hover intent 120ms; pointer-leave grace 140ms. Hover/focus highlight transitions 200ms. It never changes demo selections or implies strategy consent. |
| Diagram background parallax | `translateY(clamp((viewportHeight/2 − sectionCenterY) / ((viewportHeight+sectionHeight)/2),−1,1) × 70px)`. Oversize background by 70px at both ends. Animate original artwork, not text. |
| Large story-link cursor | Fine pointer only: labelled CTA follower with smoothing coefficient 0.20 normalized by frame delta. Opacity 200ms ease-out; scale 0.7 hidden, 1 shown, 0.9 pressed; scale transition 110ms. Restrict to the large story link, not all controls. Native focus/CTA remains available. |
| Provider strip | Static centered wrapping row, substantial clearspace; original reference marks are 24px mobile /32px desktop high. Respect each brand's own minimum dimensions instead of forcing uniform distortion. |
| Remaining sections | Normal document flow and local hover/focus transitions. Do not invent scroll-pinned sections, whole-page horizontal carousels or identical reveal effects on every paragraph. |

### Fluid background

The reference lazily loads a pointer-responsive fluid field, with an autonomous idle path. Captured parameters: `mouseForce=15`, `cursorSize=300`, `isViscous=false`, `viscous=30`, `iterationsViscous=14`, `dt=0.011`, `iterationsPoisson=38`, `resolution=0.5`, `dissipation=0.992`, `isBounce=true`, `autoDemo=true`, `autoSpeed=0.28`, `autoIntensity=6.4`, `takeoverDuration=0.25`, `autoResumeDelay=350ms`, `autoRampDuration=1.4s`. These are reference settings, not assumed props of an unrelated package.

Implement an original green field or adapt a pinned, licensed [React Bits Liquid Ether](https://reactbits.dev/backgrounds/liquid-ether) source revision. Its [current source](https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/LiquidEther) has a different API from the observed reference; record the exact revision and translate settings by observed behavior, never pass ignored props. Its [license](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) is MIT plus Commons Clause, not plain MIT; retain the applicable notice when incorporating code. The native WebGL implementation avoids a mandatory Three.js dependency.

Use an ivory background and sage/forest/fresh-green palette. Load only after readable hero content. Layer a stable ivory veil where needed for text contrast. Match autonomous motion, pointer takeover and resume timing in browser review. Keep resolution/device-pixel-ratio bounded, release resources on unmount, pause offscreen/when the document is hidden, and recover from missing WebGL/context loss with static original SVG art. No canvas text, essential information or controls.

### Deliberate accessible adaptations

- No-JavaScript/default server output is fully visible. Enable motion only after initialization; avoid blank content when a chunk fails. If delayed hydration means the visitor has already read the hero, skip its entrance rather than flashing visible copy back to transparent. Do not delay the persistent beta badge or skip link behind the intro.
- `prefers-reduced-motion`, the page's **Pause animations** control, hidden documents and offscreen elements stop decorative motion. Reduced motion removes the pinning/negative overlap, uses static artwork, exposes a static ticker/list, and preserves every action and explanation. Pause state lives only in component state.
- Short viewports, enlarged text and 200% zoom must not crop a fixed-height hero. Measure whether the composition fits; switch to ordinary document flow when it does not. This is an explicit fit accommodation, not permission to omit mobile motion at normal sizes.
- Fading controls must not remain invisible keyboard/pointer targets. Keep the global navigation usable; when a hero control receives keyboard focus, make its group visible and keep it visible until focus leaves. Deep-link entry does not replay a blank hero above the target.
- The decorative ticker is not a live price feed. Keep its readable, nonduplicated equivalent available to assistive technology. Do not repeatedly announce the animation.
- The animated diagram is separate from the demo. Autoplay highlights presentation only; explicit visitor actions alone change demo stage/scenario/strategy state.

## Demo state and fixture contract

Use local `DemoStage`, `DemoScenario` and `LandingDemoFixture` types, not fabricated financial API DTOs. Store money as integer strings. No fetch, server action, wallet SDK, RPC, localStorage, cookies, account/order creation or backend service imports.

| Chapter | Required independent fixture and controls |
| --- | --- |
| Add naira | Example gross `10000000` kobo (₦100,000), example fee `100000` (₦1,000), available `9900000` (₦99,000). Example rate ₦1,500 per USD, exactly 66.000000 USDC-equivalent settlement units (`66000000` micro-units). Label rate and fees as illustrative beta settings, not a provider quotation or recommendation. No transferable account number. |
| Explore stocks | Fictional Test Stock A / TSTA and Test Stock B / TSTB; raw quantity + decimals, reference price, value explanation. Example A: `250000` at 6 decimals = 0.25 units, reference ₦40,000/unit → ₦10,000. Example B: `1250000` at 6 decimals = 1.25 units, reference ₦8,000/unit → ₦10,000. These are unrelated to the funding example. Valuation/appreciation is not payable cash. |
| Optional strategies | Default **No strategy selected**. Opening the chapter changes no consent. Separate **Open strategy example** action reveals the illustrative mechanism and scenarios: eligible confirmed proceeds, zero income and principal loss. Eligible-income fixture `500000` kobo; zero-income fixture `0`. The loss example returns `1800000` kobo (₦18,000) from `2000000` (₦20,000) illustrative principal, a `-200000` (−₦2,000) change with zero income; returned principal is separate from income. Describe unconverted stock rewards as not yet payable. |
| Review proceeds | Explicit **Payout** / **Reinvest** comparison and **Qualifying** / **Below minimum** / **At minimum** scenarios. Qualifying gross `500000`, fee `10000`, received `490000` kobo. Under minimum `199999` rolls over with no fee charged. At minimum `200000` qualifies before fees; with the example fee `10000`, received `190000`. Reinvestment describes allocation of eligible confirmed proceeds subject to separate authorization and costs; do not silently apply the bank-payout fee to it. |

Every chapter says **Independent illustrative example**. Never draw a chart connecting the funding amount to the income example. A strategy selection is a demo selection only, not financial consent. **Reset demo** returns to Add naira, first fictional stock, no strategy, eligible-proceeds scenario, qualifying payout, and no persisted state. Mask any bank illustration as **Example bank · account •••• 1234**, with no real identity fields.

User-triggered demo panel changes use a short 200ms opacity transition, matching the reference's local highlight response; keep height in ordinary document flow. Reduced motion makes the change immediate. The demo has no automatic chapter advance.

Keep a visible noninteractive four-step explanation and a `noscript` note: **This walkthrough is available without JavaScript. Enable JavaScript to try the interactive examples.**

## Provider and asset source inventory

Planning verified official pages/asset locators, not the final downloaded image bytes. Implementation must inspect the selected files and record provenance in `public/brands/sources.json`. Do not hotlink at runtime or scrape logos from Katana.

| Group | Official source and asset locator | Beta meaning |
| --- | --- | --- |
| Yellow Card | [Site](https://yellowcard.io/), [press](https://yellowcard.io/press/); official-page [icon PNG](https://framerusercontent.com/images/rGNd8ylttOXM8MzWkNs2c3WiojY.png), [larger icon](https://framerusercontent.com/images/2RmXd0Q0yZDEG4Ue1CME5W09F0.png) | Simulated ramp; no verified live partnership claim |
| Paycrest | [Site](https://www.paycrest.io/); [icon PNG](https://framerusercontent.com/images/dG5eMeoxIGQdgKqlAfRE6IxxDg.png); original inline/data-URI header SVG `viewBox="0 0 134.98 28"` | Simulated-only ramp |
| Privy | [Brand guidelines](https://www.privy.io/brand-guidelines), [official assets](https://drive.google.com/drive/folders/1l3XqWHGsJDVW-O_AbhsImc08mhqMjSZ3?usp=sharing); [icon fallback](https://framerusercontent.com/images/oPqxoNxeHrQ9qgbjTUGuANdXdQ.png) | Documented identity/wallet provider, simulated beta |
| o1 Exchange | [Brand kit](https://o1.exchange/brand); [horizontal SVG](https://o1.exchange/brand/o1-horizontal-color.svg), [mark SVG](https://o1.exchange/brand/o1-mark-color.svg) | Actual adapter disabled; local router replica |
| Bankr | [Site](https://bankr.bot/); [SVG mark](https://bankr.bot/favicon.svg), [512px PNG](https://bankr.bot/pwa-icon-512.png) | Actual adapter disabled; local managed-wallet replica |
| Hydrex / Hydropump | [Site](https://www.hydrex.fi/); [icon PNG](https://www.hydrex.fi/hydrexIcon.png); inline official mark `viewBox="0 0 46 45"`, wordmark `viewBox="0 0 210 65"` | One provider group, local pool/locker replicas; do not invent a separate Hydropump mark |
| Stonks Exchange | [Site](https://www.thestonks.exchange/); [header logo PNG](https://www.thestonks.exchange/logo.png) | Actual adapter disabled; local versioned distribution replica |
| BaseStonk | [Site](https://basestonk.io/); [256px icon](https://basestonk.io/app-icon.png) | Actual adapter disabled; local hook/fee replica |
| Feel.cash | [Official site](https://feel.cash/), [documented launchpad](https://feel.cash/launchpad) | Actual adapter disabled; local distribution replica. Exact logo locator still needs resolution: planning HTTP/browser requests failed. |
| Base | [Brand guidelines](https://brand.base.org/), [official ZIP](https://brand.base.org/base-brand.zip) | Documented target network; beta execution is local chain 31337, not Base mainnet |
| Solana | [Brand guidelines](https://solana.com/branding), [official mark SVG](https://solana.com/src/img/branding/solanaLogoMark.svg) | Documented architecture/legacy simulations, not a new live chain integration |
| USDC | [Circle brand kit](https://www.circle.com/pressroom#brandkit), [official ZIP](https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Pressroom/brandkit/logo-downloads/usdc.zip) | Settlement concept; local test token is not issuer-backed USDC |

Use approved wordmarks where available; otherwise pair a verified symbol with a plain-text name. Preserve clearspace and approved color variants, including Circle's minimum sizes. Do not approximate logos with Phosphor icons, emoji, generated imagery or hand-drawn paths. Generic UI actions use Phosphor SSR icons. TSTA/TSTB remain visibly fictional; Apple, Tesla, Nvidia and unrelated crypto logos must not imply offered assets. Busha and Blockradar are research alternatives, not documented implemented provider groups, and do not belong in this strip.

Resolve Feel.cash's official mark during Task 1 before logo-section acceptance. If the site remains inaccessible, retain its honest text name and record the unmet asset requirement; do not fabricate a logo or claim the complete real-logo requirement passed.

## Feature-to-document/API map

Paths below are existing `/api/v1` contracts for content fidelity only. The landing page makes **zero** calls to them.

| Landing concept | Source of truth | API reference |
| --- | --- | --- |
| Naira funding, fee/rate breakdown | `Design.md`; ramps plan adaptation; current deposit/rate services | `GET /rates/ngn`, `POST /deposits`, `GET /deposits/:id` |
| Fractional exposure, quantity and valuation | Onchain spec; `docs/api/onchain-investments.md`; onchain ledger decision | `GET /stocks`, `GET /stocks/:id`, `POST /investments/quote`, `POST /investments`, `GET /portfolio` |
| Explicit optional strategy | Onchain spec and provider decision | `GET /strategies`, `POST /strategy-quotes`, `POST /investment-authorizations`, `POST /strategy-operations`, `GET /strategy-positions` |
| Reward conversion vs cash | Onchain API and ledger decision | `GET /portfolio` reward receipts, `POST /reward-receipts/:id/convert` |
| Payout, reinvestment, rollover | Friday decision; earnings/withdrawal services | `GET /earnings`, `PUT /earnings/preference`, `POST /withdrawals/quote`, `POST /withdrawals` |
| No user gas/seed-phrase steps | Onchain API; wallet/relayer policy | Backend-managed execution only; no wallet-connect integration on the landing |
| Provider status and real logos | Provider decision, evidence registry, design provider selection | `GET /ops/integrations` is operator-only; never fetch it for this public page |

Authentication, KYC/BVN, screening, custody operations, treasury/bridge management, SSE, operator dashboards and notifications are background product context, not new landing functionality. Do not add their screens or integrations under this assignment.

## Acceptance summary

Anonymous `/` must render with no database/API/provider access. All anchors, mobile navigation, demo controls, reset and pause/resume work. Financial fixtures remain exact. Product truth and disclosures survive no-JS and reduced-motion use. At 360, 390, 768 and 1440px, including 200% zoom, no viewport overflow, trapped scrolling or clipped figures is allowed. Match the captured motion at normal desktop/mobile sizes and record the accessible exceptions. Finish with final-only repository gates, browser network-containment tests, rendered visual review and an honest evidence report. No deployment or live-provider activation.
