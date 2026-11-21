# V3ST design system

**Final, 2026-11-18.** This file describes the built marketing world (`/`, `/legal/*`, `/waitlist`), written from the result. Authority: the [redesign specification](docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md), its [plan](docs/superpowers/plans/2026-11-18-v3st-landing-redesign.md) and the [review record](docs/superpowers/reviews/2026-11-18-v3st-landing-redesign.md).

This file is the design system. Never create a file named `DESIGN.md`: on case-insensitive filesystems it collides with `Design.md`, the product architecture.

## Theme

One dark theme. There is no Tailwind config file, no theme provider and no toggle. Tokens live in `@theme static` in `src/styles/globals.css`:

| Token | Value | Use |
| --- | --- | --- |
| `void` | `#020604` | page ground |
| `inset` | `#050B08` | join panel ground |
| `surface` / `surface-raised` | `#08100C` / `#0C1712` | cards, chips, fallbacks |
| `stroke` | `#15211B` | hairline borders |
| `control-border` | `#5A6F62` | input pill border |
| `ink` / `heading` | `#E3EBE6` / `#FFFFFF` | body / display text |
| `muted-foreground` / `subtle` | `#93A69B` / `#7F9187` | secondary copy |
| `signal` / `signal-hover` | `#00804D` / `#009459` | filled pills, glow, price-row outline |
| `gain` / `loss` | `#3DDC97` / `#FF6B5A` | positive / negative figures |

Fluid palette (LiquidEther `colors`, `FLUID_COLORS` in the motion contract): `["#0D6A3D", "#0D6A3D", "#008A52"]`. Authored artwork uses those two greens plus `signal` and, sparingly, `gain` (`#3DDC97`) for highlights.

Browser surfaces are themed: `signal` selection with white text, `gain` caret and 2px focus ring at a 3px offset, a `#23342B` scrollbar thumb on `void`, 0.2em underline offset, `color-scheme: dark`.

## Type

Archivo via `next/font` with the `latin-ext` subset, which carries the naira sign (U+20A6); no runtime font CDN. Archivo replaced Bricolage Grotesque on 2026-11-20, chosen from a rendered shortlist (Archivo, Epilogue, Public Sans) because the sibling product Sara uses Bricolage. A replacement face must draw ₦ itself, reach weight 300 and offer tabular figures (`tnum`). Utilities in `globals.css`: `type-display` (clamp 2.5–6rem, weight 300), `type-h2` (clamp 2.25–3.5rem), `type-figure` (clamp 2.5–4rem), `type-lead` (17–18px), `type-body` (16px), `type-label` (11px tracked uppercase, used only inside data and logo rows, never above a heading). Tabular numerals on `[data-figure]`, `data`, `time`. `text-wrap: balance` on headings, `pretty` on paragraphs.

## Shape and layout

- Content width 1200px (`.shell`, 24px gutters). Section padding 112px desktop / 72px mobile; the built-with row 96px / 64px. More space above a heading than below it.
- Radii: pills 999px, cards 28px, ticker rows 16px.
- Depth: hairline strokes plus the signal glow on price rows (`0 0 24px` of `signal` at ~26%). No other shadows except the open mobile sheet.
- Layers: content 1, header 20, cursor 30, skip 40, sheet overlay 50, sheet 51.
- Icons: Phosphor regular from `@phosphor-icons/react/dist/ssr`, `aria-hidden` beside text; icon-only controls are 44px with accessible names.

## Components and primitives

The primitives in `src/primitives/` are shadcn-generated and restyled in place; keep their files, exports and APIs (Button, Badge, Card, Tabs, Sheet, Skeleton). Their shadcn colour names are `var()` aliases of the tokens above (`primary` → `signal`, `ring` → `gain`, `border` → `stroke`, `input` → `control-border`, and so on), so the unused ones keep working for the future customer app.

