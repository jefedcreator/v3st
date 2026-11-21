# V3ST Frontend Patterns Guide

This guide defines V3ST's Next.js App Router frontend conventions. Read `CLAUDE.md`, `DESIGN_SYSTEM.md`, `PRODUCT.md` and the active feature specification before implementation. `Design.md` remains product architecture; do not overwrite it with a visual-design document. `BACKEND_PATTERNS.md` governs the existing HTTP, service, validator and database layers.

The public marketing routes (`/`, `/legal/*`, `/waitlist`) are built to [the landing redesign specification](docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md) and [its plan](docs/superpowers/plans/2026-11-18-v3st-landing-redesign.md); those documents are the authority for the landing's theme, type, sections, motion contract and assets. This guide's general rules (structure, naming, imports, primitives, backend contracts) still apply.

All V3ST operation remains beta. Every external integration uses a verified sandbox/test environment or simulation; Paycrest is simulated-only. `NODE_ENV=production` selects an optimized build and secure cookies, never real providers. A local replica does not establish verified access to an external provider.

## 1. Stack and dependency status

`package.json` and `yarn.lock` are the source of truth for installed packages and resolved versions. The baseline includes:

| Package                                 | Role                                                |
| --------------------------------------- | --------------------------------------------------- |
| Next.js 15 / React 19                   | App Router; Server Components by default            |
| TypeScript 5                            | Strict types, `noUncheckedIndexedAccess`, `checkJs` |
| Tailwind CSS 4 / `@tailwindcss/postcss` | CSS-first tokens and PostCSS build                  |
| Zod 3 / `@t3-oss/env-nextjs`            | Server validation and typed environment             |
| Prisma 6 / `@prisma/client`             | Server-side PostgreSQL access                       |
| `viem`                                  | Existing server-side local-testnet execution        |
| `@sentry/nextjs`                        | Existing centralized backend reporting              |
| Vitest 5 / Vite 7 / `tsx`               | Existing tests and TypeScript scripts               |
| `three`                                 | Vendored fluid background only (lazy chunk)         |

The landing adds `radix-ui`, `@phosphor-icons/react`, `class-variance-authority`, `clsx`, `tailwind-merge` and `tw-animate-css`, and the customer app adds `@tanstack/react-query` 5.108.1, `@privy-io/react-auth` 3.52.0 (sandbox sign-in only, dynamically imported) and `input-otp` 1.5.0, all pinned exactly. Resolve compatible versions through Yarn and record actual versions in the review record. The official shadcn CLI generates source; shadcn/ui is not a runtime dependency. Playwright is used for final browser verification.

Axios, React Hook Form, `@hookform/resolvers`, Zustand, nuqs, sonner and any chart library remain uninstallable future patterns, not dependencies. V3ST has one dark theme: no `next-themes` or theme provider/toggle.

Use the Node version in `.nvmrc` and Yarn 1.22.22. Start setup with `bash scripts/setup-cloud.sh`. Keep `yarn.lock` as the only committed package-manager lockfile. Generated Prisma output, dependencies and build output stay uncommitted.

## 2. V3ST structure and routing

