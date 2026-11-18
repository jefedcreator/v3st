> **Superseded (2026-11-18):** replaced by the [2026-11-17 landing redesign spec](../specs/2026-11-17-v3st-landing-redesign-design.md), its [plan](../plans/2026-11-18-v3st-landing-redesign.md) and its [review](../reviews/2026-11-18-v3st-landing-redesign.md).

# V3ST landing implementation review

Implementation began 2026-11-15 on `codex/implement-v3st-landing` from the clean `codex/v3st-landing` planning branch.

## Execution checklist

- [x] Task 1: design system, authentic assets, generated primitives and dependencies.
- [x] Task 2: anonymous shell, hero, fluid artwork and navigation.
- [x] Task 3: stories, ecosystem, ticker, diagram, FAQ and Friday explanation.
- [x] Task 4: exact independent local demo.
- [x] Task 5: accessibility, metadata and documentation.
- [x] Task 6: final repository/browser/visual verification and handoff.

## Decisions and workflow

Superpowers 7.0.2 and Impeccable 4.8.1 are installed locally. Impeccable context ran once; new-work/animate/craft-floor guidance was read. Use the executing-plans workflow for the tightly connected landing tasks, with bounded delegated asset work and independent final review. Repository/user instructions override per-task TDD execution: assertions are authored with tasks and all executable gates run at the end. Task completion commits before that gate mean implemented/unverified.

Ruling: the approved product/spec supplies the context and design direction; no repeat concept interview or DESIGN.md is created. On this filesystem Impeccable resolves `DESIGN.md` to the existing product architecture `Design.md`; the required `DESIGN_SYSTEM.md` is the UI authority instead. No generic Impeccable artifact overwrites product architecture.

Preflight interfaces: Task 1 primitives/tokens feed Tasks 2–5; Task 2 motion context (`paused`, `reducedMotion`) feeds decorative islands and local demo feedback; Task 1 local logo catalogue feeds Task 3; Task 4 types/helpers/fixtures have no backend imports; Task 5 metadata/static assets feed Task 6 production-browser checks. No conflicting interfaces found. Native document scrolling and the pinned choreography override generic design-skill defaults.

Setup: initial system Node 20.11.1 was rejected by setup. Reran with `/Users/jefedcreator/.nvm/versions/node/v24.15.0/bin` on PATH; Yarn 1.22.22 frozen install and platform Prisma generation exited 0. Existing `.env` was neither read nor copied; implementation checks will use explicit isolated local beta settings. The ignored npm lockfile is preserved and will never be committed.

Verification was deferred until Task 6. The implementation notes below preserve that task-by-task distinction; actual final results follow them. No external-provider activation or deployment is authorized.

## Task 1 implementation (unverified)

Official shadcn CLI 4.23.0 generated exactly button, badge, card, tabs, sheet, skeleton. CLI used Yarn via its package-manager user agent. It misinterpreted the cn alias as package `cn`; removed that unused dependency and corrected generated imports to `@/utils/cn`. Restyled in place with semantic tokens, unified Radix and Phosphor SSR icons. No direct Lucide/scoped Radix additions. Added exact motion 14.14.0, radix-ui 1.8.1, Phosphor 2.1.10, CVA .7.1, clsx 2.1.1, tailwind-merge 3.7.0, tw-animate-css 1.4.0 without framework/backend upgrades.

All twelve local ecosystem marks are sourced; provenance, dimensions, content types and hashes live in public/brands/sources.json. Feel.cash resolved from its official launchpad; Solana official-host 429 was resolved from the Foundation-owned repository. SVG inspection found no scripts/event handlers/external resources. Brand assets require final rendered visual review.

Task 1 diff review: no credentials, backend changes, Node-only browser imports, invented investment claims or Katana assets. Shared hero stylesheet was authored alongside foundation; shell components remain in Task 2. Gates remain deferred.

## Task 2 implementation (unverified)

Static anonymous marketing composition replaces the starter. Native anchors, skip link, labelled left Radix sheet, original growth contours, focus-revealed hero actions, passive scroll/ref choreography, fit measurement and normal-flow fallback are implemented. Native browser assertions cover geometry, reversal, deep entry/history and reduced/short layouts; additional shell assertions accompany the final browser suite.

The renderer is original WebGL2: velocity/dye advection, divergence, Jacobi pressure solve (38 iterations), projection and optional viscosity diffusion (14 iterations when enabled). Named reference values map to solver timestep, resolution, density decay, radius/force, edge reflection and idle/pointer interpolation. Display DPR is capped at 1.5, grid width 160 and simulation cadence 30Hz as explicit performance adaptations. The field has no copied renderer/license dependency. Float WebGL2 failure/context loss keeps static SVG. Lazy GPU work starts after text paint, with cleanup on hidden/offscreen/unmount and pause without demo state effects. Behavioral fidelity still needs browser review.

