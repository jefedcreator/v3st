# V3ST Landing Page Implementation Plan

> **For agentic workers:** Use Superpowers `subagent-driven-development` or `executing-plans` to implement this plan task by task when installed. If unavailable, execute this self-contained checklist natively and record that fact. Apply Impeccable when available; its relevant decisions are included here so the cloud agent does not depend on another machine's skill paths. This handoff is planning only; a separate cloud agent performs implementation.

**Goal:** Build an anonymous V3ST landing page with a local illustrative demo, the approved green/light identity, Katana-matched motion, and authentic ecosystem logos.

**Architecture:** A static Server Component marketing route composes readable content with small client islands for navigation, motion and the demo. Local fixtures and browser-safe exact-money helpers have no backend dependencies. Decorative animation is progressively enhanced and can be paused independently of demo state.

**Tech stack:** Existing Next.js 15, React 19, TypeScript, Geist and Tailwind v4; generated shadcn primitives with unified `radix-ui`; Phosphor SSR icons; `motion/react`; native WebGL or reviewed licensed fluid-renderer source; existing Vitest plus Playwright.

**Spec:** [V3ST landing design specification](../specs/2026-11-15-v3st-landing-design.md). Read it in full: it contains exact copy, fixtures, logo sources, motion formulas and product/API mappings.

## Global constraints

- Node **24.15.0** and Yarn **1.22.22**; begin implementation with `bash scripts/setup-cloud.sh`. `yarn.lock` is the only committed package-manager lockfile.
- Before implementation read `AGENTS.md`, `CLAUDE.md`, `Design.md`, `BACKEND_PATTERNS.md`, `FRONTEND_PATTERNS_GUIDE.md`, the full 2026-11-13 naira-ramps plan, the onchain spec/plan, and all current `docs/` documentation.
- Create `DESIGN_SYSTEM.md` in Task 1 **before components, pages or styles**. Preserve the product document `Design.md`; do not create a case-colliding `DESIGN.md`.
- The latest user request overrides the earlier no-ticker/limited-motion constraint. Reproduce the spec's captured Katana behavior. Keep the approved forest-green/light palette, fictional financial instruments and illustrative CTA.
- The entire app is beta. No real funds, mainnet activity, real identity submissions, live providers, deployment or external messages. `NODE_ENV=production` never enables live integrations.
- Scope is this landing page and its local demo. Do not implement authenticated dashboards, waitlist storage, financial endpoints or the rest of the old full-stack plan.
- No API calls, backend imports, database queries, wallet creation, session creation, RPC or third-party runtime requests from `/`.
- Use `@theme static`, feature components in `src/components/landing/`, primitives in `src/primitives/`, route files in `src/app/`. No Tailwind config file or application provider stack.
- Use direct browser-safe helper imports. The existing `@/utils` barrel imports `node:crypto` and must not enter the client graph.
- No optional/conditional object spreads. Follow repository naming, import and TypeScript conventions.
- Every task has a diff review, checklist update and focused commit. **No between-task test, lint, typecheck or build commands.** Tests in Tasks 2–5 are authored assertions, not gates to execute. All verification runs in Task 6.
- Never commit `.env`, secrets, private keys, databases, generated Prisma, dependencies, build output or test artifacts. Do not disturb unrelated user changes.

## Review focus

1. A returning visitor enters `/#demo`, uses Back/Forward, or scrolls upward through the hero: anchors and content remain visible; intro motion cannot reset their position. Covered by Task 2 browser assertions.
2. JavaScript is disabled, WebGL fails, reduced motion changes at runtime, or the viewport is short/zoomed: the walkthrough, navigation and disclosures remain usable. Covered by Tasks 2/5 and final browser review.
3. A keyboard user tabs into a fading hero CTA or leaves the mobile sheet: focus is visible, never trapped in an invisible control, and restored appropriately. Covered by Tasks 2/6.
4. A visitor opens a strategy chapter or watches the animated diagram: neither action selects a strategy, authorizes anything or changes demo financial state. Covered by Task 4.
5. Large integer balances, negative principal changes and gross amounts around the minimum: formatting is exact; threshold and fee order remain correct. Covered by Task 4 unit assertions.

