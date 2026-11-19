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

## Current assignment: the V3ST landing page redesign

Implement [docs/superpowers/plans/2026-11-18-v3st-landing-redesign.md](docs/superpowers/plans/2026-11-18-v3st-landing-redesign.md), starting at Task 1 on a new feature branch. It builds the design in [docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md](docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md), which the operator approved on 2026-11-18.

The page replaces the light ivory landing with a dark page that looks and moves like katana.network. It uses flag green `#00804D` and Bricolage Grotesque, is aimed at Nigerian first-time investors, and its main action is joining a stored beta waitlist. Everything you need is in this repository:

| Read | For |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Code style, a commit per task, final-only verification, no Claude co-author lines |
| The spec | Operator decisions, exact copy, colour and type tokens, Katana's measured motion contract, data contracts, logo sources and rights |
| The plan | Thirteen tasks with files, interfaces and the tests to write; Global Constraints and Review Focus |
| [`.impeccable/surfaces/src-app-marketing-page-tsx.md`](.impeccable/surfaces/src-app-marketing-page-tsx.md) | The page's direction contract (Impeccable surface brief) |
| [`docs/superpowers/specs/assets/2026-11-17-v3st-landing-approved-mock.png`](docs/superpowers/specs/assets/2026-11-17-v3st-landing-approved-mock.png) | The approved look and finish bar, and the finish review's critique reference. The spec wins where they differ |
| [`Design.md`](Design.md), [`BACKEND_PATTERNS.md`](BACKEND_PATTERNS.md), [`FRONTEND_PATTERNS_GUIDE.md`](FRONTEND_PATTERNS_GUIDE.md), [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), [`PRODUCT.md`](PRODUCT.md) | Product architecture and patterns. Where their landing-specific rules conflict with the spec (light theme, Geist, the browser-only demo, "zero API calls"), the spec wins; Tasks 11 and 13 rewrite them |
| [`docs/api/customer-app.md`](docs/api/customer-app.md) | The customer vocabulary rule and error copy that the waitlist reuses |

These rules trip agents up on this assignment:

- **Never create a file named `DESIGN.md`.** On case-insensitive filesystems (macOS) it collides with the product document `Design.md`.
  - The design system lives in `DESIGN_SYSTEM.md`, with `.impeccable/design.json` beside it.
  - Tell Impeccable's documenter to write there, and expect its tooling to call this file DESIGN.md.
  - A test written in Task 1 fails if `DESIGN.md` ever exists.
- **Run no test, lint, typecheck, build or Playwright command until Task 13** (`CLAUDE.md`). Write each task's tests as you go; Task 13 runs everything once and records the results.
- **Copy, figures and logos.** Copy is final; use it word for word. Figures come from code (`policy.ts`, the stock profiles, the public ticker), never typed by hand. Logos are official files with recorded provenance.
  - The operator accepted the trademark risk of using the official Apple, Microsoft and NVIDIA marks (spec decision 11).
- **Katana is a behaviour reference only.** Re-capture it in Task 13 to compare. Never copy its code, images, fonts or copy.
- **The page stays a beta.** Test money only, `noindex`, no analytics or cookies, and no email is ever sent. The waitlist only stores sign-ups.

## Skills

The plan was authored with Superpowers and applies Impeccable. Install neither for this work; the plan carries what it needs.

- **Superpowers.** When installed, use its `subagent-driven-development` or `executing-plans` workflow. Otherwise execute the plan's checklist natively, record that in the review record, and continue.
- **Impeccable (v4.9.1 or later), when installed:**
  - In Task 1, run `impeccable context --target "src/app/(marketing)/page.tsx"` once.
  - Read its `reference/craft-floor.md` before the first UI edit (Task 6).
  - The direction is pinned by the operator: skip `concept-seed`, and build code-led.
  - In Task 13, run its detector once, then the finish reviewer, then the documenter (writing `DESIGN_SYSTEM.md`).
  - When Impeccable isn't installed, follow the plan's embedded rules and run a fresh-context finish review against the spec and surface brief.

## Required release scope

The user's beta-only instruction takes precedence over any implication of live operation in the design or in copied examples. The entire application is beta. Every external provider uses a verified sandbox or test environment, or a local simulation; Paycrest is simulated-only. No real funds, mainnet transactions, real identity submissions or live fallback are authorized. `NODE_ENV=production` describes an optimized build and never enables real providers. Missing partner access must not block a complete simulated beta.

The backend, ledger, workers, onchain beta, Base Sepolia rails and customer app API are implemented (see [docs/implementation-review.md](docs/implementation-review.md) and [docs/api/customer-app.md](docs/api/customer-app.md)). Do not change financial behaviour, provider modes or the beta policy under this assignment.

## Portable execution

Use Node.js from `.nvmrc` and Yarn 1.22.22. Start with `bash scripts/setup-cloud.sh`; see `README.md` for database and environment setup.

- Prisma output is generated per platform during installation, not committed.
- Keep `yarn.lock` as the only committed package-manager lockfile.
- Task 13 needs two isolated local PostgreSQL databases (the test one ending in `_test`), Forge and Anvil, and a Chromium for Playwright.
- Never use the developer's own database.

Do not depend on absolute paths from the original developer's machine, and do not silently install plugins with unrelated permissions.

Never commit `.env`, credentials, private keys, local databases, generated Prisma code, dependencies, build output, `.superpowers/`, `.impeccable/review/`, `.impeccable/mocks/`, `.impeccable/build/`, screenshots or reports. Commit focused task changes and keep the plan's checklist up to date. This handoff authorizes implementing the plan on a feature branch. It does not authorize deployment, live activation, real-money smoke tests or outbound messages.

## Earlier assignments

These plans are implemented and remain the record for the backend:

- the 2026-11-13 ramps and payouts plan;
- the 2026-11-14 onchain stocks and income plan;
- the 2026-11-16 real provider integration plan;
- the 2026-11-17 customer app backend plan.

The 2026-11-15 landing spec, plan and review describe the page this assignment replaces. Read them only as history.
