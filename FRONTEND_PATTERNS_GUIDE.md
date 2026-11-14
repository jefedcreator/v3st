# Frontend Patterns Guide

This document captures the frontend conventions established in this codebase (Next.js App Router). It's meant to be a portable reference — apply these patterns to any new Next.js project to keep architecture, naming, and data-flow consistent across the org.

---

## 1. Stack

```
next                     ^15   App Router, RSC by default
react                    ^19
typescript               ^5.8  strict, noUncheckedIndexedAccess, checkJs
tailwindcss              v4    tokens in `@theme static` in src/styles/globals.css;
                               there is no tailwind.config.ts
@tailwindcss/postcss     ^4    the v4 build step (+ tw-animate-css for shadcn's
                               animation utilities)
shadcn/ui                      CLI only, never a runtime dependency. v4 mode,
                               CSS variables, generates into src/primitives.
                               The source of every primitive it has (§6); a
                               component may bring its own deps (cmdk, react-day-picker)
radix-ui                 ^1.6  the unified package: `import { Slot } from "radix-ui"`.
                               The scoped `@radix-ui/react-*` packages exist only as
                               its transitive deps — never add one directly.
motion                   ^14   animation & microinteractions (not framer-motion)
@tanstack/react-query    ^5    client caching, background refetching, mutations
axios                    ^1    typed HTTP client with centralized interceptors
react-hook-form          ^7    forms with zodResolver (see §7)
class-variance-authority ^0.7  (cva) + tailwind-merge ^3 + clsx ^2 — variant-driven styling
@phosphor-icons/react    ^2    the icon set (see §4)
@t3-oss/env-nextjs       ^0.12 typed, validated env vars
prisma / @prisma/client  ^6    database
zod                      ^3    validation
react-hook-form          ^7    uncontrolled forms (see §7)
@hookform/resolvers      ^5    bridges a Zod schema into `useForm`
vitest                   ^4    tests (`yarn test` → `vitest run`)
```

**Aspirational, not yet installed:** `zustand`, `nuqs`, `sonner`. Fluid is light-only: no `next-themes`.

---

## 2. Project structure