## Repository baseline and file map

Planning baseline: commit `c0fbb24`; backend/API implemented, `src/app/page.tsx` still the T3 starter, no design system or frontend primitive library yet. Existing frontend dependencies listed aspirationally in the guide are not all installed. Check current source before overwriting files. The planning session created branch `codex/v3st-landing`; the cloud agent should use its own appropriate feature branch/worktree and preserve concurrent changes.

| File or directory | Responsibility |
| --- | --- |
| `PRODUCT.md`, `DESIGN_SYSTEM.md` | Product truth and durable visual/component/motion decisions |
| `FRONTEND_PATTERNS_GUIDE.md`, `README.md` | Reconcile copied patterns; explain the reachable landing and verification |
| `components.json`, `package.json`, `yarn.lock` | Primitive generation, minimal packages and scripts |
| `src/styles/globals.css` | Semantic tokens, base styles, focus/selection, motion states and responsive fit rules |
| `src/utils/cn.ts` | Browser-safe `clsx` + `tailwind-merge` helper |
| `src/primitives/{button,badge,card,tabs,sheet,skeleton}.tsx`, `index.ts` | Generated and restyled primitives; no product logic |
| `src/app/(marketing)/{page,loading}.tsx` | Anonymous root composition and matching loading treatment |
| `src/app/layout.tsx`, `src/app/icon.svg`, `src/app/opengraph-image.png` | V3ST metadata, Geist, original favicon and static 1200×630 social art |
| `src/components/landing/{header,mobile-nav,hero,growth-artwork,footer}.tsx` | Public shell; only mobile navigation requires local interaction |
| `src/components/landing/{how-it-works,product-stories,provider-ecosystem,friday-proceeds,faq}.tsx` | Static product story and accessible fallback explanations |
| `src/components/landing/{landing-motion,hero-motion,flow-diagram,market-ticker,story-cursor}.tsx` | Feature-scoped motion lifecycle and Katana behavior |
| `src/components/landing/{motion-contract.ts,fluid-background.tsx,fluid-renderer.ts}` | Measurable choreography, lazy canvas wrapper and isolated renderer |
| `src/components/landing/{landing-demo,demo-funding,demo-stocks,demo-strategies,demo-proceeds}.tsx` | Local interactive chapters and composition |
| `src/components/landing/{demo.types.ts,demo-fixtures.ts,demo-money.ts,provider-logos.ts}` | Local types, deterministic examples, exact formatting/thresholds, local asset catalogue |
| `public/brands/`, `public/brands/sources.json` | Authentic locally served marks with provenance |
| `docs/superpowers/reviews/2026-11-15-v3st-landing.md` | Actual implementation decisions, verification and visual/motion evidence |
| `tests/landing/{demo-money,demo-fixtures,motion-contract}.test.ts` | Pure behavior assertions executed within the existing final Vitest suite |
| `e2e/{landing,motion}.spec.ts`, `playwright.config.ts` | Production browser behavior, containment and responsive checks; outside Vitest's filename match |

Feature component filenames are kebab-case with PascalCase exports, as required by the frontend guide. Keep feature files focused. Do not split small static blocks into generic abstractions or move the backend to accommodate the landing.

## Task checklist

- [x] Task 1 — Establish design, assets and primitives.
- [x] Task 2 — Build the public shell and hero choreography.
- [ ] Task 3 — Build product storytelling and remaining reference motion.
- [ ] Task 4 — Implement the exact local demo.
- [ ] Task 5 — Complete accessibility, metadata and documentation.
- [ ] Task 6 — Run final verification, visual review and handoff.

