# V3ST Landing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> If those skills aren't installed in the cloud environment, execute this checklist natively, say so in the review record, and continue (`AGENTS.md`).
>
> This plan also applies Impeccable. Its direction contract is committed at `.impeccable/surfaces/src-app-marketing-page-tsx.md`, and its rules for this page are written into the plan below, so the build doesn't depend on the skill being installed.

**Goal:** Replace the light ivory landing page with a dark page that looks and moves like katana.network, set in flag green and Bricolage Grotesque, for Nigerian first-time investors, with a stored beta waitlist as its main action.

**Architecture:**
- **Pages.** The `(marketing)` route group renders Server Components. The home page is statically generated and regenerated every five minutes, so the ticker shows current beta prices from a new read-only catalog method.
- **Interactivity.** Client islands handle the motion, the mobile sheet, the pause control and the waitlist form.
- **Motion.** It copies Katana's own engineering: native scrolling, `requestAnimationFrame` loops that write CSS custom properties, `IntersectionObserver` triggers, and a lazily loaded LiquidEther fluid background.
- **Backend.** `withMiddleware` gains form-body handling and PostgreSQL rate limiting. Alongside it there is a waitlist route and an operator export.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript (strict), Tailwind CSS 4 (`@theme static`), `motion/react`, `radix-ui`, `@phosphor-icons/react`, `three@0.180.0` (lazy), Prisma 6 / PostgreSQL, Zod 3, Vitest 5, Playwright 1.56.1.

**Spec:** [`docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md`](../specs/2026-11-17-v3st-landing-redesign-design.md). Read it in full before Task 1. It holds the exact copy, tokens, motion numbers and data contracts this plan refers to as "spec §Section".

## Global Constraints

- **Toolchain:**
  - Node 24.15.0 and Yarn 1.22.22. Start with `bash scripts/setup-cloud.sh`.
  - `yarn.lock` is the only committed lockfile. Add packages with `yarn add --exact`.
- **Before Task 1, read** `AGENTS.md`, `CLAUDE.md`, `Design.md`, `BACKEND_PATTERNS.md`, `FRONTEND_PATTERNS_GUIDE.md`, `PRODUCT.md`, `docs/api/customer-app.md`, the spec and the surface brief.
- **`CLAUDE.md` rules:**
  - Make a todo list per task, and commit at the end of each task.
  - Never use optional or conditional object spreads (`...(cond ? {…} : {})`, `...(x && {…})`, `...(x ?? {})`).
  - Never add "Co-Authored-By: Claude", "Generated with Claude Code" or similar lines to commits.
- **`CLAUDE.md` gates:** do **not** run `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build` or Playwright between tasks. Each task writes its tests; Task 13 runs everything once. A task's commit means "implemented, not yet verified".
- **Beta only:** `APP_STAGE=beta`. No real money, live providers, mainnet, deployment or outbound email.
- **Theme:** one dark theme. Tokens live in `@theme static` in `src/styles/globals.css`. No Tailwind config file, no theme provider, no theme toggle.
- **Colours** (spec §Visual system):

  | Token | Value |
  | --- | --- |
  | void | `#020604` |
  | inset | `#050B08` |
  | surface | `#08100C` |
  | surface-raised | `#0C1712` |
  | stroke | `#15211B` |
  | control-border | `#5A6F62` |
  | ink | `#E3EBE6` |
  | heading | `#FFFFFF` |
  | muted (text) | `#93A69B` |
  | subtle | `#7F9187` |
  | signal | `#00804D` |
  | signal-hover | `#009459` |
  | gain | `#3DDC97` |
  | loss | `#FF6B5A` |
  | fluid | `["#0D6A3D", "#0D6A3D", "#008A52"]` |

- **Type:** Bricolage Grotesque only, through `next/font/google` with `subsets: ["latin", "latin-ext"]` and `axes: ["opsz"]`. Every number uses tabular figures. No ₦ may come from a fallback font.
- **Copy:** exactly as in spec §Page structure and copy.
  - No crypto vocabulary (wallet, token, tokenized, USDC, gas, onchain, blockchain, swap, liquidity, Sepolia). The only exceptions are the logo row, its alt text, and "Base" in the safeguards card.
  - Say "invest in", never "own".
  - No invented numbers, and no partnership, endorsement, audit, licence or guarantee claims.
- **Figures:** every figure on the page comes from code (`policy.ts`, `STOCK_PROFILES`, the public ticker), never from a hand-typed literal.
- **Motion:** exactly as in spec §Katana behaviour contract.
  - Native scrolling only: no GSAP, Lenis, wheel interception, scroll-jacking or page-wide snap.
  - No React state updates per frame.
- **Browser imports:**
  - `cn` comes from `@/utils/cn`, never from `@/utils` (which imports `node:crypto`).
  - Icons come from `@phosphor-icons/react/dist/ssr`; animation from `motion/react`.
  - Client components never import `src/backend/**`, Prisma, `@/env` or `policy.ts`. Server Components pass them plain strings and numbers.
- **Network:** marketing routes make no client-side network call except `POST /api/v1/waitlist` and same-origin page prefetches. They set no cookies and write no storage.
- **Logos:**
  - Official files only, served locally, each with a manifest entry (spec §Logos and assets).
  - Apple, Microsoft and NVIDIA, and any provider whose terms restrict use, still use their official marks under decision 11. Record this with `termsNote` and `operatorAccepted: "2026-11-18"`.
- **Never create a file named `DESIGN.md`.** It collides with `Design.md` on case-insensitive filesystems. The design-system file is `DESIGN_SYSTEM.md`, with `.impeccable/design.json` beside it.
- **Impeccable, when installed:**
  - Run `impeccable context --target "src/app/(marketing)/page.tsx"` once.
  - Read its `reference/craft-floor.md` immediately before the first UI edit (Task 6).
  - The direction is pinned by the operator, so skip `concept-seed`. The build path is code-led.
- **Craft-floor bans that always apply:**
  - no kicker or eyebrow above a heading;
  - no modal for the waitlist;
  - no gradient text;
  - no hard offset shadows;
  - no community icon sets.

  Theme the browser's own surfaces too: text selection, the caret, scrollbars, focus rings and tabular figures.
- **Accessibility, WCAG 2.2 AA:** 44px targets, visible focus, live-region announcements for waitlist results, and the page-wide pause control (WCAG 2.2.2).
- **Never commit** `.env`, secrets, generated Prisma, dependencies, build output, `.superpowers/`, `.impeccable/review/`, `.impeccable/mocks/`, `.impeccable/build/`, screenshots, traces or reports.

## Review Focus

1. **Database unreachable at build or regeneration time.** The visitor still gets the whole page; ticker rows show logo, ticker and name with no numbers. Pinned by `landing-ticker.test.ts` (Task 3) and `ticker falls back to names when prices are unavailable` (Task 12).
2. **JavaScript off, or its bundle fails to load, while joining the waitlist.** The native form post lands on `/waitlist` with readable copy and the form again. Pinned by the url-encoded cases in `waitlist.test.ts` (Task 5) and `posts natively without JavaScript` (Task 12).
3. **The same person signs up twice with different case or spacing, or a bot fills the hidden field.** Both get the same answer, the list holds one row, and nobody can tell whether an email is already on it. Pinned in `waitlist.test.ts` (Task 5).
4. **A visitor arrives on `/#faq`, restores a mid-page scroll position, or scrolls back up.** The hero never flashes blank or replays its intro, and the header button state matches the scroll position. Pinned by `shouldPlayIntro` in `motion-contract.test.ts` (Task 9) and `deep link does not replay a blank hero` (Task 12).
5. **Prices are stale.** That happens at weekends, including Saturday 5 December, the submission date, and after a feed outage. Stale rows show "Delayed", the caption shows a date, and SpaceX always shows "Estimate". Pinned by `formatPriceCaption` in `format.test.ts` (Task 8) and the delayed and estimate cases in `public-ticker.test.ts` (Task 3).

---

## File structure

New feature files live in `src/components/landing/`, with kebab-case file names and PascalCase exports.

| File | Responsibility |
| --- | --- |
| `content.ts` | Server-only copy and figures derived from `policy.ts`, `STOCK_PROFILES` and the Earn copy |
| `format.ts` | Browser-safe exact formatters: naira, percentages, price caption, counter text |
| `brand-catalogue.ts` | The 12 "Built to work with" brands, in order, with their treatment and beta status |
| `logo-badge.tsx`, `brand-mark.tsx` | Server Components that show a logo, or its letter or name fallback when the file is missing |
| `wordmark.tsx` | The outlined V3ST wordmark SVG |
| `landing-motion.tsx` | Client context: `paused`, `reducedMotion`, `setPaused` |
| `site-header.tsx`, `nav-links.ts`, `header-cta.tsx`, `mobile-nav.tsx`, `pause-control.tsx` | The header and its islands |
| `site-footer.tsx` | Footer columns, disclosures, giant wordmark |
| `markdown-lite.ts`, `document-body.tsx` | Parse and render the legal documents |
| `waitlist-state.ts`, `waitlist-form.tsx`, `waitlist-status.ts` | Waitlist logic, the form, result-page copy |
| `hero.tsx`, `stocks-section.tsx`, `ticker-row.tsx`, `built-with.tsx`, `earn-section.tsx`, `how-it-works.tsx`, `safeguards.tsx`, `faq.tsx`, `join-section.tsx` | Server-rendered sections |
| `motion/contract.ts` | Every Katana number, and the pure motion functions |
| `hero-motion.tsx`, `price-ticker.tsx`, `counter.tsx`, `journey-diagram.tsx`, `cursor-follower.tsx` | Client motion islands |
| `fluid/liquid-ether.tsx`, `fluid/liquid-ether.css`, `fluid/LICENSE-react-bits.md`, `fluid/fluid-background.tsx`, `fluid/fluid-gate.ts` | The vendored fluid and its loader |

Outside the landing directory:

- **Types and server reads:** `src/types/landing.ts` (ticker and waitlist DTOs) and `src/server/landing.ts` (ticker read with fallback).
- **Backend content:** `src/backend/content/stock-profiles.ts` (the estimate flag, `PUBLIC_TICKERS`) and `src/backend/content/documents.ts` (the privacy version).
- **Backend services:** `src/backend/services/app/catalog.ts` (`publicTicker`), `src/backend/services/security/rate-limit.ts` and `src/backend/services/waitlist/index.ts`.
- **Middleware and validation:** `src/backend/middleware/{index.ts,types.ts,rate-limit.ts}` and `src/backend/validators/waitlist.validator.ts`.
- **Routes:**
  - `src/app/api/v1/waitlist/route.ts` and `src/app/api/v1/ops/waitlist/route.ts`;
  - `src/app/(marketing)/{layout.tsx,page.tsx,legal/[slug]/page.tsx,waitlist/page.tsx}`;
  - `src/app/layout.tsx`, `src/app/icon.svg` and the social image.
- **Database:** `prisma/schema.prisma` plus one migration.
- **Unit tests** (no database): `tests/landing/*.test.ts`, `tests/unit/{middleware-form,waitlist-validator}.test.ts`.
- **Database tests:** `tests/app/{public-ticker,documents}.test.ts`, `tests/integration/rate-limit.test.ts`, `tests/api/waitlist.test.ts`.
- **Browser tests:** `e2e/{landing,waitlist,motion}.spec.ts` and the guard in `e2e/test.ts`.

## Task checklist

- [ ] Task 1 — Foundation and clean slate
- [ ] Task 2 — Logos, wordmark and brand assets
- [ ] Task 3 — Public beta ticker read
- [ ] Task 4 — Rate limiting, form bodies and waitlist data
- [ ] Task 5 — Waitlist route, operator export and privacy note
- [ ] Task 6 — Marketing layout, header, footer and legal pages
- [ ] Task 7 — Waitlist form and result page
- [ ] Task 8 — Home page sections
- [ ] Task 9 — Motion contract and hero choreography
- [ ] Task 10 — Fluid background
- [ ] Task 11 — Section motion and the frontend guide
- [ ] Task 12 — Browser test suite
- [ ] Task 13 — Final verification, rendered review and documentation

---

### Task 1: Foundation and clean slate

**Files:**

- **Delete:**
  - every file in `src/components/landing/`;
  - `tests/landing/{demo-fixtures,demo-money,motion-contract}.test.ts`;
  - `e2e/landing.spec.ts` and `e2e/motion.spec.ts`;
  - `src/app/icon.svg` and `src/app/opengraph-image.png`;
  - every file in `public/brands/`.