```text
src/
├── app/
│   ├── layout.tsx                  # root document, Archivo, static V3ST metadata, noindex
│   ├── (marketing)/                # anonymous /, /legal/*, /waitlist
│   │   ├── layout.tsx              # header, footer, LandingMotionProvider, CursorFollower
│   │   ├── page.tsx                # statically regenerated Server Component (revalidate = 300)
│   │   ├── legal/[slug]/page.tsx   # static reading pages from CUSTOMER_DOCUMENTS
│   │   └── waitlist/page.tsx       # no-JS waitlist result page (dynamic, noindex)
│   ├── (auth)/signin/              # /signin: no chrome
│   ├── (setup)/setup/              # /setup: flow shell
│   ├── (app)/                      # chrome once in layout.tsx; home, stocks, orders, cash, earn,
│   │                               # earnings, activity, settings (+ loading/error/not-found)
│   └── api/v1/                     # existing canonical Route Handlers (+ waitlist, ops/waitlist)
├── components/landing/             # landing feature sections and focused client islands
│   ├── motion/contract.ts          # pinned motion numbers (pure, browser-safe)
│   └── fluid/                      # vendored LiquidEther + gate + lazy background
├── components/app/                 # customer app features (chrome, home, money, trade, earn, …)
├── hooks/app/                      # query keys, the event stream, idempotency, per-area queries
├── primitives/                     # generated/restyled UI building blocks
│   └── index.ts                    # public primitive exports
├── backend/                        # middleware, validators, services, integrations, workers
├── server/
│   ├── db.ts / prisma.ts / auth/   # existing infrastructure
│   ├── landing.ts                  # request-scoped ticker read (React cache), never throws
│   └── app/                        # session guard, per-page cached reads, money limits
├── types/                          # API envelopes, DTOs, operator contracts, landing DTOs
├── utils/
│   ├── index.ts                    # server helpers; imports node:crypto
│   ├── cn.ts                       # browser-safe classnames
│   ├── format.ts                   # browser-safe exact naira, shares and Lagos time
│   ├── app-api.ts                  # typed fetch client for /api/v1/app/* (AppApiError)
│   ├── app-paths.ts                # safeNext, after-sign-in path, settings ?open= names
│   ├── money.ts                    # exact server money helpers
│   └── response.ts                 # server response envelopes
└── styles/globals.css              # @theme static tokens and base styling
```

`public/brands/` and `public/stocks/` hold official locally served marks with provenance manifests; `public/art/` holds original authored artwork with `public/art/sources.json`. Landing copy, formatters and motion contracts live in `src/components/landing/`. Pure assertions belong in `tests/landing/`; browser specs live in `e2e/`, outside Vitest's `tests/**/*.test.ts` match.

### Route and component boundaries

- `app/` owns routing, metadata and composition. Business logic belongs in services, never pages or Route Handlers.
- `(marketing)/page.tsx` is a Server Component composed of server-rendered sections and client islands. It is statically generated with incremental regeneration (`export const revalidate = 300`): it uses no cookies, headers or search params, and its only server read is the beta ticker through `src/server/landing.ts` (`getLandingTicker`, wrapped in React `cache()`, returning `null` on any failure so the page renders the no-price fallback). A build with an unreachable database must succeed.
- Keep one root `/` implementation. The marketing routes are anonymous: they perform no session reads and check no auth state.
- Client islands own mobile navigation, motion lifecycle and the waitlist form enhancement. Pass server-rendered content through `children`; never import server-only modules (`content.ts`, backend config, services) into client components.
- One feature-scoped `LandingMotionProvider` shares only `paused` and `reducedMotion` with the motion islands and mirrors them onto the `[data-landing]` root as `data-motion-paused` / `data-reduced-motion`. Do not mount application-wide query, form, auth, theme or global-store providers for these pages.
- `/legal/[slug]` renders one static page per `CUSTOMER_DOCUMENTS` entry with a small local markdown-lite renderer. `/waitlist` reads `?status=` and shows the matching message plus the form again; it is dynamic and noindex.
- For a future authenticated feature, persistent shared chrome belongs in its layout, outside remounting templates. `server/` already contains database/auth infrastructure; add service-backed RSC wrappers only when a data-driven feature needs them.

## 3. Naming and imports

| What                       | Convention                                         | Example                                |
| -------------------------- | -------------------------------------------------- | -------------------------------------- |
| Feature component          | Kebab-case file, PascalCase export                 | `stocks-section.tsx` → `StocksSection` |
| Hand-built primitive       | PascalCase file matching export                    | `Surface.tsx` → `Surface`, if needed   |
| shadcn primitive           | Preserve generated filename/API                    | `button.tsx`, `tabs.tsx`               |
| Future query/mutation hook | Kebab-case `use-` filename, camelCase export       | `use-deposits.ts` → `useDepositsQuery` |
| Backend validator          | `[resource].validator.ts`, inferred exported types | `deposit.validator.ts`                 |
| Wire type                  | Explicit DTO in `src/types/`                       | `DepositDto`                           |
| API route                  | Mirror canonical resource path                     | `api/v1/deposits/[id]/route.ts`        |