### Task 1 — Establish design, assets and primitives

**Files:** Create `PRODUCT.md`, `DESIGN_SYSTEM.md`, `components.json`, `src/utils/cn.ts`, the six primitive files and barrel, `public/brands/sources.json`, selected brand files, `src/components/landing/provider-logos.ts`. Modify frontend guide, globals, package files and this checklist.

**Interfaces:**

- `cn(...inputs: ClassValue[]): string` from `@/utils/cn`.
- Primitive exports retain generated APIs: `Button`, `buttonVariants`, `Badge`, `Card` parts, `Tabs` parts, `Sheet` parts, `Skeleton`.
- `ProviderLogo = { id: string; name: string; src: string; width: number; height: number; sourceUrl: string; category: "provider" | "network" | "settlement" }`; export readonly `providerLogos` and `infrastructureLogos`. Source URLs are provenance, not automatic external links in the product.

- [x] Inspect Git state, create an isolated implementation branch if needed, and preserve unrelated changes. Read the required documents and spec before choosing patterns.
- [x] Run setup with the pinned toolchain. Use a cloud-local beta environment; do not reuse or print the developer's `.env`. Install dependencies using Yarn only. Record any missing service tooling for the final gate.
- [x] Discover Superpowers/Impeccable in the cloud environment. Use their installed entry points when available. For Impeccable, run its context command once; load new-work/animate guidance, and craft-floor immediately before UI edits. If unavailable, use this plan's embedded guidance and record the limitation without blocking work or installing unrelated plugins.
- [x] Write `PRODUCT.md` from approved product truth and `DESIGN_SYSTEM.md` from the spec. Include tokens, type/spacing, primitive APIs, motion formulas, static fallbacks, contrast and icon rules. Record Persuade/Operate surface roles in the spec, not as a global product style mandate.
- [x] Reconcile the frontend guide: mark unrelated education/payment routes as examples, remove contradictory dark-theme instructions for V3ST, replace `framer-motion` guidance with `motion/react`, distinguish installed packages from future ones, document the `@/utils/cn` exception, and retain real backend contracts. Do not add theme/query/form libraries merely to satisfy copied examples.
- [x] Add required dependencies: `motion`, `radix-ui`, `@phosphor-icons/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`. Resolve versions compatible with current React/Next; lock actual versions and do not upgrade unrelated backend/framework packages.
- [x] Configure shadcn for Tailwind v4, RSC, `src/styles/globals.css`, `ui: "@/primitives"`, `utils: "@/utils/cn"`. Generate only button, badge, card, tabs, sheet and skeleton using the official CLI. Record the CLI version. Ensure dependency installation uses Yarn even if an ignored local npm lockfile exists.
- [x] Restyle generated primitives in place with semantic tokens. Use unified `radix-ui` imports, replace Lucide with Phosphor SSR imports, remove unnecessary direct/scoped/icon dependencies, and expose the primitives barrel. Use `asChild` for anchor buttons; never nest an anchor inside a button.
- [x] Implement `@theme static` tokens and base light styles. Theme focus-visible, selection and tabular financial numerals. Keep all content visible by default; do not set global reveal opacity to zero.
- [x] Source every provider/network/settlement mark from the spec's official links. Inspect actual bytes, dimensions, content type, SVG scripts/events/external references and approved variants. Store locally with source page, exact asset URL, date, dimensions and variant in the manifest. Preserve geometry and colors. Resolve Feel.cash's missing asset locator from its official site; record an honest exception if inaccessible.
- [x] Review the diff for Node-only client imports, unrelated dependencies, real credentials, invented claims and copied Katana assets. Mark Task 1 implemented but unverified, update checklist and commit: `feat: establish V3ST landing design foundation`.

### Task 2 — Build the public shell and hero choreography

