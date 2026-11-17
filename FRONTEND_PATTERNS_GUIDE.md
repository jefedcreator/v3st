# V3ST Frontend Patterns Guide

This guide defines V3ST's Next.js App Router frontend conventions. Read `CLAUDE.md`, `DESIGN_SYSTEM.md`, `PRODUCT.md` and the active feature specification before implementation. `Design.md` remains product architecture; do not overwrite it with a visual-design document. `BACKEND_PATTERNS.md` governs the existing HTTP, service, validator and database layers.

The public landing assignment follows [the landing specification](docs/superpowers/specs/2026-11-15-v3st-landing-design.md) and [its plan](docs/superpowers/plans/2026-11-15-v3st-landing.md). It adds an anonymous marketing page and browser-local illustrative demo, without financial API changes or authenticated dashboards.

All V3ST operation remains beta. Every external integration uses a verified sandbox/test environment or simulation; Paycrest is simulated-only. `NODE_ENV=production` selects an optimized build and secure cookies, never real providers. A local replica does not establish verified access to an external provider.

## 1. Stack and dependency status

`package.json` and `yarn.lock` are the source of truth for installed packages and resolved versions. Before landing Task 1, the baseline includes:

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

Landing Task 1 adds `motion`, unified `radix-ui`, `@phosphor-icons/react`, `class-variance-authority`, `clsx`, `tailwind-merge` and `tw-animate-css`. Resolve compatible versions through Yarn and record actual versions in the review record. The official shadcn CLI generates source; shadcn/ui is not a runtime dependency. Playwright is added for final browser verification.

TanStack Query, Axios, React Hook Form, `@hookform/resolvers`, Zustand, nuqs and sonner are future feature patterns, not baseline installed dependencies or landing requirements. Do not install them merely to satisfy an example. V3ST has one light theme: no `next-themes` or theme provider/toggle. Animation imports come from `motion/react`.

Use the Node version in `.nvmrc` and Yarn 1.22.22. Start setup with `bash scripts/setup-cloud.sh`. Keep `yarn.lock` as the only committed package-manager lockfile. Generated Prisma output, dependencies and build output stay uncommitted.

## 2. V3ST structure and routing

This tree distinguishes the landing target from the existing backend; it does not claim every planned frontend file already exists:

```text
src/
├── app/
│   ├── layout.tsx                  # root document, Geist, static V3ST metadata
│   ├── (marketing)/                # anonymous /; landing implementation target
│   │   ├── page.tsx                # static Server Component composition
│   │   └── loading.tsx             # matching route fallback
│   └── api/v1/                     # existing canonical Route Handlers
│       ├── auth/{session,logout}/
│       ├── deposits/               # plus stocks, investments, portfolio, strategies
│       ├── withdrawals/            # plus earnings, bank accounts and events
│       └── ops/                    # operator-only API contracts
├── components/landing/             # feature sections and focused client islands
├── primitives/                     # generated/restyled UI building blocks
│   └── index.ts                    # public primitive exports
├── backend/
│   ├── middleware/                 # withMiddleware, auth and input validators
│   ├── validators/                 # strict per-domain Zod contracts
│   ├── services/                   # domain singletons; database/provider access
│   ├── integrations/               # beta policy and provider evidence
│   └── workers/                    # durable job execution
├── server/
│   ├── db.ts                       # existing Prisma singleton and transactions
│   ├── prisma.ts                   # generated Prisma namespace exports
│   └── auth/constants.ts           # canonical sara-session name
├── types/                          # API envelopes, DTOs and operator contracts
├── utils/
│   ├── index.ts                    # server helpers; imports node:crypto
│   ├── cn.ts                       # browser-safe landing addition
│   ├── money.ts                    # existing exact server money helpers
│   └── response.ts                 # server response envelopes
└── styles/globals.css              # @theme static tokens and base styling
```

`public/brands/` holds authentic locally served marks and provenance. Landing fixtures, demo money helpers and motion contracts live in `src/components/landing/`. Pure assertions belong in `tests/landing/`; browser specs live in `e2e/`, outside Vitest's `tests/**/*.test.ts` match.