`@/*` maps to `src/*`. Use aliases across feature boundaries instead of deep relative imports. Import primitives from `@/primitives`.

**Browser exception to barrel imports:** `@/utils` imports `node:crypto`. Browser modules and generated primitives import `cn` directly from `@/utils/cn`. Import exact landing formatting from its browser-safe feature module (`components/landing/format.ts`); `components/landing/content.ts` is Server Components only. Do not re-export server helpers through browser barrels or move backend code to accommodate the landing. Type-only imports must stay type-only.

`cn(...inputs: ClassValue[]): string` combines `clsx` and `tailwind-merge`. Configure shadcn's `utils` alias as `@/utils/cn` and `ui` as `@/primitives`.

## 4. Iconography and assets

- The UI icon package is `@phosphor-icons/react`. Server and Client Components use its SSR entry: `import { ArrowRight, X } from "@phosphor-icons/react/dist/ssr"`. Import only the `Icon` type from the package root when needed.
- Prefer regular weight, tokenized size classes and `aria-hidden` beside text. Icon-only controls need accessible names and 44px targets.
- Provider/chain/asset marks are real local assets, not UI icons. Preserve approved geometry, colors, clearspace and explicit dimensions. Record provenance in `public/brands/sources.json` and `public/stocks/sources.json`; do not hotlink or fabricate unavailable marks. If a file is missing, the badge/mark components render their letter/name fallback; deleting a file is the whole removal procedure.
- Original artwork (hero glow, light beam, safeguard streaks, join beams, footer glow) is generated by `scripts/landing-art.mjs` (its SVG compositions are the source), exported as AVIF with WebP fallback at explicit dimensions, and recorded with hashes in `public/art/sources.json`; re-run the script after changing a piece. The How it works panels are built in markup, not raster. Decorative art is `aria-hidden` and carries no information. Large soft glows use radial gradients, not big SVG blurs, which some renderers cap and leave visible rims.

## 5. Styling: one dark theme

V3ST's marketing world is dark: `void` ground, `signal` green, one theme. Do not add `.light`, a theme attribute switch, `next-themes`, theme-toggle controls or hydration suppression for a nonexistent theme script.

`DESIGN_SYSTEM.md` defines the semantic palette, Archivo typography, widths, spacing, radii, focus and layers. Tokens live in `@theme static` in `src/styles/globals.css`; do not add `tailwind.config.ts`. `static` ensures declared tokens are emitted, including those referenced by dynamic style code. Use semantic classes instead of repeating raw colors in components.

Archivo loads through `next/font` with the `latin-ext` subset for the naira sign. Use the shared `Logo` (`src/components/logo.tsx`) for the brand in the landing and app: the grain mark beside *V3ST* as live Archivo text, sized by one font-size. Use tabular financial numerals, intentional wrapping and visible focus. Body text meets 4.5:1 contrast and large text 3:1 on actual surfaces, including during artwork movement.

Server HTML is visible before enhancement. No-JS, reduced motion, unavailable WebGL, short viewports, enlarged text and zoom retain the explanation and actions. Do not globally hide reveal content or clip financial figures to fixed panel heights.

## 6. Primitives and feature composition

`primitives/` holds app-agnostic building blocks; `components/` holds feature compositions. Primitives never import backend services, query hooks or financial feature types.

Use the official shadcn CLI for primitives it provides and record the selected CLI version. The landing needs Button, Badge, Card parts, Tabs parts, Sheet parts and Skeleton; the customer app adds Input, Label, Dialog (a bottom sheet below 640px, centred from 640px), Select, RadioGroup, Checkbox, InputOTP and Separator, plus the hand-built `Money`, `KeyValue` and `CopyButton`. Preserve generated filenames/APIs, restyle in place with project tokens and re-export through `src/primitives/index.ts`. Edit variants/classes instead of creating competing styled wrappers.

Use unified `radix-ui` for generated Slot, Tabs and Dialog behavior. Preserve keyboard navigation, labelled panels/dialog titles, Escape, focus trapping/restoration and scroll-lock cleanup. Anchor buttons use `asChild`; never nest an anchor inside a button. Native `details`/`summary` suits the FAQ because it works without JavaScript.