- **Button:** `default` is a `signal` pill with white text and `signal-hover`; `outline` has a `control-border` border and `heading` text; `ghost` and `link`. Every size is at least 44px (`lg` 48px, `icon` 44×44). Use `asChild` for links.
- **Hero (after katana.network, 2026-11-20):** no form. The copy block (`.hero-copy`: headline, subline, pills) is centred on the stage and the counter rail rests on its bottom edge (`.hero-inner` rows `1fr auto 1fr`; the 1fr rows collapse first, so the two stack rather than overlap). The headline holds one line: `clamp(1.25rem, 8.4vw, 2.625rem)`, 64px from 640px and 96px from 1024px, leading 1.05. The subline is the lead size at weight 300, leading 1.625, up to 78ch, balanced, in `ink`. Two `lg` pills at 14px: **Join the waitlist** (`default`) jumps to `#join` and focuses its email field like the header button, and **How it works** is outlined in white at 20% and fills with `signal` on hover. Both press to 0.97 over 110ms and change colour over 150ms. Rail figures are 22px, or 28px from 640px, at weight 300. The labels are 10px uppercase at 0.14em in `muted-foreground`, which measured at least 4.88:1 over 24 live-fluid frames. A vertical `void` shade (32% → 12% at 38% → 55% at 94% → 0) with 7% fractal grain lies over the fluid.
- **Badge `default`:** the Beta chip: 11px uppercase, 0.16em tracking, white border at 20%, white text at 80%.
- **Sheet `left`:** `min(86vw, 340px)` wide, `100dvh` tall, opens in 260ms and closes in 170ms ease-out, overlay `void` at 70%. Radix owns the focus trap, restoration, Escape and scroll lock. Wrap every navigating link inside it in `SheetClose asChild`, or the sheet stays open over the section it jumped to.

Feature components live in `src/components/landing/` (kebab-case files, PascalCase exports). Sections are Server Components; client islands own motion, the mobile sheet and the waitlist form. Browser code imports `cn` from `@/utils/cn`, never the `@/utils` barrel (it imports `node:crypto`), and never imports `content.ts`, `policy.ts`, `@/env` or `src/backend/**`.

## Motion contract

Pinned in `src/components/landing/motion/contract.ts` and unit-tested. Highlights: hero intro windows background 0–900, heading 200–900, copy 480–1180, actions 760–1460, rail 1040–1740 ms; nav cue from 2120ms over 900ms; scroll progress smoothed with ease 0.18 per 16.67ms frame (64ms cap); handover `h = S((p − 0.30)/0.70)` with per-group windows actions 0–0.40, rail 0–0.36, copy 0.18–0.66, heading 0.40–1, background 0.45–1; pinned geometry 160vh track, sticky 100vh stage, −45vh overlap, applied only when the hero fits (clearance 190px) and motion is allowed. Ticker marquee `rows × 4.5s` (36s for eight rows) over a 22rem/26rem masked viewport. The "Built to work with" marks wrap into a centred grid from 768px up; below 768px they run as one horizontal row that scrolls itself, `brands × 3.5s` (42s for twelve), with faded ends, a duplicated `aria-hidden`/`inert` list for a seamless loop, and the same pauses as the ticker. Under reduced motion it is a still, swipeable row. Counters 800ms easeOutCubic once at 35% visible, decimals widening below 100/10 while counting. Diagram entrance 420ms + 60ms stagger at 20% visible, autoplay 1080ms then every 3600ms, hover intent 120ms, leave grace 140ms, highlight 200ms, float 8s/−3px with −1.3s per-index delay, parallax ±70px on the light beam only. Cursor follower easing 0.20, fade 200ms, scale 0.7/1/0.9 over 110ms, mouse pointers only. Sheet 260ms open / 170ms close.

## Fallbacks

