# V3ST landing implementation review — 2026-11-15

Status: implementation in progress; verification results are recorded in Task 6
below. This record captures actual implementation decisions, dependency versions,
brand provenance, deviations and evidence. No verification is claimed before it
was executed.

## Implementation decisions

- Route: `src/app/(marketing)/page.tsx` is a static Server Component
  (`export const dynamic = "error"`); the competing T3 `src/app/page.tsx` was
  removed. `/` composes `LandingMotion` → skip link → `Header` (with `MobileNav`
  client island) → `HeroMotion`/`Hero` → sections (`ProductStories`,
  `ProviderEcosystem`, `HowItWorks`, `LandingDemo`, `FridayProceeds`, `Faq`) →
  `Footer`. No API, session, database, wallet or RPC access from `/`.
- Subagent-driven development / Impeccable skills were not installed in this
  environment; the plan's self-contained checklist was executed natively and this
  limitation is recorded here per the plan.
- Toolchain: Node v24.15.0 (from `.nvmrc`), Yarn 1.22.22; `bash
  scripts/setup-cloud.sh` run successfully. `yarn.lock` remains the only
  committed lockfile (a transient npm lockfile from the shadcn CLI was removed).
- Dependencies added (locked actual versions in `package.json`/`yarn.lock`):
  `motion@^14.14.0`, `radix-ui@^1.8.1`, `@phosphor-icons/react@^2.1.10`,
  `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `tailwind-merge@^3.7.0`,
  `tw-animate-css@^1.4.0`. shadcn CLI (`npx shadcn@latest`, v4 mode, RSC,
  `ui: "@/primitives"`, `utils: "@/utils/cn"` per `components.json`) generated
  button, badge, card, tabs, sheet, skeleton; all were restyled in place to the
  V3ST tokens, unified `radix-ui` imports, Phosphor SSR icons (the generated
  `lucide-react` import in sheet was replaced and the package removed), and the
  `@/utils/cn` import. A bogus `cn` package the CLI added was removed.
- Motion: all captured Katana timings centralized in
  `src/components/landing/motion-contract.ts` and asserted in
  `tests/landing/motion-contract.test.ts`. `HeroMotion` drives per-frame motion
  values directly on DOM (no React state per frame), initializes from the current
  scroll position on deep-link/restored entry, forces the hero action group
  visible on keyboard focus, disables zero-opacity pointer hit areas, and
  measures fit to switch to ordinary flow on short viewports. Reduced motion
  removes pinning/overlap and the fluid layer.
- Fluid background: original native-WebGL1 stable-fluids renderer
  (`fluid-renderer.ts`) written for this page — no Three.js, no copied React Bits
  code, so no third-party license notice is required for it. `fluidDefaults`
  carries the captured reference parameters (`mouseForce=15`,
  `cursorSize=300`, `dt=0.011`, `iterationsPoisson=38`, `resolution=0.5`,
  `dissipation=0.992`, `autoDemo`, `autoSpeed=0.28`, `autoIntensity=6.4`,
  `takeoverDuration=0.25`, `autoResumeDelay=350ms`, `autoRampDuration=1.4s`)
  with three palette greens. It lazy-loads after the hero text is readable,
  is bounded (`devicePixelRatio ≤ 1.5`, sim ≤ 640px), pauses offscreen/when
  hidden/paused/reduced-motion, disposes via `WEBGL_lose_context`, and throws on
  missing WebGL so the wrapper keeps the static SVG artwork.
- Demo: `demo-money.ts` (bigint-only `formatNgn`/`formatUnits`/`payoutPreview`/
  `fxSettlementMicro`), `demo-fixtures.ts`, `demo.types.ts`, and the four chapter
  components under `landing-demo.tsx`. Money stays integer strings end to end;
  no fetch, storage, cookies or backend imports.
- Metadata: title **V3ST — Start with naira. See investing clearly.**;
  description identifies an illustrative beta preview; `robots: { index: false,
  follow: false }`; `metadataBase` uses the configured `NEXT_PUBLIC_APP_URL`.
  Original `src/app/icon.svg` favicon and static 1200×630
  `src/app/opengraph-image.png` (generated locally with the approved palette and
  Geist type; no third-party marks or return figures). The T3 `public/favicon.ico`
  was removed.

## Brand provenance

All marks are served locally from `public/brands/`; per-asset source page, exact
asset URL, fetch date, content type, dimensions/viewBox and inspection notes are
in `public/brands/sources.json`. All SVGs were scanned: no `<script>`, no event
handlers, no external references. Feel.cash's mark was resolved from the live
official homepage asset manifest (`/assets/feel-mark-...webp`), closing the
planning-era open locator. Solana's mark was fetched from the official
`solana.com` source repository at the identical path after the live URL
rate-limited this sandbox. No Katana assets were copied; all V3ST artwork
(favicon, OG image, growth artwork, diagram) is original.

## Accessible deviations from the reference

- No-JS/server output is fully visible; motion starts only after enhancement and
  deep-link entry never replays a blank hero.
- Reduced motion and the page pause control stop the ticker, diagram float and
  highlight cycling, parallax, story cursor and fluid simulation; the hero drops
  pinning/overlap and the ticker becomes a static list. Pause never resets demo
  state.
- Short viewports/zoom switch the hero to ordinary flow via a measured fit check
  instead of cropping.
- The ticker keeps a nonduplicated screen-reader list; the diagram is
  decorative with an authoritative ordered text walkthrough; the FAQ uses native
  `details`/`summary`; bank details are masked (`Example bank · account •••• 1234`).

## Verification (Task 6 — actual commands and results, 2026-11-15)

Environment: Node v24.15.0 (matches `.nvmrc`), Yarn 1.22.22, Debian 13 sandbox.
Forge/Anvil 1.9.1-nightly and PostgreSQL 16.10 were fetched into the sandbox
(Foundry nightly from GitHub releases, zonky embedded Postgres binaries from
Maven Central) because the image ships neither; a disposable local database
`v3st_beta_test` on `127.0.0.1:5433` was created for the suite, and the landing
E2E used the config's unused loopback `DATABASE_URL` (port 9) as specified.
Playwright 1.65.1 with Chromium headless shell 159.0.8154.6 (system libs
assembled locally under a private `LD_LIBRARY_PATH`).

Final sequence (all run, exit code 0 unless noted):

| Command | Result |
| --- | --- |
| `bash scripts/setup-cloud.sh` | pass (Node 24.15.0, Yarn 1.22.22, frozen lockfile install) |
| `yarn prisma validate` | pass — schema valid |
| `yarn prisma generate` | pass |
| `yarn test:contracts` | pass — 17/17 forge tests, 4 suites |
| `yarn test` (TEST_DATABASE_URL=…_test, Anvil chain 31337) | pass — 63 files, 347/347 tests, including `tests/landing/{demo-money,demo-fixtures,motion-contract}.test.ts` (29 tests) |
| `yarn lint` | pass — 0 errors (10 pre-existing warnings in untouched backend/test files) |
| `yarn typecheck` | pass — `tsc --noEmit` clean |
| `yarn build` | pass — `/` prerendered as static content (○), `/icon.svg` and `/opengraph-image.png` emitted |
| `yarn test:e2e` | pass — 26/26 Playwright tests (shell, anchors, deep-link, Back/Forward, sheet keyboard cycle, no-JS, network containment, ticker, logos, FAQ no-JS, demo scenarios/reset/no-storage, hero choreography, reduced motion, 360/390/768/1440 containment, WebGL-disabled fallback, global pause) |

Visual review: full-page and section captures at 1440×1000 and 390×844 plus
hero handover, mobile sheet, all demo chapters/scenarios and the footer were
inspected from the production build (Playwright screenshots, Chromium 159).
Hero intro settles, scroll handover fades in the captured order, header CTA
appears, mobile menu opens/closes, ecosystem marks render from local files,
demo figures are exact, and no horizontal overflow exists at any tested
viewport. Reduced-motion context uses ordinary flow with all groups visible.

## Limitations and deviations (disclosed, not hidden)

- **No `src/app/(marketing)/loading.tsx`.** With a route-level `loading.tsx`,
  Next 15.5 prerenders `/` with the real page inside `<div hidden id="S:0">`
  and the skeleton visible until a JS swap runs — verified in
  `.next/server/app/index.html` (removing the file removes the hidden block).
  That directly violates the plan's hard no-JS acceptance ("no hidden
  essential server HTML or endless skeleton"), so the loading file was
  dropped in favor of fully visible server output; the deviation is recorded
  here per the plan's handoff rules.
- Superpowers `subagent-driven-development` / Impeccable skills were not
  installed in this environment; the plan's self-contained checklist was
  executed natively (recorded above as the plan instructs).
- The Katana reference could not be re-measured live from this sandbox; the
  captured contract in the spec/plan was implemented and verified against the
  unit/browser assertions instead. No Katana source or assets were copied.
- Solana's mark was fetched from the official `solana.com` source repository
  at the identical path after the live URL rate-limited the sandbox (recorded
  in `sources.json`). Feel.cash's previously unresolved locator was resolved
  from the live homepage asset manifest (`/assets/feel-mark-…webp`).
- The fluid background is an original native-WebGL1 renderer written for this
  page (no copied React Bits code), so no third-party license notice applies;
  GPU resolution is bounded (DPR ≤ 1.5, sim ≤ 640px) and it pauses
  offscreen/hidden/paused and falls back to the static SVG on WebGL failure
  (covered by an E2E test with WebGL disabled).
- `yarn test` required local PostgreSQL and Anvil, which this sandbox lacked;
  both were provisioned locally as described above. If your environment has
  them already, run the same commands directly.