### Historical examples, not V3ST routes or requirements

Earlier versions of this portable guide contained other products' structures. The education routes `/day`, `/progress`, `/mock/[id]`, `/leaderboards`, `/duels`, `/@handle`, study-group invites, curriculum renderers, pill navigation and `DEFAULT_AFTER_AUTH=/day` are historical examples only. Their API routes, `getDay`/`getProgress` wrappers, underfill indicators, provisional scores and bot/social-card machinery do not describe V3ST.

The payment-product groups `(dashboard)` and `(pay)`, `/payments`, `/links`, `/destinations`, `/<code>`, `/<code>/<paymentId>`, `getDashboardSummary` and `getPayPage` are also examples, not implemented V3ST surfaces. Do not copy their routes, redirects, middleware matchers or metadata machinery. Example component names such as `AppChrome`, `AppSkeleton`, `FadeIn` and `ThemeToggle` do not establish existing files or a required provider stack.

The older ramps plan describes future customer routes such as `/portfolio`, `/deposits/new`, `/withdrawals/new`, `/earnings` and settings. The landing assignment does not implement or link to unbuilt account surfaces. Native section anchors are its navigation.

### Route and component boundaries

- `app/` owns routing, metadata and composition. Business logic belongs in services, never pages or Route Handlers.
- `(marketing)/page.tsx` is a static Server Component composing server-rendered sections and client islands. `dynamic = "error"` is suitable for enforcing its anonymous boundary. It performs no session, database, API or provider reads.
- Keep one root `/` implementation; remove the competing starter `src/app/page.tsx` when adding the marketing page.
- Client islands own mobile navigation, local demo state and decorative lifecycle. Pass server-rendered content through `children`; never import server-only modules into client components.
- A feature-scoped `LandingMotion` context may share only pause/reduced-motion state. Do not mount application-wide query, form, auth, theme or global-store providers for this page.
- A route's `loading.tsx` matches its layout without artificial delays. Essential copy remains visible in default server HTML, including when enhancement fails.
- For a future authenticated feature, persistent shared chrome belongs in its layout, outside remounting templates. Pages/loading fallbacks render only their own body. Do not impose another product's navigation or chrome exceptions.
- `server/` already contains database/auth infrastructure. Add service-backed RSC wrappers only when a data-driven feature needs them; wrappers and Route Handlers call services instead of accessing Prisma.

## 3. Naming and imports

| What                       | Convention                                         | Example                                |
| -------------------------- | -------------------------------------------------- | -------------------------------------- |
| Feature component          | Kebab-case file, PascalCase export                 | `landing-demo.tsx` → `LandingDemo`     |
| Hand-built primitive       | PascalCase file matching export                    | `Surface.tsx` → `Surface`, if needed   |
| shadcn primitive           | Preserve generated filename/API                    | `button.tsx`, `tabs.tsx`               |
| Future query/mutation hook | Kebab-case `use-` filename, camelCase export       | `use-deposits.ts` → `useDepositsQuery` |
| Backend validator          | `[resource].validator.ts`, inferred exported types | `deposit.validator.ts`                 |
| Wire type                  | Explicit DTO in `src/types/`                       | `DepositDto`                           |
| Local demo type            | Feature-local, distinct from financial DTOs        | `DemoStage`, `LandingDemoFixture`      |
| API route                  | Mirror canonical resource path                     | `api/v1/deposits/[id]/route.ts`        |

`@/*` maps to `src/*`. Use aliases across feature boundaries instead of deep relative imports. Import primitives from `@/primitives`.

**Browser exception to barrel imports:** `@/utils` imports `node:crypto`. Browser modules and generated primitives import `cn` directly from `@/utils/cn`. Import exact demo formatting directly from its browser-safe feature module. Do not re-export server helpers through browser barrels or move backend code to accommodate the landing. Type-only imports must stay type-only.

`cn(...inputs: ClassValue[]): string` combines `clsx` and `tailwind-merge`. Configure shadcn's `utils` alias as `@/utils/cn` and `ui` as `@/primitives`.

## 4. Iconography and assets