- Server HTML is fully visible; animation starts only after hydration and never replays a blank intro on deep links or restored scroll.
- No JavaScript: native form POST to `/api/v1/waitlist` (303 to `/waitlist?status=`), native `<details>` FAQ, `<noscript>` nav list.
- Reduced motion (observed live): ordinary flow, no fluid, no loops/parallax/follower, counters show final values, state changes keep a 200ms opacity change.
- No WebGL / Data Saver / context loss: the static hero glow artwork (`/art/hero-glow.*`) stays; the fluid loads lazily after two frames only when allowed.
- Short viewports / zoom: hero fit measured, ordinary flow instead of cropping.
- Focus inside a hero group forces that group to opacity 1; groups below 0.01 take no pointer events.
- There is no visible pause control: the operator removed it on 2026-11-19. `LandingMotionProvider` keeps a dormant `paused` state that every loop still honours (fluid, ticker, floating panels, diagram autoplay, parallax), so a control can return by rendering a button that calls `setPaused`. Without it, moving content stops only under `prefers-reduced-motion`, on hover or focus (the ticker), offscreen or in a hidden tab; WCAG 2.2.2 (Pause, Stop, Hide) asks for a user-operable pause for auto-moving content, so the page no longer meets that criterion.

## Silent-failure traps

These fail without an error, and each has bitten this page once:

- **Child effects run before parent effects.** An island that measures something its parent's effect sets (a counter reading its hero group's opacity) sees the pre-effect value on its first pass. Defer the read one `requestAnimationFrame`. The same ordering means the motion context's `reducedMotion` is still `false` during children's first effects; islands whose first frame must honour the preference also call `prefersReducedMotion()`.
- **The layout outlives the page.** `[data-landing]` belongs to the `(marketing)` layout, which persists across client navigations. Anything an island writes onto it (CSS variables, data attributes) must be removed on unmount, or `/legal/*` inherits the home page's mid-handover header.
- **Unlayered CSS beats Tailwind utilities, and specificity still applies between section rules.** The landing styles in `globals.css` are unlayered, so they win over any utility on the same element regardless of specificity; between themselves, `.landing-section h2` out-ranks a single-class rule on a section's heading (the built-with label needs two classes).
- **Server HTML must be visible.** Never start an entrance state (`opacity: 0`) in CSS that applies before hydration; key it to an attribute the island sets after mounting (`data-entered="false"`).
- **Lazy chunks need an error boundary.** `React.Suspense` does not catch a failed `import()`; without the fluid's boundary, a chunk failure would take the whole page down instead of leaving the static glow.
- **Ordinary flow must not run the handover.** When the hero doesn't fit, the track is one viewport tall, so pinned-scroll progress has no travel; treating that as "fully scrolled" faded the whole hero out at the top of the page on 800–900px-tall laptops. Unpinned, the groups keep their intro value (`heroLayoutFrame`) and only the header button follows the hero scrolling away. The fit check measures the copy block (`.hero-copy`) and the rail on their own, never `.hero-inner`, which stretches to the stage and would feed the pinned height back into the decision. The hero's `padding-block` must total no more than the 190px clearance, or laptops drop out of the pin or the pinned stage crops the copy.
- **Large SVG blurs get capped** by some renderers, leaving visible rims on soft glows. Authored glows use radial gradients (`scripts/landing-art.mjs`).

## Assets