**Files:** Create marketing route/loading, shell components, `landing-motion.tsx`, `hero-motion.tsx`, `fluid-background.tsx`, `fluid-renderer.ts`, `motion-contract.ts`; author initial motion tests and browser specs. Delete competing `src/app/page.tsx`. Update globals.

**Interfaces:**

- Static `Header()`, `Hero()`, `Footer()`, `GrowthArtwork({ className? })` components, with `MobileNav()` as a client island.
- `LandingMotion({ children: ReactNode })` owns page animation pause state and system reduced-motion preference. A feature-scoped context may expose only `{ paused, reducedMotion }` to motion islands; no application/global-state provider or persistence.
- `HeroMotion({ children: ReactNode })` accepts server-rendered hero content and decorates its scoped DOM groups. Do not import server-only components from client modules.
- `heroFrame({ elapsedMs, progress }: { elapsedMs: number; progress: number }): HeroFrame`, where `HeroFrame` contains numeric `background`, `heading`, `copy`, `actions`, `rail`, `navReveal`, `ctaReveal` in `[0,1]`.
- `smoothProgress(current: number, target: number, deltaMs: number): number` implements the spec's frame-normalized 0.18 smoothing.
- `createFluidRenderer(canvas: HTMLCanvasElement, options: FluidOptions): { setPaused(paused: boolean): void; resize(): void; dispose(): void }`. Export `fluidDefaults` with the spec's named solver/pointer/idle values and three green palette colors; derive `FluidOptions` from its explicitly typed properties. Unsupported WebGL throws a construction error caught by the wrapper, which keeps the static fallback visible.

- [x] Author motion assertions before implementation: full intro at elapsed 1740ms/progress 0 yields all five hero opacities 1; start values follow the exact intervals; handover at progress 1 hides the hero and reveals header CTA; decreasing progress restores visibility; smoothing is frame-rate normalized. Do not run them yet.
- [x] Implement `(marketing)/page.tsx` as a Server Component composed only from landing modules. Use static rendering (`dynamic = "error"` is suitable) and no session/auth/API data access. Remove the competing root page.
- [x] Build the header, skip link to `#main-content`, fixed beta badge, hero exact copy, original SVG fallback and footer. Native anchors must work before hydration. Add a `noscript` mobile anchor list and reserve header space/scroll margins so target headings are not hidden.
- [x] Implement the left mobile `Sheet` with spec dimensions and 260/170ms transitions, a labelled title, close control, Escape/focus restoration and close-on-anchor-selection. Keep document scroll locking confined to the open sheet.
- [x] Implement the 160vh/sticky hero, −45vh content overlap, exact intro/fade intervals and header choreography from the spec. Start the intro only after enhancement is ready. On deep-link or restored-scroll entry, initialize from current position without scrolling to top or replaying blank content. Read scroll passively; update motion values/CSS properties, not React state per frame.
- [x] Keep beta and skip navigation visible throughout. Reveal a focused hero control group and keep it visible until focus leaves; disable invisible pointer hit areas. At zero opacity remove irrelevant decorative hit targets from interaction.
- [x] Implement original green fluid artwork, or adapt a pinned licensed source revision with notices and an explicit parameter mapping. Lazy-load after readable hero text; do not import it into the server route. Bound GPU resolution, handle pointer takeover/resume, stop hidden/offscreen work, dispose all resources and preserve SVG fallback for failure/reduced motion.
- [x] Detect fit at short heights/zoom rather than blindly fixing a cropped stage. Switch to ordinary flow and remove overlap when the complete hero cannot fit. Use the measured normal mobile behavior when it fits; do not blanket-disable mobile animation.
- [x] Add route `loading.tsx` using the same tokens and structural proportions. It is a fallback, not an artificial loading delay.
- [x] Author browser assertions for every anchor, skip link, sheet keyboard cycle/restore, deep-link reload and Back/Forward, upward-scroll recovery, and no-JS mobile access. No browser gate runs yet.
- [x] Review diff, update checklist and commit: `feat: build V3ST marketing shell and hero motion`.