Hand-built PascalCase primitives address needs shadcn does not provide. Feature layouts, diagrams and sections belong in `components/landing/`. Avoid unnecessary generic abstractions for small static copy blocks.

Section parents own their content; children receive props/callbacks. State resets on reload, writes no storage/cookies and creates no account. Decorative motion state is separate and cannot advance real selections or imply consent.

## 7. Forms: the waitlist pattern

The landing's only form is the waitlist, in the closing `#join` panel and on `/waitlist`. The hero holds no form (removed 2026-11-20): its primary pill and the header button link to `/#join` and focus the email field after the jump. `WaitlistForm` renders a native `<form method="post" action="/api/v1/waitlist">` with an email field, a hidden `source` field (`join` or `waitlist_page`; the API still accepts `hero` for rows from the removed hero form) and a honeypot `website` field (visually hidden, `tabindex="-1"`, `autocomplete="off"`). Native validation (`type="email" required`) stays on, so the form works without JavaScript (the route answers url-encoded posts with a 303 to `/waitlist?status=`).

With JavaScript, a client island intercepts the submission and posts JSON with `fetch` to the same route, rendering the states inline without moving layout and announcing results in a polite live region. Error text is the API's `message`, rendered directly. The state machine lives in a pure, unit-tested `waitlist-state.ts`.

The app's money modals follow one pattern: amount → review (with a held-price countdown) → PIN, all inside a single `Dialog`, never two modals at once. The caller creates one idempotency key when the review step opens (`useIdempotencyKey`), reuses it for every retry of that review through `nextIdempotencyKey(key, "retry", …)`, and replaces it only when a new preview is fetched. A `PRICE_CHANGED` or expired preview returns to the review with *Get a new price*.

If a future feature needs a richer form, derive `FormValues = z.input<typeof schema>` from a browser-safe schema. Server validation remains authoritative; do not import a server-only validator dependency graph into the browser. Use `defaultValues` for creation, deliberate resynchronization for editing, `register` for native inputs and `Controller` for non-controlled inputs. Associate field/error descriptions accessibly. Auth inputs use proper autocomplete tokens.

## 8. Data fetching and metadata

### Marketing routes: static generation with one service-backed read

`/`, `/legal/*` are static; `/` regenerates incrementally (`revalidate = 300`) and `/waitlist` is dynamic because it reads `searchParams`. The page's only server read is `getLandingTicker()` in `src/server/landing.ts`: request-scoped via React `cache()`, backed by the customer catalog service, failure-tolerant (reports and returns `null`, which renders profile-only rows — never fabricated prices). Money crosses into client components as integer strings and is formatted with exact `BigInt` arithmetic in the browser-safe `format.ts`.

**No client-side API calls are made except the waitlist POST** (`POST /api/v1/waitlist`) from `WaitlistForm`. The page never calls `/api/*` otherwise, uses no server actions, sessions, cookies or persistent browser storage. Fonts/assets/scripts are served locally.

Use Next's static metadata API and original static social artwork. Title: **V3ST · Invest. Earn. Harvest.** Describe the beta waitlist and test money only; retain `robots: { index: false, follow: false }`. Absolute URLs use `NEXT_PUBLIC_APP_URL`; do not invent a production domain.

### Future authenticated reads and mutations

Add typed service-backed read wrappers in `src/server/` only when needed. Use request-scoped React `cache()` for repeated reads and private/no-store reads for financial data. Preserve redirect/not-found control flow. Failure renders unavailable/error, never fabricated empty balances or ₦0. Distinguish failure from genuine empty results.

Customer screens read through the customer service layer (`src/backend/services/app/*`) via server wrappers and mutate only through `/api/v1/app/*` routes; their response types come from `src/types/app.ts`. Customer screens never call `/api/v1/*` operator endpoints, never see internal event names, and poll or subscribe to `GET /api/v1/app/events` for live updates.

