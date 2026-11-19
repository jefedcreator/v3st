# V3ST Customer App Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> If those skills aren't installed, execute this checklist natively, say so in the review record, and continue (`AGENTS.md`).
>
> This plan applies Impeccable. The direction is locked in `.impeccable/surfaces/src-app-app-layout-tsx.md`, and the rules this build needs are written into the plan, so it does not depend on the skill being installed.

**Goal:** Build every signed-in V3ST customer page on the existing customer API, phone-first, in the landing's dark design system: sign-in, setup, home, stocks, orders, cash, Earn, earnings, activity and settings. Each page does one job, and short jobs happen in modals.

**Architecture:**
- **Routes.** Three route groups: `(auth)/signin`, `(setup)/setup`, and `(app)` for the 11 app pages. The `(app)` layout mounts the chrome once.
- **Reads.** Server Components read through `src/server/app/reads.ts`, which calls `src/backend/services/app/*`. The result becomes TanStack Query initial data in one client component per page.
- **Writes and live data.** Writes go through a typed `fetch` client for `/api/v1/app/*`. One `EventSource` invalidates queries by area.
- **Modals.** Every modal is one responsive `Dialog` primitive.
- **Backend.** One beta route, plus two document types.

**Tech Stack:**
- Next.js 15.5 App Router, React 19, TypeScript (strict).
- Tailwind CSS 4 (`@theme static`), `radix-ui` 1.8.1, shadcn CLI 4.23.0, `motion/react` 14.14.0.
- `@tanstack/react-query` 5.108.1, and `@privy-io/react-auth` 3.52.0 for sandbox sign-in only.
- `@phosphor-icons/react` 2.1.10 (SSR entry).
- Prisma 6, Zod 3, Vitest 5, Playwright 1.56.1.

**Spec:** [`docs/superpowers/specs/2026-11-19-v3st-customer-app-pages-design.md`](../specs/2026-11-19-v3st-customer-app-pages-design.md), approved 2026-11-19. Read it in full before Task 1. "Spec §X" means a section of it.

## Global Constraints

- **Toolchain and branch:**
  - Node 24.15.0 and Yarn 1.22.22; start with `bash scripts/setup-cloud.sh`.
  - Work on a feature branch, `feat/customer-app-pages`.
  - `yarn.lock` is the only committed lockfile. Add packages with `yarn add --exact`, and never commit `package-lock.json`.
- **Before Task 1, read:**
  - the guides: `AGENTS.md`, `CLAUDE.md`, `FRONTEND_PATTERNS_GUIDE.md`, `DESIGN_SYSTEM.md`, `BACKEND_PATTERNS.md`, `PRODUCT.md`;
  - the API contract: `docs/api/customer-app.md` and `src/types/app.ts`;
  - the design: the spec, the surface brief and the chosen sketch, `docs/superpowers/specs/assets/2026-11-19-v3st-app-money-line-sketch.html`.

  Open the sketch in a browser at 390×844.
- **`CLAUDE.md` rules:**
  - Make a todo list per task and commit at the end of each task.
  - Never use optional or conditional object spreads (`...(cond ? {…} : {})`, `...(x && {…})`, `...(x ?? {})`). Build objects with `if` statements.
  - Never add "Co-Authored-By: Claude", "Generated with Claude Code" or similar lines.
- **Gates (`CLAUDE.md`):** don't run `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build` or Playwright until Task 21.
  - Every task writes its tests; Task 21 runs everything once.
  - A task's commit means "implemented, not yet verified".
- **Beta only:** `APP_STAGE=beta`, test money, simulated or sandbox providers. No deployment, live provider, mainnet or outbound message.
  - Don't change financial behaviour, provider modes or `policy.ts`.
  - The only backend change is Task 3.
- **Dependencies:**
  - Exactly these new runtime packages: `@tanstack/react-query@5.108.1` (Task 5), `@privy-io/react-auth@3.52.0` (Task 7), and the `input-otp` package that the shadcn CLI adds (Task 2).
  - No Axios, React Hook Form, Zustand, nuqs, sonner, chart library or `next-themes`.
  - Generate primitives with `npx shadcn@4.23.0 add …`.
- **Design system (spec §Visual system for the app):**
  - Colour tokens unchanged.
    - Signal (`#00804D`) is for fills, lines, the spine and filled nodes, never small text.
    - Gain (`#3DDC97`) is for positive figures, focus, text accents and waiting halos.
    - Loss (`#FF6B5A`) is for negative figures and failures.
  - Bricolage Grotesque only, on the fixed rem app scale from Task 1. Nothing below 11px. Tabular figures on every number.
  - One dark theme. No fluid background, cursor follower or pinned scroll in the app.
- **Browser imports:**
  - `cn` comes from `@/utils/cn`, and formatters from `@/utils/format`. Never import the `@/utils` barrel, `src/backend/**`, `@/env`, `policy.ts`, Prisma or `components/landing/content.ts`.
  - Types come from `@/types/app` and `@/types/app-ui`, type-only.
  - Icons come from `@phosphor-icons/react/dist/ssr`.
- **Data (spec §Data and state):**
  - Reads go through `src/server/app/reads.ts`; writes go through `appApi`.
  - Render an API error's `message` exactly. Use `code` only to branch.
  - A null value renders "—" through `Money`/`moneyText`, never ₦0.
  - Money stays an integer string until `@/utils/format` formats it.
- **Page and modal rule (spec §The page and modal rule):**
  - A page is a place; a modal is a short job (three steps or fewer) that returns to its page.
  - Never two modals at once: the PIN is the last step inside the job's modal.
  - Every modal is the Task 2 `Dialog`. Closing it before the PIN is confirmed moves no money and asks for no confirmation.
  - Money modals create one `Idempotency-Key` when the review step opens, reuse it for every retry of that review, and replace it only when a new preview is fetched.
- **Copy:**
  - Pinned strings, word for word, as given in the spec and in each task.
  - No crypto vocabulary (`docs/api/customer-app.md` §Vocabulary rule), enforced in Task 18.
  - "Invest in", never "own".
  - No invented numbers: every figure comes from the API or `policy`.
- **Accessibility, WCAG 2.2 AA:**
  - 44px targets, visible focus, and Radix focus trap and restore with Escape in every modal.
  - Polite live regions for results.
  - Labels tied to inputs, including the PIN and code inputs.
  - No horizontal scroll at 320–390px.
- **Operate rules (Impeccable):**
  - A fixed type scale, not clamp.
  - Transitions of 150–250ms that convey state only. No page-load choreography.
  - Skeletons, not spinners, for loading.
  - Every control has hover, focus, active, disabled, loading and error states.
  - Overlays render through portals.
  - The one authored motion is the line crossing (Task 11).
- **Craft-floor bans (always apply):**
  - no kicker or eyebrow above a heading;
  - no gradient text;
  - no hard offset shadows;
  - no coloured `border-left`/`border-right` above 1px on rows, cards or alerts;
  - no nested cards;
  - no emoji or Unicode glyphs as icons;
  - no sparklines or progress rings standing in for content;
  - no glass or blur decoration.

  The browser's own surfaces are already themed in `globals.css`; keep them.
- **Unlayered CSS:** `globals.css` landing rules are unlayered and beat utilities. Style app elements with Tailwind utilities only. If an unlayered landing rule reaches an app element, scope that rule to the landing; never use `!important`.
- **Impeccable, when installed:**
  - Run `impeccable context --target "src/app/(app)/layout.tsx"` once, before Task 2.
  - Read its `reference/craft-floor.md` immediately before the first UI edit (Task 2).
  - The direction is locked, so run no `concept-seed`, `shape` or comp round. The build path is code-led.
  - Task 21 runs the detector, the finish reviewer and the documenter.
- **Never create a file named `DESIGN.md`.** On this repository, Impeccable's DESIGN.md means `DESIGN_SYSTEM.md`.
- **Never commit:**
  - `.env` or secrets;
  - generated Prisma, dependencies or build output;
  - `.superpowers/`, `.impeccable/review/`, `.impeccable/mocks/` or `.impeccable/build/`;
  - screenshots, traces or reports.

## Review Focus

1. **A retry after a dropped response on the PIN step.** The customer sees a spinner, loses signal and taps Confirm again. Exactly one order or withdrawal results, and no wrong-PIN count is used up, because the same `Idempotency-Key` is reused.
   - Pinned by `nextIdempotencyKey` in `money-job.test.ts` (Task 10).
   - Pinned by `double confirm places one order` in `trade.spec.ts` (Task 19).
2. **A preview expires, or the price changes, during PIN entry.** The modal returns to its review with *Get a new price* and never sends the stale preview.
   - Pinned by `pinErrorAction` in `money-job.test.ts` (Task 10).
   - Pinned by `previewExpired` in `trade.test.ts` (Task 13).
3. **The session ends mid-task** (`SIGN_IN_REQUIRED` or `SIGN_IN_AGAIN` from any call). The browser goes to `/signin?next=<current path>` and returns there after sign-in.
   - Pinned by `redirects to sign-in on an ended session` in `app-api.test.ts` (Task 5).
   - Pinned by `afterSignInPath` and `safeNext` in `app-paths.test.ts` (Task 4).
4. **Unknown values:** prices older than a week, an unavailable total, an unpriced holding. Each shows "—" with its explanation line, never ₦0 or a flat chart.
   - Pinned by `moneyText` (Task 2), `totalLines` (Task 11), and `priceCaption` and `chartPath` (Task 12).
5. **A 320px phone with large text, or a long bank or stock name.** No page scrolls sideways, and no amount is clipped.
   - Pinned by `no page scrolls sideways at 320px` in `layout.spec.ts` (Task 19), which runs over every page with a 40-character display name and long bank and stock names.

---

## File structure

New app code lives in these places; each file has one job.

| Path | Responsibility |
| --- | --- |
| `src/utils/format.ts` | Browser-safe exact formatting: naira, signed naira, shares, Lagos dates, countdown, amount parsing (Task 1) |
| `src/utils/app-paths.ts` | `safeNext`, after-sign-in path, settings modal names (Task 4) |
| `src/utils/app-api.ts` | Typed `fetch` client for `/api/v1/app/*` and `AppApiError` (Task 5) |
| `src/types/app-ui.ts` | Browser-only types: `MoneyLimits`, `PrivyMode` (Task 4) |
| `src/primitives/{input,label,dialog,select,radio-group,checkbox,input-otp,separator}.tsx` | shadcn-generated, restyled (Task 2) |
| `src/primitives/{Money,KeyValue,CopyButton}.tsx`, `money-text.ts` | Hand-built primitives (Task 2) |
| `src/server/app/{session,reads,limits}.ts` | Session guard, per-page cached reads, money limits as strings (Task 4) |
| `src/hooks/app/*` | Query keys, the event stream, idempotency, `useNow`, per-area query hooks |
| `src/components/app/app-providers.tsx` | QueryClient, the session query, the live stream (Task 5) |
| `src/components/app/chrome/*` | Top bar, tab bar, sidebar, notifications modal (Task 6) |
| `src/components/app/{page-header,app-error,app-skeleton,beta-line,setup-gate,timeline}.tsx` | Shared page parts |
| `src/components/app/{signin,setup,pin,bank,documents,activity,money,cash,home,stocks,trade,orders,earn,earnings,settings}/*` | One folder per feature |
| `src/app/(auth)/signin`, `src/app/(setup)/setup`, `src/app/(app)/*` | Routes, layouts, `loading.tsx`, `error.tsx`, `not-found.tsx` |
| `src/app/api/v1/app/beta/orders/[id]/complete-transfer/route.ts` | The one new route (Task 3) |
| `tests/app-ui/*.test.ts` | Pure-logic tests (Vitest, node) |
| `e2e/app/*`, `playwright.app.config.ts`, `scripts/app-e2e.mjs`, `scripts/app-e2e-seed.ts` | The app's browser suite (Task 19) |

---

### Task 1: Exact formatting and the app type scale

**Files:**
- Create: `src/utils/format.ts`
- Modify: `src/components/landing/format.ts` (move `parseKobo`, `groupDigits`, `formatNaira`, `formatChangeBps` out; import and re-export them)
- Modify: `src/styles/globals.css` (four app type utilities after `type-label`)
- Test: `tests/app-ui/format.test.ts`, `tests/app-ui/type-scale.test.ts`

**Interfaces:**
- Produces, in `@/utils/format`:
  - `parseKobo(kobo: string): bigint`
  - `groupDigits(digits: string): string`
  - `formatNaira(kobo: string): string`
  - `formatChangeBps(bps: number): string`
  - `formatSignedNaira(kobo: string, direction: "in" | "out" | "none"): string`
  - `formatShares(sharesMicro: string): string`
  - `formatLagosTime(iso: string): string`
  - `formatLagosDay(value: string): string`, which accepts `YYYY-MM-DD` or an ISO time
  - `formatLagosDateTime(iso: string): string`
  - `lagosDayLabel(iso: string, now: Date): string`
  - `countdown(expiresAt: string, now: Date): { text: string; done: boolean }`
  - `parseNairaInput(text: string): string | null`
- Produces CSS utilities: `type-app-figure`, `type-app-amount`, `type-app-title`, `type-app-heading`.

- [ ] **Step 1: Write the tests**

```ts
// tests/app-ui/format.test.ts
import { describe, expect, it } from "vitest";
import * as landing from "@/components/landing/format";
import {
  countdown, formatChangeBps, formatLagosDateTime, formatLagosDay, formatLagosTime,
  formatNaira, formatShares, formatSignedNaira, lagosDayLabel, parseNairaInput,
} from "@/utils/format";

describe("money", () => {
  it("keeps the landing's formatters as one implementation", () => {
    expect(formatNaira("124000")).toBe("₦1,240");
    expect(formatNaira("231015")).toBe("₦2,310.15");
    expect(landing.formatNaira).toBe(formatNaira);
    expect(landing.formatChangeBps).toBe(formatChangeBps);
  });
  it("signs by direction with a true minus", () => {
    expect(formatSignedNaira("500000", "in")).toBe("+₦5,000");
    expect(formatSignedNaira("500000", "out")).toBe("−₦5,000");
    expect(formatSignedNaira("500000", "none")).toBe("₦5,000");
  });
  it("formats shares from millionths", () => {
    expect(formatShares("412000")).toBe("0.412 shares");
    expect(formatShares("1000000")).toBe("1 share");
    expect(formatShares("2500000")).toBe("2.5 shares");
    expect(formatShares("1")).toBe("0.000001 shares");
    expect(formatShares("12345678900000")).toBe("12,345,678.9 shares");
  });
  it("parses typed naira into exact kobo", () => {
    expect(parseNairaInput("₦12,500.50")).toBe("1250050");
    expect(parseNairaInput(" 12500 ")).toBe("1250000");
    expect(parseNairaInput("0.5")).toBe("50");
    expect(parseNairaInput("007")).toBe("700");
    for (const bad of ["", "abc", "-5", "12.345", "1e3", "₦"]) expect(parseNairaInput(bad)).toBeNull();
  });
});

describe("Lagos time, whatever the device's timezone", () => {
  it("formats in Africa/Lagos", () => {
    expect(formatLagosTime("2026-11-19T13:20:00Z")).toBe("14:20");
    expect(formatLagosDay("2026-11-20")).toBe("Fri 20 Nov");
    expect(formatLagosDay("2026-11-19T23:30:00Z")).toBe("Fri 20 Nov");
    expect(formatLagosDateTime("2026-11-22T08:40:00Z")).toBe("Sun 22 Nov, 09:40");
  });
  it("labels days relative to now", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(lagosDayLabel("2026-11-19T23:30:00Z", now)).toBe("Today");
    expect(lagosDayLabel("2026-11-19T10:00:00Z", now)).toBe("Yesterday");
    expect(lagosDayLabel("2026-11-16T10:00:00Z", now)).toBe("Mon 16 Nov");
  });
});

describe("countdown", () => {
  it("counts mm:ss, then h:mm:ss, then stops", () => {
    expect(countdown("2026-11-19T13:44:00Z", new Date("2026-11-19T13:20:19Z"))).toEqual({ text: "23:41", done: false });
    expect(countdown("2026-11-19T15:00:00Z", new Date("2026-11-19T13:57:57Z"))).toEqual({ text: "1:02:03", done: false });
    expect(countdown("2026-11-19T13:44:00Z", new Date("2026-11-19T13:44:01Z"))).toEqual({ text: "00:00", done: true });
  });
});
```

