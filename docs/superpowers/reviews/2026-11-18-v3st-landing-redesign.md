# Review record: V3ST landing redesign (2026-11-18)

Plan: [2026-11-18-v3st-landing-redesign.md](../plans/2026-11-18-v3st-landing-redesign.md). Spec: [2026-11-17-v3st-landing-redesign-design.md](../specs/2026-11-17-v3st-landing-redesign-design.md). All 13 plan tasks are checked and committed on `feat/v3st-landing-redesign`.

## Gates (run once, in order, after the full implementation)

| Command | Result |
| --- | --- |
| `bash scripts/setup-cloud.sh` | exit 0 (Node 24.15.0, Yarn 1.22.22, frozen lockfile) |
| `yarn prisma validate` | exit 0 |
| `yarn prisma generate` | exit 0 |
| `yarn test:contracts` (forge) | exit 0 — 17 passed, 0 failed |
| `yarn test` (vitest) | exit 0 — 112 files, 562 tests passed |
| `yarn lint` | exit 0 — 0 errors (12 pre-existing warnings in old integration test files) |
| `yarn typecheck` | exit 0 |
| `node scripts/landing-beta.mjs build` | exit 0 — `/` static with revalidate 5m, `/legal/[slug]` five SSG pages, `/waitlist` dynamic |
| `yarn test:e2e` (Playwright, production build, unreachable DB) | exit 0 — 28 passed, 0 failed |

Failures found on the first pass and fixed (all in this branch's own files; none pre-existed outside it):

- `catalog.ts` used `PUBLIC_TICKERS` without importing it (7 `public-ticker` test failures) — import added.
- `parallaxOffset` returned `-0` at the centered position — normalized to `0`.
- `brand-assets.test.ts` mapped shipped files to `/public/...` URLs while the manifest records public URLs — test fixed to strip the `public/` prefix; the manifest/catalogue `//brands/...` double-slash srcs were normalized to `/brands/...`.
- Two downloaded brand SVGs (paycrest, privy) were truncated mid-attribute and rendered at naturalWidth 0 — re-downloaded from the official pages, validated as XML, given explicit `width`/`height`, hashes updated in `public/brands/sources.json`.
- `logo-badge`/`brand-mark` needed an explicit React import for the unit-test JSX runtime.
- Form body mode threw "Repeated form field" before `formEncoded` was set, so the no-JS redirect missed — flag set before parsing.
- Vendored `liquid-ether.tsx` carries `/* eslint-disable */` + `// @ts-nocheck` (vendored code; modifications listed in its header).
- e2e: anchor assertions now measure the anchor target (the section, which lands at the 96px scroll margin; the h2 sits below the section's 112px padding), ticker rows scoped to the non-duplicate list, brand marks awaited until loaded, the 404 legal check uses the request API, the invalid-email case uses a browser-valid but zod-invalid address (`a@b`), the guard ignores "Failed to load resource" console noise, and the header CTA focuses `#join-email` by polling the hash (pushState fires no `hashchange`).

One environmental note: in one full-suite run, `tests/integration/trades.test.ts` (2 onchain tests) failed with orders stuck at `submitted`; the file passes in isolation and passed in the final full run — pre-existing anvil/DB-state flakiness under full parallelism, unrelated to this work.

## Build artefacts

- Client chunks for `/` contain no Prisma, viem or server modules; `three` appears only in the lazily loaded chunk (`React.lazy` from `fluid-background.tsx`).
- First Load JS for `/`: 134 kB (limit 200 kB). Page bundle 16.9 kB.
- Performance (Chromium, mobile emulation 390×844, 4× CPU throttle, CDP network throttling ≈ Fast 4G): LCP 792 ms (≤ 2.5 s), CLS 0 (< 0.1).

## Rendered review

Captures in `.impeccable/review/`: `desktop.png` (1440 full page), `mobile.png` (390 full page), `hero-p0/p0_3/p0_6/p1.png` (hero at scroll progress 0/0.3/0.6/1), `waitlist-joined.png`, plus `katana-*.png` comparison captures of katana.network in a separate unguarded context.

Comparison against Katana: same centered display hero ("Invest. Earn. Harvest." vs Katana's "Trade. Earn. Own."), subline, form/CTA row, counter rail, pinned 160vh track handing over to the next section, vertical ticker, logo row, card grids, closing panel and giant footer wordmark with radial glow. Differences are the spec's own: green fluid palette instead of Katana's blue, naira figures instead of DeFi copy, waitlist form instead of Trade/Earn buttons, FAQ and safeguards sections Katana lacks. Hero copy is white Bricolage over the darkest fluid frames; body copy sits on `#020604`/`#08100C` surfaces, contrast ≥ 4.5:1.

Ticker chip states (Delayed / Estimate) are unit-covered by the formatter/row code and the API tests; in the unreachable-DB e2e build the ticker correctly shows the no-price fallback (8 rows, no ₦, caption "Beta prices appear here when they're available."), so the chips are not visible in these captures.

Impeccable was not installed in this environment; per the plan's fallback, the review above is a fresh-context review against the spec and the surface brief (`.impeccable/surfaces/src-app-marketing-page-tsx.md`), and that substitution is recorded here. Disposition: ship.

## Provenance and rights

- `public/brands/sources.json` and `public/stocks/sources.json`: 20 official marks with source pages, asset URLs, treatments, sha256, retrievedOn, and `termsNote` + `operatorAccepted: "2026-11-18"` where brand terms restrict third-party use (decision 11). Two SVGs were re-fetched during verification because the first download was truncated; manifests updated to the shipped hashes.
- `public/art/sources.json`: six original rasters authored for this repo (SVG generator rendered via headless Chromium, encoded with sharp), AVIF + WebP at explicit dimensions.
- Vendored `liquid-ether.tsx` pins react-bits commit `1eeb6f105c68b964289d85dabbe84a1d551f3797` with the licence in `LICENSE-react-bits.md` (MIT + Commons Clause) and the six listed modifications in the file header.

## Still open

- None blocking. The page stays `noindex` until a public-release decision; the waitlist is exported manually via `GET /api/v1/ops/waitlist` (see `docs/runbooks/backend-beta.md`); `RATE_LIMIT_SECRET` must be set for the waitlist rate limiter outside local defaults.

## How to preview

```bash
node scripts/landing-beta.mjs build
node scripts/landing-beta.mjs start   # http://127.0.0.1:3107, unreachable DB, no-price fallback
yarn test:e2e                        # Playwright owns port 3107; stop the manual server first
```
