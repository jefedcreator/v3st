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

Bricolage Grotesque via `next/font` with the `latin-ext` subset; no runtime font CDN. Utilities in `globals.css`: `type-display` (clamp 2.5–6rem, weight 300), `type-h2` (clamp 2.25–3.5rem), `type-figure` (clamp 2.5–4rem), `type-lead` (17–18px), `type-body` (16px), `type-label` (11px tracked uppercase, used only inside data and logo rows, never above a heading). Tabular numerals on `[data-figure]`, `data`, `time`. `text-wrap: balance` on headings, `pretty` on paragraphs.

## Shape and layout

- Content width 1200px (`.shell`, 24px gutters). Section padding 112px desktop / 72px mobile; the built-with row 96px / 64px. More space above a heading than below it.
- Radii: pills 999px, cards 28px, ticker rows 16px.
- Depth: hairline strokes plus the signal glow on price rows (`0 0 24px` of `signal` at ~26%). No other shadows except the open mobile sheet.
- Layers: content 1, header 20, cursor 30, skip 40, sheet overlay 50, sheet 51.
- Icons: Phosphor regular from `@phosphor-icons/react/dist/ssr`, `aria-hidden` beside text; icon-only controls are 44px with accessible names.

## Components and primitives

The primitives in `src/primitives/` are shadcn-generated and restyled in place; keep their files, exports and APIs (Button, Badge, Card, Tabs, Sheet, Skeleton). Their shadcn colour names are `var()` aliases of the tokens above (`primary` → `signal`, `ring` → `gain`, `border` → `stroke`, `input` → `control-border`, and so on), so the unused ones keep working for the future customer app.

- **Button:** `default` is a `signal` pill with white text and `signal-hover`; `outline` has a `control-border` border and `heading` text; `ghost` and `link`. Every size is at least 44px (`lg` 48px, `icon` 44×44). Use `asChild` for links.
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
- **Ordinary flow must not run the handover.** When the hero doesn't fit, the track is one viewport tall, so pinned-scroll progress has no travel; treating that as "fully scrolled" faded the whole hero out at the top of the page on 800–900px-tall laptops. Unpinned, the groups keep their intro value (`heroLayoutFrame`) and only the header button follows the hero scrolling away. The fit check measures the copy *without* its padding, and the hero's `padding-block` must total no more than the 190px clearance, or laptops drop out of the pin or the pinned stage crops the copy.
- **Large SVG blurs get capped** by some renderers, leaving visible rims on soft glows. Authored glows use radial gradients (`scripts/landing-art.mjs`).

## Assets

- `public/brands/`, `public/stocks/`: official local marks with `sources.json` provenance (hash, dimensions, treatment, beta status, terms notes where decision 11 applies). Missing file ⇒ letter/name fallback; deleting the file is the whole removal procedure.
- `public/art/`: original authored artwork (hero glow, light beam, safeguard streaks, join beams, footer glow) generated by `scripts/landing-art.mjs` as AVIF + WebP at explicit dimensions, with hashes in `sources.json`; all `aria-hidden`. The How it works panels are markup, not raster.
- Favicon `/icon.svg` (monogram on void), static social image `/opengraph-image.png`.
