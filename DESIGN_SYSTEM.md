# V3ST design system

Durable visual, component and motion decisions for the V3ST frontend. The product
document [Design.md](Design.md) is preserved as-is; this file does not collide with
it on case-insensitive filesystems. The landing surface brief lives in
[docs/superpowers/specs/2026-11-15-v3st-landing-design.md](docs/superpowers/specs/2026-11-15-v3st-landing-design.md).

## Palette and tokens

All tokens are declared in `@theme static` in `src/styles/globals.css`. There is no
`tailwind.config.ts`, no dark theme, and the page stays light even under system dark
mode. Use token classes (`bg-canvas`, `text-ink`, `border-rule`, …), never raw hex.

| Token | Value | Use |
| --- | --- | --- |
| `--color-primary` | `#166534` forest green | Primary buttons, links, focus ring; white text on it |
| `--color-canvas` | `#F7F8F2` warm ivory | Page background |
| `--color-surface` | `#FFFFFF` | Cards, active tab pills, sheet |
| `--color-sage` | `#E6EEDD` pale sage | Secondary surfaces, tab track, skeleton |
| `--color-ink` | `#153528` deep green | Primary text |
| `--color-ink-muted` | `#506455` | Muted text (verify contrast on every surface) |
| `--color-fresh` | `#B9D987` fresh green | Selection, decorative accent — never small body text on ivory |
| `--color-rule` | `#CED9CC` sage-gray | Borders and rules; interactive boundaries must still meet contrast |

shadcn primitives map onto these: `background`→canvas, `foreground`→ink,
`card`→surface, `secondary`/`muted`→sage, `muted-foreground`→ink-muted,
`accent`→sage, `border`/`input`→rule, `ring`→primary, `primary`→forest green.

## Typography

Geist (via `next/font/google`, variable `--font-geist-sans`). Hero headline
`clamp(2.75rem, 6.67vw, 6rem)`, line-height 1.05, tracking no tighter than
`-0.04em`, `text-wrap: balance`. Headings balance; financial figures always use
`tabular-nums`. No decorative eyebrow labels above headings.

## Layout

1,200px content width, 24px mobile gutters, 80–112px desktop section spacing,
56–72px mobile spacing. Pill CTAs and navigation (`rounded-full`), restrained
rounded panels (`rounded-2xl` cards), flat lists and rules for explanations.

## Primitives

Generated with the shadcn CLI (v4 mode, RSC, CSS variables, `ui: "@/primitives"`,
`utils: "@/utils/cn"` — see `components.json`), restyled in place, and re-exported
from `src/primitives/index.ts`. Import from `@/primitives`.

- `Button` / `buttonVariants`: variants `default` (primary pill), `secondary`
  (sage pill), `outline`, `ghost`; sizes `default`/`sm`/`lg`/`icon`. Supports
  `asChild` for anchor buttons — never nest an anchor inside a button.
- `Badge` / `badgeVariants`: `default`, `secondary`, `outline`.
- `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardAction`/`CardContent`/`CardFooter`.
- `Tabs` + `TabsList`/`TabsTrigger`/`TabsContent`: pill track on sage, active pill
  on white; Radix supplies arrow/Home/End keyboard support.
- `Sheet` + parts: left sheet `w-[min(86vw,340px)]`, `h-dvh`, open 260ms / close
  170ms `ease-out`, overlay fades with the same durations.
- `Skeleton`: sage pulse.

All Radix imports go through the unified `radix-ui` package. Runtime icons come
from `@phosphor-icons/react/dist/ssr` only; there is no `lucide-react`. Icons are
sized with Tailwind (`size-4`), never hand-rolled SVG. Brand marks are served
locally from `public/brands/` (provenance in `public/brands/sources.json`), never
approximated with icons or hotlinked.

Feature components live in `src/components/<feature>/` as kebab-case files with
PascalCase exports; route files only in `src/app/`.

## Motion

Motion reproduces the captured Katana behavior contract (measured 2026-11-15,
1440×1000 and 390×844); the canonical numbers live in
`src/components/landing/motion-contract.ts` and must stay in sync with tests.

- Native document scrolling; motion values/CSS properties updated per frame, never
  React state per frame.
- Smoothstep `S(x) = clamp(x,0,1)² × (3 − 2·clamp(x,0,1))`; intro opacity for
  interval `[a,b]` is `S((elapsedMs−a)/(b−a))`.
- Hero: 160vh track with sticky 100vh stage, following content overlaps by 45vh.
  Intro intervals (ms): background 0–900, heading 200–900, copy 480–1180,
  buttons 760–1460, rail 1040–1740. Scroll fade in handover `h = S((q−0.30)/0.70)`:
  buttons 0–0.40, rail 0–0.36, copy 0.18–0.66, heading 0.40–1, background 0.45–1;
  reverses continuously upward. Smoothing `q += (p−q)·(1−(1−0.18)^(dt/16.67))`,
  `dt` capped at 64ms.
- Fixed nav entrance cue `S((elapsedMs−2120)/900)`; header CTA follows `h`.
- Ticker: duplicated list, translateY 0→−50% linear, duration
  `uniqueRowCount × 4.5s`; viewport 22rem mobile / 26rem ≥640px; mask opaque 12%–88%;
  pause on hover/focus/offscreen/global pause plus a visible pause/resume control.
- Diagram: entrance once at 0.20 intersection, 420ms ease-out with 60ms stagger,
  translateY 12px→0; floating tiles 8s ease-in-out, −3px, delay `index × −1.3s`;
  decorative highlight every 3.6s, hover intent 120ms, leave grace 140ms, hover
  transition 200ms; background parallax ±70px.
- Story cursor follower: fine pointers only, smoothing 0.20 frame-normalized,
  opacity 200ms, scale 0.7/1/0.9, scale transition 110ms.

### Static fallbacks and reduced motion

- Server-rendered content is fully visible by default; never gate content on a
  global reveal opacity. Motion starts only after enhancement; deep-link or
  restored-scroll entry initializes from the current position without replaying a
  blank hero.
- `prefers-reduced-motion` (live changes), the page's **Pause animations** control,
  hidden documents and offscreen elements stop all decorative motion; reduced
  motion removes hero pinning/overlap, uses static artwork and a static
  ticker/list, and keeps every action and explanation. Pause never resets demo
  state and resume never jumps through missed frames.
- No-JS, failed hydration, WebGL failure/context loss and short viewports keep the
  walkthrough, navigation and disclosures usable; a measured fit check switches
  the hero to ordinary flow when the composition cannot fit.
- Fading controls must never remain invisible keyboard/pointer targets.

## Contrast and accessibility

Verify ink/muted contrast on every actual surface. Visible `:focus-visible` ring
(primary, 3px), fresh-green selection, 44px minimum control targets, semantic
landmarks and headings, descriptive alt text for logos, decorative SVG/canvas
`aria-hidden`, polite announcements for user-triggered demo changes only (never
for loops).