This app pattern is now real: the customer app uses TanStack Query (SSR-safe per-browser QueryClient via `src/components/app/app-providers.tsx`, query-key factory in `src/hooks/app/query-keys.ts`, the server read passed as `initialData`) over the typed `appApi` client, and mutates only through `/api/v1/app/*` with the API's own `message` rendered verbatim. One `EventSource` on `GET /api/v1/app/events` invalidates queries by area (`keysForAreas`) with backoff. Do not add this stack to the marketing pages.

Private metadata must not publish balances, personal details or tokens in OG image URLs. The marketing pages use a static public card without account access.

## 9. Client and URL state

Prefer local state. `LandingMotionProvider` shares page-scoped pause/reduced-motion state without persistence and mirrors it onto `[data-landing]` as `data-motion-paused` / `data-reduced-motion` so CSS loops can stop. Native hash anchors support deep-link entry and Back/Forward behavior.

Zustand and nuqs are aspirational for future needs; neither belongs on the marketing pages. Their selections do not survive reload and are not URL state.

The customer app links modals by `?open=`: settings modals open from `/settings?open=<name>` (`src/utils/app-paths.ts`), `/settings/bank` and `/settings/automations` redirect there, and closing a URL-opened modal replaces the URL with bare `/settings`.

## 10. Animation and motion

The landing's motion is pinned by `src/components/landing/motion/contract.ts` (hero choreography, ticker marquee, counters, diagram, parallax, cursor follower, sheet, fluid settings). Drive continuous motion with CSS custom properties, keyframes and rAF loops that write directly to the DOM — no React state per frame. Prefer transforms/opacity.

- Server HTML is fully visible; animation starts only after hydration and never replays a blank intro on deep links, restored scroll or delayed hydration.
- There is no visible pause control: the operator removed it on 2026-11-19. `LandingMotionProvider` keeps a dormant `paused` state that every loop still honours (fluid, ticker, floating panels, diagram autoplay, parallax), so a control can return by rendering a button that calls `setPaused`. Without it, moving content stops only under `prefers-reduced-motion`, on hover or focus (the ticker), offscreen or in a hidden tab; WCAG 2.2.2 (Pause, Stop, Hide) asks for a user-operable pause for auto-moving content, so the page no longer meets that criterion.
- Loops stop when the document is hidden or the element is offscreen; all listeners, timers and GPU resources are released on unmount. On WebGL context loss the fluid falls back to the static hero artwork.
- Reduced motion is observed live: ordinary flow instead of the pinned hero track, no fluid, no loops/parallax/follower, counters show final values; meaningful state changes keep a short opacity change.
- Measure hero fit at short heights/zoom and fall back to ordinary flow instead of cropping. A hero group containing `:focus-within` stays at opacity 1; faded groups take no pointer events.

## 11. Validation, services and API contracts

These are existing V3ST backend contracts:

- Canonical handlers live under `/api/v1/**`; `/v1/:path*` and `/webhooks/:provider` rewrite to those same handlers.
- Every exported API handler uses `withMiddleware(handler, middlewares, options)` with body modes `json`, `raw`, `none` and `form`, plus an optional `formRedirect` for no-JS form posts. Handlers call singleton domain services; only services access Prisma. Database, provider and signing logic stay out of browser bundles.
- Strict Zod schemas provide request validation/inferred types. `withMiddleware<B, P, Q>` takes **body, path, query**, with explicit `null` for unused channels. After matching validators run, read `request.validatedData!`, `request.params!`, `request.query!` without route-local casts. `parsedBody`, `parsedParams`, `parsedQuery` remain unvalidated pipeline inputs.
- Auth precedes validators on authenticated routes. Preserve Origin protection for cookie writes and applicable `Idempotency-Key` requirements. A retry is not a new economic operation. Rate-limited public routes use `rateLimitMiddleware` (e.g. the waitlist).
- `src/types/index.ts` defines `ApiResponse<T>`, `PaginatedApiResponse<T>`, `ApiErrorResponse` and stable `ErrorCode`s. Success: `{ status, message, data }`; error: `{ status, message, code, data: null }`; pagination adds `{ total, page, size, totalPages }`.
- Explicit `src/types/dto.ts` serializers produce snake_case wire fields. Money/raw token quantities cross JSON as integer strings, never BigInt/floats. Never expose raw Prisma rows or provider payloads.
- Quote expiry, changed terms, unavailable reads, holds and unresolved operations remain visible states.
- Customer error responses are already display copy: render `message` from API errors directly and use `code` only for analytics/branching. Never surface raw internal error codes or stack details to customer screens.

