# Instructions for Cloud and Local Agents

## Interacti middleware standard (all AI agents)

This is a standing requirement for every Interacti product, regardless of the
agent, model, provider or editor. Apply it to every new or changed product API
handler. For middleware conventions, this section supersedes older product
guides and agent rules, including response-type generics, the two-generic
wrapper and alternative authenticated-route wrappers.

Use the middleware contract established in V3ST's
`src/backend/middleware/types.ts` and `src/backend/middleware/index.ts`:

- Wrap product API handlers with `withMiddleware<Body, Path, Query>(handler,
  middlewares)`. The order is **body, path, query**, never response data. Declare
  all three slots explicitly and use `null` for each unused validated channel.
- Derive each channel's type from its validator's **output** with
  `z.infer<typeof schema>` or `z.output<typeof schema>`. Put the matching
  validator in the middleware list. Path outputs can be transformed values,
  including numbers; do not constrain all validated paths to string records.
- Keep raw inputs separate: `parsedBody?: unknown`,
  `parsedParams?: Record<string, string>` and
  `parsedQuery?: Record<string, string>`. Only successful validators populate
  `validatedData?: Body`, `params?: Path` and `query?: Query`. Leave unused
  validated channels absent; never initialize them with raw input.
- Validators parse their corresponding raw field and assign the schema result
  directly to the validated field. Never validate from the output field or
  cast the output to make a route compile.
- Handlers read `request.validatedData`, `request.params` and `request.query`
  without type assertions. A non-null assertion is allowed only when the
  matching validator ran before the handler. Fix a mismatched generic, schema
  or middleware list instead of casting or widening to `any`/`unknown`.
- Keep reusable auth and transport middleware generic across **all three**
  input channels (`<B, P, Q>`) or accept a narrow `Pick` of the fields they
  actually use. Validators may use a `Pick` containing their raw and validated
  fields. Do not annotate shared middleware with concrete default request
  generics that reject routes with different validated inputs.
- The wrapper awaits native route context parameters into `parsedParams`.
  The handler's context receives the validated `params: Path | undefined`, not
  the raw path record. A route that needs typed path data must validate it.
- Keep request parsing, ordered middleware execution, short-circuit responses,
  last-resort error handling and redacted request logging in the wrapper.
  Preserve the product's auth, privacy, response envelopes and transport
  requirements. V3ST-specific financial providers, customer copy, body-size
  limits and form redirects are not universal product requirements.
- Framework-owned handlers, such as an authentication library's catch-all,
  retain their framework contract. Frontend-only products and background jobs
  do not acquire an HTTP backend just to use this pattern; any product API
  they add must follow this contract using the product's server framework.

```ts
type CreateBody = z.infer<typeof createSchema>;
type ItemPath = z.infer<typeof itemPathSchema>;
type ListQuery = z.infer<typeof listQuerySchema>;

export const POST = withMiddleware<CreateBody, null, null>(
  async (request) => createHandler(request.validatedData!),
  [authMiddleware, bodyValidatorMiddleware(createSchema)],
);

export const GET = withMiddleware<null, ItemPath, ListQuery>(
  async (request) => readHandler(request.params!, request.query!),
  [
    authMiddleware,
    pathParamValidatorMiddleware(itemPathSchema),
    queryValidatorMiddleware(listQuerySchema),
  ],
);
```

When changing this contract, update the implementation, affected routes,
validation/type checks and architectural documentation together. Carry this
section and the agent entrypoint files into every new Interacti product.

## Current assignment: the V3ST customer app pages

Implement [docs/superpowers/plans/2026-11-19-v3st-customer-app-pages.md](docs/superpowers/plans/2026-11-19-v3st-customer-app-pages.md), starting at Task 1 on a new feature branch, `feat/customer-app-pages`. It builds the design in [docs/superpowers/specs/2026-11-19-v3st-customer-app-pages-design.md](docs/superpowers/specs/2026-11-19-v3st-customer-app-pages-design.md), which the operator approved on 2026-11-19.

The app is every signed-in page a beta tester needs, built on the existing customer API in the landing's dark design system:

- sign-in at `/signin`, and setup;
- home, stocks and orders;
- cash, Earn and earnings;
- activity and settings.

It is phone-first. Every page does one job, and short jobs are modals. Home is the "Money line": one live line of the customer's money, split by a *Now* marker. The landing gains only a quiet *Sign in* link. Everything you need is in this repository:

| Read | For |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Code style, a commit per task, final-only verification, no Claude co-author lines |
| The spec | Operator decisions, the page and modal rule, routes, modals, states, pinned copy, the app's visual system |
| The plan | Twenty-one tasks with files, interfaces and the tests to write; Global Constraints and Review Focus |
| [`.impeccable/surfaces/src-app-app-layout-tsx.md`](.impeccable/surfaces/src-app-app-layout-tsx.md) | The app's direction contract (Impeccable surface brief) |
| [`docs/superpowers/specs/assets/2026-11-19-v3st-app-money-line-sketch.png`](docs/superpowers/specs/assets/2026-11-19-v3st-app-money-line-sketch.png) (source: the `.html` beside it) | The chosen Home sketch at 390×844, rendered with the real font, and the finish review's critique reference. The spec wins where they differ: the sketch shows a 24-hour percentage and a payout bank that the API doesn't return |
| [`docs/api/customer-app.md`](docs/api/customer-app.md), [`src/types/app.ts`](src/types/app.ts) | The customer API contract, the vocabulary rule and the error copy |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), [`FRONTEND_PATTERNS_GUIDE.md`](FRONTEND_PATTERNS_GUIDE.md), [`BACKEND_PATTERNS.md`](BACKEND_PATTERNS.md), [`PRODUCT.md`](PRODUCT.md), [`Design.md`](Design.md) | The design system, patterns and product architecture |

These rules trip agents up on this assignment:

- **Never create a file named `DESIGN.md`.** On case-insensitive filesystems (macOS) it collides with the product document `Design.md`. The design system is `DESIGN_SYSTEM.md`, with `.impeccable/design.json` beside it; tell Impeccable's documenter to merge there.
- **Run no test, lint, typecheck, build or Playwright command until Task 21** (`CLAUDE.md`). Write each task's tests as you go.
- **Copy and figures.**
  - No crypto vocabulary anywhere in the app's copy.
  - Render API error `message`s exactly as they come.
  - An unknown value is "—", never ₦0.
  - Figures come from the API or `policy.ts`, never typed by hand.
- **Modals.**
  - Never two modals at once: the PIN is the last step inside the job's modal.
  - Reuse a money job's `Idempotency-Key` for every retry, and renew it only with a new preview.
- **The app stays a beta.** Test money only, simulated Privy or Privy's sandbox app, no deployment, and no email, SMS or push.
  - Don't change financial behaviour, provider modes or `policy.ts`.
  - The only backend change is the beta route in Task 3.

## Skills

The plan was authored with Superpowers and applies Impeccable. Install neither for this work; the plan carries what it needs.

- **Superpowers.** When installed, use its `subagent-driven-development` or `executing-plans` workflow. Otherwise execute the plan's checklist natively, record that in the review record, and continue.
- **Impeccable (v4.9.1 or later), when installed:**
  - Before Task 2, run `impeccable context --target "src/app/(app)/layout.tsx"` once.
  - Read its `reference/craft-floor.md` before the first UI edit (Task 2).
  - The direction is locked by the operator's surface round (`seed:bc21f5b0c062fffb`): skip `concept-seed`, `shape` and comp rounds, and build code-led.
  - In Task 21, run its detector once, then the finish reviewer, then the documenter (merging into `DESIGN_SYSTEM.md`).
  - When Impeccable isn't installed, follow the plan's embedded rules and run a fresh-context finish review against the spec, the surface brief and the sketch.

## Required release scope

The user's beta-only instruction takes precedence over any implication of live operation in the design or in copied examples. The entire application is beta. Every external provider uses a verified sandbox or test environment, or a local simulation; Paycrest is simulated-only. No real funds, mainnet transactions, real identity submissions or live fallback are authorized. `NODE_ENV=production` describes an optimized build and never enables real providers. Missing partner access must not block a complete simulated beta.

The backend, ledger, workers, onchain beta, Base Sepolia rails and customer app API are implemented (see [docs/implementation-review.md](docs/implementation-review.md) and [docs/api/customer-app.md](docs/api/customer-app.md)). Do not change financial behaviour, provider modes or the beta policy under this assignment.

## Portable execution

Use Node.js from `.nvmrc` and Yarn 1.22.22. Start with `bash scripts/setup-cloud.sh`; see `README.md` for database and environment setup.

- Prisma output is generated per platform during installation, not committed.
- Keep `yarn.lock` as the only committed package-manager lockfile.
- Task 21 needs two isolated local PostgreSQL databases (the test one ending in `_test`), Forge and Anvil, and a Chromium for Playwright.
- Never use the developer's own database.

Do not depend on absolute paths from the original developer's machine, and do not silently install plugins with unrelated permissions.

Never commit `.env`, credentials, private keys, local databases, generated Prisma code, dependencies, build output, `.superpowers/`, `.impeccable/review/`, `.impeccable/mocks/`, `.impeccable/build/`, screenshots or reports. Commit focused task changes and keep the plan's checklist up to date. This handoff authorizes implementing the plan on a feature branch. It does not authorize deployment, live activation, real-money smoke tests or outbound messages.

## Earlier assignments

These plans are implemented and remain the record for what they built:

- the 2026-11-13 ramps and payouts plan;
- the 2026-11-14 onchain stocks and income plan;
- the 2026-11-16 real provider integration plan;
- the 2026-11-17 customer app backend plan;
- the 2026-11-18 landing redesign plan, the record for `/`, `/legal/*` and `/waitlist`.

The 2026-11-15 landing spec, plan and review describe the page the 2026-11-18 redesign replaced. Read them only as history.