### Task 3 — Build product storytelling and remaining reference motion

**Files:** Create `how-it-works.tsx`, `product-stories.tsx`, `provider-ecosystem.tsx`, `friday-proceeds.tsx`, `faq.tsx`, `flow-diagram.tsx`, `market-ticker.tsx`, `story-cursor.tsx`; update page composition and globals.

**Interfaces:**

- Static named section components correspond to the spec's anchors.
- `MarketTicker({ rows: readonly TickerRow[] })`, with `TickerRow = { id: string; title: string; detail: string; logoSrc?: string }`. Rows are fixed illustrative/context labels, not live price data.
- `FlowDiagram()` presents the four narrative stages; its decorative highlight state is independent of `LandingDemo`.
- `StoryCursor()` activates only for explicitly marked story links with a visible equivalent CTA.

- [ ] Add all static content in spec order with an ordered four-step walkthrough and alternating compositions. Reuse exact product/API distinctions from the feature map; do not synthesize claims from old marketing assumptions.
- [ ] Build the first split story with a ticker containing TSTA, TSTB, naira funding, USDC settlement context, Base target context and Solana architecture context. With six unique rows, loop duration is 27s. Label the whole treatment **Illustrative examples · not live prices**. Use real marks only where the row actually describes that brand/chain/asset; fictional stocks use plain fictional labels.
- [ ] Match ticker mask, height and linear motion. Duplicate the visual list once; hide duplicate semantics. Pause on hover, focus, offscreen/hidden state and the global pause setting. Provide a keyboard-operable visible pause/resume control and a nonduplicated accessible list.
- [ ] Render all nine provider groups, then the separate Base/Solana/USDC row, using verified local marks. Match Katana's centered/wrapped spacing, with **Provider ecosystem** and the exact beta caption. No “trusted/partner/endorsed” claims or false links to unbuilt pages.
- [ ] Implement original growth/flow diagram with the measured 420ms/60ms entrance, 8s/−3px float, 3.6s decorative highlight, 120/140ms hover intent and ±70px background parallax. Use progressive enhancement; the ordered text is the authoritative walkthrough.
- [ ] Match the large story-link pointer follower timings on fine-pointer devices only. Keep native pointer/focus behavior on other controls and on reduced-motion/touch devices; never make information depend on hovering.
- [ ] Add the Friday schedule, gross threshold, conversion requirement, zero-income possibility and rollover explanations. Add native server-rendered FAQs covering all spec topics. A disclosure toggle must still work without JavaScript.
- [ ] Extend browser assertions for ticker pause/resume and duplicate accessibility, diagram presentation independence, FAQ keyboard/no-JS use, logo integrity and absence of unsupported claims. Do not run yet.
- [ ] Review copy against current docs and actual provider evidence, update checklist and commit: `feat: add V3ST product stories and ecosystem presentation`.

### Task 4 — Implement the exact local demo

**Files:** Create demo types/fixtures/money, `LandingDemo` and four chapter components; add unit assertions to `tests/landing/`; complete corresponding browser assertions.

**Interfaces:**

```ts
type DemoStage = "funding" | "stocks" | "strategies" | "proceeds";
type DemoScenario = "eligible" | "zero_income" | "principal_loss" | "below_minimum" | "at_minimum";
type LandingDemoFixture = {
  funding: { grossKobo: string; feeKobo: string; availableKobo: string; rateKoboPerUsd: string; settlementMicro: string };
  stocks: readonly { id: "TSTA" | "TSTB"; name: string; quantityRaw: string; decimals: number; unitPriceKobo: string; valueKobo: string }[];
  strategy: { initialPrincipalKobo: string; lossExitKobo: string; lossKobo: string; eligibleIncomeKobo: string };
  proceeds: { qualifyingGrossKobo: string; belowMinimumGrossKobo: string; atMinimumGrossKobo: string; feeKobo: string; minimumGrossKobo: string };
};
```