Delegated asset and renderer workers exhausted their tool session after asset downloads; root completed provenance and original renderer natively. No gate results are claimed.

## Task 3 implementation (unverified)

Alternating quantity/fee explanations, six-row 27s illustrative ticker, all nine provider groups with separate network/settlement row, ordered server walkthrough, independent four-node diagram, scoped fine-pointer story follower, Friday window and native FAQs are implemented. The ticker pauses hover/focus/local/global/hidden/offscreen, with one semantic list. Diagram entrance/float/highlight/hover grace and parallax follow captured constants; only presentation changes. Provider caption and risk/rights/cash distinctions follow current onchain/Friday decisions. Source/diff review completed, browser assertions are consolidated in Task 6 before execution. No external links or unsupported social proof.

## Task 4 implementation (unverified)

Authored exact formatter/fixture/threshold tests before implementing browser-safe BigInt helpers. Local controlled Radix chapters expose the independent funding, both fictional stocks, explicit strategy example (default no selection), zero/loss cases, gross-first rollover and payout/reinvestment comparisons. Reset restores every default and focuses Add naira. User announcements are polite and separate from decorative loops. No backend imports, storage, account inputs or automatic advances. All amounts remain integer strings. Payout fee never applies to the reinvest comparison. Authored tests still await final execution; browser scenario assertions are consolidated in Task 6.

## Task 5 implementation (unverified)

V3ST title, beta description, noindex/nofollow, configured metadata base, original SVG icon and 1200×630 static PNG social card replace starter branding. Social art is original vector composition rasterized by sharp using official Geist font (Google Fonts repository); no provider marks or financial claims. README documents reachable page, pause/reset, local serving, independent backend prerequisites and final E2E workflow. Focus, 44px targets, semantic sections, native details and safe areas are implemented. The formatter caught a missing closing brace in the new demo tab handler; corrected before final gates. No intermediate passing result was claimed.

Accessible adaptations: measured hero fit rather than fixed crop; no pin/overlap or spatial loops under reduced motion; no-JS mobile links/native FAQs/ordered explanations; focused hero actions override fading; local pause is independent of demo state. All need rendered verification.

## Task 6 findings and fixes

The first production browser run passed 13/17 checks; after the application fixes, 16/18 passed until the two harness issues described below were corrected. The final full run passes 18/18.

The first full Vitest run passed 344/345 assertions. The existing `trades > rejects a retry without enough cash` fixture depended on a minute-boundary worker drain to fill its prerequisite purchase. It now advances the simulator to that purchase's persisted settlement time and progresses the same service explicitly. No financial policy or scheduler implementation changed. The subsequent full run passed all 348 tests across 63 files, including the added canonical-input regressions.

Initial lint/type checks found new harness typing/style issues and stale Next-generated references to the replaced starter route. Those were corrected; the optimized build regenerated route types. A later build found that TypeScript's broad JavaScript include also picked up Playwright's generated trace viewer. Both TypeScript and ESLint now exclude `playwright-report/` and `test-results/`, alongside Git's artifact ignores. The final build succeeds with those artifacts still present.

Initial browser review reproduced an unscrollable short mobile sheet, a once-only diagram entrance replaying after pause/resume, and a weak context-loss assertion. The sheet now owns vertical scrolling, the diagram remembers completion, and the context-loss test first proves the renderer is ready before asserting fallback. No-WebGL tests likewise wait for actual fallback. Focused hero actions are raised above overlapping story content while retaining visible focus.

**Loading placement adaptation:** the planned automatic `(marketing)/loading.tsx` caused Next 15 to emit the synchronous root inside a hidden `S:0` segment, dependent on JavaScript's `$RC` reveal. A no-JavaScript browser reproduced the permanently visible skeleton. The static root now renders without that Suspense boundary; the matching skeleton is retained as `src/components/landing/marketing-loading.tsx`. This satisfies the higher-priority readable HTML/deep-link requirement without manipulating Next internals. Final HTML contains no hidden loading segment, and direct entry/reload works.

Two subsequent browser failures were harness issues: Playwright text selectors exclude `noscript` descendants, and auto-scrolling to a footer link legitimately updates the previous history entry's scroll position. The tests now inspect the actual no-JS paragraph and navigate through the visible fixed header before Back/Forward. The final full run passes all 18 checks.

Independent source/acceptance review found no remaining Critical/Important issues after remediation. It prompted stronger checks for all reset defaults, ticker running state/upward direction, settled hero opacities, and network containment. The browser guard now permits only same-origin document/static asset paths with GET/HEAD; rejects fetch/XHR, backend paths, RPC and every WebSocket; records aborted violations and page/hydration/console errors; and collects persistence writes outside the document so reload cannot erase evidence. All 18 contexts reported zero violations, errors, cookies or persistence writes.

