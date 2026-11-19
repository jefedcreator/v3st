---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: ["src/app/(app)/home/page.tsx","src/app/(app)/stocks/page.tsx","src/app/(app)/stocks/[id]/page.tsx","src/app/(app)/orders/[id]/page.tsx","src/app/(app)/cash/page.tsx","src/app/(app)/earn/page.tsx","src/app/(app)/earn/[id]/page.tsx","src/app/(app)/earnings/page.tsx","src/app/(app)/activity/page.tsx","src/app/(app)/activity/[id]/page.tsx","src/app/(app)/settings/page.tsx","src/app/(setup)/setup/page.tsx","src/app/(auth)/signin/page.tsx"]
---

# Surface brief: V3ST customer app

Mode: Operate. Scope: every signed-in customer surface — the `(app)` route group and its layout (`/home`, `/stocks`, `/stocks/[id]`, `/orders/[id]`, `/cash`, `/earn`, `/earn/[id]`, `/earnings`, `/activity`, `/activity/[id]`, `/settings`), the `(setup)` flow (`/setup`) and the `(auth)` sign-in page (`/signin`), plus every modal they open.

- Audience: allowlisted beta testers, Nigerian first-time investors, on their phones over several weeks, with test money.
- Job: see where their money stands and what is moving, and do every money job the customer API supports, one job per page, short jobs in modals.
- Action: on Home, act on what needs them (finish a transfer, choose earnings, finish setup) or start a job (Add money, Invest).
- Proof on hand: the customer API's own DTOs and copy (`src/types/app.ts`, `docs/api/customer-app.md`); beta prices in naira; limits from `policy.ts`. Nothing invented.
- Constraints: the landing's dark world held to Operate restraint; no crypto vocabulary anywhere; unknown values shown as unknown, never ₦0; no fluid, cursor follower or pinned scroll in the app; WCAG 2.2 AA at 390px first.
- Memorable moment: an item finishing slides across the *Now* marker from *Coming up* into *Earlier*.
- Unresolved at handoff: none. Copy beyond the design's pinned strings and icon choice within Phosphor regular are builder calls.

Authoritative design: `docs/superpowers/specs/2026-11-19-v3st-customer-app-pages-design.md`. Plan: `docs/superpowers/plans/2026-11-19-v3st-customer-app-pages.md`.

Chosen sketch (critique reference): `docs/superpowers/specs/assets/2026-11-19-v3st-app-money-line-sketch.html`. It is Home's first viewport at 390×844; the build owes the responsive page, everything below the fold and every state the sketch skips. Where it differs from the design, the design wins.

## Direction contract

THESIS: The V3ST app on a phone, where every page does one job and Home is one live line of your money: what is coming sits above Now, what is done sits below. It refuses the category default of a balance card over a grid of shortcut tiles, promo banners and charts.

OWN-WORLD: The landing's world at Operate density: void ground, surface and raised-surface layers, hairline strokes, Bricolage Grotesque on a fixed rem scale (40px weight-300 figures, 24px titles, 16px body, 11px floor), tabular naira. Signal green fills pills, the spine and done nodes, never small text; mint marks gains, focus and waiting halos; coral marks losses and failures. Pill buttons, 16px-radius fields, hairline rows instead of cards, bottom sheets for short jobs.

STORY: A tester opens the app, reads their total and what is moving (an unpaid transfer, a buy waiting for prices, Friday's payout), acts on what needs them, starts the next job in a modal, and trusts that every value on screen is known or plainly marked unknown.

FIRST VIEWPORT: Home at 390×844. Top bar: V3ST wordmark and Beta chip left; bell with unread dot and initials avatar right. Total value at 40px weight 300, today's change in mint, cash available; Add money (signal pill) and Invest (outline pill); one beta line. Then the money line: a 2px signal spine in the left gutter, dashed above a "Now · 14:20" pill on a hairline and solid below it; Coming up rows with mint-haloed nodes above, Earlier rows with filled nodes below, See all activity. Bottom tabs: Home, Stocks, Cash, Earn.

FORM: Money line — a statement read as one live timeline; position 5 of 7 on the ordered list; seed:bc21f5b0c062fffb

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

On this repository DESIGN.md means `DESIGN_SYSTEM.md`, because `DESIGN.md` collides with the product document `Design.md` on case-insensitive filesystems. Build path: code-led.