- Export `landingDemoFixture: LandingDemoFixture` with the spec's exact values.
- `formatNgn(kobo: string): string`: exact bigint grouping, Unicode minus before ₦, hide `.00` only for whole naira, otherwise show two decimals. Reject invalid integer strings; never convert balances to `Number`.
- `formatUnits(raw: string, decimals: number): string`: exact decimal quantity without exponential notation; trim fractional trailing zeroes; raw quantities must be nonnegative canonical integer strings and decimals an integer from 0 through 18; reject invalid inputs/counts.
- `payoutPreview(grossKobo: string): { status: "rollover" | "qualifies"; grossKobo: string; feeKobo: string; receivedKobo: string; rolloverKobo: string }`: nonnegative gross, gross threshold first, no charged fee below minimum.
- `LandingDemo()` owns `stage`, `selectedStock`, `strategyOpened`, strategy scenario (`eligible | zero_income | principal_loss`), proceeds scenario (`eligible | below_minimum | at_minimum`) and preference (`payout | reinvest`). No shared state with the decorative diagram.

- [ ] Write exact amount/fixture assertions first, without executing:
  - `formatNgn("500000") === "₦5,000"`; `formatNgn("199999") === "₦1,999.99"`; `formatNgn("-200000") === "−₦2,000"`; zero formats as `₦0`.
  - `formatNgn("900719925474099301") === "₦9,007,199,254,740,993.01"`; malformed decimal/exponent input is rejected.
  - `formatUnits("250000",6) === "0.25"`; `formatUnits("1250000",6) === "1.25"`; raw zero and invalid decimal counts behave explicitly.
  - Payout `199999` → rollover `199999`, fee `0`, received `0`; `200000` → qualifies, fee `10000`, received `190000`; `500000` → received `490000`.
  - Funding available = gross − fee; rational FX gives exactly `66000000` micro-units; both stock examples value to `1000000` kobo; strategy loss is `-200000` kobo and not income.
- [ ] Implement helpers and fixtures using bigint math, separate from backend modules. Keep all money values integer strings across component props.
- [ ] Build controlled Radix tabs with labelled panels and arrows/Home/End keyboard support. Keep all four chapter controls readable at 360px; use an intentional two-row layout or clearly contained horizontal tab scroller without document overflow.
- [ ] Implement funding breakdown, fictional-stock selection and valuation explanation. Every panel carries **Independent illustrative example**; no diagram/chart implies these amounts form a realized return journey.
- [ ] Implement strategy entry as a separate **Open strategy example** action after opening the chapter. Show no strategy by default. Opening it enables local scenario comparison only; say explicitly that it is not an authorization. Explain eligible income, zero income, principal loss and unconverted rewards.
- [ ] Implement payout/reinvestment comparison and the qualifying/below-minimum/at-minimum controls. Render the exact payout equation and gross-first threshold. Bank details are masked; no identity inputs or transferable numbers. Reinvest copy distinguishes its possible costs from the bank payout example.
- [ ] Implement **Reset demo** restoring every default and returning focus to the active Add naira tab. Use polite announcements for user-triggered result changes only, never for loops. Keep panel-height changes in normal layout so figures cannot clip.
- [ ] Add browser assertions: chapter entry does not select a strategy; explicit open reveals examples; all scenarios and preferences render correctly; reset clears all selections; reload does not restore them; motion/diagram interaction does not alter them; no network, cookies or storage writes occur.
- [ ] Review diff against spec/API semantics, update checklist and commit: `feat: add illustrative investing and proceeds demo`.

### Task 5 — Complete accessibility, metadata and documentation

**Files:** Modify layout, global styles, landing components, README and browser specs. Create original SVG favicon and static PNG social image. Remove the T3 favicon asset if superseded; retain no starter branding. Add asset/source notices where applicable.