- The landing's selected UI icon package is `@phosphor-icons/react`, added in Task 1. Server and Client Components use its SSR entry: `import { ArrowRight, X } from "@phosphor-icons/react/dist/ssr"`.
- Import only the `Icon` type from the package root when needed; runtime icons use the SSR entry.
- Prefer regular weight, tokenized size classes and `aria-hidden` beside text. Icon-only controls need accessible names and 44px targets.
- Replace generated Lucide icons with Phosphor equivalents and remove unnecessary Lucide dependencies. Use unified `radix-ui` instead of adding scoped Radix packages directly.
- Provider/chain/asset marks are real local assets, not UI icons. Preserve approved geometry, colors, clearspace and explicit dimensions. Record provenance in `public/brands/sources.json`; do not hotlink or fabricate unavailable marks.
- Original growth contours and investing diagrams are artwork. Hide decorative artwork from assistive technology; it must not carry essential financial information.

## 5. Styling: one light theme

V3ST stays light when the system prefers dark mode. Do not add `.dark`, a theme attribute switch, `next-themes`, theme-toggle controls or hydration suppression for a nonexistent theme script.

`DESIGN_SYSTEM.md` defines the semantic palette, Geist typography, widths, spacing, radii, focus and layers. Tokens live in `@theme static` in `src/styles/globals.css`; do not add `tailwind.config.ts`. `static` ensures declared tokens are emitted, including those referenced by dynamic style code. Use semantic classes instead of repeating raw colors in components.

Retain Geist through `next/font`; no runtime font CDN. Use tabular financial numerals, intentional wrapping and visible focus. Body text meets 4.5:1 contrast and large text 3:1 on actual surfaces, including during artwork movement. Map generated shadcn classes to project tokens; do not redefine an existing text token as a surface token.

Server HTML is visible before enhancement. No-JS, reduced motion, unavailable WebGL, short viewports, enlarged text and zoom retain the explanation and actions. Do not globally hide reveal content or clip financial figures to fixed panel heights.

## 6. Primitives and feature composition

`primitives/` holds app-agnostic building blocks; `components/` holds feature compositions. Primitives never import backend services, query hooks or financial feature types.

Use the official shadcn CLI for primitives it provides and record the selected CLI version. Generate only what the feature needs; this landing needs Button, Badge, Card parts, Tabs parts, Sheet parts and Skeleton. Preserve generated filenames/APIs, restyle in place with project tokens and re-export through `src/primitives/index.ts`. Edit variants/classes instead of creating competing styled wrappers.

Use unified `radix-ui` for generated Slot, Tabs and Dialog behavior. Preserve keyboard navigation, labelled panels/dialog titles, Escape, focus trapping/restoration and scroll-lock cleanup. Anchor buttons use `asChild`; never nest an anchor inside a button. Native `details`/`summary` suits the FAQ because it works without JavaScript.

Hand-built PascalCase primitives address needs shadcn does not provide. Feature layouts, original diagrams and sections belong in `components/landing/`. Avoid unnecessary generic abstractions for small static copy blocks.

The demo parent owns chapter, stock, explicit strategy-example entry, scenario and payout/reinvestment selections. Children receive props/callbacks. Every example is independent and illustrative. State resets on reload, writes no storage/cookies and creates no account, quote, authorization or operation. Decorative diagram state is separate and cannot advance the demo or imply consent.

## 7. Forms: future feature pattern

React Hook Form and its Zod resolver are not required or installed merely because this guide describes them. The landing has no identity, bank, signup or waitlist form, and no form provider.

If a future feature needs them, derive `FormValues = z.input<typeof schema>` from a browser-safe schema. Server validation remains authoritative; do not import a server-only validator dependency graph into the browser. Use `defaultValues` for creation, deliberate resynchronization for editing, `register` for native inputs and `Controller` for non-native controls. Associate field/error descriptions accessibly. Disable native validation only when complete rendered schema errors replace it. Auth inputs use proper autocomplete tokens.

## 8. Data fetching and metadata

### Landing: static composition and local fixtures

The root route makes zero calls to `/api/*`, `/v1/*`, `/webhooks/*`, RPCs, wallets or provider SDKs. It uses no server actions, sessions, cookies or persistent browser storage. Fonts/assets/scripts are served locally. Fixtures are explicit local integer strings, not fabricated API responses. Use bigint arithmetic without converting money to `Number`.