A suggested newline-formatting defect was independently disproved with Node 24 before changing behavior; regression assertions retain that finding. Money helpers also reject non-string runtime input explicitly. No balances are converted to floating-point numbers.

## Actual final gates

Execution used Node 24.15.0, Yarn 1.22.22, Forge/Anvil 1.9.0, owned loopback PostgreSQL 14 on port 55439, separate `v3st_landing_beta`/`v3st_landing_test` databases and isolated Anvil chain 31337 without a fork. The developer's database was not used. No worker was started for browser checks. Build/browser launchers override documented environment names with local simulated beta values, blank credentials/signers/Sentry and an unreachable database at port 9; optimized production never changes provider modes.

| Command | Final exit/result | Evidence under `/private/tmp/v3st-landing-verification/` |
| --- | --- | --- |
| `bash scripts/setup-cloud.sh` | 0 with pinned toolchain | Initial setup output; wrong system Node rejected before rerun |
| `yarn prisma validate` | 0 | `prisma-validate.log` |
| `yarn prisma generate` | 0 | `prisma-generate.log` |
| `yarn test:contracts` | 0; 17/17, four suites | `contracts.log` |
| `yarn test` | 0; 348/348, 63 files | `vitest-final.log` |
| `yarn lint` | 0; no errors, eight existing warnings | `lint-final-4.log` |
| `yarn typecheck` | 0 | `typecheck-final-4.log` |
| `node scripts/landing-beta.mjs build` (isolated `next build`) | 0; `/` static | `build-final-4.log` |
| `yarn test:e2e` | 0; 18/18 | `e2e-final-4.log` |
| `yarn playwright install --no-shell chromium` | 0 | `browser-install.log` |

Playwright 1.56.1 is pinned because the initially resolved newer CLI rejected this macOS 13 host. Official Chromium 141.0.7390.37 build 1194 was installed and selected through `LANDING_CHROMIUM_PATH`; a prior diagnostic run used cached Chromium 156. The full browser install succeeded; the optional headless-shell download was slow and stopped in favor of `--no-shell`. Standard hosts can use the README's normal Chromium install. There are no skipped final tests.

The eight pre-existing lint warnings are in PostCSS/Prettier configuration, the Hydrex replica, and existing backend test helpers/integration fixtures. The final build reports only the existing Hydrex unused `shares` warning. Logs also contain the tooling-only NO_COLOR/FORCE_COLOR warning. No new landing lint warning remains.

## Static and asset boundary review

Independent inspection of the completed build found `/` in `prerender-manifest.json` with `initialRevalidateSeconds: false`, `srcRoute: /` and `dataRoute: /index.rsc`. The root is `○` in the build table (158 kB route / 261 kB first-load JS). Its client reference manifest has 66 entries, with no backend, Node crypto, viem, Prisma, Privy or Sentry matches. Client chunks contain no provider SDK/RPC signatures; the route chunk is 35,780 bytes and lazy fluid renderer 8,004 bytes. The finalized 123-file root server trace contains no backend/provider/viem/Prisma dependencies.

Generated `index.html` is 101,759 bytes, contains local image/font/script sources, no starter copy, no external `src`/`href`, no hidden loading segment and `noindex,nofollow`. All rendered ecosystem images resolve to `/brands/*`, directly or through the local Next image optimizer. All twelve marks are present, including Feel.cash; the provenance manifest retains source/variant/dimension/hash records. Runtime tests verify all twelve load with valid natural dimensions at every required viewport. No mark is a partnership claim. Final provenance review resolved Privy’s folder locator to the exact `Privy_Wordmark_Black.svg` download and verified its bytes against the checked-in SHA-256; inline SVGs retain their source-page URL and exact viewBox locator.

Impeccable's detector ran once over the changed UI and returned `[]` (`impeccable.json`). The separate source/acceptance audit and native browser checks provide the functional evidence; the detector result alone is not a visual sign-off.

## Rendered evidence and motion comparison

Root and independent rendered review inspected Chromium 141.0.7390.37 at 1440×1000 and 390×844. The walkthrough also has a 1440×1200 viewport capture. Browser behavior assertions additionally cover 360×800 and 768×1024. All images/logs remain local artifacts under `/private/tmp/v3st-landing-verification/`; they are intentionally excluded from Git.