`tests/app-ui/type-scale.test.ts` reads `src/styles/globals.css`. It asserts that each `@utility type-app-*` block exists with exactly these values:

| Utility | Font size | Weight | Line height | Letter spacing |
| --- | --- | --- | --- | --- |
| `type-app-figure` | `2.5rem` | 300 | 1.05 | −0.02em |
| `type-app-amount` | `2rem` | 300 | 1.1 | — |
| `type-app-title` | `1.5rem` | 500 | 1.25 | — |
| `type-app-heading` | `1.125rem` | 600 | 1.35 | — |

It also asserts that no `type-app-*` block contains `clamp(`.

- [ ] **Step 2: Implement `src/utils/format.ts`**
  - The file imports nothing from Node.
  - Move the four functions out of `src/components/landing/format.ts` unchanged. That file then imports `parseKobo` and `groupDigits` and re-exports `formatNaira` and `formatChangeBps`, so `tests/landing/format.test.ts` keeps passing.
  - Lagos formatters use `Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", … })`, as the landing does. A date-only value is read as Lagos noon on that date.
  - `formatShares` trims trailing zeros, groups thousands, and says "share" only when exactly 1.
  - `parseNairaInput` strips `₦`, spaces and commas, accepts `/^\d+(\.\d{1,2})?$/`, and returns kobo without leading zeros. It uses no `Number`.
- [ ] **Step 3: Add the four utilities to `globals.css`** with the values from the table in Step 1.
- [ ] **Step 4: Commit**

```bash
git add src/utils/format.ts src/components/landing/format.ts src/styles/globals.css tests/app-ui/format.test.ts tests/app-ui/type-scale.test.ts
git commit -m "feat: share exact naira, shares and Lagos-time formatting with the app"
```

---

### Task 2: App primitives

**Files:**
- Create, with `npx shadcn@4.23.0 add input label dialog select radio-group checkbox input-otp separator`, then restyle: `src/primitives/input.tsx`, `label.tsx`, `dialog.tsx`, `select.tsx`, `radio-group.tsx`, `checkbox.tsx`, `input-otp.tsx`, `separator.tsx`
- Create: `src/primitives/money-text.ts`, `src/primitives/Money.tsx`, `src/primitives/KeyValue.tsx`, `src/primitives/CopyButton.tsx`
- Modify: `src/primitives/index.ts`, `package.json`, `yarn.lock` (`input-otp`)
- Test: `tests/app-ui/money-text.test.ts`, `tests/app-ui/primitives-guard.test.ts`

**Interfaces:**
- Consumes: `formatNaira` and `formatSignedNaira` (Task 1).
- Produces, all from `@/primitives`:
  - the generated parts, with their shadcn names and APIs: `Input`, `Label`, `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`, `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `RadioGroup`, `RadioGroupItem`, `Checkbox`, `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `Separator`;
  - `moneyText(kobo: string | null, direction?: "in" | "out" | "none"): string`;
  - `Money(props: { kobo: string | null; direction?: "in" | "out" | "none"; className?: string })`;
  - `KeyValue(props: { items: { label: string; value: React.ReactNode }[] })`, rendered as a `<dl>`;
  - `CopyButton(props: { value: string; label: string })`.

- [ ] **Step 1: Write the tests**

```ts
// tests/app-ui/money-text.test.ts
it("renders unknown as a dash, never ₦0", () => {
  expect(moneyText(null)).toBe("—");
  expect(moneyText("0")).toBe("₦0");
  expect(moneyText("500000")).toBe("₦5,000");
  expect(moneyText("500000", "out")).toBe("−₦5,000");
});
```

`primitives-guard.test.ts` covers every `src/primitives/*.tsx`:
- no `lucide-react`;
- no `@radix-ui/react-`;
- no `from "@/utils"` barrel import;
- no runtime import from `"@phosphor-icons/react"`; only `/dist/ssr`, or `import type`;
- `cn` is imported from `"@/utils/cn"` wherever `cn(` appears.

It also asserts that `dialog.tsx` contains `max-h-[92dvh]`, `rounded-t-[28px]`, `sm:max-w-[480px]` and `motion-reduce:`, and that `index.ts` exports `Money`, `KeyValue`, `CopyButton`, `Dialog` and `InputOTP`.

- [ ] **Step 2: Generate, then restyle in place** with tokens only.
  - **Cleanup:**
    - Replace any generated icon with Phosphor's SSR entry: `X` for close, `Check`, `CaretDown`.
    - Keep the unified `radix-ui` import.
    - Run `yarn install` so `yarn.lock` records `input-otp`.
  - **Input:** `h-12 rounded-md border border-input bg-surface px-4 text-base text-heading placeholder:text-subtle`, plus the focus ring `outline-2 outline-offset-3 outline-ring`, `aria-invalid:border-loss` and `disabled:opacity-50`.
  - **Dialog:**
    - The overlay is `bg-void/70`.
    - The content is a bottom sheet below 640px: `fixed inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-t border-stroke bg-surface`, with safe-area bottom padding.
    - From `sm:` it is centred: `sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100%-2rem)] sm:max-w-[480px] sm:rounded-[28px] sm:border`.
    - It opens in 260ms and closes in 170ms ease-out; `motion-reduce:` makes both a fade.
    - The close button is 44px with the accessible name "Close". `DialogTitle` uses `type-app-heading text-heading`.
  - **Select:** content renders through the portal on `surface-raised`, with 44px items.
  - **RadioGroup and Checkbox:** a 20px control; checked uses signal with a white Phosphor `Check`.
  - **InputOTP:** slots are 56×56, `rounded-md border-input`, 24px tabular digits, with a gain ring on the active slot.
  - **Separator:** `bg-stroke`.
- [ ] **Step 3: Implement the hand-built primitives.**
  - `moneyText` returns "—" for null.
  - `Money` renders `<data>`. For null it adds `<span className="sr-only">not available</span>`.
  - `CopyButton`:
    - writes with `navigator.clipboard.writeText`;
    - shows "Copied" for 2s through a polite live region;
    - is a 44px icon-and-text button (Phosphor `Copy`, then `Check`).
- [ ] **Step 4: Commit**

```bash
git add src/primitives tests/app-ui/money-text.test.ts tests/app-ui/primitives-guard.test.ts package.json yarn.lock
git commit -m "feat: add the app's form, dialog and money primitives"
```

---

### Task 3: Beta transfer completion for pay-by-transfer orders, and document types

**Files:**
- Modify: `src/backend/services/app/orders.ts` (add `completeBetaTransfer`)
- Create: `src/app/api/v1/app/beta/orders/[id]/complete-transfer/route.ts`
- Modify: `src/types/app.ts`, `src/app/api/v1/app/documents/route.ts`, `src/app/api/v1/app/documents/[slug]/route.ts`
- Modify: `docs/api/customer-app.md` (add the route to the Catalog/orders table and to §Beta affordances)
- Test: `tests/app/orders-waiting.test.ts` (three new cases, beside "buys after a bank transfer…")

**Interfaces:**
- Consumes:
  - `appCashService.getDeposit(userId, id)` and `appCashService.completeBetaDeposit(userId, id)`;
  - `appOrdersService.get(userId, orderId)`.
- Produces:
  - the route `POST /api/v1/app/beta/orders/{id}/complete-transfer`, returning `AppOrderDto`;
  - `AppDocumentSlug = "terms" | "risks" | "how-shares-are-held" | "earn-risks" | "privacy"`;
  - `AppDocumentSummaryDto = { slug: AppDocumentSlug; title: string; version: string; accepted: boolean }`;
  - `AppDocumentDto = { slug: AppDocumentSlug; title: string; version: string; body: string }`.

- [ ] **Step 1: Write the tests.** Reuse that file's `setupWorld`, `previewRaw` and `placeWith`. Import the new `POST` as `betaOrderCompletePOST`.

```ts
it("completes a pay-by-transfer order's test transfer from the order", async () => {
  const { cookie, handle, stock } = await setupWorld("wait-bank-order@v3st.test");
  await touchReference(stock.id);
  const p = dataOf<AppOrderPreviewDto>((await previewRaw(cookie, stock.id, {
    side: "buy", amount_kobo: "2000000", pay_with: "bank_transfer",
  })).json);
  const order = dataOf<AppOrderDto>((await placeWith(cookie, p.preview_id, "w-key-bank-order")).json);
  const res = await callAppRoute(betaOrderCompletePOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/beta/orders/${order.id}/complete-transfer`,
    cookie,
    params: { id: order.id },
  });
  expect(res.status).toBe(200);
  expect(dataOf<AppOrderDto>(res.json).id).toBe(order.id);
  for (let i = 0; i < 12; i += 1) { await drainJobs(); await handle.mine(3); }
  const done = await callAppRoute(orderGET, { method: "GET", url: `${ORIGIN}/api/v1/app/orders/${order.id}`, cookie, params: { id: order.id } });
  expect(dataOf<AppOrderDto>(done.json).status).toBe("completed");
  const again = await callAppRoute(betaOrderCompletePOST, { /* same request */ });
  expect(again.status).toBe(200); // idempotent once paid
});