```
src/
├── app/                      ← App Router routes ONLY (pages, layouts, route handlers)
│   ├── (auth)/               ← /login — sign-in
│   ├── (dashboard)/          ← the signed-in dashboard: /dashboard, /payments, /links, /destinations, /settings
│   ├── (pay)/                ← public payment pages: /<code> and /<code>/<paymentId>
│   ├── (app)/                ← route group: the authenticated app surfaces
│   │   ├── layout.tsx        ← the wash and the chrome (see below)
│   │   ├── day/page.tsx      ← today's session — the app's home
│   │   ├── progress/page.tsx
│   │   ├── mock/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx ← a running exam section, drawn without chrome
│   │   ├── leaderboards/     ← page.tsx, [slug]/page.tsx
│   │   ├── duels/page.tsx
│   │   └── profile/page.tsx
│   ├── profile/              ← /profile (owner, authed) & /profile/[handle] (public, reached via /@handle rewrite outside auth)
│   ├── (marketing)/          ← route group: the public landing page
│   └── api/                  ← Route Handlers, mirrors the resource tree
│       ├── attempts/route.ts
│       ├── day/
│       │   ├── route.ts
│       │   ├── blocks/route.ts
│       │   └── complete/route.ts
│       ├── mock/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── complete/route.ts
│       │       └── submit/route.ts
│       ├── progress/route.ts
│       └── reviews/route.ts
│
├── server/                   ← RSC wrappers over the services (getDashboardSummary, getPayPage, …)
├── backend/                  ← server-only application logic (never imported client-side)
│   ├── validators/           ← Zod schemas, one file per resource: `[resource].validator.ts`
│   ├── services/             ← integrations & business logic, one folder per service
│   ├── middleware/           ← composable route-handler middleware
│   └── cron/                 ← scheduled jobs
│
├── server/                   ← server-side data-fetch layer consumed by Server Components
│   ├── index.ts              ← re-exports typed fetch wrappers (getDay, getProgress, getMockHistory, getMockFormats, …)
│   ├── day.ts
│   ├── mock.ts               ← also getMockFormats: the assembler's blueprint + a bank count
│   └── progress.ts
│
├── components/                ← "smart" feature components (kebab-case files)
│   ├── app-nav.ts             ← APP_NAV (the pill nav: Today, Progress, Mocks), ACCOUNT_NAV (the account menu), hasAppChrome
│   ├── app-topbar.tsx         ← 'use client' — logo, three-item ink pill nav, account menu: one row at every width
│   ├── account-menu.tsx       ← 'use client' — email, Profile/Leaderboards/Duels, theme switch, sign-out
│   ├── app-chrome.tsx         ← 'use client' — topbar + the 62rem column + <main>; mounted BY THE LAYOUT, never a page
│   ├── page-header.tsx        ← every (app) page's title and its one plain line
│   ├── markdown.tsx           ← the curriculum's markdown subset: day lessons and grammar pages
│   ├── app-error.tsx          ← the fallback when a surface's data will not load
│   ├── app-skeleton.tsx       ← what every (app) loading.tsx is built from
│   ├── theme-toggle.tsx       ← 'use client' — next-themes toggle with Framer Motion icon swap (landing footer)
│   ├── day/                   ← day-page-client.tsx, day-spine.tsx (the row of four steps), lesson-recap.tsx, use-reveal-on-change.ts, blocks/
│   ├── mock/                  ← mock-hub-client.tsx, mock-session-client.tsx, mock-score-report.tsx, mock-attempt-row.tsx
│   ├── progress/              ← progress-page-client.tsx, programme-board.tsx
│   ├── exercises/             ← the four renderers plus parts.tsx (the shared frame, options, feedback)
│   └── landing/               ← marketing sections of `/`: hero, strip, track, method, exam, etc.
│
├── primitives/                ← "dumb" reusable UI building blocks (design system layer)
│   ├── index.ts               ← barrel export for the folder — hand-built and generated alike
│   ├── Meta.tsx, Shell.tsx, Stat.tsx, Surface.tsx, FadeIn.tsx   ← hand-built, PascalCase
│   ├── Card.tsx, KeyValue.tsx, Notice.tsx, Chip.tsx,            ← the pale-wash-glass set
│   │   Body.tsx, EmptyState.tsx                                    (see DESIGN_SYSTEM §4)
│   └── button.tsx, accordion.tsx                                ← shadcn/ui-generated, kebab-case
│
├── hooks/                     ← TanStack Query hooks & mutations (`use-*.ts`)
│   ├── queries/               ← `use-day.ts`, `use-progress.ts`, `use-mock.ts`
│   └── mutations/             ← `use-day-mutations.ts`, `use-mock-mutations.ts`
│
├── provider/                  ← app-wide context providers (QueryProvider, ThemeProvider)
│   ├── index.tsx              ← unified root Provider wrapper
│   ├── query-provider.tsx     ← SSR-safe QueryClient singleton provider
│   └── theme-provider.tsx     ← next-themes ThemeProvider wrapper
│
├── types/                     ← shared TS types/interfaces (DTOs, contract.ts)
├── utils/                     ← pure helpers, `cn`, `axios.ts`, `api.ts`, theme constants
└── styles/                    ← globals.css, CSS custom properties
```

### Rules of thumb

