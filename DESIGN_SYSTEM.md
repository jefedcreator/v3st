# V3ST design system

Authority: the [landing specification](docs/superpowers/specs/2026-11-15-v3st-landing-design.md), `PRODUCT.md`, and `FRONTEND_PATTERNS_GUIDE.md`. Preserve `Design.md`; it is product architecture, not this visual system. The landing brief defines the Persuade/Operate surface roles.

## Foundation

One light theme, including system dark mode. Geist is supplied by `next/font`; no runtime font CDN. Content width 1,200px, mobile gutters 24px. Desktop sections use 80–112px vertical spacing; mobile 56–72px. Headings balance and body copy has a readable measure. Hero type is `clamp(2.75rem,6.67vw,6rem)`, line height 1.05, tracking -0.04em. Financial figures use tabular numerals and wrap only at deliberate boundaries.

Tokens live in `@theme static` in `src/styles/globals.css`; no Tailwind configuration file. Primary `#166534`, canvas `#F7F8F2`, surface white, secondary sage `#E6EEDD`, foreground `#153528`, muted foreground `#506455`, fresh decorative green `#B9D987`, rule `#CED9CC`. Fresh green never carries small text on ivory. Interactive boundaries use a darker `#6B806F` token. Focus uses a 3px primary outline with 4px offset. Selection uses primary/white. Body contrast must meet 4.5:1, large type 3:1.

Pill controls and navigation; 24px panels, 16px inner surfaces. Use flat lists/rules for prose. No fabricated growth charts, identical feature-card scaffold, decorative eyebrows, partner claims or dark panels. Original growth contours and investing diagrams are artwork, not UI icons. UI icons use `@phosphor-icons/react/dist/ssr`, regular weight, `aria-hidden` beside text. Real logos preserve source geometry/color and explicit dimensions.

## Components

Generate primitives through the official shadcn CLI; restyle in place in `src/primitives/`. Preserve `Button`/`buttonVariants`, `Badge`, Card parts, Tabs parts, Sheet parts and `Skeleton` APIs. Unified `radix-ui` provides Slot, Tabs and Dialog. Use `asChild` for anchor buttons. Buttons and control targets are at least 44px. Tabs remain keyboard navigable and readable in a two-column grid on mobile. Left Sheet: width `min(86vw,340px)`, height `100dvh`, opening 260ms, closing 170ms ease-out, overlay follows; Radix owns focus trap/restoration, Escape and scroll lock.

Feature components live in `src/components/landing/` with kebab-case files and PascalCase exports. Route composition is a static Server Component. Client islands own only local interactions/decorative lifecycle. Never import `@/utils` in the browser: it imports `node:crypto`. `cn` comes directly from `@/utils/cn`; exact demo money comes directly from `demo-money.ts`.

## Motion contract

Native scrolling only. Content is visible in server HTML. Enhance only after initialization, skip entrance on delayed hydration/hash/restored-scroll entry. Continuous changes use refs/CSS custom properties or motion values, never per-frame React state.

Let `S(x)=clamp(x,0,1)^2*(3-2*clamp(x,0,1))`. Hero progress is `p=clamp(-rect.top/(rect.height-viewportHeight),0,1)`; smooth with `q+=(p-q)*(1-(1-.18)^(min(dt,64)/16.67))`. Handover `h=S((q-.30)/.70)`. Multiply intro smoothstep by the inverse fade smoothstep. Intro intervals (ms): background 0–900, heading 200–900, copy 480–1180, actions 760–1460, rail 1040–1740. Handover fade intervals: actions 0–.40, rail 0–.36, copy .18–.66, heading .40–1, background .45–1. Nav cue `S((elapsed-2120)/900)`, center nav -120px→0 and logo -160%→0; header CTA follows h. Track is 160vh, sticky stage 100vh, content overlap -45vh only when measured content fits. Focused hero controls remain visible while focused; faded controls cannot receive pointer hits.

Ticker duplicates six visual rows once; 27s linear 0→-50%, 22rem mobile/26rem desktop, mask opaque 12–88%. Provide one accessible list and pause on hover/focus/global pause/hidden/offscreen. Flow nodes enter once at intersection .20: 420ms ease-out, 60ms stagger, y12→0; float 8s 0→-3px→0, index delay -1.3s. Path advances every 3.6s, hover intent 120ms, leave grace 140ms, highlight response 200ms. Diagram artwork parallax is clamped ±70px. Story-link follower is fine-pointer only, normalized .20 smoothing, 200ms opacity, 110ms scale .7/1/.9. Diagram presentation never changes demo state. Demo changes fade 200ms and stay in normal flow.

The original WebGL field is lazy and bounded, with ivory contrast veil and SVG fallback. Its implementation records the named reference parameters and honest mappings, releases GPU resources and stops work offscreen/hidden/paused. No borrowed Katana source or artwork.

## Accessibility and failure behavior

Reduced motion is observed live: remove sticky/overlap, disable spatial/looping effects, expose static rows, use static growth art and immediate demo updates. Pause stops decorative effects without clearing demo state or replaying elapsed motion on resume. Short viewports, enlarged text and zoom fall back to ordinary document flow after measuring hero fit. No-JS preserves anchors, mobile links, four-step explanation, all disclosures and native FAQs. Canvas/SVG decoration is hidden from assistive technology; no financial information lives in canvas. One main landmark, skip link, logical headings, named tab/dialog controls and visible focus. No account, cookie/storage, backend, RPC, wallet or provider access from `/`.

## Layers

Artwork 0; content 1; header/beta 20; skip link 40; Sheet overlay 50/content 51; decorative cursor 30 (pointer-events none). Scope z-index to those roles.