**Interfaces:** Use the existing Next metadata API and Geist configuration. Title **V3ST — Start with naira. See investing clearly.** Description must identify an illustrative beta preview. `robots: { index: false, follow: false }` remains in force pending a separate public-release decision.

- [ ] Complete visible focus styles, contrast, 44px control targets, semantic headings/landmarks, descriptive logo alt text, tab/dialog names and screen-reader treatment of decorative SVG/canvas. Respect safe areas and long labels.
- [ ] Apply live `prefers-reduced-motion` changes and global pause consistently: stop ticker, floating tiles, path cycling, fluid simulation, parallax and cursor follower; preserve essential content and controls. Pause must not reset the demo. Resume must not trigger a sudden jump through missed animation frames.
- [ ] Complete no-JS, failed-enhancement, WebGL-unavailable and short-viewport fallback behavior. No hidden essential server HTML or endless skeleton. Ensure overlays/sheets do not leave body scrolling locked after closing/unmounting.
- [ ] Generate original V3ST favicon and static 1200×630 PNG social artwork with approved palette/type, no third-party endorsements or return figures. Set metadata paths, alt text and dimensions. Use an explicitly configured application URL if an absolute URL is required; do not invent a public production domain.
- [ ] Update README: `/` now contains the marketing page and local illustrative demo; financial APIs remain unchanged; describe pause/reset and beta/noindex status, local-only asset serving, preview prerequisites, and final E2E commands. Distinguish this frontend assignment from the earlier backend-only onchain release.
- [ ] Document selected dependency/CLI versions, brand provenance, any adapted renderer/license, source-to-component mapping, accessible deviations from Katana and unresolved asset limitations in the review record. Do not claim verification yet.
- [ ] Review complete copy/metadata for unsupported ownership, income, safety, partner or audit claims. Update checklist and commit: `feat: finish landing accessibility and V3ST metadata`.

### Task 6 — Final verification, visual review and handoff

**Files:** Complete `e2e/landing.spec.ts`, `e2e/motion.spec.ts`, `playwright.config.ts`, `package.json` `test:e2e` script, `.gitignore` for browser artifacts, and the review record. Fix affected source/tests as evidence requires.

- [ ] Add `@playwright/test` as a dev dependency through Yarn and install its Chromium runtime in the execution environment. Keep E2E specs outside `tests/**/*.test.ts`; no changes to backend test isolation.
- [ ] Configure Playwright to start/stop the built app with `yarn start --hostname 127.0.0.1 --port 3107`, base URL `http://127.0.0.1:3107`, `reuseExistingServer: false`. Do not run a worker. Supply explicit `APP_STAGE=beta`, `YELLOWCARD_MODE=simulated`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3107`, a test-only `SIMULATED_IDENTITY_SECRET` of at least 32 characters, a test-only `PAYCREST_SIM_WEBHOOK_SECRET` of at least 16 characters, blank `SENTRY_DSN`, and `DATABASE_URL=postgresql://landing:local-only@127.0.0.1:9/landing_unused`. The landing must work without that database. Clear provider credentials and testnet signer variables; inherit only necessary tooling environment. Build with the same beta/public-URL settings.
- [ ] Add `test:e2e: "playwright test"` and ignore `playwright-report/`, `test-results/` and traces. Make the suite reject `/api/*`, `/v1/*`, `/webhooks/*`, external requests, RPC and WebSocket connections; allow same-origin page/font/image/script assets. Block and record violations so an aborted request cannot pass unnoticed. Capture page errors, hydration errors and console errors.
- [ ] Finish browser coverage at 360×800, 390×844, 768×1024 and 1440×1000. Assert no document horizontal overflow, no clipped figures, valid image dimensions, working anchors/CTAs, focus, scenarios, reset and pause. Test no-JS in a separate context; test reduced motion and a WebGL-disabled/context-loss path. Include direct hash entry and scroll restoration.
- [ ] Add behavioral motion checks: hero track/overlap geometry, opacity ordering at progress 0/0.3/0.6/1 after settling, reversal, visible header CTA after handover, ticker duration/direction/pause, diagram independence, and static reduced-motion layout. Use numerical tolerances/settled predicates rather than flaky millisecond screenshot deadlines. Confirm the source timings in `motion-contract.ts` with unit assertions.
- [ ] Prepare two isolated local PostgreSQL databases; the disposable test database name ends in `_test` and differs from the application database. Use ephemeral local-only credentials. Do not use the developer's existing remote database. Ensure Forge/Anvil are available; existing global setup runs migrations on the test DB and starts/stops isolated loopback Anvil chain 31337 without a fork.
- [ ] Run the required final sequence under that isolated beta environment, recording exit codes and summaries:

```bash
yarn prisma validate
yarn prisma generate
yarn test:contracts
yarn test
yarn lint
yarn typecheck
yarn build
yarn test:e2e
```

`yarn test` includes the existing backend suite and therefore needs the disposable database and Anvil even when the landing assertions themselves are pure. `yarn test:e2e` starts the already-built app and needs neither database nor Anvil. Do not add test-only bypasses to financial policy.

- [ ] Fix failures and rerun failed/affected checks. If a source fix affects compilation, rebuild before rerunning production browser tests. Report pre-existing failures by name; do not skip them or describe a partially passing suite as complete.
- [ ] Inspect the rendered page, not just tests: desktop and mobile full-page captures, hero scroll checkpoints, all demo scenarios, menu, hover/focus, and real 200% browser zoom. For zoom, viewport resizing alone is not equivalent; include a manual browser check. Record viewport, motion setting, browser/version and evidence paths. Batch visual fixes before repeating review.
- [ ] Compare the hero, ticker, diagram, pointer takeover, navigation and footer transitions with the captured Katana contract and, when reachable, a separate reference-browser session. No external reference browsing is allowed inside the network-contained landing test context. Verify the provider marks visually against originals. Record any deviation; do not claim pixel/behavior identity from unit tests alone.
- [ ] Run Impeccable's detector once over changed UI targets if available, act on findings, and request an independent rendered-review pass when tooling permits. Review type hierarchy, spacing, contrast during fluid movement, motion lifecycle, missing states and component boundaries. A missing optional skill is not a reason to omit native visual/accessibility review.
- [ ] Review client imports/build artifacts for Node-only modules and SDKs, confirm the root route is static, and verify no runtime image hotlinks, starter branding, dead links or invented claims remain. Confirm all task acceptance items, including Feel.cash's asset status.
- [ ] Record actual commands/results, screenshots, limitations, provider simulation status and scope in `docs/superpowers/reviews/2026-11-15-v3st-landing.md`. Update the checklist, review the final diff and commit: `test: verify V3ST landing behavior and beta boundaries`.

## Completion criteria

The implementation is complete only when the six tasks, all spec acceptance criteria and the final verification sequence are accounted for with actual evidence. The handoff states what changed, how to preview it, what passed and any remaining limitation. A missing official mark or failed gate is disclosed explicitly. Do not claim provider verification, production readiness or deployment.

## Planning record

- This plan applies the installed Impeccable 4.8.1 guidance and Superpowers writing-plans workflow to the user's already selected direction.
- Reference behaviors were measured from the current Katana page and public assets on 2026-11-15. The public page now uses the **Trade. Earn. Own.** design; older blue/yellow screenshots are not the motion reference.
- Planning ran the requested setup script successfully with Node 24.15.0/Yarn 1.22.22 before the user changed scope to plan-only. It installed existing locked dependencies and generated ignored Prisma output. No application source, dependency manifest, logo assets or styles were changed, and no test/lint/typecheck/build gates were run.
- The only deliverables of this planning handoff are this plan and its companion specification. All implementation checkboxes remain open.