it("refuses another customer's order", async () => {
  // place a bank-transfer order as one customer, then call the route with a second readyCustomer's cookie
  expect(res.status).toBe(404);
  expect((res.json as { code: string }).code).toBe("NOT_FOUND");
});
```

- [ ] **Step 2: Implement `appOrdersService.completeBetaTransfer(userId: string, orderId: string): Promise<AppOrderDto>`**
  1. Load the customer order by `{ id: orderId, userId }`. Throw `NotFoundException("Order not found")` when it is missing or `depositOrderId` is null.
  2. Read the linked deposit with `appCashService.getDeposit(userId, depositOrderId)`. Call `completeBetaDeposit` only while its `status` is `"waiting"`.
  3. Return `this.get(userId, orderId)`.

  Prisma stays inside the service.
- [ ] **Step 3: Create the route** with the middleware contract.

```ts
export const POST = withMiddleware<null, IdParamSchema, null>(
  async (request) =>
    ok(await appOrdersService.completeBetaTransfer(request.user!.id, request.params!.id), "Transfer marked as paid"),
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
```

Read `tests/app/routes-guard.test.ts`. Make the route meet every rule it checks for `beta/*` routes, and add the route wherever the guard lists beta routes.
- [ ] **Step 4: Add the three document types to `src/types/app.ts`** (type-only; no backend import). Annotate the two document routes' returned objects with them.
- [ ] **Step 5: Document the route** in `docs/api/customer-app.md`: a table row, plus the beta-affordance bullet "`POST /app/beta/orders/[id]/complete-transfer` marks a pay-by-transfer order's test transfer paid".
- [ ] **Step 6: Commit**

```bash
git add src/backend/services/app/orders.ts "src/app/api/v1/app/beta/orders" src/types/app.ts src/app/api/v1/app/documents docs/api/customer-app.md tests/app/orders-waiting.test.ts
git commit -m "feat: let beta testers complete a pay-by-transfer order's test transfer"
```

---

### Task 4: Session guard, server reads and money limits

**Files:**
- Create: `src/server/app/session.ts`, `src/server/app/reads.ts`, `src/server/app/limits.ts`, `src/utils/app-paths.ts`, `src/types/app-ui.ts`
- Test: `tests/app-ui/app-paths.test.ts`, `tests/app-ui/limits.test.ts`

**Interfaces:**
- Consumes:
  - `authService.authenticate(token)` and `SESSION_COOKIE_NAME`;
  - the app services' methods: `appHomeService.get`, `appActivityService.list`/`get`, `appCashService.balance`/`bankAccount`/`banks`/`getDeposit`, `appCatalogService.list`/`get`/`chart`, `appOrdersService.get`, `appEarnService.products`/`product`, `appEarningsService.summary`, `appOnboardingService.status`, `appIdentityService.testIdentities`, `appProfileService.get`, `appAutomationsService.list`, `appSessionService.get`;
  - `agreementService.acceptedCurrent` with `CUSTOMER_DOCUMENTS`, mirroring the documents route;
  - `reportError` from `@/backend/observability`.
- Produces, in `src/server/app/session.ts`:
  - `getCurrentCustomer(): Promise<AuthenticatedUser | null>`, wrapped in React `cache()`;
  - `requireCustomer(nextPath: string): Promise<AuthenticatedUser>`, which redirects to `/signin?next=<encoded path>`.
- Produces, in `src/server/app/reads.ts`: each read is `cache()`d, takes the `user` first, and returns `null` when the read failed. Detail reads return `undefined` for not found.
  - `readSession(user): Promise<AppSessionDto | null>`
  - `readOnboarding`, `readTestIdentities`, `readDocuments`, `readBanks`
  - `readHome(user): Promise<{ home: AppHomeDto; activity: AppActivityPageDto } | null>`, with activity limited to 10
  - `readStocks(user, q: { query?: string; watchlist?: boolean })`
  - `readStock(user, id)` and `readOrder(user, id)`, each `→ T | null | undefined`
  - `readChart(id, range)`
  - `readCash(user): Promise<{ cash: AppCashDto; bankAccount: AppBankAccountDto | null } | null>`
  - `readEarnProducts`, `readEarnProduct(user, id)`, `readEarnings`
  - `readActivity(user, cursor?)`
  - `readActivityItem(user, id): Promise<{ item: AppActivityDetailDto; deposit: AppDepositDto | null } | null | undefined>`
  - `readSettings(user): Promise<{ profile: AppProfileDto; automations: AppAutomationDto[]; documents: AppDocumentSummaryDto[] } | null>`
- Produces, in `src/server/app/limits.ts`: `moneyLimits(): MoneyLimits`.
- Produces, in `src/types/app-ui.ts`:
  - `MoneyLimits = { depositMinKobo: string; depositMaxKobo: string; buyMinKobo: string; earnMinKobo: string; minPayoutKobo: string }`;
  - `PrivyMode = "sandbox" | "simulated"`.
- Produces, in `src/utils/app-paths.ts`:
  - `safeNext(next: string | null | undefined): string`;
  - `afterSignInPath(nextStep: AppOnboardingStepKey | null, next: string | null): string`;
  - `SETTINGS_MODALS = ["name", "bank", "pin", "reset-pin", "devices", "automations"] as const`;
  - `type SettingsModal`;
  - `parseSettingsOpen(value: string | string[] | undefined): SettingsModal | null`;
  - `settingsHref(modal: SettingsModal): string`.

- [ ] **Step 1: Write the tests**

```ts
// tests/app-ui/app-paths.test.ts
it("keeps next on this site, off auth and API paths", () => {
  expect(safeNext(null)).toBe("/home");
  expect(safeNext("/stocks/ck1")).toBe("/stocks/ck1");
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil", "/signin", "/api/v1/app/session", "home"])
    expect(safeNext(bad)).toBe("/home");
});
it("sends unfinished setups to /setup", () => {
  expect(afterSignInPath("pin", "/stocks")).toBe("/setup");
  expect(afterSignInPath(null, "/stocks")).toBe("/stocks");
  expect(afterSignInPath(null, null)).toBe("/home");
});
it("parses the settings modal parameter", () => {
  expect(parseSettingsOpen("bank")).toBe("bank");
  expect(parseSettingsOpen(["reset-pin"])).toBe("reset-pin");
  expect(parseSettingsOpen("nope")).toBeNull();
  expect(parseSettingsOpen(undefined)).toBeNull();
  expect(settingsHref("automations")).toBe("/settings?open=automations");
});
// tests/app-ui/limits.test.ts
it("passes policy limits as strings", () => {
  expect(moneyLimits()).toEqual({
    depositMinKobo: "100000", depositMaxKobo: "500000000", buyMinKobo: "100000",
    earnMinKobo: "500000", minPayoutKobo: "200000",
  });
});
```

- [ ] **Step 2: Implement the session guard.**
  - `getCurrentCustomer` reads the `SESSION_COOKIE_NAME` cookie with `(await cookies()).get(…)` and returns null when there is none.
  - It calls `authService.authenticate`, and turns an `UnauthorizedException` into null.
- [ ] **Step 3: Implement the reads.** Each read follows the same shape:
  1. `try` the service call.
  2. `catch (error)`: call `unstable_rethrow(error)` first.
  3. A `NotFoundException` from a detail read returns `undefined`.
  4. Anything else calls `reportError(error, { read: "<name>" })` and returns `null`.

  Two reads have extra steps:
  - `readActivityItem` fetches the deposit only when `isUnpaidTransfer` holds: the id starts `dep_` and the status is `waiting`. Implement that inline; Task 9 exports the same rule for the browser.
  - `readDocuments` maps `CUSTOMER_DOCUMENTS` exactly as `GET /api/v1/app/documents` does.
- [ ] **Step 4: Implement `moneyLimits()`** from `policy.deposits.minKobo`, `policy.deposits.maxKobo`, `policy.app.orders.minBuyKobo`, `policy.app.earn.minKobo` and `policy.earnings.minPayoutKobo`, each `.toString()`. Implement `app-paths.ts` with no Node imports.
- [ ] **Step 5: Commit**

```bash
git add src/server/app src/utils/app-paths.ts src/types/app-ui.ts tests/app-ui/app-paths.test.ts tests/app-ui/limits.test.ts
git commit -m "feat: add the customer session guard and server reads for app pages"
```

---

### Task 5: Client data layer

**Files:**
- Modify: `package.json`, `yarn.lock` (`yarn add --exact @tanstack/react-query@5.108.1`)
- Create: `src/utils/app-api.ts`, `src/hooks/app/query-keys.ts`, `src/hooks/app/use-app-events.ts`, `src/hooks/app/idempotency.ts`, `src/hooks/app/use-idempotency-key.ts`, `src/hooks/app/use-now.ts`, `src/components/app/app-providers.tsx`
- Test: `tests/app-ui/app-api.test.ts`, `tests/app-ui/query-keys.test.ts`, `tests/app-ui/events.test.ts`

**Interfaces:**
- Produces, in `src/utils/app-api.ts`:
  - `class AppApiError extends Error { status: number; code: string }`, with `constructor(message: string, status: number, code: string)`;
  - `createAppApi(deps: { fetch: typeof fetch; onSignInRequired: () => void }): AppApi`;
  - `appApi: AppApi`.

  Each `AppApi` method resolves to the envelope's `data`. Paths are relative to `/api/v1/app`.

  | Group | Methods |
  | --- | --- |
  | auth | `privy({ access_token, identity_token })`, which returns `{ is_new_customer: boolean; next_step: AppOnboardingStepKey \| null }`, and `logout()` |
  | beta | `privyTokens(email)`, which returns `{ access_token: string; identity_token: string }`; `completeDeposit(id): AppDepositDto`; `completeOrderTransfer(id): AppOrderDto` |
  | session, onboarding, identity | `get(): AppSessionDto`; `get(): AppOnboardingDto`; `testIdentities(): AppTestIdentityDto[]` and `verify(test_identity_id)`, which returns `{ verified: boolean; onboarding: AppOnboardingDto }` |
  | documents, agreements | `list(): AppDocumentSummaryDto[]`, `get(slug): AppDocumentDto`; `accept(documents: { slug: AppDocumentSlug; version: string }[]): AppOnboardingDto` |
  | security | `setPin({ pin, current_pin? })`, `resetPin({ access_token, identity_token, pin })`, `sessions(): AppDeviceSessionDto[]`, `revokeSession(id)`, `signOutOthers()` |
  | cash, banks, bankAccount | `get(): AppCashDto`, `createDeposit(amount_kobo, key): AppDepositDto`, `deposit(id): AppDepositDto`; `list(): AppBankDto[]`; `get(): AppBankAccountDto \| null`, `put({ bank_code, account_number, pin })` |
  | withdrawals | `preview(amount_kobo): AppWithdrawalPreviewDto`, `create({ preview_id, pin }, key): AppWithdrawalDto` |
  | stocks, watchlist, home | `list({ q?, watchlist? }): AppStockListItemDto[]`, `get(id): AppStockDetailDto`, `chart(id, range): AppChartDto`; `add(id)`, `remove(id)`; `get(): AppHomeDto` |
  | orders | `preview(body: OrderPreviewBody): AppOrderPreviewDto`, `place({ preview_id, pin }, key): AppOrderDto`, `get(id)`, `cancel(id)` |
  | earn, earnings | `list()`, `get(id)`, `preview(id, amount_kobo): AppEarnPreviewDto`, `join(id, { preview_id, pin, accepted_risk_version }, key)`, `withdrawPreview(positionId)`, `withdraw(positionId, { preview_id, pin }, key)`; `get(): AppEarningsDto`, `setPreference({ choice, stock_id?, pin })` |
  | activity, notifications | `list({ cursor?, limit? }): AppActivityPageDto`, `get(id): AppActivityDetailDto`; `list(cursor?)` and `markRead({ ids } \| { all: true })`, which returns `{ unread: number }` |
  | automations, profile | `list()`, `turnOff(id)`, `renew(id, pin)`; `get(): AppProfileDto`, `update({ preferred_name: string \| null })` |

  `OrderPreviewBody = { stock_id: string; side: "buy" | "sell"; amount_kobo?: string; sell_all?: true; pay_with?: "cash" | "bank_transfer" }`.
- Produces, in `src/hooks/app/query-keys.ts`:
  - `appKeys`: the exact keys in Step 3;
  - `AREA_KEYS`;
  - `keysForAreas(areas: readonly string[]): readonly (readonly unknown[])[]`.
- Produces, in `src/hooks/app/use-app-events.ts`:
  - `nextBackoffMs(attempt: number): number`;
  - `parseChangedFrame(data: string): string[]`;
  - `useAppEvents(onAreas: (areas: string[]) => void): void`.
- Produces, for idempotency and time:
  - `nextIdempotencyKey(current: string, event: "retry" | "new_preview" | "done", make: () => string): string`;
  - `useIdempotencyKey(): { key: string; renew: () => void }`;
  - `useNow(intervalMs: number): Date`.
- Produces, in `src/components/app/app-providers.tsx`:
  - `AppProviders(props: { session: AppSessionDto | null; live: boolean; children: React.ReactNode })`;
  - `useAppSession(): AppSessionDto | null`;
  - `useOnboardingComplete(): boolean`.

- [ ] **Step 1: Write the tests** against `createAppApi` with a fake `fetch` that records its calls.

```ts
it("unwraps data and sends the idempotency key", async () => {
  const { api, calls } = fakeApi(200, { status: 201, message: "Placed", data: { id: "o1" } });
  await expect(api.orders.place({ preview_id: "p1", pin: "1357" }, "key-1")).resolves.toEqual({ id: "o1" });
  expect(calls[0]).toMatchObject({ url: "/api/v1/app/orders", method: "POST" });
  expect(calls[0]!.headers["idempotency-key"]).toBe("key-1");
});
it("throws the API's own copy", async () => {
  const { api } = fakeApi(409, { status: 409, message: "The price changed. Review the new price to continue.", code: "PRICE_CHANGED", data: null });
  await expect(api.home.get()).rejects.toMatchObject({ status: 409, code: "PRICE_CHANGED", message: "The price changed. Review the new price to continue." });
});
it("redirects to sign-in on an ended session", async () => {
  const { api, signIns } = fakeApi(401, { status: 401, message: "Please sign in to continue.", code: "SIGN_IN_REQUIRED", data: null });
  await expect(api.cash.get()).rejects.toBeInstanceOf(AppApiError);
  expect(signIns()).toBe(1);
});
it("falls back to the API's generic copy for non-JSON failures and network errors", async () => {
  // a 502 with an HTML body gives code SOMETHING_WENT_WRONG and message "Something went wrong. Please try again."
  // a rejecting fetch gives code NETWORK and message "You're offline or the connection dropped. Check it and try again."
});
it("builds query strings and bodies without empty keys", async () => {
  // stocks.list({ q: "apple", watchlist: true }) goes to "/api/v1/app/stocks?q=apple&watchlist=true"; stocks.list({}) to "/api/v1/app/stocks"
  // earnings.setPreference({ choice: "payout", pin: "1357" }) sends exactly {"choice":"payout","pin":"1357"}
  // beta.completeDeposit("d1") sends POST with no body and no content-type
});
// tests/app-ui/query-keys.test.ts
it("maps stream areas to query keys", () => {
  expect(keysForAreas(["cash"])).toEqual([["cash"], ["home"], ["deposit"]]);
  expect(keysForAreas(["notifications", "unknown"])).toEqual([["notifications"], ["session"]]);
  expect(keysForAreas(["home", "cash"])).toEqual([["home"], ["cash"], ["deposit"]]);
});
// tests/app-ui/events.test.ts
it("backs off from 1s to 30s and parses frames", () => {
  expect([0, 1, 2, 5, 9].map(nextBackoffMs)).toEqual([1000, 2000, 4000, 30000, 30000]);
  expect(parseChangedFrame('{"areas":["home","cash"]}')).toEqual(["home", "cash"]);
  expect(parseChangedFrame("not json")).toEqual([]);
});
it("keeps the key for retries and renews it for a new preview", () => {
  const make = () => "k2";
  expect(nextIdempotencyKey("k1", "retry", make)).toBe("k1");
  expect(nextIdempotencyKey("k1", "new_preview", make)).toBe("k2");
  expect(nextIdempotencyKey("k1", "done", make)).toBe("k2");
});
```

- [ ] **Step 2: Implement the client.**
  - Requests go to `"/api/v1/app" + path` with `credentials: "same-origin"`, `cache: "no-store"` and `accept: application/json`.
  - Only send `content-type` and a body when there is a body. Build bodies with `if`, never spreads.
  - `SIGN_IN_REQUIRED` and `SIGN_IN_AGAIN` call `onSignInRequired` before throwing.
  - The default `onSignInRequired` runs `window.location.assign("/signin?next=" + encodeURIComponent(location.pathname + location.search))`.
- [ ] **Step 3: Implement the keys.** `appKeys` holds exactly these:

  | Group | Keys |
  | --- | --- |
  | Account | `session` `["session"]`, `onboarding` `["onboarding"]`, `profile` `["profile"]`, `devices` `["devices"]`, `automations` `["automations"]` |
  | Home and cash | `home` `["home"]`, `cash` `["cash"]`, `bankAccount` `["bank-account"]`, `banks` `["banks"]`, `deposit(id)` `["deposit", id]` |
  | Stocks and orders | `holdings` `["holdings"]`, `stocks(q)` `["stocks", q]`, `stock(id)` `["stock", id]`, `chart(id, range)` `["stock", id, "chart", range]`, `order(id)` `["orders", id]` |
  | Earn | `earnProducts` `["earn"]`, `earnProduct(id)` `["earn", id]`, `earnings` `["earnings"]` |
  | Activity | `activityPreview` `["activity", "preview"]`, `activityList` `["activity", "list"]`, `activityItem(id)` `["activity", "item", id]` |
  | Inbox and documents | `notifications` `["notifications"]`, `documents` `["documents"]`, `document(slug)` `["documents", slug]` |

  `AREA_KEYS` maps each stream area to the key prefixes it invalidates:

  | Area | Invalidates |
  | --- | --- |
  | `home` | `[home]` |
  | `cash` | `[cash]`, `[home]`, `[deposit]` |
  | `orders` | `[orders]`, `[home]` |
  | `holdings` | `[holdings]`, `[home]`, `[stock]` |
  | `earn` | `[earn]`, `[home]` |
  | `earnings` | `[earnings]`, `[home]` |
  | `activity` | `[activity]`, `[home]` |
  | `notifications` | `[notifications]`, `[session]` |

  `keysForAreas` dedupes in first-seen order and ignores unknown areas.
- [ ] **Step 4: Implement `useAppEvents`.**
  - It opens `new EventSource("/api/v1/app/events?after=" + lastId)` and listens for `changed`.
  - It stores `lastEventId` and closes when `document.visibilityState === "hidden"`. On return it reopens from the last id.
  - On `error` it closes and retries after `nextBackoffMs(attempt)`.
  - It cleans up every listener and timer on unmount.
- [ ] **Step 5: Implement `AppProviders`.**
  - One `QueryClient` per browser, and a new one per server render, as fluid's `query-provider.tsx` does.
    - Defaults: `staleTime: 30_000`, `refetchOnWindowFocus: true`.
    - Retry at most twice, never for an `AppApiError` with `status < 500`.
  - When `live` is true:
    - the session query uses `appKeys.session` and `appApi.session.get`, with `initialData: session`;
    - `useAppEvents` invalidates `keysForAreas(areas)`.
  - `useOnboardingComplete()` returns `session?.signed_in === true && session.onboarding.complete`.
- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock src/utils/app-api.ts src/hooks/app src/components/app/app-providers.tsx tests/app-ui/app-api.test.ts tests/app-ui/query-keys.test.ts tests/app-ui/events.test.ts
git commit -m "feat: add the customer API client, query keys and live updates"
```

---

### Task 6: App shell and notifications

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/error.tsx`, `src/app/(app)/not-found.tsx`
- Create: `src/components/app/chrome/{nav.ts,notification-time.ts,app-chrome.tsx,top-bar.tsx,tab-bar.tsx,sidebar.tsx,account-button.tsx,notifications-button.tsx,notifications-dialog.tsx}`
- Create: `src/components/app/{page-header.tsx,app-error.tsx,app-skeleton.tsx,beta-line.tsx,setup-gate.tsx}`, `src/hooks/app/use-notifications.ts`
- Test: `tests/app-ui/nav.test.ts`

**Interfaces:**
- Consumes:
  - `getCurrentCustomer` and `readSession` (Task 4);
  - `AppProviders` and `useAppSession` (Task 5);
  - the `Dialog` parts (Task 2);
  - `Wordmark` from `@/components/landing/wordmark` and `Badge` from `@/primitives`.
- Produces, in `nav.ts`:
  - `APP_TABS`: Home `/home` (House), Stocks `/stocks` (ChartLineUp), Cash `/cash` (CurrencyNgn), Earn `/earn` (Plant);
  - `SIDEBAR_EXTRA`: Activity `/activity` (ClockCounterClockwise);
  - `SETTINGS_ITEM`: Settings `/settings` (GearSix);
  - `isActive(pathname: string, href: string): boolean`;
  - `initialsFor(session: AppSessionDto | null): string`.

  Check that every icon exists in the installed Phosphor version, falling back to `Money` for CurrencyNgn.
- Produces shared parts:
  - `PageHeader(props: { title: string; back?: { href: string; label: string }; actions?: React.ReactNode })`;
  - `AppError(props: { line?: string })`;
  - `AppSkeleton(props: { variant: "home" | "list" | "detail" | "form" })`;
  - `BetaLine(props: { notice?: string })`, which defaults to `APP_BETA_NOTICE`;
  - `SetupGate(props: { children: React.ReactNode; label?: string })`.
- Produces, in `chrome/notification-time.ts`: `notificationTime(createdAt: string, now: Date): string`.

- [ ] **Step 1: Write the tests**

```ts
it("marks the current place without catching neighbours", () => {
  expect(isActive("/stocks/ck1", "/stocks")).toBe(true);
  expect(isActive("/earnings", "/earn")).toBe(false);
  expect(isActive("/home", "/home")).toBe(true);
  expect(APP_TABS.map((t) => t.label)).toEqual(["Home", "Stocks", "Cash", "Earn"]);
});
it("builds initials from the session", () => {
  expect(initialsFor(signedIn({ display_name: "Ada Obi" }))).toBe("AO");
  expect(initialsFor(signedIn({ display_name: null, first_name: "Ada" }))).toBe("A");
  expect(initialsFor(signedIn({ display_name: null, first_name: null, email: "tunde@v3st.test" }))).toBe("T");
  expect(initialsFor(null)).toBe("");
});
it("times notifications in Lagos", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  expect(notificationTime("2026-11-20T08:05:00Z", now)).toBe("09:05");
  expect(notificationTime("2026-11-19T08:05:00Z", now)).toBe("Yesterday");
  expect(notificationTime("2026-11-16T08:05:00Z", now)).toBe("Mon 16 Nov");
});
```

- [ ] **Step 2: Implement `(app)/layout.tsx`.**
  - It does `const user = await getCurrentCustomer()`, then `const session = user ? await readSession(user) : null`.
  - It renders `<AppProviders session={session} live><AppChrome>{children}</AppChrome></AppProviders>`.
  - Pages do their own `requireCustomer`. The layout never redirects and never throws: a failed session read gives a bell with no count.
- [ ] **Step 3: Implement `AppChrome`** (client), following spec §Shell.
  - A skip link, "Skip to content", targets `#app-main`.
  - **Below 768px:**
    - The sticky 56px `TopBar` shows `Wordmark` and *Beta*, linking to `/home`, then `NotificationsButton` and `AccountButton`.
    - `<main id="app-main">` gets 16px gutters and bottom padding `calc(64px + env(safe-area-inset-bottom) + 24px)`.
    - The fixed `TabBar` is 64px plus the safe-area inset.
  - **From 768px:**
    - A 248px `Sidebar` lists `APP_TABS`, then `SIDEBAR_EXTRA`, with `SETTINGS_ITEM` at its foot.
    - The top bar shows only the bell and the account.
    - Main content is one centred column, at most 720px wide.
  - Active items take `aria-current="page"`, heading text and a gain icon.
  - The body scrolls; there is no inner scroll container.
- [ ] **Step 4: Implement the notifications modal.**
  - `NotificationsButton` is 44px with the accessible name "Notifications, N unread", or "Notifications" when there are none. It shows a mint dot when N is above 0 and opens `NotificationsDialog`.
  - `NotificationsDialog` uses `useInfiniteQuery` on `appKeys.notifications` with `appApi.notifications.list(cursor)`.
  - Each row is a button: title, body, `notificationTime`, and an unread dot with `sr-only` "Unread". Activating it marks it read, closes the dialog and runs `router.push(link)`.
  - It offers *Mark all as read* and *Show older*. When empty it says "No notifications yet."
  - `AccountButton` is a link to `/settings` with the accessible name "Settings", showing `initialsFor(session)`.
- [ ] **Step 5: Implement the shared parts.**
  - `PageHeader` has an `h1` in `type-app-title` and a 44px back link with `ArrowLeft`.
  - `AppError` reads "We couldn't load this page." with *Try again* (`router.refresh()`).
  - `error.tsx` is a client component that renders `<AppError />`.
  - `not-found.tsx` reads "We couldn't find that." with a *Home* link.
  - `SetupGate` renders its children when `useOnboardingComplete()` is true. Otherwise it shows an outline pill linking to `/setup`, labelled `label ?? "Finish setting up"`.
  - `BetaLine` is 13px subtle text.
- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/error.tsx" "src/app/(app)/not-found.tsx" src/components/app src/hooks/app/use-notifications.ts tests/app-ui/nav.test.ts
git commit -m "feat: add the app chrome, tab bar, sidebar and notifications"
```

---

### Task 7: Sign-in at `/signin`

**Files:**
- Modify: `package.json`, `yarn.lock` (`yarn add --exact @privy-io/react-auth@3.52.0`)
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/signin/page.tsx`
- Create: `src/components/app/signin/{signin-panel.tsx,simulated-signin.tsx,privy-signin.tsx,signin.ts,use-sign-out.ts}`
- Test: `tests/app-ui/signin.test.ts`

**Interfaces:**
- Consumes:
  - `safeNext` and `afterSignInPath` (Task 4);
  - `appApi.auth`, `appApi.beta.privyTokens` and `AppApiError` (Task 5);
  - `InputOTP` and `Input` (Task 2).
- Produces:
  - `SigninPanel(props: { mode: PrivyMode; appId: string | null; next: string | null; signedOut: boolean })`;
  - `useSignOut(): { signOut: () => Promise<void>; pending: boolean }`;
  - `signinErrorMessage(error: unknown): string`;
  - `isValidEmail(value: string): boolean`;
  - `canResend(sentAt: number, now: number): boolean`.

- [ ] **Step 1: Write the tests**

```ts
it("shows the API's copy, or the code message for Privy failures", () => {
  const beta = new AppApiError("During the beta, sign in with a beta test email.", 403, "BETA_TEST_ACCOUNT");
  expect(signinErrorMessage(beta)).toBe("During the beta, sign in with a beta test email.");
  expect(signinErrorMessage(new Error("privy: invalid code"))).toBe("That code didn't work. Check it and try again.");
});
it("validates emails and paces resends at 30 seconds", () => {
  expect(isValidEmail("ada@v3st.test")).toBe(true);
  expect(isValidEmail("ada")).toBe(false);
  expect(canResend(0, 29_999)).toBe(false);
  expect(canResend(0, 30_000)).toBe(true);
});
```

- [ ] **Step 2: Implement the page.**
  - It awaits `searchParams`. A user who already has a valid session goes to `redirect(safeNext(next))`.
  - It renders `<SigninPanel mode={env.PRIVY_MODE} appId={env.PRIVY_APP_ID ?? null} next={next} signedOut={params["signed-out"] === "1"} />`. The server reads `env`; no new public variable is added.
  - Its metadata title is "Sign in · V3ST".
  - `(auth)/layout.tsx` renders `<AppProviders session={null} live={false}>` around a centred 400px column with `Wordmark` and *Beta*, and no navigation.
- [ ] **Step 3: Implement the panel.**
  - The `h1` reads "Sign in to V3ST", with the line "Use the email you were invited with." and `BetaLine` beneath.
  - `signedOut` shows "You're signed out." in a polite live region.
  - Simulated mode renders `SimulatedSignin`.
  - Sandbox mode with a null `appId` reads "Sign-in isn't set up on this server yet."
  - Otherwise it renders `dynamic(() => import("./privy-signin"), { ssr: false })`, with an `AppSkeleton variant="form"` while loading.
- [ ] **Step 4: Implement `SimulatedSignin`.**
  1. An email field: `type="email"`, `autoComplete="email"`, label "Email".
  2. *Continue* calls `appApi.beta.privyTokens(email)`, then `appApi.auth.privy(tokens)`.
  3. Then `router.replace(afterSignInPath(res.next_step, next))`.

  The hint reads "Beta: sign in with an @v3st.test email or one on the beta list."
- [ ] **Step 5: Implement `privy-signin.tsx`** as a default export.
  - It wraps everything in `<PrivyProvider appId={appId} config={{ loginMethods: ["email"], embeddedWallets: { ethereum: { createOnLogin: "off" } } }}>`.
  - Check the config keys and the hooks against the installed 3.52.0 types: `usePrivy` (`ready`, `authenticated`, `logout`, `getAccessToken`), `useLoginWithEmail` (`sendCode`, `loginWithCode`), and the identity-token accessor.
  - The flow:
    1. *Send code*.
    2. A six-digit `InputOTP` with `autoComplete="one-time-code"` and label "Code". *Send a new code* is enabled by `canResend`, and *Use a different email* goes back.
    3. Once `authenticated`, exchange both tokens with `appApi.auth.privy` exactly once (guarded by a ref), then redirect with `afterSignInPath`.
  - When `signedOut` is set and Privy reports `authenticated`, call Privy `logout()` first, so a stored Privy session never signs anyone back in.
- [ ] **Step 6: Implement `useSignOut`.**
  1. `appApi.auth.logout()`, ignoring errors.
  2. `queryClient.clear()`.
  3. `window.location.assign("/signin?signed-out=1")`.

  Privy's own `logout()` then runs on `/signin` (Step 5), because the Privy SDK only loads there. That covers spec §Page details' sign-out order.
- [ ] **Step 7: Commit**

```bash
git add package.json yarn.lock "src/app/(auth)" src/components/app/signin tests/app-ui/signin.test.ts
git commit -m "feat: sign customers in at /signin with email codes or the beta issuer"
```

---

### Task 8: Setup at `/setup`

**Files:**
- Create: `src/app/(setup)/layout.tsx`, `src/app/(setup)/setup/page.tsx`, `src/app/(setup)/setup/loading.tsx`
- Create: `src/components/app/setup/{setup-shell.tsx,setup-flow.tsx,setup-steps.ts,identity-step.tsx,pin-setup-step.tsx,documents-step.tsx,bank-step.tsx}`
- Create: `src/components/app/pin/{pin.ts,pin-input.tsx}`, `src/components/app/bank/{bank.ts,bank-fields.tsx}`, `src/components/app/documents/document-dialog.tsx`
- Modify: `src/components/landing/document-body.tsx` (add `headingLevel?: 1 | 2 | 3`, default `1`)
- Test: `tests/app-ui/setup.test.ts`

**Interfaces:**
- Consumes:
  - `requireCustomer`, `readOnboarding`, `readTestIdentities`, `readDocuments` and `readBanks` (Task 4);
  - `INVEST_DOCUMENTS` (server only), the `markdown-lite.ts` parser, and `DocumentBody`;
  - `useSignOut` (Task 7), for the setup shell.
- Produces, from setup:
  - `setupProgress(o: AppOnboardingDto): { current: AppOnboardingStepDto | null; index: number; total: number }`.
- Produces, in `pin.ts`, `pin-input.tsx` and `bank.ts`:
  - `isValidPin(pin: string): boolean` and `pinsMatch(a: string, b: string): boolean`;
  - `PinInput(props: { id: string; label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; invalid?: boolean; describedBy?: string })`;
  - `isValidAccountNumber(v: string): boolean`.
- Produces, in `bank-fields.tsx` and `document-dialog.tsx`:
  - `BankFields(props: { banks: AppBankDto[]; bankCode: string; accountNumber: string; onChange: (next: { bankCode: string; accountNumber: string }) => void })`;
  - `DocumentContent(props: { slug: AppDocumentSlug })`;
  - `DocumentDialog(props: { slug: AppDocumentSlug; open: boolean; onOpenChange: (open: boolean) => void })`.

- [ ] **Step 1: Write the tests**

```ts
it("finds the current step from the API", () => {
  expect(setupProgress(onboarding({ done: ["identity"], next: "pin" }))).toMatchObject({ index: 1, total: 4, current: { key: "pin" } });
  expect(setupProgress(onboarding({ done: ["identity", "pin", "agreements", "bank_account"], next: null })).current).toBeNull();
});
it("validates PINs and account numbers", () => {
  expect(isValidPin("1357")).toBe(true);
  for (const bad of ["135", "13579", "13a7", ""]) expect(isValidPin(bad)).toBe(false);
  expect(pinsMatch("1357", "1357")).toBe(true);
  expect(isValidAccountNumber("0123456789")).toBe(true);
  expect(isValidAccountNumber("012345678")).toBe(false);
});
```

- [ ] **Step 2: Implement the page.**
  - It calls `requireCustomer("/setup")`, then the four reads. Any `null` read renders `AppError`.
  - It passes `INVEST_DOCUMENTS` as `string[]`.
  - `(setup)/layout.tsx` wraps `SetupShell` (wordmark, *Beta* and a *Sign out* text button using `useSignOut`) in `AppProviders` with `live={false}`.
- [ ] **Step 3: Implement `SetupFlow`.** Labels come from the API: `steps[].title`.
  - Phones show `Step {index + 1} of {total} · {current.title}`. Desktop shows the four steps down the left, with finished ones ticked and the current one in heading colour.
  - Only `next_step` is interactive.
  - After each success, call `router.refresh()` and invalidate `appKeys.onboarding`.
  - Once complete, show the `h1` "You're all set", the line "Add money to make your first investment.", and a *Go to home* pill. That pill invalidates every query and links to `/home`.
- [ ] **Step 4: Implement the four steps.** Each ends in a pill submit with a pending state. Errors render the API `message` under the step in a polite live region.
  - **Identity:**
    - Radio cards of `AppTestIdentityDto`: name, then description.
    - The note: "In the beta you choose a test identity instead of giving your BVN."
    - It calls `appApi.identity.verify(id)`. When `verified` is false it shows "This test identity wasn't verified. Choose another one."
  - **PIN:** `PinInput` "Choose a 4-digit PIN", then "Enter it again".
    - When the two don't match: "Those PINs don't match."
    - It calls `appApi.security.setPin({ pin })`.
  - **Documents:**
    - One row per required document: title, `Version {version}`, *Read*, which opens `DocumentDialog`, and an *Accepted* tick when accepted.
    - One `Checkbox`: "I've read and accept these documents".
    - The submit, "Accept and continue", calls `appApi.agreements.accept(rows.map(…))`.
    - On `DOCUMENT_UPDATED`, refetch `appKeys.documents`.
  - **Bank account:**
    - `BankFields`: a Select labelled "Bank" and an "Account number" field (`inputMode="numeric"`, `autoComplete="off"`).
    - Then `PinInput` "Your PIN".
    - It calls `appApi.bankAccount.put(…)`. `NAME_MISMATCH` shows its message.
- [ ] **Step 5: Implement the document view and its modal.**
  - `DocumentContent` queries `appKeys.document(slug)`, then `parseDocument(body)` (use the parser's real export name), then `<DocumentBody blocks headingLevel={3} />` in 16px body text.
  - `DocumentDialog` is a `Dialog` whose `DialogTitle` is the document title and whose description is `Version {version}`, around `DocumentContent`.
  - `document-body.tsx` renders `h{headingLevel}`. Without the prop the landing renders exactly as before.
- [ ] **Step 6: Commit**

```bash
git add "src/app/(setup)" src/components/app/setup src/components/app/pin src/components/app/bank src/components/app/documents src/components/landing/document-body.tsx tests/app-ui/setup.test.ts
git commit -m "feat: add account setup with identity, PIN, documents and bank account"
```

---

### Task 9: Activity and receipts

**Files:**
- Create: `src/app/(app)/activity/{page.tsx,loading.tsx}`, `src/app/(app)/activity/[id]/{page.tsx,loading.tsx}`
- Create: `src/components/app/activity/{activity-page.tsx,activity-row.tsx,activity-groups.ts,receipt-page.tsx}`, `src/components/app/timeline.tsx`
- Create: `src/components/app/money/{transfer-card.tsx,use-countdown.ts}`, `src/hooks/app/use-activity.ts`
- Test: `tests/app-ui/activity-groups.test.ts`

**Interfaces:**
- Consumes:
  - `readActivity` and `readActivityItem` (Task 4);
  - `appApi.activity`, `appApi.beta.completeDeposit` and `appKeys` (Task 5);
  - `KeyValue`, `Money` and `CopyButton` (Task 2);
  - `lagosDayLabel` and `countdown` (Task 1).
- Produces, in `activity-groups.ts`:
  - `groupByLagosDay(items: AppActivityItemDto[], now: Date): { label: string; items: AppActivityItemDto[] }[]`;
  - `isUnpaidTransfer(item: { id: string; status: AppProgress }): boolean`;
  - `depositIdOf(activityId: string): string`;
  - `progressLabel(status: AppProgress): string | null`.
- Produces, as shared parts:
  - `Timeline(props: { steps: AppTimelineStepDto[] })`;
  - `TransferCard(props: { payTo: AppPayToDto; onCompleteBeta: () => Promise<void> })`;
  - `useCountdown(expiresAt: string | null): { text: string; done: boolean } | null`.

- [ ] **Step 1: Write the tests**

```ts
it("groups by Lagos day in feed order", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const groups = groupByLagosDay([item("a", "2026-11-20T08:00:00Z"), item("b", "2026-11-19T23:30:00Z"), item("c", "2026-11-19T09:00:00Z")], now);
  expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([["Today", ["a", "b"]], ["Yesterday", ["c"]]]);
});
it("recognises unpaid transfers and labels progress", () => {
  expect(isUnpaidTransfer({ id: "dep_ck1", status: "waiting" })).toBe(true);
  expect(isUnpaidTransfer({ id: "dep_ck1", status: "completed" })).toBe(false);
  expect(isUnpaidTransfer({ id: "wd_ck1", status: "waiting" })).toBe(false);
  expect(depositIdOf("dep_ck1")).toBe("ck1");
  expect(progressLabel("completed")).toBeNull();
  expect(progressLabel("failed")).toBe("Didn't go through");
  expect(progressLabel("action_needed")).toBe("Needs you");
  expect(progressLabel("waiting")).toBe("Waiting");
  expect(progressLabel("processing")).toBe("Processing");
  expect(progressLabel("cancelled")).toBe("Cancelled");
});
```

- [ ] **Step 2: Implement `/activity`.**
  - The page calls `requireCustomer("/activity")` and `readActivity`. Its metadata title is "Activity · V3ST".
  - `ActivityPage` uses `useInfiniteQuery` on `appKeys.activityList`, with the server page as initial data.
  - Rows are grouped by `groupByLagosDay`. *Show more* appears while there is a `next_cursor`.
  - Empty: "Nothing yet. Money you add, invest or earn shows up here."
  - `ActivityRow` links to `/activity/{id}` and shows:
    - the title, with the subtitle under it;
    - `formatSignedNaira` by `direction`, or "—";
    - `progressLabel` as text, coral for failed.
- [ ] **Step 3: Implement `/activity/[id]`.**
  - The page calls `requireCustomer`; `undefined` from the read calls `notFound()`. Its title is "Receipt · V3ST".
  - `ReceiptPage`:
    - title in `type-app-title`, signed amount in `type-app-amount`, and status;
    - `KeyValue` of `lines`, then `Timeline`;
    - the bank (`{bank_name} ••{account_ending} · {account_name}`) and `bank_reference`;
    - "Support reference {reference}" with `CopyButton`.
  - When `deposit` is present and unpaid, it shows `TransferCard`. Its beta action calls `appApi.beta.completeDeposit(depositIdOf(id))`, then invalidates `appKeys.activityItem(id)`, `["deposit"]`, `appKeys.cash` and `appKeys.home`.
- [ ] **Step 4: Implement `TransferCard`.**
  - It reads "Send exactly {formatNaira(amount_kobo)} to".
  - Then the bank name, the account number with `CopyButton` ("Copy account number"), the account name, and the reference with `CopyButton` ("Copy reference").
  - A countdown: "Waiting for your transfer · {text} left". When it is done: "This transfer window has closed."
  - Then the *Complete this test transfer* outline pill, with the beta line "Beta: this marks your test transfer as paid."
  - `useCountdown` ticks every 1s and clears on unmount. Its text carries `suppressHydrationWarning`.
- [ ] **Step 5: Implement `Timeline`.** It is an ordered list on a 2px signal spine: a filled node when done, hollow when not, and `formatLagosDateTime(at)` when `at` is set.
- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/activity" src/components/app/activity src/components/app/timeline.tsx src/components/app/money src/hooks/app/use-activity.ts tests/app-ui/activity-groups.test.ts
git commit -m "feat: add the activity feed and receipts with test transfer completion"
```

---

### Task 10: Cash, Add money and Withdraw

**Files:**
- Create: `src/app/(app)/cash/{page.tsx,loading.tsx}`
- Create: `src/components/app/cash/{cash-page.tsx,add-money-dialog.tsx,withdraw-dialog.tsx}`
- Create: `src/components/app/money/{amount.ts,amount-field.tsx,money-job.ts,pin-step.tsx,review-list.tsx}`, `src/hooks/app/use-cash.ts`
- Test: `tests/app-ui/amount.test.ts`, `tests/app-ui/money-job.test.ts`

**Interfaces:**
- Consumes:
  - `readCash` and `moneyLimits` (Task 4);
  - `appApi.cash`, `appApi.withdrawals`, `useIdempotencyKey` and `nextIdempotencyKey` (Task 5);
  - `PinInput` (Task 8);
  - `settingsHref` (Task 4).
- Produces, for amounts:
  - `amountCheck(kobo: string | null, l: { minKobo?: string; maxKobo?: string; availableKobo?: string | null }): "empty" | "below_minimum" | "above_maximum" | "above_available" | "ok"`;
  - `amountMessage(check: ReturnType<typeof amountCheck>, l: { minKobo?: string; maxKobo?: string }): string | null`;
  - `AmountField(props: { id: string; label: string; kobo: string | null; onKoboChange: (k: string | null) => void; minKobo?: string; maxKobo?: string; availableKobo?: string | null })`.
- Produces, for money modals:
  - `pinErrorAction(code: string): "clear_pin" | "locked" | "new_price" | "show"`;
  - `PinStep(props: { heading: string; pending: boolean; error: AppApiError | null; onSubmit: (pin: string) => void; onBack: () => void })`;
  - `ReviewList(props: { rows: { label: string; value: React.ReactNode; emphasis?: boolean }[] })`.
- Produces, for cash:
  - `AddMoneyDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; limits: MoneyLimits })`;
  - `WithdrawDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; availableKobo: string | null; bankAccount: AppBankAccountDto })`;
  - `useCashQuery(initial?: AppCashDto)` and `useBankAccountQuery(initial?: AppBankAccountDto | null)`.

- [ ] **Step 1: Write the tests**

```ts
const limits = { minKobo: "100000", maxKobo: "500000000" };
it("checks amounts against policy and available cash", () => {
  expect(amountCheck(null, limits)).toBe("empty");
  expect(amountCheck("99999", limits)).toBe("below_minimum");
  expect(amountCheck("500000001", limits)).toBe("above_maximum");
  expect(amountCheck("300000", { availableKobo: "200000" })).toBe("above_available");
  expect(amountCheck("100000", limits)).toBe("ok");
  expect(amountMessage("below_minimum", limits)).toBe("The minimum is ₦1,000.");
  expect(amountMessage("above_maximum", limits)).toBe("The most you can move at once is ₦5,000,000.");
  expect(amountMessage("above_available", {})).toBe("That's more than your available cash.");
  expect(amountMessage("empty", limits)).toBe("Enter an amount.");
});
it("branches on error codes only", () => {
  expect(pinErrorAction("PIN_INCORRECT")).toBe("clear_pin");
  expect(pinErrorAction("PIN_LOCKED")).toBe("locked");
  expect(pinErrorAction("PRICE_CHANGED")).toBe("new_price");
  expect(pinErrorAction("NOT_ENOUGH_CASH")).toBe("show");
});
```

`money-job.test.ts` also imports `nextIdempotencyKey` and re-asserts its three Task 5 cases as the Review Focus 1 anchor.

- [ ] **Step 2: Implement `AmountField`.**
  - The label sits above a field in `type-app-amount` with a fixed `₦` prefix, `inputMode="decimal"` and `autoComplete="off"`.
  - It parses with `parseNairaInput`.
  - It shows "Minimum {formatNaira(minKobo)}" as a hint, and `amountMessage` once the field is touched. Both are wired through `aria-describedby`.
- [ ] **Step 3: Implement `PinStep` and `ReviewList`.**
  - `PinStep` shows the heading, then `PinInput` "Your PIN", then the *Confirm* pill (disabled until `isValidPin`), then *Back*.
  - It handles errors through `pinErrorAction`:
    - `clear_pin` clears the input and shows the message;
    - `locked` shows the message plus a *Reset your PIN* link to `settingsHref("reset-pin")`;
    - `new_price` calls `onBack()`;
    - `show` shows the message.
  - `ReviewList` is a `KeyValue` with emphasised rows in heading colour.
- [ ] **Step 4: Implement `AddMoneyDialog`.**
  - Title "Add money", with the description "You'll get bank details to send a transfer from your own account."
  - Its only step is `AmountField` "Amount", with limits `depositMinKobo` and `depositMaxKobo`.
  - *Continue* calls `appApi.cash.createDeposit(kobo, key)`, then closes and runs `router.push("/activity/dep_" + deposit.id)`.
  - Errors, including `ADD_MONEY_PAUSED`, render their message.
- [ ] **Step 5: Implement `WithdrawDialog`.**
  - Title "Withdraw".
  - **Amount:** `AmountField` with `availableKobo`, plus an *All available* text button.
  - **Review:** `appApi.withdrawals.preview(kobo)`, then `ReviewList`:
    - Amount;
    - Fee;
    - You receive (emphasised);
    - To: `{bank_name} ••{account_ending} · {account_name}`.

    Then "Held for {countdown}" for `expires_at`, and `BetaLine`. When expired, it shows *Get a new preview*.
  - **PIN:** `appApi.withdrawals.create({ preview_id, pin }, key)`, then `router.push("/activity/wd_" + w.id)`.
  - Use `nextIdempotencyKey` for every key change.
- [ ] **Step 6: Implement `/cash`.**
  - The page calls `requireCustomer("/cash")`, `readCash` and `moneyLimits()`. Its title is "Cash · V3ST".
  - `CashPage` shows:
    - "Available" in `type-app-figure`;
    - a `KeyValue` of On hold and Incoming (null-aware) and "Updated {formatLagosTime(as_of)}";
    - the bank summary, or "No bank account yet";
    - *See all activity*.
  - Its actions are inside `SetupGate`:
    - *Add money* (filled) opens `AddMoneyDialog`.
    - *Withdraw* (outline) opens `WithdrawDialog`. Without a bank account it becomes a link, *Add your bank account*, to `settingsHref("bank")`.
- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/cash" src/components/app/cash src/components/app/money src/hooks/app/use-cash.ts tests/app-ui/amount.test.ts tests/app-ui/money-job.test.ts
git commit -m "feat: add the cash page with add money and withdraw"
```

---

### Task 11: Home, the money line

**Files:**
- Create: `src/app/(app)/home/{page.tsx,loading.tsx}`
- Create: `src/components/app/home/{home-page.tsx,total.ts,total-band.tsx,line-model.ts,money-line.tsx,line-row.tsx,now-marker.tsx,holdings-list.tsx}`
- Create: `src/hooks/app/use-home.ts`
- Test: `tests/app-ui/line-model.test.ts`, `tests/app-ui/total.test.ts`

**Interfaces:**
- Consumes:
  - `readHome` and `moneyLimits` (Task 4);
  - `useNow` and `appKeys` (Task 5);
  - `AddMoneyDialog` (Task 10);
  - `StockMark`, `priceCaption` and `returnText` from Task 12. Create `stock-mark.tsx` and `price-status.ts` here if Task 12 hasn't run yet; Task 12 owns their tests.
- Produces, in `line-model.ts`:
  - `LineTone = "waiting" | "processing" | "action" | "done" | "failed" | "ended"`;
  - `LineItem = { key: string; title: string; detail: string; amountText: string | null; tone: LineTone; href: string; due: string | null }`;
  - `MoneyLineModel = { upcoming: LineItem[]; earlier: LineItem[] }`;
  - `buildMoneyLine(home: AppHomeDto, activity: AppActivityItemDto[], now: Date): MoneyLineModel`.
- Produces, in `total.ts`: `totalLines(home: AppHomeDto): { figure: string; note: string | null; change: string | null }`.

- [ ] **Step 1: Write the tests.** Write fixture builders `home(overrides)`, `order(overrides)` and `act(overrides)` with realistic defaults, following `AppHomeDto`, `AppOrderDto` and `AppActivityItemDto`.

```ts
it("is empty for a fresh account", () => {
  expect(buildMoneyLine(home(), [], NOW)).toEqual({ upcoming: [], earlier: [] });
});
it("puts action items nearest Now", () => {
  const line = buildMoneyLine(home({ action_items: [setupItem] }), [], NOW);
  expect(line.upcoming.at(-1)).toMatchObject({ title: "Finish setting up", tone: "action", href: "/setup" });
});
it("shows the Friday payout first when there is Earn value", () => {
  const h = home({ earn_kobo: "477040", earnings: { this_week_kobo: "124000", next_payout_on: "2026-11-20", choice: "payout" } });
  expect(buildMoneyLine(h, [], NOW).upcoming[0]).toMatchObject({
    title: "Friday payout", detail: "₦1,240 so far this week · paid to your bank", href: "/earnings", tone: "waiting",
  });
});
it("sorts in-progress items by deadline, soonest nearest Now, and merges duplicates", () => {
  const a = order({ id: "A", status: "waiting_for_price", valid_until: "2026-11-22T08:40:00Z" });
  const b = order({ id: "B", status: "waiting_for_payment", pay_to: payTo("2026-11-19T13:44:00Z") });
  const h = home({ open_orders: [b, a], action_items: [{ kind: "finish_transfer", title: "Finish your transfer", detail: "Send ₦20,000 to buy Tesla.", link: "/orders/B" }] });
  const line = buildMoneyLine(h, [act({ id: "ord_A", status: "processing" })], NOW);
  expect(line.upcoming.map((i) => i.key)).toEqual(["order:A", "order:B"]);
  expect(line.upcoming[0]).toMatchObject({ title: "Buy Tesla", href: "/orders/A" });
});
it("keeps five finished items below Now, with failures marked", () => {
  const done = Array.from({ length: 7 }, (_, i) => act({ id: `dep_${i}`, status: i === 0 ? "failed" : "completed" }));
  const line = buildMoneyLine(home(), done, NOW);
  expect(line.earlier.map((i) => i.key)).toEqual(["activity:dep_0", "activity:dep_1", "activity:dep_2", "activity:dep_3", "activity:dep_4"]);
  expect(line.earlier[0]!.tone).toBe("failed");
});
// tests/app-ui/total.test.ts
it("never shows ₦0 for an unknown total", () => {
  expect(totalLines(home({ total_kobo: null, total_status: "unavailable" }))).toEqual({ figure: "—", note: "Your total isn't available right now.", change: null });
  expect(totalLines(home({ total_kobo: "18425040", total_status: "partial", change_24h_kobo: "231015" }))).toEqual({
    figure: "₦184,250.40", note: "Some prices are unavailable, so this total leaves them out.", change: "+₦2,310.15 today",
  });
  expect(totalLines(home({ total_kobo: "18425040", change_24h_kobo: "-231015" })).change).toBe("−₦2,310.15 today");
});
```

- [ ] **Step 2: Implement `buildMoneyLine`.** Follow spec §Home: the money line exactly.
  - **Keys:** `friday`, `order:{id}`, `activity:{id}`, `action:{kind}:{link}`.
  - **Friday node:**
    - It shows when `earn_kobo` is non-null and not `"0"`, or when this week is above `0n`.
    - Its detail is `{formatNaira(this_week)} so far this week · paid to your bank`, or `… · reinvested`.
    - With `unset` the detail is "Choose what happens to your earnings". A null `this_week_kobo` gives "This week's earnings aren't available right now".
    - Its tone is `waiting`, and its `due` is `{next_payout_on}T07:00:00Z`.
  - **Order rows:**
    - Title `Buy {stock.name}` or `Sell {stock.name}`; detail is the order's `title`.
    - `waiting_for_price` appends ` · until {formatLagosDateTime(valid_until)}`.
    - `amountText` is `formatNaira(amount_kobo)`.
    - Waiting statuses take the tone `waiting`; `processing` takes `processing`.
  - **Activity rows:** title, `subtitle`, and `formatSignedNaira`.
  - **Order:**
    1. The Friday node first.
    2. In-progress items next, sorted by `due` descending, with null last.
    3. Action items last: `finish_transfer` items whose `link` matches a listed order are dropped.

    Earlier items stay in feed order.
- [ ] **Step 3: Implement the components**, matching the chosen sketch's first viewport.
  - **`TotalBand`:**
    - "Total value" in 13px muted, above the figure in `type-app-figure`.
    - The change in gain or loss, then "Cash {available} available".
    - The pills, in `SetupGate`: *Add money* (filled) opens `AddMoneyDialog`; *Invest* (outline) links to `/stocks`.
    - Then `BetaLine` with `home.beta.notice`.
  - **`MoneyLine`:**
    - A 2px signal spine in a 44px left gutter: dashed above the marker, solid below.
    - The group labels "Coming up" and "Earlier" are 13px muted list labels, not headings.
    - Then *See all activity*, linking to `/activity`.
    - **Empty states:**
      - With no items at all: *Earlier* reads "Your first transfer will show up here."
      - With setup complete and no upcoming items: under *Now*, "Add money to get started." with an *Add money* link.
  - **`NowMarker`:** `Now · {formatLagosTime(now)}` in a raised pill with a signal border and gain text, on a signal hairline. It uses `useNow(60_000)` and a `<time>` element.
  - **`LineRow`:**
    - The node for its tone: a gain halo `0 0 0 4px rgb(61 220 151 / .14)`, with `processing` pulsing every 2s under `motion-safe`.
    - Then the title and amount, then the detail.
    - The whole row is a link with a 44px minimum height.
  - **The crossing:**
    - Rows render with `motion` `layout` and `layoutId={item.key}`, so an item moving from *Coming up* to *Earlier* slides across *Now* in 240ms ease-out.
    - Under `useReducedMotion()` there is no layout animation, only a 200ms opacity fade.
  - **`HoldingsList`:**
    - The heading "Your stocks".
    - Each row: `StockMark`, name, `formatShares`, `Money` value (or "Price unavailable"), `returnText` in gain or loss, and the `priceCaption` for delayed prices. It links to `/stocks/{id}`.
    - Empty: "You don't own any stocks yet." with a *Find a stock* link.
    - Under it, when `earn_kobo` is non-null and not `"0"`, an Earn row: "Earn", `Money` of `earn_kobo`, linking to `/earn`.
- [ ] **Step 4: Implement the page.**
  - It calls `requireCustomer("/home")`, then `readHome`; null renders `AppError`. Its title is "Home · V3ST".
  - `HomePage` uses `useHomeQuery(initial.home)` and `useActivityPreviewQuery(initial.activity)` (key `appKeys.activityPreview`, limit 10).
  - It derives the line with `buildMoneyLine(home, activity.items, useNow(60_000))`.
- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/home" src/components/app/home src/hooks/app/use-home.ts tests/app-ui/line-model.test.ts tests/app-ui/total.test.ts
git commit -m "feat: add home as one live line of the customer's money"
```

---

### Task 12: Stocks and stock detail

**Files:**
- Create: `src/app/(app)/stocks/{page.tsx,loading.tsx}`, `src/app/(app)/stocks/[id]/{page.tsx,loading.tsx}`
- Create: `src/components/app/stocks/{stocks-page.tsx,stock-row.tsx,stock-mark.tsx,price-status.ts,stock-page.tsx,price-chart.tsx,chart-path.ts,watchlist-button.tsx}`
- Create: `src/hooks/app/use-stocks.ts`
- Test: `tests/app-ui/price-status.test.ts`, `tests/app-ui/chart-path.test.ts`

**Interfaces:**
- Consumes:
  - `readStocks`, `readStock` and `readChart` (Task 4);
  - `appApi.stocks` and `appApi.watchlist` (Task 5);
  - `DocumentDialog` (Task 8).
- Produces, in `price-status.ts`:
  - `priceCaption(status: AppPriceStatus, asOf: string | null, now: Date): string | null`;
  - `tradingChip(trading: AppTrading): string | null`;
  - `returnText(bps: number | null): string | null`.
- Produces, in `chart-path.ts`:
  - `chartPath(points: { t: string; price_kobo: string }[], width: number, height: number): { d: string; first: string; last: string; min: string; max: string } | null`.
- Produces components:
  - `StockMark(props: { logoPath: string | null; name: string; size?: 32 | 40 | 48 })`;
  - `StockPage(props: { stock: AppStockDetailDto; chart: AppChartDto | null; limits: MoneyLimits })`.
- Produces hooks:
  - `useStocksQuery(q: { q?: string; watchlist?: boolean }, initial?: AppStockListItemDto[])`;
  - `useStockQuery(id, initial)` and `useChartQuery(id, range, initial?)`.

- [ ] **Step 1: Write the tests**

```ts
const now = new Date("2026-11-19T15:00:00Z");
it("captions delayed and missing prices", () => {
  expect(priceCaption("live", "2026-11-19T14:59:00Z", now)).toBeNull();
  expect(priceCaption("delayed", "2026-11-19T12:40:00Z", now)).toBe("Delayed · 13:40");
  expect(priceCaption("delayed", "2026-11-18T20:00:00Z", now)).toBe("Delayed · Wed 18 Nov, 21:00");
  expect(priceCaption("unavailable", null, now)).toBe("Price unavailable");
  expect(tradingChip("available")).toBeNull();
  expect(tradingChip("prices_updating")).toBe("Prices updating");
  expect(tradingChip("paused")).toBe("Trading paused");
  expect(returnText(342)).toBe("+3.42%");
  expect(returnText(null)).toBeNull();
});
it("draws a chart only from two or more points", () => {
  const pts = [{ t: "2026-11-19T08:00:00Z", price_kobo: "100000" }, { t: "2026-11-19T12:00:00Z", price_kobo: "200000" }];
  expect(chartPath(pts, 300, 100)).toEqual({ d: "M0,92 L300,8", first: "100000", last: "200000", min: "100000", max: "200000" });
  expect(chartPath([pts[0]!], 300, 100)).toBeNull();
  expect(chartPath([pts[0]!, { t: "2026-11-19T12:00:00Z", price_kobo: "100000" }], 300, 100)!.d).toBe("M0,50 L300,50");
});
```

- [ ] **Step 2: Implement `chartPath`.**
  - x is linear in time from 0 to `width`.
  - y runs from `height - 8%` (the minimum) to `8%` (the maximum).
  - A flat series sits at `height / 2`.
  - Coordinates round to 0.1 and drop a trailing `.0`.
  - Use `Number(BigInt)` only for plotting, never for displayed figures.
- [ ] **Step 3: Implement `/stocks`.** The page reads `q` and `watchlist` from `searchParams`. Its title is "Stocks · V3ST".
  - **Controls:**
    - A search field labelled "Search stocks", with the placeholder "Apple, NVIDIA…", debounced 250ms.
    - The existing `Tabs`: *All* and *Watchlist*.
    - Both write the URL with `window.history.replaceState`, as fluid does.
  - **The list:** the caption "Beta prices in naira", then `StockRow`s linking to `/stocks/{id}`. Each shows:
    - the mark, name and ticker;
    - `formatNaira(price_kobo)`, or "—";
    - `priceCaption`;
    - `returnText(change_24h_bps)` in gain or loss;
    - `tradingChip` as a `Badge variant="secondary"`.
  - **Empty states:**
    - A search with no results reads `No stocks match "{q}".`
    - An empty watchlist reads "Your watchlist is empty. Tap the star on a stock to add it."
- [ ] **Step 4: Implement `/stocks/[id]`.**
  - The page calls `requireCustomer`, `readStock` (`undefined` calls `notFound()`), `readChart(id, "1D")` and `moneyLimits()`. Its title is "Stock · V3ST".
  - **The header:** `PageHeader` with back *Stocks*, `StockMark`, name and ticker, and `WatchlistButton`.
    - The button has `aria-pressed`, with the names "Add to watchlist" and "Remove from watchlist".
    - It uses Phosphor `Star`, with `weight="fill"` when on.
    - It invalidates `["stocks"]` and `appKeys.stock(id)`.
  - **Price:** the price in `type-app-figure`, then the change, then `priceCaption`.
  - **Chart:**
    - Range `Tabs` labelled "Price range" over 1D, 1W, 1M, 3M, 1Y and ALL.
    - `PriceChart` is an SVG, 100% wide and 160px tall, drawn in gain when the range change is zero or above and loss otherwise.
    - It has `role="img"` with the label `Price from {first} to {last}`, and a range-change line.
    - `status: "not_enough_data"` reads "Not enough price history yet for this range." and draws no line.
    - A failed chart read reads "The chart isn't available right now."
  - **The rest of the page:**
    - Your position: shares and value.
    - The action area.
    - About, with the summary.
    - *How your shares are held*, which opens `DocumentDialog` "how-shares-are-held".
    - When `earn_product_id` is set, the link `Earn from {name} trading fees`, to `/earn/{earn_product_id}`.
  - **Actions:** Task 13 wires the pills; here, render them disabled.
    - With `trading === "paused"`, both are disabled with "Trading is paused for a short time. Your money is safe."
    - With `prices_updating`: "Prices are updating. Your order goes through when they do."
- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/stocks" src/components/app/stocks src/hooks/app/use-stocks.ts tests/app-ui/price-status.test.ts tests/app-ui/chart-path.test.ts
git commit -m "feat: add stock search, watchlist and the stock page with its chart"
```

---

### Task 13: Trade modal and the order page

**Files:**
- Create: `src/components/app/trade/{trade.ts,trade-dialog.tsx}`
- Create: `src/app/(app)/orders/[id]/{page.tsx,loading.tsx}`, `src/components/app/orders/{order-page.tsx,cancel-order-dialog.tsx}`, `src/hooks/app/use-orders.ts`
- Modify: `src/components/app/stocks/stock-page.tsx` (wire *Buy* and *Sell*)
- Test: `tests/app-ui/trade.test.ts`

**Interfaces:**
- Consumes:
  - `appApi.orders`, `appApi.beta.completeOrderTransfer` and `useIdempotencyKey`/`nextIdempotencyKey` (Task 5);
  - `AmountField`, `PinStep`, `ReviewList`, `pinErrorAction` and `useCashQuery` (Task 10);
  - `TransferCard` and `Timeline` (Task 9);
  - `readOrder` (Task 4).
- Produces, in `trade.ts`:
  - `executesSentence(p: AppOrderPreviewDto): string`;
  - `defaultPayWith(availableKobo: string | null, amountKobo: string | null): "cash" | "bank_transfer"`;
  - `previewExpired(expiresAt: string, now: Date): boolean`;
  - `tradeTitle(side: "buy" | "sell", stockName: string): string`.
- Produces components:
  - `TradeDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; side: "buy" | "sell"; stock: AppStockDetailDto; minKobo: string })`;
  - `CancelOrderDialog(props: { order: AppOrderDto; open: boolean; onOpenChange: (o: boolean) => void })`.

- [ ] **Step 1: Write the tests**

```ts
it("says when each order goes through", () => {
  expect(executesSentence(preview({ executes: "now" }))).toBe("Goes through now.");
  expect(executesSentence(preview({ executes: "when_prices_update", price_limit_kobo: "18740000", order_valid_until: "2026-11-22T08:40:00Z" })))
    .toBe("Goes through when prices update, never above ₦187,400. Valid until Sun 22 Nov, 09:40.");
  expect(executesSentence(preview({ executes: "after_your_transfer" })))
    .toBe("Goes through after your transfer arrives. You'll see the bank details next.");
});
it("defaults to cash only when it covers the amount", () => {
  expect(defaultPayWith("500000", "100000")).toBe("cash");
  expect(defaultPayWith("50000", "100000")).toBe("bank_transfer");
  expect(defaultPayWith(null, "100000")).toBe("bank_transfer");
});
it("knows when a preview has expired", () => {
  expect(previewExpired("2026-11-19T12:00:00Z", new Date("2026-11-19T12:00:01Z"))).toBe(true);
  expect(previewExpired("2026-11-19T12:00:00Z", new Date("2026-11-19T11:59:59Z"))).toBe(false);
  expect(tradeTitle("sell", "Apple")).toBe("Sell Apple");
});
```

- [ ] **Step 2: Implement `TradeDialog`.** Its title is `tradeTitle(side, stock.name)`, and it has the three steps of spec §Modals.
  - **Amount:**
    - `AmountField` with `minKobo`.
    - A buy shows "Cash available {formatNaira(cash)}" from `useCashQuery`, and a `RadioGroup` labelled "Pay with" offering *Cash* and *Bank transfer*, defaulting by `defaultPayWith`.
    - A sell offers a *Sell all* `Checkbox`, which disables the amount.
    - Build the body: `const body: OrderPreviewBody = { stock_id: stock.id, side }`, then assign `amount_kobo`, `sell_all` and `pay_with` with `if` statements.
  - **Review:**
    - `ReviewList`:
      - Amount;
      - "About {formatShares(shares_micro)}";
      - Price;
      - each fee line, as `formatNaira(kobo)` or its `note`;
      - "You receive", for sells.
    - Then `executesSentence`, each of the preview's `notes`, "Price held for {countdown}" and `BetaLine`.
    - When expired, or after `new_price`, show "This price expired." with *Get a new price*. That re-runs the preview and renews the key through `nextIdempotencyKey(key, "new_preview", make)`.
    - The pill reads *Confirm with PIN*.
  - **PIN:** `PinStep` with the heading "Confirm with your PIN".
    - It calls `appApi.orders.place({ preview_id, pin }, key)`.
    - On success: close, then `router.push("/orders/" + order.id)`.
  - **Wiring:** `stock-page.tsx` opens it from *Buy*, or from *Sell* when there is a position, inside `SetupGate label="Finish setting up to invest"`. It passes `minKobo={limits.buyMinKobo}`.
- [ ] **Step 3: Implement `/orders/[id]`.**
  - The page calls `requireCustomer`, then `readOrder`; `undefined` calls `notFound()`. Its title is "Order · V3ST".
  - **`OrderPage`** uses `useOrderQuery(id, initial)` and shows:
    - `PageHeader`: `tradeTitle`, with back to `/stocks/{stock.id}` labelled with the stock name;
    - the order's `title` in `type-app-heading`, with its `detail` under it;
    - a `KeyValue` of Amount, Shares (`formatShares`), Price, Placed (`formatLagosDateTime(created_at)`) and, when set, Completed;
    - the `Timeline`;
    - "Support reference {reference}" with `CopyButton`.
  - **While `waiting_for_payment` with `pay_to`:** `TransferCard`. Its beta action calls `appApi.beta.completeOrderTransfer(id)`, then invalidates `appKeys.order(id)`, `appKeys.home` and `appKeys.cash`.
  - **When `valid_until` is set:** the line `Valid until {formatLagosDateTime(valid_until)}`.
  - **While `can_cancel`:** a *Cancel order* outline pill opens `CancelOrderDialog`.
    - Its title is "Cancel this order?", with the description "Your cash is released." for buys and "Your shares are released." for sells.
    - The actions are *Cancel order* and *Keep order*.
    - It calls `appApi.orders.cancel(id)`. `ALREADY_STARTED` renders its message.
- [ ] **Step 4: Commit**

```bash
git add src/components/app/trade src/components/app/orders "src/app/(app)/orders" src/hooks/app/use-orders.ts src/components/app/stocks/stock-page.tsx tests/app-ui/trade.test.ts
git commit -m "feat: add buying and selling with PIN confirmation and order tracking"
```

---

### Task 14: Earn

**Files:**
- Create: `src/app/(app)/earn/{page.tsx,loading.tsx}`, `src/app/(app)/earn/[id]/{page.tsx,loading.tsx}`
- Create: `src/components/app/earn/{earn.ts,earn-list-page.tsx,earn-product-page.tsx,join-earn-dialog.tsx,leave-earn-dialog.tsx}`, `src/hooks/app/use-earn.ts`
- Test: `tests/app-ui/earn.test.ts`

**Interfaces:**
- Consumes:
  - `readEarnProducts`, `readEarnProduct` and `readEarnings` (Task 4);
  - `appApi.earn` (Task 5);
  - `AmountField`, `PinStep` and `ReviewList` (Task 10);
  - `DocumentContent` and `DocumentDialog` (Task 8).
- Produces, in `earn.ts`:
  - `positionView(position: AppEarnPositionDto | null, available: boolean): { canJoin: boolean; canLeave: boolean; statusText: string | null }`;
  - `joinReady(acceptedRisk: boolean, pin: string): boolean`.

- [ ] **Step 1: Write the tests**

```ts
it("offers only the actions a position allows", () => {
  expect(positionView(null, true)).toEqual({ canJoin: true, canLeave: false, statusText: null });
  expect(positionView(null, false)).toEqual({ canJoin: false, canLeave: false, statusText: "Not available right now" });
  expect(positionView(pos("active"), true)).toEqual({ canJoin: false, canLeave: true, statusText: "Active" });
  expect(positionView(pos("processing"), true).statusText).toBe("Joining. This can take a few minutes.");
  expect(positionView(pos("withdrawing"), true).statusText).toBe("Withdrawing. This can take a few minutes.");
  expect(positionView(pos("withdrawn"), true)).toEqual({ canJoin: true, canLeave: false, statusText: "Withdrawn" });
  expect(positionView(pos("action_needed"), true)).toEqual({ canJoin: false, canLeave: false, statusText: "Needs a check before it can continue." });
});
it("needs the risks accepted and a PIN before joining", () => {
  expect(joinReady(false, "1357")).toBe(false);
  expect(joinReady(true, "135")).toBe(false);
  expect(joinReady(true, "1357")).toBe(true);
});
```

- [ ] **Step 2: Implement `/earn`.** The page reads `readEarnProducts` and `readEarnings`. Its title is "Earn · V3ST".
  - The `h1` reads "Earn", over the line "Earn from trading fees on stocks you choose. You can get back less than you put in."
  - Then one card per product, linking to `/earn/{id}`: `title`, `summary`, `From {formatNaira(minimum_kobo)}`, and `positionView(...).statusText` as a `Badge`.
  - Once the customer has earnings or has made a choice (`total_earned_kobo !== "0"`, or `choice !== "unset"`): *See your earnings*, linking to `/earnings`.
  - Empty: "Earn isn't available right now."
- [ ] **Step 3: Implement `/earn/[id]`.** `undefined` calls `notFound()`; the title is "Earn · V3ST". The page shows:
  - `PageHeader` with back *Earn*;
  - the `summary`;
  - "How it works", from `how_it_works`;
  - "Risks", from `risks`, in full;
  - *Read the full Earn risks*, which opens `DocumentDialog` "earn-risks";
  - the minimum;
  - the position card: added, value (`Money`, null-aware), earned, and `Joined {formatLagosDay(joined_at)}`.

  Actions follow `positionView`, inside `SetupGate`: *Join* opens `JoinEarnDialog`, and *Withdraw* opens `LeaveEarnDialog`.
- [ ] **Step 4: Implement `JoinEarnDialog`.** Its title is the product title.
  1. **Amount:** `AmountField`, with minimum `product.minimum_kobo`.
  2. **Review:** `appApi.earn.preview(id, kobo)`, then `ReviewList` of You add, `In {stock.name}` (`formatShares(split.shares_micro)`), In cash (`split.cash_kobo`) and the fee lines. Then the `automation` sentence, a held countdown and `BetaLine`.
  3. **Risks and PIN:**
     - `DocumentContent slug="earn-risks"` in a `max-h-[40dvh]` scroll region with `tabIndex={0}` and the label "Earn risks".
     - The `Checkbox` "I've read and accept the Earn risks (version {risk_document.version})".
     - Then `PinInput`.
     - *Confirm* stays disabled until `joinReady`. It calls `appApi.earn.join(id, { preview_id, pin, accepted_risk_version: risk_document.version }, key)`.
     - On success: close, then invalidate `["earn"]` and `appKeys.home`.

  A third modal is never opened on top of this one.
- [ ] **Step 5: Implement `LeaveEarnDialog`.** Its title is "Withdraw from Earn".
  1. On open it calls `appApi.earn.withdrawPreview(position.id)`. `ReviewList` shows "You get back" (`formatShares` of `you_get.shares_micro` of `{stock.name}`, plus `you_get.cash_kobo`) and "Worth about" (`value_kobo`, null-aware).
  2. Then `PinStep`, which calls `appApi.earn.withdraw(position.id, { preview_id, pin }, key)`.
  3. Close and invalidate.
- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/earn" src/components/app/earn src/hooks/app/use-earn.ts tests/app-ui/earn.test.ts
git commit -m "feat: add Earn products with joining and withdrawing"
```

---

### Task 15: Earnings

**Files:**
- Create: `src/app/(app)/earnings/{page.tsx,loading.tsx}`, `src/components/app/earnings/{earnings.ts,earnings-page.tsx,earnings-choice-dialog.tsx}`, `src/hooks/app/use-earnings.ts`
- Test: `tests/app-ui/earnings.test.ts`

**Interfaces:**
- Consumes:
  - `readEarnings` (Task 4);
  - `appApi.earnings` and `appApi.stocks.list` (Task 5);
  - `PinStep` (Task 10).
- Produces, in `earnings.ts`:
  - `outcomeLabel(o: AppEarningsWeekDto["outcome"]): string`;
  - `choiceLine(e: AppEarningsDto): string | null`;
  - `minimumPayoutLine(kobo: string): string`.

- [ ] **Step 1: Write the tests**

```ts
it("names weekly outcomes and the choice", () => {
  expect(["pending", "paid", "reinvested", "rolled_over", "mixed"].map(outcomeLabel))
    .toEqual(["Pending", "Paid to your bank", "Reinvested", "Rolled over", "Part paid, part reinvested"]);
  expect(choiceLine(earnings({ choice: "payout" }))).toBe("Paid to your bank on Fridays");
  expect(choiceLine(earnings({ choice: "reinvest", reinvest_stock: ref("Apple") }))).toBe("Reinvested in Apple");
  expect(choiceLine(earnings({ choice: "unset" }))).toBeNull();
  expect(minimumPayoutLine("200000")).toBe("Payouts start at ₦2,000. Smaller amounts roll over to the next week.");
});
```

- [ ] **Step 2: Implement the page.** Its title is "Earnings · V3ST". It shows:
  - "Total earned" in `type-app-figure`;
  - "This week {formatNaira(this_week_kobo)}";
  - "Next payout {formatLagosDay(next_payout_on)}";
  - the choice line with *Change*, or the filled pill *Choose what happens to your earnings* when `unset`;
  - `minimumPayoutLine`;
  - each of the API's `limits`;
  - the weeks list: `Week of {formatLagosDay(week_of)}`, `Money` earned, `outcomeLabel` and `detail`.

  Empty (`weeks` empty and total `"0"`): "No earnings yet. Earn pays out on Fridays when there's something to pay." with a *See Earn* link. No copy promises income every Friday or a bank arrival time.
- [ ] **Step 3: Implement `EarningsChoiceDialog`.** Its title is "What happens to your earnings".
  1. **Choice:** a `RadioGroup` of "Pay me on Fridays" and "Reinvest in a stock". *Reinvest* adds a `Select` labelled "Stock", listing `appApi.stocks.list({})` without paused stocks. Then the API's `limits`.
  2. **PIN:** `PinStep`. The body is built with `if`: `{ choice, pin }`, plus `stock_id` only for reinvest. It calls `appApi.earnings.setPreference(body)`.
  3. Close and invalidate `appKeys.earnings` and `appKeys.home`.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/earnings" src/components/app/earnings src/hooks/app/use-earnings.ts tests/app-ui/earnings.test.ts
git commit -m "feat: add earnings with the Friday payout or reinvest choice"
```

---

### Task 16: Settings and its modals

**Files:**
- Create: `src/app/(app)/settings/{page.tsx,loading.tsx}`, `src/app/(app)/settings/bank/page.tsx`, `src/app/(app)/settings/automations/page.tsx`
- Create: `src/components/app/settings/{settings.ts,settings-page.tsx,name-dialog.tsx,bank-dialog.tsx,change-pin-dialog.tsx,reset-pin-dialog.tsx,privy-reset.tsx,devices-dialog.tsx,automations-dialog.tsx}`, `src/hooks/app/use-settings.ts`
- Test: `tests/app-ui/settings.test.ts`

**Interfaces:**
- Consumes:
  - `readSettings`, `readBanks` and `parseSettingsOpen` (Task 4);
  - `appApi.profile`, `appApi.bankAccount`, `appApi.security`, `appApi.automations` and `appApi.beta.privyTokens` (Task 5);
  - `PinInput` and `BankFields` (Task 8);
  - `PinStep` (Task 10);
  - `DocumentDialog` (Task 8);
  - `useSignOut` (Task 7).
- Produces, in `settings.ts`:
  - `identityLine(p: AppProfileDto): string`;
  - `automationLine(a: AppAutomationDto): string`;
  - `isValidPreferredName(name: string): boolean`;
  - `PREFERRED_NAME_SOURCE`, which must equal `PREFERRED_NAME_PATTERN.source` from the backend.
- Produces: `SettingsPage(props: { profile: AppProfileDto; automations: AppAutomationDto[]; documents: AppDocumentSummaryDto[]; banks: AppBankDto[]; open: SettingsModal | null; privy: { mode: PrivyMode; appId: string | null } })`.

- [ ] **Step 1: Write the tests**

```ts
import { PREFERRED_NAME_PATTERN } from "@/backend/services/app/profile"; // test-only server import
it("describes identity and automations", () => {
  expect(identityLine(profile({ identity: { verified: true, level: "standard" } }))).toBe("Verified");
  expect(identityLine(profile({ identity: { verified: true, level: "higher" } }))).toBe("Verified · higher limits");
  expect(identityLine(profile({ identity: { verified: false, level: null } }))).toBe("Not verified yet");
  expect(automationLine(auto({ active: true, needs_renewal: true, expires_at: "2026-12-03T10:00:00Z" }))).toBe("Renew by Thu 3 Dec");
  expect(automationLine(auto({ active: true, needs_renewal: false, expires_at: "2026-12-03T10:00:00Z" }))).toBe("On until Thu 3 Dec");
  expect(automationLine(auto({ active: false }))).toBe("Off");
});
it("validates preferred names exactly as the API does", () => {
  expect(PREFERRED_NAME_SOURCE).toBe(PREFERRED_NAME_PATTERN.source);
  expect(isValidPreferredName("Ada")).toBe(true);
  expect(isValidPreferredName("4da")).toBe(false);
});
```

- [ ] **Step 2: Implement the page and redirects.**
  - The page calls `requireCustomer("/settings")`, `readSettings`, `readBanks` and `parseSettingsOpen(searchParams.open)`. It passes `{ mode: env.PRIVY_MODE, appId: env.PRIVY_APP_ID ?? null }` and has the title "Settings · V3ST".
  - `settings/bank/page.tsx` does `redirect("/settings?open=bank")`, and `settings/automations/page.tsx` does `redirect("/settings?open=automations")`.
- [ ] **Step 3: Implement `SettingsPage`.** Groups are cards, never nested, and each row is a 44px+ button that opens its modal. One `useState<SettingsModal | null>(open)` holds the open modal. Closing a modal that the URL opened calls `router.replace("/settings")`.
  - **Profile:** `preferred_name ?? first_name`, then the email, then `identityLine`. Row *Change name*.
  - **Bank account:** `{bank_name} ••{account_ending} · {account_name}`, or *Add a bank account*.
  - **Security:** *Change PIN*, *Forgot your PIN?* (`reset-pin`) and *Devices*.
  - **Automatic actions:** a count, with a `Badge` "Needs renewal" when any needs renewal.
  - **Documents:** one row per document (title and version), opening `DocumentDialog`.
  - **Footer:** the *Sign out* outline pill (`useSignOut`), then `BetaLine`.
- [ ] **Step 4: Implement the modals.** One at a time, each through the Task 2 `Dialog`.
  - **Name** ("Your name"):
    - An `Input` labelled "What should we call you?", with the hint "Letters only, up to 40 characters. Leave it empty to use your verified first name."
    - Empty sends `null`. It calls `appApi.profile.update`, then invalidates `appKeys.profile` and `appKeys.session`.
  - **Bank account** ("Bank account"):
    - The note "Transfers in come from this account and withdrawals go to it. The name must match your verified name."
    - Then `BankFields` and `PinInput`, calling `appApi.bankAccount.put`. `NAME_MISMATCH` renders its message.
    - It invalidates `appKeys.profile`, `appKeys.bankAccount` and `appKeys.home`.
  - **Change PIN:**
    1. "Current PIN".
    2. "New PIN".
    3. "Enter the new PIN again".

    It calls `appApi.security.setPin({ pin, current_pin })`. Success: "Your PIN is changed."
  - **Reset PIN** ("Reset your PIN"):
    1. A new email sign-in.
       - Sandbox: `dynamic(() => import("./privy-reset"), { ssr: false })`. It calls Privy `logout()`, then sends a code to the profile email, takes the six-digit code, and returns both tokens.
       - Simulated: `appApi.beta.privyTokens(email)`.
    2. New PIN, entered twice.
    3. `appApi.security.resetPin({ access_token, identity_token, pin })`.

    Success: "Your PIN is reset. Other devices were signed out."
  - **Devices** ("Signed-in devices"):
    - One row per device: `device`, `Signed in {formatLagosDateTime(signed_in_at)}`, and "This device" when current. Every other row has *Sign out*.
    - *Sign out of other devices* calls `signOutOthers`.
  - **Automations** ("Automatic actions"):
    - One row per automation: title, detail and `automationLine`.
    - *Turn off* swaps the row in place to "Turn off {title}?" with *Turn off* and *Keep it on*.
    - *Renew* swaps the dialog's body to `PinStep`, which calls `appApi.automations.renew(id, pin)`.
    - Both invalidate `appKeys.automations` and `appKeys.home`.
- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/settings" src/components/app/settings src/hooks/app/use-settings.ts tests/app-ui/settings.test.ts
git commit -m "feat: add settings with name, bank, PIN, devices and automations modals"
```

---

### Task 17: The landing's Sign in link

**Files:**
- Modify: `src/components/landing/site-header.tsx`, `src/components/landing/mobile-nav.tsx`, `src/components/landing/site-footer.tsx`, `src/styles/globals.css` (`.header-signin`)
- Test: `tests/landing/nav-links.test.ts` (one case), `e2e/landing.spec.ts` (one test)

**Interfaces:**
- Consumes: none. `NAV_LINKS` stays as it is.

- [ ] **Step 1: Write the tests**

```ts
// tests/landing/nav-links.test.ts
it("keeps sign-in out of the section links", () => {
  expect(NAV_LINKS.map((l) => l.href)).not.toContain("/signin");
});
// e2e/landing.spec.ts
test("links to sign-in without prefetching it", async ({ page }) => {
  await page.goto("/");
  const link = page.locator(".header-signin");
  await expect(link).toHaveAttribute("href", "/signin");
  await link.focus();
  await expect(link).toBeFocused();
  await expect(page.locator("footer").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  // the guard fixture already fails the test on any request to /signin
});
```

- [ ] **Step 2: Add the link** as a plain `<a href="/signin">Sign in</a>`, never a prefetching `Link`, in three places:
  - **Header:** `className="header-signin"`, in `header-right` before `<HeaderCta />`.
    - `.header-signin` uses `muted-foreground` and turns `heading` on hover. It has a 44px minimum height, the inherited focus ring, and 15px weight 500.
    - It is hidden below the breakpoint where `.desktop-nav` hides; reuse that media query.
  - **Mobile sheet:** last in `.mobile-links`, wrapped in `SheetClose asChild`. The noscript nav gets it too.
  - **Footer:** the V3ST column's list, after the `NAV_LINKS`.

  The hero handover still drives only the `Join the waitlist` pill.
- [ ] **Step 3: Commit**

```bash
git add src/components/landing/site-header.tsx src/components/landing/mobile-nav.tsx src/components/landing/site-footer.tsx src/styles/globals.css tests/landing/nav-links.test.ts e2e/landing.spec.ts
git commit -m "feat: add a quiet Sign in link to the landing header and footer"
```

---

### Task 18: Vocabulary and route guards

**Files:**
- Test: `tests/app-ui/vocabulary-guard.test.ts`, `tests/app-ui/route-inventory.test.ts`

**Interfaces:**
- Consumes:
  - `findCustomerLeaks` from `@/backend/services/app/vocabulary`;
  - `typescript`, already a devDependency;
  - every app page file from Tasks 6–16.

- [ ] **Step 1: Write the vocabulary guard.**
  - Parse every `.ts`/`.tsx` under `src/components/app/`, `src/app/(app)/`, `src/app/(auth)/` and `src/app/(setup)/` with `ts.createSourceFile`.
  - Collect JSX text (trimmed and non-empty), string literals and template literal text.
  - Skip:
    - module specifiers;
    - strings starting with `/`;
    - strings matching `/^[A-Z][A-Z0-9_]+$/` (error codes being compared);
    - values of the JSX attributes `className`, `href`, `id`, `htmlFor`, `name`, `type`, `autoComplete`, `inputMode`, `key`, `role`, `layoutId`, `weight` and any `data-*`;
    - object keys.

```ts
it("keeps crypto vocabulary out of the app's own copy", () => {
  expect(findCustomerLeaks(collectCopy(APP_SOURCE_DIRS))).toEqual([]);
});
it("checks real copy", () => {
  expect(collectCopy(APP_SOURCE_DIRS)).toContain("Add money to get started.");
});
```

- [ ] **Step 2: Write the route inventory test.**
  - **Pages:** these 13 routes resolve to a `page.tsx` under the expected group:
    - `/signin` (`(auth)`) and `/setup` (`(setup)`);
    - `/home`, `/stocks`, `/stocks/[id]` and `/orders/[id]`;
    - `/cash`, `/earn`, `/earn/[id]`, `/earnings`, `/activity`, `/activity/[id]` and `/settings`.
  - **Loading:** every one except `/signin` has a `loading.tsx` beside it.
  - **Redirects:** `/settings/bank` and `/settings/automations` exist and contain `redirect("/settings?open=`.
  - **Backend links:**
    1. Read `src/backend/services/app/home.ts` and `src/backend/services/notifications/index.ts`.
    2. Extract every `link: "…"` and ``link: `…` `` value, and every `const link = `…``.
    3. Normalise `${…}` to a placeholder, and map `/activity/wd_X`-style ids to `/activity/[id]`.
    4. Assert each resolves to a page or a redirect route, trying static segments first and then `[id]`.
- [ ] **Step 3: Commit**

```bash
git add tests/app-ui/vocabulary-guard.test.ts tests/app-ui/route-inventory.test.ts
git commit -m "test: guard the app's copy vocabulary and every backend link"
```

---

### Task 19: The app's browser suite

**Files:**
- Create: `playwright.app.config.ts`, `scripts/app-e2e.mjs`, `scripts/app-e2e-seed.ts`
- Create: `e2e/app/fixtures.ts`, `e2e/app/{signin-setup,home-cash,trade,earn,settings,layout,vocabulary}.spec.ts`
- Modify: `playwright.config.ts` (`testIgnore: ["app/**"]`), `package.json` (scripts `"test:e2e:app": "playwright test -c playwright.app.config.ts"` and `"app-e2e": "node scripts/app-e2e.mjs"`)

**Interfaces:**
- Consumes:
  - the helpers in `tests/helpers/testnet.ts` (`testnet`, `ensureTestnetNetwork`, `makeTestnetStock`) and `tests/helpers/factories.ts` (`seedTreasury`). These import no Vitest; never import `tests/helpers/{db,app,journey,time}.ts`.
  - `findCustomerLeaks`.
- Produces:
  - `node scripts/app-e2e.mjs prepare|start`;
  - fixtures `signedIn(page, email)` and `readyAccount(page, email)`.

- [ ] **Step 1: Write `scripts/app-e2e.mjs`.**
  - **`prepare`:**
    - It refuses unless `TEST_DATABASE_URL`'s database name ends in `_test`, and unless the RPC is loopback with chain 31337.
    - It runs `prisma migrate deploy` against the test database, then `tsx scripts/app-e2e-seed.ts`.
    - The seed provisions the testnet network, the treasury, and the stock "TSTA": an O1 pool with liquidity and a fresh reference, as `setupWorld` in `tests/app/orders-waiting.test.ts` does.
  - **`start`:**
    - It builds with `next build`, then runs `next start -p 3108`, `yarn worker`, and a 20s loop that refreshes the seeded stock's `referenceAsOf`. The loop is test tooling only and lives in this script.
    - Clear every provider credential exactly as `scripts/landing-beta.mjs` does.
    - Set `APP_STAGE=beta`, `PRIVY_MODE=simulated`, `APP_CUSTOMER_CHAIN=testnet`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3108`, `DATABASE_URL=$TEST_DATABASE_URL`, and the test secrets from `vitest.config.ts`.
  - `playwright.app.config.ts` mirrors `playwright.config.ts`, except for its `testDir: "./e2e/app"`, its 3108 `baseURL`, `webServer: node scripts/app-e2e.mjs start`, and a 90s timeout.
- [ ] **Step 2: Write the fixtures.**
  - `signedIn` uses the UI with an email `e2e-<random>@v3st.test`.
  - `readyAccount` runs setup through `page.request` with `Origin: http://127.0.0.1:3108`: test identity `ada_tier2`, PIN `1357`, the three documents, and the bank and account values `readyCustomer` uses in `tests/helpers/app.ts`.
  - A guard fails a test on any request to a non-`127.0.0.1:3108` origin.
- [ ] **Step 3: Write the specs.** Assert on visible text, roles and URLs.
  - **`signin-setup.spec.ts`:**
    - Simulated sign-in lands on `/setup`.
    - All four steps complete, including *Read*: the dialog opens, Escape closes it, and focus returns to *Read*.
    - "You're all set", then *Go to home*, reaches `/home` with "Total value".
  - **`home-cash.spec.ts`:**
    - The empty line shows "Now ·" and "Add money to get started."
    - *Add money* ₦50,000 goes to `/activity/dep_…`, which shows "Send exactly ₦50,000 to".
    - *Complete this test transfer* is followed, within 30s, by `/home` showing the item under "Earlier".
    - *Withdraw* ₦10,000, then PIN, then `/activity/wd_…`.
    - The bell opens Notifications and shows "Money added". Activating that row closes the modal and lands on `/cash`.
  - **`trade.spec.ts`:**
    - **`buy now`:** buy ₦2,000 of TSTA with cash and confirm with the PIN. The page lands on `/orders/…`, which reaches "Done" within 60s.
    - **`pay by transfer`:** the transfer card appears, and *Complete this test transfer* lets the order progress.
    - **`wrong PIN`:** the message "That PIN isn't right." appears and the PIN clears.
    - **`double confirm places one order`:** two rapid clicks produce one new order in `/activity`.
  - **`earn.spec.ts`:**
    - **Join:** *Confirm* stays disabled until the risks box is ticked. After joining, the position shows "Joining" or "Active".
    - **Leave:** withdrawing works once the position is active.
    - **Earnings choice:** choose payout with the PIN, and `/earnings` shows "Paid to your bank on Fridays".
  - **`settings.spec.ts`:**
    - Change the name.
    - Devices lists "This device".
    - `/settings/bank` lands on `/settings?open=bank` with the dialog open. Escape closes it and the URL becomes `/settings`.
    - Automations, after joining Earn: *Renew* with the PIN.
  - **`layout.spec.ts`:**
    - **`no page scrolls sideways at 320px`:** use a 40-letter preferred name, then visit every page at 320×720 and assert `scrollWidth <= innerWidth`.
    - Every modal at 390×844 puts focus in the dialog, and Escape returns it to the trigger.
  - **`vocabulary.spec.ts`:** visit every page and open every modal. Run `body.innerText` through `findCustomerLeaks` and expect `[]`.
- [ ] **Step 4: Commit**

```bash
git add playwright.app.config.ts playwright.config.ts scripts/app-e2e.mjs scripts/app-e2e-seed.ts e2e/app package.json
git commit -m "test: author the customer app's browser suite"
```

---

### Task 20: Keep the guides in step

**Files:**
- Modify: `FRONTEND_PATTERNS_GUIDE.md`, `README.md`, `PRODUCT.md`, `AGENTS.md`

- [ ] **Step 1: Update `FRONTEND_PATTERNS_GUIDE.md`.** The app pattern is now real.
  - **§1:** TanStack Query and `@privy-io/react-auth` are installed (versions from `yarn.lock`).
  - **§2:** the `(auth)`, `(setup)` and `(app)` groups, plus `components/app`, `hooks/app` and `server/app`.
  - **§6:** the new primitives.
  - **§7:** the money-modal pattern: amount, review, PIN, idempotency key life.
  - **§8:** server reads become initial data; mutations go through `appApi`; the event stream invalidates by area.
  - **§9:** modals linked by `?open=`.
  - **§13:** an app-page checklist.

  Keep the marketing rules unchanged.
- [ ] **Step 2: Update the other three.**
  - `README.md`: how to run and preview the app (`/signin`, simulated sign-in), and the app's browser suite (`yarn app-e2e prepare`, then `yarn test:e2e:app`).
  - `PRODUCT.md`: the app exists for beta testers, and the landing has a Sign in link.
  - `AGENTS.md`: planning already pointed its current assignment at this plan. Correct anything the build changed: commands, task numbers, prerequisites.
- [ ] **Step 3: Commit**

```bash
git add FRONTEND_PATTERNS_GUIDE.md README.md PRODUCT.md AGENTS.md
git commit -m "docs: document the customer app's patterns and how to run it"
```

---

### Task 21: Final gate, Impeccable finish and review record

**Files:**
- Create: `docs/superpowers/reviews/2026-11-19-v3st-customer-app-pages.md`
- Modify: `DESIGN_SYSTEM.md`, `.impeccable/design.json` (documenter), plus any file a failing gate points at

- [ ] **Step 1: Prepare the environment.** It needs isolated local PostgreSQL databases (beta, and one ending `_test`), Forge and Anvil, and Chromium.
  - Run `bash scripts/setup-cloud.sh`, `yarn prisma validate` and `yarn prisma generate`.
  - Run `yarn testnet:start` in the background, then `yarn testnet:deploy`.
- [ ] **Step 2: Run the gate once, in order.** Record each command and its real outcome:
  1. `yarn test:contracts`
  2. `yarn test`
  3. `yarn lint`
  4. `yarn typecheck`
  5. `yarn build`
  6. `yarn test:e2e`
  7. `yarn app-e2e prepare && yarn test:e2e:app`

  Fix failures in focused commits, rerunning only the failing command until it passes. Unexecuted assertions have not passed.
- [ ] **Step 3: Capture for review.** With the app stack running, capture every page at 390×844 and 1440×900, plus each modal open at 390×844, into `.impeccable/review/`: `<page>-mobile.png`, `<page>-desktop.png`, `<modal>-mobile.png`.
  - Settle motion first.
  - Capture from the document top.
  - Open each file once to confirm it shows what its name says.
- [ ] **Step 4: Run the Impeccable finish.** With Impeccable installed:
  1. Run `impeccable detect --json` on the changed app targets, and fix mechanical findings.
  2. Spawn the shipped `impeccable-finish-reviewer` fresh. Give it:
     - the original request: all app pages, one job each, modals where they save pages, fluid as structural inspiration;
     - the operator's decisions in spec §Operator decisions;
     - the artifact paths and the screenshot paths;
     - the direction contract (`.impeccable/surfaces/src-app-app-layout-tsx.md`);
     - the chosen sketch as the critique reference;
     - the detector findings and the craft-floor path.
  3. Act on its disposition word:
     - `fix`: one batch, recapture, verdict pass;
     - `rebuild`: re-derive the named regions;
     - `recapture`;
     - `ship`.

     Two rounds at most.
  4. Spawn `impeccable-documenter`. The write target is `DESIGN_SYSTEM.md`, and the choice is **merge**: add a "Customer app" section and keep the marketing sections. Also update `.impeccable/design.json`.

  Without Impeccable, run a fresh-context review against the spec, the surface brief and the sketch, and add the "Customer app" section to `DESIGN_SYSTEM.md` by hand. Record that substitution.
- [ ] **Step 5: Write the review record.**
  - the versions installed;
  - every gate command and its result;
  - the finish-review disposition at its real scope;
  - deviations from the spec and why;
  - remaining risks (spec §Open risks).
- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/reviews/2026-11-19-v3st-customer-app-pages.md DESIGN_SYSTEM.md .impeccable/design.json
git commit -m "docs: record the customer app verification and finish review"
```