### Session transport

`SESSION_COOKIE_NAME` in `src/server/auth/constants.ts` is **`sara-session`**, the existing V3ST contract. Do not substitute the historical `parcours_session` name.

Sessions are opaque random 32-byte tokens stored/validated in PostgreSQL, not session JWTs or NextAuth. Cookie attributes: `HttpOnly`, `SameSite=Lax`, path `/`, `Secure` with `NODE_ENV=production`. Never store the token in localStorage or try to decode it client-side.

`authMiddleware` validates session/expiry and attaches `User & { session: Session }`. Cookie transport takes precedence over bearer; an invalid cookie must not switch principals through bearer fallback. Beta exchange uses `POST /api/v1/auth/session`; `POST /api/v1/auth/logout` revokes the row, clears the cookie and returns JSON 200. The marketing routes call neither endpoint and check no session.

## 12. Environment and beta boundaries

Use validated server configuration from `src/env.js` through `@/env`. Never import server environment, credentials, policy/services, Prisma, Node crypto or signing SDKs into browser modules. Only explicit `NEXT_PUBLIC_*` values may be exposed when needed.

Keep `APP_STAGE=beta`, explicit simulated/verified-sandbox modes and no live fallback across optimized builds, workers and scripts. Fictional stocks, fees/rates and settlement units are test data. They establish no provider access, legal ownership, guaranteed income, issuer-backed assets or real financial consent. The landing states this in copy: beta, test money only.

## 13. Feature checklist and verification timing

For the marketing routes:

- [ ] Static anonymous routes with visible server HTML; `/` regenerates every 300s and its ticker read is failure-tolerant.
- [ ] Exact money (BigInt kobo strings), derived figures, no invented claims, crypto vocabulary out of the copy.
- [ ] Generated/restyled primitives, Phosphor SSR icons, direct `@/utils/cn` imports, one dark theme, Archivo with `latin-ext`.
- [ ] Local assets with provenance manifests, original artwork, noindex metadata.
- [ ] Working anchors, skip link, FAQ `<details>`, no-JS form POST with 303 redirect, and a `/waitlist` result page.
- [ ] No client-side API calls except the waitlist POST; no-JS, reduced-motion, failed-WebGL, mobile/zoom fallbacks.
- [ ] Keyboard/focus, overflow and network-containment assertions authored in `e2e/`.

For the customer app pages:

- [ ] `requireCustomer` on every app page read; server reads cached and failure-tolerant (`null` error body, `notFound()` for missing detail); `loading.tsx` for every page.
- [ ] Each read becomes TanStack Query initial data; writes go through `appApi` only, with the API's own `message` rendered verbatim and `code` used only to branch.
- [ ] Unknown money renders "—" (never ₦0); every figure tabular; money stays integer strings until `@/utils/format`.
- [ ] One responsive `Dialog` per modal, focus trapped and restored; a PIN is never a second modal; one idempotency key per review, reused on retry.
- [ ] WCAG 2.2 AA: 44px targets, visible focus, polite live regions, labels tied to inputs, no horizontal scroll at 320-390px.
- [ ] No crypto vocabulary in customer copy (`tests/app-ui/vocabulary-guard.test.ts` and the `e2e/app` crawl).

For later data-driven features, add only necessary validators, wrapped handlers, services, DTOs, service-backed reads, reachable pages/navigation and loading/error states. Introduce query/form/store packages only for an actual requirement. Preserve ownership, private metadata, unavailable-data and session contracts.

Follow `CLAUDE.md`: write tests with tasks, review diffs and commit focused task work, but defer test/lint/typecheck/build gates until the full implementation is ready. Run the active plan's final sequence and record actual results; unexecuted assertions have not passed.