- `public/brands/`, `public/stocks/`: official local marks with `sources.json` provenance (hash, dimensions, treatment, beta status, terms notes where decision 11 applies). Missing file ⇒ letter/name fallback; deleting the file is the whole removal procedure.
- `public/art/`: original authored artwork (hero glow, light beam, safeguard streaks, join beams, footer glow) generated by `scripts/landing-art.mjs` as AVIF + WebP at explicit dimensions, with hashes in `sources.json`; all `aria-hidden`. The How it works panels are markup, not raster.
- **The logo is a lockup**, set the way Parcours sets its own: the [grain mark](docs/brand/v3st-grain.svg) beside the name *V3ST* ([preview](docs/brand/v3st-lockup.png)). `Logo` in `src/components/logo.tsx` renders it; `<Logo variant="mark" />` is the mark alone, labelled "V3ST", and `LogoMark` is the decorative mark.
  - **One font-size sizes it.** Everything is `em`-relative: the mark is 1.35em tall and sits 0.32em from the name. Pass one size utility (`<Logo className="text-[18px]" />`), or a CSS class on the landing, where unlayered rules win over utilities. Never set a height on the mark.
  - **The name is live text**, Archivo 700 at −0.03em in `heading` white: selectable, read as "V3ST" by screen readers and on the type scale. It is not outlined, so there is no static lockup file; standalone files carry the mark alone.
  - **The mark is mint** (`fill-gain`). `accent={false}` draws mark and name in one ink (`currentColor`), for signal green, white or mint grounds.
  - **Sizes:** 22px on sign-in (`.header-lockup` is also 22px on the landing), 19px in the desktop sidebar, 18px in the phone top bar and setup. The landing footer closes on the lockup over its glow at `clamp(3.75rem, 21vw, 17rem)`, about 290px wide on a 390px phone and at most 960px.
- The favicon (`/icon.svg`) is the grain alone in mint on void, generated by `scripts/logo.mjs`. The static social image (`/opengraph-image.png`) sets the lockup above the Archivo headline and is generated by `scripts/social-image.mjs`.

## Customer app

The beta customer app (`/signin`, `/setup` and the `(app)` group) shares the landing's theme, face and tokens, held to Operate-mode restraint. The chosen Home structure is the money line, locked in the operator's surface round (`seed:bc21f5b0c062fffb`); the committed sketch is `docs/superpowers/specs/assets/2026-11-19-v3st-app-money-line-sketch.png`, and the [app spec](docs/superpowers/specs/2026-11-19-v3st-customer-app-pages-design.md) wins where they differ. Reconciled with the shipped build on 2026-11-20, after the [finish review](docs/superpowers/reviews/2026-11-19-v3st-customer-app-pages.md) closed at "ship".