- **`app/`** contains _only_ routing concerns: a Server Component `page.tsx` that fetches data and renders one client component. Business logic never lives in `page.tsx`.
- **`server/`** vs **`backend/`**: `server/` is the _consumer-facing_ fetch layer used by Server Components (thin wrappers around `fetch` with fallbacks). `backend/` is where the actual API logic, validators, and services live, imported only from Route Handlers.
- Each route folder gets its own `loading.tsx` — Next's built-in Suspense boundary, styled as a skeleton matching the eventual layout. The `(app)` ones are built from `app-skeleton.tsx` and draw **the page body alone**: the chrome is mounted by the layout and stays standing while the page suspends, so a skeleton that redrew it would replace a live pill nav with a dead copy of itself for the length of the fetch.
- **`(app)/layout.tsx` mounts the wash _and the chrome_.** The one-row topbar — pill nav and account menu — comes from `AppChrome`, mounted once by the layout and **never composed by a page**. This is not a style choice: only a layout survives a route change, so chrome rendered from a page is unmounted and rebuilt on every navigation — replaying its entrance animation, dropping whatever `AccountMenu` held open, and mounting the nav three times per move once `loading.tsx` draws its own copy. Mounted from the layout it persists, and only its own UI state — the current marker, read from `usePathname` — changes.
- **Today's session is home.** `DEFAULT_AFTER_AUTH` is `/day`, the logo links there, and `/dashboard` (retired 2026-10-19) is redirected to it in `next.config.js`. Config redirects run before middleware, so the middleware matcher carries no `/dashboard` entry.
- **The one route without chrome opts out from inside `AppChrome`, on the client.** `/mock/[id]` renders a running exam section, and an app navigation across the top of one is an exit the real test does not offer. `hasAppChrome(pathname)` in `app-nav.ts` is that rule. It is read from `usePathname` rather than from a middleware header because a shared layout is _not_ re-rendered when the reader moves between its own children — a server-side branch there would only ever update on a full page load.
- **The chrome carries no data.** The layout's only read is the account check behind the email prompts, and it catches its own failure — `error.tsx` sits _below_ the layout and cannot catch what the layout itself throws, so an unreadable account costs the prompts and nothing else. The day number lives on `/day` and Progress, which already read it.
- **`(app)/template.tsx` wraps the page body only.** Next renders `layout > template > page`, so the chrome above is outside the template's remount-per-navigation and does not re-animate with the content.
- A **feature** (e.g. "mock", "progress", "day") owns one `*-page-client.tsx` that composes queries (`useProgressQuery`), mutation hooks (`useSubmitAnswerMutation`), and user interaction. Presentational pieces stay dumb and receive props/callbacks only.
- **`primitives/`** is the design-system layer and holds two kinds of file side by side: hand-built PascalCase primitives (`Shell`, `Meta`, `Surface`, `Stat`, `FadeIn`) and shadcn/ui-generated kebab-case ones (`button`, `accordion`). `components.json` points the CLI at it (`"ui": "@/primitives"`), so `npx shadcn@latest add …` writes there directly — no relocation step. Both kinds are re-exported from `primitives/index.ts`; feature code imports from `@/primitives`.

---

## 3. Naming conventions

| What                                     | Convention                                                                                | Example                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Feature components (`src/components`)    | kebab-case file, PascalCase export                                                        | `mock-hub-client.tsx` → `export function MockHubClient` |
| Hand-built primitives (`src/primitives`) | PascalCase file **matching** the export                                                   | `Surface.tsx` → `export function Surface`               |
| shadcn/ui-generated primitives           | kebab-case, lowercase — the _filename_ is left as scaffolded, the styling is not (see §6) | `button.tsx`, `accordion.tsx`                           |
| Query / Mutation Hooks                   | kebab-case filename prefixed with `use-`, camelCase export                                | `use-progress.ts` → `useProgressQuery`                  |
| Zod validators                           | `[resource].validator.ts`, schema var `xValidatorSchema`, type `XValidatorSchema`         | `day.validator.ts` → `patchBlockValidatorSchema`        |
| Types                                    | PascalCase interfaces/types in `src/types/index.ts`, or colocated `*.types.ts`            | `GetDaySessionResponseData`, `ProgressResponseData`     |
| API route folders                        | mirror the REST resource path exactly                                                     | `api/mock/[id]/submit/route.ts`                         |
| Query keys                               | factory object with `all`, `lists()`, `detail(id)`                                        | `progressKeys.all`, `mockKeys.detail(id)`               |

**Barrel files**: `src/primitives/index.ts`, `src/utils/index.ts`, `src/provider/index.tsx` re-export the public surface of that folder — import from the barrel (`@/primitives`, `@/utils`, `@/provider`) in feature code.

**Path alias**: `@/*` → `src/*` (configured in `tsconfig.json`). Never use deep relative imports (`../../../`) across feature boundaries.

---

## 4. Iconography

- **The icon set is `@phosphor-icons/react`** — the only one installed. There is no `lucide-react` and no `react-icons` in this project.
- **shadcn/ui generates `lucide-react` imports.** When you add a component (§6), swap each icon for its Phosphor equivalent: `X`, `Check`, `CaretDown`, `CaretUp`, `CaretLeft`, `CaretRight`, `Circle` (`weight="fill"`), `MagnifyingGlass`, `DotsThree`, `CircleNotch`. Then remove `lucide-react` if the CLI installed it.
- **Runtime icons always come from the SSR entry**, in Server _and_ Client Components alike:
  `import { ArrowRight, Moon, Sun, Exam } from "@phosphor-icons/react/dist/ssr"`. Every runtime icon import in `src/` uses this path. Don't import runtime icons from the package root.