- **Modify:**
  - `.gitignore`;
  - `src/styles/globals.css` (rewrite);
  - `src/app/layout.tsx`;
  - `src/app/(marketing)/page.tsx` (a temporary shell);
  - `src/primitives/{button,badge,sheet}.tsx`;
  - `DESIGN_SYSTEM.md` (interim) and `PRODUCT.md`.
- **Test:** `tests/landing/tokens.test.ts`.

**Interfaces:**

- **Produces, in `@theme static`:**
  - Literal hex tokens: `--color-void`, `--color-inset`, `--color-surface`, `--color-surface-raised`, `--color-stroke`, `--color-control-border`, `--color-ink`, `--color-heading`, `--color-muted-foreground` (the spec's "muted" text colour), `--color-subtle`, `--color-signal`, `--color-signal-hover`, `--color-gain`, `--color-loss`.
  - The shadcn names stay as `var()` aliases, so the primitives keep working:

    | Alias | Points to |
    | --- | --- |
    | `background` | void |
    | `foreground`, `card-foreground`, `popover-foreground`, `secondary-foreground` | ink |
    | `card`, `muted` | surface |
    | `popover`, `secondary`, `accent` | surface-raised |
    | `accent-foreground` | heading |
    | `primary` | signal |
    | `primary-foreground` | `#FFFFFF` |
    | `border` | stroke |
    | `input` | control-border |
    | `ring` | gain |

- **Produces:** the font variable `--font-bricolage`, with `--font-sans` pointing at it.
- **Produces:** `@utility` classes `type-display`, `type-h2`, `type-figure`, `type-lead`, `type-body`, `type-label`, sized exactly as in spec §Type.

- [ ] **Step 1: Prepare the workspace.**
  - Create the feature branch `feat/v3st-landing-redesign`.
  - Run `bash scripts/setup-cloud.sh` with the pinned Node and Yarn.
  - Confirm `.impeccable/surfaces/src-app-marketing-page-tsx.md` exists and contains the six contract blocks.
  - If Impeccable is installed, run its `context` command once and record the result in the review record. Otherwise note that it isn't installed.

- [ ] **Step 2: Write `tests/landing/tokens.test.ts`.** Read `src/styles/globals.css` as text, and compute WCAG relative luminance and contrast inside the test.

```ts
it("declares the spec palette exactly", () => {
  expect(token("void")).toBe("#020604");
  expect(token("inset")).toBe("#050B08");
  expect(token("surface")).toBe("#08100C");
  expect(token("surface-raised")).toBe("#0C1712");
  expect(token("stroke")).toBe("#15211B");
  expect(token("control-border")).toBe("#5A6F62");
  expect(token("ink")).toBe("#E3EBE6");
  expect(token("heading")).toBe("#FFFFFF");
  expect(token("muted-foreground")).toBe("#93A69B");
  expect(token("subtle")).toBe("#7F9187");
  expect(token("signal")).toBe("#00804D");
  expect(token("signal-hover")).toBe("#009459");
  expect(token("gain")).toBe("#3DDC97");
  expect(token("loss")).toBe("#FF6B5A");
});
it("meets the contrast floor on the void ground", () => {
  for (const name of ["ink", "heading", "muted-foreground", "subtle", "gain", "loss"])
    expect(contrast(token(name), token("void"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast("#FFFFFF", token("signal"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token("control-border"), token("void"))).toBeGreaterThanOrEqual(3);
  expect(contrast(token("control-border"), token("surface"))).toBeGreaterThanOrEqual(3);
});
it("themes the browser's own surfaces", () => {
  expect(css).toContain("color-scheme: dark");
  expect(css).toMatch(/::selection\s*{[^}]*var\(--color-signal\)/);
  expect(css).toMatch(/caret-color:\s*var\(--color-gain\)/);
  expect(css).toMatch(/scrollbar-color:\s*#23342B\s+var\(--color-void\)/i);
  expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  expect(css).toMatch(/text-underline-offset:\s*0\.2em/);
});
```

- [ ] **Step 3: Delete the old landing files.** Delete the files listed above. Keep `src/primitives/*`, `src/utils/cn.ts`, `playwright.config.ts`, `e2e/test.ts` and `scripts/landing-beta.mjs`.

- [ ] **Step 4: Rewrite `src/styles/globals.css`.**
  - Keep the Tailwind and `tw-animate-css` imports.
  - Add the `@theme static` tokens and aliases listed above, and the type utilities from spec §Type.
  - Base layer:
    - `html { color-scheme: dark; background: var(--color-void) }`;
    - `body` text in `ink`;
    - `::selection` with `signal` background and `#FFFFFF` text;
    - `caret-color: var(--color-gain)`;
    - `scrollbar-color: #23342B var(--color-void)`;
    - `:focus-visible { outline: 2px solid var(--color-gain); outline-offset: 3px }`;
    - `a { text-underline-offset: 0.2em }`;
    - `[data-figure], data, time { font-variant-numeric: tabular-nums }`;
    - `section[id] { scroll-margin-top: 6rem }`.
  - Layer variables: `--layer-content: 1`, `--layer-header: 20`, `--layer-cursor: 30`, `--layer-skip: 40`, `--layer-sheet-overlay: 50`, `--layer-sheet: 51`.

- [ ] **Step 5: Update `src/app/layout.tsx`.**
  - Load the font with `Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-bricolage", display: "swap" })` and delete the Geist font.
  - Set the metadata from spec §Metadata: title "V3ST · Invest. Earn. Harvest.", the spec's description, `robots: { index: false, follow: false }` and `metadataBase` from `env.NEXT_PUBLIC_APP_URL`.
  - Render `<html lang="en" className={font.variable}>` and `<body className="bg-background text-foreground antialiased">`.

- [ ] **Step 6: Replace the home page with a temporary shell.** `src/app/(marketing)/page.tsx` becomes a static Server Component that renders only the `<h1 className="type-display">` holding "Invest. Earn. Harvest.". This keeps the app compiling until Task 8.

- [ ] **Step 7: Restyle the primitives in place.** Keep their files, exports and APIs.
  - **Button** variants:
    - `default`: `signal` fill, white text, `signal-hover` on hover, pill shape, 44px minimum height;
    - `outline`: `control-border` border, `heading` text;
    - `ghost` and `link`.
  - **Button sizes:** `default` 44px, `lg` 48px, `icon` 44×44.
  - **Badge `default`:** a chip with 11px uppercase text, tracking 0.16em, a white border at 20% opacity, and white text at 80%.
  - **Sheet `left`:** width `min(86vw, 340px)` and height `100dvh`. It opens in 260ms and closes in 170ms with `ease-out`, and the overlay (`void` at 70%) uses the same durations.

- [ ] **Step 8: Update `.gitignore`.** Add `.superpowers/`, `.impeccable/review/`, `.impeccable/mocks/` and `.impeccable/build/`. Do not ignore `.impeccable/surfaces/` or `.impeccable/design.json`.

- [ ] **Step 9: Update the two documents.**
  - Replace the body of `DESIGN_SYSTEM.md` with a short interim note: the visual system is being rebuilt, spec §Visual system, §Katana behaviour contract and §Accessibility are the authority until Task 13, and Task 13 writes the final file.
  - In `PRODUCT.md`, change only the lines whose facts changed: the audience, the landing action (join the beta waitlist) and the brand (dark, flag green `#00804D`, Bricolage Grotesque). Keep the product-truth paragraphs and don't restructure the file.

- [ ] **Step 10: Review the diff.**
  - `rg "components/landing" src` finds nothing.
  - `rg "Geist" src` finds nothing.
  - No conditional object spreads.
  - Tests are written but not run (`CLAUDE.md`).

- [ ] **Step 11: Commit.**

```bash
git add -A .gitignore src/styles/globals.css src/app/layout.tsx "src/app/(marketing)/page.tsx" src/primitives DESIGN_SYSTEM.md PRODUCT.md tests/landing e2e public/brands src/components src/app/icon.svg src/app/opengraph-image.png
git commit -m "feat: start the dark flag-green landing foundation"
```

---

### Task 2: Logos, wordmark and brand assets

**Files:**

- **Create:**
  - `public/brands/<id>.<ext>` (12 files) and `public/brands/sources.json`;
  - `public/stocks/{aapl,nvda,tsla,msft,amzn,googl,meta,spcx}.svg` and `public/stocks/sources.json`;
  - `src/components/landing/{brand-catalogue.ts,logo-badge.tsx,brand-mark.tsx,wordmark.tsx}`;
  - `src/app/icon.svg`;
  - the social image (builder's choice of mechanism, per spec §Metadata).
- **Modify:** `src/app/layout.tsx` (Open Graph and Twitter image metadata).
- **Test:** `tests/landing/brand-assets.test.ts` and `tests/landing/logo-badge.test.ts`.

**Interfaces:**

- Produces:

```ts
// brand-catalogue.ts
export type BetaStatus = "live-read" | "test-mode" | "simulated";
export type LogoTreatment = "official-light" | "filtered-white" | "unaltered";
export type BuiltWithBrand = {
  id: string; name: string; src: string; width: number; height: number;
  symbolOnly: boolean; treatment: LogoTreatment; betaStatus: BetaStatus;
};
export const BUILT_WITH: readonly BuiltWithBrand[];
// logo-badge.tsx (Server Component): next/image (unoptimized) when public/<logoPath> exists, else the ticker letters
export function LogoBadge(props: { ticker: string; logoPath: string; size?: number }): React.JSX.Element;
// brand-mark.tsx (Server Component): image with alt "<name> logo" (plus the visible name when symbolOnly), else the name as text
export function BrandMark(props: { brand: BuiltWithBrand }): React.JSX.Element;
// wordmark.tsx: outlined paths, fill="currentColor", role="img" with an accessible title
export function Wordmark(props: { className?: string; title?: string }): React.JSX.Element;
```

- **Manifest entry fields:** `id`, `name`, `src`, `sourcePage`, `assetUrl`, `variant`, `treatment`, `width`, `height`, `contentType`, `sha256`, `retrievedOn`. Optional: `termsNote`, `operatorAccepted`, and `betaStatus` (providers only).

- [ ] **Step 1: Write `tests/landing/brand-assets.test.ts`.**

```ts
it("lists the 12 brands in the spec's order", () => {
  expect(BUILT_WITH.map((b) => b.id)).toEqual([
    "yellow-card", "paycrest", "privy", "coinbase", "base", "circle-usdc",
    "hydrex", "o1-exchange", "bankr", "stonks-exchange", "basestonk", "feel-cash",
  ]);
  expect(brandManifest.map((e) => e.id)).toEqual(BUILT_WITH.map((b) => b.id));
});
it("records each brand's real beta status", () => {
  expect(status("coinbase")).toBe("live-read");
  for (const id of ["yellow-card", "privy", "base", "hydrex"]) expect(status(id)).toBe("test-mode");
  for (const id of ["paycrest", "circle-usdc", "o1-exchange", "bankr", "stonks-exchange", "basestonk", "feel-cash"])
    expect(status(id)).toBe("simulated");
});
it("ships a mark for each of the eight profiled tickers", () => {
  expect(stockManifest.map((e) => e.id)).toEqual(["aapl", "nvda", "tsla", "msft", "amzn", "googl", "meta", "spcx"]);
});
it("has a manifest entry with a matching hash for every shipped file", () => {
  for (const file of shippedFiles()) {        // public/brands/* and public/stocks/* except sources.json
    const entry = entryFor(file);
    expect(entry.sha256).toBe(sha256(file));
    expect(entry.width).toBeGreaterThan(0);
    expect(entry.height).toBeGreaterThan(0);
  }
});
it("contains no active or external content in any SVG", () => {
  for (const svg of svgFiles()) {
    expect(svg).not.toMatch(/<script|<foreignObject|\son[a-z]+\s*=|(xlink:)?href="https?:/i);
  }
});
it("records the operator's acceptance for restricted brands", () => {
  for (const id of ["aapl", "msft", "nvda"]) {
    expect(stockEntry(id).termsNote).toMatch(/\S/);
    expect(stockEntry(id).operatorAccepted).toBe("2026-11-18");
  }
});
it("no longer ships the Solana mark", () => {
  expect(existsSync("public/brands/solana.svg")).toBe(false);
});
```

- [ ] **Step 2: Write `tests/landing/logo-badge.test.ts`.** Use `renderToStaticMarkup` and `createElement`; the test file is `.ts`.

```ts
it("renders the logo when its file exists", () => {
  expect(render(LogoBadge, { ticker: "AAPL", logoPath: "/stocks/aapl.svg" })).toContain('src="/stocks/aapl.svg"');
});
it("falls back to the ticker letters when the file is missing", () => {
  const html = render(LogoBadge, { ticker: "ZZZZ", logoPath: "/stocks/zzzz.svg" });
  expect(html).not.toContain("<img");
  expect(html).toContain(">ZZZZ<");
});
it("falls back to the brand name when a provider file is missing", () => {
  const html = render(BrandMark, { brand: { ...BUILT_WITH[0]!, src: "/brands/missing.svg" } });
  expect(html).not.toContain("<img");
  expect(html).toContain("Yellow Card");
});
```

- [ ] **Step 3: Source the marks.**
  - Download each official file from the sources in spec §Logos and assets into a scratch directory **outside the repository**, one directory per brand. These are untrusted downloads.
  - Pick the dark-ground variant the spec describes for each brand. Inspect each SVG and strip only metadata and comments, never geometry.
  - Copy the files into `public/brands/` and `public/stocks/`, then write both manifests with SHA-256 hashes, dimensions and `retrievedOn` dates.
  - Record each provider's `betaStatus` from spec §3 "Truth check". For restricted brands, record `termsNote`, quoting the restriction, and `operatorAccepted: "2026-11-18"`.

- [ ] **Step 4: Write `brand-catalogue.ts`.** It mirrors the manifest's ids, order, dimensions, treatment and beta status. `symbolOnly` is true for Bankr, Stonks Exchange, BaseStonk and Feel.cash.

- [ ] **Step 5: Write `LogoBadge` and `BrandMark`.**
  - The fallback check is `existsSync(path.join(process.cwd(), "public", src))`.
  - Use `next/image` with `unoptimized` and explicit dimensions.
  - The `filtered-white` treatment adds the CSS filter `brightness(0) invert(1)`.
  - In the row, opacity is 0.6 at rest and 0.9 on hover, with a 200ms transition.

- [ ] **Step 6: Make the wordmark.** Outline "V3ST" from Bricolage Grotesque (weight 800, optical size 96) into SVG paths, using a one-off script kept outside the repository. Commit only the paths, with a header comment naming the font source (the google/fonts repository commit) and the OFL.

- [ ] **Step 7: Make the favicon and social image.**
  - `src/app/icon.svg` is a V3ST monogram in `signal` on `void`, in a rounded square.
  - The 1200×630 social image follows spec §Metadata: no third-party marks and no figures. Record its provenance: the generating source, or the `ImageResponse` route.

- [ ] **Step 8: Wire up the metadata.** Add the Open Graph and Twitter images, with alt text "V3ST: Invest. Earn. Harvest. Beta, test money only."

- [ ] **Step 9: Review the diff.** Check provenance for every file, that no logo has been redrawn or recoloured beyond its recorded treatment, and that nothing references Katana assets. Then commit:

```bash
git add public/brands public/stocks src/components/landing src/app/icon.svg src/app/layout.tsx tests/landing
git commit -m "feat: add official brand and stock marks with provenance"
```

---

### Task 3: Public beta ticker read

**Files:**

- **Modify:**
  - `src/backend/content/stock-profiles.ts`: add `estimatedPrice: boolean` to `StockProfile` as `profile()`'s fifth argument, `true` only for SPCX, and export `PUBLIC_TICKERS`.
  - `src/backend/services/app/catalog.ts`.
- **Create:** `src/types/landing.ts` and `src/server/landing.ts`.
- **Test:** `tests/app/public-ticker.test.ts` (database) and `tests/landing/landing-ticker.test.ts`.

**Interfaces:**

- Produces:

```ts
// src/backend/content/stock-profiles.ts
export const PUBLIC_TICKERS: readonly string[]; // profile keys with a logoPath, in order: AAPL NVDA TSLA MSFT AMZN GOOGL META SPCX
// src/types/landing.ts
export type PublicTickerRow = {
  ticker: string; name: string; sector: string; logo_path: string;
  price_kobo: string | null; price_status: AppPriceStatus; price_is_estimate: boolean;
  price_as_of: string | null; change_24h_bps: number | null; line_kobo: string[];
};
export type PublicTickerDto = { rows: PublicTickerRow[]; as_of: string | null };
// src/backend/services/app/catalog.ts
appCatalogService.publicTicker(at?: Date): Promise<PublicTickerDto>; // at defaults to now() from @/backend/clock
// src/server/landing.ts
export const getLandingTicker: () => Promise<PublicTickerDto | null>; // React cache(); never throws
export function profileOnlyTicker(): PublicTickerDto;
```

- [ ] **Step 1: Write `tests/app/public-ticker.test.ts`.** Use `useTestDatabase()`, and create stocks and price history the way `tests/app/catalog.test.ts` does (`makeCatalogStock`, `stockHistory`, `setNow`).

```ts
it("returns the eight profiled tickers in order, never test stocks", async () => {
  // catalog holds AAPL and TSTA only
  const dto = await appCatalogService.publicTicker();
  expect(dto.rows.map((r) => r.ticker)).toEqual(["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "SPCX"]);
  expect(dto.rows.find((r) => r.ticker === "NVDA")!.price_kobo).toBeNull();
});
it("prices a row exactly as the customer catalog does", async () => {
  const listed = (await appCatalogService.list(customerId, {})).find((s) => s.ticker === "AAPL")!;
  const row = (await appCatalogService.publicTicker()).rows[0]!;
  expect(row.price_kobo).toBe(listed.price_kobo);
  expect(row.price_status).toBe(listed.price_status);
  expect(row.change_24h_bps).toBe(listed.change_24h_bps);
});
it("returns a null price once the reference is older than the display window", async () => {
  setNow(/* reference time + 604_801 s */);
  const row = (await appCatalogService.publicTicker()).rows[0]!;
  expect(row.price_kobo).toBeNull();
  expect(row.price_status).toBe("unavailable");
});
it("reports delayed prices as delayed", async () => {
  // a reference older than the trading window but inside the display window
  expect((await appCatalogService.publicTicker()).rows[0]!.price_status).toBe("delayed");
});
it("flags SpaceX as an estimate and nothing else", async () => {
  const rows = (await appCatalogService.publicTicker()).rows;
  expect(rows.filter((r) => r.price_is_estimate).map((r) => r.ticker)).toEqual(["SPCX"]);
});
it("carries the one-day line as integer strings", async () => {
  const row = (await appCatalogService.publicTicker()).rows[0]!;
  expect(row.line_kobo.length).toBeGreaterThanOrEqual(2);
  for (const v of row.line_kobo) expect(v).toMatch(/^\d+$/);
});
it("leaks no internal vocabulary and dates the newest price", async () => {
  const dto = await appCatalogService.publicTicker();
  expect(findCustomerLeaks(dto)).toEqual([]);
  expect(dto.as_of).toBe(newestPriceAsOf(dto.rows));
});
```

- [ ] **Step 2: Write `tests/landing/landing-ticker.test.ts`.** No database; spy on the service.

```ts
it("builds profile-only rows with no numbers", () => {
  const dto = profileOnlyTicker();
  expect(dto.rows).toHaveLength(8);
  expect(dto.rows.every((r) => r.price_kobo === null && r.line_kobo.length === 0)).toBe(true);
  expect(dto.rows[0]!.logo_path).toBe("/stocks/aapl.svg");
  expect(dto.rows.at(-1)!.price_is_estimate).toBe(true);
  expect(dto.as_of).toBeNull();
});
it("returns null and reports the error when the read fails", async () => {
  vi.spyOn(appCatalogService, "publicTicker").mockRejectedValue(new Error("db down"));
  await expect(getLandingTicker()).resolves.toBeNull();
  expect(reportError).toHaveBeenCalled(); // reportError is mocked in tests/setup.ts
});
```

- [ ] **Step 3: Add the estimate flag.** Add `estimatedPrice` to `STOCK_PROFILES`: `true` for SPCX, explicit `false` for every other entry. Export `PUBLIC_TICKERS`.

- [ ] **Step 4: Refactor the catalog service.**
  - Extract `listItem`'s price fields into `private async priceFields(stock: Stock, rate: Rate | null, at: Date): Promise<Pick<AppStockListItemDto, "price_kobo" | "price_status" | "price_as_of" | "change_24h_bps">>` and use it in `listItem`.
  - Add `publicTicker(at = now())`:
    - Load `ratesService.display().payoutRate`, using `null` on failure as `list` does, and the catalog's stocks with `list`'s query but no watchlist.
    - Build one row per `PUBLIC_TICKERS` entry. A stock missing from the catalog gets `null` fields and `price_status: "unavailable"`.
    - `line_kobo` holds `(await this.chart(stock.id, "1D")).points.map((p) => p.price_kobo)` when the chart's status is `ok`, otherwise `[]`.
    - `as_of` is the newest non-null `price_as_of`.

- [ ] **Step 5: Write the server wrapper.**
  - `getLandingTicker` is wrapped in `cache()` from React. It calls `appCatalogService.publicTicker()`, and on any error calls `reportError(error, { area: "landing-ticker" })` and returns `null`.
  - `profileOnlyTicker` maps `PUBLIC_TICKERS` through `STOCK_PROFILES`.

- [ ] **Step 6: Review the diff and commit.** In the diff, check the vocabulary-safe keys and that no float maths is used.

```bash
git add src/backend/content/stock-profiles.ts src/backend/services/app/catalog.ts src/types/landing.ts src/server/landing.ts tests/app/public-ticker.test.ts tests/landing/landing-ticker.test.ts
git commit -m "feat: add the public beta ticker read for the landing page"
```

---

### Task 4: Rate limiting, form bodies and waitlist data

**Files:**

- **Modify:**
  - `prisma/schema.prisma`: add the `WaitlistEntry` and `RateLimitBucket` models exactly as in spec §Waitlist.
  - `src/env.js`, `.env.example`, `vitest.config.ts`, `.github/workflows/backend.yml` and `scripts/landing-beta.mjs`: add `RATE_LIMIT_SECRET`.
  - `src/types/index.ts`: add `"RATE_LIMITED"` to `ErrorCode`.
  - `src/backend/middleware/{index.ts,types.ts}`.
  - `src/backend/services/app/copy.ts`.
  - `docs/api/customer-app.md` and `BACKEND_PATTERNS.md`.
- **Create:**
  - `prisma/migrations/20261118120000_waitlist_rate_limits/migration.sql`, hand-written in the existing migrations' style;
  - `src/backend/services/security/rate-limit.ts`;
  - `src/backend/middleware/rate-limit.ts`, re-exported from the middleware index.
- **Test:** `tests/unit/middleware-form.test.ts` and `tests/integration/rate-limit.test.ts`.

**Interfaces:**

- Produces:

```ts
// src/backend/middleware/types.ts
type WithMiddlewareOptions = {
  bodyMode?: "json" | "raw" | "none" | "form";
  formRedirect?: { path: string; successStatus: string };
  audience?: "internal" | "customer";
};
// src/backend/services/security/rate-limit.ts
export function rateLimitKey(scope: string, clientIp: string, secret: string): string; // hex HMAC-SHA256 of `${scope}:${clientIp}`
export const rateLimitService: {
  hit(input: { scope: string; clientIp: string; limit: number; windowSeconds: number; at?: Date }):
    Promise<{ allowed: boolean; count: number; resetAt: Date }>;
};
// src/backend/middleware/rate-limit.ts
export function clientIp(headers: Headers): string; // first x-forwarded-for hop, else x-real-ip, else "unknown"
export function rateLimitMiddleware(options: { scope: string; limit: number; windowSeconds: number }): MiddlewareFunction;
```

- **Environment:** `RATE_LIMIT_SECRET` is `z.string().min(32)` on the server.
  - `.env.example`: `local-only-rate-limit-secret-change-me-000001`.
  - Vitest: `vitest-rate-limit-secret-00000000000000001`.
  - CI: `ci-rate-limit-secret-test-only-000000000001`.
  - `landing-beta.mjs`: `landing-only-rate-limit-secret-0000000001`.
- **Errors:**
  - `statusToCode(429)` returns `"RATE_LIMITED"`.
  - `CUSTOMER_ERROR_COPY.RATE_LIMITED` is `{ code: "TOO_MANY_TRIES", message: "Too many tries. Please wait a few minutes and try again." }`, with `"TOO_MANY_TRIES"` added to `CustomerErrorCode`.
- **Form mode:**
  - It accepts `application/json`, parsed as today, and `application/x-www-form-urlencoded`, parsed with `URLSearchParams` into a string record.
  - A repeated key, or any other content type, answers 400 `BAD_REQUEST`.
- **Redirects:** with `formRedirect` set and a url-encoded request, every response becomes a `303` to `new URL(\`${path}?status=${s}\`, env.NEXT_PUBLIC_APP_URL)`.
  - On success, `s` is `successStatus`.
  - On error, `s` is the response's code in lowercase: the customer code for the customer audience, otherwise the internal code.
  - JSON requests are unchanged.
- **Rate-limit buckets:**
  - `windowStart` is the time rounded down to a multiple of `windowSeconds`.
  - A hit upserts and increments the bucket. It is allowed while `count <= limit`.
  - Each hit deletes buckets older than 86 400 seconds in the same transaction.
  - Use `now()` from `@/backend/clock` when `at` is not passed.

- [ ] **Step 1: Write `tests/unit/middleware-form.test.ts`.**
  - The test wraps a dummy handler that returns `ok({ joined: true }, "ok")`, using `bodyMode: "form"`, `formRedirect: { path: "/waitlist", successStatus: "joined" }` and `audience: "customer"`.
  - The validator is `bodyValidatorMiddleware(z.object({ email: z.string().email() }).strict())`.

```ts
it("answers JSON requests with the normal envelope", async () => {
  const res = await callRoute(handler, { method: "POST", url: "/x", body: { email: "a@b.co" } });
  expect(res.status).toBe(200);
});
it("redirects a url-encoded success to the success status", async () => {
  const res = await callRoute(handler, form("email=a%40b.co"));
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("http://localhost:3000/waitlist?status=joined");
});
it("redirects a url-encoded validation failure to the customer code", async () => {
  expect((await callRoute(handler, form("email=nope"))).headers.get("location"))
    .toBe("http://localhost:3000/waitlist?status=check_details");
});
it("rejects repeated keys", async () => {
  expect((await callRoute(handler, form("email=a%40b.co&email=c%40d.co"))).headers.get("location"))
    .toBe("http://localhost:3000/waitlist?status=check_details");
});
it("rejects other content types with CHECK_DETAILS", async () => {
  const res = await callRoute(handler, { method: "POST", url: "/x", body: "email=a", headers: { "content-type": "text/plain" } });
  expect(res.status).toBe(400);
  expect((res.json as { code: string }).code).toBe("CHECK_DETAILS");
});
```

- [ ] **Step 2: Write `tests/integration/rate-limit.test.ts`.** It uses `useTestDatabase()`.

```ts
it("derives a stable 64-character key per scope and address", () => {
  expect(rateLimitKey("waitlist", "203.0.113.5", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  expect(rateLimitKey("waitlist", "203.0.113.5", SECRET)).not.toBe(rateLimitKey("other", "203.0.113.5", SECRET));
});
it("reads the client address from proxy headers", () => {
  expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  expect(clientIp(new Headers())).toBe("unknown");
});
it("allows five hits per window and refuses the sixth", async () => {
  for (let i = 1; i <= 5; i++) expect((await hit()).allowed).toBe(true);
  expect((await hit()).allowed).toBe(false);
  setNow(/* +600 s */);
  expect(await hit()).toMatchObject({ allowed: true, count: 1 });
});
it("deletes buckets older than a day", async () => { /* seed an old bucket, hit, expect it gone */ });
it("never stores a raw address", async () => {
  await hit();
  const keys = (await db.rateLimitBucket.findMany()).map((b) => b.key);
  expect(keys.every((k) => /^[0-9a-f]{64}$/.test(k) && !k.includes("203.0.113.5"))).toBe(true);
});
it("answers the sixth request with TOO_MANY_TRIES", async () => {
  // a dummy customer-audience route using rateLimitMiddleware({ scope: "t", limit: 5, windowSeconds: 600 })
  expect(sixth.status).toBe(429);
  expect(sixth.json).toMatchObject({ code: "TOO_MANY_TRIES", message: "Too many tries. Please wait a few minutes and try again." });
});
```

- [ ] **Step 3: Add the schema and migration.** Add both Prisma models. Hand-write the migration SQL: two tables, a unique index on `email`, and a composite primary key on (`key`, `windowStart`). Task 13's test setup applies it.

- [ ] **Step 4: Add the environment variable.** Add `RATE_LIMIT_SECRET` to the five places listed above, with the values given.

- [ ] **Step 5: Add the error code.** Add `RATE_LIMITED` to `ErrorCode`, the 429 mapping to `statusToCode`, the copy entry to `CUSTOMER_ERROR_COPY`, and the row `TOO_MANY_TRIES | Too many tries. Please wait a few minutes and try again. | RATE_LIMITED` to the error table in `docs/api/customer-app.md`.

- [ ] **Step 6: Implement form mode and redirects** in `withMiddleware`, as specified above.

- [ ] **Step 7: Implement the rate limiter.** Write `rateLimitKey`, `rateLimitService.hit`, `clientIp` and `rateLimitMiddleware`. The middleware returns `{ next: false, statusCode: 429, code: "RATE_LIMITED", message: "Too many requests" }` when a hit isn't allowed.

- [ ] **Step 8: Update `BACKEND_PATTERNS.md`.** Document the `form` body mode, `formRedirect`, `rateLimitMiddleware` and the proxy-header assumption.

- [ ] **Step 9: Review the diff and commit.** In the diff, check that no raw IP is persisted and that JSON behaviour is unchanged for existing routes.

```bash
git add prisma src/env.js .env.example vitest.config.ts .github/workflows/backend.yml scripts/landing-beta.mjs src/types/index.ts src/backend/middleware src/backend/services/security/rate-limit.ts src/backend/services/app/copy.ts docs/api/customer-app.md BACKEND_PATTERNS.md tests/unit/middleware-form.test.ts tests/integration/rate-limit.test.ts
git commit -m "feat: add form bodies, form redirects and database rate limiting"
```

---

### Task 5: Waitlist route, operator export and privacy note

**Files:**

- **Create:**
  - `src/backend/validators/waitlist.validator.ts` and `src/backend/services/waitlist/index.ts`;
  - `src/app/api/v1/waitlist/route.ts` and `src/app/api/v1/ops/waitlist/route.ts`;
  - `docs/api/waitlist.md`.
- **Modify:**
  - `src/types/landing.ts`;
  - `src/backend/content/documents.ts`;
  - `docs/runbooks/backend-beta.md`.
- **Test:**
  - `tests/api/waitlist.test.ts`;
  - `tests/unit/waitlist-validator.test.ts`;
  - `tests/app/documents.test.ts`.

**Interfaces:**

- Consumes: `rateLimitMiddleware`, form mode and `formRedirect` (Task 4).
- Produces:

```ts
// src/types/landing.ts
export type WaitlistSource = "hero" | "join" | "waitlist_page";
export type WaitlistJoinDto = { joined: true };
export type WaitlistEntryDto = { email: string; source: WaitlistSource; privacy_version: string; created_at: string };
// src/backend/validators/waitlist.validator.ts
export const waitlistBodySchema; // strict: email (trim, lowercase, max 254, email), source (enum, default "hero"), website (optional, max 200)
export type WaitlistBodySchema = z.infer<typeof waitlistBodySchema>;
// src/backend/services/waitlist/index.ts
export const waitlistService: {
  join(input: { email: string; source: WaitlistSource; website?: string }): Promise<WaitlistJoinDto>;
  list(input: { page: number; size: number }): Promise<{ items: WaitlistEntryDto[]; total: number }>;
};
```

- **The `POST /api/v1/waitlist` route:**

```ts
withMiddleware<WaitlistBodySchema, null, null>(handler,
  [sameOriginMiddleware, rateLimitMiddleware({ scope: "waitlist", limit: 5, windowSeconds: 600 }), bodyValidatorMiddleware(waitlistBodySchema)],
  { audience: "customer", bodyMode: "form", formRedirect: { path: "/waitlist", successStatus: "joined" } })
```

  It returns `ok({ joined: true }, "You're on the list.")`.
- **The `GET /api/v1/ops/waitlist` route:** `withMiddleware<null, null, PaginationQuerySchema>(handler, [authMiddleware, operatorMiddleware, queryValidatorMiddleware(paginationQuerySchema)])`. It returns `paginated(items, "Waitlist", page, size, total)`, newest first.
- **Privacy document:**
  - `PRIVACY_VERSION = "2026-11-18"` applies to the privacy document only.
  - The body gains the sentence "If you join the waitlist, we use your email address only to invite you to the beta."
  - The service stores `CUSTOMER_DOCUMENTS.privacy.version`.

- [ ] **Step 1: Write `tests/api/waitlist.test.ts`.**
  - Use `useTestDatabase()`, `callRoute` and `findCustomerLeaks`.
  - Send `Origin: ORIGIN` unless a test says otherwise, and give each test its own `x-forwarded-for`.
  - Create operators with `makeUser({ role: "operator" })` and a session, as `tests/integration/operations.test.ts` does.

```ts
it("adds a normalised email and answers the success envelope", async () => {
  const res = await join({ email: " Ada@Example.com " });
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({ message: "You're on the list.", data: { joined: true } });
  expect(await db.waitlistEntry.findUnique({ where: { email: "ada@example.com" } }))
    .toMatchObject({ source: "hero", privacyVersion: "2026-11-18" });
  expect(findCustomerLeaks(res.json)).toEqual([]);
});
it("answers a repeat identically and keeps one row", async () => {
  const first = await join({ email: "ada@example.com" });
  const second = await join({ email: " ADA@example.com" });
  expect(second.json).toEqual(first.json);
  expect(await db.waitlistEntry.count()).toBe(1);
});
it("answers a filled honeypot identically and stores nothing", async () => {
  expect((await join({ email: "bot@example.com", website: "spam" })).json).toMatchObject({ data: { joined: true } });
  expect(await db.waitlistEntry.count()).toBe(0);
});
it("rejects an invalid email with the email field message", async () => {
  const res = await join({ email: "not-an-email" });
  expect(res.status).toBe(422);
  expect(res.json).toMatchObject({ code: "CHECK_DETAILS", message: "Enter a valid email address." });
});
it("rejects an email longer than 254 characters", async () => {
  expect((await join({ email: `${"a".repeat(250)}@b.co` })).status).toBe(422);
});
it("rejects another origin", async () => {
  expect((await join({ email: "a@b.co" }, { origin: "https://evil.example" })).status).toBe(403);
  expect(await db.waitlistEntry.count()).toBe(0);
});
it("rate-limits the sixth request from one address", async () => {
  for (let i = 0; i < 5; i++) await join({ email: `p${i}@b.co` }, { ip: "203.0.113.9" });
  const sixth = await join({ email: "p6@b.co" }, { ip: "203.0.113.9" });
  expect(sixth.status).toBe(429);
  expect(sixth.json).toMatchObject({ code: "TOO_MANY_TRIES" });
});
it("redirects native form posts", async () => {
  expect((await joinForm("email=ada%40example.com&source=join")).headers.get("location"))
    .toBe("http://localhost:3000/waitlist?status=joined");
  expect((await joinForm("email=nope")).headers.get("location"))
    .toBe("http://localhost:3000/waitlist?status=check_details");
  expect((await db.waitlistEntry.findFirst())!.source).toBe("join");
});
it("exports the list to operators only", async () => {
  expect((await exportList()).status).toBe(401);
  expect((await exportList(customerCookie)).status).toBe(403);
  const res = await exportList(operatorCookie);
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({ total: 2, page: 1 });
  expect((res.json as { data: WaitlistEntryDto[] }).data[0]!.email).toBe(newestEmail);
});
```

- [ ] **Step 2: Write the other two tests.**
  - **`tests/unit/waitlist-validator.test.ts`:**
    - trims and lowercases the email;
    - defaults `source` to `"hero"`;
    - rejects unknown keys;
    - rejects a `source` of `"footer"`;
    - rejects `website` longer than 200 characters.
  - **`tests/app/documents.test.ts`:**

```ts
it("versions privacy on its own", () => {
  expect(CUSTOMER_DOCUMENTS.privacy.version).toBe("2026-11-18");
  for (const slug of ["terms", "risks", "how-shares-are-held", "earn-risks"] as const)
    expect(CUSTOMER_DOCUMENTS[slug].version).toBe("2026-11-17");
  expect(INVEST_DOCUMENTS).toEqual(["terms", "risks", "how-shares-are-held"]);
  expect(CUSTOMER_DOCUMENTS.privacy.body).toContain("If you join the waitlist, we use your email address only to invite you to the beta.");
});
```

- [ ] **Step 3: Implement the backend.** Write the validator, the service, both routes, the DTO types and the privacy-document change, exactly as specified above.
  - The service inserts with `createMany({ data: [...], skipDuplicates: true })`.
  - It returns `{ joined: true }` whether the email is new, a duplicate or a honeypot hit.

- [ ] **Step 4: Write the documentation.**
  - `docs/api/waitlist.md`: the route, its JSON and form behaviour, the redirect statuses, the error codes, and the ops export.
  - `docs/runbooks/backend-beta.md`: how to export the list and invite people by adding their emails to `PRIVY_BETA_ALLOWLIST`. Note that nothing is emailed automatically.

- [ ] **Step 5: Review the diff and commit.**

```bash
git add src/backend/validators/waitlist.validator.ts src/backend/services/waitlist src/app/api/v1/waitlist src/app/api/v1/ops/waitlist src/types/landing.ts src/backend/content/documents.ts docs/api/waitlist.md docs/runbooks/backend-beta.md tests/api/waitlist.test.ts tests/unit/waitlist-validator.test.ts tests/app/documents.test.ts
git commit -m "feat: store beta waitlist sign-ups with an operator export"
```

---

### Task 6: Marketing layout, header, footer and legal pages

Before this task's first UI edit, read Impeccable's `reference/craft-floor.md` if it is installed.

**Files:**

- **Create:**
  - `src/app/(marketing)/layout.tsx` and `src/app/(marketing)/legal/[slug]/page.tsx`;
  - `src/components/landing/{landing-motion.tsx,nav-links.ts,site-header.tsx,header-cta.tsx,mobile-nav.tsx,pause-control.tsx,site-footer.tsx,markdown-lite.ts,document-body.tsx}`.
- **Modify:** `src/styles/globals.css`, for the header-entrance variables with their visible defaults.
- **Test:** `tests/landing/markdown-lite.test.ts` and `tests/landing/nav-links.test.ts`.

**Interfaces:**

- Produces:

```ts
// landing-motion.tsx ("use client")
export function LandingMotionProvider(props: { children: React.ReactNode }): React.JSX.Element;
export function useLandingMotion(): { paused: boolean; reducedMotion: boolean; setPaused(value: boolean): void };
// nav-links.ts
export const NAV_LINKS: readonly { label: string; href: string }[];
// markdown-lite.ts
export type Inline = { text: string; bold: boolean };
export type DocumentBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; items: Inline[][] };
export function parseDocument(markdown: string): DocumentBlock[];
```

- **`LandingMotionProvider`:**
  - It reads `matchMedia("(prefers-reduced-motion: reduce)")` live.
  - It mirrors its state onto the `[data-landing]` root as `data-motion-paused` and `data-reduced-motion`, so CSS loops can stop.
  - It never touches storage.
- **DOM contract** (Task 9 writes the variables):
  - The layout renders `<div data-landing>`, wrapping the skip link, header, `<main id="main-content" tabIndex={-1}>` and footer.
  - Header parts read `--nav-cue` and `--header-cta`, both defaulting to `1` in CSS, so `/legal/*` and `/waitlist` show a settled header.
  - The header's "Join the waitlist" pill is `<a href="/#join" data-header-cta>`. `header-cta.tsx` focuses `#join-email` after the jump.
- **Pause control:**
  - `PauseControl` uses Phosphor's `Pause` and `Play` icons, is 44×44, and has the accessible name "Pause motion" or "Play motion".
  - It sits at the header's right edge at every size and is never part of the entrance cue.
- **Mobile navigation:** `MobileNav` (below 768px) is the left `Sheet` holding the five links, the waitlist pill and the line "Beta · test money only". Without JavaScript, a `<noscript>` list of the same links renders instead.

- [ ] **Step 1: Write the tests.**

```ts
// tests/landing/nav-links.test.ts
it("links the five sections in page order from any route", () => {
  expect(NAV_LINKS).toEqual([
    { label: "Stocks", href: "/#stocks" }, { label: "Earn", href: "/#earn" },
    { label: "How it works", href: "/#how-it-works" }, { label: "Safeguards", href: "/#safeguards" },
    { label: "FAQ", href: "/#faq" },
  ]);
});
// tests/landing/markdown-lite.test.ts
it("parses headings, paragraphs, lists and bold", () => {
  expect(parseDocument("# Privacy\n\nWe **never** sell it.\n\n- one\n- two")).toEqual([
    { kind: "heading", text: "Privacy" },
    { kind: "paragraph", inline: [{ text: "We ", bold: false }, { text: "never", bold: true }, { text: " sell it.", bold: false }] },
    { kind: "list", items: [[{ text: "one", bold: false }], [{ text: "two", bold: false }]] },
  ]);
});
it("parses every customer document with its title first", () => {
  for (const doc of Object.values(CUSTOMER_DOCUMENTS))
    expect(parseDocument(doc.body)[0]).toEqual({ kind: "heading", text: doc.title });
});
```

- [ ] **Step 2: Implement the layout and shell components.**
  - Build `LandingMotionProvider`, the header (wordmark, Beta chip, centred pill nav, pause control, header CTA, mobile nav) and the footer.
  - The footer holds the spec §Footer columns, the disclosure, the no-affiliation line, the giant `Wordmark` with its static green radial glow, and "© 2026 V3ST".
  - The skip link goes to `#main-content`.
  - Internal links use `next/link`. Prefetches are same-origin, and the browser test guard allows them (Task 12).

- [ ] **Step 3: Build the legal pages.**
  - `/legal/[slug]` uses `generateStaticParams` over `CUSTOMER_DOCUMENTS`, with `export const dynamicParams = false`.
  - Its metadata title is `${title} · V3ST`, with `robots: { index: false, follow: false }`.
  - It shows "Version {version}" and renders `DocumentBlock`s as `h1`/`p`/`ul`/`strong`, as a reading measure (65–75ch) with no motion.

- [ ] **Step 4: Review the diff and commit.** In the diff, check:
  - no eyebrow above any heading;
  - every icon button has an accessible name;
  - the sheet's focus is trapped and restored (Radix);
  - the header is fully visible without JavaScript.

```bash
git add "src/app/(marketing)" src/components/landing src/styles/globals.css tests/landing
git commit -m "feat: add the marketing layout, header, footer and legal pages"
```

---

### Task 7: Waitlist form and result page

**Files:**

- **Create:**
  - `src/components/landing/{waitlist-state.ts,waitlist-form.tsx,waitlist-status.ts}`;
  - `src/app/(marketing)/waitlist/page.tsx`.
- **Test:** `tests/landing/waitlist-state.test.ts` and `tests/landing/waitlist-status.test.ts`.

**Interfaces:**

- Consumes: `POST /api/v1/waitlist` (Task 5) and `CUSTOMER_ERROR_COPY` (Task 4).
- Produces:

```ts
// waitlist-state.ts (browser-safe)
export type WaitlistState =
  | { kind: "idle" } | { kind: "submitting" }
  | { kind: "joined"; email: string }
  | { kind: "error"; message: string; field: "email" | null };
export type WaitlistEvent =
  | { type: "submit" } | { type: "succeeded"; email: string }
  | { type: "failed"; message: string; field: "email" | null } | { type: "edit" };
export function waitlistReducer(state: WaitlistState, event: WaitlistEvent): WaitlistState;
export function toWaitlistOutcome(status: number, body: unknown):
  { ok: true } | { ok: false; message: string; field: "email" | null };
// waitlist-form.tsx ("use client")
export function WaitlistForm(props: { source: WaitlistSource; inputId: string }): React.JSX.Element;
// waitlist-status.ts (server)
export function waitlistStatusCopy(status: string | undefined): { tone: "success" | "error"; message: string } | null;
```

- **The form:**
  - Markup: `<form method="post" action="/api/v1/waitlist">`, holding `<input type="email" name="email" id={inputId} required autoComplete="email" inputMode="email">`, `<input type="hidden" name="source">`, and a honeypot `<input name="website" tabIndex={-1} autoComplete="off">` inside an `aria-hidden` visually hidden wrapper.
  - With JavaScript, it intercepts the submission and posts JSON with `fetch`.
  - Copy:
    - success: "You're on the list. We'll email you when a beta place opens.";
    - button: "Join the waitlist", or "Joining…" while submitting;
    - microcopy: spec §1.
  - Results are announced in a polite live region. An error is linked to the field through `aria-describedby`, and the field gets `aria-invalid`.
  - The fallback message is "Something went wrong. Please try again."
- **Input ids:** the hero form uses `hero-email`, the join form `join-email`, and the waitlist page `waitlist-email`.
- **The `/waitlist` page:** reads `searchParams` (a Promise in Next 15), shows `waitlistStatusCopy` above a `WaitlistForm source="waitlist_page"`, and is `noindex`.
- **`check_details` on this page** maps to "Enter a valid email address.", because email is the form's only field.

- [ ] **Step 1: Write the tests.**

```ts
// tests/landing/waitlist-state.test.ts
it("moves idle → submitting → joined", () => {
  const s = waitlistReducer(waitlistReducer({ kind: "idle" }, { type: "submit" }), { type: "succeeded", email: "a@b.co" });
  expect(s).toEqual({ kind: "joined", email: "a@b.co" });
});
it("keeps joined terminal and lets an error be edited away", () => {
  expect(waitlistReducer({ kind: "joined", email: "a@b.co" }, { type: "edit" })).toEqual({ kind: "joined", email: "a@b.co" });
  expect(waitlistReducer({ kind: "error", message: "x", field: "email" }, { type: "edit" })).toEqual({ kind: "idle" });
});
it("reads API outcomes", () => {
  expect(toWaitlistOutcome(200, { data: { joined: true } })).toEqual({ ok: true });
  expect(toWaitlistOutcome(422, { code: "CHECK_DETAILS", message: "Enter a valid email address." }))
    .toEqual({ ok: false, message: "Enter a valid email address.", field: "email" });
  expect(toWaitlistOutcome(429, { code: "TOO_MANY_TRIES", message: "Too many tries. Please wait a few minutes and try again." }))
    .toEqual({ ok: false, message: "Too many tries. Please wait a few minutes and try again.", field: null });
  expect(toWaitlistOutcome(500, null)).toEqual({ ok: false, message: "Something went wrong. Please try again.", field: null });
});
// tests/landing/waitlist-status.test.ts
it("maps result statuses to copy", () => {
  expect(waitlistStatusCopy("joined")).toEqual({ tone: "success", message: "You're on the list. We'll email you when a beta place opens." });
  expect(waitlistStatusCopy("check_details")).toEqual({ tone: "error", message: "Enter a valid email address." });
  expect(waitlistStatusCopy("too_many_tries")).toEqual({ tone: "error", message: "Too many tries. Please wait a few minutes and try again." });
  expect(waitlistStatusCopy("not_allowed")!.tone).toBe("error");
  expect(waitlistStatusCopy(undefined)).toBeNull();
  expect(waitlistStatusCopy("<script>")).toBeNull();
});
```

- [ ] **Step 2: Implement.** Build the reducer, the outcome mapping, the form, the status copy (looked up from `CUSTOMER_ERROR_COPY` by lowercase customer code) and the page.
  - The form is one pill on desktop: the email field and the green submit button inside a `control-border` outline. It stacks below 480px.
  - Every state keeps the same height, so nothing below the form shifts.

- [ ] **Step 3: Review the diff and commit.**

```bash
git add src/components/landing "src/app/(marketing)/waitlist" tests/landing
git commit -m "feat: add the progressive waitlist form and result page"
```

---

### Task 8: Home page sections

**Files:**

- **Create:**
  - `src/components/landing/{content.ts,format.ts,hero.tsx,stocks-section.tsx,ticker-row.tsx,built-with.tsx,earn-section.tsx,how-it-works.tsx,safeguards.tsx,faq.tsx,join-section.tsx}`;
  - authored artwork under `public/art/`, with `public/art/sources.json`.
- **Modify:** `src/app/(marketing)/page.tsx` (replace the shell) and `src/styles/globals.css` (section layout).
- **Test:** `tests/landing/format.test.ts` and `tests/landing/content.test.ts`.

**Interfaces:**

- Consumes: `getLandingTicker` and `profileOnlyTicker` (Task 3), `LogoBadge`, `BrandMark` and `BUILT_WITH` (Task 2), `WaitlistForm` (Task 7).
- Produces:

```ts
// format.ts (browser-safe; BigInt only, no float money)
export function formatNaira(kobo: string): string;            // whole naira when divisible by 100, else 2 decimals; "−₦" for negatives
export function formatTickerPrice(kobo: string): string;      // ≥ ₦1,000 rounds half-up to whole naira; below shows 2 decimals
export function formatChangeBps(bps: number): string;         // "+1.24%", "−0.86%", "0.00%"
export function formatPriceCaption(asOf: string | null, now: Date): string;
// content.ts (Server Components only)
export type FigureSpec = { value: number; decimals: number; prefix: string; suffix: string; finalText: string; label: string; line?: string };
export const HERO_COUNTERS: readonly FigureSpec[];
export const SAFEGUARD_STATS: readonly FigureSpec[];
export const EARN_CARDS: readonly { figure: string; label: string; title: string; body: string }[];
export const JOURNEY_STAGES: readonly { title: string; caption: string; icon: "Bank" | "ChartLineUp" | "Plant" | "CalendarCheck" | "ArrowUDownLeft" }[];
export const FAQ_ITEMS: readonly { question: string; answer: string; link?: { text: string; href: string } }[];
```

- **Page composition:**
  - `src/app/(marketing)/page.tsx` sets `export const revalidate = 300`.
  - It loads `const ticker = (await getLandingTicker()) ?? profileOnlyTicker();`.
  - It renders `<Hero />` and then a `<div className="landing-after-hero">` holding `StocksSection`, `BuiltWith`, `EarnSection`, `HowItWorks`, `Safeguards`, `Faq` and `JoinSection`.
  - Anchors: `#stocks`, `#built-with`, `#earn`, `#how-it-works`, `#safeguards`, `#faq`, `#join`.
- **Hero DOM contract** (Task 9 animates it):
  - `<div data-hero-track>` contains `<section aria-labelledby="hero-title">`.
  - Each group is marked `data-hero-group="background|heading|copy|actions|rail"`, with `style={{ opacity: "var(--hero-<group>, 1)" }}`.
  - Figures are server-rendered as `<span data-figure>{finalText}</span>`; Task 11 wraps them with `Counter`.
- **Ticker rows:**
  - The server formats each row, and the price cell uses `formatTickerPrice`.
  - A "Delayed" chip shows when `price_status === "delayed"`, and an "Estimate" chip when `price_is_estimate`.
  - When `line_kobo.length >= 2`, the price line is an inline SVG polyline, normalised to a `120×32` viewBox, in `gain` or `loss` by the sign of the change. Price lines are data, not decoration, and they are not the craft floor's "sparklines standing in for content".
  - Rows are a semantic `<ul aria-label="Beta prices">`.
- **Artwork:**
  - the static hero glow (which is also the fluid fallback);
  - the journey panels;
  - the light beam;
  - the safeguard light streaks;
  - the join-panel beams.

  Export each as AVIF with a WebP fallback at explicit dimensions, author it in the fluid palette, and record its provenance in `public/art/sources.json`. All of it is `aria-hidden`.

- [ ] **Step 1: Write `tests/landing/format.test.ts`.**

```ts
it("formats naira exactly", () => {
  expect(formatNaira("100000")).toBe("₦1,000");
  expect(formatNaira("199999")).toBe("₦1,999.99");
  expect(formatNaira("-200000")).toBe("−₦2,000");
  expect(formatNaira("0")).toBe("₦0");
  expect(formatNaira("900719925474099301")).toBe("₦9,007,199,254,740,993.01");
  for (const bad of ["1e5", "12.5", "", " 1"]) expect(() => formatNaira(bad)).toThrow();
});
it("rounds ticker prices like Katana's price column", () => {
  expect(formatTickerPrice("34215037")).toBe("₦342,150");
  expect(formatTickerPrice("34215050")).toBe("₦342,151");
  expect(formatTickerPrice("99999")).toBe("₦999.99");
});
it("formats signed changes with a true minus", () => {
  expect(formatChangeBps(124)).toBe("+1.24%");
  expect(formatChangeBps(-86)).toBe("−0.86%");
  expect(formatChangeBps(0)).toBe("0.00%");
});
it("dates the caption only when prices aren't from today in Lagos", () => {
  expect(formatPriceCaption(null, new Date("2026-12-04T15:00:00Z"))).toBe("Beta prices appear here when they're available.");
  expect(formatPriceCaption("2026-12-04T13:05:00Z", new Date("2026-12-04T15:00:00Z")))
    .toBe("Beta prices in naira · updated 14:05 Lagos time");
  expect(formatPriceCaption("2026-12-04T20:00:00Z", new Date("2026-12-05T09:00:00Z")))
    .toBe("Beta prices in naira · updated Fri 4 Dec, 21:00 Lagos time");
});
```

- [ ] **Step 2: Write `tests/landing/content.test.ts`.**

```ts
it("derives the hero counters from policy and the catalog", () => {
  expect(HERO_COUNTERS.map((c) => [c.finalText, c.label])).toEqual([
    ["₦1,000", "MINIMUM TO START"], ["8", "US COMPANIES IN THE BETA"], ["₦2,000", "SMALLEST FRIDAY PAYOUT"],
  ]);
});
it("derives the safeguards from policy", () => {
  expect(SAFEGUARD_STATS.map((s) => s.finalText)).toEqual(["₦0", "1%", "30 days"]);
  expect(Math.min(policy.app.earn.automation.expiryDays, policy.onchain.authorizationMaxDays)).toBe(30);
});
it("leads the Earn cards with real rules, never an APR", () => {
  expect(EARN_CARDS.map((c) => c.figure)).toEqual(["₦5,000", "Weekly", "1%", "Any time"]);
  expect(EARN_CARDS[2]!.body).toContain("2%");
  expect(JSON.stringify(EARN_CARDS)).not.toMatch(/APR|APY|yield/i);
});
it("orders the journey and the FAQ as the spec does", () => {
  expect(JOURNEY_STAGES.map((s) => s.title)).toEqual(["Add naira", "Buy shares", "Earn, if you choose", "Friday payouts", "Back to your bank"]);
  expect(FAQ_ITEMS).toHaveLength(10);
  expect(FAQ_ITEMS[1]!.question).toBe("Do I own the shares?");
});
it("keeps crypto vocabulary out of the copy", () => {
  const copy = JSON.stringify([HERO_COUNTERS, SAFEGUARD_STATS, EARN_CARDS, JOURNEY_STAGES, FAQ_ITEMS]);
  expect(copy).not.toMatch(/\b(wallet|tokens?|tokeni[sz]ed|usdc|gas|on-?chain|blockchain|swaps?|liquidity|sepolia)\b/i);
});
```

- [ ] **Step 3: Implement `format.ts` and `content.ts`.**
  - All values and copy come from spec §Page structure and copy.
  - Figures come from `policy.app.orders.minBuyKobo`, `PUBLIC_TICKERS.length`, `policy.earnings.minPayoutKobo`, `policy.trading.maxSlippageBps`, `Math.min(policy.app.earn.automation.expiryDays, policy.onchain.authorizationMaxDays)`, `policy.app.earn.minKobo`, `policy.app.earnings.maxConversionFeeBps` and `maxFxBps`.

- [ ] **Step 4: Build the sections.**
  - Build them in spec order with spec copy: hero (with `WaitlistForm source="hero" inputId="hero-email"`), Stocks, Built to work with, Earn, How it works, Safeguards, FAQ, Join (with `WaitlistForm source="join" inputId="join-email"`).
  - How it works renders the ordered list as the authoritative content. Task 11 adds the diagram beside it.
  - The FAQ uses native `<details>`/`<summary>`.
  - The Earn story link is `<a href="#join" data-cursor-label="Join">`, reading "Join the waitlist to try Earn".

- [ ] **Step 5: Author the artwork and record its provenance.** Follow the "Artwork" rules above.

- [ ] **Step 6: Lay out the sections.** Follow spec §Layout and shape: 1200px width, the section paddings, 28px card radius, and the ticker rows' signal glow. Below 640px, the Earn grid is one column, with Katana's horizontal snap row allowed.

- [ ] **Step 7: Review the diff and commit.**
  - Every string matches the spec.
  - Figures are derived, not typed.
  - The page reads cleanly without CSS motion, and no client component imports `content.ts`.

```bash
git add "src/app/(marketing)/page.tsx" src/components/landing public/art src/styles/globals.css tests/landing
git commit -m "feat: build the landing page sections with live beta prices"
```

---

### Task 9: Motion contract and hero choreography

**Files:**

- **Create:** `src/components/landing/motion/contract.ts` and `src/components/landing/hero-motion.tsx`.
- **Modify:** `src/components/landing/hero.tsx` (wrap it in `HeroMotion`) and `src/styles/globals.css` (track, stage, overlap and fallbacks).
- **Test:** `tests/landing/motion-contract.test.ts`.

**Interfaces:**

- Produces (`contract.ts`, pure and browser-safe):

```ts
export type HeroGroup = "background" | "heading" | "copy" | "actions" | "rail";
export type HeroFrame = Record<HeroGroup, number> & { navCue: number; headerCta: number };
export const HERO_INTRO: Record<HeroGroup, readonly [number, number]>;     // ms: background 0–900, heading 200–900, copy 480–1180, actions 760–1460, rail 1040–1740
export const HERO_HANDOVER: Record<HeroGroup, readonly [number, number]>;  // actions 0–0.40, rail 0–0.36, copy 0.18–0.66, heading 0.40–1, background 0.45–1
export const NAV_CUE = { fromMs: 2120, spanMs: 900 } as const;
export const SCROLL_EASE = 0.18; export const MAX_FRAME_MS = 64;
export const HERO_TRACK_VH = 160; export const HERO_OVERLAP_VH = 45; export const HERO_FIT_CLEARANCE_PX = 190;
export const SKIP_INTRO_ELAPSED_MS = 10_000;
export function smoothstep(x: number): number;
export function heroFrame(input: { elapsedMs: number; progress: number }): HeroFrame; // headerCta = h
export function smoothProgress(current: number, target: number, deltaMs: number): number;
export function heroTargetProgress(rect: { top: number; height: number }, viewportHeight: number): number;
export function shouldPlayIntro(input: { hydratedAtMs: number; scrollY: number; hash: string }): boolean; // < 600 ms, scrollY < 5, no hash
export function heroFits(input: { viewportHeight: number; contentHeight: number; railHeight: number; reducedMotion: boolean }): boolean;
export const TICKER_SECONDS_PER_ROW = 4.5;
export function tickerDurationSeconds(rows: number): number;
export const COUNTER = { durationMs: 800, threshold: 0.35 } as const;
export function easeOutCubic(t: number): number;
export function counterDecimals(value: number, decimals: number): number;
export const DIAGRAM = { threshold: 0.2, enterMs: 420, staggerMs: 60, riseFromPx: 12, reducedFadeMs: 200, autoplayDelayMs: 1080, stepMs: 3600,
  hoverIntentMs: 120, leaveGraceMs: 140, highlightMs: 200, floatSeconds: 8, floatRisePx: 3, floatDelayStepSeconds: -1.3 } as const;
export const PARALLAX_PX = 70;
export function parallaxOffset(input: { viewportHeight: number; sectionCenterY: number; sectionHeight: number }): number;
export const CURSOR = { smoothing: 0.2, fadeMs: 200, scaleMs: 110, scaleHidden: 0.7, scaleShown: 1, scalePressed: 0.9 } as const;
export function followerStep(current: number, target: number, deltaMs: number): number;
export const SHEET = { openMs: 260, closeMs: 170 } as const;
export const FLUID_SETTINGS = { mouseForce: 15, cursorSize: 300, isViscous: false, viscous: 30, iterationsViscous: 14, dt: 0.011,
  iterationsPoisson: 38, resolution: 0.5, dissipation: 0.992, isBounce: true, autoDemo: true, autoSpeed: 0.28, autoIntensity: 6.4,
  takeoverDuration: 0.25, autoResumeDelay: 350, autoRampDuration: 1.4 } as const;
export const FLUID_COLORS = ["#0D6A3D", "#0D6A3D", "#008A52"] as const;
```

- **`heroFrame`:**
  - Each group is `S((elapsed − a)/(b − a)) × (1 − S((h − from)/(to − from)))`, where `h = S((progress − 0.30)/0.70)` and `S` is `smoothstep` on a clamped input.
  - `navCue` is `S((elapsed − 2120)/900)`.
- **`HeroMotion` behaviour:**
  - It writes `--hero-<group>`, `--nav-cue` and `--header-cta` onto `[data-landing]`, along with `data-hero-fit` and `data-header-cta-hidden`.
  - The pinned layout (160vh track, sticky 100vh stage, `.landing-after-hero { margin-top: -45vh }`) applies only under `[data-landing][data-hero-fit="true"]`. Server HTML and reduced motion use ordinary flow.
  - When the intro doesn't play, `elapsed` starts at `SKIP_INTRO_ELAPSED_MS`.
  - Pausing before the intro ends jumps the intro to its end. Scroll-linked handover keeps following the scroll, because it is not autoplay.
  - A group containing `:focus-within` is forced to opacity 1. A group whose opacity is below 0.01 gets `pointer-events: none`.
  - It listens to `scroll` (passive), `resize`, `visibilitychange` and a `ResizeObserver` on the hero content. The loop stops when settled, and everything is removed on unmount.

- [ ] **Step 1: Write `tests/landing/motion-contract.test.ts`.**

```ts
it("completes the intro at 1740 ms", () => {
  expect(heroFrame({ elapsedMs: 1740, progress: 0 })).toMatchObject({ background: 1, heading: 1, copy: 1, actions: 1, rail: 1, headerCta: 0, navCue: 0 });
  expect(heroFrame({ elapsedMs: 0, progress: 0 })).toMatchObject({ background: 0, heading: 0, copy: 0, actions: 0, rail: 0 });
  expect(heroFrame({ elapsedMs: 550, progress: 0 }).heading).toBeCloseTo(0.5, 6);
});
it("hands over in Katana's order", () => {
  const f = heroFrame({ elapsedMs: 10_000, progress: 0.65 });   // h = 0.5
  expect(f.actions).toBe(0); expect(f.rail).toBe(0);
  expect(f.copy).toBeCloseTo(0.2593, 4); expect(f.heading).toBeCloseTo(0.9259, 4); expect(f.background).toBeCloseTo(0.9767, 4);
  expect(heroFrame({ elapsedMs: 10_000, progress: 0.3 })).toMatchObject({ heading: 1, actions: 1, headerCta: 0 });
  expect(heroFrame({ elapsedMs: 10_000, progress: 1 })).toMatchObject({ background: 0, heading: 0, copy: 0, actions: 0, rail: 0, headerCta: 1, navCue: 1 });
});
it("smooths progress independent of frame rate, with a 64 ms cap", () => {
  expect(smoothProgress(0, 1, 16.67)).toBeCloseTo(0.18, 6);
  expect(smoothProgress(smoothProgress(0, 1, 8.335), 1, 8.335)).toBeCloseTo(smoothProgress(0, 1, 16.67), 9);
  expect(smoothProgress(0, 1, 1000)).toBe(smoothProgress(0, 1, 64));
});
it("measures hero progress and fit", () => {
  expect(heroTargetProgress({ top: -300, height: 1600 }, 1000)).toBe(0.5);
  expect(heroTargetProgress({ top: 50, height: 1600 }, 1000)).toBe(0);
  expect(heroTargetProgress({ top: -900, height: 1600 }, 1000)).toBe(1);
  expect(heroFits({ viewportHeight: 900, contentHeight: 500, railHeight: 100, reducedMotion: false })).toBe(true);
  expect(heroFits({ viewportHeight: 700, contentHeight: 500, railHeight: 100, reducedMotion: false })).toBe(false);
  expect(heroFits({ viewportHeight: 2000, contentHeight: 500, railHeight: 100, reducedMotion: true })).toBe(false);
});
it("plays the intro only on a fresh, top-of-page load", () => {
  expect(shouldPlayIntro({ hydratedAtMs: 300, scrollY: 0, hash: "" })).toBe(true);
  expect(shouldPlayIntro({ hydratedAtMs: 300, scrollY: 0, hash: "#faq" })).toBe(false);
  expect(shouldPlayIntro({ hydratedAtMs: 300, scrollY: 800, hash: "" })).toBe(false);
  expect(shouldPlayIntro({ hydratedAtMs: 2500, scrollY: 0, hash: "" })).toBe(false);
});
it("pins the remaining Katana numbers", () => {
  expect(tickerDurationSeconds(8)).toBe(36);
  expect(tickerDurationSeconds(7)).toBe(31.5);
  expect(easeOutCubic(0.5)).toBe(0.875);
  expect([counterDecimals(1.19, 2), counterDecimals(45, 0), counterDecimals(150, 0), counterDecimals(5, 0)]).toEqual([2, 1, 0, 2]);
  expect(parallaxOffset({ viewportHeight: 1000, sectionCenterY: 500, sectionHeight: 800 })).toBe(0);
  expect(parallaxOffset({ viewportHeight: 1000, sectionCenterY: -10_000, sectionHeight: 800 })).toBe(70);
  expect(parallaxOffset({ viewportHeight: 1000, sectionCenterY: 10_000, sectionHeight: 800 })).toBe(-70);
  expect(followerStep(0, 100, 16.67)).toBeCloseTo(20, 6);
  expect(SHEET).toEqual({ openMs: 260, closeMs: 170 });
  expect(FLUID_SETTINGS.dissipation).toBe(0.992);
  expect(FLUID_COLORS).toEqual(["#0D6A3D", "#0D6A3D", "#008A52"]);
});
```

- [ ] **Step 2: Implement `contract.ts`, `HeroMotion` and the CSS** exactly as specified above.

- [ ] **Step 3: Review the diff and commit.** In the diff, check:
  - no React state is set per frame;
  - visible defaults hold without JavaScript;
  - the focus override works;
  - all listeners are cleaned up.

```bash
git add src/components/landing/motion src/components/landing/hero-motion.tsx src/components/landing/hero.tsx src/styles/globals.css tests/landing/motion-contract.test.ts
git commit -m "feat: reproduce Katana's pinned hero choreography"
```

---

### Task 10: Fluid background

**Files:**

- **Create:**
  - `src/components/landing/fluid/liquid-ether.tsx` and `src/components/landing/fluid/liquid-ether.css`, vendored;
  - `src/components/landing/fluid/LICENSE-react-bits.md`;
  - `src/components/landing/fluid/fluid-background.tsx` and `src/components/landing/fluid/fluid-gate.ts`.
- **Modify:**
  - `package.json` and `yarn.lock`: `yarn add --exact three@0.180.0` and `yarn add --dev --exact @types/three@0.180.0`;
  - `src/components/landing/hero.tsx`: mount `FluidBackground` in the background group.
- **Test:** `tests/landing/fluid-gate.test.ts`.

**Interfaces:**

- Produces:

```ts
// fluid-gate.ts
export function shouldRunFluid(input: { reducedMotion: boolean; saveData: boolean; webgl: boolean }): boolean;
export function detectWebGL(): boolean;   // browser only: a WebGL2 or WebGL context can be created
// fluid-background.tsx ("use client")
export function FluidBackground(props: { className?: string }): React.JSX.Element;
```

- **Vendored source:** `src/ts-default/Backgrounds/LiquidEther/LiquidEther.tsx` and its CSS from `DavidHDev/react-bits` at commit `1eeb6f105c68b964289d85dabbe84a1d551f3797`, fetched from `https://cdn.jsdelivr.net/gh/DavidHDev/react-bits@1eeb6f105c68b964289d85dabbe84a1d551f3797/src/ts-default/Backgrounds/LiquidEther/`.
  - The file header records the source URL, the commit, "MIT + Commons Clause, see LICENSE-react-bits.md", and these modifications:
    1. A `dissipation` prop (default `1`) multiplies the advected velocity each step.
    2. A `paused` prop stops the animation loop without disposing anything.
    3. Device pixel ratio is capped at 1.5.
    4. The renderer, geometries, materials and render targets are all disposed on unmount.
    5. An `onContextLost` callback is added.
    6. Otherwise only typing and lint fixes.
  - `LICENSE-react-bits.md` holds the full licence text from the same commit.
- **`FluidBackground`:**
  - It always renders the static hero glow image from Task 8.
  - It mounts the fluid with `React.lazy` only when `shouldRunFluid` is true, and only after two animation frames following hydration, so the hero text has painted.
  - It passes `{...FLUID_SETTINGS}` (a whole-object spread is allowed; the conditional-spread ban does not apply), `colors={FLUID_COLORS}` and `paused={paused}`.
  - On context loss or error it unmounts the fluid and keeps the static image.
  - The canvas is `aria-hidden`, and uses straight-alpha compositing so the image under it stays correct.

- [ ] **Step 1: Write `tests/landing/fluid-gate.test.ts`.**

```ts
it("runs the fluid only when motion, data and WebGL allow it", () => {
  expect(shouldRunFluid({ reducedMotion: false, saveData: false, webgl: true })).toBe(true);
  expect(shouldRunFluid({ reducedMotion: true, saveData: false, webgl: true })).toBe(false);
  expect(shouldRunFluid({ reducedMotion: false, saveData: true, webgl: true })).toBe(false);
  expect(shouldRunFluid({ reducedMotion: false, saveData: false, webgl: false })).toBe(false);
});
it("keeps the vendored source pinned and licensed", () => {
  const src = readFileSync("src/components/landing/fluid/liquid-ether.tsx", "utf8");
  expect(src).toContain("1eeb6f105c68b964289d85dabbe84a1d551f3797");
  expect(src).toContain("dissipation");
  expect(readFileSync("src/components/landing/fluid/LICENSE-react-bits.md", "utf8")).toContain("Commons Clause");
});
```

- [ ] **Step 2: Vendor and implement.** Fetch, adapt and wire up as specified above. The fluid stays out of the server bundle: `fluid-background.tsx` is the only importer, and it imports lazily.

- [ ] **Step 3: Review the diff and commit.** In the diff, check:
  - three.js appears only in the lazy chunk path;
  - the licence notice is present;
  - there is no Katana code;
  - the fluid is skipped under reduced motion and Data Saver.

```bash
git add package.json yarn.lock src/components/landing/fluid src/components/landing/hero.tsx tests/landing/fluid-gate.test.ts
git commit -m "feat: add the lazily loaded green fluid background"
```

---

### Task 11: Section motion and the frontend guide

**Files:**

- **Create:** `src/components/landing/{price-ticker.tsx,counter.tsx,journey-diagram.tsx,cursor-follower.tsx}`.
- **Modify:**
  - `stocks-section.tsx`, `hero.tsx`, `safeguards.tsx`, `how-it-works.tsx`;
  - `src/app/(marketing)/layout.tsx` (mount `CursorFollower`);
  - `src/components/landing/format.ts` (add `counterText`);
  - `src/styles/globals.css`;
  - `FRONTEND_PATTERNS_GUIDE.md`.
- **Test:** `tests/landing/section-motion.test.ts`.

**Interfaces:**

- Consumes: the `contract.ts` constants (Task 9) and `useLandingMotion` (Task 6).
- Produces:

```ts
// format.ts
export function counterText(value: number, decimals: number, prefix: string, suffix: string, settled: boolean): string;
// journey-diagram.tsx
export function nextStage(current: number, total: number): number;
export function JourneyDiagram(props: { stages: readonly { title: string; caption: string; icon: string }[] }): React.JSX.Element;
// price-ticker.tsx: renders children, then an aria-hidden + inert duplicate, inside the masked viewport
export function PriceTicker(props: { children: React.ReactNode; rowCount: number }): React.JSX.Element;
// counter.tsx: server HTML shows finalText; animates from 0 only when not yet visible (below the fold, or inside a hero group still at opacity < 0.05)
export function Counter(props: { value: number; decimals: number; prefix: string; suffix: string; finalText: string; startAfterMs?: number }): React.JSX.Element;
export function CursorFollower(): React.JSX.Element; // follows [data-cursor-label] elements, mouse pointers only
```

- **Ticker:**
  - The CSS variable `--marquee-duration` is `tickerDurationSeconds(rowCount)` seconds.
  - Keyframes move `translateY(0 → -50%)`, linear and infinite.
  - The viewport is 22rem tall (26rem at 640px and wider), masked transparent → opaque at 12% and 88% → transparent.
  - `animation-play-state: paused` on `:hover`, `:focus-within`, `[data-motion-paused]`, and when offscreen or hidden (an `IntersectionObserver` and `visibilitychange` set `data-offscreen`).
  - Under `[data-reduced-motion]`: no animation and no duplicate.
- **Counters:** wrap the hero counters (with `startAfterMs` matching the rail's intro of 1040ms) and the safeguard stats. The timing is `COUNTER`: 800ms, `easeOutCubic`, threshold 0.35, once.
- **Diagram:** `DIAGRAM` timings for entrance, autoplay (start after 1080ms, step every 3600ms while visible and not engaged), hover intent, leave grace, float and highlight. Parallax goes on the light-beam artwork only, oversized by 70px at both ends.
  - Paused or reduced motion stops autoplay, float and parallax.
  - Panels and the caption carousel are `aria-hidden`; the ordered list stays the content.
- **Cursor follower:** follows elements carrying `data-cursor-label` with the `CURSOR` values, on `pointerType === "mouse"` only. It sits at layer `--layer-cursor` with `pointer-events: none`.

- [ ] **Step 1: Write `tests/landing/section-motion.test.ts`.**

```ts
it("cycles diagram stages", () => {
  expect(nextStage(0, 5)).toBe(1);
  expect(nextStage(4, 5)).toBe(0);
});
it("formats counters while counting and when settled", () => {
  expect(counterText(1000, 0, "₦", "", true)).toBe("₦1,000");
  expect(counterText(523.4, 0, "₦", "", false)).toBe("₦523");
  expect(counterText(12.34, 0, "", " days", false)).toBe("12.3 days");
  expect(counterText(5.4, 0, "", "", false)).toBe("5.40");
  expect(counterText(1, 0, "", "%", true)).toBe("1%");
});
```

- [ ] **Step 2: Implement the islands and CSS** as specified above.

- [ ] **Step 3: Update `FRONTEND_PATTERNS_GUIDE.md`.** Follow spec §Documentation:
  - one dark theme;
  - Bricolage with `latin-ext`;
  - static generation with regeneration and the service-backed ticker read;
  - the waitlist form pattern, with progressive enhancement;
  - `/legal` reading pages;
  - "no client-side API calls except the waitlist POST";
  - the pause control and the `LandingMotion` context.

  Point its authority links at the new spec and this plan. Remove the stale rules about light theme, Geist, the demo and "zero calls".

- [ ] **Step 4: Review the diff and commit.**

```bash
git add src/components/landing "src/app/(marketing)/layout.tsx" src/styles/globals.css FRONTEND_PATTERNS_GUIDE.md tests/landing/section-motion.test.ts
git commit -m "feat: add Katana's ticker, counters, diagram and cursor motion"
```

---

### Task 12: Browser test suite

**Files:**

- **Modify:** `e2e/test.ts` (the guard) and `playwright.config.ts` (only if a new option is needed).
- **Create:** `e2e/landing.spec.ts`, `e2e/waitlist.spec.ts` and `e2e/motion.spec.ts`.

**Interfaces:**

- Consumes:
  - the DOM contracts from Tasks 6–11: `[data-landing]`, `[data-hero-track]`, `[data-hero-group]`, `[data-header-cta]`, `#hero-email`, `#join-email`;
  - the section anchors;
  - `motion/contract.ts` values.
- **Guard changes:**
  - Allow same-origin `GET` and `HEAD` for `/`, `/legal/*`, `/waitlist`, `/_next/static/*`, `/_next/image`, `/brands/*`, `/stocks/*`, `/art/*`, `/icon.svg` and the social image.
  - Allow same-origin `GET` fetches carrying the `RSC` header to those page paths.
  - Everything else is a recorded violation and is aborted. That includes `POST /api/v1/waitlist`: tests that exercise the waitlist intercept it with page-level `page.route`, which runs before the context guard.

- [ ] **Step 1: Write `e2e/landing.spec.ts`.** Viewports are 360×800, 390×844, 768×1024 and 1440×1000 unless a test says otherwise.
  - **`renders every section from server HTML without JavaScript`:**
    - in a `javaScriptEnabled: false` context, the h1 reads "Invest. Earn. Harvest.";
    - the h2 headings appear in spec order;
    - both forms have `method="post"` and `action="/api/v1/waitlist"`;
    - the FAQ `<details>` opens on click;
    - the `<noscript>` links are present.
  - **`anchors and the skip link reach their sections`:** for each `NAV_LINKS` entry, after the click the target heading's top lies between 0 and 120px.
  - **`mobile sheet traps focus, closes on Escape and restores focus`** (390×844).
  - **`ticker falls back to names when prices are unavailable`:**
    - the build uses an unreachable database, so there are 8 rows;
    - no row contains "₦";
    - the caption reads "Beta prices appear here when they're available.".
  - **`built-with row shows all 12 marks in order with valid dimensions`.**
  - **`legal pages render each document`:** five slugs, each with its title. `/legal/unknown` answers 404.
  - **`waitlist result page shows status copy`:** `joined`, `too_many_tries` and `check_details`, each with the exact copy.
  - **`no ₦ glyph comes from a fallback font`:** canvas `measureText("₦")` gives the same width with the computed family + `serif` and with the computed family + `monospace`.
  - **`no horizontal overflow or clipped figures at every viewport`.**
  - Every test ends with the guard reporting no violations, cookies or storage writes.

- [ ] **Step 2: Write `e2e/waitlist.spec.ts`.** Intercept `**/api/v1/waitlist` at page level.
  - **`joins inline with JavaScript`:** fulfil 200 `{ status: 200, message: "You're on the list.", data: { joined: true } }`. The success copy replaces the form, and the live region contains it.
  - **`shows the API message for an invalid email`:** fulfil 422 with `CHECK_DETAILS`. The message is linked through `aria-describedby`, and the field has `aria-invalid="true"`.
  - **`shows rate-limit copy`:** fulfil 429 with `TOO_MANY_TRIES`.
  - **`posts natively without JavaScript`:** in a no-JS context, fulfil `303` with `location: /waitlist?status=joined`. The page shows "You're on the list. We'll email you when a beta place opens.".
  - **`header button jumps to the closing form and focuses it`:** after scrolling past the hero, click `[data-header-cta]`. `document.activeElement.id` is `"join-email"`.

- [ ] **Step 3: Write `e2e/motion.spec.ts`.** Use 1440×1000 and 390×844; wait on settled values, not fixed sleeps.
  - **`hero track and overlap geometry`:** the track height is `1.6 × innerHeight` (±2px), and `.landing-after-hero` starts at `1.15 × innerHeight` (±2px).
  - **`hero opacities at progress 0, 0.3, 0.6 and 1 after settling`:** each group's computed opacity is within ±0.03 of `heroFrame({ elapsedMs: 10_000, progress })`.
  - **`scrolling back up restores the hero`.**
  - **`header button appears after handover`:** `--header-cta` is above 0.99 at progress 1, and `[data-header-cta]` is clickable.
  - **`deep link does not replay a blank hero`:** load `/#faq`, then scroll to top. Every hero group is at opacity 1 within one frame of arrival.
  - **`ticker moves upward over 36 seconds and pauses`:** the computed `animation-duration` is `36s`, and `animation-play-state` is `paused` on hover and after clicking "Pause motion".
  - **`counters reach their final values`:** ₦1,000, 8, ₦2,000, ₦0, 1%, 30 days.
  - **`diagram advances every 3.6 seconds and stops when paused`.**
  - **`pause stops and resumes motion without resetting it`:**
    - the active diagram stage and the ticker transform are unchanged for 2s while paused, and resume afterwards;
    - the control is reachable by keyboard at 390×844.
  - **`reduced motion renders ordinary flow`:** with `reducedMotion: "reduce"`, `data-hero-fit` is `"false"`, there is no canvas, the ticker's `animation-name` is `none`, and counters show their final values.
  - **`WebGL unavailable keeps the static artwork`:** an init script makes `getContext("webgl2")` and `getContext("webgl")` return `null`. There is no canvas, and the hero glow image is visible.
  - **`short viewport falls back to ordinary flow`:** at 1440×600, `data-hero-fit` is `"false"` and no hero content is cropped.

- [ ] **Step 4: Review the diff and commit.** The tests are written but not run.

```bash
git add e2e playwright.config.ts
git commit -m "test: author the landing browser suite"
```

---

### Task 13: Final verification, rendered review and documentation

**Files:**

- **Create:** `docs/superpowers/reviews/2026-11-18-v3st-landing-redesign.md` and `.impeccable/design.json`.
- **Modify:**
  - `DESIGN_SYSTEM.md` (the final version);
  - `README.md` (the landing section);
  - the 2026-11-15 landing spec, plan and review: one line at the top marking them superseded by this work;
  - any source or test the gates show is broken.

- [ ] **Step 1: Prepare the environment.**
  - Pinned Node and Yarn, then `bash scripts/setup-cloud.sh`.
  - Two isolated local PostgreSQL databases, with the test one's name ending in `_test`. Never the developer's database.
  - Forge and Anvil available.
  - Chromium: `yarn playwright install chromium`, or `LANDING_CHROMIUM_PATH`.

- [ ] **Step 2: Run the gates once, in order, and record each exit code and summary.**

```bash
yarn prisma validate
yarn prisma generate
yarn test:contracts
yarn test
yarn lint
yarn typecheck
node scripts/landing-beta.mjs build
yarn test:e2e
```

  Expected: every command exits 0. `yarn test` includes the existing backend suite plus the new tests, with every new test file listed. The build table shows `/` regenerating every 300 seconds, `/legal/[slug]` as five static pages, and `/waitlist` as dynamic.

- [ ] **Step 3: Fix and rerun.** Fix failures and rerun the affected commands, rebuilding before rerunning the browser suite. Name any failure that existed before this work instead of skipping it.

- [ ] **Step 4: Check the build artefacts.**
  - The client manifest for `/` has no `src/backend`, Prisma, viem, Privy or Sentry server modules.
  - `three` appears only in a lazily loaded chunk.
  - Initial JavaScript for `/` is ≤ 200 KB compressed.
  - Measure Largest Contentful Paint (≤ 2.5s) and Cumulative Layout Shift (< 0.1) with Chromium's mobile emulation, 4× CPU slowdown and a Fast 4G profile. Record the method and the numbers.

- [ ] **Step 5: Rendered review.**
  - Capture `.impeccable/review/desktop.png` (1440 wide, full page) and `.impeccable/review/mobile.png` (390 wide), the hero at progress 0, 0.3, 0.6 and 1, every ticker chip state, and the waitlist states.
  - In a **separate** browser context with no guard, capture katana.network at the same checkpoints.
  - Compare the hero, ticker, diagram, counters, header entrance, sheet and footer. Record every deviation and why, and confirm hero copy contrast is at least 4.5:1 over the brightest fluid frame.
  - Batch the fixes, then do one more capture round at most.

- [ ] **Step 6: Impeccable finish.**
  - If installed, run `impeccable detect --json` once on the changed UI files and fix the mechanical findings.
  - Spawn `impeccable-finish-reviewer` with:
    - the original request and the spec's operator decisions;
    - the artifact path;
    - the screenshots;
    - the surface brief;
    - the craft-floor reference path;
    - the detector findings.
  - If it isn't installed, run a fresh-context review against the spec and the surface brief, and record that the substitution happened.
  - Act on the disposition (`ship`, `fix`, `rebuild` or `recapture`) within two rounds.

- [ ] **Step 7: Document the built world.**
  - Write `DESIGN_SYSTEM.md` and `.impeccable/design.json` from the built result, using `impeccable-documenter` with the write target `DESIGN_SYSTEM.md` when available. **Never create `DESIGN.md`.**
  - Give every shipped raster a provenance record (`impeccable embed-prompt --scan public/art public/brands public/stocks` when available).

- [ ] **Step 8: Write the review record.** It covers the commands and results, the Katana comparison, any accessible deviations, the contrast and performance numbers, the provenance status, and the logo-rights acceptance (decision 11). Also update `README.md`'s landing section: the preview commands, `RATE_LIMIT_SECRET`, how to export the waitlist, and the browser-suite commands.

- [ ] **Step 9: Final review and commit.** Check the task checklist and the completion criteria below, review the final diff, and commit.

```bash
git add DESIGN_SYSTEM.md .impeccable/design.json README.md docs src tests e2e public
git commit -m "test: verify the landing redesign and record the review"
```

## Completion criteria

The work is complete only when all of the following hold:

- All 13 tasks are checked.
- Every gate in Task 13 exited 0, with recorded output.
- The rendered review has a `ship` verdict, or the operator accepted the open items.
- `DESIGN_SYSTEM.md` and `.impeccable/design.json` describe the built page.
- The review record states what changed, how to preview it, what passed, every deviation from Katana and its reason, and anything still open.

Don't claim provider verification, production readiness or deployment.