| Evidence in `screenshots/` | State reviewed |
| --- | --- |
| `desktop-full.png`, `mobile-full.png` | Full hierarchy, spacing, section order, Friday/FAQ/footer and persistent beta |
| `desktop-hero.png`, `mobile-hero.png`, `hero-progress-{0,0.3,0.6,1}.png` | Normal native motion, intro completion, handover ordering, header CTA and original art contrast |
| `mobile-reduced.png` | Readable normal-flow reduced-motion adaptation |
| `mobile-menu.png` | Settled left sheet, complete links/close control/disclosures |
| `story-hover.png`, `story-focus.png` | Scoped pointer follower and clear story-link focus ring |
| `ecosystem.png`, `how-it-works.png` | Authentic marks, caption, complete four-step explanation and independent diagram |
| `1440-*.png`, `390-*.png` | Funding, both stocks, no strategy, eligible/zero/loss, qualifying/below/at minimum, reinvestment |
| `zoom-200-{hero,heading,menu,proceeds,rollover}.png` | Actual native browser zoom; short ordinary-flow layout and readable financial results |

Full-page/demo captures pause decorative animation for readable review; hero/checkpoint/hover captures use normal motion. Scenario captures wait for the 200ms button transition. Isolated section captures hide fixed header/beta/pause/skip chrome during screenshot only to avoid tiling overlays; actual viewport captures retain it. An early menu picture was mid-slide and an early walkthrough element capture clipped offscreen painting; both were replaced with settled actual-viewport evidence. No product content was hidden for acceptance.

Visual review found and fixed straight-alpha shader output being interpreted as premultiplied alpha (washing out the fallback), and the mobile pause pill overlapping the lower rail. Explicit straight-alpha compositing restores the original contours. The mobile rail/fit measurement reserves control clearspace. At heights up to 500px the pause control is a 44px labelled icon in header clearspace; native zoom review prompted this additional protection against covering financial figures. The subsequent build and complete 18-test browser suite passed again.

The real zoom check used a headed Chromium window and the browser extension API `chrome.tabs.setZoom(tabId, 2)`, not viewport emulation or pinch scaling. Native zoom reports `2`; outer width stays 1440 while inner width changes 1440→720, inner height 662→331, and DPR 2→4. Document width remains 720 with no horizontal overflow. Hero fit is false; sheet navigation reaches the demo; qualifying/rollover figures remain usable. Playwright's ordinary screenshot path cropped at Retina native zoom; direct CDP `Page.captureScreenshot` with `fromSurface:false` captured the actual 2880×1324 physical viewport. See `zoom-results.json` and `zoom-final-4.log` for the measurements. Root and independent rendered review inspected the corrected viewport images; no Critical/Important visual finding remains.

Twenty scenario/viewport combinations produced 62 measured financial elements: no text-box horizontal overflow or out-of-viewport horizontal bounds (`capture-results.json`), and no runtime network/error violations. Root and independent review found no missing or clipped figures/disclosures in those scenario captures. Native font/spacing and marks are readable; o1 Exchange retains its official supplied clearspace, giving it lighter visual weight than neighboring wordmarks rather than cropping/recoloring it.

Token contrast calculations (`contrast.json`): foreground/canvas 12.51:1, muted/canvas 5.97:1, muted/sage 5.35:1, white/primary 7.13:1 and foreground/fresh green 8.49:1. Rendered hero text remains clear over the moving field and ivory veil.

Compared the captured Katana reference (`/private/tmp/v3st-katana-desktop.png`) and its measured contract with rendered checkpoints, ticker, diagram, scoped follower, navigation and closing/footer treatment. Hero geometry, ordered/reversible fades, 27s upward ticker and specified diagram/follower timings are implemented and checked. V3ST deliberately retains the approved green/light identity, original contours, fictional instruments and product copy. Its original solver is bounded at DPR 1.5/grid width 160/30Hz; this is a documented performance adaptation. Reference parameters map to this solver and pointer/idle logic; no pixel identity or identical fluid turbulence is claimed. Short/reduced layouts, focus overrides and pause remain the explicit accessible exceptions.

## Release scope

The page is an anonymous illustrative beta with local fixtures, no account/session/persistence, no real funds and no live provider activation. Existing provider/legal decisions remain in their existing decision/evidence documents. This landing work neither resolves those partner approvals nor adds authenticated dashboards or financial endpoints. No deployment, real identity submission, mainnet transaction, external message or real-money smoke test was performed.

The final diff was reviewed, task checklist completed, and all owned browser servers/Anvil processes exited. The temporary PostgreSQL instance was stopped (`postgres-stop.log`, exit 0); existing developer services were left alone. Generated Prisma, databases, dependencies, `.env`, screenshots, reports and build output are not committed.

Browser execution covers Chromium; Safari and Firefox were not run. The native zoom measurement is the recorded 720×331 CSS viewport, not a claim about every browser/OS/zoom combination.