Use Next's static metadata API and original static social artwork. Title: **V3ST — Start with naira. See investing clearly.** Describe an illustrative beta preview; retain `robots: { index: false, follow: false }`. Absolute URLs require explicit app URL configuration; do not invent a production domain.

### Future authenticated reads and mutations

Add typed service-backed read wrappers in `src/server/` only when needed. Use request-scoped React `cache()` for repeated reads and private/no-store financial reads. Preserve redirect/not-found control flow. Failure renders unavailable/error, never fabricated empty balances or ₦0. Distinguish failure from genuine empty results and inaccessible/missing resources.

Customer screens read through the customer service layer (`src/backend/services/app/*`) via server wrappers and mutate only through `/api/v1/app/*` routes (see [docs/api/customer-app.md](docs/api/customer-app.md)); their response types come from `src/types/app.ts`. Customer screens never call `/api/v1/*` operator endpoints, never see internal event names (the app stream sends `changed` frames with screen areas), and poll or subscribe to `GET /api/v1/app/events` for live updates.

TanStack Query and Axios are optional future additions for client caching/mutations. If selected, use an SSR-safe per-user QueryClient, typed methods, query-key factories, timestamped initial data and relevant invalidation. Clear user caches/streams on logout or account changes. Axios uses canonical `baseURL: "/api/v1"` with cookie credentials. Do not add this stack to the marketing page.

Private metadata must not publish balances, personal details or tokens in OG image URLs. Historical `liveMetadata`, `pageMetadata`, invite previews and bot-card examples are not installed V3ST utilities or required features. The landing uses a static public card without account access.

## 9. Client and URL state

Prefer local state. `LandingMotion` may share page-scoped pause/reduced-motion state without persistence. Reset demo selections independently from pause state.

Zustand is aspirational for a future need across component trees; use a per-mount/per-request factory, never a shared server store. nuqs is aspirational for shareable filters/pagination. Neither belongs in this demo, whose selections do not survive reload or become URL state. Native hash anchors support deep-link entry and Back/Forward behavior.

## 10. Animation: `motion/react`

Import `motion`, `AnimatePresence`, hooks and motion values from `motion/react`; do not install or import `framer-motion`. Use CSS/native DOM APIs where appropriate. No GSAP, Lenis, wheel interception or scroll-jacking is required.

The landing specification and `DESIGN_SYSTEM.md` define exact hero, navigation, ticker, diagram, cursor and fluid timing. Continuous work uses motion values, refs or CSS properties instead of React state every frame. Prefer transforms/opacity to layout animation. Demo changes use a 200ms opacity transition with normal-flow height; reduced motion updates immediately.

Enhance visible server content after initialization. Skip blank entrance replays after delayed hydration, deep-link entry or restored scroll. Keep focused/faded controls usable and avoid invisible hit targets. Measure hero fit at short heights/zoom and fall back to ordinary flow instead of cropping.

Observe reduced-motion changes live. The visible pause control stops decorative loops without clearing demo state or catching up missed frames on resume. Stop hidden/offscreen work; release listeners, timers and GPU resources on cleanup. Preserve SVG fallback on renderer failure. Ticker duplicates are decorative; expose one readable list. Diagram autoplay never changes demo selections.

## 11. Validation, services and API contracts

These are existing V3ST backend contracts, independent of the local demo:

- Canonical handlers live under `/api/v1/**`; `/v1/:path*` and `/webhooks/:provider` rewrite to those same handlers.
- Every exported API handler uses `withMiddleware(handler, middlewares, options)`. Handlers call singleton domain services; only services access Prisma. Database, provider and signing logic stay out of browser bundles.
- Strict Zod schemas provide request validation/inferred types. `withMiddleware<B, P, Q>` takes **body, path, query**, with explicit `null` for unused channels. After matching validators run, read `request.validatedData!`, `request.params!`, `request.query!` without route-local casts. `context.params` receives the validated path output. `parsedBody`, `parsedParams`, `parsedQuery` remain unvalidated pipeline inputs.
- Examples: body-only `withMiddleware<DepositBodySchema, null, null>`; ID-only `withMiddleware<null, PathParameters, null>`; pagination `withMiddleware<null, null, PaginationQuerySchema>`. Preserve `json`, `raw`, `none` body modes. Webhooks verify original raw bytes.
- Auth precedes validators on authenticated routes. Preserve Origin protection for cookie writes and applicable `Idempotency-Key` requirements. A retry is not a new economic operation.
- `src/types/index.ts` defines `ApiResponse<T>`, `PaginatedApiResponse<T>`, `ApiErrorResponse` and stable `ErrorCode`s. Success: `{ status, message, data }`; error: `{ status, message, code, data: null }`; pagination adds `{ total, page, size, totalPages }`.
- Explicit `src/types/dto.ts` serializers produce snake_case wire fields. Money/raw token quantities cross JSON as integer strings, never BigInt/floats. Never expose raw Prisma rows or provider payloads.
- `src/types/contract.ts` contains existing operator evidence/status DTOs. Preserve them; add actual compile-time assertions when needed without claiming the file already proves every service/DTO equality.
- Quote expiry, changed terms, unavailable reads, holds and unresolved operations remain visible states. Current API docs/services govern their meaning; education examples do not.
- Customer error responses are already display copy: render `message` from `/api/v1/app/*` errors directly and use `code` only for analytics/branching. Never surface raw internal error codes or stack details to customer screens.

### Session transport

`SESSION_COOKIE_NAME` in `src/server/auth/constants.ts` is **`sara-session`**, the existing V3ST contract. Do not substitute the historical `parcours_session` name.

Sessions are opaque random 32-byte tokens stored/validated in PostgreSQL, not session JWTs or NextAuth. Cookie attributes: `HttpOnly`, `SameSite=Lax`, path `/`, `Secure` with `NODE_ENV=production`. Same-origin browser requests send it automatically; future Axios clients use credentials. Never store it in localStorage or try to decode it client-side.

`authMiddleware` validates session/expiry and attaches `User & { session: Session }`; no business entity is implied. Cookie transport takes precedence over bearer; an invalid cookie must not switch principals through bearer fallback. Expired sessions are removed lazily. Beta exchange uses `POST /api/v1/auth/session`; `POST /api/v1/auth/logout` revokes the row, clears the cookie and returns JSON 200. The landing calls neither endpoint and checks no session.

## 12. Environment and beta boundaries

Use validated server configuration from `src/env.js` through `@/env`. Never import server environment, credentials, policy/services, Prisma, Node crypto or signing SDKs into browser modules. Only explicit `NEXT_PUBLIC_*` values may be exposed when needed; the local demo needs no provider configuration.

Keep `APP_STAGE=beta`, explicit simulated/verified-sandbox modes and no live fallback across optimized builds, workers and scripts. Fictional stocks, fees/rates and settlement units are illustrative fixtures. They establish no provider access, legal ownership, guaranteed income, issuer-backed assets or real financial consent.

## 13. Feature checklist and verification timing

For the landing:

- [ ] Static anonymous route, visible server HTML, no session/database/provider access.
- [ ] Local state/fixtures, exact money, reset and independent decorative state.
- [ ] Generated/restyled primitives, Phosphor SSR icons, direct `@/utils/cn` imports.
- [ ] One light theme, local assets/fonts, beta disclosures and static noindex metadata.
- [ ] Working anchors/FAQ and no-JS, reduced-motion, failed-WebGL, mobile/zoom fallbacks.
- [ ] Keyboard/focus, pause/resume, overflow and network-containment assertions authored.

For later data-driven features, add only necessary validators, wrapped handlers, services, DTOs, service-backed reads, reachable pages/navigation and loading/error states. Introduce query/form/store packages only for an actual requirement. Preserve ownership, private metadata, unavailable-data and session contracts.

Follow `CLAUDE.md`: write tests with tasks, review diffs and commit focused task work, but defer test/lint/typecheck/build gates until the full implementation is ready. Run the active plan's final sequence and record actual results; unexecuted assertions have not passed.