- **The package root is for the `Icon` type only**, because the ssr entry doesn't export it: `import type { Icon } from "@phosphor-icons/react"`.
- Weight is a prop (`weight="bold"` / `weight="fill"`).
- Icons are sized with Tailwind (`className="size-4"`), never hand-rolled SVG per component.

---

## 5. Styling — light only

Fluid is **light-only**: no `next-themes`, no `.dark` block.

### Tailwind v4

Tokens live in `@theme static` in `src/styles/globals.css` — there is no `tailwind.config.ts` and one must not be added. Reference tokens (`bg-bone`, `text-ink-2`, `border-rule`, `text-h1`, `rounded-surface`), never raw hex.

- `static` is load-bearing: without it Tailwind only emits the tokens it saw used, and dark mode overrides these variables at runtime.

### Dark Mode Architecture with `next-themes`

Dark mode is **attribute-driven** via `next-themes` using `data-theme="dark"` / `data-theme="light"`:

1. **Provider Setup (`src/provider/theme-provider.tsx` & `src/provider/index.tsx`):**

   ```tsx
   // src/provider/theme-provider.tsx
   "use client";
   import {
     ThemeProvider as NextThemesProvider,
     type ThemeProviderProps,
   } from "next-themes";

   export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
     return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
   }

   // src/provider/index.tsx
   export function Provider({ children }: { children: ReactNode }) {
     return (
       <QueryProvider>
         <ThemeProvider
           attribute="data-theme"
           defaultTheme="system"
           enableSystem
           disableTransitionOnChange
         >
           {children}
         </ThemeProvider>
       </QueryProvider>
     );
   }
   ```

2. **Root Layout (`src/app/layout.tsx`):**
   - Add `suppressHydrationWarning` to `<html lang="en">` so `next-themes` can set the attribute without React hydration warnings.
   - `next-themes` automatically injects its pre-paint script, eliminating flash of unstyled theme (FOUC).

3. **Theme Toggle Component (`src/components/theme-toggle.tsx`):**
   - Consumes `useTheme()` from `next-themes` (`resolvedTheme`, `setTheme`).
   - Uses `mounted` state guard to avoid SSR/hydration markup mismatch.
   - Animates sun/moon icon transition smoothly using `framer-motion`'s `AnimatePresence` and `motion.div`:

   ```tsx
   "use client";

   import { useEffect, useState } from "react";
   import { AnimatePresence, motion } from "framer-motion";
   import { useTheme } from "next-themes";
   import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";
   import { cn } from "@/utils";

   export function ThemeToggle({ className }: { className?: string }) {
     const { resolvedTheme, setTheme } = useTheme();
     const [mounted, setMounted] = useState(false);

     useEffect(() => {
       setMounted(true);
     }, []);

     const toggleTheme = () => {
       setTheme(resolvedTheme === "dark" ? "light" : "dark");
     };

     if (!mounted) {
       return (
         <div
           className={cn(
             "border-rule grid size-7 place-items-center rounded-full border",
             className,
           )}
           aria-hidden="true"
         />
       );
     }

     const isDark = resolvedTheme === "dark";

     return (
       <button
         type="button"
         onClick={toggleTheme}
         aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
         className={cn(
           "group border-rule text-ink-3 hover:border-ink-3 hover:text-ink relative grid size-7 place-items-center overflow-hidden rounded-full border transition-colors",
           className,
         )}
       >
         <AnimatePresence mode="wait" initial={false}>
           <motion.div
             key={isDark ? "dark" : "light"}
             initial={{ y: 7, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             exit={{ y: -7, opacity: 0 }}
             transition={{ duration: 0.16, ease: "easeInOut" }}
             className="flex items-center justify-center"
           >
             {isDark ? (
               <Moon className="size-4" weight="bold" />
             ) : (
               <Sun className="size-4" weight="bold" />
             )}
           </motion.div>
         </AnimatePresence>
       </button>
     );
   }
   ```