- **Colour.** Existing tokens only. Signal fills pills, the spine, the *Now* hairline and border, done nodes, checked-choice borders and the setup progress segments, never small text. Gain carries positive figures, focus rings, the active nav icon, the unread dot, the *Now* text, *Needs you*, text links and waiting halos (`0 0 0 4px rgb(61 220 151 / .14)`). Loss carries negative figures, failed row titles, field errors and invalid borders. Muted-foreground is secondary copy and labels; subtle is hints and "Step n of N".
- **Ground.** The signed-in app is plain `void`. Sign-in and setup alone carry a faint static signal wash at the top: `radial-gradient(80% 50% at 50% 0%, rgb(0 128 77 / .16), transparent 72%)` on sign-in, `80% 40%` at `.12` in the setup shell. Never animated, never inside `(app)`.
- **Type.** A fixed rem scale in `globals.css` utilities: `type-app-figure` (2.5rem/300/−0.02em, tabular) for headline money, `type-app-amount` (2rem/300, tabular) for amount fields and detail amounts, `type-app-title` (1.5rem/500) for the one page `h1`, `type-app-heading` (1.125rem/600) for dialog titles and section headings. Below that the app uses four sizes: 16px body, 15px row titles, nav labels and button text (600), 14px secondary and key–value rows, 13px meta, group labels and tab labels. The Beta chip's 11px is the floor. Every figure is tabular. No `clamp()`.
- **Labels.** Group labels (*Total value*, *Coming up*, *Earlier*) are 13px medium muted sentence case. The 11px tracked uppercase style belongs to the Beta chip only; nothing tracked or uppercase sits above a heading.
- **Shape.** Pill buttons at 44px minimum (48px `lg`), 15px semibold. 48px fields with 16px corners, `surface` fill and the `control-border` border; the amount field is 64px tall at `type-app-amount` with a muted ₦ prefix. Lists are hairline-separated rows (`stroke` bottom border, 12px vertical padding, 44px minimum). Cards only for transfer details, Earn products and the settings groups, never nested: 16px corners, `stroke` border, 20px inner padding, `surface` fill (the transfer card sits on `surface-raised`). Choice rows (radio options, document rows) are 44px bordered rows on `surface` at 24px corners, their border turning signal when checked. Modal sheets at 28px corners.
- **Dialogs.** `src/primitives/dialog.tsx` is the one modal: a bottom sheet below 640px (`max-h-[92dvh]`, top hairline, safe-area padding), centred and at most 480px wide from `sm:`, on `surface` over `void` at 70%, 24px padding, a 44px close button top-right. The title is `type-app-heading`; the description (muted, 14px) names the current step, and a step never adds a second heading. Focus returns to the element that opened the dialog, because most app dialogs open from state without a trigger. Short jobs open here rather than on a new page.
- **Chrome.** The `(app)` layout mounts the chrome once. A sticky 56px top bar on `void` with a hairline foot places the logo and *Beta* on the left below 768px. A 44px bell (with an 8px gain unread dot) and a 32px initials avatar on `surface-raised` sit on the right at every width. Below 768px a fixed 64px tab bar (Home, Stocks, Cash, Earn; 20px Phosphor icon over a 13px label; active is heading text with a gain icon) plus the safe-area inset. From 768px a 248px sidebar with the four places, Activity, and Settings at its foot, items as 44px pills with the active one on `surface-raised`. One content column at most 720px, 16px gutters (32px from 768px). A skip link to `#app-main` comes first.
- **Page header.** Optional 44px back arrow, the `type-app-title` `h1`, optional actions on the right. One `h1` per page.
- **Setup.** The setup shell carries the logo, *Beta* and *Sign out*. Progress sits below the step's heading, never as a kicker above it: on phones a row of 2px segments (signal done/current, stroke ahead) with "Step n of N" in subtle 13px; from 768px a step list beside the content with filled signal check nodes for done steps.
- **Motion.** Modals open in 260ms and close in 170ms ease-out, sliding up on phones and fading under `prefers-reduced-motion`. The one authored moment is the line crossing: an item moving from *Coming up* to *Earlier* slides across the *Now* pill in 240ms ease-out (`motion` `layout="position"` + `layoutId`), reduced to a 200ms fade under reduced motion. Processing nodes pulse, motion-safe only. Buttons press to 0.98. No page-load choreography, no fluid background, no cursor follower, no pinned scroll.
- **Home.** "Total value" at `type-app-figure` over today's change and "Cash … available", the *Add money* (signal) and *Invest* (outline) pills, one beta line, then the money line, with *See all activity* at the end and the holdings list under the fold. Today's change is gain when positive, loss when negative, and muted and unsigned at zero; a null change, or a null total, drops the line. A null total renders "—" with an honesty note beneath it, and a partial total says which prices it leaves out.
- **The money line.** A 2px signal spine in a 44px gutter, dashed above the marker and solid below. The *Now · HH:MM* pill (Lagos time, refreshed each minute) sits on a signal hairline: `surface-raised` fill, signal border, gain 13px semibold tabular text. *Coming up* above it (Friday payout first, then in-progress items sorted by deadline, then *Needs you*), *Earlier* below. Each row is a link with a 12px node on the spine: waiting and processing are gain-ringed on `void` with the halo, *Needs you* is heading-ringed, done is filled signal, failed is loss-ringed, cancelled is subtle-ringed; non-obvious tones carry a screen-reader label. Row detail is 13px muted: finished rows carry their Lagos time ("Today, 19:09", "Yesterday, 08:15", "Mon 16 Nov, 12:00"), unpaid transfers count down to their deadline, and buys waiting for prices say "until" their expiry.
- **Money honesty.** Kobo stay integer strings until `@/utils/format` or the `Money` primitive (a `<data>` element, tabular); a null value renders "—" with "not available" for screen readers, never ₦0; amounts carry a sign only when they have a direction. Key–value details (`KeyValue`) are muted labels left, ink values right, 14px. API error `message`s render verbatim with `code` used only to branch; money modals create one idempotency key per review and reuse it on retry.
