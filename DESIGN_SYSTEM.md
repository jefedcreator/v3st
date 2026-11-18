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

Fluid palette for authored artwork and the WebGL field: `#0D6A3D`, `#008A52`, `#3DDC97`.

## Type

Bricolage Grotesque via `next/font` with the `latin-ext` subset; no runtime font CDN. Utilities in `globals.css`: `type-display` (clamp 2.5–6rem, weight 300), `type-h2` (clamp 2.25–3.5rem), `type-figure` (clamp 2.5–4rem), `type-lead` (17–18px), `type-body` (16px), `type-label` (11px tracked uppercase, used only inside data and logo rows, never above a heading). Tabular numerals on `[data-figure]`, `data`, `time`. `text-wrap: balance` on headings, `pretty` on paragraphs.

## Shape and layout

- Content width 1200px (`.shell`, 24px gutters). Section padding 112px desktop / 72px mobile; the built-with row 96px / 64px. More space above a heading than below it.
- Radii: pills 999px, cards 28px, ticker rows 16px.
- Depth: hairline strokes plus the signal glow on price rows (`0 0 24px` of `signal` at ~26%). No other shadows except the open mobile sheet.
- Layers: content 1, header 20, cursor 30, skip 40, sheet overlay 50, sheet 51.
- Icons: Phosphor regular from `@phosphor-icons/react/dist/ssr`, `aria-hidden` beside text; icon-only controls are 44px with accessible names.

## Motion contract

Pinned in `src/components/landing/motion/contract.ts` and unit-tested. Highlights: hero intro windows background 0–900, heading 200–900, copy 480–1180, actions 760–1460, rail 1040–1740 ms; nav cue from 2120ms over 900ms; scroll progress smoothed with ease 0.18 per 16.67ms frame (64ms cap); handover `h = S((p − 0.30)/0.70)` with per-group windows actions 0–0.40, rail 0–0.36, copy 0.18–0.66, heading 0.40–1, background 0.45–1; pinned geometry 160vh track, sticky 100vh stage, −45vh overlap, applied only when the hero fits (clearance 190px) and motion is allowed. Ticker marquee `rows × 4.5s` (36s for eight rows) over a 22rem/26rem masked viewport. Counters 800ms easeOutCubic once at 35% visible, decimals widening below 100/10 while counting. Diagram entrance 420ms + 60ms stagger at 20% visible, autoplay 1080ms then every 3600ms, hover intent 120ms, leave grace 140ms, highlight 200ms, float 8s/−3px with −1.3s per-index delay, parallax ±70px on the light beam only. Cursor follower easing 0.20, fade 200ms, scale 0.7/1/0.9 over 110ms, mouse pointers only. Sheet 260ms open / 170ms close.

## Fallbacks

- Server HTML is fully visible; animation starts only after hydration and never replays a blank intro on deep links or restored scroll.
- No JavaScript: native form POST to `/api/v1/waitlist` (303 to `/waitlist?status=`), native `<details>` FAQ, `<noscript>` nav list.
- Reduced motion (observed live): ordinary flow, no fluid, no loops/parallax/follower, counters show final values, state changes keep a 200ms opacity change.
- No WebGL / Data Saver / context loss: the static hero glow artwork (`/art/hero-glow.*`) stays; the fluid loads lazily after two frames only when allowed.
- Short viewports / zoom: hero fit measured, ordinary flow instead of cropping.
- Focus inside a hero group forces that group to opacity 1; groups below 0.01 take no pointer events.
- The page-wide pause control (44px, "Pause motion"/"Play motion") stops every self-running loop and resumes from the paused frame; state is in memory only via `LandingMotionProvider`.

## Assets

- `public/brands/`, `public/stocks/`: official local marks with `sources.json` provenance (hash, dimensions, treatment, beta status, terms notes where decision 11 applies). Missing file ⇒ letter/name fallback; deleting the file is the whole removal procedure.
- `public/art/`: original authored artwork (hero glow, journey panels, light beam, safeguard streaks, join beams, footer glow) as AVIF + WebP at explicit dimensions with `sources.json` provenance; all `aria-hidden`.
- Favicon `/icon.svg` (monogram on void), static social image `/opengraph-image.png`.