4. **CSS Palette Specificity:**
   In `src/styles/globals.css`, the palette flips in two places, with load-bearing order:
   - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` first.
   - `:root[data-theme="dark"]` second.
   - `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` binds Tailwind's `dark:` modifier to the attribute.

---

## 6. Component architecture: primitives vs. components

Two distinct layers, don't blur them:

1. **`primitives/`** — dumb, app-agnostic UI atoms. Either:
   - Hand-built (`Shell`, `Meta`, `Surface`, `Stat`, `FadeIn`), or
   - shadcn/ui-generated (`button.tsx`, `accordion.tsx`), kept at their scaffolded filename and API but restyled in place: edit the existing `cva` call rather than wrapping it (see "shadcn/ui for every primitive it has" below).
   - Never import `@tanstack/react-query` or feature types into `primitives/`.

2. **`components/`** — feature-aware, composed from primitives. The `*-page-client.tsx` pattern:
   - **Parent owns state**: query hooks (`useProgressQuery`), mutation hooks (`useCompleteDayMutation`), and local navigation live in the page-client component.
   - **Children are pure UI**: cards and sections receive data and callbacks as props.

### shadcn/ui for every primitive it has

Primitives come from shadcn/ui, with Radix underneath, wherever shadcn has one. Never hand-roll one of these:
- buttons, cards, badges, inputs, textareas, labels and fields;
- tables, skeletons, avatars, separators, pagination, empty states, kbd, input groups, spinners;
- dialogs (modals), sheets, popovers, dropdown menus, selects, tabs, switches, checkboxes, radio groups, toggle groups and tooltips;
- the command palette (⌘K) and the calendar.

The rules:
- **Add with the CLI:** `npx shadcn@latest add <name>`. `components.json` points the CLI at `src/primitives` (`"ui": "@/primitives"`) and at the project's `cn` helper (the `"utils"` alias), so the file lands in place as `src/primitives/<name>.tsx`. Re-export it from `primitives/index.ts`.
- **Restyle in place, never wrap.** Edit the generated `cva` call and class strings to the project's tokens: colours, radii, shadows, focus ring. A wrapper that restyles a primitive leaves two sources of truth for its look. Delete variants the design forbids, such as a red `destructive`, rather than leaving them unused.
- **Radix only through shadcn,** via the unified `radix-ui` package (see §1). If a generated file imports a scoped `@radix-ui/react-*` package, change the import to `radix-ui` and drop the scoped package.
- **Icons:** the CLI writes `lucide-react` imports. Swap each one for its Phosphor equivalent (§4) when you add the component, and never keep `lucide-react` installed.
- **Token names can collide.** shadcn's `muted` is a surface colour and `muted-foreground` its text, while a project may already use `muted` for text. Never redefine an existing token for shadcn's sake; map the generated classes to the project's own names instead.
- **Hand-built primitives (PascalCase)** are only for what shadcn doesn't have: brand marks, a QR code, a key–value list, a flat panel. The same goes for compositions of shadcn parts, such as radio cards, a date picker or a copy button. A composition uses the shadcn parts as they are; it doesn't restyle them.
- **App-level layout is a feature component** in `components/`, not a primitive: sidebars, tab bars, page shells. Use a shadcn block, such as `sidebar`, only when its behaviour matches the design (a bottom tab bar is not shadcn's off-canvas drawer).

---

## 7. Forms — React Hook Form + Zod

- Schema lives in `src/backend/validators/[resource].validator.ts`, always `.strict()`, exports both the schema and `z.infer` type from the same file.
- `useForm<FormValues>` where `FormValues = z.input<typeof schema>`.
- Create forms use `defaultValues`; edit forms use `values` (re-syncs when server data changes).
- Plain inputs use `register('field')` spread directly on the primitive (`<Input {...register('slug')} />`).
- `noValidate` on every form — validation is Zod's job, and the browser's native
  bubbles compete with the rendered field errors.
- `autoComplete="off"` on ordinary forms, **but not on auth forms**. `/login`
  and `/signup` set real tokens (`username`, `current-password`,
  `new-password`): suppressing password managers on a sign-in form is
  user-hostile and pushes people toward passwords weak enough to memorise.
- Lay forms out with shadcn's field parts (`Field`, `FieldLabel`,
  `FieldDescription`, `FieldError`; see §6), inside a plain
  `<form noValidate onSubmit={handleSubmit(…)}>`. Bind non-native controls
  (`Select`, `RadioGroup`, `Switch`, `Checkbox`, a date picker) through
  React Hook Form's `Controller`.

---

## 8. Data fetching — TanStack Query & Axios

Two distinct data paths:

### a. Initial/server-rendered data → `src/server/`

Server Components fetch through typed wrapper functions (`getDay`, `getProgress`, `getMockHistory`) that:

- Attach credentials/cookies server-side.
- Always `try/catch` and return a **typed empty-state fallback** on failure so pages degrade gracefully instead of throwing 500s.
- Return `null` on failure (never a typed empty fallback that could render as a false ₦0) and let the page render `AppError`; detail reads return `undefined` for not-found so pages can call `notFound()`.
- Are passed into the client component as `initialData`, which seeds `useQuery({ queryKey, queryFn, initialData })` — avoiding client refetch waterfalls on first paint.
- Are wrapped in React `cache()`. Per-request memoisation, not a persistent cache: a route reads the same wrapper twice — once in `generateMetadata`, once in the component — and must not pay for it twice. Next dedupes `fetch` automatically and nothing else, and these wrappers go straight to Prisma.

---

## 8b. Page metadata — described from the page's own service

Every route whose page calls a `src/server/` wrapper describes itself from **that same wrapper**, through `liveMetadata` in `src/utils/metadata.ts`. A hardcoded blurb is accurate about the route and silent about the page; `liveMetadata` says which day, which module, how many boards, whether the mock was scored.

```ts
export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata(
    getDay,                                 // the page's own fetcher, cache()d
    (day) => ({                             // title + description ONLY
      title: `Day ${day.dayIndex} · ${day.lesson.moduleTitle}`,
      description: `...`,
    }),
    { title: "Today's session", cardTitle: "…", path: "/day", index: false },
  );
}
```

**The split is the rule, and the types enforce it.**

| Field | Where it goes | May carry live data |
| --- | --- | --- |
| `title`, `description` | the page's own HTML, served to the signed-in reader | **yes** |
| `cardTitle`, `eyebrow`, `tag` | the query string of an `/api/og` URL | **no** |

A card URL is fetched anonymously and cached indefinitely by every service a link is pasted into, so anything reaching it is published permanently to an audience the reader never chose. `liveMetadata` therefore takes a `describe` callback typed `LiveDescription` (`title` and `description`, nothing else) and **requires** a static `cardTitle` in the fallback — without which `pageMetadata` would silently fall back to `cardTitle ?? title` and carry the live title into the image URL.

Other rules:

- `liveMetadata` calls `unstable_rethrow` before its fallback, so `redirect()` from `requireCurrentUserId` and `notFound()` still work from inside `generateMetadata`.
- A failed read costs the page its live description and nothing else — the component's own `try/catch` still renders `AppError`.
- Refusals stay indistinguishable. `getBoard` returns null for both "no such board" and "not your board" (spec §6.1); the describer gives both the same generic text rather than rebuilding the enumeration oracle.
- `path` names the actual route, slug included, so the canonical and `og:url` point at the page rather than at its index.
- A page that calls no service keeps static `pageMetadata` — `/duels/[slug]`, which fetches client-side, is the only one.

### Shared links — a public page describes the resource

A link built to be sent to someone (`/cards/<slug>`, `/duels/<slug>`, `/@handle`, a study-group invite) is the one case where the card **does** carry live data, and it gets there a different way: a **public** page, outside the middleware's auth gate, whose `generateMetadata` reads the resource and points `og:image` at a **stateful** route under `/api/og/<resource>/` that reads the same row. The image is drawn from stored data rather than from query parameters, so a pasted link cannot be made to claim something about the resource that it does not lead to. The public design is shared through `src/app/api/og/house-card.tsx`.

- **What may be published is fixed by a DTO,** not by the page. `InvitePreviewDto` is the example: the group's name and counts, never a member — members agreed to be seen by the group, and the card is shown to whoever the link is pasted in front of.
- **A link that must stay at a gated address is rewritten, not redirected.** The invite link is `/leaderboards?invite=<token>`, which a signed-in reader follows to join. For a signed-out request the middleware rewrites it to the public `/invite/[token]` page instead of redirecting to `/login`. Signed out includes every link unfurler, so no user-agent list decides whether the card resolves.
- **A dead link stops describing the resource.** A rotated invite token gets a generic "no longer active" card, and its stateful image answers 404.
- The static cards the middleware serves to known bots for the gated `(app)` routes (`PROTECTED_BOT_METADATA`, rendered by `src/utils/bot-card.ts`) are for links that were never meant to be shared. They carry nothing live.

### b. Client-side mutations & live state → `@tanstack/react-query` + Axios

- **Centralized Axios Client (`src/utils/axios.ts`):** `baseURL: '/api'`, `withCredentials: true`, standard typed error handler.
- **Typed API methods (`src/utils/api.ts`):** `api.progress.get()`, `api.mock.start(format)`, `api.day.patchBlock(payload)`, etc.
- **Query Key Factories:**
  ```ts
  export const progressKeys = {
    all: ["progress"] as const,
    current: () => [...progressKeys.all, "current"] as const,
  };
  ```
- **Mutation Hooks (`src/hooks/mutations/`):**
  - Invalidate relevant query keys on `onSuccess` so server and client data stay synchronized:
  ```ts
  export function useCompleteDayMutation() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => api.day.complete(),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: dayKeys.all });
        void queryClient.invalidateQueries({ queryKey: progressKeys.all });
      },
    });
  }
  ```

---

## 9. Client/global state — Zustand (Target Pattern)

Used sparingly for cross-tree client state seeded from the server (e.g. interactive multi-step runner state):

1. **Store factory** in `src/store/index.ts` — `createXStore(initState)` returns `createStore<XState>(...)` (SSR-safe per-request).
2. **Context provider** in `src/provider/store-provider.tsx` — creates store once per mount via `useRef`, seeds with server data.
3. Components consume via selector hooks: `const activeItem = useMockRunnerStore((s) => s.activeItem)`.

---

## 10. URL state — nuqs (Target Pattern)

Filters, tabs, and pagination that should survive a refresh/share live in the URL:

- Parser objects colocated in `src/utils/index.ts`.
- Read and update query states with `useQueryStates(params, { shallow: false, throttleMs: 500 })`.

---

## 11. Animation — Framer Motion

- Page/list entrances: `FadeIn`, `FadeInStagger`.
- Interactive elements: `ThemeToggle` with `AnimatePresence` and `motion.div` for icon transitions.
- Layout-safe animations: animate transforms and opacity (`scaleX`, `translate`, `opacity`) instead of layout properties (`height`, `width`) to prevent browser layout reflows.

---

## 12. Validation, types & backend boundary

- **Zod is the single source of truth** for server validation and payload contracts.
- **Compile-time contract proof (`src/types/contract.ts`):** Asserts type equality between service response types and documented API DTOs.
- Route Handlers are composed with `withMiddleware(handler, [authMiddleware, bodyValidatorMiddleware(schema), ...])`.
- Middleware carries the validators' inferred output types through `withMiddleware<B, Q>`; handlers read `request.validatedData!` and `request.query!` without casting request data inside API routes.

### What the client must expect from the API

- **Session cookie authentication:** `parcours_session` is `HttpOnly` and attached automatically via `withCredentials: true`.
- **`PATCH /api/day/blocks` can refuse `complete: true` with a `409`** when the block's work is incomplete.
- **`requested` vs `filled`** on practice and test slots is surfaced as an honest underfill indicator.
- **`GET /api/progress` returns `provisional` and `measured` scores separately** for all four skills.

---

## 13. Environment variables

- `@t3-oss/env-nextjs` + Zod schema in `src/env.js` — server vars and client vars (`NEXT_PUBLIC_*`) validated at build time.
- Always import `{ env } from '@/env'` instead of reading `process.env`.

---

## 14. Quick checklist: scaffolding a new feature

- [ ] Zod schema(s) in `src/backend/validators/[resource].validator.ts`
- [ ] Route Handler(s) in `src/app/api/[resource]/route.ts` composed via `withMiddleware`
- [ ] Fetch wrapper in `src/server/[resource].ts` (`get[Resource]`) with try/catch + typed fallback
- [ ] Shared response DTOs in `src/types/index.ts` verified by `src/types/contract.ts`
- [ ] Query key factory in `src/hooks/queries/use-[resource].ts`
- [ ] Mutation hook in `src/hooks/mutations/use-[resource]-mutations.ts` with cache invalidation
- [ ] `page.tsx` (Server Component): fetches initial data, passes as `initialData` prop
- [ ] `loading.tsx` skeleton matching layout
- [ ] `[resource]-page-client.tsx`: connects `useQuery(initialData)` and mutations
- [ ] Any primitive the feature needs that isn't in `src/primitives/` yet: added with `npx shadcn@latest add <name>` and restyled in place (§6), not hand-rolled
- [ ] Interactive controls verified under both light and dark themes with `ThemeToggle`
